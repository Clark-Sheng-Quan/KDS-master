import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTCPOrder } from './orderService/formatters';

// TCP server configuration - default port
const DEFAULT_TCP_PORT = 8080;

export class TCPSocketService {
  // Server instance
  private static server: any = null;
  // Client connection instances
  private static clients: Map<string, any> = new Map();
  // Persistent connection pool (for registration message keeping connection alive)
  private static persistentConnections: Map<string, any> = new Map();
  // Last connected client IP (for POS connection tracking)
  private static masterIP: string = "";
  // Last connected POS socket (for sending completion messages)
  private static posSocket: any = null;
  // Last connected POS IP (for fallback when masterIP might be cleared)
  private static posIP: string = "";
  
  // Current TCP port (dynamic)
  private static tcpPort: number = DEFAULT_TCP_PORT;
  
  // Order callback function
  private static orderCallback: ((order: any) => void) | null = null;
  // Array of order callback functions
  private static orderCallbacks: ((order: any) => void)[] = [];
  
  // Connection status tracking
  private static connectionStatus: Map<string, boolean> = new Map(); // Track connection status by IP
  private static connectionStatusCallback: ((status: 'connected' | 'disconnected') => void) | null = null;
  private static connectionErrorCallback: ((error: string, ip?: string) => void) | null = null;
  // Track all devices that have ever connected (history)
  private static connectedDeviceHistory: Map<string, { ip: string; port: number; deviceName: string; timestamp: number }> = new Map();
  
  /**
   * Get TCP port (from AsyncStorage or default value)
   */
  public static async getTcpPort(): Promise<number> {
    // Port is now fixed to 8080
    this.tcpPort = 8080;
    return 8080;
  }

