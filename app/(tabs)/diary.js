// Daily Diary — "Anticipation & Assessment" (web: /diary). The manager's few minutes a day:
//   Morning — sales target (suggested from the last 4 same weekdays), focus / promotion, staffing, notes
//   Night   — actual vs target, how the day went (5 faces), went well / wrong, plan for tomorrow
//   Incidents — quarrel, theft, complaint, great / low sales … with severity, follow-up date and
//               open / resolved, so the owner can track it later (also shown in the web calendar)
// Sales, last week and the rota are filled in by the server. Role based: the server answers 403 for
// roles the owner didn't pick (Admin → POS settings → Daily Diary).
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, RefreshControl, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import apiClient from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { formatCurrency } from '../../utils/formatCurrency';

const INCIDENTS = [
  ['staff', '😠', 'Staff issue'], ['theft', '🚨', 'Theft / cash short'], ['complaint', '🙁', 'Complaint'],
  ['equipment', '🔧', 'Equipment'], ['great-sales', '🎉', 'Great sales'], ['low-sales', '📉', 'Low sales'],
  ['wastage', '🗑️', 'Wastage'], ['safety', '⚠️', 'Safety'], ['other', '📝', 'Other'],
];
const INC = Object.fromEntries(INCIDENTS.map(([k, e, l]) => [k, { e, l }]));
const SEV = { low: ['#f3f4f6', '#374151'], medium: ['#fef3c7', '#92400e'], high: ['#fee2e2', '#b91c1c'] };
const RATINGS = [[1, '😣', 'Bad'], [2, '😕', 'Below'], [3, '😐', 'OK'], [4, '🙂', 'Good'], [5, '🤩', 'Great']];
const FOCUS = ['Push promo items', 'Upsell drinks', 'Festival day', 'Big booking', 'Deep cleaning', 'Staff training'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (str, n) => { const d = new Date(`${str}T12:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const fmtDay = (str, o = { weekday: 'short', day: 'numeric', month: 'short' }) => { try { return new Date(`${str}T12:00:00`).toLocaleDateString([], o); } catch { return str; } };
const blankIncident = () => ({ id: '', type: 'other', severity: 'medium', title: '', note: '', people: '', amount: '', followUp: '', time: '', services: [], servicesNote: '', status: 'open', resolution: '' });
// Emergency services involved in an incident (any combination).
const SERVICES = [['police', '🚓', 'Police'], ['ambulance', '🚑', 'Ambulance'], ['fire', '🚒', 'Fire'], ['other', '🆘', 'Other']];
const SVC = Object.fromEntries(SERVICES.map(([k, e, l]) => [k, { e, l }]));
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const tap = () => { try { Haptics.selectionAsync(); } catch (_) { /* no haptics */ } };

export default function DiaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const [rid, setRid] = useState(null);
  const [today, setToday] = useState(ymd(new Date()));
  const [date, setDate] = useState(params.date && /^\d{4}-\d{2}-\d{2}$/.test(String(params.date)) ? String(params.date) : ymd(new Date()));
  const [tab, setTab] = useState('day'); // day | history | incidents
  const [facts, setFacts] = useState(null);
  const [form, setForm] = useState(null);
  const [savedInfo, setSavedInfo] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [changed, setChanged] = useState({}); // sections edited since load — only those are saved
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(null); // 'off' | 'role'
  const [list, setList] = useState(null);
  const [picker, setPicker] = useState(null); // incident index whose follow-up date is being picked
  const [timePicker, setTimePicker] = useState(null); // incident index whose time is being picked

  useEffect(() => {
    (async () => {
      const u = await apiClient.getUser();
      setRid(u?.restaurantId || u?.restaurant?.id || null);
    })();
    const unsub = restaurantEvents.on('switch', ({ restaurantId } = {}) => { if (restaurantId) setRid(restaurantId); });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  const toForm = (e = {}) => ({
    anticipation: { target: e.anticipation?.target != null ? String(e.anticipation.target) : '', focus: e.anticipation?.focus || '', staffing: e.anticipation?.staffing || '', notes: e.anticipation?.notes || '' },
    assessment: { rating: e.assessment?.rating || null, wentWell: e.assessment?.wentWell || '', wentWrong: e.assessment?.wentWrong || '', tomorrow: e.assessment?.tomorrow || '' },
    incidents: (e.incidents || []).map((i) => ({ ...blankIncident(), ...i, amount: i.amount != null ? String(i.amount) : '', followUp: i.followUp || '', time: i.time || '', services: Array.isArray(i.services) ? i.services : [], servicesNote: i.servicesNote || '' })),
  });

  const loadDay = useCallback(async () => {
    if (!rid) return;
    setError(''); setForm(null); setChanged({});
    try {
      const r = await apiClient.getDiaryDay(rid, date);
      setFacts(r.facts || null); setForm(toForm(r.entry)); setDirty(false); setBlocked(null);
      if (r.today) setToday(r.today);
      setSavedInfo(r.entry?.updatedAt ? { at: r.entry.updatedAt, by: r.entry.updatedBy?.name } : null);
    } catch (e) {
      if (e?.code === 'DIARY_OFF') setBlocked('off');
      else if (e?.status === 403) setBlocked('role');
      else setError(e?.message || 'Could not load the diary');
    } finally { setLoading(false); }
  }, [rid, date]);
  useEffect(() => { if (tab === 'day') { setLoading(true); loadDay(); } }, [tab, loadDay]);

  const loadList = useCallback(async () => {
    if (!rid) return;
    setList(null);
    try {
      if (tab === 'history') setList({ days: (await apiClient.getDiary(rid, addDays(today, -60), addDays(today, 30))).days || [] });
      if (tab === 'incidents') setList({ incidents: (await apiClient.getDiaryIncidents(rid, 'all')).incidents || [] });
    } catch (e) { setList({ error: e?.message || 'Could not load' }); }
  }, [rid, tab, today]);
  useEffect(() => { if (tab !== 'day') loadList(); }, [tab, loadList]);

  const set = (section, patch) => { setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } })); setDirty(true); setChanged((c) => ({ ...c, [section]: true })); };
  const setInc = (k, patch) => { setForm((f) => ({ ...f, incidents: f.incidents.map((x, j) => (j === k ? { ...x, ...patch } : x)) })); setDirty(true); setChanged((c) => ({ ...c, incidents: true })); };
  const touchIncidents = () => { setDirty(true); setChanged((c) => ({ ...c, incidents: true })); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      // Only what was edited here — saving the night part never wipes a morning part saved meanwhile
      const body = {};
      if (changed.anticipation) body.anticipation = { ...form.anticipation, target: form.anticipation.target === '' ? null : Number(form.anticipation.target) };
      if (changed.assessment) body.assessment = form.assessment;
      if (changed.incidents) body.incidents = form.incidents.map((i) => ({ ...i, amount: i.amount === '' ? null : Number(i.amount), followUp: i.followUp || null, time: i.time || null }));
      const r = await apiClient.saveDiaryDay(rid, date, body);
      setForm(toForm(r.entry)); setDirty(false); setChanged({});
      setSavedInfo({ at: r.entry?.updatedAt, by: r.entry?.updatedBy?.name });
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) { /* no haptics */ }
    } catch (e) { setError(e?.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const actual = facts?.sales?.sales || 0;
  const target = Number(form?.anticipation?.target) || 0;
  const pct = target > 0 ? Math.round((actual / target) * 100) : null;
  const future = date > today;

  const Header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}><Ionicons name="arrow-back" size={22} color="#111827" /></TouchableOpacity>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={s.headerTitle}>Daily Diary</Text>
        <Text style={s.headerSub}>Anticipation & assessment</Text>
      </View>
      <Ionicons name="book" size={22} color="#b45309" />
    </View>
  );

  if (blocked) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {Header}
        <View style={{ padding: 24, alignItems: 'center' }}>
          <Ionicons name="lock-closed-outline" size={36} color="#9ca3af" />
          <Text style={[s.section, { marginTop: 10, textAlign: 'center' }]}>{blocked === 'off' ? 'The Daily Diary is off' : 'Your role cannot use the diary'}</Text>
          <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{blocked === 'off' ? 'The owner can turn it on in Admin → POS settings.' : 'Ask the owner to add your role in Admin → POS settings → Daily Diary.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs = (
    <View style={s.toggleWrap}>
      {[['day', 'Day'], ['history', 'History'], ['incidents', 'Incidents']].map(([k, l]) => (
        <TouchableOpacity key={k} onPress={() => { tap(); setTab(k); }} style={[s.toggleBtn, tab === k && s.toggleOn]}>
          <Text style={[s.toggleText, tab === k && { color: '#111827' }]}>{l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {Header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.body, wide && { alignSelf: 'center', width: '100%', maxWidth: 820 }]} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => (tab === 'day' ? loadDay() : loadList())} />}>
          {tabs}

          {tab === 'day' && (
            <>
              <View style={s.dateRow}>
                <TouchableOpacity onPress={() => { tap(); setDate(addDays(date, -1)); }} style={s.dateBtn}><Ionicons name="chevron-back" size={18} color="#374151" /></TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={s.dateText}>{fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
                  {date === today ? <Text style={s.todayTag}>TODAY</Text> : <TouchableOpacity onPress={() => setDate(today)}><Text style={[s.todayTag, { color: '#b45309' }]}>Go to today</Text></TouchableOpacity>}
                </View>
                <TouchableOpacity onPress={() => { tap(); setDate(addDays(date, 1)); }} style={s.dateBtn}><Ionicons name="chevron-forward" size={18} color="#374151" /></TouchableOpacity>
              </View>

              {!loading && !form && error ? (
                <TouchableOpacity onPress={() => { setLoading(true); loadDay(); }} style={[s.card, { alignItems: 'center' }]}>
                  <Text style={s.error}>{error}</Text><Text style={s.link}>Try again</Text>
                </TouchableOpacity>
              ) : loading || !form ? <ActivityIndicator style={{ marginTop: 40 }} color="#b45309" /> : (
                <>
                  {!!error && <Text style={s.error}>{error}</Text>}
                  {/* Facts — never typed */}
                  <View style={s.facts}>
                    <Fact label={date === today ? 'Sales so far' : 'Sales'} value={future ? '—' : formatCurrency(actual)} sub={future ? '' : `${facts?.sales?.orders || 0} orders`} />
                    <Fact label="Last week" value={facts?.lastWeek ? formatCurrency(facts.lastWeek.sales) : '—'} sub="same day" />
                    <Fact label="4-week avg" value={facts?.avgSameWeekday != null ? formatCurrency(facts.avgSameWeekday) : '—'} sub="same weekday" />
                    <Fact label="On rota" value={facts?.rota?.length ? String(facts.rota.length) : '—'} sub={(facts?.rota || []).slice(0, 2).map((r) => r.name).join(', ')} />
                  </View>

                  <View style={wide ? { flexDirection: 'row', gap: 12, alignItems: 'flex-start' } : null}>
                    {/* Morning */}
                    <Card icon="sunny" color="#f59e0b" title="Morning — anticipation" hint="What are you expecting and preparing for?" style={wide && { flex: 1 }}>
                      <Text style={s.label}>SALES TARGET</Text>
                      <TextInput value={form.anticipation.target} onChangeText={(v) => set('anticipation', { target: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad"
                        placeholder={facts?.avgSameWeekday ? String(facts.avgSameWeekday) : 'e.g. 50000'} style={[s.input, s.big]} placeholderTextColor="#9ca3af" />
                      {facts?.avgSameWeekday != null && form.anticipation.target === '' && (
                        <TouchableOpacity onPress={() => set('anticipation', { target: String(facts.avgSameWeekday) })}><Text style={s.link}>Use {formatCurrency(facts.avgSameWeekday)}</Text></TouchableOpacity>
                      )}
                      <Text style={[s.label, s.gap]}>FOCUS / PROMOTION</Text>
                      <TextInput value={form.anticipation.focus} onChangeText={(v) => set('anticipation', { focus: v })} placeholder="e.g. Push the biryani combo" style={s.input} placeholderTextColor="#9ca3af" />
                      <View style={s.chips}>
                        {FOCUS.map((c) => (
                          <TouchableOpacity key={c} onPress={() => { tap(); const f = form.anticipation.focus; set('anticipation', { focus: f ? (f.includes(c) ? f : `${f}; ${c}`) : c }); }} style={s.chip}><Text style={s.chipText}>+ {c}</Text></TouchableOpacity>
                        ))}
                      </View>
                      <Text style={[s.label, s.gap]}>STAFFING</Text>
                      <View style={s.chips}>
                        {[['ok', 'Enough'], ['short', 'Short'], ['extra', 'Extra']].map(([k, l]) => {
                          const on = form.anticipation.staffing === k;
                          return (
                            <TouchableOpacity key={k} onPress={() => { tap(); set('anticipation', { staffing: on ? '' : k }); }} style={[s.pill, on && (k === 'short' ? s.pillRed : s.pillAmber)]}>
                              <Text style={[s.pillText, on && { color: k === 'short' ? '#b91c1c' : '#92400e' }]}>{l}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={[s.label, s.gap]}>PREPARATION NOTES</Text>
                      <TextInput value={form.anticipation.notes} onChangeText={(v) => set('anticipation', { notes: v })} multiline placeholder="Stock, bookings, VIP guests, maintenance…" style={[s.input, s.multi]} placeholderTextColor="#9ca3af" />
                    </Card>

                    {/* Night */}
                    <Card icon="moon" color="#6366f1" title="Night — assessment" hint="How did the day really go?" style={wide && { flex: 1 }}>
                      {target > 0 && !future && (
                        <View style={{ marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={s.muted}>{formatCurrency(actual)} of {formatCurrency(target)}</Text>
                            <Text style={{ fontWeight: '800', color: pct >= 100 ? '#059669' : '#dc2626' }}>{pct}%</Text>
                          </View>
                          <View style={s.bar}><View style={[s.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: pct >= 100 ? '#10b981' : '#f59e0b' }]} /></View>
                        </View>
                      )}
                      <Text style={s.label}>HOW WAS THE DAY?</Text>
                      <View style={[s.chips, { justifyContent: 'space-between' }]}>
                        {RATINGS.map(([n, e, l]) => {
                          const on = form.assessment.rating === n;
                          return (
                            <TouchableOpacity key={n} onPress={() => { tap(); set('assessment', { rating: on ? null : n }); }} style={[s.face, on && s.faceOn]}>
                              <Text style={{ fontSize: 24 }}>{e}</Text><Text style={s.faceText}>{l}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <Text style={[s.label, s.gap]}>WHAT WENT WELL</Text>
                      <TextInput value={form.assessment.wentWell} onChangeText={(v) => set('assessment', { wentWell: v })} multiline style={[s.input, s.multi]} />
                      <Text style={[s.label, s.gap]}>WHAT WENT WRONG</Text>
                      <TextInput value={form.assessment.wentWrong} onChangeText={(v) => set('assessment', { wentWrong: v })} multiline style={[s.input, s.multi]} />
                      <Text style={[s.label, s.gap]}>PLAN FOR TOMORROW</Text>
                      <TextInput value={form.assessment.tomorrow} onChangeText={(v) => set('assessment', { tomorrow: v })} placeholder="One thing to do differently" style={s.input} placeholderTextColor="#9ca3af" />
                    </Card>
                  </View>

                  {/* Incidents */}
                  <Card icon="warning" color="#dc2626" title="Incidents & events" hint="Stays open until resolved — the owner can track it.">
                    {form.incidents.map((x, k) => (
                      <View key={x.id || `n${k}`} style={[s.incident, x.status === 'resolved' && s.incidentDone]}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                          {INCIDENTS.map(([t, e, l]) => (
                            <TouchableOpacity key={t} onPress={() => { tap(); setInc(k, { type: t }); }} style={[s.chip, x.type === t && s.chipOn]}>
                              <Text style={[s.chipText, x.type === t && { color: '#b91c1c', fontWeight: '700' }]}>{e} {l}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                        <TextInput value={x.title} onChangeText={(v) => setInc(k, { title: v })} placeholder="What happened (one line)" style={[s.input, { marginTop: 8, fontWeight: '600' }]} placeholderTextColor="#9ca3af" />
                        <View style={[s.chips, { marginTop: 8 }]}>
                          {Object.keys(SEV).map((v) => (
                            <TouchableOpacity key={v} onPress={() => { tap(); setInc(k, { severity: v }); }} style={[s.pill, x.severity === v && { backgroundColor: SEV[v][0], borderColor: SEV[v][1] }]}>
                              <Text style={[s.pillText, { textTransform: 'capitalize' }, x.severity === v && { color: SEV[v][1] }]}>{v}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TextInput value={x.note} onChangeText={(v) => setInc(k, { note: v })} multiline placeholder="Details, action taken" style={[s.input, s.multi, { marginTop: 8 }]} placeholderTextColor="#9ca3af" />
                        <Text style={[s.label, s.gap]}>TIME OF INCIDENT {x.time ? `· ${x.time}` : ''}</Text>
                        <View style={s.chips}>
                          <TouchableOpacity onPress={() => { tap(); setInc(k, { time: hhmm(new Date()) }); }} style={s.pill}><Text style={s.pillText}>Now</Text></TouchableOpacity>
                          <TouchableOpacity onPress={() => setTimePicker(k)} style={[s.pill, !!x.time && s.pillAmber]}><Text style={[s.pillText, !!x.time && { color: '#92400e' }]}>{x.time || 'Pick…'}</Text></TouchableOpacity>
                          {!!x.time && <TouchableOpacity onPress={() => setInc(k, { time: '' })} style={s.pill}><Text style={s.pillText}>None</Text></TouchableOpacity>}
                        </View>
                        {timePicker === k && (
                          <DateTimePicker value={(() => { const d = new Date(); if (x.time) { const [h, m] = x.time.split(':').map(Number); d.setHours(h, m, 0, 0); } return d; })()} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(ev, d) => {
                              if (ev.type === 'dismissed') { setTimePicker(null); return; }
                              if (d) setInc(k, { time: hhmm(d) });
                              if (Platform.OS !== 'ios') setTimePicker(null);
                            }} />
                        )}
                        {timePicker === k && Platform.OS === 'ios' && (
                          <TouchableOpacity onPress={() => setTimePicker(null)} style={[s.pill, { alignSelf: 'flex-end' }]}><Text style={s.pillText}>Done</Text></TouchableOpacity>
                        )}
                        <Text style={[s.label, s.gap]}>SERVICES INVOLVED</Text>
                        <View style={s.chips}>
                          {SERVICES.map(([sv, e, l]) => {
                            const on = (x.services || []).includes(sv);
                            return (
                              <TouchableOpacity key={sv} accessibilityState={{ selected: on }} onPress={() => { tap(); setInc(k, { services: on ? x.services.filter((v) => v !== sv) : [...(x.services || []), sv] }); }}
                                style={[s.pill, on && { backgroundColor: '#eff6ff', borderColor: '#93c5fd' }]}>
                                <Text style={[s.pillText, on && { color: '#1d4ed8', fontWeight: '700' }]}>{e} {l}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        {(x.services || []).length > 0 && (
                          <TextInput value={x.servicesNote} onChangeText={(v) => setInc(k, { servicesNote: v })} placeholder="Report no., officer, hospital…" style={[s.input, { marginTop: 8 }]} placeholderTextColor="#9ca3af" />
                        )}
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <TextInput value={x.people} onChangeText={(v) => setInc(k, { people: v })} placeholder="People involved" style={[s.input, { flex: 1 }]} placeholderTextColor="#9ca3af" />
                          <TextInput value={x.amount} onChangeText={(v) => setInc(k, { amount: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Amount" style={[s.input, { width: 100 }]} placeholderTextColor="#9ca3af" />
                        </View>
                        <Text style={[s.label, s.gap]}>FOLLOW UP ON {x.followUp ? `· ${fmtDay(x.followUp)}` : ''}</Text>
                        <View style={s.chips}>
                          {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([l, n]) => {
                            const d = addDays(date, n);
                            return <TouchableOpacity key={l} onPress={() => { tap(); setInc(k, { followUp: x.followUp === d ? '' : d }); }} style={[s.pill, x.followUp === d && s.pillAmber]}><Text style={[s.pillText, x.followUp === d && { color: '#92400e' }]}>{l}</Text></TouchableOpacity>;
                          })}
                          <TouchableOpacity onPress={() => setPicker(k)} style={s.pill}><Text style={s.pillText}>Pick…</Text></TouchableOpacity>
                          {!!x.followUp && <TouchableOpacity onPress={() => setInc(k, { followUp: '' })} style={s.pill}><Text style={s.pillText}>None</Text></TouchableOpacity>}
                        </View>
                        {picker === k && (
                          <DateTimePicker value={new Date(`${x.followUp || addDays(date, 1)}T12:00:00`)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
                            onChange={(ev, d) => {
                              if (ev.type === 'dismissed') { setPicker(null); return; }
                              if (d) setInc(k, { followUp: ymd(d) });
                              setPicker(null);
                            }} />
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                          <TouchableOpacity onPress={() => { tap(); setInc(k, { status: x.status === 'resolved' ? 'open' : 'resolved' }); }} style={[s.resolveBtn, x.status === 'resolved' && s.resolveOn]}>
                            <Ionicons name="checkmark" size={14} color={x.status === 'resolved' ? '#fff' : '#374151'} />
                            <Text style={{ fontWeight: '700', fontSize: 12.5, color: x.status === 'resolved' ? '#fff' : '#374151' }}>{x.status === 'resolved' ? 'Resolved' : 'Mark resolved'}</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1 }} />
                          {!!x.by?.name && <Text style={s.muted}>by {x.by.name}</Text>}
                          <TouchableOpacity onPress={() => { setForm((f) => ({ ...f, incidents: f.incidents.filter((_, j) => j !== k) })); touchIncidents(); }} style={{ padding: 6 }}>
                            <Ionicons name="trash-outline" size={18} color="#9ca3af" />
                          </TouchableOpacity>
                        </View>
                        {x.status === 'resolved' && (
                          <TextInput value={x.resolution} onChangeText={(v) => setInc(k, { resolution: v })} placeholder="How it was resolved" style={[s.input, { marginTop: 8 }]} placeholderTextColor="#9ca3af" />
                        )}
                      </View>
                    ))}
                    <TouchableOpacity onPress={() => { tap(); setForm((f) => ({ ...f, incidents: [...f.incidents, blankIncident()] })); touchIncidents(); }} style={s.addBtn}>
                      <Ionicons name="add" size={16} color="#374151" /><Text style={{ fontWeight: '700', color: '#374151' }}>Add incident or event</Text>
                    </TouchableOpacity>
                  </Card>
                  <View style={{ height: 90 }} />
                </>
              )}
            </>
          )}

          {tab === 'history' && (
            !list ? <ActivityIndicator style={{ marginTop: 40 }} color="#b45309" />
              : list.error ? <Text style={s.error}>{list.error}</Text>
                : !(list.days || []).length ? <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>No diary pages yet.</Text>
                  : list.days.map((d) => {
                    const p = d.target ? Math.round(((d.sales || 0) / d.target) * 100) : null;
                    const r = RATINGS.find(([n]) => n === d.rating);
                    return (
                      <TouchableOpacity key={d.date} onPress={() => { setDate(d.date); setTab('day'); }} style={s.rowCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Text style={{ fontSize: 22 }}>{r ? r[1] : '📓'}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.rowTitle}>{fmtDay(d.date)}</Text>
                            <Text style={s.muted} numberOfLines={1}>{d.sales != null ? formatCurrency(d.sales) : '—'}{p != null ? ` · ${p}% of target` : ''}{d.focus ? ` · ${d.focus}` : ''}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                        </View>
                        {d.incidents.length > 0 && (
                          <View style={[s.chips, { marginTop: 6 }]}>
                            {d.incidents.map((i) => <Badge key={i.id} i={i} />)}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
          )}

          {tab === 'incidents' && (
            !list ? <ActivityIndicator style={{ marginTop: 40 }} color="#b45309" />
              : list.error ? <Text style={s.error}>{list.error}</Text>
                : !(list.incidents || []).length ? <Text style={[s.muted, { textAlign: 'center', marginTop: 40 }]}>No incidents recorded.</Text>
                  : [...list.incidents].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)).map((i) => (
                    <TouchableOpacity key={i.id} onPress={() => { setDate(i.date); setTab('day'); }} style={[s.rowCard, i.status !== 'open' && { opacity: 0.7 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 20 }}>{INC[i.type]?.e}</Text>
                        <Text style={[s.rowTitle, { flex: 1 }]} numberOfLines={1}>{i.title || INC[i.type]?.l}</Text>
                        <Text style={[s.status, i.status === 'open' ? s.statusOpen : s.statusDone]}>{i.status === 'open' ? 'Open' : 'Resolved'}</Text>
                      </View>
                      <Text style={[s.muted, { marginTop: 3 }]}>{fmtDay(i.date)}{i.time ? ` ${i.time}` : ''} · {i.severity}{(i.services || []).length ? ` · ${(i.services || []).map((sv) => SVC[sv] ? `${SVC[sv].e} ${SVC[sv].l}` : '').filter(Boolean).join(', ')}` : ''}{i.followUp ? ` · follow up ${fmtDay(i.followUp)}` : ''}</Text>
                      {!!(i.note || i.resolution) && <Text style={[s.muted, { marginTop: 3 }]} numberOfLines={2}>{i.note}{i.resolution ? ` — ✔ ${i.resolution}` : ''}</Text>}
                    </TouchableOpacity>
                  ))
          )}
        </ScrollView>

        {tab === 'day' && form && (
          <View style={s.saveBar}>
            <Text style={[s.muted, { flex: 1 }]} numberOfLines={1}>{dirty ? 'Unsaved changes' : savedInfo?.at ? `Saved ${new Date(savedInfo.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${savedInfo.by ? ` by ${savedInfo.by}` : ''}` : 'Nothing written yet'}</Text>
            <TouchableOpacity onPress={save} disabled={saving || !dirty} style={[s.saveBtn, (saving || !dirty) && { opacity: 0.4 }]}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '800' }}>Save</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ icon, color, title, hint, children, style }) {
  return (
    <View style={[s.card, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <View style={[s.cardIcon, { backgroundColor: `${color}1a` }]}><Ionicons name={icon} size={16} color={color} /></View>
        <View style={{ flex: 1 }}><Text style={s.section}>{title}</Text><Text style={s.muted}>{hint}</Text></View>
      </View>
      {children}
    </View>
  );
}
function Fact({ label, value, sub }) {
  return (
    <View style={s.fact}>
      <Text style={s.label} numberOfLines={1}>{label.toUpperCase()}</Text>
      <Text style={s.factValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {!!sub && <Text style={s.factSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}
function Badge({ i }) {
  const [bg, fg] = i.status === 'resolved' ? ['#ecfdf5', '#047857'] : SEV[i.severity] || SEV.medium;
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={{ fontSize: 11.5, color: fg }} numberOfLines={1}>{INC[i.type]?.e} {i.title || INC[i.type]?.l}</Text></View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f5' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11.5, color: '#6b7280' },
  body: { padding: 14 },
  toggleWrap: { flexDirection: 'row', backgroundColor: '#eef0f3', borderRadius: 10, padding: 3, marginBottom: 12 },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  toggleOn: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dateBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 15.5, fontWeight: '800', color: '#111827' },
  todayTag: { fontSize: 10.5, fontWeight: '800', color: '#b45309', letterSpacing: 0.6, marginTop: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  fact: { flexGrow: 1, flexBasis: '46%', backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 10 },
  factValue: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 2 },
  factSub: { fontSize: 11, color: '#9ca3af' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  cardIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 15, fontWeight: '700', color: '#111827' },
  label: { fontSize: 10.5, fontWeight: '800', color: '#6b7280', letterSpacing: 0.5, marginBottom: 5 },
  gap: { marginTop: 12 },
  muted: { fontSize: 12.5, color: '#6b7280' },
  link: { color: '#b45309', fontWeight: '700', fontSize: 12.5, marginTop: 5 },
  error: { color: '#b91c1c', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 14.5, color: '#111827', backgroundColor: '#fff' },
  big: { fontSize: 20, fontWeight: '800' },
  multi: { minHeight: 64, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#f3f4f6' },
  chipOn: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  chipText: { fontSize: 12, color: '#374151' },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  pillAmber: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  pillRed: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#4b5563' },
  face: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', minWidth: 56 },
  faceOn: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  faceText: { fontSize: 10.5, color: '#6b7280', marginTop: 2 },
  bar: { height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden', marginTop: 5 },
  barFill: { height: '100%', borderRadius: 4 },
  incident: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
  incidentDone: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: '#d1d5db' },
  resolveOn: { backgroundColor: '#059669', borderColor: '#059669' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db' },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 26 : 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#d97706', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12 },
  rowCard: { backgroundColor: 'white', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, maxWidth: 220 },
  status: { fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  statusOpen: { backgroundColor: '#fef2f2', color: '#b91c1c' },
  statusDone: { backgroundColor: '#ecfdf5', color: '#047857' },
});
