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
  KeyboardAvoidingView,
  Animated,
  Alert,
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
import { getCurrencySymbol } from '../utils/formatCurrency';
import DiscountApprovalModal from './DiscountApprovalModal';
import UpiQrModal from './UpiQrModal';
import apiClient from '../services/api';

// Channel pricing rules (dine-in/takeaway/delivery) are auto-applied by order type,
// so they must NOT appear as selectable zone pills in the dine-in zone picker —
// only true zones (AC Dining, Non-AC Dining, custom halls, etc.) are user-selectable.
const CHANNEL_RULE_NAMES = ['dine-in', 'dine in', 'dinein', 'takeaway', 'take away', 'take-away', 'delivery'];

// Icons for order types. Custom channels (e.g. "snoonu") fall back to a generic tag icon.
const ORDER_TYPE_ICONS = {
  'dine-in': 'restaurant-outline',
  'dine_in': 'restaurant-outline',
  counter: 'storefront-outline',
  takeaway: 'bag-handle-outline',
  delivery: 'bicycle-outline',
};
const orderTypeIcon = (id) => ORDER_TYPE_ICONS[id] || 'pricetag-outline';
// Order types that keep base pricing + no zone picker (channels & custom aggregators).
const isDineInLike = (id) => id === 'dine-in' || id === 'dine_in' || id === 'counter';

