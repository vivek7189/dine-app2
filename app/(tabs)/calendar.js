// Events — festivals, public holidays and the restaurant's own events.
//  • Upcoming: next 6 months grouped by month, countdown, "expected" for moon-sighting dates
//  • Month: simple month grid with category dots; tap a day for its events
//  • Detail sheet: everyone sees the event + expected crowd + notes;
//    owner / admin / co-owner / manager can set expected crowd + notes and see last year's numbers.
// The owner can switch staff viewing off → the API answers 403 and the screen says so.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import apiClient from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { formatCurrency, getLocale } from '../../utils/formatCurrency';
import {
  categoryStyle, crowdStyle, CROWD, countdown, daysUntil, fmtDate, fmtMonth, fmtRange,
  ymd, parseYmd, addDays, isManagerRole, eventsOf, clearCalendarCache,
} from '../../utils/calendarEvents';

const RED = '#ef4444';
const evKey = (ev) => ev.key || `${ev.source}:${ev.id}:${ev.date}`;
const catOf = (ev) => categoryStyle(ev.source === 'custom' ? (ev.category || 'custom') : ev.category);

// Monday-first week day labels in the restaurant's locale.
const weekdayLabels = () => {
  const base = new Date(2024, 0, 1); // a Monday
  return [...Array(7)].map((_, i) => {
    try { return addDays(base, i).toLocaleDateString(getLocale(), { weekday: 'narrow' }); } catch { return 'MTWTFSS'[i]; }
  });
};

