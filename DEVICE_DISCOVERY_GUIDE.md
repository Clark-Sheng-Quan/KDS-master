# 设备发现模块集成指南 (Device Discovery Integration Guide)

## 概述 (Overview)

这是一个完整的 React Native + Java 集成方案，用于在 LAN 网络上发现和管理其他 KDS 设备。

### 核心功能 (Core Features)

- 🔍 **自动设备发现**: 使用 Android NSD (Network Service Discovery)
- 📡 **设备广播**: 将当前设备广播到网络
- 📋 **设备管理**: 查看、编辑、锁定、移除设备
- 💾 **本地存储**: 使用 SharedPreferences 持久化设备数据
- ⚡ **实时同步**: 每5秒自动刷新设备列表

---

## 文件结构 (File Structure)

```
android/app/src/main/java/com/anonymous/KDS/
├── DeviceDiscoveryModule.java          # React Native 原生模块
├── DeviceDiscovery/
│   ├── DeviceDiscovery.java            # NSD 服务发现核心
│   ├── DeviceMappingService.java       # 设备管理和存储
│   └── DiscoveryRegistry.java          # 设备广播注册
└── models/
    └── NetworkDevice.java              # 网络设备数据模型

hooks/
└── useDeviceDiscovery.ts              # React Hook 集成

components/
└── DeviceDiscoveryPanel.tsx           # UI 组件
```

---

## 使用说明 (Usage Guide)

### 1. 初始化设备发现

在应用启动时（通常在 Settings 或 Dashboard）：

```tsx
import { useDeviceDiscovery } from '../hooks/useDeviceDiscovery';

export const SettingsScreen = () => {
  const {
    devices,
    loading,
    initialized,
    setDeviceName,
    refreshDevices,
  } = useDeviceDiscovery();

  // Hook 会自动初始化和定期刷新设备列表
};
```

### 2. 自定义本地设备名称

```tsx
// 在应用启动时设置有意义的设备名称
await setDeviceName('KDS-Kitchen-Station');
```

设备名称格式建议：`KDS-{Location}` 例如：
- `KDS-Kitchen`
- `KDS-Preparation`
- `KDS-Expediting`

### 3. 显示设备发现面板

```tsx
import { DeviceDiscoveryPanel } from '../components/DeviceDiscoveryPanel';
import { useState } from 'react';

export const SettingsScreen = () => {
  const [showDiscovery, setShowDiscovery] = useState(false);

  return (
    <View>
      <TouchableOpacity onPress={() => setShowDiscovery(true)}>
        <Text>📡 Discover Devices</Text>
      </TouchableOpacity>

      <DeviceDiscoveryPanel
        visible={showDiscovery}
        onClose={() => setShowDiscovery(false)}
      />
    </View>
  );
};
```

### 4. 获取和使用设备列表

```tsx
const { devices } = useDeviceDiscovery();

// devices 是 NetworkDevice[] 数组
devices.forEach(device => {
  console.log(`Device: ${device.name}`);
  console.log(`Address: ${device.ip}:${device.port}`);
  console.log(`Locked: ${device.locked}`);
  
  // 用于建立连接
  const url = `http://${device.ip}:${device.port}`;
});
```

---

## API 参考 (API Reference)

### useDeviceDiscovery Hook

```typescript
interface UseDeviceDiscoveryReturn {
  // 状态
  devices: NetworkDevice[];           // 发现的设备列表
  loading: boolean;                   // 正在加载
  error: string | null;               // 错误消息
  initialized: boolean;               // 是否已初始化
  
  // 方法
  initialize: () => Promise<void>;    // 初始化发现服务
  refreshDevices: () => Promise<void>; // 刷新设备列表
  setDeviceName: (deviceName: string) => Promise<void>; // 设置本地设备名称
  modifyDevice: (id, name, ip, port) => Promise<void>;  // 编辑设备
  lockDevice: (id, locked) => Promise<void>;            // 锁定/解锁设备
  removeDevice: (id) => Promise<void>;                  // 移除设备
  stopDiscovery: () => Promise<void>;                   // 停止发现服务
}
```

### NetworkDevice 数据模型

```typescript
interface NetworkDevice {
  id: string;              // 服务标识（唯一）
  name: string;            // 设备显示名称
  ip: string;              // IP 地址
  port: number;            // 端口号
  locked: boolean;         // 是否被锁定（锁定后不能修改）
}
```

---

## 配置说明 (Configuration)

### 修改设备广播名称

编辑 `DiscoveryRegistry.java`：

```java
public DiscoveryRegistry(Context context) {
  // ...
  SERVICE_NAME = "KDS:"+shortId;  // 修改这里的格式
}
```

### 修改广播端口

编辑 `DiscoveryRegistry.java`：

```java
public static final int SERVICE_PORT = 8080;  // 修改这个端口
```

### 修改设备刷新间隔

编辑 `hooks/useDeviceDiscovery.ts`：

```tsx
// 定期刷新设备列表（每5秒）
const interval = setInterval(() => {
  refreshDevices();
}, 5000);  // 改为其他时间间隔（毫秒）
```

---

## Android 权限 (Android Permissions)

已在 `AndroidManifest.xml` 中添加的权限：

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE"/>
<uses-permission android:name="android.permission.CHANGE_WIFI_MULTICAST_STATE"/>
```

