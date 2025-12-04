import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  Text,
  Dimensions,
  Modal,
  TouchableOpacity,
  FlatList,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { ItemCompletionToast } from "../../components/ItemCompletionToast";
import { useOrders } from "../../contexts/OrderContext";
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import { theme } from "../../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder, CompletedOrder } from "@/services/types";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { OrderService } from "../../services/orderService/OrderService";
import { settingsListener } from "../../services/settingsListener";
import {
  PADDING,
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARDS_PER_COLUMN,
  STORAGE_KEY_CARDS_PER_ROW,
  STORAGE_KEY_CARDS_PER_COLUMN,
  cardStyles as cardStylesSheet,
  preCalculateCardStyles,
  formatTime,
} from "../../constants/cardConfig";

export default function HomeScreen() {
  const { orders, loading, error, removeOrder } = useOrders();
  const { completedOrders, removeCompletedOrder } = useCompletedOrders();
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardsPerRow, setCardsPerRow] = useState<number>(DEFAULT_CARDS_PER_ROW);
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cardStyles, setCardStyles] = useState<any[]>([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastItemName, setToastItemName] = useState("");
  const [lastCompletedItemData, setLastCompletedItemData] = useState<{itemId: string; itemName: string; orderId: string; order: FormattedOrder} | null>(null);
  const [showRecentItemsMenu, setShowRecentItemsMenu] = useState(false);
  const recallingItemsRef = useRef<Set<string>>(new Set());  // 用 useRef 来同步控制，避免竞速问题，不显示 UI
  const [enableItemLevelCompletion, setEnableItemLevelCompletion] = useState<boolean>(false);

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

  // 每次页面获得焦点时重新加载设置
  useFocusEffect(
    useCallback(() => {
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
          const savedItemLevelCompletion = await AsyncStorage.getItem(
            "item_level_completion"
          );
          if (savedItemLevelCompletion !== null) {
            setEnableItemLevelCompletion(savedItemLevelCompletion === "true");
          }
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };
      loadSettings();
    }, [])
  );

  // 监听项目级完成模式设置变化（无需重启应用即可生效）
  useEffect(() => {
    const handleItemLevelCompletionChange = (value: boolean) => {
      setEnableItemLevelCompletion(value);
      console.log('[Home] 项目级完成模式已更改:', value);
    };

    settingsListener.onSettingChange('item_level_completion', handleItemLevelCompletionChange);

    return () => {
      settingsListener.offSettingChange('item_level_completion', handleItemLevelCompletionChange);
    };
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
  }, [orders]);

  // 添加这个适配器函数
  const handleOrderRemove = useCallback((order: FormattedOrder) => {
    removeOrder(order.id);
  }, [removeOrder]);

  // 处理项目移除 - 更新订单中的产品列表，如果订单为空则删除
  const handleItemRemoved = useCallback((itemId: string, itemName: string, updatedOrder: FormattedOrder) => {
    // 检查订单是否还有产品，如果没有则删除订单；否则更新订单
    const hasProducts = updatedOrder.products && updatedOrder.products.length > 0;
    
    setFilteredOrders((prev) => {
      if (hasProducts) {
        // 订单还有产品，更新订单
        return prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order));
      } else {
        // 订单没有产品了，删除订单
        return prev.filter((order) => order.id !== updatedOrder.id);
      }
    });
    
    console.log(`[Home] 项目已移除: ${itemName} (${itemId}), 订单剩余项目数: ${updatedOrder.products?.length || 0}${!hasProducts ? ' -> 订单已删除' : ''}`);
  }, []);

  // 处理项目完成 - 显示 Toast
  const handleItemCompleted = useCallback((itemName: string, itemId: string, orderId: string) => {
    // 从 filteredOrders 中找到订单
    const order = filteredOrders.find(o => o.id === orderId);
    if (order) {
      setToastItemName(itemName);
      setLastCompletedItemData({itemId, itemName, orderId, order});
      setToastVisible(true);
    }
  }, [filteredOrders]);

  // 处理撤回项目完成 - 把 item 加回到订单中（不是 recall）
  const handleItemUndoCompletion = useCallback(async () => {
    if (lastCompletedItemData) {
      try {
        console.log('[Home] Undo: 开始撤回 item:', {
          itemId: lastCompletedItemData.itemId,
          itemName: lastCompletedItemData.itemName,
          orderId: lastCompletedItemData.orderId
        });
        
        // 从订单中找到该 item
        let itemToUndo = lastCompletedItemData.order.products?.find(
          p => p.id === lastCompletedItemData.itemId
        );
        
        // 如果没找到，尝试其他可能的 id 字段
        if (!itemToUndo) {
          itemToUndo = lastCompletedItemData.order.products?.find(p => 
            (p as any)._id === lastCompletedItemData.itemId || 
            (p as any).itemId === lastCompletedItemData.itemId
          );
        }
        
        if (!itemToUndo) {
          console.error('[Home] Undo: 无法找到要撤回的 item');
          return;
        }

        // 把 item 加回到 filteredOrders 中的订单（不移除）
        setFilteredOrders((prev) => 
          prev.map((order) => {
            if (order.id === lastCompletedItemData.orderId) {
              // 如果 item 还不在订单中，则加回
              const itemExists = order.products?.some(p => p.id === lastCompletedItemData.itemId);
              if (!itemExists && itemToUndo) {
                return {
                  ...order,
                  products: [...(order.products || []), itemToUndo],
                };
              }
            }
            return order;
          })
        );
        
        // 从 completed orders 中删除该 item，同时恢复 item 到 completed order 中
        await removeCompletedOrder(lastCompletedItemData.orderId, lastCompletedItemData.itemId, itemToUndo);
        
        setToastVisible(false);
        setLastCompletedItemData(null);
        console.log(`[Home] ✓ Undo 撤回 item: ${lastCompletedItemData.itemName}，item 已加回到订单`);
      } catch (error) {
        console.error(`[Home] Undo 撤回失败:`, error);
      }
    }
  }, [lastCompletedItemData, removeCompletedOrder]);

  // Recall 单个 item - 检查订单是否在 localOrders 中
  const handleRecallItem = useCallback(async (completedItem: any) => {
    try {
      const itemId = completedItem.itemId;
      const orderId = completedItem.order.id;
      
      // 使用 useRef 进行竞速保护（同步检查，不依赖 state 更新）
      if (recallingItemsRef.current.has(itemId)) {
        console.log(`[Home] Item 正在 recall 中，跳过重复点击: ${itemId}`);
        return;
      }

      console.log('[Home] handleRecallItem 开始:', {
        itemId,
        itemName: completedItem.itemName,
        orderId,
      });

      if (!itemId) {
        console.error('[Home] Item 没有 itemId，无法 recall');
        return;
      }

      // 立即标记为正在 recall（同步）
      recallingItemsRef.current.add(itemId);

      // 从 completedItems 中获取要 recall 的 item
      const itemToRecall = completedItem.completedItems?.[0];
      if (!itemToRecall) {
        console.error('[Home] 无法找到要 recall 的 item 信息');
        recallingItemsRef.current.delete(itemId);
        return;
      }

      // 检查订单是否在 filteredOrders 中
      const existingOrderInLocal = filteredOrders.find(o => o.id === orderId);
      
      if (existingOrderInLocal) {
        // ✅ 情况1：订单存在于 filteredOrders 中（比如 recall 第二个 item）
        console.log(`[Home] 订单已存在于 filteredOrders，直接添加 item`);
        
        const itemAlreadyExists = existingOrderInLocal.products?.some(p => p.id === itemId);
        if (itemAlreadyExists) {
          console.log(`[Home] Item 已存在于订单中，跳过`);
          await removeCompletedOrder(orderId, itemId);
          // 延迟清除标记，防止在 removeCompletedOrder 的 async 期间发生重复点击
          setTimeout(() => {
            recallingItemsRef.current.delete(itemId);
          }, 100);
          return;
        }

        // 直接添加 item 到订单
        const updatedOrder = {
          ...existingOrderInLocal,
          products: [...(existingOrderInLocal.products || []), itemToRecall],
        };

        setFilteredOrders((prev) =>
          prev.map((order) => (order.id === orderId ? updatedOrder : order))
        );

        // 同时同步到 recall order（持久化）
        await OrderService.recallOrder(updatedOrder);

        console.log(`[Home] ✓ Item 已添加到订单: ${completedItem.itemName}`);
      } else {
        // ❌ 情况2：订单不存在于 filteredOrders 中（比如 recall 第一个 item 或订单已过期）
        console.log(`[Home] 订单不存在于 filteredOrders，创建新的 recall order`);
        
        const recalledOrder: FormattedOrder = {
          ...completedItem.order,
          id: orderId,
          products: [itemToRecall],
          isRecalled: true,
        };

        await OrderService.recallOrder(recalledOrder);
        
        // 新创建的 recall order 需要添加到 filteredOrders，这样 UI 才能显示
        setFilteredOrders((prev) => [recalledOrder, ...prev]);
        
        console.log(`[Home] ✓ 创建/更新 recall order: ${completedItem.itemName}`);
      }
      
      // 从 completed orders 中删除该 item
      await removeCompletedOrder(orderId, itemId);

      console.log(`[Home] ✓ 成功 recall item: ${completedItem.itemName}`);
      setShowRecentItemsMenu(false);
    } catch (error) {
      console.error('[Home] Recall item 失败:', error);
    } finally {
      // 延迟清除标记（100ms），防止在 finally 块执行后立即重复点击
      setTimeout(() => {
        recallingItemsRef.current.delete(completedItem.itemId);
      }, 100);
    }
  }, [removeCompletedOrder, filteredOrders]);  useEffect(() => {
    const loadShopInfo = async () => {
      try {
        // 预留位置：如果需要店铺信息可以从这里加载
        // const shopName = await AsyncStorage.getItem("selectedShopName");
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
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
            {enableItemLevelCompletion && (
              <TouchableOpacity 
                onPress={() => setShowRecentItemsMenu(true)}
                style={{padding: 8}}
              >
                <Ionicons name="list" size={24} color={theme.colors.primaryColor} />
              </TouchableOpacity>
            )}
            <Text style={styles.timeDisplay}>{formatTime(currentTime)}</Text>
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
                selectable={false}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showRecentItemsMenu && enableItemLevelCompletion}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRecentItemsMenu(false)}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Transparent left 2/3 for dismissing */}
          <TouchableOpacity
            style={{ flex: 2 }}
            onPress={() => setShowRecentItemsMenu(false)}
            activeOpacity={1}
          />

          {/* Right 1/3 menu */}
          <View
            style={{
              flex: 1,
              backgroundColor: '#fff',
              borderLeftWidth: 1,
              borderLeftColor: '#ddd',
            }}
          >
            {/* Header */}
            <View
              style={{
                padding: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottomWidth: 1,
                borderBottomColor: '#ddd',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000' }}>
                最近完成
              </Text>
              <TouchableOpacity
                onPress={() => setShowRecentItemsMenu(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color="#000" />
              </TouchableOpacity>
            </View>

            {/* Items List */}
            {completedOrders.length > 0 ? (
              <FlatList
                data={useMemo(() => completedOrders.slice(0, 30).flatMap((co: any) => 
                  // 展开每个 CompletedOrder 中的所有 completedItems
                  (co.completedItems || []).map((item: any) => ({
                    completedOrderId: co.order.id,
                    orderNum: co.order.num,
                    tableNumber: co.order.tableNumber,
                    itemName: item.name,
                    itemId: item.id,
                    completedOrder: co,
                    item: item,
                  }))
                ), [completedOrders])}
                renderItem={({ item: menuItem }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingHorizontal: 14,
                      paddingVertical: 18,
                      borderBottomWidth: 1,
                      borderBottomColor: '#f0f0f0',
                    }}
                  >
                    {/* Left side: Order info and Item name */}
                    <View style={{ flex: 1, marginRight: 14 }}>
                      {/* Order Number and Table */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Text
                          style={{
                            fontWeight: 'bold',
                            fontSize: 16,
                            color: '#000',
                            marginRight: 10,
                          }}
                        >
                          Order #{menuItem.orderNum}
                        </Text>
                        {menuItem.tableNumber && (
                          <Text
                            style={{
                              fontSize: 13,
                              color: '#999',
                            }}
                          >
                            • Table {menuItem.tableNumber}
                          </Text>
                        )}
                      </View>

                      {/* Item Name */}
                      <Text
                        style={{
                          fontSize: 13,
                          color: '#333',
                          fontWeight: '500',
                        }}
                        numberOfLines={2}
                      >
                        {menuItem.itemName}
                      </Text>
                    </View>

                    {/* Right side: Recall Button */}
                    <TouchableOpacity
                      onPress={() => {
                        // 为 recall，需要传入 CompletedOrder 对象，但只 recall 这个特定的 item
                        const itemToRecall = {
                          ...menuItem.completedOrder,
                          itemId: menuItem.itemId,
                          itemName: menuItem.itemName,
                          completedItem: menuItem.item,
                        };
                        handleRecallItem(itemToRecall);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 18,
                        backgroundColor: '#FF9B2F',
                        borderRadius: 6,
                        justifyContent: 'center',
                        alignItems: 'center',
                        minWidth: 80,
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={{
                          color: 'white',
                          fontWeight: '700',
                          fontSize: 14,
                        }}
                      >
                        Recall
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                keyExtractor={(item, idx) =>
                  `${item.completedOrderId}-${item.itemId}-${idx}`
                }
                contentContainerStyle={{ paddingBottom: 16 }}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#999', fontSize: 14 }}>
                  No recent items
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      
      <ItemCompletionToast
        visible={toastVisible}
        itemName={toastItemName}
        onUndo={handleItemUndoCompletion}
        onDismiss={() => setToastVisible(false)}
        duration={5000}
        positionTop={80}
      />
    </View>
  );
}

const styles = cardStylesSheet;
