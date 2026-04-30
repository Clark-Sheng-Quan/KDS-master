import React, { useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCompletedOrders } from "../contexts/CompletedOrderContext";
import { useLanguage } from "../contexts/LanguageContext";
import { FormattedOrder } from "../services/types";

interface RecallItemsPanelProps {
  onRecall: (completedItem: any) => void;
  onClose: () => void;
  animValue: Animated.Value;
  dimensions: { width: number; height: number };
}

const formatElapsedDuration = (elapsedSeconds?: number): string => {
  if (typeof elapsedSeconds !== "number" || Number.isNaN(elapsedSeconds)) return "";
  const total = Math.max(0, Math.floor(elapsedSeconds));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) {
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

const getElapsedFromOrderAndCompletedAt = (
  order: FormattedOrder,
  completedAt?: string
): number | undefined => {
  if (!completedAt) return undefined;
  const startRaw = order.kdsReceiveTime || order.orderTime;
  const startDate = new Date(startRaw);
  const endDate = new Date(completedAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return undefined;
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 1000));
};

export const RecallItemsPanel: React.FC<RecallItemsPanelProps> = ({
  onRecall,
  onClose,
  animValue,
  dimensions,
}) => {
  const { completedOrders } = useCompletedOrders();
  const { t } = useLanguage();

  const panelWidth = Math.max(dimensions.width * 0.3, 280);

  const listData = completedOrders
    .slice(0, 30)
    .flatMap((co) =>
      (co.completedItems || []).map((item) => ({
        orderNum: co.order.num,
        tableNumber: co.order.tableNumber,
        itemName: item.name,
        itemId: item.id,
        completionKey: item.completionKey,
        itemCompletedAt: item.completedAt,
        itemCompletedElapsedSeconds: item.completedElapsedSeconds,
        itemQuantity: item.quantity || 1,
        completedOrder: co,
        item: item,
      }))
    );

  return (
    <>
      <TouchableOpacity
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 1100,
        }}
        onPress={onClose}
        activeOpacity={1}
      />

      <Animated.View
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          height: dimensions.height * 0.7,
          width: panelWidth,
          maxWidth: dimensions.width * 0.45,
          backgroundColor: "#fff",
          borderRadius: 16,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
          zIndex: 1101,
          overflow: "hidden",
          transform: [
            {
              translateX: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [panelWidth + 32, 0],
              }),
            },
          ],
        }}
      >
        <View
          style={{
            padding: 18,
            paddingBottom: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottomWidth: 1,
            borderBottomColor: "#f0f0f0",
            backgroundColor: "#fafafa",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#1a1a1a", flex: 1 }}>
            {t("recallItem")}
          </Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, marginLeft: 8 }}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {listData.length > 0 ? (
          <FlatList
            data={listData}
            renderItem={({ item: menuItem }) => (
              <View
                style={{
                  padding: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f5f5f5",
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 16, marginBottom: 6, color: "#1a1a1a" }}>
                  {t("order")} #{menuItem.orderNum}
                </Text>
                {menuItem.tableNumber && (
                  <Text style={{ fontSize: 14, marginBottom: 6, color: "#888", fontWeight: "500" }}>
                    {t("table")} {menuItem.tableNumber}
                  </Text>
                )}
                <Text style={{ fontSize: 14, marginBottom: 10, color: "#333", fontWeight: "600" }}>
                  {menuItem.itemName} {menuItem.itemQuantity > 1 ? `× ${menuItem.itemQuantity}` : ""}
                </Text>
                {(typeof menuItem.itemCompletedElapsedSeconds === "number" ||
                  menuItem.itemCompletedAt) ? (
                  <Text style={{ fontSize: 13, marginBottom: 10, color: "#666", fontWeight: "500" }}>
                    {formatElapsedDuration(
                      typeof menuItem.itemCompletedElapsedSeconds === "number"
                        ? menuItem.itemCompletedElapsedSeconds
                        : getElapsedFromOrderAndCompletedAt(
                            menuItem.completedOrder.order,
                            menuItem.itemCompletedAt
                          )
                    )}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => onRecall(menuItem)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    backgroundColor: "#2e7d32",
                    borderRadius: 8,
                    elevation: 1,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      textAlign: "center",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    {t("recallOrder")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            keyExtractor={(item, idx) =>
              `${item.completedOrder.order.id}-${item.itemId}-${idx}`
            }
            contentContainerStyle={{ paddingBottom: 16 }}
            scrollEnabled={true}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
            <Ionicons name="list" size={48} color="#ddd" />
            <Text style={{ color: "#aaa", fontSize: 15, marginTop: 12, textAlign: "center" }}>
              {t("noRecentlyCompletedItems")}
            </Text>
          </View>
        )}
      </Animated.View>
    </>
  );
};
