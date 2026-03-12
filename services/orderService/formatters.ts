/**
 * OrderService 格式化工具
 * 处理各种数据格式化逻辑
 */

import { DateTime } from 'luxon';
import { FormattedOrder } from '../types';
import { convertToLocalTime } from './timeConfig';

/**
 * 将 UTC 时间转换为本地时区时间（向后兼容包装器）
 */
export const convertToLocalTimeFormatted = (utcTimeString: string): string => {
  return convertToLocalTime(utcTimeString);
};

/**
 * Format TCP order data
 */
export const formatTCPOrder = (orderData: any): FormattedOrder => {
  try {

    // Extract order ID from POS format
    const orderId = orderData.id || String(Date.now());
    
    // Extract and format order items from POS format (orderitems array)
    const items = Array.isArray(orderData.orderitems) ? orderData.orderitems : [];
    
    const formattedItems = items.map((item: any, index: number) => {
        // POS format: { product: { name, category, options, ... }, qty, itemState }
        const product = item.product || {};
        const itemState = item.itemState || 'PROCESSED'; // Track item state
        
        // Process category - POS sends as array
        let productCategory = "default";
        if (Array.isArray(product.category) && product.category.length > 0) {
          productCategory = product.category[0];
        } else if (typeof product.category === 'string') {
          productCategory = product.category;
        }
  
        // Process product options (POS format)
        // Include ALL available options, not just selected ones (qty = 0 means not yet selected)
        let options: any[] = [];
        const optionsArray = product.options || [];
        
        if (Array.isArray(optionsArray)) {
          options = optionsArray.map((optionGroup: any) => {
            const optionItems = optionGroup.option_items || [];
            return {
              name: optionGroup.name || 'Option Group',
              items: optionItems.map((opt: any) => ({
                name: opt.name || 'Option',
                price_adjust: opt.price_adjust || 0
              }))
            };
          });
        }
        
        return {
          id: item.id || `item-${index}-${Date.now()}`,
          name: product.name || 'Unknown Item',
          quantity: item.qty || 1,
          price: product.price || 0,
          options: options || [], // Ensure options is always an array
          category: productCategory,
          prepare_time: product.prepare_time || 0,
          itemState: itemState, // Include item state (PROCESSED or VOIDED)
        };
      });
    
    // Calculate total prepare time from all items
    const totalPrepareTimeFromItems = formattedItems.reduce((sum: number, item: any) => {
      return sum + (item.prepare_time || 0);
    }, 0);
    
    // Convert times to local timezone
    // 注意：POS 发送的 timestamp 已经是本地时间格式，直接提取 HH:mm
    let localOrderTime = orderData.timestamp || orderData.createdAt || new Date().toISOString();
    
    // 只保留 HH:mm 格式（和 network order 一致）
    try {
      // 尝试解析 POS 格式: "Oct 30, 2025 10:44:43 PM"
      const dt = DateTime.fromFormat(localOrderTime, 'MMM d, yyyy h:mm:ss a', { locale: 'en-US' });
      if (dt.isValid) {
        localOrderTime = dt.toFormat('HH:mm');
      } else {
        // 用正则简单提取 HH:mm
        const match = localOrderTime.match(/(\d{1,2}):(\d{2})/);
        if (match) {
          localOrderTime = `${String(parseInt(match[1])).padStart(2, '0')}:${match[2]}`;
        }
      }
    } catch (e) {
      // 如果出错，用正则提取
      const match = localOrderTime.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        localOrderTime = `${String(parseInt(match[1])).padStart(2, '0')}:${match[2]}`;
      }
    }

    // Extract pickup method from POS format - ensure it's a string, not an object
    let pickupMethod = "DINEIN";
    if (typeof orderData.ordermode === 'string' && orderData.ordermode) {
      pickupMethod = orderData.ordermode;
    } else if (typeof orderData.PickMethod === 'string' && orderData.PickMethod) {
      pickupMethod = orderData.PickMethod;
    }
    
    // Extract order number - ensure it's a string, not an object
    let orderNumber = orderId;
    if (typeof orderData.orderNumber === 'string' && orderData.orderNumber) {
      orderNumber = orderData.orderNumber;
    } else if (typeof orderData.orderNumber === 'number') {
      orderNumber = String(orderData.orderNumber);
    }
    
    // Extract total prepare time - ensure it's a number, not an object
    let totalPrepareTime = totalPrepareTimeFromItems;
    if (typeof orderData.total_prepare_time === 'number') {
      totalPrepareTime = orderData.total_prepare_time;
    } else if (typeof orderData.total_prepare_time === 'string') {
      const parsed = parseInt(orderData.total_prepare_time, 10);
      totalPrepareTime = isNaN(parsed) ? totalPrepareTimeFromItems : parsed;
    }
    
    // Extract table number - ensure it's a string, not an object
    let tableNumber = '';
    if (typeof orderData.tableNumber === 'string' && orderData.tableNumber) {
      tableNumber = orderData.tableNumber;
    } else if (typeof orderData.tableNumber === 'number') {
      tableNumber = String(orderData.tableNumber);
    }
    
    const formattedOrder: FormattedOrder = {
      id: orderId,
      _id: orderData.id || orderId,
      orderTime: localOrderTime,
      pickupMethod: pickupMethod,
      pickupTime: localOrderTime, // POS doesn't have separate pickup time, use order time
      kdsReceiveTime: new Date().toISOString(), // 记录订单进入 KDS 的时间
      num: orderNumber,              // 订单号 (用于显示)
      status: orderData.status,
      products: formattedItems,
      source: 'tcp', // Mark source as TCP
      total_prepare_time: totalPrepareTime,
      tableNumber: tableNumber, // Add table number
    };
    
    
    return formattedOrder;
  } catch (error) {
    console.error('[Format] Failed to format POS TCP order:', error, orderData);
    // Return basic order object
    return {
      id: String(Date.now()),
      _id: String(Date.now()),
      orderTime: new Date().toISOString(),
      pickupMethod: "n/a",
      pickupTime: new Date().toISOString(),
      kdsReceiveTime: new Date().toISOString(), 
      num: orderData.id || String(Date.now()),  // 订单号
      products: [],
      source: 'tcp',
      total_prepare_time: 0,
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
      // Check product category info
      if (product.category.length > 0) {
        productCategory = product.category[0];
      }
      
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

    // Convert pickupTime to local timezone
    const localPickupTime = convertToLocalTimeFormatted(order.pick_time);
    const localOrderTime = convertToLocalTimeFormatted(order.time);
    
    return {
      id: order._id.toString(),
      _id: order._id || order._id.toString(),
      orderTime: localOrderTime, // Use converted local time
      pickupMethod: order.pick_method,
      pickupTime: localPickupTime, // Use converted local time
      kdsReceiveTime: new Date().toISOString(), // 记录订单进入 KDS 的时间
      num: order.order_num.toString(),     // 订单号 (用于显示)
      status: order.status, 
      products: formattedItems,
      source: order.source,
      total_prepare_time: order.total_prepare_time || 0, // Add total prepare time
      tableNumber: order.tableNumber || '', // Add table number
    };
  } catch (error) {
    console.error('[Format] Failed to format network order:', error, order);
    
    // Return basic order object instead of throwing error
    return {
      id: (order._id || Date.now()).toString(),
      _id: order._id || (order.order_num || Date.now()).toString(),
      orderTime: order.time || new Date().toISOString(),
      pickupMethod: order.pick_method || 'unknown',
      pickupTime: order.pick_time || new Date().toISOString(),
      num: (order._id || Date.now()).toString(),    // 订单号
      status: order.status || 'unknown',
      products: [],
      kdsReceiveTime: new Date().toISOString(), 
      source: 'network',
      total_prepare_time: 0,
      tableNumber: 'n/a',
    };
  }
};

/**
 * 格式化多个订单 History orders
 */
export const formatOrders = async (ordersData: any): Promise<FormattedOrder[]> => {
  const formattedOrders: FormattedOrder[] = [];
  
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
      console.error('[Format] 格式化单条订单失败:', {
        orderId: order?.order_id,
        error: error
      });
      // Continue processing next order
    }
  }
  
  return formattedOrders;
}; 