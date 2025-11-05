import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTCPOrder } from './orderService/formatters';

// TCP server configuration - default port
const DEFAULT_TCP_PORT = 4322;
// Reconnection configuration
const RECONNECT_INTERVAL = 5000; // Try to reconnect after 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10; // Maximum number of reconnection attempts

export class TCPSocketService {
  // Server instance
  private static server: any = null;
  // Client connection instances
  private static clients: Map<string, any> = new Map();
  // Master server connection
  private static masterConnection: any = null;
  // Master KDS IP address
  private static masterIP: string = "";
  // Current TCP port (dynamic)
  private static tcpPort: number = DEFAULT_TCP_PORT;
  // Persistent connection pool - stores persistent connections to sub-KDS
  private static persistentConnections: Map<string, any> = new Map();
  // Reconnection attempt counter
  private static reconnectAttempts: Map<string, number> = new Map();
  // Reconnection timers
  private static reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  // Order callback function
  private static orderCallback: ((order: any) => void) | null = null;
  // Array of order callback functions
  private static orderCallbacks: ((order: any) => void)[] = [];
  // Connection status change callback
  private static connectionStatusCallback: ((status: 'connected' | 'disconnected') => void) | null = null;
  // Current connection status
  private static currentConnectionStatus: 'connected' | 'disconnected' = 'disconnected';
  // Connection warning/error callback
  private static connectionErrorCallback: ((message: string) => void) | null = null;
  // Heartbeat timeout timer - used to detect if Slave side continuously receives heartbeat
  private static heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  // Heartbeat timeout (if no heartbeat received within 30 seconds, consider connection lost and trigger reconnection)
  private static readonly HEARTBEAT_TIMEOUT = 30000;
  
  /**
   * Get TCP port (from AsyncStorage or default value)
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
   * Set TCP port (save to AsyncStorage)
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
   * Get the current port in use
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
   * Reset the heartbeat timeout timer for the Slave side
   * Called every time a heartbeat is received to ensure connection status is 'connected'
   * If no heartbeat is received within 30 seconds, trigger reconnection
   */
  private static resetHeartbeatTimeout(): void {
    // Clear old timeout timer
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
    }

    // Update connection status to connected
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
   * General JSON stream parser - handles TCP packet sticking issues
   * @param buffer Data buffer
   * @param onMessage Callback for processing a single JSON message
   * @returns Updated buffer
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

