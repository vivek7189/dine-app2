import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
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
    genericOffers,
    personalizedOffers,
    selectedOfferId,
    setSelectedOfferId,
    selectedOfferIds,
    toggleOffer,
    offerDiscount,
    selectedOfferName,
    freeItems,
    isLoadingOffers,
    customerGroups: customerOfferGroups,
    recomputeWithPhone,
    autoApplied,
    offerSettings,
    loyaltySettings,
    calculateDiscountForOffer: calcDiscount,
  } = useOfferEngine({
    restaurantId,
    cart: cartItems,
    subtotal,
    customerContext: resolvedCustomerContext,
    options: { autoApply: true },
  });

  // Notify parent when offer settings are loaded from API
  const settingsNotifiedRef = useRef(false);
  useEffect(() => {
    if (onOfferSettingsLoaded && offerSettings && !settingsNotifiedRef.current) {
      settingsNotifiedRef.current = true;
      onOfferSettingsLoaded(offerSettings);
    }
  }, [onOfferSettingsLoaded, offerSettings]);

  // Notify parent of selection + discount changes
  const lastNotifiedRef = useRef({ ids: '', discount: 0 });
  useEffect(() => {
    const isMulti = offerSettings?.allowMultipleOffers;
    const activeIds = isMulti && selectedOfferIds.length > 0
      ? selectedOfferIds
      : (selectedOfferId ? [selectedOfferId] : []);
    const idsKey = activeIds.join(',');

    if (lastNotifiedRef.current.ids === idsKey && lastNotifiedRef.current.discount === offerDiscount) return;
    lastNotifiedRef.current = { ids: idsKey, discount: offerDiscount };

    const activeOffers = activeIds
      .map(id => applicableOffers.find(o => (o.id || o._id) === id))
      .filter(Boolean);

    if (onOfferSelected) {
      onOfferSelected(activeIds[0] || null, offerDiscount || 0, activeOffers[0] || null);
    }
    if (onOffersChanged) {
      onOffersChanged(activeIds, offerDiscount || 0, activeOffers);
    }
  }, [selectedOfferId, selectedOfferIds, offerDiscount, applicableOffers, onOfferSelected, onOffersChanged, offerSettings?.allowMultipleOffers]);

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
    if (!offer) return 0;
    const res = calculateOfferResult(offer, subtotal, cartItems, resolvedCustomerContext || {});
    return res?.discount || 0;
  }, [subtotal, cartItems, resolvedCustomerContext]);

  const handleChipPress = useCallback((offer) => {
    const offerId = offer.id || offer._id;
    if (offerSettings?.allowMultipleOffers) {
      toggleOffer(offerId);
    } else {
      if (selectedOfferId === offerId) {
        setSelectedOfferId(null);
      } else {
        setSelectedOfferId(offerId);
      }
    }
  }, [selectedOfferId, setSelectedOfferId, toggleOffer, offerSettings?.allowMultipleOffers]);

  const renderOfferChip = (offer, isPersonalized = false) => {
    const offerId = offer.id || offer._id;
    const preview = discountFor(offer);
    const isMulti = offerSettings?.allowMultipleOffers;
    const isSelected = isMulti ? selectedOfferIds.includes(offerId) : selectedOfferId === offerId;
    const offerGroupIds = offer.audience?.groupIds || [];
    const matchedGroup = isPersonalized ? customerOfferGroups?.find(g => offerGroupIds.includes(g.id)) : null;

    return (
      <TouchableOpacity
        key={offerId}
        style={[
          styles.chip,
          isSelected && (isPersonalized ? styles.chipSelectedPersonalized : styles.chipSelected),
          !isSelected && isPersonalized && styles.chipPersonalized,
        ]}
        onPress={() => handleChipPress(offer)}
        activeOpacity={0.7}
      >
        {isSelected ? (
          <Ionicons name="close-circle" size={16} color={isPersonalized ? '#d97706' : '#7c3aed'} style={styles.chipCheckmark} />
        ) : (
          <Ionicons name={isPersonalized ? 'gift-outline' : 'pricetag-outline'} size={13} color={isPersonalized ? '#b45309' : '#9ca3af'} style={styles.chipCheckmark} />
        )}
        <View style={styles.chipTextContainer}>
          <Text
            style={[
              styles.chipName,
              isSelected && (isPersonalized ? styles.chipNameSelectedPersonalized : styles.chipNameSelected),
              !isSelected && isPersonalized && styles.chipNamePersonalized,
            ]}
            numberOfLines={1}
          >
            {offer.name}
          </Text>
          {preview > 0 ? (
            <Text style={[styles.chipSaves, isSelected && styles.chipSavesSelected]}>
              saves ₹{preview.toFixed(0)}{matchedGroup ? ` · ${matchedGroup.name}` : ''}
            </Text>
          ) : matchedGroup ? (
            <Text style={styles.chipSaves}>{matchedGroup.name}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Offer Chips */}
      {(genericOffers.length > 0 || personalizedOffers.length > 0) && (
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
            {genericOffers.map(offer => renderOfferChip(offer, false))}
            {personalizedOffers.map(offer => renderOfferChip(offer, true))}
          </ScrollView>
        </View>
      )}

      {isLoadingOffers && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={Colors.textLight} />
          <Text style={styles.loadingText}>Loading offers...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  offerSection: {
    marginBottom: 4,
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
  chipPersonalized: {
    borderColor: '#fbbf24',
    backgroundColor: '#fffbeb',
  },
  chipSelectedPersonalized: {
    backgroundColor: '#fef3c7',
    borderColor: '#d97706',
  },
  chipCheckmark: {
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
  chipNamePersonalized: {
    color: '#b45309',
  },
  chipNameSelectedPersonalized: {
    color: '#92400e',
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
});
