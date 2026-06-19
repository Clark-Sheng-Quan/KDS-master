import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
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
import { useLanguage } from "../../contexts/LanguageContext";

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
  timestamp: string;   // end time (ISO)
  startTime?: string;  // start time = previous report's timestamp (ISO)
  totalDishes: number;
  urgentCount: number;
  delayedCount: number;
  dineInCount: number;
  takeawayCount: number;
  otherCount: number;
  outOfStockCount: number | null;
  categoryStats: CategoryStat[];
  clearedOrderCount: number;
  clearedDishCount: number;
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


function formatTimeRange(startIso: string | undefined, endIso: string): string {
  if (!startIso) return formatReportLabel(endIso);
  return `${formatReportLabel(startIso)} – ${formatReportLabel(endIso)}`;
}

export default function EODScreen() {
  const router = useRouter();

  const { t } = useLanguage();
  const { completedOrders, addCompletedOrder, clearCompletedOrders } = useCompletedOrders();
  const { orders, removeOrders } = useOrders();
  const { mergeTableOrders } = useSettings();
  const [outOfStockCount, setOutOfStockCount] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Saved reports
  const [savedReports, setSavedReports] = useState<EODReport[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // null = live

  const selectedReport = selectedIndex !== null ? savedReports[selectedIndex] ?? null : null;

  // Load saved reports on focus and always reset to live view
  useFocusEffect(
    useCallback(() => {
      setSelectedIndex(null);
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

  // ── Live stats (all orders since last EOD submit, cleared on submit) ──
  const todayOrders = completedOrders;

  const countDishesInRange = useCallback((minSeconds: number, maxSeconds?: number) => {
    let count = 0;
    todayOrders.forEach((co) => {
      co.completedItems.forEach((i) => {
        const elapsed = i.completedElapsedSeconds ?? 0;
        if (elapsed > minSeconds && (maxSeconds === undefined || elapsed <= maxSeconds)) count++;
      });
    });
    return count;
  }, [todayOrders]);

  const liveTotalDishes = useMemo(
    () => todayOrders.reduce((sum, co) => sum + co.completedItems.length, 0),
    [todayOrders]
  );
  const liveDelayed = useMemo(() => countDishesInRange(DELAY_THRESHOLD_SECONDS), [todayOrders, countDishesInRange]);
  const liveUrgent = useMemo(() => countDishesInRange(URGENT_THRESHOLD_SECONDS, DELAY_THRESHOLD_SECONDS), [todayOrders, countDishesInRange]);
  const countUniqueBySession = useCallback((predicate: (co: typeof todayOrders[0]) => boolean) => {
    const sessions = new Set<string>();
    let noSessionCount = 0;
    todayOrders.forEach((co) => {
      if (!predicate(co)) return;
      const sid = co.order.tableSessionId;
      if (sid) sessions.add(sid);
      else noSessionCount++;
    });
    return sessions.size + noSessionCount;
  }, [todayOrders]);

  const liveDineIn = useMemo(
    () => countUniqueBySession((co) => isDineIn(co.order.pickupMethod)),
    [todayOrders, countUniqueBySession]
  );
  const liveTakeaway = useMemo(
    () => countUniqueBySession((co) => isTakeaway(co.order.pickupMethod)),
    [todayOrders, countUniqueBySession]
  );
  const liveOther = useMemo(
    () => countUniqueBySession((co) => !isDineIn(co.order.pickupMethod) && !isTakeaway(co.order.pickupMethod)),
    [todayOrders, countUniqueBySession]
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
    startTime: savedReports[0]?.timestamp,
    totalDishes: liveTotalDishes,
    urgentCount: liveUrgent,
    delayedCount: liveDelayed,
    dineInCount: liveDineIn,
    takeawayCount: liveTakeaway,
    otherCount: liveOther,
    outOfStockCount,
    categoryStats: liveCategoryStats,
    clearedOrderCount: visibleCardCount,
    clearedDishCount: orders.reduce((sum, o) => sum + (o.products?.length ?? 0), 0),
  });

  const saveReport = async (report: EODReport) => {
    const updated = [report, ...savedReports];
    setSavedReports(updated);
    await AsyncStorage.setItem(STORAGE_KEY_EOD_REPORTS, JSON.stringify(updated));
    setSelectedIndex(0);
  };

  const shareReport = (report: EODReport) => {
    const label = formatTimeRange(report.startTime, report.timestamp);
    const lines = [
      `KDS EOD Report — ${label}`,
      `─────────────────────────`,
      `Dishes Completed : ${report.totalDishes}`,
      `Dishes Urgent    : ${report.urgentCount}  (10 - 20 min)`,
      `Dishes Delayed   : ${report.delayedCount}  (> 20 min)`,
      `Out of Stock     : ${report.outOfStockCount ?? "—"}`,
      `Orders Cleared   : ${report.clearedOrderCount}  (${report.clearedDishCount} dishes)`,
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
        ? t("eodActiveOrdersWarning").replace("{n}", String(activeCount))
        : t("eodNoActiveOrders");

    Alert.alert(t("eodTitle"), message, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("eodConfirmSubmit"),
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
          Alert.alert(t("eodSubmitted"), t("eodReportSaved"));
        },
      },
    ]);
  };

  const isLive = selectedIndex === null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Processing overlay */}
      <Modal visible={isProcessing} transparent animationType="fade">
        <View style={styles.processingOverlay}>
          <View style={styles.processingBox}>
            <ActivityIndicator size="large" color="#1a1a1a" />
            <Text style={styles.processingText}>{t("eodProcessing")}</Text>
          </View>
        </View>
      </Modal>

      {/* History picker modal */}
      <Modal visible={showHistoryModal} transparent animationType="fade" onRequestClose={() => setShowHistoryModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowHistoryModal(false)}>
          <View style={styles.historySheet} onStartShouldSetResponder={() => true}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>{t("eodReports")}</Text>
              <TouchableOpacity onPress={() => setShowHistoryModal(false)} style={styles.historyCloseBtn}>
                <Ionicons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            {/* Live row */}
            <TouchableOpacity
              style={[styles.liveRow, isLive && styles.liveRowSelected]}
              onPress={() => { setSelectedIndex(null); setShowHistoryModal(false); }}
              activeOpacity={0.75}
            >
              <View style={styles.liveRowTop}>
                <View style={styles.liveBadge}>
                  <View style={styles.liveIndicator} />
                  <Text style={styles.liveBadgeText}>{t("eodLive")}</Text>
                </View>
                <Text style={styles.liveRowTitle}>{t("eodCurrentSession")}</Text>
                {isLive && <Ionicons name="checkmark-circle" size={20} color="#22c55e" style={{ marginLeft: "auto" }} />}
              </View>
              {savedReports[0]?.timestamp ? (
                <Text style={styles.liveRowStart}>
                  {t("eodFrom")}  {formatReportLabel(savedReports[0].timestamp)}
                </Text>
              ) : (
                <Text style={styles.liveRowStart}>{t("eodNoPreviousReport")}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.historySeparator} />

            {savedReports.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyText}>{t("eodNoSavedReports")}</Text>
              </View>
            ) : (
              <FlatList
                data={savedReports}
                keyExtractor={(r) => r.id}
                style={styles.historyList}
                renderItem={({ item, index }) => {
                  const isSelected = selectedIndex === index;
                  return (
                    <TouchableOpacity
                      style={[styles.historyRow, isSelected && styles.historyRowSelected]}
                      onPress={() => { setSelectedIndex(index); setShowHistoryModal(false); }}
                    >
                      <View style={styles.historyRowLeft}>
                        <Ionicons name="document-text-outline" size={22} color={isSelected ? "#1a1a1a" : "#aaa"} style={{ marginRight: 12 }} />
                        <View>
                          <Text style={[styles.historyRowTitle, isSelected && styles.historyRowTitleSelected]}>
                            {formatTimeRange(item.startTime, item.timestamp)}
                          </Text>
                          <Text style={styles.historyRowSub}>
                            {item.totalDishes} {t("eodDishes")} · {item.dineInCount} {t("eodDineInShort")} · {item.takeawayCount} {t("eodTakeawayShort")}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.historyRowRight}>
                        {isSelected && <Ionicons name="checkmark-circle" size={22} color="#1a1a1a" />}
                        <TouchableOpacity
                          style={styles.historyShareBtn}
                          onPress={(e) => { e.stopPropagation(); shareReport(item); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="share-outline" size={20} color="#2196F3" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={26} color="#333" />
        </TouchableOpacity>

        {/* Centre: current view badge */}
        <TouchableOpacity style={styles.headerContextBtn} onPress={() => setShowHistoryModal(true)} activeOpacity={0.75}>
          {isLive ? (
            <>
              <View style={styles.liveDot} />
              <Text style={styles.headerContextText}>{t("eodCurrentSession")}</Text>
            </>
          ) : (
            <>
              <Ionicons name="document-text-outline" size={16} color="#555" />
              <Text style={styles.headerContextText} numberOfLines={1}>
                {selectedReport ? formatTimeRange(selectedReport.startTime, selectedReport.timestamp) : "—"}
              </Text>
            </>
          )}
          <Ionicons name="chevron-down" size={16} color="#555" />
        </TouchableOpacity>

        {/* Right: share (only when viewing a saved report) */}
        {selectedReport ? (
          <TouchableOpacity style={styles.backButton} onPress={() => shareReport(selectedReport)}>
            <Ionicons name="share-outline" size={22} color="#2196F3" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 46 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.mainRow}>
          {/* ── LEFT PANEL ── */}
          <View style={styles.leftPanel}>
            <Text style={styles.dashTitle}>{t("eodDashboard")}</Text>
            {selectedReport ? (
              <Text style={styles.periodText}>
                {formatTimeRange(selectedReport.startTime, selectedReport.timestamp)}
              </Text>
            ) : (
              <View style={styles.periodRow}>
                <View style={styles.liveDotSmall} />
                <Text style={styles.periodText}>
                  {savedReports[0]?.timestamp
                    ? `${t("eodFrom")}  ${formatReportLabel(savedReports[0].timestamp)}`
                    : t("eodSessionStartNotRecorded")}
                </Text>
              </View>
            )}
            <View style={styles.dashDivider} />

            <View style={styles.statRow}>
              <Text style={styles.statLabel}>{t("eodDishesCompleted")}</Text>
              <Text style={styles.statValue}>{totalDishes}</Text>
            </View>

            {selectedReport && (
              <View style={styles.statRow}>
                <View>
                  <Text style={styles.statLabel}>{t("eodClearedOrders")}</Text>
                  <Text style={styles.statSubLabel}>{selectedReport.clearedDishCount} {t("eodDishes")}</Text>
                </View>
                <Text style={styles.statValue}>{selectedReport.clearedOrderCount}</Text>
              </View>
            )}

            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>{t("eodOutOfStock")}</Text>
                <Text style={styles.statSubLabel}>{t("eodCurrentSession")}</Text>
              </View>
              <Text style={styles.statValue}>
                {displayOutOfStock !== null ? displayOutOfStock : "—"}
              </Text>
            </View>

            <View style={styles.statRow}>
              <View>
                <Text style={[styles.statLabel, { color: "#f59e0b" }]}>{t("eodDishesUrgent")}</Text>
                <Text style={styles.statSubLabel}>{t("eodOver10min")}</Text>
              </View>
              <Text style={[styles.statValue, { color: "#f59e0b" }]}>{urgentCount}</Text>
            </View>

            <View style={styles.statRow}>
              <View>
                <Text style={[styles.statLabel, { color: "#e74c3c" }]}>{t("eodDishesDelayed")}</Text>
                <Text style={styles.statSubLabel}>{t("eodOver20min")}</Text>
              </View>
              <Text style={[styles.statValue, { color: "#e74c3c" }]}>{delayedCount}</Text>
            </View>

            <View style={styles.dashDivider} />

            <View style={styles.orderTypeRow}>
              <View style={styles.orderTypeChip}>
                <Ionicons name="restaurant" size={14} color="#2196F3" />
                <Text style={styles.orderTypeLabel}>{t("dineIn")}</Text>
                <Text style={styles.orderTypeCount}>{dineInCount}</Text>
              </View>
              <View style={styles.orderTypeChip}>
                <Ionicons name="bag-handle" size={14} color="#9c27b0" />
                <Text style={styles.orderTypeLabel}>{t("eodTakeaway")}</Text>
                <Text style={styles.orderTypeCount}>{takeawayCount}</Text>
              </View>
              {otherCount > 0 && (
                <View style={styles.orderTypeChip}>
                  <Ionicons name="apps" size={14} color="#607d8b" />
                  <Text style={styles.orderTypeLabel}>{t("eodOthers")}</Text>
                  <Text style={styles.orderTypeCount}>{otherCount}</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── RIGHT TABLE ── */}
          <View style={styles.rightPanel}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colCategory, styles.tableHeaderText]}>{t("eodCategories")}</Text>
              <Text style={[styles.colOrders, styles.tableHeaderText]}>{t("eodOrdersHeader")}</Text>
              <View style={styles.colTime}>
                <Text style={styles.tableHeaderText}>{t("eodAvgTime")}</Text>
              </View>
            </View>

            {categoryStats.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>{t("eodNoData")}</Text>
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
                  <Text style={styles.submitButtonText}>{t("eodSubmit")}</Text>
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

  // Header context button (centre of header)
  headerContextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f0f2f5",
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "#dde1e7",
    maxWidth: 420,
  },
  headerContextText: { fontSize: 15, fontWeight: "600", color: "#222", flexShrink: 1 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#22c55e" },

  // History modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  historySheet: {
    backgroundColor: "white",
    borderRadius: 20,
    width: 540,
    maxHeight: 640,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
    overflow: "hidden",
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  historyTitle: { fontSize: 20, fontWeight: "700", color: "#1a1a1a" },
  historyCloseBtn: { padding: 6 },
  historyList: { maxHeight: 440 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f8f8",
  },
  historyRowSelected: { backgroundColor: "#f5f7fa" },
  historyRowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  historyRowRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  liveIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  liveRow: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#f9fff9",
    borderBottomWidth: 1,
    borderBottomColor: "#e8f5e9",
  },
  liveRowSelected: { backgroundColor: "#e8f5e9" },
  liveRowTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#dcfce7",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  liveBadgeText: { fontSize: 12, fontWeight: "800", color: "#16a34a", letterSpacing: 0.5 },
  liveRowTitle: { fontSize: 17, fontWeight: "700", color: "#1a1a1a" },
  liveRowStart: { fontSize: 13, color: "#333", paddingLeft: 2 },
  historyRowTitle: { fontSize: 15, fontWeight: "600", color: "#1a1a1a" },
  historyRowTitleSelected: { color: "#1a1a1a" },
  historyRowSub: { fontSize: 13, color: "#555", marginTop: 3 },
  historyShareBtn: { padding: 6 },
  historySeparator: { height: 2, backgroundColor: "#e8e8e8", marginHorizontal: 0 },
  historyEmpty: { padding: 40, alignItems: "center" },
  historyEmptyText: { fontSize: 15, color: "#aaa" },

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
  dashTitle: { fontSize: 20, fontWeight: "800", color: "#1a1a1a", letterSpacing: 1, marginBottom: 6 },
  periodRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  liveDotSmall: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e" },
  periodText: { fontSize: 11, color: "#333", marginBottom: 0 },
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
