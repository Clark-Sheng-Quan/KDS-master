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
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, CARD_TITLE_FONT_SIZES, ITEM_OPTION_FONT_SIZES } from "../../constants/theme";
import Constants from "expo-constants";
import * as Network from "expo-network";
import * as ScreenOrientationModule from "expo-screen-orientation";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../../contexts/LanguageContext";
import { SupportedLanguage } from "../../constants/translations";
import { settingsListener } from "@/services/settingsListener";
import { TCPSocketService } from "@/services/tcpSocketService";
import { CallingScreenDiscoveryPanel } from "../../components/CallingScreenDiscoveryPanel";
import { CategoryColorPanel } from "../../components/CategoryColorPanel";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { CallingScreenDevice, callingScreenService } from "@/services/CallingScreenService";
import { callingScreenDiscovery } from "@/services/CallingScreenDiscovery";
import { OrderService } from "@/services/orderService/OrderService";

// 设置相关的常量
const STORAGE_KEY_CARDS_PER_ROW = "cards_per_row";
const DEFAULT_CARDS_PER_ROW = 5;
const STORAGE_KEY_CARDS_PER_COLUMN = "cards_per_column";
const DEFAULT_CARDS_PER_COLUMN = 1.75;
const STORAGE_KEY_SHOW_PRINT_BUTTON = "show_print_button";
const STORAGE_KEY_SHOW_ORDER_TIMER = "show_order_timer";
const STORAGE_KEY_ITEM_LEVEL_COMPLETION = "item_level_completion";
const STORAGE_KEY_CALLING_BUTTON = "calling_button";

// Font size constants
const STORAGE_KEY_CARD_TITLE_FONT_SIZE = "card_title_font_size";
const DEFAULT_CARD_TITLE_FONT_SIZE = "medium"; // small, medium, large
const STORAGE_KEY_ITEM_OPTION_FONT_SIZE = "item_option_font_size";
const DEFAULT_ITEM_OPTION_FONT_SIZE = "small"; // small, medium, large

