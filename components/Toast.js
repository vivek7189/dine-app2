import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TYPE_CONFIG = {
  success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', icon: 'checkmark-circle', iconColor: '#22c55e' },
  error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: 'alert-circle', iconColor: '#ef4444' },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: 'warning', iconColor: '#f59e0b' },
  info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: 'information-circle', iconColor: '#3b82f6' },
};

function ToastItem({ id, message, type = 'info', title, duration = 4000, onHide }) {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(), duration);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHide?.(id));
  };

  return (
    <Animated.View style={[styles.toast, { backgroundColor: config.bg, borderLeftColor: config.border, transform: [{ translateY }], opacity }]}>
      <Ionicons name={config.icon} size={20} color={config.iconColor} style={styles.icon} />
      <View style={styles.textContainer}>
        {title && <Text style={[styles.title, { color: config.text }]}>{title}</Text>}
        <Text style={[styles.message, { color: config.text }]} numberOfLines={2}>{message}</Text>
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="close" size={16} color={config.text} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastContainer({ toasts = [], onHide }) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} onHide={onHide} />
      ))}
    </View>
  );
}

let _idCounter = 0;

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 4000, title) => {
    const id = `toast_${++_idCounter}_${Date.now()}`;
    setToasts(prev => [...prev.slice(-2), { id, message, type, duration, title }]); // max 3 visible
    return id;
  }, []);

  const toast = {
    success: (message, duration, title) => addToast(message, 'success', duration, title),
    error: (message, duration, title) => addToast(message, 'error', duration, title),
    warning: (message, duration, title) => addToast(message, 'warning', duration, title),
    info: (message, duration, title) => addToast(message, 'info', duration, title),
  };

  const ToastView = useCallback(() => (
    <ToastContainer toasts={toasts} onHide={removeToast} />
  ), [toasts, removeToast]);

  return { toast, toasts, removeToast, ToastView };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  icon: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
});
