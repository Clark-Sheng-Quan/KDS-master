import { Stack } from "expo-router";
import { OrderProvider } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CategoryColorProvider } from "../contexts/CategoryColorContext";
import { PreOrderProvider } from "../contexts/PreOrderContext";
import { View } from "react-native";
import { useState, useEffect } from "react";
import { TCPSocketService } from "../services/tcpSocketService";
import { ConnectionBanner } from "../components/ConnectionBanner";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function RootLayout() {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [kdsRole, setKdsRole] = useState<string>('');

  useEffect(() => {
    // Get KDS role to know if we need to show connection banner
    const getRole = async () => {
      const role = await AsyncStorage.getItem('kds_role');
      setKdsRole(role || 'slave');
    };
    getRole();

    // Set up connection status callback
    TCPSocketService.setConnectionStatusCallback((status) => {
      setConnectionStatus(status);
    });
  }, []);

  // Only show banner if we're in Kitchen (slave) mode
  const shouldShowBanner = kdsRole === 'slave';

  return (
    <CategoryColorProvider>
      <LanguageProvider>
        <View style={{ flex: 1 }}>
          {shouldShowBanner && (
            <ConnectionBanner
              connectionStatus={connectionStatus}
              autoHideDuration={30000}
              onDismiss={() => {
                // Optional: handle dismiss if needed
              }}
            />
          )}
          <OrderProvider>
            <PreOrderProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
                <Stack.Screen name="(tabs)" />
              </Stack>
            </PreOrderProvider>
          </OrderProvider>
        </View>
      </LanguageProvider>
    </CategoryColorProvider>
  );
}
