import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

  // Offers state
  const [showOffersModal, setShowOffersModal] = useState(false);

  // Manual discount (kept minimal)
  const [manualDiscount, setManualDiscount] = useState('');
  const [manualDiscountType, setManualDiscountType] = useState('flat');
  const manualDiscountAmount = 0; // Waiters don't apply manual discounts

  // Offer engine
  const {
    genericOffers, personalizedOffers, applicableOffers,
    selectedOfferId, setSelectedOfferId,
    selectedOfferIds, setSelectedOfferIds,
    offerDiscount, loyaltyDiscount, freeItems,
    offerSettings,
  } = useOfferEngine({
    restaurantId,
    subtotal,
    cart,
    customerData,
    redeemPoints,
    loyaltySettings,
    options: { autoApply: true },
  });

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
    if (!loyaltySettings?.enabled || !customerData) return 0;
    const earnPerAmount = loyaltySettings.earnPerAmount || 100;
    const pointsRate = loyaltySettings.pointsPerUnit || 1;
    const base = Math.max(0, subtotal - offerDiscount - manualDiscountAmount - loyaltyDiscount);
    return Math.floor(base / earnPerAmount) * pointsRate;
  }, [loyaltySettings, subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, redeemPoints]);

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
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 }}>
                  <Ionicons name="restaurant-outline" size={13} color="#10b981" />
                  <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{selectedTable?.name || tableNumberProp}</Text>
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
                      <Ionicons name="checkmark-circle" size={14} color="#10b981" />
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
                <Ionicons name="location-outline" size={11} color="#10b981" />
                <Text style={{ fontSize: 11, color: '#10b981', fontWeight: '600' }}>{matchedFloor.floorName}</Text>
              </View>
            )}
          </View>

          {/* Cart Items */}
          <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
                <Text style={styles.emptySubtext}>Add items to place order</Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={cart}
                  renderItem={renderCartItem}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />

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
              {/* Customer Phone + Offers — same line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 6, paddingBottom: 4, gap: 6 }}>
                {/* Phone input (flex) */}
                {restaurantId && (
                  <View style={{ flex: 1 }}>
                    <CustomerLookup
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
                    />
                  </View>
                )}

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
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: hasApplied ? '#f0fdf4' : '#eef2ff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: hasApplied ? '#bbf7d0' : '#e0e7ff' }}
                      onPress={() => setShowOffersModal(true)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pricetag" size={13} color={hasApplied ? '#16a34a' : '#6366f1'} />
                      {hasApplied ? (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>
                          -₹{(offerDiscount + loyaltyDiscount).toFixed(0)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#6366f1' }}>
                          {applicableOffers.length}
                        </Text>
                      )}
                      <Ionicons name="chevron-forward" size={12} color={hasApplied ? '#86efac' : '#a5b4fc'} />
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
                    <Text style={{ fontSize: 12, color: '#16a34a' }}>
                      {offerDiscount > 0 && loyaltyDiscount > 0 ? 'Offers + Loyalty' : offerDiscount > 0 ? 'Offers' : 'Loyalty'}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16a34a' }}>-₹{billing.totalDiscount.toFixed(0)}</Text>
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
                <Text style={[styles.totalLabel, { fontSize: fs(16) }]}>Total</Text>
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

      {/* Offers Modal */}
      <Modal visible={showOffersModal} transparent animationType="slide" onRequestClose={() => setShowOffersModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: Math.max(insets.bottom, 16) }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: '#eef2ff', borderRadius: 10, padding: 6 }}>
                  <Ionicons name="receipt-outline" size={18} color="#6366f1" />
                </View>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>Order Details</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{itemCount} items · ₹{subtotal.toFixed(0)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowOffersModal(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {/* Customer Info Card */}
              {customerData && (
                <View style={{ backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#dcfce7', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="person" size={18} color="#16a34a" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{customerData.name || 'Customer'}</Text>
                    <Text style={{ fontSize: 11, color: '#6b7280' }}>{customerData.phone}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>{customerData.totalOrders || 0}</Text>
                      <Text style={{ fontSize: 9, color: '#9ca3af' }}>Orders</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#b45309' }}>{customerData.loyaltyPoints || 0}</Text>
                      <Text style={{ fontSize: 9, color: '#9ca3af' }}>Points</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Offers List */}
              {applicableOffers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>Available Offers</Text>
                  {applicableOffers.map((offer) => {
                    const oid = offer.id || offer._id;
                    const isMulti = offerSettings?.allowMultipleOffers;
                    const isSelected = isMulti ? selectedOfferIds.includes(oid) : selectedOfferId === oid;
                    const result = calculateOfferResult(offer, subtotal, cart, {});
                    return (
                      <TouchableOpacity
                        key={oid}
                        style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 6, backgroundColor: isSelected ? '#f0fdf4' : '#f9fafb', borderWidth: 1, borderColor: isSelected ? '#86efac' : '#f3f4f6' }}
                        onPress={() => {
                          if (isMulti) {
                            setSelectedOfferIds(prev => prev.includes(oid) ? prev.filter(id => id !== oid) : [...prev, oid]);
                          } else {
                            setSelectedOfferId(selectedOfferId === oid ? null : oid);
                          }
                        }}
                      >
                        <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={isSelected ? '#16a34a' : '#d1d5db'} />
                        <View style={{ flex: 1, marginLeft: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e293b' }}>{offer.name}</Text>
                          {offer.description ? <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }} numberOfLines={1}>{offer.description}</Text> : null}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#16a34a' }}>-₹{(result?.discount || 0).toFixed(0)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Loyalty Section */}
              {loyaltySettings?.enabled && customerData && (
                <View style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="star" size={16} color="#f59e0b" />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400e' }}>Loyalty Points</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: '#b45309' }}>{customerData.loyaltyPoints || 0} available</Text>
                  </View>
                  {loyaltyPointsToEarn > 0 && (
                    <Text style={{ fontSize: 11, color: '#16a34a', marginTop: 6 }}>+{loyaltyPointsToEarn} points will be earned on this order</Text>
                  )}
                </View>
              )}
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
                style={{ backgroundColor: billing.totalDiscount > 0 ? '#10b981' : '#4f46e5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
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
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  summaryRowActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
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
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
});