export default function SettingsScreen() {
  const { language, t, changeLanguage } = useLanguage();
  const navigation = useNavigation();
  const appVersion = Constants.expoConfig?.version || "unknown";
  const [ipAddress, setIpAddress] = useState<string>("获取中...");
  const [port, setPort] = useState<string>("8080"); // 默认端口
  const [loading, setLoading] = useState<boolean>(true);
  const [showCallingScreenDiscovery, setShowCallingScreenDiscovery] = useState(false);
  const [connectedCallingScreen, setConnectedCallingScreen] = useState<CallingScreenDevice | null>(null);
  const [deviceName, setDeviceName] = useState<string>("获取中...");

  // 添加每行卡片数量状态
  const [cardsPerRow, setCardsPerRow] = useState<number>(5);

  // 添加垂直卡片数量状态
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(2);

  // 添加显示打印按钮开关状态
  const [showPrintButton, setShowPrintButton] = useState<boolean>(true);

  // 添加显示计时器开关状态
  const [showOrderTimer, setShowOrderTimer] = useState<boolean>(true);

  // 添加项目级完成模式状态
  const [enableItemLevelCompletion, setEnableItemLevelCompletion] = useState<boolean>(true);

  // TCP 连接状态管理
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [connectedDevices, setConnectedDevices] = useState<Array<{ ip: string; port: number; deviceName: string; status: 'connected' | 'disconnected' }>>([]);

  // 屏幕方向状态 - 从 SideMenu 的 switch 按键控制，初始值为 landscape
  const [screenOrientation, setScreenOrientation] = useState<"landscape" | "portrait">("landscape");

  // 添加 Calling Button 开关状态
  const [enableCallingButton, setEnableCallingButton] = useState<boolean>(false);

  // 分类颜色管理状态
  const [showCategoryColorPanel, setShowCategoryColorPanel] = useState(false);

  // 字体大小设置
  const [cardTitleFontSize, setCardTitleFontSize] = useState<"small" | "medium" | "large">("medium");
  const [itemOptionFontSize, setItemOptionFontSize] = useState<"small" | "medium" | "large">("medium");

  // 加载保存的设置
  useEffect(() => {
    async function loadSettings() {
      try {
        // 获取设备IP地址
        const ip = await Network.getIpAddressAsync();
        setIpAddress(ip || "未知IP地址");

        // 获取真实设备名（从原生模块或本地计算）
        try {
          if (Platform.OS === "android") {
            const androidId = await NativeModules.DeviceDiscoveryModule?.getAndroidId?.();
            if (androidId) {
              const shortId = androidId.length >= 4 ? androidId.substring(androidId.length - 4) : androidId;
              const realDeviceName = `KDS:${shortId}`;
              setDeviceName(realDeviceName);
            }
          }
        } catch (error) {
          console.warn("无法从原生模块获取设备名:", error);
          // 降级方案：显示获取中...
          setDeviceName("获取失败");
        }

        const savedPort = await AsyncStorage.getItem("kds_port");
        if (savedPort) setPort(savedPort);

        // 加载卡片数量设置
        const savedCardsPerRow = await AsyncStorage.getItem(
          STORAGE_KEY_CARDS_PER_ROW
        );
        if (savedCardsPerRow) {
          setCardsPerRow(parseInt(savedCardsPerRow));
        }

        const savedCardsPerColumn = await AsyncStorage.getItem(
          STORAGE_KEY_CARDS_PER_COLUMN
        );
        if (savedCardsPerColumn) {
          setCardsPerColumn(parseFloat(savedCardsPerColumn));
        }

        // 加载打印按钮显示设置
        const savedShowPrintButton = await AsyncStorage.getItem(
          STORAGE_KEY_SHOW_PRINT_BUTTON
        );
        if (savedShowPrintButton !== null) {
          setShowPrintButton(savedShowPrintButton === "true");
        }

        // 加载计时器显示设置
        const savedShowOrderTimer = await AsyncStorage.getItem(
          STORAGE_KEY_SHOW_ORDER_TIMER
        );
        if (savedShowOrderTimer !== null) {
          setShowOrderTimer(savedShowOrderTimer === "true");
        }

        // 加载项目级完成模式设置
        const savedItemLevelCompletion = await AsyncStorage.getItem(
          STORAGE_KEY_ITEM_LEVEL_COMPLETION
        );
        if (savedItemLevelCompletion !== null) {
          setEnableItemLevelCompletion(savedItemLevelCompletion === "true");
        }

        // 加载 Calling Button 设置
        const savedCallingButton = await AsyncStorage.getItem(
          STORAGE_KEY_CALLING_BUTTON
        );
        if (savedCallingButton !== null) {
          setEnableCallingButton(savedCallingButton === "true");
        }

        // 加载卡片标题字体大小设置
        const savedCardTitleFontSize = await AsyncStorage.getItem(
          STORAGE_KEY_CARD_TITLE_FONT_SIZE
        );
        if (savedCardTitleFontSize) {
          setCardTitleFontSize(savedCardTitleFontSize as "small" | "medium" | "large");
        }

        // 加载项目选项字体大小设置
        const savedItemOptionFontSize = await AsyncStorage.getItem(
          STORAGE_KEY_ITEM_OPTION_FONT_SIZE
        );
        if (savedItemOptionFontSize) {
          setItemOptionFontSize(savedItemOptionFontSize as "small" | "medium" | "large");
        }

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

  // 监听页面获得焦点时重新加载 screenOrientation（来自 SideMenu 的改变）
  useFocusEffect(
    useCallback(() => {
      const loadOrientationAndApplySettings = async () => {
        try {
          const savedOrientation = await AsyncStorage.getItem("screenOrientation");
          if (savedOrientation === "portrait" || savedOrientation === "landscape") {
            setScreenOrientation(savedOrientation);
          }
        } catch (error) {
          console.error("加载屏幕方向失败:", error);
        }
      };

      loadOrientationAndApplySettings();
    }, [])
  );  
  // 使用定时器定期检查连接状态（避免设置回调冲突）
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentStatus = TCPSocketService.getConnectionStatus();
      const devices = TCPSocketService.getConnectedPOSDevices();
      
      setConnectionStatus(currentStatus);
      setConnectedDevices(devices);
    }, 10000); // 每10秒检查一次

    return () => clearInterval(intervalId);
  }, []);

  // 监听 Calling Screen 连接状态变化，自动更新 Calling Button 状态
  useEffect(() => {
    const updateCallingButtonState = async () => {
      if (connectedCallingScreen) {
        // 如果 Calling Screen 已连接，自动启用 Calling Button
        if (!enableCallingButton) {
          setEnableCallingButton(true);
          await AsyncStorage.setItem(STORAGE_KEY_CALLING_BUTTON, "true");
          settingsListener.emitSettingChange('calling_button', true);
          console.log('[Settings] Calling Screen connected - Calling Button automatically enabled');
        }
      } else {
        // 如果 Calling Screen 已断开，自动禁用 Calling Button
        if (enableCallingButton) {
          setEnableCallingButton(false);
          await AsyncStorage.setItem(STORAGE_KEY_CALLING_BUTTON, "false");
          settingsListener.emitSettingChange('calling_button', false);
          console.log('[Settings] Calling Screen disconnected - Calling Button automatically disabled');
        }
      }
    };

    updateCallingButtonState();
  }, [connectedCallingScreen]);

  // 监听 Calling Screen 连接，同步已有订单到 Calling Screen
  useEffect(() => {
    const syncOrdersToCallingScreen = async () => {
      if (connectedCallingScreen) {
        try {
          console.log('[Settings] Calling Screen connected - Syncing existing orders');
          
          // 获取所有当前订单（合并网络订单和TCP订单）
          const allOrders = await OrderService.getAllOrders();
          
          if (allOrders && allOrders.length > 0) {
            console.log(`[Settings] Found ${allOrders.length} orders to sync`);
            
            // 逐个发送订单通知
            for (const order of allOrders) {
              try {
                const orderNumber = String(order.num);
                const itemCount = order.products?.reduce((total, item) => total + (item.quantity || 1), 0) || 0;
                
                await callingScreenService.notifyOrderAdded(
                  connectedCallingScreen,
                  order._id,
                  orderNumber,
                  itemCount,
                  order.tableNumber
                );
                
                console.log(`[Settings] Synced order ${orderNumber} to Calling Screen`);
              } catch (error) {
                console.warn(`[Settings] Failed to sync order ${order.id}:`, error);
              }
            }
            
            console.log(`[Settings] Finished syncing ${allOrders.length} orders`);
          } else {
            console.log('[Settings] No orders to sync');
          }
        } catch (error) {
          console.error('[Settings] Error syncing orders to Calling Screen:', error);
        }
      }
    };

    // 仅在 connectedCallingScreen 从 null 变为有值时同步
    if (connectedCallingScreen) {
      syncOrdersToCallingScreen();
    }
  }, [connectedCallingScreen]);
  // 处理屏幕方向切换
  const handleToggleScreenOrientation = useCallback(async () => {
    try {
      const newOrientation = screenOrientation === "portrait" ? "landscape" : "portrait";
      
      // 使用 ScreenOrientationModule 改变屏幕方向
      if (newOrientation === "landscape") {
        await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.PORTRAIT);
      }
      
      setScreenOrientation(newOrientation);
      
      // 保存屏幕方向到 AsyncStorage
      console.log("保存屏幕方向到 AsyncStorage:", newOrientation);
      await AsyncStorage.setItem("screenOrientation", newOrientation);
      
      // 根据新方向立即设置卡片默认值并保存
      if (newOrientation === "landscape") {
        console.log("Landscape 模式：保存卡片设置 cardsPerRow=5, cardsPerColumn=1.5");
        setCardsPerRow(5);
        setCardsPerColumn(1.5);
        await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_ROW, "5");
        await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_COLUMN, "1.5");
      } else {
        console.log("Portrait 模式：保存卡片设置 cardsPerRow=4, cardsPerColumn=3.5");
        setCardsPerRow(4);
        setCardsPerColumn(3.5);
        await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_ROW, "4");
        await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_COLUMN, "3.5");
      }
    } catch (error) {
      console.error("无法切换屏幕方向:", error);
      Alert.alert("Error", "Failed to switch orientation");
    }
  }, [screenOrientation]);

  // 处理语言切换
  const handleLanguageChange = useCallback(async (newLanguage: SupportedLanguage) => {
    await changeLanguage(newLanguage);
  }, [changeLanguage]);

  // 处理每行卡片数量变更
  const handleCardsPerRowChange = useCallback(async (value: number) => {
    setCardsPerRow(value);
    await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_ROW, value.toString());
    settingsListener.emitSettingChange('cards_per_row', value);
  }, []);

  // 处理垂直卡片数量变更
  const handleCardsPerColumnChange = useCallback(async (value: number) => {
    setCardsPerColumn(value);
    await AsyncStorage.setItem(STORAGE_KEY_CARDS_PER_COLUMN, value.toString());
    settingsListener.emitSettingChange('cards_per_column', value);
  }, []);

  // 处理打印按钮显示开关
  const handleShowPrintButtonChange = useCallback(async (value: boolean) => {
    setShowPrintButton(value);
    await AsyncStorage.setItem(STORAGE_KEY_SHOW_PRINT_BUTTON, value.toString());
    
    // 发出设置变化事件，使 PrintButton 组件即时响应
    settingsListener.emitSettingChange('show_print_button', value);
    console.log('[Settings] 发出 show_print_button 设置变化事件，值:', value);
  }, []);

  // 处理计时器显示开关
  const handleShowOrderTimerChange = useCallback(async (value: boolean) => {
    setShowOrderTimer(value);
    await AsyncStorage.setItem(STORAGE_KEY_SHOW_ORDER_TIMER, value.toString());

    // 发出设置变化事件，使 OrderTimer 组件即时响应
    settingsListener.emitSettingChange('show_order_timer', value);
    console.log('[Settings] 发出 show_order_timer 设置变化事件，值:', value);
  }, []);

  // Handle card title font size change
  const handleCardTitleFontSizeChange = useCallback(async (value: "small" | "medium" | "large") => {
    setCardTitleFontSize(value);
    await AsyncStorage.setItem(STORAGE_KEY_CARD_TITLE_FONT_SIZE, value);
    
    // Emit settings change event for OrderCard to update
    settingsListener.emitSettingChange('card_title_font_size', value);
    console.log('[Settings] Card title font size changed to:', value);
  }, []);

  // Handle item/option font size change
  const handleItemOptionFontSizeChange = useCallback(async (value: "small" | "medium" | "large") => {
    setItemOptionFontSize(value);
    await AsyncStorage.setItem(STORAGE_KEY_ITEM_OPTION_FONT_SIZE, value);
    
    // Emit settings change event for OrderCard to update
    settingsListener.emitSettingChange('item_option_font_size', value);
    console.log('[Settings] Item/Option font size changed to:', value);
  }, []);

  // 处理项目级完成模式开关
  const handleItemLevelCompletionChange = useCallback(async (value: boolean) => {
    setEnableItemLevelCompletion(value);
    await AsyncStorage.setItem(STORAGE_KEY_ITEM_LEVEL_COMPLETION, value.toString());
    
    // 发出设置变化事件
    settingsListener.emitSettingChange('item_level_completion', value);
    console.log('[Settings] 发出 item_level_completion 设置变化事件，值:', value);
  }, []);

  // 处理 Calling Button 开关
  const handleCallingButtonChange = useCallback(async (value: boolean) => {
    setEnableCallingButton(value);
    await AsyncStorage.setItem(STORAGE_KEY_CALLING_BUTTON, value.toString());
    
    // 发出设置变化事件
    settingsListener.emitSettingChange('calling_button', value);
    console.log('[Settings] 发出 calling_button 设置变化事件，值:', value);
  }, []);

  // 重置设置
  // const resetSettings = useCallback(() => {
  //   Alert.alert(t("resetSettings"), t("confirmReset"), [
  //     {
  //       text: t("cancel"),
  //       style: "cancel",
  //     },
  //     {
  //       text: t("confirm"),
  //       onPress: async () => {
  //         // 重置为英文
  //         await changeLanguage("en");
  //         // 重置其他设置
  //         await AsyncStorage.removeItem("viewMode");
  //         // 重置每行卡片数量
  //         await AsyncStorage.setItem(
  //           STORAGE_KEY_CARDS_PER_ROW,
  //           DEFAULT_CARDS_PER_ROW.toString()
  //         );
  //         setCardsPerRow(DEFAULT_CARDS_PER_ROW);
  //         // 可以添加其他需要重置的设置
  //       },
  //     },
  //   ]);
  // }, [t, changeLanguage]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#333" />
      </View>
    );
  }

  return (
    <View style={styles.settingsContainer}>
      {/* 返回按钮 - 右上角 (仅当没有显示模态面板时) */}
      {!showCallingScreenDiscovery && !showCategoryColorPanel && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={32} color="white" />
        </TouchableOpacity>
      )}

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
            <Text style={styles.infoValue}>8080</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("deviceName")}</Text>
            <Text style={styles.infoValue}>{deviceName}</Text>
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
              <Ionicons name="cloud-offline" size={24} color="#999" />
              <Text style={styles.noConnectionsText}>{t("noConnections")}</Text>
            </View>
          )}
        </View>

        {/* ========== Calling Screen Connection ========== */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("callingScreen")}</Text>

          {connectedCallingScreen ? (
            <View style={styles.callingScreenConnectedContainer}>
              <View style={styles.callingScreenInfo}>
                <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                <View style={styles.callingScreenInfoText}>
                  <Text style={styles.callingScreenDeviceName}>{connectedCallingScreen.name}</Text>
                  <Text style={styles.callingScreenDeviceIP}>
                    {connectedCallingScreen.ip}:{connectedCallingScreen.port}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.disconnectCallingScreenButton}
                onPress={() => {
                  Alert.alert(
                    t("confirm"),
                    `Disconnect from ${connectedCallingScreen.name}?`,
                    [
                      { 
                        text: t("cancel"), 
                        style: 'cancel' 
                      },
                      {
                        text: t("confirm"),
                        onPress: () => {
                          setConnectedCallingScreen(null);
                          callingScreenDiscovery.clearCache();
                          console.log('[Settings] Disconnected from Calling Screen');
                        },
                        style: 'destructive',
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="close-circle" size={18} color="white" />
                <Text style={styles.disconnectButtonText}>{t("disconnect")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.noCallingScreenContainer}>
              <Ionicons name="cloud-offline" size={24} color="#999" />
              <Text style={styles.noCallingScreenText}>{t("noCallingScreenConnected")}</Text>
            </View>
          )}

          {/* Calling Screen Discovery 按钮 */}
          <TouchableOpacity
            style={styles.deviceDiscoveryButton}
            onPress={() => setShowCallingScreenDiscovery(true)}
          >
            <Text style={styles.deviceDiscoveryButtonText}>📡 {t("discoverCallingScreen")}</Text>
          </TouchableOpacity>

          {/* Calling Button 开关 */}
          <View style={[styles.infoRow, styles.callingButtonRow]}>
            <Text style={styles.infoLabel}>{t("showCallingButton")}</Text>
            <TouchableOpacity
              style={[styles.switchButton, enableCallingButton && styles.switchButtonActive]}
              onPress={() => handleCallingButtonChange(!enableCallingButton)}
            >
              <View style={[styles.switchThumb, enableCallingButton && styles.switchThumbActive]} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 分类颜色管理卡片 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("productCategoryColors")}</Text>

          {/* 分类颜色管理按钮 */}
          <TouchableOpacity
            style={styles.deviceDiscoveryButton}
            onPress={() => setShowCategoryColorPanel(true)}
          >
            <Text style={styles.deviceDiscoveryButtonText}>🎨 {t("manageCategoryColors")}</Text>
          </TouchableOpacity>
        </View>

        {/* 显示设置卡片 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("displaySettings")}</Text>

          {/* 屏幕方向切换 */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("screenOrientation")}</Text>
            <View style={styles.orientationModeContainer}>
              <TouchableOpacity
                style={[
                  styles.orientationModeButton,
                  screenOrientation === "landscape" && styles.orientationModeButtonActive
                ]}
                onPress={() => handleToggleScreenOrientation()}
              >
                <Ionicons
                  name="phone-landscape"
                  size={18}
                  color={screenOrientation === "landscape" ? "white" : "#333"}
                />
                <Text style={[
                  styles.orientationModeButtonText,
                  screenOrientation === "landscape" && styles.orientationModeButtonTextActive
                ]}>
                  {t("landscape")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.orientationModeButton,
                  screenOrientation === "portrait" && styles.orientationModeButtonActive
                ]}
                onPress={() => handleToggleScreenOrientation()}
              >
                <Ionicons
                  name="phone-portrait"
                  size={18}
                  color={screenOrientation === "portrait" ? "white" : "#333"}
                />
                <Text style={[
                  styles.orientationModeButtonText,
                  screenOrientation === "portrait" && styles.orientationModeButtonTextActive
                ]}>
                  {t("portrait")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("orderCompletionMode")}</Text>
            <View style={styles.completionModeContainer}>
              <TouchableOpacity
                style={[
                  styles.completionModeButton,
                  !enableItemLevelCompletion && styles.completionModeButtonActive
                ]}
                onPress={() => handleItemLevelCompletionChange(false)}
              >
                <Ionicons
                  name="receipt"
                  size={18}
                  color={!enableItemLevelCompletion ? "white" : "#333"}
                />
                <Text style={[
                  styles.completionModeButtonText,
                  !enableItemLevelCompletion && styles.completionModeButtonTextActive
                ]}>
                  {t("fullOrder")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.completionModeButton,
                  enableItemLevelCompletion && styles.completionModeButtonActive
                ]}
                onPress={() => handleItemLevelCompletionChange(true)}
              >
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={enableItemLevelCompletion ? "white" : "#333"}
                />
                <Text style={[
                  styles.completionModeButtonText,
                  enableItemLevelCompletion && styles.completionModeButtonTextActive
                ]}>
                  {t("itemLevel")}
                </Text>
              </TouchableOpacity>
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
            <Text style={styles.infoLabel}>{t("cardsPerRow")}</Text>
            <View style={styles.pickerContainer}>
              {screenOrientation === "landscape" && (
                <Picker
                  selectedValue={cardsPerRow || 5}
                  style={styles.textPicker}
                  onValueChange={handleCardsPerRowChange}
                  dropdownIconColor="#666"
                >
                  <Picker.Item label={t("small")} value={6} />
                  <Picker.Item label={t("medium")} value={5} />
                  <Picker.Item label={t("large")} value={4} />
                </Picker>
              )}
              {screenOrientation === "portrait" && (
                <Picker
                  selectedValue={cardsPerRow || 4}
                  style={styles.textPicker}
                  onValueChange={handleCardsPerRowChange}
                  dropdownIconColor="#666"
                >
                  <Picker.Item label={t("small")} value={5} />
                  <Picker.Item label={t("medium")} value={4} />
                  <Picker.Item label={t("large")} value={3} />
                </Picker>
              )}
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("cardsPerColumn")}</Text>
            <View style={styles.pickerContainer}>
              {screenOrientation === "landscape" && (
                <Picker
                  selectedValue={cardsPerColumn || 2}
                  style={styles.textPicker}
                  onValueChange={handleCardsPerColumnChange}
                  dropdownIconColor="#666"
                >
                  <Picker.Item label={t("small")} value={2.25} />
                  <Picker.Item label={t("medium")} value={2} />
                  <Picker.Item label={t("large")} value={1.75} />
                </Picker>
              )}
              {screenOrientation === "portrait" && (
                <Picker
                  selectedValue={cardsPerColumn || 3.5}
                  style={styles.textPicker}
                  onValueChange={handleCardsPerColumnChange}
                  dropdownIconColor="#666"
                >
                  <Picker.Item label={t("small")} value={3.75} />
                  <Picker.Item label={t("medium")} value={3.5} />
                  <Picker.Item label={t("large")} value={3.25} />
                </Picker>
              )}
            </View>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("showPrintButton")}</Text>
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

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("showOrderTimer")}</Text>
            <TouchableOpacity
              style={[
                styles.switchButton,
                showOrderTimer && styles.switchButtonActive
              ]}
              onPress={() => handleShowOrderTimerChange(!showOrderTimer)}
            >
              <View style={[
                styles.switchThumb,
                showOrderTimer && styles.switchThumbActive
              ]} />
            </TouchableOpacity>
          </View>

          {/* Card Title Font Size */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("cardTitleSize")}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={cardTitleFontSize || "medium"}
                style={styles.textPicker}
                onValueChange={handleCardTitleFontSizeChange}
                dropdownIconColor="#666"
              >
                <Picker.Item label={t("small")} value="small" />
                <Picker.Item label={t("medium")} value="medium" />
                <Picker.Item label={t("large")} value="large" />
              </Picker>
            </View>
          </View>

          {/* Item/Option Font Size */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t("itemOptionSize")}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={itemOptionFontSize || "medium"}
                style={styles.textPicker}
                onValueChange={handleItemOptionFontSizeChange}
                dropdownIconColor="#666"
              >
                <Picker.Item label={t("small")} value="small" />
                <Picker.Item label={t("medium")} value="medium" />
                <Picker.Item label={t("large")} value="large" />
              </Picker>
            </View>
          </View>
        </View>

        {/* <TouchableOpacity style={styles.resetButton} onPress={resetSettings}>
          <Text style={styles.resetButtonText}>{t("resetSettings")}</Text>
        </TouchableOpacity> */}
        
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("systemInfo")}</Text>
          <Text style={styles.infoText}>{t("systemVersion")}: {appVersion}</Text>
          <Text style={styles.infoText}>{t("copyright")}</Text>
        </View>
      </ScrollView>

      <CallingScreenDiscoveryPanel
        visible={showCallingScreenDiscovery}
        onClose={() => setShowCallingScreenDiscovery(false)}
        onSelectDevice={(device) => {
          console.log('[Settings] Selected Calling Screen:', device);
          setConnectedCallingScreen(device);
        }}
      />

      <CategoryColorPanel
        visible={showCategoryColorPanel}
        onClose={() => setShowCategoryColorPanel(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  settingsContainer: {
    flex: 1,
    backgroundColor: "#fff",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 10,
    backgroundColor: "#d32f2f",
    borderRadius: 30,
    width: 56,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
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
    marginVertical: 10,
    minHeight: 65,
  },
  infoRowColumn: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    alignItems: "flex-start",
    gap: 10,
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
    flexDirection: "row",
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noConnectionsText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  orientationModeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  orientationModeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  orientationModeButtonActive: {
    backgroundColor: "#2196F3",
  },
  orientationModeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  orientationModeButtonTextActive: {
    color: "white",
  },
  orientationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  orientationButtonIcon: {
    marginRight: 4,
  },
  orientationButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  completionModeContainer: {
    flexDirection: "row",
    gap: 8,
  },
  completionModeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    minWidth: 100,
    flexDirection: "row",
    gap: 8,
  },
  completionModeButtonActive: {
    backgroundColor: "#2196F3",
  },
  completionModeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  completionModeButtonTextActive: {
    color: "white",
  },
  callingButtonRow: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 10,
  },
  callingScreenConnectedContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 8,
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  callingScreenInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  callingScreenInfoText: {
    flexDirection: "column",
    gap: 4,
  },
  callingScreenDeviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  callingScreenDeviceIP: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  disconnectCallingScreenButton: {
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
  noCallingScreenContainer: {
    flexDirection: "row",
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  noCallingScreenText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
});