export default function CalendarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [user, setUser] = useState(null);
  const [rid, setRid] = useState(null);
  const [view, setView] = useState('list'); // list | month
  const [listData, setListData] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [monthData, setMonthData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(ymd(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [detail, setDetail] = useState(null);
  const [openedParam, setOpenedParam] = useState(false);

  const fetchRange = useCallback(async (r, from, to) => {
    const res = await apiClient.getCalendar(r, from, to);
    return { events: eventsOf(res), canManage: res?.canManage, region: res?.region, country: res?.country };
  }, []);

  const loadList = useCallback(async (r = rid) => {
    if (!r) return;
    setError('');
    try {
      const today = new Date();
      // A week back so a multi-day event that already started still shows as "On now".
      const d = await fetchRange(r, ymd(addDays(today, -7)), ymd(addDays(today, 183)));
      setListData(d);
      setForbidden(false);
    } catch (e) {
      if (e?.status === 403) setForbidden(true);
      else setError(e?.status === 404 ? 'Events are not available yet. Please update later.' : (e?.message || 'Could not load events'));
    }
  }, [rid, fetchRange]);

  const loadMonth = useCallback(async (r = rid, m = month) => {
    if (!r) return;
    setError('');
    try {
      const first = new Date(m.getFullYear(), m.getMonth(), 1);
      const last = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      setMonthData(await fetchRange(r, ymd(addDays(first, -7)), ymd(last)));
      setForbidden(false);
    } catch (e) {
      if (e?.status === 403) setForbidden(true);
      else setError(e?.message || 'Could not load events');
    }
  }, [rid, month, fetchRange]);

  useEffect(() => {
    (async () => {
      const u = await apiClient.getUser();
      const r = u?.restaurantId || u?.restaurant?.id;
      setUser(u); setRid(r);
      await loadList(r);
      setLoading(false);
    })();
    const unsub = restaurantEvents.on('switch', ({ restaurantId } = {}) => {
      clearCalendarCache();
      setListData(null); setMonthData(null); setDetail(null);
      if (restaurantId) { setRid(restaurantId); loadList(restaurantId); }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (view === 'month' && rid) loadMonth(rid, month); }, [view, month, rid, loadMonth]);

  // Opened from the home strip with a specific event → show its detail once loaded.
  useEffect(() => {
    if (openedParam || !params?.open || !listData) return;
    const ev = listData.events.find(e => evKey(e) === params.open);
    if (ev) setDetail(ev);
    setOpenedParam(true);
  }, [params?.open, listData, openedParam]);

  const onRefresh = async () => {
    setRefreshing(true);
    clearCalendarCache();
    await (view === 'month' ? loadMonth() : loadList());
    setRefreshing(false);
  };

  const source = view === 'month' ? monthData : listData;
  // Manager rights: the server's answer; older backends without the flag → role.
  const canManage = source?.canManage ?? listData?.canManage ?? isManagerRole(user?.role);
  const visible = useCallback((evs) => (evs || []).filter(e => canManage || !e.hidden), [canManage]);

  const grouped = useMemo(() => {
    const out = [];
    const list = visible(listData?.events)
      .filter(e => daysUntil(e.endDate || e.date) >= 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    list.forEach(ev => {
      const d = parseYmd(ev.date);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      let g = out[out.length - 1];
      if (!g || g.k !== k) { g = { k, title: fmtMonth(new Date(d.getFullYear(), d.getMonth(), 1)), items: [] }; out.push(g); }
      g.items.push(ev);
    });
    return out;
  }, [listData, visible]);

  // day (YYYY-MM-DD) → events covering it (multi-day events mark every day)
  const byDay = useMemo(() => {
    const map = {};
    visible(monthData?.events).forEach(ev => {
      let d = parseYmd(ev.date);
      const end = parseYmd(ev.endDate || ev.date);
      for (let i = 0; i < 31 && d <= end; i++, d = addDays(d, 1)) (map[ymd(d)] = map[ymd(d)] || []).push(ev);
    });
    return map;
  }, [monthData, visible]);

  const onSaved = (ev, patch) => {
    const apply = (d) => (d ? { ...d, events: d.events.map(e => (evKey(e) === evKey(ev) ? { ...e, ...patch } : e)) } : d);
    setListData(apply); setMonthData(apply);
    setDetail(d => (d ? { ...d, ...patch } : d));
    clearCalendarCache();
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
      <Text style={styles.headerTitle}>Events</Text>
      <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}><Ionicons name="refresh" size={20} color="#6b7280" /></TouchableOpacity>
    </View>
  );

  if (loading) {
    return <SafeAreaView style={styles.container} edges={['top']}>{header}<ActivityIndicator style={{ marginTop: 60 }} color={RED} /></SafeAreaView>;
  }

  if (forbidden) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header}
        <View style={styles.empty}>
          <Ionicons name="lock-closed-outline" size={36} color="#9ca3af" />
          <Text style={styles.emptyTitle}>Events are not shared with staff</Text>
          <Text style={styles.muted}>Ask your manager if you need to see the events calendar.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const eventRow = (ev, showDate = true) => {
    const cat = catOf(ev);
    const crowd = crowdStyle(ev.expectedCrowd);
    const d = parseYmd(ev.date);
    return (
      <TouchableOpacity key={evKey(ev)} style={[styles.row, ev.hidden && { opacity: 0.5 }]} activeOpacity={0.7} onPress={() => setDetail(ev)}>
        {showDate && (
          <View style={[styles.dateBox, { backgroundColor: cat.bg }]}>
            <Text style={[styles.dateDay, { color: cat.color }]}>{d.getDate()}</Text>
            <Text style={[styles.dateWk, { color: cat.color }]}>{fmtDate(ev.date, { weekday: 'short' })}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>{ev.name}</Text>
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: cat.bg }]}><Text style={[styles.chipText, { color: cat.color }]}>{cat.label}</Text></View>
            {ev.tentative && <View style={[styles.chip, styles.chipExpected]}><Text style={[styles.chipText, { color: '#92400e' }]}>expected</Text></View>}
            {ev.public && <View style={[styles.chip, { backgroundColor: '#f1f5f9' }]}><Text style={[styles.chipText, { color: '#334155' }]}>Holiday</Text></View>}
            {crowd && <View style={[styles.chip, { backgroundColor: crowd.bg }]}><Text style={[styles.chipText, { color: crowd.color }]}>{crowd.label}</Text></View>}
            {ev.hidden && <Ionicons name="eye-off-outline" size={14} color="#6b7280" />}
          </View>
          {ev.endDate && ev.endDate !== ev.date ? <Text style={styles.muted}>until {fmtDate(ev.endDate)}</Text> : null}
        </View>
        <Text style={styles.countdown}>{countdown(ev)}</Text>
      </TouchableOpacity>
    );
  };

  const monthGrid = () => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first
    const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = [...Array(lead).fill(null), ...[...Array(daysIn)].map((_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const todayKey = ymd(new Date());
    const labels = weekdayLabels();
    return (
      <View style={styles.card}>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><Ionicons name="chevron-back" size={20} color="#374151" /></TouchableOpacity>
          <Text style={styles.section}>{fmtMonth(month)}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><Ionicons name="chevron-forward" size={20} color="#374151" /></TouchableOpacity>
        </View>
        <View style={styles.weekRow}>{labels.map((l, i) => <Text key={i} style={styles.weekLabel}>{l}</Text>)}</View>
        {[...Array(cells.length / 7)].map((_, w) => (
          <View key={w} style={styles.weekRow}>
            {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
              if (!day) return <View key={i} style={styles.dayCell} />;
              const key = ymd(new Date(month.getFullYear(), month.getMonth(), day));
              const evs = byDay[key] || [];
              const sel = key === selectedDay;
              return (
                <TouchableOpacity key={i} style={[styles.dayCell, sel && styles.daySel]} onPress={() => setSelectedDay(key)}>
                  <Text style={[styles.dayNum, key === todayKey && { color: RED, fontWeight: '800' }, sel && { color: 'white' }]}>{day}</Text>
                  <View style={styles.dots}>
                    {evs.slice(0, 3).map((ev, j) => <View key={j} style={[styles.dot, { backgroundColor: sel ? 'white' : catOf(ev).color }]} />)}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        {!monthData && <ActivityIndicator style={{ marginTop: 8 }} color={RED} />}
      </View>
    );
  };

  const dayEvents = byDay[selectedDay] || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header}
      <View style={styles.toggleWrap}>
        {[['list', 'Upcoming', 'list-outline'], ['month', 'Month', 'calendar-outline']].map(([k, label, icon]) => (
          <TouchableOpacity key={k} style={[styles.toggleBtn, view === k && styles.toggleOn]} onPress={() => setView(k)}>
            <Ionicons name={icon} size={15} color={view === k ? '#111827' : '#6b7280'} />
            <Text style={[styles.toggleText, view === k && { color: '#111827' }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {!!error && <Text style={styles.error}>{error}</Text>}

        {view === 'list' ? (
          grouped.length === 0 ? (
            !error && (
              <View style={styles.empty}>
                <Ionicons name="calendar-clear-outline" size={36} color="#9ca3af" />
                <Text style={styles.emptyTitle}>Nothing coming up</Text>
                <Text style={styles.muted}>Festivals, holidays and special days will show here.</Text>
              </View>
            )
          ) : grouped.map(g => (
            <View key={g.k} style={{ marginBottom: 6 }}>
              <Text style={styles.monthTitle}>{g.title}</Text>
              <View style={styles.card}>{g.items.map(ev => eventRow(ev))}</View>
            </View>
          ))
        ) : (
          <>
            {monthGrid()}
            <Text style={styles.monthTitle}>{fmtDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <View style={styles.card}>
              {dayEvents.length === 0 ? <Text style={styles.muted}>No events on this day.</Text> : dayEvents.map(ev => eventRow(ev, false))}
            </View>
          </>
        )}
      </ScrollView>

      <EventSheet
        ev={detail}
        rid={rid}
        canManage={canManage}
        onClose={() => setDetail(null)}
        onSaved={onSaved}
      />
    </SafeAreaView>
  );
}

function EventSheet({ ev, rid, canManage, onClose, onSaved }) {
  const [crowd, setCrowd] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ev) { setCrowd(ev.expectedCrowd || null); setNotes(ev.notes || ''); }
  }, [ev]);

  if (!ev) return null;
  const cat = catOf(ev);
  const shownCrowd = crowdStyle(ev.expectedCrowd);
  const dirty = (crowd || null) !== (ev.expectedCrowd || null) || (notes || '') !== (ev.notes || '');

  const save = async () => {
    setSaving(true);
    try {
      const patch = { expectedCrowd: crowd || null, notes: notes.trim() };
      if (ev.source === 'custom') await apiClient.updateCalendarEvent(rid, ev.id, patch);
      else await apiClient.updateCalendarSettings(rid, { overrides: { [evKey(ev)]: patch } });
      onSaved(ev, patch);
      onClose();
    } catch (e) {
      Alert.alert('Not saved', e?.status === 403 ? 'Only managers can change this.' : (e?.message || 'Please try again'));
    } finally { setSaving(false); }
  };

  const ly = ev.lastYear;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={[styles.sheetBar, { backgroundColor: cat.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{ev.name}</Text>
                <Text style={styles.sheetDate}>{fmtRange(ev)}{ev.tentative ? ' (expected)' : ''}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={{ padding: 4 }}><Ionicons name="close" size={22} color="#6b7280" /></TouchableOpacity>
            </View>

            <View style={[styles.chips, { marginTop: 10 }]}>
              <View style={[styles.chip, { backgroundColor: cat.bg }]}><Text style={[styles.chipText, { color: cat.color }]}>{cat.label}</Text></View>
              {ev.public && <View style={[styles.chip, { backgroundColor: '#f1f5f9' }]}><Text style={[styles.chipText, { color: '#334155' }]}>Public holiday</Text></View>}
              {ev.impact === 'high' && <View style={[styles.chip, { backgroundColor: '#fee2e2' }]}><Text style={[styles.chipText, { color: '#b91c1c' }]}>Usually busy</Text></View>}
              <View style={[styles.chip, { backgroundColor: '#f8fafc' }]}><Text style={[styles.chipText, { color: '#111827' }]}>{countdown(ev)}</Text></View>
            </View>
            {ev.tentative && <Text style={[styles.muted, { marginTop: 8 }]}>The exact date depends on the moon sighting and may move by a day.</Text>}

            {/* Last year — managers only (money) */}
            {canManage && (
              <View style={styles.lyCard}>
                <Text style={styles.label}>LAST YEAR</Text>
                {ly ? (
                  <>
                    <Text style={styles.lyDate}>{fmtDate(ly.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                    <View style={{ flexDirection: 'row', gap: 20, marginTop: 6 }}>
                      <View><Text style={styles.lyNum}>{Number(ly.totalOrders || 0).toLocaleString(getLocale())}</Text><Text style={styles.muted}>orders</Text></View>
                      <View><Text style={styles.lyNum}>{formatCurrency(ly.revenue || 0)}</Text><Text style={styles.muted}>sales</Text></View>
                    </View>
                  </>
                ) : <Text style={[styles.muted, { marginTop: 4 }]}>No sales recorded for this day last year.</Text>}
              </View>
            )}

            {canManage ? (
              <>
                <Text style={[styles.label, { marginTop: 16 }]}>EXPECTED CROWD</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {CROWD.map(c => {
                    const on = crowd === c.key;
                    return (
                      <TouchableOpacity key={c.key} onPress={() => setCrowd(on ? null : c.key)}
                        style={[styles.crowdBtn, on ? { backgroundColor: c.bg, borderColor: c.color } : null]}>
                        <Text style={[styles.crowdText, on && { color: c.color }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={[styles.label, { marginTop: 16 }]}>NOTES FOR THE TEAM</Text>
                <TextInput
                  style={styles.notes}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Extra staff 6–11pm, stock up on sweets"
                  placeholderTextColor="#9ca3af"
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity disabled={!dirty || saving} onPress={save}
                  style={[styles.saveBtn, { opacity: dirty ? 1 : 0.5 }]}>
                  {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveText}>Save</Text>}
                </TouchableOpacity>
              </>
            ) : (
              (shownCrowd || ev.notes) ? (
                <View style={styles.lyCard}>
                  {shownCrowd && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.label}>EXPECTED</Text>
                      <View style={[styles.chip, { backgroundColor: shownCrowd.bg }]}><Text style={[styles.chipText, { color: shownCrowd.color }]}>{shownCrowd.label}</Text></View>
                    </View>
                  )}
                  {ev.notes ? <Text style={[styles.noteText, shownCrowd && { marginTop: 8 }]}>{ev.notes}</Text> : null}
                </View>
              ) : null
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  toggleWrap: { flexDirection: 'row', margin: 14, marginBottom: 0, backgroundColor: '#eef0f3', borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  toggleOn: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  card: { backgroundColor: 'white', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  monthTitle: { fontSize: 13, fontWeight: '800', color: '#6b7280', letterSpacing: 0.4, marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
  section: { fontSize: 15, fontWeight: '700', color: '#111827' },
  label: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5 },
  muted: { fontSize: 12.5, color: '#6b7280' },
  error: { color: '#b91c1c', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  dateBox: { width: 46, height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 18, fontWeight: '800' },
  dateWk: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 4 },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  chipExpected: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', borderStyle: 'dashed' },
  chipText: { fontSize: 10.5, fontWeight: '700' },
  countdown: { fontSize: 12, fontWeight: '700', color: '#111827', maxWidth: 80, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 50, paddingHorizontal: 30, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 6, textAlign: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  navBtn: { padding: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9ca3af', paddingVertical: 6 },
  dayCell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: 1 },
  daySel: { backgroundColor: '#111827' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#111827' },
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 12 },
  sheetBar: { width: 4, height: 44, borderRadius: 2, marginTop: 2 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#111827' },
  sheetDate: { fontSize: 13.5, color: '#374151', marginTop: 3 },
  lyCard: { marginTop: 14, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eef2f7' },
  lyDate: { fontSize: 13, color: '#374151', marginTop: 4 },
  lyNum: { fontSize: 18, fontWeight: '800', color: '#111827' },
  crowdBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'white' },
  crowdText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  notes: { marginTop: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: '#111827' },
  noteText: { fontSize: 14, color: '#374151' },
  saveBtn: { marginTop: 14, backgroundColor: RED, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
