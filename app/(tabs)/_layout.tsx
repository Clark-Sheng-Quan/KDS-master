import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import SideMenu from "../../components/SideMenu";
import FloatingActionButton from "../../components/FloatingActionButton";
import { Ionicons } from "@expo/vector-icons";
import { useModalState } from "../../contexts/ModalContext";

export default function TabLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { hasOpenModal } = useModalState();
  const isHomeRoute = pathname === "/(tabs)/home" || pathname === "/home";
  const showBackHomeButton = !isHomeRoute && !hasOpenModal;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: "Home",
          }}
        />
        {/* <Tabs.Screen
          name="recall"
          options={{
            title: "Recall",
          }}
        /> */}
        {/* <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="MultipleKDS"
          options={{
            title: "Multiple",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        /> */}
      </Tabs>

      {/* 浮动菜单按钮 */}
      <FloatingActionButton onPress={() => setMenuOpen(true)} />

      {/* 全局返回 Home 按钮（除 home 外显示） */}
      {showBackHomeButton && (
        <TouchableOpacity
          style={styles.backHomeButton}
          onPress={() => router.replace("/(tabs)/home")}
          activeOpacity={0.7}
        >
          <Ionicons name="home" size={30} color="white" />
        </TouchableOpacity>
      )}

      {/* 侧边菜单 */}
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  backHomeButton: {
    position: "absolute",
    top: 24,
    right: 24,
    zIndex: 1001,
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
});
