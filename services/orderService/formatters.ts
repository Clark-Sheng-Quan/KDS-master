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
    console.log('[Time] Converting time, input:', utcTimeString);

    let utcDate: DateTime;
    const trimmedString = utcTimeString.trim();
    
    // Check if string contains timezone offset (e.g., "+0000", "-0800")
    const timezoneOffsetMatch = trimmedString.match(/^(.+)\s+([+-]\d{4})$/);
    
    if (timezoneOffsetMatch) {
      // Format: "2025-10-29 03:59:45 +0000"
      // Parse with timezone offset using ISO format
      const dateTimePart = timezoneOffsetMatch[1]; // "2025-10-29 03:59:45"
      const offsetPart = timezoneOffsetMatch[2];    // "+0000"
      
      console.log('[Time] Detected timezone offset:', offsetPart);
      
      // Convert to ISO format that Luxon can parse: "2025-10-29T03:59:45+00:00"
      const isoString = dateTimePart.replace(' ', 'T') + offsetPart.slice(0, 3) + ':' + offsetPart.slice(3);
      console.log('[Time] Converted to ISO format:', isoString);
      
      utcDate = DateTime.fromISO(isoString);
    } else {
      // Format: "2025-10-29 00:00:00" (no timezone offset, assume UTC)
      console.log('[Time] No timezone offset detected, parsing as UTC');
      utcDate = DateTime.fromFormat(trimmedString, 'yyyy-MM-dd HH:mm:ss', { zone: 'utc' });
    }

    if (!utcDate.isValid) {
      console.error('[Time] Time parsing failed:', utcDate.invalidExplanation);
      console.error('[Time] Attempted to parse:', trimmedString);
      return utcTimeString;
    }

    // Convert to Sydney time
    const sydneyDate = utcDate.setZone('Australia/Sydney');
    const formattedSydneyTime = sydneyDate.toFormat('yyyy-MM-dd HH:mm:ss');
    
    console.log('[Time] Final Sydney time:', formattedSydneyTime);
    return formattedSydneyTime;
  } catch (error) {
    console.error('[Time] Timezone conversion error:', error);
    return utcTimeString;
  }
};

/**
 * Format TCP order data
 */
export const formatTCPOrder = (orderData: any): FormattedOrder => {
  try {
    // Ensure order has ID
    const orderId = orderData.order_num || orderData.orderId || orderData._id || String(Date.now());
    
    // Extract and format order items
    const items = Array.isArray(orderData.products) ? orderData.products : [];
    
    const formattedOrder: FormattedOrder = {
      id: orderId,
      _id: orderId,
      orderTime: orderData.time || new Date().toISOString(),
      pickupMethod: orderData.pickupMethod || orderData.pick_method || "Unknown",
      pickupTime: orderData.pickupTime || orderData.pick_time || new Date().toISOString(),
      order_num: orderData.order_num?.toString() || orderId,
      products: items.map((item: any) => ({
        id: item.id || `tcp-item`,
        name: item.name || "Unknown Item",
        quantity: item.quantity || 1,
        price: item.price || 0,
        options: Array.isArray(item.options) ? item.options : [],
        category: item.category || "default", // Ensure category info is included
        prepare_time: item.prepare_time || 0, // Add prepare time
      })),
      source: 'tcp', // Mark source as TCP
      total_prepare_time: orderData.total_prepare_time || 0, // Add total prepare time
    };
    
    return formattedOrder;
  } catch (error) {
    console.error('[Format] Failed to format TCP order:', error);
    // Return basic order object
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
    // Format product items directly
    const formattedItems = order.products.map((product: any, index: number) => {
      // Process category, take first element from array
      let productCategory = "default";
      console.log("[Format] product.category is:", product.category);
      // Check product category info
      if (product.category.length > 0) {
        productCategory = product.category[0];
      }
      
      console.log("[Format] Product:", product.name, "Category:", productCategory);
      
      // Process options
      let options = [];
      if (Array.isArray(product.option)) {
        options = product.option.map((opt: any) => ({
          name: opt.name || 'Option' || '选项',
          value: String(opt.qty || 1),
          price: opt.price_adjust || 0
        }));
      }
      
      return {
        id: product._id || `item-${index}-${Date.now()}`,
        name: product.name || 'Unknown Item' || '未知商品',
        quantity: product.qty || 1,
        price: product.price || 0,
        options: options,
        category: productCategory, // Use determined category
        prepare_time: product.prepare_time || 0, // Keep prepare time field but don't display
      };
    });

    // Convert pickupTime to Sydney timezone
    const sydneyPickupTime = convertToSydneyTime(order.pick_time);
    const sydneyOrderTime = convertToSydneyTime(order.time);
    
    return {
      id: order.order_num.toString(),
      _id: order._id || order.order_num.toString(),
      orderTime: sydneyOrderTime, // Use converted Sydney time
      pickupMethod: order.pick_method,
      pickupTime: sydneyPickupTime, // Use converted Sydney time
      order_num: order.order_num.toString(),
      status: order.status, 
      products: formattedItems,
      source: order.source,
      total_prepare_time: order.total_prepare_time || 0, // Add total prepare time
    };
  } catch (error) {
    console.error('[Format] Failed to format network order:', error, order);
    
    // Return basic order object instead of throwing error
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
  
  console.log('[Format] Starting to format orders, raw data contains', ordersData.orders.length, 'orders');
  
  // Ensure we have orders array
  if (!ordersData || !ordersData.orders || !Array.isArray(ordersData.orders)) {
    console.warn('[Format] formatOrders: Invalid order data format', ordersData);
    return [];
  }
  
  for (const order of ordersData.orders) {
    try {
      // Use existing formatNetworkOrder method
      const formattedOrder = await formatNetworkOrder(order);
      formattedOrder.source = 'history'; // Mark source as history
      formattedOrders.push(formattedOrder);
    } catch (error) {
      console.error('[Format] Failed to format single order:', error);
      // Continue processing next order
    }
  }
  
  return formattedOrders;
}; 