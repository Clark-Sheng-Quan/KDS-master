# KDS - Kitchen Display System

A Kitchen Display System for food service businesses to receive and display orders from multiple sources in real-time, with Calling Screen device integration.

## Features

- Multi-source order reception (TCP and API)
- Real-time order management with automatic deduplication
- Category-based order filtering
- Calling Screen integration with device discovery
- Real-time status updates
- Inventory management
- Audio alerts for new orders
- Multi-language support
- Order receipt printing

## System Architecture

### Network Communication

```
POS System
    ↓ (TCP)
TCPSocketService
    ↓
Backend API
    ↓ (Polling)
OrderService
    ├─ Deduplication
    ├─ Filtering
    ├─ Notifications
    └─ Alerts
    ↓
OrderContext
    ↓
UI Components
```

### Data Flow

1. **TCP Order Flow**:
   - POS connects and sends orders
   - TCPSocketService parses requests
   - OrderService processes orders
   - CallingScreen notified
   - Audio alert triggered

2. **API Order Flow**:
   - Backend API polling initiated
   - Orders fetched and formatted
   - CallingScreen notified
   - Audio alert triggered

3. **Order Ready Notification**:
   - User marks order complete
   - CallingScreen receives notification
   - Display shows ready status

### Components

| Component | Responsibility |
|-----------|-----------------|
| tcpSocketService.ts | TCP server and HTTP parsing |
| OrderService.ts | Order business logic |
| CallingScreenService.ts | Calling Screen communication |
| CallingScreenDiscoveryPanel.tsx | Device discovery UI |
| OrderContext.tsx | State management |
| DistributionService.ts | System initialization |
| DeviceDiscoveryModule.java | mDNS device discovery |
| NetworkDevice.java | Device data model |

## Installation

### Requirements

- Node.js 14+
- npm 6+
- Android Studio
- Xcode
- Expo CLI

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run android
   ```

3. Run on device:
   - Press `a` for Android emulator
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go

## Configuration

1. **POS System**: Configure to send orders to KDS IP
2. **Backend API**: Set endpoint in `config/api.ts`
3. **Calling Screen**: Enable mDNS discovery and connect device
4. **Order Category**: Set in Settings

### Project Structure

```
KDS-master-1/
├── app/                    # React Native app
├── components/             # React components
├── services/               # Business logic
├── hooks/                  # Custom hooks
├── contexts/               # React Context
├── android/                # Android-specific code
└── config/                 # Configuration
```

### Key Services

- **TCPSocketService**: TCP server implementation
- **OrderService**: Core order management
- **CallingScreenService**: Device communication

## Troubleshooting

- **Orders not received**: Check TCP server status and POS connection
- **Calling Screen issues**: Verify device discovery and network connectivity
- **API orders not fetching**: Check endpoint configuration

## License

Proprietary - All rights reserved
