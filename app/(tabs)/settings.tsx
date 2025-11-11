import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
  NativeModules,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../styles/theme";
import * as Network from "expo-network";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../../contexts/LanguageContext";
import { SupportedLanguage } from "../../constants/translations";
import { DistributionService } from "@/services/distributionService";
import { settingsListener } from "@/services/settingsListener";
import { TCPSocketService } from "@/services/tcpSocketService";
import { DeviceDiscoveryPanel } from "../../components/DeviceDiscoveryPanel";
import { NetworkDevice } from "../../hooks/useDeviceDiscovery";

// 本地定义 CategoryType - 厨房分类设置
enum CategoryType {
  ALL = "all",
  MILK_TEA = "Milk Tea",
  FOOD = "Food"
}

// 设置相关的常量
const STORAGE_KEY_COMPACT_CARDS_PER_ROW = "compact_cards_per_row";
const DEFAULT_COMPACT_CARDS_PER_ROW = "5";
const STORAGE_KEY_SHOW_PRINT_BUTTON = "show_print_button";

export default function SettingsScreen() {
  const { language, t, changeLanguage } = useLanguage();
  const [ipAddress, setIpAddress] = useState<string>("获取中...");
  const [port, setPort] = useState<string>("4322"); // 默认端口
  const [loading, setLoading] = useState<boolean>(true);
  const [masterIP, setMasterIP] = useState<string>("");
  const [manualMasterIP, setManualMasterIP] = useState<string>("");
  const [showDeviceDiscovery, setShowDeviceDiscovery] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("KDS:Device");
  const [editingDeviceName, setEditingDeviceName] = useState<string>("KDS:Device");

  // 添加Compact模式下每行卡片数量状态
  const [compactCardsPerRow, setCompactCardsPerRow] = useState<string>(
    DEFAULT_COMPACT_CARDS_PER_ROW
  );

  // 添加显示打印按钮开关状态
  const [showPrintButton, setShowPrintButton] = useState<boolean>(true);

  // KDS分类设置（仅用于UI显示，Master-Slave功能已移除）
  const [kdsCategory, setKdsCategory] = useState<CategoryType>(CategoryType.ALL);

  // TCP 连接状态管理
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [connectedDevices, setConnectedDevices] = useState<Array<{ ip: string; port: number; deviceName: string; status: 'connected' | 'disconnected' }>>([]);

  // 加载保存的设置
  useEffect(() => {
    async function loadSettings() {
      try {
        // 获取设备IP地址
        const ip = await Network.getIpAddressAsync();
        setIpAddress(ip || "未知IP地址");

        const savedPort = await AsyncStorage.getItem("kds_port");
        if (savedPort) setPort(savedPort);

        // 加载Compact模式每行卡片数量
        const savedCompactCardsPerRow = await AsyncStorage.getItem(
          STORAGE_KEY_COMPACT_CARDS_PER_ROW
        );
        if (savedCompactCardsPerRow) {
          setCompactCardsPerRow(savedCompactCardsPerRow);
        }

        // 加载打印按钮显示设置
        const savedShowPrintButton = await AsyncStorage.getItem(
          STORAGE_KEY_SHOW_PRINT_BUTTON
        );
        if (savedShowPrintButton !== null) {
          setShowPrintButton(savedShowPrintButton === "true");
        }

        // 加载子KDS分类设置
        const savedCategory = await AsyncStorage.getItem("kds_category");
        if (savedCategory) {
          setKdsCategory(savedCategory as CategoryType);
        }

        // 加载设备名称
        const savedDeviceName = await AsyncStorage.getItem("device_name");
        if (savedDeviceName) {
          setDeviceName(savedDeviceName);
          setEditingDeviceName(savedDeviceName);
        }

        // 获取当前连接状态和Master IP（不设置回调，避免与_layout.tsx冲突）
        const currentMasterIP = TCPSocketService.getMasterIP();
        setMasterIP(currentMasterIP);
        
        // 获取初始连接状态
        const currentStatus = TCPSocketService.getConnectionStatus();
        setConnectionStatus(currentStatus);
        
        // 获取初始连接的设备列表
        const devices = TCPSocketService.getConnectedPOSDevices();
        setConnectedDevices(devices);

        setLoading(false);
      } catch (error) {
        console.error("加载设置失败:", error);
        setLoading(false);
      }
    }

    loadSettings();
  }, []); // 只在组件挂载时执行一次

  // 使用定时器定期检查连接状态（避免设置回调冲突）
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentStatus = TCPSocketService.getConnectionStatus();
      const currentMasterIP = TCPSocketService.getMasterIP();
      const devices = TCPSocketService.getConnectedPOSDevices();
      
      setConnectionStatus(currentStatus);
      setMasterIP(currentMasterIP);
      setConnectedDevices(devices);
    }, 2000); // 每2秒检查一次

    return () => clearInterval(intervalId);
  }, []);

  // 保存设置
  const saveSettings = useCallback(async () => {
    try {
      // 保存端口（使用 TCPSocketService.setTcpPort）
      const portNum = parseInt(port, 10);
      if (portNum > 0 && portNum < 65536) {
        await TCPSocketService.setTcpPort(portNum);
      } else {
        Alert.alert("错误", "端口号必须在 1-65535 之间");
        return;
      }

      // 保存Compact模式每行卡片数量
      await AsyncStorage.setItem(
        STORAGE_KEY_COMPACT_CARDS_PER_ROW,
        compactCardsPerRow
      );

      // 保存分类设置
      await AsyncStorage.setItem("kds_category", kdsCategory);

      // 保存设备名称
      await AsyncStorage.setItem("device_name", editingDeviceName);
      setDeviceName(editingDeviceName);

      // 通过原生模块更新设备在网络上的服务名称
      if (Platform.OS === "android" && NativeModules.DeviceDiscoveryModule) {
        try {
          await NativeModules.DeviceDiscoveryModule.setDeviceServiceName(
            editingDeviceName
          );
        } catch (error) {
          console.warn("设备名称已保存，但网络更新可能延迟", error);
        }
      }

      Alert.alert("成功", "设置已保存");
    } catch (error) {
      Alert.alert("错误", "保存设置失败");
    }
  }, [port, compactCardsPerRow, kdsCategory, editingDeviceName]);

  // 处理从Device Discovery连接目标设备
  // const handleConnectToDevice = useCallback(async (device: NetworkDevice) => {
  //   try {
  //       // 如果当前是Slave，则连接到Master KDS (在当前方案中，POS作为客户端连接到KDS)
        
  //       Alert.alert(
  //         t("connectToDevice"),
  //         t("connectToMasterKDS"),
  //         [
  //           { text: t("cancel"), onPress: () => {
  //             setShowDeviceDiscovery(false);
  //           }, style: 'cancel' },
  //           {
  //             text: t("connect"),
  //             onPress: async () => {
  //               setMasterIP(device.ip);
                
  //               try {
  //                 // 立即连接到POS/Master，不需要重启
  //                 const connected = await TCPSocketService.connectToMaster(device.ip);
                  
  //                 if (connected) {
  //                   // 保存IP到本地存储
  //                   await AsyncStorage.setItem("master_ip", device.ip);
                    
  //                   // 关闭Device Discovery面板
  //                   setShowDeviceDiscovery(false);
                    
  //                   Alert.alert(
  //                     t("success"),
  //                     `${t("connectionEstablished")}\nPOS IP: ${device.ip}\n\n等待接收心跳以确认连接状态...`
  //                   );
  //                 } else {
  //                   setMasterIP(""); // 重置IP
  //                   Alert.alert(t("error"), t("connectionFailed"));
  //                 }
  //               } catch (error: any) {
  //                 console.error('[Settings] 连接过程出错:', error);
  //                 setMasterIP(""); // 重置IP
  //                 Alert.alert(t("error"), `${t("connectionFailed")}: ${error.message}`);
  //               }
  //             },
  //             style: 'default',
  //           },
  //         ]
  //       );
  //     /* } */ // Master模式块结束
  //   } catch (error) {
  //     console.error('[Settings] handleConnectToDevice错误:', error);
  //     Alert.alert("错误", "连接设备失败");
  //   }
  // }, [t, setShowDeviceDiscovery]);

  // 保存手动输入的Master IP
  // const saveManualMasterIP = useCallback(async () => {
  //   if (!manualMasterIP.trim()) {
  //     Alert.alert(t("error"), t("pleaseEnterIPAddress"));
  //     return;
  //   }

  //   try {
  //     console.log('[Settings] 开始手动连接到Master IP:', manualMasterIP);
      
  //     // 立即连接到Master，不需要重启
  //     // const connected = await TCPSocketService.connectToMaster(manualMasterIP);
      
  //     if (connected) {
  //       console.log('[Settings] 成功连接到Master KDS');
  //       setMasterIP(manualMasterIP);
  //       // 保存IP到本地存储
  //       await AsyncStorage.setItem("master_ip", manualMasterIP);
  //       Alert.alert(t("success"), `${t("masterKDSIPAddress")} ${t("saved")}: ${manualMasterIP}`);
  //       setManualMasterIP(""); // Clear input field
  //     } else {
  //       console.log('[Settings] 连接到Master KDS失败');
  //       Alert.alert(t("error"), t("connectionFailed"));
  //     }
  //   } catch (error: any) {
  //     console.error('[Settings] 手动连接过程出错:', error);
  //     Alert.alert(t("error"), `${t("connectionFailed")}: ${error.message}`);
  //   }
  // }, [manualMasterIP, t]);

  // 获取品类显示名称
  const getCategoryDisplayName = useCallback((category: CategoryType) => {
    switch (category) {
      case CategoryType.MILK_TEA:
        return "Milk Tea";
      case CategoryType.FOOD:
        return "Food";
      case CategoryType.ALL:
        return "All";
      default:
        return "Unknown";
    }
  }, []);

  // 处理语言切换
  const handleLanguageChange = useCallback(async (newLanguage: SupportedLanguage) => {
    await changeLanguage(newLanguage);
  }, [changeLanguage]);

  // 处理Compact模式每行卡片数量变更
  const handleCompactCardsPerRowChange = useCallback(async (value: string) => {
    setCompactCardsPerRow(value);
    await AsyncStorage.setItem(STORAGE_KEY_COMPACT_CARDS_PER_ROW, value);
  }, []);

  // 处理打印按钮显示开关
  const handleShowPrintButtonChange = useCallback(async (value: boolean) => {
    setShowPrintButton(value);
    await AsyncStorage.setItem(STORAGE_KEY_SHOW_PRINT_BUTTON, value.toString());
    
    // 发出设置变化事件，使 PrintButton 组件即时响应
    settingsListener.emitSettingChange('show_print_button', value);
    console.log('[Settings] 发出 show_print_button 设置变化事件，值:', value);
  }, []);

  // 重置设置
  const resetSettings = useCallback(() => {
    Alert.alert(t("resetSettings"), t("confirmReset"), [
      {
        text: t("cancel"),
        style: "cancel",
      },
      {
        text: t("confirm"),
        onPress: async () => {
          // 重置为英文
          await changeLanguage("en");
          // 重置其他设置
          await AsyncStorage.removeItem("viewMode");
          // 重置Compact模式每行卡片数量
          await AsyncStorage.setItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW,
            DEFAULT_COMPACT_CARDS_PER_ROW
          );
          setCompactCardsPerRow(DEFAULT_COMPACT_CARDS_PER_ROW);
          // 可以添加其他需要重置的设置
        },
      },
    ]);
  }, [t, changeLanguage]);

  // 保存KDS设置
  const saveKDSRole = useCallback(async () => {
    try {
      // 保存端口（使用 TCPSocketService.setTcpPort）
      const portNum = parseInt(port, 10);
      if (portNum > 0 && portNum < 65536) {
        await TCPSocketService.setTcpPort(portNum);
      } else {
        Alert.alert("错误", "端口号必须在 1-65535 之间");
        return;
      }
      
      await AsyncStorage.setItem("device_name", editingDeviceName);

      // 保存分类设置
      await AsyncStorage.setItem("kds_category", kdsCategory);

      // 通过原生模块更新设备在网络上的服务名称
      if (Platform.OS === "android" && NativeModules.DeviceDiscoveryModule) {
        try {
          await NativeModules.DeviceDiscoveryModule.setDeviceServiceName(
            editingDeviceName
          );
        } catch (error) {
          console.warn("设备名称已保存，但网络更新可能延迟", error);
        }
      }

      Alert.alert(t("success"), t("settingsSavedRestart"));
    } catch (error) {
      console.error("保存KDS设置失败:", error);
      Alert.alert(t("error"), t("saveSettingsFailed"));
    }
  }, [port, editingDeviceName, kdsCategory, t]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#333" />
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{t("settings")}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("deviceInfo")}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("localIPAddress")}</Text>
            <Text style={styles.infoValue}>{ipAddress}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("tcpPort")}</Text>
            <TextInput
              style={styles.textInput}
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("deviceName")}</Text>
            <TextInput
              style={styles.textInput}
              value={editingDeviceName}
              onChangeText={setEditingDeviceName}
              placeholder="e.g. KDS:Kitchen NO.1"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.infoRowColumn}>
            <Text style={styles.infoLabel}>{t("kdsRole")}</Text>
            <Text style={styles.infoValue}>{t("slaveDevices")}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("kitchenCategory")}</Text>
            <View style={styles.categoryPickerWrapper}>
              <Picker
                selectedValue={kdsCategory}
                style={styles.categoryPicker}
                onValueChange={(itemValue) =>
                  setKdsCategory(itemValue as CategoryType)
                }
                dropdownIconColor="#666"
              >
                <Picker.Item
                  label={getCategoryDisplayName(CategoryType.ALL)}
                  value={CategoryType.ALL}
                />
                <Picker.Item
                  label={getCategoryDisplayName(CategoryType.MILK_TEA)}
                  value={CategoryType.MILK_TEA}
                />
                <Picker.Item
                  label={getCategoryDisplayName(CategoryType.FOOD)}
                  value={CategoryType.FOOD}
                />
              </Picker>
            </View>
          </View>
          
          <View>
            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 20, maxWidth: 200, alignSelf: "center" }]}
              onPress={saveKDSRole}
            >
              <Text style={styles.saveButtonText}>{t("saveSettings")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========== 设备连接 - POS System ========== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("posConnection")}</Text>

          {/* POS 连接列表 */}
          {connectedDevices && connectedDevices.length > 0 ? (
            <View>
              {connectedDevices.map((device, index) => (
                <View key={`${device.ip}-${index}`} style={styles.posDeviceRow}>
                  {/* 设备信息 - 名称、IP和状态在同一行 */}
                  <View style={styles.posDeviceInfo}>
                    <View style={styles.posDeviceMainContent}>
                      <View style={styles.posDeviceNameIP}>
                        <Text style={styles.posDeviceName}>{device.deviceName}</Text>
                        <Text style={styles.posDeviceIP}>{device.ip}</Text>
                      </View>
                      <View style={styles.statusBadgeSmall}>
                        <Ionicons 
                          name={device.status === 'connected' ? 'checkmark-circle' : 'close-circle'} 
                          size={14} 
                          color={device.status === 'connected' ? '#4CAF50' : '#d32f2f'} 
                        />
                        <Text style={[
                          styles.statusTextSmall,
                          device.status === 'connected' 
                            ? styles.statusConnectedSmall 
                            : styles.statusDisconnectedSmall
                        ]}>
                          {device.status === 'connected' 
                            ? t("connectionEstablished") 
                            : t("disconnected")}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* 断开连接按钮 */}
                  {(
                    <TouchableOpacity 
                      style={styles.disconnectButton}
                      onPress={() => {
                        Alert.alert(
                          t("confirm"),
                          `${t("confirmResetMasterConnection")}?\n(${device.ip})`,
                          [
                            { 
                              text: t("cancel"), 
                              onPress: () => {
                                console.log('[Settings] 用户取消断开连接');
                              }, 
                              style: 'cancel' 
                            },
                            {
                              text: t("confirm"),
                              onPress: async () => {
                                console.log('[Settings] 重置连接:', device.ip);
                                try {
                                  // 从历史记录中移除设备
                                  TCPSocketService.removeDeviceFromHistory(device.ip);
                                  
                                  // 同时尝试断开TCP连接
                                  TCPSocketService.disconnect(device.ip);
                                  
                                  Alert.alert(t("success"), t("masterConnectionReset"));
                                } catch (error: any) {
                                  console.error('[Settings] 重置连接出错:', error);
                                  Alert.alert(t("error"), `${t("failed")}: ${error.message}`);
                                }
                              },
                              style: 'destructive',
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="white" />
                      <Text style={styles.disconnectButtonText}>{t("resetConnection")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noConnectionsContainer}>
              <Text style={styles.noConnectionsText}>{t("noConnections")}</Text>
            </View>
          )}

          {/* Device Discovery 按钮 */}
          <TouchableOpacity
            style={styles.deviceDiscoveryButton}
            onPress={() => setShowDeviceDiscovery(true)}
          >
            <Text style={styles.deviceDiscoveryButtonText}>📡 {t("deviceDiscovery")}</Text>
          </TouchableOpacity>
        </View>

        {/* 显示设置卡片 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("displaySettings")}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("cardsPerRow")}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={compactCardsPerRow}
                style={styles.textPicker}
                onValueChange={handleCompactCardsPerRowChange}
                dropdownIconColor="#666"
              >
                <Picker.Item label="3" value="3" />
                <Picker.Item label="4" value="4" />
                <Picker.Item label="5" value="5" />
                <Picker.Item label="6" value="6" />
              </Picker>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("language")}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={language}
                style={styles.textPicker}
                onValueChange={(itemValue: SupportedLanguage) =>
                  handleLanguageChange(itemValue)
                }
                dropdownIconColor="#666"
              >
                <Picker.Item label={t("english")} value="en" />
                <Picker.Item label={t("chinese")} value="zh" />
              </Picker>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Show Print Button</Text>
            <TouchableOpacity
              style={[
                styles.switchButton,
                showPrintButton && styles.switchButtonActive
              ]}
              onPress={() => handleShowPrintButtonChange(!showPrintButton)}
            >
              <View style={[
                styles.switchThumb,
                showPrintButton && styles.switchThumbActive
              ]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* <TouchableOpacity style={styles.resetButton} onPress={resetSettings}>
          <Text style={styles.resetButtonText}>{t("resetSettings")}</Text>
        </TouchableOpacity> */}
        
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("systemInfo")}</Text>
          <Text style={styles.infoText}>{t("systemVersion")}: 1.0.0</Text>
          <Text style={styles.infoText}>{t("copyright")}</Text>
        </View>
      </ScrollView>

      <DeviceDiscoveryPanel
        visible={showDeviceDiscovery}
        onClose={() => setShowDeviceDiscovery(false)}
        // onSelectAsMaster={handleConnectToDevice}
        currentDeviceIP={ipAddress}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  settingLabel: {
    fontSize: 16,
    flex: 1,
  },
  input: {
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    fontSize: 16,
    minWidth: 150,
    flex: 1,
    marginLeft: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    overflow: "hidden",
    flex: 1,
    marginLeft: 8,
    maxWidth: 150,
  },
  picker: {
    width: "100%",
    height: 40,
  },
  saveButton: {
    backgroundColor: theme.colors.primaryColor,
    padding: 12,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#1a1a1a",
  },
  card: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 20,
    marginBottom: 8,
    color: "#444",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    marginTop: 16,
  },
  infoRowColumn: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 16,
  },
  infoLabel: {
    fontSize: 16,
    color: "#666",
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  /* Master 模式相关样式已删除: roleSelector, roleButton, roleButtonActive, roleText, roleTextActive */
  textInput: {
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    fontSize: 16,
    minWidth: 120,
  },
  addKdsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
  },
  addButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  addButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  /* Master 模式相关样式已删除 - subKdsItem, removeButton, noItemsText */
  section: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  resetButton: {
    backgroundColor: "#ff3b30",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  resetButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  textPicker: {
    width: 150,
    height: 55,
    color: "#333",
  },
  deviceDiscoveryButton: {
    marginTop: 20,
    marginBottom: 20,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: "#2196F3",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    minWidth: 400,
    
  },
  deviceDiscoveryButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    gap: 6,
    minWidth: 140,
    justifyContent: "center",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusConnected: {
    color: "#4CAF50",
  },
  statusDisconnected: {
    color: "#d32f2f",
  },
  /* Master 模式相关样式已删除:
   * slaveDeviceItem, slaveDeviceInfo, slaveDeviceHeader, slaveDeviceName, 
   * slaveDeviceIP, slaveDeviceCategory, slaveDeviceControls, 
   * reconnectButton, reconnectButtonText, deleteButton, deleteButtonText, 
   * disconnectButton, disconnectButtonText 
   */
  statusAndButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "flex-end",
    flex: 1,
  },
  resetConnectionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d32f2f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  resetConnectionButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },
  categoryPickerWrapper: {
    marginLeft: 12,
    borderWidth: 2,
    borderColor: "#007AFF",
    borderRadius: 8,
    overflow: "hidden",
    width: 180,
    backgroundColor: "#fff",
  },
  categoryPicker: {
    width: "100%",
    height: 55,
    color: "#333",
  },
  saveSettingsButton: {
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  saveSettingsButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  switchButton: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ccc",
    padding: 2,
    justifyContent: "center",
  },
  switchButtonActive: {
    backgroundColor: "#4CAF50",
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  posDeviceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 8,
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#2196F3",
  },
  posDeviceInfo: {
    flex: 1,
    marginRight: 12,
  },
  posDeviceMainContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  posDeviceNameIP: {
    flexDirection: "column",
    gap: 4,
  },
  posDeviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  posDeviceIP: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  statusBadgeSmall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f5f5f5",
    gap: 4,
  },
  statusTextSmall: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusConnectedSmall: {
    color: "#4CAF50",
  },
  statusDisconnectedSmall: {
    color: "#d32f2f",
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d32f2f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    minWidth: 50,
  },
  disconnectButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },
  noConnectionsContainer: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  noConnectionsText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
});

