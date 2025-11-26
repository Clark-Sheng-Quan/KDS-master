import React from "react";
import { Alert } from "react-native";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}

/**
 * 显示确认对话框 - 使用原生 Alert 而不是 Modal
 * 这样可以避免导航栏在 Modal 弹出时自动显示的问题
 */
export const showConfirmAlert = (
  title: string,
  message: string,
  confirmText: string,
  cancelText: string,
  onConfirm: () => void,
  onCancel?: () => void,
  isDanger?: boolean
) => {
  Alert.alert(
    title,
    message,
    [
      {
        text: cancelText,
        onPress: onCancel || (() => {}),
        style: "cancel",
      },
      {
        text: confirmText,
        onPress: onConfirm,
        style: isDanger ? "destructive" : "default",
      },
    ],
    { cancelable: false }
  );
};

/**
 * ConfirmModal 组件 - 用于直接调用
 * 使用原生 Alert 避免导航栏问题
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isDanger = false,
}) => {
  // 立即显示原生 Alert
  React.useEffect(() => {
    showConfirmAlert(
      title,
      message,
      confirmText,
      cancelText,
      onConfirm,
      onCancel,
      isDanger
    );
  }, []);

  return null;
};
