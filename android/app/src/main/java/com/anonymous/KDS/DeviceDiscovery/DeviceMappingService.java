package com.anonymous.KDS.DeviceDiscovery;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.nsd.NsdManager;
import android.util.Log;
import java.lang.reflect.Type;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.Map;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import com.anonymous.KDS.models.NetworkDevice;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import java.util.ArrayList;

public class DeviceMappingService {
    private static final String PREFS_NAME = "DevicePrefs";
    private static final String DEVICE_MAP_KEY = "SavedDeviceMap";
    private static final Gson gson = new Gson();
    private final Map<String /* ID */, NetworkDevice> devices = new HashMap<>();
    private final List<Runnable> listeners = new LinkedList<>();
    private final Context context;
    private final DeviceDiscovery deviceDiscsovery;
    private final List<String> deviceDiscoveryLog;
    private static final String TAG = "DEVICE_MAPPING_SERVICE";

    public void StopDiscoveryService(){
        this.deviceDiscsovery.stopDiscovery();
    }
    
    public List<String> getLog(){
        Log.d(TAG, "Getting logg" + deviceDiscoveryLog.toString());
        return new ArrayList<>(deviceDiscoveryLog);  // Return a new copy
    }

    public DeviceMappingService(Context context) {
        this.context = context;
        this.deviceDiscsovery = new DeviceDiscovery(context);
        this.deviceDiscoveryLog = new LinkedList<>();
        Log.d(TAG, "Device mapping service starter");

        loadStoredDevices(context);

        this.deviceDiscsovery.startDiscovery(
                device -> {
                    Log.d(TAG, "Device found '" + device.getId() +"'");
                    this.addDevice(device);
                },
                device -> Log.d(TAG, "Device lost: " + device),
                log -> this.deviceDiscoveryLog.add(log),
                error -> this.deviceDiscoveryLog.add("Err:" + error) ,
                () -> this.deviceDiscoveryLog.add("Device discovery started"),
                () -> this.deviceDiscoveryLog.add("Device Discovery stopped")
        );
    }


    /**
     * Attempt to add device, if device exist, it is modified.
     * @param device
     */
    public void addDevice(NetworkDevice device) {
        if (device == null || device.getId() == null) {
            Log.w(TAG, "Attempted to add null or invalid device.");
            return;
        }

        String deviceId = device.getId();

        if (devices.containsKey(deviceId)) {
            try {
                modifyDevice(
                        deviceId,                          // currentDeviceId
                        deviceId,                          // newDeviceID (same)
                        device.getIp(),                                 // new IP
                        String.valueOf(device.getPort()),               // new Port as String
                        true,                                           // createOnMissing
                        Optional.of(device.isLocked()),                 // isLocked override
                        device.getName()
                );
            } catch (Exception e) {
                Log.e(TAG, "Failed to modify existing device '" + deviceId + "'", e);
            }
        } else {
            devices.put(deviceId, device);
            notifyListeners();
        }

        Log.d(TAG, "Device '" + deviceId + "' added and saved. Size = " + devices.size());
        saveDevicesToPrefs();
    } 

    public void modifyDevice(String deviceId, NetworkDevice device) {

        NetworkDevice cd = devices.get(deviceId);
        if (cd != null) {
            Log.d(TAG, "Modifying network device");
            cd.setName(device.getName());
            cd.setLocked(device.isLocked());
            cd.setPort(device.getPort());
            cd.setIp(device.getIp());
        }else{
            Log.d(TAG, "Cannot update network device. Network device not in map");
        }

    }



    public void modifyDevice(String currentDeviceId, String newDeviceID, String newDeviceIp,
                             String newDevicePort, boolean createOnMissing,
                             Optional<Boolean> isLocked, String name
     )  throws  Exception{


        if (currentDeviceId == null || !devices.containsKey(currentDeviceId)) {
            if (createOnMissing == false) return; // Device not found

            try {
                int port = Integer.parseInt(newDevicePort);
                addDevice(new NetworkDevice(newDeviceID, newDeviceIp, port, name, false));
            } catch (NumberFormatException e) {
                e.printStackTrace(); // Invalid port format, skip updating port
                throw new Exception("Failed to modify device. Cannot parse port");
            }
        }

        NetworkDevice device = devices.get(currentDeviceId);

        if (isLocked.isPresent()) device.setLocked(isLocked.get());

        if (device.isLocked()) throw new Exception("Cannot modify device  " + currentDeviceId + ". Device is locked");
        // Update IP
        device.setIp(newDeviceIp);
        if (name != null) device.setName(name);
        // Update Port
        try {
            device.setPort(Integer.parseInt(newDevicePort));
        } catch (NumberFormatException e) {
            e.printStackTrace(); // Invalid port format, skip updating port
        }

        // If the ID is changing, we must update the key in the map
        if (!currentDeviceId.equals(newDeviceID)) {
            device.setId(newDeviceID);
            devices.remove(currentDeviceId);
            devices.put(newDeviceID, device);
        }

        saveDevicesToPrefs();
        notifyListeners();
    }


    public void setIsLockDevice(NetworkDevice device, boolean isLocked){
        device.setLocked(isLocked);
        saveDevicesToPrefs();
        notifyListeners();
    }

    public void removeDevice(NetworkDevice device) {
        if (device != null && device.getId() != null) {
            devices.remove(device.getId());
            notifyListeners();
        }
        Log.d(TAG, "Device '" + device +"' removed. Size = " + devices.size());
        saveDevicesToPrefs();
    }

    private void saveDevicesToPrefs() {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = gson.toJson(devices);
        prefs.edit().putString(DEVICE_MAP_KEY, json).apply();
        Log.d(TAG, "Device list saved");
    }

    // 公开的保存方法，供外部调用
    public void saveDevices() {
        saveDevicesToPrefs();
    }

    public void loadStoredDevices(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String json = prefs.getString(DEVICE_MAP_KEY, null);
        Log.d(TAG, "Loading saved Device list.");

        if (json != null) {
            Type type = new TypeToken<Map<String, NetworkDevice>>() {}.getType();
            Map<String, NetworkDevice> loaded = gson.fromJson(json, type);
            if (loaded != null) {
                devices.clear();
                devices.putAll(loaded);
                Log.d(TAG, "Device list loaded of size " + devices.size());
                notifyListeners();
            }
        }
    }

    // Get a device by its ID
    public  NetworkDevice getDevice(String id) {
        return devices.get(id);
    }

    // Remove a device by its ID
    public  void removeDevice(String id) {
        if (devices.remove(id) != null) {
            notifyListeners();
        }
        saveDevicesToPrefs();
    }

    // Check if a device exists
    public  boolean containsDevice(String id) {
        return devices.containsKey(id);
    }

    // Get all devices as a LinkedList
    public LinkedList<NetworkDevice> getAllDevices() {
        Log.d(TAG, "Returning all devices of size : " + devices.size());
        return new LinkedList<>(devices.values());
    }

    // Clear all devices
    public  void clearDevices() {
        devices.clear();
        notifyListeners();
    }

    // Register a listener that gets called on updates
    public  void registerListener(Runnable listener) {
        if (listener != null && !listeners.contains(listener)) {
            listeners.add(listener);
        }
    }

    // Unregister a listener
    public  void unregisterListener(Runnable listener) {
        listeners.remove(listener);
    }

    // Notify all registered listeners
    private  void notifyListeners() {
        for (Runnable listener : listeners) {
            listener.run();
        }
    }
}
