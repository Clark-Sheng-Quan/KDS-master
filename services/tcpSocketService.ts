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
  // 连接请求回调 - 当Slave收到Master连接请求时调用
  private static connectionRequestCallback: ((masterIP: string, masterName: string) => Promise<boolean>) | null = null;
  // 连接状态变化回调
  private static connectionStatusCallback: ((status: 'connected' | 'disconnected' | 'pending') => void) | null = null;
  // 子设备连接状态回调 - Master端监听Slave的连接状态
  private static slaveConnectionStatusCallback: ((slaveIP: string, status: 'connected' | 'disconnected' | 'pending', slaveName?: string) => void) | null = null;
  // 连接请求超时定时器 - 保存pending连接的超时定时器
  private static connectionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
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
          
          // 为每个连接添加数据缓冲区，用于处理粘包问题
          let dataBuffer = '';
          
          // 接收数据
          socket.on('data', (data: string | Buffer) => {
            try {
              const chunk = typeof data === 'string' ? data : data.toString('utf8');
              dataBuffer += chunk;
              console.log(`[TCP] 收到数据片段:`, chunk);
              
              // 尝试解析多条JSON消息（通过计算括号匹配）
              let processedIndex = 0;
              let braceCount = 0;
              let inString = false;
              let escape = false;
              
              for (let i = processedIndex; i < dataBuffer.length; i++) {
                const char = dataBuffer[i];
                
                // 处理转义字符
                if (escape) {
                  escape = false;
                  continue;
                }
                
                if (char === '\\') {
                  escape = true;
                  continue;
                }
                
                // 处理字符串
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                
                // 只在字符串外处理括号
                if (!inString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    
                    // 当括号完全匹配时，表示一条完整的消息
                    if (braceCount === 0) {
                      try {
                        const jsonString = dataBuffer.substring(processedIndex, i + 1);
                        const jsonData = JSON.parse(jsonString);
                        console.log(`[TCP] 成功解析消息:`, jsonString);
                        
                        // 处理此 JSON 数据
                        this.handleTcpMessage(jsonData, socket, clientKey);
                        
                        processedIndex = i + 1;
                      } catch (e) {
                        console.error(`[TCP] JSON解析失败:`, e);
                        break;
                      }
                    }
                  }
                }
              }
              
              // 移除已处理的数据
              dataBuffer = dataBuffer.substring(processedIndex);
            } catch (error) {
              console.error(`[TCP] 数据处理出错:`, error);
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
   * 处理单条TCP消息
   */
  private static handleTcpMessage(jsonData: any, socket: any, clientKey: string) {
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
      return;
    }

    // 处理连接请求响应消息（Master收到Slave的回复）
    if (jsonData.type === 'connection_response') {
      console.log(`[TCP] 收到连接响应:`, jsonData);
      const clientIP = socket.remoteAddress?.split(':').pop() || '';
      const slaveName = jsonData.slaveName || clientIP;
      
      // 清除连接超时定时器
      if (this.connectionTimeouts.has(clientIP)) {
        clearTimeout(this.connectionTimeouts.get(clientIP)!);
        this.connectionTimeouts.delete(clientIP);
        console.log(`[TCP] 已清除 ${clientIP} 的连接超时定时器`);
      }
      
      if (jsonData.accepted) {
        console.log(`[TCP] Slave ${clientIP} (${slaveName}) 已接受连接`);
        this.connectionStatusCallback?.('connected');
        // 通知Master端该Slave设备已连接
        this.slaveConnectionStatusCallback?.(clientIP, 'connected', slaveName);
      } else {
        console.log(`[TCP] Slave ${clientIP} (${slaveName}) 已拒绝连接`);
        this.connectionStatusCallback?.('disconnected');
        // 通知Master端该Slave设备已断开
        this.slaveConnectionStatusCallback?.(clientIP, 'disconnected', slaveName);
      }
      return;
    }
    
    // 处理订单确认消息
    if (jsonData.type === 'order_ack') {
      console.log(`[TCP] 收到订单确认:`, jsonData);
      this.executeOrderCallbacks(jsonData);
      return;
    }
    
    // 处理商品完成状态消息
    if (jsonData.type === 'order_items_completed') {
      console.log(`[TCP] 收到商品完成状态消息:`, jsonData);
      this.executeOrderCallbacks(jsonData);
      return;
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
    
    // 处理订单消息
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
  }

  /**
   * 处理来自Master的消息（Slave模式）
   */
  private static handleMasterMessage(jsonData: any) {
    // 处理连接请求消息（Slave收到Master的连接请求）
    if (jsonData.type === 'connection_request') {
      console.log(`[TCP] 收到连接请求:`, jsonData);
      const masterIP = jsonData.masterIP;
      const masterName = jsonData.masterName || '主屏';
      
      // 调用回调，让UI弹出确认对话框
      if (this.connectionRequestCallback) {
        this.connectionRequestCallback(masterIP, masterName).then((accepted) => {
          // 发送响应
          if (this.masterConnection) {
            this.masterConnection.write(JSON.stringify({
              type: 'connection_response',
              accepted: accepted,
              slaveName: this.getSlaveName(),
              timestamp: new Date().toISOString()
            }));
          }
          
          if (accepted) {
            console.log(`[TCP] 已接受来自 ${masterIP} 的连接请求`);
            this.connectionStatusCallback?.('connected');
          } else {
            console.log(`[TCP] 已拒绝来自 ${masterIP} 的连接请求`);
            this.connectionStatusCallback?.('disconnected');
          }
        });
      }
      return;
    }
    
    // 处理心跳消息
    if (jsonData.type === 'heartbeat') {
      console.log(`[TCP] 收到主KDS心跳，发送确认`);
      if (this.masterConnection) {
        this.masterConnection.write(JSON.stringify({
          type: 'heartbeat_ack',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // 处理订单数据 - 添加更严格的检查
    if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      const orderId = jsonData.data.id;
      console.log(`[TCP] 收到订单数据，准备处理: ${orderId}`);
      
      // 检查是否处理过此订单
      const processedKey = `processed_${orderId}`;
      if (this.masterConnection && this.masterConnection[processedKey]) {
        console.log(`[TCP] 订单 ${orderId} 已处理过，跳过`);
        return;
      }
      
      // 标记为已处理
      if (this.masterConnection) {
        this.masterConnection[processedKey] = true;
      }
      
      // 处理订单数据
      this.executeOrderCallbacks(jsonData.data);
      
      // 发送确认消息
      if (this.masterConnection) {
        this.masterConnection.write(JSON.stringify({
          type: 'order_ack',
          orderId: orderId,
          status: 'received',
          timestamp: new Date().toISOString()
        }));
      }
      return;
    }
    
    // 处理其他类型的消息
    console.log(`[TCP] 收到来自主KDS的未知类型消息:`, jsonData.type || "无类型");
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
        
        // 为连接添加数据缓冲区，用于处理粘包问题
        let masterDataBuffer = '';
        
        // 接收数据
        this.masterConnection.on('data', (data: string | Buffer) => {
          try {
            const chunk = typeof data === 'string' ? data : data.toString('utf8');
            masterDataBuffer += chunk;
            console.log(`[TCP] 收到来自主KDS的数据:`, chunk);
            
            // 尝试解析多条JSON消息（通过计算括号匹配）
            let processedIndex = 0;
            let braceCount = 0;
            let inString = false;
            let escape = false;
            
            for (let i = processedIndex; i < masterDataBuffer.length; i++) {
              const char = masterDataBuffer[i];
              
              // 处理转义字符
              if (escape) {
                escape = false;
                continue;
              }
              
              if (char === '\\') {
                escape = true;
                continue;
              }
              
              // 处理字符串
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              // 只在字符串外处理括号
              if (!inString) {
                if (char === '{') {
                  braceCount++;
                } else if (char === '}') {
                  braceCount--;
                  
                  // 当括号完全匹配时，表示一条完整的消息
                  if (braceCount === 0) {
                    try {
                      const jsonString = masterDataBuffer.substring(processedIndex, i + 1);
                      const jsonData = JSON.parse(jsonString);
                      console.log(`[TCP] 成功解析来自主KDS的消息:`, jsonString);
                      
                      // 处理此 JSON 数据
                      this.handleMasterMessage(jsonData);
                      
                      processedIndex = i + 1;
                    } catch (e) {
                      console.error(`[TCP] JSON解析失败:`, e);
                      break;
                    }
                  }
                }
              }
            }
            
            // 移除已处理的数据
            masterDataBuffer = masterDataBuffer.substring(processedIndex);
          } catch (error) {
            console.error(`[TCP] 数据处理出错:`, error);
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
   * 设置连接请求回调 - Slave端接收Master连接请求时调用
   */
  public static setConnectionRequestCallback(callback: (masterIP: string, masterName: string) => Promise<boolean>): void {
    this.connectionRequestCallback = callback;
  }

  /**
   * 设置连接状态回调 - 连接状态变化时调用
   */
  public static setConnectionStatusCallback(callback: (status: 'connected' | 'disconnected' | 'pending') => void): void {
    this.connectionStatusCallback = callback;
  }

  /**
   * 设置子设备连接状态回调 - Master端监听Slave的连接状态
   */
  public static setSlaveConnectionStatusCallback(callback: (slaveIP: string, status: 'connected' | 'disconnected' | 'pending', slaveName?: string) => void): void {
    this.slaveConnectionStatusCallback = callback;
  }

  /**
   * Master发送连接请求给Slave
   */
  public static async sendConnectionRequest(slaveIP: string, masterIP: string, masterName: string, slaveName: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      try {
        console.log(`[TCP] Master发送连接请求到Slave ${slaveIP}...`);
        console.log(`[TCP] slaveConnectionStatusCallback是否存在:`, this.slaveConnectionStatusCallback !== null);
        
        // 清除之前的超时定时器（如果有）
        if (this.connectionTimeouts.has(slaveIP)) {
          clearTimeout(this.connectionTimeouts.get(slaveIP)!);
        }
        
        // 构建连接请求消息
        const message = {
          type: 'connection_request',
          masterIP: masterIP,
          masterName: masterName,
          timestamp: new Date().toISOString()
        };
        
        // 发送连接请求
        const sent = await this.sendData(slaveIP, message);
        
        if (sent) {
          console.log(`[TCP] 连接请求已发送到 ${slaveIP}`);
          // 连接请求已发送，实际的连接状态会通过handleClientMessage中的connection_response回调更新
          // 这里设置为pending状态
          this.connectionStatusCallback?.('pending');
          
          // 设置10秒超时用于测试，如果没有收到响应则自动失败
          const timeoutTimer = setTimeout(() => {
            console.log(`[TCP] 连接请求到 ${slaveIP} 已超时（10秒）`);
            this.connectionTimeouts.delete(slaveIP);
            // 通知Master该设备连接失败
            console.log(`[TCP] 调用slaveConnectionStatusCallback，设置为disconnected`);
            this.slaveConnectionStatusCallback?.(slaveIP, 'disconnected', slaveName);
          }, 10000); // 10秒用于测试
          
          this.connectionTimeouts.set(slaveIP, timeoutTimer);
          console.log(`[TCP] 已设置${slaveIP}的超时定时器`);
          resolve(true);
        } else {
          console.error(`[TCP] 发送连接请求到 ${slaveIP} 失败`);
          resolve(false);
        }
      } catch (error) {
        console.error(`[TCP] 发送连接请求时出错:`, error);
        resolve(false);
      }
    });
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
   * 获取Slave设备名称
   */
  private static getSlaveName(): string {
    // 这将在调用时从AsyncStorage同步获取
    // 由于AsyncStorage是异步的，这里返回一个默认值
    // 实际的名称应该在初始化时从AsyncStorage读取
    return 'Slave KDS';
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

    // 清除所有连接超时定时器
    for (const [ip, timer] of this.connectionTimeouts.entries()) {
      clearTimeout(timer);
    }
    this.connectionTimeouts.clear();
    
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