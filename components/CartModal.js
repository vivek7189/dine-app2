import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import OfferSelector from './OfferSelector';
import CustomerDetailModal from './CustomerDetailModal';

export default function CartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  total,
  tableNumber,
  restaurantId,
  sending,
  countryCode = 'IN',
  onOrderTypeChange,
  hasTable = false,
  multiPricingEnabled = false,
  activePricingRuleName,
}) {
  const [orderType, setOrderType] = useState('dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Discount / Loyalty state
  const [customerData, setCustomerData] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [offerDiscount, setOfferDiscount] = useState(0);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');

  const subtotal = total;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
    const rate = loyaltySettings.redemptionRate || 100;
    return Math.round((redeemPoints / rate) * 100) / 100;
  })();

  const totalDiscount = offerDiscount + manualDiscountAmount + loyaltyDiscount;
  const discountedSubtotal = Math.max(0, subtotal - totalDiscount);

  const handleOfferSelected = (offerId, discount, offer) => {
    setSelectedOfferId(offerId);
    setOfferDiscount(discount || 0);
    setSelectedOffer(offer);
  };

  const handleManualDiscountChange = (value, type) => {
    setManualDiscount(value);
    setManualDiscountType(type);
  };

  const handlePlaceOrder = () => {
    const discountData = {
      offerDiscount,
      manualDiscountAmount,
      loyaltyDiscount,
      totalDiscount,
      redeemLoyaltyPoints: redeemPoints,
      selectedOfferId,
      selectedOfferName: selectedOffer?.name || null,
      customerPhone: customerMobile || customerData?.phone || '',
      customerId: customerData?.id || customerData?._id || null,
    };
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, discountData);
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemHeader}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <TouchableOpacity
          style={styles.removeIconButton}
          onPress={() => onRemoveItem(item.id)}
          disabled={sending}
        >
          <Ionicons name="close" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.cartItemFooter}>
        <View style={styles.cartItemPricing}>
          <Text style={styles.cartItemSubtotal}>Subtotal: ₹{item.price * item.quantity}</Text>
          <Text style={styles.cartItemPrice}>₹{item.price}</Text>
        </View>

        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
            disabled={sending}
          >
            <Ionicons name="remove" size={16} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
            disabled={sending}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={sending}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Ionicons name="cart" size={24} color="#fff" style={styles.headerIcon} />
              <View>
                <Text style={styles.title}>Order Summary</Text>
                <Text style={styles.itemCountText}>{itemCount} items</Text>
              </View>
            </View>
            <View style={styles.orderTypeTabs}>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'dine-in' && styles.orderTypeTabActive]}
                onPress={() => { setOrderType('dine-in'); onOrderTypeChange?.('dine-in'); }}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'dine-in' && styles.orderTypeTabTextActive]}>
                  DINE IN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'takeaway' && styles.orderTypeTabActive, hasTable && { opacity: 0.4 }]}
                onPress={() => { if (hasTable) return; setOrderType('takeaway'); onOrderTypeChange?.('takeaway'); }}
                disabled={hasTable}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'takeaway' && styles.orderTypeTabTextActive]}>
                  TAKEAWAY
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'delivery' && styles.orderTypeTabActive, hasTable && { opacity: 0.4 }]}
                onPress={() => { if (hasTable) return; setOrderType('delivery'); onOrderTypeChange?.('delivery'); }}
                disabled={hasTable}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'delivery' && styles.orderTypeTabTextActive]}>
                  DELIVERY
                </Text>
              </TouchableOpacity>
            </View>
            {multiPricingEnabled && activePricingRuleName && (
              <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>Zone: {activePricingRuleName}</Text>
              </View>
            )}
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Serving Table */}
            {tableNumber && orderType === 'dine-in' && (
              <View style={styles.servingTable}>
                <View style={styles.servingTableLeft}>
                  <View style={styles.tableIcon}>
                    <Ionicons name="restaurant" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.servingLabel}>SERVING</Text>
                    <Text style={styles.servingTable}>Table {tableNumber}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
              </View>
            ) : (
              <FlatList
                data={cart}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.cartList}
              />
            )}

            {cart.length > 0 && (
              <>
                {/* Customer Lookup */}
                {restaurantId && (
                  <View style={styles.sectionContainer}>
                    <CustomerLookup
                      restaurantId={restaurantId}
                      countryCode={countryCode}
                      onCustomerFound={(customer, settings) => {
                        setCustomerData(customer);
                        setLoyaltySettings(settings);
                        if (customer?.name) setCustomerName(customer.name);
                        if (customer?.phone) setCustomerMobile(customer.phone);
                      }}
                      onPhoneChange={(phone) => setCustomerMobile(phone)}
                      onRedeemChange={(pts) => setRedeemPoints(pts)}
                      onCustomerChipPress={(customer) => {
                        setDetailCustomerId(customer?.id || customer?._id);
                        setShowCustomerDetail(true);
                      }}
                      redeemPoints={redeemPoints}
                      compact
                    />
                  </View>
                )}

                {/* Offer Selector */}
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

                {/* Pricing Summary */}
                <View style={styles.pricingSummary}>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingLabel}>Subtotal:</Text>
                    <Text style={styles.pricingValue}>₹{subtotal.toFixed(2)}</Text>
                  </View>
                  {offerDiscount > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={[styles.pricingLabel, { color: '#10b981' }]}>
                        {selectedOffer?.name || 'Offer Discount'}:
                      </Text>
                      <Text style={[styles.pricingValue, { color: '#10b981' }]}>-₹{offerDiscount.toFixed(2)}</Text>
                    </View>
                  )}
                  {manualDiscountAmount > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={[styles.pricingLabel, { color: '#10b981' }]}>Manual Discount:</Text>
                      <Text style={[styles.pricingValue, { color: '#10b981' }]}>-₹{manualDiscountAmount.toFixed(2)}</Text>
                    </View>
                  )}
                  {loyaltyDiscount > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={[styles.pricingLabel, { color: '#10b981' }]}>Loyalty Points:</Text>
                      <Text style={[styles.pricingValue, { color: '#10b981' }]}>-₹{loyaltyDiscount.toFixed(2)}</Text>
                    </View>
                  )}
                </View>

                {/* Total */}
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>₹{discountedSubtotal.toFixed(2)}</Text>
                </View>
                {totalDiscount > 0 && (
                  <Text style={styles.savingsText}>You save ₹{totalDiscount.toFixed(0)}</Text>
                )}

                {/* Customer Details */}
                <View style={styles.customerDetails}>
                  <Text style={styles.sectionTitle}>Customer Name</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Customer Name"
                      placeholderTextColor={Colors.textLight}
                      value={customerName}
                      onChangeText={setCustomerName}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Mobile Number"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="phone-pad"
                      value={customerMobile}
                      onChangeText={setCustomerMobile}
                    />
                  </View>
                </View>

                {/* Payment Method */}
                <View style={styles.paymentMethods}>
                  <View style={styles.paymentHeader}>
                    <Ionicons name="card-outline" size={20} color={Colors.textDark} />
                    <Text style={styles.sectionTitle}>Payment Method</Text>
                  </View>
                  <View style={styles.paymentButtons}>
                    {['cash', 'upi', 'card'].map((method) => (
                      <TouchableOpacity
                        key={method}
                        style={[styles.paymentButton, paymentMethod === method && styles.paymentButtonActive]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Text style={[styles.paymentButtonText, paymentMethod === method && styles.paymentButtonTextActive]}>
                          {method.charAt(0).toUpperCase() + method.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.placeOrderButton, sending && { opacity: 0.6 }]}
                    onPress={handlePlaceOrder}
                    disabled={sending}
                  >
                    {sending ? (
                      <>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.placeOrderButtonText}>Placing Order...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="restaurant" size={18} color="#fff" />
                        <Text style={styles.placeOrderButtonText}>Place Order</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
  },
  header: {
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerIcon: {
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  itemCountText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  orderTypeTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  orderTypeTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
  },
  orderTypeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  orderTypeTabTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  servingTable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef7f0',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: 8,
  },
  servingTableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tableIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  servingLabel: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
  },
  cartList: {
    paddingHorizontal: Spacing.md,
  },
  cartItem: {
    backgroundColor: '#fff',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    flex: 1,
  },
  removeIconButton: {
    padding: 2,
  },
  cartItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartItemPricing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cartItemSubtotal: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  cartItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    minWidth: 20,
    textAlign: 'center',
  },
  sectionContainer: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  pricingSummary: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  pricingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  savingsText: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 6,
  },
  customerDetails: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.textDark,
    backgroundColor: '#fff',
  },
  paymentMethods: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  paymentButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  paymentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  paymentButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  paymentButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  paymentButtonTextActive: {
    color: '#fff',
  },
  actionButtons: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  placeOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  placeOrderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
});
