import React, { useState, useCallback } from 'react';
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

export default function CustomerLookup({
  restaurantId,
  onCustomerFound,
  onPhoneChange,
  onRedeemChange,
  redeemPoints = 0,
  compact = false,
}) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState(null);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [error, setError] = useState('');

  const lookupCustomer = useCallback(async () => {
    if (!phone || phone.length < 10 || !restaurantId) return;

    setLoading(true);
    setError('');
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

      const response = await apiClient.lookupCustomerByPhone(restaurantId, phone);
      if (response.customer) {
        setCustomer(response.customer);
        if (onCustomerFound) {
          onCustomerFound(response.customer, settings);
        }
      } else {
        setCustomer(null);
        setError('No customer found');
        if (onCustomerFound) onCustomerFound(null, settings);
      }
    } catch (err) {
      setCustomer(null);
      setError('');
      // Not finding a customer is not an error for the flow
      if (onCustomerFound) onCustomerFound(null, loyaltySettings);
    } finally {
      setLoading(false);
    }
  }, [phone, restaurantId, loyaltySettings, onCustomerFound]);

  const handlePhoneChange = (text) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '').slice(0, 10);
    setPhone(cleaned);
    if (onPhoneChange) onPhoneChange(cleaned);

    // Reset customer if phone changed
    if (customer) {
      setCustomer(null);
      if (onCustomerFound) onCustomerFound(null, loyaltySettings);
    }
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
      <View style={styles.phoneRow}>
        <Ionicons name="call-outline" size={18} color={Colors.textLight} />
        <TextInput
          style={styles.phoneInput}
          placeholder="Customer phone"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={handlePhoneChange}
          onBlur={lookupCustomer}
          maxLength={10}
        />
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
        {customer && !loading && (
          <View style={styles.foundBadge}>
            <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
          </View>
        )}
      </View>

      {/* Customer Info */}
      {customer && (
        <View style={styles.customerInfo}>
          <View style={styles.customerRow}>
            <Text style={styles.customerName}>{customer.name || 'Customer'}</Text>
            {loyaltySettings?.enabled !== false && (customer.loyaltyPoints || 0) > 0 && (
              <View style={styles.pointsBadge}>
                <Ionicons name="star" size={12} color="#f59e0b" />
                <Text style={styles.pointsText}>
                  {customer.loyaltyPoints} pts
                </Text>
              </View>
            )}
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
        </View>
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
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
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
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
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
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
  },
  redeemLabel: {
    fontSize: 12,
    color: '#166534',
    flex: 1,
  },
  redeemButton: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  redeemButtonActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  redeemButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
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
