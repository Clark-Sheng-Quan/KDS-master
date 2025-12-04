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
  addCompletedOrder: (order: FormattedOrder, source: 'network' | 'tcp', itemId?: string, itemName?: string) => Promise<void>;
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
   * 支持两种模式：
   * 1. 全单完成：order 完成，itemId 为空
   * 2. 单项完成：只有单个 item 完成，itemId 和 itemName 不为空
   */
  const addCompletedOrder = async (order: FormattedOrder, source: 'network' | 'tcp', itemId?: string, itemName?: string) => {
    try {
      // 如果是单项完成（item-level mode），检查是否已有该 order 的完成记录
      if (itemId) {
        // 查找该订单的任何单项完成记录（不是全单完成的）
        const existingIndex = completedOrders.findIndex(
          co => co.order.id === order.id && co.itemId
        );

        if (existingIndex !== -1) {
          // 已有该 order 的单项完成记录，更新它
          const existing = completedOrders[existingIndex];
          
          // 检查该 item 是否已在完成列表中
          const itemAlreadyCompleted = existing.completedItems?.some(p => p.id === itemId);
          
          if (!itemAlreadyCompleted) {
            // 把该 item 从原订单中移出（标记为完成）
            const itemToRemove = order.products?.find(p => p.id === itemId);
            
            if (itemToRemove) {
              // 更新订单，移除该 item
              const updatedOrder = {
                ...existing.order,
                products: existing.order.products?.filter(p => p.id !== itemId) || []
              };
              
              // 添加到完成列表
              const updatedCompletedItems = [...(existing.completedItems || []), itemToRemove];
              
              // 优化：直接使用 findIndex，避免重复查找
              const idx = completedOrders.findIndex(co => co.order.id === order.id && co.itemId);
              setCompletedOrders(prevOrders => {
                const updated = [...prevOrders];
                updated[idx] = {
                  ...existing,
                  order: updatedOrder,
                  completedItems: updatedCompletedItems,
                  completedAt: new Date().toISOString(),
                };
                saveCompletedOrders(updated).catch((error) => {
                  console.error('[CompletedOrderContext] 后台保存失败:', error);
                });
                return updated;
              });
              
              console.log(`[CompletedOrderContext] 已更新单项完成: ${order.id} - ${itemName} (${itemId})`);
            }
          } else {
            console.log(`[CompletedOrderContext] 项目已完成: ${itemName} (${itemId})`);
          }
        } else {
          // 第一次完成该 order 的 item，创建新记录
          // 把该 item 从原订单中移出
          const itemToRemove = order.products?.find(p => p.id === itemId);
          
          if (itemToRemove) {
            const updatedOrder = {
              ...order,
              products: order.products?.filter(p => p.id !== itemId) || []
            };
            
            const completedOrder: CompletedOrder = {
              order: updatedOrder,
              completedAt: new Date().toISOString(),
              source,
              itemId,
              itemName,
              completedItems: [itemToRemove],  // 完成的 items 列表
              isFullOrder: false,
            };
            
            const updated = [completedOrder, ...completedOrders];
            setCompletedOrders(updated);
            
            saveCompletedOrders(updated).catch((error) => {
              console.error('[CompletedOrderContext] 后台保存失败:', error);
            });
            
            console.log(`[CompletedOrderContext] 已添加单项完成: ${order.id} - ${itemName} (${itemId})`);
          }
        }
      } else {
        // 全单完成
        const completedOrder: CompletedOrder = {
          order,
          completedAt: new Date().toISOString(),
          source,
          completedItems: order.products || [],  // 全单完成时，所有 products 都是完成的
          isFullOrder: true,
        };

        const exists = completedOrders.some(co => co.order.id === order.id && !co.itemId);
        if (exists) {
          console.warn(`[CompletedOrderContext] 订单 ${order.id} 的全单完成记录已存在`);
          return;
        }

        const updated = [completedOrder, ...completedOrders];
        setCompletedOrders(updated);
        
        saveCompletedOrders(updated).catch((error) => {
          console.error('[CompletedOrderContext] 后台保存失败:', error);
        });

        console.log(`[CompletedOrderContext] 已添加全单完成: ${order.id}`);
      }
    } catch (error) {
      console.error('[CompletedOrderContext] 添加完成订单失败:', error);
    }
  };

  /**
   * 删除已完成的订单（撤回时使用）
   * 支持两种删除方式：
   * 1. 按 orderId 删除整个订单
   * 2. 按 itemId 删除订单中的单个项目，同时可恢复 item 到订单中
   */
  const removeCompletedOrder = async (orderId: string, itemId?: string, itemToRestore?: any) => {
    try {
      let updated: CompletedOrder[];
      
      if (itemId) {
        // 按 itemId 删除/更新：删除该 item 的完成记录
        // 首先查找该 order 的完成记录（可能有多个 items）
        const completedOrderIndex = completedOrders.findIndex(
          co => co.order.id === orderId && co.completedItems
        );

        if (completedOrderIndex !== -1) {
          // 找到了该 order 的完成记录
          const completedOrder = completedOrders[completedOrderIndex];
          
          // 从 completedItems 中移除该 item
          const updatedCompletedItems = (completedOrder.completedItems || []).filter(
            item => item.id !== itemId
          );
          
          // 如果还有其他 items，更新记录；否则删除该记录
          if (updatedCompletedItems.length > 0) {
            // 还有其他 items，保留该记录并更新
            const updated_arr = [...completedOrders];
            updated_arr[completedOrderIndex] = {
              ...completedOrder,
              completedItems: updatedCompletedItems,
              completedAt: new Date().toISOString(),
            };
            updated = updated_arr;
            console.log(`[CompletedOrderContext] 已从记录中移除 item: orderId=${orderId}, itemId=${itemId}，剩余 ${updatedCompletedItems.length} 个 items`);
          } else {
            // 没有其他 items 了，删除该记录
            updated = completedOrders.filter((_, idx) => idx !== completedOrderIndex);
            console.log(`[CompletedOrderContext] 已删除完成记录（无剩余 items）: orderId=${orderId}, itemId=${itemId}`);
          }
        } else {
          // 没找到，可能这个 order 的记录已被删除
          console.warn(`[CompletedOrderContext] 未找到订单的完成记录: orderId=${orderId}`);
          updated = completedOrders;
        }
      } else {
        // 按 orderId 删除：移除整个订单的所有完成记录
        updated = completedOrders.filter(co => co.order.id !== orderId);
        console.log(`[CompletedOrderContext] 已移除完成订单: ${orderId}`);
      }
      
      setCompletedOrders(updated);
      
      // 在后台保存，不阻塞 UI
      saveCompletedOrders(updated).catch((error) => {
        console.error('[CompletedOrderContext] 后台保存失败:', error);
      });
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
