import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';
import { getCurrencySymbol } from '../utils/formatCurrency';

const DEFAULT_SETTINGS = {
  serviceChargeEnabled: false,
  serviceChargeRate: 10,
  serviceChargeLabel: 'Service Charge',
  roundOffEnabled: false,
  roundOffTo: 1,
  tipsEnabled: false,
  tipPresets: [5, 10, 15, 20],
  cashTenderingEnabled: false,
  denominations: [10, 20, 50, 100, 200, 500, 2000],
  splitPaymentEnabled: false,
  partialPaymentEnabled: false,
  compVoidEnabled: false,
  compVoidRequiresPin: true,
  managerPin: '',
  refundsEnabled: false,
  refundsRequireApproval: true,
};

const DENOMINATION_OPTIONS = [10, 20, 50, 100, 200, 500, 1000, 2000];
const ROUND_OFF_OPTIONS = [
  { value: 1 },
  { value: 5 },
  { value: 10 },
];

export default function BillingSettings({ restaurantId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    loadSettings();
  }, [restaurantId]);

  const loadSettings = async () => {
    if (!restaurantId) return;
    try {
      const response = await apiClient.getBillingSettings(restaurantId);
      if (response && response.billingSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...response.billingSettings });
      } else if (response && !response.billingSettings) {
        setSettings({ ...DEFAULT_SETTINGS, ...response });
      }
    } catch (error) {
      console.error('Error loading billing settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updated) => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      await apiClient.updateBillingSettings(restaurantId, updated);
    } catch (error) {
      console.error('Error saving billing settings:', error);
      Alert.alert('Error', 'Failed to save billing settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    saveSettings(updated);
  };

  const toggleDenomination = (denom) => {
    const current = settings.denominations || [];
    const updated = current.includes(denom)
      ? current.filter(d => d !== denom)
      : [...current, denom].sort((a, b) => a - b);
    updateField('denominations', updated);
  };

  const updateTipPreset = (index, value) => {
    const presets = [...(settings.tipPresets || [5, 10, 15, 20])];
    presets[index] = value ? parseInt(value) || 0 : 0;
    updateField('tipPresets', presets);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading billing settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="receipt-outline" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Billing Settings</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Service Charge */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="add-circle-outline" size={20} color="#059669" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Service Charge</Text>
            <Text style={styles.cardSubtitle}>Auto-add service charge to all orders</Text>
          </View>
          <Switch
            value={settings.serviceChargeEnabled}
            onValueChange={(v) => updateField('serviceChargeEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#059669' + '50' }}
            thumbColor={settings.serviceChargeEnabled ? '#059669' : '#f4f4f5'}
          />
        </View>
        {settings.serviceChargeEnabled && (
          <View style={styles.cardBody}>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Rate (%)</Text>
              <TextInput
                style={styles.smallInput}
                keyboardType="decimal-pad"
                value={String(settings.serviceChargeRate || '')}
                onChangeText={(v) => {
                  const num = parseFloat(v) || 0;
                  setSettings(s => ({ ...s, serviceChargeRate: num }));
                }}
                onBlur={() => saveSettings(settingsRef.current)}
                placeholder="10"
                placeholderTextColor="#9ca3af"
              />
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Label</Text>
              <TextInput
                style={[styles.smallInput, { flex: 1 }]}
                value={settings.serviceChargeLabel || ''}
                onChangeText={(v) => setSettings(s => ({ ...s, serviceChargeLabel: v }))}
                onBlur={() => saveSettings(settingsRef.current)}
                placeholder="Service Charge"
                placeholderTextColor="#9ca3af"
              />
            </View>
          </View>
        )}
      </View>

      {/* Round-off */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="refresh-outline" size={20} color="#7c3aed" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Round-off</Text>
            <Text style={styles.cardSubtitle}>Round bill totals to nearest value</Text>
          </View>
          <Switch
            value={settings.roundOffEnabled}
            onValueChange={(v) => updateField('roundOffEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#7c3aed' + '50' }}
            thumbColor={settings.roundOffEnabled ? '#7c3aed' : '#f4f4f5'}
          />
        </View>
        {settings.roundOffEnabled && (
          <View style={styles.cardBody}>
            <Text style={styles.inputLabel}>Round to nearest</Text>
            <View style={styles.segmentRow}>
              {ROUND_OFF_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.segmentButton,
                    settings.roundOffTo === opt.value && styles.segmentButtonActive,
                  ]}
                  onPress={() => updateField('roundOffTo', opt.value)}
                >
                  <Text style={[
                    styles.segmentText,
                    settings.roundOffTo === opt.value && styles.segmentTextActive,
                  ]}>
                    {getCurrencySymbol()}{opt.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Cash Tendering */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="cash-outline" size={20} color="#d97706" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Cash Tendering</Text>
            <Text style={styles.cardSubtitle}>Quick denomination buttons for cash payments</Text>
          </View>
          <Switch
            value={settings.cashTenderingEnabled}
            onValueChange={(v) => updateField('cashTenderingEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#d97706' + '50' }}
            thumbColor={settings.cashTenderingEnabled ? '#d97706' : '#f4f4f5'}
          />
        </View>
        {settings.cashTenderingEnabled && (
          <View style={styles.cardBody}>
            <Text style={styles.inputLabel}>Denominations</Text>
            <View style={styles.denomRow}>
              {DENOMINATION_OPTIONS.map((d) => {
                const selected = (settings.denominations || []).includes(d);
                return (
                  <TouchableOpacity
                    key={d}
                    style={[styles.denomChip, selected && styles.denomChipActive]}
                    onPress={() => toggleDenomination(d)}
                  >
                    <Text style={[styles.denomText, selected && styles.denomTextActive]}>
                      {d >= 1000 ? `${d/1000}K` : d}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {/* Split Payment */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="git-branch-outline" size={20} color="#2563eb" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Split Payment</Text>
            <Text style={styles.cardSubtitle}>Allow splitting bill across payment methods</Text>
          </View>
          <Switch
            value={settings.splitPaymentEnabled}
            onValueChange={(v) => updateField('splitPaymentEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#2563eb' + '50' }}
            thumbColor={settings.splitPaymentEnabled ? '#2563eb' : '#f4f4f5'}
          />
        </View>
      </View>

      {/* Tips */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="heart-outline" size={20} color="#ec4899" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Tips</Text>
            <Text style={styles.cardSubtitle}>Allow adding tips to orders</Text>
          </View>
          <Switch
            value={settings.tipsEnabled}
            onValueChange={(v) => updateField('tipsEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#ec4899' + '50' }}
            thumbColor={settings.tipsEnabled ? '#ec4899' : '#f4f4f5'}
          />
        </View>
        {settings.tipsEnabled && (
          <View style={styles.cardBody}>
            <Text style={styles.inputLabel}>Tip Presets (%)</Text>
            <View style={styles.presetRow}>
              {(settings.tipPresets || [5, 10, 15, 20]).map((preset, i) => (
                <TextInput
                  key={i}
                  style={styles.presetInput}
                  keyboardType="number-pad"
                  value={String(preset || '')}
                  onChangeText={(v) => updateTipPreset(i, v)}
                  placeholder={`${[5,10,15,20][i]}%`}
                  placeholderTextColor="#9ca3af"
                  maxLength={3}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Partial Payment (Khata) */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="wallet-outline" size={20} color="#f59e0b" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Partial Payment (Khata)</Text>
            <Text style={styles.cardSubtitle}>Allow customers to pay partially, track credit</Text>
          </View>
          <Switch
            value={settings.partialPaymentEnabled}
            onValueChange={(v) => updateField('partialPaymentEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#f59e0b' + '50' }}
            thumbColor={settings.partialPaymentEnabled ? '#f59e0b' : '#f4f4f5'}
          />
        </View>
      </View>

      {/* Comp/Void */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="gift-outline" size={20} color="#14b8a6" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Comp / Void</Text>
            <Text style={styles.cardSubtitle}>Complimentary items or void items from orders</Text>
          </View>
          <Switch
            value={settings.compVoidEnabled}
            onValueChange={(v) => updateField('compVoidEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#14b8a6' + '50' }}
            thumbColor={settings.compVoidEnabled ? '#14b8a6' : '#f4f4f5'}
          />
        </View>
        {settings.compVoidEnabled && (
          <View style={styles.cardBody}>
            <View style={styles.checkRow}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => updateField('compVoidRequiresPin', !settings.compVoidRequiresPin)}
              >
                <Ionicons
                  name={settings.compVoidRequiresPin ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={settings.compVoidRequiresPin ? '#14b8a6' : '#9ca3af'}
                />
                <Text style={styles.checkLabel}>Require Manager PIN</Text>
              </TouchableOpacity>
            </View>
            {settings.compVoidRequiresPin && (
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Manager PIN</Text>
                <TextInput
                  style={styles.smallInput}
                  secureTextEntry
                  keyboardType="number-pad"
                  value={settings.managerPin || ''}
                  onChangeText={(v) => setSettings(s => ({ ...s, managerPin: v }))}
                  onBlur={() => saveSettings(settingsRef.current)}
                  placeholder="Enter PIN"
                  placeholderTextColor="#9ca3af"
                  maxLength={6}
                />
              </View>
            )}
          </View>
        )}
      </View>

      {/* Refunds */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons name="return-down-back-outline" size={20} color="#ef4444" />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>Refunds</Text>
            <Text style={styles.cardSubtitle}>Allow processing refunds on completed orders</Text>
          </View>
          <Switch
            value={settings.refundsEnabled}
            onValueChange={(v) => updateField('refundsEnabled', v)}
            trackColor={{ false: '#e5e7eb', true: '#ef4444' + '50' }}
            thumbColor={settings.refundsEnabled ? '#ef4444' : '#f4f4f5'}
          />
        </View>
        {settings.refundsEnabled && (
          <View style={styles.cardBody}>
            <View style={styles.checkRow}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => updateField('refundsRequireApproval', !settings.refundsRequireApproval)}
              >
                <Ionicons
                  name={settings.refundsRequireApproval ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={settings.refundsRequireApproval ? '#ef4444' : '#9ca3af'}
                />
                <Text style={styles.checkLabel}>Require Manager Approval</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  loadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: Spacing.lg,
    margin: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 1,
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
  },
  smallInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.textDark,
    minWidth: 80,
    textAlign: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#7c3aed',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  segmentTextActive: {
    color: '#fff',
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  denomChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  denomChipActive: {
    backgroundColor: '#d97706',
  },
  denomText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  denomTextActive: {
    color: '#fff',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.textDark,
    textAlign: 'center',
  },
  checkRow: {
    marginBottom: 10,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkLabel: {
    fontSize: 14,
    color: Colors.textDark,
  },
});
