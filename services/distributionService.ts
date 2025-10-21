import AsyncStorage from '@react-native-async-storage/async-storage';
import { FormattedOrder, OrderItem } from './types';
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
  private static role: KDSRole = KDSRole.MASTER;
  private static masterIP: string = "";
  private static subKdsList: SubKDSInfo[] = [];
  private static tcpSockets: Map<string, any> = new Map(); // 保存与子KDS的连接
  
  private static initialized = false;
  
  // 添加已处理订单缓存
  private static processedOrderIds: Set<string> = new Set();
  private static processedOrderIdsArray: string[] = []; // 用于维护缓存顺序
  private static PROCESSED_ORDER_CACHE_SIZE = 100; // 缓存大小
  
  // 添加订单ID到处理缓存
  private static addToProcessedCache(orderId: string) {
    // 如果已经在缓存中，不需要再添加
    if (this.processedOrderIds.has(orderId)) {
      return;
    }
    
    // 添加到缓存
    this.processedOrderIds.add(orderId);
    this.processedOrderIdsArray.push(orderId);
    
    // 如果缓存超出大小限制，移除最早的订单ID
    if (this.processedOrderIdsArray.length > this.PROCESSED_ORDER_CACHE_SIZE) {
      const oldestId = this.processedOrderIdsArray.shift();
      if (oldestId) {
        this.processedOrderIds.delete(oldestId);
      }
    }
    
    console.log(`[分发服务] 订单ID ${orderId} 已添加到处理缓存，当前缓存大小: ${this.processedOrderIds.size}`);
  }
  
  // 检查订单是否已处理
  private static isOrderProcessed(orderId: string): boolean {
    return this.processedOrderIds.has(orderId);
  }
  
  // 初始化分发服务
  public static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 加载设置
      const savedRole = await AsyncStorage.getItem("kds_role");
      this.role = (savedRole as KDSRole) || KDSRole.MASTER;
      
      const savedMasterIP = await AsyncStorage.getItem("master_ip");
      this.masterIP = savedMasterIP || "";
      
      // 子KDS不再需要手动设置category
      
      const savedSubKds = await AsyncStorage.getItem("sub_kds_list");
      if (savedSubKds) {
        const parsedList = JSON.parse(savedSubKds);
        this.subKdsList = parsedList.map((item: any) => ({
          ...item,
          connected: false
        }));
      }
      
      // 根据角色执行不同的初始化
      if (this.role === KDSRole.MASTER) {
        await this.initializeMaster();
      } else {
        await this.initializeSlave();
      }
      
      this.initialized = true;
      console.log(`KDS初始化完成，当前角色: ${this.role}`);
    } catch (error) {
      console.error("分发服务初始化失败:", error);
      throw error;
    }
  }
  
  // 初始化主KDS
  private static async initializeMaster(): Promise<void> {
    try {
      // 1. 启动TCP服务器
      await TCPSocketService.startServer();
      
      // 2. 设置回调以接收来自原始订单源的订单
      TCPSocketService.setOrderCallback(async (data: any) => {
        // 检查消息类型
        if (data.type === 'order_ack') {
          // 处理子KDS的订单确认
          console.log(`收到子KDS确认，订单ID: ${data.orderId}, 状态: ${data.status}`);
          // 可以在这里更新订单发送状态
        } 
        else if (data.type === 'order' || data.type === null) {
          // 处理订单数据
          console.log("主KDS收到新订单:", data.id || (data.data && data.data.id));
          
          // 如果数据包含data字段，使用它
          const orderData = data.data || data;
          
          // 处理订单并分发
          await this.processAndDistributeOrder(orderData);
        }
        else {
          console.log("收到未知类型TCP数据:", data);
        }
      });
      
      // 3. 设置子KDS注册回调
      TCPSocketService.setRegistrationCallback(async (ip: string, category: CategoryType) => {
        console.log(`收到子KDS注册请求: IP=${ip}, 品类=${category}`);
        
        // 检查子KDS是否已存在
        const existingIndex = this.subKdsList.findIndex(kds => kds.ip === ip);
        
        if (existingIndex >= 0) {
          console.log(`子KDS ${ip} 已存在，更新连接状态和品类`);
          // 更新现有子KDS的状态和品类
          this.subKdsList[existingIndex] = {
            ...this.subKdsList[existingIndex],
            category: category,
            connected: true
          };
        } else {
          console.log(`添加新的子KDS: ${ip}, 品类: ${category}`);
          // 添加新的子KDS
          this.subKdsList.push({
            ip: ip,
            category: category,
            connected: true
          });
        }
        
        // 保存更新后的子KDS列表
        await AsyncStorage.setItem("sub_kds_list", JSON.stringify(this.subKdsList));
        console.log(`已保存更新的子KDS列表，共${this.subKdsList.length}个子KDS`);
      });
      
      // 4. 继续使用OrderService处理网络订单
      await OrderService.bindTCPServer();
      
      // 5. 尝试连接所有子KDS
      for (const subKds of this.subKdsList) {
        this.connectToSubKDS(subKds.ip, subKds.category);
      }
    } catch (error) {
      console.error("主KDS初始化失败:", error);
      Alert.alert("错误", "主KDS初始化失败");
      throw error;
    }
  }
  
  // 初始化子KDS
  private static async initializeSlave(): Promise<void> {
    try {
      console.log("初始化子KDS...");
      
      // 获取主KDS IP
      const masterIP = await AsyncStorage.getItem("master_ip") || "";
      if (!masterIP) {
        console.error("未设置主KDS IP地址");
        return;
      }
      
      this.masterIP = masterIP;
      console.log(`主KDS IP: ${this.masterIP}`);
      
      // 如果是本地测试环境，统一使用127.0.0.1
      const actualMasterIP = (masterIP === '127.0.0.100' || masterIP.startsWith('192.168.')) ? '127.0.0.1' : masterIP;
      console.log(`实际连接的主KDS IP: ${actualMasterIP}`);
      
      // 连接到主KDS
      const connected = await TCPSocketService.connectToMaster(actualMasterIP);
      
      if (connected) {
        console.log("成功连接到主KDS");
        
        // 设置回调，处理从主KDS接收的订单
        TCPSocketService.setOrderCallback((order) => {
          console.log(`收到来自主KDS的订单: ${order.id}`);
          
          // 添加到本地订单列表
          OrderService.addTCPOrder(order);
          
          console.log(`订单 ${order.id} 已添加到本地列表，商品数量: ${order.products.length}`);
          
          // 打印订单中的商品
          order.products.forEach((product: any, index: number) => {
            console.log(`商品 ${index + 1}: ${product.name} (${product.category}) x${product.quantity}`);
          });
        });
      } else {
        console.error("无法连接到主KDS");
      }
    } catch (error) {
      console.error("初始化子KDS失败:", error);
    }
  }
  
  // 连接到子KDS
  private static async connectToSubKDS(ip: string, category: CategoryType): Promise<void> {
    try {
      console.log(`尝试连接子KDS: ${ip}, 品类: ${category}`);
      
      // 发送连接测试消息
      const testMessage = {
        type: 'connection_test',
        from: 'master',
        timestamp: new Date().toISOString()
      };
      
      // 如果是本地测试环境，统一使用127.0.0.1进行连接，但保留原始IP用于显示
      const actualIP = (ip === '127.0.0.100' || ip.startsWith('192.168.')) ? '127.0.0.1' : ip;
      if (actualIP !== ip) {
        console.log(`实际连接目标IP: ${actualIP} (原始IP: ${ip})`);
      }
      
      const connected = await TCPSocketService.sendData(actualIP, testMessage);
      
      // 更新连接状态，但保留原始IP
      const updatedList = this.subKdsList.map(kds => 
        kds.ip === ip ? { ...kds, connected } : kds
      );
      
      // 确保更新了子KDS列表
      if (JSON.stringify(updatedList) !== JSON.stringify(this.subKdsList)) {
        this.subKdsList = updatedList;
        
        // 保存更新后的子KDS列表
        await AsyncStorage.setItem("sub_kds_list", JSON.stringify(this.subKdsList));
        console.log(`已保存更新的子KDS列表，共${this.subKdsList.length}个子KDS`);
        
        // 打印连接状态
        for (const kds of this.subKdsList) {
          console.log(`子KDS ${kds.ip} (${kds.category}) 连接状态: ${kds.connected ? '已连接' : '未连接'}`);
        }
      }
      
      console.log(`子KDS ${ip} 连接${connected ? '成功' : '失败'}`);
      
      // 如果连接失败，考虑提醒用户
      if (!connected) {
        // 非阻塞提醒
        console.warn(`无法连接到子KDS: ${ip}`);
      }
    } catch (error) {
      console.error(`连接子KDS失败 ${ip}:`, error);
    }
  }
  
  
  // 处理订单并分发给子KDS
  public static async processAndDistributeOrder(order: FormattedOrder): Promise<void> {
    try {
      console.log(`处理并分发订单: ${order.id}`);
      
      // 检查订单是否已处理
      if (this.isOrderProcessed(order.id)) {
        console.log(`订单 ${order.id} 已处理过，跳过分发`);
        return;
      }
      
      // 分析订单商品中的分类
      console.log(`开始分析订单中的商品分类...`);
      let allOrders = await OrderService.getAllOrders();
      console.log(`总共有 ${allOrders.length} 个订单`);
      
      // 检查当前订单
      let itemCategories = new Set<string>();
      console.log(`订单 ${order.id} 有 ${order.products.length} 个商品`);
      
      // 增强商品分类识别，确保能正确识别饮料类
      for (const product of order.products) {
        console.log(`商品: ${product.name}, 原始分类: ${product.category || 'default'}`);
        
        // 处理分类，确保大小写匹配
        let category = product.category;
        
        // 如果是"drinks"（小写），转换为"Drinks"（首字母大写）
        if (category && category.toLowerCase() === 'drinks') {
          category = 'Drinks';
        }
        
        // 处理"Beverage"到"Drinks"的映射
        if (category && category === 'Beverage') {
          category = 'Drinks';
          // 更新产品分类
          product.category = 'Drinks';
        }
        
        if (category) {
          itemCategories.add(category);
        } else {
          // 根据商品名称判断分类
          if (product.name.toLowerCase().includes('coffee') || 
              product.name.toLowerCase().includes('tea') || 
              product.name.toLowerCase().includes('juice') ||
              product.name.toLowerCase().includes('dew') ||  // 增加Mountain Dew的识别
              product.name.toLowerCase().includes('smoothie') || // 增加Smoothie的识别
              product.name.toLowerCase().includes('crush') ||    // 增加Crush的识别
              product.name.toLowerCase().includes('water')) {    // 增加Water的识别
            itemCategories.add('Drinks');
            product.category = 'Drinks'; // 更新产品分类
          } else {
            itemCategories.add('default');
          }
        }
      }
      
      console.log(`找到的所有分类: ${JSON.stringify(Array.from(itemCategories))}`);
      
      // 检查是否有商品分类
      if (itemCategories.size === 0) {
        console.log(`订单 ${order.id} 没有可分发的商品分类，跳过分发`);
        return;
      }
      
      // 打印子KDS列表和连接状态
      console.log(`当前子KDS列表: ${JSON.stringify(this.subKdsList.map(kds => ({ 
        ip: kds.ip, 
        category: kds.category, 
        connected: kds.connected 
      })))}`);
      
      // 3. 分发到所有连接的子KDS（发送完整订单）
      for (const subKds of this.subKdsList) {
        console.log(`检查子KDS ${subKds.ip}, 品类=${subKds.category}, 连接状态=${subKds.connected}`);
        
        if (!subKds.connected) {
          console.log(`子KDS ${subKds.ip} 未连接，跳过分发`);
          continue;
        }
        
        // 发送完整订单，不再过滤商品
        console.log(`准备向子KDS ${subKds.ip} 发送完整订单，商品数量: ${order.products.length}`);
        
        // 添加子KDS分类信息，以便子KDS可以根据自己的分类过滤显示
        const subOrder: FormattedOrder = {
          ...order,
          id: order.id,
          source: 'tcp',
          orderTime: order.orderTime,
          pickupMethod: order.pickupMethod,
          pickupTime: order.pickupTime,
          order_num: order.order_num,
          targetCategory: subKds.category // 添加目标分类信息
        };
        
        console.log(`子订单已创建，准备发送到子KDS ${subKds.ip}，商品数量: ${subOrder.products.length}`);
        
        // 发送子订单到子KDS
        await this.sendOrderToSubKDS(subKds.ip, subOrder);
      }
      
      // 添加订单ID到处理缓存
      this.addToProcessedCache(order.id);
    } catch (error) {
      console.error("处理并分发订单失败:", error);
    }
  }
  
  // 将订单项按品类分类
  private static categorizeOrderItems(items: OrderItem[]): Record<CategoryType, OrderItem[]> {
    const result: Record<CategoryType, OrderItem[]> = {
      [CategoryType.DRINKS]: [],
      [CategoryType.HOT_FOOD]: [],
      [CategoryType.COLD_FOOD]: [],
      [CategoryType.DESSERT]: [],
      [CategoryType.ALL]: items // 全部品类包含所有项目
    };
    
    for (const item of items) {
      // 首先检查商品是否已有分类
      if (item.category) {
        // 处理分类，确保大小写匹配
        const normalizedCategory = item.category.toLowerCase();
        
        if (normalizedCategory === 'drinks') {
          result[CategoryType.DRINKS].push(item);
          continue;
        }
      }
      
      // 如果没有分类或分类不匹配，根据名称判断
      const itemName = item.name.toLowerCase();
      
      // 增强饮料识别
      if (itemName.includes('coffee') || 
          itemName.includes('tea') || 
          itemName.includes('juice') ||
          itemName.includes('dew') ||    // Mountain Dew
          itemName.includes('soda') ||
          itemName.includes('water') ||
          itemName.includes('drink') ||
          itemName.includes('cola')) {
        result[CategoryType.DRINKS].push(item);
      }
      else if (itemName.includes('cake') || 
               itemName.includes('ice') || 
               itemName.includes('dessert')) {
        result[CategoryType.DESSERT].push(item);
      }
      else if (itemName.includes('salad') || 
               itemName.includes('sandwich')) {
        result[CategoryType.COLD_FOOD].push(item);
      }
      else {
        // 默认归为热食
        result[CategoryType.HOT_FOOD].push(item);
      }
    }
    
    // 打印分类结果
    console.log("商品分类结果:");
    for (const category in result) {
      if (result[category as CategoryType].length > 0) {
        console.log(`${category}: ${result[category as CategoryType].length}个商品`);
      }
    }
    
    return result;
  }
  
  // 发送订单到子KDS
  private static async sendOrderToSubKDS(ip: string, order: FormattedOrder): Promise<void> {
    try {
      console.log(`发送订单 ${order.id} 到子KDS ${ip}`);
      
      // 构建订单消息
      const orderMessage = {
        type: 'order',
        data: order,
        timestamp: new Date().toISOString()
      };
      
      // 发送订单到子KDS
      const success = await TCPSocketService.sendData(ip, orderMessage);
      
      if (success) {
        console.log(`订单 ${order.id} 成功发送到子KDS ${ip}`);
      } else {
        console.error(`发送订单到子KDS ${ip} 失败`);
      }
    } catch (error) {
      console.error(`发送订单到子KDS ${ip} 失败:`, error);
    }
  }
  
  // 关闭分发服务
  public static async shutdown(): Promise<void> {
    try {
      // 关闭TCP服务
      TCPSocketService.shutdown();
      
      this.initialized = false;
      console.log("分发服务已关闭");
    } catch (error) {
      console.error("关闭分发服务失败:", error);
    }
  }


  // 检查是否为主KDS
  public static isMaster(): boolean {
    return this.role === KDSRole.MASTER;
  }
  
  // 获取子KDS列表
  public static getSubKdsList(): SubKDSInfo[] {
    return [...this.subKdsList];
  }
  
  // 手动添加子KDS (用于设置界面)
  public static async addSubKDS(ip: string, category: CategoryType): Promise<boolean> {
    try {
      // 检查是否已存在
      if (this.subKdsList.some(kds => kds.ip === ip)) {
        console.warn(`子KDS ${ip} 已存在`);
        return false;
      }
      
      // 添加新的子KDS
      this.subKdsList.push({
        ip,
        category,
        connected: false
      });
      
      // 保存到存储
      await AsyncStorage.setItem("sub_kds_list", JSON.stringify(this.subKdsList));
      
      // 如果已初始化，则尝试连接
      if (this.initialized && this.role === KDSRole.MASTER) {
        this.connectToSubKDS(ip, category);
      }
      
      return true;
    } catch (error) {
      console.error(`添加子KDS失败:`, error);
      return false;
    }
  }
  
  // 移除子KDS
  public static async removeSubKDS(ip: string): Promise<boolean> {
    try {
      this.subKdsList = this.subKdsList.filter(kds => kds.ip !== ip);
      await AsyncStorage.setItem("sub_kds_list", JSON.stringify(this.subKdsList));
      return true;
    } catch (error) {
      console.error(`移除子KDS失败:`, error);
      return false;
    }
  }
} 