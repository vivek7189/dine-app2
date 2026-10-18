// Live two-way voice for Voice Ticket on phones / tablets (restaurant.voiceAi.engine === 'live').
// Same flow as the web (dine-frontend src/utils/voiceLive.js): a short-lived key from our server, the
// phone talks to the realtime model over WebRTC, the model's tool calls are checked by our server
// (menu items only) and applied by the screen; send / cancel use the screen's own send flow.
//
// react-native-webrtc / react-native-incall-manager are native modules: builds without them (older
// APK / App Store builds getting this JS over the air) report liveVoiceAvailable() === false and the
// screen keeps the classic voice mode.
import { Platform } from 'react-native';
import apiClient from './api';

let RTC = null;
try { RTC = require('react-native-webrtc'); if (!RTC || !RTC.RTCPeerConnection) RTC = null; } catch (_) { RTC = null; }
let InCall = null;
try { InCall = require('react-native-incall-manager').default; } catch (_) { InCall = null; }

export const liveVoiceAvailable = () => !!RTC;

export async function startLiveVoice({
  restaurantId, getDraft, onOps, onSend, onCancel, onState, onYou, onAi, onTool, onError, onEnd,
}) {
  if (!RTC) { const e = new Error('Live voice needs the latest app update'); e.code = 'NO_WEBRTC'; throw e; }
  const { RTCPeerConnection, mediaDevices } = RTC;
  onState && onState('connecting');
  const ses = await apiClient.voiceLiveSession(restaurantId, compactDraft(getDraft && getDraft()));
  if (!ses || !ses.success || !ses.key) throw new Error((ses && ses.error) || 'Could not start the live voice');

  // Declared up front: stop() can run while setup is still going (a failure half-way) and must always
  // release the mic, the connection and the speaker mode.
  let ended = false;
  let cap = null;
  let meter = null;
  let pc = null;
  let dc = null;
  const started = Date.now();
  const usage = { audioIn: 0, audioOut: 0, textIn: 0, cached: 0, textOut: 0 };
  const mic = await mediaDevices.getUserMedia({ audio: true, video: false });
  // loudspeaker, not the earpiece (a call-style audio session defaults to the earpiece)
  try { if (InCall) { InCall.start({ media: 'audio' }); InCall.setForceSpeakerphoneOn(true); } } catch (_) { /* default route */ }

  pc = new RTCPeerConnection({});
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));
  dc = pc.createDataChannel('oai-events');
  let you = '';
  let ai = '';
  const lv = { you: 0, ai: 0 };
  const sendEvt = (o) => { try { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(o)); } catch (_) { /* closed */ } };
  // Tool calls run ONE AFTER ANOTHER in the order the model made them ("add a coke and send it" =
  // update_order then send_order — the send must see the coke); ONE response.create once the model's
  // turn is done and every tool has answered.
  let toolChain = Promise.resolve();
  let toolsPending = 0;
  let needReply = false;
  let turnDone = false;
  const maybeReply = () => { if (needReply && turnDone && toolsPending === 0) { needReply = false; sendEvt({ type: 'response.create' }); } };
  const queueTool = (name, callId, argsText) => {
    toolsPending++; needReply = true;
    toolChain = toolChain.then(() => runTool(name, callId, argsText)).catch(() => {}).then(() => { toolsPending--; maybeReply(); });
  };

  const runTool = async (name, callId, argsText) => {
    onState && onState('thinking');
    let output = '';
    try {
      if (name === 'send_order') output = await onSend();
      else if (name === 'cancel_order') { onCancel && onCancel(); output = 'Order cleared.'; }
      else {
        const res = await apiClient.voiceLiveTool(restaurantId, { name, args: argsText, draft: compactDraft(getDraft && getDraft()), transcript: you });
        if (!res || !res.success) throw new Error((res && res.error) || 'failed');
        if (res.ops) onOps && onOps(res.ops);
        output = res.output || 'Done.';
      }
    } catch (e) {
      output = `That did not work: ${e && e.message ? e.message : 'error'}. Tell the staff briefly.`;
    }
    onTool && onTool({ name, output });
    sendEvt({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: String(output).slice(0, 4000) } });
  };

  const onMessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch (_) { return; }
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': you = ''; onState && onState('hearing'); onYou && onYou('', false); break;
      case 'input_audio_buffer.speech_stopped': onState && onState('thinking'); break;
      case 'conversation.item.input_audio_transcription.delta': you += ev.delta || ''; onYou && onYou(you, false); break;
      case 'conversation.item.input_audio_transcription.completed': you = String(ev.transcript || you).trim(); onYou && onYou(you, true); break;
      case 'response.created': ai = ''; turnDone = false; break;
      case 'response.output_audio_transcript.delta': ai += ev.delta || ''; onAi && onAi(ai, false); onState && onState('speaking'); break;
      case 'response.output_audio_transcript.done': ai = String(ev.transcript || ai).trim(); onAi && onAi(ai, true); break;
      case 'output_audio_buffer.started': onState && onState('speaking'); break;
      case 'output_audio_buffer.stopped': case 'output_audio_buffer.cleared': onState && onState('listening'); break;
      case 'response.function_call_arguments.done': queueTool(ev.name, ev.call_id, ev.arguments || '{}'); break;
      case 'response.done': {
        turnDone = true; maybeReply();
        const u = ev.response && ev.response.usage;
        if (u) {
          const ind = u.input_token_details || {}; const outd = u.output_token_details || {};
          usage.audioIn += ind.audio_tokens || 0; usage.textIn += ind.text_tokens || 0; usage.cached += ind.cached_tokens || 0;
          usage.audioOut += outd.audio_tokens || 0; usage.textOut += outd.text_tokens || 0;
        }
        break;
      }
      case 'error': onError && onError((ev.error && ev.error.message) || 'Live voice error'); break;
      default: break;
    }
  };
  if (dc.addEventListener) dc.addEventListener('message', onMessage); else dc.onmessage = onMessage;

  try {
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    const sdpRes = await fetch(ses.callUrl || 'https://api.openai.com/v1/realtime/calls', {
      method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${ses.key}`, 'Content-Type': 'application/sdp' },
    });
    if (!sdpRes.ok) throw new Error('Could not connect the live voice');
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() });
    await new Promise((resolve) => {
      if (dc.readyState === 'open') { resolve(); return; }
      const open = () => resolve();
      if (dc.addEventListener) dc.addEventListener('open', open); else dc.onopen = open;
      setTimeout(resolve, 6000);
    });
  } catch (e) { stop('failed'); throw e; }
  if (ended) throw new Error('Live voice stopped');
  onState && onState('listening');

  // loudness for the orb: WebRTC stats (audioLevel 0..1) of our mic and of the assistant's voice
  meter = setInterval(async () => {
    try {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === 'media-source' && r.kind === 'audio' && typeof r.audioLevel === 'number') lv.you = Math.min(1, r.audioLevel * 3);
        if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') lv.ai = Math.min(1, r.audioLevel * 3);
      });
    } catch (_) { /* decoration only */ }
  }, 120);

  cap = setTimeout(() => stop('time'), Math.max(1, ses.maxMinutes || 6) * 60 * 1000);
  const onConn = () => { if (['failed', 'closed'].includes(pc.connectionState)) stop('dropped'); };
  if (pc.addEventListener) pc.addEventListener('connectionstatechange', onConn); else pc.onconnectionstatechange = onConn;

  function stop(reason = 'user') {
    if (ended) return;
    ended = true;
    clearTimeout(cap); clearInterval(meter);
    try { if (dc) dc.close(); } catch (_) { /* closed */ }
    try { mic.getTracks().forEach((t) => t.stop()); } catch (_) { /* stopped */ }
    try { if (pc) pc.close(); } catch (_) { /* closed */ }
    try { InCall && InCall.stop(); } catch (_) { /* none */ }
    onState && onState('ended');
    const seconds = Math.round((Date.now() - started) / 1000);
    apiClient.voiceLiveUsage(restaurantId, { seconds, usage }).catch(() => {});
    onEnd && onEnd(reason);
  }

  return {
    stop,
    mute(on) { mic.getAudioTracks().forEach((t) => { t.enabled = !on; }); },
    levels: () => lv,
    platform: Platform.OS,
  };
}

// what the server needs of the ticket (keys, items, choices) — small and plain
function compactDraft(d) {
  if (!d) return null;
  return {
    orderType: d.orderType || null, tableNumber: d.tableNumber || null, customerName: d.customerName || null,
    lines: (d.lines || []).map((l) => ({ key: l.key, menuItemId: l.menuItemId, name: l.name, quantity: l.quantity, price: l.price, variant: l.variant || null, needsVariant: !!l.needsVariant, variants: l.variants || [], notes: l.notes || [] })),
    unclear: (d.unclear || []).map((u) => ({ key: u.key, heard: u.heard, reason: u.reason, options: (u.options || []).map((o) => ({ menuItemId: o.menuItemId, name: o.name })) })),
  };
}
