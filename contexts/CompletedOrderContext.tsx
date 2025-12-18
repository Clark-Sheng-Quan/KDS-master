import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompletedOrder, FormattedOrder } from '../services/types';

const STORAGE_KEY = 'completed_orders';

// 保留策略配置
const RETENTION_CONFIG = {
  MAX_ORDERS: 50,              // 最多保留 50 条记录
  MAX_DAYS: 1,                  // 最多保留 1 天的记录
};

interface CompletedOrderContextType {
  completedOrders: CompletedOrder[];
  addCompletedOrder: (order: FormattedOrder, itemsToComplete: any[]) => Promise<void>;
  removeCompletedOrder: (orderId: string, itemId?: string, itemToRestore?: any) => Promise<void>;
  clearCompletedOrders: () => Promise<void>;
  cleanExpiredOrdersNow: () => Promise<void>;
  loading: boolean;
}

const CompletedOrderContext = createContext<CompletedOrderContextType | undefined>(undefined);

export const CompletedOrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // 初始化：从本地存储加载已完成的订单
  useEffect(() => {
    loadCompletedOrders();
  }, []);

  const cleanExpiredOrders = (orders: CompletedOrder[]): CompletedOrder[] => {
    try {
      const now = new Date();
      const maxDaysAgo = new Date(now.getTime() - RETENTION_CONFIG.MAX_DAYS * 24 * 60 * 60 * 1000);

      // 1. 先过滤掉超过保留天数的订单（满足条件1就删除）
      let filtered = orders.filter(co => {
        const completedDate = new Date(co.completedAt);
        const isExpired = completedDate <= maxDaysAgo;  // 修正：<= 才是过期的
        if (isExpired) {
          console.log(`[CompletedOrderContext] 订单 ${co.order.id} 已过期: ${co.completedAt} <= ${maxDaysAgo.toISOString()}`);
        }
        return !isExpired;  // 返回未过期的订单
      });

      // 2. 如果数量超过限制，只保留最新的 MAX_ORDERS 条（满足条件2就删除超出部分）
      if (filtered.length > RETENTION_CONFIG.MAX_ORDERS) {
        filtered = filtered.slice(0, RETENTION_CONFIG.MAX_ORDERS);
      }

      return filtered;
    } catch (error) {
      console.error('[CompletedOrderContext] 清理过期订单失败:', error);
      return orders;
    }
  };

  /**
   * 从本地存储加载已完成的订单
   */
  const loadCompletedOrders = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        let orders = JSON.parse(stored) as CompletedOrder[];
        // 直接加载，不自动清理
        setCompletedOrders(orders);
      }
    } catch (error) {
      console.error('[CompletedOrderContext] 加载已完成订单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 保存已完成的订单到本地存储
   */
  const saveCompletedOrders = async (orders: CompletedOrder[]) => {
    try {
      // 保存前清理过期数据
      const cleaned = cleanExpiredOrders(orders);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    } catch (error) {
      console.error('[CompletedOrderContext] 保存已完成订单失败:', error);
    }
  };

  /**
   * 添加已完成的订单
   * @param order 订单信息
   * @param itemsToComplete 要完成的产品数组（单个或多个）
   */
  const addCompletedOrder = async (order: FormattedOrder, itemsToComplete: any[] = []) => {
    try {
      // 防守：确保 itemsToComplete 是数组
      if (!Array.isArray(itemsToComplete)) {
        console.warn('[CompletedOrderContext] itemsToComplete 不是数组，重置为空数组');
        itemsToComplete = [];
      }

      const now = new Date().toISOString();
      let updated = [...completedOrders];

      // 订单元数据（products 为空，实际产品在 completedItems）
      const orderMetadata: FormattedOrder = {
        ...order,
        products: [],
      };

      // 查找已存在的记录（按 order.id）
      const existingIndex = updated.findIndex(co => co.order.id === order.id);

      if (existingIndex !== -1) {
        // 合并已完成的产品（去重）
        const existingItems = updated[existingIndex].completedItems || [];
        const existingIds = new Set(existingItems.map(p => p.id));
        const newItems = itemsToComplete.filter(p => !existingIds.has(p.id));
        const completedItems = [...existingItems, ...newItems];

        updated[existingIndex] = {
          ...updated[existingIndex],
          order: orderMetadata,
          completedItems,
          completedAt: now,
        };
      } else {
        // 创建新记录
        updated.unshift({
          order: orderMetadata,
          completedAt: now,
          completedItems: itemsToComplete,
        });
      }

      setCompletedOrders(updated);
      await saveCompletedOrders(updated);
    } catch (error) {
      console.error('[CompletedOrderContext] 添加完成订单失败:', error);
    }
  };

  /**
   * 删除已完成的订单（撤回时使用）
   * 支持两种删除方式：
   * 1. 按 orderId 删除整个订单的所有完成记录
   * 2. 按 itemId 删除订单中的单个项目
   */
  const removeCompletedOrder = async (orderId: string, itemId?: string, itemToRestore?: any) => {
    try {
      let updated: CompletedOrder[];

      if (itemId) {
        // ======= 按 itemId 删除：移除单个 item 的完成记录 =======
        const coIndex = completedOrders.findIndex(
          co => co.order.id === orderId && co.completedItems?.length
        );

        if (coIndex === -1) {
          console.warn(`[CompletedOrderContext] ⚠ 未找到订单: ${orderId}`);
          return;
        }

        const co = completedOrders[coIndex];
        const updatedItems = (co.completedItems || []).filter(item => item.id !== itemId);

        if (updatedItems.length > 0) {
          // 还有其他已完成项目，保留记录
          updated = completedOrders.map((item, idx) => 
            idx === coIndex 
              ? { ...co, completedItems: updatedItems, completedAt: new Date().toISOString() }
              : item
          );
          console.log(`[CompletedOrderContext] ✓ 移除 item: ${itemId} (剩余${updatedItems.length}项)`);
        } else {
          // 无剩余项目，删除整个记录
          updated = completedOrders.filter((_, idx) => idx !== coIndex);
          console.log(`[CompletedOrderContext] ✓ 删除完成记录: ${orderId}`);
        }
      } else {
        // ======= 按 orderId 删除：移除整个订单的所有完成记录 =======
        updated = completedOrders.filter(co => co.order.id !== orderId);
        console.log(`[CompletedOrderContext] ✓ 移除订单: ${orderId}`);
      }

      // 统一保存
      setCompletedOrders(updated);
      await saveCompletedOrders(updated);
    } catch (error) {
      console.error('[CompletedOrderContext] 移除完成订单失败:', error);
    }
  };

  /**
   * 清空所有已完成的订单
   */
  const clearCompletedOrders = async () => {
    try {
      setCompletedOrders([]);
      await AsyncStorage.removeItem(STORAGE_KEY);
      console.log('[CompletedOrderContext] 已清空所有完成订单');
    } catch (error) {
      console.error('[CompletedOrderContext] 清空完成订单失败:', error);
    }
  };

  /**
   * 主动清理过期订单（手动触发）
   */
  const cleanExpiredOrdersNow = async () => {
    try {
      const cleaned = cleanExpiredOrders(completedOrders);
      if (cleaned.length !== completedOrders.length) {
        console.log(`[CompletedOrderContext] 清理过期订单: 从 ${completedOrders.length} 条减少到 ${cleaned.length} 条`);
        setCompletedOrders(cleaned);
        await saveCompletedOrders(cleaned);
      }
    } catch (error) {
      console.error('[CompletedOrderContext] 主动清理过期订单失败:', error);
    }
  };

  return (
    <CompletedOrderContext.Provider
      value={{
        completedOrders,
        addCompletedOrder,
        removeCompletedOrder,
        clearCompletedOrders,
        cleanExpiredOrdersNow,
        loading,
      }}
    >
      {children}
    </CompletedOrderContext.Provider>
  );
};

/**
 * 使用 CompletedOrderContext 的 Hook
 */
export const useCompletedOrders = (): CompletedOrderContextType => {
  const context = useContext(CompletedOrderContext);
  if (!context) {
    throw new Error('useCompletedOrders 必须在 CompletedOrderProvider 中使用');
  }
  return context;
};
