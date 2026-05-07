import { NativeModules } from 'react-native';
import { FormattedOrder } from './types';

const { Printer_K1215 } = NativeModules;

/**
 * 触发打印机蜂鸣
 * @param count   鸣叫次数 1-9，默认 3
 * @param duration 每次时长（单位 100ms）1-9，默认 2 = 200ms
 */
export const beepPrinter = async (count = 3, duration = 2): Promise<boolean> => {
  try {
    const ready = await checkPrinter();
    if (!ready) return false;
    return await Printer_K1215.beep(count, duration);
  } catch (error) {
    console.error('[Printer] beep 失败:', error);
    return false;
  }
};

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

    // 格式化订单数据为打印机需要的格式 - 匹配Java模板的完整字段
    const printData = {
      // 基本信息
      shopName: "KDS Restaurant",
      orderId: order.num,
      orderTime: order.pickupTime || new Date().toLocaleString(),
      method: order.pickupMethod || "取餐",
      tableNumber: order.tableNumber || null,
      
      // 订单备注
      notes: order.notes || "",
      
      // 商品列表 - 带完整的 itemState、options、notes、suffix 等
      items: order.products ? order.products.map((product: any) => ({
        // 基本信息
        id: product.id || "unknown",
        name: product.name || "未知商品",
        price: product.price || 0,
        quantity: product.quantity || 1,
        
        // VOIDED 状态
        itemState: product.itemState || "PROCESSED",
        
        // 选项/加菜信息
        options: product.options || [],
        
        // 准备时间
        prepare_time: product.prepare_time || 0,
        
        // 分类
        category: product.category || "default",
        
        // Item-level notes 和 suffix
        notes: product.notes || "",
        suffix: product.suffix || [],
      })) : []
    };

    console.log(`[PrintOrder] 发送打印数据:`, JSON.stringify(printData, null, 2));

    // 发送打印命令
    const result = await Printer_K1215.printOrder(printData);
    console.log(`[PrintOrder] 订单 #${order.num} 打印结果:`, result);
    if (result) beepPrinter().catch(() => {});
    return result;
  } catch (error) {
    if (!silentMode) {
      console.error('[PrintOrder] 打印订单失败:', error);
    }
    return false;
  }
};

// 打印单个商品（一品一切模式）
export const printSingleItem = async (order: FormattedOrder, item: any, silentMode: boolean = false) => {
  try {
    // 先检查打印机状态
    const ready = await checkPrinter();
    if (!ready) {
      if (!silentMode) {
        console.error('打印机未就绪');
      }
      return false;
    }

    // 格式化单个 item 为打印机需要的格式
    const printData = {
      // 基本信息
      shopName: "KDS Restaurant",
      orderId: order.num,
      orderTime: order.pickupTime || new Date().toLocaleString(),
      method: order.pickupMethod || "取餐",
      tableNumber: order.tableNumber || null,
      
      // 订单备注
      notes: order.notes || "",
      
      // 单个商品
      items: [{
        id: item.id || "unknown",
        name: item.name || "未知商品",
        price: item.price || 0,
        quantity: item.quantity || 1,
        
        // VOIDED 状态
        itemState: item.itemState || "PROCESSED",
        
        // 选项/加菜信息
        options: item.options || [],
        
        // 准备时间
        prepare_time: item.prepare_time || 0,
        
        // 分类
        category: item.category || "default",
        
        // Item-level notes 和 suffix
        notes: item.notes || "",
        suffix: item.suffix || [],
      }]
    };

    console.log(`[PrintOrder] 单品打印数据:`, JSON.stringify(printData, null, 2));

    // 发送打印命令
    const result = await Printer_K1215.printOrder(printData);
    console.log(`[PrintOrder] 单品打印结果:`, result);
    if (result) beepPrinter().catch(() => {});
    return result;
  } catch (error) {
    if (!silentMode) {
      console.error('[PrintOrder] 单品打印失败:', error);
    }
    return false;
  }
};