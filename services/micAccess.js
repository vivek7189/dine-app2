// Microphone access + recorder creation for Voice Ticket (iPhone + Android), done the way good voice
// apps do it:
//  • ask first, and only start recording once the app is back in front — on iPhone the permission
//    prompt makes the app "inactive", and a recorder started then fails;
//  • a recorder that fails half-way is always unloaded (iOS allows ONE prepared recorder: a leaked
//    one made every later tap fail until the app was restarted) and creation is retried once;
//  • blocked in Settings → the caller shows an "Open Settings" button instead of a dead end.
import { AppState, Linking } from 'react-native';
import { Audio } from 'expo-av';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitUntilActive(timeoutMs = 4000) {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { sub.remove(); clearTimeout(t); resolve(); } });
    const t = setTimeout(() => { sub.remove(); resolve(); }, timeoutMs);
  });
}

// → { ok: true } | { ok: false, blocked: true } (must change it in Settings) | { ok: false } (said no now)
export async function ensureMic() {
  let cur = null;
  try { cur = await Audio.getPermissionsAsync(); } catch (_) { cur = null; }
  if (cur && cur.granted) return { ok: true };
  if (cur && cur.canAskAgain === false) return { ok: false, blocked: true };
  const res = await Audio.requestPermissionsAsync();
  if (!res.granted) return { ok: false, blocked: res.canAskAgain === false };
  // the prompt just closed: let the app become active again before touching the audio session
  await waitUntilActive();
  await sleep(350);
  return { ok: true, justGranted: true };
}

export const openMicSettings = () => { Linking.openSettings().catch(() => {}); };

export async function setRecordingMode(on) {
  try {
    await Audio.setAudioModeAsync(on
      ? { allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false }
      : { allowsRecordingIOS: false, playsInSilentModeIOS: true });
  } catch (_) { /* best effort */ }
}

// A started recorder, or throws. Never leaves a half-made recorder behind; one retry after a moment.
export async function createRecording(onStatus, intervalMs = 100) {
  const opts = { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true };
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const rec = new Audio.Recording();
    try {
      await rec.prepareToRecordAsync(opts);
      if (onStatus) rec.setOnRecordingStatusUpdate(onStatus);
      rec.setProgressUpdateInterval(intervalMs);
      await rec.startAsync();
      return rec;
    } catch (e) {
      lastErr = e;
      try { await rec.stopAndUnloadAsync(); } catch (_) { /* not prepared */ }
      if (attempt === 0) { await setRecordingMode(true); await sleep(400); }
    }
  }
  throw lastErr || new Error('Could not start the microphone');
}
