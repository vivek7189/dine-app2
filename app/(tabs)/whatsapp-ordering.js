// WhatsApp Ordering (owner / co-owner / admin): pause or resume taking WhatsApp orders right now (with
// the message customers get while paused) and set the order timings. Same settings as the web
// (Admin → WhatsApp Ordering). Backend: PUT /api/whatsapp-ordering/pause/:rid and
// PUT /api/whatsapp-ordering/hours/:rid (both owner / admin only, saving just that one setting).
// New WhatsApp orders already ring on this phone (services/whatsappOrderAlerts).
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, ActivityIndicator, RefreshControl, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';

const ALLOWED = ['owner', 'co-owner', 'admin', 'super_admin'];
const DEFAULT_PAUSE_MESSAGE = 'Sorry, we are not taking orders right now. Please try again later. 🙏';
const WEEK = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const MAX_SLOTS = 4;
const emptyWeek = () => Object.fromEntries(WEEK.map(([k]) => [k, []]));
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const nice = (t) => { const m = toMin(t); if (m == null) return t; const h = Math.floor(m / 60), mi = m % 60; return `${h % 12 === 0 ? 12 : h % 12}${mi ? `:${String(mi).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`; };

export default function WhatsAppOrderingScreen() {
  const router = useRouter();
  const [rid, setRid] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cfg, setCfg] = useState(null); // null = not set up
  const [loadError, setLoadError] = useState('');
  // pause
  const [pause, setPause] = useState(null);
  const [pauseMsg, setPauseMsg] = useState('');
  const [pauseSaving, setPauseSaving] = useState(false);
  const [pauseError, setPauseError] = useState('');
  // timings
  const [hoursOn, setHoursOn] = useState(false);
  const [days, setDays] = useState(emptyWeek());
  const [closedMessage, setClosedMessage] = useState('');
  const [linkMode, setLinkMode] = useState('block');
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMsg, setHoursMsg] = useState({ ok: '', err: '' });
  const [hoursDirty, setHoursDirty] = useState(false);
  const [picker, setPicker] = useState(null); // { day, i, field }

  useEffect(() => {
    (async () => {
      const u = await apiClient.getUser();
      setRole(String(u?.role || '').toLowerCase());
      setRid(u?.restaurantId || u?.restaurant?.id || null);
    })();
    const unsub = restaurantEvents.on('switch', ({ restaurantId } = {}) => { if (restaurantId) setRid(restaurantId); });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const load = useCallback(async () => {
    if (!rid) return;
    setLoadError('');
    try {
      const res = await apiClient.request(`/api/whatsapp-ordering/config/${rid}`, { method: 'GET' });
      const c = res && res.exists ? res.config : null;
      setCfg(c);
      const p = (c && c.orderingPaused) || null;
      setPause(p); setPauseMsg((p && p.message) || '');
      const oh = (c && c.orderingHours) || null;
      setHoursOn(!!(oh && oh.enabled));
      setDays(oh && oh.days ? { ...emptyWeek(), ...oh.days } : emptyWeek());
      setClosedMessage((oh && oh.closedMessage) || '');
      setLinkMode(oh && oh.linkMode === 'show' ? 'show' : 'block');
      setHoursDirty(false); setHoursMsg({ ok: '', err: '' });
    } catch (e) {
      setLoadError(e?.message || 'Could not load WhatsApp settings.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [rid]);

  useEffect(() => { if (rid && role && ALLOWED.includes(role)) load(); else if (role) setLoading(false); }, [rid, role, load]);

  const paused = !!(pause && pause.paused);

  const savePause = async (nextPaused) => {
    setPauseSaving(true); setPauseError('');
    try {
      const res = await apiClient.request(`/api/whatsapp-ordering/pause/${rid}`, { method: 'PUT', data: { paused: nextPaused, message: pauseMsg.trim() } });
      if (!res || res.success === false) throw new Error((res && res.error) || 'Could not save');
      setPause(res.orderingPaused);
    } catch (e) {
      setPauseError(e?.message || 'Could not save. Please try again.');
    } finally {
      setPauseSaving(false);
    }
  };

  const editDays = (fn) => { setDays((d) => fn({ ...d })); setHoursDirty(true); setHoursMsg({ ok: '', err: '' }); };
  const addSlot = (day) => editDays((d) => { const sl = [...(d[day] || [])]; if (sl.length < MAX_SLOTS) sl.push(sl.length ? { from: '17:00', to: '21:00' } : { from: '10:00', to: '22:00' }); d[day] = sl; return d; });
  const removeSlot = (day, i) => editDays((d) => { d[day] = (d[day] || []).filter((_, j) => j !== i); return d; });
  const setSlot = (day, i, field, val) => editDays((d) => { d[day] = (d[day] || []).map((s, j) => (j === i ? { ...s, [field]: val } : s)); return d; });
  const copyMonToAll = () => editDays((d) => { const mon = (d.mon || []).map((s) => ({ ...s })); WEEK.forEach(([k]) => { if (k !== 'mon') d[k] = mon.map((s) => ({ ...s })); }); return d; });

  const saveHours = async () => {
    // Same checks as the server: each slot must end after it starts; on needs at least one slot.
    for (const [k, label] of WEEK) {
      for (const s of days[k] || []) {
        const a = toMin(s.from), b = toMin(s.to);
        if (a == null || b == null || b <= a) { setHoursMsg({ ok: '', err: `${label}: "${nice(s.from)} – ${nice(s.to)}" must end after it starts.` }); return; }
      }
    }
    if (hoursOn && !WEEK.some(([k]) => (days[k] || []).length)) { setHoursMsg({ ok: '', err: 'Add at least one time slot, or switch order timings off.' }); return; }
    setHoursSaving(true); setHoursMsg({ ok: '', err: '' });
    try {
      const res = await apiClient.request(`/api/whatsapp-ordering/hours/${rid}`, { method: 'PUT', data: { orderingHours: { enabled: hoursOn, days, closedMessage: closedMessage.trim(), linkMode } } });
      if (!res || res.success === false) throw new Error((res && res.error) || 'Could not save');
      setHoursDirty(false);
      setHoursMsg({ ok: hoursOn ? `Saved. Taking orders:\n${res.summary || ''}` : 'Saved. Order timings are off, the bot takes orders all day.', err: '' });
    } catch (e) {
      setHoursMsg({ ok: '', err: e?.message || 'Could not save. Please try again.' });
    } finally {
      setHoursSaving(false);
    }
  };

  const Header = (
    <View style={st.header}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
      <View style={{ marginLeft: 10, flex: 1 }}>
        <Text style={st.headerTitle}>WhatsApp Ordering</Text>
        <Text style={st.headerSub}>Pause orders and set order timings</Text>
      </View>
      <Ionicons name="logo-whatsapp" size={24} color="#16a34a" />
    </View>
  );

  if (role && !ALLOWED.includes(role)) {
    return (
      <SafeAreaView style={st.container} edges={['top']}>
        {Header}
        <View style={st.center}>
          <Ionicons name="lock-closed-outline" size={36} color="#9ca3af" />
          <Text style={st.centerTitle}>Only the owner or an admin can change WhatsApp ordering</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (loading) {
    return (<SafeAreaView style={st.container} edges={['top']}>{Header}<View style={st.center}><ActivityIndicator color="#16a34a" /></View></SafeAreaView>);
  }

  const notReady = !cfg || !cfg.enabled;
  return (
    <SafeAreaView style={st.container} edges={['top']}>
      {Header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
          {!!loadError && <Text style={st.err}>{loadError}</Text>}

          {notReady ? (
            <View style={st.card}>
              <Text style={st.cardTitle}>{!cfg ? 'WhatsApp ordering is not set up' : 'The WhatsApp order bot is off'}</Text>
              <Text style={st.muted}>Connect your WhatsApp number and switch the order bot on from dineopen.com → Admin → WhatsApp Ordering. Then you can pause it and set timings here.</Text>
            </View>
          ) : (
            <>
              {/* Pause / resume */}
              <View style={[st.card, { borderColor: paused ? '#fecaca' : '#bbf7d0', backgroundColor: paused ? '#fef2f2' : '#f0fdf4' }]}>
                <Text style={[st.cardTitle, { color: paused ? '#b91c1c' : '#15803d' }]}>{paused ? '⏸ WhatsApp orders paused' : '● Taking WhatsApp orders'}</Text>
                <Text style={st.muted}>
                  {paused ? `Customers who message get your message below.${pause.by ? ` Paused by ${pause.by}.` : ''}` : 'Busy or stock finished? Pause to stop new WhatsApp orders right away.'}
                </Text>
                <TouchableOpacity disabled={pauseSaving} onPress={() => savePause(!paused)} style={[st.bigBtn, { backgroundColor: paused ? '#16a34a' : '#ef4444' }]}>
                  {pauseSaving ? <ActivityIndicator color="#fff" /> : <Text style={st.bigBtnText}>{paused ? '▶  Resume orders' : '⏸  Pause orders'}</Text>}
                </TouchableOpacity>
                <Text style={st.label}>Message customers get while paused</Text>
                <TextInput value={pauseMsg} onChangeText={setPauseMsg} placeholder={DEFAULT_PAUSE_MESSAGE} multiline maxLength={300} editable={!pauseSaving} style={st.textArea} />
                {paused && (
                  <TouchableOpacity disabled={pauseSaving} onPress={() => savePause(true)} style={st.smallBtn}><Text style={st.smallBtnText}>Update message</Text></TouchableOpacity>
                )}
                {!!pauseError && <Text style={st.err}>{pauseError}</Text>}
              </View>

              {/* Order timings */}
              <View style={st.card}>
                <View style={st.rowBetween}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={st.cardTitle}>Order timings</Text>
                    <Text style={st.muted}>Outside these times the bot replies with your timings. Off = orders all day.</Text>
                  </View>
                  <Switch value={hoursOn} onValueChange={(v) => { setHoursOn(v); setHoursDirty(true); setHoursMsg({ ok: '', err: '' }); }} trackColor={{ true: '#86efac' }} thumbColor={hoursOn ? '#16a34a' : '#f4f4f5'} />
                </View>

                {hoursOn && (
                  <>
                    {WEEK.map(([k, label]) => (
                      <View key={k} style={st.dayRow}>
                        <Text style={st.dayLabel}>{label}</Text>
                        <View style={{ flex: 1 }}>
                          {(days[k] || []).length === 0 && <Text style={[st.muted, { paddingVertical: 6 }]}>Closed</Text>}
                          {(days[k] || []).map((sl, i) => (
                            <View key={i} style={st.slotRow}>
                              <TouchableOpacity onPress={() => setPicker({ day: k, i, field: 'from' })} style={st.timeBtn}><Text style={st.timeText}>{nice(sl.from)}</Text></TouchableOpacity>
                              <Text style={st.muted}>to</Text>
                              <TouchableOpacity onPress={() => setPicker({ day: k, i, field: 'to' })} style={st.timeBtn}><Text style={st.timeText}>{nice(sl.to)}</Text></TouchableOpacity>
                              <TouchableOpacity onPress={() => removeSlot(k, i)} style={{ padding: 6 }} accessibilityLabel={`Remove ${label} time`}><Ionicons name="close-circle" size={20} color="#9ca3af" /></TouchableOpacity>
                            </View>
                          ))}
                          {picker && picker.day === k && (days[k] || [])[picker.i] && (
                            <View>
                              <DateTimePicker mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                value={(() => { const d = new Date(); const m = toMin(days[k][picker.i][picker.field]); if (m != null) d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; })()}
                                onChange={(ev, d) => {
                                  if (ev.type === 'dismissed') { setPicker(null); return; }
                                  if (d) setSlot(k, picker.i, picker.field, hhmm(d));
                                  if (Platform.OS !== 'ios') setPicker(null);
                                }} />
                              {Platform.OS === 'ios' && <TouchableOpacity onPress={() => setPicker(null)} style={[st.smallBtn, { alignSelf: 'flex-end' }]}><Text style={st.smallBtnText}>Done</Text></TouchableOpacity>}
                            </View>
                          )}
                          {(days[k] || []).length < MAX_SLOTS && (
                            <TouchableOpacity onPress={() => addSlot(k)} style={{ paddingVertical: 4 }}><Text style={st.link}>+ Add time</Text></TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                    <TouchableOpacity onPress={copyMonToAll} style={{ paddingVertical: 6 }}><Text style={st.link}>Copy Monday&apos;s times to all days</Text></TouchableOpacity>

                    <Text style={st.label}>Message outside timings (optional)</Text>
                    <TextInput value={closedMessage} onChangeText={(v) => { setClosedMessage(v); setHoursDirty(true); }} placeholder="Leave empty to send your timings" multiline maxLength={500} style={st.textArea} />

                    <Text style={st.label}>Order link the bot sends, outside timings</Text>
                    <View style={st.chips}>
                      {[['block', 'Stop orders'], ['show', 'Only show timings']].map(([v, t]) => (
                        <TouchableOpacity key={v} onPress={() => { setLinkMode(v); setHoursDirty(true); }} style={[st.chip, linkMode === v && st.chipOn]}><Text style={[st.chipText, linkMode === v && { color: '#15803d' }]}>{t}</Text></TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {!!hoursMsg.err && <Text style={st.err}>{hoursMsg.err}</Text>}
                {!!hoursMsg.ok && <Text style={st.ok}>✓ {hoursMsg.ok}</Text>}
                <TouchableOpacity disabled={hoursSaving || !hoursDirty} onPress={saveHours} style={[st.bigBtn, { backgroundColor: hoursSaving || !hoursDirty ? '#e5e7eb' : '#16a34a' }]}>
                  {hoursSaving ? <ActivityIndicator color="#fff" /> : <Text style={[st.bigBtnText, !hoursDirty && { color: '#9ca3af' }]}>Save timings</Text>}
                </TouchableOpacity>
              </View>

              <View style={st.card}>
                <Text style={st.cardTitle}>🔔 New order alerts</Text>
                <Text style={st.muted}>New WhatsApp orders ring on this phone and show a notification. Tap it to open the order. You can turn the sound off in Profile → Preferences.</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11.5, color: '#6b7280' },
  center: { padding: 28, alignItems: 'center' },
  centerTitle: { marginTop: 10, fontSize: 15, fontWeight: '600', color: '#374151', textAlign: 'center' },
  card: { backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  muted: { fontSize: 12.5, color: '#6b7280', marginTop: 3 },
  label: { fontSize: 12, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  textArea: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 14, minHeight: 56, textAlignVertical: 'top', backgroundColor: 'white' },
  bigBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  bigBtnText: { color: 'white', fontWeight: '800', fontSize: 15 },
  smallBtn: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: 'white' },
  smallBtnText: { color: '#b91c1c', fontWeight: '600', fontSize: 13 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  dayRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingVertical: 8, marginTop: 4 },
  dayLabel: { width: 44, fontWeight: '700', color: '#374151', paddingTop: 7 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  timeBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#f9fafb' },
  timeText: { fontWeight: '600', color: '#111827' },
  link: { color: '#16a34a', fontWeight: '700', fontSize: 13.5 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'white' },
  chipOn: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  chipText: { fontWeight: '600', color: '#374151', fontSize: 13 },
  err: { color: '#b91c1c', fontSize: 13, marginTop: 8 },
  ok: { color: '#15803d', fontSize: 13, marginTop: 8 },
});
