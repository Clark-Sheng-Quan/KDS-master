/**
 * 卡片布局配置文件
 * 集中管理所有卡片相关的常量、存储键和样式
 */

import { StyleSheet } from "react-native";
import { theme } from "../styles/theme";

// ============ 常量定义 ============
export const PADDING = 16;
export const CARD_MARGIN = 6;
export const DEFAULT_CARDS_PER_ROW = 5;
export const DEFAULT_CARDS_PER_COLUMN = 1.5;

// ============ AsyncStorage 键定义 ============
export const STORAGE_KEY_CARDS_PER_ROW = "cards_per_row";
export const STORAGE_KEY_CARDS_PER_COLUMN = "cards_per_column";

// ============ 样式定义 ============
export const cardStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundColor,
  },
  scrollContainer: {
    flex: 1,
    padding: PADDING,
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  titleSection: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginRight: 15,
  },
  timeDisplay: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
  },
  cardsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingBottom: 20,
  },
  cardStyle: {
    marginBottom: CARD_MARGIN,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "red",
    fontSize: 16,
    textAlign: "center",
  },
  noOrdersText: {
    fontSize: 38,
    color: "#151010",
    textAlign: "center",
  },
});

// ============ 工具函数 ============
/**
 * 计算卡片宽度
 * @param availableWidth 可用宽度
 * @param cardsPerRow 每行卡片数
 * @returns 卡片宽度
 */
export const calculateCardWidth = (
  availableWidth: number,
  cardsPerRow: number
): number => {
  return (
    (availableWidth - CARD_MARGIN * (cardsPerRow - 1)) /
    cardsPerRow
  );
};

/**
 * 计算卡片高度
 * @param availableHeight 可用高度
 * @param cardsPerColumn 每列卡片数
 * @returns 卡片高度
 */
export const calculateCardHeight = (
  availableHeight: number,
  cardsPerColumn: number
): number => {
  return Math.floor(availableHeight / cardsPerColumn);
};

/**
 * 计算是否需要右边距
 * @param index 卡片索引
 * @param cardsPerRow 每行卡片数
 * @returns 右边距值
 */
export const calculateMarginRight = (
  index: number,
  cardsPerRow: number
): number => {
  return (index + 1) % cardsPerRow === 0 ? 0 : CARD_MARGIN;
};

/**
 * 格式化时间为 HH:MM:SS
 * @param date 日期对象
 * @returns 格式化后的时间字符串
 */
export const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};
