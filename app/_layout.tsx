import { Stack } from "expo-router";
import { OrderProvider, useOrders } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CategoryColorProvider } from "../contexts/CategoryColorContext";
import { PreOrderProvider } from "../contexts/PreOrderContext";
import { View } from "react-native";
import { useState, useEffect } from "react";
import { ConnectionBanner } from "../components/ConnectionBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ScreenOrientationModule from "expo-screen-orientation";

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
  // 应用启动时恢复保存的屏幕方向
  useEffect(() => {
    const restoreScreenOrientation = async () => {
      try {
        const savedOrientation = await AsyncStorage.getItem("screenOrientation");
        if (savedOrientation) {
          console.log("恢复保存的屏幕方向:", savedOrientation);
          if (savedOrientation === "landscape") {
            await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.LANDSCAPE);
          } else if (savedOrientation === "portrait") {
            await ScreenOrientationModule.lockAsync(ScreenOrientationModule.OrientationLock.PORTRAIT);
          }
        }
      } catch (error) {
        console.error("恢复屏幕方向失败:", error);
      }
    };

    restoreScreenOrientation();
  }, []);

  return (
    <CategoryColorProvider>
      <LanguageProvider>
        <OrderProvider>
          <PreOrderProvider>
            <View style={{ flex: 1 }}>
              <NetworkConnectionBanner />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </View>
          </PreOrderProvider>
        </OrderProvider>
      </LanguageProvider>
    </CategoryColorProvider>
  );
}
