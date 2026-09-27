// Stock count (stock take) on the phone: start a count, walk the shelves typing what is there,
// submit; an owner / manager reviews the differences and approves — the server then corrects stock
// by the difference (never overwrites). Same API and rules as the web Stock Count tab.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { fmtQty } from '../../utils/formatQty';

const GREEN = '#059669';
const STATUS = {
  draft: { label: 'Counting', bg: '#fef3c7', color: '#92400e' },
  submitted: { label: 'Waiting for approval', bg: '#dbeafe', color: '#1e40af' },
  posting: { label: 'Posting…', bg: '#e0e7ff', color: '#3730a3' },
  posted: { label: 'Posted', bg: '#dcfce7', color: '#166534' },
  cancelled: { label: 'Cancelled', bg: '#f3f4f6', color: '#6b7280' },
};
const money = (n) => `${Number(n) < 0 ? '-' : ''}₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const toDate = (v) => {
  if (!v) return null;
  if (v._seconds) return new Date(v._seconds * 1000);
  const d = new Date(v); return isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v) => { const d = toDate(v); return d ? d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
const isCounted = (l) => l.countedQty !== null && l.countedQty !== undefined;
const diffOf = (l) => (isCounted(l) ? Math.round((l.countedQty - (l.systemAtCount ?? 0)) * 10000) / 10000 : null);

function Badge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return <View style={[styles.badge, { backgroundColor: s.bg }]}><Text style={[styles.badgeText, { color: s.color }]}>{s.label}</Text></View>;
}

export default function CountTab({ restaurantId, inventoryItems = [], onPosted }) {
  const [counts, setCounts] = useState([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [showStart, setShowStart] = useState(false);
  const [scopeType, setScopeType] = useState('all');
  const [scopeValue, setScopeValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState({});
  const draftsRef = useRef({});
  draftsRef.current = drafts;

  const categories = useMemo(() => [...new Set(inventoryItems.map(i => (i.category || '').trim()).filter(Boolean))].sort(), [inventoryItems]);
  const locations = useMemo(() => [...new Set(inventoryItems.map(i => (i.location || '').trim()).filter(Boolean))].sort(), [inventoryItems]);

  const loadList = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true); setError('');
    try {
      const r = await api.getStockCounts(restaurantId);
      setCounts(r.counts || []); setCanApprove(!!r.canApprove);
    } catch (e) { setError(e.message || 'Could not load counts'); }
    finally { setLoading(false); }
  }, [restaurantId]);

  useEffect(() => { loadList(); }, [loadList]);

  const openCount = async (id) => {
    setOpenId(id); setCount(null); setDrafts({}); setSaving({}); setSearch(''); setFilter('all'); setError('');
    try {
      const r = await api.getStockCount(restaurantId, id);
      setCount(r.count); setCanApprove(!!r.canApprove);
    } catch (e) { setError(e.message || 'Could not open count'); }
  };

  const startCount = async () => {
    if (busy) return;
    if (scopeType !== 'all' && !scopeValue) { setError(scopeType === 'category' ? 'Pick a category' : 'Pick an area'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.createStockCount(restaurantId, {
        ...(scopeType === 'category' ? { category: scopeValue } : {}),
        ...(scopeType === 'location' ? { location: scopeValue } : {}),
      });
      setShowStart(false); setScopeType('all'); setScopeValue('');
      loadList();
      setOpenId(r.count.id); setCount(r.count); setDrafts({}); setSaving({});
    } catch (e) { setError(e.message || 'Could not start count'); }
    finally { setBusy(false); }
  };

  const saveLine = async (line) => {
    const raw = draftsRef.current[line.itemId];
    if (raw === undefined) return;
    const text = String(raw).trim();
    const value = text === '' ? null : Number(text);
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setSaving(p => ({ ...p, [line.itemId]: 'error' })); return; }
    const same = (value === null && !isCounted(line)) || (value !== null && isCounted(line) && Math.abs(value - line.countedQty) < 1e-9);
    if (same) { setDrafts(p => { const n = { ...p }; delete n[line.itemId]; return n; }); return; }
    setSaving(p => ({ ...p, [line.itemId]: 'saving' }));
    try {
      const r = await api.saveStockCountLines(restaurantId, count.id, [{ itemId: line.itemId, countedQty: value }]);
      setCount(r.count);
      setDrafts(p => { const n = { ...p }; delete n[line.itemId]; return n; });
      setSaving(p => ({ ...p, [line.itemId]: 'saved' }));
    } catch (e) {
      setSaving(p => ({ ...p, [line.itemId]: 'error' }));
      setError(e.message || 'Could not save that count');
    }
  };

  const doAction = async (action) => {
    setBusy(true); setError('');
    try {
      if (action !== 'cancel') {
        for (const itemId of Object.keys(draftsRef.current)) {
          const line = (count.items || []).find(l => l.itemId === itemId);
          if (line) await saveLine(line);
        }
      }
      const r = await api.stockCountAction(restaurantId, count.id, action);
      setCount(r.count);
      loadList();
      if (action === 'post' && onPosted) onPosted();
    } catch (e) { setError(e.message || 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const confirmAction = (action) => {
    const s = count?.summary || {};
    if (action === 'post') {
      Alert.alert('Update stock?', `Stock will be corrected for ${s.itemsWithDifference || 0} item(s) (${money(s.differenceValue)}). Items not counted stay as they are. This can't be undone.`,
        [{ text: 'Back', style: 'cancel' }, { text: 'Yes, update stock', onPress: () => doAction('post') }]);
    } else if (action === 'cancel') {
      Alert.alert('Cancel this count?', 'Nothing will change in stock.',
        [{ text: 'Keep counting', style: 'cancel' }, { text: 'Cancel count', style: 'destructive', onPress: () => doAction('cancel') }]);
    } else {
      doAction(action);
    }
  };

  // ── Count sheet ──
  if (openId) {
    const editable = count && (count.status === 'draft' || (count.status === 'submitted' && canApprove));
    const showSystem = canApprove || count?.status === 'posted';
    const s = count?.summary || { totalItems: 0, countedItems: 0, itemsWithDifference: 0, differenceValue: 0 };
    const q = search.trim().toLowerCase();
    const lines = (count?.items || []).filter(l => {
      if (q && !`${l.itemName} ${l.category}`.toLowerCase().includes(q)) return false;
      if (filter === 'todo') return !isCounted(l);
      if (filter === 'diff') return isCounted(l) && diffOf(l) !== 0;
      return true;
    });
    const pct = s.totalItems ? Math.round((s.countedItems / s.totalItems) * 100) : 0;
    const pending = Object.keys(drafts).length > 0 || Object.values(saving).includes('saving');

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.card}>
          <TouchableOpacity onPress={() => { setOpenId(null); setCount(null); loadList(); }} style={styles.backRow}>
            <Ionicons name="arrow-back" size={16} color="#374151" /><Text style={styles.backText}>All counts</Text>
          </TouchableOpacity>
          {!count ? (
            <View style={{ padding: 20, alignItems: 'center' }}>{error ? <Text style={styles.err}>{error}</Text> : <ActivityIndicator color={GREEN} />}</View>
          ) : (
            <>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.title}>{count.name}</Text>
                  <Text style={styles.muted}>{count.scope} · {fmtDate(count.createdAt)}</Text>
                </View>
                <Badge status={count.status} />
              </View>
              <View style={[styles.rowBetween, { marginTop: 10 }]}>
                <Text style={styles.small}>{s.countedItems} of {s.totalItems} counted</Text>
                {showSystem && s.countedItems > 0 && (
                  <Text style={styles.small}>{s.itemsWithDifference} differ · <Text style={{ fontWeight: '700', color: s.differenceValue < 0 ? '#dc2626' : '#374151' }}>{money(s.differenceValue)}</Text></Text>
                )}
              </View>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
              {count.status === 'draft' && (
                <Text style={[styles.muted, { marginTop: 8 }]}>
                  Type what is physically there, in the unit shown. Each number saves when you move to the next. Leave items you didn&apos;t count empty.
                </Text>
              )}
            </>
          )}
        </View>

        {!!error && !!count && <Text style={[styles.err, { marginHorizontal: 12, marginBottom: 6 }]}>{error}</Text>}

        {count && (
          <>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={14} color="#9ca3af" />
              <TextInput style={styles.searchInput} placeholder="Search item" value={search} onChangeText={setSearch} placeholderTextColor="#9ca3af" />
            </View>
            <View style={styles.filters}>
              {[['all', 'All'], ['todo', 'Not counted'], ...(showSystem ? [['diff', 'Differences']] : [])].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipActive]}>
                  <Text style={[styles.chipText, filter === k && { color: 'white' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FlatList
              data={lines}
              keyExtractor={l => l.itemId}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 140 }}
              ListEmptyComponent={<Text style={[styles.muted, { textAlign: 'center', padding: 20 }]}>Nothing here</Text>}
              renderItem={({ item: l }) => {
                const d = diffOf(l);
                const st = saving[l.itemId];
                const text = drafts[l.itemId] !== undefined ? drafts[l.itemId] : (isCounted(l) ? String(l.countedQty) : '');
                return (
                  <View style={styles.line}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.lineName}>{l.itemName}</Text>
                      <Text style={styles.muted}>{[l.category, l.location].filter(Boolean).join(' · ')}</Text>
                      {showSystem && (
                        <Text style={[styles.small, { marginTop: 2 }]}>
                          System {fmtQty(isCounted(l) ? l.systemAtCount : l.systemAtStart)} {l.unit}
                          {d != null && d !== 0 && <Text style={{ fontWeight: '700', color: d < 0 ? '#dc2626' : GREEN }}>  {d > 0 ? '+' : '−'}{fmtQty(Math.abs(d))}</Text>}
                          {d === 0 && <Text style={{ color: '#9ca3af' }}>  matches</Text>}
                        </Text>
                      )}
                    </View>
                    {editable ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TextInput
                            style={[styles.qty, st === 'error' && { borderColor: '#dc2626' }]}
                            keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#9ca3af" value={text}
                            onChangeText={v => { if (v === '' || /^\d*\.?\d*$/.test(v)) setDrafts(p => ({ ...p, [l.itemId]: v })); }}
                            onEndEditing={() => saveLine(l)}
                            returnKeyType="done"
                          />
                          <Text style={[styles.small, { marginLeft: 6, minWidth: 24 }]}>{l.unit}</Text>
                        </View>
                        <Text style={{ fontSize: 10.5, marginTop: 2, color: st === 'error' ? '#dc2626' : '#9ca3af' }}>
                          {st === 'saving' ? 'saving…' : st === 'saved' ? 'saved ✓' : st === 'error' ? 'not saved' : ' '}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.lineName}>{isCounted(l) ? `${fmtQty(l.countedQty)} ${l.unit}` : '—'}</Text>
                    )}
                  </View>
                );
              }}
            />
            {(count.status === 'draft' || count.status === 'submitted') && (
              <View style={styles.footer}>
                {(count.status === 'draft' || canApprove) && (
                  <TouchableOpacity style={[styles.btn, styles.btnOutline]} disabled={busy} onPress={() => confirmAction('cancel')}>
                    <Text style={[styles.btnText, { color: '#991b1b' }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
                {count.status === 'draft' && !canApprove && (
                  <TouchableOpacity style={[styles.btn, (busy || pending || !s.countedItems) && { opacity: 0.5 }]} disabled={busy || pending || !s.countedItems} onPress={() => confirmAction('submit')}>
                    <Text style={styles.btnText}>{busy ? 'Please wait…' : 'Submit for approval'}</Text>
                  </TouchableOpacity>
                )}
                {canApprove && (
                  <TouchableOpacity style={[styles.btn, (busy || pending || !s.countedItems) && { opacity: 0.5 }]} disabled={busy || pending || !s.countedItems} onPress={() => confirmAction('post')}>
                    <Text style={styles.btnText}>{busy ? 'Please wait…' : 'Approve & update stock'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {count.status === 'posted' && (
              <Text style={[styles.small, { color: '#166534', margin: 12 }]}>Posted {fmtDate(count.postedAt)} — {count.itemsAdjusted || 0} item(s) corrected.</Text>
            )}
          </>
        )}
      </View>
    );
  }

  // ── List ──
  return (
    <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Stock count</Text>
            <Text style={styles.muted}>Count what is really on the shelf and fix the numbers.</Text>
          </View>
          <TouchableOpacity style={styles.btn} onPress={() => { setShowStart(v => !v); setError(''); }}>
            <Ionicons name="add" size={16} color="white" /><Text style={styles.btnText}>Start</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.muted, { marginTop: 8, lineHeight: 18 }]}>
          1. Count — type what you find.  2. Submit — nothing changes yet.  3. Owner / manager approves — stock is corrected and the loss shows in Variance.
        </Text>
        {showStart && (
          <View style={styles.startBox}>
            <Text style={styles.label}>WHAT TO COUNT</Text>
            <View style={styles.filters}>
              {[['all', 'All items'], ...(categories.length ? [['category', 'One category']] : []), ...(locations.length ? [['location', 'One area']] : [])].map(([k, label]) => (
                <TouchableOpacity key={k} onPress={() => { setScopeType(k); setScopeValue(''); }} style={[styles.chip, scopeType === k && styles.chipActive]}>
                  <Text style={[styles.chipText, scopeType === k && { color: 'white' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {scopeType !== 'all' && (
              <View style={[styles.filters, { flexWrap: 'wrap' }]}>
                {(scopeType === 'category' ? categories : locations).map(v => (
                  <TouchableOpacity key={v} onPress={() => setScopeValue(v)} style={[styles.chip, scopeValue === v && styles.chipActive]}>
                    <Text style={[styles.chipText, scopeValue === v && { color: 'white' }]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TouchableOpacity style={[styles.btn, { alignSelf: 'flex-end', marginTop: 6 }]} disabled={busy} onPress={startCount}>
              <Text style={styles.btnText}>{busy ? 'Starting…' : 'Start count'}</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!error && <Text style={[styles.err, { marginTop: 8 }]}>{error}</Text>}
      </View>

      {loading ? <ActivityIndicator color={GREEN} style={{ marginTop: 20 }} /> : counts.length === 0 ? (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 24 }]}>No counts yet. A monthly count is a good habit.</Text>
      ) : counts.map(c => (
        <TouchableOpacity key={c.id} style={styles.card} onPress={() => openCount(c.id)}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.lineName}>{c.name}</Text>
              <Text style={styles.muted}>{c.scope} · {fmtDate(c.createdAt)}</Text>
            </View>
            <Badge status={c.status} />
          </View>
          <View style={[styles.rowBetween, { marginTop: 6 }]}>
            <Text style={styles.small}>{c.summary?.countedItems || 0} / {c.summary?.totalItems || 0} counted</Text>
            {canApprove && !!c.summary?.itemsWithDifference && (
              <Text style={[styles.small, { color: c.summary.differenceValue < 0 ? '#dc2626' : '#374151' }]}>{c.summary.itemsWithDifference} differ · {money(c.summary.differenceValue)}</Text>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 10, marginHorizontal: 0, borderWidth: 1, borderColor: '#f1f5f9' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  muted: { fontSize: 12, color: '#6b7280' },
  small: { fontSize: 12, color: '#475569' },
  err: { fontSize: 12.5, color: '#b91c1c' },
  label: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#374151' },
  bar: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%', backgroundColor: GREEN },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 10, marginHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, fontSize: 14, color: '#111827' },
  filters: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: GREEN },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#374151' },
  line: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#f1f5f9' },
  lineName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  qty: { width: 84, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8, fontSize: 15, textAlign: 'right', color: '#111827', backgroundColor: 'white' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: GREEN, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnOutline: { backgroundColor: 'white', borderWidth: 1, borderColor: '#fecaca' },
  btnText: { color: 'white', fontWeight: '700', fontSize: 13.5 },
  startBox: { marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
});
