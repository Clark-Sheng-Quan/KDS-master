import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  TextInput,
} from "react-native";
import { useLanguage } from "../../contexts/LanguageContext";
import { OrderService } from "../../services/orderService/OrderService";
import * as NetworkService from "../../services/orderService/networkService";

interface OrderStatus {
  paid: number;
  delayed: number;
  cancelled: number;
  other: number;
}

interface OrderSource {
  kiosk: number;
  online: number;
  other: number;
}

export default function Dashboard() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>({
    paid: 0,
    delayed: 0,
    cancelled: 0,
    other: 0,
  });
  const [orderSource, setOrderSource] = useState<OrderSource>({
    kiosk: 0,
    online: 0,
    other: 0,
  });

  // 格式化日期的函数
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // 使用字符串类型来存储日期
  const [startDateStr, setStartDateStr] = useState(formatDate(new Date()));
  const [endDateStr, setEndDateStr] = useState(formatDate(new Date()));

  // 添加日期格式验证函数
  const isValidDateFormat = (dateStr: string): boolean => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const [year, month, day] = dateStr.split("-").map(Number);
    // 创建日期对象来验证日期是否有效
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  };

  useEffect(() => {
    // 当日期字符串有效时，才获取订单
    if (isValidDateFormat(startDateStr) && isValidDateFormat(endDateStr)) {
      fetchOrders();
    }
  }, [startDateStr, endDateStr]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const timeRange: [string, string] = [
        `${startDateStr} 00:00:00`,
        `${endDateStr} 23:59:59`,
      ];
      console.log("Fetching orders with time range:", timeRange);
      const orders = await NetworkService.fetchHistoryOrders(timeRange);
      console.log("orders", orders);
      console.log("orders.length", orders.length);
      setOrders(orders);
      analyzeOrders(orders);
    } catch (error) {
      console.error("获取历史订单失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const analyzeOrders = (orders: any[]) => {
    const sourceCount: OrderSource = {
      kiosk: 0,
      online: 0,
      other: 0,
    };
    orders.forEach((order) => {
      // 统计订单来源
      if (order.source === "kiosk") {
        sourceCount.kiosk++;
      } else if (order.source === "online") {
        sourceCount.online++;
      } else {
        sourceCount.other++;
      }
    });

    setOrderSource(sourceCount);
  };

  const calculatePercentage = (value: number): string => {
    if (!orders.length) return "0%";
    return `${Math.round((value / orders.length) * 100)}%`;
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("dashboard")}</Text>
        <View style={styles.dateContainer}>
          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>{t("startDate")}:</Text>
            <TextInput
              style={styles.dateInput}
              value={startDateStr}
              onChangeText={setStartDateStr}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
          </View>
          <View style={styles.dateInputGroup}>
            <Text style={styles.dateLabel}>{t("endDate")}:</Text>
            <TextInput
              style={styles.dateInput}
              value={endDateStr}
              onChangeText={setEndDateStr}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* 左侧统计信息 */}
          <View style={styles.leftPanel}>
            <View style={styles.statsBox}>
              <Text style={styles.statsTitle}>{t("ordersProcessed")}</Text>
              <Text style={styles.statsValue}>{orders.length}</Text>
            </View>
            <View style={styles.statsBox}>
              <Text style={styles.statsTitle}>{t("ordersDelayed")}</Text>
              <Text style={styles.statsValue}>{orderStatus.delayed}</Text>
            </View>
            <View style={styles.statsBox}>
              <Text style={styles.statsTitle}>{t("ordersCancelled")}</Text>
              <Text style={styles.statsValue}>{orderStatus.cancelled}</Text>
            </View>
          </View>

          {/* 右侧表格 */}
          <View style={styles.rightPanel}>
            <Text style={styles.tableTitle}>{t("orderSource")}</Text>
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <Text style={styles.tableHeaderText}>{t("source")}</Text>
                <Text style={styles.tableHeaderText}>{t("count")}</Text>
                <Text style={styles.tableHeaderText}>{t("percentage")}</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>{t("kiosk")}</Text>
                <Text style={styles.tableCell}>{orderSource.kiosk}</Text>
                <Text style={styles.tableCell}>
                  {calculatePercentage(orderSource.kiosk)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>{t("online")}</Text>
                <Text style={styles.tableCell}>{orderSource.online}</Text>
                <Text style={styles.tableCell}>
                  {calculatePercentage(orderSource.online)}
                </Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>{t("other")}</Text>
                <Text style={styles.tableCell}>{orderSource.other}</Text>
                <Text style={styles.tableCell}>
                  {calculatePercentage(orderSource.other)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  contentContainer: {
    flexDirection: "row",
    padding: 16,
  },
  leftPanel: {
    flex: 1,
    marginRight: 16,
  },
  rightPanel: {
    flex: 1,
  },
  statsBox: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  tableContainer: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 8,
    marginBottom: 8,
  },
  tableHeaderText: {
    flex: 1,
    fontWeight: "bold",
    textAlign: "center",
    color: "#666",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tableCell: {
    flex: 1,
    textAlign: "center",
    color: "#333",
  },
  dateContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 16,
  },
  dateInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 16,
  },
  dateLabel: {
    fontSize: 14,
    marginRight: 8,
    color: "#666",
  },
  dateInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    padding: 8,
    width: 120,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
});
