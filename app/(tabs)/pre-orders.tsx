import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
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
import { colors } from "@/styles/color";
import { useLanguage } from "@/contexts/LanguageContext";
import { FormattedOrder } from "@/services/types";
import { useFocusEffect } from "@react-navigation/native";

const { width } = Dimensions.get("window");
const PADDING = 16;
const CARD_MARGIN = 6;
const DEFAULT_COMPACT_CARDS_PER_ROW = 6;

// 设置相关的常量
const STORAGE_KEY_COMPACT_CARDS_PER_ROW = "compact_cards_per_row";

export default function PreOrdersScreen() {
  const { orders, loading, error, removeOrder } = usePreOrders();
  const { t } = useLanguage();
  const [cardsPerRow, setCardsPerRow] = useState<number>(
    DEFAULT_COMPACT_CARDS_PER_ROW
  );
  const [selectedShopName, setSelectedShopName] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(new Date());

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

  // 每次页面获得焦点时加载设置
  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          // 加载卡片数量
          const savedCardsPerRow = await AsyncStorage.getItem(
            STORAGE_KEY_COMPACT_CARDS_PER_ROW
          );
          if (savedCardsPerRow) {
            setCardsPerRow(parseInt(savedCardsPerRow));
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
        } catch (error) {
          console.error("检查设置变化失败:", error);
        }
      }, 1000);

      // 清理函数
      return () => clearInterval(intervalId);
    }, [cardsPerRow])
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
          {orders.map((order, index) => {
            const availableWidth = width - PADDING * 2;
            return (
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
                      (index + 1) % cardsPerRow === 0 ? 0 : CARD_MARGIN,
                  },
                ]}
                onOrderComplete={handleOrderRemove}
                onOrderCancel={handleOrderRemove}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
    padding: PADDING,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
    flex: 1,
  },
  timeDisplay: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingBottom: 20,
  },
  cardStyle: {
    marginBottom: CARD_MARGIN,
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
