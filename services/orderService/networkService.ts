/**
 * OrderService 网络通信模块
 * 处理与服务器之间的 API 通信
 */

import * as Network from 'expo-network';
import { getToken, auth } from '../../utils/auth';
import { API_BASE_URL } from './constants';
import { ProductDetailResponse, FormattedOrder } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 获取设备 IP 地址
 */
export const getDeviceIP = async (): Promise<string> => {
  try {
    // 使用expo-network获取IP
    const ip = await Network.getIpAddressAsync();
    return ip || "unknown";
  } catch (error) {
    console.error("获取IP地址失败:", error);
    return "unknown";
  }
}

/**
 * 带超时的 fetch 包装函数
 */
const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs: number = 15000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时（${timeoutMs}ms）`);
    }
    throw error;
  }
};

/**
 * 带重试的网络请求
 */
const fetchWithRetry = async (
  url: string,
  options: any,
  maxRetries: number = 2
): Promise<Response> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, 15000);
      return response;
    } catch (error: any) {
      lastError = error;
      console.warn(`[重试 ${attempt + 1}/${maxRetries + 1}] 请求失败: ${error.message}`);
      
      if (attempt < maxRetries) {
        // 指数退避：第一次等 500ms，第二次等 1000ms
        const backoffMs = 500 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw lastError;
};

/**
 * 从服务器获取产品详情
 */
export const getProductDetail = async (productId: string): Promise<ProductDetailResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/product/detail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ product_id: productId })
    });

    if (!response.ok) {
      throw new Error(`HTTP错误! 状态: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取产品详情失败:', error);
    throw error;
  }
};


/**
 * 根据 table_id 获取 table number
 */
export const getTableNumber = async (tableId: string): Promise<string> => {
  try {
    const response = await fetch(`${API_BASE_URL}/search/table_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {
          _id: tableId
        },
        detail: true,
        page_size: 0,
        page_idx: 0,
        ignore_pagination: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[networkService] table_number_search: ${tableId} =>`, JSON.stringify(data));
    if (data.tables && data.tables.length > 0) {
      return String(data.tables[0].table_number || "");
    }
    return "";
  } catch (error) {
    console.error(`table ${tableId} Error:`, error);
    return "";
  }
};


/**
 * 根据 table_id 获取当前桌台 session ID（/order/get_table_order）
 * 只查询未结账（isPaid: false）的 active session
 */
