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
import { theme } from "../../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder, CompletedOrder } from "@/services/types";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { OrderService } from "../../services/orderService/OrderService";
import { settingsListener } from "../../services/settingsListener";
import { callingScreenService } from "../../services/CallingScreenService";
import { callingScreenDiscovery } from "../../services/CallingScreenDiscovery";
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
  const [enableItemLevelCompletion, setEnableItemLevelCompletion] = useState<boolean>(true);
  const recentMenuAnimValue = useMemo(() => new Animated.Value(0), []);

  // 动画处理 - 最近订单菜单
  useEffect(() => {
    Animated.timing(recentMenuAnimValue, {
      toValue: showRecentItemsMenu ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [showRecentItemsMenu, recentMenuAnimValue]);

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
          } else {
            // 如果没有保存的值，默认为 true（item-level 模式）
            setEnableItemLevelCompletion(true);
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
  }, [recallItemToOrder]);  useEffect(() => {
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
            {enableItemLevelCompletion && (
              <TouchableOpacity 
                onPress={() => setShowRecentItemsMenu(true)}
              >
                <Ionicons name="list" size={40} color={theme.colors.primaryColor} />
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
              zIndex: 999,
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
              width: Math.max(dimensions.width * 0.35, 320),
              maxWidth: dimensions.width * 0.55,
              backgroundColor: '#fff',
              borderRadius: 16,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              zIndex: 1000,
              overflow: 'hidden',
              transform: [
                {
                  translateX: recentMenuAnimValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [Math.max(dimensions.width * 0.35, 320) + 32, 0],
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
                {t("recentlyCompleted")}
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
                        {t("recall")}
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
