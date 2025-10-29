import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../contexts/LanguageContext';

interface ConnectionBannerProps {
  connectionStatus?: 'connected' | 'disconnected';
  onDismiss?: () => void;
  autoHideDuration?: number; // 毫秒，默认 30000ms (30秒)
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  connectionStatus,
  onDismiss,
  autoHideDuration = 30000,
}) => {
  const { t } = useLanguage();
  const [isDismissed, setIsDismissed] = useState(false);
  const [heightAnim] = useState(new Animated.Value(0));
  const [previousStatus, setPreviousStatus] = useState<'connected' | 'disconnected'>('disconnected');

  // 当连接状态从 connected 变为 disconnected 时，重置 isDismissed
  useEffect(() => {
    if (previousStatus === 'connected' && connectionStatus === 'disconnected') {
      setIsDismissed(false);
    }
    setPreviousStatus(connectionStatus || 'disconnected');
  }, [connectionStatus]);

  // 处理显示/隐藏
  useEffect(() => {
    const shouldShowBanner = connectionStatus === 'disconnected' && !isDismissed;

    if (shouldShowBanner) {
      // 显示横幅
      Animated.timing(heightAnim, {
        toValue: 60,
        duration: 300,
        useNativeDriver: false,
      }).start();

      // 设置自动隐去的定时器
      const hideTimer = setTimeout(() => {
        setIsDismissed(true);
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }).start(() => {
          onDismiss?.();
        });
      }, autoHideDuration);

      return () => clearTimeout(hideTimer);
    } else {
      // 隐藏横幅
      Animated.timing(heightAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [connectionStatus, isDismissed, heightAnim, autoHideDuration, onDismiss]);

  const handleDismiss = () => {
    setIsDismissed(true);
    Animated.timing(heightAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      onDismiss?.();
    });
  };

  const shouldShow = connectionStatus === 'disconnected' && !isDismissed;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          height: heightAnim,
          opacity: heightAnim.interpolate({
            inputRange: [0, 60],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
        },
      ]}
    >
      {shouldShow && (
        <View style={styles.bannerContent}>
          <Ionicons
            name="warning"
            size={20}
            color="#fff"
            style={styles.icon}
          />
          <Text style={styles.message} numberOfLines={2}>
            {t('posNotConnected')}
          </Text>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.closeButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#d32f2f',
    overflow: 'hidden',
    zIndex: 1000,
    paddingTop: Platform.OS === 'ios' ? 4 : 0,
    paddingBottom: 4,
  },
  bannerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#d32f2f',
  },
  icon: {
    marginRight: 12,
    flexShrink: 0,
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
    marginLeft: 12,
    flexShrink: 0,
  },
});
