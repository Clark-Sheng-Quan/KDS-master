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
import { Picker } from "@react-native-picker/picker";
import { OrderCard } from "../../components/OrderCard";
import { OrderService } from "../../services/orderService";
import { FormattedOrder } from "../../services/types";
import { useFocusEffect } from "@react-navigation/native";
import { theme } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../contexts/LanguageContext";
import { useSettings } from "../../contexts/SettingsContext";
import {
  PADDING,
  CARD_MARGIN,
  cardStyles,
  preCalculateCardStyles,
} from "../../constants/cardConfig";

const { width } = Dimensions.get("window");

export default function HistoryScreen() {
  const { t } = useLanguage();
  const { cardsPerRow, cardsPerColumn } = useSettings();
  const [historyOrders, setHistoryOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(
    null
  );
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardStylesMap, setCardStylesMap] = useState<any[]>([]);
  const [queryRange, setQueryRange] = useState<string>("today");

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
    ({ item, index }: { item: FormattedOrder; index: number }) => {
      // 使用默认样式，如果 cardStylesMap 还没计算出来
      const defaultStyle = {
        width: (availableWidth) / cardsPerRow - 10,
        height: 400,
      };
      const cardStyle = cardStylesMap[index] || defaultStyle;
      
      return (
        <OrderCard
          order={item}
          style={[styles.cardStyle, cardStyle]}
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
      );
    },
    [selectedOrder?.id, cardStylesMap, cardsPerRow]
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
        
        <View style={styles.filterContainer}>
          <Text style={styles.filterLabel}>{t("queryRange")}:</Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={queryRange}
              style={styles.picker}
              onValueChange={(itemValue) => setQueryRange(itemValue)}
              dropdownIconColor="#333"
              itemStyle={{ display: 'none' }}
            >
              <Picker.Item label={t("today")} value="today" />
            </Picker>
          </View>
        </View>
      </View>

      <FlatList
        key={`history-grid-${cardsPerRow}`}
        data={historyOrders}
        renderItem={renderOrderCard}
        keyExtractor={(item) => item?.id || Math.random().toString()}
        numColumns={cardsPerRow}
        scrollEnabled={true}
        removeClippedSubviews={true}
        maxToRenderPerBatch={cardsPerRow * 2}
        updateCellsBatchingPeriod={100}
        initialNumToRender={initialNumToRender}
        windowSize={cardsPerColumn}
        contentContainerStyle={[styles.cardsContainer, { flexGrow: 1 }]}
        style={[styles.scrollContainer, { flex: 1 }]}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#999', fontSize: 14 }}>No history orders</Text>
          </View>
        }
      />
    </View>
  );
}

const historyStyles = {
  mainContainer: {
    flex: 1,
    backgroundColor: "#ccc8c8",
  },
  headerContainer: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: PADDING,
    paddingVertical: 14,
    backgroundColor: "#333333",
    borderBottomWidth: 0,
    zIndex: 1000,
    marginHorizontal: PADDING,
    marginTop: PADDING,
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  headerText: {
    fontSize: 26,
    fontWeight: "bold" as const,
    color: "#ffffff",
  },
  filterContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#aaa",
    minWidth: 70,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 8,
    overflow: "visible" as const,
    backgroundColor: "#ffffff",
    minWidth: 60,
    width: 60,
    height: 40,
    justifyContent: "center" as const,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  picker: {
    height: 40,
    width: 60,
    color: "#333",
    fontSize: 16,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: "#ccc8c8",
    padding: PADDING,
  },
  cardsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "flex-start" as const,
    paddingBottom: 20,
    paddingHorizontal: 0,
  },
  cardStyle: {
    marginBottom: CARD_MARGIN,
    borderRadius: 12,
    backgroundColor: "white",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
  noOrdersText: {
    fontSize: 38,
    color: "#888",
    textAlign: "center" as const,
  },
};

const styles = { ...cardStyles, ...historyStyles };
