import React, { useEffect } from 'react';
import { OrderService } from '../services/orderService/OrderService';
import { useSettings } from '../contexts/SettingsContext';
import { printFormattedOrder, printSingleItem } from '../services/orderPrinter';
import { FormattedOrder } from '../services/types';

/**
 * 自动打印初始化器
 * 这是一个无 UI 组件，用于全局监听新订单并执行自动打印逻辑
 */
export const AutoPrintInitializer: React.FC = () => {
  const { autoPrintNewOrders, printMode, categoryActiveMapping } = useSettings();

  useEffect(() => {
    console.log('[AutoPrintInitializer] 启动，当前自动打印设置:', autoPrintNewOrders, '打印模式:', printMode);

    OrderService.setPrintMode(printMode);

    const isProductActive = (product: any): boolean =>
      !(product.category && categoryActiveMapping[product.category] === false);

    const unsubscribeNewProduct = OrderService.setNewProductCallback((order: FormattedOrder, product: any) => {
      if (!autoPrintNewOrders || printMode !== 'single_item') return;
      if (order.isRecalled) return;
      if (!isProductActive(product)) return;

      console.log(`[AutoPrintInitializer] 收到新产品，订单 ${order.num}，产品 ${product.id}，准备单品打印...`);
      printSingleItem(order, product, true).then(success => {
        if (success) {
          console.log(`[AutoPrintInitializer] 订单 #${order.num} 产品 ${product.id} 单品打印成功`);
        } else {
          console.warn(`[AutoPrintInitializer] 订单 #${order.num} 产品 ${product.id} 单品打印失败`);
        }
      });
    });

    const unsubscribeNewOrder = OrderService.setNewOrderCallback((order: FormattedOrder) => {
      if (!autoPrintNewOrders || printMode !== 'single_order') return;
      if (order.isRecalled) return;

      const printableProducts = (order.products || []).filter(isProductActive);
      if (printableProducts.length === 0) return;

      const printableOrder = { ...order, products: printableProducts };
      console.log(`[AutoPrintInitializer] 收到新订单/更新订单 ${order.num}，准备完整订单打印...`);
      printFormattedOrder(printableOrder, true).then(success => {
        if (success) {
          console.log(`[AutoPrintInitializer] 订单 #${order.num} 完整订单打印成功`);
        } else {
          console.warn(`[AutoPrintInitializer] 订单 #${order.num} 完整订单打印失败`);
        }
      });
    });

    return () => {
      console.log('[AutoPrintInitializer] 卸载');
      unsubscribeNewProduct();
      unsubscribeNewOrder();
    };
  }, [autoPrintNewOrders, printMode, categoryActiveMapping]);

  // 此组件不渲染任何内容
  return null;
};

export default AutoPrintInitializer;
