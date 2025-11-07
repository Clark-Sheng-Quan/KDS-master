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
    let utcDate: DateTime;
    const trimmedString = utcTimeString.trim();
    
    // Try to parse as ISO format first (most common, fastest)
    utcDate = DateTime.fromISO(trimmedString, { zone: 'utc' });
    if (utcDate.isValid) {
      
      const sydneyDate = utcDate.setZone('Australia/Sydney');
      const formattedSydneyTime = sydneyDate.toFormat('yyyy-MM-dd HH:mm:ss');
      
      return formattedSydneyTime;
    }
    
    // Check if string contains timezone offset (e.g., "+0000", "-0800")
    const timezoneOffsetMatch = trimmedString.match(/^(.+)\s+([+-]\d{4})$/);
    
    if (timezoneOffsetMatch) {
      // Format: "2025-10-29 03:59:45 +0000"
      // Parse with timezone offset using ISO format
      const dateTimePart = timezoneOffsetMatch[1]; // "2025-10-29 03:59:45"
      const offsetPart = timezoneOffsetMatch[2];    // "+0000"
      
      
      // Convert to ISO format that Luxon can parse: "2025-10-29T03:59:45+00:00"
      const isoString = dateTimePart.replace(' ', 'T') + offsetPart.slice(0, 3) + ':' + offsetPart.slice(3);
      
      utcDate = DateTime.fromISO(isoString);
    } else if (trimmedString.match(/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)$/i)) {
      // POS Format: "Oct 30, 2025 10:44:43 PM" or "Oct 30, 2025 3:21:07 PM"
      // Use 'h' for 1-12 hour format (without leading zero) instead of 'hh'
      utcDate = DateTime.fromFormat(trimmedString, 'MMM d, yyyy h:mm:ss a', { zone: 'utc', locale: 'en-US' });
    } else {
      // Format: "2025-10-29 00:00:00" (no timezone offset, assume UTC)
      
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
    
    // Convert times to Sydney timezone
    const sydneyOrderTime = convertToSydneyTime(
      orderData.timestamp || orderData.createdAt || new Date().toISOString()
    );
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
      orderTime: sydneyOrderTime,
      pickupMethod: pickupMethod,
      pickupTime: sydneyOrderTime, // POS doesn't have separate pickup time, use order time
      num: orderNumber,              // 订单号 (用于显示)
      status: orderData.status || 'IN_PROGRESS',
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
      pickupMethod: "formatting_error",
      pickupTime: new Date().toISOString(),
      num: String(Date.now()),  // 订单号
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

    // Convert pickupTime to Sydney timezone
    const sydneyPickupTime = convertToSydneyTime(order.pick_time);
    const sydneyOrderTime = convertToSydneyTime(order.time);
    
    return {
      id: order._id.toString(),
      _id: order._id || order._id.toString(),
      orderTime: sydneyOrderTime, // Use converted Sydney time
      pickupMethod: order.pick_method,
      pickupTime: sydneyPickupTime, // Use converted Sydney time
      num: order.order_num.toString(),     // 订单号 (用于显示)
      status: order.status, 
      products: formattedItems,
      source: order.source,
      total_prepare_time: order.total_prepare_time || 0, // Add total prepare time
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
      num: (order.order_num || Date.now()).toString(),    // 订单号
      status: order.status || 'unknown',
      products: [],
      source: 'network',
      total_prepare_time: 0,
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
      console.error('[Format] Failed to format single order:', error);
      // Continue processing next order
    }
  }
  
  return formattedOrders;
}; 