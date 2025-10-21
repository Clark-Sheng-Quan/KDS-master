import { NativeModules } from 'react-native';
const { Printer_K1215 } = NativeModules;

// 检查打印机连接
export const checkPrinter = async () => {
  try {
    const connected = await Printer_K1215.isConnected();
    if (!connected) {
      console.log('正在重新连接打印机...');
      await Printer_K1215.reconnectPrinter();
    }
    return await Printer_K1215.isConnected();
  } catch (error) {
    console.error('打印机连接检查失败:', error);
    return false;
  }
};

// 打印订单
export const printOrder = async (order: any) => {
  try {
    // 先检查打印机状态
    const ready = await checkPrinter();
    if (!ready) {
      console.error('打印机未就绪');
      return false;
    }
    
    // 发送打印命令
    const result = await Printer_K1215.printOrder(order);
    console.log('打印结果:', result);
    return result;
  } catch (error) {
    console.error('打印订单失败:', error);
    return false;
  }
};