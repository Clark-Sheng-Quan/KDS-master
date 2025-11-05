/**
 * OrderService 主类
 * 整合所有模块功能
 */

import { FormattedOrder } from '../types';
import AudioService from '../audioService';

// 导入各模块功能
import * as StorageService from './storageService';
import * as NetworkService from './networkService';
import * as TCPService from './tcpService';
import * as TimeUtils from './timeUtils';
import * as Formatters from './formatters';
import { POLLING_INTERVAL } from './constants';
import { DistributionService } from '../distributionService';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

// 添加订单ID缓存，用于防止重复处理
const PROCESSED_ORDER_CACHE_SIZE = 100; // 缓存最近处理的100个订单ID

/**
 * OrderService 类
 * 整合订单管理的所有功能
 */
export class OrderService {
  // 内部状态存储
  private static networkOrders: FormattedOrder[] = [];
  private static tcpOrders: FormattedOrder[] = [];
  private static networkPollingInterval: ReturnType<typeof setInterval> | null = null;
  
  // 添加订单ID缓存，用于防止重复处理
  private static processedOrderIds: Set<string> = new Set();
  private static processedOrderIdsArray: string[] = []; // 用于维护缓存顺序
  
  // 回调函数存储
  private static networkOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  private static tcpOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  private static combinedOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  
  /**
   * 设置订单更新回调函数
   */
  public static setOrderUpdateCallback(callback: (orders: FormattedOrder[]) => void) {
    this.combinedOrderUpdateCallback = callback;
    
    // 立即发送当前合并的订单列表
    if (callback) {
      callback([...this.networkOrders, ...this.tcpOrders]);
    }
  }

  /**
   * 添加订单ID到处理缓存
   */
  private static addToProcessedCache(orderId: string) {
    // 如果已经在缓存中，不需要再添加
    if (this.processedOrderIds.has(orderId)) {
      return;
    }
    
    // 添加到缓存
    this.processedOrderIds.add(orderId);
    this.processedOrderIdsArray.push(orderId);
    
    // 如果缓存超出大小限制，移除最早的订单ID
    if (this.processedOrderIdsArray.length > PROCESSED_ORDER_CACHE_SIZE) {
      const oldestId = this.processedOrderIdsArray.shift();
      if (oldestId) {
        this.processedOrderIds.delete(oldestId);
      }
    }
  }

  /**
   * 检查订单是否已处理
   */
  private static isOrderProcessed(orderId: string): boolean {
    return this.processedOrderIds.has(orderId);
  }

  /**
   * 添加新网络订单
   */
  public static async addNetworkOrder(order: FormattedOrder): Promise<void> {
    try {
      // 确保订单有ID
      if (!order.id) {
        console.error('网络订单缺少ID，无法处理');
        return;
      }
      
      // 确保订单来源标记为network
      order.source = 'network';
      
      // 检查订单是否已处理过
      if (this.isOrderProcessed(order.id)) {
        return;
      }
      
      // 检查订单是否已存在
      const existingOrderIndex = this.networkOrders.findIndex((o) => o.id === order.id);
      if (existingOrderIndex !== -1) {
        return;
      }

      // 添加到处理缓存
      this.addToProcessedCache(order.id);

      // 添加新订单到末尾
      this.networkOrders = [...this.networkOrders, order];
      await StorageService.saveNetworkOrders(this.networkOrders);
     
      // 播放新订单提示音
      AudioService.playNewOrderAlert();
      
      // 触发网络订单和合并订单回调
      if (this.networkOrderUpdateCallback) {
        this.networkOrderUpdateCallback(this.networkOrders);
      }
      
      if (this.combinedOrderUpdateCallback) {
        this.combinedOrderUpdateCallback([...this.networkOrders, ...this.tcpOrders]);
      }
      
      // 如果是主KDS，分发订单到子KDS
      // if (DistributionService.isMaster()) {
      //   await DistributionService.processAndDistributeOrder({...order});
      //   console.log(`网络订单 ${order.id} 已传递给分发服务`);
      // }
    } catch (error) {
      console.error('添加网络订单失败:', error);
    }
  }

