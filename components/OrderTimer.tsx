import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  AppState,
  AppStateStatus,
} from "react-native";
import { FormattedOrder } from "@/services/types";
import { colors } from "../constants/theme";
import { useLanguage } from "../contexts/LanguageContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { settingsListener } from "../services/settingsListener";

interface OrderTimerProps {
  order: FormattedOrder;
  onTimeUpdate?: (elapsedTime: number, statusColor: string, formattedTime: string) => void;
}

export const OrderTimer: React.FC<OrderTimerProps> = ({ order, onTimeUpdate }) => {
  const { t } = useLanguage();
  const URGENT_THRESHOLD_MINUTES = 10;
  const DELAYED_THRESHOLD_MINUTES = 20;
  const [elapsedTime, setElapsedTime] = useState(0); 
  const [startTime] = useState(() => new Date(order.kdsReceiveTime || order.orderTime || 0)); 
  const [showOrderTimer, setShowOrderTimer] = useState(true);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const appState = useRef(AppState.currentState);
  const listenerRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    const loadTimerSetting = async () => {
      try {
        const setting = await AsyncStorage.getItem("show_order_timer");
        setShowOrderTimer(setting !== "false"); // Default to true
      } catch (error) {
        console.error("Failed to load order timer setting:", error);
        setShowOrderTimer(true);
      }
    };
    loadTimerSetting();
  }, []);


  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        // 
        try {
          const setting = await AsyncStorage.getItem("show_order_timer");
          setShowOrderTimer(setting !== "false");
        } catch (error) {
          console.error("Failed to reload order timer setting:", error);
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {

    if (listenerRef.current) {
      settingsListener.offSettingChange('show_order_timer', listenerRef.current);
    }

    const handleTimerChange = (value: boolean) => {
      setShowOrderTimer(value);
    };

    listenerRef.current = handleTimerChange;
    settingsListener.onSettingChange('show_order_timer', handleTimerChange);

    // 清理函数：组件卸载时移除监听
    return () => {
      if (listenerRef.current) {
        settingsListener.offSettingChange('show_order_timer', listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, []);

  // 保持 onTimeUpdate 引用最新

  useEffect(() => {
    // 每秒更新一次时间差
    const interval = setInterval(() => {
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
      setElapsedTime(diffSeconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
  };


  const getStatusInfo = () => {

    const elapsedMinutes = Math.floor(elapsedTime / 60);

    if (elapsedMinutes < URGENT_THRESHOLD_MINUTES) {
      return { text: t("active"), color: colors.activeColor };
    }

    if (elapsedMinutes < DELAYED_THRESHOLD_MINUTES) {
      return { text: t("urgent"), color: colors.urgentColor };
    }

    return { text: t("delayed"), color: colors.delayedColor };
  };

  const statusInfo = getStatusInfo();


  useEffect(() => {
    if (onTimeUpdateRef.current) {
      const formattedTime = formatTime(elapsedTime);
      const color = getStatusInfo().color;
      onTimeUpdateRef.current(elapsedTime, color, formattedTime);
    }
  }, [elapsedTime]); 

  if (!showOrderTimer) {
    return null;
  }

  return (
    <View style={styles.headerRight}>

      {/* <View
        style={[styles.statusButton, { backgroundColor: statusInfo.color }]}
      >
        <Text style={styles.statusButtonText}>{statusInfo.text}</Text>
      </View> */}
      

      <View style={styles.timerBackground}>
        <Text style={[styles.elapsedTimeText, { color: statusInfo.color }]}>
          {formatTime(elapsedTime)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  timer: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  timerBackground: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
  },
  elapsedTimeText: {
    fontSize: 20,
    fontWeight: "600",
  },
});
