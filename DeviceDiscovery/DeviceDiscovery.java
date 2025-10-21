package com.vendingproject.DeviceDiscovery;



import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.util.Log;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.function.Consumer;
import com.vendingproject.models.NetworkDevice;

public class DeviceDiscovery {
    private static final String SERVICE_TYPE = "_vendapp._tcp.";
    private final Map<String, NetworkDevice> resolvedServices = new HashMap<>();
    private final Set<String> resolvingServices = Collections.synchronizedSet(new HashSet<>());
    Queue<NsdServiceInfo> pendingResolves = new LinkedList<>();
    boolean isResolving = false;
    private String currentlyResolvingServiceName = null;

    private final NsdManager nsdManager;
    private NsdManager.DiscoveryListener discoveryListener;
    private WifiManager.MulticastLock multicastLock;
    private final Context context;

    public DeviceDiscovery(Context context) {
        this.context = context;
        this.nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
    }

    private static String TAG = "DEVICE_DISCOVERY";
    public void startDiscovery(
            Consumer<NetworkDevice> onServiceDiscovered,
            Consumer<NetworkDevice> onServiceLost,
            Consumer<String> onLog,
            Consumer<String> onError,
            Runnable onDiscoveryStarted,
            Runnable onDiscoveryStopped
    ) {
        stopDiscovery();
        // Acquire MulticastLock
        WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        multicastLock = wifiManager.createMulticastLock("vendapp_discovery_lock");
        multicastLock.setReferenceCounted(true);
        multicastLock.acquire();

        discoveryListener = new NsdManager.DiscoveryListener() {
            @Override
            public void onDiscoveryStarted(String regType) {
                String msg = "Discovery started for: " + regType;
                Log.d(TAG, msg);
                onLog.accept(msg);
                onDiscoveryStarted.run();
            }

            @Override
            public void onServiceFound(NsdServiceInfo serviceInfo) {
                String serviceName = serviceInfo.getServiceName();
                String msg = "Service found: " + serviceName + " / " + serviceInfo.getServiceType();
                Log.d(TAG, msg);
                onLog.accept(msg);

                if (resolvedServices.containsKey(serviceName)) {
                    onServiceDiscovered.accept(resolvedServices.get(serviceName));
                    Log.d(TAG, "Service already resolved");
                    onLog.accept("Service '" + serviceName + "' already resolved.");
                    return;
                }

                if (resolvingServices.contains(serviceName)) {
                    Log.d(TAG, "Skipping, already resolving service '" + serviceName + "'");
                    onLog.accept("Skipping resolve, already resolving: " + serviceName);
                    return;
                }
                resolvingServices.add(serviceName);
                pendingResolves.offer(serviceInfo); // Add to queue
                tryResolveNext(); // Try to resolve if nothing is currently being resolved
            }
            private void tryResolveNext() {
                if (isResolving) {
                    Log.d(TAG, "Queued, Already resolving another service. ");
                    onLog.accept("Queued, Already resolving another service.");
                    return;
                }

                if (pendingResolves.isEmpty()) {
                    Log.d(TAG, "Queue empty, All services resolved.");
                    onLog.accept("Queue empty, All services resolved.");
                    return;
                }

                NsdServiceInfo serviceInfo = pendingResolves.poll();
                if (serviceInfo == null) {
                    Log.d(TAG, "Error: Polled null serviceInfo.");
                    onLog.accept("Error: Polled null serviceInfo.");
                    return;
                }

                currentlyResolvingServiceName = serviceInfo.getServiceName();
                Log.d(TAG, "Resolving '" + currentlyResolvingServiceName +"'");
                onLog.accept("Resolving '" + currentlyResolvingServiceName +"'");
                isResolving = true;
                try {
                    resolveService(serviceInfo, service -> {
                        try {
                            resolvedServices.put(service.getId(), service);
                            onServiceDiscovered.accept(service);
                            Log.d(TAG, "Resolved '" + currentlyResolvingServiceName +"'");
                            onLog.accept("Resolved '" + currentlyResolvingServiceName +"'");
                        } catch (Exception ex) {
                            onLog.accept("Exception in success callback: " + ex.getMessage());
                            Log.d(TAG, "Exception in success callback: " + ex.getMessage());
                        } finally {
                            resolvingServices.remove(currentlyResolvingServiceName);
                            isResolving = false;
                            try {
                                tryResolveNext(); // Continue with next in queue
                            } catch (Exception ex) {
                                onLog.accept("Exception in tryResolveNext() after success: " + ex.getMessage());
                                Log.d(TAG ,"Exception in tryResolveNext() after success: " + ex.getMessage());
                            }
                        }
                    }, error -> {
                        try {
                            onLog.accept("Failed to resolve: " + currentlyResolvingServiceName + ", error: " + error);
                            try {
                                onError.accept(error);
                            } catch (Exception ex) {
                                onLog.accept("Exception in onError.accept: " + ex.getMessage());
                                Log.d(TAG,"Exception in onError.accept: " + ex.getMessage());
                            }
                        } finally {
                            resolvingServices.remove(currentlyResolvingServiceName);
                            isResolving = false;
                            try {
                                tryResolveNext(); // Continue with next in queue
                            } catch (Exception ex) {
                                onLog.accept("Exception in tryResolveNext() after error: " + ex.getMessage());
                                Log.d(TAG,"Exception in tryResolveNext() after error: " + ex.getMessage());


                            }
                        }
                    });
                } catch (Exception e) {
                    onLog.accept("Exception while calling resolveService: " + e.getMessage());
                    Log.d(TAG, "Exception while calling resolveService: " + e.getMessage());
                    isResolving = false;
                    try {
                        tryResolveNext(); // continue resolving others
                    } catch (Exception ex) {
                        onLog.accept("Exception in tryResolveNext() after outer catch: " + ex.getMessage());
                        Log.d(TAG, "Exception in tryResolveNext() after outer catch: " + ex.getMessage());
                    }
                }
            }

            @Override
            public void onServiceLost(NsdServiceInfo serviceInfo) {
                String serviceName = serviceInfo.getServiceName();
                String msg = "Service lost: " + serviceName + " / " + serviceInfo.getServiceType();
                Log.d(TAG, msg);
                onLog.accept(msg);

                // Remove from cache to keep it fresh
                resolvedServices.remove(serviceInfo.getServiceName());
                resolvingServices.remove(serviceInfo.getServiceName());
                // If the lost service was being resolved, reset and continue
                if (isResolving && serviceName.equals(currentlyResolvingServiceName)) {
                    isResolving = false;
                    currentlyResolvingServiceName = null;
                    onLog.accept("Service lost while resolving, continuing with next...");
                    Log.d(TAG, "Service lost while resolving, continuing with next...");
                    tryResolveNext();
                }

                // Construct DiscoveredService for lost callback
                NetworkDevice lostService = new NetworkDevice(
                        serviceInfo.getServiceName(),
                        serviceInfo.getHost() != null ? serviceInfo.getHost().getHostAddress() : "Unknown",
                        serviceInfo.getPort()
                );
                onServiceLost.accept(lostService);
            }

            @Override
            public void onDiscoveryStopped(String serviceType) {
                String msg = "Discovery stopped for: " + serviceType;
                Log.d(TAG, msg);
                onLog.accept(msg);
                onDiscoveryStopped.run();
            }

            @Override
            public void onStartDiscoveryFailed(String serviceType, int errorCode) {
                onError.accept("Discovery start failed with code " + errorCode);
                Log.d(TAG, "Discovery start failed with code" + errorCode);
                nsdManager.stopServiceDiscovery(this);
            }

            @Override
            public void onStopDiscoveryFailed(String serviceType, int errorCode) {
                onError.accept("Discovery stop failed with code " + errorCode);
                Log.d(TAG, "Discovery stop failed with code " + errorCode);
                nsdManager.stopServiceDiscovery(this);
            }
        };

        nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener);
    }

    private void resolveService(
            NsdServiceInfo serviceInfo,
            Consumer<NetworkDevice> onServiceDiscovered,
            Consumer<String> onError
    ) {
        NsdManager.ResolveListener resolveListener = new NsdManager.ResolveListener() {
            @Override
            public void onResolveFailed(NsdServiceInfo serviceInfo, int errorCode) {
                onError.accept("Resolve failed for " + serviceInfo.getServiceName() + " with code " + errorCode);
                Log.d(TAG, "Resolve failed for " + serviceInfo.getServiceName() + " with code " + errorCode);

            }

            @Override
            public void onServiceResolved(NsdServiceInfo resolvedInfo) {
                String host = resolvedInfo.getHost().getHostAddress();
                int port = resolvedInfo.getPort();
                onServiceDiscovered.accept(new NetworkDevice(
                        resolvedInfo.getServiceName(),
                        host,
                        port
                ));
            }
        };

        nsdManager.resolveService(serviceInfo, resolveListener);
    }

    public void stopDiscovery() {
        resolvedServices.clear();
        resolvingServices.clear();
        isResolving = false;

        if (discoveryListener != null ) {
            try {
                nsdManager.stopServiceDiscovery(discoveryListener);
                discoveryListener = null;
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Attempted to stop discovery, but listener was not registered: " + e.getMessage());
            }
        }
    }
}