import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { settingsListener } from '../services/settingsListener';
import { DEFAULT_CARDS_PER_ROW, DEFAULT_CARDS_PER_COLUMN, STORAGE_KEY_CARDS_PER_ROW, STORAGE_KEY_CARDS_PER_COLUMN } from '../constants/cardConfig';
import { CategoryColorService } from '../services/categoryColorService';

type FontSize = 'small' | 'medium' | 'large';

interface SettingsState {
  cardsPerRow: number;
  cardsPerColumn: number;
  itemLevelCompletion: boolean;
  callingButton: boolean;
  cardTitleFontSize: FontSize;
  itemOptionFontSize: FontSize;
  categoryColorsMapping: { [categoryName: string]: string };
  showPrintButton: boolean;
  showOrderTimer: boolean;
  showTimerHighlight: boolean;
  loading: boolean;
}

const defaultSettings: SettingsState = {
  cardsPerRow: DEFAULT_CARDS_PER_ROW,
  cardsPerColumn: DEFAULT_CARDS_PER_COLUMN,
  itemLevelCompletion: true,
  callingButton: false,
  cardTitleFontSize: 'medium',
  itemOptionFontSize: 'small',
  categoryColorsMapping: {},
  showPrintButton: true,
  showOrderTimer: true,
  showTimerHighlight: true,
  loading: true,
};

const SettingsContext = createContext<SettingsState>(defaultSettings);

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);

  const loadSettings = useCallback(async () => {
    try {
      // Execute all AsyncStorage calls in parallel
      const [
        savedCardsPerRow,
        savedCardsPerColumn,
        savedItemLevelCompletion,
        savedCallingButton,
        savedCardTitleFontSize,
        savedItemOptionFontSize,
        savedShowPrintButton,
        savedShowOrderTimer,
        savedShowTimerHighlight,
        savedCategoryColors
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_CARDS_PER_ROW),
        AsyncStorage.getItem(STORAGE_KEY_CARDS_PER_COLUMN),
        AsyncStorage.getItem('item_level_completion'),
        AsyncStorage.getItem('calling_button'),
        AsyncStorage.getItem('card_title_font_size'),
        AsyncStorage.getItem('item_option_font_size'),
        AsyncStorage.getItem('show_print_button'),
        AsyncStorage.getItem('show_order_timer'),
        AsyncStorage.getItem('show_timer_highlight'),
        CategoryColorService.loadCategoryColorMapping()
      ]);

      setSettings({
        cardsPerRow: savedCardsPerRow ? parseInt(savedCardsPerRow) : DEFAULT_CARDS_PER_ROW,
        cardsPerColumn: savedCardsPerColumn ? parseFloat(savedCardsPerColumn) : DEFAULT_CARDS_PER_COLUMN,
        itemLevelCompletion: savedItemLevelCompletion !== 'false', // Default true
        callingButton: savedCallingButton === 'true',
        cardTitleFontSize: (savedCardTitleFontSize as FontSize) || 'medium',
        itemOptionFontSize: (savedItemOptionFontSize as FontSize) || 'small',
        showPrintButton: savedShowPrintButton !== 'false',
        showOrderTimer: savedShowOrderTimer !== 'false',
        showTimerHighlight: savedShowTimerHighlight !== 'false',
        categoryColorsMapping: savedCategoryColors || {},
        loading: false,
      });
    } catch (error) {
      console.error('[SettingsContext] Failed to load settings:', error);
      setSettings(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    loadSettings();

    const handleItemLevelCompletionChange = (val: boolean) => setSettings(s => ({ ...s, itemLevelCompletion: val }));
    const handleCardsPerRowChange = (val: number) => setSettings(s => ({ ...s, cardsPerRow: val }));
    const handleCardsPerColumnChange = (val: number) => setSettings(s => ({ ...s, cardsPerColumn: val }));
    const handleCallingButtonChange = (val: boolean) => setSettings(s => ({ ...s, callingButton: val }));
    const handleCardTitleFontSizeChange = (val: FontSize) => setSettings(s => ({ ...s, cardTitleFontSize: val }));
    const handleItemOptionFontSizeChange = (val: FontSize) => setSettings(s => ({ ...s, itemOptionFontSize: val }));
    const handleShowPrintButtonChange = (val: boolean) => setSettings(s => ({ ...s, showPrintButton: val }));
    const handleShowOrderTimerChange = (val: boolean) => setSettings(s => ({ ...s, showOrderTimer: val }));
    const handleShowTimerHighlightChange = (val: boolean) => setSettings(s => ({ ...s, showTimerHighlight: val }));
    const handleCategoryColorsMappingChange = (val: any) => setSettings(s => ({ ...s, categoryColorsMapping: val }));

    settingsListener.onSettingChange('item_level_completion', handleItemLevelCompletionChange);
    settingsListener.onSettingChange('cards_per_row', handleCardsPerRowChange);
    settingsListener.onSettingChange('cards_per_column', handleCardsPerColumnChange);
    settingsListener.onSettingChange('calling_button', handleCallingButtonChange);
    settingsListener.onSettingChange('card_title_font_size', handleCardTitleFontSizeChange);
    settingsListener.onSettingChange('item_option_font_size', handleItemOptionFontSizeChange);
    settingsListener.onSettingChange('show_print_button', handleShowPrintButtonChange);
    settingsListener.onSettingChange('show_order_timer', handleShowOrderTimerChange);
    settingsListener.onSettingChange('show_timer_highlight', handleShowTimerHighlightChange);
    settingsListener.onSettingChange('category_colors_mapping', handleCategoryColorsMappingChange);

    return () => {
      settingsListener.offSettingChange('item_level_completion', handleItemLevelCompletionChange);
      settingsListener.offSettingChange('cards_per_row', handleCardsPerRowChange);
      settingsListener.offSettingChange('cards_per_column', handleCardsPerColumnChange);
      settingsListener.offSettingChange('calling_button', handleCallingButtonChange);
      settingsListener.offSettingChange('card_title_font_size', handleCardTitleFontSizeChange);
      settingsListener.offSettingChange('item_option_font_size', handleItemOptionFontSizeChange);
      settingsListener.offSettingChange('show_print_button', handleShowPrintButtonChange);
      settingsListener.offSettingChange('show_order_timer', handleShowOrderTimerChange);
      settingsListener.offSettingChange('show_timer_highlight', handleShowTimerHighlightChange);
      settingsListener.offSettingChange('category_colors_mapping', handleCategoryColorsMappingChange);
    };
  }, [loadSettings]);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
};
