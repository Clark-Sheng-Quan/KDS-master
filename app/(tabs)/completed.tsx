import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  calculateCardWidth,
  calculateCardHeight,
} from "../../constants/cardConfig";

// Isolated cell — React.memo means only the 2 cards that change (deselect/select) re-render on selection
const CompletedOrderCell = React.memo<{
  completedOrder: any;
  style: any;
  isRecallMode: boolean;
  isSelected: boolean;
  onSelect: (order: FormattedOrder) => void;
}>(({ completedOrder, style, isRecallMode, isSelected, onSelect }) => {
  const displayOrder = useMemo(() => ({
    ...completedOrder.order,
    products: completedOrder.completedItems || completedOrder.order?.products || [],
  }), [completedOrder]);

  const handleSelect = useCallback(() => onSelect(displayOrder), [onSelect, displayOrder]);

  return (
    <OrderCard
      order={displayOrder}
      style={style}
      disabled={false}
      selectable={isRecallMode}
      selected={isSelected}
      onSelect={handleSelect}
      hideTimer={true}
      hideActions={true}
      rightCompact={true}
      scrollIndicatorAtBottom={true}
      disableItems={true}
      showDateInDue={true}
      completedTime={completedOrder.completedAt}
      hideBadges={true}
    />
  );
});

export default function CompletedScreen() {
  const { t } = useLanguage();
  const { completedOrders, removeCompletedOrder, loading: contextLoading } = useCompletedOrders();
  const { cardsPerRow, cardsPerColumn } = useSettings();
  const [selectedOrder, setSelectedOrder] = useState<FormattedOrder | null>(null);
  const [isRecallMode, setIsRecallMode] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [loading, setLoading] = useState(contextLoading);

  // Sync ref — always current before any render reads it, no useEffect lag
  const isRecallModeRef = React.useRef(isRecallMode);
  isRecallModeRef.current = isRecallMode;

  useEffect(() => {
    setLoading(contextLoading);
  }, [contextLoading]);

  // Stable forever — reads isRecallMode from ref to avoid stale closure
  const handleOrderSelectStable = useCallback((order: FormattedOrder) => {
    if (!isRecallModeRef.current) return;
    setSelectedOrder(order);
  }, []);

  const initialNumToRender = cardsPerRow * cardsPerColumn;

  const availableWidth = dimensions.width - PADDING * 2;
  const availableHeight = dimensions.height;

  const cardWidth = useMemo(
    () => calculateCardWidth(availableWidth, cardsPerRow),
    [availableWidth, cardsPerRow]
  );
  const cardHeight = useMemo(
    () => calculateCardHeight(availableHeight, cardsPerColumn),
    [availableHeight, cardsPerColumn]
  );

  // One stable style object per column position — doesn't change on order count changes
  const mergedCardStyles = useMemo(
    () =>
      Array.from({ length: cardsPerRow }, (_, colIndex) => ({
        ...completedStyles.cardStyle,
        width: cardWidth,
        height: cardHeight,
        marginRight: colIndex === cardsPerRow - 1 ? 0 : CARD_MARGIN,
      })),
    [cardWidth, cardHeight, cardsPerRow]
  );

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
      // 保持 recall 模式，只清除选中状态，方便继续 recall 其他订单
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
        data={completedOrders}
        extraData={{ isRecallMode, selectedId: selectedOrder?.id }}
        renderItem={({ item, index }) => (
          <CompletedOrderCell
            completedOrder={item}
            style={mergedCardStyles[index % cardsPerRow]}
            isRecallMode={isRecallMode}
            isSelected={selectedOrder?.id === item.order?.id}
            onSelect={handleOrderSelectStable}
          />
        )}
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
