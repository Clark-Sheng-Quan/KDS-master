# KDS - Kitchen Display System

KDS is a specialized system designed for the food service industry to receive, process, and display orders from various channels, improving kitchen efficiency and order processing accuracy. The system supports a master/slave architecture, allowing orders to be distributed to different displays based on food categories, with real-time order status updates.

## Features

- **Multi-channel Order Reception**: Support for receiving orders from online platforms, self-service kiosks, web, and more
- **Master/Slave Architecture**: Support for one master KDS and multiple slave KDS in a distributed setup
- **Category-based Distribution**: Orders are distributed to different displays based on food categories (drinks, hot food, cold food, desserts, etc.)
- **Real-time Status Updates**: Order status updates in real-time, including new orders, in-process, and completed
- **Order Prioritization**: Automatic ordering based on urgency and order time
- **Inventory Management**: Real-time tracking and updating of inventory, with support for low-stock alerts and sold-out marking
- **Background Service**: Support for Android devices to continuously receive orders even when the app is running in the background
- **Multi-language Support**: Interface available in Chinese and English
- **Printing Functionality**: Support for order receipt printing
- **Data Statistics**: Order data statistics and analysis features
- **TCP Communication**: Master-slave KDS communication based on TCP protocol, ensuring accurate order information transmission

## System Architecture

The system uses a distributed architecture with the following components:

1. **Master KDS**:

   - Receives orders from all channels
   - Processes order categorization and distribution
   - Manages slave KDS connections
   - Synchronizes order status

2. **Slave KDS**:

   - Receives specific category orders distributed from the master KDS
   - Reports order status changes to the master KDS
   - Focuses on processing orders for specific categories

3. **Background Service**:

   - Maintains TCP server running continuously on Android devices
   - Periodically checks for new orders
   - Receives orders even when the app is in the background

4. **Order Processing Flow**:
   - Order Reception → Order Formatting → Category Classification → Order Distribution → Status Updates → Order Completion

## Technology Stack

- **Frontend**: React Native + Expo
- **Backend Communication**: TCP Socket
- **Storage**: AsyncStorage
- **State Management**: React Context API
- **UI Components**: React Native Components + Custom Components
- **Native Modules**: Java/Kotlin (Android)
- **Printing Support**: Custom Printer Module
- **Background Service**: Android Foreground Service

## Installation and Usage

### Requirements

- Node.js 14+
- npm 6+
- Android Studio (for Android development)
- Xcode (for iOS development, Mac only)
- Expo CLI

### Installation Steps

1. Install dependencies

   ```bash
   npm install
   ```

2. Start development server

   ```bash
   npm run android
   ```

3. Run on emulator or physical device (optional)
   - Press `a` to run on Android emulator
   - Press `i` to run on iOS simulator (Mac only)
   - Scan QR code with Expo Go app to run on a physical device

### Configuration

1. **Master KDS Setup**:

   - Select "Master Display" role in the settings page
   - Configure TCP port (default 4322)
   - Add IP addresses and categories for slave KDS devices

2. **Slave KDS Setup**:

   - Select "Auxiliary Display" role in the settings page
   - Enter the master KDS IP address
   - Select the food category to display

3. **Background Service Configuration** (Android):
   - Enable "Background Order Reception" option in the settings page
