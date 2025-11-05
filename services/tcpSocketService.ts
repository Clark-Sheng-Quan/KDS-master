import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTCPOrder } from './orderService/formatters';

// TCP服务器配置 - 默认端口
const DEFAULT_TCP_PORT = 4322;
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
  // 当前使用的 TCP 端口（动态）
  private static tcpPort: number = DEFAULT_TCP_PORT;
  // 持久连接池 - 保存与子KDS的持久连接
  private static persistentConnections: Map<string, any> = new Map();
  // 重连计数器
  private static reconnectAttempts: Map<string, number> = new Map();
  // 重连定时器
  private static reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  // 回调函数
  private static orderCallback: ((order: any) => void) | null = null;
  // 添加订单回调函数数组
  private static orderCallbacks: ((order: any) => void)[] = [];
  // 连接状态变化回调
  private static connectionStatusCallback: ((status: 'connected' | 'disconnected') => void) | null = null;
  // 当前连接状态
  private static currentConnectionStatus: 'connected' | 'disconnected' = 'disconnected';
  // 连接警告/错误回调
  private static connectionErrorCallback: ((message: string) => void) | null = null;
  // 心跳超时定时器 - 用于检测Slave端是否持续收到心跳
  private static heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  // 心跳超时时间（30秒未收到心跳则认为连接断开，触发重连）
  private static readonly HEARTBEAT_TIMEOUT = 30000;
  
  /**
   * 获取 TCP 端口号（从 AsyncStorage 或默认值）
   */
  public static async getTcpPort(): Promise<number> {
    try {
      const savedPort = await AsyncStorage.getItem('kds_port');
      if (savedPort) {
        const port = parseInt(savedPort, 10);
        if (port > 0 && port < 65536) {
          this.tcpPort = port;
          console.log(`[TCP] Port loaded from storage: ${port}`);
          return port;
        }
      }
    } catch (error) {
      console.error('[TCP] Failed to read port from storage:', error);
    }
    
    this.tcpPort = DEFAULT_TCP_PORT;
    console.log(`[TCP] Using default port: ${DEFAULT_TCP_PORT}`);
    return DEFAULT_TCP_PORT;
  }

  /**
   * 设置 TCP 端口号（保存到 AsyncStorage）
   */
  public static async setTcpPort(port: number): Promise<boolean> {
    try {
      if (port <= 0 || port >= 65536) {
        console.error('[TCP] Invalid port number:', port);
        return false;
      }

      await AsyncStorage.setItem('kds_port', port.toString());
      this.tcpPort = port;
      console.log(`[TCP] Port updated to ${port}`);
      return true;
    } catch (error) {
      console.error('[TCP] Failed to save port:', error);
      return false;
    }
  }

  /**
   * 获取当前使用的端口
   */
  public static getCurrentPort(): number {
    return this.tcpPort;
  }
  
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
    if (!normalized) {
      return;
    }

    if (this.persistentConnections.has(normalized)) {
      const connection = this.persistentConnections.get(normalized);
      if (!connection || connection.destroyed) {
        this.persistentConnections.delete(normalized);
      }
    }

    console.log(`[TCP] Client ${normalized} disconnected`);
    
    // Clear masterIP if this was the POS connection
    if (this.masterIP === normalized) {
      this.masterIP = "";
      
      // Update connection status to disconnected (POS is now disconnected)
      if (this.currentConnectionStatus !== 'disconnected') {
        this.currentConnectionStatus = 'disconnected';
        this.connectionStatusCallback?.('disconnected');
      }
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
      this.currentConnectionStatus = 'disconnected';
      this.connectionStatusCallback?.('disconnected');
      
      // Trigger reconnection (if masterIP is saved)
      if (this.masterIP) {
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
              console.error(`[TCP] JSON Parse Fail:`, e);
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
   * 将JSON消息转换为标准TCP协议格式（带Content-Length header）
   * 格式: Content-Length: {length}\r\n\r\n{json}
   */
  private static formatTcpMessage(message: string): string {
    // React Native环境下计算UTF-8字节长度（兼容方式，不使用Node.js Buffer）
    const contentLength = new TextEncoder().encode(message).length;
    return `Content-Length: ${contentLength}\r\n\r\n${message}`;
  }

  /**
   * 解析标准TCP协议消息（带Content-Length header）
   * @param buffer 数据缓冲区
   * @param onMessage 处理单条JSON消息的回调
   * @returns 更新后的缓冲区
   */
  private static parseStandardTcpStream(
    buffer: string,
    onMessage: (jsonData: any) => void
  ): string {
    let remaining = buffer;

    while (true) {
      // Look for header separator \r\n\r\n
      const headerEndIndex = remaining.indexOf('\r\n\r\n');
      
      if (headerEndIndex === -1) {
        // No complete header yet, wait for more data
        break;
      }

      // Extract header
      const headerString = remaining.substring(0, headerEndIndex);
      
      // Parse Content-Length
      const contentLengthMatch = headerString.match(/Content-Length:\s*(\d+)/i);
      
      if (!contentLengthMatch) {
        console.error('[TCP] Invalid header format, no Content-Length found');
        // Skip this malformed message
        remaining = remaining.substring(headerEndIndex + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEndIndex + 4; // Skip \r\n\r\n
      const messageEnd = messageStart + contentLength;

      // Check if we have the complete message body
      if (remaining.length < messageEnd) {
        // Incomplete message, wait for more data
        break;
      }

      // Extract message body
      const messageBody = remaining.substring(messageStart, messageEnd);
      
      try {
        const jsonData = JSON.parse(messageBody);
        
        // Only process non-empty objects
        if (Object.keys(jsonData).length > 0) {
          onMessage(jsonData);
        }
      } catch (e) {
        console.error('[TCP] JSON Parse Fail:', e, 'Body:', messageBody);
      }

      // Move to next message
      remaining = remaining.substring(messageEnd);
    }

    return remaining;
  }

  /**
   * Clean up persistent connection
   */
  private static cleanupPersistentConnection(ip: string, reason: string): void {
    const normalizedIP = this.sanitizeIP(ip);
    if (this.persistentConnections.has(normalizedIP)) {
      this.persistentConnections.delete(normalizedIP);
    }
  }

  /**
   * Setup socket event handlers (error and close)
   */
  private static setupSocketErrorHandlers(socket: any, identifier: string): void {
    socket.on('error', (error: Error) => {
      console.error(`[TCP] ${identifier} error:`, error);
      const ip = this.getSocketIP(socket);
      this.cleanupPersistentConnection(ip, 'error');
      this.handleSlaveConnectionLoss(ip, 'error');
    });

    socket.on('close', () => {
      const ip = this.getSocketIP(socket);
      this.cleanupPersistentConnection(ip, 'close');
      this.handleSlaveConnectionLoss(ip, 'close');
    });
  }

  /**
   * 启动TCP服务器
   */
  public static startServer(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        // 获取端口号
        const port = await this.getTcpPort();

        // 如果服务器已启动，先关闭
        if (this.server) {
          this.server.close();
          this.server = null;
        }
        
        // Create new server
        this.server = TcpSocket.createServer((socket) => {
          const remoteIP = this.getSocketIP(socket);
          const clientKey = `${remoteIP}:${socket.remotePort}`;
          console.log(`[TCP] Client connected: ${remoteIP}`);
          
          // Save client connection
          this.clients.set(clientKey, socket);
          
          // 为每个连接添加数据缓冲区，用于处理粘包问题
          let dataBuffer = '';
          
          // 标记这个连接是否是 HTTP 请求（等待 body）
          let isHttpRequest = false;
          
          // 接收数据
          socket.on('data', (data: string | Buffer) => {
            try {
              const chunk = typeof data === 'string' ? data : data.toString('utf8');
              
              // Debug: Print received raw data
              console.log(`[HTTP] Received raw data from ${clientKey}:`, chunk);
              
              // 过滤掉空白字符的数据
              if (chunk.trim() === '') {
                return;
              }
              
              // 检测 HTTP 请求
              if (chunk.trimStart().startsWith('POST') || 
                  chunk.trimStart().startsWith('GET') || 
                  chunk.trimStart().startsWith('PUT') || 
                  chunk.trimStart().startsWith('DELETE') ||
                  chunk.includes('HTTP/1.')) {
                    console.log(`[HTTP] ========== HTTP REQUEST DETECTED ==========`);
                
                // 检查是否有 Expect: 100-continue header
                if (chunk.includes('Expect: 100-continue')) {
                  // 标记这是一个 HTTP 请求
                  isHttpRequest = true;
                  // 发送 100 Continue 响应，告诉客户端继续发送 body
                  socket.write('HTTP/1.1 100 Continue\r\n\r\n');
                  return;
                }
                
                try {
                  // 提取 HTTP 请求体中的 JSON 数据
                  const bodyStart = chunk.indexOf('\r\n\r\n');
                  
                  if (bodyStart !== -1) {
                    const jsonBody = chunk.substring(bodyStart + 4).trim();
                
                    
                    if (jsonBody) {
                      // 解析 JSON 数据
                      const jsonData = JSON.parse(jsonBody);
                      
                      // 处理 HTTP 请求并发送响应
                      this.handleHttpRequest(jsonData, socket, clientKey);
                    } else {
                      dataBuffer += chunk;
                      return;
                    }
                  } else {
                    dataBuffer += chunk;
                    return;
                  }
                } catch (parseError: any) {
                  console.error(`[TCP] JSON parse error:`, parseError.message);
                  const errorResponse = 
                    'HTTP/1.1 400 Bad Request\r\n' +
                    'Content-Type: application/json\r\n' +
                    'Connection: close\r\n' +
                    '\r\n' +
                    `{"status":"error","message":"Invalid JSON: ${parseError.message}"}\n`;
                  socket.write(errorResponse);
                  setTimeout(() => socket.destroy(), 100);
                }
                console.log(`[HTTP] ========== HTTP REQUEST PROCESSING COMPLETE ==========`);
                return;
              }
              
              // 如果是 HTTP body 数据（在 100-continue 之后到达）
              if (isHttpRequest && chunk.trim().startsWith('{')) {
                
                try {
                  const jsonData = JSON.parse(chunk.trim());
                  
                  // 处理 HTTP 请求并发送响应
                  this.handleHttpRequest(jsonData, socket, clientKey);
                  
                  // 重置标记
                  isHttpRequest = false;
                } catch (parseError: any) {
                  console.error(`[TCP] JSON parse error:`, parseError.message);
                  const errorResponse = 
                    'HTTP/1.1 400 Bad Request\r\n' +
                    'Content-Type: application/json\r\n' +
                    'Connection: close\r\n' +
                    '\r\n' +
                    `{"status":"error","message":"Invalid JSON: ${parseError.message}"}\n`;
                  socket.write(errorResponse);
                  setTimeout(() => socket.destroy(), 100);
                }
                return;
              }
              
              // 其他格式的数据（不支持）
              console.warn(`[TCP] Unsupported data format from ${remoteIP}`);
              const errorResponse = 
                'HTTP/1.1 400 Bad Request\r\n' +
                'Content-Type: application/json\r\n' +
                'Connection: close\r\n' +
                '\r\n' +
                '{"status":"error","message":"Only HTTP requests are supported"}\n';
              socket.write(errorResponse);
              setTimeout(() => socket.destroy(), 100);
              
            } catch (error) {
              console.error(`[TCP] Error processing data:`, error);
            }
          });
          
          // 设置错误和关闭处理
          this.setupSocketErrorHandlers(socket, `Client ${clientKey}`);
          
          // 额外处理：从clients Map中移除
          socket.on('error', () => this.clients.delete(clientKey));
          socket.on('close', () => this.clients.delete(clientKey));
        });
        
        // 服务器错误处理
        this.server.on('error', (error: Error) => {
          console.error('[TCP] Server error:', error);
          reject(error);
        });
        
        // Start server
        this.server.listen(port, '0.0.0.0', () => {
          console.log(`[TCP] Server started on port ${port}`);
          resolve(true);
        });
        
        // 启动心跳检测
        this.startHeartbeat();
      } catch (error) {
        console.error('[TCP] Start server failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle single HTTP request and send HTTP response
   */
  private static handleHttpRequest(jsonData: any, socket: any, clientKey: string): void {
    const messageType = jsonData.type || jsonData.orderType || 'unknown';
    console.log(`[TCP] ${this.getSocketIP(socket)} - Message: ${messageType}`);
    
    // 准备响应数据
    const responseData = {
      status: '200',
      message: 'Message processed',
      type: messageType
    };
    
    // 所有消息都保持连接（keep-alive）
    const httpResponse = 
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      'Connection: keep-alive\r\n' +
      '\r\n' +
      JSON.stringify(responseData) + '\n';
    
    console.log(`[TCP] Response: 200 OK`);
    socket.write(httpResponse);
    
    // 然后处理不同类型的消息
    if (jsonData.type === 'registration') {
      // 处理 registration
      const clientIP = this.getSocketIP(socket);
      this.masterIP = clientIP;
      
      // 添加到持久连接池，保持连接
      this.persistentConnections.set(clientIP, socket);
      
      // 更新连接状态
      if (this.currentConnectionStatus !== 'connected') {
        this.currentConnectionStatus = 'connected';
        this.connectionStatusCallback?.('connected');
      }
      
    } else if (jsonData.type === 'heartbeat') {
      // 处理心跳
      
      // 更新连接状态
      if (this.currentConnectionStatus !== 'connected') {
        this.currentConnectionStatus = 'connected';
        this.connectionStatusCallback?.('connected');
      }
      
    } else if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      // 处理订单消息
      try {
        this.executeOrderCallbacks(jsonData.data);
      } catch (error) {
        console.error(`[TCP] Order callback error:`, error);
      }
      
    } else if (!jsonData.type && jsonData.products && Array.isArray(jsonData.products) && jsonData.id) {
      // 处理已格式化的订单（包含 products 数组）
      
      // 直接使用，无需再次格式化
      this.executeOrderCallbacks(jsonData);
      
    } else if (!jsonData.type && jsonData.orderType === 'POS' && jsonData.orderitems && jsonData.id) {
      // 处理 POS 订单格式（包含 orderitems 数组，需要格式化）
      
      // 转换格式并处理
      const formattedOrder = formatTCPOrder(jsonData);
      this.executeOrderCallbacks(formattedOrder);
      
    } else {
      // 其他未知消息类型
      console.warn(`[TCP] Unknown message type: ${messageType}`);
    }
  }



  /**
   * Handle messages from Master (Slave mode)
   */
  private static handleMasterMessage(jsonData: any) {
    // Handle heartbeat
    if (jsonData.type === 'heartbeat') {
      // Reset heartbeat timeout, update connection status to connected
      this.resetHeartbeatTimeout();
      
      if (this.masterConnection) {
        const heartbeatAck = this.createMessage('heartbeat_ack');
        this.masterConnection.write(this.formatTcpMessage(heartbeatAck));
      }
      return;
    }
    
    // Handle order data
    if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      const orderId = jsonData.data.id;
      
      // Process order data (including updates - duplicate ID means order update)
      this.executeOrderCallbacks(jsonData.data);
      
      // Send acknowledgment (standard format)
      if (this.masterConnection) {
        const orderAck = this.createMessage('order_ack', {
          orderId: orderId,
          status: 'received'
        });
        this.masterConnection.write(this.formatTcpMessage(orderAck));
      }
      return;
    }
    
    // Handle other message types
    // Don't log unknown_message_type to avoid loops
    if (jsonData.type === 'unknown_message_type') {
      return;
    }
  }
  
  /**
   * Send heartbeat to all persistent connections
   */
  private static startHeartbeat() {
    // Send heartbeat every 15 seconds
    setInterval(() => {
      if (this.persistentConnections.size > 0) {
        for (const [ip, connection] of this.persistentConnections.entries()) {
          try {
            const heartbeat = this.createMessage('heartbeat');
            connection.write(this.formatTcpMessage(heartbeat));
          } catch (error) {
            console.error(`[TCP] Heartbeat send failed to ${ip}:`, error);
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
        
        // Get sub-KDS category setting (optional, for future use)
        const categoryStr = await AsyncStorage.getItem("kds_category");
        const category = categoryStr || 'all';
        
        // Create new connection
        this.masterConnection = TcpSocket.createConnection({
          host: masterIP,
          port: this.tcpPort,
          tls: false
        }, () => {
          console.log(`[TCP] Connected to ${masterIP}:${this.tcpPort}`);
          
          // Reset reconnect counter
          this.reconnectAttempts.set(masterIP, 0);
          
          // Start heartbeat timeout detection (disconnect and reconnect if no heartbeat within 30s)
          this.resetHeartbeatTimeout();
          
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
            // Use standard TCP protocol parser first, fallback to JSON stream if needed
            try {
              masterDataBuffer = this.parseStandardTcpStream(masterDataBuffer, (jsonData) => {
                this.handleMasterMessage(jsonData);
              });
            } catch (parseError) {
              console.error('[TCP] Error parsing standard format, trying JSON stream fallback');
              try {
                masterDataBuffer = this.parseJsonStream(masterDataBuffer, (jsonData) => {
                  this.handleMasterMessage(jsonData);
                });
              } catch (fallbackError) {
                console.error('[TCP] Both parsers failed, clearing buffer');
                masterDataBuffer = '';
              }
            }
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
    } catch (error) {
      console.error('[TCP] Disconnect error:', error);
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
      return;
    }
    
    // Increment reconnect counter
    this.reconnectAttempts.set(ip, attempts + 1);
    
    // Clear previous timer
    if (this.reconnectTimers.has(ip)) {
      clearTimeout(this.reconnectTimers.get(ip)!);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      if (ip === this.masterIP) {
        // Reconnect to Master/POS
        this.connectToMaster(ip).catch(error => {
          console.error(`[TCP] Reconnect error:`, error);
        });
      }
    }, RECONNECT_INTERVAL);
    
    this.reconnectTimers.set(ip, timer);
  }
  
  /**
   * 设置订单回调函数
   */
  public static setOrderCallback(callback: (order: any) => void): void {
    // 设置单一回调，覆盖之前的回调
    this.orderCallback = callback;
    
    // 清空回调数组，防止重复执行
    this.orderCallbacks = [];
  }
  
  /**
   * Execute all order callback functions
   */
  private static executeOrderCallbacks(data: any): void {
    // Execute single callback
    if (this.orderCallback) {
      try {
        this.orderCallback(data);
      } catch (error) {
        console.error('[TCP] Order callback execution failed:', error);
      }
    }
    
    // Execute all callbacks in array (if any)
    for (const callback of this.orderCallbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('[TCP] Callback execution failed:', error);
      }
    }
  }
  
  /**
   * 设置连接状态回调 - 连接状态变化时调用
   */
  public static setConnectionStatusCallback(callback: (status: 'connected' | 'disconnected') => void): void {
    this.connectionStatusCallback = callback;
  }

  /**
   * 获取当前连接状态
   */
  public static getConnectionStatus(): 'connected' | 'disconnected' {
    return this.currentConnectionStatus;
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
        // Check for persistent connection
        if (this.persistentConnections.has(targetIP)) {
          const socket = this.persistentConnections.get(targetIP);
          if (socket && !socket.destroyed) {
            const formattedData = this.formatTcpMessage(JSON.stringify(data));
            socket.write(formattedData);
            resolve(true);
            return;
          } else {
            // Connection broken, remove from pool
            this.persistentConnections.delete(targetIP);
          }
        }
        
        // Create new connection
        const socket = TcpSocket.createConnection({
          host: targetIP,
          port: this.tcpPort,
          tls: false
        }, () => {
          // Send data (standard format)
          const formattedData = this.formatTcpMessage(JSON.stringify(data));
          socket.write(formattedData);
          
          // Add to persistent connection pool
          this.persistentConnections.set(targetIP, socket);
          
          // Setup error and close handlers
          this.setupSocketErrorHandlers(socket, `Persistent connection to ${targetIP}`);
          
          resolve(true);
        });
      } catch (error) {
        console.error(`[TCP] Send error:`, error);
        resolve(false);
      }
    });
  }
  
  /**
   * Broadcast data to all connected clients
   */
  public static broadcastData(data: any): void {
    // Broadcast to all regular clients (standard format)
    const formattedData = this.formatTcpMessage(JSON.stringify(data));
    
    for (const [clientKey, client] of this.clients.entries()) {
      try {
        client.write(formattedData);
      } catch (error) {
        console.error(`[TCP] Failed to broadcast data to ${clientKey}:`, error);
      }
    }
    
    // Broadcast to all persistent connections
    for (const [ip, connection] of this.persistentConnections.entries()) {
      try {
        connection.write(formattedData);
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
        } catch (error) {
          console.error(`[TCP] ${label} close error:`, error);
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
        console.log('[TCP] Server stopped');
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
        console.error('[TCP] Master KDS IP not set');
        return false;
      }
      
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
      console.error('[TCP] Send error:', error);
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

  /**
   * Get the current POS/Master IP address
   */
  public static getMasterIP(): string {
    return this.masterIP;
  }
} 