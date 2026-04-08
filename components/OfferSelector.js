import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../constants/Theme';
import useOfferEngine from '../hooks/useOfferEngine';
import { calculateOfferResult } from '../services/offerEngine';

/**
 * OfferSelector (extended-engine version)
 *
 * Drop-in replacement for the previous OfferSelector. Uses the shared
 * useOfferEngine hook for audience targeting, tiered discounts, cross-item
 * BOGO with free items, and the "login to unlock" UX.
 *
 * Prop contract (back-compatible):
 *   - restaurantId                 (string)
 *   - cartItems                    (array)   - cart lines
 *   - subtotal                     (number)
 *   - onOfferSelected(id, disc, offer)        - legacy single-offer cb
 *   - selectedOfferId              (string)   - legacy controlled id (advisory)
 *   - onOffersChanged(ids, total, offers)     - legacy multi-offer cb (we pass arrays of length <= 1)
 *   - onOfferSettingsLoaded(settings)         - still called (no-op payload)
 *   - onManualDiscountChange(value, type)     - manual discount cb
 *   - manualDiscount / manualDiscountType     - controlled manual discount
 *   - customerInfo                 ({ isFirstOrder })      - legacy
 *
 * Extended props:
 *   - customerContext              ({ customerPhone, customerId, isFirstOrder, customerGroupIds? })
 *   - onFreeItemsChange(freeItems)            - NEW additive callback for BOGO free items
 */
