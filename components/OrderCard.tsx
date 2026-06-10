import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
  InteractionManager,
} from "react-native";
import { FormattedOrder } from "../services/types";
import { Ionicons } from "@expo/vector-icons";
import { OrderTimer } from "./OrderTimer";
import { OrderActions } from "./OrderActions";
import { PrintButton } from "./PrintButton";
import { ConfirmModal, showConfirmAlert } from "./ConfirmModal";
import { colors, sourceColors, categoryColors, theme, CARD_TITLE_FONT_SIZES, ITEM_OPTION_FONT_SIZES } from "../constants/theme";
import { useLanguage } from "../contexts/LanguageContext";
import { useCompletedOrders } from "../contexts/CompletedOrderContext";
import { useSettings } from "../contexts/SettingsContext";
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
  enableDelayEffects?: boolean;
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
  enableDelayEffects = false,
}) => {
  const { t } = useLanguage();
  const { addCompletedOrder, removeCompletedOrder } = useCompletedOrders();
  const { 
    itemLevelCompletion: enableItemLevelCompletion, 
    callingButton: enableCallingButton,
    cardTitleFontSize,
    itemOptionFontSize,
    categoryColorsMapping: colorMapping,
  } = useSettings();

  const completedItemsRef = useRef<{ [key: string]: boolean }>({});  // 用 ref 替代 state，避免频繁重新渲染
  const itemCompletedAtRef = useRef<{ [key: string]: string }>({});
  const completionInitSignatureRef = useRef<{ [orderId: string]: string }>({});
  const lastTapTimeRef = useRef<{ [key: string]: number }>({});  // 用于双击检测
  const [forceUpdateTrigger, setForceUpdateTrigger] = useState(0);  // 仅用于必要时触发重新渲染
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  
  // 项目级完成相关状态
  const [toastVisible, setToastVisible] = useState(false);
  const [toastItemName, setToastItemName] = useState("");
  const [lastCompletedItemId, setLastCompletedItemId] = useState<string | null>(null);
  const [lastCompletedEntryKey, setLastCompletedEntryKey] = useState<string | null>(null);
  const [lastRemovedItem, setLastRemovedItem] = useState<any>(null);

  // Calling Button 状态
  const [callButtonPressed, setCallButtonPressed] = useState(false);  // 追踪是否点击过 Call 按钮
  const [timerSeverity, setTimerSeverity] = useState<"normal" | "urgent" | "delayed">("normal");

  // 屏幕方向检测
  const { width, height } = useWindowDimensions();
  const isPortrait = height > width;

  useEffect(() => {
    if (contentHeight > 0 && scrollViewHeight > 0) {
      // 比较内容高度和ScrollView容器高度，加大判断阈值
      setIsScrollable(contentHeight > scrollViewHeight + 30);
    } else {
      setIsScrollable(false);
    }
  }, [contentHeight, scrollViewHeight, order.id]);

  // 撤回整单后，按 completedItemIds 恢复 whole 模式的已完成标记
  useEffect(() => {
    if (enableItemLevelCompletion) {
      return;
    }

    const completedIds = Array.isArray(order.completedItemIds) ? order.completedItemIds : [];
    const signature = [...completedIds].sort().join("|");

    if (completionInitSignatureRef.current[order.id] === signature) {
      return;
    }

    // 先清掉当前订单旧状态，再按 item id 重新映射到当前 index
    Object.keys(completedItemsRef.current).forEach((key) => {
      if (key.startsWith(`${order.id}-item-`)) {
        delete completedItemsRef.current[key];
        delete itemCompletedAtRef.current[key];
      }
    });

    if (completedIds.length > 0) {
      const completedSet = new Set(completedIds);
      (order.products || []).forEach((item, index) => {
        if (completedSet.has(item.id)) {
          const key = `${order.id}-item-${index}`;
          completedItemsRef.current[key] = true;
          itemCompletedAtRef.current[key] = new Date().toISOString();
        }
      });
    }

    completionInitSignatureRef.current[order.id] = signature;
    setForceUpdateTrigger((prev) => prev + 1);
  }, [order.id, order.products, order.completedItemIds, enableItemLevelCompletion]);

  // 项目级完成处理 - 单击 item 完成

  const handleItemLongPress = useCallback(async (item: any) => {
    if (disabled) return;
    const hasRecipe = await checkProductHasRecipe(item.id);
    if (!hasRecipe) return;
    setSelectedProduct({ id: item.id, name: item.name });
    setShowProductDetail(true);
  }, [disabled]);

  const handleDoneConfirm = () => {
    // Update order status locally
    updateOrderStatusToReady(order._id, order.source || "");

    // whole 模式下记录当前已完成的 item，用于撤回整单后恢复完成状态
    const completedItemIds = !enableItemLevelCompletion
      ? (order.products || [])
          .filter((_, index) => completedItemsRef.current[`${order.id}-item-${index}`])
          .map((item) => item.id)
      : [];

    // Update order status to ready
    const updatedOrderWithStatus = updateLocalOrderStatus({
      ...order,
      completedItemIds,
    });

    // Notify Calling Screen
    const orderNumber = String(order.num);
    const itemCount = order.products.reduce((total, item) => total + (item.quantity || 1), 0);
    const device = callingScreenDiscovery.getCachedDevice();
    if (device) {
      if (enableCallingButton) {
        if (!callButtonPressed) {
          callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
            console.warn('[OrderCard] Failed to notify Calling Screen (ready):', error);
          });
        }
        callingScreenService.notifyOrderServed(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
          console.warn('[OrderCard] Failed to notify Calling Screen (served):', error);
        });
      } else {
        callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
          console.warn('[OrderCard] Failed to notify Calling Screen (ready):', error);
        });
      }
    }

    setCallButtonPressed(false);

    // Trigger UI removal immediately — before any async/heavy work
    onOrderComplete?.(updatedOrderWithStatus);

    // Defer the heavy recording until all animations have settled
    const doneAt = new Date().toISOString();
    const snapshotItemCompletedAt = { ...itemCompletedAtRef.current };
    InteractionManager.runAfterInteractions(() => {
      const completedItemsWithTime = (updatedOrderWithStatus.products || []).map((item, index) => {
        const itemKey = `${order.id}-item-${index}`;
        const completedAt = snapshotItemCompletedAt[itemKey] || doneAt;
        return {
          ...item,
          __completedAt: completedAt,
          __completedElapsedSeconds: toElapsedSecondsFromStart(completedAt),
        };
      });
      addCompletedOrder(updatedOrderWithStatus, completedItemsWithTime).catch((error: any) => {
        console.error('[OrderCard] Failed to add completed order:', error);
      });
    });
  };

  // Handle Call button press - send "ready" notification
  const handleCallPressed = useCallback(() => {
    setCallButtonPressed(true);  // Mark that Call button has been pressed
    const orderNumber = String(order.num);
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

      // 立即通知父组件项目已移除 — 不等待 AsyncStorage 写入，保证 UI 立即响应
      onItemRemoved?.(item.id, itemName, updatedOrder);

      // 如果全部项目都移除了，立即标记订单为完成
      if (updatedProducts.length === 0) {
        updatedOrder = updateLocalOrderStatus(updatedOrder);

        // Notify Calling Screen
        const orderNumber = String(order.num);
        const itemCount = updatedOrder.products.reduce((total, item) => total + (item.quantity || 1), 0);
        const device = callingScreenDiscovery.getCachedDevice();
        if (device) {
          if (enableCallingButton) {
            if (!callButtonPressed) {
              callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
                console.warn('[OrderCard] Failed to notify Calling Screen (ready, item-level):', error);
              });
            }
            callingScreenService.notifyOrderServed(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
              console.warn('[OrderCard] Failed to notify Calling Screen (served, item-level):', error);
            });
          } else {
            callingScreenService.notifyOrderReady(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
              console.warn('[OrderCard] Failed to notify Calling Screen (ready, item-level):', error);
            });
          }
        }

        setCallButtonPressed(false);
        onOrderComplete?.(updatedOrder);
      } else {
        const source = order.source || 'tcp';
        updateOrderStatusToReady(order.id, source);
      }

      // Snapshot timestamp now for accuracy; defer heavy write until after animations
      const completedAt = new Date().toISOString();
      const snapshotItem = { ...item };
      const snapshotOrder = order;
      InteractionManager.runAfterInteractions(() => {
        addCompletedOrder(snapshotOrder, [{
          ...snapshotItem,
          __completedAt: completedAt,
          __completedElapsedSeconds: toElapsedSecondsFromStart(completedAt),
        }]).then((completedEntries) => {
          setLastCompletedEntryKey(completedEntries[0]?.completionKey || null);
        }).catch((error) => {
          console.error('[OrderCard] Failed to add completed order:', error);
        });
      });
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
      removeCompletedOrder(order.id, lastCompletedItemId, lastCompletedEntryKey || undefined);
      
      // 通知父组件项目已恢复
      onItemRemoved?.(lastCompletedItemId, lastRemovedItem.name || "Item", restoredOrder);
      
      setLastCompletedItemId(null);
      setLastCompletedEntryKey(null);
      setLastRemovedItem(null);
      setToastVisible(false);
    }
  }, [lastCompletedItemId, lastCompletedEntryKey, lastRemovedItem, order, removeCompletedOrder, onItemRemoved]);
  
  // 判断是否应该显示数量（只有 >= 2 时才显示）
  const shouldShowQuantity = useCallback((quantity: any): boolean => {
    const num = parseInt(String(quantity), 10);
    return !isNaN(num) && num >= 2;
  }, []);

  const getOrderDisplayNumber = () => {
    // order.num 现在已经由 formatter 生成，肯定有值
    const numStr = String(order.num);
    if (numStr.length > 20) return numStr.substring(0, 8);
    return numStr;
  };

  // 格式化OrderTime - 根据showDateInDue决定是否显示日期
  const formattedOrderTime = useMemo(() => {
    try {
      const date = new Date(order.orderTime);
      if (isNaN(date.getTime())) return order.orderTime;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      if (showDateInDue) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${hours}:${minutes}/${day}/${month}`;
      }

      return `${hours}:${minutes}`;
    } catch (error) {
      return order.orderTime;
    }
  }, [order.orderTime, showDateInDue]);

  // 格式化完成时间 - 显示具体时刻
  const formattedCompletedTime = useMemo(() => {
    if (!completedTime) return '';

    try {
      const date = new Date(completedTime);
      if (isNaN(date.getTime())) return completedTime;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${hours}:${minutes}/${day}/${month}`;
    } catch (error) {
      return completedTime;
    }
  }, [completedTime]);



  // 获取 order card title - 根据是否有 table 号显示不同格式
  const getOrderTitle = () => {
    if (order.tableNumber && order.tableNumber !== 'N/A') {
      return `${t("table")} ${order.tableNumber}`;
    }
    
    const pickupMethod = order.pickupMethod?.toLowerCase() || '';
    const methodLabel = (pickupMethod === 'take-away') ? t("takeAway") : t("dineIn");
    return `${methodLabel} - #${getOrderDisplayNumber()}`;
  };

  const getOrderStartTimeMs = useCallback(() => {
    // 优先使用原始的 kdsReceiveTime（用于被召回的订单保留原始计时起点）
    // 否则使用当前的 kdsReceiveTime，最后才用 orderTime
    const startRaw = order.originalKdsReceiveTime || order.kdsReceiveTime || order.orderTime;
    const startDate = new Date(startRaw);
    if (Number.isNaN(startDate.getTime())) {
      return Date.now();
    }
    return startDate.getTime();
  }, [order.kdsReceiveTime, order.orderTime, order.originalKdsReceiveTime]);

  const toElapsedSecondsFromStart = useCallback((completedAtIso: string) => {
    const endDate = new Date(completedAtIso);
    if (Number.isNaN(endDate.getTime())) {
      return 0;
    }
    return Math.max(0, Math.floor((endDate.getTime() - getOrderStartTimeMs()) / 1000));
  }, [getOrderStartTimeMs]);

  const formatElapsedDuration = useCallback((elapsedSeconds?: number) => {
    if (typeof elapsedSeconds !== 'number' || Number.isNaN(elapsedSeconds)) {
      return '';
    }
    const total = Math.max(0, Math.floor(elapsedSeconds));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    if (hh > 0) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    return `${String(mm).padStart(2, '0')}m`;
  }, []);

  const getItemCompletionDurationText = useCallback((item: any) => {
    const elapsed = typeof item?.completedElapsedSeconds === 'number'
      ? item.completedElapsedSeconds
      : (item?.completedAt ? toElapsedSecondsFromStart(item.completedAt) : undefined);
    return formatElapsedDuration(elapsed);
  }, [formatElapsedDuration, toElapsedSecondsFromStart]);

  // 根据产品 category 名字获取对应的左边框颜色 - 使用 useCallback 记忆化，避免频繁重新创建
  const getCategoryBorderColor = useCallback((category?: string) => {
    if (!category) {
      return "#FFFFFF"; // 默认白色
    }
    
    // 使用 category 名字查找颜色映射
    const colorKey = colorMapping[category];
    if (colorKey && categoryColors[colorKey as keyof typeof categoryColors]) {
      return categoryColors[colorKey as keyof typeof categoryColors];
    }
    
    return "#FFFFFF"; // 默认白色
  }, [colorMapping]);

  const renderProductItem = useCallback((item: any, index: number) => {
    const isVoided = item.itemState === 'VOIDED';
    // 计算一次 borderColor，避免在多个地方重复调用 getCategoryBorderColor
    const itemBorderColor = getCategoryBorderColor(item.category);
    const itemKey = `${order.id}-item-${index}`;
    const getOptionKey = (optIndex: number) => `${order.id}-item-${index}-option-${optIndex}`;
    const optionKeys = (item.options || []).map((_: any, optIndex: number) => getOptionKey(optIndex));

    const handleItemPress = () => {
      if (disableItems || disabled || isVoided) return;
      
      if (enableItemLevelCompletion) {
        // 项目级完成模式：需要双击才能完成单项
        const now = Date.now();
        const lastTapTime = lastTapTimeRef.current[itemKey] || 0;
        const timeDiff = now - lastTapTime;

        if (timeDiff < 1000) {
          // 双击触发：完成 item
          completeItemOnly(item);
          lastTapTimeRef.current[itemKey] = 0; // 重置计时器
        } else {
          // 第一次点击：记录时间
          lastTapTimeRef.current[itemKey] = now;
        }
      } else {
        // full order 模式：点击 item 时同步勾选/取消该 item 的所有 options
        const nextState = !completedItemsRef.current[itemKey];
        completedItemsRef.current[itemKey] = nextState;
        if (nextState) {
          itemCompletedAtRef.current[itemKey] = new Date().toISOString();
        } else {
          delete itemCompletedAtRef.current[itemKey];
        }
        optionKeys.forEach((key: string) => {
          completedItemsRef.current[key] = nextState;
        });
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
            // completedItem 样式只在 home 页面显示（completedTime 不存在时），不应该在 completed 页面显示
            !completedTime && completedItemsRef.current[itemKey] && styles.completedItem,
            isVoided && styles.voidedItem,
            (!item.options || item.options.length === 0) && {
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
            },
            {
              borderLeftWidth: 8,
              borderLeftColor: itemBorderColor,
            }
          ]}
          delayLongPress={500}
        >
          <View style={styles.itemNameContainer}>
            <Text style={[
              styles.itemName,
              { fontSize: ITEM_OPTION_FONT_SIZES[itemOptionFontSize].itemName },
              isVoided && styles.voidedText
            ]}>
              {item.name}
            </Text>
          </View>
          {isVoided ? (
            <Text style={styles.cancelledText}>{t("cancelled")}</Text>
          ) : completedTime && (item.completedAt || typeof item.completedElapsedSeconds === 'number') ? (
            <Text style={styles.itemCompletedTime}>{getItemCompletionDurationText(item)}</Text>
          ) : !enableItemLevelCompletion && completedItemsRef.current[itemKey] ? (
            <Ionicons name="checkmark-circle" size={24} color={colors.checkColor} />
          ) : (
            <Text style={styles.itemQuantity}>x{item.quantity}</Text>
          )}
        </TouchableOpacity>

        {item.notes && (
          <View style={[
            styles.itemNotesContainer,
            isVoided && styles.voidedItemNotes,
            {
              borderLeftWidth: 8,
              borderLeftColor: itemBorderColor,
            }
          ]}>
            <View style={styles.itemNotesContent}>
              <Ionicons name="document-text-outline" size={14} color="#999999" style={styles.itemNotesIcon} />
              <Text style={[
                styles.itemNotes,
                { fontSize: ITEM_OPTION_FONT_SIZES[itemOptionFontSize].optionName },
                isVoided && styles.voidedText
              ]}>
                <Text style={[styles.notesLabel, { fontSize: 14 }]}>Note: </Text>
                {item.notes}
              </Text>
            </View>
          </View>
        )}

        {item.options?.length > 0 && (
          <View style={styles.optionsContainer}>
            {item.options.map((option: any, optIndex: number) => {
              const optionKey = getOptionKey(optIndex);
              const isOptionCompleted = !!completedItemsRef.current[optionKey];

              const handleOptionPress = () => {
                if (disableItems || disabled || isVoided) return;

                if (enableItemLevelCompletion) {
                  // 双击移除模式保持原行为：双击 item 完成
                  handleItemPress();
                } else {
                  completedItemsRef.current[optionKey] = !completedItemsRef.current[optionKey];
                  setForceUpdateTrigger(prev => prev + 1);
                }
              };

              // 判断是否为 POS order 格式（有 option_items）
              const isPOSFormat = option.option_items && Array.isArray(option.option_items);
              
              if (isPOSFormat) {
                // POS order 格式：检查是否有选中的选项（qty > 0）
                const selectedItems = option.option_items.filter((optItem: any) => optItem.qty > 0) || [];
                
                // 如果没有选中的选项，则不显示
                if (selectedItems.length === 0) {
                  return null;
                }
                
                return (
                  <TouchableOpacity
                    key={`${order.id}-item-${index}-option-${optIndex}`}
                    onPress={handleOptionPress}
                    disabled={disableItems || disabled || isVoided}
                    activeOpacity={disableItems || isVoided ? 1 : 0.7}
                    style={[
                      styles.optionRow,
                      isOptionCompleted && styles.completedItem,
                      isVoided && styles.voidedOption,
                      optIndex === item.options.length - 1 && {
                        borderBottomLeftRadius: 4,
                        borderBottomRightRadius: 4,
                      },
                      {
                        borderLeftWidth: 8,
                        borderLeftColor: itemBorderColor,
                      }
                    ]}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionName,
                        { fontSize: ITEM_OPTION_FONT_SIZES[itemOptionFontSize].optionName },
                        isVoided && styles.voidedText
                      ]}>
                        - {selectedItems.map((item: any) => item.name).join(', ')}
                      </Text>
                    </View>
                    {!enableItemLevelCompletion && isOptionCompleted && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.checkColor} />
                    )}
                  </TouchableOpacity>
                );
              } else {
                // Network order 格式：直接显示 option.name 和 option.value
                return (
                  <TouchableOpacity
                    key={`${order.id}-item-${index}-option-${optIndex}`}
                    onPress={handleOptionPress}
                    disabled={disableItems || disabled || isVoided}
                    activeOpacity={disableItems || isVoided ? 1 : 0.7}
                    style={[
                      styles.optionRow,
                      isOptionCompleted && styles.completedItem,
                      isVoided && styles.voidedOption,
                      optIndex === item.options.length - 1 && {
                        borderBottomLeftRadius: 4,
                        borderBottomRightRadius: 4,
                      },
                      {
                        borderLeftWidth: 8,
                        borderLeftColor: itemBorderColor,
                      }
                    ]}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[
                        styles.optionName,
                        { fontSize: ITEM_OPTION_FONT_SIZES[itemOptionFontSize].optionName },
                        isVoided && styles.voidedText
                      ]}>
                        - {option.name}{''}
                      </Text>
                      {shouldShowQuantity(option.value) && (
                        <Text style={[
                          styles.optionValue,
                          isVoided && styles.voidedText
                        ]}>
                          {'  '}x{option.value}
                        </Text>
                      )}
                    </View>
                    {!enableItemLevelCompletion && isOptionCompleted && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.checkColor} />
                    )}
                  </TouchableOpacity>
                );
              }
            })}
          </View>
        )}

      </View>
    );
  }, [disabled, disableItems, handleItemLongPress, shouldShowQuantity, enableItemLevelCompletion, completeItemOnly, order.id, forceUpdateTrigger, getCategoryBorderColor, itemOptionFontSize, t, getItemCompletionDurationText]);

  // CATEGORY GROUPING AND UI SORTING logic applied here
  const renderedProductsList = useMemo(() => {
    if (!order.products || !Array.isArray(order.products)) return null;

    const fmtTime = (iso: string): string => {
      try {
        const d = new Date(iso);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch { return ''; }
    };

    const renderCategoryGroup = (
      items: { item: any; originalIndex: number }[],
      keyPrefix: string,
    ): JSX.Element[] => {
      const grouped = items.reduce((acc, curr) => {
        const cat = curr.item.category?.trim() || 'Other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(curr);
        return acc;
      }, {} as Record<string, typeof items>);

      const els: JSX.Element[] = [];
      Object.keys(grouped).sort().forEach((category) => {
        const categoryColor = getCategoryBorderColor(category);
        const headerBorderColor = categoryColor !== "#FFFFFF" ? categoryColor : "#CBD5E1";
        const headerTextColor = categoryColor !== "#FFFFFF" ? categoryColor : "#475569";

        els.push(
          <View key={`${keyPrefix}-cat-${category}`} style={[styles.categoryHeader, { borderBottomColor: headerBorderColor }]}>
            <Text style={[styles.categoryHeaderText, { color: headerTextColor }]}>{category}</Text>
          </View>
        );

        const sorted = [...grouped[category]].sort((a, b) => {
          const av = a.item.itemState === 'VOIDED';
          const bv = b.item.itemState === 'VOIDED';
          return av === bv ? 0 : av ? 1 : -1;
        });
        sorted.forEach(({ item, originalIndex }) => els.push(renderProductItem(item, originalIndex)));
      });
      return els;
    };

    const productsWithOriginalIndex = order.products.map((item, index) => ({ item, originalIndex: index }));
    const isMerged = !!(order._subOrderIds && order._subOrderIds.length > 1);

    if (isMerged) {
      // Group by _sourceTime — each unique value is one sub-order
      const subOrderMap = new Map<string, typeof productsWithOriginalIndex>();
      productsWithOriginalIndex.forEach((entry) => {
        const key = entry.item._sourceTime || '__unknown__';
        if (!subOrderMap.has(key)) subOrderMap.set(key, []);
        subOrderMap.get(key)!.push(entry);
      });

      // Sort sub-orders oldest → newest
      const sorted = Array.from(subOrderMap.entries()).sort(([a], [b]) => {
        if (a === '__unknown__') return -1;
        if (b === '__unknown__') return 1;
        return new Date(a).getTime() - new Date(b).getTime();
      });

      const lastIdx = sorted.length - 1;
      const elements: JSX.Element[] = [];
      sorted.forEach(([sourceTime, items], idx) => {
        if (idx > 0) {
          const isNewest = idx === lastIdx;
          const timeLabel = sourceTime !== '__unknown__' ? fmtTime(sourceTime) : '';
          const lineColor = isNewest ? '#22c55e' : '#CBD5E1';
          const textColor = isNewest ? '#22c55e' : '#94A3B8';
          elements.push(
            <View key={`sub-divider-${sourceTime}`} style={styles.subOrderDivider}>
              <View style={[styles.subOrderDividerLine, { backgroundColor: lineColor }]} />
              <Text style={[styles.subOrderDividerText, { color: textColor }]}>
                {`${t('newOrderAdded')}${timeLabel ? `  ${timeLabel}` : ''}`}
              </Text>
              <View style={[styles.subOrderDividerLine, { backgroundColor: lineColor }]} />
            </View>
          );
        }
        elements.push(...renderCategoryGroup(items, `so${idx}`));
      });
      return elements;
    }

    // Non-merged: original category-only grouping
    return renderCategoryGroup(productsWithOriginalIndex, 'root');
  }, [order.products, order._subOrderIds, renderProductItem, getCategoryBorderColor]);

  const orderNotes = useMemo(() => {
    if (typeof order.notes !== "string") return "";
    return order.notes.trim();
  }, [order.notes]);

  const handleTimerUpdate = useCallback((_: number, statusColor: string) => {
    const nextSeverity = statusColor === colors.delayedColor
      ? "delayed"
      : statusColor === colors.urgentColor
        ? "urgent"
        : "normal";

    setTimerSeverity((prev) => (prev === nextSeverity ? prev : nextSeverity));
  }, []);

  if (!order.products || !Array.isArray(order.products)) {
    console.error('[OrderCard] Order has no products array:', order);
    return null;
  }

  const CardWrapper = selectable ? TouchableOpacity : View;
  const cardWrapperProps = selectable
    ? { activeOpacity: 1, onPress: onSelect }
    : {};

  return (
    <CardWrapper {...cardWrapperProps}>
      <View
        style={[
          styles.orderCard,
          enableDelayEffects && !disabled && !hideTimer && timerSeverity === "urgent" && styles.urgentCardGlow,
          enableDelayEffects && !disabled && !hideTimer && timerSeverity === "delayed" && styles.delayedCardGlow,
          selected && styles.selectedCard,
          style,
        ]}
      >
        {/* 产品详情弹窗 */}
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
              <View style={[
                styles.leftColumn,
                { 
                  flex: isPortrait ? 1.5 : 2.5,
                  justifyContent: "center" 
                }
              ]}>
                {/* 订单更新指示器 */}
                {/* update badge hidden */}
                
                <Text style={[
                  styles.orderTitle,
                  { fontSize: CARD_TITLE_FONT_SIZES[cardTitleFontSize] }
                ]}>{getOrderTitle() }</Text>
              </View>
              {/* 右列 */}
              <View style={[styles.rightColumn, rightCompact && styles.rightColumnCompact]}>
                {completedTime ? (
                  <>
                    <Text style={styles.orderTimeText}><Text style={styles.startLabel}>Start: </Text>{formattedOrderTime.replace('/', '\n')}</Text>
                    <Text style={styles.orderTimeText}><Text style={styles.endLabel}>End: </Text>{formattedCompletedTime.replace('/', '\n')}</Text>
                  </>
                ) : (
                  <Text style={styles.orderTimeText}>{formattedOrderTime}</Text>
                )}
                {!disabled && !hideTimer && <OrderTimer order={order} onTimeUpdate={handleTimerUpdate} />}
                <PrintButton order={order} disabled={disabled} />
              </View>
            </View>
            
            {orderNotes ? (
              <View style={styles.notesSection}>
                <View style={styles.orderNotesContent}>
                  <Ionicons name="alert-circle-outline" size={16} color="#999999" style={styles.orderNotesIcon} />
                  <Text style={styles.notesText}>
                    <Text style={styles.notesTitle}>Order Remarks: </Text>
                    {orderNotes}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* 商品 */}
            <View style={styles.itemsContainer}>
              {renderedProductsList}
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
            itemLevelMode={enableItemLevelCompletion}
          />
        )}
        {selectable && !completedTime && (
          <View style={[styles.selectIndicator, completedTime ? styles.selectIndicatorLeftTop : styles.selectIndicatorRightTop]}>
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
    borderRadius: 6,
    display: "flex",
    flexDirection: "column",
    position: "relative"
  },
  urgentCardGlow: {
    borderWidth: 3,
    borderColor: "#D5C425",
    shadowColor: "#D5C425",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 10,
  },
  delayedCardGlow: {
    borderWidth: 3, 
    borderColor: "#FF3B30", 
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 10,
    elevation: 10,
  },
  categoryHeader: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginTop: 6,
    marginBottom: 0,
    borderBottomWidth: 1,
    backgroundColor: "#F9FAFB",
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  categoryHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  subOrderDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
    marginTop: 10,
    marginBottom: 2,
    gap: 6,
  },
  subOrderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  subOrderDividerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  updateBadge: {
    backgroundColor: "#FF9B2F",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  updateBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "bold",
  },
  scrollViewContainer: {
    flex: 1,
    minHeight: 0,
    borderRightWidth: 1.5,
    borderRightColor: "#e5e5e5",
  },
  textContainer: {
    flex: 1,
  },
  orderTitle: {
    fontSize: 18, 
    fontWeight: "700",
    color: "#111",
  },
  headerLayout: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fcfcfc",
    padding: 6,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  rightColumn: {
    flex: 1,
    alignItems: "flex-end",
  },
  orderTimeText: {
    fontSize: 11,
    color: "#777",
    marginBottom: 2,
    textAlign: "right" as const,
  },
  // Item Row Ultra-Compact
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#222",
  },
  itemQtyTimeColumn: {
    alignItems: "flex-end",
    marginLeft: 6,
  },
  itemQuantity: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007AFF",
  },
  itemCompletedTime: {
    fontSize: 10,
    fontWeight: "700",
    color: "#888",
    marginLeft: 6,
  },
  // Notes Scaling
  notesSection: {
    marginTop: 2,
    marginBottom: 4,
    marginHorizontal: 4,
    padding: 4,
    borderRadius: 4,
    backgroundColor: "#F4F4F4",
    borderLeftWidth: 2,
  },
  notesText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#777",
    fontStyle: "italic",
  },
  // Options Scaling
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 1,
    paddingLeft: 10,
    paddingRight: 4,
  },
  optionName: {
    fontSize: 11,
    color: "#666",
  },
  optionValue: {
    fontSize: 11,
    color: "#333",
    fontWeight: "bold",
  },
  itemDivider: {
    height: 0.5,
    backgroundColor: "#eee",
  },
  completedItem: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  cancelledText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ef4444",
    marginLeft: 6,
  },
  selectIndicator: {
    position: "absolute",
    top: 4,
    padding: 1,
  },
  selectIndicatorRightTop: {
    right: 8,
  },
  selectIndicatorLeftTop: {
    left: 8,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: theme.colors.primaryColor,
  },
  leftColumn: {
    justifyContent: "flex-start" as const,
  },
  rightColumnCompact: {
    marginTop: 25,
  },
  itemContainer: {
    marginBottom: 2,
  },
  itemNameContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flex: 1,
  },
  voidedItem: {
    backgroundColor: "#f5f5f5",
    opacity: 0.7,
  },
  voidedText: {
    textDecorationLine: "line-through" as const,
    color: "#999",
  },
  voidedItemNotes: {
    backgroundColor: "#f5f5f5",
    opacity: 0.7,
  },
  voidedOption: {
    opacity: 0.6,
  },
  itemNotesContainer: {
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 6,
    backgroundColor: "#F7F7F7",
    marginBottom: 0,
  },
  itemNotesContent: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  itemNotesIcon: {
    marginRight: 4,
  },
  itemNotes: {
    fontSize: 11,
    color: "#666666",
    fontWeight: "500" as const,
    fontStyle: "italic" as const,
    flex: 1,
  },
  notesLabel: {
    fontSize: 11,
    color: "#666666",
    fontWeight: "700" as const,
  },
  notesTitle: {
    fontWeight: "700" as const,
    color: "#666666",
  },
  orderNotesContent: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
  },
  orderNotesIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  startLabel: {
    color: "#4CAF50",
    fontWeight: "600" as const,
  },
  endLabel: {
    color: "#FF5252",
    fontWeight: "600" as const,
  },
  itemsContainer: {
    marginTop: 0,
    marginBottom: 4,
  },
  optionsContainer: {
    marginTop: 0,
  },
  optionContent: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    flex: 1,
    alignItems: "center",
  },
});

