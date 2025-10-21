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
    return ordersJson ? JSON.parse(ordersJson) : [];
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
    return ordersJson ? JSON.parse(ordersJson) : [];
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