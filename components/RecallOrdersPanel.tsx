import React from "react";
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
import { theme } from "../constants/theme";
import { CompletedOrder } from "../services/types";

interface RecallOrdersPanelProps {
  onRecall: (completedOrder: CompletedOrder) => void;
  onClose: () => void;
  animValue: Animated.Value;
  dimensions: { width: number; height: number };
}

export const RecallOrdersPanel: React.FC<RecallOrdersPanelProps> = ({
  onRecall,
  onClose,
  animValue,
  dimensions,
}) => {
  const { completedOrders } = useCompletedOrders();
  const { t } = useLanguage();

  const panelWidth = Math.max(dimensions.width * 0.35, 320);

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
          maxWidth: dimensions.width * 0.55,
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
            {t("recall")} {t("order")}
          </Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8, marginLeft: 8 }}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        {completedOrders.length > 0 ? (
          <FlatList
            data={completedOrders.slice(0, 30)}
            renderItem={({ item: completedOrder }) => {
              const itemCount = (completedOrder.completedItems || []).reduce(
                (sum, p) => sum + (p.quantity || 1),
                0
              );
              const tableNo = completedOrder.order.tableNumber?.trim();
              const summaryParts = [
                ...(tableNo ? [`${t("table")} ${tableNo}`] : []),
                `${t("order")} #${completedOrder.order.num}`,
                `${itemCount} ${t("items")}`,
              ];
              const itemNamesLine = (completedOrder.completedItems || [])
                .map((p) => `${p.name}${(p.quantity || 1) > 1 ? ` x${p.quantity}` : ""}`)
                .join(" | ");

              return (
                <View
                  style={{
                    padding: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f5f5f5",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 15,
                      marginBottom: 6,
                      color: "#1a1a1a",
                    }}
                  >
                    {summaryParts.join(" | ")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      marginBottom: 10,
                      color: "#666",
                      fontWeight: "500",
                    }}
                  >
                    {itemNamesLine}
                  </Text>
                  <TouchableOpacity
                    onPress={() => onRecall(completedOrder)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      backgroundColor: theme.colors.primaryColor,
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
              );
            }}
            keyExtractor={(item, idx) => `${item.order.id}-${item.completedAt}-${idx}`}
            contentContainerStyle={{ paddingBottom: 16 }}
            scrollEnabled={true}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
            <Ionicons name="file-tray-full" size={48} color="#ddd" />
            <Text style={{ color: "#aaa", fontSize: 15, marginTop: 12, textAlign: "center" }}>
              {t("noCompletedOrders")}
            </Text>
          </View>
        )}
      </Animated.View>
    </>
  );
};
