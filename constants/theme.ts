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
  category1: "#8A0022",   // 红 - 深
  category2: "#D7263D",   // 红 - 中
  category3: "#E89AA9",   // 红 - 淡（加深）

  category4: "#C04A00",   // 橙 - 深
  category5: "#FF8A3D",   // 橙 - 中
  category6: "#FFC48A",   // 橙 - 淡（加深）

  category7: "#B88600",   // 黄 - 深
  category8: "#F2C200",   // 黄 - 中
  category9: "#FFE680",   // 黄 - 淡（加深）

  category10: "#0F5E2C",  // 绿 - 深
  category11: "#2FA84F",  // 绿 - 中
  category12: "#A9DEB8",  // 绿 - 淡（加深）

  category13: "#003F8C",  // 蓝 - 深
  category14: "#1E73D8",  // 蓝 - 中
  category15: "#9FC4EB",  // 蓝 - 淡（加深）

  category16: "#5A1A8C",  // 紫 - 深
  category17: "#9B4DCC",  // 紫 - 中
  category18: "#C9A4E8",  // 紫 - 淡（加深）

  category19: "#B8326A",  // 粉 - 深
  category20: "#E44C8C",  // 粉 - 中

  default: "#FFFFFF",
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
