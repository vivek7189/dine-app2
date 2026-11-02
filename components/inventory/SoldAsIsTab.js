// Inventory → "Sold as is" (same as the web tab): every menu item; things sold exactly as bought
// (Coke, water, chips, beer) get Track + a count — each sale reduces it, 0 shows "out of stock" on
// POS / QR. Track re-uses a same-name stock item (no duplicates). Dishes made from ingredients use
// Recipes. Spirits & wine are counted by bottle in the web's Liquor tab, so they are not listed here.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, FlatList, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Spacing, BorderRadius } from '../../constants/Theme';
import { fmtQty } from '../../utils/formatQty';
import { formatCurrency } from '../../utils/formatCurrency';

const FILTERS = [['all', 'All'], ['tracked', 'Tracked'], ['untracked', 'Not tracked'], ['out', 'Out of stock']];
const isLiquorItem = (i) => i.liquor || (i.liquorCategory && !i.tracked);
const stockOf = (i) => Number(i.linked ? i.linked.currentStock : i.stockQuantity) || 0;
const lowOf = (i) => (i.lowStockThreshold != null ? Number(i.lowStockThreshold) : (i.linked ? i.linked.minStock : 0)) || 0;
const num = (v) => String(v).replace(',', '.');

export default function SoldAsIsTab({ restaurantId, canUpdate, onReceive, refreshKey, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState({}); // menuItemId → { openingStock, lowStock }
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try { setData(await apiClient.getSoldAsIs(restaurantId)); setError(''); }
    catch (e) { setError(e?.message || 'Could not load menu items.'); }
  }, [restaurantId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const allItems = data?.items || [];
  const items = useMemo(() => allItems.filter(i => !isLiquorItem(i)), [allItems]);
  const liquorCount = allItems.length - items.length;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter(i => (!t || i.name.toLowerCase().includes(t) || String(i.category).toLowerCase().includes(t))
      && (filter === 'all' || (filter === 'tracked' && i.tracked) || (filter === 'untracked' && !i.tracked) || (filter === 'out' && i.tracked && stockOf(i) <= 0)));
  }, [items, q, filter]);
  const nSel = Object.keys(selected).length;

  const track = async (entries, okText) => {
    setBusy(true); setError('');
    try {
      const r = await apiClient.trackSoldAsIs(restaurantId, entries);
      const bad = (r.results || []).filter(x => !x.ok);
      Alert.alert(bad.length ? 'Partly saved' : 'Saved', bad.length ? `${entries.length - bad.length} done, ${bad.length} failed` : okText);
      setSelected({});
      await load();
      onChanged?.();
    } catch (e) { setError(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };
  const toggleSel = (i) => setSelected(s => {
    const n = { ...s };
    if (n[i.id]) delete n[i.id]; else n[i.id] = { openingStock: i.match ? String(i.match.currentStock) : '', lowStock: '' };
    return n;
  });
  const setSel = (id, k, v) => setSelected(s => ({ ...s, [id]: { ...s[id], [k]: v } }));
  const trackSelected = () => track(
    Object.entries(selected).map(([menuItemId, v]) => ({
      menuItemId, track: true,
      openingStock: v.openingStock === '' ? 0 : Number(num(v.openingStock)) || 0,
      ...(v.lowStock !== '' ? { lowStock: Number(num(v.lowStock)) || 0 } : {}),
    })),
    `Tracking ${nSel} item${nSel > 1 ? 's' : ''}`,
  );
  const confirmStop = (i) => Alert.alert('Stop tracking?', `${i.name} will no longer reduce stock when sold.`, [
    { text: 'No', style: 'cancel' },
    { text: 'Stop tracking', style: 'destructive', onPress: () => track([{ menuItemId: i.id, track: false }], `${i.name}: tracking stopped`) },
  ]);
  const onPull = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!data && !error) {
    return <View style={styles.center}><ActivityIndicator color="#059669" /><Text style={styles.muted}>Loading menu items…</Text></View>;
  }

  const header = (
    <View>
      <View style={styles.intro}>
        <Text style={styles.title}>Sold as is</Text>
        <Text style={styles.introText}>
          Things you sell exactly as you buy them — Coke, water, chips, beer. Tap <Text style={styles.b}>Track</Text> and enter how many you have: every sale reduces it, and at 0 it shows “out of stock”. Dishes made from ingredients use <Text style={styles.b}>Recipes</Text>.
        </Text>
        {liquorCount > 0 && (
          <Text style={styles.liquorNote}>{liquorCount} spirit{liquorCount === 1 ? '' : 's'} & wine{liquorCount === 1 ? '' : 's'} are counted by bottle in Inventory → Liquor on the web.</Text>
        )}
        {data && (
          <Text style={styles.counts}>
            <Text style={styles.b}>{data.counts.tracked}</Text> tracked · <Text style={[styles.b, data.counts.outOfStock ? { color: '#b91c1c' } : null]}>{data.counts.outOfStock}</Text> out of stock
          </Text>
        )}
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={Colors.textLight} />
        <TextInput style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Search menu items" placeholderTextColor={Colors.textLight} />
        {!!q && <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={16} color={Colors.textLight} /></TouchableOpacity>}
      </View>
      <View style={styles.chips}>
        {FILTERS.map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipOn]}>
            <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}

      {canUpdate && nSel > 0 && (
        <View style={styles.bulk}>
          <Text style={styles.bulkTitle}>Track {nSel} item{nSel > 1 ? 's' : ''} — how many do you have now?</Text>
          {Object.entries(selected).map(([id, v]) => {
            const it = items.find(i => i.id === id); if (!it) return null;
            return (
              <View key={id} style={styles.bulkRow}>
                <Text style={styles.bulkName} numberOfLines={2}>
                  {it.name}{it.match ? <Text style={{ color: '#047857', fontWeight: '500' }}> · uses your “{it.match.name}”</Text> : null}
                </Text>
                <TextInput style={styles.smallInp} keyboardType="decimal-pad" placeholder="Count" placeholderTextColor={Colors.textLight}
                  value={v.openingStock} onChangeText={(t) => setSel(id, 'openingStock', t)} />
                <TextInput style={styles.smallInp} keyboardType="decimal-pad" placeholder="Warn below" placeholderTextColor={Colors.textLight}
                  value={v.lowStock} onChangeText={(t) => setSel(id, 'lowStock', t)} />
              </View>
            );
          })}
          <View style={styles.bulkActions}>
            <TouchableOpacity disabled={busy} onPress={trackSelected} style={[styles.greenBtn, busy && { opacity: 0.6 }]}>
              <Text style={styles.greenBtnText}>{busy ? 'Saving…' : `Track ${nSel}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelected({})} style={styles.outlineBtn}><Text style={styles.outlineBtnText}>Clear</Text></TouchableOpacity>
          </View>
          <Text style={styles.hint}>Blank count = 0 (shows “out of stock” until you add stock).</Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item: i }) => {
    const st = stockOf(i), lo = lowOf(i), out = i.tracked && st <= 0, isLow = i.tracked && !out && lo > 0 && st <= lo;
    const sel = !!selected[i.id];
    return (
      <View style={[styles.row, out && { backgroundColor: '#fff7f7' }]}>
        {canUpdate && !i.tracked && (
          <TouchableOpacity onPress={() => toggleSel(i)} style={styles.check} accessibilityLabel={`Select ${i.name}`}>
            <Ionicons name={sel ? 'checkbox' : 'square-outline'} size={22} color={sel ? '#059669' : '#9ca3af'} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={2}>{i.name}</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {i.category}{i.price ? ` · ${formatCurrency(i.price)}` : ''}{i.hasRecipe ? ' · has a recipe' : ''}{i.variants ? ` · ${i.variants} sizes share one count` : ''}
          </Text>
          {i.tracked ? (
            <Text style={[styles.stock, { color: out ? '#b91c1c' : isLow ? '#b45309' : '#047857' }]}>
              {fmtQty(st)} {i.linked?.unit || i.stockUnit || 'pcs'}
              <Text style={[styles.stockSub, out && { color: '#b91c1c' }]}>  {out ? 'Out of stock' : isLow ? `Low (below ${fmtQty(lo)})` : lo ? `warn below ${fmtQty(lo)}` : 'in stock'}</Text>
            </Text>
          ) : (
            <Text style={styles.stockSub}>{i.match ? `stock item “${i.match.name}”: ${fmtQty(i.match.currentStock)} ${i.match.unit}` : 'not tracked'}</Text>
          )}
        </View>
        {canUpdate && (i.tracked ? (
          <View style={styles.actions}>
            {i.linked && (
              <TouchableOpacity onPress={() => onReceive?.({ kind: 'stock', item: { ...i.linked } })} style={styles.receiveBtn}>
                <Ionicons name="add" size={14} color="#fff" /><Text style={styles.receiveText}>Receive</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity disabled={busy} onPress={() => confirmStop(i)} style={styles.stopBtn}><Text style={styles.stopText}>Stop</Text></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => onReceive?.({ kind: 'menu', item: i })} style={styles.trackBtn}>
            <Text style={styles.trackText}>Track</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <FlatList
      data={shown}
      keyExtractor={(i) => String(i.id)}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={[styles.muted, { padding: 24 }]}>{items.length ? 'Nothing here.' : 'No menu items yet — add your menu first.'}</Text>}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPull} />}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  muted: { color: '#9ca3af', fontSize: 14, textAlign: 'center', marginTop: 8 },
  intro: { marginBottom: Spacing.sm },
  title: { fontSize: 16, fontWeight: '800', color: Colors.textDark },
  introText: { fontSize: 12.5, color: '#6b7280', marginTop: 2, lineHeight: 18 },
  b: { fontWeight: '700', color: '#374151' },
  liquorNote: { fontSize: 12.5, color: '#6d28d9', marginTop: 6 },
  counts: { fontSize: 12.5, color: '#374151', marginTop: 6 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9',
    borderRadius: BorderRadius.large, paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark, marginLeft: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipOn: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
  chipText: { fontSize: 12.5, color: '#4b5563', fontWeight: '500' },
  chipTextOn: { color: '#047857', fontWeight: '700' },
  error: { fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, marginTop: 6 },
  bulk: { borderWidth: 1, borderColor: '#a7f3d0', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginTop: 8 },
  bulkTitle: { fontWeight: '700', fontSize: 13.5, color: Colors.textDark, marginBottom: 8 },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bulkName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textDark },
  smallInp: { width: 82, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, fontSize: 13, backgroundColor: '#fff', color: Colors.textDark },
  bulkActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  greenBtn: { backgroundColor: '#059669', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 9 },
  greenBtnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  outlineBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#fff' },
  outlineBtnText: { fontWeight: '700', fontSize: 13.5, color: '#374151' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#f1f5f9', borderRadius: 10, backgroundColor: '#fff', marginTop: 6,
  },
  check: { paddingRight: 2 },
  name: { fontWeight: '700', color: '#111827', fontSize: 14 },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  stock: { fontWeight: '800', fontSize: 14, marginTop: 3 },
  stockSub: { fontSize: 11.5, color: '#9ca3af', fontWeight: '500', marginTop: 3 },
  actions: { alignItems: 'flex-end', gap: 6 },
  receiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#059669', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  receiveText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  stopBtn: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  stopText: { color: '#6b7280', fontSize: 12 },
  trackBtn: { borderWidth: 1.5, borderColor: '#059669', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  trackText: { color: '#047857', fontWeight: '700', fontSize: 12.5 },
});