export const getTableSessionId = async (tableId: string): Promise<string | null> => {
  try {
    const response = await fetchWithRetry(`${API_BASE_URL}/order/get_table_order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_id: tableId, isPaid: false }),
    })
    if (!response.ok) return null;
    const data = await response.json();
    const session = data?.table_order ?? data?.tableOrder ?? (Array.isArray(data?.table_orders) ? data.table_orders[0] : null) ?? data;
    const result = session?._id ? String(session._id) : null;
    console.log(`[getTableSessionId] resolved sessionId=${result}`);
    return result;
  } catch (error) {
    console.error(`[getTableSessionId] failed for ${tableId}:`, error);
    return null;
  }
};

export const getTableIdByOrderId = async (orderId: string): Promise<string | null> => {
  try {
    const token = await getToken();
    const response = await fetchWithRetry(`${API_BASE_URL}/search/table_order_search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        query: {
          order_ids: orderId,
          status: "active"
        },
        detail: true,
        page_size: 0,
        page_idx: 0,
        ignore_pagination: true
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    console.log(`[networkService] table_order_search: ${orderId} =>`, JSON.stringify(data));
    if (data.table_orders && data.table_orders.length > 0) {
      const foundTableId = data.table_orders[0].table_id || null;
      return foundTableId;
    }
    return null;
  } catch (error) {
    console.error(`获取 order ${orderId} 的 table_id 失败:`, error);
    return null;
  }
};

export const fetchOrdersFromNetwork = async (
  timeRange: [string, string],
  onNewOrder: (order: FormattedOrder) => Promise<void>
) => {
  const requestId = Date.now().toString().slice(-6); // 生成简短请求ID用于日志跟踪
  
  try {
    // 获取token
    const token = await getToken();
    if (!token) {
      console.error(`[请求${requestId}] 无法获取访问令牌，请先登录`);
      return [];
    }
    
    // 获取选中的店铺ID
    const selectedShopId = await AsyncStorage.getItem('selectedShopId');
    if (!selectedShopId) {
      console.error(`[请求${requestId}] 未选择店铺，请先选择店铺`);
      return [];
    }
    
    // 准备请求体
    const requestBody = {
      token: token,
      query: {
        time: timeRange,
        shop_id: selectedShopId // 添加店铺ID过滤
      },
      detail: true,
      page_size: 10000,
      page_idx: 0
    };
    
    // 发送请求（带超时和重试）
    const response = await fetchWithRetry(`${API_BASE_URL}/search/order_search_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      console.error(`[请求${requestId}] HTTP错误: ${response.status}`);
      return [];
    }
    
    const result = await response.json();

    if (result.status_code === 401) {
      console.warn(`[请求${requestId}] Token 过期，尝试静默刷新...`);
      await auth.silentRefresh();
      // 不管成功与否都返回空，下一个轮询周期会用新 token 重试
      // 网络断开时 silentRefresh 会失败，但不应该登出
      return [];
    }

    // Check returned order data
    if (result && result.orders && Array.isArray(result.orders)) {
      console.log(`[networkService] 30s Fetched ${result.orders.length} orders from API`);

      // 并行处理获取 table_id
      const patchTasks = result.orders.map(async (order: any) => {
        if (!order.table_id && order._id) {
          try {
            const tableId = await getTableIdByOrderId(order._id);
            if (tableId) {
              order.table_id = tableId;
            }
          } catch (e) {
            console.warn(`Failed to patch table_id for ${order._id}:`, e);
          }
        }
      });
      await Promise.all(patchTasks);

      for (const order of result.orders) {
        console.log(`[networkService] ========== Raw network order ==========`);
        console.log(`[networkService] Raw order data:`, JSON.stringify(order, null, 2));
      }

      // 过滤订单数据，只返回未支付或已派送的订单，排除临时订单
      const filteredOrders = result.orders.filter(
        (order: any) => (order.status === 'unpaid' || order.status === 'dispatch') && 
                         order.pick_method !== 'TEMP'
      );
      
      return filteredOrders;
    }
    
    return [];
  } catch (error: any) {
    console.error(`[请求${requestId}] 网络获取订单失败:`, error?.message || error);
    if (error?.code) {
      console.error(`[请求${requestId}] 错误代码: ${error.code}`);
    }
    if (error?.errno) {
      console.error(`[请求${requestId}] 系统错误码: ${error.errno}`);
    }
    return [];
  }
};

/**
 * 获取历史订单
 */
export const fetchHistoryOrders = async (timeRange: [string, string]) => {
  try {
    // 获取token
    const token = await getToken();
    if (!token) {
      throw new Error('未授权，无法获取历史订单');
    }
    
    // 获取选中的店铺ID
    const selectedShopId = await AsyncStorage.getItem('selectedShopId');
    if (!selectedShopId) {
      throw new Error('未选择店铺，请先选择店铺');
    }
    
    // 构建请求
    const requestBody = {
      token: token,
      query: {
        time: timeRange,
        shop_id: selectedShopId // 添加店铺ID过滤
      },
      detail: true,
      page_size: 1000,
      page_idx: 0
    };
    
    // 发送请求（带超时和重试）
    const response = await fetchWithRetry(`${API_BASE_URL}/search/order_search_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const result = await response.json();
    
    return result.orders || [];
  } catch (error) {
    console.error('获取历史订单出错:', error);
    throw error;
  }
}; 