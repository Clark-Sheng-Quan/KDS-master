import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
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
}

export const DeviceDiscoveryPanel: React.FC<DeviceDiscoveryPanelProps> = ({
  visible,
  onClose,
  onSelectAsMaster,
}) => {
  const { t } = useLanguage();
  const {
    devices,
    loading,
    error,
    initialized,
    refreshDevices,
    setDeviceName,
    modifyDevice,
    lockDevice,
    removeDevice,
  } = useDeviceDiscovery();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<NetworkDevice | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIp, setEditIp] = useState('');
  const [editPort, setEditPort] = useState('');

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshDevices();
    setRefreshing(false);
  };

  const handleSelectDevice = (device: NetworkDevice) => {
    setSelectedDevice(device);
    setEditName(device.name);
    setEditIp(device.ip);
    setEditPort(device.port.toString());
  };

  const handleSaveEdit = async () => {
    if (!selectedDevice || !editName.trim() || !editIp.trim()) {
      Alert.alert('Invalid Input', 'Please fill in all required fields');
      return;
    }

    try {
      const port = parseInt(editPort, 10);
      if (isNaN(port) || port <= 0) {
        Alert.alert('Invalid Port', 'Port must be a positive number');
        return;
      }

      await modifyDevice(selectedDevice.id, editName, editIp, port);
      setShowEditModal(false);
      setSelectedDevice(null);
      Alert.alert('Success', 'Device updated successfully');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update device');
    }
  };

  const handleLockDevice = async (device: NetworkDevice) => {
    try {
      await lockDevice(device.id, !device.locked);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update device lock status');
    }
  };

  const handleRemoveDevice = (device: NetworkDevice) => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove ${device.name}?`,
      [
        { text: 'Cancel', onPress: () => {}, style: 'cancel' },
        {
          text: 'Remove',
          onPress: async () => {
            try {
              await removeDevice(device.id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to remove device');
            }
          },
          style: 'destructive',
        },
      ]
    );
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
          <Text style={styles.headerTitle}>📡 Device Discovery</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Status */}
        {!initialized && (
          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color={theme.colors.primaryColor} />
            <Text style={styles.statusText}>Initializing discovery...</Text>
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
              <Text style={styles.loadingText}>Discovering devices...</Text>
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-offline" size={48} color="#999" />
              <Text style={styles.emptyText}>No devices discovered</Text>
              <Text style={styles.emptySubText}>
                Make sure other KDS devices are connected to the same network
              </Text>
            </View>
          ) : (
            devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onEdit={() => {
                  handleSelectDevice(device);
                  setShowEditModal(true);
                }}
                onLock={() => handleLockDevice(device)}
                onSelectAsMaster={() => onSelectAsMaster?.(device)}
                onRemove={() => handleRemoveDevice(device)}
              />
            ))
          )}
        </ScrollView>

        {/* Edit Modal */}
        {selectedDevice && (
          <Modal
            visible={showEditModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              setShowEditModal(false);
              setSelectedDevice(null);
            }}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Edit Device</Text>

                <Text style={styles.label}>Device Name</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter device name"
                />

                <Text style={styles.label}>IP Address</Text>
                <TextInput
                  style={styles.input}
                  value={editIp}
                  onChangeText={setEditIp}
                  placeholder="Enter IP address"
                  keyboardType="decimal-pad"
                />

                <Text style={styles.label}>Port</Text>
                <TextInput
                  style={styles.input}
                  value={editPort}
                  onChangeText={setEditPort}
                  placeholder="Enter port"
                  keyboardType="number-pad"
                />

                <View style={styles.modalButtonGroup}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => {
                      setShowEditModal(false);
                      setSelectedDevice(null);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalButton, styles.saveButton]}
                    onPress={handleSaveEdit}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

interface DeviceCardProps {
  device: NetworkDevice;
  onEdit: () => void;
  onLock: () => void;
  onRemove: () => void;
  onSelectAsMaster?: () => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onEdit,
  onLock,
  onRemove,
  onSelectAsMaster,
}) => {
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceInfo}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceNameRow}>
            <Ionicons
              name={device.locked ? 'lock-closed' : 'wifi'}
              size={20}
              color={device.locked ? '#d32f2f' : '#4CAF50'}
            />
            <Text style={styles.deviceName}>{device.name}</Text>
            {device.locked && <Text style={styles.lockedBadge}>LOCKED</Text>}
          </View>
        </View>

        <View style={styles.deviceDetails}>
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>ID:</Text> {device.id}
          </Text>
          <Text style={styles.detailText}>
            <Text style={styles.detailLabel}>IP:</Text> {device.ip}:{device.port}
          </Text>
        </View>
      </View>

      <View style={styles.deviceActionsRow}>
        <View style={styles.deviceActions}>
          <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
            <Ionicons name="create" size={20} color="#2196F3" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={onLock}>
            <Ionicons
              name={device.locked ? 'lock-open' : 'lock-closed'}
              size={20}
              color={device.locked ? '#FF9800' : '#4CAF50'}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={onRemove}>
            <Ionicons name="trash" size={20} color="#d32f2f" />
          </TouchableOpacity>
        </View>

        {onSelectAsMaster && (
          <TouchableOpacity style={styles.connectButton} onPress={onSelectAsMaster}>
            <Ionicons name="link" size={18} color="white" />
            <Text style={styles.connectButtonText}>Connect</Text>
          </TouchableOpacity>
        )}
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
    flexDirection: 'column',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  deviceInfo: {
    flex: 1,
    marginBottom: 12,
  },
  deviceHeader: {
    marginBottom: 8,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  lockedBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    backgroundColor: '#d32f2f',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  deviceDetails: {
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#666',
  },
  detailLabel: {
    fontWeight: '600',
    color: '#333',
  },
  deviceActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  deviceActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    gap: 6,
    marginLeft: 8,
  },
  connectButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  // Edit Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  modalButtonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    backgroundColor: theme.colors.primaryColor,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
