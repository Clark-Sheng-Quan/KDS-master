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
  const [kdsRole, setKdsRole] = useState<KDSRole>(KDSRole.MASTER);
  const [masterIP, setMasterIP] = useState<string>("");
  const [manualMasterIP, setManualMasterIP] = useState<string>("");
  const [newSubKdsIP, setNewSubKdsIP] = useState<string>("");
  const [subKdsList, setSubKdsList] = useState<
    { ip: string; name: string; category: CategoryType; status: 'connected' | 'disconnected' | 'pending' }[]
  >([]);
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
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'pending'>('disconnected');
  const [slaveConnectionStatuses, setSlaveConnectionStatuses] = useState<Map<string, 'connected' | 'disconnected' | 'pending'>>(new Map());

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

        const savedMasterIP = await AsyncStorage.getItem("master_ip");
        if (savedMasterIP) setMasterIP(savedMasterIP);

        const savedSubKds = await AsyncStorage.getItem("sub_kds_list");
        if (savedSubKds) {
          // 加载子KDS列表，但将所有pending状态改为disconnected
          const parsedList = JSON.parse(savedSubKds);
          const fixedList = parsedList.map((kds: any) => ({
            ...kds,
            status: kds.status === 'pending' ? 'disconnected' : kds.status
          }));
          setSubKdsList(fixedList);
          console.log('[Settings] 加载subKdsList并修复pending状态:', fixedList);
        }

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

        // 设置 TCP 连接请求回调 - Slave 端接收 Master 连接请求时调用
        TCPSocketService.setConnectionRequestCallback(async (masterIP, masterName) => {
          return new Promise((resolve) => {
            Alert.alert(
              t("connectionRequest"),
              `${masterName} (${masterIP}) ${t("deviceRequestsConnection")}?`,
              [
                {
                  text: t("rejectConnection"),
                  onPress: () => resolve(false),
                  style: 'cancel'
                },
                {
                  text: t("acceptConnection"),
                  onPress: async () => {
                    // 保存主屏 IP
                    await AsyncStorage.setItem("master_ip", masterIP);
                    setMasterIP(masterIP);
                    resolve(true);
                  },
                  style: 'default'
                }
              ]
            );
          });
        });

        // 设置连接状态回调 - 监听TCP连接状态变化
        TCPSocketService.setConnectionStatusCallback((status) => {
          console.log('[Settings] 连接状态变化:', status);
          setConnectionStatus(status);
        });

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
      await AsyncStorage.setItem("master_ip", masterIP);
      await AsyncStorage.setItem("sub_kds_list", JSON.stringify(subKdsList));

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

        // 显示确认对话框
        Alert.alert(
          t("connectToDevice"),
          t("setAsSlaveKDS"),
          [
            { text: t("cancel"), onPress: () => {
              console.log('[Settings] 用户取消连接');
              setShowDeviceDiscovery(false);
            }, style: 'cancel' },
            {
              text: t("connect"),
              onPress: async () => {
                console.log('[Settings] 用户确认，开始连接流程');
                
                try {
                  // 获取本设备名称
                  const deviceName = await AsyncStorage.getItem("device_name") || "Master KDS";
                  console.log('[Settings] 本设备名称:', deviceName);
                  
                  // 发送连接请求到Slave
                  console.log('[Settings] 调用TCPSocketService.sendConnectionRequest，设备IP:', device.ip);
                  await TCPSocketService.sendConnectionRequest(device.ip, ipAddress || "0.0.0.0", deviceName, device.name);
                  console.log('[Settings] sendConnectionRequest已完成');
                  
                  // 自动分配品类
                  const categories = [
                    CategoryType.DRINKS,
                    CategoryType.HOT_FOOD,
                    CategoryType.COLD_FOOD,
                    CategoryType.DESSERT,
                  ];
                  const categoryIndex = subKdsList.length % categories.length;
                  const assignedCategory = categories[categoryIndex];

                  console.log('[Settings] 分配品类:', assignedCategory);

                  // 添加到子KDS列表（初始状态为pending，等待Slave确认）
                  const newSubKdsList = [
                    ...subKdsList,
                    { ip: device.ip, name: device.name, category: assignedCategory, status: 'pending' as const },
                  ];
                  console.log('[Settings] 更新subKdsList为pending状态');
                  setSubKdsList(newSubKdsList);

                  // 使用DistributionService添加子KDS
                  console.log('[Settings] 调用DistributionService.addSubKDS');
                  const success = await DistributionService.addSubKDS(
                    device.ip,
                    assignedCategory
                  );

                  if (!success) {
                    // 如果添加失败，回滚状态
                    console.log('[Settings] DistributionService.addSubKDS失败，回滚');
                    setSubKdsList(subKdsList);
                    Alert.alert("错误", "添加子KDS失败");
                    return;
                  }

                  // 保存到AsyncStorage
                  console.log('[Settings] 保存到AsyncStorage');
                  await saveSubKdsListToStorage(newSubKdsList);
                  
                  // 关闭Device Discovery面板
                  console.log('[Settings] 关闭Device Discovery面板');
                  setShowDeviceDiscovery(false);
                  
                  // 显示"已发送连接请求"提示
                  Alert.alert(
                    "已发送连接请求",
                    `连接请求已发送到 ${device.name} (${device.ip})\n等待设备响应中，最多等待 10 秒...`,
                    [
                      {
                        text: "确定",
                        onPress: () => {},
                        style: 'default'
                      }
                    ]
                  );
                } catch (err: any) {
                  console.error('[Settings] 连接流程错误:', err);
                  Alert.alert(t("failed"), `发送连接请求失败: ${err.message}`);
                }
              },
              style: 'default',
            },
          ]
        );
      } else {
        // 如果当前是Slave，则设置Master IP
        console.log('[Settings] Slave模式，设置Master IP');
        
        Alert.alert(
          t("connectToDevice"),
          t("connectToMasterKDS"),
          [
            { text: t("cancel"), onPress: () => {
              console.log('[Settings] 用户取消连接到Master');
              setShowDeviceDiscovery(false);
            }, style: 'cancel' },
            {
              text: t("connect"),
              onPress: async () => {
                console.log('[Settings] 用户确认连接到Master，IP:', device.ip);
                setMasterIP(device.ip);
                await AsyncStorage.setItem("master_ip", device.ip);
                
                // 关闭Device Discovery面板
                setShowDeviceDiscovery(false);
                
                Alert.alert(
                  "成功",
                  `已连接到Master\nMaster IP: ${device.ip}`
                );
              },
              style: 'default',
            },
          ]
        );
      }
    } catch (error) {
      console.error('[Settings] handleConnectToDevice错误:', error);
      Alert.alert("错误", "连接设备失败");
    }
  };

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

  // 处理重新连接设备
  const handleReconnectDevice = async (kds: { ip: string; name: string; category: CategoryType; status: 'connected' | 'disconnected' | 'pending' }) => {
    try {
      console.log('[Settings] handleReconnectDevice被调用，设备:', kds.name, kds.ip);
      
      // 显示确认对话框
      Alert.alert(
        t("reconnect"),
        `${t("confirmReconnect")} ${kds.name}?`,
        [
          { 
            text: t("cancel"), 
            onPress: () => {
              console.log('[Settings] 用户取消重新连接');
            }, 
            style: 'cancel' 
          },
          {
            text: t("confirm"),
            onPress: async () => {
              console.log('[Settings] 用户确认重新连接');
              
              try {
                // 将状态设置为pending
                console.log('[Settings] 将状态设置为pending');
                setSubKdsList((prevList) =>
                  prevList.map((item) =>
                    item.ip === kds.ip ? { ...item, status: 'pending' as const } : item
                  )
                );

                // 获取本设备名称
                const deviceName = await AsyncStorage.getItem("device_name") || "Master KDS";
                console.log('[Settings] 本设备名称:', deviceName);

                // 发送连接请求
                console.log('[Settings] 调用TCPSocketService.sendConnectionRequest');
                const success = await TCPSocketService.sendConnectionRequest(
                  kds.ip,
                  ipAddress,
                  deviceName,
                  kds.name
                );
                console.log('[Settings] sendConnectionRequest完成，结果:', success);

                if (!success) {
                  // 如果发送失败，设置为disconnected
                  console.log('[Settings] 发送连接请求失败，设置为disconnected');
                  setSubKdsList((prevList) =>
                    prevList.map((item) =>
                      item.ip === kds.ip ? { ...item, status: 'disconnected' as const } : item
                    )
                  );
                  Alert.alert("错误", "发送连接请求失败");
                }
              } catch (error) {
                console.error("[Settings] 重新连接流程错误:", error);
                setSubKdsList((prevList) =>
                  prevList.map((item) =>
                    item.ip === kds.ip ? { ...item, status: 'disconnected' as const } : item
                  )
                );
                Alert.alert("错误", "重新连接设备时发生错误");
              }
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

  // 保存subKdsList到AsyncStorage（确保pending状态变为disconnected）
  const saveSubKdsListToStorage = async (list: typeof subKdsList) => {
    // 保存时将pending改为disconnected
    const listToSave = list.map(kds => ({
      ...kds,
      status: kds.status === 'pending' ? 'disconnected' : kds.status
    }));
    await AsyncStorage.setItem("sub_kds_list", JSON.stringify(listToSave));
    console.log('[Settings] 保存subKdsList到AsyncStorage，修复pending状态');
  };

  const saveManualMasterIP = async () => {
    if (!manualMasterIP.trim()) {
      Alert.alert(t("error"), t("pleaseEnterIPAddress"));
      return;
    }
    setMasterIP(manualMasterIP);
    await AsyncStorage.setItem("master_ip", manualMasterIP);
    Alert.alert(t("success"), `${t("masterKDSIPAddress")} ${t("saved")}: ${manualMasterIP}`);
    setManualMasterIP(""); // Clear input field
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

      // 如果是子KDS，同时保存分类设置和Master IP
      if (kdsRole === KDSRole.SLAVE) {
        await AsyncStorage.setItem("kds_category", kdsCategory);
        await AsyncStorage.setItem("master_ip", masterIP);
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
        <Text style={styles.sectionTitle}>{t("kdsRole")}</Text>

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

        <TouchableOpacity
          style={styles.deviceDiscoveryButton}
          onPress={() => setShowDeviceDiscovery(true)}
        >
          <Text style={styles.deviceDiscoveryButtonText}>📡 {t("deviceDiscovery")}</Text>
        </TouchableOpacity>

        {kdsRole === KDSRole.SLAVE && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("masterDevice")}</Text>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("masterKDSIPAddress")}</Text>
                <Text style={styles.infoValue}>{masterIP || t("notSet")}</Text>
              </View>

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
                                console.log('[Settings] 重置Master KDS');
                                setMasterIP("");
                                await AsyncStorage.removeItem("master_ip");
                                Alert.alert(t("success"), t("masterConnectionReset"));
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
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("addMasterKDSIPAddressManually")}</Text>
              <View style={styles.addKdsContainer}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginRight: 10 }]}
                  value={manualMasterIP}
                  onChangeText={setManualMasterIP}
                  placeholder={t("enterMasterKDSIPAddress")}
                />
                <TouchableOpacity style={styles.addButton} onPress={saveManualMasterIP}>
                  <Text style={styles.addButtonText}>{t("saveMasterKDSIP")}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Slave KDS {t("productCategory")}</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={kdsCategory}
                  style={styles.textPicker}
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
          </>
        )}

        {kdsRole === KDSRole.MASTER && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("slaveDevices")}</Text>
              
              {subKdsList.length > 0 ? (
                subKdsList.map((kds, index) => (
                  <View key={index} style={styles.slaveDeviceItem}>
                    <View style={styles.slaveDeviceInfo}>
                      <Text style={styles.slaveDeviceName}>{kds.name}</Text>
                      <Text style={styles.slaveDeviceIP}>
                        IP: {kds.ip}
                      </Text>
                      <Text style={styles.slaveDeviceCategory}>
                        {t("productCategory")}: {getCategoryDisplayName(kds.category)}
                      </Text>
                    </View>
                    
                    <View style={styles.slaveDeviceControls}>
                      {(kds.status === 'disconnected' || kds.status === 'pending') && (
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
                            : kds.status === 'pending'
                            ? '#FFF3E0'
                            : '#FFEBEE'
                        }
                      ]}>
                        <Ionicons 
                          name={
                            kds.status === 'connected' 
                              ? 'checkmark-circle' 
                              : kds.status === 'pending'
                              ? 'hourglass'
                              : 'close-circle'
                          } 
                          size={16} 
                          color={
                            kds.status === 'connected' 
                              ? '#4CAF50' 
                              : kds.status === 'pending'
                              ? '#FF9800'
                              : '#d32f2f'
                          } 
                        />
                        <Text style={[
                          styles.statusText,
                          kds.status === 'connected' 
                            ? styles.statusConnected 
                            : kds.status === 'pending'
                            ? styles.statusPending
                            : styles.statusDisconnected
                        ]}>
                          {kds.status === 'connected' 
                            ? t("connectionEstablished")
                            : kds.status === 'pending'
                            ? t("connectionPending")
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

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t("addSubKDS")}</Text>
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
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, { marginTop: 20, maxWidth: 200, alignSelf: "center" }]}
          onPress={saveKDSRole}
        >
          <Text style={styles.saveButtonText}>{t("saveSettings")}</Text>
        </TouchableOpacity>
      </View>

      {/* 显示设置卡片 */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t("displaySettings")}</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>{t("cardsPerRow")}:</Text>
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

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>{t("language")}:</Text>
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
    marginTop: 8,
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
  statusPending: {
    color: "#FF9800",
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
});

