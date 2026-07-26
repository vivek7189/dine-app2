import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing, BorderRadius } from '../constants/Theme';

const BUSINESS_STORAGE_KEY = 'dine_business_settings';

const COUNTRY_FIELDS = {
  IN: [
    { key: 'gstin', label: 'GSTIN (GST Number)', placeholder: 'e.g., 29ABCDE1234F1Z5', maxLength: 15, autoCapitalize: 'characters' },
    { key: 'fssai', label: 'FSSAI License Number', placeholder: 'e.g., 12345678901234', maxLength: 14, keyboardType: 'numeric' },
  ],
  GB: [{ key: 'vatNumber', label: 'VAT Number', placeholder: 'e.g., GB123456789', maxLength: 14, autoCapitalize: 'characters' }],
  DE: [{ key: 'vatNumber', label: 'USt-IdNr (VAT)', placeholder: 'e.g., DE123456789', maxLength: 14, autoCapitalize: 'characters' }],
  FR: [{ key: 'vatNumber', label: 'TVA Number', placeholder: 'e.g., FR12345678901', maxLength: 15, autoCapitalize: 'characters' }],
  AE: [{ key: 'vatNumber', label: 'TRN (Tax Registration)', placeholder: 'e.g., 100123456700003', maxLength: 15, keyboardType: 'numeric' }],
  SA: [{ key: 'vatNumber', label: 'TRN (Tax Registration)', placeholder: 'e.g., 300012345600003', maxLength: 15, keyboardType: 'numeric' }],
  CA: [{ key: 'vatNumber', label: 'GST/HST Number', placeholder: 'e.g., 123456789RT0001', maxLength: 15, autoCapitalize: 'characters' }],
  AU: [
    { key: 'taxId', label: 'ABN', placeholder: 'e.g., 51 824 753 556', maxLength: 14 },
    { key: 'vatNumber', label: 'GST Registration', placeholder: 'GST registration number', maxLength: 15 },
  ],
  US: [{ key: 'taxId', label: 'EIN / Tax ID', placeholder: 'e.g., 12-3456789', maxLength: 10 }],
  SG: [
    { key: 'vatNumber', label: 'GST Registration No.', placeholder: 'e.g., M12345678X', maxLength: 10, autoCapitalize: 'characters' },
    { key: 'businessRegistrationNumber', label: 'UEN', placeholder: 'e.g., 200012345K', maxLength: 10, autoCapitalize: 'characters' },
  ],
  MY: [{ key: 'vatNumber', label: 'SST Registration No.', placeholder: 'e.g., W10-1234-56789012', maxLength: 20, autoCapitalize: 'characters' }],
};
const DEFAULT_FIELDS = [
  { key: 'gstin', label: 'GST Number', placeholder: 'Enter GST number', maxLength: 20, autoCapitalize: 'characters' },
  { key: 'vatNumber', label: 'VAT / Tax Number', placeholder: 'Enter tax registration number', maxLength: 20, autoCapitalize: 'characters' },
  { key: 'taxId', label: 'Tax ID', placeholder: 'Enter tax ID', maxLength: 20 },
  { key: 'businessRegistrationNumber', label: 'Business Registration No.', placeholder: 'Enter registration number', maxLength: 20 },
];

