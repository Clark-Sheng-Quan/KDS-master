/**
 * Centralized UI configuration
 * Combines: Colors, font sizes, and theme constants
 */

// ============ Font Size Configuration ============
export const CARD_TITLE_FONT_SIZES = {
  small: 28,
  medium: 34,
  large: 40,
} as const;

export const ITEM_OPTION_FONT_SIZES = {
  small: { itemName: 22, optionName: 18 },
  medium: { itemName: 26, optionName: 22 },
  large: { itemName: 30, optionName: 26 },
} as const;

export type FontSizeLevel = keyof typeof CARD_TITLE_FONT_SIZES;
export type ItemOptionFontSizeLevel = keyof typeof ITEM_OPTION_FONT_SIZES;

// ============ Light/Dark Mode Colors ============
const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// ============ Business Colors ============
export const colors = {
  buttonColor: "#444",
  buttonActionColor: "#444",
  buttonPrintColor: "#ccc8c8",
  buttonDonColor: "#ccc8c8",
  buttonCallColor: "#569edd",
  checkColor: "#4CAF50",
  primary: "#0a110a",
  secondary: "#4CAF50",
  urgentColor: "#D5C425",
  delayedColor: "#CD5E5E",
  activeColor: "#4CAF50",
};

export const sourceColors = {
  KIOSK: "#FF9500",    // 橙色
  ONLINE: "#5AC8FA",   // 蓝色
  WEB: "#34C759",      // 绿色
  VEND: "#AF52DE",     // 紫色
  TEMP: "#8E8E93",     // 灰色
  DEFAULT: "#007AFF",  // 默认蓝色
};

export const categoryColors = {
  category1: "#FF6B35",   // 橙红
  category2: "#3498DB",   // 深蓝
  category3: "#E74C3C",   // 鲜红
  category4: "#27AE60",   // 草绿
  category5: "#F39C12",   // 橙黄
  category6: "#9B59B6",   // 紫罗兰
  category7: "#1ABC9C",   // 青绿
  category8: "#E67E22",   // 焦橙
  category9: "#34495E",   // 深灰蓝
  category10: "#C0392B",  // 暗红
  category11: "#16A085",  // 墨绿
  category12: "#D35400",  // 赭橙
  category13: "#8E44AD",  // 深紫
  category14: "#2980B9",  // 天蓝
  category15: "#C23B22",  // 砖红
  category16: "#2ECC71",  // 明绿（与#27AE60区分）
  category17: "#F1C40F",  // 金黄
  category18: "#E84393",  // 玫红
  category19: "#00CEC9",  // 薄荷青
  category20: "#6C5CE7",  // 靛蓝
  default: "#FFFFFF",     // 默认白色
};

// ============ Theme Configuration ============
export const theme = {
  colors: {
    backgroundColor: "#ccc8c8",
    primaryColor: "#007bff",
    warningColor: "#ffc107",
    ...colors,
  },
};
