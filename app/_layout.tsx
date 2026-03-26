import { Stack } from "expo-router";
import { OrderProvider, useOrders } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CategoryColorProvider } from "../contexts/CategoryColorContext";
import { SettingsProvider } from "../contexts/SettingsContext";
import { PreOrderProvider } from "../contexts/PreOrderContext";
import { CompletedOrderProvider } from "../contexts/CompletedOrderContext";
import { View } from "react-native";
import { useState, useEffect } from "react";
import { ConnectionBanner } from "../components/ConnectionBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenOrientationModule from "expo-screen-orientation";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";

// 内部组件：显示网络连接 banner
function NetworkConnectionBanner() {
  const { networkStatus } = useOrders();
  // const [kdsRole, setKdsRole] = useState<string>('');

  // useEffect(() => {
  //   // Get KDS role to know if we need to show connection banner
  //   const getRole = async () => {
  //     const role = await AsyncStorage.getItem('kds_role');
  //     setKdsRole(role || 'slave');
  //   };
  //   getRole();
  // }, []);

  // // Only show banner if we're in Kitchen (slave) mode and internet is disconnected
  // const shouldShowBanner = kdsRole === 'slave';

  return (
    <>
      {(
        <ConnectionBanner
          networkStatus={networkStatus}
          autoHideDuration={30000}
          onDismiss={() => {
            // Optional: handle dismiss if needed
          }}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  // 应用启动时恢复保存的屏幕方向并设置全屏模式
  useEffect(() => {
    const initializeFullscreen = async () => {
      try {
        // 设置全屏：隐藏状态栏
        await SystemUI.setBackgroundColorAsync("transparent");
        
        // 恢复保存的屏幕方向
        const savedOrientation = await AsyncStorage.getItem("screenOrientation");
        if (savedOrientation) {
          console.log("恢复保存的屏幕方向:", savedOrientation);
          if (savedOrientation === "landscape") {
            await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.LANDSCAPE);
          } else if (savedOrientation === "portrait") {
            await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.PORTRAIT);
          }
        } else {
          // 默认横屏
          await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.LANDSCAPE);
        }
      } catch (error) {
        console.error("初始化全屏模式失败:", error);
      }
    };

    initializeFullscreen();
  }, []);

  return (
    <CategoryColorProvider>
      <SettingsProvider>
        <LanguageProvider>
          <OrderProvider>
            <PreOrderProvider>
              <CompletedOrderProvider>
                <View style={{ flex: 1 }}>
                  <StatusBar hidden={true} />
                  <NetworkConnectionBanner />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="(tabs)" />
                  </Stack>
                </View>
              </CompletedOrderProvider>
            </PreOrderProvider>
          </OrderProvider>
        </LanguageProvider>
      </SettingsProvider>
    </CategoryColorProvider>
  );
}
