package com.anonymous.KDS;

import android.util.Log;
import android.content.SharedPreferences;
import android.content.Context;
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
     * 初始化设备发现服务
     */
    @ReactMethod
    public void initializeDeviceDiscovery(Promise promise) {
        try {
            if (deviceMappingService == null) {
                deviceMappingService = new DeviceMappingService(reactContext);
                Log.d(TAG, "DeviceMappingService created");
            }

            if (discoveryRegistry == null) {
                discoveryRegistry = new DiscoveryRegistry(reactContext);
                discoveryRegistry.StartService(); // 开始广播当前设备
                Log.d(TAG, "DiscoveryRegistry created and started");
            }

            promise.resolve("Device discovery initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error initializing device discovery", e);
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    /**
     * 设置当前设备的服务名称
     */
    @ReactMethod
    public void setDeviceServiceName(String deviceName, Promise promise) {
        try {
            if (discoveryRegistry != null) {
                discoveryRegistry.setServiceName(deviceName);
                
                // 保存到 SharedPreferences
                SharedPreferences prefs = reactContext.getSharedPreferences(DEVICE_PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(DEVICE_NAME_KEY, deviceName).apply();
                Log.d(TAG, "Device name saved and updated: " + deviceName);
                
                promise.resolve("Device name set to: " + deviceName);
            } else {
                promise.reject("NOT_INITIALIZED", "DeviceDiscoveryModule not initialized");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error setting device name", e);
            promise.reject("SET_NAME_ERROR", e.getMessage());
        }
    }

    /**
     * 获取所有已发现的设备列表
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
     * 获取单个设备信息
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
     * 修改设备信息
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

            // 检查设备是否被锁定
            if (device.isLocked()) {
                promise.reject("LOCKED", "Device is locked and cannot be modified");
                return;
            }

            // 更新设备信息
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
     * 锁定/解锁设备
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
     * 移除设备
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
     * 清除所有设备
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
     * 获取发现日志
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
     * 停止发现服务
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
}
