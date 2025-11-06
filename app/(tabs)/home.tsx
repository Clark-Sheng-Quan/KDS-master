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

export default function HomeScreen() {
  const { orders, loading, error, removeOrder } = useOrders();
  const [viewMode, setViewMode] = useState<"standard" | "compact">("standard");
  const { t } = useLanguage();
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));
  const [compactCardsPerRow, setCompactCardsPerRow] = useState<number>(
    DEFAULT_COMPACT_CARDS_PER_ROW
  );
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState<FormattedOrder[]>([]);

  // 监听屏幕尺寸变化
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // 根据屏幕方向计算卡片数和可用宽度
  const isLandscape = dimensions.width > dimensions.height;
  const cardsPerRowStandard = isLandscape ? LANDSCAPE_CARDS_PER_ROW : PORTRAIT_CARDS_PER_ROW;
  const availableWidth = dimensions.width - PADDING * 2;

  // 每次页面获得焦点时加载设置
  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          // 加载视图模式
          const savedMode = await AsyncStorage.getItem("viewMode");
          if (savedMode === "compact" || savedMode === "standard") {
            setViewMode(savedMode);
          }

          // 加载Compact模式每行卡片数量
          const savedCompactCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW
          );
          if (savedCompactCardsPerRow) {
            setCompactCardsPerRow(parseInt(savedCompactCardsPerRow));
          }
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };

      loadSettings();

      // 设置一个定时器，每秒检查一次设置变化
      const intervalId = setInterval(async () => {
        try {
          const savedCompactCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW
          );
          if (
            savedCompactCardsPerRow &&
            parseInt(savedCompactCardsPerRow) !== compactCardsPerRow
          ) {
            setCompactCardsPerRow(parseInt(savedCompactCardsPerRow));
          }
        } catch (error) {
          console.error("检查设置变化失败:", error);
        }
      }, 1000);

      // 清理函数
      return () => clearInterval(intervalId);
    }, [compactCardsPerRow])
  );

  // 提取所有可用的商品分类
  useEffect(() => {
    if (orders && orders.length > 0) {
      const categories = new Set<string>();
      categories.add("all"); // 添加"全部"选项

      orders.forEach((order) => {
        if (order.products && order.products.length > 0) {
          order.products.forEach((product) => {
            if (product.category) {
              categories.add(product.category);
            }
          });
        }
      });

      const categoryArray = Array.from(categories);
      setAvailableCategories(categoryArray);
    }
  }, [orders]);

  // 根据分类筛选订单
  useEffect(() => {
    if (categoryFilter === "all") {
      setFilteredOrders(orders);
    } else {
      const filtered = orders.filter((order) => {
        // 检查订单中是否有至少一个产品属于所选类别
        return order.products.some(
          (product) => product.category === categoryFilter
        );
      });
      setFilteredOrders(filtered);
    }
  }, [categoryFilter, orders]);

  // 子KDS根据目标分类过滤显示
  useEffect(() => {
    const checkKDSRole = async () => {
      try {
        const role = await AsyncStorage.getItem("kds_role");
        const isSlaveKDS = role === "slave";

        if (isSlaveKDS) {
          // 获取子KDS的分类设置
          const categoryStr = await AsyncStorage.getItem("kds_category");
          const kdsCategory = categoryStr || "all";

          // 自动设置分类过滤器
          if (kdsCategory !== "all") {
            setCategoryFilter(kdsCategory);

            // 过滤订单中的商品，只保留匹配当前分类的商品
            const ordersWithFilteredProducts = orders
              .map((order) => {
                // 首先检查订单是否应该显示（基于targetCategory）
                if (
                  order.targetCategory &&
                  order.targetCategory !== kdsCategory &&
                  kdsCategory !== "all"
                ) {
                  return null; // 不显示不匹配的订单
                }

                // 过滤订单中的商品，只保留匹配分类的
                const filteredProducts = order.products.filter(
                  (product) =>
                    product.category === kdsCategory || kdsCategory === "all"
                );

                // 如果过滤后没有商品，则不显示此订单
                if (filteredProducts.length === 0) {
                  return null;
                }

                // 返回带有过滤后商品的订单
                return {
                  ...order,
                  products: filteredProducts,
                };
              })
              .filter((order) => order !== null) as FormattedOrder[];

            setFilteredOrders(ordersWithFilteredProducts);
            return; // 提前返回，不再执行下面的过滤逻辑
          }

          // 如果分类是"all"，则只根据targetCategory过滤
          const filteredByTarget = orders.filter((order) => {
            // 如果是"all"分类或没有targetCategory，显示所有订单
            if (kdsCategory === "all" || !order.targetCategory) {
              return true;
            }

            // 检查订单的targetCategory是否与KDS分类匹配
            return order.targetCategory === kdsCategory;
          });

          setFilteredOrders(filteredByTarget);
        }
      } catch (error) {
        console.error("检查KDS角色失败:", error);
      }
    };

    checkKDSRole();
  }, [orders]);

  // 切换视图模式
  const toggleViewMode = async (mode: "standard" | "compact") => {
    setViewMode(mode);
    try {
      await AsyncStorage.setItem("viewMode", mode);
    } catch (error) {
      console.error("保存视图模式失败:", error);
    }
  };

  // 根据视图模式计算每行卡片数
  const cardsPerRow =
    viewMode === "compact" ? compactCardsPerRow : cardsPerRowStandard;

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

            {/* 分类筛选下拉列表 */}
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
            >
              <Text style={styles.filterButtonText}>
                {categoryFilter === "all" ? t("allCategories") : categoryFilter}
              </Text>
              <Ionicons
                name={showCategoryDropdown ? "chevron-up" : "chevron-down"}
                size={16}
                color="white"
              />
            </TouchableOpacity>

            {/* 分类下拉选项 */}
            <Modal
              visible={showCategoryDropdown}
              transparent={true}
              animationType="fade"
              onRequestClose={() => setShowCategoryDropdown(false)}
            >
              <TouchableOpacity
                style={styles.modalOverlay}
                activeOpacity={1}
                onPress={() => setShowCategoryDropdown(false)}
              >
                <View style={styles.dropdownContainer}>
                  <FlatList
                    data={availableCategories}
                    keyExtractor={(item) => item}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.dropdownItem,
                          categoryFilter === item &&
                            styles.selectedDropdownItem,
                        ]}
                        onPress={() => {
                          setCategoryFilter(item);
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>
                          {item === "all" ? t("allCategories") : item}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </TouchableOpacity>
            </Modal>
          </View>

          <View style={styles.viewModeContainer}>
            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === "standard" && styles.activeViewModeButton,
              ]}
              onPress={() => toggleViewMode("standard")}
            >
              <Text
                style={[
                  styles.viewModeButtonText,
                  viewMode === "standard" && styles.activeViewModeButtonText,
                ]}
              >
                Standard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewModeButton,
                viewMode === "compact" && styles.activeViewModeButton,
              ]}
              onPress={() => toggleViewMode("compact")}
            >
              <Text
                style={[
                  styles.viewModeButtonText,
                  viewMode === "compact" && styles.activeViewModeButtonText,
                ]}
              >
                Compact ({compactCardsPerRow})
              </Text>
            </TouchableOpacity>
          </View>
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
  viewModeContainer: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#f5f5f5",
  },
  activeViewModeButton: {
    backgroundColor: colors.primary,
  },
  viewModeButtonText: {
    color: "#555",
    fontWeight: "500",
    fontSize: 14,
  },
  activeViewModeButtonText: {
    color: "white",
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
