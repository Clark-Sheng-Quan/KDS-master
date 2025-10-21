import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { StockService, StockItem } from "../services/stockService";
import { colors } from "@/styles/color";
import { useLanguage } from "../contexts/LanguageContext";
import { useCategoryColors } from "../contexts/CategoryColorContext";
import { categoryColors } from "../styles/color";
import { ProductDetailPopup } from "../components/ProductDetailPopup";

// 仓库ID常量

// 特殊分类常量
const SOLD_OUT_CATEGORY = "Sold Out";
const LOW_STOCK_CATEGORY = "Limited Stock";

const StockManagementScreen = () => {
  const { t } = useLanguage();
  const { categoryColorMap, setCategoryColor, getCategoryColor } =
    useCategoryColors();

  // 状态管理
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<StockItem[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lowStockThreshold, setLowStockThreshold] = useState<string>("5");
  const [allProducts, setAllProducts] = useState<StockItem[]>([]);

  // 库存更新相关状态
  const [refillModalVisible, setRefillModalVisible] = useState(false);
  const [refillQuantity, setRefillQuantity] = useState("");

  // 添加准备时间相关状态
  const [prepTimeModalVisible, setPrepTimeModalVisible] = useState(false);
  const [prepareTime, setPrepareTime] = useState("");

  // 添加新的状态
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [categoryForColoring, setCategoryForColoring] = useState<string | null>(
    null
  );

  // 添加商品详情弹窗状态
  const [showProductDetail, setShowProductDetail] = useState(false);
  const [selectedProductDetail, setSelectedProductDetail] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // 修改仓库相关状态类型
  const [warehouses, setWarehouses] = useState<{ [key: string]: string }>({});
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("");
  const [selectedWarehouseName, setSelectedWarehouseName] =
    useState<string>("");

  // 加载仓库列表
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        console.log("开始加载仓库列表...");
        const warehouseIds = await StockService.getAllWarehouseId();
        console.log("获取到的仓库数据:", warehouseIds);

        if (warehouseIds) {
          console.log("设置仓库数据到状态...");
          setWarehouses(warehouseIds);

          // 如果有仓库，默认选择第一个
          const firstWarehouseName = Object.keys(warehouseIds)[0];
          console.log("第一个仓库名称:", firstWarehouseName);

          if (firstWarehouseName) {
            console.log("设置默认选中的仓库...");
            setSelectedWarehouseName(firstWarehouseName);
            setSelectedWarehouseId(warehouseIds[firstWarehouseName]);
          } else {
            console.log("没有找到可用的仓库");
          }
        } else {
          console.log("没有获取到仓库数据");
        }
      } catch (error) {
        console.error("加载仓库列表失败，详细错误:", error);
        if (error instanceof Error) {
          console.error("错误信息:", error.message);
          console.error("错误堆栈:", error.stack);
        }
        setError(t("loadWarehousesFailed"));
      }
    };
    loadWarehouses();
  }, []);

  // 加载库存数据
  const loadStockData = async () => {
    if (!selectedWarehouseId) return;

    try {
      setLoading(true);
      setError(null);
      setSelectedProducts(new Set());

      const stockData = await StockService.getWarehouseStock(
        selectedWarehouseId
      );
      console.log("stockData", stockData);

      // 提取分类列表并添加特殊分类
      const categoryList = Object.keys(stockData.products);
      const enhancedCategories = [
        ...categoryList,
        SOLD_OUT_CATEGORY,
        LOW_STOCK_CATEGORY,
      ];
      setCategories(enhancedCategories);

      // 收集所有商品用于特殊分类筛选
      const allProductsList: StockItem[] = [];
      Object.values(stockData.products).forEach((categoryItems) => {
        allProductsList.push(...categoryItems);
      });
      setAllProducts(allProductsList);
    } catch (err) {
      setError("加载库存数据失败");
      console.error("加载库存数据错误:", err);
    } finally {
      setLoading(false);
    }
  };

  // 选择分类
  const handleCategorySelect = async (category: string) => {
    if (category === selectedCategory) return;

    try {
      setLoading(true);
      setSelectedCategory(category);

      // 处理特殊分类
      if (category === SOLD_OUT_CATEGORY) {
        // 筛选库存为0的商品
        const soldOutProducts = allProducts.filter((item) => item.qty === 0);
        setProducts(soldOutProducts);
      } else if (category === LOW_STOCK_CATEGORY) {
        // 筛选库存告急的商品
        const threshold = parseInt(lowStockThreshold) || 5;
        const lowStockProducts = allProducts.filter(
          (item) => item.qty > 0 && item.qty <= threshold
        );
        setProducts(lowStockProducts);
      } else {
        // 获取常规分类的产品
        const categoryProducts = await StockService.getCategoryStock(
          selectedWarehouseId,
          category
        );

        // 为每个产品获取准备时间
        const productsWithPrepTime = await Promise.all(
          categoryProducts.map(async (product) => {
            try {
              const prepareTime = await StockService.getProductPrepareTime(
                product.product_id
              );
              return { ...product, prepare_time: prepareTime };
            } catch (error) {
              console.error(`获取商品 ${product.name} 准备时间失败:`, error);
              return product;
            }
          })
        );

        setProducts(productsWithPrepTime);
      }
    } catch (err) {
      setError(`加载${category}分类产品失败`);
      console.error(`加载${category}分类产品错误:`, err);
    } finally {
      setLoading(false);
    }
  };

  // 切换商品选择状态
  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prevSelected) => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(productId)) {
        newSelected.delete(productId);
      } else {
        newSelected.add(productId);
      }
      return newSelected;
    });
  };

  // 标记为售罄
  const markAsSoldOut = async () => {
    try {
      setLoading(true);
      const selectedProductIds = Array.from(selectedProducts);

      // 保存当前分类，此后要重新加载它
      const currentCategory = selectedCategory;

      // 更新操作
      console.log("准备将以下商品标记为售罄:", selectedProductIds);
      for (const productId of selectedProductIds) {
        console.log(`更新商品 ${productId} 库存为0...`);
        await StockService.updateProductStock(
          selectedWarehouseId,
          productId,
          0
        );
      }

      console.log("售罄操作完成，准备重新加载数据...");

      // 添加延迟确保服务器处理完成
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 强制从服务器重新获取数据
      console.log("重新加载库存数据...");
      try {
        // 获取仓库库存数据
        const stockData = await StockService.getWarehouseStock(
          selectedWarehouseId
        );
        console.log("获取到最新库存数据:", stockData);

        // 提取分类列表并添加特殊分类
        const categoryList = Object.keys(stockData.products);
        const enhancedCategories = [
          ...categoryList,
          SOLD_OUT_CATEGORY,
          LOW_STOCK_CATEGORY,
        ];
        setCategories(enhancedCategories);

        // 收集所有商品用于特殊分类筛选
        const allProductsList: StockItem[] = [];
        Object.values(stockData.products).forEach((categoryItems) => {
          allProductsList.push(...categoryItems);
        });
        console.log("更新全部商品数据，商品总数:", allProductsList.length);
        setAllProducts(allProductsList);

        // 清除选择
        setSelectedProducts(new Set());

        // 重新加载当前分类的商品
        if (currentCategory) {
          // 获取常规分类的产品
          try {
            const categoryProducts = await StockService.getCategoryStock(
              selectedWarehouseId,
              currentCategory
            );

            setProducts(categoryProducts);
          } catch (err) {
            console.error(`获取${currentCategory}分类商品失败:`, err);
          }
        }
      } catch (err) {
        console.error("重新加载库存数据失败:", err);
      }

      Alert.alert(t("success"), t("markedAsSoldOut"));
    } catch (error) {
      console.error("标记售罄错误:", error);
      setError(t("markSoldOutFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 补充库存 - 显示输入对话框
  const handleRefill = () => {
    setRefillQuantity("");
    setRefillModalVisible(true);
  };

  // 执行库存更新
  const submitRefill = async () => {
    const qty = parseInt(refillQuantity);

    if (isNaN(qty) || qty < 0) {
      Alert.alert(t("error"), t("enterValidStock"));
      return;
    }

    setRefillModalVisible(false);

    try {
      setLoading(true);
      const selectedProductIds = Array.from(selectedProducts);

      // 保存当前分类，此后要重新加载它
      const currentCategory = selectedCategory;

      // 更新操作
      for (const productId of selectedProductIds) {
        await StockService.updateProductStock(
          selectedWarehouseId,
          productId,
          qty
        );
      }

      // 获取仓库库存数据
      const freshStockData = await StockService.getWarehouseStock(
        selectedWarehouseId
      );

      // 收集所有商品用于特殊分类筛选
      const freshProductsList: StockItem[] = [];
      Object.values(freshStockData.products).forEach((categoryItems) => {
        freshProductsList.push(...categoryItems);
      });

      // 更新全局数据
      setAllProducts(freshProductsList);

      // 重新加载当前分类的数据
      if (currentCategory) {
        if (currentCategory === SOLD_OUT_CATEGORY) {
          // 使用新获取的数据筛选
          const soldOutProducts = freshProductsList.filter(
            (item) => item.qty === 0
          );
          setProducts(soldOutProducts);
        } else if (currentCategory === LOW_STOCK_CATEGORY) {
          const threshold = parseInt(lowStockThreshold) || 5;
          const lowStockProducts = freshProductsList.filter(
            (item) => item.qty > 0 && item.qty <= threshold
          );
          setProducts(lowStockProducts);
        } else {
          // 刷新常规分类
          const categoryProducts = await StockService.getCategoryStock(
            selectedWarehouseId,
            currentCategory
          );
          setProducts(categoryProducts);
        }
      }

      Alert.alert(t("success"), t("stockUpdatedTo") + ` ${qty}`);
    } catch (error) {
      console.error("补充库存错误:", error);
      setError(t("refillStockFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleLimitedStock = async () => {
    try {
      setLoading(true);
      const selectedProductIds = Array.from(selectedProducts);

      // 保存当前分类，此后要重新加载它
      const currentCategory = selectedCategory;

      // 更新操作
      for (const productId of selectedProductIds) {
        await StockService.updateProductStock(
          selectedWarehouseId,
          productId,
          parseInt(lowStockThreshold)
        );
      }

      // 获取仓库库存数据
      const freshStockData = await StockService.getWarehouseStock(
        selectedWarehouseId
      );

      // 收集所有商品用于特殊分类筛选
      const freshProductsList: StockItem[] = [];
      Object.values(freshStockData.products).forEach((categoryItems) => {
        freshProductsList.push(...categoryItems);
      });

      // 更新全局数据
      setAllProducts(freshProductsList);

      // 重新加载当前分类的数据
      if (currentCategory) {
        if (currentCategory === SOLD_OUT_CATEGORY) {
          // 使用新获取的数据筛选
          const soldOutProducts = freshProductsList.filter(
            (item) => item.qty === 0
          );
          setProducts(soldOutProducts);
        } else if (currentCategory === LOW_STOCK_CATEGORY) {
          const threshold = parseInt(lowStockThreshold) || 5;
          const lowStockProducts = freshProductsList.filter(
            (item) => item.qty > 0 && item.qty <= threshold
          );
          setProducts(lowStockProducts);
        } else {
          // 刷新常规分类
          const categoryProducts = await StockService.getCategoryStock(
            selectedWarehouseId,
            currentCategory
          );
          setProducts(categoryProducts);
        }
      }

      Alert.alert(t("success"), t("stockUpdatedTo") + ` ${t("lowStock")}`);
    } catch (error) {
      console.error("补充库存错误:", error);
      setError(t("updateStockFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 处理阈值变化
  const handleThresholdChange = (value: string) => {
    // 只允许输入数字
    if (/^\d*$/.test(value)) {
      setLowStockThreshold(value);

      // 如果当前选中的是库存告急分类，则刷新显示
      if (selectedCategory === LOW_STOCK_CATEGORY) {
        const threshold = parseInt(value) || 5;
        const lowStockProducts = allProducts.filter(
          (item) => item.qty > 0 && item.qty <= threshold
        );
        setProducts(lowStockProducts);
      }
    }
  };

  // 全选当前分类下的所有产品
  const handleSelectAll = () => {
    // 检查是否所有当前显示的产品都已被选中
    const allSelected = products.every((item) =>
      selectedProducts.has(item.product_id)
    );

    // 创建新的选择集合
    const newSelection = new Set(selectedProducts);

    if (allSelected) {
      // 如果全部选中，则取消所有选择
      products.forEach((item) => {
        newSelection.delete(item.product_id);
      });
    } else {
      // 如果未全部选中，则选择所有
      products.forEach((item) => {
        newSelection.add(item.product_id);
      });
    }

    setSelectedProducts(newSelection);
  };

  // 检查当前是否已全选
  const isAllSelected =
    products.length > 0 &&
    products.every((item) => selectedProducts.has(item.product_id));

  // 处理长按分类事件
  const handleCategoryLongPress = (category: string) => {
    // 不为特殊分类设置颜色
    if (category === SOLD_OUT_CATEGORY || category === LOW_STOCK_CATEGORY) {
      return;
    }
    setCategoryForColoring(category);
    setShowColorPicker(true);
  };

  // 选择颜色处理
  const handleColorSelect = async (colorKey: keyof typeof categoryColors) => {
    if (categoryForColoring) {
      await setCategoryColor(categoryForColoring, colorKey);
      setShowColorPicker(false);
      setCategoryForColoring(null);
    }
  };

  // 处理商品长按
  const handleProductLongPress = (item: StockItem) => {
    setSelectedProductDetail({
      id: item.product_id,
      name: item.name,
    });
    setShowProductDetail(true);
  };

  // 渲染分类项，添加长按事件与背景颜色
  const renderCategoryItem = ({ item }: { item: string }) => {
    // 翻译特殊分类名称
    let displayName = item;
    if (item === SOLD_OUT_CATEGORY) {
      displayName = t("outOfStock");
    } else if (item === LOW_STOCK_CATEGORY) {
      displayName = t("lowStock");
    }

    const categoryBgColor = getCategoryColor(item);

    return (
      <TouchableOpacity
        style={[
          styles.categoryItem,
          selectedCategory === item && styles.selectedCategoryItem,
          item === SOLD_OUT_CATEGORY && styles.soldOutCategoryItem,
          item === LOW_STOCK_CATEGORY && styles.lowStockCategoryItem,
          { backgroundColor: categoryBgColor }, // 应用分类颜色
        ]}
        onPress={() => handleCategorySelect(item)}
        onLongPress={() => handleCategoryLongPress(item)}
        delayLongPress={500}
      >
        <Text
          style={[
            styles.categoryText,
            selectedCategory === item && styles.selectedCategoryText,
            item === SOLD_OUT_CATEGORY && styles.soldOutCategoryText,
            item === LOW_STOCK_CATEGORY && styles.lowStockCategoryText,
            // 如果背景色较深，文字颜色为白色
            categoryBgColor !== "#FFFFFF" && { color: "#333" },
          ]}
        >
          {displayName}
        </Text>
      </TouchableOpacity>
    );
  };

  // 渲染产品项
  const renderProductItem = ({ item }: { item: StockItem }) => (
    <TouchableOpacity
      style={[
        styles.productItem,
        selectedProducts.has(item.product_id) && styles.selectedProduct,
      ]}
      onPress={() => toggleProductSelection(item.product_id)}
      onLongPress={() => handleProductLongPress(item)}
      delayLongPress={500}
    >
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <View style={styles.stockInfoContainer}>
          <Text style={styles.stockText}>
            {t("currentStock")}:{" "}
            <Text
              style={[
                styles.stockCount,
                item.qty <= parseInt(lowStockThreshold)
                  ? styles.lowStock
                  : null,
                item.qty === 0 && styles.soldOutText,
              ]}
            >
              {item.qty}
            </Text>
          </Text>
          {item.prepare_time !== undefined && (
            <Text style={styles.prepTimeText}>
              {" | "}
              {t("prepTime")}:{" "}
              <Text style={styles.prepTimeValue}>{item.prepare_time}min</Text>
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  // 列表为空时显示的内容
  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>{t("noProducts")}</Text>
    </View>
  );

  // 添加颜色选择器模态框
  const renderColorPickerModal = () => (
    <Modal
      visible={showColorPicker}
      transparent
      animationType="fade"
      onRequestClose={() => setShowColorPicker(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.colorPickerModal}>
          <Text style={styles.modalTitle}>
            {t("selectColor")} - {categoryForColoring}
          </Text>

          <View style={styles.colorOptions}>
            {(
              Object.keys(categoryColors) as Array<keyof typeof categoryColors>
            ).map((colorKey) => (
              <TouchableOpacity
                key={colorKey}
                style={[
                  styles.colorOption,
                  { backgroundColor: categoryColors[colorKey] },
                  colorKey === "default" && {
                    borderWidth: 2,
                    borderColor: "#999",
                  },
                ]}
                onPress={() => handleColorSelect(colorKey)}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowColorPicker(false)}
          >
            <Text style={styles.cancelButtonText}>{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // 更新准备时间 - 显示输入对话框
  const handleUpdatePrepTime = () => {
    // 获取选中商品的第一个
    if (selectedProducts.size > 0) {
      const selectedProductId = Array.from(selectedProducts)[0];
      const selectedProduct = products.find(
        (p) => p.product_id === selectedProductId
      );

      if (selectedProduct && selectedProduct.prepare_time !== undefined) {
        setPrepareTime(selectedProduct.prepare_time.toString());
      } else {
        setPrepareTime("0");
      }

      setPrepTimeModalVisible(true);
    }
  };

  // 执行准备时间更新
  const submitPrepTimeUpdate = async () => {
    const time = parseInt(prepareTime);

    if (isNaN(time) || time < 0) {
      Alert.alert(t("error"), t("enterValidPrepTime"));
      return;
    }

    setPrepTimeModalVisible(false);

    try {
      setLoading(true);
      const selectedProductIds = Array.from(selectedProducts);

      if (selectedProductIds.length === 0) {
        return;
      }

      // 只处理第一个选中的商品
      const productId = selectedProductIds[0];

      // 更新准备时间
      await StockService.updateProductPrepareTime(productId, time);

      // 更新本地数据
      setProducts((prevProducts) =>
        prevProducts.map((product) =>
          product.product_id === productId
            ? { ...product, prepare_time: time }
            : product
        )
      );

      // 更新全局数据
      setAllProducts((prevProducts) =>
        prevProducts.map((product) =>
          product.product_id === productId
            ? { ...product, prepare_time: time }
            : product
        )
      );

      Alert.alert(t("success"), t("prepTimeUpdated"));
    } catch (error) {
      console.error("更新准备时间错误:", error);
      setError(t("updatePrepTimeFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 首次加载数据
  useEffect(() => {
    if (selectedWarehouseId) {
      loadStockData();
    }
  }, [selectedWarehouseId]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f8f8" />

      {/* 库存补充输入弹窗 */}
      <Modal
        visible={refillModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRefillModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{t("updateStock")}</Text>
            <Text style={styles.modalSubtitle}>{t("enterStockQuantity")}:</Text>
            <TextInput
              style={styles.modalInput}
              value={refillQuantity}
              onChangeText={setRefillQuantity}
              keyboardType="numeric"
              autoFocus={true}
              placeholder={t("enterStockQuantity")}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setRefillModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={submitRefill}
              >
                <Text style={styles.modalButtonText}>{t("update")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 准备时间更新弹窗 */}
      <Modal
        visible={prepTimeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPrepTimeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{t("updatePrepTime")}</Text>
            <Text style={styles.modalSubtitle}>{t("enterPrepTime")}:</Text>
            <TextInput
              style={styles.modalInput}
              value={prepareTime}
              onChangeText={setPrepareTime}
              keyboardType="numeric"
              autoFocus={true}
              placeholder={t("enterPrepTime")}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setPrepTimeModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={submitPrepTimeUpdate}
              >
                <Text style={styles.modalButtonText}>{t("update")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 添加颜色选择器模态框 */}
      {renderColorPickerModal()}

      {/* 添加商品详情弹窗 */}
      {selectedProductDetail && (
        <ProductDetailPopup
          visible={showProductDetail}
          onClose={() => setShowProductDetail(false)}
          productId={selectedProductDetail.id}
          productName={selectedProductDetail.name}
        />
      )}

      <View style={styles.header}>
        <View style={styles.warehouseSelector}>
          <Text style={styles.warehouseLabel}>{t("selectWarehouse")}:</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedWarehouseName}
              onValueChange={(itemValue: string) => {
                setSelectedWarehouseName(itemValue);
                setSelectedWarehouseId(warehouses[itemValue]);
                // 重新加载数据
                loadStockData();
              }}
            >
              {Object.keys(warehouses).map((name) => (
                <Picker.Item key={name} label={name} value={name} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.thresholdContainer}>
          <Text style={styles.thresholdLabel}>
            {t("lowStock")} {t("threshold")}:
          </Text>
          <TextInput
            style={styles.thresholdInput}
            value={lowStockThreshold}
            onChangeText={handleThresholdChange}
            keyboardType="numeric"
            maxLength={3}
          />
        </View>
        <Text style={styles.selectedCount}>
          {t("selected")}: {selectedProducts.size} {t("items")}
        </Text>
      </View>

      {/* 操作按钮 */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.prepTimeButton,
            selectedProducts.size !== 1 && styles.disabledButton,
          ]}
          onPress={handleUpdatePrepTime}
          disabled={selectedProducts.size !== 1}
        >
          <Text style={styles.actionButtonText}>{t("updatePrepTime")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            selectedProducts.size === 0 && styles.disabledButton,
          ]}
          onPress={markAsSoldOut}
          disabled={selectedProducts.size === 0}
        >
          <Text style={styles.actionButtonText}>{t("outOfStock")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            selectedProducts.size === 0 && styles.disabledButton,
          ]}
          onPress={handleLimitedStock}
          disabled={selectedProducts.size === 0}
        >
          <Text style={styles.actionButtonText}>{t("lowStock")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.refillButton,
            selectedProducts.size === 0 && styles.disabledButton,
          ]}
          onPress={handleRefill}
          disabled={selectedProducts.size === 0}
        >
          <Text style={styles.actionButtonText}>{t("addStock")}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadStockData}>
            <Text style={styles.retryButtonText}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.content}>
          {/* 左侧分类列表 */}
          <View style={styles.categoriesContainer}>
            <Text style={styles.sectionTitle}>{t("productCategory")}</Text>
            <FlatList
              data={categories}
              renderItem={renderCategoryItem}
              keyExtractor={(item) => item}
              style={styles.categoryList}
              showsVerticalScrollIndicator={false}
            />
          </View>

          {/* 右侧产品列表 */}
          <View style={styles.productsContainer}>
            {selectedCategory && (
              <View style={styles.productHeaderContainer}>
                <Text style={styles.sectionTitle}>
                  {selectedCategory} {t("products")}
                </Text>

                {/* 全选按钮 */}
                {products.length > 0 && (
                  <TouchableOpacity
                    style={styles.selectAllButton}
                    onPress={handleSelectAll}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isAllSelected && styles.checkboxSelected,
                      ]}
                    >
                      {isAllSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.selectAllText}>{t("selectAll")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {loading ? (
              <ActivityIndicator
                style={styles.loader}
                size="large"
                color="#0066cc"
              />
            ) : (
              <FlatList
                data={products}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.product_id}
                style={styles.productList}
                ListEmptyComponent={renderEmptyList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  thresholdContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  thresholdLabel: {
    fontSize: 14,
    marginRight: 5,
    color: "#555",
  },
  thresholdInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 50,
    textAlign: "center",
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    elevation: 1,
    gap: 20,
  },
  actionButton: {
    backgroundColor: colors.buttonActionColor,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
    minWidth: 90,
    alignItems: "center",
  },
  refillButton: {
    backgroundColor: colors.primary,
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.5,
  },
  selectedCount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#555",
  },
  content: {
    flex: 1,
    flexDirection: "row",
  },
  categoriesContainer: {
    width: "30%",
    backgroundColor: "#f0f0f0",
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: "#e0e0e0",
  },
  productsContainer: {
    width: "70%",
    padding: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  categoryList: {
    flex: 1,
  },
  categoryItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    elevation: 1,
  },
  selectedCategoryItem: {
    backgroundColor: "#0066cc",
  },
  soldOutCategoryItem: {
    borderLeftWidth: 3,
    borderLeftColor: "#f44336",
  },
  lowStockCategoryItem: {
    borderLeftWidth: 3,
    borderLeftColor: "#ff9800",
  },
  categoryText: {
    fontSize: 14,
    fontWeight: "500",
  },
  selectedCategoryText: {
    color: "#000",
    fontWeight: "bold",
  },
  soldOutCategoryText: {
    fontWeight: "bold",
  },
  lowStockCategoryText: {
    fontWeight: "bold",
  },
  productList: {
    flex: 1,
  },
  productItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    elevation: 1,
  },
  selectedProduct: {
    backgroundColor: "#e3f2fd",
    borderWidth: 1,
    borderColor: "#2196f3",
  },
  productInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productName: {
    fontSize: 20,
    fontWeight: "500",
    flex: 1,
  },
  stockInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  stockText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  stockCount: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  lowStock: {
    color: "#e53935",
  },
  soldOutText: {
    color: "#f44336",
  },
  prepTimeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
    marginLeft: 8,
  },
  prepTimeValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#888",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#e53935",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#0066cc",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  loader: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    width: "80%",
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 15,
    color: "#666",
    textAlign: "center",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    width: "100%",
    marginBottom: 20,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
  },
  confirmButton: {
    backgroundColor: colors.buttonActionColor,
  },
  modalButtonText: {
    fontWeight: "bold",
    fontSize: 14,
    color: "#333",
  },
  productHeaderContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  selectAllButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: "#0066cc",
    borderRadius: 3,
    marginRight: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#0066cc",
  },
  checkmark: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  selectAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "600",
  },
  colorPickerModal: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    width: "80%",
    alignItems: "center",
  },
  colorOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginVertical: 16,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    margin: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  cancelButtonText: {
    color: "#333",
    fontWeight: "bold",
  },
  prepTimeButton: {
    backgroundColor: colors.secondary || "#4CAF50",
  },
  warehouseSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    width: "20%",
  },
  warehouseLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 10,
    color: "#333",
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    backgroundColor: "#fff",
    height: 60,
    width: "70%",
  },
});

export default StockManagementScreen;
