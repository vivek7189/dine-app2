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
  onCustomerNameChange,
  onCustomerEmailChange,
  redeemPoints = 0,
  compact = false,
  countryCode = 'IN',
  subtotal = 0,
  hideLoyalty = false,
  coolStyle = false,
  webDesign = false,
  hideExtras = false,
}) {
  const [phone, setPhone] = useState('');
  const [lookupStatus, setLookupStatus] = useState('idle'); // idle | loading | found | not_found | error
  const [customer, setCustomer] = useState(null);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [error, setError] = useState('');
  const [showExtraFields, setShowExtraFields] = useState(false);
  const [customerNameLocal, setCustomerNameLocal] = useState('');
  const [customerEmailLocal, setCustomerEmailLocal] = useState('');
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
            settings = appSettings?.settings?.loyaltySettings || null;
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
          // Sync local name so it's editable
          setCustomerNameLocal(response.customer.name || '');
          if (onCustomerNameChange) onCustomerNameChange(response.customer.name || '');
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

  // ---------- webDesign mode: clean stacked full-width inputs ----------
  if (webDesign) {
    const phoneValid = lookupStatus === 'found' && customer;
    const nameValid = customerNameLocal.length > 2;
    return (
      <View style={styles.webContainer}>
        {/* Phone input — full width */}
        <View style={[styles.webInput, phoneValid && styles.webInputValid]}>
          <TextInput
            style={styles.webInputText}
            placeholder="Customer phone"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={handlePhoneChange}
            maxLength={minLength + 3}
          />
          {lookupStatus === 'loading' && (
            <ActivityIndicator size="small" color="#ef4444" />
          )}
          {phoneValid && (
            <Ionicons name="checkmark-circle" size={18} color="#dc2626" />
          )}
        </View>
        {/* Name input — full width, always visible */}
        <View style={[styles.webInput, nameValid && styles.webInputValid]}>
          <TextInput
            style={styles.webInputText}
            placeholder="Customer name"
            placeholderTextColor="#9ca3af"
            value={customerNameLocal}
            onChangeText={(text) => {
              setCustomerNameLocal(text);
              if (onCustomerNameChange) onCustomerNameChange(text);
            }}
            autoCapitalize="words"
          />
          {nameValid && (
            <Ionicons name="checkmark-circle" size={18} color="#0891b2" />
          )}
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    );
  }

  // ---------- Default mode ----------
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Phone + Add button row */}
      <View style={styles.customerInputRow}>
        <View style={[
          styles.phoneRow,
          coolStyle && styles.phoneRowCool,
          lookupStatus === 'found' && (coolStyle ? styles.phoneRowCoolFound : styles.phoneRowFound),
          { flex: 1 },
        ]}>
          <Ionicons name="phone-portrait-outline" size={15} color={lookupStatus === 'found' ? '#dc2626' : '#9ca3af'} />
          <TextInput
            style={[styles.phoneInput, coolStyle && styles.phoneInputCool]}
            placeholder={coolStyle ? 'Enter phone number' : 'Customer phone'}
            placeholderTextColor={coolStyle ? '#9ca3af' : '#9ca3af'}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={handlePhoneChange}
            maxLength={minLength + 3}
          />
          {lookupStatus === 'loading' && (
            <ActivityIndicator size="small" color="#ef4444" />
          )}
          {lookupStatus === 'found' && customer && (
            <Ionicons name="checkmark-circle" size={16} color="#dc2626" />
          )}
        </View>
        {!hideExtras && !customer && (
          <TouchableOpacity
            style={[styles.addFieldsBtn, showExtraFields && styles.addFieldsBtnActive]}
            onPress={() => setShowExtraFields(!showExtraFields)}
            activeOpacity={0.7}
          >
            <Ionicons name={showExtraFields ? 'chevron-up' : 'add'} size={18} color={showExtraFields ? '#dc2626' : '#6b7280'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Extra fields: Name & Email */}
      {!hideExtras && showExtraFields && !customer && (
        <View style={styles.extraFields}>
          <View style={styles.extraFieldRow}>
            <Ionicons name="person-outline" size={16} color="#9ca3af" />
            <TextInput
              style={styles.extraInput}
              placeholder="Customer name"
              placeholderTextColor="#9ca3af"
              value={customerNameLocal}
              onChangeText={(text) => {
                setCustomerNameLocal(text);
                if (onCustomerNameChange) onCustomerNameChange(text);
              }}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.extraFieldRow}>
            <Ionicons name="mail-outline" size={16} color="#9ca3af" />
            <TextInput
              style={styles.extraInput}
              placeholder="Email (optional)"
              placeholderTextColor="#9ca3af"
              value={customerEmailLocal}
              onChangeText={(text) => {
                setCustomerEmailLocal(text);
                if (onCustomerEmailChange) onCustomerEmailChange(text);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
      )}

      {/* Customer Info Chip */}
      {!hideExtras && customer && lookupStatus === 'found' && (
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

          {/* Editable customer name */}
          <View style={styles.editNameRow}>
            <Ionicons name="person-outline" size={14} color="#dc2626" />
            <TextInput
              style={styles.editNameInput}
              value={customerNameLocal}
              onChangeText={(text) => {
                setCustomerNameLocal(text);
                if (onCustomerNameChange) onCustomerNameChange(text);
              }}
              placeholder="Customer name"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
            {customerNameLocal.length > 2 && (
              <Ionicons name="checkmark-circle" size={14} color="#dc2626" />
            )}
          </View>

          {/* Loyalty Redemption Slider */}
          {!hideLoyalty && hasRedeemablePoints && (
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
                    placeholderTextColor="#fca5a5"
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
          {!hideLoyalty && loyaltyEnabled && earnPerAmount > 0 && pointsEarnedPerUnit > 0 && subtotal > 0 && (
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
                  <Ionicons name="gift-outline" size={14} color="#dc2626" />
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
  // --- webDesign mode styles ---
  webContainer: {
    gap: 6,
  },
  webInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  webInputValid: {
    borderColor: '#dc2626',
    backgroundColor: '#fff',
  },
  webInputText: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },

  // --- default mode styles ---
  container: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  containerCompact: {
    padding: 4,
    marginTop: 0,
  },
  customerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  phoneRowFound: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  phoneRowCool: {
    backgroundColor: '#ffffff',
    borderColor: '#d1d5db',
    borderWidth: 1,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  phoneRowCoolFound: {
    backgroundColor: '#ffffff',
    borderColor: '#86efac',
  },
  phoneInputCool: {
    color: '#1e293b',
  },
  phoneInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  addFieldsBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addFieldsBtnActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  extraFields: {
    marginTop: 8,
    gap: 8,
  },
  extraFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  extraInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  customerInfo: {
    marginTop: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
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
    color: '#0f766e',
  },
  ordersBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ordersBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#dc2626',
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

  // --- Editable name row (when customer found) ---
  editNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  editNameInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#0f766e',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
  },

  // --- Redemption section ---
  redeemSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
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
    color: '#0f766e',
  },
  redeemValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  redeemControls: {
    gap: 8,
  },
  redeemInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  redeemInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f766e',
  },
  redeemInputSuffix: {
    fontSize: 12,
    color: '#dc2626',
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
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  pillActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  pillClear: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    paddingHorizontal: 8,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f766e',
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
    backgroundColor: '#fecaca',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    backgroundColor: '#dc2626',
    borderRadius: 2,
  },
  barLabel: {
    fontSize: 10,
    color: '#0f766e',
    marginTop: 3,
  },

  // --- Earning section ---
  earnSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
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
    color: '#dc2626',
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
