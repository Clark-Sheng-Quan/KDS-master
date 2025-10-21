import { NativeModules } from "react-native";

class OrderModule {
  private nativeModule: any;
  private onOrderReceived: ((order: any) => void) | null = null;

  constructor() {
    this.nativeModule = NativeModules.OrderHandlerModule;
  }

  // 绑定原生回调
  public async bind() {
    try {
      console.log("绑定TCP回调...");
      this.nativeModule.BindCallback(this.handleIncomingData);
      console.log("TCP回调绑定成功");
      return true;
    } catch (error) {
      console.error("绑定TCP回调失败:", error);
      throw error;
    }
  }

  // 处理接收到的TCP数据
  private handleIncomingData = (data: any) => {
    console.log("收到TCP数据:", data);
    this.nativeModule.BindCallback(this.handleIncomingData); //??
    console.log("data:", data);
    // 预检查是否是JSON格式
    if (typeof data === "string") {
      try {
        console.log("data:", data);
        const trimmedData = data.trim(); // 去除前后空白字符
        const isJSON = trimmedData.startsWith("{") && trimmedData.endsWith("}");
        if (!isJSON) {
          console.error("收到非JSON格式数据:", data);
          return;
        }

        const orderData = JSON.parse(trimmedData);

        // 检查数据结构
        if (!orderData || typeof orderData !== "object") {
          console.error("无效的JSON对象");
          return;
        }

        // 如果设置了回调函数，调用它
        if (this.onOrderReceived) {
          this.onOrderReceived(orderData);
        }
      } catch (error) {
        console.error("处理TCP数据失败:", error);
      }
    }
  };

  // 设置订单接收回调 这里的callback就可以拿到tcp传来的数据
  public setOrderCallback(callback: (order: any) => void) {
    this.onOrderReceived = callback;
  }

  // 关闭TCP服务器
  public async closeServer() {
    try {
      await this.nativeModule.closeServer();
      console.log("TCP服务器已关闭");
    } catch (error) {
      console.error("关闭TCP服务器失败:", error);
      throw error;
    }
  }

  // 添加发送TCP数据的方法
  public async sendTCPData(targetIP: string, data: any): Promise<boolean> {
    try {
      // 检查原生模块是否存在sendTCPData方法
      if (this.nativeModule && this.nativeModule.sendTCPData) {
        return await this.nativeModule.sendTCPData(targetIP, data);
      }
      console.warn("原生模块未实现sendTCPData方法");
      return false;
    } catch (error) {
      console.error(`发送TCP数据到${targetIP}失败:`, error);
      return false;
    }
  }
}
const orderModule = new OrderModule();
export default orderModule;
