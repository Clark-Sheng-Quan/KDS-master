
package com.vendingproject.DeviceDiscovery;


import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

// import com.vendingproject.BuildConfig;


public class DiscoveryRegistry {
    private static final String TAG = "DiscoveryRegistry";
    private static final String SERVICE_TYPE = "_vendapp._tcp.";
    public static final int SERVICE_PORT = 8080;
    private static final long REGISTER_INTERVAL_MS = 30_000; // 30 seconds
    public String SERVICE_NAME;
    private final NsdManager nsdManager;
    private NsdManager.RegistrationListener registrationListener;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable registerRunnable = new Runnable() {
        @Override
        public void run() {
            Log.d(TAG, "Periodic re-registering service...");
            // Unregister current service first before registering again
            stopService();
            BroadcastService();

            // Schedule next registration
//            handler.postDelayed(this, REGISTER_INTERVAL_MS);
        }
    };

    public DiscoveryRegistry(Context context) {
        nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        String shortId = androidId.length() >= 4 ? androidId.substring(androidId.length() - 4) : androidId;
        // SERVICE_NAME = BuildConfig.DEVICE_TYPE +":" + shortId;
        SERVICE_NAME = "KIOSK:"+shortId;
    }

    /**
     * Starts the periodic registration service
     */
    public void StartService() {
        Log.d(TAG, "Starting service advertising with periodic refresh...");
        handler.removeCallbacks(registerRunnable);
        registerRunnable.run(); // Start immediately
    }

    /**
     * Advertises your device on the network
     */
    private void BroadcastService() {
        Log.d(TAG, "Broadcasting service...");

        NsdServiceInfo serviceInfo = new NsdServiceInfo();
        serviceInfo.setServiceName(SERVICE_NAME);         // This is the advertised name
        serviceInfo.setServiceType(SERVICE_TYPE);         // Custom protocol
        serviceInfo.setPort(SERVICE_PORT);                // Dummy port or your real server port

        registrationListener = new NsdManager.RegistrationListener() {
            @Override
            public void onServiceRegistered(NsdServiceInfo registeredServiceInfo) {
                Log.d(TAG, "Service Registered: " + registeredServiceInfo.getServiceName());
            }

            @Override
            public void onRegistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                Log.e(TAG, "Registration failed: " + errorCode);
            }

            @Override
            public void onServiceUnregistered(NsdServiceInfo serviceInfo) {
                Log.d(TAG, "Service Unregistered");
            }

            @Override
            public void onUnregistrationFailed(NsdServiceInfo serviceInfo, int errorCode) {
                Log.e(TAG, "Unregistration failed: " + errorCode);
            }
        };

        nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener);
    }

    /**
     * Stops advertising the service and cancels periodic registration
     */
    public void stopService() {
        handler.removeCallbacks(registerRunnable);
        if (registrationListener != null) {
            try {
                nsdManager.unregisterService(registrationListener);
                Log.d(TAG, "Service stopped and unregistered.");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping service: " + e.getMessage());
            }
        }
        registrationListener = null;
    }
}
