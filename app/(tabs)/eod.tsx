import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import { useLanguage } from "../../contexts/LanguageContext";

export default function EODScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { completedOrders } = useCompletedOrders();

  // 只统计今天的完成记录
  const todayOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return completedOrders.filter(co => new Date(co.completedAt) >= today);
  }, [completedOrders]);

  // 总完成 dish 数（items）
  const totalDishes = useMemo(() =>
    todayOrders.reduce((sum, co) => sum + co.completedItems.length, 0),
  [todayOrders]);

  // 延迟订单数（avg completion > 7 min = 420s）
  const DELAY_THRESHOLD_SECONDS = 420;
  const delayedCount = useMemo(() =>
    todayOrders.filter(co => {
      const avg = co.completedItems.reduce((s, i) =>
        s + (i.completedElapsedSeconds ?? 0), 0) / (co.completedItems.length || 1);
      return avg > DELAY_THRESHOLD_SECONDS;
    }).length,
  [todayOrders]);

  // 按 pickupMethod 分组（Dine in / Takeaway / Other）
  const dineInCount = useMemo(() =>
    todayOrders.filter(co => co.order.pickupMethod?.toLowerCase() === "dine-in").length,
  [todayOrders]);
  const takeawayCount = useMemo(() =>
    todayOrders.filter(co => co.order.pickupMethod?.toLowerCase() === "take-away").length,
  [todayOrders]);
  const otherCount = useMemo(() =>
    todayOrders.filter(co => {
      const m = co.order.pickupMethod?.toLowerCase();
      return m !== "dine-in" && m !== "take-away";
    }).length,
  [todayOrders]);

  // 按 category 聚合：orders 数量 + 平均完成时间
  const categoryStats = useMemo(() => {
    const map = new Map<string, { orders: number; totalSeconds: number; count: number }>();
    todayOrders.forEach(co => {
      co.completedItems.forEach(item => {
        const cat = (item as any).category || "Other";
        if (!map.has(cat)) map.set(cat, { orders: 0, totalSeconds: 0, count: 0 });
        const entry = map.get(cat)!;
        entry.orders += 1;
        entry.totalSeconds += item.completedElapsedSeconds ?? 0;
        entry.count += 1;
      });
    });
    return Array.from(map.entries()).map(([category, data]) => ({
      category,
      orders: data.orders,
      avgSeconds: data.count > 0 ? Math.round(data.totalSeconds / data.count) : 0,
    }));
  }, [todayOrders]);

  const formatSeconds = (s: number): string => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m} min`;
  };

  const handleSubmit = () => {
    Alert.alert("EOD Report", "Submit end-of-day report?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Submit",
        onPress: () => {
          Alert.alert("Submitted", "EOD report has been submitted.");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KDS Dashboard — EOD Report</Text>
        <View style={{ width: 46 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Summary row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalDishes}</Text>
            <Text style={styles.summaryLabel}>Dishes Completed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: "#e67e22" }]}>{delayedCount}</Text>
            <Text style={styles.summaryLabel}>Dishes Delayed</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{dineInCount}</Text>
            <Text style={styles.summaryLabel}>Dine In</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{takeawayCount}</Text>
            <Text style={styles.summaryLabel}>Takeaway</Text>
          </View>
          {otherCount > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{otherCount}</Text>
              <Text style={styles.summaryLabel}>Other</Text>
            </View>
          )}
        </View>

        {/* Category table */}
        <View style={styles.tableCard}>
          <Text style={styles.tableTitle}>By Category</Text>

          {/* Table header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.tableCellCategory, styles.tableHeaderText]}>
              Category
            </Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Orders</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Avg Time</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Target</Text>
          </View>

          {/* Table rows */}
          {categoryStats.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No data for today</Text>
            </View>
          ) : (
            categoryStats.map((row, i) => (
              <View
                key={row.category}
                style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
              >
                <Text style={[styles.tableCell, styles.tableCellCategory]} numberOfLines={1}>
                  {row.category}
                </Text>
                <Text style={styles.tableCell}>{row.orders}</Text>
                <Text style={[
                  styles.tableCell,
                  row.avgSeconds > DELAY_THRESHOLD_SECONDS && styles.tableCellDelayed,
                ]}>
                  {formatSeconds(row.avgSeconds)}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellTarget]}>7 min</Text>
              </View>
            ))
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.8}>
          <Text style={styles.submitButtonText}>Submit</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    padding: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  // Summary cards
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  summaryCard: {
    flex: 1,
    minWidth: 100,
    backgroundColor: "white",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#1a1a1a",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
    textAlign: "center",
  },
  // Table
  tableCard: {
    backgroundColor: "white",
    borderRadius: 10,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  tableTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#fafafa",
  },
  tableHeader: {
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
  },
  tableHeaderText: {
    fontWeight: "700",
    color: "#555",
    fontSize: 13,
  },
  tableCell: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    textAlign: "center",
  },
  tableCellCategory: {
    flex: 2,
    textAlign: "left",
    fontWeight: "500",
  },
  tableCellDelayed: {
    color: "#e74c3c",
    fontWeight: "700",
  },
  tableCellTarget: {
    color: "#888",
    fontSize: 13,
  },
  emptyRow: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#aaa",
    fontSize: 14,
  },
  // Submit
  submitButton: {
    backgroundColor: "#e67e22",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#e67e22",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  submitButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
