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
  const [restaurantLogo, setRestaurantLogo] = useState(null); // Logo URL from restaurant data

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
      {restaurantLogo ? (
        <View style={styles.logoSection}>
          <Image source={{ uri: restaurantLogo }} style={styles.logoPreview} resizeMode="contain" />
          <View style={styles.logoInfo}>
            <View style={styles.logoToggleRow}>
              <Text style={styles.toggleLabel}>Show Logo on Bill</Text>
              <Switch
                value={!!settings.receiptLogo?.enabled}
                onValueChange={(val) => {
                  setSettings(prev => ({
                    ...prev,
                    receiptLogo: { ...(prev.receiptLogo || {}), enabled: val, url: restaurantLogo },
                  }));
                  setIsDirty(true);
                }}
                trackColor={{ false: '#e5e7eb', true: '#ef444440' }}
                thumbColor={settings.receiptLogo?.enabled ? '#ef4444' : '#d1d5db'}
              />
            </View>
            <Text style={styles.logoHint}>Logo is uploaded by admin from the web dashboard. It will appear at the top of printed bills.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.noLogoSection}>
          <Ionicons name="image-outline" size={24} color="#d1d5db" />
          <Text style={styles.noLogoText}>No logo uploaded. Admin can upload from web dashboard.</Text>
        </View>
      )}

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
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
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
