import { NativeModules } from 'react-native';
import { FormattedOrder } from './types';

const { Printer_K1215 } = NativeModules;

// 检查打印机连接
export const checkPrinter = async () => {
  try {
    const connected = await Printer_K1215.isConnected();
    if (!connected) {
      console.log('正在重新连接打印机...');
      await Printer_K1215.reconnectPrinter();
    }
    return await Printer_K1215.isConnected();
  } catch (error) {
    console.error('打印机连接检查失败:', error);
    return false;
  }
};

// 打印订单
export const printOrder = async (order: any) => {
  try {
    // 先检查打印机状态
    const ready = await checkPrinter();
    if (!ready) {
      console.error('打印机未就绪');
      return false;
    }

    // 发送打印命令
    const result = await Printer_K1215.printOrder(order);
    console.log('打印结果:', result);
    return result;
  } catch (error) {
    console.error('打印订单失败:', error);
    return false;
  }
};

// 打印格式化的订单
export const printFormattedOrder = async (order: FormattedOrder, silentMode: boolean = false) => {
  try {
    // 先检查打印机状态
    const ready = await checkPrinter();
    if (!ready) {
      if (!silentMode) {
        console.error('打印机未就绪');
      }
      return false;
    }

    // 格式化订单数据为打印机需要的格式
    const printData = {
      shopName: "KDS Restaurant",
      orderId: order.num,
      orderTime: order.pickupTime || new Date().toLocaleString(),
      pickupMethod: order.pickupMethod || "取餐",
      tableNumber: order.tableNumber || null,
      items: order.products ? order.products.map((product: any) => ({
        name: product.name || "未知商品",
        price: product.price || 0,
        quantity: product.quantity || 1,
        options: product.options || []
      })) : []
    };

    // 发送打印命令
    const result = await Printer_K1215.printOrder(printData);
    console.log(`[PrintOrder] 订单 #${order.num} 打印结果:`, result);
    return result;
  } catch (error) {
    if (!silentMode) {
      console.error('[PrintOrder] 打印订单失败:', error);
    }
    return false;
  }
};