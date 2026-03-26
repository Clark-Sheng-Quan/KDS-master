import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { theme } from '../constants/theme';
import { useDeviceDiscovery, NetworkDevice } from '../hooks/useDeviceDiscovery';
import { callingScreenService, CallingScreenDevice } from '../services/CallingScreenService';
import { callingScreenDiscovery } from '../services/CallingScreenDiscovery';

interface CallingScreenDiscoveryPanelProps {
  visible: boolean;
  onClose: () => void;
  onSelectDevice?: (device: CallingScreenDevice) => void;
}

export const CallingScreenDiscoveryPanel: React.FC<CallingScreenDiscoveryPanelProps> = ({
  visible,
  onClose,
  onSelectDevice,
}) => {
  const { t } = useLanguage();
  const {
    devices,
    loading,
    error,
    initialized,
    refreshDevices,
  } = useDeviceDiscovery();
  const [connecting, setConnecting] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 动画值
  const fadeAnim = useMemo(() => new Animated.Value(visible ? 1 : 0), [visible]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  // 只过滤 Calling Screen 设备（CS: 前缀）
  const callingScreenDevices = devices.filter(
    (device) => device.name.startsWith('CS:')
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshDevices();
    setRefreshing(false);
  }

  // Connect to device
  const handleConnectDevice = async (device: NetworkDevice) => {
    setSelectedDevice(`${device.ip}-${device.port}`);
    setConnecting(true);

    try {
      console.log('[CallingScreenDiscoveryPanel] Connecting to:', device.name, 'at', device.ip + ':' + device.port);

      // Create CallingScreenDevice from NetworkDevice
      const callingScreenDevice: CallingScreenDevice = {
        name: device.name,
        ip: device.ip,
        port: device.port,
        foundAt: Date.now(),
      };

      // Cache device directly (no need to wait for registration)
      console.log('[CallingScreenDiscoveryPanel] Caching device');
      callingScreenDiscovery.setCachedDevice(callingScreenDevice);
      callingScreenService.setRegistered(true);

      Alert.alert(
        t('success'),
        `Connected to ${device.name}\n${device.ip}:${device.port}`,
        [
          {
            text: 'OK',
            onPress: () => {
              onSelectDevice?.(callingScreenDevice);
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error('[CallingScreenDiscoveryPanel] Connection error:', error);
      Alert.alert(
        t('error'),
        'Connection failed: ' + String(error),
        [{ text: 'OK' }]
      );
    } finally {
      setConnecting(false);
      setSelectedDevice(null);
    }
  };

  return (
    <>
      {/* 背景 */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: fadeAnim, pointerEvents: visible ? "auto" : "none" },
        ]}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* 面板 */}
      <Animated.View
        style={[
          styles.panelContainer,
          {
            opacity: fadeAnim,
            pointerEvents: visible ? "auto" : "none",
          },
        ]}
      >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📡 {t("deviceDiscovery")}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Status */}
        {!initialized && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color={theme.colors.primaryColor} />
            <Text style={styles.statusText}>{t("initializingDiscovery")}</Text>
          </View>
        )}

        {error && (
          <View style={[styles.statusBox, styles.errorBox]}>
            <Ionicons name="alert-circle" size={20} color="#d32f2f" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Device List */}
        <ScrollView
          style={styles.deviceList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        >
          {loading && callingScreenDevices.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primaryColor} />
              <Text style={styles.loadingText}>{t("discoveringDevices")}</Text>
            </View>
          ) : callingScreenDevices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-offline" size={48} color="#999" />
              <Text style={styles.emptyText}>{t("noDevicesDiscovered")}</Text>
              <Text style={styles.emptySubText}>
                {t("makesSureOtherKDSConnected")}
              </Text>
            </View>
          ) : (
            callingScreenDevices.map((device: NetworkDevice) => (
              <CallingScreenDeviceCard
                key={`${device.ip}-${device.port}`}
                device={device}
                onConnect={() => handleConnectDevice(device)}
                isConnecting={connecting && selectedDevice === `${device.ip}-${device.port}`}
                t={t}
              />
            ))
          )}
        </ScrollView>
      </View>
      </Animated.View>
    </>
  );
};

interface CallingScreenDeviceCardProps {
  device: NetworkDevice;
  onConnect: () => void;
  isConnecting: boolean;
  t: (key: string) => string;
}

const CallingScreenDeviceCard: React.FC<CallingScreenDeviceCardProps> = ({
  device,
  onConnect,
  isConnecting,
  t,
}) => {
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceNameSection}>
        <Ionicons name="wifi" size={24} color={theme.colors.primaryColor} />
        <View style={styles.deviceInfoColumn}>
          <Text style={styles.deviceName}>{device.name}</Text>
          <View style={styles.deviceAddressSection}>
            <View style={styles.addressGroup}>
              <Text style={styles.addressLabel}>IP:</Text>
              <Text style={styles.addressValue}>{device.ip}</Text>
            </View>
            <Text style={styles.separator}>|</Text>
            <View style={styles.portGroup}>
              <Text style={styles.portLabel}>Port:</Text>
              <Text style={styles.portValue}>{device.port}</Text>
            </View>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
        onPress={onConnect}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={16} color="white" />
            <Text style={styles.connectButtonText}>{t('connect')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panelContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primaryColor,
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderLeftColor: '#d32f2f',
  },
  statusText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#333',
  },
  errorText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#d32f2f',
  },
  deviceList: {
    flex: 1,
    padding: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  emptySubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginHorizontal: 20,
  },
  deviceCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primaryColor,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceNameSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  deviceInfoColumn: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  deviceAddressSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separator: {
    fontSize: 14,
    color: '#ddd',
    fontWeight: '300',
  },
  addressGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  addressValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primaryColor,
  },
  portGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  portValue: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primaryColor,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryColor,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 6,
    minWidth: 100,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});
