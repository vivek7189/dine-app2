import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/api';
import * as printerService from '../../services/printerService';
import { Colors, Spacing } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { formatCurrency } from '../../utils/formatCurrency';

const STATUS_COLORS = {
  completed: '#22c55e',
  served: '#3b82f6',
  cancelled: '#ef4444',
  refunded: '#f59e0b',
  // Active statuses (web shows these too — e.g. the blue KITCHEN badge)
  pending: '#f59e0b',
  preparing: '#3b82f6',
  ready: '#8b5cf6',
  active: '#3b82f6',
  kitchen: '#3b82f6',
  'in-progress': '#3b82f6',
  new: '#3b82f6',
};

export default function OrderHistoryScreen() {
  const { fs, r, isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [restoringOrder, setRestoringOrder] = useState(false);
  // Per-order actions (reprint / refund / cancel / settle)
  const [actionBusy, setActionBusy] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundFull, setRefundFull] = useState(true);
  const [settleModal, setSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMethod, setSettleMethod] = useState('cash');
  const printSettingsRef = useRef({});

  // Date filter
  const [dateMode, setDateMode] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Server pagination + filters + analytics (web parity)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refs for the focused poll: always call the latest loader and read current state without
  // stale closures, so the Orders list auto-refreshes without ever disrupting pagination.
  const loadOrdersRef = useRef(null);
  const pollGuardRef = useRef({ page: 1, busy: false, modalOpen: false });
  const [totalOrders, setTotalOrders] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState('all');       // all | completed | cancelled | refunded
  const [selectedPayStatus, setSelectedPayStatus] = useState('all'); // all | paid | partial | due
  const [selectedOrderType, setSelectedOrderType] = useState('all'); // all | dine-in | takeaway | delivery
  const [selectedPayMethod, setSelectedPayMethod] = useState('all'); // all | cash | upi | card
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const activeFilterCount = [selectedStatus, selectedPayStatus, selectedOrderType, selectedPayMethod].filter(v => v !== 'all').length;
  const [analyticsStats, setAnalyticsStats] = useState(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const PAGE_SIZE = 25;

  // Stats: prefer server analytics (period-accurate); fall back to loaded orders.
  const stats = useMemo(() => {
    const rev = analyticsStats && (analyticsStats.totalRevenue ?? analyticsStats.revenue);
    if (analyticsStats && rev != null) {
      return {
        count: analyticsStats.completedOrders ?? analyticsStats.orderCount ?? analyticsStats.totalOrders ?? analyticsStats.count ?? 0,
        revenue: rev,
      };
    }
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'served');
    const revenue = completed.reduce((sum, o) => {
      if (o.paymentStatus === 'due') return sum;
      if ((o.paymentStatus === 'partial' || o.outstandingAmount > 0) && o.paidAmount != null) return sum + (Number(o.paidAmount) || 0);
      return sum + (o.finalAmount || o.totalAmount || 0);
    }, 0);
    return { count: completed.length, revenue };
  }, [orders, analyticsStats]);

  useEffect(() => {
    loadUser();
  }, []);

  // Debounce the search box → server-side search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Reload page 1 whenever the query (date / filters / search) changes
  useEffect(() => {
    if (restaurantId) loadOrders(1, false);
  }, [restaurantId, dateMode, customStartDate, customEndDate, selectedStatus, selectedPayStatus, selectedOrderType, selectedPayMethod, debouncedSearch]);

  // Keep the poll guard fresh so the interval never disrupts pagination, an open order,
  // or an in-flight action.
  useEffect(() => {
    pollGuardRef.current = {
      page,
      busy: loading || refreshing || loadingMore || actionBusy || restoringOrder,
      modalOpen: !!selectedOrder || settleModal || refundModal,
    };
  }, [page, loading, refreshing, loadingMore, actionBusy, restoringOrder, selectedOrder, settleModal, refundModal]);

  // Refresh on focus AND poll while visible so newly placed orders show up without a manual
  // refresh or an app restart. The poll only auto-reloads page 1 when nothing is in progress
  // and no modal is open, so it never disrupts the user. Interval is cleared on blur.
  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) loadOrdersRef.current?.(1, false);
      const pollId = setInterval(() => {
        const g = pollGuardRef.current;
        if (restaurantId && g.page === 1 && !g.busy && !g.modalOpen) {
          loadOrdersRef.current?.(1, false);
        }
      }, 20000);
      return () => clearInterval(pollId);
    }, [restaurantId])
  );

  const loadUser = async () => {
    try {
      const userData = await apiClient.getUser();
      const rid = userData?.restaurantId || userData?.restaurant?.id;
      setCurrentUser(userData || null);
      if (userData?.restaurant) setRestaurant(userData.restaurant);
      if (rid) setRestaurantId(rid);
      if (userData?.role) setUserRole(userData.role);
      if (rid) {
        try {
          const cached = await AsyncStorage.getItem(`dine_print_settings_${rid}`);
          if (cached) printSettingsRef.current = JSON.parse(cached);
        } catch (_) {}
        apiClient.getPrintSettings(rid).then(result => {
          printSettingsRef.current = result?.printSettings || result || {};
        }).catch(() => {});
        if (!userData?.restaurant) {
          apiClient.getRestaurant(rid).then(result => {
            setRestaurant(result?.restaurant || result || null);
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('Failed to load user:', e);
    }
  };

  const getDateRange = useCallback(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    switch (dateMode) {
      case 'today': return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
      case 'yesterday': {
        const y = new Date(todayStart); y.setDate(y.getDate() - 1);
        const ye = new Date(y); ye.setHours(23, 59, 59, 999);
        return { startDate: y.toISOString(), endDate: ye.toISOString() };
      }
      case 'week': {
        const w = new Date(todayStart); w.setDate(w.getDate() - 7);
        return { startDate: w.toISOString(), endDate: todayEnd.toISOString() };
      }
      case 'month': {
        const m = new Date(todayStart); m.setDate(m.getDate() - 30);
        return { startDate: m.toISOString(), endDate: todayEnd.toISOString() };
      }
      case 'custom': {
        const cs = new Date(customStartDate); cs.setHours(0, 0, 0, 0);
        const ce = new Date(customEndDate); ce.setHours(23, 59, 59, 999);
        return { startDate: cs.toISOString(), endDate: ce.toISOString() };
      }
      default: return {};
    }
  }, [dateMode, customStartDate, customEndDate]);

  const loadAnalytics = async (dateRange) => {
    try {
      // period='custom' + explicit start/end so the stats match the exact date range.
      const res = await apiClient.getAnalytics(restaurantId, 'custom', { startDate: dateRange.startDate, endDate: dateRange.endDate });
      setAnalyticsStats(res?.analytics || res?.stats || res || null);
    } catch { setAnalyticsStats(null); }
  };

  const loadOrders = async (pageArg = 1, append = false) => {
    if (!restaurantId) return;
    try {
      if (append) setLoadingMore(true);
      else if (!refreshing) setLoading(true);
      const dateRange = getDateRange();
      const params = { ...dateRange, page: pageArg, limit: PAGE_SIZE, sort: 'newest' };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedPayStatus !== 'all') params.paymentStatus = selectedPayStatus;
      if (selectedOrderType !== 'all') params.orderType = selectedOrderType;
      if (selectedPayMethod !== 'all') params.paymentMethod = selectedPayMethod;

      const response = await apiClient.getOrders(restaurantId, params);
      // Web parity: show ALL orders for the period (active + completed + cancelled).
      // The server already applies the status filter when one is selected, so
      // never re-filter on the client (that hid active/KITCHEN orders → "No orders").
      const list = response?.orders || [];

      setOrders(prev => append ? [...prev, ...list] : list);

      const pg = response?.pagination || {};
      const totalPages = pg.totalPages ?? (pg.total != null ? Math.ceil(pg.total / PAGE_SIZE) : null);
      setTotalOrders(pg.total ?? pg.totalOrders ?? null);
      setHasMore(totalPages != null ? pageArg < totalPages : (response?.orders || []).length >= PAGE_SIZE);
      setPage(pageArg);
      if (!append) loadAnalytics(dateRange);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  };

  loadOrdersRef.current = loadOrders;

  const loadMore = () => {
    if (loadingMore || loading || !hasMore) return;
    loadOrders(page + 1, true);
  };

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const q = searchTerm.toLowerCase();
    return orders.filter(o =>
      (o.dailyOrderId && String(o.dailyOrderId).includes(q)) ||
      (o.orderNumber && String(o.orderNumber).toLowerCase().includes(q)) ||
      (o.customerInfo?.name && o.customerInfo.name.toLowerCase().includes(q)) ||
      (o.customerInfo?.phone && o.customerInfo.phone.includes(q)) ||
      (o.tableNumber && String(o.tableNumber).toLowerCase().includes(q))
    );
  }, [orders, searchTerm]);

  // Robust date parse — handles Date, ISO string, epoch (s/ms), Firestore
  // { _seconds } / { seconds } / { toDate() } shapes. Fixes "Invalid Date".
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    if (typeof v === 'object') {
      if (typeof v.toDate === 'function') { try { const d = v.toDate(); return isNaN(d?.getTime?.()) ? null : d; } catch { return null; } }
      const s = v._seconds ?? v.seconds;
      if (s != null) return new Date(Number(s) * 1000);
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const formatDate = (d) => {
    const date = toDate(d);
    return date ? date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  };
  const formatTime = (d) => {
    const date = toDate(d);
    return date ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
  };

  const canRestore = userRole === 'owner' || userRole === 'manager';

  const handleRestoreOrder = (order) => {
    Alert.alert(
      'Restore Order',
      `Restore order #${order.dailyOrderId || order.orderNumber || ''}?\nThis will re-apply inventory, loyalty, and stats.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              setRestoringOrder(true);
              await apiClient.restoreOrder(order.id || order._id, 'Restored from mobile');
              Alert.alert('Success', 'Order has been restored');
              setSelectedOrder(null);
              loadOrders();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to restore order');
            } finally {
              setRestoringOrder(false);
            }
          },
        },
      ],
    );
  };

  // ── Per-order actions (mirror web order-history logic) ──
  const orderTotal = (o) => o?.finalAmount || o?.totalAmount || 0;
  const outstandingOf = (o) => o?.outstandingAmount ?? (orderTotal(o) - (o?.paidAmount || 0));
  // Only offer Settle when the order is genuinely unpaid — rely on explicit fields, not the
  // (total - paidAmount) fallback, which would flag fully-paid orders that lack a paidAmount field.
  const needsSettle = (o) => {
    if (!o || o.status === 'cancelled' || o.status === 'refunded') return false;
    const ps = (o.paymentStatus || '').toLowerCase();
    if (ps === 'paid') return false;
    if (ps === 'due' || ps === 'partial') return true;
    return typeof o.outstandingAmount === 'number' && o.outstandingAmount > 0.01;
  };
  const canManage = ['owner', 'manager', 'cashier'].includes((userRole || '').toLowerCase());
  const reloadAfterAction = () => { setSelectedOrder(null); loadOrders(1, false); };

  const handleReprint = async (order, type) => {
    try {
      setActionBusy(true);
      const label = type === 'bill' ? 'Bill' : 'KOT';
      const remotePrint = await printerService.getRemotePrintEnabled();

      if (remotePrint) {
        await apiClient.triggerPrint(order.id || order._id, type);
        Alert.alert(
          'Sent to Desktop Print',
          `${label} queued for the desktop printer. Make sure the desktop app is open and connected.`,
        );
        return;
      }

      let text;
      let imageHtml;
      if (type === 'kot') {
        text = printerService.generateKOTText({
          restaurantName: restaurant?.name || '',
          orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6) || order._id?.slice(-6),
          tableNumber: order.tableNumber || '',
          floorName: order.floorName || '',
          orderType: order.orderType || 'dine-in',
          items: order.items || [],
          specialInstructions: order.specialInstructions || '',
          waiterName: order.staffInfo?.waiterName || order.staffInfo?.name || currentUser?.name || '',
          printSettings: printSettingsRef.current || {},
          covers: order.covers || 1,
        });
      } else {
        const calculatedSubtotal = (order.items || []).reduce(
          (sum, item) => sum + Number(item.total ?? ((item.price || 0) * (item.quantity || 1))),
          0,
        );
        const subtotal = Number(order.subtotal ?? calculatedSubtotal);
        const invoiceData = {
          orderId: order.id || order._id,
          orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6) || order._id?.slice(-6),
          restaurantName: restaurant?.name || '',
          restaurantInfo: restaurant || {},
          items: (order.items || []).map(item => ({
            ...item,
            name: item.name || item.itemName || 'Item',
            quantity: item.quantity || 1,
            price: Number(item.price || 0),
            total: Number(item.total ?? ((item.price || 0) * (item.quantity || 1))),
          })),
          subtotal,
          tax: Number(order.taxAmount || order.totalTax || 0),
          taxRate: Number(order.taxRate || 0),
          taxEnabled: !!(order.taxAmount > 0 || order.totalTax > 0 || order.taxBreakdown?.length),
          taxBreakdown: order.taxBreakdown || null,
          grandTotal: Number(order.finalAmount ?? order.totalAmount ?? subtotal),
          customerName: order.customerInfo?.name || order.customerName || 'Walk-in Customer',
          customerMobile: order.customerInfo?.phone || order.customerPhone || '',
          orderType: order.orderType || 'dine-in',
          paymentMethod: order.paymentMethod || 'cash',
          timestamp: order.completedAt || order.createdAt || order.timestamp || new Date(),
          staffName: order.staffInfo?.name || currentUser?.name || 'Staff',
          tableNumber: order.tableNumber || '',
          floorName: order.floorName || '',
          waiterName: order.staffInfo?.waiterName || order.staffInfo?.name || currentUser?.name || '',
          offerDiscount: Number(order.offerDiscount ?? order.discountAmount ?? 0),
          manualDiscount: Number(order.manualDiscount || 0),
          loyaltyDiscount: Number(order.loyaltyDiscount || 0),
          couponDiscount: Number(order.couponDiscount || 0),
          couponCode: order.couponCode || null,
          serviceChargeAmount: Number(order.serviceChargeAmount || 0),
          serviceChargeRate: Number(order.serviceChargeRate || 0),
          tipAmount: Number(order.tipAmount || 0),
          roundOffAmount: Number(order.roundOffAmount || 0),
          cashReceived: order.cashReceived ?? null,
          changeReturned: order.changeReturned ?? null,
          splitPayments: order.splitPayments || null,
          printSettings: printSettingsRef.current || {},
        };
        text = printerService.generateBillText(invoiceData);
        try {
          imageHtml = printerService.generateBillHTML(invoiceData, invoiceData.printSettings);
        } catch (_) {}
      }

      const result = await printerService.printWithFeedback({
        text,
        imageHtml,
        silentOnly: true,
        label: `${label} reprint`,
      });
      if (result.success) {
        Alert.alert('Sent to printer', `${label} was sent to the local printer.`);
      } else if (result.notify !== false) {
        Alert.alert(
          'Print failed',
          `${result.error || `${label} could not be printed.`}\n\nThe job is saved. Turn on/reconnect the printer, then tap Retry in the print alert.`,
        );
      }
    } catch (e) { Alert.alert('Print failed', e.message || 'Reprint failed'); }
    finally { setActionBusy(false); }
  };

  const handleCancelOrder = (order) => {
    Alert.alert('Cancel Order', `Cancel order #${order.dailyOrderId || order.orderNumber || ''}?\nThis reverses stats and inventory.`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel Order', style: 'destructive', onPress: async () => {
        try { setActionBusy(true); await apiClient.updateOrderStatus(order.id || order._id, 'cancelled', restaurantId); reloadAfterAction(); }
        catch (e) { Alert.alert('Error', e.message || 'Cancel failed'); } finally { setActionBusy(false); }
      } },
    ]);
  };

  const openRefund = (order) => { setRefundFull(true); setRefundAmount(String(orderTotal(order))); setRefundReason(''); setRefundModal(true); };
  const submitRefund = async () => {
    const amt = refundFull ? orderTotal(selectedOrder) : (parseFloat(refundAmount) || 0);
    if (amt <= 0) { Alert.alert('Invalid amount', 'Enter a refund amount greater than 0.'); return; }
    try {
      setActionBusy(true);
      await apiClient.processRefund(selectedOrder.id || selectedOrder._id, {
        // Backend expects refundAmount/refundReason (POST /api/orders/:id/refund).
        refundAmount: amt, refundReason: refundReason.trim() || 'Refund', refundType: refundFull ? 'full' : 'partial',
      });
      setRefundModal(false); reloadAfterAction();
    } catch (e) { Alert.alert('Error', e.message || 'Refund failed'); } finally { setActionBusy(false); }
  };

  const openSettle = (order) => { setSettleAmount(String(outstandingOf(order))); setSettleMethod('cash'); setSettleModal(true); };
  const submitSettle = async () => {
    const amt = parseFloat(settleAmount) || 0;
    if (amt <= 0) { Alert.alert('Invalid amount', 'Enter an amount greater than 0.'); return; }
    try {
      setActionBusy(true);
      // Backend expects paidAmount (POST /api/orders/:id/partial-payment).
      await apiClient.recordPartialPayment(selectedOrder.id || selectedOrder._id, {
        paidAmount: amt, paymentMethod: settleMethod, customerId: selectedOrder.customerId || selectedOrder.customerInfo?.id || undefined,
      });
      setSettleModal(false); reloadAfterAction();
    } catch (e) { Alert.alert('Error', e.message || 'Payment failed'); } finally { setActionBusy(false); }
  };

  const renderFilterSection = (title, options, value, setValue) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.sheetSectionTitle}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map(([key, label]) => (
          <TouchableOpacity key={key} onPress={() => setValue(key)} activeOpacity={0.8}
            style={[styles.sheetPill, value === key && styles.sheetPillActive]}>
            <Text style={[styles.sheetPillText, value === key && styles.sheetPillTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderOrderCard = ({ item }) => {
    const amt = item.finalAmount || item.totalAmount || 0;
    const statusColor = STATUS_COLORS[item.status] || '#6b7280';
    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setSelectedOrder(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardTop}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderId}>#{item.dailyOrderId || item.orderNumber || ''}</Text>
            {item.tableNumber && (
              <View style={styles.tableBadge}>
                <Text style={styles.tableBadgeText}>T{item.tableNumber}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.orderAmount, { color: statusColor }]}>{formatCurrency(amt)}</Text>
        </View>
        <View style={styles.orderCardMid}>
          <Text style={styles.orderMeta}>
            {item.items?.length || 0} items · {item.orderType || 'dine-in'} · {item.paymentMethod || 'cash'}
          </Text>
          {item.customerInfo?.name && (
            <Text style={styles.orderCustomer}>{item.customerInfo.name}</Text>
          )}
        </View>
        <View style={styles.orderCardBottom}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            </View>
            {(() => {
              const ps = (item.paymentStatus || '').toLowerCase();
              if (ps === 'due') return <View style={styles.payBadgeDue}><Text style={styles.payBadgeDueText}>DUE</Text></View>;
              if (ps === 'partial' || (item.outstandingAmount > 0 && item.paidAmount > 0)) return <View style={styles.payBadgePartial}><Text style={styles.payBadgePartialText}>PARTIAL</Text></View>;
              return null;
            })()}
            {item.editCount > 0 && (
              <View style={styles.revisedBadge}><Text style={styles.revisedBadgeText}>Revised #{item.editCount}</Text></View>
            )}
          </View>
          {(() => {
            const dt = item.completedAt || item.createdAt;
            const d = formatDate(dt), t = formatTime(dt);
            const label = d && t ? `${d} · ${t}` : (d || t || '');
            return label ? <Text style={styles.orderTime}>{label}</Text> : null;
          })()}
        </View>

        {/* Discount info */}
        {(item.discountAmount > 0 || item.manualDiscount > 0 || item.loyaltyDiscount > 0) && (
          <View style={styles.discountRow}>
            {item.discountAmount > 0 && (
              <Text style={styles.discountTag}>Offer -{formatCurrency(item.discountAmount)}</Text>
            )}
            {item.manualDiscount > 0 && (
              <Text style={styles.discountTag}>Manual -{formatCurrency(item.manualDiscount)}</Text>
            )}
            {item.loyaltyDiscount > 0 && (
              <Text style={[styles.discountTag, { color: '#7c3aed' }]}>Loyalty -{formatCurrency(item.loyaltyDiscount)}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { fontSize: fs(20) }]}>Order History</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={styles.statValue}>{stats.count}</Text>
            <Text style={styles.statLabel}>orders</Text>
          </View>
          <View style={[styles.statBadge, styles.statBadgeRevenue]}>
            <Text style={[styles.statValue, { color: '#059669' }]}>{formatCurrency(stats.revenue)}</Text>
            <Text style={styles.statLabel}>revenue</Text>
          </View>
        </View>
      </View>

      {/* Date Filter Pills — wrap so no chip (Custom) gets clipped on narrow phones */}
      <View style={styles.filterContainer}>
        {[
          { key: 'today', label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: 'week', label: 'This Week' },
          { key: 'month', label: '30 Days' },
          { key: 'custom', label: 'Custom' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterPill, dateMode === f.key && styles.filterPillActive]}
            onPress={() => setDateMode(f.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterPillText, dateMode === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom Date Pickers */}
      {dateMode === 'custom' && (
        <View style={styles.customDateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
            <Text style={styles.dateBtnText}>{customStartDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <Text style={styles.dateSep}>to</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
            <Text style={styles.dateBtnText}>{customEndDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateGoBtn} onPress={() => loadOrders(1, false)}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
          {showStartPicker && (
            <DateTimePicker value={customStartDate} mode="date" display="default"
              onChange={(_, d) => { setShowStartPicker(false); if (d) setCustomStartDate(d); }} />
          )}
          {showEndPicker && (
            <DateTimePicker value={customEndDate} mode="date" display="default"
              onChange={(_, d) => { setShowEndPicker(false); if (d) setCustomEndDate(d); }} />
          )}
        </View>
      )}

      {/* Filter bar — Filters button + active-filter chips (clean) */}
      <View style={styles.filterBar}>
        <TouchableOpacity style={[styles.filtersBtn, activeFilterCount > 0 && styles.filtersBtnActive]} onPress={() => setShowFilterSheet(true)} activeOpacity={0.85}>
          <Ionicons name="options-outline" size={15} color={activeFilterCount > 0 ? '#fff' : '#374151'} />
          <Text style={[styles.filtersBtnText, activeFilterCount > 0 && { color: '#fff' }]}>Filters</Text>
          {activeFilterCount > 0 && <View style={styles.filtersBadge}><Text style={styles.filtersBadgeText}>{activeFilterCount}</Text></View>}
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingRight: 12 }}>
          {[
            selectedStatus !== 'all' && { label: selectedStatus, clear: () => setSelectedStatus('all') },
            selectedOrderType !== 'all' && { label: selectedOrderType, clear: () => setSelectedOrderType('all') },
            selectedPayMethod !== 'all' && { label: selectedPayMethod, clear: () => setSelectedPayMethod('all') },
            selectedPayStatus !== 'all' && { label: `${selectedPayStatus} pay`, clear: () => setSelectedPayStatus('all') },
          ].filter(Boolean).map((c, i) => (
            <TouchableOpacity key={i} style={styles.activeChip} onPress={c.clear} activeOpacity={0.7}>
              <Text style={styles.activeChipText}>{c.label}</Text>
              <Ionicons name="close" size={12} color="#1d4ed8" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order #, customer, table..."
          placeholderTextColor="#9ca3af"
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm ? (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Orders List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>
            {searchTerm ? 'Try a different search' : 'No orders for this period'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrderCard}
          keyExtractor={(item, index) => String(item.id || item._id || item.orderId || item.orderNumber || index)}
          // Keep the list tappable while the search keyboard is up (avoids the "stuck after
          // search" trap); scrolling dismisses the keyboard.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.listContent, isTablet && { maxWidth: 700, alignSelf: 'center', width: '100%' }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(1, false); }} colors={[Colors.primary]} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}><ActivityIndicator size="small" color={Colors.primary} /></View>
            ) : (!hasMore && filteredOrders.length > 0 ? (
              <Text style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, paddingVertical: 14 }}>
                {totalOrders != null ? `All ${totalOrders} orders` : 'End of list'}
              </Text>
            ) : null)
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Filters bottom sheet (web parity — all filter options, clean) */}
      <Modal visible={showFilterSheet} animationType="slide" transparent onRequestClose={() => setShowFilterSheet(false)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowFilterSheet(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <TouchableOpacity onPress={() => { setSelectedStatus('all'); setSelectedOrderType('all'); setSelectedPayMethod('all'); setSelectedPayStatus('all'); }}>
                <Text style={styles.sheetReset}>Reset</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {renderFilterSection('Status', [['all', 'All'], ['pending', 'Pending'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['refunded', 'Refunded']], selectedStatus, setSelectedStatus)}
              {renderFilterSection('Order Type', [['all', 'All'], ['dine-in', 'Dine-in'], ['takeaway', 'Takeaway'], ['delivery', 'Delivery']], selectedOrderType, setSelectedOrderType)}
              {renderFilterSection('Payment Method', [['all', 'All'], ['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']], selectedPayMethod, setSelectedPayMethod)}
              {renderFilterSection('Payment Status', [['all', 'All'], ['paid', 'Paid'], ['partial', 'Partial'], ['due', 'Due']], selectedPayStatus, setSelectedPayStatus)}
            </ScrollView>
            <TouchableOpacity style={styles.sheetApply} onPress={() => setShowFilterSheet(false)} activeOpacity={0.85}>
              <Text style={styles.sheetApplyText}>Show results</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Order Detail Modal */}
      <Modal visible={!!selectedOrder} animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setSelectedOrder(null)}
              style={styles.modalBackBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              Order #{selectedOrder?.dailyOrderId || selectedOrder?.orderNumber || ''}
            </Text>
            <View style={{ width: 38 }} />
          </View>
          {selectedOrder && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Status + Time */}
              <View style={styles.detailSection}>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[selectedOrder.status] || '#6b7280') + '18', alignSelf: 'flex-start' }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[selectedOrder.status] || '#6b7280' }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLORS[selectedOrder.status] || '#6b7280' }]}>
                    {selectedOrder.status}
                  </Text>
                </View>
                <Text style={styles.detailTime}>
                  {(() => { const d = toDate(selectedOrder.completedAt || selectedOrder.createdAt); return d ? d.toLocaleString('en-IN') : '—'; })()}
                </Text>
                {selectedOrder.tableNumber && (
                  <Text style={styles.detailMeta}>Table: {selectedOrder.tableNumber}</Text>
                )}
                <Text style={styles.detailMeta}>
                  Type: {selectedOrder.orderType || 'dine-in'} · Payment: {selectedOrder.paymentMethod || 'cash'}
                </Text>
                {selectedOrder.customerInfo?.name && (
                  <Text style={styles.detailMeta}>Customer: {selectedOrder.customerInfo.name} {selectedOrder.customerInfo.phone ? `(${selectedOrder.customerInfo.phone})` : ''}</Text>
                )}
                {selectedOrder.staffInfo?.waiterName && (
                  <Text style={styles.detailMeta}>Staff: {selectedOrder.staffInfo.waiterName}</Text>
                )}
              </View>

              {/* Items */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Items</Text>
                {(selectedOrder.items || []).map((item, i) => (
                  <View key={i} style={styles.detailItem}>
                    <Text style={styles.detailItemName}>{item.quantity}× {item.name}</Text>
                    <Text style={styles.detailItemPrice}>{formatCurrency(item.total ?? ((Number(item.price) || 0) * (item.quantity || 1)))}</Text>
                  </View>
                ))}
              </View>

              {/* Bill Summary */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Bill Summary</Text>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Subtotal</Text>
                  <Text style={styles.detailValue}>{formatCurrency(selectedOrder.totalAmount || 0)}</Text>
                </View>
                {selectedOrder.discountAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#10b981' }]}>
                      {(() => { const n = typeof selectedOrder.appliedOffer === 'string' ? selectedOrder.appliedOffer : (selectedOrder.appliedOffer?.name || selectedOrder.selectedOfferName); return n ? `Offer: ${n}` : 'Offer Discount'; })()}
                    </Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>-{formatCurrency(selectedOrder.discountAmount)}</Text>
                  </View>
                )}
                {selectedOrder.manualDiscount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#10b981' }]}>Manual Discount</Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>-{formatCurrency(selectedOrder.manualDiscount)}</Text>
                  </View>
                )}
                {selectedOrder.loyaltyDiscount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#7c3aed' }]}>Loyalty Points</Text>
                    <Text style={[styles.detailValue, { color: '#7c3aed' }]}>-{formatCurrency(selectedOrder.loyaltyDiscount)}</Text>
                  </View>
                )}
                {selectedOrder.serviceChargeAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Service Charge</Text>
                    <Text style={styles.detailValue}>{formatCurrency(selectedOrder.serviceChargeAmount)}</Text>
                  </View>
                )}
                {selectedOrder.taxBreakdown && selectedOrder.taxBreakdown.length > 0 ? (
                  selectedOrder.taxBreakdown.map((tax, idx) => (
                    <View key={idx} style={styles.detailItem}>
                      <Text style={styles.detailLabel}>{tax.name}{tax.rate ? ` (${tax.rate}%)` : ''}{tax.inclusive ? ' (incl.)' : ''}</Text>
                      <Text style={styles.detailValue}>{formatCurrency(tax.amount || 0)}</Text>
                    </View>
                  ))
                ) : selectedOrder.taxAmount > 0 ? (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Tax</Text>
                    <Text style={styles.detailValue}>{formatCurrency(selectedOrder.taxAmount)}</Text>
                  </View>
                ) : null}
                {selectedOrder.tipAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#f59e0b' }]}>Tip</Text>
                    <Text style={[styles.detailValue, { color: '#f59e0b' }]}>{formatCurrency(selectedOrder.tipAmount)}</Text>
                  </View>
                )}
                <View style={[styles.detailItem, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalValue}>{formatCurrency(selectedOrder.finalAmount || selectedOrder.totalAmount || 0)}</Text>
                </View>

                {/* Payment status: paid / outstanding (khata / partial) */}
                {(selectedOrder.paymentStatus === 'partial' || selectedOrder.paymentStatus === 'due' || selectedOrder.outstandingAmount > 0) && (
                  <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                    <View style={styles.detailItem}>
                      <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '600' }}>Paid</Text>
                      <Text style={{ fontSize: 13, color: '#16a34a', fontWeight: '700' }}>{formatCurrency(selectedOrder.paidAmount || 0)}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '600' }}>Outstanding</Text>
                      <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '700' }}>{formatCurrency(selectedOrder.outstandingAmount ?? ((selectedOrder.finalAmount || selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}</Text>
                    </View>
                  </View>
                )}

                {selectedOrder.editCount > 0 && (
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="create-outline" size={13} color="#6d28d9" />
                    <Text style={{ fontSize: 12, color: '#6d28d9', fontWeight: '700' }}>Revised bill (edited {selectedOrder.editCount}×)</Text>
                  </View>
                )}

                {/* Loyalty points earned */}
                {selectedOrder.loyaltyPointsEarned > 0 && (
                  <View style={styles.loyaltyEarnedRow}>
                    <Ionicons name="star" size={14} color="#f59e0b" />
                    <Text style={styles.loyaltyEarnedText}>+{selectedOrder.loyaltyPointsEarned} points earned</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
          {selectedOrder && (
            <View style={[styles.actionBar, { paddingBottom: 10 + (insets.bottom || 0) }]}>
              {/* Wrapping row so every action is visible (no clipped "+more") */}
              <View style={styles.actionBarRow}>
                <TouchableOpacity style={styles.actBtn} disabled={actionBusy} onPress={() => handleReprint(selectedOrder, 'bill')} activeOpacity={0.8}>
                  <Ionicons name="print-outline" size={16} color="#2563eb" /><Text style={[styles.actBtnText, { color: '#2563eb' }]}>Print Bill</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actBtn} disabled={actionBusy} onPress={() => handleReprint(selectedOrder, 'kot')} activeOpacity={0.8}>
                  <Ionicons name="print-outline" size={16} color="#f59e0b" /><Text style={[styles.actBtnText, { color: '#f59e0b' }]}>Print KOT</Text>
                </TouchableOpacity>
                {canManage && needsSettle(selectedOrder) && (
                  <TouchableOpacity style={[styles.actBtn, styles.actBtnPrimary]} disabled={actionBusy} onPress={() => openSettle(selectedOrder)} activeOpacity={0.8}>
                    <Ionicons name="cash-outline" size={16} color="#fff" /><Text style={[styles.actBtnText, { color: '#fff' }]}>Settle</Text>
                  </TouchableOpacity>
                )}
                {canManage && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'refunded' && (
                  <TouchableOpacity style={styles.actBtn} disabled={actionBusy} onPress={() => openRefund(selectedOrder)} activeOpacity={0.8}>
                    <Ionicons name="arrow-undo-outline" size={16} color="#7c3aed" /><Text style={[styles.actBtnText, { color: '#7c3aed' }]}>Refund</Text>
                  </TouchableOpacity>
                )}
                {canManage && selectedOrder.status !== 'cancelled' && (
                  <TouchableOpacity style={styles.actBtn} disabled={actionBusy} onPress={() => handleCancelOrder(selectedOrder)} activeOpacity={0.8}>
                    <Ionicons name="close-circle-outline" size={16} color="#ef4444" /><Text style={[styles.actBtnText, { color: '#ef4444' }]}>Cancel Order</Text>
                  </TouchableOpacity>
                )}
                {selectedOrder.status === 'cancelled' && canRestore && (
                  <TouchableOpacity style={[styles.actBtn, { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]} disabled={actionBusy || restoringOrder} onPress={() => handleRestoreOrder(selectedOrder)} activeOpacity={0.8}>
                    {restoringOrder ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="refresh-outline" size={16} color="#fff" /><Text style={[styles.actBtnText, { color: '#fff' }]}>Restore</Text></>}
                  </TouchableOpacity>
                )}
                {actionBusy && <ActivityIndicator style={{ marginLeft: 4 }} size="small" color="#6b7280" />}
              </View>
            </View>
          )}

          {/* Refund sheet — rendered INSIDE the detail modal as an overlay (NOT a nested
              <Modal>, which fails to present over an open modal on Android). */}
          {refundModal && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inlineOverlay}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setRefundModal(false)} />
              <View style={[styles.sheet, { paddingBottom: 24 + (insets.bottom || 0) }]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Refund order</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 12 }}>
                  <TouchableOpacity style={[styles.sheetPill, { flex: 1, alignItems: 'center' }, refundFull && styles.sheetPillActive]} onPress={() => setRefundFull(true)}>
                    <Text style={[styles.sheetPillText, refundFull && styles.sheetPillTextActive]}>Full refund</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sheetPill, { flex: 1, alignItems: 'center' }, !refundFull && styles.sheetPillActive]} onPress={() => setRefundFull(false)}>
                    <Text style={[styles.sheetPillText, !refundFull && styles.sheetPillTextActive]}>Partial</Text>
                  </TouchableOpacity>
                </View>
                {!refundFull && (
                  <>
                    <Text style={styles.sheetSectionTitle}>Amount</Text>
                    <TextInput style={styles.modalInput} value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af" />
                  </>
                )}
                <Text style={styles.sheetSectionTitle}>Reason (optional)</Text>
                <TextInput style={styles.modalInput} value={refundReason} onChangeText={setRefundReason} placeholder="e.g. wrong item" placeholderTextColor="#9ca3af" />
                <TouchableOpacity style={[styles.sheetApply, { backgroundColor: '#7c3aed' }]} disabled={actionBusy} onPress={submitRefund} activeOpacity={0.85}>
                  {actionBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sheetApplyText}>Process refund{refundFull && selectedOrder ? ` (${formatCurrency(orderTotal(selectedOrder))})` : ''}</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}

          {/* Settle / record-payment sheet — also an in-modal overlay */}
          {settleModal && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inlineOverlay}>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSettleModal(false)} />
              <View style={[styles.sheet, { paddingBottom: 24 + (insets.bottom || 0) }]}>
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Record payment</Text>
                {selectedOrder && <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Outstanding {formatCurrency(outstandingOf(selectedOrder))}</Text>}
                <Text style={[styles.sheetSectionTitle, { marginTop: 14 }]}>Amount</Text>
                <TextInput style={styles.modalInput} value={settleAmount} onChangeText={setSettleAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#9ca3af" />
                <Text style={styles.sheetSectionTitle}>Method</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                  {['cash', 'upi', 'card'].map(m => (
                    <TouchableOpacity key={m} style={[styles.sheetPill, settleMethod === m && styles.sheetPillActive]} onPress={() => setSettleMethod(m)}>
                      <Text style={[styles.sheetPillText, settleMethod === m && styles.sheetPillTextActive]}>{m.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.sheetApply, { backgroundColor: '#16a34a' }]} disabled={actionBusy} onPress={submitSettle} activeOpacity={0.85}>
                  {actionBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sheetApplyText}>Record payment</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  statBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statBadgeRevenue: { backgroundColor: '#ecfdf5' },
  statValue: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#6b7280' },

  // Filters
  filterContainer: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  filterPillActive: { backgroundColor: '#ef4444' },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterPillTextActive: { color: '#fff' },
  // Clean filter bar + active chips
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  filtersBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  filtersBtnActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  filtersBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  filtersBadge: { minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filtersBadgeText: { fontSize: 10, fontWeight: '800', color: '#ef4444' },
  activeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  activeChipText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8', textTransform: 'capitalize' },
  // Filters bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  sheetReset: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  sheetSectionTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  sheetPill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  sheetPillActive: { borderColor: '#ef4444', backgroundColor: '#fef2f2' },
  sheetPillText: { fontSize: 13, fontWeight: '600', color: '#475569', textTransform: 'capitalize' },
  sheetPillTextActive: { color: '#dc2626', fontWeight: '700' },
  sheetApply: { marginTop: 8, backgroundColor: '#ef4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sheetApplyText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 },
  // Detail-modal action bar
  actionBar: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' },
  actionBarRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actBtn: { flexGrow: 1, flexBasis: 96, minWidth: 96, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  actBtnPrimary: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  actBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  // In-detail-modal overlay for settle/refund sheets (avoids unreliable nested <Modal>)
  inlineOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', zIndex: 100 },

  // Custom date
  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff',
  },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#f9fafb',
    borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  dateBtnText: { fontSize: 12, color: '#374151' },
  dateSep: { fontSize: 12, color: '#9ca3af' },
  dateGoBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef4444',
    justifyContent: 'center', alignItems: 'center',
  },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2937', padding: 0 },

  // List
  listContent: { padding: 12, gap: 8, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#6b7280', marginTop: 8 },
  emptySubtext: { fontSize: 12, color: '#9ca3af' },

  // Order card
  orderCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  tableBadge: {
    backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tableBadgeText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },
  orderAmount: { fontSize: 16, fontWeight: '800' },
  orderCardMid: { marginTop: 6 },
  orderMeta: { fontSize: 11, color: '#9ca3af' },
  orderCustomer: { fontSize: 12, fontWeight: '500', color: '#6b7280', marginTop: 2 },
  orderCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  payBadgeDue: { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  payBadgeDueText: { fontSize: 9, fontWeight: '800', color: '#b91c1c' },
  payBadgePartial: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  payBadgePartialText: { fontSize: 9, fontWeight: '800', color: '#92400e' },
  revisedBadge: { backgroundColor: '#ede9fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  revisedBadgeText: { fontSize: 9, fontWeight: '800', color: '#6d28d9' },
  orderTime: { fontSize: 10, color: '#9ca3af' },
  discountRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  discountTag: { fontSize: 10, fontWeight: '600', color: '#10b981' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eef2f7',
  },
  modalBackBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#f1f5f9',
    justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#111827' },
  modalContent: { flex: 1 },
  detailSection: {
    backgroundColor: '#fff', marginTop: 8, marginHorizontal: 12, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#f3f4f6',
  },
  detailSectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailTime: { fontSize: 13, color: '#374151', marginTop: 6 },
  detailMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailItemName: { fontSize: 13, color: '#374151', flex: 1 },
  detailItemPrice: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  detailLabel: { fontSize: 13, color: '#6b7280' },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  grandTotalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  grandTotalLabel: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  grandTotalValue: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  loyaltyEarnedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: '#fefce8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start',
  },
  loyaltyEarnedText: { fontSize: 11, fontWeight: '600', color: '#92400e' },
});
