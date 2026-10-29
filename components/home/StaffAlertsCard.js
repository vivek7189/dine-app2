// Home → Staff alerts: birthdays / anniversaries, annual leave and ID / licence expiry.
// Same card as the web Home (dine-frontend components/StaffAlertsCard.js), same server data:
// GET /api/staff-alerts/:rid — owner / admins see everyone, managers their staff; anyone else gets
// 403 and the card stays hidden. Owner / admins can change the daily phone-alert settings.
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Switch, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import apiClient from '../../services/api';

const fmtDate = (ymd) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y) return ymd || '';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const when = (n) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);
const DATE_ICON = { work_anniversary: '🎉', wedding_anniversary: '💍' };
const docWhen = (d) => (d.daysUntil < 0 ? `expired ${fmtDate(d.expiryDate)}` : d.daysUntil === 0 ? 'expires today' : `expires ${when(d.daysUntil).toLowerCase()} · ${fmtDate(d.expiryDate)}`);
const EMPTY_LEAVE = { pending: [], onLeaveToday: [], upcoming: [], low: [], balances: [], types: [] };

function chipsFor(data) {
  const week = (data.birthdays || []).filter(b => b.daysUntil <= 7);
  const L = { ...EMPTY_LEAVE, ...(data.leave || {}) };
  const tomorrow = L.upcoming.filter(l => l.daysUntil === 1);
  const docs = data.documents || [];
  const expired = docs.filter(d => d.daysUntil < 0);
  const soon = docs.filter(d => d.daysUntil >= 0 && d.daysUntil <= 30);
  const names = (list) => `${list.map(l => l.name).slice(0, 3).join(', ')}${list.length > 3 ? ` +${list.length - 3}` : ''}`;
  return [
    ...week.slice(0, 3).map(b => ({ key: `b${b.staffId}`, color: b.daysUntil === 0 ? '#be185d' : '#9d174d', bg: b.daysUntil === 0 ? '#fce7f3' : '#fdf2f8', text: `🎂 ${b.name} · ${when(b.daysUntil)}${b.turning ? ` (${b.turning})` : ''}` })),
    ...(data.dates || []).filter(d => d.daysUntil <= 7).slice(0, 3).map(d => ({ key: `d${d.staffId}${d.kind}${d.date}`, color: '#3730a3', bg: '#eef2ff', text: `${DATE_ICON[d.kind] || '📌'} ${d.name} · ${d.label} · ${when(d.daysUntil)}` })),
    ...(L.onLeaveToday.length ? [{ key: 'today', color: '#065f46', bg: '#ecfdf5', text: `🌴 On leave today: ${names(L.onLeaveToday)}` }] : []),
    ...(tomorrow.length ? [{ key: 'tom', color: '#065f46', bg: '#f0fdf4', text: `🌴 From tomorrow: ${tomorrow.map(l => l.name).slice(0, 3).join(', ')}` }] : []),
    ...(L.pending.length ? [{ key: 'pend', color: '#92400e', bg: '#fffbeb', text: `📝 ${L.pending.length} leave request${L.pending.length > 1 ? 's' : ''} waiting` }] : []),
    ...(L.low.length ? [{ key: 'low', color: '#991b1b', bg: '#fef2f2', text: `⚠️ ${new Set(L.low.map(x => x.staffId)).size} low on leave` }] : []),
    ...(expired.length ? [{ key: 'docx', color: '#991b1b', bg: '#fef2f2', text: `🪪 ${expired.length === 1 ? `${expired[0].name}'s ${expired[0].label} expired` : `${expired.length} IDs / licences expired`}` }] : []),
    ...(soon.length ? [{ key: 'docs', color: '#92400e', bg: '#fffbeb', text: `🪪 ${soon.length === 1 ? `${soon[0].name}'s ${soon[0].label} ${docWhen(soon[0])}` : `${soon.length} IDs / licences expiring soon`}` }] : []),
  ];
}

export default function StaffAlertsCard({ restaurantId, canEditSettings = false, style }) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try { setData(await apiClient.request(`/api/staff-alerts/${restaurantId}`)); }
    catch (_) { setHidden(true); } // 403 (not allowed) or unavailable → no card
  }, [restaurantId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (hidden || !data) return null;
  const chips = chipsFor(data);
  return (
    <View style={style}>
      <View style={st.card}>
        <View style={st.head}>
          <Text style={st.title}>🎂 Staff alerts</Text>
          <TouchableOpacity onPress={() => setOpen(true)}><Text style={st.viewAll}>View all →</Text></TouchableOpacity>
        </View>
        <View style={st.chips}>
          {chips.length ? chips.map(c => (
            <View key={c.key} style={[st.chip, { backgroundColor: c.bg }]}><Text style={[st.chipText, { color: c.color }]}>{c.text}</Text></View>
          )) : (
            <Text style={st.none}>
              No birthdays or leave this week.{data.staffWithDob === 0 ? ' Add dates of birth in Admin → Staff → Staff Profile to get birthday alerts.' : ''}
            </Text>
          )}
        </View>
      </View>
      {open && <StaffAlertsModal data={data} restaurantId={restaurantId} canEditSettings={canEditSettings} onClose={() => setOpen(false)} onSaved={load} />}
    </View>
  );
}

function Row({ left, right, color = '#111827' }) {
  return (
    <View style={st.row}>
      <Text style={[st.rowLeft, { color }]}>{left}</Text>
      <Text style={st.rowRight}>{right}</Text>
    </View>
  );
}
function List({ rows, render, empty }) {
  return rows.length ? <View style={{ gap: 6 }}>{rows.map(render)}</View> : (empty ? <Text style={st.none}>{empty}</Text> : null);
}
function Heading({ children, color = '#374151' }) {
  return <Text style={[st.heading, { color }]}>{children}</Text>;
}

function StaffAlertsModal({ data, restaurantId, canEditSettings, onClose, onSaved }) {
  const L = { ...EMPTY_LEAVE, ...(data.leave || {}) };
  const settings = data.settings || {};
  const [tab, setTab] = useState('birthdays');
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const dates = data.dates || [];
  const docs = data.documents || [];

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      await apiClient.request(`/api/hr-settings/${restaurantId}`, { method: 'PUT', data: { settings: { alerts: s } } });
      setMsg('Saved.'); onSaved && onSaved();
    } catch (e) { setMsg(e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const tabs = [
    ['birthdays', `🎂 Birthdays & dates (${(data.birthdays || []).length + dates.length})`],
    ['leave', `🌴 Leave (${L.onLeaveToday.length + L.upcoming.length + L.pending.length})`],
    ['balances', '📊 Leave balances'],
    ['documents', `🪪 ID & licence (${docs.length})`],
    ...(canEditSettings ? [['settings', '⚙ Alerts']] : []),
  ];
  const range = (a, b) => `${fmtDate(a)}${b && b !== a ? ` – ${fmtDate(b)}` : ''}`;
  const reminderDays = Array.isArray(s.documentReminderDays) ? s.documentReminderDays : [30, 7, 1, 0];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View style={st.modalHead}>
          <View style={{ flex: 1 }}>
            <Text style={st.modalTitle}>Staff alerts</Text>
            <Text style={st.modalSub}>Birthdays and annual leave · leave year {data.leaveYear}–{String(Number(data.leaveYear) + 1).slice(2)}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={st.closeBtn} accessibilityLabel="Close"><Ionicons name="close" size={18} color="#374151" /></TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.tabRow}>
          {tabs.map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setTab(id)} style={[st.tabBtn, tab === id && st.tabBtnOn]}>
              <Text style={[st.tabText, tab === id && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          {tab === 'birthdays' && (
            <>
              {dates.length > 0 && (
                <View>
                  <Heading>Anniversaries & important days</Heading>
                  <List rows={dates} render={d => <Row key={`${d.staffId}${d.kind}${d.date}`} left={`${DATE_ICON[d.kind] || '📌'} ${d.name} · ${d.label}`} right={`${when(d.daysUntil)} · ${range(d.date, d.endDate)}`} />} />
                </View>
              )}
              <List rows={data.birthdays || []} empty="No birthdays in the next 30 days."
                render={b => <Row key={b.staffId} color={b.daysUntil === 0 ? '#be185d' : '#111827'} left={`${b.daysUntil === 0 ? '🎉 ' : ''}${b.name}${b.role ? ` · ${b.role}` : ''}`} right={`${when(b.daysUntil)} · ${fmtDate(b.date)}${b.turning ? ` · turning ${b.turning}` : ''}`} />} />
              <Text style={st.foot}>{data.staffWithDob} of {data.staffCount} staff have a date of birth (Admin → Staff → Staff Profile, or My Pay → My Profile).</Text>
            </>
          )}
          {tab === 'leave' && (
            <>
              <View><Heading>On leave today</Heading>
                <List rows={L.onLeaveToday} empty="Nobody." render={l => <Row key={l.id} left={l.name} right={`${l.type} · till ${fmtDate(l.endDate)}${l.halfDay ? ' · half day' : ''}`} />} /></View>
              <View><Heading>Starting in the next 7 days</Heading>
                <List rows={L.upcoming} empty="None." render={l => <Row key={l.id} left={l.name} right={`${when(l.daysUntil)} · ${l.type} · ${range(l.startDate, l.endDate)}${l.halfDay ? ' · half day' : ''}`} />} /></View>
              <View><Heading color="#92400e">Waiting for approval (Attendance → Leave)</Heading>
                <List rows={L.pending} empty="None." render={l => <Row key={l.id} color="#92400e" left={l.name} right={`${l.type} · ${range(l.startDate, l.endDate)}${l.days ? ` · ${l.days} day${l.days > 1 ? 's' : ''}` : ''}`} />} /></View>
              <View><Heading color="#991b1b">Low on leave (≤ {settings.lowLeaveDays} day{settings.lowLeaveDays === 1 ? '' : 's'} left)</Heading>
                <List rows={L.low} empty="Nobody." render={(x, i) => <Row key={`${x.staffId}${i}`} color="#991b1b" left={x.name} right={`${x.type}: ${x.remaining} of ${x.total} left`} />} /></View>
            </>
          )}
          {tab === 'balances' && (
            L.types.length === 0 ? <Text style={st.none}>No leave types yet — set them in Attendance → Settings.</Text> : (
              <View style={{ gap: 8 }}>
                {L.balances.map(b => (
                  <View key={b.staffId} style={st.balCard}>
                    <Text style={st.rowLeft}>{b.name}<Text style={{ color: '#9ca3af', fontWeight: '400' }}>{b.role ? ` · ${b.role}` : ''}</Text></Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                      {L.types.map(t => {
                        const r = (b.types || []).find(x => x.id === t.id);
                        const low = r && r.total > 0 && r.remaining <= settings.lowLeaveDays;
                        return (
                          <Text key={t.id} style={{ fontSize: 12, color: low ? '#b91c1c' : '#374151', fontWeight: low ? '700' : '400' }}>
                            {t.shortName || t.name}: {r ? `${r.remaining} / ${r.total}${r.used ? ` (used ${r.used})` : ''}` : '—'}
                          </Text>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            )
          )}
          {tab === 'documents' && (
            <>
              <List rows={docs} empty={`No ID, licence or visa expiring in the next ${settings.documentExpiryDays || 30} days.`}
                render={d => <Row key={`${d.staffId}${d.docId}`} color={d.daysUntil < 0 ? '#b91c1c' : d.daysUntil <= 7 ? '#b45309' : '#111827'} left={`${d.name}${d.role ? ` · ${d.role}` : ''} — ${d.label}`} right={docWhen(d)} />} />
              <Text style={st.foot}>Add or renew documents in Admin → Staff → Staff Details → ID & licence (staff can also add their own in My Pay → My Profile).</Text>
            </>
          )}
          {tab === 'settings' && canEditSettings && (
            <View style={{ gap: 14 }}>
              <Text style={st.foot}>A daily phone notification goes to the owner and admins (DineOpen app) from 9 am: birthdays, leave and expiring IDs / licences.</Text>
              <SettingSwitch label="Birthday alerts" value={s.birthdays !== false} onChange={v => setS({ ...s, birthdays: v })} />
              <PickRow label="Advance birthday alert" options={[0, 1, 2, 3, 7]} value={s.birthdayDaysBefore ?? 1}
                text={n => (n === 0 ? 'none' : `${n} day${n > 1 ? 's' : ''} before`)} onChange={n => setS({ ...s, birthdayDaysBefore: n })} />
              <SettingSwitch label="Anniversaries & important days" hint="Work and wedding anniversaries, staff prayer / family days (today and tomorrow)" value={s.importantDates !== false} onChange={v => setS({ ...s, importantDates: v })} />
              <SettingSwitch label="Leave alerts" hint="Who starts leave tomorrow, requests waiting" value={s.leave !== false} onChange={v => setS({ ...s, leave: v })} />
              <NumberRow label='Show "low on leave" at (days left or less)' value={s.lowLeaveDays ?? 2} min={0} max={30} onChange={n => setS({ ...s, lowLeaveDays: n })} />
              <SettingSwitch label="ID / licence / visa expiry" value={s.documents !== false} onChange={v => setS({ ...s, documents: v })} />
              <NumberRow label="List expiring IDs this many days ahead" value={s.documentExpiryDays ?? 30} min={1} max={180} onChange={n => setS({ ...s, documentExpiryDays: n })} />
              <View>
                <Heading>Phone alert for IDs</Heading>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[60, 30, 14, 7, 3, 1, 0].map(n => {
                    const on = reminderDays.includes(n);
                    return (
                      <TouchableOpacity key={n} onPress={() => setS({ ...s, documentReminderDays: on ? reminderDays.filter(x => x !== n) : [...reminderDays, n].sort((a, b) => b - a) })}
                        style={[st.pill, on && st.pillOn]}>
                        <Text style={[st.pillText, on && { color: '#6d28d9' }]}>{n === 0 ? 'on the day' : `${n} day${n > 1 ? 's' : ''} before`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity onPress={save} disabled={saving} style={[st.saveBtn, saving && { backgroundColor: '#c4b5fd' }]}>
                  <Text style={st.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                {!!msg && <Text style={{ fontSize: 12, color: /Saved/.test(msg) ? '#166534' : '#b91c1c' }}>{msg}</Text>}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SettingSwitch({ label, hint, value, onChange }) {
  return (
    <View style={st.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={st.settingLabel}>{label}</Text>
        {!!hint && <Text style={st.settingHint}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#a78bfa' }} thumbColor={value ? '#7c3aed' : undefined} />
    </View>
  );
}
function PickRow({ label, options, value, text, onChange }) {
  return (
    <View>
      <Text style={st.settingLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {options.map(n => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} style={[st.pill, value === n && st.pillOn]}>
            <Text style={[st.pillText, value === n && { color: '#6d28d9' }]}>{text(n)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
function NumberRow({ label, value, min, max, onChange }) {
  return (
    <View style={st.settingRow}>
      <Text style={[st.settingLabel, { flex: 1 }]}>{label}</Text>
      <TextInput keyboardType="number-pad" value={String(value)} style={st.numInput}
        onChangeText={t => { const n = Number(String(t).replace(/\D/g, '')); onChange(Math.max(min, Math.min(max, Number.isFinite(n) ? n : min))); }} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, borderColor: '#e9d5ff', backgroundColor: '#faf5ff', paddingVertical: 12, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '800', color: '#6b21a8' },
  viewAll: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '600' },
  none: { fontSize: 12, color: '#6b7280' },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  tabRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#f3f4f6' },
  tabBtnOn: { backgroundColor: '#7c3aed' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  heading: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  row: { borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  rowLeft: { fontSize: 13, fontWeight: '600', color: '#111827' },
  rowRight: { fontSize: 12, color: '#6b7280' },
  balCard: { borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 10, padding: 10 },
  foot: { fontSize: 12, color: '#9ca3af' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingLabel: { fontSize: 13, color: '#111827', fontWeight: '600' },
  settingHint: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  numInput: { width: 64, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, textAlign: 'center' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  pillOn: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 8, backgroundColor: '#7c3aed' },
  saveText: { color: '#fff', fontWeight: '700' },
});
