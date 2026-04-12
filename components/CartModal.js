import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Keyboard,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import CustomerDetailModal from './CustomerDetailModal';
import useBillingCalculation from '../hooks/useBillingCalculation';
import useOfferEngine from '../hooks/useOfferEngine';
import { calculateOfferResult } from '../services/offerEngine';
import BillingSummaryBar from './billing/BillingSummaryBar';
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';
import PricingRuleSelector from './billing/PricingRuleSelector';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import UpiQrModal from './UpiQrModal';

export default function CartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  onCompleteBill,
  total,
  tableNumber: tableNumberProp,
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
  isUpdateOrder = false,
  floors = [],
  onTableSelect,
  selectedTable,
  upiSettings = {},
  restaurantName = '',
}) {
  const { fs } = useResponsive();
  const { effectivelyOffline } = useOffline();
  const [orderType, setOrderType] = useState('dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const [tableNumber, setTableNumber] = useState(selectedTable?.name || tableNumberProp || '');
  const [showTableInput, setShowTableInput] = useState(false);

  // Keyboard-aware bottom offset for iOS
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e) => {
      Animated.timing(keyboardOffset, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration || 250 : 200,
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e) => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 200,
        useNativeDriver: false,
      }).start();
    };
    const sub1 = Keyboard.addListener(showEvent, onShow);
    const sub2 = Keyboard.addListener(hideEvent, onHide);
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  // Sync table number if selectedTable prop changes
  useEffect(() => {
    if (selectedTable?.name) {
      if (selectedTable.name !== tableNumber) setTableNumber(selectedTable.name);
    } else if (!tableNumberProp) {
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

  // When table number changes, notify parent for pricing rule auto-selection
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

  // Discount / Loyalty state
  const [customerData, setCustomerData] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');
  const [showOffersModal, setShowOffersModal] = useState(false);

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

  // Build customer context for extended offer engine (audience targeting).
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
    calculateDiscountForOffer,
    resetOffers,
  } = useOfferEngine({
    restaurantId,
    cart,
    subtotal,
    customerContext,
    options: { autoApply: true },
  });

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
  });

  // Loyalty max redeemable
  const loyaltyMaxRedeemable = useMemo(() => {
    if (!customerData?.loyaltyPoints || !loyaltySettings) return 0;
    const redemptionRate = loyaltySettings.redemptionRate || 10;
    const maxPct = loyaltySettings.maxRedemptionPercent || 20;
    const afterOtherDisc = Math.max(0, subtotal - offerDiscount - manualDiscountAmount);
    const maxDiscByPct = (afterOtherDisc * maxPct) / 100;
    const maxPointsByPct = Math.floor(maxDiscByPct * redemptionRate);
    return Math.min(customerData.loyaltyPoints, maxPointsByPct);
  }, [customerData, loyaltySettings, subtotal, offerDiscount, manualDiscountAmount]);

  // Loyalty points to earn
  const loyaltyPointsToEarn = useMemo(() => {
    if (!loyaltySettings?.enabled) return 0;
    const earnPerAmount = loyaltySettings.earnPerAmount || 100;
    const pointsRate = loyaltySettings.pointsEarned || 4;
    const discTotal = offerDiscount + manualDiscountAmount;
    if (redeemPoints > 0 && !loyaltySettings.earnPointsOnRedemption) return 0;
    const base = loyaltySettings.earnOnFullAmount ? subtotal : Math.max(0, subtotal - discTotal - loyaltyDiscount);
    return Math.floor(base / earnPerAmount) * pointsRate;
  }, [loyaltySettings, subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, redeemPoints]);

  // Resolve free item display names from current cart (fallback to menuItemId).
  const freeItemsForDisplay = useMemo(() => {
    return (freeItems || []).map(fi => {
      const id = fi.itemId || fi.menuItemId || fi.id;
      const match = cart.find(c => (c.menuItemId || c.id) === id);
      return {
        id,
        name: fi.name || match?.name || `Item ${id}`,
        quantity: fi.quantity || 1,
      };
    });
  }, [freeItems, cart]);

  const insets = useSafeAreaInsets();
  const [activeAction, setActiveAction] = useState(null); // 'place' | 'complete'
  const [showUpiQr, setShowUpiQr] = useState(false);

  const upiConfigured = upiSettings?.upiEnabled && upiSettings?.upiId;

  const handlePlaceOrder = () => {
    setActiveAction('place');
    if (paymentMethod === 'upi' && upiConfigured) {
      setShowUpiQr(true);
      return;
    }
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
  };

  const handleCompleteBill = () => {
    if (onCompleteBill) {
      setActiveAction('complete');
      if (paymentMethod === 'upi' && upiConfigured) {
        setShowUpiQr(true);
        return;
      }
      onCompleteBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
    }
  };

  const handleUpiConfirm = () => {
    setShowUpiQr(false);
    if (activeAction === 'complete' && onCompleteBill) {
      onCompleteBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
    } else {
      onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
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
                </View>
              </View>

              {/* Table Number — inline input or chip */}
              {(selectedTable?.name || (hasTable && tableNumberProp)) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6 }}>
                  <Ionicons name="restaurant-outline" size={13} color="#34d399" />
                  <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{selectedTable?.name || tableNumberProp}</Text>
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
                      <Ionicons name="checkmark-circle" size={14} color="#34d399" />
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

            {/* Zone/Pricing auto-select indicator */}
            {tableNumber.trim() && matchedFloor && autoSelectedRule && activePricingRuleId && (() => {
              const activeRule = pricingRules.find(r => r.id === activePricingRuleId);
              if (!activeRule) return null;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(16,185,129,0.15)', gap: 4 }}>
                  <Ionicons name="lock-closed" size={10} color="#34d399" />
                  <Text style={{ fontSize: 11, color: '#34d399', fontWeight: '600' }}>{activeRule.name}</Text>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>·</Text>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{matchedFloor.floorName}</Text>
                </View>
              );
            })()}
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
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
                ListFooterComponent={freeItemsForDisplay.length > 0 ? (
                  <View>
                    {freeItemsForDisplay.map((fi) => (
                      <View key={`free-${fi.id}`} style={styles.cartItem}>
                        <View style={styles.cartItemLeft}>
                          <Text style={styles.cartItemName} numberOfLines={1}>{fi.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#16a34a' }}>FREE</Text>
                            </View>
                            <Text style={{ fontSize: 10, color: '#9ca3af' }}>x{fi.quantity}</Text>
                          </View>
                        </View>
                        <View style={styles.cartItemRight}>
                          <Text style={[styles.cartItemPrice, { color: '#16a34a' }]}>₹0</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              />
            )}

            {cart.length > 0 && (
              <>
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

                {/* Spacer for sticky bottom */}
                <View style={{ height: 16 }} />
              </>
            )}
          </ScrollView>

          {/* Fixed Bottom Section — customer + offers inline, total, payment, actions */}
          {cart.length > 0 && (
            <Animated.View style={[styles.stickyBottom, { paddingBottom: Math.max(insets.bottom, 10), bottom: keyboardOffset }]}>
              {/* Customer Phone + Offers — side by side, offers badge stretches to match */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingTop: 4, paddingBottom: 4, gap: 6 }}>
                {/* Phone + Customer info (flex) */}
                {restaurantId && (
                  <View style={{ flex: 1 }}>
                    <CustomerLookup
                      restaurantId={restaurantId}
                      countryCode={countryCode}
                      subtotal={subtotal}
                      onCustomerFound={(customer, settings) => {
                        setCustomerData(customer);
                        setLoyaltySettings(settings);
                        if (customer?.name) setCustomerName(customer.name);
                        if (customer?.phone) setCustomerMobile(customer.phone);
                        setRedeemPoints(0);
                      }}
                      onPhoneChange={(phone) => setCustomerMobile(phone)}
                      onRedeemChange={(pts) => setRedeemPoints(pts)}
                      onCustomerChipPress={(customer) => {
                        setDetailCustomerId(customer?.id || customer?._id);
                        setShowCustomerDetail(true);
                      }}
                      redeemPoints={redeemPoints}
                      hideLoyalty
                      compact
                      coolStyle
                    />
                  </View>
                )}

                {/* Offers badge — stretches to match phone+customer height */}
                {(() => {
                  const hasOffers = genericOffers.length > 0 || personalizedOffers.length > 0;
                  const hasLoyalty = loyaltySettings?.enabled && customerData;
                  const hasAnything = hasOffers || hasLoyalty || billing.totalDiscount > 0 || specialInstructions;
                  if (!hasAnything) return null;

                  const activeOfferCount = (offerSettings?.allowMultipleOffers ? selectedOfferIds : (selectedOfferId ? [selectedOfferId] : [])).length;
                  const hasApplied = activeOfferCount > 0 || loyaltyDiscount > 0 || manualDiscountAmount > 0;

                  return (
                    <TouchableOpacity
                      style={{
                        justifyContent: 'center', alignItems: 'center', alignSelf: 'stretch',
                        gap: 2, backgroundColor: hasApplied ? '#f0fdf4' : '#f8fafc',
                        borderRadius: 10, paddingHorizontal: 10, minWidth: 52,
                        borderWidth: 1, borderColor: hasApplied ? '#bbf7d0' : '#e5e7eb',
                      }}
                      onPress={() => setShowOffersModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pricetag" size={14} color={hasApplied ? '#16a34a' : '#6b7280'} />
                      {hasApplied ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>
                          -₹{billing.totalDiscount.toFixed(0)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#6b7280' }}>
                          {applicableOffers.length}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={10} color={hasApplied ? '#86efac' : '#d1d5db'} />
                    </TouchableOpacity>
                  );
                })()}
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
              {/* Payment pills row — hidden when split payment active */}
              {splitPayments.length === 0 && (
                <View style={styles.paymentRow}>
                  <Ionicons name="wallet-outline" size={14} color="#6b7280" />
                  <Text style={styles.paymentLabel}>Pay</Text>
                  {(['cash', 'upi', 'card'].filter(m => !effectivelyOffline || m === 'cash')).map((method) => (
                    <TouchableOpacity
                      key={method}
                      style={[styles.paymentPill, paymentMethod === method && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod(method)}
                    >
                      <Ionicons name={paymentIcons[method]} size={13} color={paymentMethod === method ? '#fff' : '#6b7280'} />
                      <Text style={[styles.paymentPillText, paymentMethod === method && styles.paymentPillTextActive]}>
                        {method.charAt(0).toUpperCase() + method.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {effectivelyOffline && (
                <Text style={{ fontSize: 10, color: '#f59e0b', marginLeft: 12, marginBottom: 4 }}>
                  UPI/Card unavailable offline
                </Text>
              )}

              <View style={styles.dualButtonRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.kitchenBtn, sending && { opacity: 0.6 }]}
                  onPress={handlePlaceOrder}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  {sending && activeAction === 'place' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={isUpdateOrder ? "refresh" : "paper-plane"} size={17} color="#fff" />
                      <Text style={styles.actionBtnText}>{isUpdateOrder ? 'Update Order' : 'Place Order'}</Text>
                    </>
                  )}
                </TouchableOpacity>
                {onCompleteBill && (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.billBtn, sending && { opacity: 0.6 }]}
                    onPress={handleCompleteBill}
                    disabled={sending}
                    activeOpacity={0.85}
                  >
                    {sending && activeAction === 'complete' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={17} color="#fff" />
                        <Text style={styles.actionBtnText}>Complete Bill</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          )}
      </View>
      {/* Offers & Rewards Modal */}
      <Modal
        visible={showOffersModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowOffersModal(false)}
      >
        <View style={styles.offersOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowOffersModal(false)} />
          <View style={styles.offersCard}>
            {/* Header */}
            <View style={styles.offersHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#0d9488', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="pricetag" size={14} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>Order Details</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>{cart.length} items · ₹{subtotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowOffersModal(false)} style={styles.offersCloseBtn}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView style={styles.offersBody} showsVerticalScrollIndicator={false}>
              {/* CUSTOMER INFO Section */}
              {customerData && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Customer</Text>
                  <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#a5f3fc' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#06b6d4', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="person" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0e7490' }}>{customerData.name}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>{customerData.phone || customerMobile}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#e0f2fe' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#0e7490' }}>{customerData.totalOrders || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Orders</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#e0f2fe' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#d97706' }}>{customerData.loyaltyPoints || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Points</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#e0f2fe' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#16a34a' }}>₹{(customerData.totalSpent || 0).toFixed(0)}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Spent</Text>
                      </View>
                    </View>
                  </View>
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
                          <Text style={[styles.offerCardName, isSelected && { color: '#166534' }]}>{offer.name}</Text>
                          {offer.description ? <Text style={styles.offerCardDesc} numberOfLines={1}>{offer.description}</Text> : null}
                        </View>
                        {saves > 0 && (
                          <Text style={[styles.offerCardSaves, isSelected && { color: '#16a34a' }]}>-₹{saves.toFixed(0)}</Text>
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
                                {offer.description ? <Text style={[styles.offerCardDesc, { color: '#d97706' }]} numberOfLines={1}>{offer.description}</Text> : null}
                                {matchedGroup && (
                                  <View style={{ backgroundColor: matchedGroup.color || '#0d9488', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{matchedGroup.name}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {saves > 0 && (
                              <Text style={[styles.offerCardSaves, isSelected && { color: '#16a34a' }]}>-₹{saves.toFixed(0)}</Text>
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
                  <ActivityIndicator size="small" color="#0d9488" />
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>Loading offers...</Text>
                </View>
              )}

              {/* LOYALTY POINTS Section */}
              {loyaltySettings?.enabled && customerData && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Loyalty Points</Text>
                  <View style={styles.loyaltyCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#b45309' }}>
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
                        {/* Slider bar — tappable to set redemption */}
                        <TouchableOpacity
                          activeOpacity={1}
                          onPress={(e) => {
                            const { locationX } = e.nativeEvent;
                            const barWidth = e.nativeEvent.target ? 280 : 280;
                            const fraction = Math.max(0, Math.min(1, locationX / barWidth));
                            const pts = Math.round(loyaltyMaxRedeemable * fraction);
                            setRedeemPoints(pts);
                          }}
                          style={styles.sliderContainer}
                        >
                          <View style={styles.sliderTrack}>
                            <View style={[styles.sliderFill, { width: `${Math.min(100, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }]} />
                            <View style={[styles.sliderThumb, { left: `${Math.min(96, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }]} />
                          </View>
                        </TouchableOpacity>

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
                                <Text style={[styles.loyaltyPillText, isActive && styles.loyaltyPillTextActive]}>{opt.label}</Text>
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
                            Max: {loyaltyMaxRedeemable} pts ({loyaltySettings.maxRedemptionPercent || 20}%)
                          </Text>
                        </View>
                      </>
                    ) : (customerData.loyaltyPoints || 0) > 0 ? (
                      <Text style={{ fontSize: 11, color: '#92400e' }}>
                        Cannot redeem on current order (max {loyaltySettings.maxRedemptionPercent || 20}% of bill)
                      </Text>
                    ) : null}
                  </View>
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
                    <Text style={{ fontSize: 12, color: '#16a34a' }}>Offers</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16a34a' }}>-₹{offerDiscount.toFixed(0)}</Text>
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
                style={[styles.doneBtn, billing.totalDiscount > 0 && { backgroundColor: '#10b981' }]}
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

      <CustomerDetailModal
        visible={showCustomerDetail}
        customerId={detailCustomerId}
        restaurantId={restaurantId}
        onClose={() => setShowCustomerDetail(false)}
      />
      <UpiQrModal
        visible={showUpiQr}
        onClose={() => { setShowUpiQr(false); setActiveAction(null); }}
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
    paddingTop: 6,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
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
    marginTop: 4,
  },
  billingSection: {
    paddingHorizontal: 12,
    marginTop: 4,
  },
  savingsText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#10b981',
    marginTop: 3,
    marginBottom: 2,
  },
  // Payment
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  paymentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    marginRight: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  paymentPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  paymentPillText: {
    fontSize: 12,
    fontWeight: '700',
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
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'android' ? 24 : 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 12,
  },
  dualButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  kitchenBtn: {
    backgroundColor: '#f97316',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  billBtn: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
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
  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
    gap: 8,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryRowActive: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
    shadowColor: '#22c55e',
  },
  earnBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  earnBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#16a34a',
  },
  // Offers Modal
  offersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  offersCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  offersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#f8fafc',
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
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
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
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
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
    backgroundColor: '#0d9488',
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
    backgroundColor: '#0d9488',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
