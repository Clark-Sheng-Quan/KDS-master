/**
 * OrderService 主类
 * 整合所有模块功能
 */

import { FormattedOrder } from '../types';
import AudioService from '../audioService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 导入各模块功能
import * as StorageService from './storageService';
import * as NetworkService from './networkService';
import * as TimeUtils from './timeUtils';
import * as Formatters from './formatters';
import { POLLING_INTERVAL, API_BASE_URL } from './constants';
import { DistributionService } from '../distributionService';
import { callingScreenService } from '../CallingScreenService';
import { callingScreenDiscovery } from '../CallingScreenDiscovery';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { log } from 'console';

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
  
  // KDS 配置信息
  private static kdsCategory: string = 'all';
  
  // 添加订单ID缓存，用于防止重复处理
  private static processedOrderIds: Set<string> = new Set();
  private static processedOrderIdsArray: string[] = []; // 用于维护缓存顺序
  
  // 回调函数存储
  private static networkOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  private static tcpOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  private static combinedOrderUpdateCallback: ((orders: FormattedOrder[]) => void) | null = null;
  private static combinedOrderUpdateCallbacks: Array<(orders: FormattedOrder[]) => void> = [];
  private static orderCompletionCallbacks: Array<(order: FormattedOrder) => void> = [];
  
  /**
   * 设置 KDS 配置（kdsCategory）
   */
  public static setKDSConfig(category: string) {
    this.kdsCategory = category;
    console.log(`[OrderService] 设置 KDS 配置 - 分类: ${this.kdsCategory}`);
  }

  /**
   * 设置订单更新回调函数（支持多个订阅者）
   */
  public static setOrderUpdateCallback(callback: (orders: FormattedOrder[]) => void) {
    this.combinedOrderUpdateCallbacks.push(callback);
    
    // 立即发送当前合并的订单列表（已经是过滤后的）
    if (callback) {
      const currentOrders = [...this.networkOrders, ...this.tcpOrders];
      callback(currentOrders);
    }
    
    // 返回 unsubscribe 函数
    return () => {
      const index = this.combinedOrderUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.combinedOrderUpdateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 设置订单完成回调函数（支持多个订阅者）
   * 当订单被自动完成时触发（如用于 addCompletedOrder)
   */
  public static setOrderCompletionCallback(callback: (order: FormattedOrder) => void) {
    this.orderCompletionCallbacks.push(callback);
    
    // 返回 unsubscribe 函数
    return () => {
      const index = this.orderCompletionCallbacks.indexOf(callback);
      if (index > -1) {
        this.orderCompletionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 触发所有已注册的订单完成回调
   */
  private static emitOrderCompletion(order: FormattedOrder) {
    console.log(`[OrderService] emitOrderCompletion - 订单 ${order.id} 已完成，通知 ${this.orderCompletionCallbacks.length} 个监听者`);
    
    this.orderCompletionCallbacks.forEach((callback, index) => {
      try {
        callback(order);
      } catch (error) {
        console.error(`[OrderService] 完成回调 #${index + 1} 执行出错:`, error);
      }
    });
  }

  /**
   * 触发所有已注册的订单更新回调
   */
  private static emitOrderUpdate() {
    const updatedOrders = [...this.networkOrders, ...this.tcpOrders];
    console.log(`[OrderService] emitOrderUpdate - 发送 ${updatedOrders.length} 个订单给 ${this.combinedOrderUpdateCallbacks.length} 个回调`);
    
    this.combinedOrderUpdateCallbacks.forEach((callback, index) => {
      try {
        callback(updatedOrders);
      } catch (error) {
        console.error(`[OrderService] 回调 #${index + 1} 执行出错:`, error);
      }
    });
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
   * 计算订单的总项目数（所有产品的quantity之和）
   */
  private static calculateItemCount(order: FormattedOrder): number {
    return order.products.reduce((total, item) => total + (item.quantity || 1), 0);
  }

  /**
   * 比较两个 products 数组是否相同
   */
  private static areProductsEqual(prev: any[], current: any[]): boolean {
    if (prev.length !== current.length) return false;
    return prev.every((p, idx) => {
      const c = current[idx];
      return (
        p.id === c.id &&
        p.quantity === c.quantity &&
        p.name === c.name &&
        p.itemState === c.itemState &&
        p.category === c.category &&
        p.price === c.price &&
        p.prepare_time === c.prepare_time
      );
    });
  }

  /**
   * 获取订单的过滤后产品列表（基于当前 KDS 配置）
   */
  private static getFilteredProducts(order: FormattedOrder): any[] {
    // console.log(`[getFilteredProducts] kdsCategory=${this.kdsCategory}, order.id=${order.id}`);
    
    // 总是要排除 isValidKds === false 的产品
    let filteredProducts = order.products.filter((product) => {
      // 检查 isValidKds 参数 - 这个条件对所有 KDS 都适用
      if (product.isValidKds === false) {
        return false;
      }
      return true;
    });
    
    // 如果 category 不为 all，还要再按分类过滤
    if (this.kdsCategory !== 'all') {
      filteredProducts = filteredProducts.filter((product) => {
        return product.category === this.kdsCategory;
      });
    }
    
    // console.log(`[getFilteredProducts] 过滤后 ${filteredProducts.length}/${order.products.length} 个产品`);
    return filteredProducts;
  }

  /**
   * 函数1：过滤订单产品
   * 根据 KDS 配置（分类和 isValidKds）直接修改 order.products
   */
  private static filterOrderProducts(order: FormattedOrder): any[] {
    const filteredProducts = this.getFilteredProducts(order);
    order.products = filteredProducts;
    return filteredProducts;
  }

  /**
   * 存储每个订单的上一次过滤后产品
   */
  private static previousFilteredProducts: Map<string, any[]> = new Map();

  /**
   * 函数2：检测过滤产品变化并更新 updateCount
   * 比较新旧 filteredProducts，如果有变化则增加 updateCount 并设置 isUpdated
   * @returns true 如果产品有变化，false 如果没有变化
   */
  private static updateCountIfProductsChanged(order: FormattedOrder, newFilteredProducts: any[]): boolean {
    const prevFilteredProducts = this.previousFilteredProducts.get(order.id);
    let hasProductsChanged = false;
    
    if (prevFilteredProducts) {
      // 比较新旧产品是否相同
      hasProductsChanged = !this.areProductsEqual(prevFilteredProducts, newFilteredProducts);
      
      if (hasProductsChanged) {
        // 产品有变化，增加 updateCount
        const currentUpdateCount = order.updateCount || 0;
        order.updateCount = currentUpdateCount + 1;
      }
    }
    
    // 保存当前的过滤产品作为下次比较的基准
    this.previousFilteredProducts.set(order.id, newFilteredProducts);
    
    return hasProductsChanged;
  }

  /**
   * Add new network order
   */
  public static async addNetworkOrder(order: FormattedOrder, shouldPlaySound: boolean = true): Promise<void> {
    try {
      // Ensure the order has an ID
      if (!order.id) {
        console.error('Network order is missing an ID, cannot process');
        return;
      }
      
      // Check if it's a recalled order, if not, mark it as network
      const isRecalledOrder = order.isRecalled === true;
      if (!isRecalledOrder) {
        order.source = 'network';
      }
      
      // Check if the order has already been processed (skip for recalled orders as they need product merging)
      if (!isRecalledOrder && this.isOrderProcessed(order.id)) {
        console.log(`[addNetworkOrder] Order ${order.id} has already been processed, skipping`);
        return;
      }
      
      // Check if the order already exists
      const existingOrderIndex = this.networkOrders.findIndex((o) => o.id === order.id);
      
      if (existingOrderIndex !== -1) {
        // Order already exists, merge products for recalled orders
        if (isRecalledOrder) {
          const existingOrder = this.networkOrders[existingOrderIndex];
          // Merge products: keep existing products, add new products (avoid duplicates)
          const existingProductIds = new Set(existingOrder.products?.map(p => p.id) || []);
          const newProducts = order.products?.filter(p => !existingProductIds.has(p.id)) || [];
          
          const mergedOrder = {
            ...existingOrder,
            products: [...(existingOrder.products || []), ...newProducts],
          };
          
          this.networkOrders[existingOrderIndex] = mergedOrder;
          await StorageService.saveNetworkOrders(this.networkOrders);
          
          console.log(`[addNetworkOrder] Updated recalled order ${order.id}, added ${newProducts.length} new products`);
          
          // Notify Calling Screen of order product count change
          const device = callingScreenDiscovery.getCachedDevice();
          if (device) {
            const itemCount = mergedOrder.products.reduce((total, item) => total + (item.quantity || 1), 0);
            callingScreenService.notifyOrderAdded(device, mergedOrder._id, String(mergedOrder.num), itemCount, mergedOrder.tableNumber).catch((error: any) => {
              console.warn('[OrderService] Failed to notify Calling Screen (network order updated):', error);
            });
          }
          
          // Trigger callback to notify UI of updates
          if (this.networkOrderUpdateCallback) {
            this.networkOrderUpdateCallback(this.networkOrders);
          }
          
          this.emitOrderUpdate();
        }
        return;
      }

      // Add to processed cache (recalled orders are not added to cache to allow product re-merging)
      if (!isRecalledOrder) {
        this.addToProcessedCache(order.id);
      }

      // Update order status from confirmed to processing (non-recalled orders only)
      if (!isRecalledOrder) {
        try {
          const token = await AsyncStorage.getItem("token");
          if (!token) {
            console.warn('[addNetworkOrder] No token available, skip status update');
          } else {

            const updateResponse = await fetch(`${API_BASE_URL}/order/update_order_status`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                order_id: order._id,
                status: "processing",
                source: "network",
              }),
            });
            
            if (!updateResponse.ok) {
              console.warn(`Failed to update order ${order.id} status to processing`);
            }
          }
        } catch (error) {
          console.error('[addNetworkOrder] Error updating order status:', error);
        }
      }

      // For recalled orders, do not filter products, keep all products
      let filteredProducts = order.products;
      if (!isRecalledOrder) {
        // Function: filter products (directly modify order.products)
        filteredProducts = this.filterOrderProducts(order);
        
        // If no products after filtering, do not store this order (not relevant to current KDS)
        if (filteredProducts.length === 0) {
          console.log(`[addNetworkOrder] Order ${order.id} has no products after filtering, not storing`);
          return;
        }
      }
      
      // Add new order to end (already filtered)
      this.networkOrders = [...this.networkOrders, order];
      await StorageService.saveNetworkOrders(this.networkOrders);
      
      // Notify Calling Screen about new order (fire and forget)
      // Notify all orders: new orders, recalled orders, any source should notify
      const orderNumber = String(order.num);
      const itemCount = this.calculateItemCount(order);
      const device = callingScreenDiscovery.getCachedDevice();
      if (device) {
        callingScreenService.notifyOrderAdded(device, order._id, orderNumber, itemCount, order.tableNumber).catch((error) => {
          console.warn('[addCallingOrder] Failed to notify Calling Screen:', error);
        });
      }
      
      // Save initial filtered products to previousFilteredProducts for subsequent comparison
      this.previousFilteredProducts.set(order.id, [...filteredProducts]);
     
      // Conditionally play alert sound based on shouldPlaySound parameter
      if (shouldPlaySound) {
        AudioService.playNewOrderAlert();
      }
      
      // Trigger network order and merged order callbacks (pass already filtered orders)
      if (this.networkOrderUpdateCallback) {
        this.networkOrderUpdateCallback(this.networkOrders);
      }
      
      this.emitOrderUpdate();
      
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
        // 获取旧订单
        const oldOrder = this.tcpOrders[existingOrderIndex];
        
        // 对于 recalled 订单进行产品合并更新
        if (order.isRecalled) {
          // 合并产品：保留现有产品，添加新产品（避免重复）
          const existingProductIds = new Set(oldOrder.products?.map(p => p.id) || []);
          const newProducts = order.products?.filter(p => !existingProductIds.has(p.id)) || [];
          
          const mergedOrder = {
            ...oldOrder,
            products: [...(oldOrder.products || []), ...newProducts],
          };
          
          this.tcpOrders[existingOrderIndex] = mergedOrder;
          await StorageService.saveTCPOrders(this.tcpOrders);
          
          console.log(`[addTCPOrder] 已更新recall订单 ${order.id}，新增 ${newProducts.length} 个产品`);
          
          // 触发回调通知UI更新
          if (this.tcpOrderUpdateCallback) {
            this.tcpOrderUpdateCallback(this.tcpOrders);
          }
          
          this.emitOrderUpdate();
          return;
        }
        
        // 非 recalled 订单的正常更新逻辑
        // 重复的 TCP order 总是增加 updateCount
        const currentUpdateCount = order.updateCount || 0;
        order.updateCount = currentUpdateCount + 1;
        
        // 函数1：获取新订单的过滤后产品
        const newFilteredProducts = this.filterOrderProducts(order);
        
        // 如果过滤后没有产品，则删除此订单
        if (newFilteredProducts.length === 0) {
          this.tcpOrders.splice(existingOrderIndex, 1);
          await StorageService.saveTCPOrders(this.tcpOrders);
          console.log(`[addTCPOrder] 订单 ${order.id} 更新后无产品，已删除`);
          
          // 触发回调通知订单已删除
          this.emitOrderUpdate();
          return;
        }
        
        order.updatedAt = Date.now();
        
        // 替换旧订单为新订单（已经是过滤后的）
        this.tcpOrders[existingOrderIndex] = order;
        await StorageService.saveTCPOrders(this.tcpOrders);
        
        // 重复的 TCP order 总是播放更新提示音
        AudioService.playUpdateOrderAlert();
        
        // 通知 Calling Screen 订单产品数量变化
        const device = callingScreenDiscovery.getCachedDevice();
        if (device) {
          const itemCount = order.products.reduce((total, item) => total + (item.quantity || 1), 0);
          callingScreenService.notifyOrderAdded(device, order._id, String(order.num), itemCount, order.tableNumber).catch((error: any) => {
            console.warn('[OrderService] Failed to notify Calling Screen (TCP order updated):', error);
          });
        }
        
        // 触发回调通知订单已更新（直接传递已过滤的订单）
        if (this.tcpOrderUpdateCallback) {
          this.tcpOrderUpdateCallback(this.tcpOrders);
        }
        
        this.emitOrderUpdate();
        
        return;
      }

      // 新订单：函数1 过滤产品（直接修改 order.products）
      const filteredProducts = this.filterOrderProducts(order);
      
      // 如果过滤后没有产品，不存储此订单（对当前 KDS 无关）
      if (filteredProducts.length === 0) {
        console.log(`[addTCPOrder] 订单 ${order.id} 过滤后无产品，不存储`);
        return;
      }
      
      // 添加到列表末尾（已经是过滤后的）
      this.tcpOrders = [...this.tcpOrders, order];
      await StorageService.saveTCPOrders(this.tcpOrders);
      
      // 保存初始的过滤产品到 previousFilteredProducts，用于后续比较
      this.previousFilteredProducts.set(order.id, [...filteredProducts]);
     
      // 播放新订单提示音
      AudioService.playNewOrderAlert();
      
      // 触发TCP订单和合并订单回调（直接传递已过滤的订单）
      if (this.tcpOrderUpdateCallback) {
        this.tcpOrderUpdateCallback(this.tcpOrders);
      }
      
      this.emitOrderUpdate();
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
   * 完成订单（完整流程：触发完成回调 -> 删除订单）
   * 这与"Done"按钮的效果一致，包括 addCompletedOrder 的记录
   */
  static async completeOrder(orderId: string) {
    try {
      console.log(`[OrderService] completeOrder - 开始完成订单 ${orderId}`);
      
      // 查找订单（可能在网络或TCP中）
      const networkOrder = this.networkOrders.find(order => order.id === orderId);
      const tcpOrder = this.tcpOrders.find(order => order.id === orderId);
      const order = networkOrder || tcpOrder;
      
      if (!order) {
        console.warn(`[OrderService] completeOrder - 订单 ${orderId} 不存在`);
        return;
      }
      
      // 标记状态为就绪
      const completedOrder = {
        ...order,
        status: 'ready'
      };
      
      // 1. 触发完成回调（让UI层处理 addCompletedOrder、CallingScreen通知等）
      this.emitOrderCompletion(completedOrder);
      
      // 2. 从订单列表中删除
      await this.removeOrder(orderId);
      
      console.log(`[OrderService] completeOrder - 订单 ${orderId} 已完成并删除`);
    } catch (error) {
      console.error('[OrderService] completeOrder - 完成订单失败:', error);
    }
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
      
      // 触发更新回调（直接传递已过滤的订单）
      this.emitOrderUpdate();
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
      
      // 初始化 KDS 配置
      try {
        const categoryStr = await AsyncStorage.getItem("kds_category");
        this.kdsCategory = categoryStr || "all";
        
        console.log(`[OrderService] 初始化 KDS 配置 - 分类: ${this.kdsCategory}`);
      } catch (error) {
        console.error('读取 KDS 配置失败:', error);
      }
      
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
   * 开始网络轮询
   */
  static startNetworkPolling() {
    
    if (this.networkPollingInterval) {
      // 如果已经在轮询，先停止
      this.stopNetworkPolling();
    }
    
    // 使用更长的轮询间隔 (30秒)
    const pollingInterval = 30000; // 30秒
    console.log(`开始网络订单轮询，间隔: ${pollingInterval}ms，当前时间: ${new Date().toISOString()}`);
    
    // 立即执行一次
    this.fetchOrdersFromNetworkAndProcess();
    
    // 设置定时器
    this.networkPollingInterval = setInterval(() => {
      this.fetchOrdersFromNetworkAndProcess();
    }, pollingInterval);
  }

  /**
   * 自动完成超过配置时间的订单
   */
  private static async autoCompleteExpiredOrders() {
    try {
      const now = Date.now();
      // 硬编码 1 小时用于测试
      const twoHoursInMs = 24 * 60 * 60 * 1000;
      const expiredNetworkOrders = this.networkOrders.filter(order => {
        const orderStartTime = new Date(order.kdsReceiveTime).getTime();
        return (now - orderStartTime) > twoHoursInMs;
      });
      
      const expiredTcpOrders = this.tcpOrders.filter(order => {
        const orderStartTime = new Date(order.kdsReceiveTime).getTime();
        return (now - orderStartTime) > twoHoursInMs;
      });
      
      if (expiredNetworkOrders.length > 0) {
        console.log(`[OrderService] 自动完成 ${expiredNetworkOrders.length} 个网络订单`);
        for (const order of expiredNetworkOrders) {
          await this.completeOrder(order.id);
        }
      }
      
      if (expiredTcpOrders.length > 0) {
        console.log(`[OrderService] 自动完成 ${expiredTcpOrders.length} 个TCP订单`);
        for (const order of expiredTcpOrders) {
          await this.completeOrder(order.id);
        }
      }
    } catch (error) {
      console.error('[OrderService] 自动完成订单失败:', error);
    }
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
      // 先执行自动清理（无论有没有新订单都要执行）
      await this.autoCompleteExpiredOrders();
      
      // 获取当前时间范围
      const timeRange = TimeUtils.getTimeRangeAroundNow();
      
      // 从网络获取订单，传递一个空函数作为onNewOrder回调
      const orders = await NetworkService.fetchOrdersFromNetwork(timeRange, async () => {});
      
      if (!orders || orders.length === 0) {
      
        return;
      }
      
      // 处理每个订单
      let newOrdersCount = 0;
      let skippedCount = 0;
      
      for (const order of orders) {
        // 确保订单有ID
        if (!order._id) {
          console.error('网络订单缺少ID，跳过');
          continue;
        }
        
        // 先格式化订单，得到统一的 order.id
        const formattedOrder = await Formatters.formatNetworkOrder(order);
        
        // 使用格式化后的 order.id 进行所有重复检测
        // 检查是否已经处理过此订单
        if (this.isOrderProcessed(formattedOrder.id)) {
          skippedCount++;
          console.log(`[fetchOrdersFromNetworkAndProcess] 订单 ${formattedOrder.id} 已处理，跳过`);
          continue;
        }
        
        // 检查订单是否已存在于网络订单列表中
        const existingOrderIndex = this.networkOrders.findIndex((o) => o.id === formattedOrder.id);
        if (existingOrderIndex !== -1) {
          skippedCount++;
          console.log(`[fetchOrdersFromNetworkAndProcess] 订单 ${formattedOrder.id} 已存在于网络订单列表，跳过`);
          continue;
        }
        
        // 检查订单是否已存在于TCP订单列表中
        const existingTcpOrderIndex = this.tcpOrders.findIndex((o) => o.id === formattedOrder.id);
        if (existingTcpOrderIndex !== -1) {
          skippedCount++;
          console.log(`[fetchOrdersFromNetworkAndProcess] 订单 ${formattedOrder.id} 已存在于TCP订单列表，跳过`);
          continue;
        }
        
        // 添加新订单
        await this.addNetworkOrder(formattedOrder);
        newOrdersCount++;
      }
      
      if (newOrdersCount > 0 || skippedCount > 0) {
        console.log(`[fetchOrdersFromNetworkAndProcess] 新增: ${newOrdersCount} 个订单, 跳过: ${skippedCount} 个重复订单`);
      }
      
    } catch (error) {
      console.error('[orderService] Error fetching orders:', error);
    }
  }

  /**
   * 获取历史订单详情
   */
  private static getTodayTimeRange(): [string, string] {
    // 每次调用时动态计算时间范围，确保时间是最新的
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return [start.toISOString(), end.toISOString()];
  }

  static async getHistoryOrderDetails(): Promise<FormattedOrder[]> {
    try {
      const todayTimeRange = this.getTodayTimeRange();
      
      // 获取原始历史订单数据
      const rawOrders = await NetworkService.fetchHistoryOrders(todayTimeRange);
      
      // 创建包含过滤后订单的结果对象
      const result = { orders: rawOrders };
      
      // 格式化订单
      return await Formatters.formatOrders(result);
    } catch (error) {
      console.error('[orderService] 获取历史订单失败:', error);
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
   * 撤回历史订单到新订单队列
   */
  static async recallOrder(order: FormattedOrder): Promise<boolean> {
    try {
      
      // 获取当前本地时间，格式为 "yyyy-MM-dd HH:mm:ss"
      const currentLocalTime = Formatters.convertToLocalTimeFormatted(new Date().toISOString());
      
      // 创建一个新的订单副本，避免修改原订单
      const recalledOrder: FormattedOrder = {
        ...order,
        orderTime: currentLocalTime,
        isRecalled: true,
      };
      
      // 保存到网络订单存储（不播放提示音）
      await this.addNetworkOrder(recalledOrder, false);
      
      console.log("====== RECALL ORDER 成功 ======\n");
      return true;
    } catch (error) {
      console.error("撤回订单失败:", error);
      throw error;
    }
  }
} 