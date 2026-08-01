// Terminal PIN lock for the shared mobile POS. Mirrors the web TerminalLockContext.
// Flag-gated by posSettings.terminalLock.enabled — when off it is a pass-through
// (no overlay, no behavior change). When on, the app is covered by a PIN pad; a
// staff enters their PIN to unlock and becomes the "operator" the next orders are
// attributed to. Auto-locks after each order and/or after idle, per config.
// Operator session is kept in memory + AsyncStorage so a reload doesn't force a
// re-PIN mid-order.

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { onTerminalOrderComplete } from '../services/terminalLockEvents';

const STORAGE_KEY = 'dineTerminalOperator';

const TerminalLockContext = createContext({
  enabled: false, locked: false, operator: null, lock: () => {}, lockAfterOrder: () => {}, ping: () => {},
});

export const useTerminalLock = () => useContext(TerminalLockContext);

// Same "pages that stay unlocked" whitelist as web (posSettings.terminalLock.unlockedPages
// uses web paths); map the web paths to this app's tab routes. The Kitchen Display is
// /kot on web ↔ the kitchen tab here — it must never be covered.
const WEB_TO_APP_ROUTE = { '/kot': '/kitchen', '/kitchen': '/kitchen', '/orders': '/orders', '/tables': '/tables', '/home': '/home', '/analytics': '/analytics', '/inventory': '/inventory' };

