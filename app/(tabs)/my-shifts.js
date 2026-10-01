// My Shifts — every staff member's rota on their phone.
//  • My shifts (next 4 weeks), ask a colleague to swap
//  • Open shifts for my role: ask for one → owner / manager approves
//  • Swap requests for me: accept / decline
//  • My availability: which days/hours I can work + dates I can't
//  • Owner / manager: approve open-shift requests and swaps
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  Alert, Modal, TextInput, Switch, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/api';

const RED = '#ef4444';
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const FULL = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nice = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};
const t12 = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return t || '';
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
};
const cap = (r) => String(r || '').replace(/\b\w/g, c => c.toUpperCase());
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function MyShiftsScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [rid, setRid] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [swapFor, setSwapFor] = useState(null); // shift being offered
  const [avail, setAvail] = useState(null);
  const [availDirty, setAvailDirty] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async (r = rid, u = user) => {
    if (!r || !u) return;
    setError('');
    try {
      // From yesterday: an overnight shift that is still running after midnight stays listed.
      const today = new Date(); today.setDate(today.getDate() - 1);
      const end = new Date(); end.setDate(end.getDate() + 27);
      const [res, av] = await Promise.all([
        apiClient.request(`/api/shift-scheduling/my-shifts/${r}?startDate=${ymd(today)}&endDate=${ymd(end)}`),
        apiClient.request(`/api/shift-scheduling/availability/${u.id}`).catch(() => null),
      ]);
      // Yesterday's shifts are fetched only for an overnight shift still running now — drop the rest.
      const todayKey = ymd(new Date());
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      const toM = (t) => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const stillOn = (sh) => sh.date >= todayKey || (toM(sh.endTime) <= toM(sh.startTime) && nowMin < toM(sh.endTime));
      if (res && Array.isArray(res.myShifts)) res.myShifts = res.myShifts.filter(stillOn);
      if (res && Array.isArray(res.openShifts)) res.openShifts = res.openShifts.filter(sh => sh.date >= todayKey);
      if (res && Array.isArray(res.swapIncoming)) res.swapIncoming = res.swapIncoming.filter(sh => sh.date >= todayKey);
      setData(res);
      const a = av?.availability || {};
      const weekly = {};
      DAYS.forEach(([k]) => { weekly[k] = a.availability?.[k] || a.availability?.[FULL[k]] || { available: true, startTime: '09:00', endTime: '22:00' }; });
      setAvail({ weekly, unavailableDates: a.unavailableDates || [] });
      setAvailDirty(false);
    } catch (e) {
      setError(e?.message || 'Could not load your shifts');
    }
  }, [rid, user]);

  useEffect(() => {
    (async () => {
      const u = await apiClient.getUser();
      const r = u?.restaurantId || u?.restaurant?.id;
      const me = { ...u, id: u?.id || u?.userId || u?.uid };
      setUser(me); setRid(r);
      await load(r, me);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const act = async (key, path, body, okMsg) => {
    setBusy(key);
    try {
      await apiClient.request(`/api/shift-scheduling/shifts/${rid}/${path}`, { method: 'POST', data: body || {} });
      if (okMsg) Alert.alert('Done', okMsg);
      await load();
    } catch (e) {
      Alert.alert('Could not do that', e?.message || 'Please try again');
    } finally { setBusy(null); }
  };

  const saveAvailability = async () => {
    setBusy('avail');
    try {
      for (const [k] of DAYS) {
        const d = avail.weekly[k];
        if (d.available && (!TIME_RE.test(d.startTime || '') || !TIME_RE.test(d.endTime || ''))) {
          throw new Error(`Enter ${cap(k)} times as HH:MM (e.g. 09:00)`);
        }
      }
      await apiClient.request(`/api/shift-scheduling/availability/${user.id}`, {
        method: 'POST', data: { availability: avail.weekly, unavailableDates: avail.unavailableDates },
      });
      setAvailDirty(false);
      Alert.alert('Saved', 'Your manager will see this when planning the rota.');
    } catch (e) {
      Alert.alert('Not saved', e?.message || 'Please try again');
    } finally { setBusy(null); }
  };

  const setDay = (k, patch) => {
    setAvail(a => ({ ...a, weekly: { ...a.weekly, [k]: { ...a.weekly[k], ...patch } } }));
    setAvailDirty(true);
  };

  if (loading) {
    return <SafeAreaView style={styles.container}><ActivityIndicator style={{ marginTop: 60 }} color={RED} /></SafeAreaView>;
  }

  const my = data?.myShifts || [];
  const next = my[0];
  const open = data?.openShifts || [];
  const incoming = data?.swapIncoming || [];
  const approvals = data?.approvals;
  const claimCount = (approvals?.claims || []).reduce((n, s) => n + (s.claims || []).filter(c => c.status === 'pending').length, 0);
  const swapCount = (approvals?.swaps || []).length;
  const colleagues = (data?.colleagues || []);

  const shiftRow = (s, right) => (
    <View key={s.id} style={styles.row}>
      <View style={[styles.dot, { backgroundColor: s.color || RED }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{nice(s.date)} · {t12(s.startTime)}–{t12(s.endTime)}</Text>
        <Text style={styles.muted}>{[s.shiftName, cap(s.role), s.breakMinutes ? `${s.breakMinutes} min break` : null].filter(Boolean).join(' · ')}</Text>
        {s.notes ? <Text style={styles.note}>{s.notes}</Text> : null}
      </View>
      {right}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
        <Text style={styles.headerTitle}>My Shifts</Text>
        <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}><Ionicons name="refresh" size={20} color="#6b7280" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Next shift */}
        <View style={[styles.card, { backgroundColor: next ? '#fef2f2' : 'white' }]}>
          <Text style={styles.label}>NEXT SHIFT</Text>
          {next ? (
            <>
              <Text style={styles.big}>{nice(next.date)}</Text>
              <Text style={styles.bigSub}>{t12(next.startTime)} – {t12(next.endTime)}{next.shiftName ? ` · ${next.shiftName}` : ''}</Text>
            </>
          ) : <Text style={styles.muted}>No shifts in the next 4 weeks yet.</Text>}
        </View>

        {/* Approvals (owner / manager) */}
        {approvals && (claimCount + swapCount) > 0 && (
          <View style={[styles.card, { borderColor: '#bfdbfe' }]}>
            <Text style={styles.section}>To approve ({claimCount + swapCount})</Text>
            {(approvals.claims || []).map(s => (s.claims || []).filter(c => c.status === 'pending').map(c => shiftRow({ ...s, id: `${s.id}-${c.staffId}` }, (
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.muted, { maxWidth: 110, textAlign: 'right' }]}>{c.staffName} wants it</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGreen]} onPress={() => act(`ca${s.id}${c.staffId}`, `${s.id}/claims/${c.staffId}/decide`, { approve: true }, `${c.staffName} has the shift`)}><Text style={styles.btnText}>Yes</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGrey]} onPress={() => act(`cr${s.id}${c.staffId}`, `${s.id}/claims/${c.staffId}/decide`, { approve: false })}><Text style={[styles.btnText, { color: '#374151' }]}>No</Text></TouchableOpacity>
                </View>
              </View>
            ))))}
            {(approvals.swaps || []).map(s => shiftRow(s, (
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.muted, { maxWidth: 120, textAlign: 'right' }]}>{s.swapRequest.fromName} → {s.swapRequest.toName}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGreen]} onPress={() => act(`sa${s.id}`, `${s.id}/swap/decide`, { approve: true }, 'Swap approved')}><Text style={styles.btnText}>Approve</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGrey]} onPress={() => act(`sr${s.id}`, `${s.id}/swap/decide`, { approve: false })}><Text style={[styles.btnText, { color: '#374151' }]}>Reject</Text></TouchableOpacity>
                </View>
              </View>
            )))}
          </View>
        )}

        {/* Swap requests for me */}
        {incoming.length > 0 && (
          <View style={[styles.card, { borderColor: '#ddd6fe' }]}>
            <Text style={styles.section}>Can you take these?</Text>
            {incoming.map(s => shiftRow(s, (
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={[styles.muted, { maxWidth: 110, textAlign: 'right' }]}>from {s.swapRequest.fromName}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGreen]} onPress={() => act(`ia${s.id}`, `${s.id}/swap/respond`, { accept: true }, 'Accepted — waiting for manager approval')}><Text style={styles.btnText}>Accept</Text></TouchableOpacity>
                  <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnGrey]} onPress={() => act(`id${s.id}`, `${s.id}/swap/respond`, { accept: false })}><Text style={[styles.btnText, { color: '#374151' }]}>Decline</Text></TouchableOpacity>
                </View>
              </View>
            )))}
          </View>
        )}

        {/* My shifts */}
        <View style={styles.card}>
          <Text style={styles.section}>My shifts ({my.length})</Text>
          {my.length === 0 ? <Text style={styles.muted}>Nothing scheduled yet. You&apos;ll get a notification when your schedule is published.</Text>
            : my.map(s => {
              const sr = s.swapRequest;
              const pendingSwap = sr && ['pending_colleague', 'pending_approval'].includes(sr.status) && sr.fromStaffId === user?.id;
              return shiftRow(s, pendingSwap ? (
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={[styles.muted, { color: '#7c3aed' }]}>{sr.status === 'pending_colleague' ? `Asked ${sr.toName}` : 'Waiting approval'}</Text>
                  <TouchableOpacity disabled={!!busy} onPress={() => act(`sc${s.id}`, `${s.id}/swap/cancel`)}><Text style={{ color: RED, fontSize: 12, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={() => setSwapFor(s)}>
                  <Text style={[styles.btnText, { color: '#7c3aed' }]}>Swap</Text>
                </TouchableOpacity>
              ));
            })}
        </View>

        {/* Open shifts */}
        <View style={styles.card}>
          <Text style={styles.section}>Open shifts you can pick ({open.length})</Text>
          {open.length === 0 ? <Text style={styles.muted}>None right now.</Text> : open.map(s => {
            const mine = s.myClaim;
            return shiftRow(s, mine?.status === 'pending' ? (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.muted, { color: '#2563eb' }]}>Requested</Text>
                <TouchableOpacity disabled={!!busy} onPress={() => act(`cc${s.id}`, `${s.id}/claim/cancel`)}><Text style={{ color: RED, fontSize: 12, fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
              </View>
            ) : mine?.status === 'rejected' ? <Text style={styles.muted}>Declined</Text> : (
              <TouchableOpacity disabled={!!busy} style={[styles.btn, styles.btnBlue]} onPress={() => act(`cl${s.id}`, `${s.id}/claim`, {}, 'Requested — your manager will confirm')}>
                {busy === `cl${s.id}` ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnText}>I&apos;ll take it</Text>}
              </TouchableOpacity>
            ));
          })}
        </View>

        {/* Availability */}
        {avail && (
          <View style={styles.card}>
            <Text style={styles.section}>My availability</Text>
            <Text style={[styles.muted, { marginBottom: 8 }]}>When you can work. Your manager sees this while planning.</Text>
            {DAYS.map(([k, label]) => {
              const d = avail.weekly[k];
              return (
                <View key={k} style={styles.availRow}>
                  <Text style={{ width: 42, fontWeight: '600', color: '#111827' }}>{label}</Text>
                  <Switch value={d.available !== false} onValueChange={v => setDay(k, { available: v })} trackColor={{ true: '#86efac' }} thumbColor={d.available !== false ? '#16a34a' : '#f4f4f5'} />
                  {d.available !== false ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                      <TextInput style={styles.time} value={d.startTime} onChangeText={v => setDay(k, { startTime: v })} placeholder="09:00" maxLength={5} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} />
                      <Text style={styles.muted}>to</Text>
                      <TextInput style={styles.time} value={d.endTime} onChangeText={v => setDay(k, { endTime: v })} placeholder="22:00" maxLength={5} keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} />
                    </View>
                  ) : <Text style={[styles.muted, { marginLeft: 8 }]}>Can&apos;t work</Text>}
                </View>
              );
            })}
            <Text style={[styles.label, { marginTop: 12 }]}>DATES I CAN&apos;T WORK</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {avail.unavailableDates.filter(x => x >= ymd(new Date())).map(x => (
                <TouchableOpacity key={x} style={styles.chip} onPress={() => { setAvail(a => ({ ...a, unavailableDates: a.unavailableDates.filter(y => y !== x) })); setAvailDirty(true); }}>
                  <Text style={styles.chipText}>{nice(x)}  ✕</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.chip, { backgroundColor: '#f3f4f6' }]} onPress={() => setShowPicker(true)}>
                <Text style={[styles.chipText, { color: '#374151' }]}>+ Add date</Text>
              </TouchableOpacity>
            </View>
            {showPicker && (
              <DateTimePicker value={new Date()} mode="date" minimumDate={new Date()}
                onChange={(e, d) => {
                  setShowPicker(false);
                  if (e?.type === 'set' && d) {
                    const v = ymd(d);
                    setAvail(a => ({ ...a, unavailableDates: [...new Set([...a.unavailableDates, v])].sort() }));
                    setAvailDirty(true);
                  }
                }} />
            )}
            <TouchableOpacity disabled={!availDirty || busy === 'avail'} style={[styles.btn, styles.btnRed, { marginTop: 14, alignSelf: 'stretch', opacity: availDirty ? 1 : 0.5 }]} onPress={saveAvailability}>
              {busy === 'avail' ? <ActivityIndicator color="white" size="small" /> : <Text style={[styles.btnText, { textAlign: 'center' }]}>Save availability</Text>}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Ask a colleague to swap */}
      <Modal visible={!!swapFor} transparent animationType="slide" onRequestClose={() => setSwapFor(null)}>
        <View style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <Text style={styles.section}>Who can take it?</Text>
            {swapFor && <Text style={[styles.muted, { marginBottom: 10 }]}>{nice(swapFor.date)} · {t12(swapFor.startTime)}–{t12(swapFor.endTime)}</Text>}
            <ScrollView style={{ maxHeight: 360 }}>
              {colleagues.map(c => (
                <TouchableOpacity key={c.id} style={styles.personRow} disabled={!!busy}
                  onPress={() => { const s = swapFor; setSwapFor(null); act(`sw${s.id}`, `${s.id}/swap`, { toStaffId: c.id }, `Asked ${c.name}. Once they accept, your manager approves.`); }}>
                  <Text style={{ fontWeight: '600', color: '#111827' }}>{c.name}</Text>
                  <Text style={styles.muted}>{cap(c.role)}</Text>
                </TouchableOpacity>
              ))}
              {colleagues.length === 0 && <Text style={styles.muted}>No colleagues found.</Text>}
            </ScrollView>
            <TouchableOpacity style={[styles.btn, styles.btnGrey, { marginTop: 12, alignSelf: 'stretch' }]} onPress={() => setSwapFor(null)}>
              <Text style={[styles.btnText, { color: '#374151', textAlign: 'center' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  card: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  label: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  big: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4 },
  bigSub: { fontSize: 15, color: '#374151', marginTop: 2 },
  section: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  muted: { fontSize: 12.5, color: '#6b7280' },
  note: { fontSize: 12, color: '#92400e', marginTop: 2 },
  error: { color: '#b91c1c', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  btn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  btnGreen: { backgroundColor: '#16a34a' },
  btnBlue: { backgroundColor: '#2563eb' },
  btnRed: { backgroundColor: RED },
  btnGrey: { backgroundColor: '#f3f4f6' },
  btnOutline: { borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: 'white' },
  availRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  time: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, width: 62, textAlign: 'center', color: '#111827' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fee2e2' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#991b1b' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18 },
  personRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
});
