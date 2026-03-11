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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 过滤预订单的辅助函数 - 筛选未来7天内的订单
  const filterPreOrders = (allOrders: FormattedOrder[]): FormattedOrder[] => {
    const timeRange = getNextSevenDaysRange();
    const startTime = new Date(timeRange[0]).getTime();
    const endTime = new Date(timeRange[1]).getTime();
    
    return allOrders.filter(order => {
      const orderTime = new Date(order.orderTime).getTime();
      return orderTime >= startTime && orderTime <= endTime;
    });
  };

  // 初始化订单系统
  useEffect(() => {
    const initSystem = async () => {
      try {
        console.log("初始化预订单系统...");
        setLoading(true);

        // 获取未来7天的时间范围
        const timeRange = getNextSevenDaysRange();

        // 获取预订单
        const preOrders = await OrderService.fetchOrdersFromNetwork(timeRange);
        if (preOrders) {
          setOrders(preOrders);
        }

        setLoading(false);

        // 订阅 OrderService 的订单更新回调
        // 这样 PreOrderContext 会自动接收 OrderService 轮询到的新订单
        OrderService.setOrderUpdateCallback((allOrders) => {
          // 从所有订单中过滤出预订单
          const filteredPreOrders = filterPreOrders(allOrders);
          setOrders(filteredPreOrders);
        });
      } catch (error) {
        console.error("初始化预订单系统失败:", error);
        setError("系统初始化失败");
        setLoading(false);
      }
    };

    initSystem();

    // 无需轮询，通过 OrderService 的回调接收更新
  }, []);

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
