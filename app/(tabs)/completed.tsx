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
import { theme } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../contexts/LanguageContext";
import { OrderService } from "../../services/orderService/OrderService";
import { useSettings } from "../../contexts/SettingsContext";
import {
  PADDING,
  CARD_MARGIN,
  cardStyles,
  preCalculateCardStyles,
} from "../../constants/cardConfig";

const { width } = Dimensions.get("window");

export default function CompletedScreen() {
  const { t } = useLanguage();
  const { completedOrders, removeCompletedOrder, loading: contextLoading, cleanExpiredOrdersNow } = useCompletedOrders();
  const { cardsPerRow, cardsPerColumn } = useSettings();
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(null);
  const [isRecallMode, setIsRecallMode] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardStylesMap, setCardStylesMap] = useState<any[]>([]);
  const [loading, setLoading] = useState(contextLoading);

  useEffect(() => {
    setLoading(contextLoading);
  }, [contextLoading]);

  // 处理订单选择 - 只在 recall 模式下才能选择
  const handleOrderSelect = useCallback((order: FormattedOrder) => {
    if (!isRecallMode) {
      return;
    }
    setSelectedOrder(order);
  }, [isRecallMode]);

  // 根据 cardsPerColumn 计算初始渲染数量（渲染 cardsPerColumn 行）
  const initialNumToRender = cardsPerRow * cardsPerColumn;

  // FlatList renderItem 回调 - 只在显示时才渲染
  const renderOrderCard = useCallback(
    ({ item, index, completedTime }: { item: FormattedOrder; index: number; completedTime?: string }) => (
      <OrderCard
        order={item}
        style={[styles.cardStyle, cardStylesMap[index]]}
        disabled={false}
        selectable={isRecallMode}
        selected={selectedOrder?.id === item.id}
        onSelect={() => handleOrderSelect(item)}
        hideTimer={true}
        hideActions={true}
        rightCompact={true}
        scrollIndicatorAtBottom={true}
        disableItems={true}
        showDateInDue={true}
        completedTime={completedTime}
        hideBadges={true}
      />
    ),
    [selectedOrder?.id, cardStylesMap, handleOrderSelect, isRecallMode]  // 添加 isRecallMode 依赖
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

  // 召回订单功能 - recall 按钮切换模式或执行召回
  const handleRecallOrder = async () => {
    // 如果不在 recall 模式，点击按钮进入 recall 模式
    if (!isRecallMode) {
      setIsRecallMode(true);
      setSelectedOrder(null);
      return;
    }

    // 如果在 recall 模式但未选择订单，不执行
    if (!selectedOrder) {
      return;
    }

    // 执行 recall 操作
    try {
      await OrderService.recallOrder(selectedOrder);
      // 从完成列表中移除
      await removeCompletedOrder(selectedOrder.id);
      // 退出 recall 模式
      setIsRecallMode(false);
      setSelectedOrder(null);
    } catch (error: any) {
      console.error("召回订单失败:", error);
      Alert.alert(t("error"), "召回订单失败");
    }
  };

  // 取消 recall 模式
  const handleCancelRecall = () => {
    setIsRecallMode(false);
    setSelectedOrder(null);
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
            style={[
              styles.recallButton, 
              isRecallMode ? styles.recallButtonActive : styles.recallButtonInactive,
              isRecallMode && !selectedOrder && styles.disabledButton
            ]}
            onPress={handleRecallOrder}
            disabled={isRecallMode && !selectedOrder}
          >
            <Ionicons
              name={isRecallMode ? "arrow-redo" : "arrow-redo"}
              size={20}
              color={isRecallMode ? "white" : (selectedOrder && isRecallMode ? "white" : "#888")}
              style={styles.buttonIcon}
            />
            <Text style={[
              styles.recallButtonText, 
              isRecallMode && !selectedOrder && styles.disabledButtonText
            ]}>
              {isRecallMode ? t("recall") : t("recall")}
            </Text>
          </TouchableOpacity>

          {isRecallMode && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRecall}
            >
              <Ionicons
                name="close"
                size={20}
                color="white"
                style={styles.buttonIcon}
              />
              <Text style={styles.cancelButtonText}>
                {t("cancel") || "取消"}
              </Text>
            </TouchableOpacity>
          )}

          {/* 隐藏 clean expired 按钮 */}
          {/* <TouchableOpacity
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
          </TouchableOpacity> */}
        </View>
      </View>

      <FlatList
        key={`completed-grid-${cardsPerRow}`}
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
    backgroundColor: "#ccc8c8",
  },
  headerContainer: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    paddingHorizontal: PADDING,
    paddingRight: PADDING + 84,
    paddingVertical: 16,
    backgroundColor: "#333333",
    borderBottomWidth: 0,
    borderRadius: 12,
    marginHorizontal: PADDING,
    marginTop: PADDING,
    marginBottom: 16,
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
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: "#ccc8c8",
    padding: PADDING,
  },
  buttonGroup: {
    flexDirection: "row" as const,
    gap: 10,
  },
  recallButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FF9B2F",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  recallButtonActive: {
    backgroundColor: "#FF6B2F",
  },
  recallButtonInactive: {
    backgroundColor: "#FF9B2F",
  },
  cancelButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#666666",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cancelButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 13,
  },
  cleanButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#757575",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  disabledButton: {
    backgroundColor: "#e0e0e0",
    opacity: 0.6,
  },
  disabledButtonText: {
    color: "#999",
  },
  recallButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 13,
  },
  cleanButtonText: {
    color: "white",
    fontWeight: "600" as const,
    fontSize: 13,
  },
  buttonIcon: {
    marginRight: 6,
  },
  container: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: "#ccc8c8",
  },
  centerContent: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  noOrdersText: {
    fontSize: 38,
    color: "#888",
    textAlign: "center" as const,
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
};

const styles = { ...cardStyles, ...completedStyles };
