import React, { useMemo, useState, useEffect } from "react";
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
import { useOrders } from "../../contexts/OrderContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useLanguage } from "../../contexts/LanguageContext";
import { StockService } from "../../services/stockService";

const DELAY_THRESHOLD_SECONDS = 1200; // 20 minutes
const URGENT_THRESHOLD_SECONDS = 600; // 10 minutes

function formatAvgTime(s: number): string {
  if (s === 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m} min`;
}

export default function EODScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { completedOrders, addCompletedOrder, clearCompletedOrders } = useCompletedOrders();
  const { orders, removeOrders } = useOrders();
  const { mergeTableOrders } = useSettings();
  const [outOfStockCount, setOutOfStockCount] = useState<number | null>(null);

  // Mirrors home.tsx display logic: count visible cards (merged same-table = 1 card)
  const visibleCardCount = useMemo(() => {
    if (!mergeTableOrders) return orders.length;
    const tablesSeen = new Set<string>();
    let count = 0;
    for (const order of orders) {
      const tbl = order.tableNumber?.trim();
      if (tbl) {
        if (!tablesSeen.has(tbl)) { tablesSeen.add(tbl); count++; }
      } else {
        count++;
      }
    }
    return count;
  }, [orders, mergeTableOrders]);

  // Today's completed orders only
  const todayOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return completedOrders.filter((co) => new Date(co.completedAt) >= today);
  }, [completedOrders]);

  const totalDishes = useMemo(
    () => todayOrders.reduce((sum, co) => sum + co.completedItems.length, 0),
    [todayOrders]
  );

  const countDelayedDishes = (threshold: number) => {
    let count = 0;
    todayOrders.forEach((co) => {
      const orderMaxSeconds = Math.max(
        0,
        ...co.completedItems.map((i) => i.completedElapsedSeconds ?? 0)
      );
      if (orderMaxSeconds > threshold) {
        co.completedItems.forEach((i) => {
          if ((i.completedElapsedSeconds ?? 0) > threshold) count++;
        });
      }
    });
    return count;
  };

  const delayedCount = useMemo(() => countDelayedDishes(DELAY_THRESHOLD_SECONDS), [todayOrders]);
  const urgentCount = useMemo(() => countDelayedDishes(URGENT_THRESHOLD_SECONDS), [todayOrders]);

  const isTakeaway = (method?: string) => {
    const m = method?.toLowerCase() ?? '';
    return m.includes('take') || m.includes('away') || m.includes('pickup');
  };
  const isDineIn = (method?: string) => {
    const m = method?.toLowerCase() ?? '';
    return m.includes('dine') || m === 'dinein' || m === 'table';
  };

  const dineInCount = useMemo(
    () => todayOrders.filter((co) => isDineIn(co.order.pickupMethod)).length,
    [todayOrders]
  );
  const takeawayCount = useMemo(
    () => todayOrders.filter((co) => isTakeaway(co.order.pickupMethod)).length,
    [todayOrders]
  );
  const otherCount = useMemo(
    () =>
      todayOrders.filter(
        (co) => !isDineIn(co.order.pickupMethod) && !isTakeaway(co.order.pickupMethod)
      ).length,
    [todayOrders]
  );

  // Per-category stats
  const categoryStats = useMemo(() => {
    const map = new Map<
      string,
      { orders: number; totalSeconds: number; count: number }
    >();
    todayOrders.forEach((co) => {
      co.completedItems.forEach((item) => {
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

  // Try to fetch out-of-stock count
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = await StockService.getAllWarehouseId();
        if (!ids || cancelled) return;
        const firstId = Object.values(ids)[0];
        if (!firstId) return;
        const stock = await StockService.getWarehouseStock(firstId);
        if (cancelled) return;
        let count = 0;
        Object.values(stock.products).forEach((items) => {
          items.forEach((item: any) => {
            if (item.qty === 0) count++;
          });
        });
        setOutOfStockCount(count);
      } catch {
        // silently ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = () => {
    const activeCount = visibleCardCount;
    const message =
      activeCount > 0
        ? `There are still ${activeCount} active order${activeCount === 1 ? "" : "s"}. Confirming will complete all of them.`
        : "No active orders on the board.";

    Alert.alert("End of Day", message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm & Submit",
        style: "destructive",
        onPress: async () => {
          if (activeCount > 0) {
            const ids = orders.map((o) => o.id);
            await Promise.all(
              orders.map((o) =>
                addCompletedOrder(o, o.products || []).catch(() => {})
              )
            );
            removeOrders(ids);
          }
          await clearCompletedOrders();
          Alert.alert("Submitted", "EOD report submitted and all orders cleared.");
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
        <Text style={styles.headerTitle}>Report</Text>
        <View style={{ width: 46 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.mainRow}>
          {/* ── LEFT PANEL ── */}
          <View style={styles.leftPanel}>
            <Text style={styles.dashTitle}>KDS DASHBOARD</Text>
            <View style={styles.dashDivider} />

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>DISHES COMPLETED</Text>
              <Text style={styles.statValue}>{totalDishes}</Text>
            </View>

            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>ITEMS SET OUT OF STOCK</Text>
                <Text style={styles.statSubLabel}>Today</Text>
              </View>
              <Text style={styles.statValue}>
                {outOfStockCount !== null ? outOfStockCount : "—"}
              </Text>
            </View>

            <View style={styles.statRow}>
              <View>
                <Text style={[styles.statLabel, { color: "#f59e0b" }]}>DISHES URGENT</Text>
                <Text style={styles.statSubLabel}>&gt; 10 min</Text>
              </View>
              <Text style={[styles.statValue, { color: "#f59e0b" }]}>{urgentCount}</Text>
            </View>

            <View style={styles.statRow}>
              <View>
                <Text style={[styles.statLabel, { color: "#e74c3c" }]}>DISHES DELAYED</Text>
                <Text style={styles.statSubLabel}>&gt; 20 min</Text>
              </View>
              <Text style={[styles.statValue, { color: "#e74c3c" }]}>{delayedCount}</Text>
            </View>

            <View style={styles.dashDivider} />

            <View style={styles.orderTypeRow}>
              <View style={styles.orderTypeChip}>
                <Ionicons name="restaurant" size={14} color="#2196F3" />
                <Text style={styles.orderTypeLabel}>Dine In</Text>
                <Text style={styles.orderTypeCount}>{dineInCount}</Text>
              </View>
              <View style={styles.orderTypeChip}>
                <Ionicons name="bag-handle" size={14} color="#9c27b0" />
                <Text style={styles.orderTypeLabel}>Takeaway</Text>
                <Text style={styles.orderTypeCount}>{takeawayCount}</Text>
              </View>
              {otherCount > 0 && (
                <View style={styles.orderTypeChip}>
                  <Ionicons name="apps" size={14} color="#607d8b" />
                  <Text style={styles.orderTypeLabel}>Others</Text>
                  <Text style={styles.orderTypeCount}>{otherCount}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── RIGHT TABLE ── */}
          <View style={styles.rightPanel}>
            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.colCategory, styles.tableHeaderText]}>
                Categories
              </Text>
              <Text style={[styles.colOrders, styles.tableHeaderText]}>
                Orders
              </Text>
              <View style={styles.colTime}>
                <Text style={styles.tableHeaderText}>
                  Avg completion time per dish
                </Text>
              </View>
            </View>

            {/* Rows */}
            {categoryStats.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No data for today</Text>
              </View>
            ) : (
              categoryStats.map((row, i) => {
                const isDelayed = row.avgSeconds > DELAY_THRESHOLD_SECONDS;
                return (
                  <View
                    key={row.category}
                    style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
                  >
                    <Text
                      style={[styles.colCategory, styles.categoryText]}
                      numberOfLines={1}
                    >
                      {row.category}
                    </Text>
                    <Text style={[styles.colOrders, styles.ordersText]}>
                      {row.orders}
                    </Text>
                    <Text
                      style={[
                        styles.colTime,
                        styles.avgTimeText,
                        isDelayed && styles.avgTimeDelayed,
                      ]}
                    >
                      {formatAvgTime(row.avgSeconds)}
                    </Text>
                  </View>
                );
              })
            )}

            {/* Submit */}
            <View style={styles.submitRow}>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleSubmit}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
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
  backButton: { padding: 10 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  mainRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },

  // ── LEFT PANEL ──
  leftPanel: {
    width: 260,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  dashTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1a1a1a",
    letterSpacing: 1,
    marginBottom: 10,
  },
  dashDivider: {
    height: 1.5,
    backgroundColor: "#1a1a1a",
    marginVertical: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333",
    letterSpacing: 0.3,
    flex: 1,
    marginRight: 8,
  },
  statSubLabel: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
    fontStyle: "italic",
  },
  statValue: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1a1a1a",
    minWidth: 40,
    textAlign: "right",
  },
  orderTypeRow: {
    gap: 8,
  },
  orderTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f5f7fa",
    borderRadius: 8,
  },
  orderTypeLabel: {
    flex: 1,
    fontSize: 13,
    color: "#555",
    fontWeight: "500",
  },
  orderTypeCount: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },

  // ── RIGHT TABLE ──
  rightPanel: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#f5f7fa",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1a1a1a",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  tableRowAlt: {
    backgroundColor: "#fafbfc",
  },
  colCategory: {
    flex: 2,
  },
  colOrders: {
    flex: 1,
    textAlign: "center",
  },
  colTime: {
    flex: 2,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#e8e8e8",
  },
  categoryText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
  },
  ordersText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
  },
  avgTimeText: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
    paddingLeft: 12,
  },
  avgTimeDelayed: {
    color: "#e74c3c",
    fontWeight: "700",
  },
  emptyRow: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    color: "#aaa",
    fontSize: 14,
  },
  submitRow: {
    padding: 16,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: "#1a1a1a",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
