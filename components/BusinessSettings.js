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

export default function BusinessSettings({ restaurantId, onBusinessSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [legalBusinessName, setLegalBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [gstinError, setGstinError] = useState('');
  const [showGstOnInvoice, setShowGstOnInvoice] = useState(false);

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
        setShowGstOnInvoice(cachedSettings.showGstOnInvoice === true); // Default false
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
        setShowGstOnInvoice(settings.showGstOnInvoice === true); // Default false

        // Cache the settings
        await AsyncStorage.setItem(
          `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
          JSON.stringify({
            legalBusinessName: settings.legalBusinessName || '',
            gstin: settings.gstin || '',
            showGstOnInvoice: settings.showGstOnInvoice === true,
          })
        );

        // Notify parent of settings
        if (onBusinessSettingsChange) {
          onBusinessSettingsChange({
            legalBusinessName: settings.legalBusinessName || '',
            gstin: settings.gstin || '',
            showGstOnInvoice: settings.showGstOnInvoice === true,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching business settings from API:', error);
    } finally {
      setLoading(false);
    }
  };

  // Validate GSTIN format (Indian GST Number)
  const validateGstin = (value) => {
    if (!value || value.trim() === '') {
      setGstinError('');
      return true; // Empty is valid (optional field)
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

  // Handle toggle save immediately (without entering edit mode)
  const handleToggleSave = async (value) => {
    if (!restaurantId) return;

    try {
      const updateData = {
        legalBusinessName: legalBusinessName.trim(),
        gstin: gstin.trim().toUpperCase(),
        showGstOnInvoice: value,
      };

      await apiClient.updateBusinessSettings(restaurantId, updateData);

      // Update local cache
      await AsyncStorage.setItem(
        `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
        JSON.stringify(updateData)
      );

      // Also update the user data in storage to reflect changes
      const userData = await apiClient.getUser();
      if (userData && userData.restaurant) {
        userData.restaurant.showGstOnInvoice = value;
        await apiClient.setUser(userData);
      }

      // Notify parent of settings change
      if (onBusinessSettingsChange) {
        onBusinessSettingsChange(updateData);
      }
    } catch (error) {
      console.error('Error saving toggle setting:', error);
      // Revert the toggle on error
      setShowGstOnInvoice(!value);
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleSave = async () => {
    if (!restaurantId) return;

    // Validate GSTIN before saving
    if (!validateGstin(gstin)) {
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        legalBusinessName: legalBusinessName.trim(),
        gstin: gstin.trim().toUpperCase(),
        showGstOnInvoice: showGstOnInvoice,
      };

      await apiClient.updateBusinessSettings(restaurantId, updateData);

      // Update local cache
      await AsyncStorage.setItem(
        `${BUSINESS_STORAGE_KEY}_${restaurantId}`,
        JSON.stringify(updateData)
      );

      // Also update the user data in storage to reflect changes
      const userData = await apiClient.getUser();
      if (userData && userData.restaurant) {
        userData.restaurant.legalBusinessName = updateData.legalBusinessName;
        userData.restaurant.gstin = updateData.gstin;
        userData.restaurant.showGstOnInvoice = updateData.showGstOnInvoice;
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
          These details will appear on your GST-compliant invoices. Required for businesses registered under GST.
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

        {/* GSTIN */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>GSTIN (GST Number)</Text>
          {isEditing ? (
            <>
              <TextInput
                style={[styles.input, gstinError && styles.inputError]}
                placeholder="e.g., 29ABCDE1234F1Z5"
                placeholderTextColor="#9ca3af"
                value={gstin}
                onChangeText={(text) => {
                  setGstin(text.toUpperCase());
                  if (gstinError) validateGstin(text);
                }}
                onBlur={() => validateGstin(gstin)}
                autoCapitalize="characters"
                maxLength={15}
                editable={!saving}
              />
              {gstinError ? (
                <Text style={styles.errorText}>{gstinError}</Text>
              ) : (
                <Text style={styles.hintText}>15-character GST Identification Number</Text>
              )}
            </>
          ) : (
            <View style={styles.valueContainer}>
              <Text style={styles.valueText}>
                {gstin || 'Not set'}
              </Text>
            </View>
          )}
        </View>

        {/* Show GST on Invoice Toggle */}
        <View style={styles.toggleGroup}>
          <View style={styles.toggleInfo}>
            <Text style={styles.inputLabel}>Show GST Info on Invoice</Text>
            <Text style={styles.hintText}>
              Display legal business name and GSTIN on invoices and shared PDFs
            </Text>
          </View>
          <Switch
            value={showGstOnInvoice}
            onValueChange={(value) => {
              setShowGstOnInvoice(value);
              // Auto-save toggle changes immediately
              handleToggleSave(value);
            }}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={showGstOnInvoice ? Colors.primary : '#f4f3f4'}
            disabled={saving}
          />
        </View>
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
