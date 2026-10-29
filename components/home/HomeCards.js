// Small Home cards — the same cards as the web Home, from the same server data.
// Each one hides itself when there is nothing to show (or the person isn't allowed).
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import apiClient from '../../services/api';
import { formatCurrency } from '../../utils/formatCurrency';
import { openWeb } from './homeRules';

const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Open (unsettled) orders summary — server-cached; a 60 s copy here only dedupes quick re-focus.
const _openCache = new Map(); // rid → { t, s }
async function openSummary(rid) {
  const c = _openCache.get(rid);
  if (c && Date.now() - c.t < 60 * 1000) return c.s;
  const res = await apiClient.request(`/api/orders/${rid}/open`, { method: 'GET' });
  const s = res?.summary || null;
  if (s) _openCache.set(rid, { t: Date.now(), s });
  return s;
}

// "You have a meeting" / "minutes to read" for anyone invited. Tap → My Meetings.
const UPCOMING_DAYS = 7;
const whenText = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
export function MeetingsHomeCard({ restaurantId, style }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  useFocusEffect(useCallback(() => {
    if (!restaurantId) return undefined;
    let alive = true;
    apiClient.request(`/api/staff-meetings/${restaurantId}/mine`).then(r => { if (alive) setData(r); }).catch(() => {});
    return () => { alive = false; };
  }, [restaurantId]));

  const now = Date.now();
  const meetings = data?.meetings || [];
  const upcoming = meetings
    .filter(m => m.status === 'scheduled' && new Date(m.scheduledAt).getTime() > now - 3600e3 && new Date(m.scheduledAt).getTime() < now + UPCOMING_DAYS * 864e5)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)));
  const toRead = meetings.filter(m => m.minutesPublishedAt && !m.acknowledgedAt);
  if (!upcoming.length && !toRead.length) return null;
  const next = upcoming[0];
  return (
    <TouchableOpacity style={[st.meeting, style]} activeOpacity={0.7} onPress={() => openWeb(router, '/my-meetings', 'My Meetings')}>
      <View style={{ flex: 1 }}>
        {next && (
          <Text style={st.meetingTitle}>
            📅 Meeting: {next.title} — {whenText(next.scheduledAt)}{next.location ? ` · ${next.location}` : ''}
            {upcoming.length > 1 ? <Text style={{ fontWeight: '500' }}> (+{upcoming.length - 1} more)</Text> : null}
          </Text>
        )}
        {toRead.length > 0 && (
          <Text style={[st.meetingRead, next && { marginTop: 4 }]}>
            📄 {toRead.length === 1 ? `Minutes of “${toRead[0].title}” are out` : `${toRead.length} meeting minutes are out`} — please read and tap “I have read it”
          </Text>
        )}
      </View>
      <Text style={st.meetingLink}>My Meetings →</Text>
    </TouchableOpacity>
  );
}

// Yesterday's-sales recap for the people who run the business. Only when yesterday had sales;
// dismissible once per day.
const RECAP_KEY = 'yesterdayRecapDismissed';
export function YesterdayRecap({ restaurantId, style }) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!restaurantId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const ymd = ymdOf(y);
        if ((await AsyncStorage.getItem(RECAP_KEY)) === ymd) { if (!cancelled) setHidden(true); return; }
        const res = await apiClient.getDailySummary(restaurantId, { period: 'yesterday' });
        const s = res && res.summary;
        const rev = s ? (s.totalRevenueWithTax || s.totalRevenue || 0) : 0;
        if (!cancelled && s && rev > 0) {
          const p = Array.isArray(s.popularItems) ? s.popularItems[0] : null;
          setData({ rev, orders: s.totalOrders || 0, top: p ? (p.name || p.itemName || null) : null, ymd });
        }
      } catch (_) { /* advisory only — never block Home */ }
    })();
    return () => { cancelled = true; };
  }, [restaurantId]));

  if (!data || hidden) return null;
  const dismiss = () => { AsyncStorage.setItem(RECAP_KEY, data.ymd).catch(() => {}); setHidden(true); };
  return (
    <View style={[st.recap, style]}>
      <View style={st.recapIcon}><Text style={{ fontSize: 18 }}>🎉</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.recapTitle}>Yesterday you made {formatCurrency(Math.round(data.rev))} · {data.orders} order{data.orders !== 1 ? 's' : ''}</Text>
        <Text style={st.recapSub}>{data.top ? `Top seller: ${data.top}. ` : ''}Keep it going — ring today’s first sale.</Text>
      </View>
      <TouchableOpacity onPress={dismiss} accessibilityLabel="Dismiss" hitSlop={10}><Ionicons name="close" size={18} color="#16a34a" /></TouchableOpacity>
    </View>
  );
}

