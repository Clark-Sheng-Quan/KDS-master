import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { FormattedOrder } from "../services/types";
import { OrderService } from "../services/orderService";
import { DistributionService, KDSRole } from "../services/distributionService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

interface OrderContextType {
  orders: FormattedOrder[];
  networkOrders: FormattedOrder[]; // 网络订单
  tcpOrders: FormattedOrder[]; // TCP订单
  loading: boolean;
  error: string | null;
  removeOrder: (orderId: string, source?: "network" | "tcp" | "all") => void;
  refreshOrders: () => Promise<void>;
  isKDSMaster: boolean;
  networkStatus: "connected" | "disconnected" | "unknown";
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<FormattedOrder[]>([]);
  const [networkOrders, setNetworkOrders] = useState<FormattedOrder[]>([]);
  const [tcpOrders, setTcpOrders] = useState<FormattedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isKDSMaster, setIsKDSMaster] = useState(true); // 默认为主KDS
  const [networkStatus, setNetworkStatus] = useState<
    "connected" | "disconnected" | "unknown"
  >("unknown");

  // 用于跟踪已分发的订单ID
  const [distributedOrderIds] = useState<Set<string>>(new Set());

  // 获取KDS角色
  useEffect(() => {
    async function getKDSRole() {
      try {
        const role = await AsyncStorage.getItem("kds_role");
        setIsKDSMaster(role !== "slave");
      } catch (error) {
        console.error("获取KDS角色失败:", error);
      }
    }

    getKDSRole();
  }, []);

  // 网络状态监控
  useEffect(() => {
    let networkCheckInterval: ReturnType<typeof setInterval>;

    // 检查网络状态的函数
    const checkNetworkStatus = async () => {
      try {
        const netState = await Network.getNetworkStateAsync();
        if (netState.isConnected && netState.isInternetReachable) {
          setNetworkStatus("connected");
        } else {
          setNetworkStatus("disconnected");
        }
      } catch (error) {
        console.error("检查网络状态失败:", error);
        setNetworkStatus("unknown");
      }
    };

    // 初始检查
    checkNetworkStatus();

    // 设置定期检查 (每10秒检查一次)
    networkCheckInterval = setInterval(checkNetworkStatus, 10000);

    return () => {
      // 清理定时器
      if (networkCheckInterval) {
        clearInterval(networkCheckInterval);
      }
    };
  }, []);

  // 初始化订单系统
  useEffect(() => {
    const initSystem = async () => {
      try {
        console.log("初始化订单系统...");
        setLoading(true);

        // 先初始化OrderService
        await OrderService.initialize();

        // 再初始化DistributionService
        await DistributionService.initialize();

        // 加载已保存的订单
        const savedNetworkOrders = await OrderService.loadNetworkOrders();
        const savedTcpOrders = await OrderService.loadTCPOrders();

        // 将所有现有订单ID添加到已分发集合中，避免重复分发
        savedNetworkOrders.forEach((order) =>
          distributedOrderIds.add(order.id)
        );
        savedTcpOrders.forEach((order) => distributedOrderIds.add(order.id));

        // 设置订单更新回调函数 - 这是唯一的分发入口点
        OrderService.setOrderUpdateCallback(async (updatedOrders) => {
          console.log("收到订单更新，订单数量:", updatedOrders.length);

          // 首先对所有订单进行去重
          const uniqueOrders = [];
          const seenIds = new Set();

          for (const order of updatedOrders) {
            if (!seenIds.has(order.id)) {
              uniqueOrders.push(order);
              seenIds.add(order.id);
            }
          }

          // 区分网络订单和TCP订单
          const networkOrdersList = uniqueOrders.filter(
            (order) => order.source === "network"
          );
          const tcpOrdersList = uniqueOrders.filter(
            (order) => order.source === "tcp"
          );

          setNetworkOrders(networkOrdersList);
          setTcpOrders(tcpOrdersList);
          setOrders(uniqueOrders);

          // 注意：我们不再在这里分发订单，因为OrderService的addNetworkOrder方法
          // 已经负责在添加新网络订单时调用DistributionService.processAndDistributeOrder
          // 这样可以避免重复分发订单
          console.log("订单状态已更新");
        });

        setLoading(false);
      } catch (error) {
        console.error("初始化失败:", error);
        setError("系统初始化失败");
        setLoading(false);
      }
    };

    initSystem();

    return () => {
      // 清理函数
      OrderService.stopNetworkPolling(); // 停止网络轮询
      DistributionService.shutdown();
    };
  }, [distributedOrderIds]);

  // 移除订单
  const removeOrder = useCallback(
    (orderId: string, source: "network" | "tcp" | "all" = "all") => {
      if (source === "network" || source === "all") {
        setNetworkOrders((prev) => {
          const newOrders = prev.filter((order) => order.id !== orderId);
          // 保存更新后的网络订单列表
          OrderService.saveNetworkOrders(newOrders);
          return newOrders;
        });
      }

      if (source === "tcp" || source === "all") {
        setTcpOrders((prev) => {
          const newOrders = prev.filter((order) => order.id !== orderId);
          // 保存更新后的TCP订单列表
          OrderService.saveTCPOrders(newOrders);
          return newOrders;
        });
      }

      // 更新合并的订单列表
      setOrders((prev) => prev.filter((order) => order.id !== orderId));

      // 调用OrderService的移除方法
      OrderService.removeOrder(orderId);
    },
    []
  );

  // 刷新订单列表
  const refreshOrders = useCallback(async () => {
    try {
      setLoading(true);

      // 强制进行一次网络刷新
      if (networkStatus === "connected") {
        await OrderService.fetchOrdersFromNetwork(
          OrderService.getTimeRangeAroundNow()
        );
      }

      // 获取最新订单
      const savedNetworkOrders = await OrderService.loadNetworkOrders();
      const savedTcpOrders = await OrderService.loadTCPOrders();

      setNetworkOrders(savedNetworkOrders);
      setTcpOrders(savedTcpOrders);
      setOrders([...savedNetworkOrders, ...savedTcpOrders]);

      setLoading(false);
    } catch (error) {
      console.error("刷新订单失败:", error);
      setError("刷新订单失败");
      setLoading(false);
    }
  }, [networkStatus]);

  return (
    <OrderContext.Provider
      value={{
        orders,
        networkOrders,
        tcpOrders,
        loading,
        error,
        removeOrder,
        refreshOrders,
        isKDSMaster,
        networkStatus,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}
