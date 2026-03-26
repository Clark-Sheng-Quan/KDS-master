import React, { createContext, useState, useContext, useEffect, useMemo, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { categoryColors } from "../constants/theme";

interface CategoryColorMapping {
  [category: string]: string;
}

interface CategoryColorContextType {
  categoryColorMap: CategoryColorMapping;
  setCategoryColor: (
    category: string,
    colorKey: keyof typeof categoryColors
  ) => Promise<void>;
  resetCategoryColors: () => Promise<void>;
  getCategoryColor: (category: string | undefined) => string;
}

const CategoryColorContext = createContext<CategoryColorContextType>({
  categoryColorMap: {},
  setCategoryColor: async () => {},
  resetCategoryColors: async () => {},
  getCategoryColor: () => categoryColors.default,
});

export const CategoryColorProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [categoryColorMap, setCategoryColorMap] =
    useState<CategoryColorMapping>({});

  // 在组件挂载时加载保存的分类颜色
  useEffect(() => {
    const loadCategoryColors = async () => {
      try {
        const savedColorsJson = await AsyncStorage.getItem("category_colors");
        if (savedColorsJson) {
          setCategoryColorMap(JSON.parse(savedColorsJson));
        }
      } catch (error) {
        console.error("加载分类颜色失败:", error);
      }
    };

    loadCategoryColors();
  }, []);

  // 设置分类颜色 - 使用 useCallback 缓存
  const setCategoryColor = useCallback(async (
    category: string,
    colorKey: keyof typeof categoryColors
  ) => {
    try {
      setCategoryColorMap((prevMap) => {
        const updatedMap = { ...prevMap };

        // 限制最多20个分类颜色
        const currentCategories = Object.keys(updatedMap);
        if (currentCategories.length >= 20 && !updatedMap[category]) {
          // 如果已经有20个分类且当前分类不在映射中，则不添加
          return prevMap;
        }

        updatedMap[category] = categoryColors[colorKey];

        // 保存到 AsyncStorage
        AsyncStorage.setItem("category_colors", JSON.stringify(updatedMap)).catch((error) => {
          console.error("保存分类颜色失败:", error);
        });

        return updatedMap;
      });
    } catch (error) {
      console.error("保存分类颜色失败:", error);
    }
  }, []);

  // 重置所有分类颜色 - 使用 useCallback 缓存
  const resetCategoryColors = useCallback(async () => {
    try {
      setCategoryColorMap({});
      await AsyncStorage.removeItem("category_colors");
    } catch (error) {
      console.error("重置分类颜色失败:", error);
    }
  }, []);

  // 获取分类颜色 - 使用 useCallback 缓存
  const getCategoryColor = useCallback((category: string | undefined): string => {
    if (!category) return categoryColors.default;
    return categoryColorMap[category] || categoryColors.default;
  }, [categoryColorMap]);

  // 使用 useMemo 缓存 Context value
  const contextValue = useMemo(
    () => ({
      categoryColorMap,
      setCategoryColor,
      resetCategoryColors,
      getCategoryColor,
    }),
    [categoryColorMap, setCategoryColor, resetCategoryColors, getCategoryColor]
  );

  return (
    <CategoryColorContext.Provider value={contextValue}>
      {children}
    </CategoryColorContext.Provider>
  );
};

export const useCategoryColors = () => useContext(CategoryColorContext);
