package com.anonymous.KDS;

import android.util.Log;
import android.content.SharedPreferences;
import android.content.Context;
import android.provider.Settings;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.anonymous.KDS.DeviceDiscovery.DeviceMappingService;
import com.anonymous.KDS.DeviceDiscovery.DiscoveryRegistry;
import com.anonymous.KDS.models.NetworkDevice;
import java.util.LinkedList;

public class DeviceDiscoveryModule extends ReactContextBaseJavaModule {
    private static final String TAG = "DeviceDiscoveryModule";
    private static final String DEVICE_PREFS_NAME = "device_prefs";
    private static final String DEVICE_NAME_KEY = "device_name";
    private DeviceMappingService deviceMappingService;
    private DiscoveryRegistry discoveryRegistry;
    private final ReactApplicationContext reactContext;

    public DeviceDiscoveryModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        Log.d(TAG, "DeviceDiscoveryModule initialized");
    }

    @Override
    public String getName() {
        return "DeviceDiscoveryModule";
    }

    /**
     * Initialize device discovery service
     */
    @ReactMethod
    public void initializeDeviceDiscovery(Promise promise) {
        try {
            if (deviceMappingService == null) {
                deviceMappingService = new DeviceMappingService(reactContext);
                Log.d(TAG, "DeviceMappingService created");
            }

            // Create DiscoveryRegistry instance
            if (discoveryRegistry == null) {
                discoveryRegistry = new DiscoveryRegistry(reactContext);
                Log.d(TAG, "DiscoveryRegistry instance created");
            }

            promise.resolve("Device discovery initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing device discovery", e);
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    /**
     * Set current device service name
     */
    @ReactMethod
    public void setDeviceServiceName(String deviceName, Promise promise) {
        try {
            // Device name is currently hardcoded, cannot be modified at runtime
            // Only save to SharedPreferences for reference by other modules
            SharedPreferences prefs = reactContext.getSharedPreferences(DEVICE_PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(DEVICE_NAME_KEY, deviceName).apply();
            Log.d(TAG, "Device name saved: " + deviceName);
            
            promise.resolve("Device name saved (runtime modification not supported): " + deviceName);
        } catch (Exception e) {
            Log.e(TAG, "Error saving device name", e);
            promise.reject("SET_NAME_ERROR", e.getMessage());
        }
    }

    /**
     * Get list of all discovered devices
     */
    @ReactMethod
    public void getDiscoveredDevices(Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            LinkedList<NetworkDevice> devices = deviceMappingService.getAllDevices();
            WritableArray deviceArray = Arguments.createArray();

            for (NetworkDevice device : devices) {
                WritableMap deviceMap = Arguments.createMap();
                deviceMap.putString("id", device.getId());
                deviceMap.putString("name", device.getName());
                deviceMap.putString("ip", device.getIp());
                deviceMap.putInt("port", device.getPort());
                deviceMap.putBoolean("locked", device.isLocked());
                deviceArray.pushMap(deviceMap);
            }

            promise.resolve(deviceArray);
        } catch (Exception e) {
            Log.e(TAG, "Error getting discovered devices", e);
            promise.reject("GET_DEVICES_ERROR", e.getMessage());
        }
    }

    /**
     * Get information for a single device
     */
    @ReactMethod
    public void getDeviceById(String deviceId, Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            NetworkDevice device = deviceMappingService.getDevice(deviceId);
            if (device == null) {
                promise.resolve(null);
                return;
            }

            WritableMap deviceMap = Arguments.createMap();
            deviceMap.putString("id", device.getId());
            deviceMap.putString("name", device.getName());
            deviceMap.putString("ip", device.getIp());
            deviceMap.putInt("port", device.getPort());
            deviceMap.putBoolean("locked", device.isLocked());
            promise.resolve(deviceMap);
        } catch (Exception e) {
            Log.e(TAG, "Error getting device", e);
            promise.reject("GET_DEVICE_ERROR", e.getMessage());
        }
    }

    /**
     * Modify device information
     */
    @ReactMethod
    public void modifyDevice(String deviceId, String newName, String newIp, int newPort, Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            NetworkDevice device = deviceMappingService.getDevice(deviceId);
            if (device == null) {
                promise.reject("NOT_FOUND", "Device not found: " + deviceId);
                return;
            }

            // Check if device is locked
            if (device.isLocked()) {
                promise.reject("LOCKED", "Device is locked and cannot be modified");
                return;
            }

            // Update device information
            if (newName != null && !newName.isEmpty()) {
                device.setName(newName);
            }
            if (newIp != null && !newIp.isEmpty()) {
                device.setIp(newIp);
            }
            if (newPort > 0) {
                device.setPort(newPort);
            }

            deviceMappingService.saveDevices();
            promise.resolve("Device modified successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error modifying device", e);
            promise.reject("MODIFY_ERROR", e.getMessage());
        }
    }

    /**
     * Lock/Unlock device
     */
    @ReactMethod
    public void setDeviceLocked(String deviceId, boolean locked, Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            NetworkDevice device = deviceMappingService.getDevice(deviceId);
            if (device == null) {
                promise.reject("NOT_FOUND", "Device not found: " + deviceId);
                return;
            }

            device.setLocked(locked);
            deviceMappingService.saveDevices();
            promise.resolve("Device lock status updated");
        } catch (Exception e) {
            Log.e(TAG, "Error setting device locked status", e);
            promise.reject("LOCK_ERROR", e.getMessage());
        }
    }

    /**
     * Remove device
     */
    @ReactMethod
    public void removeDevice(String deviceId, Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            deviceMappingService.removeDevice(deviceId);
            promise.resolve("Device removed successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error removing device", e);
            promise.reject("REMOVE_ERROR", e.getMessage());
        }
    }

    /**
     * Clear all devices
     */
    @ReactMethod
    public void clearAllDevices(Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            deviceMappingService.clearDevices();
            promise.resolve("All devices cleared");
        } catch (Exception e) {
            Log.e(TAG, "Error clearing devices", e);
            promise.reject("CLEAR_ERROR", e.getMessage());
        }
    }

    /**
     * Get discovery log
     */
    @ReactMethod
    public void getDiscoveryLog(Promise promise) {
        try {
            if (deviceMappingService == null) {
                promise.reject("NOT_INITIALIZED", "DeviceMappingService not initialized");
                return;
            }

            WritableArray logArray = Arguments.createArray();
            for (String logEntry : deviceMappingService.getLog()) {
                logArray.pushString(logEntry);
            }
            promise.resolve(logArray);
        } catch (Exception e) {
            Log.e(TAG, "Error getting discovery log", e);
            promise.reject("LOG_ERROR", e.getMessage());
        }
    }

    /**
     * Stop discovery service
     */
    @ReactMethod
    public void stopDiscoveryService(Promise promise) {
        try {
            if (deviceMappingService != null) {
                deviceMappingService.StopDiscoveryService();
            }
            if (discoveryRegistry != null) {
                discoveryRegistry.stopService();
            }
            promise.resolve("Discovery service stopped");
        } catch (Exception e) {
            Log.e(TAG, "Error stopping discovery service", e);
            promise.reject("STOP_ERROR", e.getMessage());
        }
    }

    /**
     * Get device's Android ID (used for generating device name)
     */
    @ReactMethod
    public void getAndroidId(Promise promise) {
        try {
            String androidId = Settings.Secure.getString(
                reactContext.getContentResolver(),
                Settings.Secure.ANDROID_ID
            );
            promise.resolve(androidId);
        } catch (Exception e) {
            Log.e(TAG, "Error getting Android ID", e);
            promise.reject("GET_ANDROID_ID_ERROR", e.getMessage());
        }
    }
}
