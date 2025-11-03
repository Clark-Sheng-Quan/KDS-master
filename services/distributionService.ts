import { OrderService } from './orderService/OrderService';
import { TCPSocketService } from './tcpSocketService';

/**
 * DistributionService - 简化版本
 * 只负责初始化 KDS 系统（启动 TCP 服务器并设置订单回调）
 * 所有 Master-Slave 分发功能已移除
 */
export class DistributionService {
  private static initialized = false;
  
  /**
   * 初始化 KDS 系统
   * - 启动 TCP 服务器
   * - 设置订单接收回调
   */
  public static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[DistributionService] Already initialized, skipping');
      return;
    }
    
    try {
      console.log('[DistributionService] Initializing KDS system...');
      
      // 启动 TCP 服务器以接收来自 POS 的订单
      try {
        await TCPSocketService.startServer();
        console.log('[DistributionService] TCP server started successfully');
      } catch (e) {
        console.warn('[DistributionService] Failed to start TCP server:', e);
      }

      // 设置订单接收回调 - 当收到 POS 订单时调用
      TCPSocketService.setOrderCallback((order) => {
        try {
          if (!order || !order.id) {
            console.error('[DistributionService] Invalid order received');
            return;
          }
          
          // 订单已在 tcpSocketService 中被格式化，直接添加到订单列表
          OrderService.addTCPOrder(order);
        } catch (error) {
          console.error('[DistributionService] Order callback error:', error);
        }
      });
      
      this.initialized = true;
      console.log('[DistributionService] KDS system initialized successfully');
    } catch (error) {
      console.error('[DistributionService] Initialization failed:', error);
      throw error;
    }
  }

  
  /**
   * 关闭 KDS 系统
   */
  public static async shutdown(): Promise<void> {
    try {
      console.log('[DistributionService] Shutting down...');
      
      // 关闭 TCP 服务
      TCPSocketService.shutdown();
      
      this.initialized = false;
      console.log('[DistributionService] Shutdown complete');
    } catch (error) {
      console.error('[DistributionService] Shutdown failed:', error);
    }
  }
} 