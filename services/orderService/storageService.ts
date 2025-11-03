/**
 * OrderService 本地存储服务
 * 处理订单的本地存储逻辑
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormattedOrder } from '../types';
import { NETWORK_ORDERS_KEY, TCP_ORDERS_KEY } from './constants';

/**
 * 从 AsyncStorage 加载网络订单
 */
export const loadNetworkOrders = async (): Promise<FormattedOrder[]> => {
  try {
    const ordersJson = await AsyncStorage.getItem(NETWORK_ORDERS_KEY);
    if (!ordersJson) {
      return [];
    }
    
    const orders = JSON.parse(ordersJson);
    
    // 数据验证和清理：过滤掉没有 products 数组的订单
    const validOrders = orders.filter((order: any) => {
      // 检查订单是否有 products 数组
      if (!order.products || !Array.isArray(order.products)) {
        console.warn(`[StorageService] Removing invalid network order (missing products array):`, order.id || 'unknown');
        return false;
      }
      return true;
    });
    
    // 如果有无效订单被过滤掉，保存清理后的订单列表
    if (validOrders.length < orders.length) {
      console.log(`[StorageService] Cleaned ${orders.length - validOrders.length} invalid network orders from storage`);
      await saveNetworkOrders(validOrders);
    }
    
    return validOrders;
  } catch (error) {
    console.error('加载网络订单失败:', error);
    return [];
  }
};

/**
 * 从 AsyncStorage 加载TCP订单
 */
export const loadTCPOrders = async (): Promise<FormattedOrder[]> => {
  try {
    const ordersJson = await AsyncStorage.getItem(TCP_ORDERS_KEY);
    if (!ordersJson) {
      return [];
    }
    
    const orders = JSON.parse(ordersJson);
    
    // 数据验证和清理：过滤掉没有 products 数组的旧格式订单
    const validOrders = orders.filter((order: any) => {
      // 检查订单是否有 products 数组
      if (!order.products || !Array.isArray(order.products)) {
        console.warn(`[StorageService] Removing invalid TCP order (missing products array):`, order.id || 'unknown');
        return false; // 过滤掉旧格式的订单
      }
      return true;
    });
    
    // 如果有无效订单被过滤掉，保存清理后的订单列表
    if (validOrders.length < orders.length) {
      console.log(`[StorageService] Cleaned ${orders.length - validOrders.length} invalid TCP orders from storage`);
      await saveTCPOrders(validOrders);
    }
    
    return validOrders;
  } catch (error) {
    console.error('加载TCP订单失败:', error);
    return [];
  }
};

/**
 * 保存网络订单到 AsyncStorage
 */
export const saveNetworkOrders = async (orders: FormattedOrder[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(NETWORK_ORDERS_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error('保存网络订单失败:', error);
  }
};

/**
 * 保存TCP订单到 AsyncStorage
 */
export const saveTCPOrders = async (orders: FormattedOrder[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(TCP_ORDERS_KEY, JSON.stringify(orders));
  } catch (error) {
    console.error('保存TCP订单失败:', error);
  }
};

/**
 * 删除网络订单
 */
export const removeNetworkOrder = async (orderId: string, currentOrders: FormattedOrder[]): Promise<FormattedOrder[]> => {
  try {
    const filteredOrders = currentOrders.filter(order => order.id !== orderId);
    await saveNetworkOrders(filteredOrders);
    console.log('网络订单已删除，ID:', orderId);
    return filteredOrders;
  } catch (error) {
    console.error('删除网络订单失败:', error);
    return currentOrders;
  }
};

/**
 * 删除TCP订单
 */
export const removeTCPOrder = async (orderId: string, currentOrders: FormattedOrder[]): Promise<FormattedOrder[]> => {
  try {
    const filteredOrders = currentOrders.filter(order => order.id !== orderId);
    await saveTCPOrders(filteredOrders);
    console.log('TCP订单已删除，ID:', orderId);
    return filteredOrders;
  } catch (error) {
    console.error('删除TCP订单失败:', error);
    return currentOrders;
  }
}; 