export default function BusinessSettings({ restaurantId, countryCode: propCountryCode, onBusinessSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState('');
  const [showGstOnInvoice, setShowGstOnInvoice] = useState(false);
  const [fssai, setFssai] = useState('');
  const [fssaiError, setFssaiError] = useState('');
  const [showFssaiOnInvoice, setShowFssaiOnInvoice] = useState(false);
  const [vatNumber, setVatNumber] = useState('');
  const [taxId, setTaxId] = useState('');
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('');
  const [showTaxIdOnInvoice, setShowTaxIdOnInvoice] = useState(false);
  const [countryCode, setCountryCode] = useState(propCountryCode || 'IN');

  useEffect(() => {
    loadBusinessSettings();
  }, [restaurantId]);

  const loadBusinessSettings = async () => {
    if (!restaurantId) return;

    try {
      // First, try to load from local storage for instant UI
      const cached = await AsyncStorage.getItem(`${BUSINESS_STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        const cachedSettings = JSON.parse(cached);
        setLegalBusinessName(cachedSettings.legalBusinessName || '');
        setGstin(cachedSettings.gstin || '');
        setShowGstOnInvoice(cachedSettings.showGstOnInvoice === true);
        setFssai(cachedSettings.fssai || '');
        setShowFssaiOnInvoice(cachedSettings.showFssaiOnInvoice === true);
        setVatNumber(cachedSettings.vatNumber || '');
        setTaxId(cachedSettings.taxId || '');
        setBusinessRegistrationNumber(cachedSettings.businessRegistrationNumber || '');
        setShowTaxIdOnInvoice(cachedSettings.showTaxIdOnInvoice === true);
        setLoading(false);
      }

      // Then fetch from API in background and update
      fetchFromAPI();
    } catch (error) {
      console.error('Error loading cached business settings:', error);
      fetchFromAPI();
    }
  };

  const fetchFromAPI = async () => {
    if (!restaurantId) return;

    try {
      const response = await apiClient.getBusinessSettings(restaurantId);
      if (response.businessSettings) {
        const settings = response.businessSettings;
        setLegalBusinessName(settings.legalBusinessName || '');
        setGstin(settings.gstin || '');
        setShowGstOnInvoice(settings.showGstOnInvoice === true);
        setFssai(settings.fssai || '');
        setShowFssaiOnInvoice(settings.showFssaiOnInvoice === true);
        setVatNumber(settings.vatNumber || '');
        setTaxId(settings.taxId || '');
        setBusinessRegistrationNumber(settings.businessRegistrationNumber || '');
        setShowTaxIdOnInvoice(settings.showTaxIdOnInvoice === true);

        const allSettings = {
          legalBusinessName: settings.legalBusinessName || '',
          gstin: settings.gstin || '',
          showGstOnInvoice: settings.showGstOnInvoice === true,
          fssai: settings.fssai || '',
          showFssaiOnInvoice: settings.showFssaiOnInvoice === true,
          vatNumber: settings.vatNumber || '',
          taxId: settings.taxId || '',
          businessRegistrationNumber: settings.businessRegistrationNumber || '',
          showTaxIdOnInvoice: settings.showTaxIdOnInvoice === true,
        };

        // Cache the settings
        await AsyncStorage.setItem(
          `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
          JSON.stringify(allSettings)
        );

        // Notify parent of settings
        if (onBusinessSettingsChange) {
          onBusinessSettingsChange(allSettings);
        }
      }
    } catch (error) {
      console.error('Error fetching business settings from API:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validate GSTIN format (Indian GST Number). Only enforced for India — other
  // countries may store a generic GST/tax number that doesn't match the Indian format.
  const validateGstin = (value) => {
    if (!value || value.trim() === '') {
      setGstinError('');
      return true; // Empty is valid (optional field)
    }

    if (countryCode !== 'IN') {
      setGstinError(''); // Non-India: accept any free-form GST/tax number
      return true;
    }

    // GSTIN format: 2 state code + 5 PAN letters + 4 PAN digits + 1 PAN letter + 1 entity code + Z + 1 checksum
    // Example: 29ABCDE1234F1Z5
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (!gstinRegex.test(value.toUpperCase())) {
      setGstinError('Invalid GSTIN format (e.g., 29ABCDE1234F1Z5)');
      return false;
    }

    setGstinError('');
    return true;
  };

  // Validate FSSAI format (14-digit number)
  const validateFssai = (value) => {
    if (!value || value.trim() === '') {
      setFssaiError('');
      return true;
    }
    if (!/^\d{14}$/.test(value.trim())) {
      setFssaiError('FSSAI must be a 14-digit number');
      return false;
    }
    setFssaiError('');
    return true;
  };

  const buildUpdateData = (overrides = {}) => ({
    legalBusinessName: legalBusinessName.trim(),
    gstin: gstin.trim().toUpperCase(),
    showGstOnInvoice,
    fssai: fssai.trim(),
    showFssaiOnInvoice,
    vatNumber: vatNumber.trim(),
    taxId: taxId.trim(),
    businessRegistrationNumber: businessRegistrationNumber.trim(),
    showTaxIdOnInvoice,
    ...overrides,
  });

  // Handle toggle save immediately (without entering edit mode)
  const handleToggleSave = async (field, value) => {
    if (!restaurantId) return;

    try {
      const updateData = buildUpdateData({ [field]: value });

      await apiClient.updateBusinessSettings(restaurantId, updateData);

      // Update local cache
      await AsyncStorage.setItem(
        `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
        JSON.stringify(updateData)
      );

      // Also update the user data in storage to reflect changes
      const userData = await apiClient.getUser();
      if (userData && userData.restaurant) {
        userData.restaurant[field] = value;
        await apiClient.setUser(userData);
      }

      // Notify parent of settings change
      if (onBusinessSettingsChange) {
        onBusinessSettingsChange(updateData);
      }
    } catch (error) {
      console.error('Error saving toggle setting:', error);
      // Revert the toggle on error
      if (field === 'showGstOnInvoice') setShowGstOnInvoice(!value);
      else if (field === 'showFssaiOnInvoice') setShowFssaiOnInvoice(!value);
      else if (field === 'showTaxIdOnInvoice') setShowTaxIdOnInvoice(!value);
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleSave = async () => {
    if (!restaurantId) return;

    // Validate fields before saving
    if (!validateGstin(gstin) || !validateFssai(fssai)) {
      return;
    }

    setSaving(true);
    try {
      const updateData = buildUpdateData();

      await apiClient.updateBusinessSettings(restaurantId, updateData);

      // Update local cache
      await AsyncStorage.setItem(
        `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
        JSON.stringify(updateData)
      );

      // Also update the user data in storage to reflect changes
      const userData = await apiClient.getUser();
      if (userData && userData.restaurant) {
        Object.assign(userData.restaurant, updateData);
        await apiClient.setUser(userData);
      }

      // Notify parent of settings change
      if (onBusinessSettingsChange) {
        onBusinessSettingsChange(updateData);
      }

      setIsEditing(false);
      Alert.alert('Success', 'Business details saved successfully');
    } catch (error) {
      console.error('Error saving business settings:', error);
      Alert.alert('Error', error.message || 'Failed to save business details');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    // Reset to original values
    loadBusinessSettings();
    setIsEditing(false);
    setGstinError('');
    setFssaiError('');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading business details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="business-outline" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Business Details</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Info Text */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>
          These details will appear on your invoices. Add your tax registration and food license numbers for compliance.
        </Text>
      </View>

      {/* Form Fields */}
      <View style={styles.formSection}>
        {/* Legal Business Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Legal Business Name</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              placeholder="Enter registered business name"
              placeholderTextColor="#9ca3af"
              value={legalBusinessName}
              onChangeText={setLegalBusinessName}
              editable={!saving}
            />
          ) : (
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>
                {legalBusinessName || 'Not set'}
              </Text>
            </View>
          )}
        </View>

        {/* Country-specific fields */}
        {(COUNTRY_FIELDS[countryCode] || DEFAULT_FIELDS).map((field) => {
          const stateMap = { gstin, fssai, vatNumber, taxId, businessRegistrationNumber };
          const setterMap = {
            gstin: (v) => { setGstin(v.toUpperCase()); if (gstinError) validateGstin(v); },
            fssai: (v) => { setFssai(v); if (fssaiError) validateFssai(v); },
            vatNumber: setVatNumber,
            taxId: setTaxId,
            businessRegistrationNumber: setBusinessRegistrationNumber,
          };
          const errorMap = { gstin: gstinError, fssai: fssaiError };
          const blurMap = { gstin: () => validateGstin(gstin), fssai: () => validateFssai(fssai) };
          const value = stateMap[field.key] || '';
          const error = errorMap[field.key] || '';

          return (
            <View style={styles.inputGroup} key={field.key}>
              <Text style={styles.inputLabel}>{field.label}</Text>
              {isEditing ? (
                <>
                  <TextInput
                    style={[styles.input, error ? styles.inputError : null]}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9ca3af"
                    value={value}
                    onChangeText={setterMap[field.key]}
                    onBlur={blurMap[field.key]}
                    autoCapitalize={field.autoCapitalize || 'none'}
                    keyboardType={field.keyboardType || 'default'}
                    maxLength={field.maxLength || 20}
                    editable={!saving}
                  />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </>
              ) : (
                <View style={styles.valueContainer}>
                  <Text style={styles.valueText}>{value || 'Not set'}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Show GST on Invoice Toggle — shown whenever GST is an available field (India)
            or a GST number has been entered (other countries via DEFAULT_FIELDS). */}
        {((COUNTRY_FIELDS[countryCode] || DEFAULT_FIELDS).some(f => f.key === 'gstin') || !!gstin) && (
          <View style={styles.toggleGroup}>
            <View style={styles.toggleInfo}>
              <Text style={styles.inputLabel}>Show GST Info on Invoice</Text>
              <Text style={styles.hintText}>Display GST number on invoices</Text>
            </View>
            <Switch
              value={showGstOnInvoice}
              onValueChange={(value) => {
                setShowGstOnInvoice(value);
                handleToggleSave('showGstOnInvoice', value);
              }}
              trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
              thumbColor={showGstOnInvoice ? Colors.primary : '#f4f3f4'}
              disabled={saving}
            />
          </View>
        )}

        {/* Show FSSAI on Invoice Toggle (India) */}
        {countryCode === 'IN' && (
          <View style={styles.toggleGroup}>
            <View style={styles.toggleInfo}>
              <Text style={styles.inputLabel}>Show FSSAI on Invoice</Text>
              <Text style={styles.hintText}>Display FSSAI license on invoices</Text>
            </View>
            <Switch
              value={showFssaiOnInvoice}
              onValueChange={(value) => {
                setShowFssaiOnInvoice(value);
                handleToggleSave('showFssaiOnInvoice', value);
              }}
              trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
              thumbColor={showFssaiOnInvoice ? Colors.primary : '#f4f3f4'}
              disabled={saving}
            />
          </View>
        )}

        {/* Show Tax Info on Invoice Toggle (non-India or if has VAT/taxId) */}
        {(countryCode !== 'IN' || vatNumber || taxId || businessRegistrationNumber) && (
          <View style={styles.toggleGroup}>
            <View style={styles.toggleInfo}>
              <Text style={styles.inputLabel}>Show Tax Info on Invoice</Text>
              <Text style={styles.hintText}>Display tax registration details on invoices</Text>
            </View>
            <Switch
              value={showTaxIdOnInvoice}
              onValueChange={(value) => {
                setShowTaxIdOnInvoice(value);
                handleToggleSave('showTaxIdOnInvoice', value);
              }}
              trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
              thumbColor={showTaxIdOnInvoice ? Colors.primary : '#f4f3f4'}
              disabled={saving}
            />
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        {isEditing ? (
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveButtonText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(true)}
          >
            <Ionicons name="create-outline" size={18} color={Colors.primary} />
            <Text style={styles.editButtonText}>Edit Details</Text>
          </TouchableOpacity>
        )}
      </View>
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
  infoSection: {
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: '#f9fafb',
  },
  infoText: {
    fontSize: 12,
    color: Colors.textMedium,
    lineHeight: 18,
  },
  formSection: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  toggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  toggleInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
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
  inputError: {
    borderColor: Colors.error,
    backgroundColor: '#fef2f2',
  },
  valueContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  valueText: {
    fontSize: 15,
    color: Colors.textDark,
  },
  hintText: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  errorText: {
    fontSize: 11,
    color: Colors.error,
    marginTop: 4,
  },
  actionsSection: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  editActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
});
