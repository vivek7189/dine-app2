// Delivery board (owner / co-owner / admin / manager / cashier): delivery orders waiting for a rider
// and out with a rider; assign / change rider, unassign, mark delivered (cash collected) — and, for
// owner / admin, the auto-assign settings. Same backend as the web POS Delivery panel
// (/api/delivery/:restaurantId/{board,assign,unassign,mark-delivered,settings}).
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator, RefreshControl, Alert, Linking, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import apiClient from '../../services/api';
import { getCurrencySymbol } from '../../utils/formatCurrency';

const MANAGE = ['owner', 'co-owner', 'admin', 'manager', 'cashier', 'super_admin', 'sub_admin'];
const SETTINGS = ['owner', 'co-owner', 'admin', 'super_admin'];
const LABEL = { queued: 'Waiting for a free rider', assigned: 'Waiting to accept', accepted: 'With rider', picked_up: 'On the way', on_the_way: 'On the way' };
const COLOR = { queued: ['#fffbeb', '#b45309'], assigned: ['#fef3c7', '#92400e'], accepted: ['#eff6ff', '#1d4ed8'], picked_up: ['#f5f3ff', '#6d28d9'], on_the_way: ['#f5f3ff', '#6d28d9'] };

export default function DeliveryBoard() {
  const router = useRouter();
  const [rid, setRid] = useState(null);
  const [role, setRole] = useState('');
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(null); // order being assigned
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [s, setS] = useState(null);

  const load = useCallback(async (restaurantId) => {
    const id = restaurantId || rid;
    if (!id) return;
    try {
      const r = await apiClient.getDeliveryBoard(id);
      if (r?.success) { setBoard(r.data); setError(''); }
    } catch (e) {
      setError(e?.message || 'Could not load deliveries');
    } finally { setLoading(false); setRefreshing(false); }
  }, [rid]);

  useEffect(() => {
    (async () => {
      const u = await apiClient.getUser();
      const id = u?.restaurantId || u?.restaurant?.id;
      setRid(id); setRole(String(u?.role || '').toLowerCase());
      load(id);
    })();
  }, []); // once on open (load is re-created when rid is set)

  // Keep it fresh while open (orders move on their own when auto-assign is on).
  useEffect(() => {
    let active = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (st) => { active = st === 'active'; });
    const t = setInterval(() => { if (active) load(); }, 20000);
    return () => { clearInterval(t); sub.remove(); };
  }, [load]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.success === false) throw new Error(r.error || 'Something went wrong');
      if (okMsg) Alert.alert('Done', typeof okMsg === 'function' ? okMsg(r) : okMsg);
      setPicking(null);
      await load();
    } catch (e) {
      Alert.alert('Could not do that', e?.message || e?.error || 'Please try again.');
    } finally { setBusy(false); }
  };

  const markDelivered = (o) => {
    const paid = String(o.paymentStatus || '').toLowerCase() === 'paid';
    const done = (r) => (r?.data?.bill?.completed ? 'Delivered — bill completed.' : 'Delivered — settle the bill at the counter.');
    if (paid) return act(() => apiClient.markDeliveredByCounter(rid, o.id), done);
    Alert.alert('Mark delivered', `Did the rider collect ${getCurrencySymbol()}${Number(o.totalAmount || 0).toFixed(0)}?`, [
      { text: 'Yes, cash', onPress: () => act(() => apiClient.markDeliveredByCounter(rid, o.id, { paymentCollected: true, paymentMethod: 'cash' }), done) },
      { text: 'Yes, UPI', onPress: () => act(() => apiClient.markDeliveredByCounter(rid, o.id, { paymentCollected: true, paymentMethod: 'upi' }), done) },
      { text: 'Not collected', onPress: () => act(() => apiClient.markDeliveredByCounter(rid, o.id), done) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const saveSettings = () => act(async () => {
    const r = await apiClient.saveDeliveryAssignSettings(rid, s);
    setSettingsOpen(false);
    return r;
  }, 'Delivery settings saved.');

  const Header = (
    <View style={st.header}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={st.headerTitle}>Delivery board</Text>
        <Text style={st.headerSub}>Riders and delivery orders</Text>
      </View>
      <Ionicons name="bicycle" size={24} color="#10b981" />
    </View>
  );

  if (role && !MANAGE.includes(role)) {
    return <SafeAreaView style={st.container} edges={['top']}>{Header}<View style={st.center}><Text style={st.muted}>Only the owner, admin, manager or cashier can open the delivery board.</Text></View></SafeAreaView>;
  }
  if (loading) return <SafeAreaView style={st.container} edges={['top']}>{Header}<View style={st.center}><ActivityIndicator color="#10b981" /></View></SafeAreaView>;

  const settings = board?.settings || {};
  const riders = board?.riders || [];
  const orders = board?.orders || [];

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: 14 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#10b981']} />}>
        {!!error && <Text style={st.err}>{error}</Text>}

        <View style={[st.card, st.rowBetween]}>
          <View style={{ flex: 1 }}>
            <Text style={st.cardTitle}>Auto-assign {settings.autoAssign ? 'ON' : 'OFF'}</Text>
            <Text style={st.muted}>{settings.autoAssign ? `New delivery orders go to a free rider · ${settings.maxPerRider || 1} per rider${settings.requireAccept ? ` · accept within ${settings.acceptTimeoutMin} min` : ''}` : 'Assign riders by hand below.'}</Text>
          </View>
          {SETTINGS.includes(role) && (
            <TouchableOpacity onPress={() => { setS({ ...settings }); setSettingsOpen(!settingsOpen); }} style={st.outlineBtn}><Text style={st.outlineBtnText}>{settingsOpen ? 'Close' : 'Settings'}</Text></TouchableOpacity>
          )}
        </View>

        {settingsOpen && s && (
          <View style={st.card}>
            <View style={st.rowBetween}><Text style={st.rowText}>Auto-assign delivery orders</Text><Switch value={!!s.autoAssign} onValueChange={(v) => setS({ ...s, autoAssign: v })} trackColor={{ true: '#86efac' }} /></View>
            <View style={[st.rowBetween, { marginTop: 10 }]}><Text style={st.rowText}>Rider must accept</Text><Switch value={!!s.requireAccept} onValueChange={(v) => setS({ ...s, requireAccept: v })} trackColor={{ true: '#86efac' }} /></View>
            {!!s.requireAccept && (
              <View style={[st.rowBetween, { marginTop: 10 }]}>
                <Text style={st.rowText}>Accept within (minutes)</Text>
                <View style={st.stepper}>{[1, 2, 3, 5, 10].map(n => (<TouchableOpacity key={n} onPress={() => setS({ ...s, acceptTimeoutMin: n })} style={[st.step, s.acceptTimeoutMin === n && st.stepOn]}><Text style={[st.stepText, s.acceptTimeoutMin === n && st.stepTextOn]}>{n}</Text></TouchableOpacity>))}</View>
              </View>
            )}
            <View style={[st.rowBetween, { marginTop: 10 }]}>
              <Text style={st.rowText}>Orders per rider</Text>
              <View style={st.stepper}>{[1, 2, 3, 4, 5].map(n => (<TouchableOpacity key={n} onPress={() => setS({ ...s, maxPerRider: n })} style={[st.step, s.maxPerRider === n && st.stepOn]}><Text style={[st.stepText, s.maxPerRider === n && st.stepTextOn]}>{n}</Text></TouchableOpacity>))}</View>
            </View>
            <Text style={[st.muted, { marginTop: 10 }]}>Riders = staff with “Delivery partner” ticked (web Admin → Staff). They use the Deliveries tab in this app.</Text>
            <TouchableOpacity disabled={busy} onPress={saveSettings} style={[st.bigBtn, { backgroundColor: busy ? '#e5e7eb' : '#10b981' }]}><Text style={st.bigBtnText}>Save settings</Text></TouchableOpacity>
          </View>
        )}

        <Text style={st.section}>Riders</Text>
        {!riders.length && <Text style={st.muted}>No riders yet — tick “Delivery partner” on staff (web Admin → Staff).</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {riders.map(r => (
            <View key={r.id} style={[st.chip, { backgroundColor: !r.onDuty ? '#f3f4f6' : r.free ? '#ecfdf5' : '#fffbeb' }]}>
              <Text style={{ fontWeight: '700', color: '#111827', fontSize: 13 }}>{r.name}</Text>
              <Text style={{ fontSize: 12, color: !r.onDuty ? '#6b7280' : r.free ? '#047857' : '#b45309' }}>{!r.onDuty ? 'Off duty' : r.free ? 'Free' : `Busy (${r.active})`}</Text>
            </View>
          ))}
        </View>

        <Text style={st.section}>Delivery orders ({orders.length})</Text>
        {!orders.length && <Text style={st.muted}>No delivery orders waiting or out right now.</Text>}
        {orders.map(o => {
          const [bg, fg] = COLOR[o.deliveryStatus] || ['#f3f4f6', '#374151'];
          const withRider = !!o.assignedStaff && o.deliveryStatus !== 'queued';
          return (
            <View key={o.id} style={st.card}>
              <View style={st.rowBetween}>
                <Text style={st.cardTitle}>#{o.orderNumber}</Text>
                <Text style={{ fontWeight: '700', color: '#111827' }}>{getCurrencySymbol()}{Number(o.totalAmount || 0).toFixed(0)}</Text>
              </View>
              <View style={[st.badge, { backgroundColor: bg }]}><Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>{withRider ? `${LABEL[o.deliveryStatus] || o.deliveryStatus} · ${o.assignedStaff.name}` : (LABEL[o.deliveryStatus] || o.deliveryStatus)}</Text></View>
              <Text style={st.muted}>{o.customerInfo?.name || 'Customer'}{o.customerInfo?.phone ? ` · ${o.customerInfo.phone}` : ''}</Text>
              {!!o.deliveryAddressText && <Text style={st.muted}>📍 {o.deliveryAddressText}</Text>}
              <Text style={[st.muted, { color: String(o.paymentStatus).toLowerCase() === 'paid' ? '#059669' : '#b45309' }]}>{String(o.paymentStatus).toLowerCase() === 'paid' ? 'Paid' : 'To collect'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <TouchableOpacity disabled={busy} onPress={() => setPicking(picking === o.id ? null : o.id)} style={st.outlineBtn}><Text style={st.outlineBtnText}>{withRider ? 'Change rider' : 'Assign rider'}</Text></TouchableOpacity>
                {withRider && <TouchableOpacity disabled={busy} onPress={() => markDelivered(o)} style={[st.outlineBtn, { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }]}><Text style={[st.outlineBtnText, { color: '#047857' }]}>Mark delivered</Text></TouchableOpacity>}
                {withRider && <TouchableOpacity disabled={busy} onPress={() => act(() => apiClient.unassignDelivery(rid, o.id))} style={[st.outlineBtn, { borderColor: '#fecaca' }]}><Text style={[st.outlineBtnText, { color: '#b91c1c' }]}>Unassign</Text></TouchableOpacity>}
                {!!o.customerInfo?.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${o.customerInfo.phone}`)} style={st.outlineBtn}><Text style={st.outlineBtnText}>Call</Text></TouchableOpacity>}
              </View>
              {picking === o.id && (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {!riders.length && <Text style={st.muted}>No riders.</Text>}
                  {riders.map(r => {
                    const current = withRider && o.assignedStaff.id === r.id;
                    return (
                      <TouchableOpacity key={r.id} disabled={busy || current} onPress={() => act(() => apiClient.assignDeliveryPartner(rid, o.id, r.id, r.name))} style={[st.pickRow, current && { borderColor: '#10b981', backgroundColor: '#ecfdf5' }]}>
                        <Text style={{ flex: 1, fontWeight: '600', color: '#111827' }}>{r.name}{current ? ' (current)' : ''}</Text>
                        <Text style={{ fontSize: 12, color: !r.onDuty ? '#6b7280' : r.free ? '#047857' : '#b45309' }}>{!r.onDuty ? 'Off duty' : r.free ? 'Free' : `Busy (${r.active})`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11.5, color: '#6b7280' },
  center: { padding: 28, alignItems: 'center' },
  card: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  muted: { fontSize: 12.5, color: '#6b7280', marginTop: 4 },
  err: { color: '#b91c1c', marginBottom: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { fontSize: 14, color: '#111827', flex: 1, paddingRight: 8 },
  section: { fontSize: 13, fontWeight: '800', color: '#374151', marginTop: 6, marginBottom: 8, textTransform: 'uppercase' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', minWidth: 96 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  outlineBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white' },
  outlineBtnText: { fontWeight: '700', color: '#374151', fontSize: 13 },
  pickRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  stepper: { flexDirection: 'row', gap: 6 },
  step: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  stepOn: { borderColor: '#10b981', backgroundColor: '#ecfdf5' },
  stepText: { fontWeight: '700', color: '#374151' },
  stepTextOn: { color: '#047857' },
  bigBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  bigBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
});
