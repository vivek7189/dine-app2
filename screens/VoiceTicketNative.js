// Voice Ticket (phone / tablet) — the server speaks an order, checks a kitchen ticket, sends it.
// Same flow as the web/desktop page (/voice): record → POST /api/voice-ticket/:rid/understand →
// check / fix the ticket → place the order (normal POST /api/orders) → print the KOT with the same
// print rules as the order screen (services/voiceTicketPrint.js). Off unless the owner turned on
// posSettings.voiceTicket.enabled.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import apiClient from '../services/api';
import { getOrderItemKey } from '../utils/orderItemKey';
import { useResponsive } from '../hooks/useResponsive';
import { loadVoicePrintConfig, voicePrintClaims, printVoiceKOT } from '../services/voiceTicketPrint';
import { startVoiceSegmenter } from '../services/voiceSegmenter';

// Spoken answers (Admin → Voice Ticket → Answers: speak). Optional native module: builds without it
// (older App Store / APK builds) simply show the answer on screen.
let Speech = null;
try { Speech = require('expo-speech'); if (!Speech || typeof Speech.speak !== 'function') Speech = null; } catch (_) { Speech = null; }

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
const RED = '#D92D20';
const INK = '#18181B';
const MAX_SECONDS = 60;
const isDineIn = (t) => /dine|table/i.test(String(t || ''));
const typeLabel = (t) => (isDineIn(t) ? 'Dine-in' : /deliver/i.test(String(t || '')) ? 'Delivery' : 'To-go');
const todayKey = (rid) => `vt:tickets:${rid}:${new Date().toISOString().slice(0, 10)}`;

