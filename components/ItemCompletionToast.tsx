import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ItemCompletionToastProps {
  visible: boolean;
  itemName: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;  // milliseconds, default 3000
  positionTop?: number;  // Position from top, default 80
}

export const ItemCompletionToast: React.FC<ItemCompletionToastProps> = ({
  visible,
  itemName,
  onUndo,
  onDismiss,
  duration = 3000,
  positionTop = 80,
}) => {
  const [show, setShow] = useState(visible);
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShow(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Auto dismiss after duration
      const timer = setTimeout(() => {
        dismiss();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShow(false);
      onDismiss();
    });
  };

  if (!show) {
    return null;
  }

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  const handleUndo = () => {
    onUndo();
    dismiss();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX }],
          top: positionTop,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons name="checkmark-circle" size={32} color="#4CAF50" style={styles.checkIcon} />
        <View style={styles.textContainer}>
          <Text style={styles.label}>Item Completed</Text>
          <Text style={styles.itemName} numberOfLines={2}>
            {itemName}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.undoButton}
          onPress={handleUndo}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-undo" size={18} color="white" />
          <Text style={styles.undoText}>Undo</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    zIndex: 1000,
    width: 320,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    gap: 12,
  },
  checkIcon: {
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    maxWidth: 200,
  },
  undoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9B2F',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  undoText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
});
