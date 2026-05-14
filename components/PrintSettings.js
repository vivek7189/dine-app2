import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
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
];

const DEFAULT_SETTINGS = {
  manualPrintEnabled: true,
  autoPrintOnKOT: true,
  autoPrintOnBilling: true,
  tokenBillingEnabled: false,
};

export default function PrintSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [original, setOriginal] = useState(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);

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
});
