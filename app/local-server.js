import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import apiClient from '../services/api';
import { getLocalServerUrl, initLocalServer, normalizeServerUrl } from '../services/localServer';

/**
 * Local Server (Offline) — point this device at the on-prem server machine so the
 * waiter app keeps taking orders and printing on the LAN with no internet.
 */
export default function LocalServerScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null); // { ok, ms, error }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      await initLocalServer();
      const cur = getLocalServerUrl() || '';
      setSaved(cur);
      setUrl(cur);
    })();
  }, []);

  const test = async (raw) => {
    const target = normalizeServerUrl(raw);
    if (!target) { setResult({ ok: false, error: 'Enter the server address first.' }); return null; }
    setTesting(true); setResult(null);
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${target}/api/health`, { signal: ctrl.signal });
      clearTimeout(timer);
      const ms = Date.now() - t0;
      setResult(res.ok ? { ok: true, ms } : { ok: false, error: `Server responded ${res.status}` });
      return res.ok;
    } catch (e) {
      setResult({ ok: false, error: e.name === 'AbortError' ? 'Timed out — is the server running on this Wi-Fi?' : (e.message || 'Could not reach the server') });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const target = normalizeServerUrl(url);
    if (!target) return;
    setSaving(true);
    const ok = await test(target);
    if (ok === false) {
      setSaving(false);
      Alert.alert('Server not responding', 'Save this address anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: async () => { await apiClient.setLocalServer(target); setSaved(target); Alert.alert('Saved', 'This device now uses the local server.'); } },
      ]);
      return;
    }
    await apiClient.setLocalServer(target);
    setSaved(target);
    setSaving(false);
    Alert.alert('Connected', 'This device now uses the local server. Open Tables/Orders to start.');
  };

  const clearServer = async () => {
    await apiClient.setLocalServer(null);
    setSaved(''); setUrl(''); setResult(null);
    Alert.alert('Switched to Cloud', 'This device now uses the cloud again.');
  };

  const active = !!saved;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Local Server' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.iconBox, { backgroundColor: active ? '#eef2ff' : '#f1f5f9' }]}>
              <Ionicons name="server-outline" size={20} color={active ? '#4f46e5' : '#64748b'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Local Server</Text>
              <Text style={styles.subtitle}>Run offline against the on-prem server on your Wi-Fi</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: active ? '#e7f6ec' : '#f1f5f9' }]}>
              <Text style={[styles.badgeText, { color: active ? '#15803d' : '#64748b' }]}>{active ? 'LOCAL' : 'CLOUD'}</Text>
            </View>
          </View>

          {active && (
            <View style={styles.note}>
              <Text style={styles.noteText}>Connected to <Text style={{ fontWeight: '700' }}>{saved}</Text>. Orders, tables and KOT flow over the local network.</Text>
            </View>
          )}

          <Text style={styles.label}>SERVER ADDRESS</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={url}
              onChangeText={(t) => { setUrl(t); setResult(null); }}
              placeholder="192.168.1.50:3003"
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
              placeholderTextColor="#94a3b8"
              style={styles.input}
            />
            <TouchableOpacity onPress={() => test(url)} disabled={testing} style={styles.testBtn}>
              {testing ? <ActivityIndicator size="small" color="#334155" /> : <Ionicons name="wifi-outline" size={16} color="#334155" />}
              <Text style={styles.testBtnText}>Test</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>The server machine's Wi-Fi IP. Port defaults to 3003.</Text>

          {result && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Ionicons name={result.ok ? 'checkmark-circle' : 'close-circle'} size={16} color={result.ok ? '#15803d' : '#b91c1c'} />
              <Text style={{ color: result.ok ? '#15803d' : '#b91c1c', fontWeight: '600' }}>
                {result.ok ? `Reachable · ${result.ms} ms` : result.error}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity onPress={save} disabled={!url.trim() || saving} style={[styles.primaryBtn, { opacity: url.trim() ? 1 : 0.5 }]}>
              <Text style={styles.primaryBtnText}>{saving ? 'Connecting…' : (saved && normalizeServerUrl(url) === saved ? 'Re-connect' : 'Use this server')}</Text>
            </TouchableOpacity>
            {active && (
              <TouchableOpacity onPress={clearServer} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Use Cloud</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  note: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 10, padding: 12, marginTop: 14 },
  noteText: { fontSize: 13, color: '#334155' },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 18, marginBottom: 6, letterSpacing: 0.4 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d3dae6', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: '#0f172a' },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d3dae6', borderRadius: 10, backgroundColor: '#fff' },
  testBtnText: { color: '#334155', fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  primaryBtn: { flex: 1, backgroundColor: '#4f46e5', borderRadius: 11, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  clearBtn: { paddingHorizontal: 18, borderRadius: 11, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 15 },
});
