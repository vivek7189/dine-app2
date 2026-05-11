import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_print_settings';

const KOT_TOGGLES = [
  {
    key: 'kotPrinterEnabled',
    title: 'KOT Printer App (Auto-Print)',
    hint: 'Enable automatic printing via dine-kot-printer app',
    icon: 'print-outline',
  },
  {
    key: 'showKOTSummaryAfterOrder',
    title: 'Show KOT Summary After Order',
    hint: 'Display order summary on dashboard after placing order to kitchen',
    icon: 'eye-outline',
  },
  {
    key: 'autoPrintOnKOT',
    title: 'Auto-Print on KOT',
    hint: 'Automatically print when order is sent to kitchen',
    icon: 'document-text-outline',
  },
  {
    key: 'usePusherForKOT',
    title: 'Use Pusher for KOT',
    hint: 'Use real-time Pusher instead of polling for KOT updates',
    icon: 'flash-outline',
  },
];

const BILLING_TOGGLES = [
  {
    key: 'manualPrintEnabled',
    title: 'Manual Print Button',
    hint: 'Show manual print button on dashboard order summary',
    icon: 'hand-left-outline',
  },
  {
    key: 'showBillSummaryAfterBilling',
    title: 'Show Bill Summary After Billing',
    hint: 'Display bill summary on dashboard after completing billing',
    icon: 'receipt-outline',
  },
  {
    key: 'autoPrintOnBilling',
    title: 'Auto-Print on Billing',
    hint: 'Automatically print bill when billing is completed (uses system print dialog)',
    icon: 'card-outline',
  },
  {
    key: 'tokenBillingEnabled',
    title: 'Food Court Token Billing',
    hint: 'Print separate category-wise token slips after billing for counter pickup',
    icon: 'ticket-outline',
  },
];

const DEFAULT_SETTINGS = {
  kotPrinterEnabled: true,
  manualPrintEnabled: true,
  showKOTSummaryAfterOrder: true,
  showBillSummaryAfterBilling: true,
  autoPrintOnKOT: true,
  autoPrintOnBilling: false,
  usePusherForKOT: false,
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
      Alert.alert('Success', 'Print settings saved');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const renderToggle = (item) => (
    <View key={item.key} style={styles.toggleRow}>
      <View style={styles.toggleIconWrap}>
        <Ionicons name={item.icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{item.title}</Text>
        <Text style={styles.toggleHint}>{item.hint}</Text>
      </View>
      <Switch
        value={!!settings[item.key]}
        onValueChange={(val) => handleToggle(item.key, val)}
        trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
        thumbColor={settings[item.key] ? Colors.primary : '#f4f4f5'}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading print settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={18} color="#3b82f6" />
        <Text style={styles.infoBannerText}>
          Configure printing behavior and order summary display settings for your restaurant dashboard.
        </Text>
      </View>

      {/* KOT Settings */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="restaurant-outline" size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>KOT Settings</Text>
        </View>
        {KOT_TOGGLES.map(renderToggle)}
      </View>

      {/* Billing Settings */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Ionicons name="wallet-outline" size={18} color={Colors.primary} />
          <Text style={styles.sectionTitle}>Billing Settings</Text>
        </View>
        {BILLING_TOGGLES.map(renderToggle)}
      </View>

      {/* Save/Cancel */}
      {isDirty && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
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
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#eff6ff',
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  toggleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  toggleHint: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
