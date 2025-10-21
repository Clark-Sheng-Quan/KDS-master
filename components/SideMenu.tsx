import React, { useEffect, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Image,
  Alert,
  ScrollView,
  Modal,
  Dimensions,
  OrientationLocker,
  ScreenOrientation,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../utils/auth";
import { useLanguage } from "../contexts/LanguageContext";
import { useOrders } from "../contexts/OrderContext";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenOrientationModule from "expo-screen-orientation";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SideMenu({ isOpen, onClose }: SideMenuProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { networkStatus } = useOrders();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [screenOrientation, setScreenOrientation] = useState<"portrait" | "landscape">("portrait");
  const { width, height } = Dimensions.get("window");

  // 检测初始屏幕方向
  useEffect(() => {
    const detectOrientation = () => {
      const isLandscape = width > height;
      setScreenOrientation(isLandscape ? "landscape" : "portrait");
    };

    detectOrientation();

    // 监听屏幕方向变化
    const subscription = Dimensions.addEventListener("change", ({ window: { width, height } }) => {
      const isLandscape = width > height;
      setScreenOrientation(isLandscape ? "landscape" : "portrait");
    });

    return () => subscription?.remove();
  }, []);

  // 更新当前时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 格式化时间
  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  // 加载店铺信息
  useEffect(() => {
    const loadShopInfo = async () => {
      try {
        const shopName = await AsyncStorage.getItem("selectedShopName");
        if (shopName) {
          setSelectedShopName(shopName);
        }
      } catch (error) {
        console.error("加载店铺信息失败:", error);
      }
    };

    loadShopInfo();
  }, []);

  // 获取网络状态图标
  const getNetworkStatusIcon = () => {
    if (networkStatus === "connected") {
      return require("../assets/icon/wifiConnected.png");
    } else {
      return require("../assets/icon/wifiDisconnected.png");
    }
  };

  const handleLogout = async () => {
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
  };

  const navigateTo = (path: any) => {
    router.push(path);
    onClose();
  };

  const toggleScreenOrientation = async () => {
    try {
      const newOrientation = screenOrientation === "portrait" ? "landscape" : "portrait";
      
      if (newOrientation === "landscape") {
        await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.PORTRAIT);
      }
      
      setScreenOrientation(newOrientation);
    } catch (error) {
      console.error("无法切换屏幕方向:", error);
    }
  };

  const menuWidth = Math.min(width * 0.4, 400); // 菜单宽度为屏幕的40%，最大400px

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* 半透明背景 */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* 侧边菜单 */}
      <View style={[styles.menuContainer, { width: menuWidth }]}>
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* 关闭按钮 */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>

          {/* 时间显示 */}
          <View style={styles.timeSection}>
            <Text style={styles.timeLabel}>{t("currentTime") || "当前时间"}</Text>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          </View>

          {/* 店铺名称 */}
          {selectedShopName && (
            <View style={styles.shopSection}>
              <Text style={styles.shopLabel}>{t("shop") || "店铺"}</Text>
              <Text style={styles.shopName}>{selectedShopName}</Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* 导航菜单 */}
          <View style={styles.navigationSection}>
            <Text style={styles.sectionTitle}>{t("navigation") || "导航"}</Text>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/home")}
            >
              <Ionicons name="home" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("newOrders")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/pre-orders")}
            >
              <Ionicons name="receipt" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("preOrders")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/history")}
            >
              <Ionicons name="time" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("orderHistory")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/stock")}
            >
              <Ionicons name="cube" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("stockManagement")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/dashboard")}
            >
              <Ionicons name="analytics" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("dashboard")}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* 设置部分 */}
          <View style={styles.settingsSection}>
            <Text style={styles.sectionTitle}>{t("settings") || "设置"}</Text>

            {/* 屏幕方向切换 */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={toggleScreenOrientation}
            >
              <Ionicons
                name={screenOrientation === "portrait" ? "phone-portrait" : "phone-landscape"}
                size={20}
                color="white"
              />
              <Text style={styles.menuItemText}>
                {screenOrientation === "portrait"
                  ? t("switchToLandscape") || "切换到横屏"
                  : t("switchToPortrait") || "切换到竖屏"}
              </Text>
            </TouchableOpacity>

            {/* 设置页面 */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigateTo("/(tabs)/settings")}
            >
              <Ionicons name="settings" size={20} color="white" />
              <Text style={styles.menuItemText}>{t("settings")}</Text>
            </TouchableOpacity>

            {/* 网络状态 */}
            <View style={styles.networkStatus}>
              <Image source={getNetworkStatusIcon()} style={styles.networkIcon} />
              <Text style={styles.networkStatusText}>
                {networkStatus === "connected"
                  ? t("connected") || "已连接"
                  : t("disconnected") || "已断开"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* 登出按钮 */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out" size={20} color="white" />
            <Text style={styles.logoutButtonText}>{t("logout")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
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
  closeButton: {
    alignSelf: "flex-start",
    padding: 10,
    marginBottom: 20,
  },
  timeSection: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#444",
  },
  timeLabel: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 5,
  },
  timeText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
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
  shopName: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  divider: {
    height: 1,
    backgroundColor: "#444",
    marginVertical: 15,
  },
  navigationSection: {
    marginBottom: 20,
  },
  settingsSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#888",
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 10,
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
  menuItemText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 12,
    flex: 1,
  },
  networkStatus: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#333",
  },
  networkIcon: {
    width: 20,
    height: 20,
    tintColor: "white",
  },
  networkStatusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 12,
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
  logoutButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 12,
  },
});
