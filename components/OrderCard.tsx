import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { ConfirmModal, showConfirmAlert } from "./ReuseComponents/ConfirmModal";
import { colors, sourceColors } from "../styles/color";
import { useLanguage } from "../contexts/LanguageContext";
import { useCompletedOrders } from "../contexts/CompletedOrderContext";
import { theme } from "../styles/theme";
import { ProductDetailPopup, checkProductHasRecipe } from "./ProductDetailPopup";
import { TCPSocketService } from "../services/tcpSocketService";
import { callingScreenService } from "../services/CallingScreenService";
import { callingScreenDiscovery } from "../services/CallingScreenDiscovery";
import { settingsListener } from "../services/settingsListener";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BASE_API } from "../config/api";

interface OrderCardProps {
  order: FormattedOrder;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  onOrderComplete?: (order: FormattedOrder) => void;
  onOrderCancel?: (order: FormattedOrder) => void;
  onItemRemoved?: (itemId: string, itemName: string, remainingOrder: FormattedOrder) => void;
  onItemCompleted?: (itemName: string, itemId: string, orderId: string) => void;  // 显示全局 Toast 时调用
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  hideTimer?: boolean;
  hideActions?: boolean;
  rightCompact?: boolean;
  scrollIndicatorAtBottom?: boolean;
  disableItems?: boolean;
  showDateInDue?: boolean;
  completedTime?: string;
  hideBadges?: boolean;
}