  /**
   * 添加新TCP订单
   */
  public static async addTCPOrder(order: FormattedOrder): Promise<void> {
    try {
      // 确保订单有ID
      if (!order.id) {
        console.error('TCP订单缺少ID，无法处理');
        return;
      }
      
      // 确保订单来源标记为tcp
      order.source = 'tcp';
      
      // 检查订单是否已存在（相同ID = 更新订单）
      const existingOrderIndex = this.tcpOrders.findIndex((o) => o.id === order.id);
      
      if (existingOrderIndex !== -1) {
        // 获取旧订单的更新次数
        const oldOrder = this.tcpOrders[existingOrderIndex];
        const currentUpdateCount = oldOrder.updateCount || 0;
        
        // 标记为已更新的订单，并增加更新次数
        order.isUpdated = true;
        order.updatedAt = Date.now();
        order.updateCount = currentUpdateCount + 1;
        
        // 替换旧订单为新订单（POS更新了订单）
        this.tcpOrders[existingOrderIndex] = order;
        await StorageService.saveTCPOrders(this.tcpOrders);
        
        // 播放更新提示音（可选）
        AudioService.playNewOrderAlert();
        
        // 触发回调通知订单已更新
        if (this.tcpOrderUpdateCallback) {
          this.tcpOrderUpdateCallback(this.tcpOrders);
        }
        
        if (this.combinedOrderUpdateCallback) {
          this.combinedOrderUpdateCallback([...this.networkOrders, ...this.tcpOrders]);
        }
        
        return;
      }

      // 新订单：添加到列表末尾
      this.tcpOrders = [...this.tcpOrders, order];
      await StorageService.saveTCPOrders(this.tcpOrders);
     
      // 播放新订单提示音
      AudioService.playNewOrderAlert();
      
      // 触发TCP订单和合并订单回调
      if (this.tcpOrderUpdateCallback) {
        this.tcpOrderUpdateCallback(this.tcpOrders);
      }
      
      if (this.combinedOrderUpdateCallback) {
        this.combinedOrderUpdateCallback([...this.networkOrders, ...this.tcpOrders]);
      }
    } catch (error) {
      console.error('添加TCP订单失败:', error);
    }
  }

  /**
   * 获取所有订单（网络+TCP）
   */
  static async getAllOrders(): Promise<FormattedOrder[]> {
    const networkOrders = await StorageService.loadNetworkOrders();
    const tcpOrders = await StorageService.loadTCPOrders();
    return [...networkOrders, ...tcpOrders];
  }

  /**
   * 删除订单（网络和TCP）
   */
  static async removeOrder(orderId: string) {
    try {
      // 尝试从两种类型的订单中删除
      const networkIndex = this.networkOrders.findIndex(order => order.id === orderId);
      if (networkIndex !== -1) {
        this.networkOrders = await StorageService.removeNetworkOrder(orderId, this.networkOrders);
      }
      
      const tcpIndex = this.tcpOrders.findIndex(order => order.id === orderId);
      if (tcpIndex !== -1) {
        this.tcpOrders = await StorageService.removeTCPOrder(orderId, this.tcpOrders);
      }
      
      // 触发更新回调
      if (this.combinedOrderUpdateCallback) {
        this.combinedOrderUpdateCallback([...this.networkOrders, ...this.tcpOrders]);
      }
    } catch (error) {
      console.error('删除订单失败:', error);
    }
  }

