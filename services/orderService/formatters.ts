/**
 * OrderService 格式化工具
 * 处理各种数据格式化逻辑
 */

import { DateTime } from 'luxon';
import { FormattedOrder } from '../types';

/**
 * 将 UTC 时间转换为悉尼时区时间
 */
export const convertToSydneyTime = (utcTimeString: string): string => {
  try {
    console.log('开始转换时间，输入:', utcTimeString);

    // 解析 UTC 时间
    const utcDate = DateTime.fromFormat(utcTimeString, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });

    if (!utcDate.isValid) {
      console.error('UTC时间解析失败:', utcDate.invalidExplanation);
      return utcTimeString;
    }

    // 转为悉尼时间
    const sydneyDate = utcDate.setZone('Australia/Sydney');
    const formattedSydneyTime = sydneyDate.toFormat('yyyy-MM-dd HH:mm:ss');
    
    console.log('最终格式化的悉尼时间:', formattedSydneyTime);
    return formattedSydneyTime;
  } catch (error) {
    console.error('时区转换错误:', error);
    return utcTimeString;
  }
};

/**
 * 格式化 TCP 订单数据
 */
export const formatTCPOrder = (orderData: any): FormattedOrder => {
  try {
    // 确保有订单ID
    const orderId = orderData.order_num || orderData.orderId || orderData._id || String(Date.now());
    
    // 提取并格式化订单项
    const items = Array.isArray(orderData.products) ? orderData.products : [];
    
    const formattedOrder: FormattedOrder = {
      id: orderId,
      _id: orderId,
      orderTime: orderData.time || new Date().toISOString(),
      pickupMethod: orderData.pickupMethod || orderData.pick_method || "未知",
      pickupTime: orderData.pickupTime || orderData.pick_time || new Date().toISOString(),
      order_num: orderData.order_num?.toString() || orderId,
      products: items.map((item: any) => ({
        id: item.id || `tcp-item`,
        name: item.name || "未知商品",
        quantity: item.quantity || 1,
        price: item.price || 0,
        options: Array.isArray(item.options) ? item.options : [],
        category: item.category || "default", // 确保包含分类信息
        prepare_time: item.prepare_time || 0, // 添加准备时间
      })),
      source: 'tcp', // 标记来源为TCP
      total_prepare_time: orderData.total_prepare_time || 0, // 添加总准备时间
    };
    
    return formattedOrder;
  } catch (error) {
    console.error('格式化TCP订单失败:', error);
    // 返回一个基本订单对象
    return {
      id: String(Date.now()),
      _id: String(Date.now()),
      orderTime:String(Date.now()),
      pickupMethod: "格式化错误",
      pickupTime: new Date().toISOString(),
      order_num: String(Date.now()),
      products: [],
      source: 'tcp',
      total_prepare_time: 0, // 添加总准备时间
    };
  }
};

/**
 * 格式化网络订单
 */
export const formatNetworkOrder = async (order: any): Promise<FormattedOrder> => {
  try {
    // 直接格式化产品项
    const formattedItems = order.products.map((product: any, index: number) => {
      // 处理category，取数组的第一个元素
      let productCategory = "default";
      console.log("product.category is ============ : ", product.category);
      // 检查产品分类信息
      if (product.category.length > 0) {
        productCategory = product.category[0];
      }
      
      console.log("产品:", product.name, "分类:", productCategory);
      
      // 处理选项
      let options = [];
      if (Array.isArray(product.option)) {
        options = product.option.map((opt: any) => ({
          name: opt.name || '选项',
          value: String(opt.qty || 1),
          price: opt.price_adjust || 0
        }));
      }
      
      return {
        id: product._id || `item-${index}-${Date.now()}`,
        name: product.name || '未知商品',
        quantity: product.qty || 1,
        price: product.price || 0,
        options: options,
        category: productCategory, // 使用确定的分类
        prepare_time: product.prepare_time || 0, // 保留准备时间字段，但不显示
      };
    });

    // 转换pickupTime为悉尼时区
    const sydneyPickupTime = convertToSydneyTime(order.pick_time);
    const sydneyOrderTime = convertToSydneyTime(order.time);
    
    return {
      id: order.order_num.toString(),
      _id: order._id || order.order_num.toString(),
      orderTime: sydneyOrderTime, // 使用转换后的悉尼时间
      pickupMethod: order.pick_method,
      pickupTime: sydneyPickupTime, // 使用转换后的悉尼时间
      order_num: order.order_num.toString(),
      status: order.status, 
      products: formattedItems,
      source: order.source,
      total_prepare_time: order.total_prepare_time || 0, // 添加总准备时间
    };
  } catch (error) {
    console.error('格式化网络订单失败:', error, order);
    
    // 返回基本订单对象而不是抛出错误
    return {
      id: (order.order_num || Date.now()).toString(),
      _id: order._id || (order.order_num || Date.now()).toString(),
      orderTime: order.time || new Date().toISOString(),
      pickupMethod: order.pick_method || '未知',
      pickupTime: order.pick_time || new Date().toISOString(),
      order_num: (order.order_num || Date.now()).toString(),
      status: order.status || '未知',
      products: [],
      source: 'network',
      total_prepare_time: 0, // 添加总准备时间
    };
  }
};

/**
 * 格式化多个订单
 */
export const formatOrders = async (ordersData: any): Promise<FormattedOrder[]> => {
  const formattedOrders: FormattedOrder[] = [];
  
  console.log('开始格式化订单，原始数据包含', ordersData.orders.length, '个订单');
  
  // 确保我们有订单数组
  if (!ordersData || !ordersData.orders || !Array.isArray(ordersData.orders)) {
    console.warn('formatOrders: 无效的订单数据格式', ordersData);
    return [];
  }
  
  for (const order of ordersData.orders) {
    try {
      // 使用已有的formatNetworkOrder方法
      const formattedOrder = await formatNetworkOrder(order);
      formattedOrder.source = 'history'; // 标记来源为历史
      formattedOrders.push(formattedOrder);
    } catch (error) {
      console.error('格式化单个订单失败:', error);
      // 继续处理下一个订单
    }
  }
  
  return formattedOrders;
}; 