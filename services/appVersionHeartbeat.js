// Tell the server which app build this phone runs (like the Windows tills do), so dine-admin →
// App Control can show each restaurant's phone versions and target old ones with an update notice.
// Sent after login, on outlet switch and when the app comes back to the foreground (at most every
// 6 h per outlet). Best-effort: never blocks or breaks the app.
import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './api';

let Updates = null;
try {
  // eslint-disable-next-line global-require
  Updates = require('expo-updates');
} catch (_) { Updates = null; }

const TERMINAL_KEY = 'dineopen_terminal_id';
const EVERY_MS = 6 * 60 * 60 * 1000;
const lastSent = {}; // restaurantId → time

export function appVersion() {
  return String(Constants.expoConfig?.version || Constants.nativeAppVersion || '').trim();
}

// "2.98.43" or, when running an over-the-air update, "2.98.43+ota.1013" (date of that update).
function versionLabel() {
  const v = appVersion();
  if (!v) return '';
  try {
    const created = Updates && !Updates.isEmbeddedLaunch && Updates.createdAt;
    if (created) {
      const d = new Date(created);
      const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      return `${v}+ota.${mmdd}`.slice(0, 32);
    }
  } catch (_) {}
  return v;
}

async function terminalId() {
  try {
    let id = await AsyncStorage.getItem(TERMINAL_KEY);
    if (!id) {
      id = `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(TERMINAL_KEY, id);
    }
    return id;
  } catch (_) {
    return 'phone';
  }
}

export async function reportAppVersion(restaurantId, { force = false } = {}) {
  try {
    const version = versionLabel();
    if (!restaurantId || !version || Platform.OS === 'web') return;
    if (!force && lastSent[restaurantId] && Date.now() - lastSent[restaurantId] < EVERY_MS) return;
    lastSent[restaurantId] = Date.now();
    await apiClient.request('/api/telemetry/app-version', {
      method: 'POST',
      data: { appVersion: version, terminalId: await terminalId(), platform: Platform.OS, restaurantId },
    });
  } catch (_) { /* telemetry only */ }
}

// ── Notices from dine-admin → App Control (e.g. "please update", targeted by version) ─────────
// Shown as a simple alert. An info/warning notice the user closed stays closed until it is edited;
// a blocking one comes back on every check.
const SEEN_KEY = 'dineopen_seen_notices';
const lastChecked = {};

export async function checkAppNotices(restaurantId) {
  try {
    const v = appVersion();
    if (!restaurantId || !v || Platform.OS === 'web') return;
    if (lastChecked[restaurantId] && Date.now() - lastChecked[restaurantId] < EVERY_MS) return;
    lastChecked[restaurantId] = Date.now();
    const res = await apiClient.request(`/api/restaurants/${restaurantId}/billing-notice?client=mobile-app&v=${encodeURIComponent(v)}`);
    const list = Array.isArray(res?.broadcasts) ? res.broadcasts : [];
    if (!list.length) return;
    let seen = [];
    try { seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || '[]'); } catch (_) { seen = []; }
    const keyOf = (n) => `${n.id}|${n.updatedAt || ''}`;
    const n = list.find((x) => x.level === 'blocking' || !seen.includes(keyOf(x)));
    if (!n) return;
    const remember = async () => {
      if (n.level === 'blocking') return;
      try { await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, keyOf(n)].slice(-50))); } catch (_) {}
    };
    const url = /^https?:\/\//i.test(n.ctaUrl || '') ? n.ctaUrl : '';
    const buttons = [{ text: 'OK', style: 'cancel', onPress: remember }];
    if (url) buttons.push({ text: n.ctaLabel || 'Open', onPress: () => { remember(); Linking.openURL(url).catch(() => {}); } });
    Alert.alert(n.title || 'Notice', n.message || '', buttons, { cancelable: n.level !== 'blocking' });
  } catch (_) { /* best-effort */ }
}
