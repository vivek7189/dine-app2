import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_print_settings';

const PRINT_TOGGLES = [
  {
    key: 'manualPrintEnabled',
    title: 'Show Manual Print Button',
    hint: 'Show print button on KOT and bill screens for manual printing',
    icon: 'hand-left-outline',
    color: '#6366f1',
    bg: '#eef2ff',
  },
  {
    key: 'autoPrintOnKOT',
    title: 'Auto-Print on KOT',
    hint: 'Automatically print when order is sent to kitchen',
    icon: 'document-text-outline',
    color: '#f59e0b',
    bg: '#fffbeb',
  },
  {
    key: 'autoPrintOnBilling',
    title: 'Auto-Print on Billing',
    hint: 'Automatically print bill when billing is completed',
    icon: 'receipt-outline',
    color: '#10b981',
    bg: '#ecfdf5',
  },
  {
    key: 'tokenBillingEnabled',
    title: 'Food Court Token Billing',
    hint: 'Print category-wise token slips after billing for counter pickup',
    icon: 'ticket-outline',
    color: '#ec4899',
    bg: '#fdf2f8',
  },
  {
    key: 'imagePrintEnabled',
    title: 'Image Receipts (beta)',
    hint: 'Print bill/KOT as a designed image (same look as desktop) instead of plain text. Only for thermal printers that support image printing — falls back to text automatically. Leave OFF unless supported. (Note: symbols like ₹ that no thermal printer can print as text auto-use image so the real symbol shows; it falls back to "Rs" if the printer can\'t do images.)',
    icon: 'image-outline',
    color: '#0891b2',
    bg: '#ecfeff',
  },
];

const DEFAULT_SETTINGS = {
  manualPrintEnabled: true,
  autoPrintOnKOT: true,
  autoPrintOnBilling: true,
  tokenBillingEnabled: false,
  imagePrintEnabled: false,
};

