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
  // 连接状态变化回调
  private static connectionStatusCallback: ((status: 'connected' | 'disconnected') => void) | null = null;
  // 子设备连接状态回调 - Master端监听Slave的连接状态
  private static slaveConnectionStatusCallback: ((slaveIP: string, status: 'connected' | 'disconnected', slaveName?: string) => void) | null = null;
  // 当前连接状态
  private static currentConnectionStatus: 'connected' | 'disconnected' = 'disconnected';
  // 连接警告/错误回调
  private static connectionErrorCallback: ((message: string) => void) | null = null;
  // 心跳超时定时器 - 用于检测Slave端是否持续收到心跳
  private static heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  // 心跳超时时间（30秒未收到心跳则认为连接断开，触发重连）
  private static readonly HEARTBEAT_TIMEOUT = 30000;
  
  private static sanitizeIP(rawIP?: string | null): string {
    if (!rawIP) {
      return '';
    }

    let ip = rawIP;

    const zoneIndex = ip.indexOf('%');
    if (zoneIndex !== -1) {
      ip = ip.substring(0, zoneIndex);
    }

    if (ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }

    if (ip.includes(':')) {
      const parts = ip.split(':');
      ip = parts[parts.length - 1] || ip;
    }

    return ip;
  }

  private static getSocketIP(socket: any, fallback?: string): string {
    if (!socket) {
      return this.sanitizeIP(fallback);
    }

    return this.sanitizeIP(socket.remoteAddress || fallback);
  }

  private static handleSlaveConnectionLoss(ip: string, reason: string): void {
    const normalized = this.sanitizeIP(ip);
    if (!normalized || normalized === this.masterIP) {
      return;
    }

    if (this.persistentConnections.has(normalized)) {
      const connection = this.persistentConnections.get(normalized);
      if (!connection || connection.destroyed) {
        this.persistentConnections.delete(normalized);
      }
    }

    console.log(`[TCP] Client ${normalized} connection lost (${reason})`);
    
    // Only trigger callback if set (only set in Master mode)
    if (this.slaveConnectionStatusCallback) {
      this.slaveConnectionStatusCallback(normalized, 'disconnected');
    }
  }

  /**
   * 重置Slave端的心跳超时定时器
   * 每次收到心跳时调用，确保连接状态为 connected
   * 如果30秒内未收到心跳，则触发重连
   */
  private static resetHeartbeatTimeout(): void {
    // 清除旧的超时定时器
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    // 更新连接状态为 connected
    if (this.currentConnectionStatus !== 'connected') {
      this.currentConnectionStatus = 'connected';
      this.connectionStatusCallback?.('connected');
    }

    // Set new timeout timer
    this.heartbeatTimeout = setTimeout(() => {
      console.warn(`[TCP] Slave did not receive heartbeat within ${this.HEARTBEAT_TIMEOUT}ms, marking as disconnected and triggering reconnect`);
      this.currentConnectionStatus = 'disconnected';
      this.connectionStatusCallback?.('disconnected');
      
      // Trigger reconnection (if masterIP is saved)
      if (this.masterIP) {
        console.log(`[TCP] Heartbeat timeout, starting auto-reconnect to ${this.masterIP}`);
        this.scheduleReconnect(this.masterIP);
      }
    }, this.HEARTBEAT_TIMEOUT);
  }

  /**
   * 通用JSON流解析器 - 处理TCP粘包问题
   * @param buffer 数据缓冲区
   * @param onMessage 处理单条JSON消息的回调
   * @returns 更新后的缓冲区
   */
  private static parseJsonStream(
    buffer: string,
    onMessage: (jsonData: any) => void
  ): string {
    let processedIndex = 0;
    let braceCount = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;

          if (braceCount === 0) {
            try {
              const jsonString = buffer.substring(processedIndex, i + 1);
              const jsonData = JSON.parse(jsonString);

              // 只处理非空对象
              if (Object.keys(jsonData).length > 0) {
                onMessage(jsonData);
              }

              processedIndex = i + 1;
            } catch (e) {
              console.error(`[TCP] JSON解析失败:`, e);
              break;
            }
          }
        }
      }
    }

    return buffer.substring(processedIndex);
  }

  /**
   * 构造带时间戳的JSON消息
   */
  private static createMessage(type: string, data?: any): string {
    return JSON.stringify({
      type,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Clean up persistent connection
   */
  private static cleanupPersistentConnection(ip: string, reason: string): void {
    const normalizedIP = this.sanitizeIP(ip);
    if (this.persistentConnections.has(normalizedIP)) {
      this.persistentConnections.delete(normalizedIP);
      console.log(`[TCP] Removed ${normalizedIP} from persistent connection pool (${reason})`);
    }
  }

  /**
   * Setup socket event handlers (error and close)
   */
  private static setupSocketErrorHandlers(socket: any, identifier: string): void {
    socket.on('error', (error: Error) => {
      console.error(`[TCP] ${identifier} connection error:`, error);
      const ip = this.getSocketIP(socket);
      this.cleanupPersistentConnection(ip, 'error');
      this.handleSlaveConnectionLoss(ip, 'error');
    });

    socket.on('close', () => {
      console.log(`[TCP] ${identifier} connection closed`);
      const ip = this.getSocketIP(socket);
      this.cleanupPersistentConnection(ip, 'close');
      this.handleSlaveConnectionLoss(ip, 'close');
    });
  }

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
        
        // Create new server
        this.server = TcpSocket.createServer((socket) => {
          const remoteIP = this.getSocketIP(socket);
          const clientKey = `${remoteIP}:${socket.remotePort}`;
          console.log(`[TCP] New client connected: ${clientKey}`);
          
          // Save client connection
          this.clients.set(clientKey, socket);
          
          // 为每个连接添加数据缓冲区，用于处理粘包问题
          let dataBuffer = '';
          
          // 接收数据
          socket.on('data', (data: string | Buffer) => {
            try {
              const chunk = typeof data === 'string' ? data : data.toString('utf8');
              
              // Debug: Print received raw data
              console.log(`[TCP] Received raw data from ${clientKey}:`, chunk);
              console.log(`[TCP] Data length: ${chunk.length}, first 100 chars:`, chunk.substring(0, 100));
              
              // 过滤掉空白字符的数据
              if (chunk.trim() === '') {
                return;
              }
              
              // 立即发送响应确认收到数据
              const response = JSON.stringify({
                status: 'success',
                type: 'ack',
                message: 'Data received successfully',
                receivedLength: chunk.length,
                timestamp: new Date().toISOString()
              });
              socket.write(response);
              console.log(`[TCP] Sent ACK response to ${clientKey}:`, response);
              
              // 尝试解析JSON（如果不是JSON也不会报错）
              dataBuffer += chunk;
              try {
                dataBuffer = this.parseJsonStream(dataBuffer, (jsonData) => {
                  this.handleTcpMessage(jsonData, socket, clientKey);
                });
              } catch (parseError) {
                console.log(`[TCP] Data is not JSON format, ignoring parse error`);
                // 清空buffer避免累积
                dataBuffer = '';
              }
            } catch (error) {
              console.error(`[TCP] Error processing data:`, error);
            }
          });
          
          // 设置错误和关闭处理
          this.setupSocketErrorHandlers(socket, `客户端 ${clientKey}`);
          
          // 额外处理：从clients Map中移除
          socket.on('error', () => this.clients.delete(clientKey));
          socket.on('close', () => this.clients.delete(clientKey));
        });
        
        // 服务器错误处理
        this.server.on('error', (error: Error) => {
          console.error('[TCP] 服务器错误:', error);
          reject(error);
        });
        
        // Start server
        this.server.listen(TCP_PORT, '0.0.0.0', () => {
          console.log(`[TCP] Server started successfully, listening on port: ${TCP_PORT}`);
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
   * Handle single TCP message (Master server receives messages from Slave)
   */
  private static handleTcpMessage(jsonData: any, socket: any, clientKey: string) {
    // Handle registration message (Slave actively connects and registers)
    if (jsonData.type === 'registration') {
      console.log(`[TCP] Received Slave registration:`, jsonData);
      
      // Extract client IP address
      const clientIP = this.getSocketIP(socket);
      
      // Get category from message, default to ALL
      const category = jsonData.category || 'all';
      
      // Send registration confirmation
      socket.write(this.createMessage('registration', {
        status: 'accepted'
      }));
      
      // Trigger registration callback if set
      if (this.registrationCallback) {
        this.registrationCallback(clientIP, category as CategoryType);
      }
      
      // Add connection to persistent connection pool
      const baseIP = clientIP;
      this.persistentConnections.set(baseIP, socket);
      console.log(`[TCP] Added Slave ${baseIP} to persistent connection pool`);
      return;
    }
    
    // Handle order acknowledgment
    if (jsonData.type === 'order_ack') {
      console.log(`[TCP] Received order ACK:`, jsonData);
      this.executeOrderCallbacks(jsonData);
      return;
    }
    
    // Handle order items completed status
    if (jsonData.type === 'order_items_completed') {
      console.log(`[TCP] Received order items completed status:`, jsonData);
      this.executeOrderCallbacks(jsonData);
      return;
    }
    
    // Handle heartbeat acknowledgment (Master receives heartbeat_ack from Slave)
    if (jsonData.type === 'heartbeat_ack') {
      const slaveIP = this.getSocketIP(socket);
      console.log(`[TCP] Received heartbeat ACK from Slave ${slaveIP}`);
      // Update Slave connection status to connected
      this.slaveConnectionStatusCallback?.(slaveIP, 'connected');
      return;
    }
    
    // Handle heartbeat message (POS/Client sends heartbeat to KDS)
    if (jsonData.type === 'heartbeat') {
      const clientIP = this.getSocketIP(socket);
      console.log(`[TCP] Received heartbeat from client ${clientIP}, sending ACK`);
      socket.write(this.createMessage('heartbeat_ack'));
      return;
    }
    
    // Handle order message
    if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      console.log(`[TCP] Received order message, Order ID: ${jsonData.data.id}`);
      this.executeOrderCallbacks(jsonData.data);
    
      // Send acknowledgment
      socket.write(this.createMessage('order_ack', {
        orderId: jsonData.data.id,
        status: 'received'
      }));
      return;
    }
    
    // Handle other unknown message types
    // Ignore empty objects or messages without valid type field
    if (Object.keys(jsonData).length === 0 || (!jsonData.type && !jsonData.data)) {
      return;
    }
    
    // Don't reply to unknown_message_type to avoid loops
    if (jsonData.type === 'unknown_message_type') {
      console.warn(`[TCP] Received unknown_message_type response, ignoring to avoid loop`);
      return;
    }
    
    console.warn(`[TCP] Received unknown message type:`, jsonData.type || "no type", jsonData);
    // Don't reply with unknown_message_type to avoid message loops
  }

  /**
   * Handle messages from Master (Slave mode)
   */
  private static handleMasterMessage(jsonData: any) {
    // Handle heartbeat
    if (jsonData.type === 'heartbeat') {
      console.log(`[TCP] Received heartbeat from Master, sending ACK`);
      
      // Reset heartbeat timeout, update connection status to connected
      this.resetHeartbeatTimeout();
      
      if (this.masterConnection) {
        this.masterConnection.write(this.createMessage('heartbeat_ack'));
      }
      return;
    }
    
    // Handle order data - with stricter validation
    if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      const orderId = jsonData.data.id;
      console.log(`[TCP] Received order data, processing: ${orderId}`);
      
      // Check if order has been processed
      const processedKey = `processed_${orderId}`;
      if (this.masterConnection && this.masterConnection[processedKey]) {
        console.log(`[TCP] Order ${orderId} already processed, skipping`);
        return;
      }
      
      // Mark as processed
      if (this.masterConnection) {
        this.masterConnection[processedKey] = true;
      }
      
      // Process order data
      this.executeOrderCallbacks(jsonData.data);
      
      // Send acknowledgment
      if (this.masterConnection) {
        this.masterConnection.write(this.createMessage('order_ack', {
          orderId: orderId,
          status: 'received'
        }));
      }
      return;
    }
    
    // Handle other message types
    // Don't log unknown_message_type to avoid loops
    if (jsonData.type === 'unknown_message_type') {
      return;
    }
    
    console.log(`[TCP] Received unknown message type from Master:`, jsonData.type || "no type");
  }
  
  /**
   * Send heartbeat to all persistent connections
   */
  private static startHeartbeat() {
    // Send heartbeat every 15 seconds
    setInterval(() => {
      if (this.persistentConnections.size > 0) {
        console.log(`[TCP] Sending heartbeat to ${this.persistentConnections.size} persistent connections:`, Array.from(this.persistentConnections.keys()).join(', '));
        
        for (const [ip, connection] of this.persistentConnections.entries()) {
          try {
            connection.write(this.createMessage('heartbeat'));
          } catch (error) {
            console.error(`[TCP] Failed to send heartbeat to ${ip}:`, error);
          }
        }
      }
    }, 15000);
  }
  
  /**
   * Connect to Master KDS (Slave mode) or POS System (Current architecture: KDS as server)
   */
  public static connectToMaster(masterIP: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        // Save Master/POS IP address
        this.masterIP = masterIP;
        
        // Close existing connection first
        if (this.masterConnection) {
          this.masterConnection.destroy();
          this.masterConnection = null;
        }
        
        // Reset reconnect counter
        this.reconnectAttempts.set(masterIP, 0);
        
        // Get sub-KDS category setting
        const categoryStr = await AsyncStorage.getItem("kds_category");
        const category = categoryStr || 'Drinks'; // Default to Drinks
        
        // Create new connection
        this.masterConnection = TcpSocket.createConnection({
          host: masterIP,
          port: TCP_PORT,
          tls: false
        }, () => {
          console.log(`[TCP] Successfully connected to Master/POS: ${masterIP}:${TCP_PORT}`);
          
          // Reset reconnect counter
          this.reconnectAttempts.set(masterIP, 0);
          
          // After TCP connection established, wait for first heartbeat before setting status to connected
          console.log(`[TCP] TCP connection established, waiting for heartbeat confirmation...`);
          
          // Start heartbeat timeout detection (disconnect and reconnect if no heartbeat within 30s)
          this.resetHeartbeatTimeout();
          
          // Send registration message
          const registrationMessage = {
            type: 'registration',
            role: 'slave',
            category: category, // Use category from AsyncStorage
            timestamp: new Date().toISOString()
          };
          
          this.masterConnection.write(JSON.stringify(registrationMessage));
          resolve(true);
        });
        
        // Add data buffer for connection to handle packet splitting
        let masterDataBuffer = '';
        
        // Receive data
        this.masterConnection.on('data', (data: string | Buffer) => {
          try {
            const chunk = typeof data === 'string' ? data : data.toString('utf8');
            
            // Filter out whitespace-only data
            if (chunk.trim() === '') {
              return;
            }
            
            masterDataBuffer += chunk;
            masterDataBuffer = this.parseJsonStream(masterDataBuffer, (jsonData) => {
              this.handleMasterMessage(jsonData);
            });
          } catch (error) {
            console.error(`[TCP] Error processing data:`, error);
          }
        });
        
        // Error handling
        this.masterConnection.on('error', (error: Error) => {
          console.error('[TCP] Error connecting to Master/POS:', error);
          this.masterConnection = null;
          
          // Clear heartbeat timeout timer
          if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
          }
          
          // Update connection status
          this.currentConnectionStatus = 'disconnected';
          this.connectionStatusCallback?.('disconnected');
          
          // Start reconnection
          this.scheduleReconnect(masterIP);
          
          resolve(false);
        });
        
        // Connection closed
        this.masterConnection.on('close', () => {
          console.log('[TCP] Connection to Master/POS closed');
          this.masterConnection = null;
          
          // Clear heartbeat timeout timer
          if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
          }
          
          // Update connection status
          this.currentConnectionStatus = 'disconnected';
          this.connectionStatusCallback?.('disconnected');
          
          // Start reconnection
          this.scheduleReconnect(masterIP);
        });
      } catch (error) {
        console.error('[TCP] Failed to connect to Master/POS:', error);
        
        // Start reconnection
        this.scheduleReconnect(masterIP);
        
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Master KDS (Slave mode)
   */
  public static disconnect(): void {
    try {
      console.log('[TCP] Disconnecting from Master/POS');
      
      // Close Master connection
      if (this.masterConnection) {
        this.masterConnection.destroy();
        this.masterConnection = null;
      }
      
      // Clear Master IP
      this.masterIP = "";
      
      // Update connection status
      this.currentConnectionStatus = 'disconnected';
      this.connectionStatusCallback?.('disconnected');
      
      // Clear reconnect timers
      this.reconnectTimers.forEach((timer) => clearTimeout(timer));
      this.reconnectTimers.clear();
      
      // Clear heartbeat timeout timer
      if (this.heartbeatTimeout) {
        clearTimeout(this.heartbeatTimeout);
        this.heartbeatTimeout = null;
      }
      
      console.log('[TCP] Successfully disconnected');
    } catch (error) {
      console.error('[TCP] Error during disconnect:', error);
    }
  }
  
  /**
   * Schedule reconnection
   */
  private static scheduleReconnect(ip: string) {
    // Get current reconnect attempts
    const attempts = this.reconnectAttempts.get(ip) || 0;
    
    // Stop reconnecting if max attempts reached
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(`[TCP] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, stopping reconnection to ${ip}`);
      return;
    }
    
    // Increment reconnect counter
    this.reconnectAttempts.set(ip, attempts + 1);
    
    // Clear previous timer
    if (this.reconnectTimers.has(ip)) {
      clearTimeout(this.reconnectTimers.get(ip)!);
    }
    
    console.log(`[TCP] Scheduling reconnect to ${ip}, attempt ${attempts + 1}, will execute in ${RECONNECT_INTERVAL}ms`);
    
    // Set new timer
    const timer = setTimeout(() => {
      console.log(`[TCP] Attempting to reconnect to ${ip}...`);
      
      if (ip === this.masterIP) {
        // Reconnect to Master/POS
        this.connectToMaster(ip).catch(error => {
          console.error(`[TCP] Failed to reconnect to Master/POS:`, error);
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
   * Execute all order callback functions
   */
  private static executeOrderCallbacks(data: any): void {
    // Execute single callback
    if (this.orderCallback) {
      this.orderCallback(data);
    }
    
    // Execute all callbacks
    for (const callback of this.orderCallbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('[TCP] Failed to execute order callback:', error);
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
   * 设置连接状态回调 - 连接状态变化时调用
   */
  public static setConnectionStatusCallback(callback: (status: 'connected' | 'disconnected') => void): void {
    this.connectionStatusCallback = callback;
  }

  /**
   * 设置子设备连接状态回调 - Master端监听Slave的连接状态
   */
  public static setSlaveConnectionStatusCallback(callback: (slaveIP: string, status: 'connected' | 'disconnected', slaveName?: string) => void): void {
    this.slaveConnectionStatusCallback = callback;
  }

  /**
   * 设置连接错误回调 - 显示连接相关的错误/警告消息
   */
  public static setConnectionErrorCallback(callback: (message: string) => void): void {
    this.connectionErrorCallback = callback;
  }

  /**
   * 触发连接错误回调
   */
  public static triggerConnectionError(message: string): void {
    this.connectionErrorCallback?.(message);
  }
  
  /**
   * Send data to specified IP
   */
  public static sendData(ip: string, data: any): Promise<boolean> {
    return new Promise(async (resolve) => {
      const targetIP = this.sanitizeIP(ip) || ip;

      try {
        console.log(`[TCP] Attempting to send data to ${targetIP}...`);
        
        // Check for persistent connection
        if (this.persistentConnections.has(targetIP)) {
          const socket = this.persistentConnections.get(targetIP);
          if (socket && !socket.destroyed) {
            socket.write(JSON.stringify(data));
            console.log(`[TCP] Data sent successfully via persistent connection to ${targetIP}`);
            resolve(true);
            return;
          } else {
            // Connection broken, remove from pool
            this.persistentConnections.delete(targetIP);
            console.log(`[TCP] Persistent connection to ${targetIP} broken, removed from pool`);
          }
        }
        
        // Create new connection
        console.log(`[TCP] No active client found, creating persistent connection to ${targetIP}:${TCP_PORT}`);
        
        const socket = TcpSocket.createConnection({
          host: targetIP,
          port: TCP_PORT,
          tls: false
        }, () => {
          // Send data
          socket.write(JSON.stringify(data));
          console.log(`[TCP] Persistent connection to ${targetIP}:${TCP_PORT} successful`);
          
          // Add to persistent connection pool
          this.persistentConnections.set(targetIP, socket);
          console.log(`[TCP] Added ${targetIP} to persistent connection pool`);
          
          // Setup error and close handlers
          this.setupSocketErrorHandlers(socket, `Persistent connection to ${targetIP}`);
          
          resolve(true);
        });

        // Handle response data from peer (e.g., connection_response)
        let dataBuffer = '';
        socket.on('data', (raw: string | Buffer) => {
          try {
            const chunk = typeof raw === 'string' ? raw : raw.toString('utf8');
            
            // Filter out whitespace-only data
            if (chunk.trim() === '') {
              return;
            }
            
            dataBuffer += chunk;
            dataBuffer = this.parseJsonStream(dataBuffer, (jsonData) => {
              this.handleTcpMessage(jsonData, socket, `${targetIP}:${socket.remotePort ?? ''}`);
            });
          } catch (err) {
            console.error('[TCP] Failed to process client data:', err);
          }
        });
      } catch (error) {
        console.error(`[TCP] Failed to send data to ${targetIP}:`, error);
        resolve(false);
      }
    });
  }
  
  /**
   * Broadcast data to all connected clients
   */
  public static broadcastData(data: any): void {
    // Broadcast to all regular clients
    for (const [clientKey, client] of this.clients.entries()) {
      try {
        client.write(JSON.stringify(data));
      } catch (error) {
        console.error(`[TCP] Failed to broadcast data to ${clientKey}:`, error);
      }
    }
    
    // Broadcast to all persistent connections
    for (const [ip, connection] of this.persistentConnections.entries()) {
      try {
        connection.write(JSON.stringify(data));
      } catch (error) {
        console.error(`[TCP] Failed to broadcast data to persistent connection ${ip}:`, error);
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
   * Shutdown server and all connections
   */
  public static shutdown(): void {
    // Helper: Close all connections in a Map
    const closeConnections = (connections: Map<string, any>, label: string) => {
      for (const [key, conn] of connections.entries()) {
        try {
          conn.destroy();
          console.log(`[TCP] Closed ${label} ${key} connection`);
        } catch (error) {
          console.error(`[TCP] Failed to close ${label} ${key} connection:`, error);
        }
      }
      connections.clear();
    };

    // Helper: Clear all timers in a Map
    const clearTimers = (timers: Map<string, ReturnType<typeof setTimeout>>) => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };

    // Close all clients and persistent connections
    closeConnections(this.clients, 'client');
    closeConnections(this.persistentConnections, 'persistent connection');
    
    // Close connection to Master KDS
    if (this.masterConnection) {
      this.masterConnection.destroy();
      this.masterConnection = null;
    }
    
    // Clear all timers
    clearTimers(this.reconnectTimers);
    
    // Close server
    if (this.server) {
      this.server.close(() => {
        console.log('[TCP] Server closed');
      });
      this.server = null;
    }
  }

  /**
   * Send order items completed status from Slave KDS to Master KDS
   */
  public static async sendOrderItemsCompleted(orderId: string, completedItems: { [key: string]: boolean }): Promise<boolean> {
    try {
      if (!this.masterIP) {
        console.error('[TCP] Master KDS IP not set, cannot send item completion status');
        return false;
      }
      
      console.log(`[TCP] Sending item completion status for order ${orderId} to Master KDS`);
      
      // Build item completion status message
      const message = {
        type: 'order_items_completed',
        orderId,
        completedItems,
        timestamp: new Date().toISOString()
      };
      
      // Send to Master KDS
      return await this.sendData(this.masterIP, message);
    } catch (error) {
      console.error('[TCP] Failed to send item completion status:', error);
      return false;
    }
  }

  public static isSlaveConnected(ip: string): boolean {
    const normalized = this.sanitizeIP(ip);
    if (!normalized) {
      return false;
    }

    const connection = this.persistentConnections.get(normalized);
    return !!connection && !connection.destroyed;
  }
} 