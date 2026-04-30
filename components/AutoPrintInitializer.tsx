import React, { useEffect } from 'react';
import { OrderService } from '../services/orderService/OrderService';
import { useSettings } from '../contexts/SettingsContext';
import { printFormattedOrder } from '../services/orderPrinter';
import { FormattedOrder } from '../services/types';

/**
 * 自动打印初始化器
 * 这是一个无 UI 组件，用于全局监听新订单并执行自动打印逻辑
 */
export const AutoPrintInitializer: React.FC = () => {
  const { autoPrintNewOrders } = useSettings();

  useEffect(() => {
    console.log('[AutoPrintInitializer] 启动，当前自动打印设置:', autoPrintNewOrders);

    // 注册新订单/更新订单回调
    const unsubscribe = OrderService.setNewOrderCallback((order: FormattedOrder) => {
      if (autoPrintNewOrders) {
        console.log(`[AutoPrintInitializer] 收到新订单/更新订单 ${order.num}，准备自动打印...`);
        // 使用静默模式打印，避免弹出错误提示干扰用户
        printFormattedOrder(order, true).then(success => {
          if (success) {
            console.log(`[AutoPrintInitializer] 订单 #${order.num} 自动打印成功`);
          } else {
            console.warn(`[AutoPrintInitializer] 订单 #${order.num} 自动打印失败 (可能打印机未连接)`);
          }
        });
      }
    });

    return () => {
      console.log('[AutoPrintInitializer] 卸载');
      unsubscribe();
    };
  }, [autoPrintNewOrders]);

  // 此组件不渲染任何内容
  return null;
};

export default AutoPrintInitializer;
