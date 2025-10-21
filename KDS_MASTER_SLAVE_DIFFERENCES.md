# Master KDS vs Slave KDS 显示差异分析

## 📊 **当前代码中的区别**

### **1. API 过滤层面（所有 KDS 都一样）**

**位置：** `services/orderService/networkService.ts:147`

```typescript
// 过滤订单数据，只返回未支付或已派送的订单，排除临时订单
const filteredOrders = result.orders.filter(
  (order: any) => (order.status === 'unpaid' || order.status === 'dispatch') && 
                   order.pick_method !== 'TEMP'
);
```

**说明：**
- ✅ **所有 KDS（Master 和 Slave）都使用相同的 API 过滤**
- ✅ 只获取 `unpaid` 或 `dispatch` 状态的订单
- ❌ **这里没有根据 Master/Slave 角色进行区分！**

---

### **2. UI 层面的分类过滤（Slave KDS 独有）**

**位置：** `app/(tabs)/home.tsx:144-220`

```typescript
const checkKDSRole = async () => {
  const role = await AsyncStorage.getItem("kds_role");
  const isSlaveKDS = role === "slave";

  if (isSlaveKDS) {
    // 获取子KDS的分类设置
    const categoryStr = await AsyncStorage.getItem("kds_category");
    const kdsCategory = categoryStr || "all";

    // Slave KDS 根据分类过滤订单和商品
    // ...过滤逻辑
  }
};
```

**说明：**
- ✅ **Slave KDS 可以设置分类过滤**（如 "Drinks"、"Food" 等）
- ✅ **根据 `kds_category` 只显示特定分类的商品**
- ✅ **Master KDS 没有这个过滤，显示所有订单**

---

### **3. 订单操作层面（Master vs Slave）**

**位置：** `components/OrderCard.tsx:78-83`

```typescript
const checkKDSRole = async () => {
  const role = await AsyncStorage.getItem("kds_role");
  setIsMaster(role !== "slave");
};
```

**Master KDS 操作：**
- 点击 "Done" 按钮 → 调用 API 更新状态
- 发送网络请求到服务器

**Slave KDS 操作：**
- 点击 "Done" 按钮 → 通过 TCP 通知 Master KDS
- 不直接调用 API

---

## ❌ **问题：当前代码没有根据角色过滤订单状态！**

### **现状：**
```typescript
// networkService.ts
order.status === 'unpaid' || order.status === 'dispatch'
```

**所有 KDS 都显示：**
- ✅ `unpaid` 状态的订单
- ✅ `dispatch` 状态的订单
- ❌ **不显示 `paid`、`processing`、`ready` 状态！**

---

## ✅ **应该的逻辑**

### **Master KDS 应该显示：**
```typescript
order.status === 'ready' || order.status === 'dispatch'
```
- 已完成制作、等待出餐的订单
- 已配送的订单（用于历史记录）

### **Slave KDS 应该显示：**
```typescript
order.status === 'paid' || order.status === 'processing'
```
- 已支付、待制作的订单
- 正在制作中的订单

---

## 🔧 **需要修改的代码**

### **方案1：在 API 层面根据角色过滤**

**修改位置：** `services/orderService/networkService.ts`

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";

// 在 fetchOrdersFromNetwork 函数中：
const role = await AsyncStorage.getItem("kds_role");
const isMaster = role !== "slave";

// 根据角色过滤订单
const filteredOrders = result.orders.filter((order: any) => {
  // 排除临时订单
  if (order.pick_method === 'TEMP') return false;
  
  // Master KDS: 显示 ready 和 dispatch
  if (isMaster) {
    return order.status === 'ready' || order.status === 'dispatch';
  }
  
  // Slave KDS: 显示 paid 和 processing
  return order.status === 'paid' || order.status === 'processing';
});
```

---

### **方案2：在 Context 层面过滤**

**修改位置：** `contexts/OrderContext.tsx`

在获取订单后，根据 `isKDSMaster` 状态过滤：

```typescript
const handleNewOrder = async (order: FormattedOrder) => {
  // 根据 KDS 角色过滤
  if (isKDSMaster) {
    // Master KDS 只接收 ready 和 dispatch
    if (order.status !== 'ready' && order.status !== 'dispatch') {
      return;
    }
  } else {
    // Slave KDS 只接收 paid 和 processing
    if (order.status !== 'paid' && order.status !== 'processing') {
      return;
    }
  }
  
  // ...添加订单逻辑
};
```

---

## 📋 **当前状态流程**

### **完整状态流程：**
```
unpaid → paid → processing → ready → dispatch
  ↓       ↓         ↓          ↓         ↓
未支付  已支付   制作中    已完成   已配送
```

### **Master KDS 看到的：**
```
ready → dispatch
  ↓         ↓
已完成   已配送
```

### **Slave KDS 看到的：**
```
paid → processing
  ↓         ↓
已支付   制作中
```

---

## 🎯 **总结**

### **当前代码中 Master/Slave 的区别：**

1. ✅ **分类过滤**：Slave KDS 可以按分类过滤（Drinks、Food 等）
2. ✅ **操作方式**：Master 调用 API，Slave 发送 TCP
3. ❌ **状态过滤**：**没有区别！都显示 `unpaid` 和 `dispatch`**

### **需要改进：**

- 🔧 **添加基于角色的状态过滤**
- 🔧 **Master KDS 显示 `ready` + `dispatch`**
- 🔧 **Slave KDS 显示 `paid` + `processing`**

---

## 📝 **建议**

你需要决定在哪一层进行过滤：
- **API 层**（networkService.ts）- 更高效，减少数据传输
- **Context 层**（OrderContext.tsx）- 更灵活，可以动态切换

建议在 **API 层** 进行过滤，因为可以减少不必要的数据获取和处理。
