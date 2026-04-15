import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import CustomerLookup from './CustomerLookup';
import CustomerDetailModal from './CustomerDetailModal';
import useOfferEngine from '../hooks/useOfferEngine';
import useBillingCalculation from '../hooks/useBillingCalculation';
import { calculateOfferResult } from '../services/offerEngine';

export default function WaiterCartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onSendToKitchen,
  total,
  tableNumber: tableNumberProp,
  sending,
  restaurantId,
  countryCode = 'IN',
  taxSettings = {},
  billingSettings = {},
  floors = [],
  onTableSelect,
  selectedTable,
}) {
  const { fs } = useResponsive();
  const insets = useSafeAreaInsets();
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const [tableNumber, setTableNumber] = useState(selectedTable?.name || tableNumberProp || '');
  const [showTableInput, setShowTableInput] = useState(false);

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

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = total;

  // Customer state
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [showCustomerDetail, setShowCustomerDetail] = useState(false);
  const [detailCustomerId, setDetailCustomerId] = useState(null);

  // Build customer context for offer engine (audience targeting)
  const customerContext = useMemo(() => {
    const phone = customerMobile || customerData?.phone || null;
    if (!phone && !customerData?.id && !customerData?._id) return null;
    return {
      customerPhone: phone,
      customerId: customerData?.id || customerData?._id || null,
      isFirstOrder: customerData ? customerData.totalOrders === 0 : undefined,
    };
  }, [customerMobile, customerData]);

  // Offers state
  const [showOffersModal, setShowOffersModal] = useState(false);

  // Manual discount
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');
  const [sliderWidth, setSliderWidth] = useState(280);
  const [lookupKey, setLookupKey] = useState(0);

  const manualDiscountAmount = useMemo(() => {
    const val = parseFloat(manualDiscount) || 0;
    if (val <= 0) return 0;
    if (manualDiscountType === 'percentage') return Math.round((subtotal * Math.min(val, 100) / 100) * 100) / 100;
    return Math.min(val, subtotal);
  }, [manualDiscount, manualDiscountType, subtotal]);

  // Offer engine
  const {
    genericOffers, personalizedOffers, applicableOffers,
    selectedOfferId, setSelectedOfferId,
    selectedOfferIds, setSelectedOfferIds,
    offerDiscount, freeItems,
    offerSettings,
    autoApplied,
    loyaltySettings: hookLoyaltySettings,
    customerGroups: customerOfferGroups,
    calculateDiscountForOffer,
    resetOffers,
  } = useOfferEngine({
    restaurantId,
    subtotal,
    cart,
    customerContext,
    options: { autoApply: true },
  });

  // Reset all state when modal closes
  useEffect(() => {
    if (!visible) {
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

  // Merge loyaltySettings — prefer hook source
  const effectiveLoyaltySettings = hookLoyaltySettings || loyaltySettings;

  // Calculate loyalty discount (points / redemptionRate = discount amount)
  const loyaltyDiscount = useMemo(() => {
    if (!redeemPoints || !effectiveLoyaltySettings) return 0;
    const redemptionRate = effectiveLoyaltySettings.redemptionRate || 1;
    return Math.round((redeemPoints / redemptionRate) * 100) / 100;
  }, [redeemPoints, effectiveLoyaltySettings]);

  // Max redeemable points
  const loyaltyMaxRedeemable = useMemo(() => {
    if (!customerData?.loyaltyPoints || !effectiveLoyaltySettings) return 0;
    const redemptionRate = effectiveLoyaltySettings.redemptionRate || 1;
    const maxPct = effectiveLoyaltySettings.maxRedemptionPercent || 20;
    const afterOtherDisc = Math.max(0, subtotal - offerDiscount - manualDiscountAmount);
    const maxDiscByPct = (afterOtherDisc * maxPct) / 100;
    const maxPointsByPct = Math.floor(maxDiscByPct * redemptionRate);
    return Math.min(customerData.loyaltyPoints, maxPointsByPct);
  }, [customerData, effectiveLoyaltySettings, subtotal, offerDiscount, manualDiscountAmount]);

  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null;
    return applicableOffers.find(o => (o.id || o._id) === selectedOfferId) || null;
  }, [selectedOfferId, applicableOffers]);

  const selectedOffers = useMemo(() => {
    if (selectedOfferIds.length === 0) return [];
    return applicableOffers.filter(o => selectedOfferIds.includes(o.id || o._id));
  }, [selectedOfferIds, applicableOffers]);

  // Use shared billing calculation hook (same as CashierCartModal & CartModal)
  const billing = useBillingCalculation({
    subtotal,
    offerDiscount,
    manualDiscountAmount,
    loyaltyDiscount,
    compAmount: 0,
    taxSettings,
    billingSettings,
    tipAmount: 0,
  });

  const loyaltyPointsToEarn = useMemo(() => {
    if (!effectiveLoyaltySettings?.enabled || !customerData) return 0;
    const earnPerAmount = effectiveLoyaltySettings.earnPerAmount || 100;
    const pointsRate = effectiveLoyaltySettings.pointsPerUnit || 1;
    const base = Math.max(0, subtotal - offerDiscount - manualDiscountAmount - loyaltyDiscount);
    return Math.floor(base / earnPerAmount) * pointsRate;
  }, [effectiveLoyaltySettings, subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, redeemPoints]);

  // Build free items for display
  const freeItemsForDisplay = useMemo(() => {
    return (freeItems || []).map(fi => {
      const id = fi.itemId || fi.menuItemId || fi.id;
      const match = cart.find(c => (c.menuItemId || c.id) === id);
      return { id, name: fi.name || match?.name || `Item ${id}`, quantity: fi.quantity || 1 };
    });
  }, [freeItems, cart]);

  const handleCustomerFound = useCallback((customer, settings) => {
    setCustomerData(customer);
    setLoyaltySettings(settings);
    if (customer?.name) setCustomerName(customer.name);
    if (customer?.phone) setCustomerMobile(customer.phone);
    setRedeemPoints(0);
  }, []);

  const handleSend = () => {
    // Pass customer info and full billing data to the parent (same fields as CashierCartModal)
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

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        {getItemSubline(item) ? (
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
        ) : null}
        <Text style={styles.cartItemPrice}>₹{item.price}</Text>
      </View>
      <View style={styles.cartItemControls}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          disabled={sending}
        >
          <Ionicons name="remove" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          disabled={sending}
        >
          <Ionicons name="add" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemoveItem(item.id)}
          disabled={sending}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>
        ₹{(item.price * item.quantity).toFixed(2)}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Order Summary</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={styles.itemCount}>{itemCount} item(s)</Text>
                </View>
              </View>

              {/* Table Number — inline input or chip */}
              {(selectedTable?.name || tableNumberProp) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 }}>
                  <Ionicons name="restaurant-outline" size={13} color="#dc2626" />
                  <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{selectedTable?.name || tableNumberProp}</Text>
                </View>
              ) : showTableInput ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 6, marginRight: 8, height: 32, borderWidth: 1, borderColor: '#d1d5db' }}>
                  <Ionicons name="restaurant-outline" size={13} color="#6b7280" />
                  <TextInput
                    style={{ color: '#111827', fontSize: 13, fontWeight: '600', paddingHorizontal: 6, minWidth: 50, maxWidth: 80, paddingVertical: 0 }}
                    placeholder="Table"
                    placeholderTextColor="#9ca3af"
                    value={tableNumber}
                    onChangeText={setTableNumber}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => { if (!tableNumber.trim()) setShowTableInput(false); }}
                  />
                  {tableNumber ? (
                    matchedFloor ? (
                      <Ionicons name="checkmark-circle" size={14} color="#dc2626" />
                    ) : (
                      <Ionicons name="alert-circle-outline" size={14} color="#f59e0b" />
                    )
                  ) : (
                    <TouchableOpacity onPress={() => { setTableNumber(''); setShowTableInput(false); }}>
                      <Ionicons name="close" size={14} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#e5e7eb' }}
                  onPress={() => setShowTableInput(true)}
                >
                  <Ionicons name="add" size={13} color="#6b7280" />
                  <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '600' }}>Table</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.notesToggle, showKitchenNotes && styles.notesToggleActive]}
                onPress={() => setShowKitchenNotes(!showKitchenNotes)}
              >
                <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? '#d97706' : Colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} disabled={sending}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            {/* Zone/Pricing auto-select indicator */}
            {tableNumber.trim() && matchedFloor && (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 4, gap: 4 }}>
                <Ionicons name="location-outline" size={11} color="#dc2626" />
                <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>{matchedFloor.floorName}</Text>
              </View>
            )}
          </View>

          {/* Cart Items */}
          <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
                <Text style={styles.emptySubtext}>Add items to place order</Text>
              </View>
            ) : (
              <>
                <View style={{ maxHeight: 280 }}>
                  <FlatList
                    data={cart}
                    renderItem={renderCartItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                  />
                </View>

                {/* Free items from offers */}
                {freeItemsForDisplay.length > 0 && (
                  <View style={{ marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: '#fef3c7', borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="gift" size={14} color="#78350f" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#78350f', flex: 1 }}>
                      Free: {freeItemsForDisplay.map(f => `${f.quantity}x ${f.name}`).join(', ')}
                    </Text>
                  </View>
                )}

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
              </>
            )}
          </ScrollView>

          {/* Fixed Bottom — customer + offers inline, total, action */}
          {cart.length > 0 && (
            <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingBottom: Math.max(insets.bottom, 10) }}>
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

                {/* Name input — side by side */}
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

                {/* Offers badge — compact */}
                {(() => {
                  const hasOffers = genericOffers.length > 0 || personalizedOffers.length > 0;
                  const hasLoyalty = loyaltySettings?.enabled && customerData;
                  const hasAnything = hasOffers || hasLoyalty || offerDiscount > 0 || specialInstructions;
                  if (!hasAnything) return null;

                  const activeOfferCount = (offerSettings?.allowMultipleOffers ? selectedOfferIds : (selectedOfferId ? [selectedOfferId] : [])).length;
                  const hasApplied = activeOfferCount > 0 || loyaltyDiscount > 0;

                  return (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: hasApplied ? '#fef2f2' : '#fef2f2', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: hasApplied ? '#fecaca' : '#fee2e2' }}
                      onPress={() => setShowOffersModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pricetag" size={13} color={hasApplied ? '#dc2626' : '#dc2626'} />
                      {hasApplied ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>
                          -₹{(offerDiscount + loyaltyDiscount).toFixed(0)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#dc2626' }}>
                          {applicableOffers.length}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={12} color={hasApplied ? '#fca5a5' : '#a5b4fc'} />
                    </TouchableOpacity>
                  );
                })()}
              </View>

              {/* Billing Breakdown */}
              <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>Subtotal</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>₹{subtotal.toFixed(0)}</Text>
                </View>
                {billing.totalDiscount > 0 && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#dc2626' }}>
                      {offerDiscount > 0 && loyaltyDiscount > 0 ? 'Offers + Loyalty' : offerDiscount > 0 ? 'Offers' : 'Loyalty'}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#dc2626' }}>-₹{billing.totalDiscount.toFixed(0)}</Text>
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
              </View>

              {/* Grand Total */}
              <View style={styles.totalContainer}>
                <View>
                  <Text style={[styles.totalLabel, { fontSize: fs(16) }]}>Total</Text>
                  {billing.totalDiscount > 0 && (
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#dc2626', marginTop: 1 }}>You save ₹{billing.totalDiscount.toFixed(0)}</Text>
                  )}
                </View>
                <Text style={[styles.totalAmount, { fontSize: fs(20) }]}>₹{billing.grandTotal.toFixed(2)}</Text>
              </View>

              {/* Send to Kitchen Button */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={sending}
                >
                  {sending ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.sendButtonText}>Sending to Kitchen...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="restaurant" size={20} color="#fff" />
                      <Text style={styles.sendButtonText}>Send to Kitchen</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
      </TouchableWithoutFeedback>

      {/* Offers Modal */}
      <Modal visible={showOffersModal} transparent animationType="slide" onRequestClose={() => setShowOffersModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 0.05 }} activeOpacity={1} onPress={() => setShowOffersModal(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '95%', paddingBottom: Math.max(insets.bottom, 16) }}>
            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' }} />
            </View>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 6 }}>
                  <Ionicons name="pricetag" size={16} color="#fff" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>Order Details</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{itemCount} items · ₹{subtotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowOffersModal(false)} style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Customer Info Card */}
              {customerData && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => setShowOffersModal(true)} style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="person" size={18} color="#15803d" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{customerData.name || 'Customer'}</Text>
                      <Text style={{ fontSize: 11, color: '#6b7280' }}>{customerData.phone}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#dcfce7' }}>
                      <Ionicons name="receipt-outline" size={14} color="#15803d" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b', marginTop: 2 }}>{customerData.totalOrders || 0}</Text>
                      <Text style={{ fontSize: 9, color: '#6b7280' }}>Orders</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#fef3c7' }}>
                      <Ionicons name="star" size={14} color="#f59e0b" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#b45309', marginTop: 2 }}>{customerData.loyaltyPoints || 0}</Text>
                      <Text style={{ fontSize: 9, color: '#6b7280' }}>Points</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#dcfce7' }}>
                      <Ionicons name="wallet-outline" size={14} color="#15803d" />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#15803d', marginTop: 2 }}>₹{(customerData.totalSpent || 0).toFixed(0)}</Text>
                      <Text style={{ fontSize: 9, color: '#6b7280' }}>Spent</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}

              {/* Generic Offers */}
              {genericOffers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>Available Offers</Text>
                  {genericOffers.map((offer) => {
                    const oid = offer.id || offer._id;
                    const isMulti = offerSettings?.allowMultipleOffers;
                    const isSelected = isMulti ? selectedOfferIds.includes(oid) : selectedOfferId === oid;
                    const saves = calculateDiscountForOffer ? calculateDiscountForOffer(offer, subtotal, cart) : (calculateOfferResult(offer, subtotal, cart, {})?.discount || 0);
                    return (
                      <TouchableOpacity
                        key={oid}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: isSelected ? '#fef2f2' : '#f9fafb', borderWidth: 1, borderColor: isSelected ? '#fca5a5' : '#f3f4f6' }}
                        onPress={() => {
                          if (isMulti) {
                            setSelectedOfferIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]);
                          } else {
                            setSelectedOfferId(selectedOfferId === oid ? null : oid);
                          }
                        }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: isSelected ? '#dc2626' : '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
                          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b' }}>{offer.name}</Text>
                            {isSelected && autoApplied && (
                              <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#dc2626' }}>Auto</Text>
                              </View>
                            )}
                          </View>
                          {offer.description ? <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }} numberOfLines={1}>{offer.description}</Text> : null}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>-₹{saves.toFixed(0)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Personalized Offers */}
              {personalizedOffers.length > 0 && customerData && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Ionicons name="gift" size={14} color="#d97706" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400e' }}>For You</Text>
                  </View>
                  {personalizedOffers.map((offer) => {
                    const oid = offer.id || offer._id;
                    const isMulti = offerSettings?.allowMultipleOffers;
                    const isSelected = isMulti ? selectedOfferIds.includes(oid) : selectedOfferId === oid;
                    const saves = calculateDiscountForOffer ? calculateDiscountForOffer(offer, subtotal, cart) : (calculateOfferResult(offer, subtotal, cart, {})?.discount || 0);
                    const offerGroupIds = offer.audience?.groupIds || [];
                    const matchedGroup = customerOfferGroups?.find(g => offerGroupIds.includes(g.id));
                    return (
                      <TouchableOpacity
                        key={oid}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: isSelected ? '#fffbeb' : '#f9fafb', borderWidth: 1, borderColor: isSelected ? '#fbbf24' : '#f3f4f6' }}
                        onPress={() => {
                          if (isMulti) {
                            setSelectedOfferIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]);
                          } else {
                            setSelectedOfferId(selectedOfferId === oid ? null : oid);
                          }
                        }}
                      >
                        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: isSelected ? '#f59e0b' : '#e5e7eb', justifyContent: 'center', alignItems: 'center' }}>
                          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                        </View>
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b' }}>{offer.name}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            {offer.description ? <Text style={{ fontSize: 10, color: '#6b7280' }} numberOfLines={1}>{offer.description}</Text> : null}
                            {matchedGroup && (
                              <View style={{ backgroundColor: matchedGroup.color || '#dc2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: '#fff' }}>{matchedGroup.name}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>-₹{saves.toFixed(0)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Free Items from offers */}
              {freeItemsForDisplay.length > 0 && (
                <View style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: '#fef3c7', borderWidth: 1, borderStyle: 'dashed', borderColor: '#f59e0b', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="gift" size={14} color="#78350f" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#78350f', flex: 1 }}>
                    Free: {freeItemsForDisplay.map(f => `${f.quantity}x ${f.name}`).join(', ')}
                  </Text>
                </View>
              )}

              {/* Loyalty Section */}
              {effectiveLoyaltySettings?.enabled && customerData && (
                <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#b45309' }}>
                      {customerData.loyaltyPoints || 0} points available
                    </Text>
                    {loyaltyPointsToEarn > 0 && (
                      <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#dc2626' }}>Will earn +{loyaltyPointsToEarn} pts</Text>
                      </View>
                    )}
                  </View>
                  {loyaltyMaxRedeemable > 0 ? (
                    <>
                      <View
                        style={{ paddingVertical: 8 }}
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
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', position: 'relative', justifyContent: 'center' }}>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#f59e0b', position: 'absolute', left: 0, top: 0, width: `${Math.min(100, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }} />
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#f59e0b', position: 'absolute', top: -7, borderWidth: 2, borderColor: '#fff', shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 3, left: `${Math.min(96, (redeemPoints / loyaltyMaxRedeemable) * 100)}%` }} />
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {[{ label: '25%', value: 0.25 }, { label: '50%', value: 0.50 }, { label: '75%', value: 0.75 }, { label: 'Max', value: 1 }].map((opt) => {
                          const pillPts = Math.floor(loyaltyMaxRedeemable * opt.value);
                          const isActive = redeemPoints > 0 && redeemPoints === pillPts;
                          return (
                            <TouchableOpacity key={opt.label} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: isActive ? '#f59e0b' : '#fff', borderWidth: 1, borderColor: isActive ? '#f59e0b' : '#d1d5db' }} onPress={() => setRedeemPoints(pillPts)}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: isActive ? '#fff' : '#6b7280' }}>{opt.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                        {redeemPoints > 0 && (
                          <TouchableOpacity style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 12, backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca' }} onPress={() => setRedeemPoints(0)}>
                            <Ionicons name="close" size={12} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#b45309' }}>
                          {redeemPoints > 0 ? `${redeemPoints} pts = -₹${loyaltyDiscount.toFixed(0)}` : 'Tap or slide to redeem'}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#92400e' }}>Max: {loyaltyMaxRedeemable} pts ({effectiveLoyaltySettings.maxRedemptionPercent || 20}%)</Text>
                      </View>
                    </>
                  ) : (customerData.loyaltyPoints || 0) > 0 ? (
                    <Text style={{ fontSize: 11, color: '#92400e' }}>Cannot redeem on current order (max {effectiveLoyaltySettings.maxRedemptionPercent || 20}% of bill)</Text>
                  ) : null}
                </View>
              )}

              {/* Manual Discount */}
              {billingSettings?.manualDiscountEnabled !== false && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                    <Ionicons name="pricetag-outline" size={10} color="#94a3b8" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Manual Discount</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb' }}>
                      <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: manualDiscountType === 'flat' ? '#dc2626' : '#f9fafb' }} onPress={() => setManualDiscountType('flat')}>
                        <Text style={{ color: manualDiscountType === 'flat' ? '#fff' : '#6b7280', fontWeight: '600', fontSize: 12 }}>Flat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: manualDiscountType === 'percentage' ? '#dc2626' : '#f9fafb' }} onPress={() => setManualDiscountType('percentage')}>
                        <Text style={{ color: manualDiscountType === 'percentage' ? '#fff' : '#6b7280', fontWeight: '600', fontSize: 12 }}>%</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '600', color: '#1f2937' }} placeholder={manualDiscountType === 'percentage' ? '0%' : '₹0'} placeholderTextColor="#9ca3af" keyboardType="numeric" value={manualDiscount} onChangeText={setManualDiscount} />
                  </View>
                  {manualDiscountAmount > 0 && (
                    <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: '500' }}>Discount: -₹{manualDiscountAmount.toFixed(0)}</Text>
                  )}
                </View>
              )}

              {/* Kitchen Notes */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                  <Ionicons name="document-text-outline" size={10} color="#94a3b8" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Kitchen Notes</Text>
                </View>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 13, color: '#374151', minHeight: 60, textAlignVertical: 'top' }}
                  placeholder="E.g., No onions, extra spicy, birthday celebration..."
                  placeholderTextColor="#9ca3af"
                  value={specialInstructions}
                  onChangeText={setSpecialInstructions}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </ScrollView>

            {/* Modal Footer — billing breakdown */}
            <View style={{ paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
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
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{billingSettings.serviceChargeLabel || 'Service Charge'}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>₹{billing.serviceChargeAmount.toFixed(0)}</Text>
                  </View>
                )}
                {billing.totalTax > 0 && billing.taxBreakdown.map((tax, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>{tax.name} ({tax.rate}%)</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>₹{tax.amount.toFixed(0)}</Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 4 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>Total</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b' }}>₹{billing.grandTotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: billing.totalDiscount > 0 ? '#dc2626' : '#dc2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => setShowOffersModal(false)}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                  {billing.totalDiscount > 0 ? `Apply & Save ₹${billing.totalDiscount.toFixed(0)}` : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer Detail Modal */}
      {showCustomerDetail && detailCustomerId && (
        <CustomerDetailModal
          visible={showCustomerDetail}
          onClose={() => setShowCustomerDetail(false)}
          customerId={detailCustomerId}
          restaurantId={restaurantId}
        />
      )}
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
    backgroundColor: Colors.backgroundWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
  },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.backgroundLight,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: 2,
  },
  itemCount: {
    fontSize: Typography.small.fontSize,
    color: Colors.textLight,
  },
  cartList: {
    paddingHorizontal: Spacing.lg,
    flexShrink: 1,
    paddingTop: 6,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  cartItemName: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
  },
  cartItemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.md,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.textDark,
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    padding: Spacing.xs,
  },
  cartItemTotal: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.primary,
    minWidth: 70,
    textAlign: 'right',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
  },
  emptySubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textLight,
  },
  notesToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  notesToggleActive: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  kitchenNotesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 8,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  summaryRowActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  earnBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  earnBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalLabel: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
  },
  totalAmount: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.primary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendButton: {
    backgroundColor: '#16a34a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    gap: Spacing.sm,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
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
