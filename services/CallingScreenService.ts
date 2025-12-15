import TcpSocket from 'react-native-tcp-socket';
import { callingScreenDiscovery, CallingScreenDevice } from './CallingScreenDiscovery';

export interface CallingScreenMessage {
  type: 'order_added' | 'order_ready' | 'order_served';
  orderId?: string;
  orderNumber?: string;
  status?: 'preparing' | 'ready' | 'served';
  tableNumber?: string;
  itemCount?: number;
  // Registration fields
  kdsId?: string;
  kdsIp?: string;
  kdsPort?: number;
}

// Re-export CallingScreenDevice from CallingScreenDiscovery
export { CallingScreenDevice } from './CallingScreenDiscovery';

class CallingScreenService {
  private static instance: CallingScreenService;
  private isRegistered: boolean = false;

  private constructor() {}

  public static getInstance(): CallingScreenService {
    if (!CallingScreenService.instance) {
      CallingScreenService.instance = new CallingScreenService();
    }
    return CallingScreenService.instance;
  }

  /**
   * Check if device is reachable using TCP connection
   */
  public async isDeviceReachable(device: CallingScreenDevice): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = TcpSocket.createConnection(
        {
          port: device.port,
          host: device.ip,
        },
        () => {
          // Successfully connected
          socket.destroy();
          resolve(true);
        }
      );

      socket.on('error', () => {
        resolve(false);
      });

      // Timeout after 3 seconds
      setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Send message to Calling Screen using raw HTTP over TCP
   */
  public async sendMessage(message: CallingScreenMessage, device: CallingScreenDevice): Promise<boolean> {
    if (!device) {
      console.warn('[CallingScreenService] No device provided for message send');
      return false;
    }

    console.log(`[CallingScreenService] Sending ${message.type} to ${device.ip}:${device.port}`);

    try {
      return new Promise((resolve) => {
        // Build proper HTTP request with headers and body
        const messageBody = JSON.stringify(message);
        const contentLength = new TextEncoder().encode(messageBody).length;

        const httpRequest =
          'POST /api/order HTTP/1.1\r\n' +
          `Host: ${device.ip}:${device.port}\r\n` +
          'Content-Type: application/json\r\n' +
          `Content-Length: ${contentLength}\r\n` +
          'Connection: close\r\n' +
          '\r\n' +
          messageBody;

        console.log(`[CallingScreenService] HTTP Request:\n${httpRequest.substring(0, 200)}...`);

        // Create TCP connection to Calling Screen
        const socket = TcpSocket.createConnection(
          {
            port: device.port,
            host: device.ip,
          },
          () => {
            console.log(`[CallingScreenService] Connected to ${device.ip}:${device.port}`);
          }
        );

        let responseTimeout: ReturnType<typeof setTimeout> | null = null;
        let responseBuffer = '';
        let responseReceived = false;

        socket.on('connect', () => {
          console.log(`[CallingScreenService] Socket connected, sending request`);

          try {
            socket.write(httpRequest);
            console.log(`[CallingScreenService] Request sent (${httpRequest.length} bytes)`);

            // Set timeout for response
            responseTimeout = setTimeout(() => {
              if (!responseReceived) {
                console.warn('[CallingScreenService] Response timeout after 5 seconds');
                socket.destroy();
                resolve(true);
              }
            }, 5000);
          } catch (error) {
            console.error('[CallingScreenService] Error writing to socket:', error);
            if (responseTimeout) clearTimeout(responseTimeout);
            socket.destroy();
            resolve(false);
          }
        });

        socket.on('data', (data: Buffer | string) => {
          const chunk = typeof data === 'string' ? data : data.toString('utf-8');
          responseBuffer += chunk;

          // Try to parse HTTP response
          const headerEndIndex = responseBuffer.indexOf('\r\n\r\n');
          if (headerEndIndex !== -1) {
            const headerPart = responseBuffer.substring(0, headerEndIndex);
            
            // Check if response is successful
            if (headerPart.includes('200 OK') || headerPart.includes('200')) {
              console.log(`[CallingScreenService] Received successful response for ${message.type}`);
              responseReceived = true;

              if (responseTimeout) clearTimeout(responseTimeout);
              socket.destroy();
              resolve(true);
            } else {
              console.warn(`[CallingScreenService] Received error response: ${headerPart.substring(0, 100)}`);
              responseReceived = true;

              if (responseTimeout) clearTimeout(responseTimeout);
              socket.destroy();
              resolve(false);
            }
          }
        });

        socket.on('error', (error: any) => {
          console.error(`[CallingScreenService] Socket error:`, error);
          if (responseTimeout) clearTimeout(responseTimeout);
          resolve(false);
        });

        socket.on('close', () => {
          console.log('[CallingScreenService] Socket closed');
          if (responseTimeout) clearTimeout(responseTimeout);
          if (!responseReceived) {
            resolve(true); // Consider success if connection closed
          }
        });

        socket.on('timeout', () => {
          console.error('[CallingScreenService] Socket timeout');
          if (responseTimeout) clearTimeout(responseTimeout);
          socket.destroy();
          resolve(false);
        });

        // Set connection timeout
        socket.setTimeout(5000);
      });
    } catch (error) {
      console.error('[CallingScreenService] Error in sendMessage:', error);
      return false;
    }
  }

  /**
   * Notify when order is added (preparing)
   */
  public async notifyOrderAdded(device: CallingScreenDevice, orderId: string, orderNumber: string, itemCount?: number, tableNumber?: string): Promise<boolean> {
    return this.sendMessage({
      type: 'order_added',
      orderId,
      orderNumber,
      status: 'preparing',
      itemCount,
      tableNumber,
    }, device);
  }

  /**
   * Notify when order is ready
   */
  public async notifyOrderReady(device: CallingScreenDevice, orderId: string, orderNumber: string, itemCount?: number, tableNumber?: string): Promise<boolean> {
    return this.sendMessage({
      type: 'order_ready',
      orderId,
      orderNumber,
      status: 'ready',
      itemCount,
      tableNumber,
    }, device);
  }

  /**
   * Notify when order is served
   */
  public async notifyOrderServed(device: CallingScreenDevice, orderId: string, orderNumber: string, itemCount?: number, tableNumber?: string): Promise<boolean> {
    return this.sendMessage({
      type: 'order_served',
      orderId,
      orderNumber,
      status: 'served',
      itemCount,
      tableNumber,
    }, device);
  }

  /**
   * Mark as registered
   */
  public setRegistered(registered: boolean): void {
    this.isRegistered = registered;
  }

  /**
   * Check if registered
   */
  public getIsRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Reset registration state (when device changes)
   */
  public resetRegistration(): void {
    this.isRegistered = false;
  }
}

export const callingScreenService = CallingScreenService.getInstance();