// const styles = StyleSheet.create({
//   orderCard: {
//     backgroundColor: "white",
//     borderRadius: 8,
//     display: "flex",
//     flexDirection: "column",
//     position: "relative"
//   },
//   urgentCardGlow: {
//     borderWidth: 2,
//     borderColor: "#D5C425",
//     shadowColor: "#D5C425",
//     shadowOffset: { width: 0, height: 0 },
//     shadowOpacity: 0.45,
//     shadowRadius: 6,
//     elevation: 8,
//   },
//   delayedCardGlow: {
//     // Made the delayed indicator noticeably stronger and brighter red
//     borderWidth: 4, 
//     borderColor: "#FF3B30", 
//     shadowColor: "#FF3B30",
//     shadowOffset: { width: 0, height: 0 },
//     shadowOpacity: 0.8,
//     shadowRadius: 20,
//     elevation: 20,
//   },
//   categoryHeader: {
//     paddingVertical: 6,
//     paddingHorizontal: 10,
//     marginTop: 12,
//     marginBottom: 4,
//     borderBottomWidth: 2,
//     backgroundColor: "#F8F9FA",
//     borderRadius: 4,
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginHorizontal: 8,
//   },
//   categoryHeaderText: {
//     fontSize: 14,
//     fontWeight: 'bold',
//     textTransform: 'uppercase',
//     letterSpacing: 0.8,
//   },
//   updateBadge: {
//     backgroundColor: "#FF9B2F",
//     paddingVertical: 4,
//     paddingHorizontal: 8,
//     borderRadius: 6,
//     flexDirection: "row",
//     alignItems: "center",
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//     elevation: 5,
//     alignSelf: "flex-start",
//   },
//   updateBadgeText: {
//     color: "#fff",
//     fontSize: 12,
//     fontWeight: "bold",
//     letterSpacing: 0.5,
//   },
//   recallBadge: {
//     position: "absolute",
//     top: 8,
//     left: 8,
//     backgroundColor: "#FF6B35",
//     paddingVertical: 4,
//     paddingHorizontal: 8,
//     borderRadius: 6,
//     flexDirection: "row",
//     alignItems: "center",
//     zIndex: 10,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.25,
//     shadowRadius: 3.84,
//     elevation: 5,
//   },
//   recallBadgeText: {
//     color: "#fff",
//     fontSize: 12,
//     fontWeight: "bold",
//     letterSpacing: 0.5,
//   },
//   recallBadgeWithUpdate: {
//     left: 118, // updateBadge宽度约110px，所以放在右边
//   },
//   scrollViewContainer: {
//     flex: 1,
//     minHeight: 0,
//     borderRightWidth: 3,
//     borderRightColor: "#e0e0e0",
//   },
//   textContainer: {
//     flex: 1,
//     display: "flex",
//     flexDirection: "column",
//   },
//   orderTitle: {
//     fontSize: 28, 
//     fontWeight: "700",
//     color: "#1a1a1a",
//   },
//   headerLayout: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     marginTop: 0,
//     marginBottom: 0,
//     backgroundColor: "#f9f9f9",
//     borderRadius: 8,
//     padding: 10
//   },
//   leftColumn: {
//     justifyContent: "flex-start",
//   },
//   rightColumn: {
//     flex: 1,
//     alignItems: "flex-end",
//     justifyContent: "flex-start",
//   },
//   rightColumnCompact: {
//     marginTop: 25,
//   },
//   sourceText: {
//     fontSize: 18,
//     fontWeight: "600",
//     marginBottom: 4,
//   },
//   pickupMethodText: {
//     fontSize: 18,
//     fontWeight: "600",
//   },
//   orderTimeText: {
//     fontSize: 15,
//     color: "#555",
//     marginBottom: 6,
//     textAlign: "right" as const,
//   },
//   startLabel: {
//     color: "#4CAF50",
//     fontWeight: "600",
//   },
//   endLabel: {
//     color: "#FF5252",
//     fontWeight: "600",
//   },
//   prepareTime: {
//     fontSize: 18,
//     color: "#666",
//     marginTop: 12,
//     flexWrap: "nowrap",
//   },
//   prepareTimeValue: {
//     fontSize: 18,
//     color: "#333",
//     fontWeight: "bold",
//   },
//   tableNumberText: {
//     fontSize: 20,
//     color: "#333",
//     fontWeight: "600",
//     marginLeft: 0,
//     flexWrap: "nowrap",
//   },
//   completedTimeDisplay: {
//     fontSize: 13,
//     color: "#999",
//     fontWeight: "500",
//     marginTop: 8,
//     marginBottom: 8,
//     textAlign: "right" as const,
//   },
//   itemsContainer: {
//     marginTop: 0, 
//     marginBottom: 8,
//   },
//   notesSection: {
//     marginTop: 4,
//     marginBottom: 10,
//     marginHorizontal: 6,
//     paddingHorizontal: 8,
//     paddingVertical: 8,
//     borderRadius: 8,
//     backgroundColor: "#F0F0F0",
//     borderLeftWidth: 4,
//     borderLeftColor: "#999999",
//   },
//   orderNotesContent: {
//     flexDirection: "row",
//     alignItems: "flex-start",
//   },
//   orderNotesIcon: {
//     marginRight: 8,
//     marginTop: 2,
//   },
//   notesTitle: {
//     fontSize: 14,
//     fontWeight: "700",
//     color: "#666666",
//   },
//   notesText: {
//     fontSize: 18,
//     fontWeight: "600",
//     color: "#666666",
//     lineHeight: 20,
//     flex: 1,
//     fontStyle: "italic",
//   },
//   itemRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     paddingVertical: 6,
//     paddingHorizontal: 8,
//     borderTopLeftRadius: 4,
//     borderTopRightRadius: 4,
//     opacity: 1,
//     paddingLeft: 6,
//     paddingRight: 6,
//   },
//   itemNameContainer: {
//     flexDirection: "column",
//     alignItems: "flex-start",
//     flex: 1,
//   },
//   itemName: {
//     fontSize: 20,
//     fontWeight: "600",
//     color: "#333",
//   },
//   itemQuantity: {
//     fontSize: 18,
//     fontWeight: "700",
//     color: "#007AFF",
//     marginLeft: 12,
//   },
//   itemCompletedTime: {
//     fontSize: 13,
//     fontWeight: "700",
//     color: "#666",
//     marginLeft: 12,
//     minWidth: 68,
//     textAlign: "right",
//   },
//   optionsContainer: {
//     marginTop: 0,
//     marginLeft: 0,
//   },
//   itemNotesContainer: {
//     paddingVertical: 6,
//     paddingLeft: 14,
//     paddingRight: 6,
//     backgroundColor: "#F0F0F0",
//     marginBottom: 0,
//   },
//   itemNotesContent: {
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   itemNotesIcon: {
//     marginRight: 6,
//   },
//   itemNotes: {
//     fontSize: 14,
//     color: "#666666",
//     fontWeight: "500",
//     fontStyle: "italic",
//     flex: 1,
//   },
//   notesLabel: {
//     fontSize: 14,
//     color: "#666666",
//     fontWeight: "700",
//   },
//   voidedItemNotes: {
//     backgroundColor: "#f5f5f5",
//     opacity: 0.7,
//   },
//   optionRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     paddingVertical: 4,
//     paddingLeft: 14,
//     paddingRight: 6,
//     marginBottom: 0,
//   },
//   optionContent: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     flex: 1,
//   },
//   optionName: {
//     fontSize: 16,
//     color: "#555",
//     fontWeight: "500",
//   },
//   optionValue: {
//     fontSize: 16,
//     color: "#333",
//     fontWeight: "bold",
//   },
//   itemDivider: {
//     height: 1,
//     backgroundColor: "#e0e0e0",
//     marginVertical: 2,
//   },
//   itemContainer: {
//     marginBottom: 4,
//   },
//   completedItem: {
//     opacity: 0.8,
//     backgroundColor: "#f0fdf4",
//     borderWidth: 2,
//     borderColor: "#22c55e",
//   },
//   voidedItem: {
//     backgroundColor: "#f5f5f5",
//     opacity: 0.7,
//   },
//   voidedText: {
//     textDecorationLine: "line-through",
//     color: "#999",
//   },
//   voidedOption: {
//     backgroundColor: "#f8f8f8",
//     opacity: 0.7,
//   },
//   cancelledText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#ff4444",
//     marginLeft: 12,
//   },
//   selectedCard: {
//     borderWidth: 2,
//     borderColor: theme.colors.primaryColor,
//   },
//   selectIndicator: {
//     position: "absolute",
//     top: 8,
//     borderRadius: 12,
//     padding: 2,
//   },
//   selectIndicatorRightTop: {
//     right: 8,
//   },
//   selectIndicatorLeftTop: {
//     left: 8,
//   },
// });