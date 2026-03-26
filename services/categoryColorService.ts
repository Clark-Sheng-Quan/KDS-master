import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_API } from '../config/api';
import { categoryColors } from '../constants/theme';
import { settingsListener } from './settingsListener';

export interface Category {
  _id: string;
  business_id: string;
  name: string;
  parent_id?: string;
}

export interface CategoryColorResponse {
  category: Category[];
  status_code: number;
}

export interface CategoryColorMapping {
  [category_id: string]: keyof typeof categoryColors;
}

export class CategoryColorService {
  private static readonly STORAGE_KEY = 'category_colors_mapping';
  private static readonly SHOP_ID_KEY = 'selectedShopId';

  // 获取当前商店的所有分类
  static async getStoreCategories(shopId: string): Promise<Category[]> {
    try {
      const response = await fetch(`${BASE_API}/shop/product_category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop_id: shopId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP错误! 状态: ${response.status}`);
      }

      const data: CategoryColorResponse = await response.json();
      console.log('[CategoryColorService] 获取分类成功，总数:', data.category?.length);
      
      if (!data.category || !Array.isArray(data.category)) {
        console.warn('[CategoryColorService] API 返回的分类数据无效');
        return [];
      }

      return data.category;
    } catch (error) {
      console.error('[CategoryColorService] 获取分类失败:', error);
      throw error;
    }
  }

  // 加载保存的分类颜色映射
  static async loadCategoryColorMapping(): Promise<CategoryColorMapping> {
    try {
      const saved = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
      return {};
    } catch (error) {
      console.error('[CategoryColorService] 加载分类颜色映射失败:', error);
      return {};
    }
  }

  // 保存分类颜色映射
  static async saveCategoryColorMapping(mapping: CategoryColorMapping): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(mapping));
      console.log('[CategoryColorService] 保存分类颜色映射成功');
      // 触发事件，让 OrderCard 等组件重新加载颜色映射
      settingsListener.emitSettingChange('category_colors_mapping', mapping);
    } catch (error) {
      console.error('[CategoryColorService] 保存分类颜色映射失败:', error);
      throw error;
    }
  }

  // 为单个分类设置颜色
  static async setCategoryColor(
    categoryId: string,
    colorKey: keyof typeof categoryColors
  ): Promise<void> {
    try {
      const mapping = await this.loadCategoryColorMapping();
      mapping[categoryId] = colorKey;
      await this.saveCategoryColorMapping(mapping);
    } catch (error) {
      console.error('[CategoryColorService] 设置分类颜色失败:', error);
      throw error;
    }
  }

  // 获取分类的颜色
  static async getCategoryColor(categoryId: string): Promise<string> {
    try {
      const mapping = await this.loadCategoryColorMapping();
      const colorKey = mapping[categoryId] || 'default';
      return categoryColors[colorKey];
    } catch (error) {
      console.error('[CategoryColorService] 获取分类颜色失败:', error);
      return categoryColors.default;
    }
  }

  // 重置所有分类颜色
  static async resetAllCategoryColors(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEY);
      console.log('[CategoryColorService] 重置所有分类颜色成功');
    } catch (error) {
      console.error('[CategoryColorService] 重置分类颜色失败:', error);
      throw error;
    }
  }
}