export default function OfferSelector({
  restaurantId,
  cartItems = [],
  subtotal = 0,
  // Legacy single-offer
  onOfferSelected,
  selectedOfferId: selectedOfferIdProp = null,
  // Legacy multi-offer
  onOffersChanged,
  onOfferSettingsLoaded,
  // Manual discount
  onManualDiscountChange,
  manualDiscount = '',
  manualDiscountType = 'flat',
  // Customer
  customerInfo = null,
  customerContext = null,
  // Free items (additive)
  onFreeItemsChange,
}) {
  // Merge legacy customerInfo into a resolved context for the hook.
  const resolvedCustomerContext = useMemo(() => {
    if (customerContext) return customerContext;
    if (customerInfo && (customerInfo.customerPhone || customerInfo.isFirstOrder !== undefined)) {
      return {
        customerPhone: customerInfo.customerPhone || null,
        customerId: customerInfo.customerId || null,
        isFirstOrder: customerInfo.isFirstOrder,
      };
    }
    return null;
  }, [customerContext, customerInfo]);

  const {
    applicableOffers,
    selectedOfferId,
    setSelectedOfferId,
    offerDiscount,
    freeItems,
    isLoadingOffers,
    recomputeWithPhone,
  } = useOfferEngine({
    restaurantId,
    cart: cartItems,
    subtotal,
    customerContext: resolvedCustomerContext,
    options: { autoApply: true },
  });

  // Manual discount local state (mirrors props for uncontrolled fallback)
  const [localManualDiscount, setLocalManualDiscount] = useState(manualDiscount);
  const [localDiscountType, setLocalDiscountType] = useState(manualDiscountType);

  // Login-to-unlock inline modal state
  const [loginModalVisible, setLoginModalVisible] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');
  const [pendingOfferId, setPendingOfferId] = useState(null);

  // One-time settings-loaded notification (kept for back-compat shape)
  const settingsNotifiedRef = useRef(false);
  useEffect(() => {
    if (!settingsNotifiedRef.current && onOfferSettingsLoaded) {
      settingsNotifiedRef.current = true;
      onOfferSettingsLoaded({
        allowMultipleOffers: false,
        maxOffersAllowed: 1,
        autoApplyBestOffer: true,
      });
    }
  }, [onOfferSettingsLoaded]);

  // Notify parent of selection + discount changes in the legacy shape.
  const lastNotifiedRef = useRef({ id: null, discount: 0 });
  useEffect(() => {
    const lastId = lastNotifiedRef.current.id;
    const lastDisc = lastNotifiedRef.current.discount;
    if (lastId === selectedOfferId && lastDisc === offerDiscount) return;
    lastNotifiedRef.current = { id: selectedOfferId, discount: offerDiscount };

    const offer = selectedOfferId
      ? applicableOffers.find(o => (o.id || o._id) === selectedOfferId) || null
      : null;

    if (onOfferSelected) {
      onOfferSelected(selectedOfferId || null, offerDiscount || 0, offer);
    }
    if (onOffersChanged) {
      const ids = selectedOfferId ? [selectedOfferId] : [];
      const offers = offer ? [offer] : [];
      onOffersChanged(ids, offerDiscount || 0, offers);
    }
  }, [selectedOfferId, offerDiscount, applicableOffers, onOfferSelected, onOffersChanged]);

  // Notify parent of freeItems changes (additive).
  const lastFreeItemsRef = useRef([]);
  useEffect(() => {
    if (!onFreeItemsChange) return;
    const prev = lastFreeItemsRef.current;
    const changed =
      prev.length !== freeItems.length ||
      prev.some((p, i) => (p?.itemId || p?.menuItemId) !== (freeItems[i]?.itemId || freeItems[i]?.menuItemId) ||
                          (p?.quantity !== freeItems[i]?.quantity));
    if (changed) {
      lastFreeItemsRef.current = freeItems;
      onFreeItemsChange(freeItems);
    }
  }, [freeItems, onFreeItemsChange]);

  // Compute per-offer discount for chip display (previewing each offer).
  const discountFor = useCallback((offer) => {
    if (!offer || offer._requiresLogin) return 0;
    const res = calculateOfferResult(offer, subtotal, cartItems, resolvedCustomerContext || {});
    return res?.discount || 0;
  }, [subtotal, cartItems, resolvedCustomerContext]);

  const handleChipPress = useCallback((offer) => {
    const offerId = offer.id || offer._id;
    if (offer._requiresLogin) {
      setPendingOfferId(offerId);
      setPendingPhone('');
      setLoginModalVisible(true);
      return;
    }
    if (selectedOfferId === offerId) {
      setSelectedOfferId(null);
    } else {
      setSelectedOfferId(offerId);
    }
  }, [selectedOfferId, setSelectedOfferId]);

  const handlePhoneSubmit = useCallback(() => {
    const phone = (pendingPhone || '').trim();
    if (!phone) return;
    recomputeWithPhone(phone);
    setLoginModalVisible(false);
    // Note: after group lookup completes, the offer may become eligible.
    // Auto-apply will re-pick; user can then tap again if needed.
    setPendingOfferId(null);
    setPendingPhone('');
  }, [pendingPhone, recomputeWithPhone]);

  // Manual Discount handlers
  const handleManualDiscountChange = (value) => {
    setLocalManualDiscount(value);
    if (onManualDiscountChange) onManualDiscountChange(value, localDiscountType);
  };

  const toggleDiscountType = () => {
    const newType = localDiscountType === 'flat' ? 'percentage' : 'flat';
    setLocalDiscountType(newType);
    if (onManualDiscountChange) onManualDiscountChange(localManualDiscount, newType);
  };

  const getManualDiscountAmount = () => {
    const val = parseFloat(localManualDiscount) || 0;
    if (localDiscountType === 'percentage') {
      return Math.round((subtotal * val / 100) * 100) / 100;
    }
    return Math.min(val, subtotal);
  };

  return (
    <View style={styles.container}>
      {/* Offer Chips */}
      {applicableOffers.length > 0 && (
        <View style={styles.offerSection}>
          <View style={styles.offerHeader}>
            <Ionicons name="pricetag-outline" size={14} color="#8b5cf6" />
            <Text style={styles.offerHeaderText}>
              {applicableOffers.length} offer{applicableOffers.length > 1 ? 's' : ''} available
            </Text>
            {offerDiscount > 0 && (
              <Text style={styles.totalDiscountText}>
                -₹{offerDiscount.toFixed(0)}
              </Text>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContainer}
          >
            {applicableOffers.map((offer) => {
              const offerId = offer.id || offer._id;
              const isLocked = !!offer._requiresLogin;
              const preview = discountFor(offer);
              const isSelected = !isLocked && selectedOfferId === offerId;

              return (
                <TouchableOpacity
                  key={offerId}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                    isLocked && styles.chipLocked,
                  ]}
                  onPress={() => handleChipPress(offer)}
                  activeOpacity={0.7}
                >
                  {isLocked ? (
                    <Text style={styles.chipLockIcon}>🔒</Text>
                  ) : isSelected ? (
                    <Ionicons name="checkmark-circle" size={14} color="#7c3aed" style={styles.chipCheckmark} />
                  ) : null}
                  <View style={styles.chipTextContainer}>
                    <Text
                      style={[
                        styles.chipName,
                        isSelected && styles.chipNameSelected,
                        isLocked && styles.chipNameLocked,
                      ]}
                      numberOfLines={1}
                    >
                      {offer.name}
                    </Text>
                    {isLocked ? (
                      <Text style={styles.chipLockedHint}>Tap to unlock</Text>
                    ) : preview > 0 ? (
                      <Text style={[styles.chipSaves, isSelected && styles.chipSavesSelected]}>
                        saves ₹{preview.toFixed(0)}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isLoadingOffers && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.textLight} />
          <Text style={styles.loadingText}>Loading offers...</Text>
        </View>
      )}

      {/* Manual Discount */}
      <View style={styles.manualSection}>
        <Text style={styles.manualLabel}>Manual Discount</Text>
        <View style={styles.manualRow}>
          <TouchableOpacity style={styles.discountTypeToggle} onPress={toggleDiscountType}>
            <Text style={styles.discountTypeText}>
              {localDiscountType === 'percentage' ? '%' : '₹'}
            </Text>
          </TouchableOpacity>
          <TextInput
            style={styles.manualInput}
            placeholder="0"
            placeholderTextColor="#999"
            keyboardType="numeric"
            value={localManualDiscount}
            onChangeText={handleManualDiscountChange}
          />
          {getManualDiscountAmount() > 0 && (
            <Text style={styles.manualAmount}>-₹{getManualDiscountAmount().toFixed(0)}</Text>
          )}
        </View>
      </View>

      {/* Inline login-to-unlock modal */}
      <Modal
        visible={loginModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLoginModalVisible(false)}
      >
        <View style={styles.loginBackdrop}>
          <View style={styles.loginCard}>
            <Text style={styles.loginTitle}>Unlock this offer</Text>
            <Text style={styles.loginSubtitle}>
              Enter your phone number to check if you qualify.
            </Text>
            <TextInput
              style={styles.loginInput}
              placeholder="Phone number"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
              value={pendingPhone}
              onChangeText={setPendingPhone}
              autoFocus
            />
            <View style={styles.loginActions}>
              <TouchableOpacity
                style={[styles.loginBtn, styles.loginBtnCancel]}
                onPress={() => setLoginModalVisible(false)}
              >
                <Text style={styles.loginBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.loginBtn, styles.loginBtnSubmit]}
                onPress={handlePhoneSubmit}
              >
                <Text style={styles.loginBtnSubmitText}>Unlock</Text>
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
    marginTop: 8,
    padding: 16,
  },
  offerSection: {
    marginBottom: 12,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  offerHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6d28d9',
  },
  totalDiscountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    marginLeft: 'auto',
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    maxWidth: 220,
    gap: 4,
  },
  chipSelected: {
    backgroundColor: '#f5f3ff',
    borderColor: '#c4b5fd',
  },
  chipLocked: {
    borderColor: '#f59e0b',
    borderStyle: 'dashed',
    backgroundColor: '#fffbeb',
  },
  chipCheckmark: {
    marginRight: 2,
  },
  chipLockIcon: {
    fontSize: 12,
    marginRight: 2,
  },
  chipTextContainer: {
    flexShrink: 1,
  },
  chipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  chipNameSelected: {
    color: '#6d28d9',
  },
  chipNameLocked: {
    color: '#b45309',
  },
  chipSaves: {
    fontSize: 10,
    fontWeight: '500',
    color: '#10b981',
    marginTop: 1,
  },
  chipSavesSelected: {
    color: '#7c3aed',
  },
  chipLockedHint: {
    fontSize: 10,
    fontWeight: '500',
    color: '#b45309',
    marginTop: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: Colors.textLight,
  },
  manualSection: {},
  manualLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  discountTypeToggle: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  discountTypeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1f2937',
  },
  manualAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
    minWidth: 50,
    textAlign: 'right',
  },
  // Login modal
  loginBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loginCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  loginTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  loginSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 14,
  },
  loginInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    marginBottom: 14,
  },
  loginActions: {
    flexDirection: 'row',
    gap: 10,
  },
  loginBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  loginBtnCancel: {
    backgroundColor: '#f3f4f6',
  },
  loginBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  loginBtnSubmit: {
    backgroundColor: '#e11d48',
  },
  loginBtnSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
