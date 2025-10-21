import { Stack } from "expo-router";
import { OrderProvider } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CategoryColorProvider } from "../contexts/CategoryColorContext";
import { PreOrderProvider } from "../contexts/PreOrderContext";

export default function RootLayout() {
  return (
    <CategoryColorProvider>
      <LanguageProvider>
        <OrderProvider>
          <PreOrderProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </PreOrderProvider>
        </OrderProvider>
      </LanguageProvider>
    </CategoryColorProvider>
  );
}
