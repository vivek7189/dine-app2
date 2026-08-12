import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius } from '../constants/Theme';
import { getCurrencySymbol } from '../utils/formatCurrency';

/**
 * BulkMenuUploadModal — AI menu upload for dine-app, matching the web (dine-frontend) flow:
 *   pick a photo / camera shot / document  →  extract with AI (same `bulkUploadMenu` API)
 *   →  REVIEW & edit the extracted items (name / price / veg / select)  →  save.
 * Uses the exact same backend endpoints as the web build, so the AI model + result are identical;
 * the only addition over the app's old auto-save flow is the clean review step.
 */
export default function BulkMenuUploadModal({ visible, onClose, restaurantId, apiClient, onSaved }) {
  const [step, setStep] = useState('pick');       // 'pick' | 'extracting' | 'review'
  const [items, setItems] = useState([]);
  const [extractedCategories, setExtractedCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState('');
  const cur = (() => { try { return getCurrencySymbol(); } catch (_) { return '₹'; } })();

  const reset = () => { setStep('pick'); setItems([]); setExtractedCategories([]); setError(''); setProcessing(''); setSaving(false); };
  const close = () => { reset(); onClose && onClose(); };

  const extract = async (fileInfo) => {
    if (!restaurantId || !fileInfo) return;
    setStep('extracting'); setError(''); setProcessing('Uploading…');
    try {
      const fd = new FormData();
      fd.append('menuFiles', fileInfo);
      setProcessing('Extracting menu with AI…');
      const resp = await apiClient.bulkUploadMenu(restaurantId, fd);
      if (resp && resp.success === false) { setError(resp.error || 'Upload failed.'); setStep('pick'); return; }
      const extracted = (resp.data || []).flatMap((m) => m.menuItems || []);
      if (!extracted.length) { setError('No menu items found — try a clearer photo or a different file.'); setStep('pick'); return; }
      setItems(extracted.map((it, i) => ({
        _id: `x${i}`, _selected: true, _raw: it,
        name: it.name || '', price: it.price != null ? String(it.price) : '',
        category: it.category || 'Uncategorized', isVeg: it.isVeg !== false,
        description: it.description || '',
      })));
      setExtractedCategories(resp.extractedCategories || []);
      setStep('review');
    } catch (e) {
      setError(e.message || 'Extraction failed. Please try again.'); setStep('pick');
    } finally { setProcessing(''); }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setError('Camera permission is required.'); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled && r.assets?.[0]?.uri) extract({ uri: r.assets[0].uri, name: 'menu.jpg', type: 'image/jpeg' });
  };
  const pickGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setError('Photo library permission is required.'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled && r.assets?.[0]?.uri) extract({ uri: r.assets[0].uri, name: r.assets[0].fileName || 'menu.jpg', type: r.assets[0].mimeType || 'image/jpeg' });
  };
  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'], copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]?.uri) { const a = r.assets[0]; extract({ uri: a.uri, name: a.name || 'menu', type: a.mimeType || 'application/octet-stream' }); }
  };

  const selectedCount = items.filter((i) => i._selected).length;
  const allSelected = items.length > 0 && items.every((i) => i._selected);
  const toggleAll = () => setItems(items.map((i) => ({ ...i, _selected: !allSelected })));
  const toggle = (id) => setItems(items.map((i) => (i._id === id ? { ...i, _selected: !i._selected } : i)));
  const update = (id, field, val) => setItems(items.map((i) => (i._id === id ? { ...i, [field]: val } : i)));

  const save = async () => {
    const sel = items.filter((i) => i._selected);
    if (!sel.length) { setError('Select at least one item to add.'); return; }
    setSaving(true); setError('');
    try {
      const payload = sel.map((i) => ({
        ...i._raw, name: i.name.trim(), price: parseFloat(i.price) || 0,
        category: i.category, isVeg: i.isVeg, description: i.description,
      }));
      await apiClient.bulkSaveMenuItems(restaurantId, payload, extractedCategories);
      onSaved && onSaved(sel.length);
      close();
    } catch (e) { setError(e.message || 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={s.container} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>AI Menu Upload</Text>
            <Text style={s.subtitle}>
              {step === 'review' ? `${selectedCount} of ${items.length} selected` : 'Snap a photo or pick a file — AI reads your menu'}
            </Text>
          </View>
          <TouchableOpacity onPress={close} style={s.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={Colors.textMedium} />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={s.errorBar}>
            <Ionicons name="alert-circle" size={16} color={Colors.error} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* ── PICK ── */}
        {step === 'pick' && (
          <ScrollView contentContainerStyle={s.pickWrap}>
            <View style={s.heroIcon}><Ionicons name="sparkles" size={30} color={Colors.primary} /></View>
            <Text style={s.heroTitle}>Add your whole menu in seconds</Text>
            <Text style={s.heroSub}>Take a picture of a printed menu, or upload a PDF / image / spreadsheet. You'll review everything before it's added.</Text>

            <TouchableOpacity style={[s.source, s.sourcePrimary]} onPress={pickCamera} activeOpacity={0.85}>
              <View style={[s.sourceIcon, { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Ionicons name="camera" size={22} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sourceTitle, { color: '#fff' }]}>Take a photo</Text>
                <Text style={[s.sourceSub, { color: 'rgba(255,255,255,0.85)' }]}>Snap your printed menu</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>

            <TouchableOpacity style={s.source} onPress={pickGallery} activeOpacity={0.85}>
              <View style={[s.sourceIcon, { backgroundColor: '#eef2ff' }]}><Ionicons name="image" size={22} color="#4f46e5" /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceTitle}>Choose from gallery</Text>
                <Text style={s.sourceSub}>Pick a menu photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.borderMedium} />
            </TouchableOpacity>

            <TouchableOpacity style={s.source} onPress={pickDocument} activeOpacity={0.85}>
              <View style={[s.sourceIcon, { backgroundColor: '#ecfdf5' }]}><Ionicons name="document-text" size={22} color={Colors.success} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sourceTitle}>Upload a file</Text>
                <Text style={s.sourceSub}>PDF, image, CSV or Excel</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.borderMedium} />
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── EXTRACTING ── */}
        {step === 'extracting' && (
          <View style={s.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={s.extractTitle}>{processing || 'Working…'}</Text>
            <Text style={s.extractSub}>Reading your menu with AI — this usually takes a few seconds.</Text>
          </View>
        )}

        {/* ── REVIEW ── */}
        {step === 'review' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.reviewBar}>
              <TouchableOpacity onPress={toggleAll} style={s.selectAll}>
                <Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={20} color={allSelected ? Colors.primary : Colors.textLight} />
                <Text style={s.selectAllText}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
              </TouchableOpacity>
              <Text style={s.reviewHint}>Tap to edit · uncheck to skip</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              {items.map((it) => (
                <View key={it._id} style={[s.card, !it._selected && s.cardOff]}>
                  <TouchableOpacity onPress={() => toggle(it._id)} style={s.check} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name={it._selected ? 'checkbox' : 'square-outline'} size={22} color={it._selected ? Colors.primary : Colors.borderMedium} />
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <View style={s.rowTop}>
                      <TouchableOpacity onPress={() => update(it._id, 'isVeg', !it.isVeg)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <View style={[s.vegDot, { borderColor: it.isVeg ? Colors.success : Colors.error }]}>
                          <View style={[s.vegInner, { backgroundColor: it.isVeg ? Colors.success : Colors.error }]} />
                        </View>
                      </TouchableOpacity>
                      <TextInput
                        style={s.nameInput}
                        value={it.name}
                        onChangeText={(t) => update(it._id, 'name', t)}
                        placeholder="Item name"
                        placeholderTextColor={Colors.textLight}
                      />
                    </View>
                    <View style={s.rowBottom}>
                      <View style={s.priceBox}>
                        <Text style={s.priceCur}>{cur}</Text>
                        <TextInput
                          style={s.priceInput}
                          value={it.price}
                          onChangeText={(t) => update(it._id, 'price', t.replace(/[^0-9.]/g, ''))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={Colors.textLight}
                        />
                      </View>
                      <View style={s.catChip}>
                        <Ionicons name="pricetag" size={12} color={Colors.textLight} />
                        <Text style={s.catText} numberOfLines={1}>{it.category}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={s.footer}>
              <TouchableOpacity style={s.secondaryBtn} onPress={() => reset()} disabled={saving}>
                <Ionicons name="camera-reverse-outline" size={18} color={Colors.textMedium} />
                <Text style={s.secondaryText}>Start over</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, (saving || !selectedCount) && { opacity: 0.6 }]} onPress={save} disabled={saving || !selectedCount}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add-circle" size={18} color="#fff" />}
                <Text style={s.primaryText}>{saving ? 'Adding…' : `Add ${selectedCount} item${selectedCount === 1 ? '' : 's'}`}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 14, backgroundColor: Colors.backgroundWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textDark, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.backgroundGray, alignItems: 'center', justifyContent: 'center' },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, marginHorizontal: Spacing.md, marginTop: Spacing.sm, padding: 10, borderRadius: BorderRadius.medium },
  errorText: { flex: 1, color: Colors.error, fontSize: 12.5, fontWeight: '600' },

  pickWrap: { padding: Spacing.lg, alignItems: 'stretch' },
  heroIcon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 14, marginTop: 8 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: Colors.textDark, textAlign: 'center', letterSpacing: -0.4 },
  heroSub: { fontSize: 13.5, color: Colors.textLight, textAlign: 'center', marginTop: 8, marginBottom: 22, lineHeight: 20, paddingHorizontal: 4 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.backgroundWhite, borderRadius: BorderRadius.large, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  sourcePrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sourceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  sourceSub: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  extractTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginTop: 18 },
  extractSub: { fontSize: 13, color: Colors.textLight, textAlign: 'center', marginTop: 8, lineHeight: 19 },

  reviewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 10, backgroundColor: Colors.backgroundWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectAllText: { fontSize: 13.5, fontWeight: '700', color: Colors.textMedium },
  reviewHint: { fontSize: 11.5, color: Colors.textLight },

  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: Colors.backgroundWhite, borderRadius: BorderRadius.large, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.borderLight },
  cardOff: { opacity: 0.5 },
  check: { paddingTop: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vegDot: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  vegInner: { width: 7, height: 7, borderRadius: 4 },
  nameInput: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textDark, padding: 0 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  priceBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundGray, borderRadius: BorderRadius.medium, paddingHorizontal: 10, height: 34, minWidth: 92 },
  priceCur: { fontSize: 13, fontWeight: '700', color: Colors.textMedium, marginRight: 3 },
  priceInput: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textDark, padding: 0 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f1f5f9', borderRadius: BorderRadius.full, paddingHorizontal: 10, height: 28, maxWidth: 160 },
  catText: { fontSize: 12, fontWeight: '600', color: Colors.textMedium },

  footer: { flexDirection: 'row', gap: 10, padding: Spacing.md, backgroundColor: Colors.backgroundWhite, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 50, paddingHorizontal: 16, borderRadius: BorderRadius.large, borderWidth: 1, borderColor: Colors.borderMedium, backgroundColor: Colors.backgroundWhite },
  secondaryText: { fontSize: 14, fontWeight: '700', color: Colors.textMedium },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: BorderRadius.large, backgroundColor: Colors.primary },
  primaryText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
