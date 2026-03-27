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
import apiClient from '../../services/api';
import { getCached, setCache } from '../../services/cacheManager';
import SyncIndicator from '../../components/SyncIndicator';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

// Pusher configuration (same as web frontend)
const PUSHER_KEY = '4e1f74ae05c66bbc4eec';
const PUSHER_CLUSTER = 'ap2';

export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);

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

  // Order detail modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);

  // Pusher reference
  const pusherRef = useRef(null);
  const channelRef = useRef(null);

  useEffect(() => {
    loadInitialData();
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

  // Background refresh when tab is focused
  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) {
        // Fetch latest data in background
        loadOrdersInBackground(restaurantId);
      }
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

  // Pusher subscription for real-time order updates
  useEffect(() => {
    if (!restaurantId) return;

    // Initialize Pusher
    const pusher = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
    });

    pusherRef.current = pusher;

    // Subscribe to restaurant-specific channel
    const channelName = `restaurant-${restaurantId}`;
    const channel = pusher.subscribe(channelName);
    channelRef.current = channel;

    console.log(`📡 Pusher: Subscribed to channel '${channelName}'`);

    // Handle order events
    const handleOrderEvent = (eventName, data) => {
      console.log(`📡 Pusher: Received '${eventName}' event:`, data);
      // Refresh orders list in background
      loadOrdersInBackground(restaurantId);
    };

    channel.bind('order-created', (data) => handleOrderEvent('order-created', data));
    channel.bind('order-status-updated', (data) => handleOrderEvent('order-status-updated', data));
    channel.bind('order-updated', (data) => handleOrderEvent('order-updated', data));
    channel.bind('order-deleted', (data) => handleOrderEvent('order-deleted', data));

    // Cleanup on unmount
    return () => {
      console.log(`📡 Pusher: Unsubscribing from channel '${channelName}'`);
      if (channelRef.current) {
        channelRef.current.unbind_all();
      }
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
      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        return;
      }

      setRestaurantId(rid);

      // Stale-while-revalidate: show cached data instantly, then refresh in background
      const cachedOrders = await getCached('cache_orders_' + rid);
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
        setCache('cache_orders_' + restaurantId, ordersList);
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
        setCache('cache_orders_' + rid, ordersList);
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

  const openOrderDetail = (order) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
  };

  const getOrderDate = (date) => {
    if (!date) return new Date(0);
    if (date.toDate) return date.toDate();
    if (date._seconds) return new Date(date._seconds * 1000);
    return new Date(date);
  };

  const loadOrderById = async (orderId) => {
    try {
      if (!restaurantId) {
        const userData = await apiClient.getUser();
        const rid = userData.restaurantId || userData.restaurant?.id;
        if (rid) {
          setRestaurantId(rid);
        }
      }

      if (restaurantId) {
        const order = await apiClient.getOrderById(restaurantId, orderId);
        if (order) {
          // Handle order details
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
    const statusColor = getStatusColor(item.status);
    const itemCount = item.items?.length || 0;
    const { date, time } = formatDate(item.createdAt);
    // Use finalAmount (includes tax) if available, fallback to totalAmount
    const totalAmount = item.finalAmount || item.totalAmount || 0;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => openOrderDetail(item)}
        activeOpacity={0.7}
      >
        {/* Order Header */}
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderNumber}>
              #{item.dailyOrderId ?? (item.id ? item.id.slice(-6).toUpperCase() : '—')}
            </Text>
            {item.tableNumber && (
              <View style={styles.tableBadge}>
                <Ionicons name="restaurant" size={12} color={Colors.primary} />
                <Text style={styles.tableNumber}>{item.tableNumber}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
                {getStatusDisplay(item)}
              </Text>
            </View>
            {item.status !== 'deleted' && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteOrder(item);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Order Details Grid */}
        <View style={styles.orderDetailsGrid}>
          <View style={styles.orderDetailItem}>
            <View style={[styles.detailIcon, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Items</Text>
              <Text style={styles.detailValue}>{itemCount}</Text>
            </View>
          </View>

          <View style={styles.orderDetailItem}>
            <View style={[styles.detailIcon, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="time-outline" size={16} color="#3b82f6" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{time}</Text>
            </View>
          </View>

          <View style={styles.orderDetailItem}>
            <View style={[styles.detailIcon, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="cash-outline" size={16} color="#10b981" />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Amount</Text>
              <Text style={styles.detailValue}>₹{totalAmount.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* Card footer */}
        <View style={styles.cardFooter}>
          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMedium} />
            <Text style={styles.dateText}>{date}</Text>
          </View>
        </View>
      </TouchableOpacity>
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
                {tax > 0 && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Tax</Text>
                    <Text style={styles.summaryValue}>₹{tax.toFixed(2)}</Text>
                  </View>
                )}
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
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.closeModalButton}
                onPress={() => setShowOrderDetail(false)}
              >
                <Text style={styles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
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
        {/* Title Row */}
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Orders</Text>
            <Text style={styles.headerSubtitle}>{summaryData.totalOrders} orders {dateFilterMode === 'today' ? 'today' : dateFilterMode === 'yesterday' ? 'yesterday' : dateFilterMode === '7days' ? 'this week' : dateFilterMode === '30days' ? 'this month' : ''}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {hasActiveFilters && (
              <TouchableOpacity
                onPress={() => { setSelectedStatus('all'); setSelectedPaymentMethod('all'); setSearchTerm(''); setDateFilterMode('today'); }}
                style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fef2f2', borderRadius: 8 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: Colors.primary }}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onRefresh} disabled={refreshing || backgroundLoading} style={styles.refreshButton}>
              <Animated.View style={{ transform: [{ rotate: (backgroundLoading || refreshing) ? spin : '0deg' }] }}>
                <Ionicons name="refresh" size={22} color={Colors.primary} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

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
      </View>

      <SyncIndicator visible={syncing} />

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
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
});
