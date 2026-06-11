// PreOrderContext — disabled, not currently in use
// import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
// import { FormattedOrder } from "../services/types";
// import { OrderService } from "../services/orderService/OrderService";
// import { getNextSevenDaysRange } from "../services/orderService/timeUtils";
//
// interface PreOrderContextType {
//   orders: FormattedOrder[];
//   loading: boolean;
//   error: string | null;
//   removeOrder: (orderId: string) => void;
// }
//
// const PreOrderContext = createContext<PreOrderContextType>({
//   orders: [],
//   loading: false,
//   error: null,
//   removeOrder: () => {},
// });
//
// export function PreOrderProvider({ children }: { children: React.ReactNode }) {
//   const [orders, setOrders] = useState<FormattedOrder[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//
//   const filterPreOrders = useCallback((allOrders: FormattedOrder[]): FormattedOrder[] => {
//     const timeRange = getNextSevenDaysRange();
//     const startTime = new Date(timeRange[0]).getTime();
//     const endTime = new Date(timeRange[1]).getTime();
//     return allOrders.filter(order => {
//       const orderTime = new Date(order.orderTime).getTime();
//       return orderTime >= startTime && orderTime <= endTime;
//     });
//   }, []);
//
//   useEffect(() => {
//     const unsubscribe = OrderService.setOrderUpdateCallback((allOrders) => {
//       const filteredPreOrders = filterPreOrders(allOrders);
//       setOrders(filteredPreOrders);
//     });
//     return () => { unsubscribe?.(); };
//   }, [filterPreOrders]);
//
//   const removeOrder = useCallback(async (orderId: string) => {
//     try {
//       await OrderService.removeOrder(orderId);
//       setOrders((prevOrders) => prevOrders.filter((order) => order.id !== orderId));
//     } catch (error) {
//       console.error("删除预订单失败:", error);
//     }
//   }, []);
//
//   const contextValue = useMemo(
//     () => ({ orders, loading, error, removeOrder }),
//     [orders, loading, error, removeOrder]
//   );
//
//   return (
//     <PreOrderContext.Provider value={contextValue}>
//       {children}
//     </PreOrderContext.Provider>
//   );
// }
//
// export function usePreOrders() {
//   return useContext(PreOrderContext);
// }

import React from "react";

// Stub provider so existing imports in _layout.tsx don't break
export function PreOrderProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function usePreOrders() {
  return { orders: [], loading: false, error: null, removeOrder: () => {} };
}
