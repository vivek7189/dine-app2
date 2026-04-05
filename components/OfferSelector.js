import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, BorderRadius } from '../constants/Theme';

// Check if an offer's schedule is currently active
function isOfferActiveNow(offer) {
  if (!offer.schedule || offer.schedule.type !== 'recurring') return true;

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun, 1=Mon...
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (offer.schedule.days && !offer.schedule.days.includes(currentDay)) return false;
  if (offer.schedule.startTime && currentTime < offer.schedule.startTime) return false;
  if (offer.schedule.endTime && currentTime > offer.schedule.endTime) return false;

  return true;
}

// Check if offer is within its valid date range
function isDateValid(offer) {
  const now = new Date();
  if (offer.validFrom) {
    const from = new Date(offer.validFrom);
    if (now < from) return false;
  }
  if (offer.validUntil || offer.validTo) {
    const until = new Date(offer.validUntil || offer.validTo);
    if (now > until) return false;
  }
  return true;
}

// Calculate discount for an offer against cart items
function calculateOfferDiscount(offer, cartItems, subtotal) {
  if (!offer || !offer.isActive) return 0;

  if (offer.minimumOrder && subtotal < offer.minimumOrder) return 0;
  if (offer.minOrderValue && subtotal < offer.minOrderValue) return 0;

  // BOGO offers
  if (offer.promotionType === 'bogo' && offer.bogoConfig) {
    const { buyQty, getQty, getDiscount } = offer.bogoConfig;
    let eligibleItems = cartItems;

    if (offer.scope === 'category' && offer.targetCategories?.length > 0) {
      eligibleItems = cartItems.filter(i =>
        offer.targetCategories.some(c => c.toLowerCase() === (i.category || '').toLowerCase())
      );
    } else if (offer.scope === 'item' && offer.targetItems?.length > 0) {
      eligibleItems = cartItems.filter(i =>
        offer.targetItems.includes(i.menuItemId || i.id)
      );
    }

    const totalQty = eligibleItems.reduce((sum, i) => sum + i.quantity, 0);
    if (totalQty >= buyQty + getQty) {
      const freeItems = Math.floor(totalQty / (buyQty + getQty)) * getQty;
      const prices = eligibleItems.map(i => i.price).sort((a, b) => a - b);
      let freeDiscount = 0;
      for (let i = 0; i < Math.min(freeItems, prices.length); i++) {
        freeDiscount += prices[i] * ((getDiscount || 100) / 100);
      }
      return Math.round(freeDiscount * 100) / 100;
    }
    return 0;
  }

  // Regular discount -- determine base
  let discountBase = subtotal;

  if (offer.scope === 'category' && offer.targetCategories?.length > 0) {
    discountBase = cartItems
      .filter(i => offer.targetCategories.some(c => c.toLowerCase() === (i.category || '').toLowerCase()))
      .reduce((sum, i) => sum + (i.price * i.quantity), 0);
  } else if (offer.scope === 'item' && offer.targetItems?.length > 0) {
    discountBase = cartItems
      .filter(i => offer.targetItems.includes(i.menuItemId || i.id))
      .reduce((sum, i) => sum + (i.price * i.quantity), 0);
  }

  if (offer.discountType === 'percentage') {
    const discount = discountBase * ((offer.discountValue || 0) / 100);
    return Math.round(Math.min(discount, offer.maxDiscount || Infinity) * 100) / 100;
  } else {
    return Math.min(offer.discountValue || 0, discountBase);
  }
}

