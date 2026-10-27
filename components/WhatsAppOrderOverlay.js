// New WhatsApp-bot order while the app is open: green banner at the top + ring + vibration.
// Tap → opens the order (Orders tab). Fed by the live order events (Firebase RTDB) and, when the
// live link is slow, by the backend's phone push (staffPush → whatsappOrderAlerts 'push'); one alert
// per order either way. Also opens an order when its phone notification was tapped.
// Follows the restaurant's WhatsApp alert setting (sound / popup only) and this phone's own
// switches (Profile → Preferences). Waiter / kitchen / delivery logins never get it.
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ref, onChildAdded, off, query, orderByChild, startAt } from 'firebase/database';
import { database } from '../config/firebase';
import apiClient from '../services/api';
import restaurantEvents from '../services/restaurantEvents';
import { formatCurrency } from '../utils/formatCurrency';
import {
  isWhatsAppOrder, roleGetsWhatsAppAlerts, getWaAlertsOn, getWaSoundOn, playWaOrderSound,
  on as onWa, takePendingOpen, openWhatsAppOrder,
} from '../services/whatsappOrderAlerts';

const DURATION = 12000;
// Listen from a minute back: an order that arrived just before the app opened still alerts. Older
// events are never delivered (the query starts there), so a phone clock is not trusted beyond this.
const LOOKBACK_MS = 60 * 1000;

export default function WhatsAppOrderOverlay() {
  const [alert, setAlert] = useState(null); // { orderId, title, sub, more }
  const [restaurantId, setRestaurantId] = useState(null);
  const [eligible, setEligible] = useState(false);
  const translateY = useRef(new Animated.Value(-140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef(null);
  const seen = useRef(new Set());
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Who is logged in (re-read when the outlet is switched).
  useEffect(() => {
    const load = async () => {
      try {
        const u = await apiClient.getUser();
        setRestaurantId(u?.restaurantId || u?.restaurant?.id || null);
        setEligible(roleGetsWhatsAppAlerts(u));
      } catch { /* not logged in */ }
    };
    load();
    return restaurantEvents.on('switch', load);
  }, []);

  // Notification tapped (now, or before this mounted on a cold start) → open the order.
  useEffect(() => {
    const go = () => { const id = takePendingOpen(); if (id) openWhatsAppOrder(router, id); };
    go();
    return onWa('open', go);
  }, [router]);

  // Live events + foreground pushes → one banner per order.
  useEffect(() => {
    if (!restaurantId || !eligible) return;

    const show = async (d, viaPush) => {
      const orderId = d?.orderId || d?.id;
      if (!orderId || seen.current.has(String(orderId))) return;
      if (!viaPush && (d.type !== 'order-created' || !isWhatsAppOrder(d))) return;
      // Claim the order BEFORE any await: the push and the live event can arrive together.
      seen.current.add(String(orderId));
      if (seen.current.size > 200) seen.current = new Set([...seen.current].slice(-100));
      if (d.whatsappAlerts === 'off') return;
      if (!(await getWaAlertsOn())) return;

      const num = d.orderNumber || d.dailyOrderId || '';
      const amount = Number(d.totalAmount) > 0 ? formatCurrency(d.totalAmount) : '';
      const type = /dine/i.test(String(d.orderType || '')) ? 'Dine-in' : /deliver/i.test(String(d.orderType || '')) ? 'Delivery' : (d.orderType ? 'Takeaway' : '');
      const count = Number(d.itemsCount) || 0;
      const sub = [d.customerName, count ? `${count} item${count === 1 ? '' : 's'}` : '', amount, type].filter(Boolean).join(' • ');
      setAlert(prev => ({ orderId: String(orderId), title: `New WhatsApp order${num ? ` #${num}` : ''}`, sub: sub || 'Tap to view', more: prev ? (prev.more || 0) + 1 : 0, at: Date.now() }));

      Vibration.vibrate([0, 250, 150, 250]);
      if (d.whatsappAlerts !== 'silent' && (await getWaSoundOn())) playWaOrderSound();
    };

    const offPush = onWa('push', (data) => show(data, true));

    let rtdbCleanup = () => {};
    if (database) {
      const q = query(ref(database, `events/${restaurantId}/orders`), orderByChild('ts'), startAt(Date.now() - LOOKBACK_MS));
      const handler = (snap) => show(snap.val(), false);
      onChildAdded(q, handler);
      rtdbCleanup = () => off(q, 'child_added', handler);
    }
    return () => { offPush(); rtdbCleanup(); };
  }, [restaurantId, eligible]);

  // Slide in / auto-hide.
  useEffect(() => {
    if (!alert) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    translateY.setValue(-140);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    dismissTimer.current = setTimeout(() => dismiss(), DURATION);
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
  }, [alert?.at]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -140, duration: 200, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setAlert(null));
  };

  const onTap = () => {
    const id = alert?.orderId;
    dismiss();
    openWhatsAppOrder(router, id);
  };

  if (!alert) return null;

  return (
    <View style={[styles.container, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View style={[styles.banner, { transform: [{ translateY }], opacity }]}>
        <TouchableOpacity style={styles.content} onPress={onTap} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${alert.title}. Open order`}>
          <View style={styles.iconCircle}>
            <Ionicons name="logo-whatsapp" size={20} color="white" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {alert.title}{alert.more ? `  +${alert.more} more` : ''}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>{alert.sub}</Text>
          </View>
          <View style={styles.viewPill}><Text style={styles.viewPillText}>View</Text></View>
        </TouchableOpacity>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={16} color="#166534" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 12, right: 12, zIndex: 9999 },
  banner: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#25D366', backgroundColor: '#f0fdf4',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 6,
  },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#14532d' },
  sub: { fontSize: 12, color: '#166534', marginTop: 2 },
  viewPill: { backgroundColor: '#16a34a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  viewPillText: { color: 'white', fontSize: 12, fontWeight: '700' },
});
