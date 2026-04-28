// DEPRECATED: All cart functionality is now in CartModal.js with mode="cashier"|"waiter"|"owner".
// This file is kept for reference only. Safe to delete after verifying unified CartModal.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import CustomerDetailModal from './CustomerDetailModal';
import useBillingCalculation from '../hooks/useBillingCalculation';
import useOfferEngine from '../hooks/useOfferEngine';
import { calculateOfferResult } from '../services/offerEngine';
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';
import PricingRuleSelector from './billing/PricingRuleSelector';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import UpiQrModal from './UpiQrModal';

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
  categories = [],
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
  floors = [],
  onTableSelect,
  selectedTable,
  upiSettings = {},
}) {
  const { fs } = useResponsive();
  const { effectivelyOffline } = useOffline();
  const [orderType, setOrderType] = useState('counter');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const [tableNumber, setTableNumber] = useState(selectedTable?.name || '');
  const [showTableInput, setShowTableInput] = useState(false);

  // Sync table number if selectedTable prop changes (e.g. navigated from tables view or cleared)
  useEffect(() => {
    if (selectedTable?.name) {
      if (selectedTable.name !== tableNumber) setTableNumber(selectedTable.name);
    } else {
      // Parent cleared selectedTable — clear local table number too
      if (tableNumber) setTableNumber('');
      setShowTableInput(false);
    }
  }, [selectedTable]);

  // Lookup table in floors to find zone
  const matchedFloor = useMemo(() => {
    if (!tableNumber.trim() || floors.length === 0) return null;
    const tNum = tableNumber.trim().toLowerCase();
    for (const floor of floors) {
      const tables = floor.tables || [];
      const found = tables.find(t => {
        const name = (t.name || '').toLowerCase();
        const num = String(t.number || '').toLowerCase();
        return name === tNum || num === tNum;
      });
      if (found) return { floorName: floor.name, table: found };
    }
    return null;
  }, [tableNumber, floors]);

  // When table number changes and a floor match is found, notify parent for pricing rule auto-selection
  useEffect(() => {
    if (!onTableSelect) return;
    if (matchedFloor) {
      onTableSelect(tableNumber.trim(), matchedFloor.floorName);
    } else if (tableNumber.trim()) {
      onTableSelect(tableNumber.trim(), '');
    } else {
      onTableSelect('', '');
    }
  }, [matchedFloor, tableNumber]);

  // Loyalty state
  const [customerData, setCustomerData] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltySettings, setLoyaltySettings] = useState(null);

  // Manual discount state
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(280);
  const [lookupKey, setLookupKey] = useState(0);
  const [showUpiQr, setShowUpiQr] = useState(false);

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

  // Reset all state when modal closes
  useEffect(() => {
    if (!visible) {
      // Billing state
      setActiveBillingPanel(null);
      setCashReceived(''); setChangeAmount(0);
      setSplitPayments([]); setTipAmount(0); setTipPercentage(null);
      setPartialPayAmount(''); setSelectedCompItems([]); setSelectedVoidItems([]);
      setCompReason(''); setVoidReason(''); setBillingManagerPin('');
      setSpecialInstructions(''); setShowKitchenNotes(false);
      // Customer & offer state
      setCustomerData(null);
      setCustomerName('');
      setCustomerMobile('');
      setRedeemPoints(0);
      setManualDiscount('');
      setManualDiscountType('flat');
      setShowOffersModal(false);
      setShowBreakdownModal(false);
      resetOffers();
      setLookupKey(k => k + 1);
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

  // Comp items reduce subtotal
  const compAmount = selectedCompItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCustomerFound = useCallback((customer, settings) => {
    setCustomerData(customer);
    setLoyaltySettings(settings);
    if (customer) {
      setCustomerName(customer.name || '');
      setCustomerMobile(customer.phone || '');
    }
    setRedeemPoints(0);
  }, []);

  // Loyalty max redeemable calculation (for modal)
  const loyaltyMaxRedeemable = useMemo(() => {
    if (!customerData?.loyaltyPoints || !effectiveLoyaltySettings) return 0;
    const redemptionRate = effectiveLoyaltySettings.redemptionRate || 1;
    const maxPct = effectiveLoyaltySettings.maxRedemptionPercent || 20;
    const afterOtherDisc = Math.max(0, subtotal - offerDiscount - manualDiscountAmount);
    const maxDiscByPct = (afterOtherDisc * maxPct) / 100;
    const maxPointsByPct = Math.floor(maxDiscByPct * redemptionRate);
    return Math.min(customerData.loyaltyPoints, maxPointsByPct);
  }, [customerData, effectiveLoyaltySettings, subtotal, offerDiscount, manualDiscountAmount]);

  // Loyalty points to earn
  const loyaltyPointsToEarn = useMemo(() => {
    if (!effectiveLoyaltySettings?.enabled) return 0;
    const earnPerAmount = effectiveLoyaltySettings.earnPerAmount || 100;
    const pointsRate = effectiveLoyaltySettings.pointsEarned || 4;
    const discTotal = offerDiscount + manualDiscountAmount;
    if (redeemPoints > 0 && !effectiveLoyaltySettings.earnPointsOnRedemption) return 0;
    const base = effectiveLoyaltySettings.earnOnFullAmount ? subtotal : Math.max(0, subtotal - discTotal - loyaltyDiscount);
    return Math.floor(base / earnPerAmount) * pointsRate;
  }, [effectiveLoyaltySettings, subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, redeemPoints]);

  const buildDiscountData = () => ({
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    totalDiscount: billing.totalDiscount,
    redeemLoyaltyPoints: redeemPoints,
    selectedOfferId,
    selectedOfferIds: selectedOfferIds.length > 0 ? selectedOfferIds : (selectedOfferId ? [selectedOfferId] : []),
    selectedOfferName: selectedOffer?.name || null,
    selectedOfferNames: selectedOffers.length > 0 ? selectedOffers.map(o => o.name) : (selectedOffer ? [selectedOffer.name] : []),
    appliedOffers: selectedOffers.length > 0
      ? selectedOffers.map(offer => ({
          id: offer.id || offer._id,
          name: offer.name,
          discountApplied: calculateOfferResult(offer, subtotal, cart, {})?.discount || 0,
        }))
      : (selectedOffer && offerDiscount > 0
          ? [{ id: selectedOfferId, name: selectedOffer.name, discountApplied: offerDiscount }]
          : []),
    customerPhone: customerMobile || customerData?.phone || '',
    customerName: customerName || customerData?.name || '',
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
    freeItems: freeItems && freeItems.length > 0 ? freeItems : null,
  });

  // Customer context for extended offer engine.
  const customerContext = useMemo(() => {
    const phone = customerMobile || customerData?.phone || null;
    if (!phone && !customerData?.id && !customerData?._id) return null;
    return {
      customerPhone: phone,
      customerId: customerData?.id || customerData?._id || null,
      isFirstOrder: customerData ? customerData.totalOrders === 0 : undefined,
    };
  }, [customerMobile, customerData]);

  // Direct offer engine hook (replaces OfferSelector component)
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
    autoApplied,
    offerSettings,
    loyaltySettings: hookLoyaltySettings,
    calculateDiscountForOffer,
    resetOffers,
  } = useOfferEngine({
    restaurantId,
    cart,
    subtotal,
    customerContext,
    options: { autoApply: true },
  });

  // Merge loyaltySettings — prefer hook source (loads from API on mount), fall back to local state
  const effectiveLoyaltySettings = hookLoyaltySettings || loyaltySettings;

  // Calculate loyalty discount (points / redemptionRate = discount amount)
  const loyaltyDiscount = useMemo(() => {
    if (!redeemPoints || !effectiveLoyaltySettings) return 0;
    const redemptionRate = effectiveLoyaltySettings.redemptionRate || 1;
    return Math.round((redeemPoints / redemptionRate) * 100) / 100;
  }, [redeemPoints, effectiveLoyaltySettings]);

  // Derive selectedOffer/selectedOffers for buildDiscountData
  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null;
    return applicableOffers.find(o => (o.id || o._id) === selectedOfferId) || null;
  }, [selectedOfferId, applicableOffers]);

  const selectedOffers = useMemo(() => {
    if (selectedOfferIds.length === 0) return [];
    return selectedOfferIds
      .map(id => applicableOffers.find(o => (o.id || o._id) === id))
      .filter(Boolean);
  }, [selectedOfferIds, applicableOffers]);

  // Use shared billing calculation hook — MUST be after useOfferEngine so offerDiscount is defined
  const billing = useBillingCalculation({
    subtotal,
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    compAmount,
    taxSettings,
    billingSettings,
    tipAmount,
    cart,
    categories,
  });

  const freeItemsForDisplay = useMemo(() => {
    return (freeItems || []).map(fi => {
      const id = fi.itemId || fi.menuItemId || fi.id;
      const match = cart.find(c => (c.menuItemId || c.id) === id);
      return {
        id,
        name: fi.name || match?.name || `Item ${id}`,
        quantity: fi.qty || fi.quantity || 1,
      };
    });
  }, [freeItems, cart]);

  const upiConfigured = upiSettings?.upiEnabled && upiSettings?.upiId;

  const handlePlaceOrder = () => {
    if (paymentMethod === 'upi' && upiConfigured) {
      setShowUpiQr(true);
      return;
    }
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
  };

  const handleUpiConfirm = () => {
    setShowUpiQr(false);
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
  };

  const paymentIcons = { cash: 'cash-outline', upi: 'phone-portrait-outline', card: 'card-outline' };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        {getItemSubline(item) ? (
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
        ) : null}
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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

            {/* Table Number — inline input or chip */}
            {selectedTable?.name ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 }}>
                <Ionicons name="restaurant-outline" size={13} color="#f87171" />
                <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{selectedTable.name}</Text>
              </View>
            ) : showTableInput ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 6, marginRight: 6, height: 32 }}>
                <Ionicons name="restaurant-outline" size={13} color="rgba(255,255,255,0.7)" />
                <TextInput
                  style={{ color: '#fff', fontSize: 13, fontWeight: '600', paddingHorizontal: 6, minWidth: 50, maxWidth: 80, paddingVertical: 0 }}
                  placeholder="Table"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={tableNumber}
                  onChangeText={setTableNumber}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => { if (!tableNumber.trim()) setShowTableInput(false); }}
                />
                {tableNumber ? (
                  matchedFloor ? (
                    <Ionicons name="checkmark-circle" size={14} color="#f87171" />
                  ) : (
                    <Ionicons name="alert-circle-outline" size={14} color="#fbbf24" />
                  )
                ) : (
                  <TouchableOpacity onPress={() => { setTableNumber(''); setShowTableInput(false); }}>
                    <Ionicons name="close" size={14} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginRight: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => setShowTableInput(true)}
              >
                <Ionicons name="add" size={13} color="rgba(255,255,255,0.7)" />
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>Table</Text>
              </TouchableOpacity>
            )}

            {/* Kitchen Notes toggle */}
            <TouchableOpacity
              style={[styles.headerActionBtn, showKitchenNotes && styles.headerActionBtnActive]}
              onPress={() => setShowKitchenNotes(!showKitchenNotes)}
            >
              <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? '#dc2626' : '#fff'} />
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
                <Ionicons name={t.icon} size={14} color={orderType === t.key ? '#dc2626' : 'rgba(255,255,255,0.8)'} />
                <Text style={[styles.orderTypeText, orderType === t.key && styles.orderTypeTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Zone/Pricing auto-select indicator */}
          {tableNumber.trim() && matchedFloor && autoSelectedRule && activePricingRuleId && (() => {
            const activeRule = pricingRules.find(r => r.id === activePricingRuleId);
            if (!activeRule) return null;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(220,38,38,0.1)', gap: 4 }}>
                <Ionicons name="lock-closed" size={10} color="#f87171" />
                <Text style={{ fontSize: 11, color: '#f87171', fontWeight: '600' }}>{activeRule.name}</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>·</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{matchedFloor.floorName}</Text>
              </View>
            );
          })()}
        </SafeAreaView>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
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
            <View style={[styles.cartSection, { maxHeight: 280 }]}>
              <FlatList
                data={cart}
                ListFooterComponent={freeItemsForDisplay.length > 0 ? (
                  <View>
                    {freeItemsForDisplay.map((fi) => (
                      <View key={`free-${fi.id}`} style={styles.cartItem}>
                        <View style={styles.cartItemLeft}>
                          <Text style={styles.cartItemName} numberOfLines={1}>{fi.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626' }}>FREE</Text>
                            </View>
                            <Text style={{ fontSize: 10, color: '#9ca3af' }}>x{fi.quantity}</Text>
                          </View>
                        </View>
                        <View style={styles.cartItemRight}>
                          <Text style={[styles.cartItemTotal, { color: '#dc2626' }]}>₹0</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={true}
                nestedScrollEnabled={true}
              />
            </View>
          )}

          {cart.length > 0 && (
            <>
              {/* Billing Toolbar + Panels — compact chips at top */}
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

              {/* Spacer for bottom fixed section */}
              <View style={{ height: 10 }} />
            </>
          )}
        </ScrollView>

        {/* Fixed Bottom Section — customer + offers inline, total, payment */}
        {cart.length > 0 && (
          <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
              {/* Customer Phone + Name + Offers — same line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4, gap: 6 }}>
                {/* Phone input */}
                {restaurantId && (
                  <View style={{ flex: 2 }}>
                    <CustomerLookup
                      key={`inline-${lookupKey}`}
                      restaurantId={restaurantId}
                      countryCode={countryCode}
                      subtotal={subtotal}
                      onCustomerFound={handleCustomerFound}
                      onPhoneChange={(phone) => setCustomerMobile(phone)}
                      onRedeemChange={setRedeemPoints}
                      onCustomerChipPress={(customer) => {
                        setDetailCustomerId(customer?.id || customer?._id);
                        setShowCustomerDetail(true);
                      }}
                      redeemPoints={redeemPoints}
                      hideLoyalty
                      compact
                      coolStyle
                      hideExtras
                    />
                  </View>
                )}

                {/* Name input — side by side with phone */}
                <View style={styles.nameInputWrap}>
                  <Ionicons name="person-outline" size={14} color={customerName ? '#dc2626' : '#9ca3af'} />
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Name"
                    placeholderTextColor="#9ca3af"
                    value={customerName}
                    onChangeText={setCustomerName}
                    autoCapitalize="words"
                  />
                </View>

                {/* Offers badge — compact, inline */}
                {(() => {
                  const hasOffers = genericOffers.length > 0 || personalizedOffers.length > 0;
                  const hasLoyalty = effectiveLoyaltySettings?.enabled && customerData;
                  const hasAnything = hasOffers || hasLoyalty || billing.totalDiscount > 0 || specialInstructions;
                  if (!hasAnything) return null;

                  const activeOfferCount = (offerSettings?.allowMultipleOffers ? selectedOfferIds : (selectedOfferId ? [selectedOfferId] : [])).length;
                  const hasApplied = activeOfferCount > 0 || loyaltyDiscount > 0 || manualDiscountAmount > 0;

                  return (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: hasApplied ? '#fef2f2' : '#fef2f2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: hasApplied ? '#fecaca' : '#fee2e2' }}
                      onPress={() => setShowOffersModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pricetag" size={13} color={hasApplied ? '#dc2626' : '#dc2626'} />
                      {hasApplied ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>
                          -₹{billing.totalDiscount.toFixed(0)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#dc2626' }}>
                          {applicableOffers.length}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={12} color={hasApplied ? '#f87171' : '#a5b4fc'} />
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {/* Compact Total Strip */}
              <View style={styles.compactTotalStrip}>
                <View style={styles.compactTotalRow}>
                  <View>
                    <Text style={styles.compactTotalLabel}>TOTAL</Text>
                    {billing.totalDiscount > 0 && (
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#fca5a5', marginTop: 1 }}>You save ₹{billing.totalDiscount.toFixed(0)}</Text>
                    )}
                  </View>
                  <Text style={styles.compactTotalValue}>₹{billing.grandTotal.toFixed(0)}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breakdownChipsRow}>
                  <View style={styles.breakdownChip}>
                    <Text style={styles.breakdownChipText}>Sub ₹{subtotal.toFixed(0)}</Text>
                  </View>
                  {billing.totalDiscount > 0 && (
                    <View style={[styles.breakdownChip, styles.breakdownChipGreen]}>
                      <Text style={[styles.breakdownChipText, styles.breakdownChipTextGreen]}>-₹{billing.totalDiscount.toFixed(0)}</Text>
                    </View>
                  )}
                  {billing.serviceChargeAmount > 0 && (
                    <View style={styles.breakdownChip}>
                      <Text style={styles.breakdownChipText}>SC ₹{billing.serviceChargeAmount.toFixed(0)}</Text>
                    </View>
                  )}
                  {billing.totalTax > 0 && (
                    <View style={styles.breakdownChip}>
                      <Text style={styles.breakdownChipText}>Tax ₹{billing.totalTax.toFixed(0)}</Text>
                    </View>
                  )}
                  {tipAmount > 0 && (
                    <View style={styles.breakdownChip}>
                      <Text style={styles.breakdownChipText}>Tip ₹{tipAmount.toFixed(0)}</Text>
                    </View>
                  )}
                  {billing.roundOffAmount !== 0 && (
                    <View style={styles.breakdownChip}>
                      <Text style={styles.breakdownChipText}>Round {billing.roundOffAmount > 0 ? '+' : ''}₹{billing.roundOffAmount.toFixed(1)}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setShowBreakdownModal(true)} style={styles.breakdownInfoBtn}>
                    <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.8)" />
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Payment Method Pills */}
              {splitPayments.length === 0 && (
                <View style={[styles.paymentRow, { paddingHorizontal: 12 }]}>
                  <Ionicons name="card-outline" size={14} color="#6b7280" />
                  <Text style={styles.paymentLabel}>Pay</Text>
                  {(['cash', 'upi', 'card'].filter(m => !effectivelyOffline || m === 'cash')).map((method) => (
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
              {effectivelyOffline && (
                <Text style={{ fontSize: 11, color: '#f59e0b', marginTop: 4, marginLeft: 12 }}>UPI/Card unavailable offline</Text>
              )}
          </View>
        )}

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
                  <Text style={[styles.completeButtonText, { fontSize: fs(15) }]}>Complete Billing</Text>
                  <Text style={[styles.completeButtonAmount, { fontSize: fs(17) }]}>₹{billing.grandTotal.toFixed(0)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
      </TouchableWithoutFeedback>
      {/* Offers & Rewards Modal */}
      <Modal
        visible={showOffersModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOffersModal(false)}
      >
        <View style={styles.offersOverlay}>
          <TouchableOpacity style={{ flex: 0.05 }} activeOpacity={1} onPress={() => setShowOffersModal(false)} />
          <View style={styles.offersCard}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
            </View>
            {/* Header */}
            <View style={styles.offersHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="pricetag" size={14} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>Order Details</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>{cart.length} items · ₹{subtotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowOffersModal(false)}
                style={styles.offersCloseBtn}
              >
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView style={styles.offersBody} showsVerticalScrollIndicator={false}>
              {/* CUSTOMER INFO Section */}
              {customerData && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Customer</Text>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setShowOffersModal(true)} style={{ padding: 12, borderRadius: 10, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="person" size={16} color="#15803d" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>{customerData.name}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>{customerData.phone || customerMobile}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          setDetailCustomerId(customerData?.id || customerData?._id);
                          setShowCustomerDetail(true);
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#dc2626' }}>View</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#dcfce7' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>{customerData.totalOrders || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Orders</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fffbeb', alignItems: 'center', borderWidth: 1, borderColor: '#fef3c7' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#d97706' }}>{customerData.loyaltyPoints || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Points</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#dcfce7' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#15803d' }}>₹{(customerData.totalSpent || 0).toFixed(0)}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Spent</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              {/* OFFERS Section */}
              {(genericOffers.length > 0 || personalizedOffers.length > 0) && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Offers</Text>
                  {genericOffers.map(offer => {
                    const oid = offer.id || offer._id;
                    const isMulti = offerSettings?.allowMultipleOffers;
                    const isSelected = isMulti ? selectedOfferIds.includes(oid) : selectedOfferId === oid;
                    const saves = calculateDiscountForOffer(offer, subtotal, cart);
                    return (
                      <TouchableOpacity
                        key={oid}
                        style={[styles.offerCard, isSelected && styles.offerCardSelected]}
                        onPress={() => {
                          if (isMulti) { toggleOffer(oid); } else { setSelectedOfferId(isSelected ? null : oid); }
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.offerCheckbox, isSelected && styles.offerCheckboxActive]}>
                          {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.offerCardName, isSelected && { color: '#991b1b' }]}>{offer.name}</Text>
                            {isSelected && autoApplied && (
                              <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#dc2626' }}>Auto</Text>
                              </View>
                            )}
                          </View>
                          {offer.description ? (
                            <Text style={styles.offerCardDesc} numberOfLines={1}>{offer.description}</Text>
                          ) : null}
                        </View>
                        {saves > 0 && (
                          <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>
                            -₹{saves.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Personalized offers */}
                  {personalizedOffers.length > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginBottom: 8 }}>
                        <Ionicons name="gift" size={10} color="#b45309" />
                        <Text style={[styles.modalSectionLabel, { color: '#b45309', marginBottom: 0 }]}>For You</Text>
                      </View>
                      {personalizedOffers.map(offer => {
                        const oid = offer.id || offer._id;
                        const isMulti = offerSettings?.allowMultipleOffers;
                        const isSelected = isMulti ? selectedOfferIds.includes(oid) : selectedOfferId === oid;
                        const saves = calculateDiscountForOffer(offer, subtotal, cart);
                        const offerGroupIds = offer.audience?.groupIds || [];
                        const matchedGroup = customerOfferGroups?.find(g => offerGroupIds.includes(g.id));
                        return (
                          <TouchableOpacity
                            key={oid}
                            style={[styles.offerCard, styles.offerCardPersonalized, isSelected && styles.offerCardPersonalizedSelected]}
                            onPress={() => {
                              if (isMulti) { toggleOffer(oid); } else { setSelectedOfferId(isSelected ? null : oid); }
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.offerCheckbox, { borderColor: '#fbbf24' }, isSelected && { backgroundColor: '#d97706', borderColor: '#d97706' }]}>
                              {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.offerCardName, { color: '#b45309' }, isSelected && { color: '#92400e' }]}>{offer.name}</Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                {offer.description ? (
                                  <Text style={[styles.offerCardDesc, { color: '#d97706' }]} numberOfLines={1}>{offer.description}</Text>
                                ) : null}
                                {matchedGroup && (
                                  <View style={{ backgroundColor: matchedGroup.color || '#dc2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{matchedGroup.name}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {saves > 0 && (
                              <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>
                                -₹{saves.toFixed(2)}
                              </Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}

                  {freeItems && freeItems.length > 0 && (
                    <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: '#fef3c7', borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="gift" size={12} color="#78350f" />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#78350f' }}>
                        Free: {freeItemsForDisplay.map(f => `${f.quantity}× ${f.name}`).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {isLoadingOffers && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <ActivityIndicator size="small" color="#dc2626" />
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Loading offers...</Text>
                </View>
              )}

              {/* LOYALTY POINTS Section */}
              {effectiveLoyaltySettings?.enabled && customerData && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Loyalty Points</Text>
                  <View style={styles.loyaltyCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#b45309' }}>
                        {customerData.loyaltyPoints || 0} points available
                      </Text>
                      {loyaltyPointsToEarn > 0 && (
                        <View style={styles.earnBadge}>
                          <Text style={styles.earnBadgeText}>Will earn +{loyaltyPointsToEarn} pts</Text>
                        </View>
                      )}
                    </View>
                    {loyaltyMaxRedeemable > 0 ? (
                      <>
                        {/* Smooth draggable slider */}
                        <View
                          style={styles.sliderContainer}
                          onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
                          onStartShouldSetResponder={() => true}
                          onMoveShouldSetResponder={() => true}
                          onResponderGrant={(e) => {
                            const x = e.nativeEvent.locationX;
                            const fraction = Math.max(0, Math.min(1, x / sliderWidth));
                            setRedeemPoints(Math.round(loyaltyMaxRedeemable * fraction));
                          }}
                          onResponderMove={(e) => {
                            const x = e.nativeEvent.locationX;
                            const fraction = Math.max(0, Math.min(1, x / sliderWidth));
                            setRedeemPoints(Math.round(loyaltyMaxRedeemable * fraction));
                          }}
                        >
                          <View style={styles.sliderTrack}>
                            <View style={[styles.sliderFill, { width: `${Math.min(100, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }]} />
                            <View style={[styles.sliderThumb, { left: `${Math.min(96, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }]} />
                          </View>
                        </View>

                        {/* Quick-select pills below slider */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          {[
                            { label: '25%', value: 0.25 },
                            { label: '50%', value: 0.50 },
                            { label: '75%', value: 0.75 },
                            { label: 'Max', value: 1 },
                          ].map((opt) => {
                            const pillPts = Math.floor(loyaltyMaxRedeemable * opt.value);
                            const isActive = redeemPoints > 0 && redeemPoints === pillPts;
                            return (
                              <TouchableOpacity
                                key={opt.label}
                                style={[styles.loyaltyPill, isActive && styles.loyaltyPillActive]}
                                onPress={() => setRedeemPoints(pillPts)}
                              >
                                <Text style={[styles.loyaltyPillText, isActive && styles.loyaltyPillTextActive]}>
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                          {redeemPoints > 0 && (
                            <TouchableOpacity
                              style={[styles.loyaltyPill, { borderColor: '#fecaca', backgroundColor: '#fee2e2' }]}
                              onPress={() => setRedeemPoints(0)}
                            >
                              <Ionicons name="close" size={12} color="#ef4444" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Value labels */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#b45309' }}>
                            {redeemPoints > 0 ? `${redeemPoints} pts = -₹${loyaltyDiscount.toFixed(0)}` : 'Tap or slide to redeem'}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#92400e' }}>
                            Max: {loyaltyMaxRedeemable} pts ({effectiveLoyaltySettings.maxRedemptionPercent || 20}%)
                          </Text>
                        </View>
                      </>
                    ) : (customerData.loyaltyPoints || 0) > 0 ? (
                      <Text style={{ fontSize: 11, color: '#92400e' }}>
                        Cannot redeem on current order (max {effectiveLoyaltySettings.maxRedemptionPercent || 20}% of bill)
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* MANUAL DISCOUNT Section */}
              {billingSettings.manualDiscountEnabled !== false && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="pricetag-outline" size={10} color="#94a3b8" />
                    <Text style={styles.modalSectionLabel}>Manual Discount</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: manualDiscountType === 'flat' ? '#dc2626' : '#f9fafb' }}
                        onPress={() => setManualDiscountType('flat')}
                      >
                        <Text style={{ color: manualDiscountType === 'flat' ? '#fff' : '#6b7280', fontWeight: '600', fontSize: 12 }}>Flat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: manualDiscountType === 'percentage' ? '#dc2626' : '#f9fafb' }}
                        onPress={() => setManualDiscountType('percentage')}
                      >
                        <Text style={{ color: manualDiscountType === 'percentage' ? '#fff' : '#6b7280', fontWeight: '600', fontSize: 12 }}>%</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '600', color: '#1f2937' }}
                      placeholder={manualDiscountType === 'percentage' ? '0%' : '₹0'}
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={manualDiscount}
                      onChangeText={setManualDiscount}
                    />
                  </View>
                  {manualDiscountAmount > 0 && (
                    <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: '500' }}>
                      Discount: -₹{manualDiscountAmount.toFixed(0)}
                    </Text>
                  )}
                </View>
              )}

              {/* KITCHEN NOTES Section */}
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                  <Ionicons name="document-text-outline" size={10} color="#94a3b8" />
                  <Text style={styles.modalSectionLabel}>Kitchen Notes</Text>
                </View>
                <TextInput
                  style={styles.notesInput}
                  placeholder="E.g., No onions, extra spicy, birthday celebration..."
                  placeholderTextColor="#9ca3af"
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            {/* Footer — full breakdown */}
            <View style={styles.offersFooter}>
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>Subtotal</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>₹{subtotal.toFixed(0)}</Text>
                </View>
                {offerDiscount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Offers</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>-₹{offerDiscount.toFixed(0)}</Text>
                  </View>
                )}
                {loyaltyDiscount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#b45309' }}>Loyalty ({redeemPoints} pts)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#b45309' }}>-₹{loyaltyDiscount.toFixed(0)}</Text>
                  </View>
                )}
                {billing.serviceChargeAmount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{billingSettings.serviceChargeLabel || 'Service Charge'} ({billing.serviceChargeRate}%)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>₹{billing.serviceChargeAmount.toFixed(0)}</Text>
                  </View>
                )}
                {billing.totalTax > 0 && billing.taxBreakdown.map((tax, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{tax.name} ({tax.rate}%)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>₹{tax.amount.toFixed(0)}</Text>
                  </View>
                ))}
                {billing.roundOffAmount !== 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Round off</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>{billing.roundOffAmount > 0 ? '+' : ''}₹{billing.roundOffAmount.toFixed(2)}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>₹{billing.grandTotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.doneBtn, billing.totalDiscount > 0 && { backgroundColor: '#dc2626' }]}
                onPress={() => setShowOffersModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.doneBtnText}>
                  {billing.totalDiscount > 0 ? `Apply & Save ₹${billing.totalDiscount.toFixed(0)}` : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bill Breakdown Modal */}
      <Modal
        visible={showBreakdownModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowBreakdownModal(false)}
      >
        <TouchableOpacity style={styles.breakdownOverlay} activeOpacity={1} onPress={() => setShowBreakdownModal(false)}>
          <View style={styles.breakdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>Bill Breakdown</Text>
              <TouchableOpacity onPress={() => setShowBreakdownModal(false)}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.breakdownBody}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownAmount}>₹{subtotal.toFixed(2)}</Text>
              </View>
              {offerDiscount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Offers</Text>
                  <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-₹{offerDiscount.toFixed(2)}</Text>
                </View>
              )}
              {loyaltyDiscount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Loyalty ({redeemPoints} pts)</Text>
                  <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-₹{loyaltyDiscount.toFixed(2)}</Text>
                </View>
              )}
              {manualDiscountAmount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Manual Discount</Text>
                  <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-₹{manualDiscountAmount.toFixed(2)}</Text>
                </View>
              )}
              {billing.serviceChargeAmount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{billingSettings.serviceChargeLabel || 'Service Charge'}{billing.serviceChargeRate ? ` ${billing.serviceChargeRate}%` : ''}</Text>
                  <Text style={styles.breakdownAmount}>₹{billing.serviceChargeAmount.toFixed(2)}</Text>
                </View>
              )}
              {billing.taxBreakdown.map((tax, i) => (
                <View key={`tax-${i}`} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{tax.name}{tax.rate ? ` ${tax.rate}%` : ''}</Text>
                  <Text style={styles.breakdownAmount}>₹{tax.amount.toFixed(2)}</Text>
                </View>
              ))}
              {tipAmount > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Tip{tipPercentage ? ` ${tipPercentage}%` : ''}</Text>
                  <Text style={styles.breakdownAmount}>₹{tipAmount.toFixed(2)}</Text>
                </View>
              )}
              {billing.roundOffAmount !== 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Round-off</Text>
                  <Text style={styles.breakdownAmount}>{billing.roundOffAmount > 0 ? '+' : '-'}₹{Math.abs(billing.roundOffAmount).toFixed(2)}</Text>
                </View>
              )}
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownGrandLabel}>Grand Total</Text>
                <Text style={styles.breakdownGrandValue}>₹{billing.grandTotal.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <CustomerDetailModal
        visible={showCustomerDetail}
        customerId={detailCustomerId}
        restaurantId={restaurantId}
        onClose={() => setShowCustomerDetail(false)}
      />
      <UpiQrModal
        visible={showUpiQr}
        onClose={() => setShowUpiQr(false)}
        onConfirmPayment={handleUpiConfirm}
        amount={billing.grandTotal}
        restaurantName={restaurantName}
        upiId={upiSettings?.upiId}
        upiQrCodeUrl={upiSettings?.upiQrCodeUrl}
        upiDisplayName={upiSettings?.upiDisplayName}
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
    backgroundColor: '#1e293b',
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
    color: '#dc2626',
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
    paddingTop: 4,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
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
    backgroundColor: '#dc2626',
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
    color: '#1e293b',
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
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 4,
  },
  // Compact Total Strip
  compactTotalStrip: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactTotalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  compactTotalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  breakdownChipsRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 5,
    alignItems: 'center',
  },
  breakdownChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  breakdownChipGreen: {
    backgroundColor: 'rgba(252,165,165,0.25)',
  },
  breakdownChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  breakdownChipTextGreen: {
    color: '#fecaca',
  },
  breakdownInfoBtn: {
    padding: 2,
  },
  // Breakdown Modal
  breakdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  breakdownTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  breakdownBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  breakdownAmount: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '600',
  },
  breakdownDiscount: {
    color: '#dc2626',
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6,
  },
  breakdownGrandLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  breakdownGrandValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#dc2626',
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
    backgroundColor: '#dc2626',
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
    paddingBottom: Platform.OS === 'android' ? 36 : 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  completeButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  completeButtonText: {
    fontSize: 15,
    fontWeight: '700',
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
  // Summary Row — tappable card with visual affordance
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryRowActive: {
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    shadowColor: '#ef4444',
  },
  earnBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  earnBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#dc2626',
  },
  // Offers Modal
  offersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  offersCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
    overflow: 'hidden',
  },
  offersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  offersCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offersBody: {
    padding: 16,
  },
  offersFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#f8fafc',
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  offerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  offerCardSelected: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  offerCardPersonalized: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  offerCardPersonalizedSelected: {
    borderColor: '#d97706',
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#d97706',
  },
  offerCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerCheckboxActive: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  offerCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  offerCardDesc: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  offerCardSaves: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
  },
  // Loyalty in modal
  loyaltyCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  loyaltyInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#fde68a',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minWidth: 70,
  },
  loyaltyInput: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b45309',
    minWidth: 40,
    padding: 0,
  },
  loyaltyPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  loyaltyPillActive: {
    borderColor: '#f59e0b',
    backgroundColor: '#fef3c7',
  },
  loyaltyPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  loyaltyPillTextActive: {
    color: '#b45309',
  },
  loyaltyBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
  },
  loyaltyBarFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#f59e0b',
  },
  // Slider for loyalty redemption
  sliderContainer: {
    paddingVertical: 8,
  },
  sliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    position: 'relative',
    justifyContent: 'center',
  },
  sliderFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
    position: 'absolute',
    left: 0,
    top: 0,
  },
  sliderThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f59e0b',
    position: 'absolute',
    top: -7,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 2,
    borderColor: '#fff',
  },
  // Manual discount in modal
  discountToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  discountToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
  },
  discountToggleBtnActive: {
    backgroundColor: '#dc2626',
  },
  discountToggleTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  discountToggleTxtActive: {
    color: '#fff',
  },
  discountInput: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    fontSize: 13,
    color: '#1f2937',
  },
  discountClearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  notesInput: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    fontSize: 12,
    color: '#1f2937',
    minHeight: 50,
  },
  doneBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Name input (side by side with phone)
  nameInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  nameInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
});
