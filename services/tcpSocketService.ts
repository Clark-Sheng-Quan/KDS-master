import TcpSocket from 'react-native-tcp-socket';
import { CategoryType } from './distributionService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TCP服务器配置
const TCP_PORT = 4322;
// 重连配置
const RECONNECT_INTERVAL = 5000; // 5秒后尝试重连
const MAX_RECONNECT_ATTEMPTS = 10; // 最大重连次数

export class TCPSocketService {
  // 服务器实例
  private static server: any = null;
  // 客户端连接实例
  private static clients: Map<string, any> = new Map();
  // 主服务器连接
  private static masterConnection: any = null;
  // 主KDS的IP地址
  private static masterIP: string = "";
  // 持久连接池 - 保存与子KDS的持久连接
  private static persistentConnections: Map<string, any> = new Map();
  // 重连计数器
  private static reconnectAttempts: Map<string, number> = new Map();
  // 重连定时器
  private static reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  // 回调函数
  private static orderCallback: ((order: any) => void) | null = null;
  // 新增：子KDS注册回调
  private static registrationCallback: ((ip: string, category: CategoryType) => void) | null = null;
  // 添加订单回调函数数组
  private static orderCallbacks: ((order: any) => void)[] = [];
  
  /**
   * 启动TCP服务器（Master模式）
   */
  public static startServer(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        // 如果服务器已启动，先关闭
        if (this.server) {
          this.server.close();
          this.server = null;
        }
        
        // 创建新的服务器
        this.server = TcpSocket.createServer((socket) => {
          const clientKey = `${socket.remoteAddress}:${socket.remotePort}`;
          console.log(`[TCP] 新客户端连接: ${clientKey}`);
          
          // 保存客户端连接
          this.clients.set(clientKey, socket);
          
          // 接收数据
          socket.on('data', (data: string | Buffer) => {
            try {
              const message = typeof data === 'string' ? data : data.toString('utf8');
              console.log(`[TCP] 收到来自 ${clientKey} 的数据:`, message);
              
              // 尝试解析JSON
              const jsonData = JSON.parse(message);
              
              // 处理注册消息
              if (jsonData.type === 'registration') {
                console.log(`[TCP] 收到注册消息:`, jsonData);
                
                // 提取客户端IP地址 (移除端口部分)
                const clientIP = socket.remoteAddress?.split(':').pop() || '';
                
                // 从消息中获取品类，默认为ALL
                const category = jsonData.category || 'all';
                
                // 发送注册确认
                socket.write(JSON.stringify({
                  type: 'registration_ack',
                  status: 'accepted',
                  timestamp: new Date().toISOString()
                }));
                
                // 如果设置了注册回调，触发回调
                if (this.registrationCallback) {
                  this.registrationCallback(clientIP, category as CategoryType);
                }
                
                // 将此连接添加到持久连接池
                const baseIP = clientIP;
                this.persistentConnections.set(baseIP, socket);
                console.log(`[TCP] 已将 ${baseIP} 添加到持久连接池`);
                
                return; // 处理完注册消息后返回
              }
              
              // 处理订单确认消息
              if (jsonData.type === 'order_ack') {
                console.log(`[TCP] 收到订单确认:`, jsonData);
                this.executeOrderCallbacks(jsonData);
                return; // 处理完订单确认后返回
              }
              
              // 处理商品完成状态消息
              if (jsonData.type === 'order_items_completed') {
                console.log(`[TCP] 收到商品完成状态消息:`, jsonData);
                this.executeOrderCallbacks(jsonData);
                return; // 处理完商品完成状态后返回
              }
              
              // 处理心跳消息
              if (jsonData.type === 'heartbeat') {
                console.log(`[TCP] 收到心跳消息，回复确认`);
                socket.write(JSON.stringify({
                  type: 'heartbeat_ack',
                  timestamp: new Date().toISOString()
                }));
                return;
              }
              
              // 处理订单消息 - 添加更严格的检查
              if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
                console.log(`[TCP] 收到订单消息，订单ID: ${jsonData.data.id}`);
                this.executeOrderCallbacks(jsonData.data);
              
              // 返回确认消息
                socket.write(JSON.stringify({ 
                  type: 'order_ack',
                  orderId: jsonData.data.id,
                  status: 'received', 
                  timestamp: new Date().toISOString() 
                }));
                return;
              }
              
              // 处理其他未知类型的消息
              console.log(`[TCP] 收到未知类型消息:`, jsonData.type || "无类型");
              socket.write(JSON.stringify({ 
                status: 'received', 
                message: 'unknown_message_type',
                timestamp: new Date().toISOString() 
              }));
            } catch (error) {
              console.error(`[TCP] 解析数据失败:`, error);
              socket.write(JSON.stringify({ status: 'error', message: '无效的JSON数据' }));
            }
          });
          
          // 错误处理
          socket.on('error', (error: Error) => {
            console.error(`[TCP] 客户端 ${clientKey} 连接错误:`, error);
            this.clients.delete(clientKey);
            
            // 从持久连接池中移除
            const baseIP = socket.remoteAddress?.split(':').pop() || '';
            if (this.persistentConnections.has(baseIP)) {
              this.persistentConnections.delete(baseIP);
              console.log(`[TCP] 已从持久连接池移除 ${baseIP}`);
            }
          });
          
          // 连接关闭
          socket.on('close', () => {
            console.log(`[TCP] 客户端 ${clientKey} 连接关闭`);
            this.clients.delete(clientKey);
            
            // 从持久连接池中移除
            const baseIP = socket.remoteAddress?.split(':').pop() || '';
            if (this.persistentConnections.has(baseIP)) {
              this.persistentConnections.delete(baseIP);
              console.log(`[TCP] 已从持久连接池移除 ${baseIP}`);
            }
          });
        });
        
