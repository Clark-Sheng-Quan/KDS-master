import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Share,
  Modal,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCompletedOrders } from "../../contexts/CompletedOrderContext";
import { useOrders } from "../../contexts/OrderContext";
import { useSettings } from "../../contexts/SettingsContext";

import { StockService } from "../../services/stockService";

const DELAY_THRESHOLD_SECONDS = 1200; // 20 minutes
const URGENT_THRESHOLD_SECONDS = 600; // 10 minutes
const STORAGE_KEY_EOD_REPORTS = "eod_reports";

interface CategoryStat {
  category: string;
  orders: number;
  avgSeconds: number;
}

interface EODReport {
  id: string;
  timestamp: string; // ISO
  totalDishes: number;
  urgentCount: number;
  delayedCount: number;
  dineInCount: number;
  takeawayCount: number;
  otherCount: number;
  outOfStockCount: number | null;
  categoryStats: CategoryStat[];
}

function formatAvgTime(s: number): string {
  if (s === 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m} min`;
}

function formatReportLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${hh}:${mm}, ${dd}/${mo}/${yyyy}`;
}

export default function EODScreen() {
  const router = useRouter();

  const { completedOrders, addCompletedOrder, clearCompletedOrders } = useCompletedOrders();
  const { orders, removeOrders } = useOrders();
  const { mergeTableOrders } = useSettings();
  const [outOfStockCount, setOutOfStockCount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Saved reports
  const [savedReports, setSavedReports] = useState<EODReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // null = live

  const selectedReport = selectedIndex !== null ? savedReports[selectedIndex] ?? null : null;

  // Load saved reports on focus
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const raw = await AsyncStorage.getItem(STORAGE_KEY_EOD_REPORTS);
          if (raw) setSavedReports(JSON.parse(raw));
        } catch {}
      })();
    }, [])
  );

  const isTakeaway = (method?: string) => {
    const m = method?.toLowerCase() ?? "";
    return m.includes("take") || m.includes("away") || m.includes("pickup");
  };
  const isDineIn = (method?: string) => {
    const m = method?.toLowerCase() ?? "";
    return m.includes("dine") || m === "dinein" || m === "table";
  };

  // ── Live stats (from today's completed orders) ──
  const todayOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return completedOrders.filter((co) => new Date(co.completedAt) >= today);
  }, [completedOrders]);

  const countDelayedDishes = useCallback((threshold: number) => {
    let count = 0;
    todayOrders.forEach((co) => {
      const orderMax = Math.max(0, ...co.completedItems.map((i) => i.completedElapsedSeconds ?? 0));
      if (orderMax > threshold) {
        co.completedItems.forEach((i) => {
          if ((i.completedElapsedSeconds ?? 0) > threshold) count++;
        });
      }
    });
    return count;
  }, [todayOrders]);

  const liveTotalDishes = useMemo(
    () => todayOrders.reduce((sum, co) => sum + co.completedItems.length, 0),
    [todayOrders]
  );
  const liveDelayed = useMemo(() => countDelayedDishes(DELAY_THRESHOLD_SECONDS), [todayOrders]);
  const liveUrgent = useMemo(() => countDelayedDishes(URGENT_THRESHOLD_SECONDS), [todayOrders]);
  const liveDineIn = useMemo(
    () => todayOrders.filter((co) => isDineIn(co.order.pickupMethod)).length,
    [todayOrders]
  );
  const liveTakeaway = useMemo(
    () => todayOrders.filter((co) => isTakeaway(co.order.pickupMethod)).length,
    [todayOrders]
  );
  const liveOther = useMemo(
    () => todayOrders.filter((co) => !isDineIn(co.order.pickupMethod) && !isTakeaway(co.order.pickupMethod)).length,
    [todayOrders]
  );
  const liveCategoryStats = useMemo(() => {
    const map = new Map<string, { orders: number; totalSeconds: number; count: number }>();
    todayOrders.forEach((co) => {
      co.completedItems.forEach((item) => {
        const cat = (item as any).category || "Other";
        if (!map.has(cat)) map.set(cat, { orders: 0, totalSeconds: 0, count: 0 });
        const e = map.get(cat)!;
        e.orders += 1;
        e.totalSeconds += item.completedElapsedSeconds ?? 0;
        e.count += 1;
      });
    });
    return Array.from(map.entries()).map(([category, data]) => ({
      category,
      orders: data.orders,
      avgSeconds: data.count > 0 ? Math.round(data.totalSeconds / data.count) : 0,
    }));
  }, [todayOrders]);

  // ── Displayed stats (live or selected report) ──
  const totalDishes = selectedReport ? selectedReport.totalDishes : liveTotalDishes;
  const delayedCount = selectedReport ? selectedReport.delayedCount : liveDelayed;
  const urgentCount = selectedReport ? selectedReport.urgentCount : liveUrgent;
  const dineInCount = selectedReport ? selectedReport.dineInCount : liveDineIn;
  const takeawayCount = selectedReport ? selectedReport.takeawayCount : liveTakeaway;
  const otherCount = selectedReport ? selectedReport.otherCount : liveOther;
  const categoryStats: CategoryStat[] = selectedReport ? selectedReport.categoryStats : liveCategoryStats;
  const displayOutOfStock = selectedReport ? selectedReport.outOfStockCount : outOfStockCount;

  // Try to fetch live out-of-stock count
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
          items.forEach((item: any) => { if (item.qty === 0) count++; });
        });
        setOutOfStockCount(count);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const visibleCardCount = useMemo(() => {
    if (!mergeTableOrders) return orders.length;
    const seen = new Set<string>();
    let count = 0;
    for (const order of orders) {
      const tbl = order.tableNumber?.trim();
      if (tbl) { if (!seen.has(tbl)) { seen.add(tbl); count++; } }
      else count++;
    }
    return count;
  }, [orders, mergeTableOrders]);

  const buildReport = (): EODReport => ({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    totalDishes: liveTotalDishes,
    urgentCount: liveUrgent,
    delayedCount: liveDelayed,
    dineInCount: liveDineIn,
    takeawayCount: liveTakeaway,
    otherCount: liveOther,
    outOfStockCount,
    categoryStats: liveCategoryStats,
  });

  const saveReport = async (report: EODReport) => {
    const updated = [report, ...savedReports];
    setSavedReports(updated);
    await AsyncStorage.setItem(STORAGE_KEY_EOD_REPORTS, JSON.stringify(updated));
    setSelectedIndex(0);
  };

  const shareReport = (report: EODReport) => {
    const label = formatReportLabel(report.timestamp);
    const lines = [
      `KDS EOD Report — ${label}`,
      `─────────────────────────`,
      `Dishes Completed : ${report.totalDishes}`,
      `Dishes Urgent    : ${report.urgentCount}  (> 10 min)`,
      `Dishes Delayed   : ${report.delayedCount}  (> 20 min)`,
      `Out of Stock     : ${report.outOfStockCount ?? "—"}`,
      ``,
      `Dine In  : ${report.dineInCount}`,
      `Takeaway : ${report.takeawayCount}`,
      `Other    : ${report.otherCount}`,
      ``,
      `Category Breakdown:`,
      ...report.categoryStats.map(
        (r) => `  ${r.category.padEnd(18)} ${String(r.orders).padStart(4)} orders   avg ${formatAvgTime(r.avgSeconds)}`
      ),
    ];
    Share.share({ message: lines.join("\n"), title: `EOD Report ${label}` });
  };

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
          const report = buildReport();
          setIsProcessing(true);
          try {
            if (activeCount > 0) {
              const ids = orders.map((o) => o.id);
              await Promise.all(orders.map((o) => addCompletedOrder(o, o.products || []).catch(() => {})));
              removeOrders(ids);
            }
            await clearCompletedOrders();
            await saveReport(report);
          } finally {
            setIsProcessing(false);
          }
          Alert.alert("Submitted", "EOD report saved.");
        },
      },
    ]);
  };

  // ── Report selector ──
  const isLive = selectedIndex === null;
  const canGoPrev = selectedIndex !== null && selectedIndex < savedReports.length - 1;
  const canGoNext = selectedIndex !== null && selectedIndex > 0;

  return (
    <SafeAreaView style={styles.container}>
      <Modal visible={isProcessing} transparent animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color="#1a1a1a" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        </View>
      </Modal>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report</Text>
        <View style={{ width: 46 }} />
      </View>

      {/* Report selector bar */}
      <View style={styles.selectorBar}>
        <TouchableOpacity
          style={[styles.selectorBtn, isLive && styles.selectorBtnActive]}
          onPress={() => setSelectedIndex(null)}
        >
          <Ionicons name="radio-button-on" size={14} color={isLive ? "white" : "#888"} />
          <Text style={[styles.selectorBtnText, isLive && styles.selectorBtnTextActive]}>Live</Text>
        </TouchableOpacity>

        <View style={styles.selectorNav}>
          <TouchableOpacity
            style={[styles.navArrow, !canGoPrev && styles.navArrowDisabled]}
            onPress={() => canGoPrev && setSelectedIndex(selectedIndex! + 1)}
            disabled={!canGoPrev}
          >
            <Ionicons name="chevron-back" size={18} color={canGoPrev ? "#333" : "#ccc"} />
          </TouchableOpacity>

          <Text style={styles.selectorLabel} numberOfLines={1}>
            {isLive
              ? "Current session"
              : selectedReport
              ? formatReportLabel(selectedReport.timestamp)
              : "No reports"}
          </Text>

          <TouchableOpacity
            style={[styles.navArrow, !canGoNext && styles.navArrowDisabled]}
            onPress={() => canGoNext && setSelectedIndex(selectedIndex! - 1)}
            disabled={!canGoNext}
          >
            <Ionicons name="chevron-forward" size={18} color={canGoNext ? "#333" : "#ccc"} />
          </TouchableOpacity>
        </View>

        {selectedReport && (
          <TouchableOpacity style={styles.shareBtn} onPress={() => shareReport(selectedReport)}>
            <Ionicons name="share-outline" size={18} color="#2196F3" />
          </TouchableOpacity>
        )}
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
                {displayOutOfStock !== null ? displayOutOfStock : "—"}
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
            <View style={styles.tableHeader}>
              <Text style={[styles.colCategory, styles.tableHeaderText]}>Categories</Text>
              <Text style={[styles.colOrders, styles.tableHeaderText]}>Orders</Text>
              <View style={styles.colTime}>
                <Text style={styles.tableHeaderText}>Avg completion time per dish</Text>
              </View>
            </View>

            {categoryStats.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No data for today</Text>
              </View>
            ) : (
              categoryStats.map((row, i) => {
                const isDelayed = row.avgSeconds > DELAY_THRESHOLD_SECONDS;
                return (
                  <View key={row.category} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.colCategory, styles.categoryText]} numberOfLines={1}>
                      {row.category}
                    </Text>
                    <Text style={[styles.colOrders, styles.ordersText]}>{row.orders}</Text>
                    <Text style={[styles.colTime, styles.avgTimeText, isDelayed && styles.avgTimeDelayed]}>
                      {formatAvgTime(row.avgSeconds)}
                    </Text>
                  </View>
                );
              })
            )}

            {isLive && (
              <View style={styles.submitRow}>
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} activeOpacity={0.8}>
                  <Text style={styles.submitButtonText}>Submit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },
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
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#1a1a1a", letterSpacing: 0.5 },

  // Selector bar
  selectorBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
  },
  selectorBtnActive: { backgroundColor: "#1a1a1a" },
  selectorBtnText: { fontSize: 13, fontWeight: "600", color: "#888" },
  selectorBtnTextActive: { color: "white" },
  selectorNav: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  selectorLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  navArrow: { padding: 4 },
  navArrowDisabled: { opacity: 0.3 },
  shareBtn: { padding: 8 },

  scrollContent: { padding: 20, flexGrow: 1 },
  mainRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },

  // Left panel
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
  dashTitle: { fontSize: 20, fontWeight: "800", color: "#1a1a1a", letterSpacing: 1, marginBottom: 10 },
  dashDivider: { height: 1.5, backgroundColor: "#1a1a1a", marginVertical: 12 },
  statRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  statLabel: { fontSize: 12, fontWeight: "700", color: "#333", letterSpacing: 0.3, flex: 1, marginRight: 8 },
  statSubLabel: { fontSize: 11, color: "#888", marginTop: 2, fontStyle: "italic" },
  statValue: { fontSize: 26, fontWeight: "800", color: "#1a1a1a", minWidth: 40, textAlign: "right" },
  orderTypeRow: { gap: 8 },
  orderTypeChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#f5f7fa", borderRadius: 8 },
  orderTypeLabel: { flex: 1, fontSize: 13, color: "#555", fontWeight: "500" },
  orderTypeCount: { fontSize: 15, fontWeight: "700", color: "#1a1a1a" },

  // Right table
  rightPanel: { flex: 1, backgroundColor: "white", borderRadius: 12, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  tableHeader: { flexDirection: "row", alignItems: "stretch", backgroundColor: "#f5f7fa", borderBottomWidth: 1.5, borderBottomColor: "#1a1a1a", paddingVertical: 10, paddingHorizontal: 16 },
  tableHeaderText: { fontSize: 14, fontWeight: "700", color: "#333" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  tableRowAlt: { backgroundColor: "#fafbfc" },
  colCategory: { flex: 2 },
  colOrders: { flex: 1, textAlign: "center" },
  colTime: { flex: 2, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "#e8e8e8" },
  categoryText: { fontSize: 15, color: "#333", fontWeight: "500" },
  ordersText: { fontSize: 18, fontWeight: "700", color: "#1a1a1a", textAlign: "center" },
  avgTimeText: { fontSize: 15, color: "#333", fontWeight: "500", paddingLeft: 12 },
  avgTimeDelayed: { color: "#e74c3c", fontWeight: "700" },
  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { color: "#aaa", fontSize: 14 },
  submitRow: { padding: 16, alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#f0f0f0", marginTop: 4 },
  submitButton: { backgroundColor: "#1a1a1a", paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8 },
  submitButtonText: { color: "white", fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  processingOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center" },
  processingBox: { backgroundColor: "white", borderRadius: 16, paddingVertical: 32, paddingHorizontal: 48, alignItems: "center", gap: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  processingText: { fontSize: 17, fontWeight: "600", color: "#1a1a1a", marginTop: 4 },
});
