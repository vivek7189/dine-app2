// Voice Ticket (phone / tablet) — the server speaks an order, checks a kitchen ticket, sends it.
// Same flow as the web/desktop page (/voice): record → POST /api/voice-ticket/:rid/understand →
// check / fix the ticket → place the order (normal POST /api/orders) → print the KOT with the same
// print rules as the order screen (services/voiceTicketPrint.js). Off unless the owner turned on
// posSettings.voiceTicket.enabled.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Modal, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import apiClient from '../services/api';
import { getOrderItemKey } from '../utils/orderItemKey';
import { useResponsive } from '../hooks/useResponsive';
import { loadVoicePrintConfig, voicePrintClaims, printVoiceKOT } from '../services/voiceTicketPrint';
import { startVoiceSegmenter } from '../services/voiceSegmenter';
import { formatCurrency } from '../utils/formatCurrency';
import restaurantEvents from '../services/restaurantEvents';

// Spoken answers (Admin → Voice Ticket → Answers: speak). Optional native module: builds without it
// (older App Store / APK builds) simply show the answer on screen.
let Speech = null;
try { Speech = require('expo-speech'); if (!Speech || typeof Speech.speak !== 'function') Speech = null; } catch (_) { Speech = null; }

const RED = '#D92D20';
const DEEP = '#9F1F14';
const SOFT = '#FDE8E5';
const LINE = '#E9DDD8';
const BG = '#F7F2F0';
const CARD = '#FFFFFF';
const MUTED = '#78716C';
const ERR = '#B42318';
const WARN = '#D97706';
const OK = '#0F7A43';
const INK = '#1C1917';
const MAX_SECONDS = 60;
const isDineIn = (t) => /dine|table/i.test(String(t || ''));
const typeLabel = (t) => (isDineIn(t) ? 'Dine-in' : /deliver/i.test(String(t || '')) ? 'Delivery' : 'To-go');
const todayKey = (rid) => `vt:tickets:${rid}:${new Date().toISOString().slice(0, 10)}`;

