import React, { useState } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  View,
  Text,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FormattedOrder } from "../services/types";
import { colors } from "../constants/theme";
import { useLanguage } from "../contexts/LanguageContext";
import { printFormattedOrder } from "../services/orderPrinter";
import { useSettings } from "../contexts/SettingsContext";

interface PrintButtonProps {
  order: FormattedOrder;
  disabled?: boolean;
}

export const PrintButton: React.FC<PrintButtonProps> = ({
  order,
  disabled = false,
}) => {
  const { t } = useLanguage();
  const { showPrintButton } = useSettings();
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      const result = await printFormattedOrder(order);
      if (result) {
        Alert.alert(t("success"), `${t("orderPrinted")} #${order.num}`);
      } else {
        Alert.alert(t("failed"), t("printOrderFailed"));
      }
    } catch (error) {
      console.error("打印订单失败:", error);
      Alert.alert(t("error"), `${t("printingError")}: ${error}`);
    } finally {
      setIsPrinting(false);
    }
  };

  // 如果没有启用打印按钮，不显示
  if (!showPrintButton) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.printButton, isPrinting && styles.disabledButton]}
      onPress={handlePrint}
      disabled={isPrinting || disabled}
      activeOpacity={0.7}
    >
      {isPrinting ? (
        <ActivityIndicator size="small" color="white" />
      ) : (
        <View style={styles.printButtonContent}>
          <Ionicons name="print-outline" size={18} color="white" />
          <Text style={styles.printButtonText}>{t("print")}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  printButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.buttonColor,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  printButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  printButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
});
