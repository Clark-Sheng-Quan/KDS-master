import { useState, useEffect, useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';

const { DeviceDiscoveryModule } = NativeModules;

export interface NetworkDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  locked: boolean;
}

interface UseDeviceDiscoveryReturn {
  devices: NetworkDevice[];
  loading: boolean;
  error: string | null;
  initialized: boolean;
  initialize: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  setDeviceName: (deviceName: string) => Promise<void>;
  stopDiscovery: () => Promise<void>;
}

/**
 * Hook 用于管理 LAN 设备发现
 * 提供与原生 DeviceDiscoveryModule 的集成
 */
export const useDeviceDiscovery = (): UseDeviceDiscoveryReturn => {
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // 初始化设备发现服务
  const initialize = useCallback(async () => {
    if (Platform.OS !== 'android') {
      console.warn('DeviceDiscovery is only supported on Android');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await DeviceDiscoveryModule.initializeDeviceDiscovery();
      setInitialized(true);
    } catch (err: any) {
      const errorMsg = err.message || '初始化设备发现失败';
      setError(errorMsg);
      console.error('❌ Error initializing device discovery:', errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  // 刷新设备列表
  const refreshDevices = useCallback(async () => {
    try {
      setError(null);
      const discoveredDevices = await DeviceDiscoveryModule.getDiscoveredDevices();
      
      if (!discoveredDevices || discoveredDevices.length === 0) {
        setDevices([]);
        return;
      }

      // 去重：用 Map 按 ip:port 保持最新的设备信息
      const uniqueMap = new Map<string, NetworkDevice>();
      for (const device of discoveredDevices) {
        const key = `${device.ip}:${device.port}`;
        uniqueMap.set(key, device);
      }
      
      setDevices(Array.from(uniqueMap.values()));
    } catch (err: any) {
      const errorMsg = err.message || '获取设备列表失败';
      setError(errorMsg);
      console.error('❌ Error refreshing devices:', errorMsg);
    }
  }, []);

  // 设置当前设备的服务名称
  const setDeviceName = useCallback(async (deviceName: string) => {
    try {
      setError(null);
      await DeviceDiscoveryModule.setDeviceServiceName(deviceName);
    } catch (err: any) {
      const errorMsg = err.message || '设置设备名称失败';
      setError(errorMsg);
      console.error('❌ Error setting device name:', errorMsg);
      throw err;
    }
  }, []);

  // 停止发现服务
  const stopDiscovery = useCallback(async () => {
    try {
      setError(null);
      await DeviceDiscoveryModule.stopDiscoveryService();
      setInitialized(false);
    } catch (err: any) {
      const errorMsg = err.message || '停止发现服务失败';
      setError(errorMsg);
      console.error('❌ Error stopping discovery:', errorMsg);
      throw err;
    }
  }, []);

  // 自动初始化
  useEffect(() => {
    initialize();
    
    // 定期刷新设备列表（每5秒）
    const interval = setInterval(() => {
      refreshDevices();
    }, 5000);

    return () => {
      clearInterval(interval);
      stopDiscovery().catch(console.error);
    };
  }, [initialize, refreshDevices, stopDiscovery]);

  return {
    devices,
    loading,
    error,
    initialized,
    initialize,
    refreshDevices,
    setDeviceName,
    stopDiscovery,
  };
};
