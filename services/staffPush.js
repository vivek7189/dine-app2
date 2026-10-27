// Phone notifications for the logged-in staff member (shift rota: schedule published, shift
// changed/cancelled, open shift, swap/claim decisions, reminders). Registers this phone's FCM token
// with the backend for the current restaurant; the backend decides what to send (per-restaurant
// "App notification" switch in Shifts → Settings). Everything is best-effort: no crash if the
// native module is missing (older build / web) or the user declines the permission.
import { Platform, PermissionsAndroid, Alert } from 'react-native';
import apiClient from './api';

let messaging = null;
try {
  // eslint-disable-next-line global-require
  messaging = require('@react-native-firebase/messaging').default;
} catch (_) { messaging = null; }

let registeredFor = null;
let lastToken = null;
let unsubRefresh = null;
let unsubMessage = null;
let unsubOpened = null;

async function askPermission() {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      return r === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }
  const status = await messaging().requestPermission();
  return status === 1 || status === 2; // AUTHORIZED / PROVISIONAL
}

async function sendToken(restaurantId, token) {
  if (!token) return;
  lastToken = token;
  // This phone's WhatsApp-order alert switches travel with the token (backend skips 'off' phones).
  let prefs = {};
  try { prefs = await require('./whatsappOrderAlerts').currentWaPrefs(); } catch (_) { prefs = {}; }
  await apiClient.request(`/api/shift-scheduling/push-token/${restaurantId}`, {
    method: 'POST',
    data: { token, platform: Platform.OS, ...prefs },
  });
}

// Profile → Preferences changed a WhatsApp-order switch: tell the backend for this phone.
export async function syncWaPrefs() {
  if (!registeredFor || !lastToken) return;
  await sendToken(registeredFor, lastToken);
}

// A tapped WhatsApp-order notification → open that order (the banner component does the navigation).
const openedHandled = new Set(); // a tap is handled once (getInitialNotification can repeat on re-register)
function handleOpened(msg) {
  const d = msg?.data || {};
  const key = msg?.messageId || d.orderId;
  if (!key || openedHandled.has(key)) return;
  openedHandled.add(key);
  if (d.type === 'whatsapp-order' && d.orderId) {
    try { require('./whatsappOrderAlerts').requestOpen(d.orderId); } catch (_) { /* ignore */ }
  }
}

export async function registerStaffPush(restaurantId) {
  if (!messaging || !restaurantId || registeredFor === restaurantId) return;
  try {
    const allowed = await askPermission();
    if (!allowed) return;
    const token = await messaging().getToken();
    await sendToken(restaurantId, token);
    registeredFor = restaurantId;

    if (unsubRefresh) unsubRefresh();
    unsubRefresh = messaging().onTokenRefresh(t => { sendToken(restaurantId, t).catch(() => {}); });

    // Android shows the notification itself only when the app is in the background — while the
    // app is open, show it here.
    if (unsubMessage) unsubMessage();
    unsubMessage = messaging().onMessage(async (msg) => {
      // New WhatsApp order while the app is open → the in-app banner + ring (not a dialog).
      if (msg?.data?.type === 'whatsapp-order') {
        try { require('./whatsappOrderAlerts').emit('push', msg.data); } catch (_) { /* ignore */ }
        return;
      }
      const title = msg?.notification?.title;
      const body = msg?.notification?.body;
      if (title || body) Alert.alert(title || 'DineOpen', body || '');
    });

    // Notification tapped while the app was in the background / closed.
    if (unsubOpened) unsubOpened();
    unsubOpened = messaging().onNotificationOpenedApp(handleOpened);
    messaging().getInitialNotification().then((m) => { if (m) handleOpened(m); }).catch(() => {});
  } catch (e) {
    console.warn('Staff push registration skipped:', e?.message);
  }
}

// Call on logout so the next person using this phone doesn't get the previous person's shifts.
export function resetStaffPush() {
  registeredFor = null;
  lastToken = null;
  if (unsubRefresh) { unsubRefresh(); unsubRefresh = null; }
  if (unsubMessage) { unsubMessage(); unsubMessage = null; }
  if (unsubOpened) { unsubOpened(); unsubOpened = null; }
  try { if (messaging) messaging().deleteToken().catch(() => {}); } catch (_) {}
}
