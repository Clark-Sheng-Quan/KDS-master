import React, { createContext, useContext, useState, useEffect } from "react";
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
      } catch (error) {
        console.error("初始化预订单系统失败:", error);
        setError("系统初始化失败");
        setLoading(false);
      }
    };

    initSystem();

    // 设置轮询间隔
    const intervalId = setInterval(async () => {
      try {
        const timeRange = getNextSevenDaysRange();
        const preOrders = await OrderService.fetchOrdersFromNetwork(timeRange);
        if (preOrders) {
          setOrders(preOrders);
        }
      } catch (error) {
        console.error("获取预订单失败:", error);
      }
    }, 5000); // 每5秒更新一次

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const removeOrder = async (orderId: string) => {
    try {
      await OrderService.removeOrder(orderId);
      setOrders((prevOrders) =>
        prevOrders.filter((order) => order.id !== orderId)
      );
    } catch (error) {
      console.error("删除预订单失败:", error);
    }
  };

  return (
    <PreOrderContext.Provider
      value={{
        orders,
        loading,
        error,
        removeOrder,
      }}
    >
      {children}
    </PreOrderContext.Provider>
  );
}

export function usePreOrders() {
  return useContext(PreOrderContext);
}
