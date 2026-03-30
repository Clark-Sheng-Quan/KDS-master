import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { ItemCompletionToast } from "../../components/ItemCompletionToast";
import { useOrders } from "../../contexts/OrderContext";
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import { theme } from "../../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder, CompletedOrder } from "@/services/types";
import { Ionicons } from "@expo/vector-icons";
import { OrderService } from "../../services/orderService/OrderService";
import { callingScreenService } from "../../services/CallingScreenService";
import { callingScreenDiscovery } from "../../services/CallingScreenDiscovery";
import { useSettings } from "../../contexts/SettingsContext";
import {
  PADDING,
  cardStyles as cardStylesSheet,
  preCalculateCardStyles,
  formatTime,
} from "../../constants/cardConfig";

export default function HomeScreen() {
  const { orders, loading, error, removeOrder, refreshOrders } = useOrders();
  const { completedOrders, addCompletedOrder, removeCompletedOrder } = useCompletedOrders();
  const { cardsPerRow, cardsPerColumn, itemLevelCompletion: enableItemLevelCompletion } = useSettings();
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cardStyles, setCardStyles] = useState<any[]>([]);
  const [localOrders, setLocalOrders] = useState<FormattedOrder[]>([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastItemName, setToastItemName] = useState("");
  const [lastCompletedItemData, setLastCompletedItemData] = useState<{itemId: string; itemName: string; orderId: string; order: FormattedOrder} | null>(null);
  const [orderToastVisible, setOrderToastVisible] = useState(false);
  const [lastCompletedOrderData, setLastCompletedOrderData] = useState<{ order: FormattedOrder } | null>(null);
  const [showRecentItemsMenu, setShowRecentItemsMenu] = useState(false);
  const [showRecentOrdersMenu, setShowRecentOrdersMenu] = useState(false);
  const recallingItemsRef = useRef<Set<string>>(new Set());  // 用 useRef 来同步控制，避免竞速问题，不显示 UI
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

  // 更新当前时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const availableWidth = dimensions.width - PADDING * 2;
  const availableHeight = dimensions.height;
  
  // 监听屏幕尺寸变化以更新 dimensions
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 当订单、卡片尺寸、尺寸改变时，重新计算卡片样式
  useEffect(() => {
    const styles = preCalculateCardStyles(
      filteredOrders.length,
      availableWidth,
      availableHeight,
      cardsPerRow,
      cardsPerColumn
    );
    setCardStyles(styles);
  }, [filteredOrders.length, availableWidth, availableHeight, cardsPerRow, cardsPerColumn]);

  // 直接使用来自 OrderService 的已过滤订单，无需在 home 中重复过滤
  useEffect(() => {
    setFilteredOrders(orders);
    setLocalOrders(orders);  // 同步到本地副本
  }, [orders]);

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
    removeOrder(order.id);

    // whole 模式下，点击 Done 后显示快速整单撤回提示
    if (!enableItemLevelCompletion) {
      setLastCompletedOrderData({ order });
      setOrderToastVisible(true);
    }
  }, [removeOrder, enableItemLevelCompletion]);

  // 处理项目移除 - 更新本地订单中的产品列表
  const handleItemRemoved = useCallback((itemId: string, itemName: string, updatedOrder: FormattedOrder) => {
    // 更新 localOrders 中的订单
    setLocalOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    // 更新 filteredOrders 中的订单
    setFilteredOrders((prev) =>
      prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order))
    );
    console.log(`[Home] 项目已移除: ${itemName} (${itemId}), 订单剩余项目数: ${updatedOrder.products?.length || 0}`);
  }, []);

  // 处理项目完成 - 显示 Toast
  const handleItemCompleted = useCallback((itemName: string, itemId: string, orderId: string) => {
    // 从 localOrders 中找到订单
    const order = localOrders.find(o => o.id === orderId);
    if (order) {
      setToastItemName(itemName);
      setLastCompletedItemData({itemId, itemName, orderId, order});
      setToastVisible(true);
    }
  }, [localOrders]);

  // 通用的 recall item 函数（Undo 和 Recall 都用这个）
  const recallItemToOrder = useCallback(async (
    itemId: string,
    itemName: string,
    orderId: string,
    item: any,
    baseOrder: FormattedOrder,
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
      removeCompletedOrder(orderId, itemId).catch(error => {
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

    const { itemId, itemName, orderId, order } = lastCompletedItemData;
    
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

    await recallItemToOrder(itemId, itemName, orderId, item, order, () => {
      setToastVisible(false);
      setLastCompletedItemData(null);
    });
  }, [lastCompletedItemData, recallItemToOrder]);

  // 处理 Recall（从菜单）
  const handleRecallItem = useCallback(async (completedItem: any) => {
    const { itemId, itemName, completedOrder, item } = completedItem;
    const orderId = completedOrder.order.id;

    await recallItemToOrder(itemId, itemName, orderId, item, completedOrder.order, () => {
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
      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={{ flexGrow: 1 }}
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
      >
        <View style={styles.headerContainer}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>
              {t("newOrders")} ({filteredOrders.length})
            </Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
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
              <Text style={styles.timeDisplay}>{formatTime(currentTime)}</Text>
            </View>
          </View>
        </View>

        {orders.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 }}>
            <Text style={styles.noOrdersText}>{t("noOrders")}</Text>
          </View>
        ) : (
          <View style={styles.cardsContainer}>
            {cardStyles.length > 0 && filteredOrders.map((order, index) => (
              <OrderCard
                key={order.id}
                order={order}
                style={[styles.cardStyle, cardStyles[index]]}
                onOrderComplete={handleOrderRemove}
                onOrderCancel={handleOrderRemove}
                onItemRemoved={handleItemRemoved}
                onItemCompleted={handleItemCompleted}
                showDateInDue={true}
                selectable={false}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Recent Items Menu - Animated Overlay */}
      {showRecentItemsMenu && enableItemLevelCompletion && (
        <>
          {/* Backdrop */}
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
            }}
            onPress={() => setShowRecentItemsMenu(false)}
            activeOpacity={1}
          />

          {/* Animated Menu - Top aligned */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              height: dimensions.height * 0.7,
              width: Math.max(dimensions.width * 0.3, 280),
              maxWidth: dimensions.width * 0.45,
              backgroundColor: '#fff',
              borderRadius: 16,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              zIndex: 1101,
              overflow: 'hidden',
              transform: [
                {
                  translateX: recentMenuAnimValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Math.max(dimensions.width * 0.3, 280) + 32, 0],
                  }),
                },
              ],
            }}
          >
            {/* Header */}
            <View
              style={{
                padding: 18,
                paddingBottom: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: '#f0f0f0',
                backgroundColor: '#fafafa',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', flex: 1 }}>
                {t("recallItem")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowRecentItemsMenu(false)}
                style={{ padding: 8, marginLeft: 8 }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Items List */}
            {completedOrders.length > 0 ? (
              <FlatList
                data={completedOrders
                  .slice(0, 30)
                  .flatMap(co => 
                    (co.completedItems || []).map(item => ({
                      orderNum: co.order.num,
                      tableNumber: co.order.tableNumber,
                      itemName: item.name,
                      itemId: item.id,
                      itemQuantity: item.quantity || 1,
                      completedOrder: co,
                      item: item,
                    }))
                  )
                }
                renderItem={({ item: menuItem }) => (
                  <View
                    style={{
                      padding: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f5f5f5',
                    }}
                  >
                    {/* Order Number */}
                    <Text
                      style={{
                        fontWeight: '700',
                        fontSize: 16,
                        marginBottom: 6,
                        color: '#1a1a1a',
                      }}
                    >
                      {t("order")} #{menuItem.orderNum}
                    </Text>

                    {/* Table Number */}
                    {menuItem.tableNumber && (
                      <Text
                        style={{
                          fontSize: 14,
                          marginBottom: 6,
                          color: '#888',
                          fontWeight: '500',
                        }}
                      >
                        {t("table")} {menuItem.tableNumber}
                      </Text>
                    )}

                    {/* Item Name with Quantity */}
                    <Text
                      style={{
                        fontSize: 14,
                        marginBottom: 10,
                        color: '#333',
                        fontWeight: '600',
                      }}
                    >
                      {menuItem.itemName} {menuItem.itemQuantity > 1 ? `× ${menuItem.itemQuantity}` : ''}
                    </Text>

                    {/* Recall Button */}
                    <TouchableOpacity
                      onPress={() => {
                        // menuItem 已包含所有需要的数据：completedOrder, itemId, itemName, item
                        handleRecallItem(menuItem);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        backgroundColor: '#2e7d32',
                        borderRadius: 8,
                        elevation: 1,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                      }}
                    >
                      <Text
                        style={{
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: 14,
                        }}
                      >
                        {t("recallOrder")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                keyExtractor={(item, idx) =>
                  `${item.completedOrder.order.id}-${item.itemId}-${idx}`
                }
                contentContainerStyle={{ paddingBottom: 16 }}
                scrollEnabled={true}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="list" size={48} color="#ddd" />
                <Text style={{ color: '#aaa', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                  {t("noRecentlyCompletedItems")}
                </Text>
              </View>
            )}
          </Animated.View>
        </>
      )}

      {/* Recent Orders Menu - Animated Overlay */}
      {showRecentOrdersMenu && (
        <>
          <TouchableOpacity
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1100,
            }}
            onPress={() => setShowRecentOrdersMenu(false)}
            activeOpacity={1}
          />

          <Animated.View
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              height: dimensions.height * 0.7,
              width: Math.max(dimensions.width * 0.35, 320),
              maxWidth: dimensions.width * 0.55,
              backgroundColor: '#fff',
              borderRadius: 16,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              zIndex: 1101,
              overflow: 'hidden',
              transform: [
                {
                  translateX: recentOrdersMenuAnimValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Math.max(dimensions.width * 0.35, 320) + 32, 0],
                  }),
                },
              ],
            }}
          >
            <View
              style={{
                padding: 18,
                paddingBottom: 14,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: '#f0f0f0',
                backgroundColor: '#fafafa',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', flex: 1 }}>
                {t("recall")} {t("order")}
              </Text>
              <TouchableOpacity
                onPress={() => setShowRecentOrdersMenu(false)}
                style={{ padding: 8, marginLeft: 8 }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {completedOrders.length > 0 ? (
              <FlatList
                data={completedOrders.slice(0, 30)}
                renderItem={({ item: completedOrder }) => {
                  const itemCount = (completedOrder.completedItems || []).reduce(
                    (sum, p) => sum + (p.quantity || 1),
                    0
                  );
                  const tableNo = completedOrder.order.tableNumber?.trim();
                  const summaryParts = [
                    ...(tableNo ? [`${t("table")} ${tableNo}`] : []),
                    `${t("order")} #${completedOrder.order.num}`,
                    `${itemCount} ${t("items")}`,
                  ];
                  const itemNamesLine = (completedOrder.completedItems || [])
                    .map((p) => `${p.name}${(p.quantity || 1) > 1 ? ` x${p.quantity}` : ""}`)
                    .join(" | ");

                  return (
                    <View
                      style={{
                        padding: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f5f5f5',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '700',
                          fontSize: 15,
                          marginBottom: 6,
                          color: '#1a1a1a',
                        }}
                      >
                        {summaryParts.join(" | ")}
                      </Text>

                      <Text
                        style={{
                          fontSize: 14,
                          marginBottom: 10,
                          color: '#666',
                          fontWeight: '500',
                        }}
                      >
                        {itemNamesLine}
                      </Text>

                      <TouchableOpacity
                        onPress={() => handleRecallOrder(completedOrder)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          backgroundColor: theme.colors.primaryColor,
                          borderRadius: 8,
                          elevation: 1,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.1,
                          shadowRadius: 2,
                        }}
                      >
                        <Text
                          style={{
                            color: 'white',
                            textAlign: 'center',
                            fontWeight: '600',
                            fontSize: 14,
                          }}
                        >
                          {t("recallOrder")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }}
                keyExtractor={(item, idx) => `${item.order.id}-${item.completedAt}-${idx}`}
                contentContainerStyle={{ paddingBottom: 16 }}
                scrollEnabled={true}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
                <Ionicons name="file-tray-full" size={48} color="#ddd" />
                <Text style={{ color: '#aaa', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                  {t("noCompletedOrders")}
                </Text>
              </View>
            )}
          </Animated.View>
        </>
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
