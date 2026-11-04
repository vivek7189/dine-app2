// "Today's prices" (native) — change many prices (each size: 500 g / 1 kg, Half / Full) and
// sold-out in one sheet. Same rules as the web screen (dine-frontend TodaysPricesEditor): saves ONLY
// changed items, one by one, through apiClient.updateMenuItem (PATCH /api/menus/item/:id), so the
// server's menu permissions apply as-is. Sizes are re-sent whole with only the price changed (cost,
// recipe multiplier, multi-tier prices kept). The menu is shared, so a save shows at once on the
// POS, QR menu and WhatsApp order bot.
import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const num = (s) => {
  const t = String(s ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return parseFloat(t);
};
const same = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

// What would be sent for one item, or null if nothing changed → { patch, invalid }.
export function priceChangeFor(it, d) {
  if (!d) return null;
  const patch = {};
  let invalid = false;
  const vs = Array.isArray(it.variants) ? it.variants : [];
  if (vs.length > 0 && d.variants) {
    let changed = false;
    const next = vs.map((v, i) => {
      if (d.variants[i] === undefined) return v;
      const n = num(d.variants[i]);
      if (n === null || n <= 0) { invalid = true; return v; }
      if (!same(n, v.price)) changed = true;
      return { ...v, price: n };
    });
    if (changed) {
      patch.variants = next;
      if (same(it.price, vs[0].price) && !same(next[0].price, vs[0].price)) patch.price = next[0].price;
    }
  } else if (d.price !== undefined) {
    const n = num(d.price);
    if (n === null || n <= 0) invalid = true;
    else if (!same(n, it.price)) patch.price = n;
  }
  if (d.isAvailable !== undefined && d.isAvailable !== (it.isAvailable !== false)) patch.isAvailable = d.isAvailable;
  if (invalid) return { patch, invalid: true };
  return Object.keys(patch).length ? { patch, invalid: false } : null;
}

export default function TodaysPricesModal({ visible, onClose, items, restaurantId, apiClient, currencySymbol = '₹', canEditPrice, canMarkOutOfStock, onItemSaved }) {
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);

  const list = useMemo(() => (items || []).filter((it) => it && it.id && it.status !== 'deleted'), [items]);
  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const m = new Map();
    list.forEach((it) => {
      if (ql && !String(it.name || '').toLowerCase().includes(ql)) return;
      const c = it.category || 'Other';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(it);
    });
    return [...m.entries()];
  }, [list, q]);

  const setField = (id, patch) => { setDone(''); setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), ...patch } })); };
  const setVariant = (id, i, val) => { setDone(''); setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), variants: { ...((d[id] || {}).variants || {}), [i]: val } } })); };

  const changes = list.map((it) => ({ it, ch: priceChangeFor(it, draft[it.id]) })).filter((x) => x.ch);
  const invalidCount = changes.filter((x) => x.ch.invalid).length;
  const toSave = changes.filter((x) => !x.ch.invalid);

  const reset = () => { setDraft({}); setError(''); setDone(''); setConfirmClose(false); setQ(''); };
  const requestClose = () => {
    if (saving) return;
    if (changes.length && !confirmClose) { setConfirmClose(true); return; }
    reset(); onClose && onClose();
  };

  const save = async () => {
    if (invalidCount) { setError('Fix the prices marked in red first (numbers only, more than 0).'); return; }
    setSaving(true); setError(''); setDone('');
    let ok = 0;
    for (const { it, ch } of toSave) {
      setProgress(`Saving ${ok + 1} of ${toSave.length}…`);
      try {
        await apiClient.updateMenuItem(it.id, ch.patch, restaurantId);
        ok += 1;
        if (onItemSaved) onItemSaved(it.id, ch.patch);
        setDraft((d) => { const n = { ...d }; delete n[it.id]; return n; });
      } catch (e) {
        setError(`Saved ${ok} of ${toSave.length}. Could not save "${it.name}": ${e?.message || 'error'}. Your other changes are still here, tap Save again.`);
        setSaving(false); setProgress('');
        return;
      }
    }
    setSaving(false); setProgress('');
    setDone(`${ok} item${ok === 1 ? '' : 's'} updated. Live now on POS, QR menu and WhatsApp.`);
  };

  const priceBox = (it, key, label, original, value, onChange) => {
    const shown = value !== undefined ? value : String(original ?? '');
    const n = value !== undefined ? num(value) : null;
    const bad = value !== undefined && (n === null || n <= 0);
    const changed = value !== undefined && !bad && !same(n, original);
    return (
      <View key={key} style={s.priceWrap}>
        {label ? <Text style={s.sizeLabel}>{label}</Text> : null}
        <Text style={s.cur}>{currencySymbol}</Text>
        <TextInput value={shown} onChangeText={onChange} editable={!!canEditPrice && !saving} keyboardType="decimal-pad"
          accessibilityLabel={`${it.name} ${label || 'price'}`}
          style={[s.input, !canEditPrice && s.inputRO, changed && s.inputChanged, bad && s.inputBad]} />
      </View>
    );
  };

  const disabled = saving || !toSave.length || invalidCount > 0;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <Text style={{ fontSize: 22 }}>🏷️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Today&apos;s prices</Text>
            <Text style={s.sub}>Change prices and sold-out in one go. Live at once on POS, QR menu and WhatsApp.</Text>
          </View>
          <TouchableOpacity onPress={requestClose} style={s.close} accessibilityLabel="Close"><Ionicons name="close" size={22} color="#111827" /></TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput value={q} onChangeText={setQ} placeholder="Search item" style={{ flex: 1, fontSize: 15, paddingVertical: 6 }} />
        </View>
        {!canEditPrice && <Text style={s.note}>You can mark items sold out. Changing prices needs menu edit permission.</Text>}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {groups.length === 0 && <Text style={s.empty}>No items found.</Text>}
          {groups.map(([cat, its]) => (
            <View key={cat}>
              <Text style={s.cat}>{String(cat).toUpperCase()}</Text>
              {its.map((it) => {
                const d = draft[it.id] || {};
                const vs = Array.isArray(it.variants) ? it.variants : [];
                const avail = d.isAvailable !== undefined ? d.isAvailable : it.isAvailable !== false;
                return (
                  <View key={it.id} style={[s.row, !avail && { opacity: 0.75 }]}>
                    <View style={s.rowTop}>
                      <Text style={s.name} numberOfLines={2}>{it.name}</Text>
                      {canMarkOutOfStock && (
                        <TouchableOpacity disabled={saving} onPress={() => setField(it.id, { isAvailable: !avail })} style={[s.pill, avail ? s.pillOn : s.pillOff]}>
                          <Text style={[s.pillText, { color: avail ? '#15803d' : '#b91c1c' }]}>{avail ? '● In stock' : '○ Sold out'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={s.prices}>
                      {vs.length > 0
                        ? vs.map((v, i) => priceBox(it, i, v.name, v.price, (d.variants || {})[i], (val) => setVariant(it.id, i, val)))
                        : priceBox(it, 0, '', it.price, d.price, (val) => setField(it.id, { price: val }))}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <View style={s.footer}>
          {!!error && <Text style={s.err}>{error}</Text>}
          {!!done && <Text style={s.ok}>✓ {done}</Text>}
          {confirmClose ? (
            <View style={s.footRow}>
              <Text style={[s.footText, { flex: 1 }]}>{changes.length} unsaved change{changes.length === 1 ? '' : 's'}. Close without saving?</Text>
              <TouchableOpacity onPress={() => setConfirmClose(false)} style={s.btnGhost}><Text style={s.btnGhostText}>Keep editing</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { reset(); onClose && onClose(); }} style={[s.btn, { backgroundColor: '#ef4444' }]}><Text style={s.btnText}>Discard</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={s.footRow}>
              <Text style={[s.footText, { flex: 1 }]}>
                {saving ? progress : changes.length ? `${changes.length} item${changes.length === 1 ? '' : 's'} changed${invalidCount ? ` · ${invalidCount} to fix` : ''}` : 'No changes yet'}
              </Text>
              <TouchableOpacity onPress={save} disabled={disabled} style={[s.btn, { backgroundColor: disabled ? '#e5e7eb' : '#ef4444' }]}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, disabled && { color: '#9ca3af' }]}>{`Save${toSave.length ? ` ${toSave.length}` : ''}`}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 18 : 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10 },
  note: { fontSize: 12, color: '#92400e', marginHorizontal: 16, marginTop: 6 },
  empty: { textAlign: 'center', color: '#6b7280', padding: 24 },
  cat: { fontSize: 12, fontWeight: '700', color: '#6b7280', letterSpacing: 0.5, paddingTop: 14, paddingBottom: 4 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  pillOn: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  pillOff: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  pillText: { fontSize: 12.5, fontWeight: '600' },
  prices: { flexDirection: 'row', flexWrap: 'wrap' },
  priceWrap: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginTop: 8, gap: 5 },
  sizeLabel: { fontSize: 12, color: '#6b7280', minWidth: 40 },
  cur: { fontSize: 13, color: '#9ca3af' },
  input: { width: 84, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', fontSize: 15, fontWeight: '600', textAlign: 'right', color: '#111827', backgroundColor: '#fff' },
  inputRO: { backgroundColor: '#f9fafb' },
  inputChanged: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  inputBad: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 28 : 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fafafa' },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footText: { fontSize: 13, color: '#6b7280' },
  err: { fontSize: 13, color: '#b91c1c', marginBottom: 8 },
  ok: { fontSize: 13, color: '#15803d', marginBottom: 8 },
  btn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, minWidth: 90, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnGhostText: { fontWeight: '600', color: '#374151' },
});
