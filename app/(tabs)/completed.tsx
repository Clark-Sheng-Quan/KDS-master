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
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import { FormattedOrder } from "../../services/types";
import { theme } from "../../styles/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../contexts/LanguageContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { OrderService } from "../../services/orderService/OrderService";
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

export default function CompletedScreen() {
  const { t } = useLanguage();
  const { completedOrders, removeCompletedOrder, loading: contextLoading, cleanExpiredOrdersNow } = useCompletedOrders();
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(null);
  const [cardsPerRow, setCardsPerRow] = useState<number>(DEFAULT_CARDS_PER_ROW);
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardStylesMap, setCardStylesMap] = useState<any[]>([]);
  const [loading, setLoading] = useState(contextLoading);

  useEffect(() => {
    setLoading(contextLoading);
  }, [contextLoading]);

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
    ({ item, index, completedTime }: { item: FormattedOrder; index: number; completedTime?: string }) => (
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
        completedTime={completedTime}
        hideBadges={true}
      />
    ),
    [selectedOrder?.id, cardStylesMap]  // 依赖 selectedOrder 的 id 和 cardStylesMap
  );

  const availableWidth = dimensions.width - PADDING * 2;
  const availableHeight = dimensions.height;

  // 当完成订单、卡片尺寸改变时，重新计算卡片样式
  useEffect(() => {
    const styles = preCalculateCardStyles(
      completedOrders.length,
      availableWidth,
      availableHeight,
      cardsPerRow,
      cardsPerColumn
    );
    setCardStylesMap(styles);
  }, [completedOrders.length, availableWidth, availableHeight, cardsPerRow, cardsPerColumn]);

  // 监听屏幕尺寸变化以更新 dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 加载卡片数量设置
  useEffect(() => {
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
  }, []);

  // 召回订单功能 - 发起 recall
  const handleRecallOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    // 立即重置选择
    setSelectedOrder(null);
    
    // 在后台执行 recall 和移除操作，不阻塞 UI
    OrderService.recallOrder(selectedOrder).then(() => {
      // 从完成列表中移除 - 不 await，让它在后台执行
      removeCompletedOrder(selectedOrder.id).catch((error: any) => {
        console.error("移除订单失败:", error);
      });
    }).catch((error: any) => {
      console.error("召回订单失败:", error);
      Alert.alert(t("error"), "召回订单失败");
    });
  };

  // 移除订单功能 - 从已完成列表中移除
  const handleRemoveOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    // 立即重置选择
    setSelectedOrder(null);
    
    // 在后台移除，不阻塞 UI
    removeCompletedOrder(selectedOrder.id).catch((error: any) => {
      console.error("移除订单失败:", error);
      Alert.alert(t("error"), "移除订单失败");
    });
  };

  // 清理过期订单功能
  const handleCleanExpired = async () => {
    try {
      await cleanExpiredOrdersNow();
      Alert.alert(t("success") || "成功", t("cleanedExpiredOrders"));
    } catch (error) {
      console.error("清理过期订单失败:", error);
      Alert.alert(t("error"), t("failedToCleanExpiredOrders"));
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
          {t("todayCompletedOrders")} ({completedOrders.length})
        </Text>

        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[styles.recallButton, !selectedOrder && styles.disabledButton]}
            onPress={handleRecallOrder}
            disabled={!selectedOrder}
          >
            <Ionicons
              name="arrow-redo"
              size={20}
              color={selectedOrder ? "white" : "#888"}
              style={styles.buttonIcon}
            />
            <Text style={[styles.recallButtonText, !selectedOrder && styles.disabledButtonText]}>
              {t("recall")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.removeButton, !selectedOrder && styles.disabledButton]}
            onPress={handleRemoveOrder}
            disabled={!selectedOrder}
          >
            <Ionicons
              name="trash"
              size={20}
              color={selectedOrder ? "white" : "#888"}
              style={styles.buttonIcon}
            />
            <Text style={[styles.removeButtonText, !selectedOrder && styles.disabledButtonText]}>
              {t("remove")}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cleanButton}
            onPress={handleCleanExpired}
          >
            <Ionicons
              name="trash-bin"
              size={20}
              color="white"
              style={styles.buttonIcon}
            />
            <Text style={styles.cleanButtonText}>
              {t("cleanExpiredOrders")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={cardStylesMap.length > 0 ? completedOrders : []}
        renderItem={({ item, index }) => {
          // 为完成的 items 构建一个虚拟的订单对象用于显示
          const displayOrder = {
            ...item.order,
            products: item.completedItems || item.order.products || []
          };
          return renderOrderCard({ item: displayOrder, index, completedTime: item.completedAt });
        }}
        keyExtractor={(item: any) => item.order?.id || Math.random().toString()}
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
            <Text style={styles.noOrdersText}>{t("noCompletedOrders")}</Text>
          </View>
        }
      />
    </View>
  );
}

const completedStyles = {
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
  buttonGroup: {
    flexDirection: "row" as const,
    gap: 8,
  },
  recallButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FF9B2F",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  removeButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FF4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cleanButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#666",
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
  removeButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 14,
  },
  cleanButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 14,
  },
  buttonIcon: {
    marginRight: 6,
  },
  container: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: theme.colors.backgroundColor,
  },
  centerContent: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  noOrdersText: {
    fontSize: 38,
    color: "#151010",
    textAlign: "center" as const,
  },
};

const styles = { ...cardStyles, ...completedStyles };