              // Only process non-empty objects
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
   * Construct a JSON message with timestamp
   */
  private static createMessage(type: string, data?: any): string {
    return JSON.stringify({
      type,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Convert JSON message to standard TCP protocol format (with Content-Length header)
   * Format: Content-Length: {length}\r\n\r\n{json}
   */
  private static formatTcpMessage(message: string): string {
    // Calculate UTF-8 byte length in React Native environment (compatible way, do not use Node.js Buffer)
    const contentLength = new TextEncoder().encode(message).length;
    return `Content-Length: ${contentLength}\r\n\r\n${message}`;
  }

  /**
   * Parse standard TCP protocol message (with Content-Length header)
   * @param buffer Data buffer
   * @param onMessage Callback for processing a single JSON message
   * @returns Updated buffer
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
   * Start TCP server
   */
  public static startServer(): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get port number
        const port = await this.getTcpPort();

        // If server is already started, close it first
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
          
          // Add a data buffer for each connection to handle packet sticking issues
          let dataBuffer = '';
          
          // Mark whether this connection is an HTTP request (waiting for body)
          let isHttpRequest = false;
          
          // Receive data
          socket.on('data', (data: string | Buffer) => {
            try {
              const chunk = typeof data === 'string' ? data : data.toString('utf8');
              
              // Debug: Print received raw data
              console.log(`[HTTP] Received raw data from ${clientKey}:`, chunk);
              
              // Filter out data that is only whitespace
              if (chunk.trim() === '') {
                return;
              }
              
              // Detect HTTP request
              if (chunk.trimStart().startsWith('POST') || 
                  chunk.trimStart().startsWith('GET') || 
                  chunk.trimStart().startsWith('PUT') || 
                  chunk.trimStart().startsWith('DELETE') ||
                  chunk.includes('HTTP/1.')) {
                    console.log(`[HTTP] ========== HTTP REQUEST DETECTED ==========`);
                
                // Check for Expect: 100-continue header
                if (chunk.includes('Expect: 100-continue')) {
                  // Mark this as an HTTP request
                  isHttpRequest = true;
                  // Send 100 Continue response to tell client to continue sending body
                  socket.write('HTTP/1.1 100 Continue\r\n\r\n');
                  return;
                }
                
                try {
                  // Extract JSON data from HTTP request body
                  const bodyStart = chunk.indexOf('\r\n\r\n');
                  
                  if (bodyStart !== -1) {
                    const jsonBody = chunk.substring(bodyStart + 4).trim();
                
                    
                    if (jsonBody) {
                      // Parse JSON data
                      const jsonData = JSON.parse(jsonBody);
                      
                      // Process HTTP request and send response
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
              
              // If it's HTTP body data (arrived after 100-continue)
              if (isHttpRequest && chunk.trim().startsWith('{')) {
                
                try {
                  const jsonData = JSON.parse(chunk.trim());
                  
                  // Process HTTP request and send response
                  this.handleHttpRequest(jsonData, socket, clientKey);
                  
                  // Reset flag
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
              
              // Other unsupported data formats
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
          
          // Setup error and close handlers
          this.setupSocketErrorHandlers(socket, `Client ${clientKey}`);
          
          // Additionally: remove from clients Map
          socket.on('error', () => this.clients.delete(clientKey));
          socket.on('close', () => this.clients.delete(clientKey));
        });
        
        // Server error handling
        this.server.on('error', (error: Error) => {
          console.error('[TCP] Server error:', error);
          reject(error);
        });
        
        // Start server
        this.server.listen(port, '0.0.0.0', () => {
          console.log(`[TCP] Server started on port ${port}`);
          resolve(true);
        });
        
        // Start heartbeat detection
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
    
    // Debug: Log received order structure
    if (jsonData.products || jsonData.orderitems) {
      console.log(`[TCP] Order structure - has products: ${!!jsonData.products}, has orderitems: ${!!jsonData.orderitems}, type: ${jsonData.type}, orderType: ${jsonData.orderType}`);
    }
    
    // Prepare response data
    const responseData = {
      status: '200',
      message: 'Message processed',
      type: messageType
    };
    
    const responseBody = JSON.stringify(responseData);
    const contentLength = new TextEncoder().encode(responseBody).length;
    
    // All messages keep connection (keep-alive)
    const httpResponse = 
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${contentLength}\r\n` +
      'Connection: keep-alive\r\n' +
      '\r\n' +
      responseBody;
    
    console.log(`[TCP] Sending response (${contentLength} bytes):`, responseBody);
    socket.write(httpResponse, () => {
      console.log(`[TCP] Response sent successfully`);
    });
    
    // Then handle different message types
    if (jsonData.type === 'registration') {
      // Handle registration
      const clientIP = this.getSocketIP(socket);
      this.masterIP = clientIP;
      
      // Add to persistent connection pool, keep connection
      this.persistentConnections.set(clientIP, socket);
      
      // Update connection status
      if (this.currentConnectionStatus !== 'connected') {
        this.currentConnectionStatus = 'connected';
        this.connectionStatusCallback?.('connected');
      }
      
    } else if (jsonData.type === 'heartbeat') {
      // Handle heartbeat
      
      // Update connection status
      if (this.currentConnectionStatus !== 'connected') {
        this.currentConnectionStatus = 'connected';
        this.connectionStatusCallback?.('connected');
      }
      
    } else if (jsonData.type === 'order' && jsonData.data && jsonData.data.id) {
      // Handle order message (wrapped format)
      console.log('[TCP] Processing wrapped order (type=order, data.id exists)');
      try {
        this.executeOrderCallbacks(jsonData.data);
      } catch (error) {
        console.error(`[TCP] Order callback error:`, error);
      }
      
    } else if (jsonData.products && Array.isArray(jsonData.products) && jsonData.id) {
      // Handle formatted order (contains products array) - Test 3 format
      console.log('[TCP] Processing formatted order (has products array and id)');
      // Use directly, no need to reformat
      this.executeOrderCallbacks(jsonData);
      
    } else if (jsonData.orderType === 'POS' && jsonData.orderitems && jsonData.id) {
      // Handle POS order format (contains orderitems array, needs formatting) - Test 4 format
      console.log('[TCP] Processing POS order (orderType=POS, has orderitems)');
      // Convert format and process
      const formattedOrder = formatTCPOrder(jsonData);
      this.executeOrderCallbacks(formattedOrder);
      
    } else {
      // Other unknown message types
      console.warn(`[TCP] Unknown message type: ${messageType}, jsonData:`, JSON.stringify(jsonData, null, 2));
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
   * Set order callback function
   */
  public static setOrderCallback(callback: (order: any) => void): void {
    // Set single callback, overwrite previous callback
    this.orderCallback = callback;
    
    // Clear callback array to prevent duplicate execution
    this.orderCallbacks = [];
  }
  
  /**
   * Execute all order callback functions
   */
  private static executeOrderCallbacks(data: any): void {
    console.log('[TCP] executeOrderCallbacks called with data:', JSON.stringify(data, null, 2));
    console.log('[TCP] orderCallback exists:', !!this.orderCallback);
    console.log('[TCP] orderCallbacks array length:', this.orderCallbacks.length);
    
    // Execute single callback
    if (this.orderCallback) {
      try {
        console.log('[TCP] Executing single order callback...');
        this.orderCallback(data);
        console.log('[TCP] Single order callback executed successfully');
      } catch (error) {
        console.error('[TCP] Order callback execution failed:', error);
      }
    } else {
      console.warn('[TCP] No order callback registered!');
    }
    
    // Execute all callbacks in array (if any)
    for (const callback of this.orderCallbacks) {
      try {
        console.log('[TCP] Executing callback from array...');
        callback(data);
      } catch (error) {
        console.error('[TCP] Callback execution failed:', error);
      }
    }
  }
  
  /**
   * Set connection status callback - called when connection status changes
   */
  public static setConnectionStatusCallback(callback: (status: 'connected' | 'disconnected') => void): void {
    this.connectionStatusCallback = callback;
  }

  /**
   * Get current connection status
   */
  public static getConnectionStatus(): 'connected' | 'disconnected' {
    return this.currentConnectionStatus;
  }

  /**
   * Set connection error callback - show connection related error/warning messages
   */
  public static setConnectionErrorCallback(callback: (message: string) => void): void {
    this.connectionErrorCallback = callback;
  }

  /**
   * Trigger connection error callback
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
   * Get Slave device name
   */
  private static getSlaveName(): string {
    // This will be synchronously obtained from AsyncStorage when called
    // Since AsyncStorage is asynchronous, return a default value here
    // The actual name should be read from AsyncStorage during initialization
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