export const OrderCard: React.FC<OrderCardProps> = React.memo(({
  order,
  style,
  disabled = false,
  onOrderComplete,
  onOrderCancel,
  onItemRemoved,
  onItemCompleted,
  selectable = false,
  selected = false,
  onSelect,
  hideTimer = false,
  hideActions = false,
  rightCompact = false,
  scrollIndicatorAtBottom = false,
  disableItems = false,
  showDateInDue = false,
  completedTime,
  hideBadges = false,
}) => {
  const { t } = useLanguage();
  const { addCompletedOrder, removeCompletedOrder } = useCompletedOrders();

  const completedItemsRef = useRef<{ [key: string]: boolean }>({});  // 用 ref 替代 state，避免频繁重新渲染
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);  // 仅用于必要时触发重新渲染
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  
  // 项目级完成相关状态
  const [enableItemLevelCompletion, setEnableItemLevelCompletion] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastItemName, setToastItemName] = useState("");
  const [lastCompletedItemId, setLastCompletedItemId] = useState<string | null>(null);
  const [lastRemovedItem, setLastRemovedItem] = useState<any>(null);

  // Calling Button 状态
  const [enableCallingButton, setEnableCallingButton] = useState(false);
  const [callButtonPressed, setCallButtonPressed] = useState(false);  // 追踪是否点击过 Call 按钮

  // 加载项目级完成设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const enabled = await AsyncStorage.getItem("item_level_completion");
        setEnableItemLevelCompletion(enabled === "true");
        
        // 加载 Calling Button 设置
        const callingEnabled = await AsyncStorage.getItem("calling_button");
        setEnableCallingButton(callingEnabled === "true");
      } catch (error) {
        console.error("[OrderCard] 加载设置失败:", error);
      }
    };
    loadSettings();
  }, []);

  // 监听项目级完成模式设置变化（无需重启应用即可生效）
  useEffect(() => {
    const handleItemLevelCompletionChange = (value: boolean) => {
      setEnableItemLevelCompletion(value);
      console.log('[OrderCard] 项目级完成模式已更改:', value);
    };

    const handleCallingButtonChange = (value: boolean) => {
      setEnableCallingButton(value);
      console.log('[OrderCard] Calling Button 已更改:', value);
    };

    settingsListener.onSettingChange('item_level_completion', handleItemLevelCompletionChange);
    settingsListener.onSettingChange('calling_button', handleCallingButtonChange);

    return () => {
      settingsListener.offSettingChange('item_level_completion', handleItemLevelCompletionChange);
      settingsListener.offSettingChange('calling_button', handleCallingButtonChange);
    };
  }, []);

  useEffect(() => {
    if (contentHeight > 0 && scrollViewHeight > 0) {
      // 比较内容高度和ScrollView容器高度，加大判断阈值
      setIsScrollable(contentHeight > scrollViewHeight + 30);
    } else {
      setIsScrollable(false);
    }
  }, [contentHeight, scrollViewHeight, order.id]);

  // 项目级完成处理 - 单击 item 完成

  const handleItemLongPress = useCallback(async (item: any) => {
    if (disabled) return;
    const hasRecipe = await checkProductHasRecipe(item.id);
    if (!hasRecipe) return;
    setSelectedProduct({ id: item.id, name: item.name });
    setShowProductDetail(true);
  }, [disabled]);

  const handleDoneConfirm = async () => {
    // Update order status locally
    updateOrderStatusToReady(order._id, order.source || "");

    // Update order status to ready
    const updatedOrderWithStatus = updateLocalOrderStatus(order);

    // Add to completed orders
    addCompletedOrder(updatedOrderWithStatus, updatedOrderWithStatus.products || []).catch((error: any) => {
      console.error('[OrderCard] Failed to add completed order:', error);
    });

    // Notify Calling Screen
    const orderNumber = String(order.num || order.id.substring(0, 8));
    const itemCount = order.products.reduce((total, item) => total + (item.quantity || 1), 0);
    const device = callingScreenDiscovery.getCachedDevice();
    if (device) {
      if (enableCallingButton) {
        // If Calling Button enabled
        if (!callButtonPressed) {
          // If Call button was NOT pressed, send "ready" first, then "served"
          callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
            console.warn('[OrderCard] Failed to notify Calling Screen (ready):', error);
          });
        }
        // Always send "served" when Done is pressed
        callingScreenService.notifyOrderServed(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
          console.warn('[OrderCard] Failed to notify Calling Screen (served):', error);
        });
      } else {
        // If Calling Button disabled: send "ready" notification only (legacy behavior)
        callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
          console.warn('[OrderCard] Failed to notify Calling Screen (ready):', error);
        });
      }
    }

    // Reset call button state for next order
    setCallButtonPressed(false);

    onOrderComplete?.(updatedOrderWithStatus);
  };

  // Handle Call button press - send "ready" notification
  const handleCallPressed = useCallback(() => {
    setCallButtonPressed(true);  // Mark that Call button has been pressed
    const orderNumber = String(order.num || order.id.substring(0, 8));
    const itemCount = order.products.reduce((total, item) => total + (item.quantity || 1), 0);
    const device = callingScreenDiscovery.getCachedDevice();
    if (device) {
      callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
        console.warn('[OrderCard] Failed to send ready notification:', error);
      });
    }
  }, [order]);



  const updateOrderStatusToReady = (orderId: string, source: string) => {
    try {
      const normalizedSource = source.toLowerCase();
      
      
      // Network orders: also send backend request to update status
      if (normalizedSource === "network") {
        AsyncStorage.getItem("token").then((token) => {
          if (!token) {
            console.warn('[updateOrderStatusToReady] No token available, cannot update backend status');
            return;
          }

          // Send request in background without blocking UI
          fetch(`${BASE_API}/order/update_order_status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, status: "ready", source }),
          }).catch((error) => {
            console.error('[updateOrderStatusToReady] Exception:', error);
          });
        }).catch((error) => {
          console.error('[updateOrderStatusToReady] Failed to retrieve token:', error);
        });
      } 
    } catch (error) {
      console.error('[updateOrderStatusToReady] Exception:', error);
    }
  };

  // Update local order status to "ready"
  const updateLocalOrderStatus = (updatedOrder: FormattedOrder): FormattedOrder => {
    return {
      ...updatedOrder,
      status: "ready"
    };
  };

  // 完成单个项目 - 从 order.products 中移除该项目
  const completeItemOnly = useCallback(async (item: any) => {
    try {
      const itemName = item.name || "Item";
      
      // 从 order.products 中移除该项目
      const updatedProducts = order.products?.filter((p: any) => p.id !== item.id) || [];
      let updatedOrder = {
        ...order,
        products: updatedProducts,
      };

      // 显示 Toast
      setToastItemName(itemName);
      setLastCompletedItemId(item.id);
      setLastRemovedItem(item);  // 保存被移除的项目，用于 Undo
      setToastVisible(true);
      onItemCompleted?.(itemName, item.id, order.id);  // 通知父组件显示全局 Toast

      // 添加单项完成记录到 completed orders
      await addCompletedOrder(order, [item]);

      console.log(`[OrderCard] Item completed and removed: ${itemName} (${item.id}), remaining items: ${updatedProducts.length}`);

      // 通知父组件项目已移除
      onItemRemoved?.(item.id, itemName, updatedOrder);

      // 如果全部项目都移除了，标记订单为完成（立即，不延迟）
      if (updatedProducts.length === 0) {
        console.log(`[OrderCard] All items completed, marking order as complete: ${order.id}`);
        // Update order status to ready before calling onOrderComplete
        updatedOrder = updateLocalOrderStatus(updatedOrder);
        
        // Notify Calling Screen
        const orderNumber = String(order.num || order.id.substring(0, 8));
        const itemCount = updatedOrder.products.reduce((total, item) => total + (item.quantity || 1), 0);
        const device = callingScreenDiscovery.getCachedDevice();
        if (device) {
          if (enableCallingButton) {
            // If Calling Button enabled
            if (!callButtonPressed) {
              // If Call button was NOT pressed, send "ready" first, then "served"
              callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
                console.warn('[OrderCard] Failed to notify Calling Screen (ready, item-level):', error);
              });
            }
            // Always send "served" when all items are completed
            callingScreenService.notifyOrderServed(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
              console.warn('[OrderCard] Failed to notify Calling Screen (served, item-level):', error);
            });
          } else {
            // If Calling Button disabled: send "ready" notification only (legacy behavior)
            callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
              console.warn('[OrderCard] Failed to notify Calling Screen (ready, item-level):', error);
            });
          }
        }
        
        // Reset call button state for next order
        setCallButtonPressed(false);
        
        // 立即调用，让 home 中的 handleItemRemoved 立即删除订单
        onOrderComplete?.(updatedOrder);
      } else {
        // 通知 POS 或后端
        const source = order.source || 'tcp';
        updateOrderStatusToReady(order.id, source);
      }
    } catch (error) {
      console.error('[completeItemOnly] Exception:', error);
      setToastVisible(false);
    }
  }, [order, addCompletedOrder, onItemRemoved, onOrderComplete, onItemCompleted]);

  // 撤回单项完成 - 恢复项目到 order.products
  const undoItemCompletion = useCallback(() => {
    if (lastCompletedItemId && lastRemovedItem) {
      console.log(`[OrderCard] 撤回项目完成: ${lastCompletedItemId}, 恢复项目回 order`);
      
      // 将被移除的项目恢复到 order.products
      const restoredProducts = [lastRemovedItem, ...(order.products || [])];
      const restoredOrder = {
        ...order,
        products: restoredProducts,
      };

      // 从完成列表中删除该项目的完成记录
      removeCompletedOrder(order.id, lastCompletedItemId);
      
      // 通知父组件项目已恢复
      onItemRemoved?.(lastCompletedItemId, lastRemovedItem.name || "Item", restoredOrder);
      
      setLastCompletedItemId(null);
      setLastRemovedItem(null);
      setToastVisible(false);
    }
  }, [lastCompletedItemId, lastRemovedItem, order, removeCompletedOrder, onItemRemoved]);
  
  // 判断是否应该显示数量（只有 >= 2 时才显示）
  const shouldShowQuantity = (quantity: any): boolean => {
    const num = parseInt(String(quantity), 10);
    return !isNaN(num) && num >= 2;
  };

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
  const formattedDueTime = useMemo(() => {
    try {
      const date = new Date(order.pickupTime);
      if (isNaN(date.getTime())) return order.pickupTime;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      if (showDateInDue) {
        // pre-orders: 显示完整日期
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const year = date.getFullYear();
        return `${day}-${month}-${year} • ${hours}:${minutes}`;
      } else {
        // home/history/completed: 只显示24小时制时间
        return `${hours}:${minutes}`;
      }
    } catch (error) {
      return order.pickupTime;
    }
  }, [order.pickupTime, showDateInDue]);

  // 格式化完成时间 - 仅显示时间部分
  const formattedCompletedTime = useMemo(() => {
    if (!completedTime) return '';
    try {
      const date = new Date(completedTime);
      if (isNaN(date.getTime())) return completedTime;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${hours}:${minutes}`;
    } catch (error) {
      return completedTime;
    }
  }, [completedTime]);

  const getPickupMethodDisplay = (method?: string) => {
    const lower = method?.toLowerCase() || '';
    if (lower === 'take-away') return { text: t("takeAway"), color: '#FF9B2F' };
    if (lower === 'dine_in' || lower === 'dinein') return { text: t("dineIn"), color: '#0096FF' };
    return { text: method || t("dineIn"), color: '#0096FF' };
  };


  const renderProductItem = useCallback((item: any, index: number) => {
    const isVoided = item.itemState === 'VOIDED';

    const handleItemPress = () => {
      if (disableItems || disabled || isVoided) return;
      
      const itemKey = `${order.id}-item-${index}`;
      
      if (enableItemLevelCompletion) {
        // 项目级完成模式：完成单项
        completeItemOnly(item);
      } else {
        // 普通模式：标记 item 完成（仅用于显示，不实际移除）
        completedItemsRef.current[itemKey] = !completedItemsRef.current[itemKey];
        setForceUpdateTrigger(prev => prev + 1);
      }
    };

    return (
      <View key={`${order.id}-item-${index}`} style={styles.itemContainer}>
        <View style={styles.itemDivider} />
        <TouchableOpacity
          onPress={handleItemPress}
          onLongPress={() => !disableItems && !isVoided && handleItemLongPress(item)}
          disabled={disableItems || disabled || isVoided}
          activeOpacity={disableItems || isVoided ? 1 : 0.7}
          style={[
            styles.itemRow,
            completedItemsRef.current[`${order.id}-item-${index}`] && styles.completedItem,
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
            <Text style={styles.cancelledText}>{t("cancelled")}</Text>
          ) : !enableItemLevelCompletion && completedItemsRef.current[`${order.id}-item-${index}`] ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.checkColor} />
          ) : (
            <Text style={styles.itemQuantity}>x{item.quantity}</Text>
          )}
        </TouchableOpacity>

        {item.options?.length > 0 && (
          <View style={styles.optionsContainer}>
            {item.options.map((option: any, optIndex: number) => (
              <View
                key={`${order.id}-item-${index}-option-${optIndex}`}
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
                    - {option.name}{''}
                  </Text>
                  {shouldShowQuantity(option.value) && (
                    <Text style={[styles.optionValue, isVoided && styles.voidedText]}>
                       x{option.value}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

      </View>
    );
  }, [disabled, disableItems, handleItemLongPress, shouldShowQuantity, enableItemLevelCompletion, completeItemOnly, order.id, forceUpdateTrigger]);

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
          selected && styles.selectedCard,
          style,
        ]}
      >
        {/* 订单更新指示器 - 左上角 */}
        {!hideBadges && order.updateCount && order.updateCount >= 1 && (
          <View style={styles.updateBadge}>
            <Ionicons name="refresh" size={14} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.updateBadgeText}>
              {t("updated")}{order.updateCount > 1 ? ` ${order.updateCount}` : ''}
            </Text>
          </View>
        )}

        {/* 召回订单指示器 - 在updateBadge右边
        {!hideBadges && order.isRecalled && (
          <View style={[
            styles.recallBadge,
            order.updateCount && order.updateCount >= 1 ? styles.recallBadgeWithUpdate : null
          ]}>
            <Ionicons name="arrow-redo" size={14} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.recallBadgeText}>RECALLED</Text>
          </View>
        )} */}

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
          scrollIndicatorInsets={{ right: 0 }}
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
                    {t("prepare")}: <Text style={styles.prepareTimeValue}>{order.total_prepare_time}</Text> min
                  </Text>
                )}
                <Text style={styles.prepareTime}>
                  {t("table")}: <Text style={styles.prepareTimeValue}>{order.tableNumber || 'N/A'}</Text>
                </Text>

              </View>
              {/* 右列 */}
              <View style={[styles.rightColumn, rightCompact && styles.rightColumnCompact]}>
                <Text style={styles.dueTimeText}>{t("due")}: {formattedDueTime}</Text>
                {completedTime && (
                  <Text style={styles.completedTimeDisplay}>
                    {t("completedAt")}: {formattedCompletedTime}
                  </Text>
                )}
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

        {!disabled && !hideActions && (
          <OrderActions
            orderId={order.id}
            onDone={handleDoneConfirm}
            onCancel={() => {}}
            onCall={handleCallPressed}
            showCallButton={enableCallingButton}
            callButtonPressed={callButtonPressed}
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
}, (prevProps, nextProps) => {
  // 自定义比较函数 - 只有这些 props 改变时才重新渲染
  return (
    prevProps.order.id === nextProps.order.id &&
    prevProps.selected === nextProps.selected &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.style === nextProps.style &&
    prevProps.completedTime === nextProps.completedTime
  );
})

export default OrderCard;

const styles = StyleSheet.create({
  orderCard: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    // height: 600,
    // width: 360,
    display: "flex",
    flexDirection: "column",
    position: "relative",
    marginRight: 6,
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
    borderRightWidth: 3,
    borderRightColor: "#e0e0e0",
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
    marginBottom: 6,
    textAlign: "right" as const,
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
  completedTimeDisplay: {
    fontSize: 13,
    color: "#999",
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 8,
    textAlign: "right" as const,
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
    fontSize: 16,
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
    borderRadius: 12,
    padding: 2,
  },
});
