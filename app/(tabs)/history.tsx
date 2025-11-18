import React, { useState, useEffect, useCallback } from "react";
import {
  View,
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PADDING,
  CARD_MARGIN,
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARDS_PER_COLUMN,
  STORAGE_KEY_CARDS_PER_ROW,
  STORAGE_KEY_CARDS_PER_COLUMN,
  cardStyles,
  calculateCardWidth,
  calculateCardHeight,
  calculateMarginRight,
  formatTime,
} from "../../constants/cardConfig";

const { width } = Dimensions.get("window");

export default function HistoryScreen() {
  const { t } = useLanguage();
  const [historyOrders, setHistoryOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(
    null
  );
  const [cardsPerRow, setCardsPerRow] = useState<number>(
    DEFAULT_CARDS_PER_ROW
  );
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  // 处理订单选择 - 使用 useCallback 避免在每次渲染时创建新函数
  const handleOrderSelect = useCallback((order: FormattedOrder) => {
    setSelectedOrder((prevSelected) =>
      prevSelected && prevSelected.id === order.id ? null : order
    );
  }, []);

  // 计算卡片尺寸
  const availableWidth = dimensions.width - PADDING * 2;
  const cardWidth = calculateCardWidth(availableWidth, cardsPerRow);
  const cardHeight = 600; // 固定高度

  // 加载历史订单
  const loadHistoryOrders = useCallback(async () => {
    try {
      const startTime = Date.now();
      console.log("开始加载历史订单...");
      setLoading(true);
      const orders = await OrderService.getHistoryOrderDetails();
      setHistoryOrders(orders);
      const endTime = Date.now();
      console.log(`历史订单加载完成，耗时: ${endTime - startTime}ms，订单数: ${orders.length}`);
    } catch (error) {
      setError("Failed to load history orders");
      console.error("加载历史订单失败:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 监听屏幕尺寸变化以更新 dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      console.log("History页面获得焦点，刷新数据");
      loadHistoryOrders();
      // 重置选择
      setSelectedOrder(null);

      // 加载卡片数量设置
      const loadSettings = async () => {
        try {
          const savedCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_CARDS_PER_ROW
          );
          if (savedCardsPerRow) {
            setCardsPerRow(parseInt(savedCardsPerRow));
          }
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };

      loadSettings();

      // 返回一个空的清理函数
      return () => {};
    }, [loadHistoryOrders])
  );

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

      <ScrollView
        style={styles.scrollContainer}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
      >
        <View style={styles.cardsContainer}>
          {historyOrders.map((order, index) => (
            <OrderCard
              key={order.id}
              order={order}
              style={[
                styles.cardStyle,
                {
                  width: cardWidth,
                  height: cardHeight,
                  marginRight: calculateMarginRight(index, cardsPerRow),
                },
              ]}
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

const historyStyles = {
  mainContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
  },
  headerContainer: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: PADDING,
    paddingVertical: 12,
    backgroundColor: theme.colors.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerText: {
    fontSize: 24,
    fontWeight: "bold" as const,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
    padding: PADDING,
  },
  recallButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: "#CCCCCC",
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 6,
  },
  recallButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 14,
  },
};

const styles = { ...cardStyles, ...historyStyles };
