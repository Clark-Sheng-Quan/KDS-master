import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormattedOrder, OrderItem}from './types';
import { OrderService } from './orderService/OrderService';
import { TCPSocketService } from './tcpSocketService';
import { Alert } from 'react-native';

// KDS角色枚举
export enum KDSRole {
  MASTER = "master",
  SLAVE = "slave"
}

// 品类枚举
export enum CategoryType {
  ALL = "all",
  DRINKS = "Drinks",
  HOT_FOOD = "hot_food",
  COLD_FOOD = "cold_food",
  DESSERT = "dessert"
}

// 子KDS信息接口
interface SubKDSInfo {
  ip: string;
  category: CategoryType;
  connected: boolean;
}

export class DistributionService {
  private static initialized = false;
  
  /**
   * 初始化服务
   */
  public static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[DistributionService] 服务已初始化，跳过');
      return;
    }
    
    try {
      console.log('[DistributionService] 初始化KDS服务...');
      
      // ⚠️ 注意：不要在这里启动TCP服务器！
      // TCP服务器由原生模块（OrderHandlerModule）管理，用于接收POS订单
      // TCPSocketService 仅用于 Master-Slave KDS之间的通信（已废弃）
      console.log('[DistributionService] TCP服务器由原生模块管理，用于接收POS订单');
      
      this.initialized = true;
      console.log('[DistributionService] KDS服务初始化完成');
    } catch (error) {
      console.error('[DistributionService] 初始化失败:', error);
      throw error;
    }
  }
  
  /**
   * 关闭服务
   */
  public static async shutdown(): Promise<void> {
    try {
      console.log('[DistributionService] 关闭服务...');
      
      // ⚠️ 注意：不要关闭TCP服务，因为我们没有启动它
      // TCP服务由原生模块管理
      
      this.initialized = false;
      console.log('[DistributionService] 服务已关闭');
    } catch (error) {
      console.error('[DistributionService] 关闭服务失败:', error);
    }
  }
} 