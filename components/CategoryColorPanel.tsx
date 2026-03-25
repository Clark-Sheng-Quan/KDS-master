import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';
import { theme } from '../styles/theme';
import { categoryColors } from '../styles/color';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryColorService, Category, CategoryColorMapping } from '../services/categoryColorService';

interface CategoryWithColor extends Category {
  color?: string;
}

interface CategoryColorPanelProps {
  visible: boolean;
  onClose: () => void;
}

export const CategoryColorPanel: React.FC<CategoryColorPanelProps> = ({
  visible,
  onClose,
}) => {
  const { t } = useLanguage();
  const [categories, setCategories] = useState<CategoryWithColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colorMapping, setColorMapping] = useState<CategoryColorMapping>({});
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  const fadeAnim = React.useMemo(() => new Animated.Value(visible ? 1 : 0), [visible]);
  const colorPickerFadeAnim = React.useMemo(() => new Animated.Value(showColorPicker ? 1 : 0), [showColorPicker]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  useEffect(() => {
    Animated.timing(colorPickerFadeAnim, {
      toValue: showColorPicker ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showColorPicker, colorPickerFadeAnim]);

  useEffect(() => {
    if (visible) {
      loadCategories();
    }
  }, [visible]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);

      // 获取商店 ID
      const shopId = await AsyncStorage.getItem('selectedShopId');
      if (!shopId) {
        setError(t('noShopSelected'));
        return;
      }

      // 获取分类列表
      const categoryList = await CategoryColorService.getStoreCategories(shopId);
      console.log('[CategoryColorPanel] 获取到分类数:', categoryList.length);

      // 加载颜色映射
      const mapping = await CategoryColorService.loadCategoryColorMapping();
      setColorMapping(mapping);

      // 为每个分类添加颜色信息
      const categoriesWithColor: CategoryWithColor[] = categoryList.map(cat => ({
        ...cat,
        color: mapping[cat._id] ? categoryColors[mapping[cat._id]] : categoryColors.default,
      }));

      setCategories(categoriesWithColor);
    } catch (err) {
      console.error('[CategoryColorPanel] 加载分类失败:', err);
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectColor = async (colorKey: keyof typeof categoryColors) => {
    if (!selectedCategory) return;

    try {
      // 保存颜色映射
      await CategoryColorService.setCategoryColor(selectedCategory._id, colorKey);

      // 更新状态
      const newMapping = { ...colorMapping, [selectedCategory._id]: colorKey };
      setColorMapping(newMapping);

      // 更新分类列表
      const updatedCategories = categories.map(cat =>
        cat._id === selectedCategory._id
          ? { ...cat, color: categoryColors[colorKey] }
          : cat
      );
      setCategories(updatedCategories);

      setShowColorPicker(false);
      setSelectedCategory(null);
      Alert.alert(t('success'), `${selectedCategory.name} ${t('colorUpdated')}`);
    } catch (err) {
      console.error('[CategoryColorPanel] 设置颜色失败:', err);
      Alert.alert(t('error'), t('setColorFailed'));
    }
  };

  const handleResetColors = () => {
    Alert.alert(
      t('confirm'),
      t('resetAllCategoryColorsConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('reset'),
          style: 'destructive',
          onPress: async () => {
            try {
              await CategoryColorService.resetAllCategoryColors();
              setColorMapping({});
              const resetCategories = categories.map(cat => ({
                ...cat,
                color: categoryColors.default,
              }));
              setCategories(resetCategories);
              Alert.alert(t('success'), t('colorsReset'));
            } catch (err) {
              Alert.alert(t('error'), t('resetFailed'));
            }
          },
        },
      ]
    );
  };





  const renderCategoryItem = ({ item }: { item: CategoryWithColor }) => (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => {
        setSelectedCategory(item);
        setShowColorPicker(true);
      }}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.categoryColorDot,
          { backgroundColor: item.color || categoryColors.default },
        ]}
      />
      <Text style={styles.categoryCardName} numberOfLines={1}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const colors = Object.keys(categoryColors) as Array<keyof typeof categoryColors>;

  return (
    <>
      {/* 主面板背景遮罩 */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: fadeAnim },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* 主面板 - 全屏覆盖 */}
      <Animated.View
        style={[
          styles.mainPanel,
          { opacity: fadeAnim },
          visible && styles.mainPanelVisible,
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <SafeAreaView style={styles.container}>
          {/* 顶部栏 */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetColors}
            >
              <Ionicons name="refresh" size={32} color={theme.colors.primaryColor} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('productCategoryColors')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={32} color={theme.colors.primaryColor} />
            </TouchableOpacity>
          </View>

          {/* 内容 */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={theme.colors.primaryColor} />
            </View>
          ) : error ? (
            <View style={styles.centerContainer}>
              <Ionicons name="alert-circle" size={48} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadCategories}
              >
                <Text style={styles.retryButtonText}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : categories.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name="folder-open" size={48} color="#CCC" />
              <Text style={styles.emptyText}>{t('noCategoriesFound')}</Text>
            </View>
          ) : (
            <FlatList
              data={categories}
              renderItem={renderCategoryItem}
              keyExtractor={item => item._id}
              numColumns={3}
              columnWrapperStyle={styles.listRow}
              contentContainerStyle={styles.listContent}
              scrollEnabled={true}
            />
          )}
        </SafeAreaView>
      </Animated.View>

      {/* 颜色选择器背景遮罩 */}
      <Animated.View
        style={[
          styles.colorPickerBackdrop,
          { opacity: colorPickerFadeAnim },
        ]}
        pointerEvents={showColorPicker ? 'auto' : 'none'}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowColorPicker(false)}
          style={{ flex: 1 }}
        />
      </Animated.View>

      {/* 颜色选择器中心对话框 */}
      {selectedCategory && (
        <Animated.View
          style={[
            styles.colorPickerLayout,
            { 
              opacity: colorPickerFadeAnim,
              transform: [{ scale: colorPickerFadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              })}]
            },
          ]}
          pointerEvents={showColorPicker ? 'auto' : 'none'}>
          <View style={styles.colorPickerDialog}>
            <View style={styles.colorPickerHeader}>
              <Text style={styles.colorPickerTitle} numberOfLines={1}>
                {selectedCategory.name}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowColorPicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.colorGridContainer}>
              {colors.map(colorKey => (
                <TouchableOpacity
                  key={colorKey}
                  style={styles.colorSelect}
                  onPress={() => handleSelectColor(colorKey)}
                >
                  <View
                    style={[
                      styles.colorDotLarge,
                      { backgroundColor: categoryColors[colorKey] },
                      colorMapping[selectedCategory._id] === colorKey && styles.colorDotSelected,
                    ]}
                  >
                    {colorMapping[selectedCategory._id] === colorKey && (
                      <Ionicons name="checkmark-sharp" size={24} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    zIndex: 98,
  },
  mainPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    opacity: 0,
    zIndex: 99,
  },
  mainPanelVisible: {
    opacity: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  closeButton: {
    padding: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
  },
  resetButton: {
    padding: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: theme.colors.primaryColor,
    borderRadius: 6,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  listRow: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 12,
  },
  categoryCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryColorDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  categoryCardName: {
    fontSize: 28,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  colorPickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    zIndex: 199,
  },
  colorPickerLayout: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -350,
    marginTop: -160,
    zIndex: 200,
  },
  colorPickerDialog: {
    width: 700,
    height: 400,
    backgroundColor: 'white',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  colorPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    flex: 1,
  },
  colorGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 32,
  },
  colorSelect: {
    alignItems: 'center',
  },
  colorDotLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorDotSelected: {
    borderColor: theme.colors.primaryColor,
    borderWidth: 3,
    shadowColor: theme.colors.primaryColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
