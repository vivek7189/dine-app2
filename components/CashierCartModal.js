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
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import CustomerLookup from './CustomerLookup';
import OfferSelector from './OfferSelector';
import CustomerDetailModal from './CustomerDetailModal';
import apiClient from '../services/api';

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
}) {
  const [orderType, setOrderType] = useState('counter');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

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

  // Calculate totals
  const subtotal = total;
  const taxRate = taxSettings.enabled ? (taxSettings.rate || 0) : 0;

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

  const taxAmount = discountedSubtotal * (taxRate / 100);
  // Display total includes service charge and tip (tax is shown separately)
  const displayTotal = discountedSubtotal + taxAmount + calcServiceCharge + tipAmount;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleCustomerFound = useCallback((customer, settings) => {
    setCustomerData(customer);
    setLoyaltySettings(settings);
    if (customer) {
      setCustomerName(customer.name || '');
      setCustomerMobile(customer.phone || '');
    }
    // Reset redemption when customer changes
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

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemLeft}>
        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cartItemPrice}>₹{item.price} x {item.quantity} = <Text style={styles.cartItemTotal}>₹{item.price * item.quantity}</Text></Text>
      </View>
      <View style={styles.cartItemRight}>
        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={14} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={[styles.quantityButton, styles.quantityButtonAdd]}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemoveItem(item.id)}
        >
          <Ionicons name="trash-outline" size={16} color={Colors.error} />
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
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.title}>New Bill</Text>
            <Text style={styles.subtitle}>{itemCount} items</Text>
          </View>

          {/* Order Type Tabs */}
          <View style={styles.orderTypeSection}>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'counter' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('counter'); onOrderTypeChange?.('counter'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'counter' && styles.orderTypeTextActive]}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'takeaway' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('takeaway'); onOrderTypeChange?.('takeaway'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'takeaway' && styles.orderTypeTextActive]}>Takeaway</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.orderTypeTab, orderType === 'delivery' && styles.orderTypeTabActive]}
              onPress={() => { setOrderType('delivery'); onOrderTypeChange?.('delivery'); }}
            >
              <Text style={[styles.orderTypeText, orderType === 'delivery' && styles.orderTypeTextActive]}>Delivery</Text>
            </TouchableOpacity>
          </View>
          {multiPricingEnabled && activePricingRuleName && (
            <View style={{ backgroundColor: '#ede9fe', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginLeft: 16, marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>Zone: {activePricingRuleName}</Text>
            </View>
          )}
        </SafeAreaView>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

              {/* Bill Summary */}
              <View style={styles.billSection}>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Subtotal</Text>
                  <Text style={styles.billValue}>₹{subtotal.toFixed(2)}</Text>
                </View>

                {offerDiscount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>
                      {selectedOffer?.name || 'Offer'} Discount
                    </Text>
                    <Text style={styles.billValueGreen}>-₹{offerDiscount.toFixed(2)}</Text>
                  </View>
                )}

                {manualDiscountAmount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>Manual Discount</Text>
                    <Text style={styles.billValueGreen}>-₹{manualDiscountAmount.toFixed(2)}</Text>
                  </View>
                )}

                {loyaltyDiscount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabelGreen}>Loyalty Points ({redeemPoints} pts)</Text>
                    <Text style={styles.billValueGreen}>-₹{loyaltyDiscount.toFixed(2)}</Text>
                  </View>
                )}

                {compAmount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabelGreen, { color: '#14b8a6' }]}>Comp Items</Text>
                    <Text style={[styles.billValueGreen, { color: '#14b8a6' }]}>-₹{compAmount.toFixed(2)}</Text>
                  </View>
                )}

                {calcServiceCharge > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>{billingSettings.serviceChargeLabel || 'Service Charge'} ({billingSettings.serviceChargeRate}%)</Text>
                    <Text style={styles.billValue}>₹{calcServiceCharge.toFixed(2)}</Text>
                  </View>
                )}

                {taxSettings.enabled && taxRate > 0 && (
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Tax ({taxRate}%)</Text>
                    <Text style={styles.billValue}>₹{taxAmount.toFixed(2)}</Text>
                  </View>
                )}

                {tipAmount > 0 && (
                  <View style={styles.billRow}>
                    <Text style={[styles.billLabel, { color: '#ec4899' }]}>Tip{tipPercentage ? ` (${tipPercentage}%)` : ''}</Text>
                    <Text style={[styles.billValue, { color: '#ec4899' }]}>₹{tipAmount.toFixed(2)}</Text>
                  </View>
                )}

                <View style={styles.billTotalRow}>
                  <Text style={styles.billTotalLabel}>Total</Text>
                  <Text style={styles.billTotalValue}>₹{displayTotal.toFixed(2)}</Text>
                </View>

                {totalDiscount > 0 && (
                  <Text style={styles.savingsText}>You save ₹{totalDiscount.toFixed(0)}</Text>
                )}
              </View>

              {/* Customer Name (if not from lookup) */}
              {!customerData && (
                <View style={styles.customerSection}>
                  <TextInput
                    style={styles.input}
                    placeholder="Customer Name (optional)"
                    placeholderTextColor="#999"
                    value={customerName}
                    onChangeText={setCustomerName}
                  />
                </View>
              )}

              {/* Payment Method - Compact Pills (hidden when split payment active) */}
              {splitPayments.length === 0 && (
                <View style={styles.paymentSection}>
                  <Text style={styles.paymentLabel}>Payment</Text>
                  <View style={styles.paymentPills}>
                    <TouchableOpacity
                      style={[styles.paymentPill, paymentMethod === 'cash' && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod('cash')}
                    >
                      <Text style={[styles.paymentPillText, paymentMethod === 'cash' && styles.paymentPillTextActive]}>Cash</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paymentPill, paymentMethod === 'upi' && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod('upi')}
                    >
                      <Text style={[styles.paymentPillText, paymentMethod === 'upi' && styles.paymentPillTextActive]}>UPI</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paymentPill, paymentMethod === 'card' && styles.paymentPillActive]}
                      onPress={() => setPaymentMethod('card')}
                    >
                      <Text style={[styles.paymentPillText, paymentMethod === 'card' && styles.paymentPillTextActive]}>Card</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
                  <Text style={styles.completeButtonText}>Complete Billing</Text>
                  <Text style={styles.completeButtonAmount}>₹{displayTotal.toFixed(2)}</Text>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  orderTypeSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
  orderTypeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
  },
  orderTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  orderTypeTextActive: {
    color: '#10b981',
  },
  scrollContent: {
    flex: 1,
  },
  cartSection: {
    backgroundColor: '#fff',
    marginTop: 8,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartItemLeft: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 13,
    color: '#6b7280',
  },
  cartItemTotal: {
    fontWeight: '700',
    color: '#10b981',
  },
  cartItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityButtonAdd: {
    backgroundColor: '#10b981',
  },
  quantityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    minWidth: 28,
    textAlign: 'center',
  },
  removeButton: {
    padding: 4,
  },
  billSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  billValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  billLabelGreen: {
    fontSize: 14,
    color: '#10b981',
  },
  billValueGreen: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  billTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  billTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
    textAlign: 'right',
    marginTop: 6,
  },
  customerSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  paymentSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  paymentPills: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  paymentPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  paymentPillActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  paymentPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  paymentPillTextActive: {
    color: '#fff',
  },
  bottomAction: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  completeButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  completeButtonAmount: {
    fontSize: 18,
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
  // Billing toolbar & panels
  billingSection: {
    backgroundColor: '#fff',
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    color: '#1f2937',
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
    color: '#1f2937',
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
    color: '#6b7280',
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
    color: '#1f2937',
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
