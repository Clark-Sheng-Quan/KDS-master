import React, { useEffect, useState, useCallback, useRef } from "react";
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
  const { orders, loading, error, removeOrder, refreshOrders } = useOrders();
  const { completedOrders, removeCompletedOrder } = useCompletedOrders();
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardsPerRow, setCardsPerRow] = useState<number>(DEFAULT_CARDS_PER_ROW);
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cardStyles, setCardStyles] = useState<any[]>([]);
  const [localOrders, setLocalOrders] = useState<FormattedOrder[]>([]);
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
    setLocalOrders(orders);  // 同步到本地副本
  }, [orders]);

  // 添加这个适配器函数
  const handleOrderRemove = (order: FormattedOrder) => {
    removeOrder(order.id);
  };

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

  // 处理撤回项目完成 - 把 item 加回到订单中（使用和Recall相同的机制）
  const handleItemUndoCompletion = useCallback(async () => {
    if (lastCompletedItemData) {
      try {
        const itemId = lastCompletedItemData.itemId;
        const itemName = lastCompletedItemData.itemName;
        const orderId = lastCompletedItemData.orderId;
        
        // 获取完成的item
        let itemToUndo = lastCompletedItemData.order.products?.find(p => p.id === itemId);
        if (!itemToUndo) {
          itemToUndo = lastCompletedItemData.order.products?.find(p => 
            (p as any)._id === itemId || (p as any).itemId === itemId
          );
        }
        
        if (!itemToUndo) {
          console.error('[Home] Undo: 无法找到要撤回的 item');
          return;
        }

        // 检查订单是否存在（和Recall逻辑一致）
        const existingOrder = localOrders.find(o => o.id === orderId);
        
        if (existingOrder) {
          // 订单存在，检查 item 是否已在其中
          const itemAlreadyExists = existingOrder.products?.some(p => p.id === itemId);
          if (itemAlreadyExists) {
            setToastVisible(false);
            setLastCompletedItemData(null);
            return;
          }

          // 添加 item 到现有订单
          const updatedOrder = {
            ...existingOrder,
            products: [...(existingOrder.products || []), itemToUndo],
          };

          setLocalOrders(prev =>
            prev.map(order => order.id === orderId ? updatedOrder : order)
          );
          setFilteredOrders(prev =>
            prev.map(order => order.id === orderId ? updatedOrder : order)
          );

          // 同步到后端
          OrderService.recallOrder(updatedOrder).catch(error => {
            console.error('[Home] Undo recall 失败:', error);
          });
        } else {
          // 订单不存在，创建新的 undo 订单（只包含这个 item）
          const baseOrder = lastCompletedItemData.order;
          const newUndoOrder: FormattedOrder = {
            id: baseOrder.id,
            _id: baseOrder._id || baseOrder.id,
            num: baseOrder.num,
            orderTime: baseOrder.orderTime,
            pickupMethod: baseOrder.pickupMethod,
            pickupTime: baseOrder.pickupTime,
            kdsReceiveTime: baseOrder.kdsReceiveTime,
            tableNumber: baseOrder.tableNumber,
            products: [itemToUndo],
            source: baseOrder.source,
            isRecalled: true,
          };

          setLocalOrders(prev => [...prev, newUndoOrder]);
          setFilteredOrders(prev => [...prev, newUndoOrder]);

          // 同步到后端
          OrderService.recallOrder(newUndoOrder).catch(error => {
            console.error('[Home] Undo recall 失败:', error);
          });

          // 只在 home 没有 card 时才刷新
          if (filteredOrders.length === 0) {
            refreshOrders().catch(error => {
              console.error('[Home] 刷新订单失败:', error);
            });
          }
        }

        // 删除完成记录 - 异步执行，不等待
        removeCompletedOrder(orderId, itemId).catch(error => {
          console.error('[Home] 删除完成记录失败:', error);
        });

        setToastVisible(false);
        setLastCompletedItemData(null);
        console.log(`[Home] ✓ Undo 成功: ${itemName}`);
      } catch (error) {
        console.error(`[Home] Undo 撤回失败:`, error);
      }
    }
  }, [lastCompletedItemData, removeCompletedOrder, localOrders, refreshOrders]);

  // Recall 单个 item - 使用和Undo相同的机制
  const handleRecallItem = useCallback(async (completedItem: any) => {
    try {
      const itemId = completedItem.itemId;
      const itemName = completedItem.itemName;
      const orderId = completedItem.completedOrder.order.id;
      const itemToRecall = completedItem.item;
      
      // 竞速保护
      if (recallingItemsRef.current.has(itemId)) {
        console.log(`[Home] Item 正在 recall 中，跳过重复点击: ${itemId}`);
        return;
      }

      recallingItemsRef.current.add(itemId);

      // 检查订单是否存在
      const existingOrder = localOrders.find(o => o.id === orderId);
      
      if (existingOrder) {
        // 订单存在，检查 item 是否已在其中
        const itemAlreadyExists = existingOrder.products?.some(p => p.id === itemId);
        if (itemAlreadyExists) {
          console.log(`[Home] Item 已在订单中，无需 recall`);
          recallingItemsRef.current.delete(itemId);
          return;
        }

        // 添加 item 到现有订单
        const updatedOrder = {
          ...existingOrder,
          products: [...(existingOrder.products || []), itemToRecall],
        };

        setLocalOrders(prev =>
          prev.map(order => order.id === orderId ? updatedOrder : order)
        );

        setFilteredOrders(prev =>
          prev.map(order => order.id === orderId ? updatedOrder : order)
        );

        // 同步到后端 - 异步执行，不等待
        OrderService.recallOrder(updatedOrder).catch(error => {
          console.error('[Home] Recall 失败:', error);
        });
      } else {
        // 订单不存在，创建新的 recall 订单（只包含这个 item）
        const baseOrder = completedItem.completedOrder.order;
        
        const newRecalledOrder: FormattedOrder = {
          id: baseOrder.id,
          _id: baseOrder._id || baseOrder.id,
          num: baseOrder.num,
          orderTime: baseOrder.orderTime,
          pickupMethod: baseOrder.pickupMethod,
          pickupTime: baseOrder.pickupTime,
          kdsReceiveTime: baseOrder.kdsReceiveTime,
          tableNumber: baseOrder.tableNumber,
          products: [itemToRecall],
          source: baseOrder.source,
          isRecalled: true,
        };

        setLocalOrders(prev => [...prev, newRecalledOrder]);
        setFilteredOrders(prev => [...prev, newRecalledOrder]);

        // 同步到后端 - 异步执行，不等待
        OrderService.recallOrder(newRecalledOrder).catch(error => {
          console.error('[Home] Recall 失败:', error);
        });

        // 只在 home 没有 card 时才刷新
        if (filteredOrders.length === 0) {
          refreshOrders().catch(error => {
            console.error('[Home] 刷新订单失败:', error);
          });
        }
      }

      // 删除完成记录 - 异步执行，不等待
      removeCompletedOrder(orderId, itemId).catch(error => {
        console.error('[Home] 删除完成记录失败:', error);
      });

      setShowRecentItemsMenu(false);
      console.log(`[Home] ✓ Recall 成功: ${itemName}`);
    } catch (error) {
      console.error('[Home] Recall item 失败:', error);
    } finally {
      // 清除标记
      setTimeout(() => {
        recallingItemsRef.current.delete(completedItem.itemId);
      }, 50);
    }
  }, [localOrders, removeCompletedOrder, refreshOrders]);  useEffect(() => {
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
                Recent Completed Items
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
                data={completedOrders.slice(0, 30).flatMap((co: any) => 
                  // 展开每个 CompletedOrder 中的所有 completedItems
                  (co.completedItems || []).map((item: any) => ({
                    completedOrderId: co.order.id,
                    orderNum: co.order.num,
                    tableNumber: co.order.tableNumber,
                    itemName: item.name,
                    itemId: item.id,
                    itemQuantity: item.quantity || 1,  // 保存数量
                    completedOrder: co,
                    item: item,  // 完整item对象包含所有信息（包括quantity）
                  }))
                )}
                renderItem={({ item: menuItem }) => (
                  <View
                    style={{
                      padding: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#eee',
                    }}
                  >
                    {/* Order Number */}
                    <Text
                      style={{
                        fontWeight: 'bold',
                        fontSize: 14,
                        marginBottom: 4,
                        color: '#000',
                      }}
                    >
                      Order #{menuItem.orderNum}
                    </Text>

                    {/* Table Number */}
                    {menuItem.tableNumber && (
                      <Text
                        style={{
                          fontSize: 12,
                          marginBottom: 4,
                          color: '#666',
                        }}
                      >
                        Table: {menuItem.tableNumber}
                      </Text>
                    )}

                    {/* Item Name with Quantity */}
                    <Text
                      style={{
                        fontSize: 13,
                        marginBottom: 8,
                        color: '#000',
                      }}
                    >
                      {menuItem.itemName} {menuItem.itemQuantity > 1 ? `x${menuItem.itemQuantity}` : ''}
                    </Text>

                    {/* Recall Button */}
                    <TouchableOpacity
                      onPress={() => {
                        // menuItem 已包含所有需要的数据：completedOrder, itemId, itemName, item
                        handleRecallItem(menuItem);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        backgroundColor: theme.colors.primaryColor,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: 'white',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: 12,
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
