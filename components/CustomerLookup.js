import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, Spacing, BorderRadius } from '../constants/Theme';

// Country code → minimum local phone digits
const PHONE_LENGTH_MAP = {
  'IN': 10, 'US': 10, 'CA': 10, 'GB': 10, 'AU': 10, 'FR': 10, 'DE': 10, 'IT': 10,
  'ES': 9, 'NL': 9, 'BE': 9, 'SE': 9, 'NO': 8, 'DK': 8,
  'SG': 8, 'HK': 8,
  'MY': 9, 'PH': 10, 'ID': 10, 'TH': 9, 'KR': 10, 'JP': 10,
  'AE': 9, 'SA': 9, 'QA': 8, 'KW': 8, 'BH': 8, 'OM': 8,
  'BR': 11, 'MX': 10, 'AR': 10, 'CL': 9, 'CO': 10,
  'ZA': 9, 'KE': 9, 'NG': 10,
  'LK': 9, 'NP': 10, 'BD': 10, 'PK': 10, 'MM': 9,
  'NZ': 9, 'CN': 11, 'TW': 9,
};

export function getPhoneMinLength(countryCode) {
  return PHONE_LENGTH_MAP[countryCode] || 8;
}

export default function CustomerLookup({
  restaurantId,
  onCustomerFound,
  onPhoneChange,
  onRedeemChange,
  onCustomerChipPress,
  redeemPoints = 0,
  compact = false,
  countryCode = 'IN',
}) {
  const [phone, setPhone] = useState('');
  const [lookupStatus, setLookupStatus] = useState('idle'); // idle | loading | found | not_found | error
  const [customer, setCustomer] = useState(null);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const lastPhoneRef = useRef('');

  const minLength = getPhoneMinLength(countryCode);

  const triggerLookup = useCallback((digits) => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // If phone cleared or too short, reset
    if (digits.length < minLength) {
      if (lastPhoneRef.current) {
        setCustomer(null);
        setLookupStatus('idle');
        setError('');
        lastPhoneRef.current = '';
        if (onCustomerFound) onCustomerFound(null, loyaltySettings);
      }
      return;
    }

    // Don't re-lookup the same phone
    if (digits === lastPhoneRef.current) return;

    setLookupStatus('loading');

    debounceRef.current = setTimeout(async () => {
      if (!restaurantId) {
        setLookupStatus('idle');
        return;
      }

      try {
        // Load loyalty settings if not cached
        let settings = loyaltySettings;
        if (!settings) {
          try {
            const appSettings = await apiClient.getPublicCustomerAppSettings(restaurantId);
            settings = appSettings?.loyaltyProgram || null;
            setLoyaltySettings(settings);
          } catch (e) {
            // Loyalty may not be configured
          }
        }

        lastPhoneRef.current = digits;
        const response = await apiClient.lookupCustomerByPhone(restaurantId, digits, countryCode);

        if (response.customer) {
          setCustomer(response.customer);
          setLookupStatus('found');
          setError('');
          if (onCustomerFound) onCustomerFound(response.customer, settings);
        } else {
          setCustomer(null);
          setLookupStatus('not_found');
          setError('');
          if (onCustomerFound) onCustomerFound(null, settings);
        }
      } catch (err) {
        console.error('Customer lookup error:', err);
        setLookupStatus('error');
        setCustomer(null);
        setError('');
        if (onCustomerFound) onCustomerFound(null, loyaltySettings);
      }
    }, 500);
  }, [restaurantId, countryCode, loyaltySettings, onCustomerFound, minLength]);

  const handlePhoneChange = (text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, minLength + 3);
    setPhone(cleaned);
    if (onPhoneChange) onPhoneChange(cleaned);

    // Reset customer display if phone changed after found
    if (customer) {
      setCustomer(null);
      setLookupStatus('idle');
      if (onCustomerFound) onCustomerFound(null, loyaltySettings);
    }

    triggerLookup(cleaned);
  };

  const pointsValue = () => {
    if (!customer || !loyaltySettings) return 0;
    const redemptionRate = loyaltySettings.redemptionValue || 0.1;
    return (customer.loyaltyPoints || 0) * redemptionRate;
  };

  const maxRedeemablePoints = () => {
    if (!customer || !loyaltySettings) return 0;
    const available = customer.loyaltyPoints || 0;
    const minRedeem = loyaltySettings.minimumRedemption || 0;
    if (available < minRedeem) return 0;
    return available;
  };

  const handleRedeemToggle = () => {
    if (redeemPoints > 0) {
      if (onRedeemChange) onRedeemChange(0);
    } else {
      const max = maxRedeemablePoints();
      if (max > 0 && onRedeemChange) onRedeemChange(max);
    }
  };

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Phone Input */}
      <View style={[
        styles.phoneRow,
        lookupStatus === 'found' && styles.phoneRowFound,
      ]}>
        <Ionicons name="call-outline" size={18} color={lookupStatus === 'found' ? '#22c55e' : Colors.textLight} />
        <TextInput
          style={styles.phoneInput}
          placeholder="Customer phone"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={handlePhoneChange}
          maxLength={minLength + 3}
        />
        {lookupStatus === 'loading' && (
          <ActivityIndicator size="small" color="#ef4444" />
        )}
        {lookupStatus === 'found' && customer && (
          <View style={styles.foundBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
          </View>
        )}
      </View>

      {/* Customer Info Chip — tappable to open detail modal */}
      {customer && lookupStatus === 'found' && (
        <TouchableOpacity
          style={styles.customerInfo}
          onPress={() => onCustomerChipPress?.(customer)}
          activeOpacity={0.7}
        >
          <View style={styles.customerRow}>
            <View style={styles.customerNameRow}>
              <Text style={styles.customerName}>{customer.name || 'Customer'}</Text>
              {customer.totalOrders > 0 && (
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{customer.totalOrders} orders</Text>
                </View>
              )}
            </View>
            <View style={styles.chipRight}>
              {loyaltySettings?.enabled !== false && (customer.loyaltyPoints || 0) > 0 && (
                <View style={styles.pointsBadge}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={styles.pointsText}>
                    {customer.loyaltyPoints} pts
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
            </View>
          </View>

          {/* Loyalty Redemption */}
          {loyaltySettings?.enabled !== false && maxRedeemablePoints() > 0 && (
            <View style={styles.redeemRow}>
              <Text style={styles.redeemLabel}>
                Use {maxRedeemablePoints()} pts (worth ₹{pointsValue().toFixed(0)})
              </Text>
              <TouchableOpacity
                style={[styles.redeemButton, redeemPoints > 0 && styles.redeemButtonActive]}
                onPress={handleRedeemToggle}
              >
                <Text style={[styles.redeemButtonText, redeemPoints > 0 && styles.redeemButtonTextActive]}>
                  {redeemPoints > 0 ? 'Applied' : 'Redeem'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  containerCompact: {
    padding: 12,
    marginTop: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  phoneRowFound: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  foundBadge: {
    padding: 2,
  },
  customerInfo: {
    marginTop: 10,
    backgroundColor: '#f5f3ff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6d28d9',
  },
  ordersBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ordersBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7c3aed',
  },
  chipRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fefce8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  pointsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  redeemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e9d5ff',
  },
  redeemLabel: {
    fontSize: 12,
    color: '#6d28d9',
    flex: 1,
  },
  redeemButton: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  redeemButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  redeemButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6d28d9',
  },
  redeemButtonTextActive: {
    color: '#fff',
  },
  errorText: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 6,
  },
});