export default function OfferSelector({
  restaurantId,
  cartItems = [],
  subtotal = 0,
  // Legacy single-offer props (backward compat)
  onOfferSelected,
  selectedOfferId = null,
  // Multi-offer props
  selectedOfferIds: selectedOfferIdsProp,
  onOffersChanged,
  onOfferSettingsLoaded,
  // Manual discount
  onManualDiscountChange,
  manualDiscount = '',
  manualDiscountType = 'flat',
  customerInfo = null,
}) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [offerSettings, setOfferSettings] = useState({
    allowMultipleOffers: false,
    maxOffersAllowed: 1,
    autoApplyBestOffer: true,
  });
  const [autoAppliedIds, setAutoAppliedIds] = useState(new Set());
  const [firstOrderWarning, setFirstOrderWarning] = useState('');
  const [localManualDiscount, setLocalManualDiscount] = useState(manualDiscount);
  const [localDiscountType, setLocalDiscountType] = useState(manualDiscountType);
  const wasManuallySelected = useRef(false);

  // Derive effective selectedOfferIds from either multi or single prop
  const selectedIds = useMemo(() => {
    if (selectedOfferIdsProp && Array.isArray(selectedOfferIdsProp)) {
      return selectedOfferIdsProp;
    }
    if (selectedOfferId) return [selectedOfferId];
    return [];
  }, [selectedOfferIdsProp, selectedOfferId]);

  const isMultiMode = offerSettings.allowMultipleOffers;
  const maxOffers = offerSettings.maxOffersAllowed || 1;

  useEffect(() => {
    if (restaurantId) {
      loadOffers();
      loadOfferSettings();
    }
  }, [restaurantId]);

  // Re-fetch when customerInfo.isFirstOrder changes
  useEffect(() => {
    if (restaurantId && customerInfo !== null) {
      loadOffers();
    }
  }, [customerInfo?.isFirstOrder]);

  // First-order offer rejection
  useEffect(() => {
    if (customerInfo?.isFirstOrder === false && selectedIds.length > 0) {
      const rejectedIds = [];
      for (const id of selectedIds) {
        const offer = offers.find(o => (o.id || o._id) === id);
        if (offer?.isFirstOrderOnly) {
          rejectedIds.push(id);
        }
      }
      if (rejectedIds.length > 0) {
        const newIds = selectedIds.filter(id => !rejectedIds.includes(id));
        notifySelection(newIds);
        setFirstOrderWarning('Offer removed -- not a first-time customer');
        setTimeout(() => setFirstOrderWarning(''), 5000);
      }
    }
  }, [customerInfo?.isFirstOrder]);

  const loadOfferSettings = async () => {
    try {
      const response = await apiClient.getPublicCustomerAppSettings(restaurantId);
      const settings = response?.offerSettings || response?.settings?.offerSettings || {};
      const resolved = {
        allowMultipleOffers: settings.allowMultipleOffers || false,
        maxOffersAllowed: settings.maxOffersAllowed || 1,
        autoApplyBestOffer: settings.autoApplyBestOffer !== undefined ? settings.autoApplyBestOffer : true,
      };
      setOfferSettings(resolved);
      if (onOfferSettingsLoaded) onOfferSettingsLoaded(resolved);
    } catch (error) {
      // Settings load failed, keep defaults (single offer, auto-apply on)
      console.warn('Could not load offer settings:', error);
    }
  };

  // Notify parent of selection changes
  const notifySelection = useCallback((ids) => {
    const selectedOffers = ids.map(id => offers.find(o => (o.id || o._id) === id)).filter(Boolean);
    const totalDiscount = selectedOffers.reduce(
      (sum, offer) => sum + calculateOfferDiscount(offer, cartItems, subtotal),
      0
    );

    // Multi-offer callback
    if (onOffersChanged) {
      onOffersChanged(ids, totalDiscount, selectedOffers);
    }

    // Backward compat: single-offer callback
    if (onOfferSelected) {
      if (ids.length === 0) {
        onOfferSelected(null, 0, null);
      } else {
        // Report the first/primary selected offer
        const primary = selectedOffers[0];
        const primaryDiscount = primary ? calculateOfferDiscount(primary, cartItems, subtotal) : 0;
        onOfferSelected(ids[0], primaryDiscount, primary);
      }
    }
  }, [offers, cartItems, subtotal, onOffersChanged, onOfferSelected]);

  const loadOffers = async () => {
    setLoading(true);
    try {
      let response;
      try {
        response = await apiClient.getActiveOffersForPOS(restaurantId, customerInfo?.isFirstOrder);
      } catch (e) {
        // Fallback to public endpoint
        response = await apiClient.getActiveOffers(restaurantId);
      }

      const allOffers = response.offers || response || [];
      const activeOffers = allOffers
        .filter(o => o.isActive)
        .filter(isOfferActiveNow)
        .filter(isDateValid)
        .filter(o => {
          if ((o.minimumOrder || o.minOrderValue) && subtotal < (o.minimumOrder || o.minOrderValue)) return false;
          return true;
        })
        .filter(o => {
          if (o.isFirstOrderOnly && customerInfo?.isFirstOrder === false) return false;
          return true;
        });

      setOffers(activeOffers);

      // Auto-apply best offer if setting allows and user hasn't manually selected
      if (!wasManuallySelected.current && activeOffers.length > 0 && selectedIds.length === 0) {
        // Use current offerSettings or default (autoApplyBestOffer defaults to true)
        let bestOffer = null;
        let bestDiscount = 0;

        for (const offer of activeOffers) {
          const discount = calculateOfferDiscount(offer, cartItems, subtotal);
          if (discount > bestDiscount) {
            bestDiscount = discount;
            bestOffer = offer;
          }
        }

        if (bestOffer && bestDiscount > 0) {
          const bestId = bestOffer.id || bestOffer._id;
          setAutoAppliedIds(new Set([bestId]));

          // Notify via callbacks
          const selectedOffers = [bestOffer];
          if (onOffersChanged) {
            onOffersChanged([bestId], bestDiscount, selectedOffers);
          }
          if (onOfferSelected) {
            onOfferSelected(bestId, bestDiscount, bestOffer);
          }
        }
      }
    } catch (error) {
      console.error('Error loading offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChipPress = (offer) => {
    const offerId = offer.id || offer._id;
    wasManuallySelected.current = true;
    setAutoAppliedIds(new Set());

    const isCurrentlySelected = selectedIds.includes(offerId);

    let newIds;
    if (isCurrentlySelected) {
      // Deselect this offer
      newIds = selectedIds.filter(id => id !== offerId);
    } else if (isMultiMode) {
      // Multi-select mode: add if under limit
      if (selectedIds.length >= maxOffers) {
        // At limit -- replace the oldest selection
        newIds = [...selectedIds.slice(1), offerId];
      } else {
        newIds = [...selectedIds, offerId];
      }
    } else {
      // Single-select mode: replace
      newIds = [offerId];
    }

    notifySelection(newIds);
  };

  const handleManualDiscountChange = (value) => {
    setLocalManualDiscount(value);
    if (onManualDiscountChange) {
      onManualDiscountChange(value, localDiscountType);
    }
  };

  const toggleDiscountType = () => {
    const newType = localDiscountType === 'flat' ? 'percentage' : 'flat';
    setLocalDiscountType(newType);
    if (onManualDiscountChange) {
      onManualDiscountChange(localManualDiscount, newType);
    }
  };

  const getManualDiscountAmount = () => {
    const val = parseFloat(localManualDiscount) || 0;
    if (localDiscountType === 'percentage') {
      return Math.round((subtotal * val / 100) * 100) / 100;
    }
    return Math.min(val, subtotal);
  };

  // Compute total offer discount for display
  const totalOfferDiscount = useMemo(() => {
    return selectedIds.reduce((sum, id) => {
      const offer = offers.find(o => (o.id || o._id) === id);
      if (!offer) return sum;
      return sum + calculateOfferDiscount(offer, cartItems, subtotal);
    }, 0);
  }, [selectedIds, offers, cartItems, subtotal]);

  return (
    <View style={styles.container}>
      {/* First-order warning */}
      {firstOrderWarning !== '' && (
        <View style={styles.warningBanner}>
          <Ionicons name="alert-circle" size={14} color="#dc2626" />
          <Text style={styles.warningText}>{firstOrderWarning}</Text>
        </View>
      )}

      {/* Offer Chips */}
      {offers.length > 0 && (
        <View style={styles.offerSection}>
          <View style={styles.offerHeader}>
            <Ionicons name="pricetag-outline" size={14} color="#8b5cf6" />
            <Text style={styles.offerHeaderText}>
              {offers.length} offer{offers.length > 1 ? 's' : ''} available
            </Text>
            {isMultiMode && maxOffers > 1 && (
              <Text style={styles.offerLimitText}>
                (select up to {maxOffers})
              </Text>
            )}
            {totalOfferDiscount > 0 && (
              <Text style={styles.totalDiscountText}>
                -₹{totalOfferDiscount.toFixed(0)}
              </Text>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContainer}
          >
            {offers.map((offer) => {
              const offerId = offer.id || offer._id;
              const discount = calculateOfferDiscount(offer, cartItems, subtotal);
              const isSelected = selectedIds.includes(offerId);
              const isAutoApplied = autoAppliedIds.has(offerId) && isSelected;

              return (
                <TouchableOpacity
                  key={offerId}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                    isAutoApplied && styles.chipAutoApplied,
                  ]}
                  onPress={() => handleChipPress(offer)}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={14} color="#7c3aed" style={styles.chipCheckmark} />
                  )}
                  <View style={styles.chipTextContainer}>
                    <Text
                      style={[styles.chipName, isSelected && styles.chipNameSelected]}
                      numberOfLines={1}
                    >
                      {offer.name}
                    </Text>
                    {discount > 0 && (
                      <Text style={[styles.chipSaves, isSelected && styles.chipSavesSelected]}>
                        saves ₹{discount.toFixed(0)}
                      </Text>
                    )}
                  </View>
                  {isAutoApplied && (
                    <View style={styles.autoBadge}>
                      <Text style={styles.autoBadgeText}>Auto</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading && (
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
    </View>
  );
}

// Export helpers for use in parent
export { calculateOfferDiscount, isOfferActiveNow };

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  // Warning
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
    flex: 1,
  },
  // Offer section
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
  offerLimitText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  totalDiscountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
    marginLeft: 'auto',
  },
  // Chips
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
    maxWidth: 200,
    gap: 4,
  },
  chipSelected: {
    backgroundColor: '#f5f3ff',
    borderColor: '#c4b5fd',
  },
  chipAutoApplied: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
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
  chipSaves: {
    fontSize: 10,
    fontWeight: '500',
    color: '#10b981',
    marginTop: 1,
  },
  chipSavesSelected: {
    color: '#7c3aed',
  },
  autoBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
  autoBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#16a34a',
  },
  // Loading
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
  // Manual Discount
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
});
