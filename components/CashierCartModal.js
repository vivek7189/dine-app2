import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import OfferSelector from './OfferSelector';
import CustomerDetailModal from './CustomerDetailModal';

export default function CashierCartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  total,
  restaurantName,
  sending,
  taxSettings = { enabled: false, rate: 0, taxes: [] },
  restaurantId,
  countryCode = 'IN',
  onOrderTypeChange,
  multiPricingEnabled = false,
  activePricingRuleName,
}) {
  const [orderType, setOrderType] = useState('counter');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Loyalty state
  const [customerData, setCustomerData] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltySettings, setLoyaltySettings] = useState(null);

  // Offer/discount state
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);

  // Calculate totals
  const subtotal = total;
  const taxRate = taxSettings.enabled ? (taxSettings.rate || 0) : 0;

  // Calculate manual discount amount
  const manualDiscountAmount = (() => {
    const val = parseFloat(manualDiscount) || 0;
    if (manualDiscountType === 'percentage') {
      return Math.round((subtotal * val / 100) * 100) / 100;
    }
    return Math.min(val, subtotal);
  })();

  // Calculate loyalty discount
  const loyaltyDiscount = (() => {
    if (!redeemPoints || !loyaltySettings) return 0;
    const redemptionRate = loyaltySettings.redemptionValue || 0.1;
    return Math.round(redeemPoints * redemptionRate * 100) / 100;
  })();

  const totalDiscount = offerDiscount + manualDiscountAmount + loyaltyDiscount;
  const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
  const taxAmount = discountedSubtotal * (taxRate / 100);
  const grandTotal = discountedSubtotal + taxAmount;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCustomerFound = useCallback((customer, settings) => {
    setCustomerData(customer);
    setLoyaltySettings(settings);
    if (customer) {
      setCustomerName(customer.name || '');
      setCustomerMobile(customer.phone || '');
    }
    // Reset redemption when customer changes
    setRedeemPoints(0);
  }, []);

  const handleOfferSelected = useCallback((offerId, discount, offer) => {
    setSelectedOfferId(offerId);
    setOfferDiscount(discount);
    setSelectedOffer(offer);
  }, []);

  const handleManualDiscountChange = useCallback((value, type) => {
    setManualDiscount(value);
    setManualDiscountType(type);
  }, []);

  const handlePlaceOrder = () => {
    // Pass all discount/loyalty data to parent
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, {
      offerDiscount,
      manualDiscountAmount,
      loyaltyDiscount,
      totalDiscount,
      redeemLoyaltyPoints: redeemPoints,
      selectedOfferId,
      selectedOfferName: selectedOffer?.name || null,
      customerId: customerData?.id || customerData?._id || null,
    });
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>₹{item.price} x {item.quantity} = <Text style={styles.cartItemTotal}>₹{item.price * item.quantity}</Text></Text>
      </View>
      <View style={styles.cartItemRight}>
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={14} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={[styles.quantityButton, styles.quantityButtonAdd]}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemoveItem(item.id)}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>New Bill</Text>
            <Text style={styles.subtitle}>{itemCount} items</Text>
          </View>

          {/* Order Type Tabs */}
          <View style={styles.orderTypeSection}>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'counter' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('counter'); onOrderTypeChange?.('counter'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'counter' && styles.orderTypeTextActive]}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'takeaway' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('takeaway'); onOrderTypeChange?.('takeaway'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'takeaway' && styles.orderTypeTextActive]}>Takeaway</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'delivery' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('delivery'); onOrderTypeChange?.('delivery'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'delivery' && styles.orderTypeTextActive]}>Delivery</Text>
            </TouchableOpacity>
          </View>
          {multiPricingEnabled && activePricingRuleName && (
            <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginLeft: 16, marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>Zone: {activePricingRuleName}</Text>
            </View>
          )}
        </SafeAreaView>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Cart Items */}
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Ionicons name="cart-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyText}>No items in cart</Text>
            </View>
          ) : (
            <View style={styles.cartSection}>
              <FlatList
                data={cart}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            </View>
          )}

          {cart.length > 0 && (
            <>
              {/* Customer Lookup with Loyalty */}
              {restaurantId && (
                <CustomerLookup
                  restaurantId={restaurantId}
                  countryCode={countryCode}
                  onCustomerFound={handleCustomerFound}
                  onPhoneChange={(phone) => setCustomerMobile(phone)}
                  onRedeemChange={setRedeemPoints}
                  onCustomerChipPress={(customer) => {
                    setDetailCustomerId(customer?.id || customer?._id);
                    setShowCustomerDetail(true);
                  }}
                  redeemPoints={redeemPoints}
                  compact
                />
              )}

              {/* Offers & Manual Discount */}
              {restaurantId && (
                <OfferSelector
                  restaurantId={restaurantId}
                  cartItems={cart}
                  subtotal={subtotal}
                  onOfferSelected={handleOfferSelected}
                  onManualDiscountChange={handleManualDiscountChange}
                  selectedOfferId={selectedOfferId}
                  manualDiscount={manualDiscount}
                  manualDiscountType={manualDiscountType}
                  customerInfo={{ isFirstOrder: customerData?.totalOrders === 0 }}
                />
              )}

              {/* Bill Summary */}
              <View style={styles.billSection}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Subtotal</Text>
                  <Text style={styles.billValue}>₹{subtotal.toFixed(2)}</Text>
                </View>

                {offerDiscount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>
                      {selectedOffer?.name || 'Offer'} Discount
                    </Text>
                    <Text style={styles.billValueGreen}>-₹{offerDiscount.toFixed(2)}</Text>
                  </View>
                )}

                {manualDiscountAmount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>Manual Discount</Text>
                    <Text style={styles.billValueGreen}>-₹{manualDiscountAmount.toFixed(2)}</Text>
                  </View>
                )}

                {loyaltyDiscount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>Loyalty Points ({redeemPoints} pts)</Text>
                    <Text style={styles.billValueGreen}>-₹{loyaltyDiscount.toFixed(2)}</Text>
                  </View>
                )}

                {taxSettings.enabled && taxRate > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Tax ({taxRate}%)</Text>
                    <Text style={styles.billValue}>₹{taxAmount.toFixed(2)}</Text>
                  </View>
                )}

                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>Total</Text>
                  <Text style={styles.billTotalValue}>₹{grandTotal.toFixed(2)}</Text>
                </View>

                {totalDiscount > 0 && (
                  <Text style={styles.savingsText}>You save ₹{totalDiscount.toFixed(0)}</Text>
                )}
              </View>

              {/* Customer Name (if not from lookup) */}
              {!customerData && (
                <View style={styles.customerSection}>
                  <TextInput
                    style={styles.input}
                    placeholder="Customer Name (optional)"
                    placeholderTextColor="#999"
                    value={customerName}
                    onChangeText={setCustomerName}
                  />
                </View>
              )}

              {/* Payment Method - Compact Pills */}
              <View style={styles.paymentSection}>
                <Text style={styles.paymentLabel}>Payment</Text>
                <View style={styles.paymentPills}>
                  <TouchableOpacity
                    style={[styles.paymentPill, paymentMethod === 'cash' && styles.paymentPillActive]}
                    onPress={() => setPaymentMethod('cash')}
                  >
                    <Text style={[styles.paymentPillText, paymentMethod === 'cash' && styles.paymentPillTextActive]}>Cash</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentPill, paymentMethod === 'upi' && styles.paymentPillActive]}
                    onPress={() => setPaymentMethod('upi')}
                  >
                    <Text style={[styles.paymentPillText, paymentMethod === 'upi' && styles.paymentPillTextActive]}>UPI</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.paymentPill, paymentMethod === 'card' && styles.paymentPillActive]}
                    onPress={() => setPaymentMethod('card')}
                  >
                    <Text style={[styles.paymentPillText, paymentMethod === 'card' && styles.paymentPillTextActive]}>Card</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        {/* Bottom Action */}
        {cart.length > 0 && (
          <View style={styles.bottomAction}>
            <TouchableOpacity
              style={[styles.completeButton, sending && styles.buttonDisabled]}
              onPress={handlePlaceOrder}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.completeButtonText}>Complete Billing</Text>
                  <Text style={styles.completeButtonAmount}>₹{grandTotal.toFixed(2)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
      <CustomerDetailModal
        visible={showCustomerDetail}
        customerId={detailCustomerId}
        restaurantId={restaurantId}
        onClose={() => setShowCustomerDetail(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerSafeArea: {
    backgroundColor: '#10b981',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  orderTypeSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
  orderTypeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
  },
  orderTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  orderTypeTextActive: {
    color: '#10b981',
  },
  scrollContent: {
    flex: 1,
  },
  cartSection: {
    backgroundColor: '#fff',
    marginTop: 8,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartItemLeft: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 13,
    color: '#6b7280',
  },
  cartItemTotal: {
    fontWeight: '700',
    color: '#10b981',
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonAdd: {
    backgroundColor: '#10b981',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    minWidth: 28,
    textAlign: 'center',
  },
  removeButton: {
    padding: 4,
  },
  billSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  billValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  billLabelGreen: {
    fontSize: 14,
    color: '#10b981',
  },
  billValueGreen: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  billTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'right',
    marginTop: 6,
  },
  customerSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  paymentSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  paymentPills: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  paymentPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  paymentPillActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  paymentPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  paymentPillTextActive: {
    color: '#fff',
  },
  bottomAction: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  completeButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  completeButtonAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});
