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
  onCall?: () => void;
  showCallButton?: boolean;
  style?: ViewStyle;
}

export const OrderActions: React.FC<OrderActionsProps> = React.memo(({
  orderId,
  onDone,
  onCancel,
  onCall,
  showCallButton = false,
  style,
}) => {
  return (
    <View style={[styles.buttonContainer, style]}>
      {showCallButton ? (
        <>
          <TouchableOpacity style={[styles.button, styles.doneButton]} onPress={onDone}>
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
          <View style={styles.buttonDivider} />
          <TouchableOpacity style={[styles.button, styles.callButton]} onPress={onCall}>
            <Text style={styles.buttonText}>Call</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Done</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: "row",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.buttonActionColor,
    width: "100%",
    height: 50,
    bottom: 0,
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButton: {
    flex: 1, // 50% width
  },
  callButton: {
    flex: 1, // 50% width
  },
  buttonDivider: {
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    height: "100%",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