export default function VoiceTicketNative() {
  const router = useRouter();
  const { isTablet, r: rs } = useResponsive();
  const insets = useSafeAreaInsets();
  // same height as the bottom tab bar (app/(tabs)/_layout.js) — the dock sits above it when Voice is a tab
  const tabBarH = rs(64, 74) + (Platform.OS === 'android' ? Math.max(insets.bottom, 24) : insets.bottom);
  const [tabMode, setTabMode] = useState(false); // posSettings.voiceTicket.showTab → Voice is a bottom tab
  const [sheet, setSheet] = useState(null); // 'table' | 'server'
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
  const [log, setLog] = useState([]); // what was said / done / answered
  const [floor, setFloor] = useState([]); // [{ n, busy }]
  const logScroll = useRef(null);
  const pushLog = useCallback((kind, text) => {
    if (!text) return;
    setLog((l) => [...l, { id: Date.now() + Math.random(), kind, text: String(text).slice(0, 240) }].slice(-24));
  }, []);
  const loadFloor = useCallback(async () => {
    if (!rid) return;
    try {
      const res = await apiClient.getFloors(rid);
      const list = [];
      (res?.floors || (Array.isArray(res) ? res : [])).forEach((f) => (f.tables || []).forEach((t) => {
        const n = t.number ?? t.tableNumber ?? t.name;
        if (n != null && String(n).trim()) list.push({ n: String(n).trim(), busy: t.status === 'occupied' || !!t.currentOrderId });
      }));
      list.sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true }));
      setFloor(list.slice(0, 60));
    } catch (_) { /* chips are a convenience */ }
  }, [rid]);
  useEffect(() => {
    loadFloor();
    const t = setInterval(loadFloor, 30000);
    return () => clearInterval(t);
  }, [loadFloor]);
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
        setTabMode(user?.restaurant?.posSettings?.voiceTicket?.showTab === true);
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

  // owner changed Voice settings on the web → pick them up when the app refreshes settings
  useEffect(() => restaurantEvents.on('settings', ({ posSettings } = {}) => {
    const v = posSettings && posSettings.voiceTicket;
    if (!v) return;
    setTabMode(v.showTab === true);
    setSettings((cur) => (cur ? { ...cur, enabled: v.enabled === true, askServer: v.askServer === true, handsFree: v.handsFree !== false, replies: ['text', 'voice', 'off'].includes(v.replies) ? v.replies : 'text', afterSend: v.afterSend === 'mark_served' ? 'mark_served' : 'keep_open' } : cur));
  }), []);

  // ── understand ──
  const understand = useCallback(async (payload) => {
    setPhase('thinking'); setError('');
    try {
      const res = await apiClient.voiceTicketUnderstand(rid, payload);
      if (!res?.success) throw new Error(res?.error || 'Could not build the ticket');
      setHeard(res.transcript || '');
      pushLog('you', `“${res.transcript || ''}”`);
      pushLog('did', `${res.ticket.lines.length ? `Added ${res.ticket.lines.reduce((a, l) => a + l.quantity, 0)} item(s)` : 'Nothing added'}${res.ticket.unclear.length ? ` · ${res.ticket.unclear.length} to check` : ''}`);
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
  }, [rid, ticket, pushLog]);

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
    pushLog('say', 'Sending to the kitchen — tap Undo to keep editing');
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
        pushLog('you', `“${res.transcript}”`);
        const tk = applyAgent(res);
        if (res.touched || res.cancel) pushLog('did', res.say || (res.cancel ? 'Cleared the ticket' : 'Updated the ticket'));
        else if (res.say) pushLog('say', res.say);
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
  const startOver = () => { setTicket(null); setHeard(''); setSel(null); setEditHead(false); setError(''); setConflict(null); setPhase('idle'); setLog([]); };

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
    loadFloor();
    setTimeout(() => { setTicket(null); setHeard(''); setSel(null); setEditHead(false); setLog([]); setPhase((p) => (p === 'sent' ? 'idle' : p)); }, 1500);
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
  const handsFree = settings?.handsFree !== false;
  let status = { tone: 'muted', title: handsFree ? 'Tap and just talk' : 'Tap and say the order', text: handsFree ? 'Table or to-go name, then the items · say “that’s it” to send' : 'Table or to-go name, then each item · tap again when done' };
  if (autoSend) status = { tone: 'ok', title: `Sending in ${autoSend.left}`, text: 'Tap Undo to keep editing' };
  else if (convo) status = { tone: 'live', title: hearing ? 'Hearing you' : thinking ? 'Got it…' : 'Listening', text: 'Talk naturally · ask anything · say “that’s it” to send' };
  else if (phase === 'listening') status = { tone: 'live', title: `Listening · 0:${String(secs).padStart(2, '0')}`, text: 'Tap again when you’re done' };
  else if (phase === 'thinking') status = { tone: 'muted', title: 'Building the ticket', text: 'Matching what you said to the menu…' };
  else if (phase === 'sending') status = { tone: 'muted', title: 'Sending', text: 'Placing the order and printing…' };
  else if (phase === 'sent') status = { tone: 'ok', title: 'Sent', text: 'Printed in the kitchen' };
  else if (phase === 'check' && needs) status = { tone: 'warn', title: needs === 1 ? 'Check 1 item' : `Check ${needs} items`, text: 'Pick the right choice, then send' };
  else if (phase === 'check') status = { tone: 'ok', title: 'Ready to send', text: 'Tap a line to change it' };

  if (loadError) {
    return (
      <SafeAreaView style={st.center}>
        <Ionicons name="cloud-offline-outline" size={40} color={MUTED} />
        <Text style={[st.muted, { marginTop: 10, textAlign: 'center' }]}>{loadError}</Text>
      </SafeAreaView>
    );
  }
  if (!settings) return <SafeAreaView style={st.center}><ActivityIndicator color={RED} /></SafeAreaView>;
  if (!settings.enabled) {
    return (
      <SafeAreaView style={st.center}>
        <View style={st.offIcon}><Ionicons name="mic-off-outline" size={30} color={RED} /></View>
        <Text style={st.h1}>Voice orders are off</Text>
        <Text style={[st.muted, { textAlign: 'center', marginTop: 8, maxWidth: 340, lineHeight: 20 }]}>The owner can turn them on in Admin → Settings → Voice Ticket.</Text>
        {!tabMode && <Pressable style={[st.wideBtn, { marginTop: 20, alignSelf: 'center', paddingHorizontal: 28 }]} onPress={() => router.back()}><Text style={st.wideBtnT}>Back</Text></Pressable>}
      </SafeAreaView>
    );
  }

  const listening = phase === 'listening';
  const busy = phase === 'thinking' || phase === 'sending';
  const orbLive = convo || listening;
  // the dock sits above the bottom tab bar when Voice is a tab, else above the home indicator
  const dockBottom = tabMode ? tabBarH + 10 : Math.max(insets.bottom, 12) + 6;
  const total = ticket ? ticket.lines.reduce((a, l) => a + (Number(l.price) || 0) * l.quantity, 0) : 0;
  const curType = (ticket && ticket.orderType) || orderTypes[0] || 'dine-in';
  const dine = isDineIn(curType);
  const hasHead = !!(ticket && (ticket.tableNumber || ticket.customerName));
  const where = !ticket ? (dine ? 'Choose table' : typeLabel(curType))
    : dine ? (ticket.tableNumber ? `Table ${ticket.tableNumber}` : 'Choose table')
      : `${typeLabel(curType)}${ticket.customerName ? ' · ' + ticket.customerName : ''}`;
  const blankTicket = () => ({ orderType: orderTypes[0] || 'dine-in', tableNumber: null, customerName: null, orderNotes: null, lines: [], unclear: [] });
  const setHead = (patch) => setTicket((tk) => ({ ...(tk || blankTicket()), ...patch }));
  const lastYou = [...log].reverse().find((t) => t.kind === 'you');
  const lastAi = [...log].reverse().find((t) => t.kind !== 'you');
  const hasLines = !!(ticket && (ticket.lines.length || ticket.unclear.length));
  const examples = [
    ['Order', 'Table five, two cheeseburgers, one no onion, and a Coke'],
    ['Change', 'Make it two Cokes, no ice'],
    ['Ask', 'What’s on table twelve, and the bill?'],
    ['Send', handsFree ? 'That’s it' : 'Tap Send when it looks right'],
  ];
  const dotColor = error ? ERR : autoSend || phase === 'sent' || status.tone === 'ok' ? OK : status.tone === 'warn' ? WARN : orbLive ? RED : '#C9C2BE';
  const closeSheet = () => setSheet(null);
  const undoSend = () => { setAutoSend(null); flash('Not sent — keep editing'); pushLog('say', 'Not sent — keep editing'); };

  const Orb = (big) => {
    const size = big ? 128 : 76;
    const live = handsFree ? convo : listening;
    const onPress = handsFree ? (convo ? stopConvo : startConvo) : (listening ? stopListening : startListening);
    const disabled = handsFree ? (phase === 'sending' || !!autoSend) : busy;
    return (
      <View style={[st.ring, { width: size + 22, height: size + 22, borderRadius: (size + 22) / 2 }, live && st.ringLive]}>
        <Pressable
          style={({ pressed }) => [st.orb, { width: size, height: size, borderRadius: size / 2 }, autoSend && { backgroundColor: OK }, disabled && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.96 }] }]}
          disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={live ? 'Stop listening' : 'Start talking'}
        >
          {live ? (
            <View style={st.bars}>{[0.5, 0.85, 1, 0.7, 0.45].map((k, i) => <View key={i} style={[st.barI, { height: 6 + Math.max(0.1, level) * k * (big ? 46 : 28) }]} />)}</View>
          ) : <Ionicons name={autoSend ? 'checkmark' : 'mic'} size={big ? 50 : 32} color="#fff" />}
        </Pressable>
      </View>
    );
  };

  const Status = (big) => (
    <View style={[st.status, big && { marginTop: 18 }]}>
      <View style={st.statusTop}>
        {busy || (convo && thinking > 0) ? <ActivityIndicator size="small" color={RED} /> : <View style={[st.dot, { backgroundColor: dotColor }]} />}
        <Text style={[big ? st.statusTBig : st.statusT, error && { color: ERR }]} numberOfLines={1}>{error ? 'Something went wrong' : status.title}</Text>
      </View>
      <Text style={[st.statusS, big && { fontSize: 15 }, error && { color: ERR }]} numberOfLines={2}>{error || status.text}</Text>
    </View>
  );

  const Bubble = (t) => (t.kind === 'you' ? (
    <View key={t.id} style={st.youB}><Text style={st.youT}>{t.text.replace(/^“|”$/g, '')}</Text></View>
  ) : (
    <View key={t.id} style={[st.aiB, t.kind === 'did' && st.didB]}>
      <Ionicons name={t.kind === 'did' ? 'checkmark-circle' : 'sparkles'} size={16} color={t.kind === 'did' ? OK : RED} style={{ marginTop: 2 }} />
      <Text style={[st.aiT, t.kind === 'say' && { color: DEEP }]}>{t.text}</Text>
    </View>
  ));

  const Hero = (
    <View style={st.hero}>
      <Text style={[st.heroT, isTablet && { fontSize: 26 }]}>{handsFree ? 'Tap the mic and just talk' : 'Tap the mic and say the order'}</Text>
      <Text style={st.heroS}>{handsFree ? 'Say the table, then the items. Say “that’s it” to send.' : 'Say the table, then the items. Tap the mic again when done.'}</Text>
      <View style={st.group}>
        {examples.map(([k, say], i) => (
          <View key={k} style={[st.exRow, i > 0 && st.sep]}>
            <Text style={st.exK}>{k}</Text>
            <Text style={st.exT}>“{say}”</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const OrderCard = (
    <View style={st.group}>
      <View style={st.cardHead}>
        <Text style={st.cardTitle}>Order</Text>
        <Text style={st.cardMeta}>{itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}</Text>
        <View style={{ flex: 1 }} />
        {ticket ? <Pressable onPress={startOver} hitSlop={10}><Text style={st.clear}>Clear</Text></Pressable> : null}
      </View>
      {!hasLines && (phase === 'thinking'
        ? <View style={st.emptyRow}><ActivityIndicator color={RED} /><Text style={st.muted}>  Building the order…</Text></View>
        : <Text style={st.emptyT}>Items you say show up here.</Text>)}
      {ticket && ticket.lines.map((l) => (
        <View key={l.key} style={[st.sep, sel === l.key && st.rowSel]}>
          <Pressable style={({ pressed }) => [st.row, pressed && { backgroundColor: '#FAF6F4' }]} onPress={() => { setSel(sel === l.key ? null : l.key); setNoteDraft(''); }} accessibilityLabel={`Change ${l.name}`}>
            <View style={st.qty}><Text style={st.qtyT}>{l.quantity}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.itemT}>{l.name}{l.variant ? <Text style={st.varT}>{'  ' + l.variant}</Text> : null}</Text>
              {l.notes.length ? (
                <Text style={st.notesT}>{l.notes.map((n, k) => <Text key={k} style={/^(no|hold|without|less)\b/i.test(n) ? { color: ERR } : /^(extra|add|with)\b/i.test(n) ? { color: OK } : null}>{k ? '  ·  ' : ''}{n}</Text>)}</Text>
              ) : null}
            </View>
            {Number(l.price) ? <Text style={st.priceT}>{formatCurrency(l.price * l.quantity)}</Text> : null}
          </Pressable>
          {l.needsVariant && (
            <View style={st.ask}>
              <Text style={st.askT}>Which one?</Text>
              <View style={st.wrap}>{l.variants.map((v) => <Pressable key={v} style={st.choice} onPress={() => setVariant(l, v)}><Text style={st.choiceT}>{v}</Text></Pressable>)}</View>
            </View>
          )}
          {sel === l.key && (
            <View style={st.edit}>
              <View style={st.wrap}>
                <View style={st.stepper}>
                  <Pressable style={st.stepB} onPress={() => upd(l.key, (x) => ({ ...x, quantity: Math.max(1, x.quantity - 1) }))} accessibilityLabel="One less"><Ionicons name="remove" size={20} color={INK} /></Pressable>
                  <Text style={st.stepN}>{l.quantity}</Text>
                  <Pressable style={st.stepB} onPress={() => upd(l.key, (x) => ({ ...x, quantity: x.quantity + 1 }))} accessibilityLabel="One more"><Ionicons name="add" size={20} color={INK} /></Pressable>
                </View>
                <Pressable style={st.ghost} onPress={() => { setTicket((tk) => ({ ...tk, lines: tk.lines.filter((x) => x.key !== l.key) })); setSel(null); }}>
                  <Ionicons name="trash-outline" size={17} color={ERR} /><Text style={[st.ghostT, { color: ERR }]}>Remove</Text>
                </Pressable>
                <Pressable style={[st.ghost, st.ghostDone]} onPress={() => setSel(null)}><Text style={[st.ghostT, { color: '#fff' }]}>Done</Text></Pressable>
              </View>
              {l.notes.length > 0 && <View style={st.wrap}>{l.notes.map((n, k) => <Pressable key={k} style={st.chip} onPress={() => upd(l.key, (x) => ({ ...x, notes: x.notes.filter((_, j) => j !== k) }))}><Text style={st.chipT}>{n}</Text><Ionicons name="close" size={14} color={MUTED} /></Pressable>)}</View>}
              <TextInput style={st.input} placeholder="Add a note, e.g. no onion" placeholderTextColor="#A8A29E" value={noteDraft} onChangeText={setNoteDraft} onSubmitEditing={() => { const n = noteDraft.trim(); if (n) { upd(l.key, (x) => ({ ...x, notes: [...x.notes, n.slice(0, 80)] })); setNoteDraft(''); } }} returnKeyType="done" />
            </View>
          )}
        </View>
      ))}
      {ticket && ticket.unclear.map((u) => (
        <View key={u.key} style={st.sep}>
          <View style={[st.ask, { marginTop: 12 }]}>
            <Text style={st.askT}>{u.reason === 'sold_out' ? `${u.heard} is sold out.` : `Heard “${u.heard}”.`} {u.options.length ? 'Which one?' : 'Not on the menu.'}{u.quantity > 1 ? ` (×${u.quantity})` : ''}</Text>
            <View style={st.wrap}>
              {u.options.map((o) => <Pressable key={o.menuItemId} style={st.choice} onPress={() => resolve(u, o)}><Text style={st.choiceT}>{o.name}</Text></Pressable>)}
              <Pressable style={[st.choice, st.choiceGhost]} onPress={() => { setTicket((tk) => ({ ...tk, unclear: tk.unclear.filter((x) => x.key !== u.key) })); setSearch(u.heard); setAdding(true); }}><Text style={st.choiceT}>Search</Text></Pressable>
              <Pressable style={[st.choice, st.choiceGhost]} onPress={() => setTicket((tk) => ({ ...tk, unclear: tk.unclear.filter((x) => x.key !== u.key) }))}><Text style={st.choiceT}>Skip</Text></Pressable>
            </View>
          </View>
        </View>
      ))}
      <View style={[st.sep, st.cardFoot]}>
        <Pressable style={st.addBtn} onPress={() => setAdding(true)} hitSlop={6}><Ionicons name="add-circle" size={20} color={RED} /><Text style={st.addT}>Add item</Text></Pressable>
        {total ? <Text style={st.totalT}>{formatCurrency(total)}</Text> : null}
      </View>
    </View>
  );

  const ConflictBox = conflict ? (
    <View style={st.conflict}>
      <Text style={st.askT}>{conflict.missing ? `Table ${conflict.table} isn't set up in DineOpen. Send it with “Table ${conflict.table}” on the kitchen ticket?` : `Table ${conflict.table} already has an open order. Add these items to it? The kitchen gets only the new items.`}</Text>
      <View style={st.wrap}>
        <Pressable style={[st.ghost, st.ghostDone]} disabled={phase === 'sending'} onPress={() => (conflict.missing ? send({ tableNotSetUp: true }) : addToOpenOrder())}>
          <Text style={[st.ghostT, { color: '#fff' }]}>{conflict.missing ? `Send with Table ${conflict.table}` : `Add to Table ${conflict.table}`}</Text>
        </Pressable>
        <Pressable style={st.ghost} onPress={() => { setConflict(null); if (conflict.missing) setSheet('table'); }}><Text style={st.ghostT}>{conflict.missing ? 'Change table' : 'Cancel'}</Text></Pressable>
      </View>
    </View>
  ) : null;

  const WideSend = autoSend ? (
    <Pressable style={[st.wideBtn, { backgroundColor: OK }]} onPress={undoSend} accessibilityRole="button">
      <Text style={st.wideBtnT}>Sending in {autoSend.left} · Undo</Text>
    </Pressable>
  ) : (
    <Pressable style={[st.wideBtn, !canSend && st.wideOff]} disabled={!canSend} onPress={() => send()} accessibilityRole="button">
      <Ionicons name="paper-plane" size={18} color={canSend ? '#fff' : '#A8A29E'} />
      <Text style={[st.wideBtnT, !canSend && { color: '#A8A29E' }]}>Send to kitchen{itemCount ? ` · ${itemCount}` : ''}</Text>
    </Pressable>
  );

  const Header = (
    <View style={st.header}>
      <View style={st.top}>
        {!tabMode && <Pressable style={st.back} onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back"><Ionicons name="chevron-back" size={26} color={INK} /></Pressable>}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.title}>Voice order</Text>
          {restaurantName ? <Text style={st.subT} numberOfLines={1}>{restaurantName}</Text> : null}
        </View>
        <Pressable style={st.round} onPress={() => setShowToday(true)} accessibilityLabel={`Sent today: ${tickets.length}`}>
          <Ionicons name="receipt-outline" size={21} color={INK} />
          {tickets.length ? <View style={st.badge}><Text style={st.badgeT}>{tickets.length > 99 ? '99+' : tickets.length}</Text></View> : null}
        </Pressable>
      </View>
      <View style={st.ctx}>
        <Pressable style={({ pressed }) => [st.pill, hasHead && st.pillOn, pressed && { opacity: 0.7 }]} onPress={() => setSheet('table')} accessibilityLabel="Choose table or to-go">
          <Ionicons name={dine ? 'restaurant-outline' : 'bag-handle-outline'} size={16} color={hasHead ? DEEP : INK} />
          <Text style={[st.pillT, hasHead && { color: DEEP }]} numberOfLines={1}>{where}</Text>
          <Ionicons name="chevron-down" size={14} color={hasHead ? DEEP : MUTED} />
        </Pressable>
        {settings.askServer && (
          <Pressable style={({ pressed }) => [st.pill, pressed && { opacity: 0.7 }]} onPress={() => setSheet('server')} accessibilityLabel="Who is taking the order">
            <Ionicons name="person-circle-outline" size={17} color={INK} />
            <Text style={st.pillT} numberOfLines={1}>{server?.name ? server.name.split(' ')[0] : 'Who?'}</Text>
            <Ionicons name="chevron-down" size={14} color={MUTED} />
          </Pressable>
        )}
      </View>
    </View>
  );

  // bottom sheet (plain function, not a component, so its inputs keep focus across re-renders)
  const Sheet = ({ visible, onClose, title, children, keyboard }) => (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={keyboard && Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={st.sheetBg} onPress={onClose}>
          <Pressable style={[st.sheet, isTablet && st.sheetTablet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]} onPress={() => {}}>
            <View style={st.grab} />
            <View style={st.sheetHead}>
              <Text style={st.sheetH}>{title}</Text>
              <Pressable style={st.sheetX} onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={20} color={INK} /></Pressable>
            </View>
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={st.wrapAll} edges={['top', 'left', 'right']}>
      {Header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {isTablet ? (
          <View style={st.tabletBody}>
            <View style={st.leftPane}>
              <ScrollView ref={logScroll} style={{ flex: 1 }} contentContainerStyle={st.leftScroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { try { logScroll.current && logScroll.current.scrollToEnd({ animated: true }); } catch (_) { /* ignore */ } }}>
                {log.length ? <View style={{ gap: 10 }}>{log.map(Bubble)}</View> : Hero}
              </ScrollView>
              <View style={[st.tabDock, { paddingBottom: dockBottom + 6 }]}>
                {Orb(true)}
                {Status(true)}
              </View>
            </View>
            <View style={st.rightPane}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
                {ConflictBox}
                {OrderCard}
              </ScrollView>
              <View style={[st.rightFoot, { paddingBottom: dockBottom }]}>
                {WideSend}
                {handsFree && !autoSend ? <Text style={st.hint}>or just say “that’s it”</Text> : null}
              </View>
            </View>
          </View>
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={st.phoneScroll} keyboardShouldPersistTaps="handled">
              {ConflictBox}
              {(lastYou || lastAi) && <View style={{ gap: 8 }}>{lastYou && Bubble(lastYou)}{lastAi && Bubble(lastAi)}</View>}
              {ticket || phase === 'thinking' ? OrderCard : Hero}
            </ScrollView>
            <View style={[st.dock, { paddingBottom: dockBottom }]}>
              {autoSend ? (
                <Pressable style={st.undoBar} onPress={undoSend} accessibilityRole="button" accessibilityLabel="Undo send">
                  <Ionicons name="time-outline" size={18} color="#fff" />
                  <Text style={st.undoT}>Sending in {autoSend.left}…</Text>
                  <Text style={st.undoBtn}>UNDO</Text>
                </Pressable>
              ) : Status(false)}
              <View style={st.dockRow}>
                <Pressable style={st.sideWrap} onPress={() => setAdding(true)} accessibilityLabel="Search the menu">
                  <View style={st.side}><Ionicons name="search" size={22} color={INK} /></View>
                  <Text style={st.sideL}>Search</Text>
                </Pressable>
                {Orb(false)}
                <Pressable style={st.sideWrap} disabled={!canSend} onPress={() => send()} accessibilityLabel="Send to kitchen">
                  <View style={[st.side, canSend && st.sideGo]}>
                    <Ionicons name="paper-plane" size={21} color={canSend ? '#fff' : '#B9B2AE'} />
                    {itemCount ? <View style={st.sideBadge}><Text style={st.sideBadgeT}>{itemCount}</Text></View> : null}
                  </View>
                  <Text style={[st.sideL, canSend && { color: RED }]}>Send</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {Sheet({
        visible: sheet === 'table', onClose: closeSheet, title: 'Order for', keyboard: true,
        children: (
          <View style={{ gap: 14 }}>
            {orderTypes.length > 1 && (
              <View style={st.seg}>
                {orderTypes.slice(0, 4).map((ot) => (
                  <Pressable key={ot} onPress={() => setHead({ orderType: ot })} style={[st.segB, curType === ot && st.segOn]}>
                    <Text style={[st.segT, curType === ot && { color: INK }]}>{typeLabel(ot)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {dine ? (
              <>
                {floor.length > 0 && (
                  <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={st.tableGrid}>
                    {floor.map((t) => {
                      const on = String(ticket?.tableNumber || '') === t.n;
                      return (
                        <Pressable key={t.n} style={[st.tableT, t.busy && st.tableBusy, on && st.tableOn]} onPress={() => { setHead({ orderType: curType, tableNumber: t.n }); closeSheet(); }} accessibilityLabel={`Table ${t.n}${t.busy ? ', has an order' : ''}`}>
                          <Text style={[st.tableN, on && { color: '#fff' }]}>{t.n}</Text>
                          <Text style={[st.tableS, t.busy && { color: DEEP }, on && { color: '#fff' }]}>{t.busy ? 'busy' : 'free'}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <TextInput style={st.input} placeholder={floor.length ? 'Or type a table number' : 'Table number'} placeholderTextColor="#A8A29E" keyboardType="number-pad" value={ticket?.tableNumber || ''} onChangeText={(v) => setHead({ orderType: curType, tableNumber: v.slice(0, 20) || null })} returnKeyType="done" onSubmitEditing={closeSheet} />
              </>
            ) : (
              <TextInput style={st.input} placeholder="Customer name (optional)" placeholderTextColor="#A8A29E" value={ticket?.customerName || ''} onChangeText={(v) => setHead({ customerName: v.slice(0, 60) || null })} returnKeyType="done" onSubmitEditing={closeSheet} />
            )}
            <Pressable style={st.wideBtn} onPress={closeSheet}><Text style={st.wideBtnT}>Done</Text></Pressable>
          </View>
        ),
      })}

      {Sheet({
        visible: sheet === 'server', onClose: closeSheet, title: 'Who is taking it?',
        children: (
          <ScrollView style={{ maxHeight: 420 }}>
            {[server, ...staff.filter((s) => s.id !== server?.id)].filter(Boolean).slice(0, 12).map((s, i) => {
              const on = server?.id === s.id && server?.name === s.name;
              return (
                <Pressable key={s.id || s.name} style={[st.listRow, i > 0 && st.sep]} onPress={() => { setServer(s); closeSheet(); }}>
                  <View style={st.avatar}><Text style={st.avatarT}>{s.name.slice(0, 1).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}><Text style={st.listT}>{s.name}</Text>{s.role ? <Text style={st.listS}>{s.role}</Text> : null}</View>
                  {on && <Ionicons name="checkmark" size={22} color={RED} />}
                </Pressable>
              );
            })}
          </ScrollView>
        ),
      })}

      {Sheet({
        visible: adding, onClose: () => setAdding(false), title: 'Add item', keyboard: true,
        children: (
          <View style={{ gap: 10 }}>
            <View style={st.searchBox}>
              <Ionicons name="search" size={18} color={MUTED} />
              <TextInput style={st.searchIn} autoFocus placeholder="Search the menu" placeholderTextColor="#A8A29E" value={search} onChangeText={setSearch} />
            </View>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {results.map((m, i) => (
                <Pressable key={m.id} style={({ pressed }) => [st.listRow, i > 0 && st.sep, pressed && { backgroundColor: '#FAF6F4' }]} onPress={() => addItem(m)}>
                  <Text style={[st.listT, { flex: 1 }]}>{m.name}</Text>
                  {Number(m.price) ? <Text style={st.listS}>{formatCurrency(m.price)}</Text> : null}
                  <Ionicons name="add-circle" size={22} color={RED} />
                </Pressable>
              ))}
              {!results.length && <Text style={[st.muted, { paddingVertical: 16 }]}>No match</Text>}
            </ScrollView>
          </View>
        ),
      })}

      {Sheet({
        visible: showToday, onClose: () => setShowToday(false), title: `Sent today · ${tickets.length}`,
        children: (
          <ScrollView style={{ maxHeight: 460 }}>
            {!tickets.length && <Text style={[st.muted, { paddingVertical: 16 }]}>Orders you send show here, so you can reprint them.</Text>}
            {tickets.map((e, i) => (
              <View key={e.orderId + '_' + i} style={[st.listRow, i > 0 && st.sep]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.listT}>{e.head}</Text>
                  <Text style={st.listS}>{[e.number && `#${e.number}`, e.who, `${e.count} items`, e.at].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pressable style={st.round} onPress={() => reprint(e)} accessibilityLabel={`Reprint ${e.head}`}><Ionicons name="print-outline" size={20} color={INK} /></Pressable>
              </View>
            ))}
          </ScrollView>
        ),
      })}

      {toast ? <View style={[st.toast, { bottom: dockBottom + (isTablet ? 200 : 150) }]} pointerEvents="none"><Text style={st.toastT}>{toast}</Text></View> : null}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrapAll: { flex: 1, backgroundColor: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG, padding: 24 },
  offIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  h1: { fontSize: 22, fontWeight: '700', color: INK },
  muted: { color: MUTED, fontSize: 14 },

  header: { backgroundColor: BG, paddingBottom: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 6 },
  back: { marginLeft: -8, width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: INK, letterSpacing: -0.4 },
  subT: { fontSize: 13, color: MUTED, marginTop: 1 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: CARD, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: RED, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BG },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ctx: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  pill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  pillOn: { backgroundColor: SOFT, borderColor: '#F5B8B1' },
  pillT: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: INK },

  phoneScroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20, gap: 14 },
  hero: { gap: 6, paddingTop: 14 },
  heroT: { fontSize: 21, fontWeight: '700', color: INK, letterSpacing: -0.2 },
  heroS: { fontSize: 15, color: MUTED, lineHeight: 21, marginBottom: 12 },
  group: { backgroundColor: CARD, borderRadius: 16, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  exRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 3 },
  exK: { fontSize: 12, fontWeight: '700', color: RED, textTransform: 'uppercase', letterSpacing: 0.6 },
  exT: { fontSize: 16, color: INK, lineHeight: 22 },

  youB: { alignSelf: 'flex-end', maxWidth: '86%', backgroundColor: INK, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 9 },
  youT: { color: '#fff', fontSize: 15, lineHeight: 21 },
  aiB: { alignSelf: 'flex-start', maxWidth: '92%', flexDirection: 'row', gap: 8, backgroundColor: SOFT, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 12, paddingVertical: 9 },
  didB: { backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  aiT: { flexShrink: 1, fontSize: 15, lineHeight: 21, color: INK, fontWeight: '500' },

  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: INK },
  cardMeta: { fontSize: 14, color: MUTED },
  clear: { fontSize: 15, fontWeight: '600', color: RED },
  emptyT: { fontSize: 15, color: MUTED, paddingHorizontal: 16, paddingBottom: 18 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  rowSel: { backgroundColor: '#FCF8F6' },
  qty: { minWidth: 32, height: 32, paddingHorizontal: 6, borderRadius: 9, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  qtyT: { fontSize: 15, fontWeight: '700', color: DEEP, fontVariant: ['tabular-nums'] },
  itemT: { fontSize: 16, fontWeight: '600', color: INK },
  varT: { fontSize: 14, fontWeight: '500', color: MUTED },
  notesT: { fontSize: 14, color: MUTED, marginTop: 2 },
  priceT: { fontSize: 15, color: INK, fontVariant: ['tabular-nums'] },
  ask: { backgroundColor: '#FFF7E6', borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 12, gap: 10 },
  askT: { fontSize: 15, fontWeight: '600', color: '#7A3E06' },
  choice: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E3A43A', justifyContent: 'center' },
  choiceGhost: { borderColor: '#EBD7AF' },
  choiceT: { fontSize: 15, fontWeight: '600', color: '#7A3E06' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  edit: { gap: 10, paddingRight: 16, paddingBottom: 14, paddingLeft: 60 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3EEEC', borderRadius: 22, height: 44 },
  stepB: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepN: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#F3EEEC' },
  ghostDone: { backgroundColor: RED, marginLeft: 'auto' },
  ghostT: { fontSize: 15, fontWeight: '600', color: INK },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#F3EEEC' },
  chipT: { fontSize: 14, color: INK },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, backgroundColor: '#F3EEEC', color: INK },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addT: { fontSize: 15, fontWeight: '600', color: RED },
  totalT: { fontSize: 16, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  conflict: { backgroundColor: '#FFF7E6', borderRadius: 16, padding: 14, gap: 12 },

  dock: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 10, shadowColor: '#3B1D17', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 10 },
  status: { alignItems: 'center', gap: 2 },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusT: { fontSize: 16, fontWeight: '700', color: INK, flexShrink: 1 },
  statusTBig: { fontSize: 24, fontWeight: '700', color: INK, flexShrink: 1 },
  statusS: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  dockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  sideWrap: { alignItems: 'center', gap: 4, width: 72 },
  side: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#F3EEEC', alignItems: 'center', justifyContent: 'center' },
  sideGo: { backgroundColor: RED },
  sideL: { fontSize: 12, fontWeight: '600', color: MUTED },
  sideBadge: { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: CARD },
  sideBadgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  ringLive: { backgroundColor: 'rgba(217,45,32,0.12)' },
  orb: { backgroundColor: RED, alignItems: 'center', justifyContent: 'center', shadowColor: RED, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  barI: { width: 4, borderRadius: 2, backgroundColor: '#fff' },
  undoBar: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: OK },
  undoT: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '600' },
  undoBtn: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },

  tabletBody: { flex: 1, flexDirection: 'row' },
  leftPane: { flex: 1.25, borderRightWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  leftScroll: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 20, gap: 14, maxWidth: 680, width: '100%', alignSelf: 'center' },
  tabDock: { alignItems: 'center', paddingTop: 18, paddingHorizontal: 24 },
  rightPane: { flex: 1, maxWidth: 480, backgroundColor: '#FBF7F5' },
  rightFoot: { paddingHorizontal: 20, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  hint: { textAlign: 'center', fontSize: 13, color: MUTED },
  wideBtn: { height: 54, borderRadius: 27, backgroundColor: RED, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  wideOff: { backgroundColor: '#EDE7E4' },
  wideBtnT: { color: '#fff', fontSize: 17, fontWeight: '700' },

  sheetBg: { flex: 1, backgroundColor: 'rgba(28,25,23,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 8, gap: 12 },
  sheetTablet: { alignSelf: 'center', width: '100%', maxWidth: 560 },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#DDD5D1' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetH: { fontSize: 20, fontWeight: '700', color: INK },
  sheetX: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3EEEC', alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: '#F3EEEC', borderRadius: 12, padding: 3 },
  segB: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segT: { fontSize: 15, fontWeight: '600', color: MUTED },
  tableGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tableT: { width: 68, height: 60, borderRadius: 14, backgroundColor: '#F3EEEC', alignItems: 'center', justifyContent: 'center' },
  tableBusy: { backgroundColor: SOFT },
  tableOn: { backgroundColor: RED },
  tableN: { fontSize: 18, fontWeight: '700', color: INK, fontVariant: ['tabular-nums'] },
  tableS: { fontSize: 11, color: MUTED, marginTop: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  listT: { fontSize: 16, fontWeight: '600', color: INK },
  listS: { fontSize: 13, color: MUTED, marginTop: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: SOFT, alignItems: 'center', justifyContent: 'center' },
  avatarT: { fontSize: 15, fontWeight: '700', color: DEEP },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F3EEEC' },
  searchIn: { flex: 1, fontSize: 16, color: INK },

  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '88%', backgroundColor: INK, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11 },
  toastT: { color: '#fff', fontSize: 15, fontWeight: '500', textAlign: 'center' },
});
