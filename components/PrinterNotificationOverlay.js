import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  onPrinterEvent,
  getRemotePrintEnabled,
  getDisconnectAlertEnabled,
  getPrintNotificationsEnabled,
  getPendingPrintJobs,
  retryPendingPrintJob,
} from '../services/printerService';

const EVENT_CONFIG = {
  disconnected: {
    bg: '#fef2f2', border: '#ef4444', text: '#991b1b',
    icon: 'print-outline', iconColor: '#ef4444',
    title: 'Printer Disconnected',
    duration: 6000,
  },
  reconnecting: {
    bg: '#fffbeb', border: '#f59e0b', text: '#92400e',
    icon: 'sync-outline', iconColor: '#f59e0b',
    title: 'Reconnecting to Printer...',
    duration: 3000,
  },
  reconnected: {
    bg: '#f0fdf4', border: '#22c55e', text: '#166534',
    icon: 'checkmark-circle-outline', iconColor: '#22c55e',
    title: 'Printer Reconnected',
    duration: 2000,
  },
  fallback: {
    bg: '#fffbeb', border: '#f59e0b', text: '#92400e',
    icon: 'warning-outline', iconColor: '#f59e0b',
    title: 'Printer Issue',
    duration: 4000,
  },
  print_failed: {
    bg: '#fef2f2', border: '#ef4444', text: '#991b1b',
    icon: 'alert-circle-outline', iconColor: '#ef4444',
    title: 'Print Failed',
    duration: 8000,
  },
};

export default function PrinterNotificationOverlay() {
  const [notification, setNotification] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);
  const lastEventRef = useRef({ type: null, ts: 0 });
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const unsub = onPrinterEvent(async (event) => {
      const config = EVENT_CONFIG[event.type];
      if (!config) return;
      // Skip disconnect/fallback notifications when remote print is enabled — no local printer expected
      // Also skip when user has disabled the disconnect alert
      if (event.type === 'disconnected' || event.type === 'fallback') {
        const remotePrint = await getRemotePrintEnabled();
        if (remotePrint) return;
        const alertEnabled = await getDisconnectAlertEnabled();
        if (!alertEnabled) return;
      } else if (event.type === 'print_failed') {
        const remotePrint = await getRemotePrintEnabled();
        if (remotePrint) return;
        const notificationsEnabled = await getPrintNotificationsEnabled();
        if (!notificationsEnabled) return;
      }
      // Dedup: suppress same event type within 2 seconds
      const now = Date.now();
      if (lastEventRef.current.type === event.type
        && lastEventRef.current.jobId === event.jobId
        && now - lastEventRef.current.ts < 2000) return;
      lastEventRef.current = { type: event.type, jobId: event.jobId, ts: now };
      setNotification({
        ...config,
        message: event.message || config.title,
        jobId: event.jobId,
        canRetry: !!event.canRetry,
      });
    });

    // A job may have been interrupted while the app was killed/backgrounded. Never auto-reprint
    // (that risks duplicates); surface an explicit recovery action instead.
    Promise.all([getPendingPrintJobs(), getRemotePrintEnabled(), getPrintNotificationsEnabled()]).then(([jobs, remote, notifications]) => {
      if (remote || !notifications) return;
      const latest = jobs[jobs.length - 1];
      if (!latest) return;
      const config = EVENT_CONFIG.print_failed;
      setNotification({
        ...config,
        message: `${latest.label || 'Print'} was not confirmed. Check the printer, then tap Retry.`,
        jobId: latest.id,
        canRetry: true,
      });
    }).catch(() => {});
    return unsub;
  }, []);

  useEffect(() => {
    if (!notification) return;

    // Clear any pending dismiss
    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    // Animate in
    translateY.setValue(-100);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Auto-dismiss
    dismissTimer.current = setTimeout(() => dismiss(), notification.duration);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [notification]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -100, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setNotification(null));
  };

  const handleRetry = async () => {
    if (!notification?.jobId || retrying) return;
    setRetrying(true);
    setNotification(prev => prev ? { ...prev, message: 'Reconnecting and retrying…', canRetry: false, duration: 30000 } : prev);
    try {
      const result = await retryPendingPrintJob(notification.jobId);
      if (result.success) {
        const config = EVENT_CONFIG.reconnected;
        setNotification({ ...config, title: 'Print Sent', message: 'The print job was sent successfully.' });
      } else {
        setNotification(prev => prev ? {
          ...EVENT_CONFIG.print_failed,
          message: result.error || 'Retry failed. Check the printer and try again.',
          jobId: result.jobId || notification.jobId,
          canRetry: true,
        } : prev);
      }
    } finally {
      setRetrying(false);
    }
  };

  if (!notification) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View style={[
        styles.banner,
        {
          backgroundColor: notification.bg,
          borderLeftColor: notification.border,
          transform: [{ translateY }],
          opacity,
        },
      ]}>
        <Ionicons name={notification.icon} size={20} color={notification.iconColor} style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: notification.text }]}>{notification.title}</Text>
          {notification.message !== notification.title && (
            <Text style={[styles.message, { color: notification.text }]} numberOfLines={2}>
              {notification.message}
            </Text>
          )}
        </View>
        {notification.canRetry && (
          <TouchableOpacity onPress={handleRetry} disabled={retrying} style={styles.retryButton}>
            <Text style={styles.retryText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={16} color={notification.text} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 9999,
  },
  banner: {
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
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.75)',
    marginRight: 10,
  },
  retryText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  message: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
});
