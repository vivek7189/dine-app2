import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../services/api';

/**
 * LAN "Who's working? → PIN" login for the local-server flow — the same UX as the desktop
 * app. Loads the staff roster from the local server, staff taps their tile, enters their PIN,
 * and we call /api/auth/pin/login (a real token, no password). Only rendered when the app is
 * connected to a local server; the normal cloud login is untouched. `onUsePassword` switches
 * back to the ID + password form (owner/staff without a PIN).
 */
const AV = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function LanPinLogin({ onUsePassword }) {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await apiClient.getRoster();
        if (!alive) return;
        setRestaurantName(j?.restaurant?.name || '');
        setMembers(Array.isArray(j?.members) ? j.members : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const submit = useCallback(async (member, code) => {
    if (!member?.identifier) { setError('This staff has no phone/email on file — use password login.'); return; }
    setBusy(true); setError('');
    try {
      const data = await apiClient.pinLogin(member.identifier, code);
      if (data?.token) {
        router.replace(await apiClient.getRoleLandingRoute());
      } else {
        setError(data?.error || 'Invalid PIN'); setPin('');
      }
    } catch (e) {
      setError(e?.message || 'Invalid PIN'); setPin('');
    } finally {
      setBusy(false);
    }
  }, [router]);

  const press = (d) => {
    if (busy) return;
    setError('');
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 4 && selected) submit(selected, next); // auto-submit at 4 digits
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#ef4444" /><Text style={styles.muted}>Loading staff…</Text></View>;
  }

  // ── PIN pad (a staff member is selected) ──
  if (selected) {
    return (
      <View>
        <TouchableOpacity onPress={() => { setSelected(null); setPin(''); setError(''); }} style={styles.back}>
          <Text style={styles.backTxt}>‹ Back</Text>
        </TouchableOpacity>
        <View style={styles.selWrap}>
          <View style={[styles.avatar, { backgroundColor: AV[Math.max(0, members.findIndex((x) => x.id === selected.id)) % AV.length] }]}>
            <Text style={styles.avatarTxt}>{initials(selected.name)}</Text>
          </View>
          <Text style={styles.selName}>{selected.name}</Text>
          <Text style={styles.muted}>Enter your PIN</Text>
        </View>
        <View style={styles.dots}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <View key={i} style={[styles.dot, i < pin.length ? styles.dotOn : null]} />
          ))}
        </View>
        {!!error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.pad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
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
          <TouchableOpacity style={styles.key} disabled={busy} onPress={() => setPin((p) => p.slice(0, -1))}>
            <Text style={styles.keyTxtSm}>⌫</Text>
          </TouchableOpacity>
        </View>
        {busy && <ActivityIndicator color="#ef4444" style={{ marginTop: 12 }} />}
      </View>
    );
  }

  // ── Staff picker ("Who's working?") ──
  return (
    <View>
      <Text style={styles.title}>Who's working?</Text>
      <Text style={styles.muted}>{restaurantName ? `${restaurantName} · tap your name` : 'Tap your name to sign in'}</Text>
      {members.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No staff with a PIN found on this server.</Text>
          {onUsePassword && <TouchableOpacity onPress={onUsePassword}><Text style={styles.link}>Use ID + password instead</Text></TouchableOpacity>}
        </View>
      ) : (
        <>
          <ScrollView style={{ maxHeight: 320, marginTop: 14 }}>
            <View style={styles.grid}>
              {members.map((m, i) => (
                <TouchableOpacity key={m.id || i} style={styles.tile} onPress={() => { setSelected(m); setPin(''); setError(''); }}>
                  <View style={[styles.avatar, { backgroundColor: AV[i % AV.length] }]}>
                    <Text style={styles.avatarTxt}>{initials(m.name)}</Text>
                  </View>
                  <Text style={styles.tileName} numberOfLines={1}>{m.name}</Text>
                  {!!m.role && <Text style={styles.tileRole}>{String(m.role).toUpperCase()}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {onUsePassword && (
            <TouchableOpacity onPress={onUsePassword} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={styles.link}>Use ID + password instead</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  muted: { fontSize: 13, color: '#64748b' },
  link: { fontSize: 14, color: '#ef4444', fontWeight: '700', marginTop: 6 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start' },
  tile: { width: '30%', minWidth: 96, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#eef2f7' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  tileName: { fontSize: 13, fontWeight: '700', color: '#0f172a', maxWidth: '100%' },
  tileRole: { fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 2 },
  back: { paddingVertical: 6 },
  backTxt: { fontSize: 15, color: '#64748b', fontWeight: '700' },
  selWrap: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
  selName: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 6 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#e2e8f0' },
  dotOn: { backgroundColor: '#ef4444' },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 8, fontSize: 13, fontWeight: '600' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  key: { width: '31%', aspectRatio: 1.6, backgroundColor: '#f1f5f9', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  keyTxtSm: { fontSize: 15, fontWeight: '700', color: '#64748b' },
});
