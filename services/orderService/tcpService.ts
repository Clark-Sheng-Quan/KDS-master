/**
 * OrderService TCP 服务模块
 * 处理 TCP 通信相关功能
 */

import orderModule from '../orderModule';
import { FormattedOrder } from '../types';

/**
 * 初始化 TCP 服务器
 */
export const bindTCPServer = async (): Promise<boolean> => {
  try {
    console.log('正在初始化TCP服务器...');
    await orderModule.bind();
    console.log('TCP服务器初始化成功');
    return true;
  } catch (error) {
    console.error('TCP服务器初始化失败:', error);
    throw error;
  }
};

/**
 * 设置 TCP 回调函数
 */
export const setTCPCallback = (
  callback: (orderData: FormattedOrder) => void,
  formatTCPOrder: (orderData: any) => FormattedOrder,
  addTCPOrder: (order: FormattedOrder) => Promise<void>
): void => {
  try {
    console.log('设置TCP订单回调...');
    
    orderModule.setOrderCallback(async (orderData) => {
      console.log('收到原始TCP订单数据:', orderData);
      
      // 格式化订单数据
      const formattedOrder = formatTCPOrder(orderData);
      
      // 添加到TCP本地存储
      await addTCPOrder(formattedOrder);
      
      // 调用外部回调
      callback(formattedOrder);
    });
  } catch (error) {
    console.error('设置TCP回调失败:', error);
    throw error;
  }
};

/**
 * 向特定IP发送TCP数据
 */
export const sendTCPData = async (targetIP: string, data: any): Promise<boolean> => {
  try {
    // 使用原生模块发送TCP数据
    const result = await orderModule.sendTCPData(targetIP, JSON.stringify(data));
    return result;
  } catch (error) {
    console.error(`向 ${targetIP} 发送TCP数据失败:`, error);
    return false;
  }
};

/**
 * 向所有子KDS广播TCP数据
 */
export const broadcastToSubKDS = async (data: any, subKDSList: string[]): Promise<void> => {
  for (const ip of subKDSList) {
    await sendTCPData(ip, data);
  }
}; 