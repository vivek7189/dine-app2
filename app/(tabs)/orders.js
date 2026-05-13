import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import Pusher from 'pusher-js';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import apiClient from '../../services/api';
import lanClient from '../../services/lanClient';
import restaurantEvents from '../../services/restaurantEvents';
import { getCached, setCache } from '../../services/cacheManager';
// SyncIndicator moved to settings page
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { buildTokenSlipHTML } from '../../utils/tokenSlipHTML';
import * as printerService from '../../services/printerService';
import { useOffline } from '../../hooks/useOffline';

// Pusher configuration (same as web frontend)
const PUSHER_KEY = '4e1f74ae05c66bbc4eec';
const PUSHER_CLUSTER = 'ap2';

export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isTablet } = useResponsive();
  const { effectivelyOffline, pendingCount } = useOffline();
  const tabletContentStyle = isTablet ? { maxWidth: 800, alignSelf: 'center', width: '100%' } : undefined;
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [user, setUser] = useState(null);
  const [printSettings, setPrintSettings] = useState(null);

  // Spinning animation for refresh icon
  const spinValue = useState(new Animated.Value(0))[0];

  // Filter states
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [analyticsStats, setAnalyticsStats] = useState(null);

  // Date filter states
  const [dateFilterMode, setDateFilterMode] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Tab view: 'orders' or 'summary'
  const [activeView, setActiveView] = useState('orders');

  // Sales Summary state
  const [saleSummaryData, setSaleSummaryData] = useState(null);
  const [saleSummaryLoading, setSaleSummaryLoading] = useState(false);
  const [summaryPeriod, setSummaryPeriod] = useState('today');
  const [summarySearch, setSummarySearch] = useState('');
  const [summarySortBy, setSummarySortBy] = useState('quantity');
  const [summarySortDir, setSummarySortDir] = useState('desc');

  // Order detail modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);

  // Expanded orders for items view in cards
  const [expandedOrders, setExpandedOrders] = useState(new Set());

  // Mark as Paid
  const [markPaidOrderId, setMarkPaidOrderId] = useState(null);
  const [markPaidSubmitting, setMarkPaidSubmitting] = useState(false);

  // Refund
  const [showRefundPanel, setShowRefundPanel] = useState(false);
  const [refundType, setRefundType] = useState('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundSubmitting, setRefundSubmitting] = useState(false);

  // Pusher reference
  const pusherRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Listen for restaurant switch from other tabs
  useEffect(() => {
    const unsub = restaurantEvents.on('switch', ({ restaurantId: newRid, restaurant: newRest }) => {
      setRestaurantId(newRid);
      setRestaurantName(newRest?.name || '');
      setOrders([]);
      setLoading(true);
      loadInitialData();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (params.orderId) {
      // Load specific order
      loadOrderById(params.orderId);
    }
  }, [params.orderId]);

  useEffect(() => {
    if (restaurantId) {
      loadOrders(restaurantId);
    }
  }, [selectedStatus, selectedPaymentMethod, searchTerm, restaurantId, dateFilterMode, customStartDate, customEndDate]);

  // Re-check restaurant ID and refresh when tab is focused
  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        const userData = await apiClient.getUser();
        const rid = userData?.restaurantId || userData?.restaurant?.id;
        if (rid && rid !== restaurantId) {
          // Restaurant was switched on another screen — update and reload
          setUser(userData);
          setRestaurantId(rid);
          // The useEffect on restaurantId will trigger loadOrders
        } else if (restaurantId && !loading) {
          loadOrdersInBackground(restaurantId);
        }
      };
      checkAndRefresh();
    }, [restaurantId, loading, selectedStatus, selectedPaymentMethod, searchTerm, dateFilterMode, customStartDate, customEndDate])
  );

  // Spinning animation effect
  useEffect(() => {
    if (backgroundLoading || refreshing) {
      Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinValue.setValue(0);
    }
  }, [backgroundLoading, refreshing]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Role-based date restriction
  const isRestrictedRole = useMemo(() => {
    if (!user) return true;
    const role = (user.role || '').toLowerCase();
    return !['owner', 'admin', 'manager'].includes(role);
  }, [user]);

  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Compute date range from filter mode
  const getDateRange = useCallback(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    switch (dateFilterMode) {
      case 'today':
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
      case 'yesterday': {
        const ys = new Date(todayStart);
        ys.setDate(ys.getDate() - 1);
        const ye = new Date(ys);
        ye.setHours(23, 59, 59, 999);
        return { startDate: ys.toISOString(), endDate: ye.toISOString() };
      }
      case '7days': {
        const s = new Date(todayStart);
        s.setDate(s.getDate() - 6);
        return { startDate: s.toISOString(), endDate: todayEnd.toISOString() };
      }
      case '30days': {
        const s = new Date(todayStart);
        s.setDate(s.getDate() - 29);
        return { startDate: s.toISOString(), endDate: todayEnd.toISOString() };
      }
      case 'custom': {
        const cs = new Date(customStartDate);
        cs.setHours(0, 0, 0, 0);
        const ce = new Date(customEndDate);
        ce.setHours(23, 59, 59, 999);
        return { startDate: cs.toISOString(), endDate: ce.toISOString() };
      }
      case 'all':
      default:
        if (isRestrictedRole) {
          return { startDate: thirtyDaysAgo.toISOString(), endDate: todayEnd.toISOString() };
        }
        return {};
    }
  }, [dateFilterMode, customStartDate, customEndDate, isRestrictedRole, thirtyDaysAgo]);

  const dateFilterOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: '7days', label: '7 Days' },
    { value: '30days', label: '30 Days' },
    { value: 'all', label: 'All' },
    { value: 'custom', label: 'Custom' },
  ];

  const paymentMethodOptions = [
    { value: 'all', label: 'All' },
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'online', label: 'Online' },
  ];

  const formatShortDate = (date) => {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Pusher + LAN Hub subscription for real-time order updates
  useEffect(() => {
    if (!restaurantId) return;

    const handleOrderEvent = (eventName, data) => {
      console.log(`[Orders] Received '${eventName}' event:`, data);
      loadOrdersInBackground(restaurantId);
    };

    const eventNames = ['order-created', 'order-status-updated', 'order-updated', 'order-deleted'];
    const lanUnsubs = [];

    // LAN Hub WebSocket events (when paired)
    if (lanClient.isPaired()) {
      eventNames.forEach(evt => {
        lanUnsubs.push(lanClient.onEvent(evt, (data) => handleOrderEvent(evt, data)));
      });
    }

    // Pusher (cloud)
    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
    pusherRef.current = pusher;

    const channelName = `restaurant-${restaurantId}`;
    const channel = pusher.subscribe(channelName);
    channelRef.current = channel;

    eventNames.forEach(evt => channel.bind(evt, (data) => handleOrderEvent(evt, data)));

    return () => {
      lanUnsubs.forEach(fn => fn());
      if (channelRef.current) channelRef.current.unbind_all();
      if (pusherRef.current) {
        pusherRef.current.unsubscribe(channelName);
        pusherRef.current.disconnect();
      }
    };
  }, [restaurantId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      setRestaurantName(userData.restaurant?.name || '');
      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        return;
      }

      setRestaurantId(rid);

      // Fetch print settings for token billing
      apiClient.getPrintSettings(rid).then(pRes => {
        if (pRes) setPrintSettings(pRes.printSettings || pRes || {});
      }).catch(() => {});

      // Stale-while-revalidate: show cached data instantly, then refresh in background
      const cacheKey = `cache_orders_${rid}_${dateFilterMode}`;
      const cachedOrders = await getCached(cacheKey);
      if (cachedOrders?.data) {
        setOrders(cachedOrders.data);
        setLoading(false);
        // Background refresh with syncing indicator instead of loading spinner
        setSyncing(true);
        try {
          await loadOrders(rid);
        } finally {
          setSyncing(false);
        }
      } else {
        await loadOrders(rid);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (rid) => {
    try {
      const dateRange = getDateRange();
      const filters = {
        limit: 100,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        paymentMethod: selectedPaymentMethod !== 'all' ? selectedPaymentMethod : undefined,
        search: searchTerm.trim() || undefined,
        ...dateRange,
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const response = await apiClient.getOrders(rid, filters);
      let ordersList = response.orders || [];

      // Filter out deleted orders from "All" view (only show deleted in "Deleted" filter)
      if (selectedStatus === 'all') {
        ordersList = ordersList.filter(order => order.status !== 'deleted');
      }

      // Sort by created date (newest first)
      ordersList.sort((a, b) => {
        const dateA = getOrderDate(a.createdAt);
        const dateB = getOrderDate(b.createdAt);
        return dateB - dateA;
      });

      setOrders(ordersList);
      if (restaurantId) {
        setCache(`cache_orders_${restaurantId}_${dateFilterMode}`, ordersList);
      }

      // Fetch analytics for summary cards (non-blocking)
      try {
        const analyticsOptions = {};
        if (dateRange.startDate) analyticsOptions.startDate = dateRange.startDate;
        if (dateRange.endDate) analyticsOptions.endDate = dateRange.endDate;
        const analyticsResponse = await apiClient.getAnalytics(rid, dateRange.startDate ? 'custom' : 'today', analyticsOptions);
        if (analyticsResponse?.success && analyticsResponse?.analytics) {
          setAnalyticsStats(analyticsResponse.analytics);
        }
      } catch (analyticsErr) {
        console.error('Analytics fetch error (non-blocking):', analyticsErr);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      throw error;
    }
  };

  // Background loading - doesn't show full loading state, just updates data
  const loadOrdersInBackground = async (rid) => {
    setBackgroundLoading(true);
    try {
      const dateRange = getDateRange();
      const filters = {
        limit: 100,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        paymentMethod: selectedPaymentMethod !== 'all' ? selectedPaymentMethod : undefined,
        search: searchTerm.trim() || undefined,
        ...dateRange,
      };

      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const response = await apiClient.getOrders(rid, filters);
      let ordersList = response.orders || [];

      // Filter out deleted orders from "All" view
      if (selectedStatus === 'all') {
        ordersList = ordersList.filter(order => order.status !== 'deleted');
      }

      // Sort by created date (newest first)
      ordersList.sort((a, b) => {
        const dateA = getOrderDate(a.createdAt);
        const dateB = getOrderDate(b.createdAt);
        return dateB - dateA;
      });

      setOrders(ordersList);
      if (rid) {
        setCache(`cache_orders_${rid}_${dateFilterMode}`, ordersList);
      }
    } catch (error) {
      console.error('Error loading orders in background:', error);
    } finally {
      setBackgroundLoading(false);
    }
  };

  const handleDeleteOrder = (order) => {
    Alert.alert(
      'Delete Order',
      `Are you sure you want to delete order #${order.dailyOrderId || order.id?.slice(-6)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteOrder(order.id);
              await loadOrders(restaurantId);
              Alert.alert('Success', 'Order deleted. View it under "Deleted" filter.');
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete order');
            }
          },
        },
      ]
    );
  };

  const toggleOrderExpand = (orderId) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // No-confirmation direct complete. The caller (tap on "Mark Complete" button
  // or the inline Complete on the order card) already implies user intent.
  const handleMarkCompleted = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    try {
      // Optimistic: mark order completed locally so the card updates instantly
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'completed', paymentStatus: 'paid' } : o));

      // Send full update (matching web flow) so backend updates customer stats
      const updateData = {
        status: 'completed',
        paymentStatus: order?.paymentStatus === 'partial' ? 'partial' : 'paid',
        paymentMethod: order?.paymentMethod || 'cash',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Preserve existing amounts
        ...(order?.totalAmount && { totalAmount: order.totalAmount }),
        ...(order?.finalAmount && { finalAmount: order.finalAmount }),
        ...(order?.taxAmount && { taxAmount: order.taxAmount }),
        ...(order?.taxBreakdown && { taxBreakdown: order.taxBreakdown }),
        // Customer data — critical for customer stats update
        customerId: order?.customerId || null,
        customerInfo: {
          name: order?.customerInfo?.name || '',
          phone: order?.customerInfo?.phone || order?.customerInfo?.mobile || order?.customerPhone || null,
          tableNumber: order?.tableNumber || null,
        },
        ...(order?.customerPhone && { customerPhone: order.customerPhone }),
        // Loyalty data
        ...(order?.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: order.redeemLoyaltyPoints }),
        ...(order?.loyaltyDiscount > 0 && { loyaltyDiscount: order.loyaltyDiscount }),
        // Discount/offer data
        ...(order?.discountAmount > 0 && { discountAmount: order.discountAmount }),
        ...(order?.manualDiscount > 0 && { manualDiscount: order.manualDiscount }),
        ...(order?.offerIds?.length > 0 && { offerIds: order.offerIds }),
        ...(order?.selectedOfferName && { selectedOfferName: order.selectedOfferName }),
        // Billing fields
        ...(order?.serviceChargeAmount > 0 && { serviceChargeAmount: order.serviceChargeAmount, serviceChargeRate: order.serviceChargeRate }),
        ...(order?.tipAmount > 0 && { tipAmount: order.tipAmount }),
        ...(order?.roundOffAmount && { roundOffAmount: order.roundOffAmount }),
        // Staff tracking
        lastUpdatedBy: {
          name: user?.name || 'Staff',
          id: user?.id,
          role: user?.role || 'waiter',
        },
      };

      await apiClient.updateOrder(orderId, updateData);

      // Verify payment — triggers customer stats update
      try {
        await apiClient.verifyPayment({
          orderId,
          paymentMethod: order?.paymentMethod || 'cash',
          amount: order?.finalAmount || order?.totalAmount || 0,
          userId: user?.id,
          restaurantId,
          paymentStatus: 'completed',
        });
      } catch (_) {}

      // Free the table back to available (fire-and-forget, don't block UX)
      const tableRef = order?.tableId || order?.tableNumber;
      if (tableRef) {
        apiClient
          .updateTableStatus(tableRef, 'available', null, restaurantId)
          .catch(e => console.warn('Table status update failed:', e?.message));
      }

      if (restaurantId) loadOrdersInBackground(restaurantId);

      // Non-blocking toast (Android) or silent no-op (iOS).
      try {
        const { ToastAndroid, Platform } = require('react-native');
        if (Platform.OS === 'android') {
          ToastAndroid.show(`Billing complete • #${order?.dailyOrderId || orderId.slice(-6).toUpperCase()}`, ToastAndroid.SHORT);
        }
      } catch (_) {}
    } catch (error) {
      // Revert optimistic on failure
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: order?.status || 'confirmed', paymentStatus: order?.paymentStatus } : o));
      Alert.alert('Error', 'Failed to mark order as completed.');
    }
  };

  const handlePrintBill = (order) => {
    const orderDate = getOrderDate(order.createdAt);
    const dateStr = orderDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const subtotal = order.subtotal || order.totalAmount || 0;
    const taxAmt = order.taxAmount || order.tax || 0;
    const total = order.finalAmount || order.totalAmount || subtotal + taxAmt;
    const customerName = order.customerName || order.customerDisplay?.name || 'Walk-in Customer';

    const itemsHTML = (order.items || []).map(item => `
      <tr>
        <td style="padding: 6px 0; border-bottom: 1px dashed #ddd;">${item.name}</td>
        <td style="padding: 6px 0; border-bottom: 1px dashed #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 6px 0; border-bottom: 1px dashed #ddd; text-align: right;">₹${(item.price || 0).toFixed(2)}</td>
        <td style="padding: 6px 0; border-bottom: 1px dashed #ddd; text-align: right; font-weight: 600;">₹${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Courier New', monospace;
              padding: 20px;
              max-width: 400px;
              margin: 0 auto;
              background: #fff;
            }
            .receipt { border: 2px dashed #333; padding: 20px; }
            .header { text-align: center; padding-bottom: 15px; border-bottom: 2px dashed #333; margin-bottom: 15px; }
            .restaurant-name { font-size: 22px; font-weight: bold; margin-bottom: 5px; }
            .invoice-info { font-size: 12px; color: #666; }
            .customer-info { font-size: 12px; color: #444; margin-bottom: 10px; text-align: center; }
            .items-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 15px; }
            .items-table th { text-align: left; padding: 8px 0; border-bottom: 2px solid #333; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
            .items-table th:nth-child(2), .items-table th:nth-child(3), .items-table th:nth-child(4) { text-align: right; }
            .items-table th:nth-child(2) { text-align: center; }
            .totals { border-top: 2px dashed #333; padding-top: 15px; margin-top: 15px; }
            .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
            .grand-total { border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; font-size: 18px; font-weight: bold; }
            .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 2px dashed #333; font-size: 12px; color: #666; }
            .footer .thanks { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 5px; }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <div class="restaurant-name">${user?.restaurantName || user?.restaurant?.name || 'Restaurant'}</div>
              <div class="invoice-info">
                Order #${order.dailyOrderId || order.id?.slice(-6).toUpperCase()}<br>
                ${dateStr} at ${timeStr}
              </div>
            </div>

            <div class="customer-info">
              Customer: ${customerName}
              ${order.tableNumber ? ` | Table: ${order.tableNumber}` : ''}
              ${order.orderType ? ` | ${(order.orderType || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}` : ''}
            </div>

            <table class="items-table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
              </thead>
              <tbody>${itemsHTML}</tbody>
            </table>

            <div class="totals">
              <div class="total-row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
              ${(order.discountAmount || 0) > 0 ? `<div class="total-row" style="color:#10b981;"><span>${order.appliedOffer?.name || 'Discount'}</span><span>-₹${order.discountAmount.toFixed(2)}</span></div>` : ''}
              ${(order.manualDiscount || 0) > 0 ? `<div class="total-row" style="color:#10b981;"><span>Manual Discount</span><span>-₹${order.manualDiscount.toFixed(2)}</span></div>` : ''}
              ${(order.loyaltyDiscount || 0) > 0 ? `<div class="total-row" style="color:#10b981;"><span>Loyalty Points</span><span>-₹${order.loyaltyDiscount.toFixed(2)}</span></div>` : ''}
              ${(order.serviceChargeAmount || 0) > 0 ? `<div class="total-row"><span>Service Charge${order.serviceChargeRate ? ` (${order.serviceChargeRate}%)` : ''}</span><span>₹${order.serviceChargeAmount.toFixed(2)}</span></div>` : ''}
              ${order.taxBreakdown && order.taxBreakdown.length > 0
                ? order.taxBreakdown.map(t => `<div class="total-row"><span>${t.name || 'Tax'} (${t.rate}%)</span><span>₹${(t.amount || 0).toFixed(2)}</span></div>`).join('')
                : taxAmt > 0 ? `<div class="total-row"><span>Tax</span><span>₹${taxAmt.toFixed(2)}</span></div>` : ''}
              ${(order.tipAmount || 0) > 0 ? `<div class="total-row" style="color:#d97706;"><span>Tip</span><span>₹${order.tipAmount.toFixed(2)}</span></div>` : ''}
              ${order.roundOffAmount != null && order.roundOffAmount !== 0 ? `<div class="total-row" style="color:#9ca3af;"><span>Round-off</span><span>${order.roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(order.roundOffAmount).toFixed(2)}</span></div>` : ''}
              <div class="total-row grand-total"><span>TOTAL</span><span>₹${total.toFixed(2)}</span></div>
              ${order.paymentMethod ? `<div class="total-row" style="margin-top:8px;"><span>Payment</span><span>${order.paymentMethod.toUpperCase()}</span></div>` : ''}
            </div>

            <div class="footer">
              <div class="thanks">Thank you for your visit!</div>
              ${order.staffInfo?.name ? `<div>Served by: ${order.staffInfo.name}</div>` : ''}
            </div>
          </div>
        </body>
      </html>
    `;

    Alert.alert(
      'Print Bill',
      `Order #${order.dailyOrderId || order.id?.slice(-6).toUpperCase()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Print',
          onPress: async () => {
            try {
              await printerService.printContent({ html, text: null });
              // Print category-wise token slips if Food Court Token Billing is enabled
              if (printSettings?.tokenBillingEnabled && restaurantId && order.id) {
                try {
                  const tokenRes = await apiClient.getTokenRender(restaurantId, order.id);
                  const tokens = tokenRes?.tokens || [];
                  if (tokenRes?.success && tokens.length > 0) {
                    for (const token of tokens) {
                      const tokenHtml = buildTokenSlipHTML(token);
                      const tokenText = printerService.generateTokenText(token);
                      await printerService.printContent({ html: tokenHtml, text: tokenText });
                    }
                  }
                } catch (tokenErr) {
                  console.error('Token print error:', tokenErr);
                }
              }
            } catch (e) {
              console.error('Print error:', e);
              Alert.alert('Error', 'Failed to print bill.');
            }
          },
        },
        {
          text: 'Share PDF',
          onPress: async () => {
            try {
              const { uri } = await Print.printToFileAsync({ html });
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, {
                  mimeType: 'application/pdf',
                  dialogTitle: `Bill #${order.dailyOrderId || order.id?.slice(-6).toUpperCase()}`,
                  UTI: 'com.adobe.pdf',
                });
              } else {
                Alert.alert('Error', 'Sharing is not available on this device.');
              }
            } catch (e) {
              console.error('Share PDF error:', e);
              Alert.alert('Error', 'Failed to generate PDF.');
            }
          },
        },
      ]
    );
  };

  const executeMarkPaid = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    setMarkPaidSubmitting(true);
    try {
      const outstanding = order.outstandingAmount || 0;
      const finalAmt = order.finalAmount || order.totalAmount || 0;
      await apiClient.updateOrder(order.id, {
        paidAmount: Math.round(finalAmt * 100) / 100,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      });
      if (order.customerId) {
        try {
          await apiClient.settleCustomerCredit(order.customerId, {
            amount: outstanding, paymentMethod: 'cash', orderId: order.id
          });
        } catch (e) { console.error('Customer credit settle error:', e); }
      }
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, paidAmount: finalAmt, outstandingAmount: 0, paymentStatus: 'paid' } : o
      ));
      setMarkPaidOrderId(null);
      // No blocking alert — state change is visible in the list
      if (restaurantId) loadOrdersInBackground(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to mark as paid');
    } finally {
      setMarkPaidSubmitting(false);
    }
  };

  const executeRefund = async () => {
    if (!selectedOrder) return;
    const orderTotal = selectedOrder.finalAmount || selectedOrder.totalAmount || 0;
    const amount = refundType === 'full' ? orderTotal : (parseFloat(refundAmount) || 0);
    if (amount <= 0) {
      Alert.alert('Error', 'Please enter a valid refund amount');
      return;
    }
    if (amount > orderTotal) {
      Alert.alert('Error', 'Refund amount cannot exceed the order total');
      return;
    }
    setRefundSubmitting(true);
    try {
      await apiClient.processRefund(selectedOrder.id, {
        type: refundType,
        amount,
        reason: refundReason || 'Refund requested',
      });
      setOrders(prev => prev.map(o =>
        o.id === selectedOrder.id ? { ...o, refundAmount: amount, refundStatus: refundType === 'full' ? 'refunded' : 'partial_refund' } : o
      ));
      setShowRefundPanel(false);
      setRefundType('full');
      setRefundAmount('');
      setRefundReason('');
      // No blocking alert — refund status is reflected inline
      if (restaurantId) loadOrdersInBackground(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to process refund');
    } finally {
      setRefundSubmitting(false);
    }
  };

  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
    setShowRefundPanel(false);
  };

  const getOrderDate = (date) => {
    if (!date) return new Date(0);
    if (date.toDate) return date.toDate();
    if (date._seconds) return new Date(date._seconds * 1000);
    return new Date(date);
  };

  const loadOrderById = async (orderId) => {
    try {
      let rid = restaurantId;
      if (!rid) {
        const userData = await apiClient.getUser();
        rid = userData.restaurantId || userData.restaurant?.id;
        if (rid) {
          setRestaurantId(rid);
        }
      }

      if (rid) {
        const order = await apiClient.getOrderById(rid, orderId);
        if (order) {
          // Auto-open order detail modal
          openOrderDetail(order);
          // completeBilling param just opens the detail modal — user clicks "Mark Complete" from there
          // (no auto-trigger to avoid duplicate Alert + Modal prompts)
        }
      }
    } catch (error) {
      console.error('Error loading order:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (restaurantId) {
        await loadOrders(restaurantId);
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
      case 'preparing':
        return '#f59e0b'; // amber
      case 'ready':
        return '#10b981'; // green
      case 'completed':
        return '#10b981'; // green
      case 'cancelled':
        return '#ef4444'; // red
      case 'deleted':
        return '#6b7280'; // gray
      case 'pending':
      default:
        return '#6b7280'; // gray
    }
  };

  // Get status display text (handles "DELETED (WAS: X)" format)
  const getStatusDisplay = (order) => {
    const status = order.status?.toLowerCase() || 'pending';
    if (status === 'deleted' && order.lastStatus) {
      const wasStatus = order.lastStatus.charAt(0).toUpperCase() + order.lastStatus.slice(1);
      return `DELETED (WAS: ${wasStatus.toUpperCase()})`;
    }
    return status.toUpperCase();
  };

  const formatDate = (date) => {
    if (!date) return { date: 'N/A', time: '' };
    
    try {
      const d = getOrderDate(date);
      if (isNaN(d.getTime())) return { date: 'N/A', time: '' };

      // Format date: "26 March 2026"
      const dateStr = d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Format time: "12:30 AM/PM"
      const timeStr = d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      return { date: dateStr, time: timeStr };
    } catch (error) {
      console.error('Date formatting error:', error);
      return { date: 'N/A', time: '' };
    }
  };

  const renderOrder = ({ item }) => {
    const status = item.status?.toLowerCase() || 'pending';
    const statusColor = (() => {
      switch (status) {
        case 'kitchen': case 'preparing': case 'confirmed': return '#3b82f6';
        case 'billing_completed': case 'completed': case 'ready': return '#10b981';
        case 'pending': return '#f59e0b';
        case 'cancelled': return '#ef4444';
        case 'deleted': return '#6b7280';
        default: return '#6b7280';
      }
    })();
    const itemCount = item.items?.length || 0;
    const { date, time } = formatDate(item.createdAt);
    const totalAmount = item.finalAmount || item.totalAmount || 0;
    const subtotal = item.subtotal || item.totalAmount || 0;
    const taxAmt = item.taxAmount || item.tax || 0;
    const isToday = (() => {
      try {
        const d = getOrderDate(item.createdAt);
        const now = new Date();
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
      } catch { return false; }
    })();
    const isExpanded = expandedOrders.has(item.id);
    const customerName = item.customerName || item.customerDisplay?.name || 'Walk-in Customer';
    const orderType = (item.orderType || 'dine-in').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const staffLabel = item.staffInfo?.name || item.source || null;

    // Build tax summary text
    const taxSummaryText = (() => {
      const parts = [`₹${subtotal.toFixed(2)}`];
      if (item.taxBreakdown && item.taxBreakdown.length > 0) {
        item.taxBreakdown.forEach(t => parts.push(`${t.name || 'Tax'} ${t.rate}%`));
      } else if (taxAmt > 0) {
        parts.push(`Tax ₹${taxAmt.toFixed(2)}`);
      }
      if (item.roundOffAmount != null && item.roundOffAmount !== 0) {
        parts.push(`Round ${item.roundOffAmount > 0 ? '+' : ''}₹${item.roundOffAmount.toFixed(2)}`);
      }
      return parts.length > 1 ? parts.join(' + ') : null;
    })();

    return (
      <View style={styles.orderCard}>
        {/* Header Row: Order number, status badge, staff chip */}
        <View style={styles.orderHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
            <Text style={styles.orderNumber}>
              #{item.dailyOrderId ?? (item.id ? item.id.slice(-6).toUpperCase() : '—')}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
                {getStatusDisplay(item)}
              </Text>
            </View>
            {staffLabel && (
              <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#9ca3af' }}>{staffLabel}</Text>
              </View>
            )}
            {(item.isLocal || item.offline || item.syncSource === 'offline') && (
              <Ionicons name="cloud-upload-outline" size={14} color="#3b82f6" style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>

        {/* Time row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <Ionicons name="time-outline" size={13} color="#9ca3af" />
          <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '500' }}>{time}</Text>
        </View>

        {/* Amount section + Payment info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827' }}>₹{totalAmount.toFixed(2)}</Text>
            {item.paymentMethod && (
              <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '500', marginTop: 2 }}>{item.paymentMethod.toUpperCase()}</Text>
            )}
            {taxSummaryText && (
              <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }} numberOfLines={1}>{taxSummaryText}</Text>
            )}
          </View>
          {(item.paymentStatus === 'partial' || item.outstandingAmount > 0) && (
            <View style={{ backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#dc2626' }}>PARTIAL Due: ₹{(item.outstandingAmount || 0).toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* Customer / Table / Type row */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="person-outline" size={12} color="#9ca3af" />
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '500' }} numberOfLines={1}>{customerName}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="restaurant-outline" size={12} color="#9ca3af" />
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '500' }}>{item.tableNumber ? `Table ${item.tableNumber}${item.floorName ? ` · ${item.floorName}` : ''}` : 'N/A'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="bag-handle-outline" size={12} color="#9ca3af" />
            <Text style={{ fontSize: 11, color: '#374151', fontWeight: '500' }}>{orderType}</Text>
          </View>
        </View>

        {/* Expandable items section */}
        <TouchableOpacity
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}
          onPress={() => toggleOrderExpand(item.id)}
          activeOpacity={0.7}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{itemCount} Item{itemCount !== 1 ? 's' : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#3b82f6' }}>{isExpanded ? 'Hide' : 'View'}</Text>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#3b82f6" />
          </View>
        </TouchableOpacity>
        {isExpanded && item.items && item.items.length > 0 && (
          <View style={{ paddingTop: 4, paddingBottom: 4 }}>
            {item.items.map((orderItem, idx) => (
              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, color: '#374151' }}>{orderItem.quantity}x {orderItem.name}</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>₹{((orderItem.price || 0) * (orderItem.quantity || 1)).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Footer action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          {status !== 'completed' && status !== 'billing_completed' && status !== 'cancelled' && status !== 'deleted' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#ecfdf5', paddingVertical: 8, borderRadius: 8 }}
              onPress={() => handleMarkCompleted(item.id)}
            >
              <Ionicons name="checkmark-circle" size={15} color="#059669" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Complete</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#eff6ff', paddingVertical: 8, borderRadius: 8 }}
            onPress={() => openOrderDetail(item)}
          >
            <Ionicons name="eye-outline" size={15} color="#2563eb" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563eb' }}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#fff7ed', paddingVertical: 8, borderRadius: 8 }}
            onPress={() => handlePrintBill(item)}
          >
            <Ionicons name="print-outline" size={15} color="#d97706" />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706' }}>Print</Text>
          </TouchableOpacity>
          {status !== 'deleted' && (
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#fef2f2', paddingVertical: 8, borderRadius: 8 }}
              onPress={() => handleDeleteOrder(item)}
            >
              <Ionicons name="trash-outline" size={15} color="#dc2626" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date footer - only if not today */}
        {!isToday && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500' }}>{date}</Text>
          </View>
        )}
      </View>
    );
  };

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'deleted', label: 'Deleted' },
  ];

  // Render Order Detail Modal
  const renderOrderDetailModal = () => {
    if (!selectedOrder) return null;

    const statusColor = getStatusColor(selectedOrder.status);
    const { date, time } = formatDate(selectedOrder.createdAt);
    const subtotal = selectedOrder.subtotal || selectedOrder.totalAmount || 0;
    const offerDiscount = selectedOrder.discountAmount || 0;
    const manualDiscountAmt = selectedOrder.manualDiscount || 0;
    const loyaltyDiscountAmt = selectedOrder.loyaltyDiscount || 0;
    const tax = selectedOrder.taxAmount || selectedOrder.tax || 0;
    const total = selectedOrder.finalAmount || selectedOrder.totalAmount || subtotal + tax;

    return (
      <Modal
        visible={showOrderDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOrderDetail(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Order #{selectedOrder.dailyOrderId ?? selectedOrder.id?.slice(-6).toUpperCase()}
                </Text>
                <Text style={styles.modalSubtitle}>{date} at {time}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowOrderDetail(false)}
              >
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            {/* Status Badge */}
            <View style={styles.modalStatusRow}>
              <View style={[styles.modalStatusBadge, { backgroundColor: `${statusColor}15` }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.modalStatusText, { color: statusColor }]} numberOfLines={1}>
                  {getStatusDisplay(selectedOrder)}
                </Text>
              </View>
              {selectedOrder.tableNumber && (
                <View style={styles.modalTableBadge}>
                  <Ionicons name="restaurant" size={14} color={Colors.primary} />
                  <Text style={styles.modalTableText}>Table {selectedOrder.tableNumber}</Text>
                </View>
              )}
            </View>

            {/* Customer & Order Info */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Customer</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{selectedOrder.customerName || selectedOrder.customerDisplay?.name || 'Walk-in'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Table</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{selectedOrder.tableNumber || 'N/A'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9ca3af' }}>Type</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{(selectedOrder.orderType || 'dine-in').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
              </View>
            </View>

            {/* Payment Method & Special Instructions */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 6 }}>
              {selectedOrder.paymentMethod && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="card-outline" size={14} color="#6b7280" />
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>Payment: <Text style={{ fontWeight: '600', color: '#374151' }}>{selectedOrder.paymentMethod.toUpperCase()}</Text></Text>
                </View>
              )}
              {selectedOrder.specialInstructions && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Ionicons name="document-text-outline" size={14} color="#d97706" />
                  <Text style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic', flex: 1 }}>{selectedOrder.specialInstructions}</Text>
                </View>
              )}
            </View>

            {/* Items List */}
            <ScrollView style={styles.itemsScrollView} showsVerticalScrollIndicator={false}>
              <Text style={styles.itemsSectionTitle}>Items</Text>
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                selectedOrder.items.map((item, index) => (
                  <View key={index} style={styles.orderItem}>
                    <View style={styles.orderItemLeft}>
                      <Text style={styles.orderItemQty}>{item.quantity}x</Text>
                      <Text style={styles.orderItemName}>{item.name}</Text>
                    </View>
                    <Text style={styles.orderItemPrice}>
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.noItemsText}>No items found</Text>
              )}

              {/* Order Summary */}
              <View style={styles.orderSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>₹{subtotal.toFixed(2)}</Text>
                </View>
                {offerDiscount > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: '#10b981' }]}>
                      {selectedOrder.appliedOffer?.name || 'Offer Discount'}
                    </Text>
                    <Text style={[styles.summaryValue, { color: '#10b981' }]}>-₹{offerDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {manualDiscountAmt > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: '#10b981' }]}>Manual Discount</Text>
                    <Text style={[styles.summaryValue, { color: '#10b981' }]}>-₹{manualDiscountAmt.toFixed(2)}</Text>
                  </View>
                )}
                {loyaltyDiscountAmt > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: '#10b981' }]}>Loyalty Points</Text>
                    <Text style={[styles.summaryValue, { color: '#10b981' }]}>-₹{loyaltyDiscountAmt.toFixed(2)}</Text>
                  </View>
                )}
                {/* Tax breakdown */}
                {selectedOrder.taxBreakdown && selectedOrder.taxBreakdown.length > 0 ? (
                  selectedOrder.taxBreakdown.map((t, i) => (
                    <View key={i} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t.name || 'Tax'} ({t.rate}%)</Text>
                      <Text style={styles.summaryValue}>₹{(t.amount || 0).toFixed(2)}</Text>
                    </View>
                  ))
                ) : tax > 0 ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>₹{tax.toFixed(2)}</Text>
                  </View>
                ) : null}
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>
                </View>
              </View>

              {/* Payment Info */}
              {selectedOrder.paymentMethod && (
                <View style={styles.paymentInfo}>
                  <Ionicons name="card-outline" size={16} color={Colors.textMedium} />
                  <Text style={styles.paymentText}>
                    Paid via {selectedOrder.paymentMethod.toUpperCase()}
                  </Text>
                </View>
              )}

              {/* Billing Details */}
              {(selectedOrder.serviceChargeAmount > 0 || selectedOrder.tipAmount > 0 || selectedOrder.roundOffAmount ||
                selectedOrder.splitPayments || selectedOrder.cashReceived || selectedOrder.compItems?.length > 0 ||
                selectedOrder.paymentStatus === 'partial') && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f0f0f0' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 }}>Billing Details</Text>

                  {selectedOrder.serviceChargeAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>Service Charge ({selectedOrder.serviceChargeRate || 0}%)</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>₹{selectedOrder.serviceChargeAmount}</Text>
                    </View>
                  )}

                  {selectedOrder.tipAmount > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#ec4899' }}>Tip{selectedOrder.tipPercentage ? ` (${selectedOrder.tipPercentage}%)` : ''}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#ec4899' }}>₹{selectedOrder.tipAmount}</Text>
                    </View>
                  )}

                  {selectedOrder.roundOffAmount != null && selectedOrder.roundOffAmount !== 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>Round-off</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>₹{selectedOrder.roundOffAmount}</Text>
                    </View>
                  )}

                  {selectedOrder.splitPayments && (
                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>Split Payment:</Text>
                      {selectedOrder.splitPayments.map((sp, i) => (
                        <Text key={i} style={{ fontSize: 12, color: '#374151', marginLeft: 8 }}>
                          {sp.method.charAt(0).toUpperCase() + sp.method.slice(1)}: ₹{sp.amount}
                        </Text>
                      ))}
                    </View>
                  )}

                  {selectedOrder.cashReceived > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>Cash Received</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>₹{selectedOrder.cashReceived}</Text>
                    </View>
                  )}
                  {selectedOrder.changeReturned > 0 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#6b7280' }}>Change Returned</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>₹{selectedOrder.changeReturned}</Text>
                    </View>
                  )}

                  {selectedOrder.compItems?.length > 0 && (
                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: '#14b8a6', marginBottom: 2 }}>Comp Items:</Text>
                      {selectedOrder.compItems.map((ci, i) => (
                        <Text key={i} style={{ fontSize: 12, color: '#374151', marginLeft: 8 }}>
                          {ci.quantity}x {ci.name} - ₹{ci.amount} ({ci.reason})
                        </Text>
                      ))}
                    </View>
                  )}

                  {(selectedOrder.paymentStatus === 'partial' || selectedOrder.outstandingAmount > 0) && (
                    <View style={{ backgroundColor: '#fef3c7', padding: 8, borderRadius: 6, marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: '#92400e' }}>Paid</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>₹{selectedOrder.paidAmount || 0}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={{ fontSize: 13, color: '#92400e' }}>Outstanding</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#dc2626' }}>₹{selectedOrder.outstandingAmount || 0}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowOrderDetail(false)}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>

              {/* Print Bill */}
              <TouchableOpacity
                style={{ backgroundColor: '#f59e0b', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
                onPress={() => { setShowOrderDetail(false); handlePrintBill(selectedOrder); }}
              >
                <Ionicons name="print-outline" size={18} color="#fff" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Print Bill</Text>
              </TouchableOpacity>

              {/* Complete — only if not completed/cancelled/deleted */}
              {selectedOrder.status !== 'completed' && selectedOrder.status !== 'billing_completed' && selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'deleted' && (
                <TouchableOpacity
                  style={{ backgroundColor: '#059669', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
                  onPress={() => { setShowOrderDetail(false); handleMarkCompleted(selectedOrder.id); }}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Mark Complete</Text>
                </TouchableOpacity>
              )}

              {(selectedOrder.paymentStatus === 'partial' || selectedOrder.outstandingAmount > 0) && selectedOrder.status === 'completed' && (
                <TouchableOpacity
                  style={{ backgroundColor: '#f59e0b', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
                  onPress={() => {
                    Alert.alert(
                      'Mark as Paid',
                      `Mark outstanding ₹${selectedOrder.outstandingAmount || 0} as paid?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Mark Paid', onPress: () => executeMarkPaid(selectedOrder.id) },
                      ]
                    );
                  }}
                  disabled={markPaidSubmitting}
                >
                  <Ionicons name="wallet-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                    {markPaidSubmitting ? 'Processing...' : 'Mark as Fully Paid'}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedOrder.status === 'completed' && selectedOrder.paymentStatus !== 'partial' && !selectedOrder.refundStatus && (
                <TouchableOpacity
                  style={{ backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
                  onPress={() => setShowRefundPanel(!showRefundPanel)}
                >
                  <Ionicons name="return-down-back-outline" size={18} color="#fff" />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Refund</Text>
                </TouchableOpacity>
              )}
              {selectedOrder.refundStatus && (
                <View style={{ backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#ef4444" />
                  <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '600' }}>
                    {selectedOrder.refundStatus === 'refunded' ? 'Fully Refunded' : 'Partially Refunded'} — ₹{selectedOrder.refundAmount || 0}
                  </Text>
                </View>
              )}
              {showRefundPanel && (
                <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, padding: 12, marginTop: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#dc2626', marginBottom: 8 }}>Process Refund</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: refundType === 'full' ? '#ef4444' : '#f3f4f6', alignItems: 'center' }}
                      onPress={() => setRefundType('full')}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: refundType === 'full' ? '#fff' : '#6b7280' }}>Full Refund</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, paddingVertical: 8, borderRadius: 6, backgroundColor: refundType === 'partial' ? '#ef4444' : '#f3f4f6', alignItems: 'center' }}
                      onPress={() => setRefundType('partial')}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: refundType === 'partial' ? '#fff' : '#6b7280' }}>Partial</Text>
                    </TouchableOpacity>
                  </View>
                  {refundType === 'partial' && (
                    <TextInput
                      style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 8 }}
                      placeholder="Refund amount"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      value={refundAmount}
                      onChangeText={setRefundAmount}
                    />
                  )}
                  <TextInput
                    style={{ backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 8 }}
                    placeholder="Reason for refund"
                    placeholderTextColor="#9ca3af"
                    value={refundReason}
                    onChangeText={setRefundReason}
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: '#dc2626', paddingVertical: 10, borderRadius: 8, alignItems: 'center', opacity: refundSubmitting ? 0.6 : 1 }}
                    onPress={executeRefund}
                    disabled={refundSubmitting}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                      {refundSubmitting ? 'Processing...' : `Refund ₹${refundType === 'full' ? (selectedOrder.finalAmount || selectedOrder.totalAmount || 0) : (parseFloat(refundAmount) || 0)}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // Compute summary from analytics or orders
  const summaryData = useMemo(() => {
    const totalRevenue = analyticsStats?.totalRevenue || orders.reduce((sum, o) => sum + (o.finalAmount || o.totalAmount || 0), 0);
    const totalOrders = analyticsStats?.totalOrders || orders.length;
    const completedCount = analyticsStats?.completedOrders || orders.filter(o => o.status === 'completed').length;
    const pb = analyticsStats?.paymentBreakdown || {};
    return { totalRevenue, totalOrders, completedCount, paymentBreakdown: pb };
  }, [analyticsStats, orders]);

  // Sales Summary fetching
  const fetchSaleSummary = useCallback(async (period) => {
    if (!restaurantId) return;
    const p = period || summaryPeriod;
    setSaleSummaryLoading(true);
    try {
      const options = {};
      if (p !== 'custom') options.period = p;
      const res = await apiClient.getDailySummary(restaurantId, options);
      if (res?.success) setSaleSummaryData(res.summary);
    } catch (err) {
      console.error('Summary fetch error:', err);
    } finally {
      setSaleSummaryLoading(false);
    }
  }, [restaurantId, summaryPeriod]);

  const handleSummaryPeriodChange = useCallback((period) => {
    setSummaryPeriod(period);
    setSaleSummaryData(null);
    fetchSaleSummary(period);
  }, [fetchSaleSummary]);

  // Auto-fetch when switching to summary view
  useEffect(() => {
    if (activeView === 'summary' && restaurantId && !saleSummaryData && !saleSummaryLoading) {
      fetchSaleSummary();
    }
  }, [activeView, restaurantId]);

  const getFilteredSummaryItems = useCallback(() => {
    if (!saleSummaryData?.items) return [];
    let items = [...saleSummaryData.items];
    if (summarySearch) {
      const term = summarySearch.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(term));
    }
    items.sort((a, b) => {
      let cmp = 0;
      if (summarySortBy === 'quantity') cmp = a.quantity - b.quantity;
      else if (summarySortBy === 'revenue') cmp = a.revenue - b.revenue;
      else cmp = a.name.localeCompare(b.name);
      return summarySortDir === 'desc' ? -cmp : cmp;
    });
    return items;
  }, [saleSummaryData, summarySearch, summarySortBy, summarySortDir]);

  const toggleSummarySort = (field) => {
    if (summarySortBy === field) {
      setSummarySortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSummarySortBy(field);
      setSummarySortDir('desc');
    }
  };

  const summaryPeriods = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
  ];

  // Check if any filter is active
  const hasActiveFilters = selectedStatus !== 'all' || selectedPaymentMethod !== 'all' || searchTerm.trim() || dateFilterMode !== 'today';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
          <Text style={styles.loadingText}>Loading orders...</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: -8 }}>Fetching your data</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {/* Title Row with Tab Toggle */}
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>{activeView === 'orders' ? 'Orders' : 'Sales Summary'}</Text>
            {restaurantName ? <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500', marginTop: 1 }}>{restaurantName}</Text> : null}
            {activeView === 'orders' && (
              <Text style={styles.headerSubtitle}>{summaryData.totalOrders} orders {dateFilterMode === 'today' ? 'today' : dateFilterMode === 'yesterday' ? 'yesterday' : dateFilterMode === '7days' ? 'this week' : dateFilterMode === '30days' ? 'this month' : ''}</Text>
            )}
            {activeView === 'summary' && (
              <Text style={styles.headerSubtitle}>{summaryPeriod === 'today' ? "Today's" : summaryPeriod === 'yesterday' ? "Yesterday's" : summaryPeriod === '7d' ? 'Last 7 days' : 'Last 30 days'} performance</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {activeView === 'orders' && hasActiveFilters && (
              <TouchableOpacity
                onPress={() => { setSelectedStatus('all'); setSelectedPaymentMethod('all'); setSearchTerm(''); setDateFilterMode('today'); }}
                style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fef2f2', borderRadius: 8 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.primary }}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={activeView === 'orders' ? onRefresh : () => fetchSaleSummary()} disabled={refreshing || backgroundLoading || saleSummaryLoading} style={styles.refreshButton}>
              <Animated.View style={{ transform: [{ rotate: (backgroundLoading || refreshing) ? spin : '0deg' }] }}>
                <Ionicons name="refresh" size={22} color={Colors.primary} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabToggleContainer}>
          <TouchableOpacity
            style={[styles.tabToggleButton, activeView === 'orders' && styles.tabToggleActive]}
            onPress={() => setActiveView('orders')}
          >
            <Ionicons name="receipt-outline" size={14} color={activeView === 'orders' ? '#fff' : '#6b7280'} />
            <Text style={[styles.tabToggleText, activeView === 'orders' && styles.tabToggleTextActive]}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabToggleButton, activeView === 'summary' && styles.tabToggleActive]}
            onPress={() => setActiveView('summary')}
          >
            <Ionicons name="bar-chart-outline" size={14} color={activeView === 'summary' ? '#fff' : '#6b7280'} />
            <Text style={[styles.tabToggleText, activeView === 'summary' && styles.tabToggleTextActive]}>Sales Summary</Text>
          </TouchableOpacity>
        </View>

        {/* Summary Period Filters (when in summary view) */}
        {activeView === 'summary' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 6 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
            {summaryPeriods.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chipBase, summaryPeriod === p.key && styles.chipActiveRed]}
                onPress={() => handleSummaryPeriodChange(p.key)}
              >
                <Text style={[styles.chipText, summaryPeriod === p.key && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {activeView === 'orders' && (<>
        {/* Summary Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
            <View style={[styles.statIconBox, { backgroundColor: '#22c55e' }]}>
              <Ionicons name="cash-outline" size={14} color="#fff" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Revenue</Text>
              <Text style={[styles.statValue, { color: '#166534' }]}>{'\u20B9'}{summaryData.totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#eff6ff' }]}>
            <View style={[styles.statIconBox, { backgroundColor: '#3b82f6' }]}>
              <Ionicons name="receipt-outline" size={14} color="#fff" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Orders</Text>
              <Text style={[styles.statValue, { color: '#1e40af' }]}>{summaryData.totalOrders}</Text>
            </View>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#faf5ff' }]}>
            <View style={[styles.statIconBox, { backgroundColor: '#a855f7' }]}>
              <Ionicons name="card-outline" size={14} color="#fff" />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statLabel}>Payments</Text>
              {Object.keys(summaryData.paymentBreakdown).length > 0 ? (
                <View style={{ gap: 1 }}>
                  {Object.entries(summaryData.paymentBreakdown).sort((a, b) => b[1].total - a[1].total).map(([method, data]) => {
                    const colorMap = { cash: '#16a34a', upi: '#7c3aed', card: '#2563eb', online: '#0891b2' };
                    return (
                      <View key={method} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colorMap[method] || '#6b7280', textTransform: 'capitalize' }}>{method}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#1f2937' }}>{'\u20B9'}{data.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>({data.count})</Text></Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={[styles.statValue, { color: '#6b21a8' }]}>--</Text>
              )}
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={16} color={Colors.textMedium} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search orders..."
            placeholderTextColor={Colors.textLight}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearSearchButton}>
              <Ionicons name="close-circle" size={18} color={Colors.textMedium} />
            </TouchableOpacity>
          )}
        </View>

        {/* Combined Filters Row: Date + Status + Payment in one scrollable row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {/* Date filters */}
          {dateFilterOptions.map((option) => {
            const disabled = isRestrictedRole && option.value === 'all';
            const isActive = dateFilterMode === option.value;
            return (
              <TouchableOpacity
                key={`date-${option.value}`}
                style={[styles.chipBase, isActive && styles.chipActiveRed, disabled && { opacity: 0.4 }]}
                onPress={() => { if (!disabled) setDateFilterMode(option.value); }}
              >
                {option.value === 'custom' && (
                  <Ionicons name="calendar-outline" size={12} color={isActive ? '#fff' : '#6b7280'} style={{ marginRight: 3 }} />
                )}
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Separator */}
          <View style={styles.chipSeparator} />

          {/* Status filters */}
          {statusOptions.map((option) => {
            const isActive = selectedStatus === option.value;
            return (
              <TouchableOpacity
                key={`status-${option.value}`}
                style={[styles.chipBase, isActive && styles.chipActiveGray]}
                onPress={() => setSelectedStatus(option.value)}
              >
                <Text style={[styles.chipText, isActive && { color: '#fff' }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}

          {/* Separator */}
          <View style={styles.chipSeparator} />

          {/* Payment method filters */}
          {paymentMethodOptions.map((option) => {
            const isActive = selectedPaymentMethod === option.value;
            return (
              <TouchableOpacity
                key={`pay-${option.value}`}
                style={[styles.chipBase, isActive && styles.chipActivePurple]}
                onPress={() => setSelectedPaymentMethod(option.value)}
              >
                <Text style={[styles.chipText, isActive && { color: '#fff' }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Custom Date Range Picker */}
        {dateFilterMode === 'custom' && (
          <View style={styles.customDateRow}>
            <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowStartPicker(true)}>
              <Ionicons name="calendar" size={14} color={Colors.primary} />
              <Text style={styles.datePickerText}>{formatShortDate(customStartDate)}</Text>
            </TouchableOpacity>
            <Text style={styles.dateRangeSeparator}>to</Text>
            <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowEndPicker(true)}>
              <Ionicons name="calendar" size={14} color={Colors.primary} />
              <Text style={styles.datePickerText}>{formatShortDate(customEndDate)}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* DateTimePicker Modals */}
        {showStartPicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade" visible={showStartPicker}>
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <Text style={styles.pickerModalTitle}>From Date</Text>
                    <TouchableOpacity onPress={() => setShowStartPicker(false)}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={customStartDate}
                    mode="date"
                    display="spinner"
                    maximumDate={customEndDate}
                    minimumDate={isRestrictedRole ? thirtyDaysAgo : undefined}
                    onChange={(e, date) => { if (date) setCustomStartDate(date); }}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={customStartDate}
              mode="date"
              display="default"
              maximumDate={customEndDate}
              minimumDate={isRestrictedRole ? thirtyDaysAgo : undefined}
              onChange={(e, date) => {
                setShowStartPicker(false);
                if (date) setCustomStartDate(date);
              }}
            />
          )
        )}

        {showEndPicker && (
          Platform.OS === 'ios' ? (
            <Modal transparent animationType="fade" visible={showEndPicker}>
              <View style={styles.pickerModalOverlay}>
                <View style={styles.pickerModalContent}>
                  <View style={styles.pickerModalHeader}>
                    <Text style={styles.pickerModalTitle}>To Date</Text>
                    <TouchableOpacity onPress={() => setShowEndPicker(false)}>
                      <Text style={styles.pickerDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
                    value={customEndDate}
                    mode="date"
                    display="spinner"
                    minimumDate={customStartDate}
                    maximumDate={new Date()}
                    onChange={(e, date) => { if (date) setCustomEndDate(date); }}
                  />
                </View>
              </View>
            </Modal>
          ) : (
            <DateTimePicker
              value={customEndDate}
              mode="date"
              display="default"
              minimumDate={customStartDate}
              maximumDate={new Date()}
              onChange={(e, date) => {
                setShowEndPicker(false);
                if (date) setCustomEndDate(date);
              }}
            />
          )
        )}

        {/* Loading bar when fetching */}
        {(backgroundLoading || syncing) && (
          <View style={styles.loadingBar}>
            <View style={styles.loadingBarInner} />
          </View>
        )}
        </>)}
      </View>

      {/* ========== ORDERS VIEW ========== */}
      {activeView === 'orders' && (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.list, tabletContentStyle]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="receipt-outline" size={36} color={Colors.textLight} />
              </View>
              <Text style={styles.emptyText}>No orders found</Text>
              <Text style={styles.emptySubtext}>
                {hasActiveFilters
                  ? 'Try adjusting your filters or date range'
                  : 'Orders will appear here once placed'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ========== SALES SUMMARY VIEW ========== */}
      {activeView === 'summary' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
          {saleSummaryLoading ? (
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 12 }}>Loading summary...</Text>
            </View>
          ) : saleSummaryData ? (
            <View>
              {/* KPI Cards */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <View style={[summaryStyles.kpiCard, { backgroundColor: '#f0fdf4' }]}>
                  <View style={[summaryStyles.kpiIcon, { backgroundColor: '#22c55e' }]}>
                    <Ionicons name="cash-outline" size={14} color="#fff" />
                  </View>
                  <Text style={summaryStyles.kpiLabel}>Revenue</Text>
                  <Text style={[summaryStyles.kpiValue, { color: '#166534' }]}>
                    {'\u20B9'}{(saleSummaryData.totalRevenueWithTax || saleSummaryData.totalRevenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View style={[summaryStyles.kpiCard, { backgroundColor: '#eff6ff' }]}>
                  <View style={[summaryStyles.kpiIcon, { backgroundColor: '#3b82f6' }]}>
                    <Ionicons name="receipt-outline" size={14} color="#fff" />
                  </View>
                  <Text style={summaryStyles.kpiLabel}>Orders</Text>
                  <Text style={[summaryStyles.kpiValue, { color: '#1e40af' }]}>{saleSummaryData.totalOrders || 0}</Text>
                  {saleSummaryData.avgOrderValue > 0 && (
                    <Text style={summaryStyles.kpiSub}>avg: {'\u20B9'}{Math.round(saleSummaryData.avgOrderValue)}</Text>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <View style={[summaryStyles.kpiCard, { backgroundColor: '#faf5ff' }]}>
                  <View style={[summaryStyles.kpiIcon, { backgroundColor: '#a855f7' }]}>
                    <Ionicons name="pricetag-outline" size={14} color="#fff" />
                  </View>
                  <Text style={summaryStyles.kpiLabel}>Items Sold</Text>
                  <Text style={[summaryStyles.kpiValue, { color: '#6b21a8' }]}>
                    {saleSummaryData.items?.reduce((s, i) => s + i.quantity, 0) || 0}
                  </Text>
                  <Text style={summaryStyles.kpiSub}>{saleSummaryData.items?.length || 0} unique</Text>
                </View>
                <View style={[summaryStyles.kpiCard, { backgroundColor: '#fff7ed' }]}>
                  <View style={[summaryStyles.kpiIcon, { backgroundColor: '#f59e0b' }]}>
                    <Ionicons name="people-outline" size={14} color="#fff" />
                  </View>
                  <Text style={summaryStyles.kpiLabel}>Customers</Text>
                  <Text style={[summaryStyles.kpiValue, { color: '#92400e' }]}>{saleSummaryData.uniqueCustomers || 0}</Text>
                </View>
              </View>

              {/* Daily Revenue Trend (multi-day) */}
              {saleSummaryData.dailyRevenue && saleSummaryData.dailyRevenue.length > 1 && (
                <View style={summaryStyles.sectionCard}>
                  <Text style={summaryStyles.sectionTitle}>Daily Revenue Trend</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100 }}>
                    {(() => {
                      const maxRev = Math.max(...saleSummaryData.dailyRevenue.map(d => d.revenue), 1);
                      return saleSummaryData.dailyRevenue.map((day, idx) => {
                        const height = Math.max((day.revenue / maxRev) * 100, 4);
                        const d = new Date(day.date + 'T12:00:00');
                        const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                        return (
                          <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                            <Text style={{ fontSize: 8, color: '#9ca3af', marginBottom: 2 }}>{'\u20B9'}{Math.round(day.revenue)}</Text>
                            <View style={{ width: '80%', height: `${height}%`, backgroundColor: Colors.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 4 }} />
                            <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{label}</Text>
                          </View>
                        );
                      });
                    })()}
                  </View>
                </View>
              )}

              {/* Order Types */}
              {saleSummaryData.ordersByType && Object.keys(saleSummaryData.ordersByType).length > 0 && (
                <View style={summaryStyles.sectionCard}>
                  <Text style={summaryStyles.sectionTitle}>Order Types</Text>
                  {(() => {
                    const typeTotal = Object.values(saleSummaryData.ordersByType).reduce((s, v) => s + v, 0);
                    const typeColors = { dine_in: '#3b82f6', delivery: '#22c55e', takeaway: '#f59e0b', customer_self_order: '#a855f7' };
                    return Object.entries(saleSummaryData.ordersByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                      const pct = typeTotal > 0 ? Math.round((count / typeTotal) * 100) : 0;
                      const color = typeColors[type] || '#6b7280';
                      return (
                        <View key={type} style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</Text>
                            <Text style={{ fontSize: 12, color: '#6b7280' }}>{count} ({pct}%)</Text>
                          </View>
                          <View style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: `${Math.min(pct, 100)}%` }} />
                          </View>
                        </View>
                      );
                    });
                  })()}
                </View>
              )}

              {/* Busiest Hours */}
              {saleSummaryData.hourlyBreakdown && Object.keys(saleSummaryData.hourlyBreakdown).length > 0 && (
                <View style={summaryStyles.sectionCard}>
                  <Text style={summaryStyles.sectionTitle}>Busiest Hours</Text>
                  {Object.entries(saleSummaryData.hourlyBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([hour, count]) => {
                    const h = parseInt(hour);
                    const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
                    const maxH = Math.max(...Object.values(saleSummaryData.hourlyBreakdown));
                    const pct = maxH > 0 ? Math.round((count / maxH) * 100) : 0;
                    return (
                      <View key={hour} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Text style={{ fontSize: 11, color: '#6b7280', width: 42, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{label}</Text>
                        <View style={{ flex: 1, height: 8, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#f97316', width: `${pct}%` }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151', width: 24 }}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Item-wise Sales */}
              <View style={summaryStyles.sectionCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={summaryStyles.sectionTitle}>Item-wise Sales</Text>
                  <Text style={{ fontSize: 11, color: '#9ca3af' }}>{saleSummaryData.items?.length || 0} items</Text>
                </View>
                {/* Search */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, height: 34, marginBottom: 10 }}>
                  <Ionicons name="search" size={14} color="#9ca3af" style={{ marginRight: 6 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 12, color: '#374151', paddingVertical: 0 }}
                    placeholder="Search items..."
                    placeholderTextColor="#9ca3af"
                    value={summarySearch}
                    onChangeText={setSummarySearch}
                  />
                  {summarySearch.length > 0 && (
                    <TouchableOpacity onPress={() => setSummarySearch('')}>
                      <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
                {/* Sort buttons */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {[{ key: 'quantity', label: 'Qty' }, { key: 'revenue', label: 'Revenue' }, { key: 'name', label: 'Name' }].map(s => (
                    <TouchableOpacity
                      key={s.key}
                      style={[styles.chipBase, { paddingHorizontal: 8, paddingVertical: 4 }, summarySortBy === s.key && { backgroundColor: '#374151', borderColor: '#374151' }]}
                      onPress={() => toggleSummarySort(s.key)}
                    >
                      <Text style={[styles.chipText, { fontSize: 10 }, summarySortBy === s.key && { color: '#fff' }]}>{s.label}</Text>
                      {summarySortBy === s.key && (
                        <Ionicons name={summarySortDir === 'desc' ? 'arrow-down' : 'arrow-up'} size={10} color="#fff" style={{ marginLeft: 2 }} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
                {/* Items list */}
                {(() => {
                  const items = getFilteredSummaryItems();
                  const totalRev = items.reduce((s, i) => s + i.revenue, 0);
                  return items.length > 0 ? items.map((item, idx) => {
                    const revPct = totalRev > 0 ? ((item.revenue / totalRev) * 100) : 0;
                    const isTop3 = idx < 3 && summarySortBy === 'quantity' && summarySortDir === 'desc';
                    return (
                      <View key={item.originalKey || item.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < items.length - 1 ? 1 : 0, borderBottomColor: '#f3f4f6' }}>
                        <View style={{ width: 24 }}>
                          {isTop3 ? (
                            <View style={{ backgroundColor: idx === 0 ? '#fef3c7' : idx === 1 ? '#f3f4f6' : '#fff7ed', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, alignItems: 'center' }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: idx === 0 ? '#92400e' : idx === 1 ? '#6b7280' : '#c2410c' }}>
                                {idx === 0 ? '1st' : idx === 1 ? '2nd' : '3rd'}
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{idx + 1}</Text>
                          )}
                        </View>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: '#374151', marginLeft: 6 }} numberOfLines={1}>{item.name}</Text>
                        <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginRight: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563eb' }}>{item.quantity}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', minWidth: 70 }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{'\u20B9'}{item.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
                          <Text style={{ fontSize: 9, color: '#9ca3af' }}>{revPct.toFixed(1)}%</Text>
                        </View>
                      </View>
                    );
                  }) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Ionicons name="basket-outline" size={32} color="#d1d5db" />
                      <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>No items found</Text>
                    </View>
                  );
                })()}
              </View>
            </View>
          ) : (
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="bar-chart-outline" size={48} color="#d1d5db" />
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#6b7280', marginTop: 12 }}>No summary data</Text>
              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Pull to refresh or change period</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Order Detail Modal */}
      {renderOrderDetailModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 6,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
    marginTop: 2,
  },
  refreshButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    padding: 10,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.textDark,
    paddingVertical: 0,
  },
  clearSearchButton: {
    padding: 4,
  },
  // Unified chip styles
  chipBase: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActiveRed: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipActiveGray: {
    backgroundColor: '#374151',
    borderColor: '#374151',
  },
  chipActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  chipTextActive: {
    color: '#fff',
  },
  chipSeparator: {
    width: 1,
    height: 20,
    backgroundColor: '#d1d5db',
    marginHorizontal: 4,
    alignSelf: 'center',
  },
  // Custom date
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  datePickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  dateRangeSeparator: {
    fontSize: 12,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pickerModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  pickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  filtersContainer: {
    paddingBottom: 6,
  },
  filtersContent: {
    paddingHorizontal: 12,
    gap: 6,
  },
  // Loading bar
  loadingBar: {
    height: 2,
    backgroundColor: '#fee2e2',
    overflow: 'hidden',
  },
  loadingBarInner: {
    height: 2,
    width: '40%',
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  list: {
    padding: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  orderInfo: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tableNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    maxWidth: 150,
  },
  orderDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  orderDetailItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  cardFooter: {
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f9fafb',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    minHeight: 300,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textMedium,
    textAlign: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textDark,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textMedium,
    marginTop: 4,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  modalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 12,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalTableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalTableText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  itemsScrollView: {
    paddingHorizontal: Spacing.lg,
    maxHeight: 350,
  },
  itemsSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  orderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  orderItemQty: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 30,
  },
  orderItemName: {
    fontSize: 14,
    color: Colors.textDark,
    flex: 1,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  noItemsText: {
    fontSize: 14,
    color: Colors.textMedium,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  orderSummary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 2,
    borderTopColor: '#e5e7eb',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textDark,
  },
  totalRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10b981',
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  modalFooter: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  closeModalButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  // Tab Toggle
  tabToggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 3,
  },
  tabToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabToggleActive: {
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  tabToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  tabToggleTextActive: {
    color: '#fff',
  },
});

const summaryStyles = StyleSheet.create({
  kpiCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
  },
  kpiIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  kpiSub: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 1,
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 10,
  },
});