// Staff who see business totals: "N open orders not settled". Tap → Open Orders.
export function OpenOrdersCard({ restaurantId, style }) {
  const router = useRouter();
  const [s, setS] = useState(null);
  useFocusEffect(useCallback(() => {
    if (!restaurantId) return undefined;
    let alive = true;
    openSummary(restaurantId).then(x => { if (alive) setS(x); }).catch(() => {});
    return () => { alive = false; };
  }, [restaurantId]));
  if (!s || !(s.count > 0)) return null;
  return (
    <TouchableOpacity style={[st.open, style]} activeOpacity={0.7} onPress={() => openWeb(router, '/open-orders', 'Open Orders')}>
      <View style={st.openIcon}><Text style={{ fontSize: 18 }}>⚠️</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.openTitle}>{s.count} open order{s.count !== 1 ? 's' : ''} not settled · {formatCurrency(Math.round(s.amount || 0))}</Text>
        <Text style={st.openSub}>{s.agedCount > 0 ? `${s.agedCount} carried over from earlier days (oldest ${s.oldestDays}d) — ` : ''}Not counted in sales. Tap to settle or void.</Text>
      </View>
      <Text style={st.openLink}>Review →</Text>
    </TouchableOpacity>
  );
}

// Owner / admin: a chip for open orders CARRIED OVER from earlier days across their outlets.
// Today's running tables are normal service and never trigger it.
const MAX_OUTLETS = 30;
export function OpenOrdersChip({ restaurantId, style }) {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.getRestaurants();
        let list = (res?.restaurants || []).slice(0, MAX_OUTLETS);
        if (!list.length && restaurantId) list = [{ id: restaurantId, name: '' }];
        const out = await Promise.all(list.map(async r => {
          try {
            const s = await openSummary(r.id);
            return s && s.agedCount > 0 ? { id: r.id, agedCount: s.agedCount, agedAmount: s.agedAmount || 0 } : null;
          } catch (_) { return null; }
        }));
        if (alive) setRows(out.filter(Boolean).sort((a, b) => b.agedCount - a.agedCount));
      } catch (_) { /* non-blocking */ }
    })();
    return () => { alive = false; };
  }, [restaurantId]));
  if (!rows.length) return null;
  const total = rows.reduce((n, r) => n + r.agedCount, 0);
  const amount = rows.reduce((n, r) => n + r.agedAmount, 0);
  return (
    <TouchableOpacity style={[st.chip, style]} activeOpacity={0.7}
      onPress={() => openWeb(router, `/open-orders?restaurantId=${encodeURIComponent(rows[0].id)}`, 'Open Orders')}>
      <Ionicons name="hourglass-outline" size={14} color="#d97706" />
      <Text style={st.chipText} numberOfLines={1}>
        <Text style={{ fontWeight: '700' }}>{total} open order{total !== 1 ? 's' : ''}</Text> · {formatCurrency(Math.round(amount))} · from earlier days →
      </Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  meeting: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  meetingTitle: { fontSize: 14, fontWeight: '700', color: '#3730a3' },
  meetingRead: { fontSize: 13, fontWeight: '600', color: '#92400e' },
  meetingLink: { fontSize: 13, fontWeight: '700', color: '#4f46e5' },
  recap: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  recapIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  recapTitle: { fontSize: 14, fontWeight: '800', color: '#166534' },
  recapSub: { fontSize: 12, color: '#15803d', marginTop: 1 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  openIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#fbbf24', alignItems: 'center', justifyContent: 'center' },
  openTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  openSub: { fontSize: 12, color: '#a16207', marginTop: 1 },
  openLink: { fontSize: 13, fontWeight: '700', color: '#b45309' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  chipText: { fontSize: 13, color: '#92400e', flexShrink: 1 },
});
