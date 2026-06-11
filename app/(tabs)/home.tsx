import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
  Animated,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { ItemCompletionToast } from "../../components/ItemCompletionToast";
import { RecallOrdersPanel } from "../../components/RecallOrdersPanel";
import { RecallItemsPanel } from "../../components/RecallItemsPanel";
import { useOrders } from "../../contexts/OrderContext";
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder, CompletedOrder } from "@/services/types";
import { OrderService } from "../../services/orderService/OrderService";
import { callingScreenService } from "../../services/CallingScreenService";
import { callingScreenDiscovery } from "../../services/CallingScreenDiscovery";
import { useSettings } from "../../contexts/SettingsContext";
import {
  PADDING,
  CARD_MARGIN,
  cardStyles as cardStylesSheet,
  calculateCardWidth,
  calculateCardHeight,
  formatTime,
} from "../../constants/cardConfig";

const clockStyles = {
  timeDisplay: {
    ...cardStylesSheet.timeDisplay,
    color: "white",
    fontSize: 16,
    fontWeight: "600" as const,
  },
};

const ClockDisplay = React.memo(() => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={clockStyles.timeDisplay}>{formatTime(time)}</Text>;
});

export default function HomeScreen() {
  const { orders, loading, error, removeOrder, removeOrders, refreshOrders } = useOrders();
  const { addCompletedOrder, removeCompletedOrder } = useCompletedOrders();
  const {
    cardsPerRow,
    cardsPerColumn,
    itemLevelCompletion: enableItemLevelCompletion,
    showTimerHighlight,
    mergeTableOrders,
    categoryActiveMapping,
  } = useSettings();
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);
  const [localOrders, setLocalOrders] = useState<FormattedOrder[]>([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastItemName, setToastItemName] = useState("");
  const [lastCompletedItemData, setLastCompletedItemData] = useState<{itemId: string; itemName: string; orderId: string; order: FormattedOrder; completedOrderId: string} | null>(null);
  const [orderToastVisible, setOrderToastVisible] = useState(false);
  const [lastCompletedOrderData, setLastCompletedOrderData] = useState<{ order: FormattedOrder } | null>(null);
  const [showRecentItemsMenu, setShowRecentItemsMenu] = useState(false);
  const [showRecentOrdersMenu, setShowRecentOrdersMenu] = useState(false);
  const localOrdersRef = useRef<FormattedOrder[]>([]);
  const displayOrdersRef = useRef<FormattedOrder[]>([]);
  const recallingItemsRef = useRef<Set<string>>(new Set());
  const recallingOrdersRef = useRef<Set<string>>(new Set());
  const recentMenuAnimValue = useMemo(() => new Animated.Value(0), []);
  const recentOrdersMenuAnimValue = useMemo(() => new Animated.Value(0), []);

  // 动画处理 - 最近订单菜单
  useEffect(() => {
    Animated.timing(recentMenuAnimValue, {
      toValue: showRecentItemsMenu ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [showRecentItemsMenu, recentMenuAnimValue]);

  useEffect(() => {
    Animated.timing(recentOrdersMenuAnimValue, {
      toValue: showRecentOrdersMenu ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [showRecentOrdersMenu, recentOrdersMenuAnimValue]);

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

  // One merged style per column position — stable across order completions
  const mergedCardStyles = useMemo(
    () =>
      Array.from({ length: cardsPerRow }, (_, colIndex) => ({
        ...styles.cardStyle,
        width: cardWidth,
        height: cardHeight,
        marginRight: colIndex === cardsPerRow - 1 ? 0 : CARD_MARGIN,
      })),
    [cardWidth, cardHeight, cardsPerRow]
  );

  // 过滤掉已禁用分类的订单项（display 层，不影响存储）
  const activeFilteredOrders = useMemo(() => {
    const hasInactive = Object.values(categoryActiveMapping).some(v => v === false);
    if (!hasInactive) return filteredOrders;
    return filteredOrders
      .map(order => ({
        ...order,
        products: order.products.filter(p =>
          !p.category || categoryActiveMapping[p.category] !== false
        ),
      }))
      .filter(order => order.products.length > 0);
  }, [filteredOrders, categoryActiveMapping]);

  // 当 mergeTableOrders 开启时，将同桌订单虚拟合并为一张 card（存储层不变）
  const displayOrders = useMemo(() => {
    if (!mergeTableOrders) return activeFilteredOrders;

    const tableGroups = new Map<string, FormattedOrder[]>();
    const noTableOrders: FormattedOrder[] = [];

    for (const order of activeFilteredOrders) {
      const tbl = order.tableNumber?.trim();
      if (tbl) {
        if (!tableGroups.has(tbl)) tableGroups.set(tbl, []);
        tableGroups.get(tbl)!.push(order);
      } else {
        noTableOrders.push(order);
      }
    }

    const mergedTableOrders: FormattedOrder[] = [];
    tableGroups.forEach((orders, tableNumber) => {
      if (orders.length === 1) {
        mergedTableOrders.push(orders[0]);
        return;
      }
      const base = orders.reduce((min, o) =>
        new Date(o.kdsReceiveTime) < new Date(min.kdsReceiveTime) ? o : min
      );
      const allProducts = orders.flatMap(o =>
        o.products.map(p => ({ ...p, _sourceTime: o.kdsReceiveTime }))
      );
      const hasUpdates = orders.some(o => (o.updateCount || 0) > 0);
      mergedTableOrders.push({
        ...base,
        id: `table-group-${tableNumber}`,
        products: allProducts,
        updateCount: hasUpdates ? 1 : undefined,
        _subOrderIds: orders.map(o => o.id),
        source: 'merged',
      });
    });

    return [...mergedTableOrders, ...noTableOrders].sort((a, b) => {
      const tA = new Date(a.kdsReceiveTime || a.orderTime).getTime();
      const tB = new Date(b.kdsReceiveTime || b.orderTime).getTime();
      return tA - tB; // oldest first
    });
  }, [activeFilteredOrders, mergeTableOrders]);

  // 保持 displayOrdersRef 同步，供回调查找合并虚拟订单
  useEffect(() => {
    displayOrdersRef.current = displayOrders;
  }, [displayOrders]);

  // Group orders into rows for FlatList virtualisation
  const rows = useMemo(() => {
    const result: FormattedOrder[][] = [];
    for (let i = 0; i < displayOrders.length; i += cardsPerRow) {
      result.push(displayOrders.slice(i, i + cardsPerRow));
    }
    return result;
  }, [displayOrders, cardsPerRow]);

  // 监听屏幕尺寸变化以更新 dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 直接使用来自 OrderService 的已过滤订单，无需在 home 中重复过滤
  useEffect(() => {
    setFilteredOrders(orders);
    setLocalOrders(orders);
  }, [orders]);

  // 保持 localOrdersRef 与 localOrders 同步，供 stable callbacks 读取
  useEffect(() => {
    localOrdersRef.current = localOrders;
  }, [localOrders]);

  // 监听订单自动完成（24小时后）并记录到已完成订单列表
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    
    const registerCompletionCallback = async () => {
      try {
        unsubscribe = OrderService.setOrderCompletionCallback((order: FormattedOrder) => {
          console.log(`[Home] 订单自动完成回调：${order.id}（24小时自动完成）`);
          // 记录完成 - 与手动 Done 的效果完全一致
          addCompletedOrder(order, order.products || []).catch((error: any) => {
            console.error('[Home] 添加完成订单失败:', error);
          });
        });
      } catch (error) {
        console.error('[Home] 注册订单完成回调失败:', error);
      }
    };
    
    // 延迟注册，确保 OrderService 已初始化
    const timeoutId = setTimeout(registerCompletionCallback, 500);
    
    return () => {
      clearTimeout(timeoutId);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [addCompletedOrder]);

  // 添加这个适配器函数
  const handleOrderRemove = useCallback((order: FormattedOrder) => {
    if (order._subOrderIds && order._subOrderIds.length > 0) {
      // 虚拟合并订单：批量移除所有子订单，只触发一次 emitOrderUpdate 避免分裂闪烁
      const ids = order._subOrderIds;
      setFilteredOrders(prev => prev.filter(o => !ids.includes(o.id)));
      setLocalOrders(prev => prev.filter(o => !ids.includes(o.id)));
      removeOrders(ids);
      return;
    }

    // Optimistic: remove from display state immediately, before OrderContext propagates
    setFilteredOrders(prev => prev.filter(o => o.id !== order.id));
    setLocalOrders(prev => prev.filter(o => o.id !== order.id));

    removeOrder(order.id);

    // whole 模式下，点击 Done 后显示快速整单撤回提示
    if (!enableItemLevelCompletion) {
      setLastCompletedOrderData({ order });
      setOrderToastVisible(true);
    }
  }, [removeOrder, removeOrders, enableItemLevelCompletion]);

  // 处理项目移除 - 更新本地订单中的产品列表
  const handleItemRemoved = useCallback((itemId: string, itemName: string, updatedOrder: FormattedOrder) => {
    if (updatedOrder._subOrderIds && updatedOrder._subOrderIds.length > 0) {
      // 虚拟合并订单：把剩余产品集合回写到每个子订单
      const remainingProductIds = new Set(updatedOrder.products.map(p => p.id));
      updatedOrder._subOrderIds.forEach(subId => {
        setLocalOrders(prev => prev.map(o => {
          if (o.id !== subId) return o;
          return { ...o, products: o.products.filter(p => remainingProductIds.has(p.id)) };
        }));
        setFilteredOrders(prev => prev.map(o => {
          if (o.id !== subId) return o;
          return { ...o, products: o.products.filter(p => remainingProductIds.has(p.id)) };
        }));
      });
      // Persist to storage silently so emitOrderUpdate won't restore the removed item
      OrderService.persistProductRemoval(itemId, updatedOrder._subOrderIds).catch(() => {});
      return;
    }

    // 更新 localOrders 中的订单
    setLocalOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    // 更新 filteredOrders 中的订单
    setFilteredOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    // Persist to storage silently so emitOrderUpdate won't restore the removed item
    OrderService.persistProductRemoval(itemId, [updatedOrder.id]).catch(() => {});
  }, []);

  // 处理项目完成 - 显示 Toast
  const handleItemCompleted = useCallback((itemName: string, itemId: string, orderId: string) => {
    // 检查是否是虚拟合并订单（此回调早于 onItemRemoved，localOrdersRef 还保有旧值）
    const displayOrder = displayOrdersRef.current.find(o => o.id === orderId);
    if (displayOrder?._subOrderIds && displayOrder._subOrderIds.length > 0) {
      // 找到真正持有该 item 的子订单
      let realOrderId = orderId;
      let realOrder: FormattedOrder = displayOrder;
      for (const subId of displayOrder._subOrderIds) {
        const subOrder = localOrdersRef.current.find(o => o.id === subId);
        if (subOrder?.products.some(p => p.id === itemId)) {
          realOrderId = subId;
          realOrder = subOrder;
          break;
        }
      }
      setToastItemName(itemName);
      // completedOrderId = merged virtual ID (what addCompletedOrder used); orderId = real sub-order (for recall)
      setLastCompletedItemData({ itemId, itemName, orderId: realOrderId, order: realOrder, completedOrderId: displayOrder.id });
      setToastVisible(true);
      return;
    }

    const order = localOrdersRef.current.find(o => o.id === orderId)
      || displayOrdersRef.current.find(o => o.id === orderId);
    if (order) {
      setToastItemName(itemName);
      setLastCompletedItemData({ itemId, itemName, orderId, order, completedOrderId: orderId });
      setToastVisible(true);
    }
  }, []);

  // 通用的 recall item 函数（Undo 和 Recall 都用这个）
  const recallItemToOrder = useCallback(async (
    itemId: string,
    itemName: string,
    orderId: string,
    item: any,
    baseOrder: FormattedOrder,
    completionKey?: string,
    onSuccess?: () => void
  ) => {
    try {
      // 竞速保护
      if (recallingItemsRef.current.has(itemId)) {
        console.log(`[Home] Item 正在处理中，跳过: ${itemId}`);
        return;
      }

      recallingItemsRef.current.add(itemId);

      // 检查订单是否存在
      const existingOrder = localOrders.find(o => o.id === orderId);
      
      if (existingOrder) {
        // 订单存在，检查 item 是否已在其中
        const itemAlreadyExists = existingOrder.products?.some(p => p.id === itemId);
        if (itemAlreadyExists) {
          console.log(`[Home] Item 已在订单中，无需添加`);
          onSuccess?.();
          return;
        }

        // 添加 item 到现有订单
        const updatedOrder = {
          ...existingOrder,
          products: [...(existingOrder.products || []), item],
        };

        setLocalOrders(prev =>
          prev.map(order => order.id === orderId ? updatedOrder : order)
        );
        setFilteredOrders(prev =>
          prev.map(order => order.id === orderId ? updatedOrder : order)
        );

        OrderService.recallOrder(updatedOrder).catch(error => {
          console.error('[Home] Recall 失败:', error);
        });

        // 通知 Calling Screen 订单产品数量变化
        const device = callingScreenDiscovery.getCachedDevice();
        if (device) {
          const itemCount = updatedOrder.products.reduce((total, p) => total + (p.quantity || 1), 0);
          callingScreenService.notifyOrderAdded(device, updatedOrder._id, String(updatedOrder.num), itemCount, updatedOrder.tableNumber).catch((error: any) => {
            console.warn('[Home] Failed to notify Calling Screen (updated order):', error);
          });
        }
      } else {
        // 订单不存在，创建新订单
        const newOrder: FormattedOrder = {
          ...baseOrder,
          products: [item],
          isRecalled: true,
        };

        setLocalOrders(prev => [...prev, newOrder]);
        setFilteredOrders(prev => [...prev, newOrder]);

        OrderService.recallOrder(newOrder).catch(error => {
          console.error('[Home] Recall 失败:', error);
        });

        // 通知 Calling Screen 新订单
        const device = callingScreenDiscovery.getCachedDevice();
        if (device) {
          const itemCount = newOrder.products.reduce((total, p) => total + (p.quantity || 1), 0);
          callingScreenService.notifyOrderAdded(device, newOrder._id, String(newOrder.num), itemCount, newOrder.tableNumber).catch((error: any) => {
            console.warn('[Home] Failed to notify Calling Screen (new order):', error);
          });
        }

        // 只在 home 没有 card 时才刷新
        if (filteredOrders.length === 0) {
          refreshOrders().catch(error => {
            console.error('[Home] 刷新订单失败:', error);
          });
        }
      }

      // 删除完成记录
      removeCompletedOrder(orderId, itemId, completionKey).catch(error => {
        console.error('[Home] 删除完成记录失败:', error);
      });

      onSuccess?.();
      console.log(`[Home] ✓ Item 已加回订单: ${itemName}`);
    } catch (error) {
      console.error('[Home] Recall item 失败:', error);
    } finally {
      setTimeout(() => {
        recallingItemsRef.current.delete(itemId);
      }, 50);
    }
  }, [localOrders, removeCompletedOrder, refreshOrders, filteredOrders]);

  // 处理 Undo（从 Toast）
  const handleItemUndoCompletion = useCallback(async () => {
    if (!lastCompletedItemData) return;

    const { itemId, itemName, orderId, order, completedOrderId } = lastCompletedItemData;

    // 查找 item
    let item = order.products?.find(p => p.id === itemId);
    if (!item) {
      item = order.products?.find(p =>
        (p as any)._id === itemId || (p as any).itemId === itemId
      );
    }

    if (!item) {
      console.error('[Home] Undo: 无法找到 item');
      return;
    }

    // Remove the completed record so re-completion doesn't create duplicates
    await removeCompletedOrder(completedOrderId, itemId);

    await recallItemToOrder(itemId, itemName, orderId, item, order, undefined, () => {
      setToastVisible(false);
      setLastCompletedItemData(null);
    });
  }, [lastCompletedItemData, recallItemToOrder, removeCompletedOrder]);

  // 处理 Recall（从菜单）
  const handleRecallItem = useCallback(async (completedItem: any) => {
    const { itemId, itemName, completedOrder, item, completionKey } = completedItem;
    const orderId = completedOrder.order.id;

    await recallItemToOrder(itemId, itemName, orderId, item, completedOrder.order, completionKey, () => {
      setShowRecentItemsMenu(false);
    });
  }, [recallItemToOrder]);

  // 通用整单 recall（菜单与 Toast 共用）
  const recallWholeOrder = useCallback(async (
    baseOrder: FormattedOrder,
    completedItems: any[],
    onSuccess?: () => void
  ) => {
    const orderId = baseOrder.id;
    if (!orderId) {
      return;
    }

    if (recallingOrdersRef.current.has(orderId)) {
      console.log(`[Home] Order 正在处理中，跳过: ${orderId}`);
      return;
    }

    try {
      recallingOrdersRef.current.add(orderId);

      if (completedItems.length === 0) {
        console.warn(`[Home] 整单撤回失败：完成列表为空 ${orderId}`);
        return;
      }

      const existingOrder = localOrders.find((o) => o.id === orderId);

      let recalledOrder: FormattedOrder;
      if (existingOrder) {
        const existingProductIds = new Set((existingOrder.products || []).map((p) => p.id));
        const missingProducts = completedItems.filter((p) => !existingProductIds.has(p.id));
        recalledOrder = {
          ...existingOrder,
          isRecalled: true,
          products: [...(existingOrder.products || []), ...missingProducts],
          completedItemIds: baseOrder.completedItemIds || existingOrder.completedItemIds || [],
        };

        setLocalOrders((prev) =>
          prev.map((order) => (order.id === orderId ? recalledOrder : order))
        );
        setFilteredOrders((prev) =>
          prev.map((order) => (order.id === orderId ? recalledOrder : order))
        );
      } else {
        recalledOrder = {
          ...baseOrder,
          isRecalled: true,
          products: completedItems,
          completedItemIds: baseOrder.completedItemIds || [],
        };

        setLocalOrders((prev) => [...prev, recalledOrder]);
        setFilteredOrders((prev) => [...prev, recalledOrder]);

        // 仅在 home 没有卡片时刷新
        if (filteredOrders.length === 0) {
          refreshOrders().catch((error) => {
            console.error("[Home] 刷新订单失败:", error);
          });
        }
      }

      await OrderService.recallOrder(recalledOrder);

      // 通知 Calling Screen 订单产品数量变化
      const device = callingScreenDiscovery.getCachedDevice();
      if (device) {
        const itemCount = recalledOrder.products.reduce(
          (total, p) => total + (p.quantity || 1),
          0
        );
        callingScreenService
          .notifyOrderAdded(
            device,
            recalledOrder._id,
            String(recalledOrder.num),
            itemCount,
            recalledOrder.tableNumber
          )
          .catch((error: any) => {
            console.warn("[Home] Failed to notify Calling Screen (recalled order):", error);
          });
      }

      await removeCompletedOrder(orderId);
      onSuccess?.();
      console.log(`[Home] ✓ 整单已撤回: ${orderId}`);
    } catch (error) {
      console.error("[Home] 整单撤回失败:", error);
    } finally {
      setTimeout(() => {
        recallingOrdersRef.current.delete(orderId);
      }, 80);
    }
  }, [localOrders, filteredOrders, refreshOrders, removeCompletedOrder]);

  // 处理整单 Recall（从菜单）
  const handleRecallOrder = useCallback(async (completedOrder: CompletedOrder) => {
    await recallWholeOrder(completedOrder.order, completedOrder.completedItems || [], () => {
      setShowRecentOrdersMenu(false);
    });
  }, [recallWholeOrder]);

  // 处理整单快速撤回（从 Toast）
  const handleOrderUndoCompletion = useCallback(async () => {
    if (!lastCompletedOrderData) {
      return;
    }

    const { order } = lastCompletedOrderData;
    await recallWholeOrder(order, order.products || [], () => {
      setOrderToastVisible(false);
      setLastCompletedOrderData(null);
    });
  }, [lastCompletedOrderData, recallWholeOrder]);

  useEffect(() => {
    const loadShopInfo = async () => {
      try {
        const shopName = await AsyncStorage.getItem("selectedShopName");
        if (shopName) {
          setSelectedShopName(shopName);
        }
      } catch (error) {
        console.error("加载店铺信息失败:", error);
      }
    };

    loadShopInfo();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#333" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View style={[styles.titleSection, { flex: 1 }]}>
          <Text style={styles.title}>
            {t("newOrders")} ({displayOrders.length})
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#007bff',
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
            }}
            onPress={() => {
              setShowRecentItemsMenu(false);
              setShowRecentOrdersMenu(true);
            }}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
              {t("recallOrder")}
            </Text>
          </TouchableOpacity>
          {enableItemLevelCompletion && (
            <TouchableOpacity
              style={{
                backgroundColor: '#2e7d32',
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
              }}
              onPress={() => {
                setShowRecentOrdersMenu(false);
                setShowRecentItemsMenu(true);
              }}
            >
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                {t("recallItem")}
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.timeDisplayContainer}>
            <ClockDisplay />
          </View>
        </View>
      </View>

      {displayOrders.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 }}>
          <Text style={styles.noOrdersText}>{t("noOrders")}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(_, index) => `row-${index}`}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: PADDING, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={Math.ceil(cardsPerColumn) + 1}
          getItemLayout={(_, index) => ({
            length: cardHeight + CARD_MARGIN,
            offset: (cardHeight + CARD_MARGIN) * index,
            index,
          })}
          renderItem={({ item: rowOrders, index: rowIndex }) => (
            <View style={{ flexDirection: 'row', marginBottom: CARD_MARGIN }}>
              {rowOrders.map((order, colIndex) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  style={mergedCardStyles[colIndex]}
                  onOrderComplete={handleOrderRemove}
                  onOrderCancel={handleOrderRemove}
                  onItemRemoved={handleItemRemoved}
                  onItemCompleted={handleItemCompleted}
                  showDateInDue={true}
                  selectable={false}
                  enableDelayEffects={showTimerHighlight}
                />
              ))}
            </View>
          )}
        />
      )}

      {showRecentItemsMenu && enableItemLevelCompletion && (
        <RecallItemsPanel
          onRecall={handleRecallItem}
          onClose={() => setShowRecentItemsMenu(false)}
          animValue={recentMenuAnimValue}
          dimensions={dimensions}
        />
      )}

      {showRecentOrdersMenu && (
        <RecallOrdersPanel
          onRecall={handleRecallOrder}
          onClose={() => setShowRecentOrdersMenu(false)}
          animValue={recentOrdersMenuAnimValue}
          dimensions={dimensions}
        />
      )}
      
      <ItemCompletionToast
        visible={toastVisible}
        itemName={toastItemName}
        onUndo={handleItemUndoCompletion}
        onDismiss={() => setToastVisible(false)}
        duration={5000}
        positionTop={80}
        labelText={t("itemCompleted")}
        actionText={t("undo")}
      />

      <ItemCompletionToast
        visible={orderToastVisible}
        itemName={lastCompletedOrderData ? `${t("order")} #${lastCompletedOrderData.order.num}` : ""}
        onUndo={handleOrderUndoCompletion}
        onDismiss={() => {
          setOrderToastVisible(false);
          setLastCompletedOrderData(null);
        }}
        duration={5000}
        positionTop={80}
        labelText={t("orderCompleted")}
        actionText={t("recallOrder")}
      />
    </View>
  );
}

const styles = {
  ...cardStylesSheet,
  cardsContainer: {
    ...cardStylesSheet.cardsContainer,
    backgroundColor: "#ccc8c8",
  },
  cardStyle: {
    ...cardStylesSheet.cardStyle,
    borderRadius: 12,
    backgroundColor: "white",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  container: {
    ...cardStylesSheet.container,
    backgroundColor: "#ccc8c8",
  },
  scrollContainer: {
    ...cardStylesSheet.scrollContainer,
    backgroundColor: "#ccc8c8",
  },
  headerContainer: {
    ...cardStylesSheet.headerContainer,
    backgroundColor: "#ddd9d9",
    borderRadius: 12,
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  title: {
    ...cardStylesSheet.title,
    color: "#1a1a1a",
  },
  timeDisplayContainer: {
    backgroundColor: "#007bff",
    borderRadius: 8,
    // paddingVertical: 8,
    // paddingHorizontal: 12,
  },
  timeDisplay: {
    ...cardStylesSheet.timeDisplay,
    color: "white",
    fontSize: 16,
    fontWeight: "600" as any,
  },
  noOrdersText: {
    ...cardStylesSheet.noOrdersText,
    color: "#888",
  },
};
