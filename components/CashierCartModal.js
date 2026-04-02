import React, { useState, useEffect, useCallback } from 'react';
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
import useBillingCalculation from '../hooks/useBillingCalculation';
import BillingSummaryBar from './billing/BillingSummaryBar';
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';
import PricingRuleSelector from './billing/PricingRuleSelector';

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
  billingSettings = {},
  pricingRules = [],
  activePricingRuleId,
  setActivePricingRuleId,
  autoSelectedRule = false,
}) {
  const [orderType, setOrderType] = useState('counter');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);

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

  // Use shared billing calculation hook (includes tax!)
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

  const handleCustomerFound = useCallback((customer, settings) => {
    setCustomerData(customer);
    setLoyaltySettings(settings);
    if (customer) {
      setCustomerName(customer.name || '');
      setCustomerMobile(customer.phone || '');
    }
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

  const handlePlaceOrder = () => {
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
  };

  const paymentIcons = { cash: 'cash-outline', upi: 'phone-portrait-outline', card: 'card-outline' };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemMeta}>₹{item.price} × {item.quantity}</Text>
      </View>
      <View style={styles.cartItemRight}>
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={14} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity
            style={[styles.qtyBtn, styles.qtyBtnAdd]}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={styles.cartItemTotal}>₹{(item.price * item.quantity).toFixed(0)}</Text>
        <TouchableOpacity
          onPress={() => onRemoveItem(item.id)}
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
    >
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />

        {/* Header */}
        <SafeAreaView style={styles.headerSafeArea} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>New Bill</Text>
              <Text style={styles.subtitle}>{itemCount} items</Text>
            </View>
            {/* Kitchen Notes toggle */}
            <TouchableOpacity
              style={[styles.headerActionBtn, showKitchenNotes && styles.headerActionBtnActive]}
              onPress={() => setShowKitchenNotes(!showKitchenNotes)}
            >
              <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? '#10b981' : '#fff'} />
            </TouchableOpacity>
          </View>

          {/* Order Type Tabs */}
          <View style={styles.orderTypeSection}>
            {[
              { key: 'counter', label: 'Counter', icon: 'storefront-outline' },
              { key: 'takeaway', label: 'Takeaway', icon: 'bag-handle-outline' },
              { key: 'delivery', label: 'Delivery', icon: 'bicycle-outline' },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.orderTypeTab, orderType === t.key && styles.orderTypeTabActive]}
                onPress={() => { setOrderType(t.key); onOrderTypeChange?.(t.key); }}
              >
                <Ionicons name={t.icon} size={14} color={orderType === t.key ? '#10b981' : 'rgba(255,255,255,0.8)'} />
                <Text style={[styles.orderTypeText, orderType === t.key && styles.orderTypeTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>

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
                <View style={styles.sectionCard}>
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
                </View>
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

              {/* Payment Method Pills (hidden when split payment active) */}
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

              {/* Spacer for bottom button */}
              <View style={{ height: 80 }} />
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
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.completeButtonText}>Complete Billing</Text>
                  <Text style={styles.completeButtonAmount}>₹{billing.grandTotal.toFixed(0)}</Text>
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
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 19,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
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
  orderTypeSection: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 6,
  },
  orderTypeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
  },
  orderTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  orderTypeTextActive: {
    color: '#10b981',
  },
  scrollContent: {
    flex: 1,
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
  // Cart
  cartSection: {
    backgroundColor: '#fff',
    marginTop: 8,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  cartItemMeta: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
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
    backgroundColor: '#10b981',
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    minWidth: 22,
    textAlign: 'center',
  },
  cartItemTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
    minWidth: 48,
    textAlign: 'right',
  },
  // Sections
  sectionCard: {
    backgroundColor: '#fff',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  billingSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'center',
    marginTop: 4,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    backgroundColor: '#10b981',
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  paymentPillTextActive: {
    color: '#fff',
  },
  // Bottom
  bottomAction: {
    backgroundColor: '#fff',
    padding: 14,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  completeButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  completeButtonAmount: {
    fontSize: 17,
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
