import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ref, onChildAdded, off, query, orderByChild, startAt } from 'firebase/database';
import { database } from '../config/firebase';
import apiClient from '../services/api';
import lanClient from '../services/lanClient';

const DURATION = 6000;

export default function OrderReadyNotificationOverlay() {
  const [notification, setNotification] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);
  const lastEventRef = useRef({ orderId: null, ts: 0 });
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Load user info
  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        if (!userData) return;
        setUserRole(userData.role?.toLowerCase());
        const resId = userData.restaurantId || userData.restaurant?.id;
        if (resId) setRestaurantId(resId);
      } catch {}
    })();
  }, []);

  // Subscribe to Firebase RTDB for order-ready events
  useEffect(() => {
    if (!restaurantId || userRole !== 'waiter') return;

    // Data-level handler — works for both LAN and RTDB events (same payload shape).
    const processReady = (data) => {
      if (!data || data.type !== 'order-status-updated') return;
      if (data.status !== 'ready') return;

      // Dedup: suppress same order within 5 seconds
      const eventNow = Date.now();
      if (lastEventRef.current.orderId === data.orderId && eventNow - lastEventRef.current.ts < 5000) return;
      lastEventRef.current = { orderId: data.orderId, ts: eventNow };

      const orderNum = data.orderNumber || data.dailyOrderId || '';
      const table = data.tableNumber ? `Table ${data.tableNumber}` : '';
      const message = `Order #${orderNum} Ready!${table ? ` — ${table}` : ''}`;

      setNotification({ message, orderId: data.orderId });
      Vibration.vibrate([100, 200, 100]);
    };

    // LAN events via the on-prem local server (offline) or old hub — without this the
    // waiter got NO "order ready" alert with no internet (RTDB below never delivers).
    const lanUnsubs = [];
    if (lanClient.isPaired() || lanClient.isServerConnected()) {
      lanUnsubs.push(lanClient.onEvent('order-status-updated', processReady));
    }

    // Firebase RTDB (cloud).
    let rtdbCleanup = () => {};
    if (database) {
      const ordersQuery = query(
        ref(database, `events/${restaurantId}/orders`),
        orderByChild('ts'),
        startAt(Date.now())
      );
      const handler = (snapshot) => processReady(snapshot.val());
      onChildAdded(ordersQuery, handler);
      rtdbCleanup = () => off(ordersQuery, 'child_added', handler);
    }

    return () => {
      lanUnsubs.forEach((fn) => fn && fn());
      rtdbCleanup();
    };
  }, [restaurantId, userRole]);

  // Animation
  useEffect(() => {
    if (!notification) return;

    if (dismissTimer.current) clearTimeout(dismissTimer.current);

    translateY.setValue(-120);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    dismissTimer.current = setTimeout(() => dismiss(), DURATION);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [notification]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setNotification(null));
  };

  const onTap = () => {
    dismiss();
    router.push('/(tabs)/orders');
  };

  if (!notification) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View style={[
        styles.banner,
        { transform: [{ translateY }], opacity },
      ]}>
        <TouchableOpacity style={styles.content} onPress={onTap} activeOpacity={0.8}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={20} color="white" />
          </View>
          <Text style={styles.message} numberOfLines={2}>{notification.message}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={16} color="#166534" />
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
    zIndex: 9998,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
    backgroundColor: '#f0fdf4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 8,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
  },
});
