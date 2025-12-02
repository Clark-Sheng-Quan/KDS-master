import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceDiscovery, NetworkDevice } from '../hooks/useDeviceDiscovery';
import { useLanguage } from '../contexts/LanguageContext';
import { theme } from '../styles/theme';

interface DeviceDiscoveryPanelProps {
  visible: boolean;
  onClose: () => void;
  onSelectAsMaster?: (device: NetworkDevice) => void;
  currentDeviceIP?: string;
}

export const DeviceDiscoveryPanel: React.FC<DeviceDiscoveryPanelProps> = ({
  visible,
  onClose,
  onSelectAsMaster,
  currentDeviceIP,
}) => {
  const { t } = useLanguage();
  const {
    devices,
    loading,
    error,
    initialized,
    refreshDevices,
  } = useDeviceDiscovery();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshDevices();
    setRefreshing(false);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
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
          {loading && devices.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primaryColor} />
              <Text style={styles.loadingText}>{t("discoveringDevices")}</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-offline" size={48} color="#999" />
              <Text style={styles.emptyText}>{t("noDevicesDiscovered")}</Text>
              <Text style={styles.emptySubText}>
                {t("makesSureOtherKDSConnected")}
              </Text>
            </View>
          ) : (
            devices
              .filter((device) => device.ip !== currentDeviceIP)
              .map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onSelectAsMaster={() => onSelectAsMaster?.(device)}
                  t={t}
                />
              ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

interface DeviceCardProps {
  device: NetworkDevice;
  onSelectAsMaster?: () => void;
  t: (key: string) => string;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onSelectAsMaster,
  t,
}) => {
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceNameSection}>
        <Ionicons name="wifi" size={24} color="#4CAF50" />
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
    </View>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: '#E8F5E9',
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
    borderLeftColor: '#4CAF50',
  },
  deviceNameSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
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
    color: '#2196F3',
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
    color: '#2196F3',
  },
});