        // 服务器错误处理
        this.server.on('error', (error: Error) => {
          console.error('[TCP] 服务器错误:', error);
          reject(error);
        });
        
        // 启动服务器
        this.server.listen(TCP_PORT, '0.0.0.0', () => {
          console.log(`[TCP] 服务器启动成功，监听端口: ${TCP_PORT}`);
          resolve(true);
        });
        
        // 启动心跳检测
        this.startHeartbeat();
      } catch (error) {
        console.error('[TCP] 启动服务器失败:', error);
        reject(error);
      }
    });
  }
  
  /**
   * 发送心跳包到所有持久连接
   */
  private static startHeartbeat() {
    // 每30秒发送一次心跳
    setInterval(() => {
      if (this.persistentConnections.size > 0) {
        console.log(`[TCP] 发送心跳到 ${this.persistentConnections.size} 个持久连接`);
        
        for (const [ip, connection] of this.persistentConnections.entries()) {
          try {
            connection.write(JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString()
            }));
          } catch (error) {
            console.error(`[TCP] 发送心跳到 ${ip} 失败:`, error);
          }
        }
      }
    }, 30000); // 30秒
  }
  
  /**
   * 连接到主KDS（Slave模式）
   */
  public static connectToMaster(masterIP: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        // 保存主KDS的IP地址
        this.masterIP = masterIP;
        
        // 如果已有连接，先关闭
        if (this.masterConnection) {
          this.masterConnection.destroy();
          this.masterConnection = null;
        }
        
        // 重置重连计数器
        this.reconnectAttempts.set(masterIP, 0);
        
        // 获取子KDS分类设置
        const categoryStr = await AsyncStorage.getItem("kds_category");
        const category = categoryStr || 'Drinks'; // 默认为Drinks分类
        
        // 创建新连接
        this.masterConnection = TcpSocket.createConnection({
          host: masterIP,
          port: TCP_PORT,
          tls: false
        }, () => {
          console.log(`[TCP] 成功连接到主KDS: ${masterIP}:${TCP_PORT}`);
          
          // 重置重连计数器
          this.reconnectAttempts.set(masterIP, 0);
          
          // 发送注册消息
          const registrationMessage = {
            type: 'registration',
            role: 'slave',
            category: category, // 使用从AsyncStorage获取的分类
            timestamp: new Date().toISOString()
          };
          
          this.masterConnection.write(JSON.stringify(registrationMessage));
          resolve(true);
        });
        
        // 接收数据
        this.masterConnection.on('data', (data: string | Buffer) => {
          try {
            const message = typeof data === 'string' ? data : data.toString('utf8');
            console.log(`[TCP] 收到来自主KDS的数据:`, message);
            
            // 尝试解析JSON
            const jsonData = JSON.parse(message);
            
            // 处理心跳消息
            if (jsonData.type === 'heartbeat') {
              console.log(`[TCP] 收到主KDS心跳，发送确认`);
              this.masterConnection.write(JSON.stringify({
                type: 'heartbeat_ack',
                timestamp: new Date().toISOString()
              }));
              return;
            }
            
            // 处理订单数据 - 添加更严格的检查
            if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
              const orderId = jsonData.data.id;
              console.log(`[TCP] 收到订单数据，准备处理: ${orderId}`);
              
              // 检查是否处理过此订单
              const processedKey = `processed_${orderId}`;
              if (this.masterConnection[processedKey]) {
                console.log(`[TCP] 订单 ${orderId} 已处理过，跳过`);
                return;
              }
              
              // 标记为已处理
              this.masterConnection[processedKey] = true;
              
              // 处理订单数据
              this.executeOrderCallbacks(jsonData.data);
              
              // 发送确认消息
              this.masterConnection.write(JSON.stringify({
                type: 'order_ack',
                orderId: orderId,
                status: 'received',
                timestamp: new Date().toISOString()
              }));
              return;
            }
            
            // 处理其他类型的消息
            console.log(`[TCP] 收到未知类型消息:`, jsonData.type || "无类型");
          } catch (error) {
            console.error(`[TCP] 解析数据失败:`, error);
          }
        });
        
        // 错误处理
        this.masterConnection.on('error', (error: Error) => {
          console.error('[TCP] 连接主KDS错误:', error);
          this.masterConnection = null;
          
          // 启动重连
          this.scheduleReconnect(masterIP);
          
          resolve(false);
        });
        
        // 连接关闭
        this.masterConnection.on('close', () => {
          console.log('[TCP] 与主KDS的连接已关闭');
          this.masterConnection = null;
          
          // 启动重连
          this.scheduleReconnect(masterIP);
        });
      } catch (error) {
        console.error('[TCP] 连接主KDS失败:', error);
        
        // 启动重连
        this.scheduleReconnect(masterIP);
        
        reject(error);
      }
    });
  }
  
  /**
   * 安排重连
   */
  private static scheduleReconnect(ip: string) {
    // 获取当前重连次数
    const attempts = this.reconnectAttempts.get(ip) || 0;
    
    // 如果超过最大重连次数，停止重连
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[TCP] 已达到最大重连次数 (${MAX_RECONNECT_ATTEMPTS})，停止重连到 ${ip}`);
      return;
    }
    
    // 增加重连次数
    this.reconnectAttempts.set(ip, attempts + 1);
    
    // 清除之前的定时器
    if (this.reconnectTimers.has(ip)) {
      clearTimeout(this.reconnectTimers.get(ip)!);
    }
    
    console.log(`[TCP] 安排重连到 ${ip}，第 ${attempts + 1} 次尝试，将在 ${RECONNECT_INTERVAL}ms 后执行`);
    
    // 设置新的定时器
    const timer = setTimeout(() => {
      console.log(`[TCP] 正在尝试重连到 ${ip}...`);
      
      if (ip === this.masterIP) {
        // 重连到主KDS
        this.connectToMaster(ip).catch(error => {
          console.error(`[TCP] 重连到主KDS失败:`, error);
        });
      }
    }, RECONNECT_INTERVAL);
    
    this.reconnectTimers.set(ip, timer);
  }
  
  /**
   * 设置订单回调函数
   */
  public static setOrderCallback(callback: (order: any) => void): void {
    // 保留旧的单一回调方式，同时支持多回调
    this.orderCallback = callback;
    
    // 添加到回调数组
    if (!this.orderCallbacks.includes(callback)) {
      this.orderCallbacks.push(callback);
    }
  }
  
  /**
   * 执行所有订单回调函数
   */
  private static executeOrderCallbacks(data: any): void {
    // 执行单一回调
    if (this.orderCallback) {
      this.orderCallback(data);
    }
    
    // 执行所有回调
    for (const callback of this.orderCallbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('[TCP] 执行订单回调失败:', error);
      }
    }
  }
  
  /**
   * 设置子KDS注册回调函数
   */
  public static setRegistrationCallback(callback: (ip: string, category: CategoryType) => void): void {
    this.registrationCallback = callback;
  }
  
  /**
   * 向指定IP发送数据
   */
  public static sendData(ip: string, data: any): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        // 如果是本地测试环境，统一使用127.0.0.1进行连接，但保留原始IP用于显示
        const actualIP = (ip === '127.0.0.100' || ip.startsWith('192.168.')) ? '127.0.0.1' : ip;
        
        console.log(`[TCP] 尝试向 ${ip} 发送数据...`);
        
        // 检查是否有持久连接
        if (this.persistentConnections.has(ip)) {
          const socket = this.persistentConnections.get(ip);
          if (socket && !socket.destroyed) {
            socket.write(JSON.stringify(data));
            console.log(`[TCP] 使用持久连接发送数据到 ${ip} 成功`);
            resolve(true);
            return;
          } else {
            // 连接已断开，从连接池中移除
            this.persistentConnections.delete(ip);
            console.log(`[TCP] 持久连接到 ${ip} 已断开，从连接池中移除`);
          }
        }
        
        // 创建新连接
        console.log(`[TCP] 未找到已连接的客户端，创建持久连接到 ${ip}:${TCP_PORT}`);
        
        // 使用转换后的IP进行实际连接
        if (actualIP !== ip) {
          console.log(`[TCP] 实际连接目标IP: ${actualIP} (原始IP: ${ip})`);
        }
        
        const socket = TcpSocket.createConnection({
          host: actualIP,
          port: TCP_PORT,
          tls: false
        }, () => {
          // 发送数据
          socket.write(JSON.stringify(data));
          console.log(`[TCP] 持久连接到 ${ip}:${TCP_PORT} 成功`);
          
          // 添加到持久连接池
          this.persistentConnections.set(ip, socket);
          console.log(`[TCP] 已将 ${ip} 添加到持久连接池`);
          
          // 设置错误处理
          socket.on('error', (err) => {
            console.error(`[TCP] 持久连接到 ${ip} 错误:`, err);
            this.persistentConnections.delete(ip);
            this.scheduleReconnect(ip);
          });
          
          // 设置关闭处理
          socket.on('close', () => {
            console.log(`[TCP] 持久连接到 ${ip} 已关闭`);
            this.persistentConnections.delete(ip);
            this.scheduleReconnect(ip);
          });
          
          resolve(true);
        });
      } catch (error) {
        console.error(`[TCP] 发送数据到 ${ip} 失败:`, error);
        resolve(false);
      }
    });
  }
  
  /**
   * 广播数据到所有连接的客户端
   */
  public static broadcastData(data: any): void {
    // 广播到所有常规客户端
    for (const [clientKey, client] of this.clients.entries()) {
      try {
        client.write(JSON.stringify(data));
      } catch (error) {
        console.error(`[TCP] 向 ${clientKey} 广播数据失败:`, error);
      }
    }
    
    // 广播到所有持久连接
    for (const [ip, connection] of this.persistentConnections.entries()) {
      try {
        connection.write(JSON.stringify(data));
      } catch (error) {
        console.error(`[TCP] 向持久连接 ${ip} 广播数据失败:`, error);
      }
    }
  }
  
  /**
   * 关闭服务器和所有连接
   */
  public static shutdown(): void {
    // 关闭所有客户端连接
    for (const [clientKey, client] of this.clients.entries()) {
      try {
        client.destroy();
        console.log(`[TCP] 关闭与 ${clientKey} 的连接`);
      } catch (error) {
        console.error(`[TCP] 关闭与 ${clientKey} 的连接失败:`, error);
      }
    }
    
    // 清空客户端列表
    this.clients.clear();
    
    // 关闭所有持久连接
    for (const [ip, connection] of this.persistentConnections.entries()) {
      try {
        connection.destroy();
        console.log(`[TCP] 关闭与 ${ip} 的持久连接`);
      } catch (error) {
        console.error(`[TCP] 关闭与 ${ip} 的持久连接失败:`, error);
      }
    }
    
    // 清空持久连接池
    this.persistentConnections.clear();
    
    // 关闭与主KDS的连接
    if (this.masterConnection) {
      this.masterConnection.destroy();
      this.masterConnection = null;
    }
    
    // 清除所有重连定时器
    for (const [ip, timer] of this.reconnectTimers.entries()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    
    // 关闭服务器
    if (this.server) {
      this.server.close(() => {
        console.log('[TCP] 服务器已关闭');
      });
      this.server = null;
    }
  }

  /**
   * 从slave KDS向master KDS发送订单商品完成状态
   */
  public static async sendOrderItemsCompleted(orderId: string, completedItems: { [key: string]: boolean }): Promise<boolean> {
    try {
      if (!this.masterIP) {
        console.error('[TCP] 未设置主KDS IP，无法发送商品完成状态');
        return false;
      }
      
      console.log(`[TCP] 向主KDS发送订单 ${orderId} 的商品完成状态`);
      
      // 构建商品完成状态消息
      const message = {
        type: 'order_items_completed',
        orderId,
        completedItems,
        timestamp: new Date().toISOString()
      };
      
      // 发送到主KDS
      return await this.sendData(this.masterIP, message);
    } catch (error) {
      console.error('[TCP] 发送商品完成状态失败:', error);
      return false;
    }
  }
} 