export default function CartModal({
  mode = 'owner',         // 'waiter' | 'cashier' | 'owner'
  userRole = '',          // actual user role string (e.g. 'owner', 'manager', 'waiter', 'cashier')
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  onCompleteBill,
  onKotAndBill,           // one-click KOT+Bill (flag-gated; undefined when off)
  onSendToKitchen,        // waiter mode callback
  total,
  tableNumber: tableNumberProp,
  restaurantId,
  sending,
  countryCode = 'IN',
  defaultTaxName = 'Tax',
  onOrderTypeChange,
  hasTable = false,
  multiPricingEnabled = false,
  activePricingRuleName,
  billingSettings = {},
  taxSettings = {},
  categories = [],
  pricingRules = [],
  activePricingRuleId,
  setActivePricingRuleId,
  autoSelectedRule = false,
  isUpdateOrder = false,
  existingOrderItems = [],
  floors = [],
  onTableSelect,
  selectedTable,
  upiSettings = {},
  restaurantName = '',
  tableFromNavigation = false,
  onClearTable,
  onEditItemPrice,
  onAddCustomItem,
  posSettings = {},
  deliveryStaff = [],
}) {
  const { fs, sp, r, isTablet } = useResponsive();
  const { effectivelyOffline } = useOffline();

  // Format amount: 2 decimals when round-off disabled, 0 decimals when enabled
  const fmtAmt = (v) => billingSettings.roundOffEnabled ? Math.round(v).toString() : Number(v).toFixed(2);

  // Equal split of `total` into `n` shares; last share absorbs rounding remainder.
  const computeSplitGuests = (total, n) => {
    const round2 = (x) => Math.round(x * 100) / 100;
    const base = Math.floor((total / n) * 100) / 100;
    const guests = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? round2(total - acc) : base;
      acc = round2(acc + amt);
      guests.push({ name: `Guest ${i + 1}`, amount: amt });
    }
    return guests;
  };

  const splitItemKey = (it, idx) => it.cartId ?? `${it.id || it.menuItemId}-${idx}`;
  const splitLineTotal = (it) => (Number(it.price) || 0) * (it.quantity || 1);

  // By-item split: each cart line is assigned to a guest; each guest's share of the GRAND total
  // is scaled by their item subtotal so tax/SC/discount are distributed proportionally.
  const computeItemSplitGuests = (grand, n) => {
    const guests = Array.from({ length: n }).map((_, i) => ({ name: `Guest ${i + 1}`, amount: 0, _sub: 0, items: [] }));
    cart.forEach((it, idx) => {
      const gi = Math.min(n - 1, splitItemGuest[splitItemKey(it, idx)] ?? 0);
      guests[gi]._sub += splitLineTotal(it);
      guests[gi].items.push(it.name);
    });
    const itemsTotal = guests.reduce((s, g) => s + g._sub, 0) || 1;
    let acc = 0;
    guests.forEach((g, i) => {
      g.amount = i === n - 1 ? Math.round((grand - acc) * 100) / 100 : Math.round((g._sub / itemsTotal) * grand * 100) / 100;
      acc = Math.round((acc + g.amount) * 100) / 100;
      delete g._sub;
    });
    return guests;
  };

  // Split by Seat: auto-group items by their seat into one guest per seat.
  const applySplitBySeat = () => {
    const seats = [...new Set(cart.map((it) => it.seat).filter((s) => s != null))];
    if (seats.length < 2) return false;
    const assign = {};
    cart.forEach((it, idx) => { assign[splitItemKey(it, idx)] = Math.max(0, seats.indexOf(it.seat)); });
    setSplitItemGuest(assign);
    setSplitWays(seats.length);
    setSplitMode('item');
    return true;
  };

  // Mode-based feature flags
  const isWaiterMode = mode === 'waiter';
  const isCashierMode = mode === 'cashier';
  const isOwnerMode = mode === 'owner';
  const showPayment = !isWaiterMode;
  const showBillingPanels = !isWaiterMode;
  const showOrderTypes = !isWaiterMode;
  const showPricingRules = !isWaiterMode;

  // Role-based billing feature access (empty array = all roles allowed)
  const isRoleAllowed = (rolesArray) => {
    if (!rolesArray || rolesArray.length === 0) return true;
    const role = (userRole || mode || 'waiter').toLowerCase();
    return rolesArray.includes(role);
  };
  // Price-edit & custom-item capabilities (web parity): never in waiter mode,
  // require the POS master toggle (on unless explicitly disabled) AND the role.
  const canEditPrice = !isWaiterMode && !!onEditItemPrice
    && posSettings.allowPriceEdit !== false && isRoleAllowed(billingSettings.priceEditRoles);
  const canAddCustomItem = !isWaiterMode && !!onAddCustomItem
    && posSettings.allowCustomItems !== false && isRoleAllowed(billingSettings.customItemRoles);
  // Payment methods (web parity): from posSettings.paymentMethods, else default, gated by paymentMethodRoles.
  const paymentMethodOptions = (() => {
    let list;
    if (Array.isArray(posSettings.paymentMethods) && posSettings.paymentMethods.length > 0) {
      list = posSettings.paymentMethods
        .filter(m => m && (typeof m === 'string' || m.enabled !== false))
        .map(m => (typeof m === 'string' ? m : (m.id || m.value || m.name || m.method)))
        .filter(Boolean);
    } else {
      // Default set mirrors web: cash always; upi/card hidden via posSettings.hideUPI/hideCard.
      list = ['cash'];
      if (!posSettings.hideUPI) list.push('upi');
      if (!posSettings.hideCard) list.push('card');
    }
    if (!isRoleAllowed(billingSettings.paymentMethodRoles)) list = list.filter(m => String(m).toLowerCase() === 'cash');
    return list;
  })();
  // Dynamic order types — mirror web (posSettings.orderTypes: [{id,label,enabled,builtIn}]),
  // falling back to the three built-ins. Custom channels (e.g. "snoonu") appear automatically.
  const orderTypeOptions = useMemo(() => {
    const builtInDefaults = [
      { id: 'dine-in', label: 'Dine In', builtIn: true },
      { id: 'takeaway', label: 'Takeaway', builtIn: true },
      { id: 'delivery', label: 'Delivery', builtIn: true },
    ];
    let list = (Array.isArray(posSettings.orderTypes) && posSettings.orderTypes.length > 0)
      ? posSettings.orderTypes
      : builtInDefaults;
    list = list
      .filter(ot => ot && ot.enabled !== false)
      .map(ot => ({ id: ot.id, label: ot.label || ot.id, builtIn: ot.builtIn }));
    // Cashier mode uses an in-store "Counter" in place of Dine In (mobile-specific).
    if (isCashierMode) {
      list = list.map(ot => (ot.id === 'dine-in' ? { ...ot, id: 'counter', label: 'Counter' } : ot));
      if (!list.some(ot => ot.id === 'counter')) {
        list = [{ id: 'counter', label: 'Counter', builtIn: true }, ...list];
      }
    }
    return list;
  }, [posSettings.orderTypes, isCashierMode]);

  // When table came from tables page navigation, lock order type to dine-in and hide tabs
  const lockOrderTypeToDineIn = tableFromNavigation && (selectedTable?.name || hasTable);

  const [orderType, setOrderType] = useState(isCashierMode ? 'counter' : 'dine-in');
  // Price-edit + custom-item (web parity)
  const [priceEditItem, setPriceEditItem] = useState(null);
  const [priceEditValue, setPriceEditValue] = useState('');
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState('1');
  // Per-device service-charge override (Gap 5) + delivery-staff assignment (Gap 7)
  const [scWaived, setScWaived] = useState(false);
  const [scRateOverride, setScRateOverride] = useState('');
  const [selectedDeliveryStaff, setSelectedDeliveryStaff] = useState(null);
  // Split bill (Gap 1): divide the grand total among guests; per-guest receipts.
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitWays, setSplitWays] = useState(2);
  const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'amount' | 'item'
  const [splitItemGuest, setSplitItemGuest] = useState({}); // cartId → 0-based guest index (by-item mode)
  const [splitAmounts, setSplitAmounts] = useState([]); // strings, for 'amount' mode
  const [splitConfig, setSplitConfig] = useState(null); // { mode, guests:[{name, amount}] }
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const [tableNumber, setTableNumber] = useState(selectedTable?.name || tableNumberProp || '');
  const [showTableInput, setShowTableInput] = useState(false);
  const [covers, setCovers] = useState(1);

  // Keep the selected order type valid: if the current type isn't in the enabled list
  // (e.g. admin disabled Dine In), fall back to posSettings.defaultOrderType or the first
  // enabled type. Skipped when the type is locked to dine-in via table navigation.
  useEffect(() => {
    if (lockOrderTypeToDineIn || orderTypeOptions.length === 0) return;
    const ids = orderTypeOptions.map(o => o.id);
    if (!ids.includes(orderType)) {
      const def = posSettings.defaultOrderType;
      const next = (def && ids.includes(def)) ? def : orderTypeOptions[0].id;
      setOrderType(next);
      onOrderTypeChange?.(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTypeOptions, lockOrderTypeToDineIn]);

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

  // Discount approval state
  const [showDiscountApproval, setShowDiscountApproval] = useState(false);
  const [pendingOrderAction, setPendingOrderAction] = useState(null); // 'place' | 'complete' | 'kitchen'
  const [discountApprovalSettings, setDiscountApprovalSettings] = useState(null);
  const [discountApproved, setDiscountApproved] = useState(false);

  // Load discount approval settings once
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getRestaurant(restaurantId);
        const settings = res?.restaurant || res;
        if (!cancelled && settings?.discountApprovalSettings?.enabled) {
          setDiscountApprovalSettings(settings.discountApprovalSettings);
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  // Reset approval when discount changes
  useEffect(() => {
    setDiscountApproved(false);
  }, [manualDiscount, manualDiscountType]);

  // Check if current role needs discount approval
  const needsDiscountApproval = useCallback(() => {
    if (!discountApprovalSettings?.enabled) return false;
    if (manualDiscountAmount <= 0) return false;
    if (discountApproved) return false;
    const roleKey = mode === 'owner' ? null : mode === 'waiter' ? 'waiter' : mode === 'cashier' ? 'cashier' : 'staff';
    if (!roleKey) return false; // owners don't need approval
    const config = discountApprovalSettings.roleConfig?.[roleKey];
    if (!config?.requireApproval) return false;
    if (config.maxDiscountWithoutApproval > 0 && manualDiscountAmount <= config.maxDiscountWithoutApproval) return false;
    return true;
  }, [discountApprovalSettings, manualDiscountAmount, mode, discountApproved]);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [customerCoupons, setCustomerCoupons] = useState([]);

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
      setActiveAction(null); setCovers(1);
      // Customer & offer state
      setCustomerData(null);
      setCustomerName('');
      setCustomerMobile('');
      setRedeemPoints(0);
      setManualDiscount('');
      setManualDiscountType('flat');
      setShowOffersModal(false);
      resetOffers();
      setAppliedCoupon(null);
      setCouponCode('');
      setCouponError('');
      setCustomerCoupons([]);
      setLookupKey(k => k + 1);
    }
  }, [visible]);

  const subtotal = total;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Manual-discount config — web is the source of truth: it reads
  // taxSettings.discountSettings.* (enabled/allowManualDiscount/manualDiscountRoles/
  // maxDiscountPercent/maxDiscountAmount). Fall back to legacy billingSettings.* so
  // stores that only ever set the old keys keep working. Absent role list ⇒ all roles
  // allowed (preserves the app's permissive default; we don't force web's ['owner']).
  const discountConfig = (() => {
    const ds = taxSettings?.discountSettings || {};
    const hasDs = ds && Object.keys(ds).length > 0;
    const enabled = hasDs
      ? (ds.enabled !== false && ds.allowManualDiscount !== false)
      : (billingSettings.manualDiscountEnabled !== false);
    const roles = ds.manualDiscountRoles ?? billingSettings.manualDiscountRoles;
    const maxPct = Number(ds.maxDiscountPercent ?? billingSettings.maxDiscountPercent) || 0;
    const maxAmt = Number(ds.maxDiscountAmount ?? billingSettings.maxDiscountAmount) || 0;
    return { enabled, roles, maxPct, maxAmt };
  })();

  // Calculate manual discount amount, clamped to admin caps (web parity):
  // maxDiscountPercent (on percentage) + maxDiscountAmount (absolute).
  const manualDiscountAmount = (() => {
    let val = parseFloat(manualDiscount) || 0;
    const maxPct = discountConfig.maxPct;
    const maxAmt = discountConfig.maxAmt;
    let amt;
    if (manualDiscountType === 'percentage') {
      const pct = maxPct > 0 ? Math.min(val, maxPct) : val;
      amt = Math.round((subtotal * pct / 100) * 100) / 100;
    } else {
      amt = Math.min(val, subtotal);
    }
    if (maxAmt > 0) amt = Math.min(amt, maxAmt);
    return Math.max(0, amt);
  })();

  // Comp/void amounts — reported to the backend as audit metadata (compItems/voidItems).
  // Web parity: neither reduces the payable total here (web + backend charge full price and
  // track comp/void for reporting only). Kept for the payload + panel display.
  const compAmount = selectedCompItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const voidAmount = selectedVoidItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Coupon discount
  const couponDiscountAmount = appliedCoupon?.discountAmount || 0;
  const couponsEnabled = offerSettings?.couponsEnabled === true;

  const handleApplyCoupon = async (code) => {
    if (!code?.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await apiClient.validateCoupon(restaurantId, code.trim(), customerMobile || '', subtotal);
      if (res.valid) {
        if (!offerSettings?.allowCouponsWithOffers && offerDiscount > 0) {
          setCouponError('Remove offers to use a coupon');
          setCouponLoading(false);
          return;
        }
        setAppliedCoupon({ ...res.coupon, discountAmount: res.discountAmount });
        setCouponCode('');
        setCouponError('');
      } else {
        setCouponError(res.reason || 'Invalid coupon');
      }
    } catch (err) {
      setCouponError('Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
  };

  // Fetch customer coupons when phone is set
  useEffect(() => {
    if (!couponsEnabled || !customerMobile || !customerData) {
      setCustomerCoupons([]);
      return;
    }
    apiClient.getCustomerCoupons(restaurantId, customerMobile)
      .then(res => setCustomerCoupons(res.coupons || []))
      .catch(() => setCustomerCoupons([]));
  }, [couponsEnabled, customerMobile, customerData, restaurantId]);

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
    serviceChargeRate: effectiveBillingSettings.serviceChargeEnabled ? (billing.serviceChargeRate ?? effectiveBillingSettings.serviceChargeRate) : null,
    serviceChargeAmount: billing.serviceChargeAmount || null,
    serviceChargeLabel: billingSettings.serviceChargeLabel || 'Service Charge',
    deliveryStaffId: selectedDeliveryStaff?.id || null,
    deliveryStaffName: selectedDeliveryStaff?.name || null,
    splitBill: (splitConfig && Array.isArray(splitConfig.guests) && splitConfig.guests.length > 1) ? splitConfig : null,
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
    partialPayAmount: partialPayAmount !== '' && partialPayAmount != null ? parseFloat(partialPayAmount) : null,
    // Explicit payment status tracking (matches dine-frontend)
    ...(() => {
      const pp = partialPayAmount !== '' && partialPayAmount != null ? parseFloat(partialPayAmount) : null;
      const total = billing.grandTotal || 0;
      if (pp != null && pp === 0) {
        // Full due (khata)
        return { paymentStatus: 'due', paidAmount: 0, outstandingAmount: Math.round(total * 100) / 100 };
      } else if (pp != null && pp > 0 && pp < total) {
        // Partial payment
        return { paymentStatus: 'partial', paidAmount: Math.round(pp * 100) / 100, outstandingAmount: Math.round((total - pp) * 100) / 100 };
      }
      // Fully paid
      return { paymentStatus: 'paid', paidAmount: Math.round(total * 100) / 100, outstandingAmount: 0 };
    })(),
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
    couponDiscount: couponDiscountAmount > 0 ? couponDiscountAmount : null,
    couponCode: appliedCoupon?.code || null,
    couponId: appliedCoupon?.id || null,
    covers: (orderType === 'dine-in' || orderType === 'dine_in') ? covers : undefined,
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
    options: {},
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

  // Per-device SC override (Gap 5): waive SC for this bill and/or override the rate.
  // Falls back to admin billingSettings when not overridden.
  const scCanOverride = billingSettings.serviceChargeEnabled && isRoleAllowed(billingSettings.serviceChargeRoles);
  const effectiveBillingSettings = useMemo(() => {
    if (!scCanOverride) return billingSettings;
    const next = { ...billingSettings };
    if (scWaived) next.serviceChargeEnabled = false;
    else if (scRateOverride !== '' && Number(scRateOverride) >= 0) next.serviceChargeRate = Number(scRateOverride);
    return next;
  }, [billingSettings, scCanOverride, scWaived, scRateOverride]);

  // Use shared billing calculation hook — MUST be after useOfferEngine so offerDiscount is defined
  const billing = useBillingCalculation({
    subtotal,
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    couponDiscount: couponDiscountAmount,
    compAmount,
    voidAmount,
    taxSettings,
    billingSettings: effectiveBillingSettings,
    tipAmount,
    cart,
    categories,
    defaultTaxName,
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

  // Stock warnings for cart items
  const stockWarnings = useMemo(() => {
    const overStock = [];
    const lowStock = [];
    cart.forEach(item => {
      if (!item.isStockManaged || typeof item.stockQuantity !== 'number') return;
      if (item.quantity > item.stockQuantity) {
        overStock.push(item);
      } else if (item.stockQuantity <= (item.lowStockThreshold || 5)) {
        lowStock.push(item);
      }
    });
    return { overStock, lowStock };
  }, [cart]);

  const proceedPlaceOrder = () => {
    setActiveAction('place');
    if (paymentMethod === 'upi' && upiConfigured) {
      setShowUpiQr(true);
      return;
    }
    onPlaceOrder(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
  };

  const proceedCompleteBill = () => {
    if (onCompleteBill) {
      setActiveAction('complete');
      if (paymentMethod === 'upi' && upiConfigured) {
        setShowUpiQr(true);
        return;
      }
      onCompleteBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
    }
  };

  const handlePlaceOrder = () => {
    if (stockWarnings.overStock.length > 0) {
      Alert.alert('Stock Exceeded',
        stockWarnings.overStock.map(i => `"${i.name}": only ${i.stockQuantity} available, ${i.quantity} in cart`).join('\n'));
      return;
    }
    if (needsDiscountApproval()) {
      setPendingOrderAction('place');
      setShowDiscountApproval(true);
      return;
    }
    proceedPlaceOrder();
  };

  const handleCompleteBill = () => {
    if (stockWarnings.overStock.length > 0) {
      Alert.alert('Stock Exceeded',
        stockWarnings.overStock.map(i => `"${i.name}": only ${i.stockQuantity} available, ${i.quantity} in cart`).join('\n'));
      return;
    }
    if (needsDiscountApproval()) {
      setPendingOrderAction('complete');
      setShowDiscountApproval(true);
      return;
    }
    proceedCompleteBill();
  };

  // One-click KOT + Bill (unpaid). No UPI intercept — payment is settled later.
  const proceedKotAndBill = () => {
    if (!onKotAndBill) return;
    setActiveAction('kotbill');
    onKotAndBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData(), tableNumber.trim());
  };

  const handleKotAndBill = () => {
    if (stockWarnings.overStock.length > 0) {
      Alert.alert('Stock Exceeded',
        stockWarnings.overStock.map(i => `"${i.name}": only ${i.stockQuantity} available, ${i.quantity} in cart`).join('\n'));
      return;
    }
    if (needsDiscountApproval()) {
      setPendingOrderAction('kotbill');
      setShowDiscountApproval(true);
      return;
    }
    proceedKotAndBill();
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
    if (stockWarnings.overStock.length > 0) {
      Alert.alert('Stock Exceeded',
        stockWarnings.overStock.map(i => `"${i.name}": only ${i.stockQuantity} available, ${i.quantity} in cart`).join('\n'));
      return;
    }
    if (needsDiscountApproval()) {
      setPendingOrderAction('kitchen');
      setShowDiscountApproval(true);
      return;
    }
    proceedSendToKitchen();
  };

  const proceedSendToKitchen = () => {
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
      covers: (orderType === 'dine-in' || orderType === 'dine_in') ? covers : undefined,
    };
    onSendToKitchen(customerMobile, specialInstructions.trim() || null, discountData, tableNumber.trim());
  };

  const handleDiscountApproved = () => {
    setShowDiscountApproval(false);
    setDiscountApproved(true);
    // Resume the pending action
    if (pendingOrderAction === 'place') proceedPlaceOrder();
    else if (pendingOrderAction === 'complete') proceedCompleteBill();
    else if (pendingOrderAction === 'kotbill') proceedKotAndBill();
    else if (pendingOrderAction === 'kitchen') proceedSendToKitchen();
    setPendingOrderAction(null);
  };

  const paymentIcons = { cash: 'cash-outline', upi: 'phone-portrait-outline', card: 'card-outline' };

  const renderCartItem = ({ item }) => {
    const existingItem = isUpdateOrder && existingOrderItems?.length > 0
      ? existingOrderItems.find(e => (e.menuItemId || e.id) === (item.menuItemId || item.id))
      : null;
    const isNewItem = isUpdateOrder && existingOrderItems?.length > 0 && !existingItem;
    const quantityDelta = existingItem ? item.quantity - existingItem.quantity : 0;
    return (
    <View style={[styles.cartItemCard, isTablet && { paddingHorizontal: 16, paddingVertical: 12 }]}>
      <View style={styles.cartItemHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={[styles.cartItemName, { fontSize: fs(12) }]} numberOfLines={1}>{item.name}</Text>
          {isNewItem && (
            <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#16a34a' }}>NEW</Text>
            </View>
          )}
          {!isNewItem && quantityDelta > 0 && (
            <View style={{ backgroundColor: '#dbeafe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#2563eb' }}>+{quantityDelta} new</Text>
            </View>
          )}
          {item.isVeg !== undefined && (
            <View style={[styles.vegBadge, !item.isVeg && styles.nonVegBadge]}>
              <Text style={[styles.vegBadgeText, !item.isVeg && styles.nonVegBadgeText]}>{item.isVeg ? 'V' : 'N'}</Text>
            </View>
          )}
          {item.isStockManaged && typeof item.stockQuantity === 'number' && (
            <View style={{
              backgroundColor: item.quantity > item.stockQuantity ? '#fee2e2' : item.stockQuantity <= (item.lowStockThreshold || 5) ? '#fef3c7' : '#dcfce7',
              paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
            }}>
              <Text style={{
                fontSize: 9, fontWeight: '700',
                color: item.quantity > item.stockQuantity ? '#dc2626' : item.stockQuantity <= (item.lowStockThreshold || 5) ? '#92400e' : '#166534',
              }}>
                {item.stockQuantity === 0 ? 'OUT' : `${item.stockQuantity} left`}
              </Text>
            </View>
          )}
        </View>
      </View>
      {getItemSubline(item) ? (
        <Text style={styles.cartItemSubline} numberOfLines={1}>{getItemSubline(item)}</Text>
      ) : null}
      {item.selectedVariant?.name ? (
        <Text style={styles.cartItemSubline} numberOfLines={1}>{item.selectedVariant.name}</Text>
      ) : null}
      {Array.isArray(item.selectedCustomizations) && item.selectedCustomizations.length > 0 ? (
        <Text style={[styles.cartItemSubline, { color: '#6b7280' }]} numberOfLines={1}>
          + {item.selectedCustomizations.map(c => c.name).join(', ')}
        </Text>
      ) : null}
      <View style={styles.cartItemFooter}>
        <View style={styles.cartItemPriceInfo}>
          {canEditPrice && !item.soldByWeight ? (
            <TouchableOpacity
              onPress={() => { setPriceEditItem(item); setPriceEditValue(String(item.price ?? '')); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              activeOpacity={0.7}
            >
              <Text style={styles.cartItemSubtotalText}>{getCurrencySymbol()}{item.price} × {item.quantity}</Text>
              <Ionicons name="pencil" size={11} color="#2563eb" />
              {item.priceEdited && <Text style={{ fontSize: 9, fontWeight: '700', color: '#2563eb' }}>edited</Text>}
              {item.isCustomItem && <Text style={{ fontSize: 9, fontWeight: '700', color: '#7c3aed' }}>custom</Text>}
            </TouchableOpacity>
          ) : (
            <Text style={styles.cartItemSubtotalText}>
              {item.soldByWeight && item.itemWeight
                ? `${getCurrencySymbol()}${item.price}/${item.weightUnit || 'kg'} × ${item.itemWeight}${item.weightUnit || 'kg'}`
                : `${getCurrencySymbol()}${item.price} × ${item.quantity}`}
            </Text>
          )}
          <Text style={styles.cartItemTotalPrice}>{getCurrencySymbol()}{(item.price * item.quantity).toFixed(0)}</Text>
          {!isNewItem && quantityDelta > 0 && existingItem && (
            <Text style={{ fontSize: 9, color: '#2563eb', marginTop: 1 }}>
              was {existingItem.quantity}, +{quantityDelta} new added
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {item.soldByWeight && item.itemWeight ? (
            <View style={{ backgroundColor: '#f0fdf4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#bbf7d0' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>{item.itemWeight} {item.weightUnit || 'kg'}</Text>
            </View>
          ) : (
          <View style={styles.quantityControls}>
            <TouchableOpacity
              style={styles.qtyBtnMinus}
              onPress={() => onUpdateQuantity(item.cartId || item.id, item.quantity - 1)}
              disabled={sending}
            >
              <Ionicons name="remove" size={12} color="#ef4444" />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtnPlus}
              onPress={() => onUpdateQuantity(item.cartId || item.id, item.quantity + 1)}
              disabled={sending}
            >
              <Ionicons name="add" size={12} color="#dc2626" />
            </TouchableOpacity>
          </View>
          )}
          <TouchableOpacity
            onPress={() => onRemoveItem(item.cartId || item.id)}
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
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.modalContent, { paddingTop: insets.top }, isTablet && styles.tabletContent]}>
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
                {orderTypeOptions.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.orderTypeTab, orderType === t.id && styles.orderTypeTabActive]}
                    onPress={() => { setOrderType(t.id); onOrderTypeChange?.(t.id); }}
                  >
                    <Ionicons name={orderTypeIcon(t.id)} size={14} color={orderType === t.id ? Colors.primary : '#fff'} />
                    <Text
                      style={[styles.orderTypeTabText, orderType === t.id && styles.orderTypeTabTextActive]}
                      numberOfLines={1}
                    >
                      {(t.label || t.id).toUpperCase()}
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
            {(orderType === 'dine_in' || orderType === 'dine-in') && posSettings.showCovers !== false && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f8fafc', borderRadius: 8, marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '500' }}>Covers:</Text>
                <TouchableOpacity onPress={() => setCovers(c => Math.max(1, c - 1))} style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>{'\u2212'}</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#1f2937', minWidth: 20, textAlign: 'center' }}>{covers}</Text>
                <TouchableOpacity onPress={() => setCovers(c => c + 1)} style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151' }}>+</Text>
                </TouchableOpacity>
              </View>
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

            {/* Pricing Rule Selector — web parity:
                 · dine-in/counter → pick a zone (AC/Non-AC/hall); channel rules hidden
                 · takeaway/delivery → auto-locked, show a read-only badge instead of pills */}
            {showPricingRules && multiPricingEnabled && pricingRules.length > 0 && (
              (!isDineInLike(orderType)) ? (
                <View style={styles.autoPricingBar}>
                  <Ionicons name="lock-closed" size={12} color="#059669" />
                  <Text style={styles.autoPricingText}>
                    {(() => {
                      const r = pricingRules.find(pr => pr.id === activePricingRuleId);
                      return r ? `${r.name} pricing applied` : 'Standard pricing applied';
                    })()}
                  </Text>
                  <View style={styles.autoPricingBadge}>
                    <Text style={styles.autoPricingBadgeText}>AUTO</Text>
                  </View>
                </View>
              ) : (
                <PricingRuleSelector
                  pricingRules={pricingRules.filter(r => !CHANNEL_RULE_NAMES.includes((r.name || '').toLowerCase().trim()))}
                  activePricingRuleId={activePricingRuleId}
                  setActivePricingRuleId={setActivePricingRuleId}
                  autoSelectedRule={autoSelectedRule}
                  multiPricingEnabled={multiPricingEnabled}
                />
              )
            )}

            {/* Stock Warnings */}
            {stockWarnings.overStock.length > 0 && (
              <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                {stockWarnings.overStock.map((item, i) => (
                  <Text key={i} style={{ fontSize: 12, color: '#dc2626', fontWeight: '600' }}>
                    ⚠ {item.name}: only {item.stockQuantity} in stock, {item.quantity} in cart
                  </Text>
                ))}
              </View>
            )}
            {stockWarnings.lowStock.length > 0 && (
              <View style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                {stockWarnings.lowStock.map((item, i) => (
                  <Text key={i} style={{ fontSize: 12, color: '#92400e', fontWeight: '600' }}>
                    ⚠ {item.name}: only {item.stockQuantity} left
                  </Text>
                ))}
              </View>
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
                {canAddCustomItem && (
                  <TouchableOpacity
                    onPress={() => { setCustomItemName(''); setCustomItemPrice(''); setCustomItemQty('1'); setShowCustomItemModal(true); }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 4, borderWidth: 1, borderColor: '#c4b5fd', borderStyle: 'dashed', borderRadius: 10, backgroundColor: '#faf5ff' }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#7c3aed" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#7c3aed' }}>Add Custom Item</Text>
                  </TouchableOpacity>
                )}
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
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>{getCurrencySymbol()}0</Text>
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
                    isRoleAllowed={isRoleAllowed}
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
                  {/* Panels render in a bottom-sheet modal (see BillingActionSheet below)
                      so the cramped inline space no longer clips the controls. */}
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
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#fca5a5', marginTop: 1 }}>You save {getCurrencySymbol()}{fmtAmt(billing.totalDiscount)}</Text>
                      )}
                    </View>
                    <Text style={styles.compactTotalValue}>{getCurrencySymbol()}{fmtAmt(billing.grandTotal)}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breakdownChipsRow}>
                    <View style={styles.breakdownChip}>
                      <Text style={styles.breakdownChipText}>Sub {getCurrencySymbol()}{fmtAmt(subtotal)}</Text>
                    </View>
                    {billing.totalDiscount > 0 && (
                      <View style={[styles.breakdownChip, styles.breakdownChipGreen]}>
                        <Text style={[styles.breakdownChipText, styles.breakdownChipTextGreen]}>-{getCurrencySymbol()}{fmtAmt(billing.totalDiscount)}</Text>
                      </View>
                    )}
                    {billing.serviceChargeAmount > 0 && isRoleAllowed(billingSettings.serviceChargeRoles) && (
                      <View style={styles.breakdownChip}>
                        <Text style={styles.breakdownChipText}>SC {getCurrencySymbol()}{fmtAmt(billing.serviceChargeAmount)}</Text>
                      </View>
                    )}
                    {billing.totalTax > 0 && (
                      <View style={styles.breakdownChip}>
                        <Text style={styles.breakdownChipText}>Tax {getCurrencySymbol()}{fmtAmt(billing.totalTax)}</Text>
                      </View>
                    )}
                    {tipAmount > 0 && isRoleAllowed(billingSettings.tipsRoles) && (
                      <View style={styles.breakdownChip}>
                        <Text style={styles.breakdownChipText}>Tip {getCurrencySymbol()}{fmtAmt(tipAmount)}</Text>
                      </View>
                    )}
                    {billing.roundOffAmount !== 0 && isRoleAllowed(billingSettings.roundOffRoles) && (
                      <View style={styles.breakdownChip}>
                        <Text style={styles.breakdownChipText}>Round {billing.roundOffAmount > 0 ? '+' : ''}{getCurrencySymbol()}{billing.roundOffAmount.toFixed(1)}</Text>
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
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.totalCardTitle}>Total</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        <Text style={styles.totalCardLabel}>Sub: {getCurrencySymbol()}{fmtAmt(subtotal)}</Text>
                        {billing.totalDiscount > 0 && <Text style={[styles.totalCardLabel, { color: '#fca5a5' }]}>Disc: -{getCurrencySymbol()}{fmtAmt(billing.totalDiscount)}</Text>}
                        {billing.serviceChargeAmount > 0 && isRoleAllowed(billingSettings.serviceChargeRoles) && <Text style={styles.totalCardLabel}>SC: {getCurrencySymbol()}{fmtAmt(billing.serviceChargeAmount)}</Text>}
                        {billing.totalTax > 0 && <Text style={styles.totalCardLabel}>Tax: {getCurrencySymbol()}{fmtAmt(billing.totalTax)}{billing.taxBreakdown?.some(t => t.inclusive) ? ' (incl.)' : ''}</Text>}
                        {tipAmount > 0 && isRoleAllowed(billingSettings.tipsRoles) && <Text style={styles.totalCardLabel}>Tip: {getCurrencySymbol()}{fmtAmt(tipAmount)}</Text>}
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <Text style={styles.totalCardGrand}>{getCurrencySymbol()}{fmtAmt(billing.grandTotal)}</Text>
                      {billing.totalDiscount > 0 && (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#fca5a5', marginTop: 1 }}>You save {getCurrencySymbol()}{fmtAmt(billing.totalDiscount)}</Text>
                      )}
                      {billing.totalDiscount === 0 && effectiveLoyaltySettings?.enabled && loyaltyPointsToEarn > 0 && (
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#fde68a', marginTop: 1 }}>+{loyaltyPointsToEarn} pts</Text>
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
                {posSettings.hideCustomerName !== true && (
                  <View style={styles.cartNameInputWrap}>
                    <Ionicons name="person-outline" size={14} color={customerName ? '#dc2626' : '#9ca3af'} />
                    <TextInput
                      style={styles.cartNameInput}
                      placeholder={posSettings.customerNameLabel || 'Name'}
                      placeholderTextColor="#9ca3af"
                      value={customerName}
                      onChangeText={setCustomerName}
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                )}
              </View>

              {/* Wallet Card Scan */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="card-outline" size={14} color="#9ca3af" />
                <TextInput
                  style={{ flex: 1, fontSize: 12, color: '#1f2937', backgroundColor: '#f9fafb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#e5e7eb' }}
                  placeholder="Scan wallet card"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="search"
                  autoCapitalize="none"
                  onSubmitEditing={async (e) => {
                    const cardNum = e.nativeEvent.text?.trim();
                    if (!cardNum || !restaurantId) return;
                    try {
                      const result = await apiClient.lookupCustomerByCard(restaurantId, cardNum);
                      if (result?.customer || result?.customerId) {
                        const cust = result.customer || result;
                        setCustomerData(cust);
                        if (cust.name) setCustomerName(cust.name);
                        if (cust.phone) setCustomerMobile(cust.phone);
                      } else {
                        Alert.alert('Not Found', 'No customer linked to this card');
                      }
                    } catch (err) {
                      Alert.alert('Error', err.message || 'Card lookup failed');
                    }
                  }}
                />
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
                  {customerData.walletBalance != null && (
                    <>
                      <Text style={styles.customerInfoDivider}>·</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#7c3aed' }}>{getCurrencySymbol()}{customerData.walletBalance} wallet</Text>
                    </>
                  )}
                  <Ionicons name="chevron-forward" size={12} color="#16a34a" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}

              {/* Split Bill (Gap 1) */}
              {showBillingPanels && billing.grandTotal > 0 && billingSettings.splitBillEnabled !== false && isRoleAllowed(billingSettings.splitBillRoles) && (
                <TouchableOpacity
                  onPress={() => { setSplitWays(splitConfig?.guests?.length || 2); setSplitMode(splitConfig?.mode || billingSettings.splitBillDefaultMethod || 'equal'); setSplitAmounts((splitConfig?.guests || []).map(g => String(g.amount))); setShowSplitModal(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 12, borderRadius: 10, borderWidth: 1, borderColor: splitConfig ? '#16a34a' : '#e2e8f0', backgroundColor: splitConfig ? '#f0fdf4' : 'white' }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="git-branch-outline" size={15} color={splitConfig ? '#16a34a' : '#475569'} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: splitConfig ? '#16a34a' : '#475569' }}>
                    {splitConfig ? `Split into ${splitConfig.guests.length} — tap to change` : 'Split Bill'}
                  </Text>
                  {splitConfig && (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setSplitConfig(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
                      <Ionicons name="close-circle" size={16} color="#dc2626" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              )}

              {/* Service-charge per-device override (Gap 5). Hidden when admin turned off
                  "show on dashboard" (web parity: serviceChargeShowOnDashboard). */}
              {showBillingPanels && scCanOverride && billingSettings.serviceChargeShowOnDashboard !== false && (
                <View style={{ marginBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="pricetag-outline" size={12} color="#1f2937" />
                      <Text style={styles.paymentSectionLabel}>{billingSettings.serviceChargeLabel || 'Service Charge'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setScWaived(w => !w)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name={scWaived ? 'close-circle' : 'checkmark-circle'} size={16} color={scWaived ? '#dc2626' : '#16a34a'} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: scWaived ? '#dc2626' : '#16a34a' }}>{scWaived ? 'Waived' : 'Applied'}</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Inline rate edit only when admin allows it (web parity: serviceChargeAllowRateEdit) */}
                  {!scWaived && billingSettings.serviceChargeAllowRateEdit && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>Rate override %</Text>
                      <TextInput
                        style={{ width: 72, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: '#111827' }}
                        value={scRateOverride} onChangeText={setScRateOverride} keyboardType="decimal-pad"
                        placeholder={String(billingSettings.serviceChargeRate ?? '')} placeholderTextColor="#9ca3af"
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Delivery-staff assignment (Gap 7) */}
              {showPayment && orderType === 'delivery' && deliveryStaff.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                    <Ionicons name="bicycle-outline" size={12} color="#1f2937" />
                    <Text style={styles.paymentSectionLabel}>Delivery Staff</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {deliveryStaff.map(s => (
                      <TouchableOpacity key={s.id} onPress={() => setSelectedDeliveryStaff(selectedDeliveryStaff?.id === s.id ? null : s)}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: selectedDeliveryStaff?.id === s.id ? '#2563eb' : '#e2e8f0', backgroundColor: selectedDeliveryStaff?.id === s.id ? '#eff6ff' : 'white' }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selectedDeliveryStaff?.id === s.id ? '#1d4ed8' : '#475569' }}>{s.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
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
                      {(paymentMethodOptions.filter(m => !effectivelyOffline || String(m).toLowerCase() === 'cash')).map((method) => (
                        <TouchableOpacity
                          key={method}
                          style={[styles.paymentBtn, paymentMethod === method && styles.paymentBtnActive]}
                          onPress={() => setPaymentMethod(method)}
                        >
                          <Ionicons name={paymentIcons[String(method).toLowerCase()] || 'wallet-outline'} size={13} color={paymentMethod === method ? '#fff' : '#6b7280'} />
                          <Text style={[styles.paymentBtnText, paymentMethod === method && styles.paymentBtnTextActive]}>
                            {String(method).charAt(0).toUpperCase() + String(method).slice(1)}
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

              {/* One-click KOT + Bill (flag-gated via onKotAndBill; default off).
                  Places order + prints KOT + prints bill, unpaid — settle after. */}
              {onKotAndBill && !isWaiterMode && (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4f46e5', paddingVertical: 13, borderRadius: 12, marginBottom: 8, opacity: sending ? 0.6 : 1 }}
                  onPress={handleKotAndBill}
                  disabled={sending}
                  activeOpacity={0.85}
                >
                  {sending && activeAction === 'kotbill' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="print" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>KOT + Bill</Text>
                    </>
                  )}
                </TouchableOpacity>
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
                        <Ionicons name={isUpdateOrder ? "refresh" : "restaurant"} size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>{isUpdateOrder ? 'Update Order' : 'Send to Kitchen'}</Text>
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
                        <Text style={styles.actionBtnText}>{posSettings.completeBillingLabel || 'Complete Billing'}</Text>
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
                          <Text style={styles.actionBtnText}>{isUpdateOrder ? 'Update' : (posSettings.placeOrderLabel || 'Place Order')}</Text>
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
                            <Text style={styles.actionBtnText}>{posSettings.completeBillingLabel || 'Complete Bill'}</Text>
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
                  <Text style={{ fontSize: fs(16), fontWeight: '700', color: '#1e293b' }}>Order Details</Text>
                  <Text style={{ fontSize: 11, color: '#94a3b8' }}>{cart.length} items · {getCurrencySymbol()}{fmtAmt(subtotal)}</Text>
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
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#dc2626' }}>{getCurrencySymbol()}{(customerData.totalSpent || 0).toFixed(0)}</Text>
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
                          <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>-{getCurrencySymbol()}{saves.toFixed(0)}</Text>
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
                              <Text style={[styles.offerCardSaves, isSelected && { color: '#dc2626' }]}>-{getCurrencySymbol()}{saves.toFixed(0)}</Text>
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
                            {redeemPoints > 0 ? `${redeemPoints} pts = -${getCurrencySymbol()}${loyaltyDiscount.toFixed(0)}` : 'Tap or slide to redeem'}
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

              {/* COUPON CODE Section */}
              {couponsEnabled && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="ticket-outline" size={10} color="#94a3b8" />
                    <Text style={styles.modalSectionLabel}>Coupon Code</Text>
                  </View>
                  {appliedCoupon ? (
                    <View style={{ padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#86efac', backgroundColor: '#f0fdf4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{appliedCoupon.code}</Text>
                        <Text style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>Saving {getCurrencySymbol()}{fmtAmt(appliedCoupon.discountAmount)}</Text>
                      </View>
                      <TouchableOpacity onPress={handleRemoveCoupon} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#dc2626' }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: couponError ? 6 : (customerCoupons.length > 0 ? 8 : 0) }}>
                        <TextInput
                          style={{ flex: 1, borderWidth: 1.5, borderColor: couponError ? '#fca5a5' : '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '600', letterSpacing: 1, color: '#1f2937' }}
                          placeholder="Enter coupon code"
                          placeholderTextColor="#9ca3af"
                          autoCapitalize="characters"
                          value={couponCode}
                          onChangeText={(t) => { setCouponCode(t.toUpperCase()); setCouponError(''); }}
                          onSubmitEditing={() => handleApplyCoupon(couponCode)}
                        />
                        <TouchableOpacity
                          onPress={() => handleApplyCoupon(couponCode)}
                          disabled={couponLoading || !couponCode.trim()}
                          style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: couponLoading || !couponCode.trim() ? '#e5e7eb' : '#ef4444', justifyContent: 'center' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: couponLoading || !couponCode.trim() ? '#9ca3af' : '#fff' }}>
                            {couponLoading ? '...' : 'Apply'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {couponError ? <Text style={{ fontSize: 11, color: '#dc2626', marginBottom: customerCoupons.length > 0 ? 8 : 0 }}>{couponError}</Text> : null}
                      {customerCoupons.length > 0 && (
                        <View>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: '#6b7280', marginBottom: 4 }}>Available coupons:</Text>
                          <ScrollView horizontal={false} style={{ maxHeight: 100 }} nestedScrollEnabled>
                            {customerCoupons.map(c => (
                              <TouchableOpacity
                                key={c.id}
                                onPress={() => handleApplyCoupon(c.code)}
                                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', marginBottom: 4 }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#1f2937' }}>{c.code}</Text>
                                  {c.type === 'private' && (
                                    <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: '#ede9fe' }}>
                                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#7c3aed' }}>YOURS</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>
                                  {c.discountType === 'percentage' ? `${c.value}% off` : `${getCurrencySymbol()}${c.value}`}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* MANUAL DISCOUNT Section */}
              {discountConfig.enabled && isRoleAllowed(discountConfig.roles) && (
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
                      placeholder={manualDiscountType === 'percentage' ? '0%' : '{getCurrencySymbol()}0'}
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={manualDiscount}
                      onChangeText={setManualDiscount}
                    />
                  </View>
                  {manualDiscountAmount > 0 && (
                    <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: '500' }}>
                      Discount: -{getCurrencySymbol()}{fmtAmt(manualDiscountAmount)}
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
                  <Text style={{ fontSize: fs(12), fontWeight: '600', color: '#374151' }}>{getCurrencySymbol()}{fmtAmt(subtotal)}</Text>
                </View>
                {offerDiscount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Offers</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>-{getCurrencySymbol()}{fmtAmt(offerDiscount)}</Text>
                  </View>
                )}
                {manualDiscountAmount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>Manual Discount</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>-{getCurrencySymbol()}{fmtAmt(manualDiscountAmount)}</Text>
                  </View>
                )}
                {loyaltyDiscount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#b45309' }}>Loyalty ({redeemPoints} pts)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#b45309' }}>-{getCurrencySymbol()}{fmtAmt(loyaltyDiscount)}</Text>
                  </View>
                )}
                {billing.serviceChargeAmount > 0 && isRoleAllowed(billingSettings.serviceChargeRoles) && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{billingSettings.serviceChargeLabel || 'Service Charge'} ({billing.serviceChargeRate}%)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>{getCurrencySymbol()}{fmtAmt(billing.serviceChargeAmount)}</Text>
                  </View>
                )}
                {billing.totalTax > 0 && billing.taxBreakdown.map((tax, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{tax.name} ({tax.rate}%){tax.inclusive ? ' (incl.)' : ''}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>{getCurrencySymbol()}{fmtAmt(tax.amount)}</Text>
                  </View>
                ))}
                {billing.roundOffAmount !== 0 && isRoleAllowed(billingSettings.roundOffRoles) && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Round off</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>{billing.roundOffAmount > 0 ? '+' : ''}{getCurrencySymbol()}{billing.roundOffAmount.toFixed(2)}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 4 }}>
                  <Text style={{ fontSize: fs(14), fontWeight: '700', color: '#1e293b' }}>Total</Text>
                  <Text style={{ fontSize: fs(14), fontWeight: '700', color: '#1e293b' }}>{getCurrencySymbol()}{fmtAmt(billing.grandTotal)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.doneBtn, billing.totalDiscount > 0 && { backgroundColor: '#dc2626' }]}
                onPress={() => setShowOffersModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.doneBtnText}>
                  {billing.totalDiscount > 0 ? `Apply & Save ${getCurrencySymbol()}${fmtAmt(billing.totalDiscount)}` : 'Done'}
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
                  <Text style={styles.breakdownAmount}>{getCurrencySymbol()}{subtotal.toFixed(2)}</Text>
                </View>
                {offerDiscount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Offers</Text>
                    <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-{getCurrencySymbol()}{offerDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {loyaltyDiscount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Loyalty ({redeemPoints} pts)</Text>
                    <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-{getCurrencySymbol()}{loyaltyDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {manualDiscountAmount > 0 && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Manual Discount</Text>
                    <Text style={[styles.breakdownAmount, styles.breakdownDiscount]}>-{getCurrencySymbol()}{manualDiscountAmount.toFixed(2)}</Text>
                  </View>
                )}
                {billing.serviceChargeAmount > 0 && isRoleAllowed(billingSettings.serviceChargeRoles) && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{billingSettings.serviceChargeLabel || 'Service Charge'}{billing.serviceChargeRate ? ` ${billing.serviceChargeRate}%` : ''}</Text>
                    <Text style={styles.breakdownAmount}>{getCurrencySymbol()}{billing.serviceChargeAmount.toFixed(2)}</Text>
                  </View>
                )}
                {billing.taxBreakdown.map((tax, i) => (
                  <View key={`tax-${i}`} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>{tax.name}{tax.rate ? ` ${tax.rate}%` : ''}{tax.inclusive ? ' (incl.)' : ''}</Text>
                    <Text style={styles.breakdownAmount}>{getCurrencySymbol()}{tax.amount.toFixed(2)}</Text>
                  </View>
                ))}
                {tipAmount > 0 && isRoleAllowed(billingSettings.tipsRoles) && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Tip{tipPercentage ? ` ${tipPercentage}%` : ''}</Text>
                    <Text style={styles.breakdownAmount}>{getCurrencySymbol()}{tipAmount.toFixed(2)}</Text>
                  </View>
                )}
                {billing.roundOffAmount !== 0 && isRoleAllowed(billingSettings.roundOffRoles) && (
                  <View style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>Round-off</Text>
                    <Text style={styles.breakdownAmount}>{billing.roundOffAmount > 0 ? '+' : '-'}{getCurrencySymbol()}{Math.abs(billing.roundOffAmount).toFixed(2)}</Text>
                  </View>
                )}
                <View style={styles.breakdownDivider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownGrandLabel}>Grand Total</Text>
                  <Text style={styles.breakdownGrandValue}>{getCurrencySymbol()}{billing.grandTotal.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Billing action sheet — each toolbar action (Cash/Split/Tip/Khata/Comp/Void/SC/Round)
          opens its controls in this clean bottom sheet instead of the cramped inline row. */}
      <Modal
        visible={showBillingPanels && !!activeBillingPanel}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveBillingPanel(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <TouchableOpacity style={styles.billingSheetOverlay} activeOpacity={1} onPress={() => { Keyboard.dismiss(); setActiveBillingPanel(null); }}>
            <View style={styles.billingSheetCard} onStartShouldSetResponder={() => true}>
              <View style={styles.billingSheetHandle} />
              <TouchableOpacity
                onPress={() => { Keyboard.dismiss(); setActiveBillingPanel(null); }}
                style={styles.billingSheetCloseBtn}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
              <ScrollView style={styles.billingSheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
              </ScrollView>
              <TouchableOpacity style={styles.billingSheetDone} onPress={() => setActiveBillingPanel(null)} activeOpacity={0.85}>
                <Text style={styles.billingSheetDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Price modal (role-gated via billingSettings.priceEditRoles) */}
      <Modal visible={!!priceEditItem} animationType="fade" transparent onRequestClose={() => setPriceEditItem(null)}>
        <TouchableOpacity style={styles.breakdownOverlay} activeOpacity={1} onPress={() => setPriceEditItem(null)}>
          <View style={styles.breakdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>Edit Price</Text>
              <TouchableOpacity onPress={() => setPriceEditItem(null)}><Ionicons name="close" size={20} color="#64748b" /></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }} numberOfLines={1}>{priceEditItem?.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 16, color: '#111827', fontWeight: '700' }}>{getCurrencySymbol()}</Text>
                <TextInput
                  style={{ flex: 1, fontSize: 16, paddingVertical: 12, marginLeft: 6, color: '#111827' }}
                  value={priceEditValue} onChangeText={setPriceEditValue}
                  keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af" autoFocus
                />
              </View>
              {priceEditItem?.originalPrice != null && Number(priceEditItem.originalPrice) !== Number(priceEditValue) && (
                <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Original: {getCurrencySymbol()}{priceEditItem.originalPrice}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }} onPress={() => setPriceEditItem(null)}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' }}
                  onPress={() => { onEditItemPrice(priceEditItem.cartId || priceEditItem.id, priceEditValue); setPriceEditItem(null); }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom Item modal (role-gated via billingSettings.customItemRoles) */}
      <Modal visible={showCustomItemModal} animationType="fade" transparent onRequestClose={() => setShowCustomItemModal(false)}>
        <TouchableOpacity style={styles.breakdownOverlay} activeOpacity={1} onPress={() => setShowCustomItemModal(false)}>
          <View style={styles.breakdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>Custom Item</Text>
              <TouchableOpacity onPress={() => setShowCustomItemModal(false)}><Ionicons name="close" size={20} color="#64748b" /></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Item name</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 }}
                value={customItemName} onChangeText={setCustomItemName} placeholder="e.g. Special item" placeholderTextColor="#9ca3af" autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Price</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12 }}>
                    <Text style={{ fontSize: 16, color: '#111827', fontWeight: '700' }}>{getCurrencySymbol()}</Text>
                    <TextInput
                      style={{ flex: 1, fontSize: 16, paddingVertical: 12, marginLeft: 6, color: '#111827' }}
                      value={customItemPrice} onChangeText={setCustomItemPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
                <View style={{ width: 96 }}>
                  <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Qty</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10 }}>
                    <TouchableOpacity onPress={() => setCustomItemQty(String(Math.max(1, (parseInt(customItemQty, 10) || 1) - 1)))} style={{ paddingHorizontal: 10, paddingVertical: 10 }}>
                      <Ionicons name="remove" size={16} color="#475569" />
                    </TouchableOpacity>
                    <Text style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#111827' }}>{parseInt(customItemQty, 10) || 1}</Text>
                    <TouchableOpacity onPress={() => setCustomItemQty(String((parseInt(customItemQty, 10) || 1) + 1))} style={{ paddingHorizontal: 10, paddingVertical: 10 }}>
                      <Ionicons name="add" size={16} color="#475569" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }} onPress={() => setShowCustomItemModal(false)}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center', opacity: Number(customItemPrice) > 0 ? 1 : 0.5 }}
                  disabled={!(Number(customItemPrice) > 0)}
                  onPress={() => { onAddCustomItem({ name: customItemName, price: customItemPrice, quantity: customItemQty }); setShowCustomItemModal(false); }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Split Bill modal (Gap 1) */}
      <Modal visible={showSplitModal} animationType="fade" transparent onRequestClose={() => setShowSplitModal(false)}>
        <TouchableOpacity style={styles.breakdownOverlay} activeOpacity={1} onPress={() => setShowSplitModal(false)}>
          <View style={styles.breakdownCard} onStartShouldSetResponder={() => true}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownTitle}>Split Bill</Text>
              <TouchableOpacity onPress={() => setShowSplitModal(false)}><Ionicons name="close" size={20} color="#64748b" /></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Grand total {getCurrencySymbol()}{fmtAmt(billing.grandTotal)}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                {['equal', 'amount', 'item'].map(m => (
                  <TouchableOpacity key={m} onPress={() => setSplitMode(m)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: splitMode === m ? '#2563eb' : '#e2e8f0', backgroundColor: splitMode === m ? '#eff6ff' : 'white', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: splitMode === m ? '#1d4ed8' : '#475569' }}>{m === 'equal' ? 'Equal' : m === 'amount' ? 'By Amount' : 'By Item'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* Split by Seat quick action — only when items carry seats */}
              {cart.some(it => it.seat != null) && (
                <TouchableOpacity onPress={() => { if (!applySplitBySeat()) {} }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginBottom: 10, borderRadius: 8, borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff' }}>
                  <Ionicons name="people-outline" size={14} color="#4f46e5" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#4f46e5' }}>Split by Seat</Text>
                </TouchableOpacity>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#374151', fontWeight: '600' }}>Number of guests</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 }}>
                  <TouchableOpacity onPress={() => { const n = Math.max(2, splitWays - 1); setSplitWays(n); setSplitAmounts(a => a.slice(0, n)); }} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Ionicons name="remove" size={16} color="#475569" /></TouchableOpacity>
                  <Text style={{ minWidth: 28, textAlign: 'center', fontWeight: '800', fontSize: 15, color: '#111827' }}>{splitWays}</Text>
                  <TouchableOpacity onPress={() => setSplitWays(n => Math.min(Number(billingSettings.splitBillMaxGuests) || 10, n + 1))} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Ionicons name="add" size={16} color="#475569" /></TouchableOpacity>
                </View>
              </View>
              {splitMode === 'equal' ? (
                <View style={{ marginBottom: 8 }}>
                  {computeSplitGuests(billing.grandTotal, splitWays).map((g, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, color: '#374151' }}>{g.name}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{getCurrencySymbol()}{fmtAmt(g.amount)}</Text>
                    </View>
                  ))}
                </View>
              ) : splitMode === 'item' ? (
                <View style={{ marginBottom: 8 }}>
                  {/* Tap the guest number on each line to cycle which guest pays for it */}
                  {cart.map((it, idx) => {
                    const key = splitItemKey(it, idx);
                    const gi = Math.min(splitWays - 1, splitItemGuest[key] ?? 0);
                    return (
                      <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 }}>
                        <Text style={{ flex: 1, fontSize: 13, color: '#374151' }} numberOfLines={1}>
                          {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}{it.selectedVariant?.name ? ` (${it.selectedVariant.name})` : ''}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748b', width: 64, textAlign: 'right' }}>{getCurrencySymbol()}{fmtAmt(splitLineTotal(it))}</Text>
                        <TouchableOpacity
                          onPress={() => setSplitItemGuest(m => ({ ...m, [key]: ((gi + 1) % splitWays) }))}
                          style={{ marginLeft: 10, width: 34, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#4f46e5' }}>G{gi + 1}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 6 }} />
                  {computeItemSplitGuests(billing.grandTotal, splitWays).map((g, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, color: '#374151' }}>{g.name} <Text style={{ color: '#9ca3af' }}>({g.items.length} item{g.items.length === 1 ? '' : 's'})</Text></Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>{getCurrencySymbol()}{fmtAmt(g.amount)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ marginBottom: 8 }}>
                  {Array.from({ length: splitWays }).map((_, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, color: '#374151' }}>Guest {i + 1}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 8, width: 120 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{getCurrencySymbol()}</Text>
                        <TextInput style={{ flex: 1, fontSize: 14, paddingVertical: 8, marginLeft: 4, color: '#111827' }}
                          value={splitAmounts[i] || ''} onChangeText={t => setSplitAmounts(a => { const b = [...a]; b[i] = t; return b; })}
                          keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af" />
                      </View>
                    </View>
                  ))}
                  {(() => {
                    const sum = Array.from({ length: splitWays }).reduce((s, _, i) => s + (parseFloat(splitAmounts[i]) || 0), 0);
                    const diff = Math.round((billing.grandTotal - sum) * 100) / 100;
                    return <Text style={{ fontSize: 11, color: Math.abs(diff) < 0.01 ? '#16a34a' : '#dc2626', marginTop: 4 }}>{Math.abs(diff) < 0.01 ? 'Matches total ✓' : `${diff > 0 ? 'Remaining' : 'Over'} ${getCurrencySymbol()}${fmtAmt(Math.abs(diff))}`}</Text>;
                  })()}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' }} onPress={() => setShowSplitModal(false)}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#475569' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center' }}
                  onPress={() => {
                    const guests = splitMode === 'equal'
                      ? computeSplitGuests(billing.grandTotal, splitWays)
                      : splitMode === 'item'
                        ? computeItemSplitGuests(billing.grandTotal, splitWays).map(g => ({ name: g.name, amount: g.amount, items: g.items }))
                        : Array.from({ length: splitWays }).map((_, i) => ({ name: `Guest ${i + 1}`, amount: Math.round((parseFloat(splitAmounts[i]) || 0) * 100) / 100 }));
                    setSplitConfig({ mode: splitMode, guests });
                    setShowSplitModal(false);
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Apply Split</Text>
                </TouchableOpacity>
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
        onClose={() => { setShowUpiQr(false); setActiveAction(null); }}
        onConfirmPayment={handleUpiConfirm}
        amount={billing.grandTotal}
        restaurantName={restaurantName}
        upiId={upiSettings?.upiId}
        upiQrCodeUrl={upiSettings?.upiQrCodeUrl}
        upiDisplayName={upiSettings?.upiDisplayName}
      />
      <DiscountApprovalModal
        visible={showDiscountApproval}
        onClose={() => { setShowDiscountApproval(false); setPendingOrderAction(null); }}
        onApproved={handleDiscountApproved}
        restaurantId={restaurantId}
        discountData={{
          discountType: manualDiscountType,
          discountValue: parseFloat(manualDiscount) || 0,
          discountAmount: manualDiscountAmount,
          subtotal,
        }}
        userRole={mode === 'owner' ? 'owner' : mode}
        userName=""
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabletContent: {
    maxWidth: 600,
    width: '80%',
    alignSelf: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#e5e7eb',
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
    flexWrap: 'wrap',
    gap: 6,
  },
  orderTypeTab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 90,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 6,
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
  autoPricingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  autoPricingText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#047857',
  },
  autoPricingBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  autoPricingBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  // Billing action bottom sheet
  billingSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  billingSheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    minHeight: 300,
  },
  billingSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  billingSheetCloseBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  billingSheetScroll: {
    maxHeight: 460,
    marginTop: 6,
  },
  billingSheetDone: {
    marginTop: 16,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  billingSheetDoneText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
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
    alignItems: 'flex-start',
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
    maxWidth: 420,
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
