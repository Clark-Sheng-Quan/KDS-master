import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { colors } from "../styles/color";

interface OrderActionsProps {
  orderId: string;
  onDone: () => void;
  onCancel: () => void;
  style?: ViewStyle;
}

export const OrderActions: React.FC<OrderActionsProps> = ({
  orderId,
  onDone,
  onCancel,
  style,
}) => {
  return (
    <View style={[styles.buttonContainer, style]}>
      <TouchableOpacity style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: "row",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.buttonActionColor,
    width: "100%",
    height: 50, // 设置一个固定高度
    bottom: 0, // 放置在底部
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
