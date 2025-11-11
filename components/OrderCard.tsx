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
}

export const OrderCard: React.FC<OrderCardProps> = ({
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
}) => {
  const { t } = useLanguage();
  const { getCategoryColor, categoryColorMap } = useCategoryColors();

  // 跟踪商品的完成状态
  const [completedItems, setCompletedItems] = useState<{
    [key: string]: boolean;
  }>({});

  // 跟踪选项的完成状态
  const [completedOptions, setCompletedOptions] = useState<{
    [key: string]: boolean;
  }>({});

  const [showDoneConfirm, setShowDoneConfirm] = useState(false);

  // 添加商品详情弹窗状态
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 添加状态来检测ScrollView是否可以滚动
  const [isScrollable, setIsScrollable] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // 不需要在这里保存 elapsedTimeFormatted 和 statusColor
  // 这些数据已经由 OrderTimer 组件处理，不需要重复在父组件中保存
  // 这样可以避免无限循环的问题

  // 监听 contentHeight 和 containerHeight 的变化，判断是否可滚动
  useEffect(() => {
    if (contentHeight > 0 && containerHeight > 0) {
      // 需要有足够的差异才认为可以滚动（加10pt的缓冲，避免边界情况）
      const canScroll = contentHeight > containerHeight + 10;
      setIsScrollable(canScroll);
    } else {
      // 重置状态当尺寸不可用时
      setIsScrollable(false);
    }
  }, [contentHeight, containerHeight, order.id]);

    // 🔥 注意：不要在这里设置全局回调！
  // OrderCard 不应该覆盖 DistributionService 设置的订单回调
  // 商品完成状态的更新应该通过其他机制处理（例如事件总线或 context）
  useEffect(() => {
    // TODO: 实现一个事件监听机制来接收商品完成状态更新
    // 而不是设置全局的 TCP 回调
  }, [order.id]);

  // 获取订单来源的颜色
  const getSourceColor = (source: string | undefined) => {
    if (!source) return sourceColors.DEFAULT;

    // 将source转为大写以便匹配
    const upperSource = source.toUpperCase();
    return (
      sourceColors[upperSource as keyof typeof sourceColors] ||
      sourceColors.DEFAULT
    );
  };

  // 获取订单来源的显示名称
  const getSourceDisplayName = (source: string | undefined) => {
    if (!source) return t("unknown");

    // 尝试使用小写的source作为翻译键
    return t(source.toLowerCase());
  };

  // 处理商品点击
  const handleItemClick = (itemId: string) => {
    if (disabled) return;
    setCompletedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // 处理选项点击
  const handleOptionClick = (optionId: string, event: any) => {
    if (disabled) return;
    // 阻止事件冒泡，防止触发父元素的点击事件
    event.stopPropagation();

    setCompletedOptions((prev) => ({
      ...prev,
      [optionId]: !prev[optionId],
    }));
  };

  // 处理商品长按
  const handleItemLongPress = async (item: any) => {
    if (disabled) return;

    // 检查商品是否有配方信息
    const hasRecipe = await checkProductHasRecipe(item.id);
    
    // 只有有配方信息才打开弹窗
    if (!hasRecipe) {
      return;
    }

    // 设置选中的商品信息
    setSelectedProduct({
      id: item.id,
      name: item.name,
    });
    setShowProductDetail(true);
  };

  const handleDoneConfirm = () => {
    setShowDoneConfirm(false);

    // 发送API请求更新订单状态为"ready"
    updateOrderStatusToReady(order._id, order.source || "");

    // 如果是TCP订单，发送完成消息回POS
    if (order.source?.toLowerCase() === 'tcp') {
      // 导入TCPSocketService
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
      
      // console.log(`[OrderCard] 发送完成项目，总数: ${orderitems.length}，过滤状态: ${order._hasFilteredItems ? 'yes' : 'no'}`);
      
      TCPSocketService.sendOrderItemsCompleted(order._id, orderitems);
    }

    // 调用完成订单的回调
    if (onOrderComplete) {
      onOrderComplete(order);
    }
  };

  // 新增：更新订单状态为ready的函数
  const updateOrderStatusToReady = async (orderId: string, source: string) => {
    try {
      // 获取token
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        console.warn('[updateOrderStatusToReady] 没有token，无法更新状态');
        return;
      }

      // 只有网络订单才需要更新状态
      if (source.toLowerCase() === "network") {

        const requestBody = {
          order_id: orderId,  // 使用参数中的 orderId (即 order._id)
          status: "ready",
          source: source,
        };

        // 发送请求
        const response = await fetch(`${BASE_API}/order/update_order_status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`HTTP错误! 状态: ${response.status}`);
        }

        const result = await response.json();
      }
    } catch (error) {
      console.error('[updateOrderStatusToReady] 异常:', error);
    }
  };

  // 安全显示文本，如果为空则显示"null"
  const safeText = (text: string | undefined) => {
    return text || "null";
  };

  // 获取订单显示号码（优先使用 num，否则使用 id 的前 8 位）
  const getOrderDisplayNumber = () => {
    // 如果 num 存在且不等于完整的 id（表示是真正的订单号）
    if (typeof order.num === 'string' || typeof order.num === 'number') {
      const numStr = String(order.num);
      // 检查 num 是否就是完整的 id（长度超过 20 位的 UUID）
      if (numStr.length > 20) {
        // 这是完整的 id，只显示前 8 位
        return numStr.substring(0, 8);
      }
      // 这是真正的订单号，直接返回
      return numStr;
    }
    return order.id.substring(0, 8) || 'N/A';
  };

  // 格式化时间为澳洲格式 (HH:MM-DD-MMM-YYYY)
  const formatAustralianTime = (timeString: string) => {
    try {
      // 假设 timeString 格式为 "HH:MM" 或 ISO 格式
      const date = new Date(timeString);
      
      // 如果是无效日期，尝试作为 "HH:MM" 处理
      if (isNaN(date.getTime())) {
        return timeString; // 返回原值
      }
      
      // 格式化为澳洲格式: HH:MM-DD-MMM-YYYY
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      
      return `${hours}:${minutes} • ${day}-${month}-${year}`;
    } catch (error) {
      return timeString; // 出错时返回原值
    }
  };

  // 获取订单来源颜色
  const sourceColor = getSourceColor(order.source);
  const sourceName = getSourceDisplayName(order.source);


  // 渲染产品项时应用分类颜色
  const renderProductItem = (item: any, index: number) => {
    // 获取产品的分类颜色
    const categoryColor = getCategoryColor(item.category);
    
    // 检查item是否被取消（VOIDED）
    const isVoided = item.itemState === 'VOIDED';

    return (
      <View key={`${order.id}-item-${index}`} style={styles.itemContainer}>
        <TouchableOpacity
          onPress={() => !isVoided && handleItemClick(`${order.id}-item-${index}`)}
          onLongPress={() => !isVoided && handleItemLongPress(item)}
          disabled={disabled || isVoided}
          activeOpacity={isVoided ? 1 : 0.7}
          style={[
            styles.itemRow,
            completedItems[`${order.id}-item-${index}`] && styles.completedItem,
            isVoided && styles.voidedItem, // Add voided style
            // 如果没有option，则添加底部圆角
            (!item.options || item.options.length === 0) && {
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
            }
          ]}
          delayLongPress={500} // 500毫秒长按触发
        >
          <View style={styles.itemNameContainer}>
            <Text style={[
              styles.itemName,
              isVoided && styles.voidedText, // Add strikethrough
            ]}>
              {item.name}
            </Text>
          </View>
          {isVoided ? (
            // Show "Cancelled" for voided items
            <Text style={styles.cancelledText}>Cancelled</Text>
          ) : completedItems[`${order.id}-item-${index}`] ? (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={colors.checkColor}
            />
          ) : (
            <Text style={[styles.itemQuantity, { color: categoryColor }]}>x{item.quantity}</Text>
          )}
        </TouchableOpacity>

        {/* 选项列表 - 如果item被取消，也显示取消样式 */}
        {item.options && Array.isArray(item.options) && item.options.length > 0 && (
          <View style={styles.optionsContainer}>
            {item.options.map((option: any, optIndex: number) => (
              <TouchableOpacity
                key={`${order.id}-item-${index}-option-${optIndex}`}
                onPress={(e) =>
                  !isVoided && handleOptionClick(
                    `${order.id}-item-${index}-option-${optIndex}`,
                    e
                  )
                }
                disabled={disabled || isVoided}
                activeOpacity={isVoided ? 1 : 0.7}
                style={[
                  styles.optionRow,
                  isVoided && styles.voidedOption, // Add voided option style
                  // 最后一个option有底部圆角
                  optIndex === item.options.length - 1 && {
                    borderBottomLeftRadius: 4,
                    borderBottomRightRadius: 4,
                  }
                ]}
              >
                <View style={styles.optionContent}>
                  <Text style={[
                    styles.optionName,
                    isVoided && styles.voidedText, // Strikethrough for options too
                  ]}>
                    - {option.name}
                  </Text>
                  <Text style={[
                    styles.optionValue,
                    isVoided && styles.voidedText,
                  ]}>
                    {" x"}
                    {safeText(option.value)}
                  </Text>
                </View>

                {!isVoided && completedOptions[
                  `${order.id}-item-${index}-option-${optIndex}`
                ] && (
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.checkColor}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.itemDivider} />
      </View>
    );
  };

  // 安全检查：如果订单没有products数组，返回null或空组件
  if (!order.products || !Array.isArray(order.products)) {
    console.error('[OrderCard] Order has no products array:', order);
    return null;
  }

  // 如果需要选择功能，使用 TouchableOpacity；否则使用 View
  const CardWrapper = selectable ? TouchableOpacity : View;
  const cardWrapperProps = selectable ? {
    activeOpacity: disabled ? 1 : 0.7,
    onPress: onSelect,
  } : {};

  return (
    <CardWrapper {...cardWrapperProps}>
      <View
        style={[
          styles.orderCard,
          style,
          order.source === "recalled" && styles.recalledOrder,
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

        <ConfirmModal
          visible={showDoneConfirm}
          title={t("complete")}
          message={`${t("confirmComplete")} #${getOrderDisplayNumber()}?`}
          confirmText={t("complete")}
          cancelText={t("cancel")}
          onConfirm={handleDoneConfirm}
          onCancel={() => setShowDoneConfirm(false)}
        />

        {/* 添加商品详情弹窗 */}
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
          onContentSizeChange={(width, height) => {
            // ScrollView的总内容高度
            setContentHeight(height);
            // 假设OrderActions约50px，所以ScrollView可用空间约550px
            setContainerHeight(550);
          }}
        >
          <View style={styles.textContainer}>
            {/* 新 Header 设计 - 左右两列 */}
            <View style={styles.headerLayout}>
              {/* 左列 */}
              <View style={styles.leftColumn}>
                {/* 左1：Order Number */}
                <Text style={styles.orderId}>
                  #{getOrderDisplayNumber()}
                </Text>
                
                {/* 左2：Pickup Method - 仅内容 */}
                <Text style={[
                  styles.pickupMethodText,
                  { color: order.pickupMethod?.toLowerCase() === 'take-away' ? '#FF9B2F' : '#0096FF' }
                ]}>
                  {order.pickupMethod?.toLowerCase() === 'take-away' ? 'Take-Away' : 
                   order.pickupMethod?.toLowerCase() === 'dine_in' || order.pickupMethod?.toLowerCase() === 'dinein' ? 'Dine-In' : 
                   typeof order.pickupMethod === 'string' ? order.pickupMethod : 'Dine-In'}
                </Text>
                
                {/* 左3：Prepare Time */}
                {typeof order.total_prepare_time === 'number' &&
                  order.total_prepare_time > 0 && (
                    <Text style={styles.prepareTime}>
                      {t("Prepare")}:{" "}
                      <Text style={styles.prepareTimeValue}>
                        {order.total_prepare_time}
                      </Text>{" "}
                      min
                    </Text>
                  )}
                {/* 左4：Table Number */}
                <Text style={styles.prepareTime}>Table:{" "}
                  <Text style={styles.prepareTimeValue}>{order.tableNumber || 'N/A'}</Text>
                </Text>
              </View>

              {/* 右列 */}
              <View style={styles.rightColumn}>
                {/* 右1：Due + Pickup Time */}
                <Text style={styles.dueTimeText}>
                  Due: {formatAustralianTime(order.pickupTime)}
                </Text>
                
                {/* 右2-3：Timer (已过时间 + active/urgent/delayed 状态框) */}
                {!disabled && !hideTimer && <OrderTimer order={order} />}
                
                {/* 右4：打印键 */}
                <PrintButton order={order} disabled={disabled} />
              </View>
            </View>

            <View style={styles.itemsContainer}>
              {order.products && Array.isArray(order.products) && order.products.map((item, index) =>
                renderProductItem(item, index)
              )}
            </View>
          </View>
        </ScrollView>

        {/* 只在可以滚动时显示提示 - 固定在右下角 */}
        {isScrollable && (
          <View style={styles.scrollIndicatorText}>
            <Text style={styles.scrollMoreText}>Scroll to see more items</Text>
          </View>
        )}
        {!disabled && !hideActions && (
          <View>
            <OrderActions
              orderId={order.id}
              onDone={() => setShowDoneConfirm(true)}
              onCancel={() => {
                // 保留空函数，因为不需要取消订单的逻辑
              }}
            />
          </View>
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
};

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
    position: "relative", // 添加相对定位
  },
  sourceIndicator: {
    position: "absolute",
    top: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    zIndex: 1,
  },
  sourceText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 12,
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
  // Header 样式
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 4,
    marginBottom: 12,
    flexShrink: 1,
    minWidth: 0,
  },
  orderId: {
    minWidth: "50%",
    flexShrink: 1,
    fontSize: 32, 
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  orderDetail: {
    fontSize: 14,
    color: "#666",
    marginBottom: 3,
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
  pickupMethodText: {
    fontSize: 18,
    // color 已移到内联样式，根据 pickupMethod 动态设置
    fontWeight: "600", // 增加字重使其更突出
  },
  dueTimeText: {
    fontSize: 14,
    color: "#555",
    marginBottom: 12
  },
  prepareTime: {
    fontSize: 18, // 从 14 增大到 18
    color: "#666",
    marginTop: 12,
    flexWrap: "nowrap",
  },
  prepareTimeValue: {
    fontSize: 18, // 从 14 增大到 18
    color: "#333",
    fontWeight: "bold",
  },
  itemsContainer: {
    marginTop: 20, 
    marginBottom: 8,
  },
  itemsTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 5,
  },
  itemsScrollView: {
    flex: 1,
    minHeight: 0,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
    borderRadius: 0,
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
  optionPrice: {
    fontSize: 12,
    color: "#0066cc",
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
  scrollIndicatorText: {
    position: "absolute",
    bottom: 50, // done button约50px高，所以提示在它上方
    right: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 4,
  },
  scrollMoreText: {
    fontSize: 11,
    color: "#00a8e8", // 蓝色
    fontWeight: "600",
  },
});
