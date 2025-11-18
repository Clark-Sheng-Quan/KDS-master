import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  Text,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { OrderCard } from "../../components/OrderCard";
import { usePreOrders } from "../../contexts/PreOrderContext";
import { theme } from "../../styles/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder } from "@/services/types";
import { useFocusEffect } from "@react-navigation/native";
import {
  PADDING,
  CARD_MARGIN,
  DEFAULT_CARDS_PER_ROW,
  DEFAULT_CARDS_PER_COLUMN,
  STORAGE_KEY_CARDS_PER_ROW,
  STORAGE_KEY_CARDS_PER_COLUMN,
  cardStyles,
  calculateCardWidth,
  calculateCardHeight,
  calculateMarginRight,
  formatTime,
} from "../../constants/cardConfig";

const { width } = Dimensions.get("window");

export default function PreOrdersScreen() {
  const { orders, loading, error, removeOrder } = usePreOrders();
  const { t } = useLanguage();
  const [cardsPerRow, setCardsPerRow] = useState<number>(
    DEFAULT_CARDS_PER_ROW
  );
  const [cardsPerColumn, setCardsPerColumn] = useState<number>(DEFAULT_CARDS_PER_COLUMN);
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dimensions, setDimensions] = useState(Dimensions.get("window"));

  // 监听屏幕尺寸变化以更新 dimensions
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

  // 每次页面获得焦点时加载设置
  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          // 加载卡片数量
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
        } catch (error) {
          console.error("加载设置失败:", error);
        }
      };

      loadSettings();
    }, [])
  );

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
      <ScrollView style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>
            {selectedShopName
              ? `${selectedShopName.toUpperCase()} ${t("preOrders")}`
              : t("preOrders")}{" "}
            ({orders.length})
          </Text>
          <Text style={styles.timeDisplay}>{formatTime(currentTime)}</Text>
        </View>

        <View style={styles.cardsContainer}>
          {(() => {
            const availableWidth = dimensions.width - PADDING * 2;
            const availableHeight = dimensions.height;
            const cardWidth = calculateCardWidth(availableWidth, cardsPerRow);
            const cardHeight = calculateCardHeight(availableHeight, cardsPerColumn);
            
            return orders.map((order, index) => (
              <OrderCard
                key={order.id}
                order={order}
                style={[
                  styles.cardStyle,
                  {
                    width: cardWidth,
                    height: cardHeight,
                    marginRight: calculateMarginRight(index, cardsPerRow),
                  },
                ]}
                onOrderComplete={handleOrderRemove}
                onOrderCancel={handleOrderRemove}
              />
            ));
          })()}
        </View>
      </ScrollView>
    </View>
  );
}

const preOrdersStyles = {
  headerContainer: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: "#1a1a1a",
    flex: 1,
  },
  timeDisplay: {
    fontSize: 18,
    fontWeight: "bold" as const,
    color: "#333",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
};

const styles = { ...cardStyles, ...preOrdersStyles };