这些权限允许应用：
- 访问网络
- 查询网络状态
- 使用 mDNS/NSD 服务发现
- 控制 WiFi 多播锁

---

## 故障排除 (Troubleshooting)

### 问题 1: 无法发现其他设备

**原因**:
- 设备不在同一 WiFi 网络
- WiFi 隔离功能已启用
- NSD 服务未启动

**解决**:
1. 确保所有设备连接到同一 WiFi 网络
2. 在路由器上禁用 WiFi 隔离
3. 检查 logcat：`adb logcat | grep "DEVICE_DISCOVERY"`

### 问题 2: 设备显示为"Unknown"或 IP 为空

**原因**:
- NSD 解析失败
- 设备名称格式不正确

**解决**:
1. 使用 `setDeviceName()` 设置清晰的设备名称
2. 重启应用并重试
3. 检查 logcat 日志中的解析错误

### 问题 3: 权限错误

**解决**:
1. 在 Android 6.0+ 上，需要在运行时请求权限
2. 如果使用 Expo，权限会自动处理
3. 确保 AndroidManifest.xml 中有所有必需的权限

---

## 调试 (Debugging)

### 查看发现日志

```tsx
const { devices } = useDeviceDiscovery();

// logcat 中会显示详细日志
// TAG: DEVICE_DISCOVERY, DEVICE_MAPPING_SERVICE, DeviceDiscoveryModule
```

### Android Studio Logcat

```bash
adb logcat | grep -E "DEVICE|Discovery"
```

### 测试命令

```bash
# 编译和运行
npm run android

# 查看实时日志
npm run android -- --verbose
```

---

## 常见用例 (Common Use Cases)

### 1. 在厨房显示屏间同步订单

```tsx
const { devices } = useDeviceDiscovery();

const broadcastOrderToKitchen = async (orderId: string) => {
  for (const device of devices) {
    if (!device.locked && device.name.includes('Kitchen')) {
      const url = `http://${device.ip}:${device.port}/api/orders/${orderId}`;
      await fetch(url);
    }
  }
};
```

### 2. 主从 KDS 同步

```tsx
const { devices, setDeviceName } = useDeviceDiscovery();

useEffect(() => {
  // 识别主 KDS
  const masterKDS = devices.find(d => d.name.includes('Master'));
  if (masterKDS) {
    // 连接到主 KDS 以获取订单更新
  }
}, [devices]);
```

### 3. 设备健康检查

```tsx
const checkDeviceHealth = async (device: NetworkDevice) => {
  try {
    const response = await fetch(`http://${device.ip}:${device.port}/health`, {
      timeout: 5000,
    });
    return response.ok;
  } catch {
    return false;
  }
};
```

---

## 性能优化 (Performance Tips)

1. **减少刷新频率**: 将刷新间隔从 5000ms 增加到 30000ms（30秒）
2. **条件查询**: 仅在需要时刷新，而不是定期刷新
3. **缓存设备**: 使用 Redux 或 Context 缓存设备列表
4. **后台服务**: 考虑在后台服务中运行发现，而不是在 UI 线程中

---

## 安全建议 (Security Recommendations)

1. ✅ 使用设备锁定功能防止意外修改
2. ✅ 限制对敏感操作的访问（如删除设备）
3. ✅ 验证设备连接前的身份
4. ✅ 在生产环境中使用 HTTPS
5. ✅ 定期更新 Android 和依赖项

---

## 支持的平台 (Supported Platforms)

- ✅ Android 5.0+ (API 21+)
- ❌ iOS (需要另外实现 Bonjour/mDNS)
- ❌ Web

---

## 更新日志 (Changelog)

### v1.0.0 (2024-10-22)
- ✨ 初始版本
- ✨ 完整的设备发现和管理功能
- ✨ React Native Hook 集成
- ✨ UI 组件和面板

---

## 许可证 (License)

根据项目许可证使用。

---

## 需要帮助? (Need Help?)

检查以下资源：
1. Android NSD 文档: https://developer.android.com/training/connect-devices-securely/nsd
2. React Native Bridge: https://reactnative.dev/docs/native-modules-android
3. 项目 README.md
