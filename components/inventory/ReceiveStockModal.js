// Receive stock (same as the web sheet) — one sheet for "stock came in": search stock items AND menu
// items together.
//   • a stock item            → how much came in (or packs × pack size), cost, supplier, expiry, note
//                               → ADDED to the live stock (never a total), recorded in History, the
//                               linked menu item goes back in stock
//   • a menu item not tracked → start tracking it as "sold as is" with how many you have now
//                               (re-uses a same-name stock item instead of creating a duplicate)
// A double press / retry adds only once (requestId).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Spacing, BorderRadius } from '../../constants/Theme';
import { fmtQty } from '../../utils/formatQty';
import { getCurrencySymbol } from '../../utils/formatCurrency';

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const num = (v) => Number(String(v).replace(',', '.'));
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

// Defined outside the component: an inline component would remount its inputs on every keystroke.
const Field = ({ label, children }) => <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text>{children}</View>;

export default function ReceiveStockModal({ visible, onClose, restaurantId, inventoryItems = [], preset = null, onDone }) {
  const [sold, setSold] = useState(null); // menu items (sold-as-is view), loaded on open
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null); // { kind: 'stock', item } | { kind: 'menu', item }
  const [qty, setQty] = useState('');
  const [usePacks, setUsePacks] = useState(false);
  const [packs, setPacks] = useState('');
  const [packSize, setPackSize] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [low, setLow] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reqId = useRef(newRequestId());

  useEffect(() => {
    if (!visible) return;
    reqId.current = newRequestId();
    setQ(''); setUsePacks(false); setPacks(''); setPackSize(''); setCost(''); setSupplier(''); setExpiry(''); setNote(''); setLow(''); setError('');
    setPick(preset || null);
    setQty(preset?.kind === 'menu' && preset.item?.match ? String(preset.item.match.currentStock || 0) : '');
    setSold(null);
    if (restaurantId) apiClient.getSoldAsIs(restaurantId).then(r => setSold(r.items || [])).catch(() => setSold([]));
  }, [visible, restaurantId, preset]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const linkedIds = new Set((sold || []).filter(m => m.linked).map(m => String(m.linked.id)));
    const stock = (inventoryItems || []).map(it => ({ kind: 'stock', item: it, key: 's' + (it.id || it._id), label: it.name || '',
      sub: `${fmtQty(it.currentStock || 0)} ${it.unit || ''} in stock${linkedIds.has(String(it.id || it._id)) ? ' · sold as is' : ''}` }));
    const menu = (sold || []).filter(m => !m.tracked && !(m.liquor || m.liquorCategory)).map(m => ({ kind: 'menu', item: m, key: 'm' + m.id, label: m.name,
      sub: m.match ? `Menu item — will use your stock item "${m.match.name}" (${fmtQty(m.match.currentStock)} ${m.match.unit})` : 'Menu item — start tracking (sold as is)' }));
    const all = [...stock, ...menu];
    return (t ? all.filter(r => r.label.toLowerCase().includes(t)) : all).slice(0, 40);
  }, [q, inventoryItems, sold]);

  const totalQty = usePacks ? (num(packs) || 0) * (num(packSize) || 0) : num(qty) || 0;
  const stockItem = pick?.kind === 'stock' ? pick.item : null;
  const menuItem = pick?.kind === 'menu' ? pick.item : null;
  const unit = stockItem?.unit || '';

  const save = async () => {
    if (busy) return;
    setError('');
    if (stockItem) {
      if (!(totalQty > 0)) { setError('Enter how much came in.'); return; }
      if (expiry && !isDate(expiry)) { setError('Expiry date as YYYY-MM-DD, or leave it empty.'); return; }
      setBusy(true);
      try {
        const r = await apiClient.receiveStock(restaurantId, stockItem.id || stockItem._id, {
          quantity: totalQty, requestId: reqId.current,
          ...(cost !== '' && Number.isFinite(num(cost)) ? { costPerUnit: num(cost) } : {}),
          ...(supplier.trim() ? { supplier: supplier.trim() } : {}), ...(expiry ? { expiryDate: expiry } : {}), ...(note.trim() ? { note: note.trim() } : {}),
          ...(usePacks ? { packs: num(packs), packSize: num(packSize) } : {}),
        });
        onDone?.(`Added ${fmtQty(totalQty)} ${unit} to ${stockItem.name} — now ${fmtQty(r.currentStock)} ${r.unit || unit}`);
        onClose?.();
      } catch (e) { setError(e?.message || 'Could not add stock.'); }
      finally { setBusy(false); }
    } else if (menuItem) {
      if (qty === '' || !(num(qty) >= 0)) { setError('Enter how many you have now (0 if none).'); return; }
      setBusy(true);
      try {
        const r = await apiClient.trackSoldAsIs(restaurantId, [{ menuItemId: menuItem.id, track: true, openingStock: num(qty), ...(low !== '' ? { lowStock: num(low) || 0 } : {}) }]);
        const res = (r.results || [])[0];
        if (!res || !res.ok) throw new Error(res?.error || 'Could not start tracking');
        onDone?.(`${menuItem.name} is now tracked${menuItem.match ? ` (using your stock item "${menuItem.match.name}")` : ''}.`);
        onClose?.();
      } catch (e) { setError(e?.message || 'Could not start tracking.'); }
      finally { setBusy(false); }
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{menuItem ? 'Start tracking' : 'Receive stock'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Ionicons name="close" size={22} color={Colors.textDark} /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.md, paddingBottom: 30 }}>
            {!pick ? (
              <>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={16} color={Colors.textLight} />
                  <TextInput style={styles.searchInput} value={q} onChangeText={setQ} placeholder="Search a stock item or menu item (e.g. Coke)" placeholderTextColor={Colors.textLight} />
                </View>
                {sold === null && <ActivityIndicator color="#059669" style={{ marginTop: 16 }} />}
                {sold !== null && results.length === 0 && <Text style={styles.muted}>Nothing matches. Add it as a new item from the Stock tab.</Text>}
                {sold !== null && results.map(r => (
                  <TouchableOpacity key={r.key} style={styles.result}
                    onPress={() => { setPick(r); setQty(r.kind === 'menu' && r.item.match ? String(r.item.match.currentStock || 0) : ''); setError(''); }}>
                    <View style={[styles.resultIcon, { backgroundColor: r.kind === 'stock' ? '#ecfdf5' : '#eef2ff' }]}>
                      <Ionicons name={r.kind === 'stock' ? 'cube' : 'restaurant'} size={14} color={r.kind === 'stock' ? '#047857' : '#4338ca'} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.resultName} numberOfLines={1}>{r.label}</Text>
                      <Text style={styles.resultSub} numberOfLines={2}>{r.sub}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                <View style={styles.picked}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickedName}>{(stockItem || menuItem).name}</Text>
                    <Text style={styles.resultSub}>
                      {stockItem ? `${fmtQty(stockItem.currentStock || 0)} ${unit} in stock now`
                        : menuItem.match ? `Will use your stock item "${menuItem.match.name}" — ${fmtQty(menuItem.match.currentStock)} ${menuItem.match.unit}`
                          : 'Menu item — each sale will reduce its stock'}
                    </Text>
                  </View>
                  {!preset && <TouchableOpacity onPress={() => { setPick(null); setError(''); }}><Text style={styles.link}>Change</Text></TouchableOpacity>}
                </View>

                {stockItem && (
                  <>
                    <TouchableOpacity style={styles.toggle} onPress={() => setUsePacks(v => !v)}>
                      <Ionicons name={usePacks ? 'checkbox' : 'square-outline'} size={20} color={usePacks ? '#059669' : '#9ca3af'} />
                      <Text style={styles.toggleText}>Came in packs / crates</Text>
                    </TouchableOpacity>
                    {usePacks ? (
                      <View style={styles.row2}>
                        <Field label="Packs"><TextInput style={styles.input} keyboardType="decimal-pad" value={packs} onChangeText={setPacks} placeholder="5" placeholderTextColor={Colors.textLight} /></Field>
                        <Field label={`${unit || 'Units'} in one pack`}><TextInput style={styles.input} keyboardType="decimal-pad" value={packSize} onChangeText={setPackSize} placeholder="24" placeholderTextColor={Colors.textLight} /></Field>
                      </View>
                    ) : (
                      <Field label={`How much came in (${unit || 'units'})`}><TextInput style={styles.input} keyboardType="decimal-pad" value={qty} onChangeText={setQty} placeholder="e.g. 24" placeholderTextColor={Colors.textLight} /></Field>
                    )}
                    {totalQty > 0 && <Text style={styles.adds}>Adds {fmtQty(totalQty)} {unit} → {fmtQty((Number(stockItem.currentStock) || 0) + totalQty)} {unit} in stock</Text>}
                    <View style={styles.row2}>
                      <Field label={`Cost per ${unit || 'unit'} (${getCurrencySymbol()})`}><TextInput style={styles.input} keyboardType="decimal-pad" value={cost} onChangeText={setCost} placeholder={stockItem.costPerUnit ? String(stockItem.costPerUnit) : 'optional'} placeholderTextColor={Colors.textLight} /></Field>
                      <Field label="Expiry (optional)"><TextInput style={styles.input} value={expiry} onChangeText={setExpiry} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textLight} autoCapitalize="none" /></Field>
                    </View>
                    <View style={styles.row2}>
                      <Field label="Supplier (optional)"><TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholder={stockItem.supplier || ''} placeholderTextColor={Colors.textLight} /></Field>
                      <Field label="Note (optional)"><TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Bill no. …" placeholderTextColor={Colors.textLight} /></Field>
                    </View>
                  </>
                )}
                {menuItem && (
                  <>
                    <View style={styles.row2}>
                      <Field label="How many do you have now?"><TextInput style={styles.input} keyboardType="decimal-pad" value={qty} onChangeText={setQty} placeholder="e.g. 48" placeholderTextColor={Colors.textLight} /></Field>
                      <Field label="Warn me below (optional)"><TextInput style={styles.input} keyboardType="decimal-pad" value={low} onChangeText={setLow} placeholder="e.g. 10" placeholderTextColor={Colors.textLight} /></Field>
                    </View>
                    {qty !== '' && num(qty) === 0 && <Text style={styles.warn}>With 0 it shows “out of stock” until you add stock.</Text>}
                  </>
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.footer}>
                  <TouchableOpacity onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity disabled={busy} onPress={save} style={[styles.saveBtn, busy && { opacity: 0.6 }]}>
                    <Text style={styles.saveText}>{busy ? 'Saving…' : stockItem ? 'Add stock' : 'Start tracking'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: Platform.OS === 'ios' ? 20 : 8 },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: BorderRadius.large, paddingHorizontal: 12, height: 42 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark, marginLeft: 8 },
  muted: { color: '#9ca3af', fontSize: 13, marginTop: 12 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 8 },
  resultIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resultName: { fontWeight: '700', fontSize: 14, color: '#111827' },
  resultSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#f9fafb', borderRadius: 10 },
  pickedName: { fontWeight: '800', color: '#111827', fontSize: 15 },
  link: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  toggleText: { fontSize: 13.5, color: '#374151' },
  row2: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: BorderRadius.medium,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: Colors.textDark,
  },
  adds: { fontSize: 12.5, color: '#047857', fontWeight: '600', marginTop: 8 },
  warn: { fontSize: 12, color: '#b45309', marginTop: 8 },
  error: { fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, marginTop: 12 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  cancelBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 10 },
  cancelText: { fontWeight: '700', color: '#374151' },
  saveBtn: { backgroundColor: '#059669', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 10 },
  saveText: { color: '#fff', fontWeight: '800' },
});
