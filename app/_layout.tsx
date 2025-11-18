import { Stack } from "expo-router";
import { OrderProvider, useOrders } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CategoryColorProvider } from "../contexts/CategoryColorContext";
import { PreOrderProvider } from "../contexts/PreOrderContext";
import { View } from "react-native";
import { useState, useEffect } from "react";
import { ConnectionBanner } from "../components/ConnectionBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