export default function PrintSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [original, setOriginal] = useState(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);
  const [restaurantLogo, setRestaurantLogo] = useState(null); // legacy restaurant.logo (display fallback)
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [restaurantId]);

  const loadSettings = async () => {
    if (!restaurantId) return;
    try {
      const cached = await AsyncStorage.getItem(`${STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setSettings(data);
        setOriginal(data);
        setLoading(false);
      }
      fetchSettings();
    } catch {
      fetchSettings();
    }
    // Fetch restaurant logo (read-only, set by admin on web/Electron)
    apiClient.getRestaurant(restaurantId).then(res => {
      const r = res?.restaurant || res;
      if (r?.logo) setRestaurantLogo(r.logo);
    }).catch(() => {});
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.getPrintSettings(restaurantId);
      const ps = response.printSettings || DEFAULT_SETTINGS;
      setSettings(ps);
      setOriginal(ps);
      setIsDirty(false);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(ps));
    } catch (error) {
      console.error('Error fetching print settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleCancel = () => {
    setSettings(original);
    setIsDirty(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.updatePrintSettings(restaurantId, settings);
      setOriginal(settings);
      setIsDirty(false);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      // Apply the image-print flag to the running session immediately (default OFF).
      try { require('../services/printerService').setImagePrintConfig({ enabled: settings.imagePrintEnabled, printerWidth: settings.printerWidth, autoImageForCurrency: settings.autoImageForCurrency }); } catch (_) {}
      if (onSettingsChange) onSettingsChange(settings);
      Alert.alert('Saved', 'Print settings updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Update the receiptLogo sub-object (single source of truth, same field the web uses → 2-way sync).
  const setLogo = (patch) => {
    setSettings((prev) => ({ ...prev, receiptLogo: { ...(prev.receiptLogo || {}), ...patch } }));
    setIsDirty(true);
  };

  // Pick + upload a logo via the SAME endpoint the web uses (/api/upload/image → { imageUrl }),
  // then store it in printSettings.receiptLogo.url so it syncs to web and renders on prints.
  const handlePickAndUploadLogo = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to upload a logo.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setLogoUploading(true);
      const fd = new FormData();
      fd.append('image', { uri: asset.uri, name: 'logo.jpg', type: 'image/jpeg' });
      const res = await apiClient.uploadImage(fd);
      if (res?.imageUrl) {
        setLogo({
          url: res.imageUrl,
          enabled: true,
          position: settings.receiptLogo?.position || 'center',
          size: settings.receiptLogo?.size || 80,
          nameAlignment: settings.receiptLogo?.nameAlignment || 'center',
        });
      } else {
        Alert.alert('Upload failed', 'No image URL returned by the server.');
      }
    } catch (e) {
      Alert.alert('Upload failed', e.message || 'Could not upload logo');
    } finally {
      setLogoUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {PRINT_TOGGLES.map((item, idx) => (
        <View key={item.key} style={[styles.toggleRow, idx === PRINT_TOGGLES.length - 1 && { borderBottomWidth: 0 }]}>
          <View style={[styles.toggleIconWrap, { backgroundColor: item.bg }]}>
            <Ionicons name={item.icon} size={18} color={item.color} />
          </View>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>{item.title}</Text>
            <Text style={styles.toggleHint}>{item.hint}</Text>
          </View>
          <Switch
            value={!!settings[item.key]}
            onValueChange={(val) => handleToggle(item.key, val)}
            trackColor={{ false: '#e5e7eb', true: item.color + '40' }}
            thumbColor={settings[item.key] ? item.color : '#d1d5db'}
          />
        </View>
      ))}

      {/* Paper Size */}
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionLabel}>Paper Size</Text>
      </View>
      <View style={styles.paperSizeRow}>
        <View style={[styles.toggleIconWrap, { backgroundColor: '#fef3c7' }]}>
          <Ionicons name="resize-outline" size={18} color="#d97706" />
        </View>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Printer Paper Width</Text>
          <Text style={styles.toggleHint}>Select your thermal printer's paper size</Text>
        </View>
      </View>
      <View style={styles.paperBtnRow}>
        {[80, 58].map(size => {
          const isActive = (settings.printerWidth || 80) === size;
          return (
            <TouchableOpacity
              key={size}
              style={[styles.paperBtn, isActive && styles.paperBtnActive]}
              onPress={() => { handleToggle('printerWidth', size); }}
            >
              <Text style={[styles.paperBtnText, isActive && styles.paperBtnTextActive]}>{size}mm</Text>
              <Text style={[styles.paperBtnHint, isActive && styles.paperBtnHintActive]}>
                {size === 80 ? 'Standard' : 'Compact'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Receipt Logo */}
      <View style={styles.sectionDivider}>
        <Text style={styles.sectionLabel}>Receipt Logo</Text>
      </View>
      {(() => {
        // Single source of truth = printSettings.receiptLogo.url (what the web writes + the print
        // template reads). Fall back to legacy restaurant.logo only for display if url is empty.
        const logoUrl = settings.receiptLogo?.url || restaurantLogo || null;
        const logoSize = settings.receiptLogo?.size || 80;
        return (
          <View style={styles.logoSection}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={22} color="#d1d5db" />
              </View>
            )}
            <View style={styles.logoInfo}>
              <View style={styles.logoBtnRow}>
                <TouchableOpacity style={[styles.logoUploadBtn, logoUploading && { opacity: 0.6 }]} onPress={handlePickAndUploadLogo} disabled={logoUploading}>
                  {logoUploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload-outline" size={15} color="#fff" />}
                  <Text style={styles.logoUploadText}>{logoUploading ? 'Uploading…' : (logoUrl ? 'Change Logo' : 'Upload Logo')}</Text>
                </TouchableOpacity>
                {logoUrl ? (
                  <TouchableOpacity style={styles.logoRemoveBtn} onPress={() => setLogo({ url: '', enabled: false })} disabled={logoUploading}>
                    <Ionicons name="trash-outline" size={15} color="#dc2626" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {logoUrl ? (
                <>
                  <View style={styles.logoToggleRow}>
                    <Text style={styles.toggleLabel}>Show Logo on Bill</Text>
                    <Switch
                      value={!!settings.receiptLogo?.enabled}
                      onValueChange={(val) => setLogo({ enabled: val, url: logoUrl })}
                      trackColor={{ false: '#e5e7eb', true: '#ef444440' }}
                      thumbColor={settings.receiptLogo?.enabled ? '#ef4444' : '#d1d5db'}
                    />
                  </View>
                  <View style={styles.logoToggleRow}>
                    <Text style={styles.toggleLabel}>Logo Size</Text>
                    <View style={styles.sizeStepper}>
                      <TouchableOpacity style={styles.sizeBtn} onPress={() => setLogo({ size: Math.max(40, logoSize - 10) })}>
                        <Ionicons name="remove" size={16} color="#374151" />
                      </TouchableOpacity>
                      <Text style={styles.sizeVal}>{logoSize}px</Text>
                      <TouchableOpacity style={styles.sizeBtn} onPress={() => setLogo({ size: Math.min(200, logoSize + 10) })}>
                        <Ionicons name="add" size={16} color="#374151" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : null}
              <Text style={styles.logoHint}>Upload here or on the web dashboard — it syncs both ways and prints at the top of bills.</Text>
            </View>
          </View>
        );
      })()}

      {/* Save/Cancel bar */}
      {isDirty && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Ionicons name="close" size={16} color="#6b7280" />
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={styles.saveButtonText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  loadingWrap: {
    backgroundColor: '#fff',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMedium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  toggleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 10,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  toggleHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#16a34a',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sectionDivider: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  paperSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  paperBtnRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  paperBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paperBtnActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  paperBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b7280',
  },
  paperBtnTextActive: {
    color: '#ef4444',
  },
  paperBtnHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  paperBtnHintActive: {
    color: '#ef4444',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  logoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logoUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoUploadText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoRemoveBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sizeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeVal: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    minWidth: 40,
    textAlign: 'center',
  },
  logoPreview: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  logoInfo: {
    flex: 1,
  },
  logoToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
    lineHeight: 15,
  },
  noLogoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  noLogoText: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
});
