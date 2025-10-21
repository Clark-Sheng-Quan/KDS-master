import React, { useEffect, useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Image,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { auth } from "../utils/auth";
import { useLanguage } from "../contexts/LanguageContext";
import { useOrders } from "../contexts/OrderContext";

export default function GlobalNav() {
  const router = useRouter();
  const { t } = useLanguage();
  const { networkStatus } = useOrders();
  const [currentTime, setCurrentTime] = useState(new Date());

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

  const handleLogout = async () => {
    // 显示确认对话框
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

  // 获取网络状态图标
  const getNetworkStatusIcon = () => {
    if (networkStatus === "connected") {
      return require("../assets/icon/wifiConnected.png");
    } else {
      return require("../assets/icon/wifiDisconnected.png");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.navContainer}>
        {/* 左侧时间显示 */}
        <View style={styles.leftSection}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        </View>

        {/* 中间导航按钮 */}
        <View style={styles.centerSection}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/home")}
          >
            <Text style={styles.buttonText}>{t("newOrders")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/pre-orders")}
          >
            <Text style={styles.buttonText}>{t("preOrders")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/history")}
          >
            <Text style={styles.buttonText}>{t("orderHistory")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/stock")}
          >
            <Text style={styles.buttonText}>{t("stockManagement")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/dashboard")}
          >
            <Text style={styles.buttonText}>{t("dashboard")}</Text>
          </TouchableOpacity>
        </View>

        {/* 右侧按钮 */}
        <View style={styles.rightSection}>
          {/* 网络状态图标 */}
          <View style={styles.iconButton}>
            <Image source={getNetworkStatusIcon()} style={styles.iconImage} />
          </View>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => router.push("/(tabs)/settings")}
          >
            <Image
              source={require("../assets/icon/settings.png")}
              style={styles.iconImage}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={handleLogout}>
            <Image
              source={require("../assets/icon/logout.png")}
              style={styles.iconImage}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: "#333",
    justifyContent: "center",
  },
  navContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  leftSection: {
    flex: 1,
    paddingLeft: 15,
    justifyContent: "center",
  },
  timeText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  centerSection: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 15,
    flex: 3,
  },
  rightSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 15,
    flex: 1,
    paddingRight: 15,
  },
  navButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    backgroundColor: "#444",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  iconButton: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: "#444",
    justifyContent: "center",
    alignItems: "center",
  },
  iconImage: {
    width: 24,
    height: 24,
    tintColor: "white",
  },
});
