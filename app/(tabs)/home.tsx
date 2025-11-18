import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
  Modal,
  FlatList,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { useOrders } from "../../contexts/OrderContext";
import { theme } from "../../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "@/styles/color";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder } from "@/services/types";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

const PADDING = 16;
const CARD_MARGIN = 6;
const PORTRAIT_CARDS_PER_ROW = 3; // 竖屏每行 3 个
const LANDSCAPE_CARDS_PER_ROW = 5; // 横屏每行 5 个
const DEFAULT_COMPACT_CARDS_PER_ROW = 6;

// 设置相关的常量
const STORAGE_KEY_COMPACT_CARDS_PER_ROW = "compact_cards_per_row";
const STORAGE_KEY_CARDS_PER_COLUMN = "cards_per_column";
const DEFAULT_CARDS_PER_COLUMN = "1.5";

export default function HomeScreen() {
  const { orders, loading, error, removeOrder } = useOrders();
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [cardsPerRow, setCardsPerRow] = useState<number>(
    DEFAULT_COMPACT_CARDS_PER_ROW
  );
  const [cardsPerColumn, setCardsPerColumn] = useState<string>(
    DEFAULT_CARDS_PER_COLUMN
  );
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 监听屏幕尺寸变化
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 更新当前时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 格式化时间
  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  // 根据屏幕方向计算卡片数和可用宽度
  const isLandscape = dimensions.width > dimensions.height;
  const availableWidth = dimensions.width - PADDING * 2;
  
  // 计算卡片高度：基于 cardsPerColumn 计算
  // 假设屏幕可用高度大约为 dimensions.height - 200（扣除顶部导航栏等）
  const availableHeight = dimensions.height;
  const cardHeight = Math.floor(availableHeight / parseFloat(cardsPerColumn));
  // 每次页面获得焦点时加载设置
  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          // 加载每行卡片数量
          const savedCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW
          );
          if (savedCardsPerRow) {
            setCardsPerRow(parseInt(savedCardsPerRow));
          }

          // 加载垂直卡片数量
          const savedCardsPerColumn = await AsyncStorage.getItem(
            STORAGE_KEY_CARDS_PER_COLUMN
          );
          if (savedCardsPerColumn) {
            setCardsPerColumn(savedCardsPerColumn);
          }
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };

      loadSettings();

      // 设置一个定时器，每秒检查一次设置变化
      const intervalId = setInterval(async () => {
        try {
          const savedCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW
          );
          if (
            savedCardsPerRow &&
            parseInt(savedCardsPerRow) !== cardsPerRow
          ) {
            setCardsPerRow(parseInt(savedCardsPerRow));
          }

          const savedCardsPerColumn = await AsyncStorage.getItem(
            STORAGE_KEY_CARDS_PER_COLUMN
          );
          if (
            savedCardsPerColumn &&
            savedCardsPerColumn !== cardsPerColumn
          ) {
            setCardsPerColumn(savedCardsPerColumn);
          }
        } catch (error) {
          console.error("检查设置变化失败:", error);
        }
      }, 1000);

      // 清理函数
      return () => clearInterval(intervalId);
    }, [cardsPerRow, cardsPerColumn])
  );

  // 提取所有可用的商品分类
  // useEffect(() => {
  //   if (orders && orders.length > 0) {
  //     const categories = new Set<string>();
  //     categories.add("all"); // 添加"全部"选项

  //     orders.forEach((order) => {
  //       if (order.products && order.products.length > 0) {
  //         order.products.forEach((product) => {
  //           if (product.category) {
  //             categories.add(product.category);
  //           }
  //         });
  //       }
  //     });

  //     const categoryArray = Array.from(categories);
  //     setAvailableCategories(categoryArray);
  //   }
  // }, [orders]);

  // 根据分类筛选订单
  // useEffect(() => {
  //   if (categoryFilter === "all") {
  //     setFilteredOrders(orders);
  //   } else {
  //     const filtered = orders.filter((order) => {
  //       // 检查订单中是否有至少一个产品属于所选类别
  //       return order.products.some(
  //         (product) => product.category === categoryFilter
  //       );
  //     });
  //     setFilteredOrders(filtered);
  //   }
  // }, [categoryFilter, orders]);

  // 直接使用来自 OrderService 的已过滤订单，无需在 home 中重复过滤
  useEffect(() => {
    setFilteredOrders(orders);
  }, [orders]);

  // 添加这个适配器函数
  const handleOrderRemove = (order: FormattedOrder) => {
    removeOrder(order.id);
  };

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

  if (orders.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.noOrdersText}>{t("noOrders")}</Text>
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
        nestedScrollEnabled={true}
        directionalLockEnabled={true}
      >
        <View style={styles.headerContainer}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>
              {t("newOrders")} ({filteredOrders.length})
            </Text>
          </View>
          <Text style={styles.timeDisplay}>{formatTime(currentTime)}</Text>
        </View>

        <View style={styles.cardsContainer}>
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              style={[
                styles.cardStyle,
                {
                  width:
                    (availableWidth - CARD_MARGIN * (cardsPerRow - 1)) /
                    cardsPerRow,
                  height: cardHeight,
                  marginRight:
                    (filteredOrders.indexOf(order) + 1) % cardsPerRow === 0
                      ? 0
                      : CARD_MARGIN,
                },
              ]}
              onOrderComplete={handleOrderRemove}
              onOrderCancel={handleOrderRemove}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
  },
  scrollContainer: {
    flex: 1,
    padding: PADDING,
  },
  shopNameContainer: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: PADDING,
    marginBottom: 5,
  },
  shopNameText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    textTransform: "uppercase",
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  titleSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginRight: 15,
  },
  timeDisplay: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  filterButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  filterButtonText: {
    color: "white",
    fontWeight: "500",
    fontSize: 14,
    marginRight: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 150,
    paddingLeft: 170,
  },
  dropdownContainer: {
    width: 200,
    maxHeight: 300,
    backgroundColor: "white",
    borderRadius: 8,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  selectedDropdownItem: {
    backgroundColor: "#f0f0f0",
  },
  dropdownItemText: {
    fontSize: 16,
    color: "#333",
  },
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingBottom: 20,
  },
  cardStyle: {
    marginBottom: CARD_MARGIN,
    marginRight: CARD_MARGIN,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "red",
    fontSize: 16,
    textAlign: "center",
  },
  noOrdersText: {
    fontSize: 38,
    color: "#151010",
    textAlign: "center",
  },
});
