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
let unsubRefresh = null;
let unsubMessage = null;

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
  await apiClient.request(`/api/shift-scheduling/push-token/${restaurantId}`, {
    method: 'POST',
    data: { token, platform: Platform.OS },
  });
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
      const title = msg?.notification?.title;
      const body = msg?.notification?.body;
      if (title || body) Alert.alert(title || 'DineOpen', body || '');
    });
  } catch (e) {
    console.warn('Staff push registration skipped:', e?.message);
  }
}

// Call on logout so the next person using this phone doesn't get the previous person's shifts.
export function resetStaffPush() {
  registeredFor = null;
  if (unsubRefresh) { unsubRefresh(); unsubRefresh = null; }
  if (unsubMessage) { unsubMessage(); unsubMessage = null; }
  try { if (messaging) messaging().deleteToken().catch(() => {}); } catch (_) {}
}
