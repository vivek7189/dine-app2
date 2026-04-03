import React, { useState, useEffect } from 'react';
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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import OfferSelector from './OfferSelector';
import CustomerDetailModal from './CustomerDetailModal';
import useBillingCalculation from '../hooks/useBillingCalculation';
import BillingSummaryBar from './billing/BillingSummaryBar';
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';
import PricingRuleSelector from './billing/PricingRuleSelector';
import { getItemSubline } from '../utils/itemSubline';

export default function CartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  onCompleteBill,
  total,
  tableNumber,
  restaurantId,
  sending,
  countryCode = 'IN',
  onOrderTypeChange,
  hasTable = false,
  multiPricingEnabled = false,
  activePricingRuleName,
  billingSettings = {},
  taxSettings = {},
  pricingRules = [],
  activePricingRuleId,
  setActivePricingRuleId,
  autoSelectedRule = false,
}) {
  const [orderType, setOrderType] = useState('dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);

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

  // Billing state
  const [activeBillingPanel, setActiveBillingPanel] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  const [splitPayments, setSplitPayments] = useState([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipPercentage, setTipPercentage] = useState(null);
  const [partialPayAmount, setPartialPayAmount] = useState('');
  const [selectedCompItems, setSelectedCompItems] = useState([]);
  const [selectedVoidItems, setSelectedVoidItems] = useState([]);
  const [compReason, setCompReason] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [billingManagerPin, setBillingManagerPin] = useState('');

  // Reset billing state when modal closes
  useEffect(() => {
    if (!visible) {
      setActiveBillingPanel(null);
      setCashReceived(''); setChangeAmount(0);
      setSplitPayments([]); setTipAmount(0); setTipPercentage(null);
      setPartialPayAmount(''); setSelectedCompItems([]); setSelectedVoidItems([]);
      setCompReason(''); setVoidReason(''); setBillingManagerPin('');
      setSpecialInstructions(''); setShowKitchenNotes(false);
      setActiveAction(null);
    }
  }, [visible]);

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
    const redemptionRate = loyaltySettings.redemptionValue || 0.1;
    return Math.round(redeemPoints * redemptionRate * 100) / 100;
  })();

  // Comp items reduce subtotal
  const compAmount = selectedCompItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Use shared billing calculation hook
  const billing = useBillingCalculation({
    subtotal,
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    compAmount,
    taxSettings,
    billingSettings,
    tipAmount,
  });

  const handleOfferSelected = (offerId, discount, offer) => {
    setSelectedOfferId(offerId);
    setOfferDiscount(discount || 0);
    setSelectedOffer(offer);
  };

  const handleManualDiscountChange = (value, type) => {
    setManualDiscount(value);
    setManualDiscountType(type);
  };

  const buildDiscountData = () => ({
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    totalDiscount: billing.totalDiscount,
    redeemLoyaltyPoints: redeemPoints,
    selectedOfferId,
    selectedOfferName: selectedOffer?.name || null,
    customerPhone: customerMobile || customerData?.phone || '',
    customerId: customerData?.id || customerData?._id || null,
    serviceChargeRate: billingSettings.serviceChargeEnabled ? billingSettings.serviceChargeRate : null,
    serviceChargeAmount: billing.serviceChargeAmount || null,
    serviceChargeLabel: billingSettings.serviceChargeLabel || 'Service Charge',
    taxBreakdown: billing.taxBreakdown.length > 0 ? billing.taxBreakdown : null,
    totalTax: billing.totalTax || null,
    roundOffAmount: billing.roundOffAmount || null,
    grandTotal: billing.grandTotal,
    tipAmount: tipAmount || null,
    tipPercentage: tipPercentage || null,
    cashReceived: cashReceived ? parseFloat(cashReceived) : null,
    changeReturned: changeAmount > 0 ? changeAmount : null,
    splitPayments: splitPayments.length > 0 ? splitPayments : null,
    paymentMethod: splitPayments.length > 0 ? 'split' : paymentMethod,
    partialPayAmount: partialPayAmount ? parseFloat(partialPayAmount) : null,
    specialInstructions: specialInstructions.trim() || null,
    compItems: selectedCompItems.length > 0 ? selectedCompItems.map(item => ({
      menuItemId: item.menuItemId || item.id, name: item.name, quantity: item.quantity,
      amount: item.price * item.quantity, reason: compReason,
    })) : null,
    voidItems: selectedVoidItems.length > 0 ? selectedVoidItems.map(item => ({
      menuItemId: item.menuItemId || item.id, name: item.name, quantity: item.quantity,
      amount: item.price * item.quantity, reason: voidReason,
    })) : null,
  });

  const insets = useSafeAreaInsets();
  const [activeAction, setActiveAction] = useState(null); // 'place' | 'complete'

  const handlePlaceOrder = () => {
    setActiveAction('place');
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
  };

  const handleCompleteBill = () => {
    if (onCompleteBill) {
      setActiveAction('complete');
      onCompleteBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
    }
  };

  const paymentIcons = { cash: 'cash-outline', upi: 'phone-portrait-outline', card: 'card-outline' };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        {getItemSubline(item) ? (
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
        ) : null}
      </View>
      <View style={styles.cartItemRight}>
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
            disabled={sending}
          >
            <Ionicons name="remove" size={14} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity
            style={[styles.qtyBtn, styles.qtyBtnAdd]}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
            disabled={sending}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.cartItemPrice}>₹{(item.price * item.quantity).toFixed(0)}</Text>
        <TouchableOpacity
          onPress={() => onRemoveItem(item.id)}
          disabled={sending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.modalContent, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={sending}>
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerInfo}>
                <Text style={styles.title}>Order Summary</Text>
                <View style={styles.headerMeta}>
                  <Text style={styles.itemCountText}>{itemCount} items</Text>
                  {tableNumber && orderType === 'dine-in' && (
                    <>
                      <View style={styles.headerDot} />
                      <Ionicons name="restaurant" size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.tableBadgeText}>Table {tableNumber}</Text>
                    </>
                  )}
                </View>
              </View>
              {/* Kitchen Notes toggle */}
              <TouchableOpacity
                style={[styles.headerActionBtn, showKitchenNotes && styles.headerActionBtnActive]}
                onPress={() => setShowKitchenNotes(!showKitchenNotes)}
              >
                <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? Colors.primary : '#fff'} />
              </TouchableOpacity>
            </View>
            <View style={styles.orderTypeTabs}>
              {[
                { key: 'dine-in', label: 'DINE IN', icon: 'restaurant-outline' },
                { key: 'takeaway', label: 'TAKEAWAY', icon: 'bag-handle-outline' },
                { key: 'delivery', label: 'DELIVERY', icon: 'bicycle-outline' },
              ].map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.orderTypeTab, orderType === t.key && styles.orderTypeTabActive, hasTable && t.key !== 'dine-in' && { opacity: 0.4 }]}
                  onPress={() => { if (hasTable && t.key !== 'dine-in') return; setOrderType(t.key); onOrderTypeChange?.(t.key); }}
                  disabled={hasTable && t.key !== 'dine-in'}
                >
                  <Ionicons name={t.icon} size={14} color={orderType === t.key ? Colors.primary : '#fff'} />
                  <Text style={[styles.orderTypeTabText, orderType === t.key && styles.orderTypeTabTextActive]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Kitchen Notes — collapsible */}
            {showKitchenNotes && (
              <View style={styles.kitchenNotesBar}>
                <Ionicons name="document-text" size={14} color="#d97706" />
                <TextInput
                  style={styles.kitchenNotesInput}
                  placeholder="Kitchen notes: No onions, extra spicy..."
                  placeholderTextColor="#9ca3af"
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  autoFocus
                />
                {specialInstructions ? (
                  <TouchableOpacity onPress={() => setSpecialInstructions('')}>
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {/* Pricing Rule Selector */}
            <PricingRuleSelector
              pricingRules={pricingRules}
              activePricingRuleId={activePricingRuleId}
              setActivePricingRuleId={setActivePricingRuleId}
              autoSelectedRule={autoSelectedRule}
              multiPricingEnabled={multiPricingEnabled}
            />

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

                {/* Billing Toolbar + Panels */}
                <View style={styles.billingSection}>
                  <BillingToolbar
                    billingSettings={billingSettings}
                    activeBillingPanel={activeBillingPanel}
                    setActiveBillingPanel={setActiveBillingPanel}
                    serviceChargeAmount={billing.serviceChargeAmount}
                    tipAmount={tipAmount}
                    splitPayments={splitPayments}
                    cashReceived={cashReceived}
                    partialPayAmount={partialPayAmount}
                    selectedCompItems={selectedCompItems}
                    selectedVoidItems={selectedVoidItems}
                  />
                  <BillingPanels
                    activeBillingPanel={activeBillingPanel}
                    billingSettings={billingSettings}
                    grandTotal={billing.grandTotal}
                    discountedSubtotal={billing.discountedSubtotal}
                    cart={cart}
                    cashReceived={cashReceived}
                    setCashReceived={setCashReceived}
                    changeAmount={changeAmount}
                    setChangeAmount={setChangeAmount}
                    splitPayments={splitPayments}
                    setSplitPayments={setSplitPayments}
                    tipAmount={tipAmount}
                    setTipAmount={setTipAmount}
                    tipPercentage={tipPercentage}
                    setTipPercentage={setTipPercentage}
                    partialPayAmount={partialPayAmount}
                    setPartialPayAmount={setPartialPayAmount}
                    customerData={customerData}
                    selectedCompItems={selectedCompItems}
                    setSelectedCompItems={setSelectedCompItems}
                    selectedVoidItems={selectedVoidItems}
                    setSelectedVoidItems={setSelectedVoidItems}
                    compReason={compReason}
                    setCompReason={setCompReason}
                    voidReason={voidReason}
                    setVoidReason={setVoidReason}
                    billingManagerPin={billingManagerPin}
                    setBillingManagerPin={setBillingManagerPin}
                    serviceChargeAmount={billing.serviceChargeAmount}
                    roundOffAmount={billing.roundOffAmount}
                  />
                </View>

                {/* Billing Summary Bar */}
                <BillingSummaryBar
                  subtotal={subtotal}
                  totalDiscount={billing.totalDiscount}
                  discountedSubtotal={billing.discountedSubtotal}
                  serviceChargeAmount={billing.serviceChargeAmount}
                  serviceChargeLabel={billingSettings.serviceChargeLabel || 'Service Charge'}
                  serviceChargeRate={billing.serviceChargeRate}
                  taxBreakdown={billing.taxBreakdown}
                  totalTax={billing.totalTax}
                  tipAmount={tipAmount}
                  tipPercentage={tipPercentage}
                  roundOffAmount={billing.roundOffAmount}
                  grandTotal={billing.grandTotal}
                />
                {billing.totalDiscount > 0 && (
                  <Text style={styles.savingsText}>You save ₹{billing.totalDiscount.toFixed(0)}</Text>
                )}

                {/* Payment Method — hidden when split payment active */}
                {splitPayments.length === 0 && (
                  <View style={styles.paymentRow}>
                    <Ionicons name="card-outline" size={14} color="#6b7280" />
                    <Text style={styles.paymentLabel}>Pay</Text>
                    {['cash', 'upi', 'card'].map((method) => (
                      <TouchableOpacity
                        key={method}
                        style={[styles.paymentPill, paymentMethod === method && styles.paymentPillActive]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Ionicons name={paymentIcons[method]} size={14} color={paymentMethod === method ? '#fff' : '#6b7280'} />
                        <Text style={[styles.paymentPillText, paymentMethod === method && styles.paymentPillTextActive]}>
                          {method.charAt(0).toUpperCase() + method.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Spacer for sticky bottom buttons */}
                <View style={{ height: 80 }} />
              </>
            )}
          </ScrollView>

          {/* Sticky Bottom Action Buttons */}
          {cart.length > 0 && (
            <View style={[styles.stickyBottom, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <View style={styles.dualButtonRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.kitchenBtn, sending && { opacity: 0.6 }]}
                  onPress={handlePlaceOrder}
                  disabled={sending}
                >
                  {sending && activeAction === 'place' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="flame-outline" size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Place Order</Text>
                    </>
                  )}
                </TouchableOpacity>
                {onCompleteBill && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.billBtn, sending && { opacity: 0.6 }]}
                    onPress={handleCompleteBill}
                    disabled={sending}
                  >
                    {sending && activeAction === 'complete' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.actionBtnText}>Complete Bill</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
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
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  // Header
  header: {
    backgroundColor: Colors.primary,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  itemCountText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  headerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 2,
  },
  tableBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionBtnActive: {
    backgroundColor: '#fff',
  },
  orderTypeTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  orderTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  orderTypeTabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  orderTypeTabTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  // Kitchen Notes
  kitchenNotesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  kitchenNotesInput: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    padding: 0,
  },
  // Cart Items
  cartList: {
    paddingHorizontal: 12,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  cartItemLeft: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnAdd: {
    backgroundColor: Colors.primary,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    minWidth: 22,
    textAlign: 'center',
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 48,
    textAlign: 'right',
  },
  // Sections
  sectionContainer: {
    paddingHorizontal: 12,
    marginTop: 6,
  },
  billingSection: {
    paddingHorizontal: 12,
    marginTop: 6,
  },
  savingsText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 4,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  paymentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginRight: 2,
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  paymentPillActive: {
    backgroundColor: Colors.primary,
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  paymentPillTextActive: {
    color: '#fff',
  },
  // Sticky bottom
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 8,
  },
  dualButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 10,
  },
  kitchenBtn: {
    backgroundColor: '#1e40af',
  },
  billBtn: {
    backgroundColor: '#059669',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
});
