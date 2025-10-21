import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { NativeModules } from "react-native";
import { printTestReceipt } from "../services/testPrinter";
import { checkPrinter } from "../services/orderPrinter";

const { Printer_K1215 } = NativeModules;

export const PrinterTestCard = () => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // 检查连接状态
  const checkConnection = async () => {
    try {
      const connected = await Printer_K1215.isConnected();
      setIsConnected(connected);
      return connected;
    } catch (error) {
      console.error("检查打印机连接失败:", error);
      return false;
    }
  };

  // 组件挂载时检查连接
  useEffect(() => {
    checkConnection();
  }, []);

  // 连接打印机
  const connectPrinter = async () => {
    setIsConnecting(true);
    try {
      // 使用已有的reconnectPrinter方法重新连接打印机
      await Printer_K1215.reconnectPrinter();
      const connected = await checkConnection();

      if (connected) {
        Alert.alert("成功", "已成功连接到打印机");
      } else {
        Alert.alert("失败", "连接打印机失败，请检查USB连接");
      }
    } catch (error) {
      console.error("连接打印机失败:", error);
      Alert.alert("错误", `连接时出错: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // 测试打印
  const handleTestPrint = async () => {
    if (isPrinting) return;

    setIsPrinting(true);
    try {
      // 先检查连接状态
      const isReady = await checkPrinter();

      if (!isReady) {
        Alert.alert("未连接", "打印机未连接，请先连接打印机");
        setIsPrinting(false);
        return;
      }

      const success = await printTestReceipt();
      if (success) {
        Alert.alert("成功", "测试订单已成功打印");
      } else {
        Alert.alert("失败", "打印测试订单失败，请检查打印机连接");
      }
    } catch (error) {
      Alert.alert("错误", `打印过程出错: ${error}`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>打印机测试</Text>

      {/* 连接状态 */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>状态:</Text>
        <Text
          style={[
            styles.statusValue,
            isConnected ? styles.connectedStatus : styles.disconnectedStatus,
          ]}
        >
          {isConnected ? "已连接" : "未连接"}
        </Text>

        <TouchableOpacity
          style={styles.connectButton}
          onPress={connectPrinter}
          disabled={isConnecting}
        >
          <Text style={styles.connectButtonText}>
            {isConnecting ? "连接中..." : "连接打印机"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 测试打印区域 */}
      <Text style={styles.infoText}>测试USB打印机连接并打印样例订单</Text>

      <TouchableOpacity
        style={[
          styles.printButton,
          (isPrinting || !isConnected) && styles.printButtonDisabled,
        ]}
        onPress={handleTestPrint}
        disabled={isPrinting || !isConnected}
      >
        <Text style={styles.printButtonText}>
          {isPrinting ? "打印中..." : "测试打印"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 16,
  },
  connectedStatus: {
    color: "green",
  },
  disconnectedStatus: {
    color: "red",
  },
  connectButton: {
    backgroundColor: "#4CAF50",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  connectButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  printButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  printButtonDisabled: {
    backgroundColor: "#b0c4de",
  },
  printButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});
