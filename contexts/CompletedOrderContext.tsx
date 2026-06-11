import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CompletedOrder, CompletedOrderItem, FormattedOrder } from '../services/types';

const STORAGE_KEY = 'completed_orders';

interface CompletedOrderContextType {
  completedOrders: CompletedOrder[];
  addCompletedOrder: (order: FormattedOrder, itemsToComplete: any[]) => Promise<CompletedOrderItem[]>;
  removeCompletedOrder: (orderId: string, itemId?: string, completionKey?: string) => Promise<void>;
  clearCompletedOrders: () => Promise<void>;
  loading: boolean;
}

const CompletedOrderContext = createContext<CompletedOrderContextType | undefined>(undefined);

export const CompletedOrderProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [completedOrders, setCompletedOrders] = useState<CompletedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompletedOrders();
  }, []);

  const loadCompletedOrders = async () => {
    try {
      setLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        setCompletedOrders(JSON.parse(stored) as CompletedOrder[]);
      }
    } catch (error) {
      console.error('[CompletedOrderContext] 加载已完成订单失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCompletedOrders = useCallback(async (orders: CompletedOrder[]) => {
    try {
      setCompletedOrders(orders);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
      console.error('[CompletedOrderContext] 保存已完成订单失败:', error);
    }
  }, []);

  const normalizeCompletedItems = (itemsToComplete: any[]): CompletedOrderItem[] => {
    const entries: CompletedOrderItem[] = [];

    itemsToComplete.forEach((item, itemIndex) => {
      const quantity = Math.max(1, Number(item?.quantity) || 1);
      const completedAt = typeof item?.__completedAt === 'string'
        ? item.__completedAt
        : new Date().toISOString();
      const completedElapsedSeconds = typeof item?.__completedElapsedSeconds === 'number'
        ? Math.max(0, Math.floor(item.__completedElapsedSeconds))
        : undefined;

      for (let i = 0; i < quantity; i += 1) {
        entries.push({
          ...item,
          quantity: 1,
          sourceItemId: item?.id,
          completedAt,
          completedElapsedSeconds,
          completionKey: `${item?.id || 'item'}-${completedAt}-${itemIndex}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    });

    return entries;
  };

  const completedOrdersRef = useRef(completedOrders);
  useEffect(() => { completedOrdersRef.current = completedOrders; }, [completedOrders]);

  const addCompletedOrder = useCallback(async (order: FormattedOrder, itemsToComplete: any[] = []) => {
    try {
      if (!Array.isArray(itemsToComplete)) {
        itemsToComplete = [];
      }

      const normalizedItems = normalizeCompletedItems(itemsToComplete);
      let updated = [...completedOrdersRef.current];

      const orderMetadata: FormattedOrder = { ...order, products: [] };

      const getLatestCompletionTime = (items: CompletedOrderItem[]): string => {
        if (items.length === 0) return new Date().toISOString();
        return items.reduce((latest, item) => {
          return new Date(item.completedAt).getTime() > new Date(latest).getTime()
            ? item.completedAt
            : latest;
        }, items[0].completedAt);
      };

      const existingIndex = updated.findIndex(co => co.order.id === order.id);

      if (existingIndex !== -1) {
        const existingItems = updated[existingIndex].completedItems || [];
        const completedItems = [...existingItems, ...normalizedItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          order: orderMetadata,
          completedItems,
          completedAt: getLatestCompletionTime(completedItems),
        };
      } else {
        updated.unshift({
          order: orderMetadata,
          completedAt: getLatestCompletionTime(normalizedItems),
          completedItems: normalizedItems,
        });
      }

      await saveCompletedOrders(updated);
      return normalizedItems;
    } catch (error) {
      console.error('[CompletedOrderContext] 添加完成订单失败:', error);
      return [];
    }
  }, [saveCompletedOrders]);

  const removeCompletedOrder = useCallback(async (orderId: string, itemId?: string, completionKey?: string) => {
    try {
      let updated: CompletedOrder[];

      if (itemId) {
        const coIndex = completedOrdersRef.current.findIndex(
          co => co.order.id === orderId && co.completedItems?.length
        );

        if (coIndex === -1) {
          console.warn(`[CompletedOrderContext] ⚠ 未找到订单: ${orderId}`);
          return;
        }

        const co = completedOrdersRef.current[coIndex];
        let updatedItems = [...(co.completedItems || [])];
        if (completionKey) {
          updatedItems = updatedItems.filter(item => item.completionKey !== completionKey);
        } else {
          const removeIndex = updatedItems.findIndex(item => item.id === itemId);
          if (removeIndex !== -1) updatedItems.splice(removeIndex, 1);
        }

        if (updatedItems.length > 0) {
          updated = completedOrdersRef.current.map((item, idx) =>
            idx === coIndex
              ? { ...co, completedItems: updatedItems, completedAt: new Date().toISOString() }
              : item
          );
        } else {
          updated = completedOrdersRef.current.filter((_, idx) => idx !== coIndex);
        }
      } else {
        updated = completedOrdersRef.current.filter(co => co.order.id !== orderId);
      }

      await saveCompletedOrders(updated);
    } catch (error) {
      console.error('[CompletedOrderContext] 移除完成订单失败:', error);
    }
  }, [saveCompletedOrders]);

  const clearCompletedOrders = useCallback(async () => {
    try {
      setCompletedOrders([]);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[CompletedOrderContext] 清空完成订单失败:', error);
    }
  }, []);

  const contextValue = useMemo(() => ({
    completedOrders,
    addCompletedOrder,
    removeCompletedOrder,
    clearCompletedOrders,
    loading,
  }), [completedOrders, addCompletedOrder, removeCompletedOrder, clearCompletedOrders, loading]);

  return (
    <CompletedOrderContext.Provider value={contextValue}>
      {children}
    </CompletedOrderContext.Provider>
  );
};

export const useCompletedOrders = (): CompletedOrderContextType => {
  const context = useContext(CompletedOrderContext);
  if (!context) {
    throw new Error('useCompletedOrders 必须在 CompletedOrderProvider 中使用');
  }
  return context;
};