export default function VoiceTicketNative() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [me, setMe] = useState(null);
  const [rid, setRid] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [settings, setSettings] = useState(null);
  const [orderTypes, setOrderTypes] = useState(['dine-in', 'takeaway']);
  const [menu, setMenu] = useState([]);
  const [printCfg, setPrintCfg] = useState(null);
  const [staff, setStaff] = useState([]);
  const [server, setServer] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [phase, setPhase] = useState('idle'); // idle | listening | thinking | check | sending | sent
  const [error, setError] = useState('');
  const [heard, setHeard] = useState('');
  const [ticket, setTicket] = useState(null);
  const [sel, setSel] = useState(null);
  const [editHead, setEditHead] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [tickets, setTickets] = useState([]);
  const [showToday, setShowToday] = useState(false);
  const [toast, setToast] = useState('');
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [conflict, setConflict] = useState(null);

  const recRef = useRef({ rec: null, voiced: 0, metered: false, started: 0, timer: null });
  // hands-free conversation (settings.handsFree)
  const [convo, setConvo] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [thinking, setThinking] = useState(0);
  const [reply, setReply] = useState('');
  const [autoSend, setAutoSend] = useState(null); // { left } — "that's it" said → send unless Undo
  const segRef = useRef(null);
  const convoRef = useRef(false);
  const chainRef = useRef(Promise.resolve());
  const ticketRef = useRef(null);
  useEffect(() => { ticketRef.current = ticket; }, [ticket]);
  const toastTimer = useRef(null);
  const flash = useCallback((m) => { clearTimeout(toastTimer.current); setToast(m); toastTimer.current = setTimeout(() => setToast(''), 3200); }, []);

  // ── load ──
  useEffect(() => {
    (async () => {
      try {
        const user = await apiClient.getUser();
        const id = user?.restaurantId || user?.restaurant?.id;
        if (!id) { setLoadError('No restaurant assigned'); return; }
        setMe(user); setRid(id); setRestaurantName(user?.restaurant?.name || '');
        setServer({ id: user?.id || user?.userId || null, name: user?.name || 'Me', role: user?.role || '' });
        try { setTickets(JSON.parse((await AsyncStorage.getItem(todayKey(id))) || '[]')); } catch { /* none */ }
        const [vs, ms, cfg] = await Promise.all([
          apiClient.getVoiceTicketSettings(id),
          apiClient.getMenu(id).catch(() => null),
          loadVoicePrintConfig(id).catch(() => ({ printSettings: {}, printStationCount: 0, localKotPrintingOn: false })),
        ]);
        setSettings(vs?.settings || { enabled: false });
        if (Array.isArray(vs?.orderTypes) && vs.orderTypes.length) setOrderTypes(vs.orderTypes);
        const items = ms?.menuItems || ms?.items || ms?.menu?.items || (Array.isArray(ms) ? ms : []);
        setMenu(items.filter((it) => it && it.id && it.name && !['deleted', 'inactive'].includes(String(it.status || '').toLowerCase())));
        setPrintCfg(cfg);
        if (vs?.settings?.askServer) {
          try {
            const st = await apiClient.getStaffList();
            const list = (st?.staff || st?.data || (Array.isArray(st) ? st : []))
              .filter((s) => s && s.name && !['deleted', 'inactive', 'disabled'].includes(String(s.status || '').toLowerCase()))
              .map((s) => ({ id: s.id || s.userId, name: s.name, role: s.role || '' }));
            setStaff(list.slice(0, 12));
          } catch { /* staff can't list colleagues → only "me" */ }
        }
      } catch (e) {
        setLoadError(e?.message || 'Could not load Voice Ticket');
      }
    })();
    return () => {
      const r = recRef.current;
      clearInterval(r.timer);
      if (r.rec) r.rec.stopAndUnloadAsync().catch(() => {});
      convoRef.current = false;
      if (segRef.current) segRef.current.stop().catch(() => {});
      try { Speech && Speech.stop(); } catch (_) { /* none */ }
    };
  }, []);

  // ── understand ──
  const understand = useCallback(async (payload) => {
    setPhase('thinking'); setError('');
    try {
      const res = await apiClient.voiceTicketUnderstand(rid, payload);
      if (!res?.success) throw new Error(res?.error || 'Could not build the ticket');
      setHeard(res.transcript || '');
      setTicket((prev) => {
        if (prev && (prev.lines.length || prev.unclear.length)) {
          const tag = '_' + Date.now();
          return {
            ...prev,
            orderType: prev.orderType || res.ticket.orderType,
            tableNumber: prev.tableNumber || res.ticket.tableNumber,
            customerName: prev.customerName || res.ticket.customerName,
            lines: [...prev.lines, ...res.ticket.lines.map((l) => ({ ...l, key: l.key + tag }))],
            unclear: [...prev.unclear, ...res.ticket.unclear.map((u) => ({ ...u, key: u.key + tag }))],
          };
        }
        return res.ticket;
      });
      setPhase('check');
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Voice service had a problem — please try again';
      setError(msg);
      setPhase((p) => (ticket ? 'check' : 'idle'));
    }
  }, [rid, ticket]);

  // ── recording (expo-av) ──
  const startListening = async () => {
    setError('');
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) { setError('Microphone is blocked — allow it in the phone settings'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const r = recRef.current;
      r.voiced = 0; r.metered = false; r.started = Date.now();
      const { recording } = await Audio.Recording.createAsync(
        { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true },
        (st) => {
          if (typeof st?.metering === 'number') {
            r.metered = true;
            if (st.metering > -42) r.voiced += 1; // a slice with real voice energy
            setLevel(Math.max(0, Math.min(1, (st.metering + 60) / 50)));
          }
        },
        120,
      );
      r.rec = recording;
      setSecs(0);
      r.timer = setInterval(() => {
        const s = Math.floor((Date.now() - r.started) / 1000);
        setSecs(s);
        if (s >= MAX_SECONDS) stopListening();
      }, 250);
      setPhase('listening');
    } catch (e) {
      setError('Could not start the microphone');
    }
  };

  const stopListening = async () => {
    const r = recRef.current;
    clearInterval(r.timer);
    const rec = r.rec; r.rec = null;
    if (!rec) return;
    try { await rec.stopAndUnloadAsync(); } catch { /* already stopped */ }
    try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { /* ignore */ }
    setLevel(0);
    const dur = (Date.now() - r.started) / 1000;
    const uri = rec.getURI();
    if (dur < 0.8 || !uri) { setPhase(ticket ? 'check' : 'idle'); setError('That was too short — tap the mic and say the order'); return; }
    // nobody actually spoke: never send silence (a speech model can invent words from nothing)
    if (r.metered && r.voiced < 6) { setPhase(ticket ? 'check' : 'idle'); setError('Didn’t hear anything — speak a little closer'); return; }
    understand({ audioUri: uri, mimeType: 'audio/m4a' });
  };

  // ── hands-free conversation ──
  const speak = (text) => {
    if (settings?.replies !== 'voice' || !text || !Speech) return;
    const seg = segRef.current;
    let resumed = false;
    const resume = () => { if (resumed) return; resumed = true; if (convoRef.current && segRef.current) segRef.current.resume(); };
    (async () => {
      try { if (seg) await seg.pause(); } catch (_) { /* ignore */ }
      try { Speech.stop(); Speech.speak(text, { rate: 1.0, onDone: resume, onStopped: resume, onError: resume }); } catch (_) { resume(); }
      setTimeout(resume, Math.min(8000, 900 + text.split(/\s+/).length * 330));
    })();
  };

  const applyAgent = (res) => {
    if (res.cancel) { ticketRef.current = null; setTicket(null); setHeard(''); return null; }
    const base = ticketRef.current || { orderType: orderTypes[0] || 'dine-in', tableNumber: null, customerName: null, orderNotes: null, lines: [], unclear: [] };
    const removed = new Set(res.remove || []);
    let tk = { ...base, lines: base.lines.filter((l) => !removed.has(l.key)), unclear: [...(base.unclear || [])] };
    if (res.header) tk = { ...tk, ...res.header };
    for (const c of res.changes || []) {
      tk.lines = tk.lines.map((l) => {
        if (l.key !== c.key) return l;
        const x = { ...l, notes: [...(l.notes || [])] };
        if (c.quantity) x.quantity = c.quantity;
        if (c.variant) {
          const v = variantsOf(l.menuItemId).find((o) => o.name.toLowerCase() === c.variant.toLowerCase());
          if (v) { x.variant = v.name; x.needsVariant = false; if (Number(v.price)) x.price = Number(v.price); }
          else if (!x.notes.includes(c.variant)) x.notes.push(c.variant);
        }
        const drop = (c.removeNotes || []).map((n) => n.toLowerCase());
        x.notes = [...x.notes.filter((n) => !drop.includes(n.toLowerCase())), ...(c.addNotes || []).filter((n) => !x.notes.includes(n))];
        return x;
      });
    }
    tk.lines = [...tk.lines, ...(res.addLines || [])];
    tk.unclear = [...tk.unclear, ...(res.unclear || [])];
    const empty = !tk.lines.length && !tk.unclear.length && !tk.tableNumber && !tk.customerName;
    ticketRef.current = empty ? null : tk;
    setTicket(empty ? null : tk);
    return ticketRef.current;
  };

  const stopConvo = () => {
    convoRef.current = false;
    setConvo(false); setHearing(false); setLevel(0);
    const seg = segRef.current; segRef.current = null;
    if (seg) seg.stop().catch(() => {});
    try { Speech && Speech.stop(); } catch (_) { /* none */ }
    setPhase(ticketRef.current ? 'check' : 'idle');
  };

  const requestAutoSend = (tk) => {
    if (!tk || !tk.lines.length) { const m = 'Nothing on the ticket yet.'; setReply(m); speak(m); return; }
    if (tk.unclear.length || tk.lines.some((l) => l.needsVariant)) { const m = 'Pick the highlighted item first, then say send.'; setReply(m); speak(m); return; }
    stopConvo();
    setPhase('check');
    setAutoSend({ left: 3 });
  };

  const handleSegment = (uri) => {
    chainRef.current = chainRef.current.then(async () => {
      if (!convoRef.current) return;
      setThinking((n) => n + 1);
      try {
        const res = await apiClient.voiceTicketConverse(rid, { audioUri: uri, mimeType: 'audio/m4a', draft: ticketRef.current });
        if (!res?.success) throw new Error(res?.error || 'Could not understand that');
        if (res.heardNothing || !convoRef.current) return;
        setError('');
        setHeard(res.transcript || '');
        const tk = applyAgent(res);
        // speak only what needs ears (answers, sending, cancelled); edits are on the ticket
        if (res.say) { setReply(res.say); if (!res.touched || res.send || res.cancel) speak(res.say); }
        if (res.send) requestAutoSend(tk);
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || 'Voice service had a problem — keep talking or tap to edit');
      } finally {
        setThinking((n) => Math.max(0, n - 1));
      }
    });
  };

  const startConvo = async () => {
    setError(''); setReply(''); setAutoSend(null);
    try {
      convoRef.current = true;
      setConvo(true); setPhase('listening');
      segRef.current = await startVoiceSegmenter({
        onSegment: handleSegment,
        onLevel: setLevel,
        onSpeaking: setHearing,
        onIdle: () => { if (convoRef.current) { stopConvo(); flash('Stopped listening — tap the mic to talk again'); } },
      });
      if (!convoRef.current && segRef.current) { segRef.current.stop().catch(() => {}); segRef.current = null; }
    } catch (e) {
      convoRef.current = false; setConvo(false); setPhase(ticketRef.current ? 'check' : 'idle');
      setError(e?.code === 'NO_MIC' ? e.message : 'Could not start the microphone');
    }
  };

  // ── edits ──
  const upd = (key, fn) => setTicket((tk) => ({ ...tk, lines: tk.lines.map((l) => (l.key === key ? fn(l) : l)) }));
  const variantsOf = (id) => { const m = menu.find((x) => x.id === id); return Array.isArray(m?.variants) ? m.variants.filter((v) => v?.name) : []; };
  const resolve = (u, opt) => {
    const item = menu.find((m) => m.id === opt.menuItemId) || {};
    const vs = variantsOf(opt.menuItemId);
    setTicket((tk) => ({
      ...tk,
      unclear: tk.unclear.filter((x) => x.key !== u.key),
      lines: [...tk.lines, { key: 'r' + Date.now(), menuItemId: opt.menuItemId, name: opt.name, price: Number(item.price) || opt.price || 0, quantity: u.quantity || 1, notes: u.notes || [], variant: null, needsVariant: vs.length > 0, variants: vs.map((v) => v.name), categoryId: item.categoryId || item.category || '' }],
    }));
  };
  const setVariant = (l, name) => {
    const v = variantsOf(l.menuItemId).find((x) => x.name === name);
    upd(l.key, (x) => ({ ...x, variant: name, needsVariant: false, price: v && Number(v.price) ? Number(v.price) : x.price }));
  };
  const addItem = (item) => {
    const vs = Array.isArray(item.variants) ? item.variants.filter((v) => v?.name) : [];
    setTicket((tk) => {
      const base = tk || { orderType: orderTypes[0] || 'dine-in', tableNumber: null, customerName: null, orderNotes: null, lines: [], unclear: [] };
      return { ...base, lines: [...base.lines, { key: 'a' + Date.now(), menuItemId: item.id, name: item.name, price: Number(item.price) || 0, quantity: 1, notes: [], variant: null, needsVariant: vs.length > 0, variants: vs.map((v) => v.name), categoryId: item.categoryId || item.category || '' }] };
    });
    setPhase('check'); setAdding(false); setSearch('');
  };
  const startOver = () => { setTicket(null); setHeard(''); setSel(null); setEditHead(false); setError(''); setConflict(null); setPhase('idle'); };

  // ── send ──
  const toItems = (tk) => tk.lines.map((l) => ({
    menuItemId: l.menuItemId, name: l.name, price: l.price, quantity: l.quantity, total: l.price * l.quantity,
    notes: l.notes.join(', '), categoryId: l.categoryId || undefined, noteLine: true,
    ...(l.variant ? { selectedVariant: { name: l.variant, price: l.price } } : {}),
  }));
  const printLines = (tk) => tk.lines.map((l) => ({ name: l.name, quantity: l.quantity, notes: l.notes.join(', '), categoryId: l.categoryId || null, selectedVariant: l.variant ? { name: l.variant, price: l.price } : null }));
  const headerOf = (tk, tableNotSetUp) => ({
    dineIn: isDineIn(tk.orderType),
    tableNumber: isDineIn(tk.orderType) ? (tk.tableNumber || '') : '',
    customerName: tk.customerName || '',
    typeLabel: typeLabel(tk.orderType),
    specialInstructions: [tableNotSetUp && tk.tableNumber ? `TABLE ${tk.tableNumber}` : '', tk.orderNotes || ''].filter(Boolean).join(' · '),
  });

  const finishSent = async (tk, orderId, order, printed, added) => {
    const dine = isDineIn(tk.orderType);
    const head = dine ? (tk.tableNumber ? `Table ${tk.tableNumber}` : 'Dine-in') : `${typeLabel(tk.orderType)}${tk.customerName ? ' · ' + tk.customerName : ''}`;
    const entry = {
      orderId, head: added ? `${head} (added)` : head, count: tk.lines.reduce((a, l) => a + l.quantity, 0),
      who: server?.name || '', at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      number: order?.dailyOrderId || order?.orderNumber || '', lines: printLines(tk), header: headerOf(tk, false),
    };
    setTickets((prev) => {
      const next = [entry, ...prev].slice(0, 80);
      AsyncStorage.setItem(todayKey(rid), JSON.stringify(next)).catch(() => {});
      return next;
    });
    setConflict(null); setPhase('sent');
    flash(printed === 'failed' ? 'Saved — but the printer did not answer. Use Reprint.' : added ? `Added to ${head} — sent to the kitchen` : `${head} sent to the kitchen`);
    setTimeout(() => { setTicket(null); setHeard(''); setSel(null); setEditHead(false); setPhase((p) => (p === 'sent' ? 'idle' : p)); }, 1500);
  };

  const ready = !!ticket && ticket.lines.length > 0 && ticket.unclear.length === 0 && !ticket.lines.some((l) => l.needsVariant);
  const canSend = ready && (phase === 'check' || (convo && phase === 'listening'));

  const send = async ({ tableNotSetUp = false, auto = false } = {}) => {
    if (!canSend && !tableNotSetUp && !(auto && ready)) return;
    if (convoRef.current) stopConvo();
    const tk = ticket;
    const dine = isDineIn(tk.orderType);
    setPhase('sending'); setError(''); setConflict(null);
    const cfg = printCfg || { printSettings: {}, printStationCount: 0, localKotPrintingOn: false };
    try {
      const claims = await voicePrintClaims(cfg, rid, { kot: true });
      const orderData = {
        restaurantId: rid,
        idempotencyKey: 'vt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        items: toItems(tk),
        orderType: tk.orderType || orderTypes[0] || 'dine-in',
        tableNumber: dine && tk.tableNumber && !tableNotSetUp ? String(tk.tableNumber) : null,
        customerInfo: { name: tk.customerName || '', tableNumber: dine ? (tk.tableNumber || null) : null },
        customerName: tk.customerName || undefined,
        staffInfo: { userId: server?.id || null, name: server?.name || '', role: server?.role || '' },
        specialInstructions: headerOf(tk, tableNotSetUp).specialInstructions,
        notes: 'Voice order',
        paymentMethod: 'cash',
        status: 'confirmed',
        ...claims,
      };
      const res = await apiClient.createOrder(orderData);
      const order = res?.order || res?.data || null;
      const orderId = order?.id || res?.orderId;
      if (!orderId) throw new Error(res?.error || 'Order was not saved');
      const printed = await printVoiceKOT({ cfg, restaurantId: rid, restaurantName, orderId, order, lines: printLines(tk), header: headerOf(tk, tableNotSetUp), waiter: server, claims });
      if (settings?.afterSend === 'mark_served') { try { await apiClient.request(`/api/kot/${orderId}/status`, { method: 'PATCH', data: { status: 'served' } }); } catch { /* stays open */ } }
      finishSent(tk, orderId, order, printed, false);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || '';
      if (dine && tk.tableNumber && !tableNotSetUp && /occupied|already/i.test(msg)) {
        try {
          const open = await apiClient.getOpenOrders(rid);
          const hit = (open?.openOrders || []).find((o) => String(o.tableNumber || '') === String(tk.tableNumber) && !['completed', 'cancelled'].includes(o.status));
          if (hit) {
            const conf = { orderId: hit.id, table: tk.tableNumber };
            if (auto) { setPhase('check'); await addToOpenOrder(conf); return; } // spoken order for a busy table → add to it
            setConflict(conf); setPhase('check'); return;
          }
        } catch { /* plain message */ }
      }
      if (dine && tk.tableNumber && !tableNotSetUp && /not found/i.test(msg)) { setConflict({ missing: true, table: tk.tableNumber }); setPhase('check'); return; }
      setError(msg || 'Could not send — nothing was printed. Please try again.');
      setPhase('check');
    }
  };

  // Same item already on the open order (same item / size / options, no kitchen note of its own) →
  // raise that line's quantity, like the order screen does, so the server marks it "updated +N" and a
  // desktop hand-back prints the extra too. Lines with a note stay separate (noteLine).
  const mergeIntoOpenOrder = (existingItems, newItems) => {
    const merged = (existingItems || []).map((it) => ({ ...it }));
    // same dish (item / size / options / seat) AND the same kitchen notes — a plain burger never joins
    // "burger, no lettuce"; an existing POS line (no noteLine flag) still counts as the same dish.
    const dish = (it) => getOrderItemKey({ ...it, noteLine: false });
    const notesOf = (it) => (Array.isArray(it.notes) ? it.notes.join(',') : String(it.notes || '')).toLowerCase().split(',').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).sort().join(',');
    for (const it of newItems) {
      const idx = merged.findIndex((x) => dish(x) === dish(it) && notesOf(x) === notesOf(it));
      if (idx >= 0) {
        const q = (Number(merged[idx].quantity) || 0) + (Number(it.quantity) || 0);
        merged[idx] = { ...merged[idx], quantity: q, total: (Number(merged[idx].price) || 0) * q };
      } else {
        merged.push(it);
      }
    }
    return merged;
  };

  const addToOpenOrder = async (conf = conflict) => {
    if (!conf || !ticket) return;
    const tk = ticket;
    setPhase('sending'); setError('');
    try {
      const full = await apiClient.request(`/api/orders/single/${conf.orderId}`);
      const existing = full?.order || (Array.isArray(full?.orders) ? full.orders[0] : null) || full?.data || null;
      if (!existing?.id || ['completed', 'cancelled', 'paid', 'settled'].includes(existing.status)) throw new Error('That order is already closed — send this as a new order');
      const res = await apiClient.updateOrder(existing.id, {
        restaurantId: rid,
        items: mergeIntoOpenOrder(existing.items, toItems(tk)),
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: { name: server?.name || 'Staff Member', id: server?.id || 'unknown' },
      });
      if (res && res.success === false) throw new Error(res.error || 'Could not add to the order');
      const cfg = printCfg || { printSettings: {}, printStationCount: 0, localKotPrintingOn: false };
      const printed = await printVoiceKOT({ cfg, restaurantId: rid, restaurantName, orderId: existing.id, order: existing, lines: printLines(tk), header: headerOf(tk, false), waiter: server, isIncremental: true });
      finishSent(tk, existing.id, existing, printed, true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not add to the open order');
      setPhase('check');
    }
  };

  const reprint = async (entry) => {
    const cfg = printCfg || { printSettings: {}, printStationCount: 0, localKotPrintingOn: false };
    const r = await printVoiceKOT({ cfg, restaurantId: rid, restaurantName, orderId: entry.orderId, order: { dailyOrderId: entry.number }, lines: entry.lines || [], header: { ...(entry.header || {}), specialInstructions: [entry.header?.specialInstructions, '*** REPRINT ***'].filter(Boolean).join(' · ') }, waiter: server });
    flash(r === 'failed' ? 'Reprint failed — check the printer' : `Reprinting ${entry.head}`);
  };

  // "That's it" → 3 s to Undo, then the normal send (a busy table gets the items added)
  useEffect(() => {
    if (!autoSend) return undefined;
    if (autoSend.left <= 0) { setAutoSend(null); send({ auto: true }); return undefined; }
    const t = setTimeout(() => setAutoSend((a) => (a ? { left: a.left - 1 } : a)), 1000);
    return () => clearTimeout(t);
  }, [autoSend]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived ──
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? menu.filter((m) => m.name.toLowerCase().includes(q) || String(m.shortCode || '').toLowerCase() === q) : menu).slice(0, 30);
  }, [menu, search]);
  const itemCount = ticket ? ticket.lines.reduce((a, l) => a + l.quantity, 0) : 0;
  const needs = ticket ? ticket.unclear.length + ticket.lines.filter((l) => l.needsVariant).length : 0;
  const headText = ticket
    ? (isDineIn(ticket.orderType) ? (ticket.tableNumber ? `TABLE ${ticket.tableNumber}` : 'DINE-IN') : `${typeLabel(ticket.orderType).toUpperCase()}${ticket.customerName ? ' · ' + ticket.customerName.toUpperCase() : ''}`)
    : 'NEW ORDER';
  const handsFree = settings?.handsFree !== false;
  let status = { tone: 'muted', title: 'Ready', text: handsFree ? 'Tap the mic and just talk — say “that’s it” to send' : 'Tap the mic and say the whole order' };
  if (autoSend) status = { tone: 'ok', title: `Sending in ${autoSend.left}`, text: 'Tap Undo to keep editing' };
  else if (convo) status = { tone: 'live', title: hearing ? 'Hearing you' : thinking ? 'Got it…' : 'Listening', text: 'Talk naturally · ask anything · say “that’s it” to send' };
  else if (phase === 'listening') status = { tone: 'live', title: `Listening · 0:${String(secs).padStart(2, '0')}`, text: 'Tap again when you’re done' };
  else if (phase === 'thinking') status = { tone: 'muted', title: 'Building the ticket', text: 'Matching what you said to the menu…' };
  else if (phase === 'sending') status = { tone: 'muted', title: 'Sending', text: 'Placing the order and printing…' };
  else if (phase === 'sent') status = { tone: 'ok', title: 'Sent', text: 'Printed in the kitchen' };
  else if (phase === 'check' && needs) status = { tone: 'warn', title: needs === 1 ? 'Check 1 item' : `Check ${needs} items`, text: 'Pick the right choice, then send' };
  else if (phase === 'check') status = { tone: 'ok', title: 'Ready to send', text: 'Tap a line to change it' };
  const toneColor = { muted: '#5B5B63', live: RED, ok: '#0F7A43', warn: '#B45309' }[status.tone];

  if (loadError) return <SafeAreaView style={st.center}><Text style={st.muted}>{loadError}</Text></SafeAreaView>;
  if (!settings) return <SafeAreaView style={st.center}><ActivityIndicator color={RED} /></SafeAreaView>;
  if (!settings.enabled) {
    return (
      <SafeAreaView style={st.center}>
        <Text style={st.h1}>Voice Ticket is off</Text>
        <Text style={[st.muted, { textAlign: 'center', marginTop: 8, maxWidth: 360 }]}>The owner can turn it on in Admin → Settings → Voice Ticket.</Text>
        <Pressable style={[st.btnDark, { marginTop: 16 }]} onPress={() => router.back()}><Text style={st.btnDarkT}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }

  const listening = phase === 'listening';
  const busy = phase === 'thinking' || phase === 'sending';

  const TicketPaper = (
    <View style={st.paper}>
      <Text style={st.sub}>KITCHEN TICKET</Text>
      <Pressable disabled={!ticket} onPress={() => setEditHead((v) => !v)} accessibilityRole="button" accessibilityLabel="Change table or name">
        <Text style={[st.head, !ticket && { color: '#C9C9C9' }]}>{headText}</Text>
      </Pressable>
      {editHead && ticket && (
        <View style={st.headEdit}>
          <View style={st.seg}>
            {orderTypes.slice(0, 4).map((ot) => (
              <Pressable key={ot} onPress={() => setTicket((tk) => ({ ...tk, orderType: ot }))} style={[st.segB, ticket.orderType === ot && st.segOn]}>
                <Text style={[st.segT, ticket.orderType === ot && { color: INK }]}>{typeLabel(ot)}</Text>
              </Pressable>
            ))}
          </View>
          {isDineIn(ticket.orderType)
            ? <TextInput style={st.input} placeholder="Table" keyboardType="number-pad" value={ticket.tableNumber || ''} onChangeText={(v) => setTicket((tk) => ({ ...tk, tableNumber: v.slice(0, 20) }))} />
            : <TextInput style={st.input} placeholder="Name" value={ticket.customerName || ''} onChangeText={(v) => setTicket((tk) => ({ ...tk, customerName: v.slice(0, 60) }))} />}
          <Pressable style={st.btnDark} onPress={() => setEditHead(false)}><Text style={st.btnDarkT}>Done</Text></Pressable>
        </View>
      )}
      <View style={st.meta}><Text style={st.metaT}>{server?.name ? `Server: ${server.name.split(' ')[0]}` : ''}</Text><Text style={st.metaT}>{itemCount ? `${itemCount} ITEM${itemCount === 1 ? '' : 'S'}` : ''}</Text></View>
      <View style={st.rule} />

      {!ticket && phase !== 'thinking' && <Text style={st.empty}>Tap the mic and say the order — table or to-go name first, then each item and any changes.</Text>}
      {phase === 'thinking' && !ticket && <View style={st.emptyRow}><ActivityIndicator color={RED} /><Text style={st.muted}>  Building the ticket…</Text></View>}

      {ticket && ticket.lines.map((l) => (
        <View key={l.key} style={[st.line, sel === l.key && st.lineSel]}>
          <Pressable onPress={() => { setSel(sel === l.key ? null : l.key); setNoteDraft(''); }} style={st.lineBtn} accessibilityLabel={`Change ${l.name}`}>
            <Text style={st.q}>{l.quantity}</Text>
            <Text style={st.name}>{l.name.toUpperCase()}{l.variant ? ` (${l.variant.toUpperCase()})` : ''}</Text>
          </Pressable>
          {l.notes.map((n, k) => (
            <Text key={k} style={[st.note, /^(no|hold|without)\b/i.test(n) ? { color: '#B42318' } : /^(extra|add|with)\b/i.test(n) ? { color: '#0F7A43' } : null]}>** {n.toUpperCase()}</Text>
          ))}
          {l.needsVariant && (
            <View style={st.pick}><Text style={st.pickT}>Which size?</Text><View style={st.wrap}>{l.variants.map((v) => <Pressable key={v} style={st.pickB} onPress={() => setVariant(l, v)}><Text style={st.pickBT}>{v}</Text></Pressable>)}</View></View>
          )}
          {sel === l.key && (
            <View style={st.edit}>
              <View style={st.wrap}>
                <Pressable style={st.step} onPress={() => upd(l.key, (x) => ({ ...x, quantity: Math.max(1, x.quantity - 1) }))} accessibilityLabel="One less"><Ionicons name="remove" size={20} color={INK} /></Pressable>
                <Pressable style={st.step} onPress={() => upd(l.key, (x) => ({ ...x, quantity: x.quantity + 1 }))} accessibilityLabel="One more"><Ionicons name="add" size={20} color={INK} /></Pressable>
                <Pressable style={st.step} onPress={() => { setTicket((tk) => ({ ...tk, lines: tk.lines.filter((x) => x.key !== l.key) })); setSel(null); }}><Text style={{ color: '#B42318', fontWeight: '600' }}>Remove</Text></Pressable>
                <Pressable style={[st.step, { backgroundColor: INK, borderColor: INK, marginLeft: 'auto' }]} onPress={() => setSel(null)}><Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text></Pressable>
              </View>
              {l.notes.length > 0 && <View style={st.wrap}>{l.notes.map((n, k) => <Pressable key={k} style={st.chip} onPress={() => upd(l.key, (x) => ({ ...x, notes: x.notes.filter((_, j) => j !== k) }))}><Text style={st.chipT}>{n} ✕</Text></Pressable>)}</View>}
              <View style={st.wrap}>
                <TextInput style={[st.input, { flex: 1 }]} placeholder="Add a note, e.g. No onion" value={noteDraft} onChangeText={setNoteDraft} onSubmitEditing={() => { const n = noteDraft.trim(); if (n) { upd(l.key, (x) => ({ ...x, notes: [...x.notes, n.slice(0, 80)] })); setNoteDraft(''); } }} returnKeyType="done" />
              </View>
            </View>
          )}
        </View>
      ))}

      {ticket && ticket.unclear.map((u) => (
        <View key={u.key} style={st.unclear}>
          <Text style={st.pickT}>{u.reason === 'sold_out' ? `${u.heard} is sold out.` : `Heard “${u.heard}”.`} {u.options.length ? 'Which one?' : 'Not on the menu.'}{u.quantity > 1 ? ` (×${u.quantity})` : ''}</Text>
          <View style={st.wrap}>
            {u.options.map((o) => <Pressable key={o.menuItemId} style={st.pickB} onPress={() => resolve(u, o)}><Text style={st.pickBT}>{o.name}</Text></Pressable>)}
            <Pressable style={[st.pickB, st.pickGhost]} onPress={() => { setTicket((tk) => ({ ...tk, unclear: tk.unclear.filter((x) => x.key !== u.key) })); setSearch(u.heard); setAdding(true); }}><Text style={st.pickBT}>Search menu</Text></Pressable>
            <Pressable style={[st.pickB, st.pickGhost]} onPress={() => setTicket((tk) => ({ ...tk, unclear: tk.unclear.filter((x) => x.key !== u.key) }))}><Text style={st.pickBT}>Remove</Text></Pressable>
          </View>
        </View>
      ))}

      <View style={st.rule} />
      <View style={st.foot}>
        <Pressable onPress={() => setAdding(true)} hitSlop={8}><Text style={st.link}>+ Add item</Text></Pressable>
        {ticket ? <Pressable onPress={startOver} hitSlop={8}><Text style={st.link}>Start over</Text></Pressable> : null}
      </View>
    </View>
  );

  const TodayList = (
    <View style={st.today}>
      <View style={st.todayH}><Text style={st.todayHT}>Today</Text><Text style={st.muted}>{tickets.length} tickets</Text></View>
      {!tickets.length && <Text style={st.muted}>Sent tickets show here for reprint.</Text>}
      {tickets.map((e, i) => (
        <View key={e.orderId + '_' + i} style={st.tk}>
          <View style={{ flex: 1 }}><Text style={st.tkH}>{e.head}</Text><Text style={st.tkM}>{[e.number && `#${e.number}`, e.who, `${e.count} items`, e.at].filter(Boolean).join(' · ')}</Text></View>
          <Pressable style={st.tkB} onPress={() => reprint(e)} accessibilityLabel={`Reprint ${e.head}`}><Ionicons name="print-outline" size={20} color={INK} /></Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={st.wrapAll} edges={['top', 'left', 'right']}>
      <View style={st.top}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color={INK} /></Pressable>
        <View style={st.mark}><Ionicons name="mic" size={16} color="#fff" /></View>
        <Text style={st.title}>Voice Ticket</Text>
        <View style={{ flex: 1 }} />
        {!isTablet && <Pressable style={st.todayBtn} onPress={() => setShowToday(true)}><Text style={st.todayBtnT}>Today · {tickets.length}</Text></Pressable>}
      </View>
      {settings.askServer && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.servers}>
          <Text style={st.muted}>Taken by  </Text>
          {[server, ...staff.filter((s) => s.id !== server?.id)].filter(Boolean).slice(0, 10).map((s) => (
            <Pressable key={s.id || s.name} style={[st.srv, server?.id === s.id && server?.name === s.name && st.srvOn]} onPress={() => setServer(s)}>
              <Text style={[st.srvT, server?.id === s.id && server?.name === s.name && { color: '#fff' }]}>{s.name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[st.body, isTablet && { flexDirection: 'row' }]}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={st.stage} keyboardShouldPersistTaps="handled">
            {TicketPaper}
            {heard ? <Text style={st.heard}>Heard: “{heard}”</Text> : null}
          </ScrollView>
          {isTablet && <ScrollView style={{ width: 300, flexGrow: 0 }} contentContainerStyle={{ padding: 16 }}>{TodayList}</ScrollView>}
        </View>

        {conflict && (
          <View style={st.conflict}>
            <Text style={st.pickT}>{conflict.missing ? `Table ${conflict.table} isn't set up in DineOpen. Send it with “Table ${conflict.table}” on the kitchen ticket?` : `Table ${conflict.table} already has an open order. Add these items to it? The kitchen gets only the new items.`}</Text>
            <View style={st.wrap}>
              <Pressable style={[st.step, { backgroundColor: INK, borderColor: INK }]} disabled={phase === 'sending'} onPress={() => (conflict.missing ? send({ tableNotSetUp: true }) : addToOpenOrder())}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{conflict.missing ? `Send with Table ${conflict.table}` : `Add to Table ${conflict.table}'s order`}</Text>
              </Pressable>
              <Pressable style={st.step} onPress={() => { setConflict(null); if (conflict.missing) setEditHead(true); }}><Text style={{ fontWeight: '600' }}>{conflict.missing ? 'Change table' : 'Cancel'}</Text></Pressable>
            </View>
          </View>
        )}

        <View style={[st.bar, !isTablet && { flexWrap: 'wrap' }]}>
          {handsFree ? (
            <Pressable style={[st.mic, convo && st.micLive, convo && hearing && st.micHearing, (phase === 'sending' || autoSend) && { opacity: 0.5 }]} disabled={phase === 'sending' || !!autoSend} onPress={convo ? stopConvo : startConvo} accessibilityRole="button" accessibilityLabel={convo ? 'Stop listening' : 'Start talking'}>
              <Ionicons name={convo ? 'stop' : 'mic'} size={convo ? 26 : 32} color="#fff" />
            </Pressable>
          ) : (
            <Pressable style={[st.mic, listening && st.micLive, busy && { opacity: 0.5 }]} disabled={busy} onPress={listening ? stopListening : startListening} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Start speaking'}>
              <Ionicons name={listening ? 'stop' : 'mic'} size={listening ? 26 : 32} color="#fff" />
            </Pressable>
          )}
          <View style={st.status}>
            {(listening || convo) && <View style={[st.levelBar, { width: 6 + level * 40 }, convo && !hearing && { backgroundColor: '#C9C8C4' }]} />}
            {(busy || (convo && thinking > 0)) && <ActivityIndicator color={RED} />}
            <View style={{ flex: 1 }}>
              <Text style={[st.stT, { color: error ? '#B42318' : toneColor }]}>{error ? 'PROBLEM' : status.title.toUpperCase()}</Text>
              <Text style={[st.stX, error && { color: '#B42318', fontWeight: '600' }]} numberOfLines={2}>{error || status.text}</Text>
            </View>
          </View>
          {autoSend ? (
            <Pressable style={[st.send, { backgroundColor: '#0F7A43' }, !isTablet && { flexBasis: '100%' }]} onPress={() => { setAutoSend(null); flash('Not sent — keep editing'); }} accessibilityRole="button">
              <Text style={st.sendT}>Undo  ·  {autoSend.left}</Text>
            </Pressable>
          ) : (
            <Pressable style={[st.send, !canSend && st.sendOff, !isTablet && { flexBasis: '100%' }]} disabled={!canSend} onPress={() => send()}>
              <Text style={[st.sendT, !canSend && { color: '#8A8A90' }]}>Send to kitchen{itemCount ? `  ·  ${itemCount}` : ''}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={adding} animationType="slide" transparent onRequestClose={() => setAdding(false)}>
        <View style={st.sheetBg}>
          <View style={st.sheet}>
            <View style={st.todayH}><Text style={st.todayHT}>Add item</Text><Pressable onPress={() => setAdding(false)} hitSlop={10}><Ionicons name="close" size={24} color={INK} /></Pressable></View>
            <TextInput style={st.input} autoFocus placeholder="Search the menu" value={search} onChangeText={setSearch} />
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {results.map((m) => <Pressable key={m.id} style={st.result} onPress={() => addItem(m)}><Text style={st.resultT}>{m.name}</Text></Pressable>)}
              {!results.length && <Text style={st.muted}>No match</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={showToday} animationType="slide" transparent onRequestClose={() => setShowToday(false)}>
        <View style={st.sheetBg}>
          <View style={st.sheet}>
            <View style={st.todayH}><Text style={st.todayHT}> </Text><Pressable onPress={() => setShowToday(false)} hitSlop={10}><Ionicons name="close" size={24} color={INK} /></Pressable></View>
            <ScrollView style={{ maxHeight: 460 }}>{TodayList}</ScrollView>
          </View>
        </View>
      </Modal>
      {reply && (convo || autoSend || phase === 'check') ? (
        <View style={[st.reply, { bottom: isTablet ? 112 : 196 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <View style={st.replyDot}><Ionicons name="mic" size={12} color="#fff" /></View>
          <Text style={st.replyT}>{reply}</Text>
        </View>
      ) : null}
      {toast ? <View style={st.toast} pointerEvents="none"><Text style={st.toastT}>{toast}</Text></View> : null}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrapAll: { flex: 1, backgroundColor: '#EEEDEA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEEDEA', padding: 24 },
  h1: { fontSize: 24, fontWeight: '700', color: INK },
  muted: { color: '#5B5B63', fontSize: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  mark: { width: 30, height: 30, borderRadius: 9, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '700', color: INK },
  todayBtn: { height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', justifyContent: 'center' },
  todayBtnT: { fontWeight: '600', color: INK },
  servers: { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 8 },
  srv: { height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#fff', justifyContent: 'center', borderWidth: 1, borderColor: '#E4E3DF' },
  srvOn: { backgroundColor: INK, borderColor: INK },
  srvT: { fontWeight: '600', color: INK },
  body: { flex: 1 },
  stage: { padding: 14, alignItems: 'center', gap: 10 },
  paper: { width: '100%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 4, padding: 18, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  sub: { textAlign: 'center', fontFamily: MONO, fontSize: 12, fontWeight: '600', letterSpacing: 1, color: '#555' },
  head: { textAlign: 'center', fontFamily: MONO, fontSize: 26, fontWeight: '700', color: '#111', marginVertical: 6 },
  headEdit: { gap: 10, padding: 12, backgroundColor: '#F7F7F5', borderRadius: 12, marginBottom: 8 },
  seg: { flexDirection: 'row', backgroundColor: '#E9E8E4', borderRadius: 999, padding: 4 },
  segB: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#fff' },
  segT: { fontWeight: '600', color: '#555' },
  input: { minHeight: 46, borderWidth: 1, borderColor: '#D6D6D2', borderRadius: 10, paddingHorizontal: 12, fontSize: 16, backgroundColor: '#fff', color: INK },
  meta: { flexDirection: 'row', justifyContent: 'space-between' },
  metaT: { fontFamily: MONO, fontSize: 13, color: '#111' },
  rule: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: '#111', marginVertical: 10 },
  empty: { textAlign: 'center', color: '#777', fontSize: 15, paddingVertical: 30, paddingHorizontal: 8 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 30 },
  line: { borderRadius: 10, marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 2 },
  lineSel: { backgroundColor: '#F7F7F5', borderWidth: 2, borderColor: '#111' },
  lineBtn: { flexDirection: 'row', gap: 12, minHeight: 44, alignItems: 'center' },
  q: { fontFamily: MONO, fontSize: 19, fontWeight: '700', color: '#111', minWidth: 22 },
  name: { fontFamily: MONO, fontSize: 18, fontWeight: '700', color: '#111', flex: 1 },
  note: { fontFamily: MONO, fontSize: 15, fontWeight: '700', color: '#2D31A6', marginLeft: 34, marginBottom: 4 },
  pick: { backgroundColor: '#FFF6E0', borderWidth: 2, borderColor: '#E8A317', borderRadius: 10, padding: 10, marginLeft: 26, marginVertical: 4, gap: 8 },
  unclear: { backgroundColor: '#FFF6E0', borderWidth: 2, borderColor: '#E8A317', borderRadius: 10, padding: 10, marginVertical: 6, gap: 8 },
  pickT: { fontSize: 15, fontWeight: '600', color: '#7A3E06' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  pickB: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 2, borderColor: '#C4790A', backgroundColor: '#fff', justifyContent: 'center' },
  pickGhost: { borderColor: '#E3CFA5' },
  pickBT: { fontSize: 15, fontWeight: '600', color: '#7A3E06' },
  edit: { gap: 8, paddingLeft: 34, paddingVertical: 8 },
  step: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#D6D6D2', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#F4F4F2', justifyContent: 'center' },
  chipT: { fontSize: 13, color: INK },
  foot: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { fontSize: 15, fontWeight: '600', color: '#111', textDecorationLine: 'underline', paddingVertical: 10 },
  heard: { color: '#5B5B63', fontSize: 14, textAlign: 'center', maxWidth: 460 },
  today: { gap: 8 },
  todayH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  todayHT: { fontSize: 18, fontWeight: '700', color: INK },
  tk: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E4E3DF', padding: 10 },
  tkH: { fontWeight: '600', fontSize: 15, color: INK },
  tkM: { fontSize: 12, color: '#5B5B63', marginTop: 2 },
  tkB: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#F4F4F2', alignItems: 'center', justifyContent: 'center' },
  conflict: { marginHorizontal: 14, marginBottom: 8, backgroundColor: '#FFF6E0', borderWidth: 2, borderColor: '#E8A317', borderRadius: 14, padding: 12, gap: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 14, backgroundColor: '#EEEDEA', borderTopWidth: 1, borderColor: '#E4E3DF' },
  mic: { width: 72, height: 72, borderRadius: 36, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: RED, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  micLive: { backgroundColor: INK },
  micHearing: { backgroundColor: RED, shadowOpacity: 0.6, shadowRadius: 16 },
  reply: { position: 'absolute', alignSelf: 'center', bottom: 170, maxWidth: 520, marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E4E3DF', paddingHorizontal: 14, paddingVertical: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  replyDot: { width: 22, height: 22, borderRadius: 7, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  replyT: { flexShrink: 1, fontSize: 15, color: INK },
  status: { flex: 1, minHeight: 72, borderRadius: 18, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelBar: { height: 8, borderRadius: 4, backgroundColor: RED },
  stT: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  stX: { fontSize: 15, color: INK },
  send: { height: 64, flexBasis: 240, flexGrow: 0, borderRadius: 18, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sendOff: { backgroundColor: '#DCDBD7' },
  sendT: { color: '#fff', fontSize: 18, fontWeight: '600' },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 10, paddingBottom: 30 },
  result: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: '#F0EFEC' },
  resultT: { fontSize: 16, color: INK },
  toast: { position: 'absolute', alignSelf: 'center', bottom: 150, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12 },
  toastT: { color: '#fff', fontSize: 15, fontWeight: '500' },
  btnDark: { minHeight: 46, paddingHorizontal: 20, borderRadius: 12, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' },
  btnDarkT: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
