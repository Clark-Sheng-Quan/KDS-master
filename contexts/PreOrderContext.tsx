import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { FormattedOrder } from "../services/types";
import { OrderService } from "../services/orderService/OrderService";
import { getNextSevenDaysRange } from "../services/orderService/timeUtils";

interface PreOrderContextType {
  orders: FormattedOrder[];
  loading: boolean;
  error: string | null;
  removeOrder: (orderId: string) => void;
}

const PreOrderContext = createContext<PreOrderContextType>({
  orders: [],
  loading: false,
  error: null,
  removeOrder: () => {},
});

export function PreOrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 过滤预订单的辅助函数 - 筛选未来7天内的订单
  const filterPreOrders = useCallback((allOrders: FormattedOrder[]): FormattedOrder[] => {
    const timeRange = getNextSevenDaysRange();
    const startTime = new Date(timeRange[0]).getTime();
    const endTime = new Date(timeRange[1]).getTime();
    
    return allOrders.filter(order => {
      const orderTime = new Date(order.orderTime).getTime();
      return orderTime >= startTime && orderTime <= endTime;
    });
  }, []);

  // 初始化：订阅 OrderService 的订单更新
  useEffect(() => {
    console.log("初始化预订单Context - 订阅 OrderService 更新...");
    
    // 订阅 OrderService 的更新
    const unsubscribe = OrderService.setOrderUpdateCallback((allOrders) => {
      console.log(`[PreOrderContext] 收到订单更新回调 - ${allOrders.length} 个订单`);
      
      // 过滤出预订单
      const filteredPreOrders = filterPreOrders(allOrders);
      console.log(`[PreOrderContext] 过滤后预订单: ${filteredPreOrders.length} 个`);
      
      setOrders(filteredPreOrders);
    });

    // 清理订阅
    return () => {
      console.log("清理预订单Context订阅");
      unsubscribe?.();
    };
  }, [filterPreOrders]);

  const removeOrder = useCallback(async (orderId: string) => {
    try {
      await OrderService.removeOrder(orderId);
      setOrders((prevOrders) =>
        prevOrders.filter((order) => order.id !== orderId)
      );
    } catch (error) {
      console.error("删除预订单失败:", error);
    }
  }, []);

  // 使用 useMemo 缓存 Context value
  const contextValue = useMemo(
    () => ({
      orders,
      loading,
      error,
      removeOrder,
    }),
    [orders, loading, error, removeOrder]
  );

  return (
    <PreOrderContext.Provider value={contextValue}>
      {children}
    </PreOrderContext.Provider>
  );
}

export function usePreOrders() {
  return useContext(PreOrderContext);
}
