import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { OrderService } from "../../services/orderService";
import { FormattedOrder } from "../../services/types";
import { useFocusEffect } from "@react-navigation/native";
import { theme } from "../../styles/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../contexts/LanguageContext";
import { colors } from "@/styles/color";

const { width } = Dimensions.get("window");
const PADDING = 16;
const CARD_MARGIN = 8;
const CARDS_PER_ROW = 3;

export default function HistoryScreen() {
  const { t } = useLanguage();
  const [historyOrders, setHistoryOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(
    null
  );

  useFocusEffect(
    React.useCallback(() => {
      console.log("History页面获得焦点，刷新数据");
      loadHistoryOrders();
      // 重置选择
      setSelectedOrder(null);
    }, [])
  );

  const loadHistoryOrders = async () => {
    try {
      setLoading(true);
      const orders = await OrderService.getHistoryOrderDetails();
      setHistoryOrders(orders);
    } catch (error) {
      setError("Failed to load history orders");
    } finally {
      setLoading(false);
    }
  };

  const handleOrderSelect = (order: FormattedOrder) => {
    if (selectedOrder && selectedOrder.id === order.id) {
      // 如果点击的是已选中的订单，取消选择
      setSelectedOrder(null);
    } else {
      // 否则选择这个订单
      setSelectedOrder(order);
    }
  };

  const handleRecallOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    try {
      setLoading(true);
      // 调用orderService中的recallOrder方法
      await OrderService.recallOrder(selectedOrder);

      // 刷新订单列表
      await loadHistoryOrders();

      // 重置选择
      setSelectedOrder(null);

      // 显示成功提示
      Alert.alert(t("success"), t("orderRecalled"));
    } catch (error) {
      console.error("召回订单失败:", error);
      Alert.alert(t("error"), t("recallFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#333" />
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerText}>
          {t("todayOrderHistory")} ({historyOrders.length})
        </Text>

        <TouchableOpacity
          style={[styles.recallButton, !selectedOrder && styles.disabledButton]}
          onPress={handleRecallOrder}
          disabled={!selectedOrder}
        >
          <Ionicons
            name="refresh"
            size={20}
            color="white"
            style={styles.buttonIcon}
          />
          <Text style={styles.recallButtonText}>{t("recallOrder")}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container}>
        <View style={styles.cardsContainer}>
          {historyOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              style={styles.cardStyle}
              disabled={false}
              selectable={true}
              selected={selectedOrder?.id === order.id}
              onSelect={() => handleOrderSelect(order)}
              hideTimer={true}
              hideActions={true}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
    padding: PADDING,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PADDING,
    paddingVertical: 12,
    backgroundColor: theme.colors.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold",
  },
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: CARD_MARGIN,
  },
  cardStyle: {
    width:
      (width - PADDING * 2 - CARD_MARGIN * (CARDS_PER_ROW - 1)) / CARDS_PER_ROW,
    marginBottom: CARD_MARGIN,
  },
  recallButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primaryColor,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: "#cccccc",
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 6,
  },
  recallButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
});
