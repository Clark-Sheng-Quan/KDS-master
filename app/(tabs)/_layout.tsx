import React, { useState } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import SideMenu from "../../components/SideMenu";
import FloatingActionButton from "../../components/FloatingActionButton";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

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
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="time" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="multiple"
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
        />
      </Tabs>

      {/* 浮动菜单按钮 */}
      <FloatingActionButton onPress={() => setMenuOpen(true)} />

      {/* 侧边菜单 */}
      <SideMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}