  /**
   * Set TCP port - no longer used, port is fixed to 8080
   */
  public static async setTcpPort(port: number): Promise<boolean> {
    return true;
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
          const remotePort = socket.remotePort || 0;
          const clientKey = `${remoteIP}:${remotePort}`;
          console.log(`[TCP] Client connection request: ${remoteIP}`);
          
          // Allow multiple connections from different POS machines
          
          // Save client connection
          this.clients.set(clientKey, socket);
          // Save POS socket reference for later completion messages
          this.posSocket = socket;
          
          // Save POS IP for reference
          this.masterIP = remoteIP;
          this.posIP = remoteIP;
          
          
          // Update connection status - mark as connected
          this.connectionStatus.set(remoteIP, true);
          // Add to device history
          this.connectedDeviceHistory.set(remoteIP, {
            ip: remoteIP,
            port: this.tcpPort,
            deviceName: 'POS System',
            timestamp: Date.now()
          });
          
          // Call connection status callback
          if (this.connectionStatusCallback) {
            this.connectionStatusCallback('connected');
          }
          
          // Add a data buffer for each connection to handle packet sticking issues
          let dataBuffer = '';
          let incompleteDataTimeout: ReturnType<typeof setTimeout> | null = null;
          
          // 响应发送缓冲队列 - 和接收数据一样处理
          let responseQueue: string[] = [];
          let isWriting = false;
          
          /**
           * 队列式发送响应 - 确保响应完整发出
           */
          const queueResponse = (response: string) => {
            responseQueue.push(response);
            processResponseQueue();
          };
          
          const processResponseQueue = () => {
            if (isWriting || responseQueue.length === 0) {
              return;
            }
            
            isWriting = true;
            const response = responseQueue.shift();
            
            if (response) {
              try {
                const canContinue = socket.write(response);
                console.log(`[TCP] Response sent successfully (${response.length} bytes)`);
                
                if (!canContinue) {
                  // 缓冲区满，等待 drain 事件
                  socket.once('drain', () => {
                    isWriting = false;
                    processResponseQueue();
                  });
                } else {
                  isWriting = false;
                  processResponseQueue();
                }
              } catch (error) {
                console.error(`[TCP] Failed to write response:`, error);
                isWriting = false;
                processResponseQueue();
              }
            }
          };
          
          // Receive data
          socket.on('data', (data: string | Buffer) => {
            try {
              const chunk = typeof data === 'string' ? data : data.toString('utf8');
              
              // Add to buffer
              dataBuffer += chunk;
              
              // Clear previous timeout since we received more data
              if (incompleteDataTimeout) {
                clearTimeout(incompleteDataTimeout);
                incompleteDataTimeout = null;
              }
              
              // Process all complete messages in buffer - use loop instead of return
              while (true) {
                // Filter out data that is only whitespace
                if (dataBuffer.trim() === '') {
                  dataBuffer = '';
                  break;
                }
                
                // Try to find complete HTTP message
                const headerEndIndex = dataBuffer.indexOf('\r\n\r\n');
                if (headerEndIndex === -1) {
                  // Headers not complete yet, wait for more data
                  // Set timeout to clear buffer if no more data comes (5 seconds)
                  incompleteDataTimeout = setTimeout(() => {
                    console.error(`[TCP] Timeout waiting for complete headers. Clearing buffer.`);
                    dataBuffer = '';
                    incompleteDataTimeout = null;
                  }, 5000);
                  break; // Exit loop, wait for more data
                }
                
                // Parse headers to get Content-Length
                const headerPart = dataBuffer.substring(0, headerEndIndex);
                const contentLengthMatch = headerPart.match(/Content-Length:\s*(\d+)/i);
                
                if (!contentLengthMatch) {
                  console.warn(`[TCP] No Content-Length header found`);
                  dataBuffer = '';
                  break; // Exit loop
                }
                
                const contentLength = parseInt(contentLengthMatch[1], 10);
                const bodyStart = headerEndIndex + 4;
                const totalNeeded = bodyStart + contentLength;
                
                // IMPORTANT: Content-Length is in BYTES, but JavaScript string length is in CHARACTERS
                // We need to check actual byte length, not character length
                const currentBodyBytes = new TextEncoder().encode(dataBuffer.substring(bodyStart)).length;
                const expectedBodyBytes = contentLength;
                // Check if we have the complete body (using BYTE count, not character count)
                if (currentBodyBytes < expectedBodyBytes) {
                  // Body not complete yet, wait for more data
                  const missing = expectedBodyBytes - currentBodyBytes;
                  console.log(`[TCP] Incomplete body: have ${currentBodyBytes} bytes, need ${expectedBodyBytes} bytes (missing ${missing} bytes)`);
                  
                  // Set timeout to clear buffer if no more data comes (10 seconds)
                  incompleteDataTimeout = setTimeout(() => {
                    console.error(`[TCP] Timeout waiting for complete body. Expected ${totalNeeded}, got ${dataBuffer.length}. Clearing buffer.`);
                    console.error(`[TCP] Last 100 chars of buffer: ${dataBuffer.slice(-100)}`);
                    dataBuffer = '';
                    incompleteDataTimeout = null;
                  }, 30000);
                  break; // Exit loop, wait for more data
                }
                
                // Clear timeout - we have complete message
                if (incompleteDataTimeout) {
                  clearTimeout(incompleteDataTimeout);
                  incompleteDataTimeout = null;
                }
                
                // Log complete message received
                console.log(`[TCP] ✓ Complete message received: ${currentBodyBytes} bytes`);
                
                // Extract body - need to find exact byte boundary
                // Since Content-Length is in bytes, we need to extract exactly that many bytes
                const fullBufferBytes = new TextEncoder().encode(dataBuffer);
                
                // Extract body bytes (from bodyStart byte position, take contentLength bytes)
                const extractedBodyBytes = fullBufferBytes.slice(bodyStart, bodyStart + contentLength);
                const jsonBody = new TextDecoder('utf-8').decode(extractedBodyBytes).trim();
                
                // Calculate where next message starts (in character positions)
                // We need to convert byte count back to character count
                const totalBytesConsumed = bodyStart + contentLength;
                let charPosition = 0;
                let byteCount = 0;
                const encoder = new TextEncoder();
                
                while (byteCount < totalBytesConsumed && charPosition < dataBuffer.length) {
                  byteCount += encoder.encode(dataBuffer[charPosition]).length;
                  charPosition++;
                }
                
                
                // Reset buffer for next request (keep any excess data)
                const excessData = dataBuffer.substring(charPosition);
                dataBuffer = excessData;
                
                try {
                  // Parse JSON data
                  if (jsonBody) {
                    const jsonData = JSON.parse(jsonBody);
                    
                    // Process HTTP request and send response (通过队列)
                    this.handleHttpRequest(jsonData, socket, clientKey, queueResponse);
                  } else {
                    console.error(`[TCP] Empty JSON body`);
                  }
                } catch (parseError: any) {
                  console.error(`[TCP] JSON parse error:`, parseError.message);
                  console.error(`[TCP] Body content: ${jsonBody.substring(0, 500)}`);
                  const errorResponse = 
                    'HTTP/1.1 400 Bad Request\r\n' +
                    'Content-Type: application/json\r\n' +
                    'Connection: keep-alive\r\n' +
                    '\r\n' +
                    `{"status":"error","message":"Invalid JSON: ${parseError.message}"}`;
                  queueResponse(errorResponse);
                }
                console.log(`[HTTP] ========== HTTP REQUEST PROCESSING COMPLETE ==========`);
                
                // 循环继续处理缓冲区中的下一个消息
              }
              
            } catch (error) {
              console.error(`[TCP] Error processing data:`, error);
            }
          });
          
          // Error and close handlers
          socket.on('error', (error) => {
            console.error(`[TCP] Socket error from ${remoteIP}:`, error);
            
            // Clear incomplete data timeout
            if (incompleteDataTimeout) {
              clearTimeout(incompleteDataTimeout);
              incompleteDataTimeout = null;
            }
            
            this.clients.delete(clientKey);
            this.connectionStatus.set(remoteIP, false);
            
            if (this.connectionErrorCallback) {
              this.connectionErrorCallback(error.message, remoteIP);
            }
          });
          
          socket.on('close', () => {
            console.log(`[TCP] Client disconnected: ${remoteIP}`);
            
            // Clear incomplete data timeout
            if (incompleteDataTimeout) {
              clearTimeout(incompleteDataTimeout);
              incompleteDataTimeout = null;
            }
            
            this.clients.delete(clientKey);
            
            // Check if there are still other connections from the same IP
            const hasOtherConnections = Array.from(this.clients.keys()).some(
              key => key.startsWith(remoteIP + ':')
            );
            
            if (!hasOtherConnections) {
              // No more connections from this IP
              this.connectionStatus.set(remoteIP, false);
              console.log(`[TCP] All connections from ${remoteIP} closed`);
              console.log(`[HTTP] ========== HTTP CONNECTION COMPLETE ==========`);
              if (this.connectionStatusCallback) {
                this.connectionStatusCallback('disconnected');
              }
            } else {
              console.log(`[TCP] ${remoteIP} still has ${Array.from(this.clients.keys()).filter(k => k.startsWith(remoteIP + ':')).length} active connection(s)`);
            }
          });
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
      } catch (error) {
        console.error('[TCP] Start server failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 安全发送HTTP响应 - 处理缓冲区问题
   */
  private static sendHttpResponse(socket: any, responseData: any): void {
    const responseBody = JSON.stringify(responseData);
    const contentLength = new TextEncoder().encode(responseBody).length;
    
    const httpResponse = 
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${contentLength}\r\n` +
      'Connection: keep-alive\r\n' +
      '\r\n' +
      responseBody;
    
    try {
      const canContinue = socket.write(httpResponse);
      
      if (!canContinue) {
        // 缓冲区满了，等待 drain 事件
        console.warn(`[TCP] Socket write buffer full, waiting for drain...`);
        socket.once('drain', () => {
          console.log(`[TCP] Socket drain event fired, buffer cleared`);
        });
      }
    } catch (error) {
      console.error(`[TCP] Failed to send response:`, error);
    }
  }

  private static handleHttpRequest(jsonData: any, socket: any, clientKey: string, queueResponse: (response: string) => void): void {
    const messageType = jsonData.type || jsonData.orderType || 'unknown';
    console.log(`[TCP] ${this.getSocketIP(socket)} - Message: ${messageType}`);
    
    // Prepare response data
    const responseData = {
      status: '200',
      message: 'Message processed',
      type: messageType
    };
    
    const responseBody = JSON.stringify(responseData);
    const contentLength = new TextEncoder().encode(responseBody).length;
    
    // Build HTTP response
    const httpResponse = 
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${contentLength}\r\n` +
      'Connection: keep-alive\r\n' +
      '\r\n' +
      responseBody;
    
    // 通过队列发送响应
    queueResponse(httpResponse);
    
    // Then handle different message types
    if (jsonData.type === 'registration') {
      // Handle registration
      const clientIP = this.getSocketIP(socket);
      // Try to get device name from multiple sources
      const deviceName = jsonData.deviceName 
        || jsonData.name 
        || jsonData.deviceId 
        || `POS`;
      this.masterIP = clientIP;
      
      // Update connection status
      this.connectionStatus.set(clientIP, true);
      // Add to device history
      this.connectedDeviceHistory.set(clientIP, {
        ip: clientIP,
        port: this.tcpPort,
        deviceName: deviceName,
        timestamp: Date.now()
      });
      
      // Add to persistent connection pool, keep connection
      this.persistentConnections.set(clientIP, socket);
      
      // Call connection status callback
      
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback('connected');
      }
      
    } else if ((jsonData.orderType === 'POS' || jsonData.orderType === 'TABLE_SESSION') && jsonData.orderitems && jsonData.id) {
      // Handle POS and TABLE_SESSION order formats (contains orderitems array, needs formatting)
      console.log(`[TCP] ========== Received TCP order (${jsonData.type || jsonData.orderType}) ==========`);
      console.log(`[TCP] Raw order data:`, JSON.stringify(jsonData, null, 2));
      
      // Convert format and process
      const formattedOrder = formatTCPOrder(jsonData);
      
      console.log(`[TCP] Formatted order:`, JSON.stringify(formattedOrder, null, 2));
      console.log(`[TCP] ================================`);
      
      // Also try to capture device name from order if this is first connection
      const clientIP = this.getSocketIP(socket);
      if (!this.connectedDeviceHistory.has(clientIP)) {
        const deviceName = jsonData.deviceName || jsonData.name || jsonData.deviceId || `POS`;
        this.connectedDeviceHistory.set(clientIP, {
          ip: clientIP,
          port: this.tcpPort,
          deviceName: deviceName,
          timestamp: Date.now()
        });
      }
      
      this.executeOrderCallbacks(formattedOrder);
      
    } else {
      // Other message types - log with full data
      // console.log(`[TCP] Received non-order message type: ${messageType}`);
    }
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
   * Set connection status callback - notified when client connects/disconnects
   */
  public static setConnectionStatusCallback(callback: (status: 'connected' | 'disconnected') => void): void {
    this.connectionStatusCallback = callback;
  }
  
  /**
   * Set connection error callback - notified when connection error occurs
   */
  public static setConnectionErrorCallback(callback: (error: string, ip?: string) => void): void {
    this.connectionErrorCallback = callback;
  }
  
  /**
   * Get connection status for a specific IP or all connections
   */
  public static getConnectionStatus(ip?: string): 'connected' | 'disconnected' {
    if (ip) {
      return this.connectionStatus.get(ip) ? 'connected' : 'disconnected';
    }
    // Return 'connected' if any client is connected
    const hasActiveConnection = this.clients.size > 0 || this.persistentConnections.size > 0;
    return hasActiveConnection ? 'connected' : 'disconnected';
  }
  
  /**
   * Disconnect specific IP or all clients
   */
  public static disconnect(ip?: string): void {
    if (ip) {
      // Disconnect all connections from specific IP
      let disconnectedCount = 0;
      for (const [clientKey, socket] of this.clients.entries()) {
        const clientIP = clientKey.split(':')[0];
        if (clientIP === ip) {
          try {
            socket.destroy();
            this.clients.delete(clientKey);
            disconnectedCount++;
            console.log(`[TCP] Client ${clientKey} disconnected by request`);
          } catch (error) {
            console.error(`[TCP] Error disconnecting client ${clientKey}:`, error);
          }
        }
      }
      
      if (disconnectedCount > 0) {
        this.connectionStatus.set(ip, false);
        console.log(`[TCP] Disconnected ${disconnectedCount} connection(s) from ${ip}`);
        
        // Only clear masterIP if it matches
        if (this.masterIP === ip) {
          this.masterIP = "";
        }
        
        // Close persistent connection for this IP
        if (this.persistentConnections.has(ip)) {
          try {
            this.persistentConnections.get(ip)?.destroy();
            this.persistentConnections.delete(ip);
          } catch (error) {
            console.error(`[TCP] Error closing persistent connection:`, error);
          }
        }
      }
    } else {
      // Disconnect all clients
      for (const [clientKey, socket] of this.clients.entries()) {
        try {
          socket.destroy();
          this.clients.delete(clientKey);
          console.log(`[TCP] Client ${clientKey} disconnected by request`);
        } catch (error) {
          console.error(`[TCP] Error disconnecting client:`, error);
        }
      }
      
      this.connectionStatus.clear();
      this.masterIP = "";
      
      // Close all persistent connections
      for (const [key, socket] of this.persistentConnections.entries()) {
        try {
          socket.destroy();
        } catch (error) {
          console.error(`[TCP] Error closing persistent connection:`, error);
        }
      }
      this.persistentConnections.clear();
      
      console.log(`[TCP] All connections closed - Ready for new connection`);
      
    }
    
    if (this.connectionStatusCallback) {
      this.connectionStatusCallback('disconnected');
    }
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

    // Close all clients
    closeConnections(this.clients, 'client');
    
    // Close server
    if (this.server) {
      this.server.close(() => {
        console.log('[TCP] Server stopped');
      });
      this.server = null;
    }
  }
  public static getMasterIP(): string {
    return this.masterIP;
  }

  /**
   * Get all connected POS devices with their connection status and IP
   */
  public static getConnectedPOSDevices(): Array<{ ip: string; port: number; deviceName: string; status: 'connected' | 'disconnected' }> {
    const devices: Array<{ ip: string; port: number; deviceName: string; status: 'connected' | 'disconnected' }> = [];
    
    // Return all devices from history, regardless of current connection status
    for (const [ip, deviceInfo] of this.connectedDeviceHistory.entries()) {
      const status = this.connectionStatus.get(ip) ? 'connected' : 'disconnected';
      devices.push({
        ip: deviceInfo.ip,
        port: deviceInfo.port,
        deviceName: deviceInfo.deviceName,
        status: status
      });
    }
    
    return devices;
  }

  /**
   * Remove a device from the device history (when user clicks Reset Connection)
   */
  public static removeDeviceFromHistory(ip: string): void {
    this.connectedDeviceHistory.delete(ip);
    this.connectionStatus.delete(ip);
    
    // If removing the masterIP, clear it
    if (this.masterIP === ip) {
      this.masterIP = "";
    }
  }

  /**
   * Send order items completed message to POS via a NEW SEPARATE TCP connection
   * This avoids disrupting the persistent connection used for receiving orders
   * 
   * @param orderId - Order ID
   * @param orderitems - Array of order items with id, name, qty, category
   * @returns true if message was sent successfully, false otherwise
   */
  // public static async sendOrderItemsCompleted(orderId: string, orderitems: any[]): Promise<boolean> {
  //   try {
  //     // Get POS IP address
  //     const posIP = this.masterIP || this.posIP;
  //     if (!posIP) {
  //       console.warn('[TCP] No POS IP available for sending completion message');
  //       return false;
  //     }

  //     console.log(`[TCP] Creating temporary connection to ${posIP}:${this.tcpPort} to send order completion`);

  //     // Create a new temporary connection (separate from the persistent one)
  //     const tempSocket = TcpSocket.createConnection({ 
  //       port: this.tcpPort, 
  //       host: posIP 
  //     }, () => {
  //       // Connection callback
  //     });

  //     return new Promise((resolve) => {
  //       let responseTimeout: ReturnType<typeof setTimeout> | null = null;
  //       let connectionEstablished = false;

  //       tempSocket.on('connect', () => {
  //         console.log(`[TCP] Temporary connection established to ${posIP}:${this.tcpPort}`);
  //         connectionEstablished = true;

  //         const timestamp = new Date().toISOString();

  //         // Build completion message
  //         const completionMessage = {
  //           type: 'order_items_completed',
  //           id: orderId,
  //           orderitems: orderitems,
  //           timestamp: timestamp,
  //         };

  //         const messageBody = JSON.stringify(completionMessage);
  //         const contentLength = new TextEncoder().encode(messageBody).length;

  //         // Build HTTP request with Connection: close to close after response
  //         const httpRequest =
  //           'POST / HTTP/1.1\r\n' +
  //           `Host: ${posIP}:${this.tcpPort}\r\n` +
  //           'Content-Type: application/json\r\n' +
  //           `Content-Length: ${contentLength}\r\n` +
  //           'Connection: close\r\n' +
  //           '\r\n' +
  //           messageBody;

  //         try {
  //           tempSocket.write(httpRequest);
  //           console.log(`[TCP] Order completion message sent to ${posIP} for order ${orderId}`);

  //           // Set timeout to wait for response
  //           responseTimeout = setTimeout(() => {
  //             console.log('[TCP] Response timeout, closing temporary connection');
  //             tempSocket.destroy();
  //             resolve(true); // Consider it success even if we didn't get response
  //           }, 3000);
  //         } catch (error) {
  //           console.error('[TCP] Failed to write completion message:', error);
  //           if (responseTimeout) clearTimeout(responseTimeout);
  //           tempSocket.destroy();
  //           resolve(false);
  //         }
  //       });

  //       tempSocket.on('data', (data: Buffer | string) => {
  //         const dataStr = typeof data === 'string' ? data : data.toString('utf-8');
  //         console.log(`[TCP] Received response from POS for order completion: ${dataStr.substring(0, 100)}`);

  //         if (responseTimeout) clearTimeout(responseTimeout);
  //         tempSocket.destroy();
  //         resolve(true);
  //       });

  //       tempSocket.on('error', (error: any) => {
  //         console.error(`[TCP] Error sending completion message to ${posIP}:`, error);
  //         if (responseTimeout) clearTimeout(responseTimeout);
  //         resolve(false);
  //       });

  //       tempSocket.on('close', () => {
  //         console.log('[TCP] Temporary connection closed');
  //         if (responseTimeout) clearTimeout(responseTimeout);
  //       });

  //       // Set connection timeout
  //       tempSocket.setTimeout(5000, () => {
  //         console.error('[TCP] Temporary connection timeout');
  //         if (responseTimeout) clearTimeout(responseTimeout);
  //         if (connectionEstablished) {
  //           tempSocket.destroy();
  //         }
  //         resolve(false);
  //       });
  //     });
  //   } catch (error) {
  //     console.error('[TCP] Error in sendOrderItemsCompleted:', error);
  //     return false;
  //   }
  // }
}