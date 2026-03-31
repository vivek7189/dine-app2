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
  LayoutAnimation,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import OfferSelector from './OfferSelector';
import CustomerDetailModal from './CustomerDetailModal';
import apiClient from '../services/api';

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

  // Billing state
  const [activeBillingPanel, setActiveBillingPanel] = useState(null);
  const [serviceChargeAmount, setServiceChargeAmount] = useState(0);
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
      setServiceChargeAmount(0);
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
  const totalDiscount = offerDiscount + manualDiscountAmount + loyaltyDiscount + compAmount;
  const discountedSubtotal = Math.max(0, subtotal - totalDiscount);

  // Auto-calculate service charge
  const calcServiceCharge = billingSettings.serviceChargeEnabled
    ? Math.round((discountedSubtotal * (billingSettings.serviceChargeRate || 0) / 100) * 100) / 100
    : 0;

  // Update service charge when discountedSubtotal changes
  useEffect(() => {
    setServiceChargeAmount(calcServiceCharge);
  }, [calcServiceCharge]);

  // Display total (pre-tax, shown in CartModal — tax added in menu.js)
  const displayTotal = discountedSubtotal + calcServiceCharge + tipAmount;

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
    totalDiscount,
    redeemLoyaltyPoints: redeemPoints,
    selectedOfferId,
    selectedOfferName: selectedOffer?.name || null,
    customerPhone: customerMobile || customerData?.phone || '',
    customerId: customerData?.id || customerData?._id || null,
    // Billing fields
    serviceChargeRate: billingSettings.serviceChargeEnabled ? billingSettings.serviceChargeRate : null,
    serviceChargeAmount: calcServiceCharge || null,
    tipAmount: tipAmount || null,
    tipPercentage: tipPercentage || null,
    cashReceived: cashReceived ? parseFloat(cashReceived) : null,
    changeReturned: changeAmount > 0 ? changeAmount : null,
    splitPayments: splitPayments.length > 0 ? splitPayments : null,
    paymentMethod: splitPayments.length > 0 ? 'split' : paymentMethod,
    partialPayAmount: partialPayAmount ? parseFloat(partialPayAmount) : null,
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

  const handleCompleteBill = () => {
    if (onCompleteBill) {
      onCompleteBill(orderType, paymentMethod, customerName, customerMobile, buildDiscountData());
    }
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

                {/* Billing Toolbar */}
                {(() => {
                  const billingButtons = [];
                  if (billingSettings.serviceChargeEnabled) billingButtons.push({ key: 'service', icon: 'add-circle-outline', label: 'SC', color: '#059669' });
                  if (billingSettings.roundOffEnabled) billingButtons.push({ key: 'roundoff', icon: 'refresh-outline', label: 'Round', color: '#7c3aed' });
                  if (billingSettings.cashTenderingEnabled) billingButtons.push({ key: 'cash', icon: 'cash-outline', label: 'Cash', color: '#d97706' });
                  if (billingSettings.splitPaymentEnabled) billingButtons.push({ key: 'split', icon: 'git-branch-outline', label: 'Split', color: '#2563eb' });
                  if (billingSettings.tipsEnabled) billingButtons.push({ key: 'tip', icon: 'heart-outline', label: 'Tip', color: '#ec4899' });
                  if (billingSettings.partialPaymentEnabled) billingButtons.push({ key: 'partial', icon: 'wallet-outline', label: 'Khata', color: '#f59e0b' });
                  if (billingSettings.compVoidEnabled) {
                    billingButtons.push({ key: 'comp', icon: 'gift-outline', label: 'Comp', color: '#14b8a6' });
                    billingButtons.push({ key: 'void', icon: 'close-circle-outline', label: 'Void', color: '#ef4444' });
                  }

                  if (billingButtons.length === 0) return null;

                  return (
                    <View style={styles.billingSection}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.billingToolbar}>
                        {billingButtons.map((btn) => {
                          const isActive = activeBillingPanel === btn.key ||
                            (btn.key === 'service' && calcServiceCharge > 0) ||
                            (btn.key === 'tip' && tipAmount > 0) ||
                            (btn.key === 'split' && splitPayments.length > 0) ||
                            (btn.key === 'cash' && cashReceived) ||
                            (btn.key === 'partial' && partialPayAmount) ||
                            (btn.key === 'comp' && selectedCompItems.length > 0) ||
                            (btn.key === 'void' && selectedVoidItems.length > 0);
                          return (
                            <TouchableOpacity
                              key={btn.key}
                              style={[styles.billingIconBtn, isActive && { backgroundColor: btn.color }]}
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setActiveBillingPanel(activeBillingPanel === btn.key ? null : btn.key);
                              }}
                            >
                              <Ionicons name={btn.icon} size={16} color={isActive ? '#fff' : btn.color} />
                              <Text style={[styles.billingIconLabel, isActive && { color: '#fff' }]}>{btn.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {/* Cash Tendering Panel */}
                      {activeBillingPanel === 'cash' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Cash Tendering</Text>
                          <TextInput
                            style={styles.panelInput}
                            placeholder="Cash Received"
                            placeholderTextColor="#9ca3af"
                            keyboardType="numeric"
                            value={cashReceived}
                            onChangeText={(v) => {
                              setCashReceived(v);
                              const received = parseFloat(v) || 0;
                              setChangeAmount(Math.max(0, Math.round((received - displayTotal) * 100) / 100));
                            }}
                          />
                          <View style={styles.denomRow}>
                            {(billingSettings.denominations || [100, 200, 500, 2000]).map((d) => (
                              <TouchableOpacity
                                key={d}
                                style={styles.denomBtn}
                                onPress={() => {
                                  setCashReceived(String(d));
                                  setChangeAmount(Math.max(0, Math.round((d - displayTotal) * 100) / 100));
                                }}
                              >
                                <Text style={styles.denomBtnText}>{d >= 1000 ? `${d/1000}K` : `₹${d}`}</Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity
                              style={[styles.denomBtn, { backgroundColor: '#059669' }]}
                              onPress={() => {
                                setCashReceived(String(Math.ceil(displayTotal)));
                                setChangeAmount(0);
                              }}
                            >
                              <Text style={[styles.denomBtnText, { color: '#fff' }]}>Exact</Text>
                            </TouchableOpacity>
                          </View>
                          {parseFloat(cashReceived) > 0 && (
                            <View style={styles.changeRow}>
                              <Text style={styles.changeLabel}>Change to Return:</Text>
                              <Text style={styles.changeValue}>₹{changeAmount.toFixed(2)}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Split Payment Panel */}
                      {activeBillingPanel === 'split' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Split Payment</Text>
                          {splitPayments.map((sp, idx) => (
                            <View key={idx} style={styles.splitRow}>
                              <View style={styles.splitMethodBtns}>
                                {['cash', 'upi', 'card'].map((m) => (
                                  <TouchableOpacity
                                    key={m}
                                    style={[styles.splitMethodBtn, sp.method === m && styles.splitMethodBtnActive]}
                                    onPress={() => {
                                      const updated = [...splitPayments];
                                      updated[idx] = { ...sp, method: m };
                                      setSplitPayments(updated);
                                    }}
                                  >
                                    <Text style={[styles.splitMethodText, sp.method === m && { color: '#fff' }]}>
                                      {m.charAt(0).toUpperCase() + m.slice(1)}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                              <TextInput
                                style={styles.splitAmountInput}
                                placeholder="₹ Amount"
                                placeholderTextColor="#9ca3af"
                                keyboardType="numeric"
                                value={sp.amount ? String(sp.amount) : ''}
                                onChangeText={(v) => {
                                  const updated = [...splitPayments];
                                  updated[idx] = { ...sp, amount: parseFloat(v) || 0 };
                                  setSplitPayments(updated);
                                }}
                              />
                              <TouchableOpacity onPress={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}>
                                <Ionicons name="close-circle" size={22} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          ))}
                          <TouchableOpacity
                            style={styles.addSplitBtn}
                            onPress={() => setSplitPayments([...splitPayments, { method: 'cash', amount: 0 }])}
                          >
                            <Ionicons name="add" size={16} color="#2563eb" />
                            <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: 13 }}>Add Payment</Text>
                          </TouchableOpacity>
                          {splitPayments.length > 0 && (
                            <View style={styles.changeRow}>
                              <Text style={styles.changeLabel}>Remaining:</Text>
                              <Text style={[styles.changeValue, {
                                color: (displayTotal - splitPayments.reduce((s, p) => s + (p.amount || 0), 0)) > 0.01 ? '#ef4444' : '#059669'
                              }]}>
                                ₹{Math.max(0, displayTotal - splitPayments.reduce((s, p) => s + (p.amount || 0), 0)).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Tip Panel */}
                      {activeBillingPanel === 'tip' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Add Tip</Text>
                          <View style={styles.denomRow}>
                            {(billingSettings.tipPresets || [5, 10, 15, 20]).map((pct) => (
                              <TouchableOpacity
                                key={pct}
                                style={[styles.denomBtn, tipPercentage === pct && { backgroundColor: '#ec4899' }]}
                                onPress={() => {
                                  setTipPercentage(pct);
                                  setTipAmount(Math.round(discountedSubtotal * pct / 100 * 100) / 100);
                                }}
                              >
                                <Text style={[styles.denomBtnText, tipPercentage === pct && { color: '#fff' }]}>{pct}%</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <TextInput
                            style={[styles.panelInput, { marginTop: 8 }]}
                            placeholder="Custom tip amount"
                            placeholderTextColor="#9ca3af"
                            keyboardType="numeric"
                            value={tipAmount ? String(tipAmount) : ''}
                            onChangeText={(v) => {
                              setTipPercentage(null);
                              setTipAmount(parseFloat(v) || 0);
                            }}
                          />
                          {tipAmount > 0 && (
                            <View style={styles.changeRow}>
                              <Text style={styles.changeLabel}>Tip:</Text>
                              <Text style={[styles.changeValue, { color: '#ec4899' }]}>₹{tipAmount.toFixed(2)}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Partial Payment Panel */}
                      {activeBillingPanel === 'partial' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Partial Payment (Khata)</Text>
                          {customerData?.outstandingBalance > 0 && (
                            <View style={[styles.changeRow, { marginBottom: 8, backgroundColor: '#fef2f2', padding: 8, borderRadius: 6 }]}>
                              <Text style={{ fontSize: 12, color: '#dc2626' }}>Existing Balance:</Text>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>₹{customerData.outstandingBalance}</Text>
                            </View>
                          )}
                          <TextInput
                            style={styles.panelInput}
                            placeholder="Amount paying now"
                            placeholderTextColor="#9ca3af"
                            keyboardType="numeric"
                            value={partialPayAmount}
                            onChangeText={setPartialPayAmount}
                          />
                          {partialPayAmount && (
                            <View style={styles.changeRow}>
                              <Text style={styles.changeLabel}>Outstanding after:</Text>
                              <Text style={[styles.changeValue, { color: '#f59e0b' }]}>
                                ₹{Math.max(0, displayTotal - (parseFloat(partialPayAmount) || 0)).toFixed(2)}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Comp Panel */}
                      {activeBillingPanel === 'comp' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Comp Items</Text>
                          {cart.map((item) => {
                            const isSelected = selectedCompItems.some(c => c.id === item.id);
                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[styles.compItemRow, isSelected && { backgroundColor: '#ecfdf5' }]}
                                onPress={() => {
                                  if (isSelected) {
                                    setSelectedCompItems(selectedCompItems.filter(c => c.id !== item.id));
                                  } else {
                                    setSelectedCompItems([...selectedCompItems, item]);
                                  }
                                }}
                              >
                                <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={isSelected ? '#14b8a6' : '#9ca3af'} />
                                <Text style={{ flex: 1, fontSize: 13, color: Colors.textDark }}>{item.quantity}x {item.name}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textDark }}>₹{(item.price * item.quantity).toFixed(0)}</Text>
                              </TouchableOpacity>
                            );
                          })}
                          <TextInput
                            style={[styles.panelInput, { marginTop: 8 }]}
                            placeholder="Reason for comp"
                            placeholderTextColor="#9ca3af"
                            value={compReason}
                            onChangeText={setCompReason}
                          />
                          {billingSettings.compVoidRequiresPin && (
                            <TextInput
                              style={[styles.panelInput, { marginTop: 6 }]}
                              placeholder="Manager PIN"
                              placeholderTextColor="#9ca3af"
                              secureTextEntry
                              keyboardType="number-pad"
                              value={billingManagerPin}
                              onChangeText={setBillingManagerPin}
                              maxLength={6}
                            />
                          )}
                        </View>
                      )}

                      {/* Void Panel */}
                      {activeBillingPanel === 'void' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Void Items</Text>
                          {cart.map((item) => {
                            const isSelected = selectedVoidItems.some(v => v.id === item.id);
                            return (
                              <TouchableOpacity
                                key={item.id}
                                style={[styles.compItemRow, isSelected && { backgroundColor: '#fef2f2' }]}
                                onPress={() => {
                                  if (isSelected) {
                                    setSelectedVoidItems(selectedVoidItems.filter(v => v.id !== item.id));
                                  } else {
                                    setSelectedVoidItems([...selectedVoidItems, item]);
                                  }
                                }}
                              >
                                <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={isSelected ? '#ef4444' : '#9ca3af'} />
                                <Text style={{ flex: 1, fontSize: 13, color: Colors.textDark }}>{item.quantity}x {item.name}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textDark }}>₹{(item.price * item.quantity).toFixed(0)}</Text>
                              </TouchableOpacity>
                            );
                          })}
                          <TextInput
                            style={[styles.panelInput, { marginTop: 8 }]}
                            placeholder="Reason for void"
                            placeholderTextColor="#9ca3af"
                            value={voidReason}
                            onChangeText={setVoidReason}
                          />
                          {billingSettings.compVoidRequiresPin && (
                            <TextInput
                              style={[styles.panelInput, { marginTop: 6 }]}
                              placeholder="Manager PIN"
                              placeholderTextColor="#9ca3af"
                              secureTextEntry
                              keyboardType="number-pad"
                              value={billingManagerPin}
                              onChangeText={setBillingManagerPin}
                              maxLength={6}
                            />
                          )}
                        </View>
                      )}

                      {/* Round-off Info (read-only) */}
                      {activeBillingPanel === 'roundoff' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>Round-off</Text>
                          <Text style={{ fontSize: 13, color: Colors.textMedium, marginBottom: 8 }}>
                            Bills will be automatically rounded to the nearest ₹{billingSettings.roundOffTo || 1}.
                          </Text>
                          <View style={styles.changeRow}>
                            <Text style={styles.changeLabel}>Round to:</Text>
                            <Text style={styles.changeValue}>₹{billingSettings.roundOffTo || 1}</Text>
                          </View>
                        </View>
                      )}

                      {/* Service Charge Info (read-only) */}
                      {activeBillingPanel === 'service' && (
                        <View style={styles.billingPanel}>
                          <Text style={styles.panelTitle}>{billingSettings.serviceChargeLabel || 'Service Charge'}</Text>
                          <View style={styles.changeRow}>
                            <Text style={styles.changeLabel}>Rate:</Text>
                            <Text style={styles.changeValue}>{billingSettings.serviceChargeRate || 0}%</Text>
                          </View>
                          <View style={styles.changeRow}>
                            <Text style={styles.changeLabel}>Amount:</Text>
                            <Text style={[styles.changeValue, { color: '#059669' }]}>₹{calcServiceCharge.toFixed(2)}</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })()}

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
                  {compAmount > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={[styles.pricingLabel, { color: '#14b8a6' }]}>Comp Items:</Text>
                      <Text style={[styles.pricingValue, { color: '#14b8a6' }]}>-₹{compAmount.toFixed(2)}</Text>
                    </View>
                  )}
                  {calcServiceCharge > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={styles.pricingLabel}>{billingSettings.serviceChargeLabel || 'Service Charge'} ({billingSettings.serviceChargeRate}%):</Text>
                      <Text style={styles.pricingValue}>₹{calcServiceCharge.toFixed(2)}</Text>
                    </View>
                  )}
                  {tipAmount > 0 && (
                    <View style={styles.pricingRow}>
                      <Text style={[styles.pricingLabel, { color: '#ec4899' }]}>Tip{tipPercentage ? ` (${tipPercentage}%)` : ''}:</Text>
                      <Text style={[styles.pricingValue, { color: '#ec4899' }]}>₹{tipAmount.toFixed(2)}</Text>
                    </View>
                  )}
                </View>

                {/* Total */}
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>₹{displayTotal.toFixed(2)}</Text>
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

                {/* Payment Method — hidden when split payment active */}
                {splitPayments.length === 0 && (
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
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <View style={styles.dualButtonRow}>
                    <TouchableOpacity
                      style={[styles.placeOrderButton, styles.kitchenButton, sending && { opacity: 0.6 }]}
                      onPress={handlePlaceOrder}
                      disabled={sending}
                    >
                      {sending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="flame-outline" size={18} color="#fff" />
                          <Text style={styles.placeOrderButtonText}>Place Order</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {onCompleteBill && (
                      <TouchableOpacity
                        style={[styles.placeOrderButton, styles.completeBillButton, sending && { opacity: 0.6 }]}
                        onPress={handleCompleteBill}
                        disabled={sending}
                      >
                        {sending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={18} color="#fff" />
                            <Text style={styles.placeOrderButtonText}>Complete Bill</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
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
  dualButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  placeOrderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
  },
  kitchenButton: {
    backgroundColor: '#374151',
  },
  completeBillButton: {
    backgroundColor: '#10b981',
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
  // Billing toolbar & panels
  billingSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  billingToolbar: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  billingIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  billingIconLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  billingPanel: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  panelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 8,
  },
  panelInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: Colors.textDark,
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  denomBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  denomBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  changeLabel: {
    fontSize: 13,
    color: Colors.textMedium,
  },
  changeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  splitMethodBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  splitMethodBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  splitMethodBtnActive: {
    backgroundColor: '#2563eb',
  },
  splitMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  splitAmountInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: Colors.textDark,
  },
  addSplitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  compItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
});
