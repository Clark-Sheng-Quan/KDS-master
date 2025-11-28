import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Dimensions,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  FlatList,
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
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARDS_PER_COLUMN,
  STORAGE_KEY_CARDS_PER_ROW,
  STORAGE_KEY_CARDS_PER_COLUMN,
  cardStyles,
  preCalculateCardStyles,
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
  const [cardsPerRow, setCardsPerRow] = useState<number>(DEFAULT_CARDS_PER_ROW);
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardStylesMap, setCardStylesMap] = useState<any[]>([]);

  // 处理订单选择 - 使用 useCallback 避免在每次渲染时创建新函数
  const handleOrderSelect = useCallback((order: FormattedOrder) => {
    setSelectedOrder((prevSelected) =>
      prevSelected && prevSelected.id === order.id ? null : order
    );
  }, []);

  // 根据 cardsPerColumn 计算初始渲染数量（渲染 cardsPerColumn 行）
  const initialNumToRender = cardsPerRow * cardsPerColumn;

  // FlatList renderItem 回调 - 只在显示时才渲染
  const renderOrderCard = useCallback(
    ({ item, index }: { item: FormattedOrder; index: number }) => (
      <OrderCard
        order={item}
        style={[styles.cardStyle, cardStylesMap[index]]}
        disabled={false}
        selectable={true}
        selected={selectedOrder?.id === item.id}
        onSelect={() => handleOrderSelect(item)}
        hideTimer={true}
        hideActions={true}
        rightCompact={true}
        scrollIndicatorAtBottom={true}
        disableItems={true}
      />
    ),
    [selectedOrder?.id]
  );

  // 加载历史订单
  const loadHistoryOrders = useCallback(async () => {
    try {
      setLoading(true);
      const orders = await OrderService.getHistoryOrderDetails();
      console.log('[History Screen] 加载完成，订单数量:', orders.length);
      setHistoryOrders(orders);
    } catch (error) {
      setError("Failed to load history orders");
    } finally {
      setLoading(false);
    }
  }, []);

    const availableWidth = dimensions.width - PADDING * 2;
    const availableHeight = dimensions.height;
  
  // 当历史订单、卡片尺寸改变时，重新计算卡片样式
  useEffect(() => {
    const styles = preCalculateCardStyles(
      historyOrders.length,
      availableWidth,
      availableHeight,
      cardsPerRow,
      cardsPerColumn
    );
    setCardStylesMap(styles);
  }, [historyOrders.length, availableWidth, availableHeight, cardsPerRow, cardsPerColumn]);

  // 监听屏幕尺寸变化以更新 dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 监听 OrderService 的合并订单更新回调，实时刷新历史订单列表
  // useEffect(() => {
  //   const handleOrderUpdate = async () => {
      
  //     await loadHistoryOrders();
  //   };

  //   // 设置回调函数
  //   const originalCallback = (orders: FormattedOrder[]) => {
  //     // 不直接使用接收到的 orders，而是重新从 API 加载历史订单
  //     handleOrderUpdate();
  //   };

  //   OrderService.setOrderUpdateCallback(originalCallback);

  //   return () => {
  //     // 清理回调
  //     OrderService.setOrderUpdateCallback(() => {});
  //   };
  // }, [loadHistoryOrders]);

  useFocusEffect(
    useCallback(() => {
      loadHistoryOrders();
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
          const savedCardsPerColumn = await AsyncStorage.getItem(
            STORAGE_KEY_CARDS_PER_COLUMN
          );
          if (savedCardsPerColumn) {
            setCardsPerColumn(parseFloat(savedCardsPerColumn));
          }
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };

      loadSettings();

      return () => {};
    }, [loadHistoryOrders])
  );

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
          {t("searchHistory")} ({historyOrders.length})
        </Text>
      </View>

      <FlatList
        data={cardStylesMap.length > 0 ? historyOrders : []}
        renderItem={renderOrderCard}
        keyExtractor={(item) => item?.id || Math.random().toString()}
        numColumns={cardsPerRow}
        scrollEnabled={true}
        removeClippedSubviews={true}
        maxToRenderPerBatch={cardsPerRow * 2}
        updateCellsBatchingPeriod={100}
        initialNumToRender={initialNumToRender}
        windowSize={cardsPerColumn}
        contentContainerStyle={styles.cardsContainer}
        style={styles.scrollContainer}
      />
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
    backgroundColor: "#ddd",
    opacity: 0.8,
  },
  disabledButtonText: {
    color: "#888",
  },
  recallButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 14,
  },
  buttonIcon: {
    marginRight: 6,
  },
};

const styles = { ...cardStyles, ...historyStyles };