  /**
   * 初始化订单服务
   */
  static async initialize() {
    try {
      // 加载已保存的订单
      this.networkOrders = await StorageService.loadNetworkOrders();
      this.tcpOrders = await StorageService.loadTCPOrders();
      
      console.log(`已加载 ${this.networkOrders.length} 个网络订单和 ${this.tcpOrders.length} 个TCP订单`);
      
      // 初始化已处理订单缓存
      // 将所有已加载的订单ID添加到处理缓存中，防止重复处理
      this.networkOrders.forEach(order => {
        if (order.id) {
          this.addToProcessedCache(order.id);
        }
      });
      
      this.tcpOrders.forEach(order => {
        if (order.id) {
          this.addToProcessedCache(order.id);
        }
      });
      
      // ⚠️ 不要绑定TCP服务器！TCP由DistributionService管理
      // 原生模块 (orderModule) 已被弃用，改用 TCPSocketService (4322端口)
      
      // 启动网络轮询
      this.startNetworkPolling();
      
      // 监听来自原生模块的事件（Android后台服务）
      if (Platform.OS === 'android') {
        this.listenToNativeEvents();
      }
      
      return true;
    } catch (error) {
      console.error('初始化OrderService失败:', error);
      return false;
    }
  }

  /**
   * 监听来自原生模块的事件
   */
  private static listenToNativeEvents() {
    try {
      // 创建事件发射器
      const eventEmitter = new NativeEventEmitter();
      
      // 监听checkNewOrders事件
      eventEmitter.addListener('checkNewOrders', () => {
        this.fetchOrdersFromNetworkAndProcess();
      });
    } catch (error) {
      console.error('设置原生事件监听器失败:', error);
    }
  }

  /**
   * 设置TCP回调函数
   */
  static setTCPCallback(callback: (orderData: FormattedOrder) => void) {
    TCPService.setTCPCallback(callback, Formatters.formatTCPOrder, this.addTCPOrder.bind(this));
  }

  /**
   * 绑定TCP服务器
   */
  static async bindTCPServer(): Promise<boolean> {
    try {
      // 绑定TCP服务器
      const bound = await TCPService.bindTCPServer();
      
      // 设置TCP回调函数
      this.setTCPCallback((data: any) => {
        // 检查是否为订单数据（没有type字段的消息视为订单数据）
        if (data && data.id && !data.type) {
          this.addTCPOrder(data as FormattedOrder);
        }
      });
      
      return bound;
    } catch (error) {
      console.error('绑定TCP服务器失败:', error);
      return false;
    }
  }

  /**
   * 开始网络轮询
   */
  static startNetworkPolling() {
    
    if (this.networkPollingInterval) {
      // 如果已经在轮询，先停止
      this.stopNetworkPolling();
    }
    
    // 使用更长的轮询间隔 (5秒)
    const pollingInterval = 5000; // 5秒
    console.log(`开始网络订单轮询，间隔: ${pollingInterval}ms，当前时间: ${new Date().toISOString()}`);
    
    // 立即执行一次
    this.fetchOrdersFromNetworkAndProcess();
    
    // 设置定时器
    this.networkPollingInterval = setInterval(() => {
      this.fetchOrdersFromNetworkAndProcess();
    }, pollingInterval);
  }

  /**
   * 停止网络轮询
   */
  static stopNetworkPolling() {
    if (this.networkPollingInterval) {
      clearInterval(this.networkPollingInterval);
      this.networkPollingInterval = null;
    }
  }

  /**
   * 从网络获取订单并处理
   */
  private static async fetchOrdersFromNetworkAndProcess() {
    try {
      // console.log('开始从网络获取订单...');
      
      // 获取当前时间范围
      const timeRange = TimeUtils.getTimeRangeAroundNow();
      
      // 从网络获取订单，传递一个空函数作为onNewOrder回调
      const orders = await NetworkService.fetchOrdersFromNetwork(timeRange, async () => {});
      
      if (!orders || orders.length === 0) {
        // console.log('没有获取到新订单');
        return;
      }
      
      // console.log(`从网络获取到 ${orders.length} 个订单`);
      
      // 处理每个订单
      let newOrdersCount = 0;
      
      for (const order of orders) {
        // 确保订单有ID
        if (!order._id) {
          console.error('网络订单缺少ID，跳过');
          continue;
        }
        
        // 检查是否已经处理过此订单
        if (this.isOrderProcessed(order._id)) {
          continue;
        }
        
        // 检查订单是否已存在于网络订单列表中
        const existingOrderIndex = this.networkOrders.findIndex((o) => o.id === order.id);
        if (existingOrderIndex !== -1) {
          continue;
        }
        
        // 检查订单是否已存在于TCP订单列表中
        const existingTcpOrderIndex = this.tcpOrders.findIndex((o) => o._id === order._id);
        if (existingTcpOrderIndex !== -1) {
          continue;
        }
        
        // 格式化订单
        const formattedOrder = await Formatters.formatNetworkOrder(order);
        
        // 添加新订单
        await this.addNetworkOrder(formattedOrder);
        newOrdersCount++;
      }
    } catch (error) {
      console.error('从网络获取订单失败:', error);
    }
  }

