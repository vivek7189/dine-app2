import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
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

// Calculate discount for an offer against cart items
function calculateOfferDiscount(offer, cartItems, subtotal) {
  if (!offer || !offer.isActive) return 0;

  if (offer.minimumOrder && subtotal < offer.minimumOrder) return 0;

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
      // Use cheapest item price for free items
      const prices = eligibleItems.map(i => i.price).sort((a, b) => a - b);
      let freeDiscount = 0;
      for (let i = 0; i < Math.min(freeItems, prices.length); i++) {
        freeDiscount += prices[i] * ((getDiscount || 100) / 100);
      }
      return Math.round(freeDiscount * 100) / 100;
    }
    return 0;
  }

  // Regular discount
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
  onOfferSelected,
  onManualDiscountChange,
  selectedOfferId = null,
  manualDiscount = '',
  manualDiscountType = 'flat',
}) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [localManualDiscount, setLocalManualDiscount] = useState(manualDiscount);
  const [localDiscountType, setLocalDiscountType] = useState(manualDiscountType);

  useEffect(() => {
    if (restaurantId) loadOffers();
  }, [restaurantId]);

  const loadOffers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getActiveOffers(restaurantId);
      const activeOffers = (response.offers || response || [])
        .filter(o => o.isActive)
        .filter(isOfferActiveNow);
      setOffers(activeOffers);

      // Auto-apply first scheduled offer (happy hour)
      const scheduledOffer = activeOffers.find(o => o.schedule?.type === 'recurring');
      if (scheduledOffer && !selectedOfferId) {
        const discount = calculateOfferDiscount(scheduledOffer, cartItems, subtotal);
        if (discount > 0 && onOfferSelected) {
          onOfferSelected(scheduledOffer.id || scheduledOffer._id, discount, scheduledOffer);
        }
      }
    } catch (error) {
      console.error('Error loading offers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOffer = (offer) => {
    const offerId = offer.id || offer._id;
    if (selectedOfferId === offerId) {
      // Deselect
      if (onOfferSelected) onOfferSelected(null, 0, null);
    } else {
      const discount = calculateOfferDiscount(offer, cartItems, subtotal);
      if (onOfferSelected) onOfferSelected(offerId, discount, offer);
    }
    setShowOffers(false);
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

  const selectedOffer = offers.find(o => (o.id || o._id) === selectedOfferId);
  const selectedOfferDiscount = selectedOffer ? calculateOfferDiscount(selectedOffer, cartItems, subtotal) : 0;

  return (
    <View style={styles.container}>
      {/* Offer Selection */}
      {offers.length > 0 && (
        <View style={styles.offerSection}>
          <TouchableOpacity
            style={styles.offerToggle}
            onPress={() => setShowOffers(!showOffers)}
          >
            <Ionicons name="pricetag-outline" size={16} color="#8b5cf6" />
            <Text style={styles.offerToggleText}>
              {selectedOffer
                ? `${selectedOffer.name} (-₹${selectedOfferDiscount.toFixed(0)})`
                : `${offers.length} offer${offers.length > 1 ? 's' : ''} available`}
            </Text>
            <Ionicons name={showOffers ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textMedium} />
          </TouchableOpacity>

          {showOffers && (
            <View style={styles.offerList}>
              {offers.map((offer) => {
                const offerId = offer.id || offer._id;
                const discount = calculateOfferDiscount(offer, cartItems, subtotal);
                const isSelected = selectedOfferId === offerId;

                return (
                  <TouchableOpacity
                    key={offerId}
                    style={[styles.offerItem, isSelected && styles.offerItemSelected]}
                    onPress={() => handleSelectOffer(offer)}
                  >
                    <View style={styles.offerItemLeft}>
                      <Text style={[styles.offerName, isSelected && styles.offerNameSelected]}>
                        {offer.name}
                      </Text>
                      <Text style={styles.offerDetail}>
                        {offer.discountType === 'percentage'
                          ? `${offer.discountValue}% off`
                          : `₹${offer.discountValue} off`}
                        {offer.scope !== 'order' ? ` (${offer.scope})` : ''}
                        {offer.promotionType === 'bogo' ? ' BOGO' : ''}
                        {offer.schedule?.type === 'recurring' ? ' (Happy Hour)' : ''}
                      </Text>
                    </View>
                    <View style={styles.offerItemRight}>
                      {discount > 0 && (
                        <Text style={[styles.offerDiscount, isSelected && styles.offerDiscountSelected]}>
                          -₹{discount.toFixed(0)}
                        </Text>
                      )}
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={18} color="#8b5cf6" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
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

// Export helper for use in parent
export { calculateOfferDiscount, isOfferActiveNow };

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  // Offers
  offerSection: {
    marginBottom: 12,
  },
  offerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f5f3ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  offerToggleText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#6d28d9',
  },
  offerList: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  offerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  offerItemSelected: {
    backgroundColor: '#f5f3ff',
  },
  offerItemLeft: {
    flex: 1,
  },
  offerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
  },
  offerNameSelected: {
    color: '#6d28d9',
  },
  offerDetail: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  offerItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offerDiscount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10b981',
  },
  offerDiscountSelected: {
    color: '#6d28d9',
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
