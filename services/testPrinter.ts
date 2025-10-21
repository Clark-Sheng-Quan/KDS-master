import { NativeModules } from 'react-native';
import { checkPrinter } from './orderPrinter';
import { FormattedOrder } from './types';

const { Printer_K1215 } = NativeModules;

// 创建测试订单数据
export const createTestOrder = (): FormattedOrder => {
  return {
    id: 'TEST-123456',
    orderId: 'TEST-123456',
    orderTime: new Date().toISOString(),
    pickupMethod: '堂食',
    tableNumber: 'A12',
    pickupTime: '立即取餐',
    items: [
      {
        id: 'ITEM001',
        name: '测试商品',
        quantity: 1,
        price: 38.0,
        category: '测试类别',
        options: [
          { name: '规格', value: '大份', price: 0 },
          { name: '加料', value: '加辣', price: 5 },
          { name: '备注', value: '少放盐', price: 0 }
        ]
      },
      {
        id: 'ITEM002',
        name: '测试套餐',
        quantity: 2,
        price: 58.0,
        category: '测试类别',
        options: []
      }
    ]
  };
};

// 执行测试打印
export const printTestReceipt = async (): Promise<boolean> => {
  try {
    // 检查打印机连接
    const isConnected = await checkPrinter();
    if (!isConnected) {
      console.error('打印机未连接或无法使用');
      return false;
    }
    
    // 创建测试订单
    const testOrder = createTestOrder();
    
    // 打印测试订单
    const result = await Printer_K1215.printOrder(testOrder);
    console.log('测试打印结果:', result);
    return result;
  } catch (error) {
    console.error('测试打印失败:', error);
    return false;
  }
}; 