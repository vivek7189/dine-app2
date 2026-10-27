// New WhatsApp-bot order alerts on this phone: banner + ring while the app is open, and a phone
// notification (sent by the backend) when it is closed. Tapping either opens the order.
//
// Two per-phone switches (Profile → Preferences), both ON by default:
//   • alerts — OFF: no banner, no ring, and the backend stops sending this phone the notification
//   • sound  — OFF: banner without the ring (iPhone notifications also come without sound)
// The restaurant's own setting (web → WhatsApp → order alerts: sound / popup only / off) still wins.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import apiClient from './api';

const ALERTS_KEY = 'dineWaOrderAlerts';
const SOUND_KEY = 'dineWaOrderSound';
// Same rule as the backend push: these logins don't handle WhatsApp orders.
const SKIP_ROLE = /waiter|kitchen|chef|cook|deliver|rider|driver/i;

export const isWhatsAppOrder = (o) => !!o && (o.orderSource === 'whatsapp' || o.origin === 'whatsapp' || o.source === 'whatsapp');

export const roleGetsWhatsAppAlerts = (user) =>
  !!user && !user.isDeliveryPartner && !SKIP_ROLE.test(String(user.role || ''));

async function readFlag(key) {
  try { return (await AsyncStorage.getItem(key)) !== 'off'; } catch { return true; }
}
export const getWaAlertsOn = () => readFlag(ALERTS_KEY);
export const getWaSoundOn = () => readFlag(SOUND_KEY);

// Saves the switch on this phone and tells the backend (it decides who gets the notification).
async function saveFlag(key, on, field) {
  try { await AsyncStorage.setItem(key, on ? 'on' : 'off'); } catch { /* ignore */ }
  emit('prefs', null);
  try {
    const { syncWaPrefs } = require('./staffPush');
    await syncWaPrefs({ [field]: on ? 'on' : 'off' });
  } catch { /* best-effort — the app-side switch still applies */ }
}
export const setWaAlertsOn = (on) => saveFlag(ALERTS_KEY, on, 'waOrderAlerts');
export const setWaSoundOn = (on) => saveFlag(SOUND_KEY, on, 'waOrderSound');

export async function currentWaPrefs() {
  const [a, s] = await Promise.all([getWaAlertsOn(), getWaSoundOn()]);
  return { waOrderAlerts: a ? 'on' : 'off', waOrderSound: s ? 'on' : 'off' };
}

// ── tiny signal bus: the push handler (staffPush) and the live listener feed one banner ──
const listeners = {};
export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
  return () => { listeners[event] = (listeners[event] || []).filter(f => f !== fn); };
}
export function emit(event, data) {
  (listeners[event] || []).forEach((fn) => { try { fn(data); } catch (e) { console.warn('waOrderAlerts listener', e?.message); } });
}

// ── ring ──
let sound = null;
let playing = false;
export async function playWaOrderSound() {
  if (playing) return;
  playing = true;
  try {
    try { await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false, shouldDuckAndroid: true }); } catch { /* ignore */ }
    if (!sound) {
      const res = await Audio.Sound.createAsync(require('../assets/sounds/whatsapp-order.wav'), { shouldPlay: false, volume: 1 });
      sound = res.sound;
    }
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (e) {
    console.warn('WhatsApp order sound failed:', e?.message);
  } finally {
    setTimeout(() => { playing = false; }, 1500);
  }
}

// A notification tap can arrive before the banner component is listening (cold start) — keep it.
let pendingOpen = null;
export function requestOpen(orderId) {
  pendingOpen = String(orderId);
  emit('open', pendingOpen);
}
export function takePendingOpen() {
  const id = pendingOpen;
  pendingOpen = null;
  return id;
}

// Opening the order from a banner / notification tap.
export function openWhatsAppOrder(router, orderId) {
  if (!router || !orderId) return;
  router.push({ pathname: '/(tabs)/orders', params: { openOrderId: String(orderId), t: String(Date.now()) } });
}

export async function loadOrderForOpen(restaurantId, orderId) {
  const res = await apiClient.getOrders(restaurantId, { orderId, search: orderId, limit: 1 });
  return (res?.orders || []).find(o => o && String(o.id) === String(orderId)) || null;
}
