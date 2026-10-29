// "Get ready for your first customer" — the owner's Home card for a new restaurant. Same card and
// same server checks as the web (dine-frontend components/GetStartedCard.js): setup unfinished,
// sample menu, printer, first bill. Only for restaurants younger than 30 days with steps left.
// Buttons open the matching app screen (setup stays on the web).
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import apiClient, { WEB_BASE_URL } from '../../services/api';

const MAX_AGE_DAYS = 30;
const dismissKey = (rid) => `getStartedDismissed_${rid}`;
const printerKey = (rid) => `getStartedPrinter_${rid}`;

function toMillis(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v) || 0;
  if (v._seconds) return v._seconds * 1000;
  if (v.seconds) return v.seconds * 1000;
  return 0;
}

export default function GetStartedCard({ restaurantId, style }) {
  const router = useRouter();
  const [state, setState] = useState(null);

  useFocusEffect(useCallback(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (await AsyncStorage.getItem(dismissKey(restaurantId))) { if (!cancelled) setState(null); return; }
        const [restRes, ordersRes] = await Promise.all([
          apiClient.request(`/api/restaurants/${restaurantId}`),
          apiClient.getOrders(restaurantId, { limit: 1 }).catch(() => null),
        ]);
        const r = restRes?.restaurant || restRes;
        if (!r || cancelled) return;
        const orders = Array.isArray(ordersRes) ? ordersRes : (ordersRes?.orders || []);
        const hasOrder = orders.length > 0;
        const ageDays = (Date.now() - toMillis(r.createdAt)) / 86400000;
        const step = r.onboardingStep;
        const setupUnfinished = step != null && step !== 'complete' && !isNaN(Number(step));
        const printerOpened = !!(await AsyncStorage.getItem(printerKey(restaurantId)));
        const s = {
          setupStep: setupUnfinished ? Math.max(2, Number(step)) : null,
          menuDone: !r.hasDefaultMenu,
          printerDone: hasOrder || printerOpened || !!(r.printSettings && Object.keys(r.printSettings).length),
          orderDone: hasOrder,
        };
        const allDone = !s.setupStep && s.menuDone && s.printerDone && s.orderDone;
        // Established restaurants (old or already billing) never see the card.
        if (allDone || ageDays > MAX_AGE_DAYS || (hasOrder && !s.setupStep && s.menuDone)) { if (!cancelled) setState(null); return; }
        if (!cancelled) setState(s);
      } catch (_) { /* never block Home */ }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]));

  if (!state) return null;

  const go = (key, target) => {
    if (key === 'printer') AsyncStorage.setItem(printerKey(restaurantId), '1').catch(() => {});
    router.push(target);
  };
  const dismiss = () => { setState(null); AsyncStorage.setItem(dismissKey(restaurantId), '1').catch(() => {}); };

  const items = [
    state.setupStep && {
      key: 'setup', done: false,
      title: 'Finish setting up your restaurant',
      text: 'You stopped part-way. Pick up where you left off.',
      actions: [{ label: 'Continue setup', primary: true, target: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/onboarding?step=${state.setupStep}`, title: 'Setup' } } }],
    },
    {
      key: 'menu', done: state.menuDone,
      title: 'Make the menu yours',
      text: state.menuDone ? 'Your own menu is in.' : 'You have sample dishes. Upload a photo or PDF of your menu and AI adds every item and price.',
      actions: [{ label: 'Edit menu', primary: true, target: '/(tabs)/menu-management' }],
    },
    {
      key: 'printer', done: state.printerDone,
      title: 'Print a test bill',
      text: state.printerDone ? 'Printer step done.' : 'Connect your bill printer and print a sample. No printer? Bills can be shared on WhatsApp instead.',
      actions: [{ label: 'Connect printer', primary: true, target: '/(tabs)/printer-settings' }],
    },
    {
      key: 'order', done: state.orderDone,
      title: 'Take your first order',
      text: state.orderDone ? 'First bill done.' : 'Tap a dish, then Bill. We guide you through it step by step.',
      actions: [{ label: 'Open POS', primary: true, target: '/(tabs)/menu' }],
    },
  ].filter(Boolean);
  const doneCount = items.filter(i => i.done).length;

  return (
    <View style={[st.card, style]}>
      <View style={st.head}>
        <Ionicons name="rocket" size={16} color="#ef4444" />
        <Text style={st.title}>Get ready for your first customer</Text>
        <View style={st.count}><Text style={st.countText}>{doneCount} of {items.length} done</Text></View>
        <TouchableOpacity onPress={dismiss} accessibilityLabel="Hide" hitSlop={10}><Ionicons name="close" size={16} color="#94a3b8" /></TouchableOpacity>
      </View>
      <Text style={st.sub}>A few minutes now and DineOpen is ready for real customers.</Text>
      <View style={{ gap: 10 }}>
        {items.map(it => (
          <View key={it.key} style={[st.item, it.done && st.itemDone]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[st.tick, it.done && { backgroundColor: '#10b981' }]}>{it.done && <Ionicons name="checkmark" size={12} color="#fff" />}</View>
              <Text style={[st.itemTitle, it.done && { color: '#6b7280' }]}>{it.title}</Text>
            </View>
            <Text style={st.itemText}>{it.text}</Text>
            {!it.done && (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {it.actions.map(a => (
                  <TouchableOpacity key={a.label} onPress={() => go(it.key, a.target)} style={[st.btn, !a.primary && st.btnPlain]} activeOpacity={0.8}>
                    <Text style={[st.btnText, !a.primary && { color: '#374151' }]}>{a.label}</Text>
                    {a.primary && <Ionicons name="arrow-forward" size={12} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', flexShrink: 1 },
  count: { marginLeft: 'auto', backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  countText: { fontSize: 12, fontWeight: '700', color: '#b45309' },
  sub: { fontSize: 13, color: '#6b7280', marginTop: 4, marginBottom: 12 },
  item: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, gap: 8 },
  itemDone: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  tick: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 },
  itemText: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnPlain: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
