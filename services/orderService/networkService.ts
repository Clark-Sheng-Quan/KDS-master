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
 * 从服务器获取产品详情
 * 
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

/**
 * 从网络获取订单
 */
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
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/search/order_search_v2`, {
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
    
    // 检查返回的订单数据
    if (result && result.orders && Array.isArray(result.orders)) {
      // 增强订单数据：获取商品准备时间并计算总准备时间
      for (const order of result.orders) {
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
          console.log(`订单 #${order.order_num} 总准备时间: ${totalPrepareTime}min`);
        }
      }
      
      // 过滤订单数据，只返回未支付或已派送的订单，排除临时订单
      const filteredOrders = result.orders.filter(
        (order: any) => (order.status === 'unpaid' || order.status === 'dispatch') && 
                         order.pick_method !== 'TEMP'
      );
      
      console.log(`[请求${requestId}] 过滤后返回 ${filteredOrders.length} 个订单`);
      return filteredOrders;
    }
    
    console.log(`[请求${requestId}] 订单处理完成，当前时间: ${new Date().toISOString()}`);
    return [];
  } catch (error) {
    console.error(`[请求${requestId}] 网络获取订单失败:`, error);
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
    
    // 发送请求
    const response = await fetch(`${API_BASE_URL}/search/order_search_v2`, {
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
    console.log("result！！！",result)
    return result.orders || [];
  } catch (error) {
    console.error('获取历史订单出错:', error);
    throw error;
  }
}; 