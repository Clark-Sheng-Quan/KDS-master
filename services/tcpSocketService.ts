import TcpSocket from 'react-native-tcp-socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatTCPOrder } from './orderService/formatters';

// TCP server configuration - default port
const DEFAULT_TCP_PORT = 4322;

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
          
          // Check if there's an existing connection from a DIFFERENT IP
          let hasDifferentConnection = false;
          for (const [key] of this.clients.entries()) {
            const existingIP = key.split(':')[0];
            if (existingIP !== remoteIP) {
              hasDifferentConnection = true;
              break;
            }
          }
          
          // Only reject if connection is from a different POS
          if (hasDifferentConnection) {
            console.log(`[TCP] Rejected - already have an active connection from different POS`);
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
            return;
          }
          
          // Allow multiple connections from the same IP (don't close old ones)
          // This allows POS to maintain multiple simultaneous connections for different operations
          console.log(`[TCP] Total connections from ${remoteIP}: ${Array.from(this.clients.keys()).filter(k => k.startsWith(remoteIP + ':')).length + 1}`);
          
          // Save client connection
          this.clients.set(clientKey, socket);
          
          // Save POS socket reference for later completion messages
          this.posSocket = socket;
          
          // Save POS IP for reference
          this.masterIP = remoteIP;
          
          
          // Update connection status - mark as connected
          this.connectionStatus.set(remoteIP, true);
          
          // Call connection status callback
          if (this.connectionStatusCallback) {
            this.connectionStatusCallback('connected');
          }
          
          // Add a data buffer for each connection to handle packet sticking issues
          let dataBuffer = '';
          let incompleteDataTimeout: ReturnType<typeof setTimeout> | null = null;
          
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
              
              // Filter out data that is only whitespace
              if (dataBuffer.trim() === '') {
                console.warn(`[TCP] Buffer is empty/whitespace, ignoring`);
                return;
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
                return;
              }
              
              // Parse headers to get Content-Length
              const headerPart = dataBuffer.substring(0, headerEndIndex);
              const contentLengthMatch = headerPart.match(/Content-Length:\s*(\d+)/i);
              
              if (!contentLengthMatch) {
                console.warn(`[TCP] No Content-Length header found`);
                dataBuffer = '';
                return;
              }
              
              const contentLength = parseInt(contentLengthMatch[1], 10);
              const bodyStart = headerEndIndex + 4;
              const totalNeeded = bodyStart + contentLength;
              
              // Verify body content length in bytes (not string length)
              // const bodyPreview = dataBuffer.substring(bodyStart, Math.min(bodyStart + 50, dataBuffer.length));
              // const bodyPreviewBytes = new TextEncoder().encode(bodyPreview).length;
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
                }, 10000);
                return;
              }
              
              // Clear timeout - we have complete message
              if (incompleteDataTimeout) {
                clearTimeout(incompleteDataTimeout);
                incompleteDataTimeout = null;
              }
              
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
              
              console.log(`[HTTP] ========== COMPLETE HTTP MESSAGE RECEIVED ==========`);
              console.log(`[HTTP] Body: ${contentLength} bytes`);
              
              // Reset buffer for next request (keep any excess data)
              const excessData = dataBuffer.substring(charPosition);
              dataBuffer = excessData;
              
              try {
                // Parse JSON data
                if (jsonBody) {
                  const jsonData = JSON.parse(jsonBody);
                  
                  // Process HTTP request and send response
                  this.handleHttpRequest(jsonData, socket, clientKey);
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
                  `{"status":"error","message":"Invalid JSON: ${parseError.message}"}\n`;
                socket.write(errorResponse);
              }
              console.log(`[HTTP] ========== HTTP REQUEST PROCESSING COMPLETE ==========`);
              
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
   * Handle single HTTP request and send HTTP response
   */
  private static handleHttpRequest(jsonData: any, socket: any, clientKey: string): void {
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
    
    // All messages keep connection (keep-alive)
    const httpResponse = 
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${contentLength}\r\n` +
      'Connection: keep-alive\r\n' +
      '\r\n' +
      responseBody + '\n';
    
    
    socket.write(httpResponse, () => {
      console.log(`[TCP] Sent response (${contentLength} bytes):`, responseBody);
    });
    
    // Then handle different message types
    if (jsonData.type === 'registration') {
      // Handle registration
      const clientIP = this.getSocketIP(socket);
      this.masterIP = clientIP;
      
      // Update connection status
      this.connectionStatus.set(clientIP, true);
      
      // Add to persistent connection pool, keep connection
      this.persistentConnections.set(clientIP, socket);
      console.log(`[TCP] Registration received from: ${clientIP}`);
      
      // Call connection status callback
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback('connected');
      }
      
    } else if (jsonData.orderType === 'POS' && jsonData.orderitems && jsonData.id) {
      // Handle POS order format (contains orderitems array, needs formatting)
      // Convert format and process
      const formattedOrder = formatTCPOrder(jsonData);
      console.log('[TCP] Formatted order:', formattedOrder);
      this.executeOrderCallbacks(formattedOrder);
      
    } else {
      // Other message types - log and ignore
      console.log(`[TCP] Ignoring message type: ${messageType}`);
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
    console.log('[TCP] orderCallback exists:', !!this.orderCallback);
    console.log('[TCP] orderCallbacks array length:', this.orderCallbacks.length);
    
    // Execute single callback
    if (this.orderCallback) {
      try {
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
   * Send order items completed message to POS via existing socket connection
   */
  public static async sendOrderItemsCompleted(orderId: string, orderitems: any[]): Promise<boolean> {
    try {
      console.log(`[TCP] sendOrderItemsCompleted - masterIP=${this.masterIP}, clients.size=${this.clients.size}`);
      
      // List all active clients
      for (const [key, socket] of this.clients.entries()) {
        console.log(`[TCP] Active client: ${key}, destroyed=${socket.destroyed}`);
      }
      
      // Check if we have an active socket connection
      if (this.clients.size === 0) {
        console.warn(`[TCP] No active client connections`);
        return false;
      }

      // Get the first (and only) active socket
      let activeSocket = null;
      for (const [key, socket] of this.clients.entries()) {
        if (!socket.destroyed) {
          activeSocket = socket;
          console.log(`[TCP] Using active socket: ${key}`);
          break;
        }
      }

      if (!activeSocket) {
        console.warn(`[TCP] No valid socket found (all destroyed)`);
        return false;
      }

      const timestamp = new Date().toISOString();
      
      // Build completion message
      const completionMessage = {
        type: 'order_items_completed',
        id: orderId,
        orderitems: orderitems,
        timestamp: timestamp,
      };

      const messageBody = JSON.stringify(completionMessage);
      const contentLength = new TextEncoder().encode(messageBody).length;

      // Build HTTP request
      const httpRequest = 
        'POST / HTTP/1.1\r\n' +
        `Host: ${this.masterIP}:${this.tcpPort}\r\n` +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${contentLength}\r\n` +
        'Connection: keep-alive\r\n' +
        '\r\n' +
        messageBody;

      console.log(`[TCP] Sending completion message via existing socket...`);
      console.log(`[TCP] Message:`, completionMessage);

      // Send via existing socket
      try {
        activeSocket.write(httpRequest);
        console.log('[TCP] Order completion message sent successfully');
        return true;
      } catch (error) {
        console.error('[TCP] Failed to write completion message:', error);
        return false;
      }

    } catch (error) {
      console.error('[TCP] Error sending order completion:', error);
      return false;
    }
  }
}