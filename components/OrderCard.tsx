import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from "react-native";
import { FormattedOrder } from "../services/types";
import { Ionicons } from "@expo/vector-icons";
import { OrderTimer } from "./OrderTimer";
import { OrderActions } from "./OrderActions";
import { PrintButton } from "./PrintButton";
import { ConfirmModal } from "./ReuseComponents/ConfirmModal";
import { colors, sourceColors } from "../styles/color";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategoryColors } from "../contexts/CategoryColorContext";
import { theme } from "../styles/theme";
import { ProductDetailPopup, checkProductHasRecipe } from "./ProductDetailPopup";
import { TCPSocketService } from "../services/tcpSocketService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BASE_API } from "../config/api";

interface OrderCardProps {
  order: FormattedOrder;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onOrderComplete?: (order: FormattedOrder) => void;
  onOrderCancel?: (order: FormattedOrder) => void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  hideTimer?: boolean;
  hideActions?: boolean;
  rightCompact?: boolean;
  scrollIndicatorAtBottom?: boolean;
  disableItems?: boolean;
  showDateInDue?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = React.memo(({
  order,
  style,
  disabled = false,
  onOrderComplete,
  onOrderCancel,
  selectable = false,
  selected = false,
  onSelect,
  hideTimer = false,
  hideActions = false,
  rightCompact = false,
  scrollIndicatorAtBottom = false,
  disableItems = false,
  showDateInDue = false,
}) => {
  const { t } = useLanguage();
  const { getCategoryColor, categoryColorMap } = useCategoryColors();

  const [completedItems, setCompletedItems] = useState<{ [key: string]: boolean }>({});
  const [completedOptions, setCompletedOptions] = useState<{ [key: string]: boolean }>({});
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);

  useEffect(() => {
    if (contentHeight > 0 && scrollViewHeight > 0) {
      // 比较内容高度和ScrollView容器高度
      setIsScrollable(contentHeight > scrollViewHeight);
    } else {
      setIsScrollable(false);
    }
  }, [contentHeight, scrollViewHeight, order.id]);

  // 处理事件
  const handleItemClick = (itemId: string) => {
    if (disabled) return;
    setCompletedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleOptionClick = (optionId: string, event: any) => {
    if (disabled) return;
    event.stopPropagation();
    setCompletedOptions((prev) => ({ ...prev, [optionId]: !prev[optionId] }));
  };

  const handleItemLongPress = async (item: any) => {
    if (disabled) return;
    const hasRecipe = await checkProductHasRecipe(item.id);
    if (!hasRecipe) return;
    setSelectedProduct({ id: item.id, name: item.name });
    setShowProductDetail(true);
  };

    const handleDoneConfirm = () => {
    setShowDoneConfirm(false);
    updateOrderStatusToReady(order._id, order.source || "");

    if (order.source?.toLowerCase() === 'tcp') {
      const { TCPSocketService } = require('../services/tcpSocketService');
      
      // 构建订单项数组 - 只发送显示的items（如果有过滤的话）
      // 如果order._hasFilteredItems为true，只发送当前显示的products（已过滤）
      // 否则发送所有products
      const orderitems = order.products?.map((item: any) => ({
        id: item.id,
        name: item.name,
        qty: item.quantity || item.qty,
        category: item.category,
      })) || [];
      TCPSocketService.sendOrderItemsCompleted(order._id, orderitems);
    }

    onOrderComplete?.(order);
  };

  const updateOrderStatusToReady = async (orderId: string, source: string) => {
    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        console.warn('[updateOrderStatusToReady] 没有token，无法更新状态');
        return;
      }

      // 只有网络订单才需要更新状态
      if (source.toLowerCase() === "network") {
        const response = await fetch(`${BASE_API}/order/update_order_status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId, status: "ready", source }),
        });
        if (!response.ok) throw new Error(`HTTP错误! 状态: ${response.status}`);
      }
    } catch (error) {
      console.error('[updateOrderStatusToReady] 异常:', error);
    }
  };

  // 工具函数
  const safeText = (text: string | undefined) => text || "null";

  const getOrderDisplayNumber = () => {
    // 如果 num 存在且不等于完整的 id（表示是真正的订单号）
    if (typeof order.num === 'string' || typeof order.num === 'number') {
      const numStr = String(order.num);
      if (numStr.length > 20) return numStr.substring(0, 8);
      return numStr;
    }
    return order.id.substring(0, 8) || 'N/A';
  };

  // 格式化Due时间 - 根据showDateInDue决定是否显示日期
  const formatDueTime = (timeString: string) => {
    try {
      const date = new Date(timeString);
      if (isNaN(date.getTime())) return timeString;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      if (showDateInDue) {
        // pre-orders: 显示完整日期
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${hours}:${minutes} • ${day}-${month}-${year}`;
      } else {
        // home/history: 只显示时间
        return `${hours}:${minutes}`;
      }
    } catch (error) {
      return timeString;
    }
  };

  const getPickupMethodDisplay = (method?: string) => {
    const lower = method?.toLowerCase() || '';
    if (lower === 'take-away') return { text: 'Take-Away', color: '#FF9B2F' };
    if (lower === 'dine_in' || lower === 'dinein') return { text: 'Dine-In', color: '#0096FF' };
    return { text: method || 'Dine-In', color: '#0096FF' };
  };


  const renderProductItem = (item: any, index: number) => {
    const categoryColor = getCategoryColor(item.category);
    const isVoided = item.itemState === 'VOIDED';

    return (
      <View key={`${order.id}-item-${index}`} style={styles.itemContainer}>
        <TouchableOpacity
          onPress={() => !disableItems && !isVoided && handleItemClick(`${order.id}-item-${index}`)}
          onLongPress={() => !disableItems && !isVoided && handleItemLongPress(item)}
          disabled={disableItems || disabled || isVoided}
          activeOpacity={disableItems || isVoided ? 1 : 0.7}
          style={[
            styles.itemRow,
            completedItems[`${order.id}-item-${index}`] && styles.completedItem,
            isVoided && styles.voidedItem,
            (!item.options || item.options.length === 0) && {
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
            }
          ]}
          delayLongPress={500}
        >
          <View style={styles.itemNameContainer}>
            <Text style={[styles.itemName, isVoided && styles.voidedText]}>
              {item.name}
            </Text>
          </View>
          {isVoided ? (
            <Text style={styles.cancelledText}>Cancelled</Text>
          ) : completedItems[`${order.id}-item-${index}`] ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.checkColor} />
          ) : (
            <Text style={[styles.itemQuantity, { color: categoryColor }]}>x{item.quantity}</Text>
          )}
        </TouchableOpacity>

        {item.options?.length > 0 && (
          <View style={styles.optionsContainer}>
            {item.options.map((option: any, optIndex: number) => (
              <TouchableOpacity
                key={`${order.id}-item-${index}-option-${optIndex}`}
                onPress={(e) => !disableItems && !isVoided && handleOptionClick(`${order.id}-item-${index}-option-${optIndex}`, e)}
                disabled={disableItems || disabled || isVoided}
                activeOpacity={disableItems || isVoided ? 1 : 0.7}
                style={[
                  styles.optionRow,
                  isVoided && styles.voidedOption,
                  optIndex === item.options.length - 1 && {
                    borderBottomLeftRadius: 4,
                    borderBottomRightRadius: 4,
                  }
                ]}
              >
                <View style={styles.optionContent}>
                  <Text style={[styles.optionName, isVoided && styles.voidedText]}>
                    - {option.name}
                  </Text>
                  <Text style={[styles.optionValue, isVoided && styles.voidedText]}>
                    x{safeText(option.value)}
                  </Text>
                </View>
                {!isVoided && completedOptions[`${order.id}-item-${index}-option-${optIndex}`] && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.checkColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.itemDivider} />
      </View>
    );
  };

  if (!order.products || !Array.isArray(order.products)) {
    console.error('[OrderCard] Order has no products array:', order);
    return null;
  }

  const CardWrapper = selectable ? TouchableOpacity : View;
  const cardWrapperProps = selectable
    ? { activeOpacity: disabled ? 1 : 0.7, onPress: onSelect }
    : {};

  return (
    <CardWrapper {...cardWrapperProps}>
      <View
        style={[
          styles.orderCard,
          style,
          order.isRecalled && styles.recalledOrder,
          selected && styles.selectedCard,
        ]}
      >
        {/* 订单更新指示器 - 左上角 */}
        {order.updateCount && order.updateCount >= 1 && (
          <View style={styles.updateBadge}>
            <Ionicons name="refresh" size={14} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.updateBadgeText}>
              UPDATED{order.updateCount > 1 ? ` ${order.updateCount}` : ''}
            </Text>
          </View>
        )}

        {/* 召回订单指示器 - 在updateBadge右边 */}
        {order.isRecalled && (
          <View style={[
            styles.recallBadge,
            order.updateCount && order.updateCount >= 1 ? styles.recallBadgeWithUpdate : null
          ]}>
            <Ionicons name="arrow-redo" size={14} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.recallBadgeText}>RECALLED</Text>
          </View>
        )}

        <ConfirmModal
          visible={showDoneConfirm}
          title={t("complete")}
          message={`${t("confirmComplete")} #${getOrderDisplayNumber()}?`}
          confirmText={t("complete")}
          cancelText={t("cancel")}
          onConfirm={handleDoneConfirm}
          onCancel={() => setShowDoneConfirm(false)}
        />

        {selectedProduct && (
          <ProductDetailPopup
            visible={showProductDetail}
            onClose={() => setShowProductDetail(false)}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        )}

        <ScrollView
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
          scrollIndicatorInsets={{ right: 1 }}
          style={styles.scrollViewContainer}
          onLayout={(event) => {
            // 获取ScrollView容器的实际高度
            const { height } = event.nativeEvent.layout;
            setScrollViewHeight(height);
          }}
          onContentSizeChange={(width, height) => {
            // ScrollView的总内容高度
            setContentHeight(height);
          }}
        >
          <View style={styles.textContainer}>
            {/* 新 Header 设计 - 左右两列 */}
            <View style={styles.headerLayout}>
              {/* 左列 */}
              <View style={styles.leftColumn}>
                <Text style={styles.orderId}>#{getOrderDisplayNumber()}</Text>
                <Text style={[styles.pickupMethodText, { color: getPickupMethodDisplay(order.pickupMethod).color }]}>
                  {getPickupMethodDisplay(order.pickupMethod).text}
                </Text>
                {typeof order.total_prepare_time === 'number' && order.total_prepare_time > 0 && (
                  <Text style={styles.prepareTime}>
                    {t("Prepare")}: <Text style={styles.prepareTimeValue}>{order.total_prepare_time}</Text> min
                  </Text>
                )}
                <Text style={styles.prepareTime}>
                  Table: <Text style={styles.prepareTimeValue}>{order.tableNumber || 'N/A'}</Text>
                </Text>
              </View>
              {/* 右列 */}
              <View style={[styles.rightColumn, rightCompact && styles.rightColumnCompact]}>
                <Text style={styles.dueTimeText}>Due: {formatDueTime(order.pickupTime)}</Text>
                {!disabled && !hideTimer && <OrderTimer order={order} />}
                <PrintButton order={order} disabled={disabled} />
              </View>
            </View>
            
            {/* 商品 */}
            <View style={styles.itemsContainer}>
              {order.products?.map((item, index) => renderProductItem(item, index))}
            </View>
          </View>
        </ScrollView>

        {/* 只在可以滚动时显示提示 - 固定在右下角 */}
        {isScrollable && (
          <View style={[styles.scrollIndicatorText, scrollIndicatorAtBottom && styles.scrollIndicatorAtBottom]}>
            <Text style={styles.scrollMoreText}>↓ more items</Text>
          </View>
        )}
        {!disabled && !hideActions && (
          <OrderActions
            orderId={order.id}
            onDone={() => setShowDoneConfirm(true)}
            onCancel={() => {}}
          />
        )}

        {/* 如果是可选择的，显示选择状态指示器 */}
        {selectable && (
          <View style={styles.selectIndicator}>
            <Ionicons
              name={selected ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={selected ? theme.colors.primaryColor : "#999"}
            />
          </View>
        )}
      </View>
    </CardWrapper>
  );
})

export default OrderCard;

const styles = StyleSheet.create({
  orderCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 12,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    height: 600,
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  compactCard: {
    paddingTop: 0,
  },
  updateBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#FF9B2F",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  updateBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  recallBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "#FF6B35",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recallBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  recallBadgeWithUpdate: {
    left: 118, // updateBadge宽度约110px，所以放在右边
  },
  scrollViewContainer: {
    flex: 1,
    minHeight: 0,
  },
  textContainer: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 10,
    display: "flex",
    flexDirection: "column",
  },
  orderId: {
    fontSize: 32, 
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  headerLayout: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 12,
  },
  leftColumn: {
    flex: 1,
    justifyContent: "flex-start",
  },
  rightColumn: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  rightColumnCompact: {
    marginTop: 25,
  },
  pickupMethodText: {
    fontSize: 18,
    fontWeight: "600",
  },
  dueTimeText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 12
  },
  prepareTime: {
    fontSize: 18,
    color: "#666",
    marginTop: 12,
    flexWrap: "nowrap",
  },
  prepareTimeValue: {
    fontSize: 18,
    color: "#333",
    fontWeight: "bold",
  },
  itemsContainer: {
    marginTop: 20, 
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    opacity: 1,
  },
  itemNameContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    flex: 1,
  },
  itemName: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  itemQuantity: {
    fontSize: 18,
    fontWeight: "700",
    color: "#007AFF",
    marginLeft: 12,
  },
  optionsContainer: {
    marginTop: 0,
    marginLeft: 8,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 0,
  },
  optionContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
  },
  optionName: {
    fontSize: 16,
    color: "#555",
    fontWeight: "500",
  },
  optionValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "bold",
  },
  itemDivider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    marginVertical: 2,
  },
  itemContainer: {
    marginBottom: 4,
  },
  completedItem: {
    opacity: 0.6,
    backgroundColor: "#e0e0e0",
  },
  voidedItem: {
    backgroundColor: "#f5f5f5",
    opacity: 0.7,
  },
  voidedText: {
    textDecorationLine: "line-through",
    color: "#999",
  },
  voidedOption: {
    backgroundColor: "#f8f8f8",
    opacity: 0.7,
  },
  cancelledText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff4444",
    marginLeft: 12,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: theme.colors.primaryColor,
  },
  selectIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 2,
  },
  recalledOrder: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.warningColor,
  },
  scrollIndicatorText: {
    position: "absolute",
    bottom: 50,
    right: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 4,
  },
  scrollIndicatorAtBottom: {
    bottom: 0,
  },
  scrollMoreText: {
    fontSize: 11,
    color: "#00a8e8",
    fontWeight: "600",
  },
});
