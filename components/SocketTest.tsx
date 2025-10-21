import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { io, Socket } from "socket.io-client";
import { BASE_API } from "../config/api";

export const SocketTest = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 添加日志函数
  const addLog = (message: string) => {
    console.log(message);
    setMessages((prev) => [message, ...prev]);
  };

  // 初始化Socket连接
  const connectSocket = () => {
    try {
      // 断开现有连接
      if (socket) {
        socket.disconnect();
      }

      addLog("正在连接到服务器...");

      // 创建新连接 - 修改连接配置
      const newSocket = io(BASE_API, {
        // 移除URL中的/connect
        transports: ["websocket"], // 仅使用websocket，与后端匹配
        path: "/connect", // 正确使用path参数
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        timeout: 20000, // 增加超时时间
      });

      // 设置连接事件
      newSocket.on("connect", () => {
        addLog(`已连接！Socket ID: ${newSocket.id}`);
        setConnected(true);
        setError(null);
      });

      newSocket.on("connect_error", (err) => {
        addLog(`连接错误: ${err.message}`);
        setError(`连接错误: ${err.message}`);
      });

      newSocket.on("disconnect", (reason) => {
        addLog(`断开连接: ${reason}`);
        setConnected(false);
      });

      // 注册服务器响应事件
      newSocket.on("server_response", (data) => {
        addLog(`服务器响应: ${JSON.stringify(data)}`);
      });

      // 注册广播消息事件
      newSocket.on("broadcast_message", (data) => {
        addLog(`广播消息: ${JSON.stringify(data)}`);
      });

      setSocket(newSocket);
    } catch (err: any) {
      addLog(`Socket创建失败: ${err.message}`);
      setError(`Socket创建失败: ${err.message}`);
    }
  };

  // 发送消息
  const sendMessage = () => {
    if (socket && connected) {
      const testMsg = {
        text: "这是一条测试消息",
        time: new Date().toISOString(),
      };
      addLog(`发送消息: ${JSON.stringify(testMsg)}`);
      socket.emit("message", testMsg);
    } else {
      addLog("未连接，无法发送消息");
    }
  };

  // 发送自定义事件
  const sendCustomEvent = () => {
    if (socket && connected) {
      const testData = { action: "test", value: Math.random() };
      addLog(`发送自定义事件: ${JSON.stringify(testData)}`);
      socket.emit("custom_event", testData);
    } else {
      addLog("未连接，无法发送事件");
    }
  };

  // 断开连接
  const disconnectSocket = () => {
    if (socket) {
      socket.disconnect();
      addLog("手动断开连接");
      setSocket(null);
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
        console.log("组件卸载，断开Socket连接");
      }
    };
  }, [socket]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Socket.IO 连接测试</Text>

      <View style={styles.statusContainer}>
        <Text>状态: </Text>
        <Text style={connected ? styles.connected : styles.disconnected}>
          {connected ? "已连接" : "未连接"}
        </Text>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.buttonContainer}>
        <Button title="连接" onPress={connectSocket} disabled={connected} />
        <Button title="发送消息" onPress={sendMessage} disabled={!connected} />
        <Button
          title="发送自定义事件"
          onPress={sendCustomEvent}
          disabled={!connected}
        />
        <Button title="断开" onPress={disconnectSocket} disabled={!connected} />
      </View>

      <Text style={styles.logTitle}>日志:</Text>
      <ScrollView style={styles.logContainer}>
        {messages.map((msg, index) => (
          <Text key={index} style={styles.logMessage}>
            {msg}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connected: {
    color: "green",
    fontWeight: "bold",
  },
  disconnected: {
    color: "red",
    fontWeight: "bold",
  },
  error: {
    color: "red",
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 8,
  },
  logTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
  },
  logContainer: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 8,
    borderRadius: 4,
  },
  logMessage: {
    fontSize: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 4,
  },
});
