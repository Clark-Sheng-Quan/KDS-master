// Font size configuration constants
// Centralized definition to avoid duplication across components

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

// Font size type for TypeScript
export type FontSizeLevel = keyof typeof CARD_TITLE_FONT_SIZES;
export type ItemOptionFontSizeLevel = keyof typeof ITEM_OPTION_FONT_SIZES;
