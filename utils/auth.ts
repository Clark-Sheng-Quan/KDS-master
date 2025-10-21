import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates'; // 需要先安装这个包
import { BASE_API } from '../config/api';

const API_URL = BASE_API;

export interface LoginResponse {
  message: string;
  role: string;
  status_code: number;
  token: string;
}

type AuthStateListener = (isAuthenticated: boolean) => void;
const listeners = new Set<AuthStateListener>();

// 将getToken独立导出，以便在各个服务中使用
export const getToken = async (): Promise<string | null> => {
  try {
    const token = await AsyncStorage.getItem('token');
    return token;
  } catch (error) {
    console.error("获取token错误:", error);
    return null;
  }
};

export const auth = {
  // 添加认证状态监听器
  addAuthStateListener(listener: AuthStateListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  // 通知所有监听器状态变化
  notifyAuthStateChange(isAuthenticated: boolean) {
    listeners.forEach(listener => listener(isAuthenticated));
  },

  // 登录
  async login(email: string, password: string) {
    try {
      // 创建超时控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      
      const response = await fetch(`${API_URL}/admin/terminal_login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      console.log(`登录响应状态: ${response.status}`);

      const data: LoginResponse = await response.json();
      
      if (data.status_code === 200) {
        // 保存 token
        await AsyncStorage.setItem('token', data.token);
        // 通知状态变化
        auth.notifyAuthStateChange(true);
        return { success: true, data };
      } else {
        return { success: false, error: data.message };
      }
    } catch (error: any) {
      console.error("登录错误详情:", error);
      
      // 提供更详细的错误信息
      let errorMessage = "网络错误";
      
      if (error.name === 'AbortError') {
        errorMessage = "请求超时，请检查网络连接或服务器状态";
      } else if (error.message && error.message.includes('Network request failed')) {
        errorMessage = "网络请求失败，请检查您的网络连接或服务器是否可用";
      } else if (error.message) {
        errorMessage = `登录失败: ${error.message}`;
      }
      
      return { success: false, error: errorMessage };
    }
  },

  // 登出
  async logout() {
    try {
      // 仅删除 token，而不是清空所有存储
      await AsyncStorage.removeItem('token');
      // 通知所有监听器认证状态变为 false
      auth.notifyAuthStateChange(false);
      return true;
    } catch (error) {
      console.error("Logout error:", error);
      return false;
    }
  },

  // 检查是否已登录
  async isAuthenticated() {
    const token = await AsyncStorage.getItem('token');
    return !!token;
  },

  // 导出getToken方法
  getToken,
};
