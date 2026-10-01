// StaffAccessGateNative — the "Clock in to start" screen of Staff Access Rules for the dine-app
// (same rules as the web StaffAccessGate). Shown only to staff whose role must clock in, while
// they are not clocked in / on approved leave / past their shift. Owner, admin, co-owner and
// manager never see it. The server enforces the rule (423 STAFF_ACCESS_*); this explains it and
// offers Clock in / Manager PIN / My shifts / Log out. It also keeps the latest rules on apiClient
// (apiClient.getStaffAccess()) for the waiter screens.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, AppState, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import apiClient from '../services/api';

// Phone location for clock-in (restaurants with the geo-fence on need it). Optional module; any
// failure → no location (the server then says why if this restaurant requires it).
let Location = null;
try { Location = require('expo-location'); } catch (_) { /* attendance works without GPS */ }
async function clockInLocation() {
  if (!Location) return null;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, timeout: 10000 });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: loc.coords.accuracy };
  } catch (_) { return null; }
}
import restaurantEvents from '../services/restaurantEvents';

const NEVER_RESTRICTED = ['owner', 'admin', 'co-owner', 'manager', 'super-admin', 'super_admin'];
const FREE_SCREENS = ['my-shifts', 'attendance', 'profile'];
const POLL_MS = 60 * 1000;
const TITLES = {
  NOT_CLOCKED_IN: { icon: 'time-outline', title: 'Clock in to start', color: '#4f46e5' },
  ON_LEAVE: { icon: 'sunny-outline', title: 'You’re on leave today', color: '#d97706' },
  SHIFT_ENDED: { icon: 'lock-closed-outline', title: 'Your shift has ended', color: '#dc2626' },
};

export default function StaffAccessGateNative() {
  const router = useRouter();
  const segments = useSegments();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const userRef = useRef(null);

  const check = useCallback(async (fresh = false) => {
    try {
      const user = await apiClient.getUser();
      userRef.current = user;
      const role = String(user?.role || '').toLowerCase();
      const rid = user?.restaurantId || user?.restaurant?.id;
      if (!user || !rid || NEVER_RESTRICTED.includes(role)) { apiClient.setStaffAccess(null); setState(null); return; }
      if (typeof apiClient.isEffectivelyOffline === 'function' && apiClient.isEffectivelyOffline()) return; // keep last state offline
      const res = await apiClient.getStaffAccessMe(rid, { fresh });
      apiClient.setStaffAccess(res);
      setState(res);
      restaurantEvents.emit('staffAccessChanged', res);
    } catch (_) { /* never block on a failed check */ }
  }, []);

  useEffect(() => {
    check(true);
    const unsubBlocked = restaurantEvents.on('staffAccessBlocked', () => check(true));
    const unsubSwitch = restaurantEvents.on('switch', () => check(true));
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(false); });
    const id = setInterval(() => check(false), POLL_MS);
    return () => { unsubBlocked(); unsubSwitch(); try { sub.remove(); } catch (_) {} clearInterval(id); };
  }, [check]);

  const current = segments[segments.length - 1];
  const blocked = !!(state && state.restricted && state.clock && state.clock.ok === false);
  if (!blocked || FREE_SCREENS.includes(current)) return null;

  const reason = state.clock.reason || 'NOT_CLOCKED_IN';
  const t = TITLES[reason] || TITLES.NOT_CLOCKED_IN;
  const shift = state.clock.shift || state.clock.nextShift;
  const me = userRef.current || {};
  const rid = me.restaurantId || me.restaurant?.id;

  const clockIn = async () => {
    setBusy(true); setMsg('');
    try {
      const location = await clockInLocation();
      await apiClient.clockIn(rid, { staffId: me.id || me.userId, staffName: me.name || '', location });
      await check(true);
    } catch (e) { setMsg(e.message || 'Could not clock in'); }
    finally { setBusy(false); }
  };
  const override = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setMsg('Enter the manager’s 4–8 digit PIN'); return; }
    setBusy(true); setMsg('');
    try {
      await apiClient.staffAccessOverride(rid, { staffId: me.id || me.userId, pin });
      setPin(''); setPinOpen(false);
      await check(true);
    } catch (e) { setMsg(e.message || 'Wrong PIN'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    try { await apiClient.logout(); } catch (_) { /* ignore */ }
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.backdrop} pointerEvents="auto">
      <View style={styles.card}>
        <View style={[styles.iconWrap, { backgroundColor: `${t.color}1A` }]}>
          <Ionicons name={t.icon} size={28} color={t.color} />
        </View>
        <Text style={styles.title}>{t.title}</Text>
        {!!state.message && <Text style={styles.sub}>{state.message}</Text>}
        {shift && (
          <View style={styles.shift}>
            <Text style={styles.shiftText}>
              {state.clock.shift ? 'Your shift' : 'Next shift'}: <Text style={{ fontWeight: '800' }}>{shift.startTime}–{shift.endTime}</Text>{shift.date ? ` · ${shift.date}` : ''}
            </Text>
          </View>
        )}
        {reason === 'NOT_CLOCKED_IN' && (
          <TouchableOpacity disabled={busy} onPress={clockIn} style={[styles.btn, { backgroundColor: '#4f46e5' }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <><Ionicons name="time-outline" size={18} color="#fff" /><Text style={styles.btnText}>Clock in</Text></>}
          </TouchableOpacity>
        )}
        {!pinOpen ? (
          <TouchableOpacity disabled={busy} onPress={() => { setPinOpen(true); setMsg(''); }} style={[styles.btn, { backgroundColor: '#f1f5f9' }]}>
            <Ionicons name="key-outline" size={18} color="#0f172a" /><Text style={[styles.btnText, { color: '#0f172a' }]}>Manager PIN</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.pinRow}>
            <TextInput value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={8}
              placeholder="Manager PIN" style={styles.pinInput} autoFocus onSubmitEditing={override} />
            <TouchableOpacity disabled={busy} onPress={override} style={[styles.pinOk]}><Text style={styles.btnText}>OK</Text></TouchableOpacity>
          </View>
        )}
        <TouchableOpacity onPress={() => router.push('/(tabs)/my-shifts')} style={[styles.btn, styles.outline]}>
          <Text style={[styles.btnText, { color: '#4f46e5' }]}>My shifts</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={logout} style={[styles.btn, styles.outline]}>
          <Ionicons name="log-out-outline" size={18} color="#64748b" /><Text style={[styles.btnText, { color: '#64748b' }]}>Log out</Text>
        </TouchableOpacity>
        {!!msg && <Text style={styles.err}>{msg}</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 30, backgroundColor: 'rgba(15,23,42,0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 18, padding: 22, alignItems: 'stretch' },
  iconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 10 },
  title: { fontSize: 19, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6 },
  shift: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 },
  shiftText: { fontSize: 13, color: '#334155', textAlign: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginTop: 10 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  outline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  pinRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pinInput: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 18, letterSpacing: 4, textAlign: 'center' },
  pinOk: { backgroundColor: '#0f172a', borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  err: { color: '#dc2626', fontSize: 12, textAlign: 'center', marginTop: 10 },
});
