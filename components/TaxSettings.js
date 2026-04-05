import React, { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing, BorderRadius } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';

const TAX_STORAGE_KEY = 'dine_tax_settings';

export default function TaxSettings({ restaurantId, onTaxSettingsChange }) {
  const { modalWidth } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxes, setTaxes] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTax, setEditingTax] = useState(null);
  const [newTaxName, setNewTaxName] = useState('');
  const [newTaxRate, setNewTaxRate] = useState('');

  // Discount settings state
  const [discountsEnabled, setDiscountsEnabled] = useState(false);
  const [allowManualDiscount, setAllowManualDiscount] = useState(false);
  const [discountRoles, setDiscountRoles] = useState(['owner', 'manager']);
  const [maxPercentDiscount, setMaxPercentDiscount] = useState('');
  const [maxFlatDiscount, setMaxFlatDiscount] = useState('');

  const DISCOUNT_ROLE_OPTIONS = ['owner', 'manager', 'admin', 'cashier', 'waiter'];

  const applyDiscountSettings = (ds) => {
    if (!ds) return;
    setDiscountsEnabled(ds.enabled || false);
    setAllowManualDiscount(ds.allowManualDiscount || false);
    setDiscountRoles(ds.manualDiscountRoles || ['owner', 'manager']);
    setMaxPercentDiscount(ds.maxPercentDiscount != null ? String(ds.maxPercentDiscount) : '');
    setMaxFlatDiscount(ds.maxFlatDiscount != null ? String(ds.maxFlatDiscount) : '');
  };

  const getDiscountSettings = () => ({
    enabled: discountsEnabled,
    allowManualDiscount,
    manualDiscountRoles: discountRoles,
    maxPercentDiscount: maxPercentDiscount ? Number(maxPercentDiscount) : null,
    maxFlatDiscount: maxFlatDiscount ? Number(maxFlatDiscount) : null,
  });

  // Load tax settings - first from cache, then fetch from API in background
  useEffect(() => {
    loadTaxSettings();
  }, [restaurantId]);

  const loadTaxSettings = async () => {
    if (!restaurantId) return;

    try {
      // First, try to load from local storage for instant UI
      const cached = await AsyncStorage.getItem(`${TAX_STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        const cachedSettings = JSON.parse(cached);
        setTaxEnabled(cachedSettings.enabled || false);
        setTaxes(cachedSettings.taxes || []);
        applyDiscountSettings(cachedSettings.discountSettings);
        setLoading(false);
      }

      // Then fetch from API in background and update
      fetchFromAPI();
    } catch (error) {
      console.error('Error loading cached tax settings:', error);
      fetchFromAPI();
    }
  };

  const fetchFromAPI = async () => {
    if (!restaurantId) return;

    try {
      const response = await apiClient.getTaxSettings(restaurantId);
      if (response.taxSettings) {
        const settings = response.taxSettings;
        setTaxEnabled(settings.enabled || false);
        setTaxes(settings.taxes || []);
        applyDiscountSettings(settings.discountSettings);

        // Cache the settings
        await AsyncStorage.setItem(
          `${TAX_STORAGE_KEY}_${restaurantId}`,
          JSON.stringify(settings)
        );

        // Notify parent of settings change
        if (onTaxSettingsChange) {
          onTaxSettingsChange(settings);
        }
      }
    } catch (error) {
      console.error('Error fetching tax settings from API:', error);
      // Don't show error if we have cached data
    } finally {
      setLoading(false);
    }
  };

  const saveTaxSettings = async (enabled, taxList, discountOverride) => {
    if (!restaurantId) return;

    setSaving(true);
    try {
      const settings = {
        enabled,
        taxes: taxList,
        defaultTaxRate: taxList.reduce((sum, t) => t.enabled ? sum + t.rate : sum, 0),
        discountSettings: discountOverride || getDiscountSettings(),
      };

      await apiClient.updateTaxSettings(restaurantId, settings);

      // Update local cache
      await AsyncStorage.setItem(
        `${TAX_STORAGE_KEY}_${restaurantId}`,
        JSON.stringify(settings)
      );

      // Notify parent of settings change
      if (onTaxSettingsChange) {
        onTaxSettingsChange(settings);
      }

      Alert.alert('Success', 'Tax settings saved successfully');
    } catch (error) {
      console.error('Error saving tax settings:', error);
      Alert.alert('Error', error.message || 'Failed to save tax settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (value) => {
    setTaxEnabled(value);
    await saveTaxSettings(value, taxes);
  };

  const handleAddTax = () => {
    setEditingTax(null);
    setNewTaxName('');
    setNewTaxRate('');
    setShowAddModal(true);
  };

  const handleEditTax = (tax) => {
    setEditingTax(tax);
    setNewTaxName(tax.name);
    setNewTaxRate(tax.rate.toString());
    setShowAddModal(true);
  };

  const handleSaveTax = async () => {
    if (!newTaxName.trim()) {
      Alert.alert('Error', 'Please enter a tax name');
      return;
    }

    const rate = parseFloat(newTaxRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      Alert.alert('Error', 'Please enter a valid rate between 0 and 100');
      return;
    }

    let updatedTaxes;
    if (editingTax) {
      // Update existing tax
      updatedTaxes = taxes.map(t =>
        t.id === editingTax.id
          ? { ...t, name: newTaxName.trim(), rate }
          : t
      );
    } else {
      // Add new tax
      const newTax = {
        id: `tax_${Date.now()}`,
        name: newTaxName.trim(),
        rate,
        enabled: true,
        type: 'percentage',
      };
      updatedTaxes = [...taxes, newTax];
    }

    setTaxes(updatedTaxes);
    setShowAddModal(false);
    await saveTaxSettings(taxEnabled, updatedTaxes);
  };

  const handleDeleteTax = (taxId) => {
    Alert.alert(
      'Delete Tax',
      'Are you sure you want to delete this tax?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedTaxes = taxes.filter(t => t.id !== taxId);
            setTaxes(updatedTaxes);
            await saveTaxSettings(taxEnabled, updatedTaxes);
          },
        },
      ]
    );
  };

  const handleToggleTaxEnabled = async (taxId, enabled) => {
    const updatedTaxes = taxes.map(t =>
      t.id === taxId ? { ...t, enabled } : t
    );
    setTaxes(updatedTaxes);
    await saveTaxSettings(taxEnabled, updatedTaxes);
  };

  // Discount handlers with auto-save
  const saveDiscountChange = (overrides = {}) => {
    const ds = {
      enabled: overrides.enabled !== undefined ? overrides.enabled : discountsEnabled,
      allowManualDiscount: overrides.allowManualDiscount !== undefined ? overrides.allowManualDiscount : allowManualDiscount,
      manualDiscountRoles: overrides.manualDiscountRoles || discountRoles,
      maxPercentDiscount: overrides.maxPercentDiscount !== undefined
        ? (overrides.maxPercentDiscount ? Number(overrides.maxPercentDiscount) : null)
        : (maxPercentDiscount ? Number(maxPercentDiscount) : null),
      maxFlatDiscount: overrides.maxFlatDiscount !== undefined
        ? (overrides.maxFlatDiscount ? Number(overrides.maxFlatDiscount) : null)
        : (maxFlatDiscount ? Number(maxFlatDiscount) : null),
    };
    saveTaxSettings(taxEnabled, taxes, ds);
  };

  const handleToggleDiscounts = (value) => {
    setDiscountsEnabled(value);
    saveDiscountChange({ enabled: value });
  };

  const handleToggleManualDiscount = (value) => {
    setAllowManualDiscount(value);
    saveDiscountChange({ allowManualDiscount: value });
  };

  const handleToggleDiscountRole = (role) => {
    const updated = discountRoles.includes(role)
      ? discountRoles.filter(r => r !== role)
      : [...discountRoles, role];
    setDiscountRoles(updated);
    saveDiscountChange({ manualDiscountRoles: updated });
  };

  const handleMaxPercentChange = (value) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    const clamped = cleaned ? String(Math.min(100, Math.max(1, Number(cleaned)))) : '';
    setMaxPercentDiscount(clamped);
  };

  const handleMaxPercentBlur = () => {
    saveDiscountChange({ maxPercentDiscount: maxPercentDiscount });
  };

  const handleMaxFlatChange = (value) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    setMaxFlatDiscount(cleaned);
  };

  const handleMaxFlatBlur = () => {
    saveDiscountChange({ maxFlatDiscount: maxFlatDiscount });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading tax settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="calculator-outline" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Tax Settings</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Enable Tax Toggle */}
      <View style={styles.enableSection}>
        <View style={styles.enableLeft}>
          <Text style={styles.enableLabel}>Enable Tax Calculation</Text>
          <Text style={styles.enableHint}>
            {taxEnabled ? 'Tax will be added to orders' : 'No tax will be applied'}
          </Text>
        </View>
        <Switch
          value={taxEnabled}
          onValueChange={handleToggleEnabled}
          trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
          thumbColor={taxEnabled ? Colors.primary : '#f4f4f5'}
        />
      </View>

      {/* Tax List */}
      {taxEnabled && (
        <View style={styles.taxListSection}>
          <View style={styles.taxListHeader}>
            <Text style={styles.taxListTitle}>Tax Rates</Text>
            <TouchableOpacity style={styles.addButton} onPress={handleAddTax}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Add Tax</Text>
            </TouchableOpacity>
          </View>

          {taxes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No taxes configured</Text>
              <Text style={styles.emptyHint}>Tap "Add Tax" to create one</Text>
            </View>
          ) : (
            <ScrollView style={styles.taxList} showsVerticalScrollIndicator={false}>
              {taxes.map((tax) => (
                <View key={tax.id} style={styles.taxItem}>
                  <Switch
                    value={tax.enabled}
                    onValueChange={(value) => handleToggleTaxEnabled(tax.id, value)}
                    trackColor={{ false: '#e5e7eb', true: Colors.accentGreen + '50' }}
                    thumbColor={tax.enabled ? Colors.accentGreen : '#f4f4f5'}
                    style={styles.taxSwitch}
                  />
                  <View style={styles.taxInfo}>
                    <Text style={[styles.taxName, !tax.enabled && styles.taxDisabled]}>
                      {tax.name}
                    </Text>
                  </View>
                  <Text style={[styles.taxRate, !tax.enabled && styles.taxDisabled]}>
                    {tax.rate}%
                  </Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditTax(tax)}
                  >
                    <Ionicons name="create-outline" size={18} color={Colors.info} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteTax(tax.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Total Tax Rate */}
          {taxes.length > 0 && (
            <View style={styles.totalSection}>
              <Text style={styles.totalLabel}>Total Tax Rate:</Text>
              <Text style={styles.totalValue}>
                {taxes.filter(t => t.enabled).reduce((sum, t) => sum + t.rate, 0)}%
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Discount Settings Section */}
      <View style={styles.discountSection}>
        <View style={styles.discountHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name="pricetag-outline" size={24} color={Colors.primary} />
            <Text style={styles.headerTitle}>Discount Settings</Text>
          </View>
        </View>

        <View style={styles.enableSection}>
          <View style={styles.enableLeft}>
            <Text style={styles.enableLabel}>Enable Discounts</Text>
            <Text style={styles.enableHint}>
              {discountsEnabled ? 'Discounts can be applied to orders' : 'Discounts are disabled'}
            </Text>
          </View>
          <Switch
            value={discountsEnabled}
            onValueChange={handleToggleDiscounts}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={discountsEnabled ? Colors.primary : '#f4f4f5'}
          />
        </View>

        {discountsEnabled && (
          <View style={styles.discountBody}>
            {/* Allow Manual Discount */}
            <View style={styles.discountRow}>
              <View style={styles.enableLeft}>
                <Text style={styles.enableLabel}>Allow Manual Discount</Text>
                <Text style={styles.enableHint}>
                  Let staff apply discounts manually at checkout
                </Text>
              </View>
              <Switch
                value={allowManualDiscount}
                onValueChange={handleToggleManualDiscount}
                trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
                thumbColor={allowManualDiscount ? Colors.primary : '#f4f4f5'}
              />
            </View>

            {/* Role Pills */}
            {allowManualDiscount && (
              <View style={styles.discountRolesSection}>
                <Text style={styles.discountRolesLabel}>Who can apply manual discounts?</Text>
                <View style={styles.discountRolesRow}>
                  {DISCOUNT_ROLE_OPTIONS.map((role) => {
                    const selected = discountRoles.includes(role);
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[
                          styles.rolePill,
                          selected ? styles.rolePillSelected : styles.rolePillUnselected,
                        ]}
                        onPress={() => handleToggleDiscountRole(role)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.rolePillText,
                            selected ? styles.rolePillTextSelected : styles.rolePillTextUnselected,
                          ]}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Max % Discount */}
            <View style={styles.discountInputGroup}>
              <Text style={styles.inputLabel}>Max % Discount</Text>
              <TextInput
                style={styles.discountInput}
                placeholder="e.g., 50"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={maxPercentDiscount}
                onChangeText={handleMaxPercentChange}
                onBlur={handleMaxPercentBlur}
                maxLength={3}
              />
            </View>

            {/* Max Flat Discount */}
            <View style={styles.discountInputGroup}>
              <Text style={styles.inputLabel}>Max Flat Discount</Text>
              <TextInput
                style={styles.discountInput}
                placeholder="No limit"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                value={maxFlatDiscount}
                onChangeText={handleMaxFlatChange}
                onBlur={handleMaxFlatBlur}
              />
            </View>
          </View>
        )}
      </View>

      {/* Add/Edit Tax Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, modalWidth(400)]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTax ? 'Edit Tax' : 'Add Tax'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tax Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., GST, VAT, Service Tax"
                  placeholderTextColor="#9ca3af"
                  value={newTaxName}
                  onChangeText={setNewTaxName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Rate (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 5"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  value={newTaxRate}
                  onChangeText={setNewTaxRate}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveTax}
              >
                <Text style={styles.saveButtonText}>
                  {editingTax ? 'Update' : 'Add'} Tax
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  loadingContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: Spacing.lg,
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
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  enableSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  enableLeft: {
    flex: 1,
  },
  enableLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 2,
  },
  enableHint: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  taxListSection: {
    padding: Spacing.md,
  },
  taxListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  taxListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMedium,
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 12,
    color: Colors.textLight,
  },
  taxList: {
    maxHeight: 200,
  },
  taxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  taxSwitch: {
    transform: [{ scale: 0.8 }],
  },
  taxInfo: {
    flex: 1,
    marginLeft: Spacing.xs,
  },
  taxName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textDark,
  },
  taxDisabled: {
    color: Colors.textLight,
  },
  taxRate: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    marginRight: Spacing.sm,
    minWidth: 40,
    textAlign: 'right',
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  totalSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  modalBody: {
    padding: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textDark,
  },
  modalActions: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Discount Settings styles
  discountSection: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  discountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  discountBody: {
    padding: Spacing.md,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  discountRolesSection: {
    marginBottom: Spacing.md,
  },
  discountRolesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  discountRolesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rolePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  rolePillSelected: {
    backgroundColor: '#1f2937',
  },
  rolePillUnselected: {
    backgroundColor: '#f3f4f6',
  },
  rolePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  rolePillTextSelected: {
    color: '#ffffff',
  },
  rolePillTextUnselected: {
    color: '#6b7280',
  },
  discountInputGroup: {
    marginBottom: Spacing.md,
  },
  discountInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textDark,
  },
});
