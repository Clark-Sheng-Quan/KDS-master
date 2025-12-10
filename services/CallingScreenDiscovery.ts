import { EventEmitter } from 'events';

export interface CallingScreenDevice {
  name: string;
  ip: string;
  port: number;
  foundAt: number;
}

/**
 * Device discovery and caching service for Calling Screen
 * Discovery is now handled by useDeviceDiscovery hook
 * This service only manages caching and device state
 */
class CallingScreenDiscovery {
  private static instance: CallingScreenDiscovery;
  private cachedDevice: CallingScreenDevice | null = null;
  private eventEmitter: EventEmitter = new EventEmitter();

  private constructor() {}

  public static getInstance(): CallingScreenDiscovery {
    if (!CallingScreenDiscovery.instance) {
      CallingScreenDiscovery.instance = new CallingScreenDiscovery();
    }
    return CallingScreenDiscovery.instance;
  }

  /**
   * Get cached device without discovery
   */
  public getCachedDevice(): CallingScreenDevice | null {
    return this.cachedDevice;
  }

  /**
   * Set cached device manually (called after successful connection)
   */
  public setCachedDevice(device: CallingScreenDevice | null): void {
    this.cachedDevice = device;
  }

  /**
   * Clear cached device
   */
  public clearCache(): void {
    this.cachedDevice = null;
  }

  /**
   * Get event emitter for discovery events
   */
  public getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }
}

export const callingScreenDiscovery = CallingScreenDiscovery.getInstance();
