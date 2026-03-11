import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { colors } from "../styles/color";
import { useLanguage } from "../contexts/LanguageContext";

interface OrderActionsProps {
  orderId: string;
  onDone: () => void;
  onCancel: () => void;
  onCall?: () => void;
  showCallButton?: boolean;
  callButtonPressed?: boolean;
  itemLevelMode?: boolean;
  style?: ViewStyle;
}

export const OrderActions: React.FC<OrderActionsProps> = React.memo(({
  orderId,
  onDone,
  onCancel,
  onCall,
  showCallButton = false,
  callButtonPressed = false,
  itemLevelMode = false,
  style,
}) => {
  const { t } = useLanguage();
  const isDoneDisabled = showCallButton && !callButtonPressed;
  const doneButtonText = itemLevelMode ? t("allDone") : t("done");
  
  return (
    <View style={[styles.buttonContainer, style]}>
      {showCallButton ? (
        <>
          <TouchableOpacity 
            style={[styles.button, styles.doneButton, isDoneDisabled && styles.buttonDisabled]} 
            onPress={onDone}
            disabled={isDoneDisabled}
          >
            <Text style={[styles.buttonText, isDoneDisabled && styles.buttonTextDisabled]}>{doneButtonText}</Text>
          </TouchableOpacity>
          <View style={styles.buttonDivider} />
          <TouchableOpacity style={[styles.button, styles.callButton]} onPress={onCall}>
            <Text style={styles.buttonText}>{t("call")}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>{doneButtonText}</Text>
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonTextDisabled: {
    color: "rgba(255, 255, 255, 0.5)",
  },
});
