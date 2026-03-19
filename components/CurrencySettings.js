import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_currency_settings';

const COUNTRIES = [
  { code: 'IN', name: 'India', currency: 'INR', symbol: '₹', locale: 'en-IN', taxLabel: 'GST' },
  { code: 'US', name: 'United States', currency: 'USD', symbol: '$', locale: 'en-US', taxLabel: 'Tax' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', symbol: '£', locale: 'en-GB', taxLabel: 'VAT' },
  { code: 'EU', name: 'Europe (Euro)', currency: 'EUR', symbol: '€', locale: 'de-DE', taxLabel: 'VAT' },
  { code: 'AE', name: 'UAE', currency: 'AED', symbol: 'د.إ', locale: 'ar-AE', taxLabel: 'VAT' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', symbol: '﷼', locale: 'ar-SA', taxLabel: 'VAT' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', symbol: 'S$', locale: 'en-SG', taxLabel: 'GST' },
  { code: 'AU', name: 'Australia', currency: 'AUD', symbol: 'A$', locale: 'en-AU', taxLabel: 'GST' },
  { code: 'CA', name: 'Canada', currency: 'CAD', symbol: 'C$', locale: 'en-CA', taxLabel: 'HST' },
  { code: 'JP', name: 'Japan', currency: 'JPY', symbol: '¥', locale: 'ja-JP', taxLabel: 'Tax' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', symbol: 'RM', locale: 'ms-MY', taxLabel: 'SST' },
  { code: 'TH', name: 'Thailand', currency: 'THB', symbol: '฿', locale: 'th-TH', taxLabel: 'VAT' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', symbol: 'NZ$', locale: 'en-NZ', taxLabel: 'GST' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', locale: 'en-ZA', taxLabel: 'VAT' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', locale: 'en-NG', taxLabel: 'VAT' },
  { code: 'KE', name: 'Kenya', currency: 'KES', symbol: 'KSh', locale: 'en-KE', taxLabel: 'VAT' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', symbol: '₱', locale: 'en-PH', taxLabel: 'VAT' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', symbol: '৳', locale: 'bn-BD', taxLabel: 'VAT' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR', symbol: 'Rs', locale: 'si-LK', taxLabel: 'VAT' },
  { code: 'NP', name: 'Nepal', currency: 'NPR', symbol: 'Rs', locale: 'ne-NP', taxLabel: 'VAT' },
];

export default function CurrencySettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [countryCode, setCountryCode] = useState('IN');
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [symbolPosition, setSymbolPosition] = useState('before');
  const [taxLabel, setTaxLabel] = useState('GST');

  useEffect(() => {
    loadSettings();
  }, [restaurantId]);

  const loadSettings = async () => {
    if (!restaurantId) return;
    try {
      const cached = await AsyncStorage.getItem(`${STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        applyData(JSON.parse(cached));
        setLoading(false);
      }
      fetchSettings();
    } catch {
      fetchSettings();
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.getCurrencySettings(restaurantId);
      const cs = response.currencySettings || {};
      applyData(cs);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(cs));
    } catch (error) {
      console.error('Error fetching currency settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyData = (data) => {
    setCountryCode(data.countryCode || 'IN');
    setCurrencyCode(data.currencyCode || 'INR');
    setCurrencySymbol(data.currencySymbol || '₹');
    setSymbolPosition(data.symbolPosition || 'before');
    setTaxLabel(data.taxLabel || 'GST');
  };

  const selectCountry = async (country) => {
    setCountryCode(country.code);
    setCurrencyCode(country.currency);
    setCurrencySymbol(country.symbol);
    setTaxLabel(country.taxLabel);
    setShowCountryPicker(false);
    setSearchQuery('');

    // Auto-save on country change
    setSaving(true);
    try {
      const settings = {
        countryCode: country.code,
        currencyCode: country.currency,
        currencySymbol: country.symbol,
        symbolPosition,
        locale: country.locale,
        taxLabel: country.taxLabel,
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.',
      };
      await apiClient.updateCurrencySettings(restaurantId, settings);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      if (onSettingsChange) onSettingsChange(settings);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save currency settings');
      fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  const toggleSymbolPosition = async () => {
    const newPos = symbolPosition === 'before' ? 'after' : 'before';
    setSymbolPosition(newPos);

    setSaving(true);
    try {
      const settings = {
        countryCode,
        currencyCode,
        currencySymbol,
        symbolPosition: newPos,
        taxLabel,
        decimalPlaces: 2,
        thousandSeparator: ',',
        decimalSeparator: '.',
      };
      await apiClient.updateCurrencySettings(restaurantId, settings);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(settings));
      if (onSettingsChange) onSettingsChange(settings);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update');
      fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  const filteredCountries = searchQuery
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.currency.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : COUNTRIES;

  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode);
  const previewAmount = symbolPosition === 'before' ? `${currencySymbol}1,234.56` : `1,234.56${currencySymbol}`;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="cash" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Currency Settings</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="cash" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Currency Settings</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      <View style={styles.body}>
        {/* Country Selector */}
        <Text style={styles.fieldLabel}>Country</Text>
        <TouchableOpacity style={styles.countrySelector} onPress={() => setShowCountryPicker(true)}>
          <Text style={styles.countrySelectorText}>
            {selectedCountry ? `${selectedCountry.name} (${selectedCountry.currency})` : 'Select country'}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textMedium} />
        </TouchableOpacity>

        {/* Currency Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Symbol</Text>
            <Text style={styles.infoValue}>{currencySymbol}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Code</Text>
            <Text style={styles.infoValue}>{currencyCode}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tax Label</Text>
            <Text style={styles.infoValue}>{taxLabel}</Text>
          </View>
        </View>

        {/* Symbol Position Toggle */}
        <View style={styles.positionRow}>
          <Text style={styles.positionLabel}>Symbol Position</Text>
          <TouchableOpacity style={styles.positionToggle} onPress={toggleSymbolPosition}>
            <Text style={styles.positionToggleText}>
              {symbolPosition === 'before' ? 'Before' : 'After'} amount
            </Text>
            <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Preview */}
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>Preview</Text>
          <Text style={styles.previewValue}>{previewAmount}</Text>
        </View>
      </View>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="slide" onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => { setShowCountryPicker(false); setSearchQuery(''); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textMedium} />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search country or currency..."
                placeholderTextColor={Colors.textLight}
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryItem, item.code === countryCode && styles.countryItemActive]}
                  onPress={() => selectCountry(item)}
                >
                  <View>
                    <Text style={styles.countryName}>{item.name}</Text>
                    <Text style={styles.countryCurrency}>{item.currency} ({item.symbol})</Text>
                  </View>
                  {item.code === countryCode && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
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
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  body: {
    padding: Spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  countrySelectorText: {
    fontSize: 15,
    color: Colors.textDark,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  infoItem: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: Spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.textMedium,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  positionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  positionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  positionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary + '10',
  },
  positionToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  previewBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    color: Colors.textMedium,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10b981',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: Spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textDark,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  countryItemActive: {
    backgroundColor: Colors.primary + '08',
  },
  countryName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  countryCurrency: {
    fontSize: 13,
    color: Colors.textMedium,
    marginTop: 2,
  },
});
