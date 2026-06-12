/**
 * OrderService 格式化工具
 * 处理各种数据格式化逻辑
 */

import { DateTime } from 'luxon';
import { FormattedOrder } from '../types';
import { convertToLocalTime } from './timeConfig';
import { getTableNumber, getTableSessionId } from './networkService';

/**
 * 将 UTC 时间转换为本地时区时间（向后兼容包装器）
 */
export const convertToLocalTimeFormatted = (utcTimeString: string): string => {
  return convertToLocalTime(utcTimeString);
};

/**
 * Format TCP order data
 */
export const formatTCPOrder = async (orderData: any): Promise<FormattedOrder> => {
  try {
    const buildTCPItemName = (item: any, product: any): string => {
      const baseName = product.name || 'Unknown Item';
      const normalizedBaseName = String(baseName).trimEnd();
      const suffixCandidates = [item?.suffix, product?.suffix];

      for (const suffixArray of suffixCandidates) {
        if (Array.isArray(suffixArray)) {
          const visibleSuffix = suffixArray
            .filter((s: any) => s?.is_visible === true && typeof s?.name === 'string')
            .map((s: any) => s.name)
            .join('');

          if (visibleSuffix) {
            return `${normalizedBaseName} ${visibleSuffix}`;
          }
        }
      }

      return normalizedBaseName;
    };

    const parseTCPOrderTime = (rawTime: string): string => {
      // POS common format: "Oct 30, 2025 10:44:43 PM"
      const posDate = DateTime.fromFormat(rawTime, 'MMM d, yyyy h:mm:ss a', { locale: 'en-US' });
      if (posDate.isValid) {
        return posDate.toFormat('yyyy-MM-dd HH:mm:ss');
      }

      // If it already looks like a standard datetime/ISO, keep it parseable by Date
      const isoDate = DateTime.fromISO(rawTime);
      if (isoDate.isValid) {
        return isoDate.toFormat('yyyy-MM-dd HH:mm:ss');
      }

      // Fallback: extract HH:mm and attach today's date so UI can always derive day/month
      const match = rawTime.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        const hh = String(parseInt(match[1], 10)).padStart(2, '0');
        const mm = match[2];
        return `${DateTime.local().toFormat('yyyy-MM-dd')} ${hh}:${mm}:00`;
      }

      return rawTime;
    };

    // Extract order ID from POS format
    const orderId = orderData.id || String(Date.now());

    // Extract and format order items from POS format (orderitems array)
    const items = Array.isArray(orderData.orderitems) ? orderData.orderitems : [];

    const formattedItems = items.map((item: any, index: number) => {
      // POS format: { product: { name, category, options, ... }, qty, itemState, orderItems }
      const product = item.product || {};
      const itemState = item.itemState || 'PROCESSED';

      // POS category can be array or string
      let productCategory = 'default';
      if (Array.isArray(product.category) && product.category.length > 0) {
        productCategory = product.category[0];
      } else if (typeof product.category === 'string') {
        productCategory = product.category;
      }

      // orderItems contains the selected options/preferences
      let options: any[] = [];
      const orderItemsArray = item.orderItems;
      if (Array.isArray(orderItemsArray)) {
        options = orderItemsArray.map((orderItem: any) => ({
          name: orderItem.optionItem?.name,
          value: String(orderItem.qty),
        }));
      }

      return {
        id: item.id || `item-${index}-${Date.now()}`,
        name: buildTCPItemName(item, product),
        quantity: item.qty || 1,
        price: product.price || 0,
        options,
        category: productCategory,
        itemState,
        isValidKds: item.isValidKds,
        notes: item.Notes || '',  // Item-level notes from POS
        suffix: product.suffix || [],  // Suffix array from product
      };
    });


    const rawOrderTime = String(orderData.timestamp || orderData.createdAt || new Date().toISOString());
    let localOrderTime = rawOrderTime;

    try {
      localOrderTime = parseTCPOrderTime(rawOrderTime);
    } catch (e) {
      localOrderTime = rawOrderTime;
    }

    // Extract pickup method from POS format
    let pickupMethod = 'DINEIN';
    if (typeof orderData.ordermode === 'string' && orderData.ordermode) {
      pickupMethod = orderData.ordermode;
    } else if (typeof orderData.PickMethod === 'string' && orderData.PickMethod) {
      pickupMethod = orderData.PickMethod;
    }

    const finalOrderNum = (
      typeof orderData.orderNumber === 'string' && orderData.orderNumber
        ? orderData.orderNumber
        : typeof orderData.orderNumber === 'number'
        ? String(orderData.orderNumber)
        : orderId.slice(-4)
    );

    const orderNotes =
      typeof orderData.notes === 'string'
        ? orderData.notes.trim()
        : '';

    let tableNumber = '';
    if (typeof orderData.tableNumber === 'string' && orderData.tableNumber) {
      tableNumber = orderData.tableNumber;
    } else if (typeof orderData.tableNumber === 'number') {
      tableNumber = String(orderData.tableNumber);
    }

    const rawTableId = orderData.tableID || orderData.table_id || orderData.tableId;
    let tableSessionId: string | undefined;
    if (rawTableId) tableSessionId = (await getTableSessionId(rawTableId)) ?? undefined;
    
    const formattedOrder: FormattedOrder = {
      id: orderId,
      _id: orderData.id || orderId,
      orderTime: localOrderTime,
      pickupMethod,
      kdsReceiveTime: new Date().toISOString(),
      num: finalOrderNum,
      status: orderData.status,
      products: formattedItems,
      source: 'tcp',
      notes: orderNotes,
      tableNumber,
      ...(rawTableId && { tableId: rawTableId }),
      ...(tableSessionId && { tableSessionId }),
      // 保留原始的 kdsReceiveTime（如果存在），用于被召回的订单
      ...(orderData.originalKdsReceiveTime && { originalKdsReceiveTime: orderData.originalKdsReceiveTime }),
    };

    return formattedOrder;
  } catch (error) {
    console.error('[Format] Failed to format POS TCP order:', error, orderData);
    const fallbackId = String(Date.now());

    return {
      id: fallbackId,
      _id: fallbackId,
      orderTime: new Date().toISOString(),
      pickupMethod: 'n/a',
      kdsReceiveTime: new Date().toISOString(),
      num: (orderData.orderNumber || fallbackId).toString().slice(-4),
      products: [],
      source: 'tcp',
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
      };
    });

    const localOrderTime = convertToLocalTimeFormatted(order.time);

    const orderNum = order.order_num 
      ? order.order_num.toString() 
      : order._id.toString().slice(-4);

    const orderNotes =
      typeof order.notes === 'string'
        ? order.notes.trim()
        : '';
    
    // 获取桌号信息
    let tableNumber = order.tableNumber || '';
    let tableSessionId: string | undefined;
    if (order.table_id) {
      try {
        const fetchedTableNumber = await getTableNumber(order.table_id);
        if (fetchedTableNumber) tableNumber = fetchedTableNumber;
        const fetchedSessionId = await getTableSessionId(order.table_id);
        if (fetchedSessionId) tableSessionId = fetchedSessionId;
      } catch (err) {
        console.error(`[Format] 获取桌号信息失败 for order ${orderNum}:`, err);
      }
    }
    
    return {
      id: order._id.toString(),
      _id: order._id || order._id.toString(),
      orderTime: localOrderTime,
      pickupMethod: order.pick_method,
      kdsReceiveTime: new Date().toISOString(),
      num: orderNum,
      status: order.status,
      products: formattedItems,
      source: order.source,
      notes: orderNotes,
      tableNumber,
      ...(order.table_id && { tableId: order.table_id }),
      ...(tableSessionId && { tableSessionId }),
      // 保留原始的 kdsReceiveTime（如果存在），用于被召回的订单
      ...(order.originalKdsReceiveTime && { originalKdsReceiveTime: order.originalKdsReceiveTime }),
    };
  } catch (error) {
    console.error('[Format] Failed to format network order:', error, order);
    
    // Return basic order object instead of throwing error
    const fallbackId = (order._id || Date.now()).toString();
    return {
      id: fallbackId,
      _id: order._id || (order.order_num || Date.now()).toString(),
      orderTime: order.time || new Date().toISOString(),
      pickupMethod: order.pick_method || 'unknown',
      num: (order.order_num ? order.order_num.toString() : fallbackId.slice(-4)),    // 订单号
      status: order.status || 'unknown',
      products: [],
      kdsReceiveTime: new Date().toISOString(), 
      source: 'network',
      notes: typeof order.notes === 'string' ? order.notes.trim() : '',
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