import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { FormattedOrder } from "@/services/types";
import { colors } from "../styles/color";
import { useLanguage } from "../contexts/LanguageContext";
import { DateTime } from 'luxon';

interface OrderTimerProps {
  order: FormattedOrder;
  onTimeUpdate?: (elapsedTime: number, statusColor: string, formattedTime: string) => void;
}

export const OrderTimer: React.FC<OrderTimerProps> = ({ order, onTimeUpdate }) => {
  const { t } = useLanguage();
  const [elapsedTime, setElapsedTime] = useState(0); // 存储已经过去的时间（秒）
  const onTimeUpdateRef = useRef(onTimeUpdate);

  // 保持 onTimeUpdate 引用最新
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    // 计算初始时间差
    calculateTimeDifference();

    // 每秒更新一次时间差
    const interval = setInterval(() => {
      calculateTimeDifference();
    }, 1000);

    return () => clearInterval(interval);
  }, [order.kdsReceiveTime]);

  // 计算订单进入 KDS 时间与当前时间的差值（秒）
  const calculateTimeDifference = () => {
    try {
      // 使用 kdsReceiveTime（订单进入 KDS 的时间）作为计时器起始时间
      // 如果没有 kdsReceiveTime，则使用 orderTime 作为备选
      const startTime = order.kdsReceiveTime || order.orderTime;
      
      let pickupDate: DateTime;
      
      // 先尝试 ISO 格式
      pickupDate = DateTime.fromISO(startTime, { zone: 'utc' }).setZone('Australia/Sydney');
      
      // 如果失败，尝试标准格式 "yyyy-MM-dd HH:mm:ss"
      if (!pickupDate.isValid) {
        pickupDate = DateTime.fromFormat(
          startTime, 
          'yyyy-MM-dd HH:mm:ss',
          { zone: 'Australia/Sydney' }
        );
      }

      if (!pickupDate.isValid) {
        console.error('[OrderTimer] Invalid start time format:', startTime, pickupDate.invalidReason);
        setElapsedTime(0);
        return;
      }

      // 获取当前悉尼时间
      const now = DateTime.now().setZone('Australia/Sydney');

      // 计算时间差（毫秒）
      const diffMs = now.toMillis() - pickupDate.toMillis();

      // 转换为秒并确保不为负数
      const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

      // 更新状态
      setElapsedTime(diffSeconds);
    } catch (error) {
      console.error("计算时间差异失败:", error);
      setElapsedTime(0);
    }
  };

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

  // 根据时间获取状态文本和颜色
  const getStatusInfo = () => {
    // 获取订单的总准备时间（min）
    const totalPrepareTimeMinutes = order.total_prepare_time || 0;

    // 获取已经过去的时间（分钟）
    const elapsedMinutes = Math.floor(elapsedTime / 60);



    // 如果订单没有准备时间数据，则使用默认逻辑（延长时间阈值）
    if (totalPrepareTimeMinutes === 0) {
      // 修改默认逻辑，避免所有订单都显示 delayed
      if (elapsedMinutes < 5) {
        return { text: t("active"), color: colors.activeColor };
      } else if (elapsedMinutes < 15) {
        return { text: t("urgent"), color: colors.urgentColor };
      } else {
        return { text: t("delayed"), color: colors.delayedColor };
      }
    }

    // 基于总准备时间的状态判断
    // 如果已过时间小于总准备时间，表示正常
    if (elapsedMinutes < totalPrepareTimeMinutes) {
      return { text: t("active"), color: colors.activeColor };
    }
    // 如果已过时间超过总准备时间但在120%范围内，表示紧急
    else if (elapsedMinutes < totalPrepareTimeMinutes * 1.2) {
      return { text: t("urgent"), color: colors.urgentColor };
    }
    // 如果已过时间超过总准备时间的120%，表示延迟
    else {
      return { text: t("delayed"), color: colors.delayedColor };
    }
  };

  const statusInfo = getStatusInfo();

  // 当 elapsedTime 变化时，通知父组件
  useEffect(() => {
    if (onTimeUpdateRef.current) {
      const formattedTime = formatTime(elapsedTime);
      const color = getStatusInfo().color;
      onTimeUpdateRef.current(elapsedTime, color, formattedTime);
    }
  }, [elapsedTime]); // 只依赖 elapsedTime，不依赖 statusInfo.color

  // 计算并格式化剩余准备时间
  const getRemainingPrepTime = () => {
    const totalPrepTimeSeconds = order.total_prepare_time || 0;
    if (totalPrepTimeSeconds <= 0) return null;

    // 剩余准备时间（秒）
    const remainingSeconds = Math.max(0, totalPrepTimeSeconds - elapsedTime);
    return formatTime(remainingSeconds);
  };

  const remainingPrepTime = getRemainingPrepTime();

  return (
    <View style={styles.headerRight}>
      {/* 状态按钮 */}
      <View
        style={[styles.statusButton, { backgroundColor: statusInfo.color }]}
      >
        <Text style={styles.statusButtonText}>{statusInfo.text}</Text>
      </View>
      
      {/* 已过时间 */}
      <Text style={[styles.elapsedTimeText, { color: statusInfo.color }]}>
        {formatTime(elapsedTime)}
      </Text>
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
  elapsedTimeText: {
    fontSize: 20,
    fontWeight: "600",
  },
});
