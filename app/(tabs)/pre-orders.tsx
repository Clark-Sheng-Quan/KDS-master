// pre-orders screen — disabled, not currently in use
// import React, { useEffect, useState, useCallback } from "react";
// import { View, ScrollView, ActivityIndicator, Text, Dimensions, TouchableOpacity } from "react-native";
// import { OrderCard } from "../../components/OrderCard";
// import { usePreOrders } from "../../contexts/PreOrderContext";
// import { theme } from "../../constants/theme";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { useLanguage } from "@/contexts/LanguageContext";
// import { FormattedOrder } from "@/services/types";
// import { useSettings } from "../../contexts/SettingsContext";
// import { PADDING, cardStyles, preCalculateCardStyles, formatTime } from "../../constants/cardConfig";
// ... (full screen implementation commented out)

import React from "react";
import { View, Text } from "react-native";

export default function PreOrdersScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Pre-orders disabled</Text>
    </View>
  );
}
