import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { getCached, setCache } from '../services/cacheManager';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/Theme';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import { getCurrencySymbol } from '../utils/formatCurrency';
import { seatLetter } from '../utils/seatOrdering';
import BillingToolbar from './billing/BillingToolbar';
import BillingPanels from './billing/BillingPanels';

export default function OrderDetailsModal({ visible, onClose, orderId, tableNumber, restaurantId, onAddItems, onCompleteBill, onPrintPreBill, userRole, billingSettings = {}, posSettings = {} }) {
  const { modalWidth } = useResponsive();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Role gate mirrors web: waiters never settle; everyone else is gated by the configured
  // billingSettings.completeBillingRoles (empty/unset ⇒ all non-waiter roles, incl. cashier).
  const roleLc = (userRole || '').toLowerCase();
  const completeRoles = billingSettings.completeBillingRoles;
  const roleAllowed = !completeRoles || completeRoles.length === 0
    ? true
    : completeRoles.map((r) => String(r).toLowerCase()).includes(roleLc);
  const canCompleteBill = roleLc !== 'waiter' && roleAllowed;

  // Per-feature role gate (empty/unset ⇒ all roles allowed), same semantics as CartModal.
  const isRoleAllowed = (rolesArr) => {
    if (!rolesArr || rolesArr.length === 0) return true;
    return rolesArr.map((r) => String(r).toLowerCase()).includes(roleLc);
  };

  // ── Settle-time billing controls (web parity: payment method + tender/split/tip/khata) ──
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [activeBillingPanel, setActiveBillingPanel] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  const [splitPayments, setSplitPayments] = useState([]);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipPercentage, setTipPercentage] = useState(null);
  const [partialPayAmount, setPartialPayAmount] = useState('');
  const [settling, setSettling] = useState(false);

  // Reset settle controls whenever the modal opens a different order.
  useEffect(() => {
    setPaymentMethod('cash'); setActiveBillingPanel(null);
    setCashReceived(''); setChangeAmount(0); setSplitPayments([]);
    setTipAmount(0); setTipPercentage(null); setPartialPayAmount('');
  }, [orderId, visible]);

  // Payment methods — mirror CartModal/web: posSettings.paymentMethods else defaults
  // (upi/card hidden via hideUPI/hideCard); role-restricted to cash when disallowed.
  const paymentMethodOptions = (() => {
    let list;
    if (Array.isArray(posSettings.paymentMethods) && posSettings.paymentMethods.length > 0) {
      list = posSettings.paymentMethods
        .filter((m) => m && (typeof m === 'string' || m.enabled !== false))
        .map((m) => (typeof m === 'string' ? m : (m.id || m.value || m.name || m.method)))
        .filter(Boolean);
    } else {
      list = ['cash'];
      if (!posSettings.hideUPI) list.push('upi');
      if (!posSettings.hideCard) list.push('card');
    }
    if (!isRoleAllowed(billingSettings.paymentMethodRoles)) list = list.filter((m) => String(m).toLowerCase() === 'cash');
    return list;
  })();

  // Safe number helper — Firestore can return strings or undefined for numeric fields
  const num = (val) => {
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  };

  useEffect(() => {
    if (visible && orderId && restaurantId) {
      loadOrderDetails();
    } else {
      setOrder(null);
      setError(null);
    }
  }, [visible, orderId, restaurantId]);

  const loadOrderDetails = async () => {
    setError(null);

    // Show cached order instantly while fetching fresh data
    const cacheKey = `order_${orderId}`;
    const cached = await getCached(cacheKey);
    if (cached?.data) {
      setOrder(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const response = await apiClient.getOrders(restaurantId, { search: orderId, limit: 1 });
      let freshOrder = null;
      if (response?.orders && response.orders.length > 0) {
        freshOrder = response.orders[0];
      } else if (response?.order) {
        freshOrder = response.order;
      }
      if (freshOrder) {
        setOrder(freshOrder);
        setCache(cacheKey, freshOrder);
      } else if (!cached?.data) {
        setError('Order not found');
      }
    } catch (err) {
      console.warn('OrderDetailsModal: Failed to load order', orderId, err?.message);
      if (!cached?.data) {
        // Show user-friendly message for permission errors
        const msg = err?.message || '';
        if (msg.includes('403') || msg.includes('Access denied') || msg.includes('permission')) {
          setError('You don\'t have permission to view order details. Contact your admin.');
        } else {
          setError(msg || 'Failed to load order details');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    if (!order?.items || !Array.isArray(order.items)) return 0;
    return order.items.reduce((sum, item) => sum + (num(item.price) * num(item.quantity || 1)), 0);
  };

  const formatDate = (dateInput) => {
    if (!dateInput) return 'N/A';
    try {
      let date;
      if (dateInput.toDate && typeof dateInput.toDate === 'function') date = dateInput.toDate();
      else if (dateInput._seconds) date = new Date(dateInput._seconds * 1000);
      else if (dateInput instanceof Date) date = dateInput;
      else date = new Date(dateInput);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch (e) {
      return 'N/A';
    }
  };

  const statusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'confirmed' || s === 'preparing') return { bg: '#fef3c7', fg: '#b45309', dot: '#f59e0b' };
    if (s === 'ready') return { bg: '#d1fae5', fg: '#047857', dot: '#10b981' };
    if (s === 'completed') return { bg: '#dbeafe', fg: '#1d4ed8', dot: '#3b82f6' };
    if (s === 'cancelled') return { bg: '#fee2e2', fg: '#b91c1c', dot: '#ef4444' };
    return { bg: '#e5e7eb', fg: '#374151', dot: '#6b7280' };
  };

  const finalTotal = num(order?.finalAmount) || calculateTotal();
  // Tip is collected at settle time and adds on top of the order's stored total.
  const settleTotal = Math.round((finalTotal + (tipAmount || 0)) * 100) / 100;
  const sStyle = statusStyle(order?.status);
  const orderNumberShort = order?.dailyOrderId || order?.orderNumber || '';

  // Build the settlement payload passed to onCompleteBill(order, settlementData).
  const buildSettlementData = () => {
    const usingSplit = splitPayments.length > 0;
    const pp = partialPayAmount !== '' && partialPayAmount != null ? parseFloat(partialPayAmount) : null;
    let paymentStatus = 'paid', paidAmount = settleTotal, outstandingAmount = 0;
    if (pp != null && pp === 0) { paymentStatus = 'due'; paidAmount = 0; outstandingAmount = settleTotal; }
    else if (pp != null && pp > 0 && pp < settleTotal) { paymentStatus = 'partial'; paidAmount = Math.round(pp * 100) / 100; outstandingAmount = Math.round((settleTotal - pp) * 100) / 100; }
    return {
      paymentMethod: usingSplit ? 'split' : paymentMethod,
      splitPayments: usingSplit ? splitPayments : null,
      cashReceived: cashReceived ? parseFloat(cashReceived) : null,
      changeReturned: changeAmount > 0 ? changeAmount : null,
      tipAmount: tipAmount || null,
      tipPercentage: tipPercentage || null,
      partialPayAmount: pp,
      paymentStatus, paidAmount, outstandingAmount,
      finalAmount: settleTotal,
    };
  };

  const handleSettle = () => {
    if (settling) return;
    // Validate split totals if used
    if (splitPayments.length > 0) {
      const sum = splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (Math.abs(sum - settleTotal) > 0.5) {
        setError(`Split payments (${getCurrencySymbol()}${sum.toFixed(2)}) must equal total ${getCurrencySymbol()}${settleTotal.toFixed(2)}`);
        return;
      }
    }
    setSettling(true);
    try {
      onCompleteBill(order, buildSettlementData());
    } finally {
      setSettling(false);
    }
  };

  // Safely render content — catch any unexpected data shape issues
  let renderError = null;
  let headerContent = null;
  try {
    headerContent = (
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="receipt" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerLabel}>ORDER</Text>
            <Text style={styles.headerTitle}>#{orderNumberShort}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {order?.status && (
          <View style={styles.headerMetaRow}>
            <View style={[styles.statusPill, { backgroundColor: sStyle.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: sStyle.dot }]} />
              <Text style={[styles.statusPillText, { color: sStyle.fg }]}>{String(order.status || '').toUpperCase()}</Text>
            </View>
            {(tableNumber || order?.tableNumber) ? (
              <View style={styles.headerChipWhite}>
                <Ionicons name="restaurant" size={12} color="#fff" />
                <Text style={styles.headerChipText}>Table {tableNumber || order.tableNumber}{order?.floorName ? ` · ${order.floorName}` : ''}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  } catch (e) {
    console.error('OrderDetailsModal: header render error', e);
    renderError = e?.message || 'Failed to render order';
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalContainer, modalWidth(520)]}>
          {/* Header */}
          {renderError ? (
            <View style={styles.header}>
              <View style={styles.headerTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>Order</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}>
                  <Ionicons name="close" size={22} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : headerContent}

          {/* Content */}
          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {renderError ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                <Text style={styles.errorText}>{renderError}</Text>
              </View>
            ) : loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading order…</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : order ? (
              <>
                {/* Meta row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <Ionicons name="time-outline" size={14} color="#6b7280" />
                    <Text style={styles.metaChipText}>{formatDate(order.createdAt || order.timestamp || order.kotTime)}</Text>
                  </View>
                  {(order.staffInfo?.name || order.staffInfo?.waiterName) ? (
                    <View style={styles.metaChip}>
                      <Ionicons name="person-outline" size={14} color="#6b7280" />
                      <Text style={styles.metaChipText} numberOfLines={1}>
                        {order.staffInfo?.name || order.staffInfo?.waiterName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Items list */}
                <View style={styles.itemsSection}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Items</Text>
                    <Text style={styles.sectionCount}>{order.items?.length || 0}</Text>
                  </View>

                  {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item, index) => {
                      const itemName = item.name || item.menuItem?.name || item.itemName || 'Unknown Item';
                      const itemPrice = num(item.price || item.unitPrice || item.itemPrice || item.menuItem?.price);
                      const itemQuantity = num(item.quantity || 1);
                      const itemTotal = num(item.total) || (itemPrice * itemQuantity);
                      let subline = '';
                      try { subline = getItemSubline(item); } catch (e) {}

                      return (
                        <View key={`item-${index}-${item.menuItemId || item.id || index}`} style={styles.itemRow}>
                          <View style={styles.qtyBadge}>
                            <Text style={styles.qtyBadgeText}>×{itemQuantity}</Text>
                          </View>
                          <View style={styles.itemInfo}>
                            <View style={styles.itemNameRow}>
                              <Text style={styles.itemName} numberOfLines={1}>{itemName}</Text>
                              {item.seat != null && (
                                <View style={styles.seatBadge}>
                                  <Text style={styles.seatBadgeText}>{seatLetter(item.seat)}</Text>
                                </View>
                              )}
                            </View>
                            {subline ? (
                              <Text style={styles.itemSubline} numberOfLines={1}>{subline}</Text>
                            ) : (item.description || item.menuItem?.description) ? (
                              <Text style={styles.itemSubline} numberOfLines={1}>
                                {item.description || item.menuItem?.description}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.itemPrice}>{getCurrencySymbol()}{itemTotal.toFixed(2)}</Text>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyItemsContainer}>
                      <Ionicons name="receipt-outline" size={32} color={Colors.textLight} />
                      <Text style={styles.emptyItemsText}>No items found</Text>
                    </View>
                  )}
                </View>

                {/* Totals card */}
                <View style={styles.totalCard}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Subtotal</Text>
                    <Text style={styles.totalValue}>{getCurrencySymbol()}{(num(order.subtotal) || calculateTotal()).toFixed(2)}</Text>
                  </View>
                  {num(order.discountAmount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, styles.discountText]}>
                        {typeof order.appliedOffer === 'string' ? order.appliedOffer : (order.appliedOffer?.name || order.selectedOfferName || 'Offer')}
                      </Text>
                      <Text style={[styles.totalValue, styles.discountText]}>−{getCurrencySymbol()}{num(order.discountAmount).toFixed(2)}</Text>
                    </View>
                  )}
                  {num(order.manualDiscount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, styles.discountText]}>Manual Discount</Text>
                      <Text style={[styles.totalValue, styles.discountText]}>−{getCurrencySymbol()}{num(order.manualDiscount).toFixed(2)}</Text>
                    </View>
                  )}
                  {num(order.loyaltyDiscount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, styles.discountText]}>Loyalty</Text>
                      <Text style={[styles.totalValue, styles.discountText]}>−{getCurrencySymbol()}{num(order.loyaltyDiscount).toFixed(2)}</Text>
                    </View>
                  )}
                  {num(order.serviceChargeAmount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Service Charge{order.serviceChargeRate ? ` (${order.serviceChargeRate}%)` : ''}</Text>
                      <Text style={styles.totalValue}>{getCurrencySymbol()}{num(order.serviceChargeAmount).toFixed(2)}</Text>
                    </View>
                  )}
                  {num(order.taxAmount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{Array.isArray(order.taxBreakdown) && order.taxBreakdown.length > 0 ? order.taxBreakdown.map(t => `${t.name || 'Tax'}${t.rate ? ` ${t.rate}%` : ''}`).join(', ') : 'Tax'}</Text>
                      <Text style={styles.totalValue}>{getCurrencySymbol()}{num(order.taxAmount).toFixed(2)}</Text>
                    </View>
                  )}
                  {num(order.tipAmount) > 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: '#d97706' }]}>Tip</Text>
                      <Text style={[styles.totalValue, { color: '#d97706' }]}>{getCurrencySymbol()}{num(order.tipAmount).toFixed(2)}</Text>
                    </View>
                  )}
                  {order.roundOffAmount != null && num(order.roundOffAmount) !== 0 && (
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: '#9ca3af' }]}>Round Off</Text>
                      <Text style={[styles.totalValue, { color: '#9ca3af' }]}>{num(order.roundOffAmount) > 0 ? '+' : ''}{getCurrencySymbol()}{num(order.roundOffAmount).toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.totalDivider} />
                  <View style={styles.grandTotalRow}>
                    <Text style={styles.grandTotalLabel}>Total</Text>
                    <Text style={styles.grandTotalValue}>{getCurrencySymbol()}{finalTotal.toFixed(2)}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Footer Actions */}
          {order && !loading && !error && !renderError && order.status !== 'completed' && order.status !== 'cancelled' && (
            <View style={styles.footer}>
              {/* Top row: Add Items + Pre-Bill */}
              <View style={styles.footerTopRow}>
                {typeof onAddItems === 'function' && (
                  <TouchableOpacity
                    style={styles.addButton}
                    activeOpacity={0.85}
                    onPress={() => {
                      onClose();
                      if (order.items) {
                        const cartItems = order.items.map(item => ({
                          id: item.menuItemId || item.id,
                          menuItemId: item.menuItemId || item.id,
                          name: item.name,
                          price: item.price || 0,
                          quantity: item.quantity || 1,
                          description: item.description,
                        }));
                        onAddItems(order, cartItems);
                      }
                    }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#dc2626" />
                    <Text style={styles.addButtonText}>Add Items</Text>
                  </TouchableOpacity>
                )}

                {typeof onPrintPreBill === 'function' && (
                  <TouchableOpacity
                    style={styles.preBillButton}
                    activeOpacity={0.85}
                    onPress={() => onPrintPreBill(order)}
                  >
                    <Ionicons name="print-outline" size={18} color="#7c3aed" />
                    <Text style={styles.preBillButtonText}>Pre-Bill</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Settle-time billing controls (web parity) */}
              {canCompleteBill && typeof onCompleteBill === 'function' && (
                <>
                  {/* Payment method pills */}
                  {paymentMethodOptions.length > 1 && (
                    <View style={styles.payMethodRow}>
                      {paymentMethodOptions.map((m) => {
                        const active = String(paymentMethod).toLowerCase() === String(m).toLowerCase();
                        return (
                          <TouchableOpacity
                            key={m}
                            style={[styles.payMethodBtn, active && styles.payMethodBtnActive]}
                            onPress={() => setPaymentMethod(m)}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.payMethodText, active && { color: '#fff' }]}>
                              {String(m).charAt(0).toUpperCase() + String(m).slice(1)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  {/* Feature toolbar + active panel (Cash / Split / Tip / Khata) */}
                  <BillingToolbar
                    billingSettings={billingSettings}
                    isRoleAllowed={isRoleAllowed}
                    activeBillingPanel={activeBillingPanel}
                    setActiveBillingPanel={setActiveBillingPanel}
                    tipAmount={tipAmount}
                    splitPayments={splitPayments}
                    cashReceived={cashReceived}
                    partialPayAmount={partialPayAmount}
                  />
                  <BillingPanels
                    activeBillingPanel={activeBillingPanel}
                    billingSettings={billingSettings}
                    grandTotal={settleTotal}
                    discountedSubtotal={finalTotal}
                    cart={order.items || []}
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
                    customerData={order.customerInfo || null}
                  />

                  {/* Show updated total when a tip is added */}
                  {tipAmount > 0 && (
                    <View style={styles.settleTotalRow}>
                      <Text style={styles.settleTotalLabel}>Total with tip</Text>
                      <Text style={styles.settleTotalValue}>{getCurrencySymbol()}{settleTotal.toFixed(2)}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.completeBillButton, settling && { opacity: 0.6 }]}
                    activeOpacity={0.85}
                    onPress={handleSettle}
                    disabled={settling}
                  >
                    {settling ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.completeBillButtonText}>
                          {posSettings.completeBillingLabel || 'Complete Bill'} · {getCurrencySymbol()}{settleTotal.toFixed(2)}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxHeight: '88%',
    overflow: 'hidden',
    ...Shadows.large,
  },

  // Header
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: '#dc2626',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerChipWhite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  headerChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Content
  content: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 12,
  },

  // States
  loadingContainer: { padding: 32, alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#6b7280', fontSize: 13 },
  errorContainer: { padding: 32, alignItems: 'center' },
  errorText: { marginTop: 10, color: Colors.error, fontSize: 14, textAlign: 'center' },

  // Meta
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metaChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },

  // Items
  itemsSection: { marginBottom: 14 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6b7280',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#9ca3af',
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    minWidth: 20,
    textAlign: 'center',
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  qtyBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  qtyBadgeText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flexShrink: 1,
  },
  seatBadge: {
    backgroundColor: '#eef2ff',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  seatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4f46e5',
  },
  itemSubline: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  emptyItemsContainer: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  emptyItemsText: {
    marginTop: 8,
    fontSize: 13,
    color: '#9ca3af',
  },

  // Totals
  totalCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  discountText: {
    color: '#059669',
  },
  totalDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#dc2626',
  },

  // Footer
  footer: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  footerTopRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  preBillButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f5f3ff',
    borderWidth: 1.5,
    borderColor: '#ddd6fe',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  preBillButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c3aed',
  },
  payMethodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payMethodBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  payMethodBtnActive: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  payMethodText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  settleTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  settleTotalLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  settleTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  completeBillButton: {
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  completeBillButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
});
