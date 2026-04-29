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
import { NativeModules } from "react-native";
import { checkPrinter } from "../services/orderPrinter";
import { useSettings } from "../contexts/SettingsContext";

const { Printer_K1215 } = NativeModules;

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

  // 打印订单处理函数
  const handlePrint = async () => {
    if (isPrinting) return;

    setIsPrinting(true);
    try {
      // 检查打印机连接状态
      const isReady = await checkPrinter();

      if (!isReady) {
        Alert.alert(t("notConnected"), t("printerNotConnected"));
        return;
      }

      // 格式化订单数据为打印机需要的格式
      const printData = {
        shopName: "KDS Restaurant", // 可以从配置读取
        orderId: order.num,  // 使用 num (订单号)
        orderTime: order.pickupTime || new Date().toLocaleString(),
        pickupMethod: order.pickupMethod || "取餐",
        tableNumber: order.tableNumber || null,
        items: order.products ? order.products.map((product: any) => ({
          name: product.name || "未知商品",
          price: product.price || 0,
          quantity: product.quantity || 1,
          options: product.options || []
        })) : []
      };

      console.log("打印数据:", JSON.stringify(printData, null, 2));

      // 直接打印当前订单
      const result = await Printer_K1215.printOrder(printData);

      if (result) {
        Alert.alert(
          t("success"),
          `${t("orderPrinted")} #${order.num}`
        );
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
