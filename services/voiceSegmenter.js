// Hands-free listening for Voice Ticket on phones / tablets (expo-av). Only SPEECH leaves the phone:
// the mic records in short rolling windows; while it is quiet each window is thrown away (never
// uploaded), when the level rises clearly above the room's noise the window is kept until a short
// pause ends the sentence, and that one small file is handed over. Long silence ends the session.
import { Audio } from 'expo-av';

const TICK = 100;

export async function startVoiceSegmenter({
  onSegment, onLevel, onSpeaking, onIdle,
  idleMs = 20000, endSilenceMs = 900, minSpeechMs = 350, maxSegmentMs = 15000, quietRollMs = 3000,
} = {}) {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) { const e = new Error('Microphone is blocked — allow it in the phone settings'); e.code = 'NO_MIC'; throw e; }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false });

  const s = { rec: null, stopped: false, paused: false, busy: false, speaking: false, noise: -50, voicedMs: 0, quietMs: 0, startedAt: 0, lastSpeech: Date.now() };

  const onStatus = (st) => {
    if (s.stopped || s.paused || s.busy || typeof st?.metering !== 'number') return;
    const db = st.metering;
    onLevel && onLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
    const loud = db > Math.max(-45, s.noise + 12);
    const now = Date.now();
    if (!s.speaking) {
      if (!loud) s.noise = s.noise * 0.9 + db * 0.1; // learn the room
      if (loud) { s.speaking = true; s.voicedMs = TICK; s.quietMs = 0; s.lastSpeech = now; onSpeaking && onSpeaking(true); return; }
      if (now - s.lastSpeech > idleMs) { if (!s.idleFired) { s.idleFired = true; onIdle && onIdle(); } return; }
      if (now - s.startedAt > quietRollMs) roll(false); // keep the lead-in short: quiet windows are dropped
      return;
    }
    if (loud) { s.voicedMs += TICK; s.quietMs = 0; s.lastSpeech = now; } else s.quietMs += TICK;
    if (s.quietMs >= endSilenceMs || now - s.startedAt >= maxSegmentMs) roll(true);
  };

  const begin = async () => {
    if (s.stopped || s.paused) return;
    const { recording } = await Audio.Recording.createAsync(
      { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true }, onStatus, TICK,
    );
    s.rec = recording; s.startedAt = Date.now();
  };

  // close the current window; keep = it held a sentence (send it), else drop it. Then start the next.
  async function roll(keep) {
    if (s.busy) return;
    s.busy = true;
    const rec = s.rec; s.rec = null;
    const sentence = keep && s.voicedMs >= minSpeechMs;
    if (s.speaking) { s.speaking = false; onSpeaking && onSpeaking(false); }
    s.voicedMs = 0; s.quietMs = 0;
    try {
      if (rec) {
        await rec.stopAndUnloadAsync().catch(() => {});
        const uri = rec.getURI();
        if (sentence && uri) onSegment && onSegment(uri);
      }
      await begin();
    } catch (_) {
      // could not reopen the mic → end the session cleanly
      if (!s.stopped) onIdle && onIdle();
    } finally {
      s.busy = false;
    }
  }

  await begin();

  return {
    async stop() {
      s.stopped = true;
      const rec = s.rec; s.rec = null;
      if (rec) await rec.stopAndUnloadAsync().catch(() => {});
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (_) { /* ignore */ }
    },
    // while the phone speaks a reply: release the mic so it never hears itself
    async pause() {
      if (s.paused) return;
      s.paused = true;
      const rec = s.rec; s.rec = null;
      if (s.speaking) { s.speaking = false; onSpeaking && onSpeaking(false); }
      if (rec) await rec.stopAndUnloadAsync().catch(() => {});
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); } catch (_) { /* ignore */ }
    },
    async resume() {
      if (!s.paused || s.stopped) return;
      s.paused = false; s.lastSpeech = Date.now();
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true }); await begin(); } catch (_) { onIdle && onIdle(); }
    },
  };
}
