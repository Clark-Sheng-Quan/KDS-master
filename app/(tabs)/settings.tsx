import React, { useState, useEffect } from "react";
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
import { CategoryType } from "@/services/distributionService";
import { useLanguage } from "../../contexts/LanguageContext";
import { SupportedLanguage } from "../../constants/translations";
import { DistributionService } from "@/services/distributionService";
import { TCPSocketService } from "@/services/tcpSocketService";
import { DeviceDiscoveryPanel } from "../../components/DeviceDiscoveryPanel";
import { NetworkDevice } from "../../hooks/useDeviceDiscovery";

// KDS角色类型
enum KDSRole {
  MASTER = "master",
  SLAVE = "slave",
}

// 设置相关的常量
const STORAGE_KEY_COMPACT_CARDS_PER_ROW = "compact_cards_per_row";
const DEFAULT_COMPACT_CARDS_PER_ROW = "5";

export default function SettingsScreen() {
  const { language, t, changeLanguage } = useLanguage();
  const [ipAddress, setIpAddress] = useState<string>("获取中...");
  const [port, setPort] = useState<string>("4322"); // 默认端口
  const [loading, setLoading] = useState<boolean>(true);
  const [kdsRole, setKdsRole] = useState<KDSRole>(KDSRole.SLAVE); // 强制默认为Slave模式
  const [masterIP, setMasterIP] = useState<string>("");
  const [manualMasterIP, setManualMasterIP] = useState<string>("");
  /* Master模式功能已禁用
  const [newSubKdsIP, setNewSubKdsIP] = useState<string>("");
  const [subKdsList, setSubKdsList] = useState<
    { ip: string; name: string; category: CategoryType; status: 'connected' | 'disconnected' }[]
  >([]);
  */
  const [assignedCategory, setAssignedCategory] = useState<CategoryType>(
    CategoryType.DRINKS
  );
  const [kdsCategory, setKdsCategory] = useState<CategoryType>(
    CategoryType.ALL
  );
  const [showDeviceDiscovery, setShowDeviceDiscovery] = useState(false);
  const [deviceName, setDeviceName] = useState<string>("KDS:Device");
  const [editingDeviceName, setEditingDeviceName] = useState<string>("KDS:Device");

  // 添加Compact模式下每行卡片数量状态
  const [compactCardsPerRow, setCompactCardsPerRow] = useState<string>(
    DEFAULT_COMPACT_CARDS_PER_ROW
  );

  // TCP 连接状态管理
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  /* Master模式功能已禁用
  const [slaveConnectionStatuses, setSlaveConnectionStatuses] = useState<Map<string, 'connected' | 'disconnected'>>(new Map());
  */

  // 加载保存的设置
  useEffect(() => {
    async function loadSettings() {
      try {
        // 获取设备IP地址
        const ip = await Network.getIpAddressAsync();
        setIpAddress(ip || "未知IP地址");

        // 加载保存的设置
        const savedRole = await AsyncStorage.getItem("kds_role");
        if (savedRole) setKdsRole(savedRole as KDSRole);

        const savedPort = await AsyncStorage.getItem("kds_port");
        if (savedPort) setPort(savedPort);

        /* Master模式功能已禁用
        const savedMasterIP = await AsyncStorage.getItem("master_ip");
        if (savedMasterIP) setMasterIP(savedMasterIP);

        const savedSubKds = await AsyncStorage.getItem("sub_kds_list");
        if (savedSubKds) {
          const parsedList = JSON.parse(savedSubKds);
          setSubKdsList(parsedList);
          console.log('[Settings] 加载subKdsList:', parsedList);
        }
        */

        // 加载Compact模式每行卡片数量
        const savedCompactCardsPerRow = await AsyncStorage.getItem(
          STORAGE_KEY_COMPACT_CARDS_PER_ROW
        );
        if (savedCompactCardsPerRow) {
          setCompactCardsPerRow(savedCompactCardsPerRow);
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

        // 设置连接状态回调 - 监听TCP连接状态变化（Slave端）
        TCPSocketService.setConnectionStatusCallback((status) => {
          console.log('[Settings] 连接状态变化:', status);
          setConnectionStatus(status);
        });

        /* Master模式功能已禁用 - Slave连接状态回调
        // 只在Master模式下设置子设备连接状态回调
        const currentRole = savedRole || kdsRole;
        if (currentRole === 'master') {
          // 设置子设备连接状态回调 - Master端监听Slave的连接状态
          TCPSocketService.setSlaveConnectionStatusCallback((slaveIP, status, slaveName) => {
            console.log('[Settings] Slave连接状态变化:', slaveIP, status, slaveName);
            setSubKdsList((prevList) => {
              const updated = prevList.map((kds) => 
                kds.ip === slaveIP 
                  ? { ...kds, status: status, name: slaveName || kds.name }
                  : kds
              );
              console.log('[Settings] 更新subKdsList:', updated);
              return updated;
            });
          });
          console.log('[Settings] 已设置Master模式的Slave连接状态回调');
        } else {
          console.log('[Settings] Slave模式，不设置子设备连接状态回调');
        }
        */

        setLoading(false);
      } catch (error) {
        console.error("加载设置失败:", error);
        setLoading(false);
      }
    }

    loadSettings();
    
    // 清理函数（可选）
    return () => {
      // 可以在这里清理回调
    };
  }, [t]);

  // 保存设置
  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem("kds_role", kdsRole);
      await AsyncStorage.setItem("kds_port", port);
      /* Master模式功能已禁用
      await AsyncStorage.setItem("master_ip", masterIP);
      await AsyncStorage.setItem("sub_kds_list", JSON.stringify(subKdsList));
      */

      // 保存Compact模式每行卡片数量
      await AsyncStorage.setItem(
        STORAGE_KEY_COMPACT_CARDS_PER_ROW,
        compactCardsPerRow
      );

      // 如果是子KDS，同时保存分类设置
      if (kdsRole === KDSRole.SLAVE) {
        await AsyncStorage.setItem("kds_category", kdsCategory);
      }

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
  };

  // 处理从Device Discovery连接目标设备
  const handleConnectToDevice = async (device: NetworkDevice) => {
    console.log('[Settings] handleConnectToDevice被调用，设备:', device.name, device.ip);
    
    try {
      /* Master模式功能已禁用
      // 如果当前是Master，则目标设备设为Slave，并添加到子KDS列表
      if (kdsRole === KDSRole.MASTER) {
        console.log('[Settings] Master模式，显示确认对话框');
        
        // 检查IP是否已存在
        if (subKdsList.some((kds) => kds.ip === device.ip)) {
          console.log('[Settings] 设备已存在，跳过');
          Alert.alert("提示", "该设备已在子KDS列表中");
          setShowDeviceDiscovery(false);
          return;
        }

        // Master模式：提示Slave设备需要主动连接
        Alert.alert(
          t("connectToDevice"),
          `请在Slave设备 ${device.name} (${device.ip}) 上选择连接到本Master设备。\n\nMaster会自动接受连接。`,
          [
            {
              text: "确定",
              onPress: () => {
                console.log('[Settings] 用户了解，等待Slave主动连接');
                setShowDeviceDiscovery(false);
              },
              style: 'default',
            },
          ]
        );
      } else {
      */
        // 如果当前是Slave，则连接到Master KDS (在当前方案中，POS作为客户端连接到KDS)
        console.log('[Settings] Slave模式，连接到POS IP:', device.ip);
        
        Alert.alert(
          t("connectToDevice"),
          t("connectToMasterKDS"),
          [
            { text: t("cancel"), onPress: () => {
              console.log('[Settings] 用户取消连接到POS');
              setShowDeviceDiscovery(false);
            }, style: 'cancel' },
            {
              text: t("connect"),
              onPress: async () => {
                console.log('[Settings] 用户确认连接到POS，IP:', device.ip);
                setMasterIP(device.ip);
                
                try {
                  // 立即连接到POS/Master，不需要重启
                  console.log('[Settings] 开始连接到POS系统');
                  const connected = await TCPSocketService.connectToMaster(device.ip);
                  
                  if (connected) {
                    console.log('[Settings] 成功建立TCP连接到POS系统，等待心跳确认');
                    // 保存IP到本地存储
                    await AsyncStorage.setItem("master_ip", device.ip);
                    
                    // 关闭Device Discovery面板
                    setShowDeviceDiscovery(false);
                    
                    Alert.alert(
                      t("success"),
                      `${t("connectionEstablished")}\nPOS IP: ${device.ip}\n\n等待接收心跳以确认连接状态...`
                    );
                  } else {
                    console.log('[Settings] 连接到POS系统失败');
                    setMasterIP(""); // 重置IP
                    Alert.alert(t("error"), t("connectionFailed"));
                  }
                } catch (error: any) {
                  console.error('[Settings] 连接过程出错:', error);
                  setMasterIP(""); // 重置IP
                  Alert.alert(t("error"), `${t("connectionFailed")}: ${error.message}`);
                }
              },
              style: 'default',
            },
          ]
        );
      /* } */ // Master模式块结束
    } catch (error) {
      console.error('[Settings] handleConnectToDevice错误:', error);
      Alert.alert("错误", "连接设备失败");
    }
  };

  /* Master模式功能已禁用 - 添加和删除子KDS
  // 添加子KDS - 自动分配品类
  const addSubKds = async () => {
    if (!newSubKdsIP.trim()) {
      Alert.alert("错误", "请输入IP地址");
      return;
    }

    // 检查IP是否已存在
    if (subKdsList.some((kds) => kds.ip === newSubKdsIP)) {
      Alert.alert("错误", "此IP已添加");
      return;
    }

    // 自动分配品类 (轮流分配不同品类)
    const categories = [
      CategoryType.DRINKS,
      CategoryType.HOT_FOOD,
      CategoryType.COLD_FOOD,
      CategoryType.DESSERT,
    ];

    // 根据现有子KDS数量决定分配哪个品类
    const categoryIndex = subKdsList.length % categories.length;
    const assignedCategory = categories[categoryIndex];

    // 保存用户输入的原始IP地址，不进行转换
    const inputIP = newSubKdsIP;

    console.log(`添加子KDS，输入IP: ${inputIP}, 分配品类: ${assignedCategory}`);

    try {
      // 使用DistributionService添加子KDS，传递原始IP
      const success = await DistributionService.addSubKDS(
        inputIP,
        assignedCategory
      );

      if (success) {
        // 更新本地状态，使用原始输入的IP
        const newSubKdsList = [
          ...subKdsList,
          { ip: inputIP, name: inputIP, category: assignedCategory, status: 'disconnected' as const },
        ];
        setSubKdsList(newSubKdsList);
        setNewSubKdsIP(""); // 清空输入框
        
        // 保存到AsyncStorage（使用新的保存函数）
        await saveSubKdsListToStorage(newSubKdsList);
        
        Alert.alert("成功", `已添加子KDS: ${inputIP}`);
      } else {
        Alert.alert("错误", "添加子KDS失败");
      }
    } catch (error) {
      console.error("添加子KDS错误:", error);
      Alert.alert("错误", "添加子KDS时发生错误");
    }
  };

  // 删除子KDS
  const removeSubKds = async (ip: string) => {
    try {
      // 使用DistributionService移除子KDS
      const success = await DistributionService.removeSubKDS(ip);

      if (success) {
        // 更新本地状态
        const updatedList = subKdsList.filter((kds) => kds.ip !== ip);
        setSubKdsList(updatedList);
        
        // 保存到AsyncStorage（使用新的保存函数）
        await saveSubKdsListToStorage(updatedList);
      } else {
        Alert.alert("错误", "移除子KDS失败");
      }
    } catch (error) {
      console.error("移除子KDS错误:", error);
      Alert.alert("错误", "移除子KDS时发生错误");
    }
  };

  // 处理重新连接设备（在新方案中，Master不主动连接Slave）
  const handleReconnectDevice = async (kds: { ip: string; name: string; category: CategoryType; status: 'connected' | 'disconnected' }) => {
    try {
      console.log('[Settings] handleReconnectDevice被调用，设备:', kds.name, kds.ip);
      
      // 新方案：Master不主动连接，提示用户在Slave端操作
      Alert.alert(
        "重新连接提示",
        `要重新连接到 ${kds.name} (${kds.ip})，请在该Slave设备上重新连接到本Master设备。\n\nMaster会自动接受连接。`,
        [
          {
            text: "确定",
            onPress: () => {
              console.log('[Settings] 用户了解重连流程');
            },
            style: 'default',
          },
        ]
      );
    } catch (error) {
      console.error("[Settings] handleReconnectDevice错误:", error);
      Alert.alert("错误", "重新连接设备时发生错误");
    }
  };

  // 保存subKdsList到AsyncStorage
  const saveSubKdsListToStorage = async (list: typeof subKdsList) => {
    await AsyncStorage.setItem("sub_kds_list", JSON.stringify(list));
    console.log('[Settings] 保存subKdsList到AsyncStorage');
  };
  */

  const saveManualMasterIP = async () => {
    if (!manualMasterIP.trim()) {
      Alert.alert(t("error"), t("pleaseEnterIPAddress"));
      return;
    }

    try {
      console.log('[Settings] 开始手动连接到Master IP:', manualMasterIP);
      
      // 立即连接到Master，不需要重启
      const connected = await TCPSocketService.connectToMaster(manualMasterIP);
      
      if (connected) {
        console.log('[Settings] 成功连接到Master KDS');
        setMasterIP(manualMasterIP);
        // 保存IP到本地存储
        await AsyncStorage.setItem("master_ip", manualMasterIP);
        Alert.alert(t("success"), `${t("masterKDSIPAddress")} ${t("saved")}: ${manualMasterIP}`);
        setManualMasterIP(""); // Clear input field
      } else {
        console.log('[Settings] 连接到Master KDS失败');
        Alert.alert(t("error"), t("connectionFailed"));
      }
    } catch (error: any) {
      console.error('[Settings] 手动连接过程出错:', error);
      Alert.alert(t("error"), `${t("connectionFailed")}: ${error.message}`);
    }
  };

  // 获取品类显示名称
  const getCategoryDisplayName = (category: CategoryType) => {
    switch (category) {
      case CategoryType.DRINKS:
        return "饮料";
      case CategoryType.HOT_FOOD:
        return "热食";
      case CategoryType.COLD_FOOD:
        return "冷食";
      case CategoryType.DESSERT:
        return "甜点";
      case CategoryType.ALL:
        return "全部";
      default:
        return "未知";
    }
  };

  // 处理语言切换
  const handleLanguageChange = async (newLanguage: SupportedLanguage) => {
    await changeLanguage(newLanguage);
  };

  // 处理Compact模式每行卡片数量变更
  const handleCompactCardsPerRowChange = async (value: string) => {
    setCompactCardsPerRow(value);
    await AsyncStorage.setItem(STORAGE_KEY_COMPACT_CARDS_PER_ROW, value);
  };

  // 重置设置
  const resetSettings = () => {
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
  };

  // 保存KDS角色设置
  const saveKDSRole = async () => {
    try {
      await AsyncStorage.setItem("kds_role", kdsRole);
      await AsyncStorage.setItem("kds_port", port);
      await AsyncStorage.setItem("device_name", editingDeviceName);

      // 如果是子KDS，同时保存分类设置
      if (kdsRole === KDSRole.SLAVE) {
        await AsyncStorage.setItem("kds_category", kdsCategory);
        // 注意：master_ip 不再在这里保存，而是通过 handleConnectToDevice 或 saveManualMasterIP 单独管理
      }

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
      console.error("保存KDS角色失败:", error);
      Alert.alert(t("error"), t("saveSettingsFailed"));
    }
  };

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
        {/* Master模式功能已禁用 - 强制使用Slave模式
        <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  kdsRole === KDSRole.MASTER && styles.roleButtonActive,
                ]}
                onPress={() => setKdsRole(KDSRole.MASTER)}
              >
                <Text
                  style={
                    kdsRole === KDSRole.MASTER
                      ? styles.roleTextActive
                      : styles.roleText
                  }
                >
                  {t("masterKDS")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.roleButton,
                  kdsRole === KDSRole.SLAVE && styles.roleButtonActive,
                ]}
                onPress={() => setKdsRole(KDSRole.SLAVE)}
              >
                <Text
                  style={
                    kdsRole === KDSRole.SLAVE
                      ? styles.roleTextActive
                      : styles.roleText
                  }
                >
                  {t("subKDS")}
                </Text>
              </TouchableOpacity>
            </View>
        */}
        <Text style={styles.infoValue}>{t("slaveDevices")}</Text>
          </View>

        {kdsRole === KDSRole.SLAVE && (
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
                    label={getCategoryDisplayName(CategoryType.DRINKS)}
                    value={CategoryType.DRINKS}
                  />
                  <Picker.Item
                    label={getCategoryDisplayName(CategoryType.HOT_FOOD)}
                    value={CategoryType.HOT_FOOD}
                  />
                  <Picker.Item
                    label={getCategoryDisplayName(CategoryType.COLD_FOOD)}
                    value={CategoryType.COLD_FOOD}
                  />
                  <Picker.Item
                    label={getCategoryDisplayName(CategoryType.DESSERT)}
                    value={CategoryType.DESSERT}
                  />
                </Picker>
              </View>
          </View>
        )}

        <View>
            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 20, maxWidth: 200, alignSelf: "center" }]}
              onPress={saveKDSRole}
            >
              <Text style={styles.saveButtonText}>{t("saveSettings")}</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* ========== Slave 模式：独立的框 ========== */}
      {kdsRole === KDSRole.SLAVE && (
        <>
          {/* 第二个独立大框：POS System */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("deviceConnection")}</Text>

            {/* Master IP 地址 */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t("masterKDSIPAddress")}</Text>
              <Text style={styles.infoValue}>{masterIP || t("notSet")}</Text>
            </View>

            {/* 连接状态 */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t("connectionStatus")}</Text>
              <View style={styles.statusAndButtonContainer}>
                <View style={styles.statusBadge}>
                  <Ionicons 
                    name={connectionStatus === 'connected' ? 'checkmark-circle' : 'close-circle'} 
                    size={16} 
                    color={connectionStatus === 'connected' ? '#4CAF50' : '#d32f2f'} 
                  />
                  <Text style={[
                    styles.statusText,
                    connectionStatus === 'connected' 
                      ? styles.statusConnected 
                      : styles.statusDisconnected
                  ]}>
                    {connectionStatus === 'connected' 
                      ? t("connectionEstablished") 
                      : t("disconnected")}
                  </Text>
                </View>

                {masterIP && (
                  <TouchableOpacity 
                    style={styles.resetConnectionButton}
                    onPress={() => {
                      Alert.alert(
                        t("confirm"),
                        t("confirmResetMasterConnection"),
                        [
                          { 
                            text: t("cancel"), 
                            onPress: () => {
                              console.log('[Settings] 用户取消重置Master');
                            }, 
                            style: 'cancel' 
                          },
                          {
                            text: t("confirm"),
                            onPress: async () => {
                              console.log('[Settings] 重置Master连接');
                              try {
                                // 断开TCP连接
                                console.log('[Settings] 断开Master连接');
                                TCPSocketService.disconnect();
                                
                                // 清空Master IP
                                setMasterIP("");
                                await AsyncStorage.removeItem("master_ip");
                                
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
                    <Ionicons name="refresh-circle" size={18} color="white" />
                    <Text style={styles.resetConnectionButtonText}>{t("resetConnection")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* 手动添加 IP */}
            <View style={styles.addKdsContainer}>
              <TextInput
                style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                value={manualMasterIP}
                onChangeText={setManualMasterIP}
                placeholder={t("enterMasterKDSIPAddress")}
              />
              <TouchableOpacity style={styles.addButton} onPress={saveManualMasterIP}>
                <Text style={styles.addButtonText}>{t("save")}</Text>
              </TouchableOpacity>
            </View>
                      {/* Device Discovery 按钮 */}
            <TouchableOpacity
              style={styles.deviceDiscoveryButton}
              onPress={() => setShowDeviceDiscovery(true)}
            >
              <Text style={styles.deviceDiscoveryButtonText}>📡 {t("deviceDiscovery")}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ========== Master 模式功能已禁用 ==========
      {kdsRole === KDSRole.MASTER && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("deviceConnection")}</Text>
              <View style={styles.infoRowColumn}>
                <Text style={styles.infoLabel}>{t("subKDS")}</Text>
                {subKdsList.length > 0 ? (
                  subKdsList.map((kds, index) => (
                    <View key={index} style={styles.slaveDeviceItem}>
                      <View style={styles.slaveDeviceInfo}>
                        <Text style={styles.slaveDeviceName}>{kds.name}</Text>
                        <Text style={styles.slaveDeviceIP}>
                          IP: {kds.ip}
                        </Text>
                        <Text style={styles.slaveDeviceCategory}>
                          {t("kitchenCategory")}: {getCategoryDisplayName(kds.category)}
                        </Text>
                      </View>
                      
                      <View style={styles.slaveDeviceControls}>
                        {kds.status === 'disconnected' && (
                          <TouchableOpacity 
                            style={styles.reconnectButton}
                            onPress={() => handleReconnectDevice(kds)}
                          >
                            <Ionicons name="refresh" size={16} color="white" />
                            <Text style={styles.reconnectButtonText}>{t("reconnect") || "重新连接"}</Text>
                          </TouchableOpacity>
                        )}
                        
                        <View style={[
                          styles.statusBadge,
                          { 
                            backgroundColor: kds.status === 'connected' 
                              ? '#E8F5E9' 
                              : '#FFEBEE'
                          }
                        ]}>
                          <Ionicons 
                            name={
                              kds.status === 'connected' 
                                ? 'checkmark-circle' 
                                : 'close-circle'
                            } 
                            size={16} 
                            color={
                              kds.status === 'connected' 
                                ? '#4CAF50' 
                                : '#d32f2f'
                            } 
                          />
                          <Text style={[
                            styles.statusText,
                            kds.status === 'connected' 
                              ? styles.statusConnected 
                              : styles.statusDisconnected
                          ]}>
                            {kds.status === 'connected' 
                              ? t("connectionEstablished")
                              : t("disconnected")}
                          </Text>
                        </View>
                        
                        <TouchableOpacity 
                          style={styles.deleteButton}
                          onPress={() => removeSubKds(kds.ip)}
                        >
                          <Ionicons name="trash" size={16} color="white" />
                          <Text style={styles.deleteButtonText}>{t("delete") || "删除"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noItemsText}>{t("noSubKDS")}</Text>
                )}
              </View>
              <View>
            <Text style={styles.infoLabel}>{t("addSubKDS")}</Text>
            <View style={styles.addKdsContainer}>
              <TextInput
                style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                value={newSubKdsIP}
                onChangeText={setNewSubKdsIP}
                placeholder={t("enterSubKDSIPAddress")}
              />
              <TouchableOpacity style={styles.addButton} onPress={addSubKds}>
                <Text style={styles.addButtonText}>{t("add")}</Text>
              </TouchableOpacity>
            </View>
          </View>    
                        
            <TouchableOpacity
              style={styles.deviceDiscoveryButton}
              onPress={() => setShowDeviceDiscovery(true)}
            >
              <Text style={styles.deviceDiscoveryButtonText}>📡 {t("deviceDiscovery")}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      */}

      {/* 显示设置卡片 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("displaySettings")}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t("cardsPerRow")}:</Text>
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
          <Text style={styles.infoLabel}>{t("language")}:</Text>
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
      onSelectAsMaster={handleConnectToDevice}
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
  roleSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 5,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  roleButtonActive: {
    backgroundColor: "#007AFF",
  },
  roleText: {
    fontSize: 16,
    color: "#333",
  },
  roleTextActive: {
    fontSize: 16,
    color: "white",
    fontWeight: "bold",
  },
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
  subKdsItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  removeButton: {
    color: "red",
  },
  noItemsText: {
    fontSize: 16,
    color: "#999",
    marginTop: 8,
  },
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
  slaveDeviceItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#2196F3",
  },
  slaveDeviceInfo: {
    flex: 1,
  },
  slaveDeviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  slaveDeviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  slaveDeviceIP: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  slaveDeviceCategory: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  slaveDeviceControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  reconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  reconnectButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 11,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d32f2f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  deleteButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 11,
  },
  disconnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d32f2f",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    marginTop: 12,
  },
  disconnectButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
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
});

