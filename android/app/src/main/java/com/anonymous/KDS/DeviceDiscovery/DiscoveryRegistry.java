package com.anonymous.KDS.DeviceDiscovery;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

public class DiscoveryRegistry {
    private static final String TAG = "DiscoveryRegistry";
    private static final String SERVICE_TYPE = "_vendapp._tcp.";
    private int servicePort = 4322; // 默认端口，可通过 setServicePort() 修改
    private static final long REGISTER_INTERVAL_MS = 30_000; // 30 seconds
    public String SERVICE_NAME;
    private String uniqueDeviceId; // 存储唯一设备ID
    private final NsdManager nsdManager;
    private NsdManager.RegistrationListener registrationListener;
    private final Context context; // 保存 context 引用

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
        this.context = context;
        nsdManager = (NsdManager) context.getSystemService(Context.NSD_SERVICE);
        String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);
        String shortId = androidId.length() >= 4 ? androidId.substring(androidId.length() - 4) : androidId;
        
        // 保存唯一设备ID用于后续确保唯一性
        this.uniqueDeviceId = shortId;
        
        // 从 SharedPreferences 加载端口设置
        loadPortFromSettings();
        
        // SERVICE_NAME = BuildConfig.DEVICE_TYPE +":" + shortId;
        SERVICE_NAME = "KDS:" + shortId;  // 默认服务名称，格式: KDS:设备ID（唯一）
    }

    /**
     * 从 AsyncStorage/SharedPreferences 加载端口设置
     */
    private void loadPortFromSettings() {
        try {
            android.content.SharedPreferences prefs = context.getSharedPreferences("RCTAsyncLocalStorage_V1", Context.MODE_PRIVATE);
            String portStr = prefs.getString("kds_port", "4322");
            if (portStr != null && !portStr.isEmpty()) {
                servicePort = Integer.parseInt(portStr);
                Log.d(TAG, "Loaded port from settings: " + servicePort);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading port from settings, using default 4322", e);
            servicePort = 4322;
        }
    }

    /**
     * 设置服务端口（手动设置）
     */
    public void setServicePort(int port) {
        this.servicePort = port;
        Log.d(TAG, "Service port manually set to: " + port);
    }

    /**
     * 获取当前服务端口
     */
    public int getServicePort() {
        return this.servicePort;
    }

    /**
     * 自定义服务名称
     * 直接使用用户提供的名称，无需添加后缀
     */
    public void setServiceName(String name) {
        if (name != null && !name.isEmpty()) {
            SERVICE_NAME = name;
        } else {
            // 如果名称为空，使用默认名称
            SERVICE_NAME = "KDS:" + uniqueDeviceId;
        }
        Log.d(TAG, "Service name set to: " + SERVICE_NAME);
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

        // 重新加载端口设置（确保使用最新的端口）
        loadPortFromSettings();

        NsdServiceInfo serviceInfo = new NsdServiceInfo();
        serviceInfo.setServiceName(SERVICE_NAME);         // This is the advertised name
        serviceInfo.setServiceType(SERVICE_TYPE);         // Custom protocol
        serviceInfo.setPort(servicePort);                 // 使用动态端口而不是硬编码的8080
        
        Log.d(TAG, "Broadcasting service on port: " + servicePort);

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
