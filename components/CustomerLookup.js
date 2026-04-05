import React, { useState, useCallback, useRef, useMemo } from 'react';
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

/**
 * Resolve redemption rate (pts per ₹1) from loyalty settings.
 * Supports both old `redemptionValue` (e.g. 0.1 = 1pt = ₹0.10)
 * and new `redemptionRate` (e.g. 100 = 100pts per ₹1).
 */
function getRedemptionRate(settings) {
  if (!settings) return 10; // fallback: 10 pts = ₹1
  if (settings.redemptionRate) return settings.redemptionRate;
  if (settings.redemptionValue) return 1 / settings.redemptionValue;
  return 10;
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
  subtotal = 0,
}) {
  const [phone, setPhone] = useState('');
  const [lookupStatus, setLookupStatus] = useState('idle'); // idle | loading | found | not_found | error
  const [customer, setCustomer] = useState(null);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const lastPhoneRef = useRef('');

  const minLength = getPhoneMinLength(countryCode);

  // --- Derived loyalty values ---
  const redemptionRate = useMemo(() => getRedemptionRate(loyaltySettings), [loyaltySettings]);

  const availablePoints = customer?.loyaltyPoints || 0;

  const maxRedemptionPercent = loyaltySettings?.maxRedemptionPercent || 100;
  const earnPerAmount = loyaltySettings?.earnPerAmount || 0;
  const pointsEarnedPerUnit = loyaltySettings?.pointsEarned || 0;
  const earnPointsOnRedemption = loyaltySettings?.earnPointsOnRedemption !== false;
  const earnOnFullAmount = loyaltySettings?.earnOnFullAmount !== false;
  const minimumRedemption = loyaltySettings?.minimumRedemption || 0;

  // Max points allowed by bill percentage cap
  const maxRedeemableByPercent = useMemo(() => {
    if (!subtotal || subtotal <= 0) return 0;
    const maxDiscount = (subtotal * maxRedemptionPercent) / 100;
    return Math.floor(maxDiscount * redemptionRate);
  }, [subtotal, maxRedemptionPercent, redemptionRate]);

  // Effective max redeemable (min of available and percent cap)
  const maxRedeemable = useMemo(() => {
    if (availablePoints < minimumRedemption) return 0;
    return Math.min(availablePoints, maxRedeemableByPercent);
  }, [availablePoints, maxRedeemableByPercent, minimumRedemption]);

  // Rupee value for given points
  const pointsToRupees = useCallback(
    (pts) => pts / redemptionRate,
    [redemptionRate]
  );

  // Earning calculation
  const earningInfo = useMemo(() => {
    if (!loyaltySettings || !earnPerAmount || !pointsEarnedPerUnit || subtotal <= 0) {
      return { points: 0, paused: false };
    }
    // If not earning on redemption and currently redeeming
    if (!earnPointsOnRedemption && redeemPoints > 0) {
      return { points: 0, paused: true };
    }
    const billForEarning = earnOnFullAmount
      ? subtotal
      : subtotal - pointsToRupees(redeemPoints);
    const effectiveBill = Math.max(0, billForEarning);
    const earned = Math.floor(effectiveBill / earnPerAmount) * pointsEarnedPerUnit;
    return { points: earned, paused: false };
  }, [
    loyaltySettings, earnPerAmount, pointsEarnedPerUnit, subtotal,
    earnPointsOnRedemption, earnOnFullAmount, redeemPoints, pointsToRupees,
  ]);

  // --- Lookup logic (unchanged) ---
  const triggerLookup = useCallback((digits) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

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

    if (digits === lastPhoneRef.current) return;

    setLookupStatus('loading');

    debounceRef.current = setTimeout(async () => {
      if (!restaurantId) {
        setLookupStatus('idle');
        return;
      }

      try {
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

    if (customer) {
      setCustomer(null);
      setLookupStatus('idle');
      if (onCustomerFound) onCustomerFound(null, loyaltySettings);
    }

    triggerLookup(cleaned);
  };

  // --- Redemption handlers ---
  const setRedeemAmount = useCallback(
    (pts) => {
      const clamped = Math.max(0, Math.min(pts, maxRedeemable));
      if (onRedeemChange) onRedeemChange(clamped);
    },
    [maxRedeemable, onRedeemChange]
  );

  const handleQuickSelect = useCallback(
    (fraction) => {
      if (fraction === 0) {
        if (onRedeemChange) onRedeemChange(0);
        return;
      }
      const pts = Math.floor(maxRedeemable * fraction);
      setRedeemAmount(pts);
    },
    [maxRedeemable, setRedeemAmount, onRedeemChange]
  );

  const handleRedeemInputChange = useCallback(
    (text) => {
      const num = parseInt(text.replace(/\D/g, ''), 10);
      if (isNaN(num)) {
        if (onRedeemChange) onRedeemChange(0);
        return;
      }
      setRedeemAmount(num);
    },
    [setRedeemAmount, onRedeemChange]
  );

  const loyaltyEnabled = loyaltySettings?.enabled !== false;
  const hasRedeemablePoints = loyaltyEnabled && maxRedeemable > 0;
  const discountValue = pointsToRupees(redeemPoints);

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

      {/* Customer Info Chip */}
      {customer && lookupStatus === 'found' && (
        <View style={styles.customerInfo}>
          {/* Top row: name, orders, points — tappable for detail modal */}
          <TouchableOpacity
            style={styles.customerRow}
            onPress={() => onCustomerChipPress?.(customer)}
            activeOpacity={0.7}
          >
            <View style={styles.customerNameRow}>
              <Text style={styles.customerName}>{customer.name || 'Customer'}</Text>
              {customer.totalOrders > 0 && (
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{customer.totalOrders} orders</Text>
                </View>
              )}
            </View>
            <View style={styles.chipRight}>
              {loyaltyEnabled && availablePoints > 0 && (
                <View style={styles.pointsBadge}>
                  <Ionicons name="star" size={12} color="#f59e0b" />
                  <Text style={styles.pointsText}>
                    {availablePoints} pts
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
            </View>
          </TouchableOpacity>

          {/* Loyalty Redemption Slider */}
          {hasRedeemablePoints && (
            <View style={styles.redeemSection}>
              <View style={styles.redeemHeader}>
                <Text style={styles.redeemLabel}>Redeem points</Text>
                {redeemPoints > 0 && (
                  <Text style={styles.redeemValue}>
                    {redeemPoints} pts = {'\u20B9'}{discountValue.toFixed(0)} off
                  </Text>
                )}
              </View>

              {/* Points input + quick-select pills */}
              <View style={styles.redeemControls}>
                <View style={styles.redeemInputWrap}>
                  <TextInput
                    style={styles.redeemInput}
                    keyboardType="number-pad"
                    value={redeemPoints > 0 ? String(redeemPoints) : ''}
                    onChangeText={handleRedeemInputChange}
                    placeholder="0"
                    placeholderTextColor="#a78bfa"
                    maxLength={8}
                  />
                  <Text style={styles.redeemInputSuffix}>pts</Text>
                </View>
                <View style={styles.quickPills}>
                  {[
                    { label: '25%', value: 0.25 },
                    { label: '50%', value: 0.50 },
                    { label: '75%', value: 0.75 },
                    { label: 'Max', value: 1 },
                  ].map((opt) => {
                    const pillPts = Math.floor(maxRedeemable * opt.value);
                    const isActive = redeemPoints > 0 && redeemPoints === pillPts;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[styles.pill, isActive && styles.pillActive]}
                        onPress={() => handleQuickSelect(opt.value)}
                      >
                        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {redeemPoints > 0 && (
                    <TouchableOpacity
                      style={[styles.pill, styles.pillClear]}
                      onPress={() => handleQuickSelect(0)}
                    >
                      <Ionicons name="close" size={12} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Visual bar showing how much of available points is being used */}
              {maxRedeemable > 0 && (
                <View style={styles.barContainer}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.min(100, (redeemPoints / maxRedeemable) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>
                    {redeemPoints} / {maxRedeemable} pts
                    {maxRedemptionPercent < 100 ? ` (max ${maxRedemptionPercent}% of bill)` : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Earning display */}
          {loyaltyEnabled && earnPerAmount > 0 && pointsEarnedPerUnit > 0 && subtotal > 0 && (
            <View style={styles.earnSection}>
              {earningInfo.paused ? (
                <View style={styles.earnRow}>
                  <Ionicons name="pause-circle-outline" size={14} color="#9ca3af" />
                  <Text style={styles.earnPausedText}>
                    Points earning paused when redeeming
                  </Text>
                </View>
              ) : earningInfo.points > 0 ? (
                <View style={styles.earnRow}>
                  <Ionicons name="gift-outline" size={14} color="#22c55e" />
                  <Text style={styles.earnText}>
                    You'll earn <Text style={styles.earnHighlight}>{earningInfo.points} pts</Text> on this order
                  </Text>
                </View>
              ) : null}
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

  // --- Redemption section ---
  redeemSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e9d5ff',
  },
  redeemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  redeemLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6d28d9',
  },
  redeemValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7c3aed',
  },
  redeemControls: {
    gap: 8,
  },
  redeemInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  redeemInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#6d28d9',
  },
  redeemInputSuffix: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '500',
  },
  quickPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
  },
  pillActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  pillClear: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    paddingHorizontal: 8,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6d28d9',
  },
  pillTextActive: {
    color: '#fff',
  },

  // --- Visual bar ---
  barContainer: {
    marginTop: 8,
  },
  barTrack: {
    height: 4,
    backgroundColor: '#e9d5ff',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    backgroundColor: '#7c3aed',
    borderRadius: 2,
  },
  barLabel: {
    fontSize: 10,
    color: '#8b5cf6',
    marginTop: 3,
  },

  // --- Earning section ---
  earnSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e9d5ff',
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  earnText: {
    fontSize: 12,
    color: '#374151',
  },
  earnHighlight: {
    fontWeight: '700',
    color: '#22c55e',
  },
  earnPausedText: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
  },

  errorText: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 6,
  },
});