  /**
   * 获取历史订单详情
   */
  private static todayTimeRange: [string, string] = [
    new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
  ] as [string, string];

  static async getHistoryOrderDetails(): Promise<FormattedOrder[]> {
    try {
      // 获取原始历史订单数据
      const rawOrders = await NetworkService.fetchHistoryOrders(this.todayTimeRange);
      
      // 创建包含过滤后订单的结果对象
      const result = { orders: rawOrders };
      
      // 格式化订单
      return await Formatters.formatOrders(result);
    } catch (error) {
      console.error('获取历史订单失败:', error);
      return []; // 返回空数组而不是抛出错误
    }
  }

  /**
   * 获取产品详情
   */
  static async getProductDetail(productId: string) {
    return NetworkService.getProductDetail(productId);
  }

  /**
   * 获取设备IP地址
   */
  static async getDeviceIP() {
    return NetworkService.getDeviceIP();
  }

  /**
   * 加载网络订单（代理到StorageService模块）
   */
  static async loadNetworkOrders(): Promise<FormattedOrder[]> {
    return StorageService.loadNetworkOrders();
  }

  /**
   * 加载TCP订单（代理到StorageService模块）
   */
  static async loadTCPOrders(): Promise<FormattedOrder[]> {
    return StorageService.loadTCPOrders();
  }

  /**
   * 保存网络订单（代理到StorageService模块）
   */
  static async saveNetworkOrders(orders: FormattedOrder[]): Promise<void> {
    return StorageService.saveNetworkOrders(orders);
  }

  /**
   * 保存TCP订单（代理到StorageService模块）
   */
  static async saveTCPOrders(orders: FormattedOrder[]): Promise<void> {
    return StorageService.saveTCPOrders(orders);
  }

  /**
   * 获取当前时间范围（代理到TimeUtils模块）
   */
  static getTimeRangeAroundNow() {
    return TimeUtils.getTimeRangeAroundNow();
  }
  
  /**
   * 从网络获取订单（代理到NetworkService模块）
   */
  static async fetchOrdersFromNetwork(timeRange: any) {
    return NetworkService.fetchOrdersFromNetwork(timeRange, this.addNetworkOrder.bind(this));
  }

  /**
   * 向特定IP发送TCP数据
   */
  static async sendTCPData(targetIP: string, data: any) {
    return TCPService.sendTCPData(targetIP, data);
  }

  /**
   * 向所有子KDS广播TCP数据
   */
  static async broadcastToSubKDS(data: any, subKDSList: string[]) {
    return TCPService.broadcastToSubKDS(data, subKDSList);
  }

  /**
   * 撤回历史订单到新订单队列
   */
  static async recallOrder(order: FormattedOrder): Promise<boolean> {
    try {
      console.log("撤回历史订单:", order.id);
      
      // 创建一个新的订单副本，避免修改原订单
      const recalledOrder: FormattedOrder = {
        ...order,
        id: `recalled-${order.id}`, // 生成新的ID以避免冲突
        orderTime: new Date().toISOString(), // 更新订单时间为当前时间
        status: 'recalled', // 标记为撤回的订单
      };
      
      // 保存到网络订单存储
      await this.addNetworkOrder(recalledOrder);
      
      console.log("订单撤回成功:", recalledOrder.id);
      return true;
    } catch (error) {
      console.error("撤回订单失败:", error);
      throw error;
    }
  }
} 