export function TerminalLockProvider({ restaurantId, restaurantName, terminalLock, children }) {
  const enabled = !!(terminalLock && terminalLock.enabled);
  const mode = terminalLock?.mode || 'after-order'; // 'after-order' | 'idle' | 'both'
  const idleSeconds = Math.max(15, Number(terminalLock?.idleSeconds) || 60);

  // Suppress the lock overlay on whitelisted pages (default: the kitchen display).
  const pathname = usePathname();
  const unlockedWeb = Array.isArray(terminalLock?.unlockedPages) ? terminalLock.unlockedPages : ['/kot'];
  const unlockedRoutes = unlockedWeb.map((p) => WEB_TO_APP_ROUTE[p] || p);
  const overlaySuppressed = !!(pathname && unlockedRoutes.some((p) => p && (pathname === p || pathname.startsWith(p + '/'))));

  const [operator, setOperator] = useState(null);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idleTimer = useRef(null);
  const router = useRouter();

  // Escape valve — sign out entirely. Prevents being stuck on the lock (e.g. wrong
  // account, or lock enabled before this device's staff had a PIN). After sign-out
  // the owner can log in / disable the lock from the web admin.
  const signOut = useCallback(async () => {
    try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
    try { await apiClient.logout(); } catch {}
    try { router.replace('/(auth)/login'); } catch {}
  }, [router]);

  // Initialise from the stored session; lock if none & enabled.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) { setLocked(false); setOperator(null); return; }
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        if (cancelled) return;
        if (stored && stored.id) { setOperator(stored); setLocked(false); }
        else { setOperator(null); setLocked(true); }
      } catch {
        if (!cancelled) { setOperator(null); setLocked(true); }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  const lock = useCallback(() => {
    if (!enabled) return;
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setOperator(null); setPin(''); setError(''); setLocked(true);
  }, [enabled]);

  const lockAfterOrder = useCallback(() => {
    if (enabled && (mode === 'after-order' || mode === 'both')) lock();
  }, [enabled, mode, lock]);

  // Idle auto-lock: callers ping() on activity.
  const armIdle = useCallback(() => {
    if (!enabled || locked || !(mode === 'idle' || mode === 'both')) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => lock(), idleSeconds * 1000);
  }, [enabled, locked, mode, idleSeconds, lock]);

  useEffect(() => { armIdle(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [armIdle]);
  const ping = useCallback(() => { armIdle(); }, [armIdle]);

  // Lock after a settled order (fired by api.verifyPayment), per mode.
  useEffect(() => onTerminalOrderComplete(() => lockAfterOrder()), [lockAfterOrder]);

  const submitPin = useCallback(async () => {
    const p = String(pin);
    if (!/^\d{4,8}$/.test(p) || busy) { setError('Enter a 4–8 digit PIN'); return; }
    setBusy(true); setError('');
    try {
      const res = await apiClient.verifyStaffPin(restaurantId, p);
      if (res && res.valid && res.operator) {
        const op = { ...res.operator, at: Date.now() };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(op)).catch(() => {});
        setOperator(op); setLocked(false); setPin('');
      } else { setError('Wrong PIN'); setPin(''); }
    } catch (e) {
      const msg = e?.response?.status === 401 || /wrong pin/i.test(e?.message || '') ? 'Wrong PIN' : (e?.message || 'Could not verify PIN');
      setError(msg); setPin('');
    } finally { setBusy(false); }
  }, [pin, busy, restaurantId]);

  const press = (d) => { setError(''); setPin(prev => (prev + d).slice(0, 8)); };

  const ctx = { enabled, locked, operator, lock, lockAfterOrder, ping };

  const idleTracked = enabled && (mode === 'idle' || mode === 'both');

  return (
    <TerminalLockContext.Provider value={ctx}>
      {idleTracked ? (
        // Reset the idle timer on any touch, without capturing the gesture.
        <View style={{ flex: 1 }} onStartShouldSetResponderCapture={() => { ping(); return false; }}>
          {children}
        </View>
      ) : children}
      <Modal visible={enabled && locked && !overlaySuppressed} transparent animationType="fade" onRequestClose={() => {}}>
        {/* Translucent + blurred so staff can glance at the screen behind, while the
            overlay still blocks all interaction until unlocked. */}
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.signOut} disabled={busy} onPress={signOut} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.signOutIcon}>⏻</Text>
              <Text style={styles.signOutTxt}>Sign out</Text>
            </TouchableOpacity>
            <View style={styles.iconWrap}><Text style={styles.iconTxt}>🔒</Text></View>
            <Text style={styles.title}>{restaurantName || 'Terminal locked'}</Text>
            <Text style={styles.sub}>Enter your PIN to continue</Text>

            <View style={styles.dots}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <View key={i} style={[styles.dot, i < pin.length ? styles.dotOn : null]} />
              ))}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.pad}>
              {['1','2','3','4','5','6','7','8','9'].map(d => (
                <TouchableOpacity key={d} style={styles.key} disabled={busy} onPress={() => press(d)}>
                  <Text style={styles.keyTxt}>{d}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.key} disabled={busy} onPress={() => { setPin(''); setError(''); }}>
                <Text style={styles.keyTxtSm}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} disabled={busy} onPress={() => press('0')}>
                <Text style={styles.keyTxt}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} disabled={busy} onPress={() => setPin(p => p.slice(0, -1))}>
                <Text style={styles.keyTxtSm}>⌫</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.unlock, (busy || pin.length < 4) ? styles.unlockOff : null]}
              disabled={busy || pin.length < 4}
              onPress={submitPin}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.unlockTxt}>Unlock</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </TerminalLockContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { position: 'relative', width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center' },
  iconWrap: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  iconTxt: { fontSize: 24 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14, minHeight: 20 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  dotOn: { backgroundColor: '#ef4444' },
  error: { color: '#dc2626', fontSize: 12.5, fontWeight: '600', marginBottom: 10 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' },
  key: { width: '31%', paddingVertical: 16, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', alignItems: 'center' },
  keyTxt: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  keyTxtSm: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  unlock: { width: '100%', marginTop: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center' },
  unlockOff: { backgroundColor: '#fca5a5' },
  unlockTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  signOut: { position: 'absolute', top: 12, right: 12, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  signOutIcon: { color: '#64748b', fontSize: 13, fontWeight: '900' },
  signOutTxt: { color: '#64748b', fontSize: 11, fontWeight: '700' },
});

export default TerminalLockContext;
