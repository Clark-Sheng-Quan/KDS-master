import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../contexts/LanguageContext";
import { colors } from "../styles/color";
import { API_BASE_URL } from "@/services/orderService/constants";
import { getToken } from "@/utils/auth";
import { getProductPrepareTime } from "@/services/orderService/networkService";

// 产品详情接口
export interface ProductDetail {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string[];
  prepare_time?: number;
}

interface ProductDetailPopupProps {
  visible: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

// 示例数据
const MOCK_PRODUCT_DETAILS: Record<string, ProductDetail> = {
  default: {
    id: "default",
    name: "未知商品",
    ingredients: ["未找到配料信息"],
    instructions: ["未找到制作说明"],
  },
  p1: {
    id: "p1",
    name: "椰子奶茶",
    ingredients: ["茶叶", "椰奶", "糖浆", "奶精", "珍珠", "椰果"],
    instructions: [
      "1. 用95°C热水冲泡茶叶3分钟",
      "2. 加入20ml椰奶和15ml糖浆",
      "3. 混合均匀后加入10g奶精",
      "4. 倒入煮好的珍珠和椰果",
      "5. 加入冰块摇匀后装杯",
    ],
    prepare_time: 180,
  },
  p2: {
    id: "p2",
    name: "香煎牛排",
    ingredients: ["牛排", "黑胡椒", "盐", "迷迭香", "黄油", "蒜片"],
    instructions: [
      "1. 牛排室温静置20分钟",
      "2. 撒盐和黑胡椒腌制",
      "3. 热锅倒油至七成热",
      "4. 放入牛排煎至两面金黄",
      "5. 加入黄油、迷迭香和蒜片增香",
      "6. 取出静置5分钟后切片",
    ],
    prepare_time: 600,
  },
  p3: {
    id: "p3",
    name: "草莓蛋糕",
    ingredients: ["面粉", "鸡蛋", "牛奶", "草莓", "糖", "奶油", "黄油"],
    instructions: [
      "1. 预热烤箱至180°C",
      "2. 混合面粉、鸡蛋、牛奶和糖搅拌均匀",
      "3. 倒入烤盘烘烤25分钟",
      "4. 等待蛋糕冷却",
      "5. 涂抹奶油并装饰草莓",
    ],
    prepare_time: 1800,
  },
};

// 获取商品详情的函数
const getProductDetail = async (productId: string): Promise<ProductDetail> => {
  try {
    const token = await getToken();
    if (!token) {
      throw new Error("未获取到有效的token");
    }

    const requestBody = {
      token,
      product_id: productId,
    };

    console.log("请求商品详情:", {
      url: `${API_BASE_URL}/product/get_recipe`,
      body: requestBody,
    });

    const response = await fetch(`${API_BASE_URL}/product/get_recipe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // 获取响应文本
    const responseText = await response.text();
    console.log("服务器响应:", responseText);

    // 尝试解析JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON解析错误:", responseText);
      throw new Error("服务器返回的数据格式不正确");
    }

    // 检查响应状态码
    if (data.status_code !== 200) {
      throw new Error(data.message || "获取商品详情失败");
    }

    const prepTime = await getProductPrepareTime(productId);

    // 适配新的API返回数据格式
    const finalData = {
      id: data.product_id || productId,
      name: "商品详情", // 这个会被传入的productName覆盖
      ingredients: Array.isArray(data.recipe) ? data.recipe : [],
      instructions: data.instruction ? [data.instruction] : [],
      prepare_time: prepTime,
    };
    return finalData;
  } catch (error) {
    console.error("获取商品详情失败:", error);
    // 返回一个基本的默认数据
    return {
      id: productId,
      name: "error",
      ingredients: ["error"],
      instructions: ["error"],
      prepare_time: 0,
    };
  }
};

export const ProductDetailPopup: React.FC<ProductDetailPopupProps> = ({
  visible,
  onClose,
  productId,
  productName,
}) => {
  const { t } = useLanguage();
  const [productDetail, setProductDetail] =
    React.useState<ProductDetail | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (visible && productId) {
      loadProductDetail();
    }
  }, [visible, productId]);

  const loadProductDetail = async () => {
    try {
      setLoading(true);
      // 尝试在mock数据中匹配商品ID
      let detail = await getProductDetail(productId);

      // 如果找不到，使用默认数据但更新名称

      setProductDetail(detail);
    } catch (error) {
      console.error("获取商品详情失败:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!productDetail) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{productDetail.name}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-circle" size={28} color="#666" />
            </TouchableOpacity>
          </View>

          {productDetail.prepare_time && (
            <View style={styles.prepTimeContainer}>
              <Text style={styles.sectionTitle}>{t("prepTime")}</Text>
              <Text style={styles.prepTimeValue}>
                {productDetail.prepare_time}{" "}
                {productDetail.prepare_time >= 60 ? t("minutes") : t("seconds")}
              </Text>
            </View>
          )}

          <ScrollView style={styles.contentScroll}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("ingredients")}</Text>
              {productDetail.ingredients.map((ingredient, index) => (
                <Text key={`ingredient-${index}`} style={styles.listItem}>
                  • {ingredient}
                </Text>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("instructions")}</Text>
              {productDetail.instructions.map((instruction, index) => (
                <Text key={`instruction-${index}`} style={styles.listItem}>
                  {instruction}
                </Text>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "80%",
    maxHeight: "80%",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  closeButton: {
    padding: 5,
  },
  contentScroll: {
    maxHeight: "85%",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#444",
    marginBottom: 10,
  },
  listItem: {
    fontSize: 16,
    color: "#333",
    marginBottom: 6,
    paddingLeft: 5,
  },
  prepTimeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  prepTimeValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.activeColor || "#4CAF50",
  },
});
