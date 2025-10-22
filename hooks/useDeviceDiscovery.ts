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
  modifyDevice: (deviceId: string, name: string, ip: string, port: number) => Promise<void>;
  lockDevice: (deviceId: string, locked: boolean) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
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
      console.log('✅ Device discovery initialized');
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
      setDevices(discoveredDevices || []);
      console.log('✅ Devices refreshed:', discoveredDevices?.length || 0);
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
      console.log('✅ Device name set to:', deviceName);
    } catch (err: any) {
      const errorMsg = err.message || '设置设备名称失败';
      setError(errorMsg);
      console.error('❌ Error setting device name:', errorMsg);
      throw err;
    }
  }, []);

  // 修改设备信息
  const modifyDevice = useCallback(
    async (deviceId: string, name: string, ip: string, port: number) => {
      try {
        setError(null);
        await DeviceDiscoveryModule.modifyDevice(deviceId, name, ip, port);
        await refreshDevices();
        console.log('✅ Device modified:', deviceId);
      } catch (err: any) {
        const errorMsg = err.message || '修改设备失败';
        setError(errorMsg);
        console.error('❌ Error modifying device:', errorMsg);
        throw err;
      }
    },
    [refreshDevices]
  );

  // 锁定/解锁设备
  const lockDevice = useCallback(
    async (deviceId: string, locked: boolean) => {
      try {
        setError(null);
        await DeviceDiscoveryModule.setDeviceLocked(deviceId, locked);
        await refreshDevices();
        console.log(`✅ Device ${locked ? 'locked' : 'unlocked'}:`, deviceId);
      } catch (err: any) {
        const errorMsg = err.message || '锁定/解锁设备失败';
        setError(errorMsg);
        console.error('❌ Error locking device:', errorMsg);
        throw err;
      }
    },
    [refreshDevices]
  );

  // 移除设备
  const removeDevice = useCallback(
    async (deviceId: string) => {
      try {
        setError(null);
        await DeviceDiscoveryModule.removeDevice(deviceId);
        await refreshDevices();
        console.log('✅ Device removed:', deviceId);
      } catch (err: any) {
        const errorMsg = err.message || '移除设备失败';
        setError(errorMsg);
        console.error('❌ Error removing device:', errorMsg);
        throw err;
      }
    },
    [refreshDevices]
  );

  // 停止发现服务
  const stopDiscovery = useCallback(async () => {
    try {
      setError(null);
      await DeviceDiscoveryModule.stopDiscoveryService();
      setInitialized(false);
      console.log('✅ Discovery service stopped');
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
    modifyDevice,
    lockDevice,
    removeDevice,
    stopDiscovery,
  };
};
