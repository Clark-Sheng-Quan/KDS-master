/**
 * OrderService 网络通信模块
 * 处理与服务器之间的 API 通信
 */

import * as Network from 'expo-network';
import { getToken } from '../../utils/auth';
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
        console.log(`等待 ${backoffMs}ms 后重试...`);
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
 * 获取产品准备时间
 */
export const getProductPrepareTime = async (productId: string): Promise<number> => {
  try {
    const productDetails = await getProductDetail(productId);
    // 直接从响应根级获取 prepare_time
    return productDetails.prepare_time || 0;
  } catch (error) {
    console.error(`获取产品 ${productId} 准备时间失败:`, error);
    return 0;
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
    
    // Check returned order data
    if (result && result.orders && Array.isArray(result.orders)) {
      console.log(`[networkService] 30s Fetched ${result.orders.length} orders from API`);
      // Log raw order data
      for (const order of result.orders) {
        console.log(`[networkService] ========== Raw network order ==========`);
        console.log(`[networkService] Raw order data:`, JSON.stringify(order, null, 2));
        
        if (order.products && Array.isArray(order.products)) {
          let totalPrepareTime = 0;
          
          // 为每个商品获取准备时间
          await Promise.all(order.products.map(async (product: any) => {
            try {
              if (product._id) {
                const prepareTime = await getProductPrepareTime(product._id);
                product.prepare_time = prepareTime;
                totalPrepareTime += prepareTime * (product.qty);
              }
            } catch (err) {
              console.error(`获取产品 [${product?.name || product?._id || '未知产品'}] 准备时间失败:`, err);
              // 使用默认准备时间为0
              product.prepare_time = 0;
            }
          }));
          
          // 添加总准备时间到订单
          order.total_prepare_time = totalPrepareTime;
        }
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