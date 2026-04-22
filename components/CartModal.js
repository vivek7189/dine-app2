import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
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
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';
import PricingRuleSelector from './billing/PricingRuleSelector';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import UpiQrModal from './UpiQrModal';

export default function CartModal({
  mode = 'owner',         // 'waiter' | 'cashier' | 'owner'
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  onCompleteBill,
  onSendToKitchen,        // waiter mode callback
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
  tableFromNavigation = false,
  onClearTable,
}) {
  const { fs } = useResponsive();
  const { effectivelyOffline } = useOffline();

  // Mode-based feature flags
  const isWaiterMode = mode === 'waiter';
  const isCashierMode = mode === 'cashier';
  const isOwnerMode = mode === 'owner';
  const showPayment = !isWaiterMode;
  const showBillingPanels = !isWaiterMode;
  const showOrderTypes = !isWaiterMode;
  const showPricingRules = !isWaiterMode;
  // When table came from tables page navigation, lock order type to dine-in and hide tabs
  const lockOrderTypeToDineIn = tableFromNavigation && (selectedTable?.name || hasTable);

  const [orderType, setOrderType] = useState(isCashierMode ? 'counter' : 'dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const [tableNumber, setTableNumber] = useState(selectedTable?.name || tableNumberProp || '');
  const [showTableInput, setShowTableInput] = useState(false);

  // Keyboard-aware bottom offset — lifts stickyBottom above keyboard
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

  // Force dine-in when table came from tables page navigation
  useEffect(() => {
    if (lockOrderTypeToDineIn && orderType !== 'dine-in') {
      setOrderType('dine-in');
      onOrderTypeChange?.('dine-in');
    }
  }, [lockOrderTypeToDineIn]);

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
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [sliderWidth, setSliderWidth] = useState(280);
  const [lookupKey, setLookupKey] = useState(0);

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
      setActiveAction(null);
      // Customer & offer state
      setCustomerData(null);
      setCustomerName('');
      setCustomerMobile('');
      setRedeemPoints(0);
      setManualDiscount('');
      setManualDiscountType('flat');
      setShowOffersModal(false);
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
  });

  // Loyalty max redeemable
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

  // Resolve free item display names from current cart (fallback to menuItemId).
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

  const handleSendToKitchenAction = () => {
    const discountData = {
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
      specialInstructions: specialInstructions.trim() || null,
    };
    onSendToKitchen(customerMobile, specialInstructions.trim() || null, discountData, tableNumber.trim());
  };

  const paymentIcons = { cash: 'cash-outline', upi: 'phone-portrait-outline', card: 'card-outline' };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItemCard}>
      <View style={styles.cartItemHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
          {item.isVeg !== undefined && (
            <View style={[styles.vegBadge, !item.isVeg && styles.nonVegBadge]}>
              <Text style={[styles.vegBadgeText, !item.isVeg && styles.nonVegBadgeText]}>{item.isVeg ? 'V' : 'N'}</Text>
            </View>
          )}
        </View>
      </View>
      {getItemSubline(item) ? (
        <Text style={styles.cartItemSubline} numberOfLines={1}>{getItemSubline(item)}</Text>
      ) : null}
      <View style={styles.cartItemFooter}>
        <View style={styles.cartItemPriceInfo}>
          <Text style={styles.cartItemSubtotalText}>₹{item.price} × {item.quantity}</Text>
          <Text style={styles.cartItemTotalPrice}>₹{(item.price * item.quantity).toFixed(0)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.qtyBtnMinus}
              onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
              disabled={sending}
            >
              <Ionicons name="remove" size={12} color="#ef4444" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtnPlus}
              onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
              disabled={sending}
            >
              <Ionicons name="add" size={12} color="#dc2626" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => onRemoveItem(item.id)}
            disabled={sending}
            style={styles.removeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={13} color="#ef4444" />
          </TouchableOpacity>
        </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tableFromNavigation ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, gap: 4 }}>
                  <Ionicons name={tableFromNavigation ? "lock-closed" : "restaurant-outline"} size={12} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{selectedTable?.name || tableNumberProp}</Text>
                  {!tableFromNavigation && onClearTable && (
                    <TouchableOpacity onPress={() => { setTableNumber(''); onClearTable(); }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                  )}
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
                <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? Colors.primary : '#fff'} />
              </TouchableOpacity>
            </View>
            {showOrderTypes && !lockOrderTypeToDineIn && (
              <View style={styles.orderTypeTabs}>
                {(isCashierMode
                  ? [
                      { key: 'counter', label: 'COUNTER', icon: 'storefront-outline' },
                      { key: 'takeaway', label: 'TAKEAWAY', icon: 'bag-handle-outline' },
                      { key: 'delivery', label: 'DELIVERY', icon: 'bicycle-outline' },
                    ]
                  : [
                      { key: 'dine-in', label: 'DINE IN', icon: 'restaurant-outline' },
                      { key: 'takeaway', label: 'TAKEAWAY', icon: 'bag-handle-outline' },
                      { key: 'delivery', label: 'DELIVERY', icon: 'bicycle-outline' },
                    ]
                ).map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.orderTypeTab, orderType === t.key && styles.orderTypeTabActive]}
                    onPress={() => { setOrderType(t.key); onOrderTypeChange?.(t.key); }}
                  >
                    <Ionicons name={t.icon} size={14} color={orderType === t.key ? Colors.primary : '#fff'} />
                    <Text style={[styles.orderTypeTabText, orderType === t.key && styles.orderTypeTabTextActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Zone/Pricing auto-select indicator */}
            {tableNumber.trim() && matchedFloor && (
              isWaiterMode ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, gap: 4 }}>
                  <Ionicons name="location-outline" size={11} color="#dc2626" />
                  <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>{matchedFloor.floorName}</Text>
                </View>
              ) : autoSelectedRule && activePricingRuleId ? (() => {
                const activeRule = pricingRules.find(r => r.id === activePricingRuleId);
                if (!activeRule) return null;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(220,38,38,0.15)', gap: 4 }}>
                    <Ionicons name="lock-closed" size={10} color="#f87171" />
                    <Text style={{ fontSize: 11, color: '#f87171', fontWeight: '600' }}>{activeRule.name}</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>·</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{matchedFloor.floorName}</Text>
                  </View>
                );
              })() : null
            )}
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onScrollBeginDrag={Keyboard.dismiss}>
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
            {showPricingRules && (
              <PricingRuleSelector
                pricingRules={pricingRules}
                activePricingRuleId={activePricingRuleId}
                setActivePricingRuleId={setActivePricingRuleId}
                autoSelectedRule={autoSelectedRule}
                multiPricingEnabled={multiPricingEnabled}
              />
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
              </View>
            ) : (
              <View style={styles.cartList}>
                {cart.map((item) => (
                  <View key={item.id}>
                    {renderCartItem({ item })}
                  </View>
                ))}
                {freeItemsForDisplay.length > 0 && freeItemsForDisplay.map((fi) => (
                  <View key={`free-${fi.id}`} style={[styles.cartItemCard, { borderColor: '#fde68a', backgroundColor: '#fffbeb', flexDirection: 'row', alignItems: 'center' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cartItemName} numberOfLines={1}>{fi.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626' }}>FREE</Text>
                        </View>
                        <Text style={{ fontSize: 10, color: '#9ca3af' }}>x{fi.quantity}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>₹0</Text>
                  </View>
                ))}
              </View>
            )}

            {cart.length > 0 && (
              <>
                {/* Billing Toolbar + Panels */}
                {showBillingPanels && <View style={styles.billingSection}>
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
                </View>}

                {/* Spacer for sticky bottom */}
                <View style={{ height: 4 }} />
              </>
            )}
          </ScrollView>

          {/* Fixed Bottom — payment, offers, buttons */}
          {cart.length > 0 && (
            <Animated.View style={[styles.stickyBottom, { paddingBottom: Math.max(insets.bottom, 10), bottom: keyboardOffset }]}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} bounces={false}>
              {/* Total Card — mode-specific */}
              {isCashierMode ? (
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
              ) : (
                <View style={styles.totalCard}>
                  <View style={styles.totalCardTop}>
                    <View>
                      <Text style={styles.totalCardTitle}>Total</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        <Text style={styles.totalCardLabel}>Sub: ₹{subtotal.toFixed(0)}</Text>
                        {billing.totalDiscount > 0 && <Text style={[styles.totalCardLabel, { color: '#fca5a5' }]}>Disc: -₹{billing.totalDiscount.toFixed(0)}</Text>}
                        {billing.totalTax > 0 && <Text style={styles.totalCardLabel}>Tax: ₹{billing.totalTax.toFixed(0)}</Text>}
                        {tipAmount > 0 && <Text style={styles.totalCardLabel}>Tip: ₹{tipAmount.toFixed(0)}</Text>}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.totalCardGrand}>₹{billing.grandTotal.toFixed(0)}</Text>
                      {billing.totalDiscount > 0 && (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#fca5a5', marginTop: 1 }}>You save ₹{billing.totalDiscount.toFixed(0)}</Text>
                      )}
                      {billing.totalDiscount === 0 && effectiveLoyaltySettings?.enabled && billing.loyaltyPointsToEarn > 0 && (
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#fde68a', marginTop: 1 }}>+{billing.loyaltyPointsToEarn} pts</Text>
                      )}
                    </View>
                  </View>
                </View>
              )}

              {/* Offers Badge — right below total */}
              <TouchableOpacity style={styles.offersInlineBadge} onPress={() => setShowOffersModal(true)} activeOpacity={0.7}>
                <Ionicons name="pricetag" size={11} color="#dc2626" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#dc2626', flex: 1 }}>
                  Offers & Rewards {(selectedOfferIds.length > 0 || selectedOfferId) ? `(${selectedOfferIds.length || 1} applied)` : ''}
                </Text>
                <Ionicons name="chevron-forward" size={14} color="#a5b4fc" />
              </TouchableOpacity>

              {/* Customer Phone + Name — side by side */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <View style={{ flex: 2 }}>
                  <CustomerLookup
                    key={`inline-${lookupKey}`}
                    restaurantId={restaurantId}
                    onPhoneChange={(phone) => setCustomerMobile(phone)}
                    onCustomerFound={(cust, settings) => {
                      setCustomerData(cust);
                      if (cust) setCustomerName(cust.name || '');
                      if (settings) setLoyaltySettings(settings);
                    }}
                    onCustomerNameChange={(name) => setCustomerName(name)}
                    compact
                    coolStyle
                    hideExtras
                  />
                </View>
                <View style={styles.cartNameInputWrap}>
                  <Ionicons name="person-outline" size={14} color={customerName ? '#dc2626' : '#9ca3af'} />
                  <TextInput
                    style={styles.cartNameInput}
                    placeholder="Name"
                    placeholderTextColor="#9ca3af"
                    value={customerName}
                    onChangeText={setCustomerName}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                </View>
              </View>

              {/* Customer Info Bar */}
              {customerData && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setShowOffersModal(true)} style={styles.customerInfoBar}>
                  <View style={styles.customerInfoAvatar}>
                    <Ionicons name="person" size={10} color="#15803d" />
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#15803d', flex: 1 }} numberOfLines={1}>{customerData.name}</Text>
                  <Text style={styles.customerInfoDivider}>·</Text>
                  <Text style={styles.customerInfoPoints}>{customerData.loyaltyPoints || 0} pts</Text>
                  <Text style={styles.customerInfoDivider}>·</Text>
                  <Text style={styles.customerInfoOrders}>{customerData.totalOrders || 0} orders</Text>
                  <Ionicons name="chevron-forward" size={12} color="#16a34a" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}

              {/* Payment Method — hidden in waiter mode */}
              {showPayment && (
                <View style={{ marginBottom: 8, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <Ionicons name="card-outline" size={12} color="#1f2937" />
                    <Text style={styles.paymentSectionLabel}>Payment Method</Text>
                  </View>
                  {splitPayments.length === 0 && (
                    <View style={styles.paymentBtnGroup}>
                      {(['cash', 'upi', 'card'].filter(m => !effectivelyOffline || m === 'cash')).map((method) => (
                        <TouchableOpacity
                          key={method}
                          style={[styles.paymentBtn, paymentMethod === method && styles.paymentBtnActive]}
                          onPress={() => setPaymentMethod(method)}
                        >
                          <Ionicons name={paymentIcons[method]} size={13} color={paymentMethod === method ? '#fff' : '#6b7280'} />
                          <Text style={[styles.paymentBtnText, paymentMethod === method && styles.paymentBtnTextActive]}>
                            {method.charAt(0).toUpperCase() + method.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {effectivelyOffline && (
                    <Text style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>UPI/Card unavailable offline</Text>
                  )}
                </View>
              )}

              {/* Action Buttons — mode-specific */}
              <View style={styles.actionBtnRow}>
                {isWaiterMode ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.sendToKitchenBtn, sending && { opacity: 0.6 }]}
                    onPress={handleSendToKitchenAction}
                    disabled={sending}
                    activeOpacity={0.85}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="restaurant" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Send to Kitchen</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : isCashierMode ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.completeBillBtn, { flex: 1 }, sending && { opacity: 0.6 }]}
                    onPress={handlePlaceOrder}
                    disabled={sending}
                    activeOpacity={0.85}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Complete Billing</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.placeOrderBtn, sending && { opacity: 0.6 }]}
                      onPress={handlePlaceOrder}
                      disabled={sending}
                      activeOpacity={0.85}
                    >
                      {sending && activeAction === 'place' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name={isUpdateOrder ? "refresh" : "paper-plane"} size={14} color="#fff" />
                          <Text style={styles.actionBtnText}>{isUpdateOrder ? 'Update' : 'Place Order'}</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {onCompleteBill && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.completeBillBtn, sending && { opacity: 0.6 }]}
                        onPress={handleCompleteBill}
                        disabled={sending}
                        activeOpacity={0.85}
                      >
                        {sending && activeAction === 'complete' ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={styles.actionBtnText}>Complete Bill</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </ScrollView>
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
              <TouchableOpacity onPress={() => setShowOffersModal(false)} style={styles.offersCloseBtn}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <ScrollView style={styles.offersBody} showsVerticalScrollIndicator={false}>
              {/* CUSTOMER LOOKUP in modal */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.modalSectionLabel}>Customer</Text>
                <CustomerLookup
                  key={`modal-${lookupKey}`}
                  restaurantId={restaurantId}
                  onPhoneChange={(phone) => setCustomerMobile(phone)}
                  onCustomerFound={(cust, settings) => {
                    setCustomerData(cust);
                    if (cust) setCustomerName(cust.name || '');
                    if (settings) setLoyaltySettings(settings);
                  }}
                  onCustomerNameChange={(name) => setCustomerName(name)}
                  webDesign
                />
              </View>
              {/* CUSTOMER INFO Section */}
              {customerData && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.modalSectionLabel}>Customer</Text>
                  <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="person" size={16} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>{customerData.name}</Text>
                        <Text style={{ fontSize: 11, color: '#64748b' }}>{customerData.phone || customerMobile}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>{customerData.totalOrders || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Orders</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#d97706' }}>{customerData.loyaltyPoints || 0}</Text>
                        <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '500' }}>Points</Text>
                      </View>
                      <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#dc2626' }}>₹{(customerData.totalSpent || 0).toFixed(0)}</Text>
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.offerCardName, isSelected && { color: '#991b1b' }]}>{offer.name}</Text>
                            {isSelected && autoApplied && (
                              <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#dc2626' }}>Auto</Text>
                              </View>
                            )}
                          </View>
                          {offer.description ? <Text style={styles.offerCardDesc} numberOfLines={1}>{offer.description}</Text> : null}
                        </View>
                        {saves > 0 && (
                          <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>-₹{saves.toFixed(0)}</Text>
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
                                  <View style={{ backgroundColor: matchedGroup.color || '#dc2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{matchedGroup.name}</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            {saves > 0 && (
                              <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>-₹{saves.toFixed(0)}</Text>
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
                {manualDiscountAmount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Manual Discount</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>-₹{manualDiscountAmount.toFixed(0)}</Text>
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

      {/* Bill Breakdown Modal — cashier mode */}
      {isCashierMode && (
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
      )}

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
    paddingBottom: 300,
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
  // Cart Items — card style matching web
  cartList: {
    paddingHorizontal: 12,
    paddingTop: 6,
    gap: 6,
  },
  cartItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cartItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cartItemName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },
  cartItemSubline: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
  },
  vegBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#fee2e2',
  },
  vegBadgeText: {
    fontSize: 6,
    fontWeight: '700',
    color: '#991b1b',
  },
  nonVegBadge: {
    backgroundColor: '#fee2e2',
  },
  nonVegBadgeText: {
    color: '#dc2626',
  },
  removeBtn: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: 'transparent',
  },
  cartItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cartItemPriceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartItemSubtotalText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  cartItemTotalPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  qtyBtnMinus: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  qtyBtnPlus: {
    width: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  qtyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1f2937',
    minWidth: 28,
    textAlign: 'center',
    backgroundColor: '#f9fafb',
  },
  // Sections
  billingSection: {
    paddingHorizontal: 12,
    marginTop: 4,
  },
  // Total Card — red gradient
  totalCard: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  totalCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  totalCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  totalCardGrand: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  totalCardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  totalCardLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  // Savings Banner
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  savingsBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dc2626',
  },
  earnPtsBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  earnPtsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  earnOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  // Customer Section
  customerSection: {
    marginTop: 4,
  },
  customerInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  customerInfoAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  customerInfoPoints: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803d',
    marginLeft: 4,
  },
  customerInfoDivider: {
    fontSize: 12,
    color: '#86efac',
    marginHorizontal: 6,
  },
  customerInfoOrders: {
    fontSize: 12,
    color: '#166534',
  },
  // Payment Section
  paymentSection: {
    paddingHorizontal: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  paymentSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1f2937',
  },
  paymentBtnGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  paymentBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  paymentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  paymentBtnTextActive: {
    color: '#fff',
  },
  // Offers inline badge
  offersInlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  // Sticky bottom — payment + buttons
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '65%',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'android' ? 24 : 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  billingBreakdown: {
    marginBottom: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 12,
  },
  placeOrderBtn: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  completeBillBtn: {
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    backgroundColor: '#fef2f2',
    gap: 8,
    shadowColor: '#ef4444',
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
  cartNameInputWrap: {
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
  cartNameInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  // Send to Kitchen button (waiter mode)
  sendToKitchenBtn: {
    backgroundColor: '#16a34a',
    flex: 1,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  // Compact Total Strip (cashier mode)
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
  // Breakdown Modal (cashier mode)
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
});
