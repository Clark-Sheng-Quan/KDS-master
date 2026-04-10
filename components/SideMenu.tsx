import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  Dimensions,
  Animated,
  LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../utils/auth";
import { useLanguage } from "../contexts/LanguageContext";
import { useOrders } from "../contexts/OrderContext";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { settingsListener } from "../services/settingsListener";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { networkStatus } = useOrders();
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [selectedScreenOrientation, setSelectedScreenOrientation] = useState<"landscape" | "portrait">("landscape");
  const [topFixedHeight, setTopFixedHeight] = useState(0);
  const { width, height } = Dimensions.get("window");

  // 加载店铺信息
  useEffect(() => {
    const loadShopInfo = async () => {
      try {
        const shopName = await AsyncStorage.getItem("selectedShopName");
        if (shopName) {
          setSelectedShopName(shopName);
        }

        const savedOrientation = await AsyncStorage.getItem("screenOrientation");
        if (savedOrientation === "portrait" || savedOrientation === "landscape") {
          setSelectedScreenOrientation(savedOrientation);
        }
      } catch (error) {
        console.error("加载店铺信息失败:", error);
      }
    };

    loadShopInfo();
  }, [isOpen]);

  useEffect(() => {
    const handleOrientationChange = (value: "landscape" | "portrait") => {
      setSelectedScreenOrientation(value);
    };

    settingsListener.onSettingChange("screen_orientation", handleOrientationChange);
    return () => {
      settingsListener.offSettingChange("screen_orientation", handleOrientationChange);
    };
  }, []);

  // 获取网络状态图标名称（用于 MaterialCommunityIcons）
  const getNetworkStatusIconName = useCallback(() => {
    return networkStatus === "connected" ? "wifi" : "wifi-off";
  }, [networkStatus]);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      t("logoutConfirmTitle") || "确认登出",
      t("logoutConfirmMessage") || "您确定要登出系统吗？",
      [
        {
          text: t("cancel") || "取消",
          style: "cancel",
        },
        {
          text: t("confirm") || "确认",
          onPress: async () => {
            try {
              const success = await auth.logout();
              if (success) {
                router.replace("/login");
              }
            } catch (error) {
              console.error("Logout error:", error);
            }
          },
        },
      ]
    );
  }, [t, router]);

  const navigateTo = useCallback((path: any) => {
    router.push(path);
    onClose();
  }, [router, onClose]);

  const handleTopFixedLayout = useCallback((event: LayoutChangeEvent) => {
    setTopFixedHeight(event.nativeEvent.layout.height);
  }, []);

  const menuWidth = useMemo(() => Math.min(width * 0.4, 400), [width]); // 菜单宽度为屏幕的40%，最大400px
  const isPortraitMode = selectedScreenOrientation === "portrait";
  const navIconSize = isPortraitMode ? 26 : 20;

  // 添加动画值
  const slideAnim = useMemo(() => new Animated.Value(isOpen ? 0 : -menuWidth), [isOpen, menuWidth]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOpen ? 0 : -menuWidth,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isOpen, slideAnim, menuWidth]);

  if (!isOpen) {
    return null; // 菜单关闭时不渲染
  }

  return (
    <>
      {/* 全屏背景 */}
      <Animated.View
        style={[styles.backdrop, { opacity: slideAnim.interpolate({
          inputRange: [-menuWidth, 0],
          outputRange: [0, 1],
        })}]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* 侧边菜单 */}
      <Animated.View
        style={[
          styles.menuContainer,
          { width: menuWidth, transform: [{ translateX: slideAnim }] },
        ]}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer} showsVerticalScrollIndicator={false}>
          <View style={styles.topFixedSection} onLayout={handleTopFixedLayout}>
            {/* 关闭按钮 */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={28} color="white" />
            </TouchableOpacity>

            <View style={styles.topInfoSection}>
              {/* 店铺名称 */}
              {selectedShopName && (
                <View style={styles.shopSection}>
                  <Text style={[styles.shopLabel, isPortraitMode && styles.shopLabelPortrait]}>{t("shop") || "店铺"}</Text>
                  <Text style={[styles.shopName, isPortraitMode && styles.shopNamePortrait]}>{selectedShopName}</Text>
                </View>
              )}

              {/* 网络状态 */}
              <View style={styles.networkSection}>
                <Text style={[styles.networkLabel, isPortraitMode && styles.networkLabelPortrait]}>{t("internet") || "Internet"}</Text>
                <View style={styles.networkStatusInfo}>
                  <MaterialCommunityIcons
                    name={getNetworkStatusIconName()}
                    size={20}
                    color="white"
                  />
                  <Text style={[
                    styles.networkStatusText,
                    isPortraitMode && styles.networkStatusTextPortrait,
                    networkStatus === "disconnected" && styles.networkStatusDisconnected,
                  ]}>
                    {networkStatus === "connected"
                      ? t("connected") || "已连接"
                      : networkStatus === "disconnected"
                      ? t("disconnected") || "已断开"
                      : "检查中..."}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.centerMenuSection,
              isPortraitMode && styles.centerMenuSectionPortrait,
              isPortraitMode && { transform: [{ translateY: -topFixedHeight / 2 }] },
            ]}
          >
            <View style={[styles.divider, isPortraitMode && styles.dividerPortrait]} />

            {/* 导航菜单 */}
            <View style={[styles.navigationSection, isPortraitMode && styles.navigationSectionPortrait]}>
              <Text style={[styles.sectionTitle, isPortraitMode && styles.sectionTitlePortrait]}>{t("navigation") || "导航"}</Text>

              <TouchableOpacity
                style={[styles.menuItem, isPortraitMode && styles.menuItemPortrait]}
                onPress={() => navigateTo("/(tabs)/home")}
              >
                <Ionicons name="home" size={navIconSize} color="white" />
                <Text style={[styles.menuItemText, isPortraitMode && styles.menuItemTextPortrait]}>{t("newOrders")}</Text>
              </TouchableOpacity>

            {/* pre-orders 已隐藏 */}
            {/* <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/pre-orders")}
            >
              <Ionicons name="receipt" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("preOrders")}</Text>
            </TouchableOpacity> */}

              <TouchableOpacity
                style={[styles.menuItem, isPortraitMode && styles.menuItemPortrait]}
                onPress={() => navigateTo("/(tabs)/completed")}
              >
                <Ionicons name="checkmark-done" size={navIconSize} color="white" />
                <Text style={[styles.menuItemText, isPortraitMode && styles.menuItemTextPortrait]}>{t("completedOrders")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuItem, isPortraitMode && styles.menuItemPortrait]}
                onPress={() => navigateTo("/(tabs)/history")}
              >
                <Ionicons name="time" size={navIconSize} color="white" />
                <Text style={[styles.menuItemText, isPortraitMode && styles.menuItemTextPortrait]}>{t("searchHistory")}</Text>
              </TouchableOpacity>

            {/* stock management 已隐藏 */}
            {/* <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/stock")}
            >
              <Ionicons name="cube" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("stockManagement")}</Text>
            </TouchableOpacity> */}

            {/* dashboard 已隐藏 */}
            {/* <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/dashboard")}
            >
              <Ionicons name="analytics" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("dashboard")}</Text>
            </TouchableOpacity> */}
            </View>

            <View style={[styles.divider, isPortraitMode && styles.dividerPortrait]} />

            {/* 设置部分 */}
            <View style={[styles.settingsSection, isPortraitMode && styles.settingsSectionPortrait]}>
              <Text style={[styles.sectionTitle, isPortraitMode && styles.sectionTitlePortrait]}>{t("status")}</Text>

              {/* 设置页面 */}
              <TouchableOpacity
                style={[styles.menuItem, isPortraitMode && styles.menuItemPortrait]}
                onPress={() => navigateTo("/(tabs)/settings")}
              >
                <Ionicons name="settings" size={navIconSize} color="white" />
                <Text style={[styles.menuItemText, isPortraitMode && styles.menuItemTextPortrait]}>{t("settings")}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.divider, isPortraitMode && styles.dividerPortrait]} />

            {/* 登出按钮 */}
            <TouchableOpacity
              style={[styles.logoutButton, isPortraitMode && styles.logoutButtonPortrait]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out" size={navIconSize} color="white" />
              <Text style={[styles.logoutButtonText, isPortraitMode && styles.logoutButtonTextPortrait]}>{t("logout")}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  menuContainer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#2c2c2c",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  scrollContent: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  topFixedSection: {
    zIndex: 2,
  },
  topInfoSection: {
    marginBottom: 8,
  },
  centerMenuSection: {},
  centerMenuSectionPortrait: {
    flex: 1,
    justifyContent: "center",
  },
  closeButton: {
    alignSelf: "flex-start",
    padding: 10,
    marginBottom: 20,
  },
  shopSection: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
  },
  shopLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 5,
  },
  shopLabelPortrait: {
    fontSize: 14,
    marginBottom: 7,
  },
  shopName: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
  },
  shopNamePortrait: {
    fontSize: 20,
  },
  networkSection: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
  },
  networkLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 5,
  },
  networkLabelPortrait: {
    fontSize: 14,
    marginBottom: 7,
  },
  networkStatusInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  networkIcon: {
    width: 20,
    height: 20,
    tintColor: "white",
  },
  networkStatusText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
  },
  networkStatusTextPortrait: {
    fontSize: 20,
  },
  networkStatusDisconnected: {
    color: "#ff5252",
  },
  divider: {
    height: 1,
    backgroundColor: "#444",
    marginVertical: 15,
  },
  dividerPortrait: {
    marginVertical: 22,
  },
  navigationSection: {
    marginBottom: 20,
  },
  navigationSectionPortrait: {
    marginBottom: 28,
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingsSectionPortrait: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: "#888",
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 10,
  },
  sectionTitlePortrait: {
    fontSize: 15,
    marginBottom: 14,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginBottom: 8,
    backgroundColor: "#333",
  },
  menuItemPortrait: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginBottom: 18,
  },
  menuItemText: {
    color: "white",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 12,
    flex: 1,
  },
  menuItemTextPortrait: {
    fontSize: 18,
    marginLeft: 14,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#d32f2f",
    marginTop: 10,
  },
  logoutButtonPortrait: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginTop: 20,
  },
  logoutButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 12,
  },
  logoutButtonTextPortrait: {
    fontSize: 18,
    marginLeft: 14,
  },
});
