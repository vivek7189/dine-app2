import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Animated, Vibration, RefreshControl, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ref, onChildAdded, off, query, orderByChild, startAt } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '../config/firebase';
import apiClient from '../services/api';
import lanClient from '../services/lanClient';
import * as printerService from '../services/printerService';
import { useToast } from '../components/Toast';
import WaiterOrderModal from '../components/WaiterOrderModal';
import { Colors, Spacing, Shadows } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import { formatCurrency } from '../utils/formatCurrency';

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'My Tables' },
  { key: 'ready', label: 'Ready' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'done', label: 'Done' },
];

const STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready: '#22c55e',
  completed: '#6b7280',
  served: '#3b82f6',
  cancelled: '#ef4444',
  refunded: '#f59e0b',
};

const STATUS_LABELS = {
  pending: 'PENDING',
  confirmed: 'CONFIRMED',
  preparing: 'KITCHEN',
  ready: 'READY',
  completed: 'DONE',
  served: 'SERVED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED',
};

const parseDate = (val) => {
  if (!val) return null;
  // Firestore Timestamp object
  if (val._seconds) return new Date(val._seconds * 1000);
  if (val.seconds) return new Date(val.seconds * 1000);
  // Already a Date
  if (val instanceof Date) return val;
  // String or number
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const getOrderTime = (order) => {
  return parseDate(order.kotTime) || parseDate(order.createdAt) || parseDate(order.timestamp) || parseDate(order.completedAt) || parseDate(order.orderTime);
};

const getTimeAgo = (dateStr) => {
  const d = parseDate(dateStr);
  if (!d) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
};

const formatTime = (dateStr) => {
  const d = parseDate(dateStr);
  if (!d) return '';
  try {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
};

export default function ActiveOrdersNative() {
  const router = useRouter();
  const { fs, r, isTablet } = useResponsive();
  const { effectivelyOffline } = useOffline();
  const { toast, ToastView } = useToast();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrders, setExpandedOrders] = useState({});
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [printMenuOrderId, setPrintMenuOrderId] = useState(null);
  const [showWaiterOrderModal, setShowWaiterOrderModal] = useState(false);
  const [editOrderContext, setEditOrderContext] = useState(null);

  const loadDataRef = useRef(null);
  const mountedRef = useRef(true);
  const shimmerAnim = useRef(new Animated.Value(1)).current;
  const printSettingsRef = useRef(null);

  // Shimmer animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const loadData = useCallback(async (showSpinner = true) => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) return;
      setUser(userData);

      let resId = userData.restaurantId;
      if (!resId && (userData.role === 'owner' || userData.role === 'admin')) {
        const res = await apiClient.getRestaurants();
        if (res?.restaurants?.length > 0) {
          resId = res.restaurants[0].id;
          setRestaurant(res.restaurants[0]);
        }
      } else if (userData.restaurant) {
        setRestaurant(userData.restaurant);
      }
      if (!resId) return;
      setRestaurantId(resId);

      // Load print settings (fire-and-forget, use cached if available)
      if (!printSettingsRef.current) {
        try {
          const cachedPS = await AsyncStorage.getItem(`dine_print_settings_${resId}`);
          if (cachedPS) printSettingsRef.current = JSON.parse(cachedPS);
          apiClient.getPrintSettings(resId).then(res => {
            printSettingsRef.current = res?.printSettings || res || {};
          }).catch(() => {});
        } catch (_) {}
      }

      if (showSpinner && orders.length === 0) setLoading(true);

      // Fetch today's orders
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const response = await apiClient.getOrders(resId, {
        startDate: todayStart.toISOString(),
        endDate: todayEnd.toISOString(),
        limit: 200,
        sort: 'newest',
      });
      if (mountedRef.current) setOrders(response?.orders || []);
    } catch (error) {
      console.error('ActiveOrders: Error loading data:', error);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  loadDataRef.current = loadData;

  useEffect(() => { loadData(true); }, []);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId) loadDataRef.current?.(false);
    }, [restaurantId])
  );

  // Firebase RTDB + LAN Hub
  useEffect(() => {
    if (!restaurantId || !database) return;

    const handleEvent = () => {
      loadDataRef.current?.(false);
    };

    const eventNames = ['order-created', 'order-status-updated', 'order-updated', 'order-deleted'];
    const lanUnsubs = [];

    if (lanClient.isPaired()) {
      eventNames.forEach(evt => {
        lanUnsubs.push(lanClient.onEvent(evt, handleEvent));
      });
      setIsLive(true);
    }

    const now = Date.now();
    const ordersQuery = query(
      ref(database, `events/${restaurantId}/orders`),
      orderByChild('ts'),
      startAt(now)
    );

    const ordersHandler = (snapshot) => {
      const data = snapshot.val();
      if (data && eventNames.includes(data.type)) {
        handleEvent(data);
      }
    };

    onChildAdded(ordersQuery, ordersHandler);
    setIsLive(true);

    return () => {
      lanUnsubs.forEach(fn => fn());
      off(ordersQuery, 'child_added', ordersHandler);
      setIsLive(false);
    };
  }, [restaurantId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Actions
  const markServed = async (orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await apiClient.updateOrderStatus(orderId, 'served', restaurantId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
      Vibration.vibrate(100);
      setTimeout(() => loadDataRef.current?.(false), 1500);
    } catch (e) {
      Alert.alert('Error', 'Failed to mark as served');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const markCompleted = async (orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await apiClient.completeOrder(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'completed' } : o));
      setTimeout(() => loadDataRef.current?.(false), 1500);
    } catch (e) {
      Alert.alert('Error', 'Failed to complete order');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const cancelOrder = (orderId) => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        setUpdatingOrderId(orderId);
        try {
          await apiClient.cancelKotOrder(orderId, '');
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
          setTimeout(() => loadDataRef.current?.(false), 1500);
        } catch (e) {
          Alert.alert('Error', 'Failed to cancel order');
        } finally {
          setUpdatingOrderId(null);
        }
      }},
    ]);
  };

  // ─── Print Actions ───
  const buildInvoiceData = (order, isPreBill = false) => {
    const subtotal = (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
    return {
      orderId: order.id,
      orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
      restaurantName: restaurant?.name || '',
      restaurantInfo: restaurant || {},
      items: (order.items || []).map(i => ({
        name: i.name, quantity: i.quantity || 1, price: i.price || 0,
        total: (i.price || 0) * (i.quantity || 1),
        selectedVariant: i.selectedVariant || null,
        selectedCustomizations: i.selectedCustomizations || [],
        notes: i.notes || '',
      })),
      subtotal,
      tax: order.taxAmount || 0,
      taxRate: order.taxRate || 0,
      taxEnabled: !!(order.taxAmount > 0 || order.taxBreakdown?.length),
      taxBreakdown: order.taxBreakdown || null,
      grandTotal: order.finalAmount || order.totalAmount || subtotal,
      customerName: order.customerInfo?.name || 'Walk-in Customer',
      customerMobile: order.customerInfo?.phone || order.customerPhone || '',
      orderType: order.orderType || 'dine-in',
      paymentMethod: order.paymentMethod || 'cash',
      timestamp: order.completedAt || order.createdAt || new Date(),
      staffName: user?.name || 'Staff',
      tableNumber: order.tableNumber || '',
      floorName: order.floorName || '',
      waiterName: order.staffInfo?.waiterName || order.staffInfo?.name || user?.name || '',
      offerDiscount: order.discountAmount || 0,
      manualDiscount: order.manualDiscount || 0,
      loyaltyDiscount: order.loyaltyDiscount || 0,
      couponDiscount: order.couponDiscount || 0,
      couponCode: order.couponCode || null,
      serviceChargeAmount: order.serviceChargeAmount || 0,
      serviceChargeRate: order.serviceChargeRate || 0,
      tipAmount: order.tipAmount || 0,
      roundOffAmount: order.roundOffAmount || 0,
      cashReceived: order.cashReceived || null,
      changeReturned: order.changeReturned || null,
      splitPayments: order.splitPayments || null,
      printSettings: printSettingsRef.current || {},
      isPreBill,
    };
  };

  const handlePrintKOT = async (order) => {
    setPrintMenuOrderId(null);
    try {
      const remotePrint = await printerService.getRemotePrintEnabled();
      if (remotePrint) {
        await apiClient.triggerPrint(order.id, 'kot');
        toast.success('KOT sent to desktop printer', 3000);
        return;
      }
      const kotData = {
        restaurantName: restaurant?.name || '',
        orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
        tableNumber: order.tableNumber || '',
        floorName: order.floorName || '',
        orderType: order.orderType || 'dine-in',
        items: order.items || [],
        specialInstructions: order.specialInstructions || '',
        waiterName: order.staffInfo?.waiterName || user?.name || '',
        printSettings: printSettingsRef.current || {},
        covers: order.covers || 1,
      };
      const text = printerService.generateKOTText(kotData);
      const result = await printerService.printWithFeedback({ text, silentOnly: true, label: 'KOT' });
      if (result.success) {
        toast.success('KOT printed', 2000);
      } else if (result.notify !== false) {
        toast.warning(result.error || 'KOT could not be printed', 4000, 'Print Failed');
      }
    } catch (err) {
      toast.error(`KOT print failed: ${err?.message || 'Unknown error'}`, 4000);
    }
  };

  const handlePrintBill = async (order) => {
    setPrintMenuOrderId(null);
    const isCompleted = order.status === 'completed' || order.status === 'served';
    const printType = isCompleted ? 'bill' : 'pre-bill';
    const label = isCompleted ? 'Bill' : 'Pre-Bill';
    try {
      const remotePrint = await printerService.getRemotePrintEnabled();
      if (remotePrint) {
        await apiClient.triggerPrint(order.id, printType);
        toast.success(`${label} sent to desktop printer`, 3000);
        return;
      }
      const invoiceData = buildInvoiceData(order, !isCompleted);
      const billText = printerService.generateBillText(invoiceData);
      const result = await printerService.printWithFeedback({ text: billText, silentOnly: true, label });
      if (result.success) {
        toast.success(`${label} printed`, 2000);
      } else if (result.notify !== false) {
        toast.warning(result.error || `${label} could not be printed`, 4000, 'Print Failed');
      }
    } catch (err) {
      toast.error(`${label} print failed: ${err?.message || 'Unknown error'}`, 4000);
    }
  };

  // Filtering
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Tab filter
    if (selectedFilter === 'mine') {
      const userId = user?.id || user?.uid;
      const userName = user?.name || user?.staffName;
      result = result.filter(o =>
        (o.staffInfo?.waiterId && o.staffInfo.waiterId === userId) ||
        (o.staffInfo?.waiterName && userName && o.staffInfo.waiterName === userName)
      );
    } else if (selectedFilter === 'ready') {
      result = result.filter(o => o.status === 'ready');
    } else if (selectedFilter === 'kitchen') {
      result = result.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status));
    } else if (selectedFilter === 'done') {
      result = result.filter(o => ['completed', 'served', 'cancelled', 'refunded'].includes(o.status));
    }

    // Search
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(o =>
        (o.dailyOrderId && String(o.dailyOrderId).includes(q)) ||
        (o.orderNumber && String(o.orderNumber).toLowerCase().includes(q)) ||
        (o.customerInfo?.name && o.customerInfo.name.toLowerCase().includes(q)) ||
        (o.customerInfo?.phone && o.customerInfo.phone.includes(q)) ||
        (o.tableNumber && String(o.tableNumber).toLowerCase().includes(q))
      );
    }

    return result;
  }, [orders, selectedFilter, searchTerm, user]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const userId = user?.id || user?.uid;
    const userName = user?.name || user?.staffName;
    return {
      all: orders.length,
      mine: orders.filter(o =>
        (o.staffInfo?.waiterId && o.staffInfo.waiterId === userId) ||
        (o.staffInfo?.waiterName && userName && o.staffInfo.waiterName === userName)
      ).length,
      ready: orders.filter(o => o.status === 'ready').length,
      kitchen: orders.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status)).length,
      done: orders.filter(o => ['completed', 'served', 'cancelled', 'refunded'].includes(o.status)).length,
    };
  }, [orders, user]);

  // Stats
  const stats = useMemo(() => {
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'served');
    const revenue = completed.reduce((sum, o) => {
      if (o.paymentStatus === 'due') return sum;
      if ((o.paymentStatus === 'partial' || o.outstandingAmount > 0) && o.paidAmount != null) return sum + (Number(o.paidAmount) || 0);
      return sum + (o.finalAmount || o.totalAmount || 0);
    }, 0);
    return { completedCount: completed.length, revenue };
  }, [orders]);

  const toggleExpand = (orderId) => {
    setExpandedOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const renderOrderCard = ({ item: order }) => {
    const statusColor = STATUS_COLORS[order.status] || '#6b7280';
    const statusLabel = STATUS_LABELS[order.status] || order.status?.toUpperCase();
    const amt = order.finalAmount || order.totalAmount || 0;
    const expanded = expandedOrders[order.id];
    const isUpdating = updatingOrderId === order.id;
    const isActive = !['completed', 'served', 'cancelled', 'refunded'].includes(order.status);
    const orderDate = getOrderTime(order);
    const timeStr = formatTime(orderDate);
    const ago = getTimeAgo(orderDate);

    return (
      <View style={[s.card, isUpdating && { opacity: 0.6 }]}>
        {isUpdating && (
          <View style={s.cardOverlay}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}

        {/* Header */}
        <View style={s.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <Text style={s.orderId}>#{order.dailyOrderId || order.orderNumber || order.id.slice(-6).toUpperCase()}</Text>
            <View style={[s.statusBadge, { backgroundColor: statusColor + '18' }]}>
              <Text style={[s.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={[s.orderAmount, { color: statusColor }]}>{formatCurrency(amt)}</Text>
        </View>

        {/* Meta */}
        <View style={s.cardMeta}>
          <Text style={s.metaText}>
            {order.customerInfo?.name ? order.customerInfo.name + ' · ' : ''}
            {order.tableNumber ? `Table ${order.tableNumber} · ` : ''}
            {order.orderType === 'delivery' ? 'Delivery' : order.orderType === 'pickup' ? 'Pickup' : 'Dine In'}
          </Text>
          <Text style={s.metaTime}>{timeStr} · {ago}</Text>
        </View>

        {/* Items toggle */}
        <TouchableOpacity style={s.itemsToggle} onPress={() => toggleExpand(order.id)} activeOpacity={0.7}>
          <Text style={s.itemsCount}>{order.items?.length || 0} Item{(order.items?.length || 0) !== 1 ? 's' : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={s.viewText}>{expanded ? 'Hide' : 'View'}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#6b7280" />
          </View>
        </TouchableOpacity>

        {/* Expanded items */}
        {expanded && order.items && (
          <View style={s.itemsList}>
            {order.items.map((item, idx) => (
              <View key={idx} style={[s.itemRow, idx < order.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }]}>
                <Text style={s.itemQty}>{item.quantity}x</Text>
                <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.itemPrice}>{formatCurrency((item.price || 0) * (item.quantity || 1))}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={s.actionsRow}>
          {isActive && order.status === 'ready' && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#22c55e' }]} onPress={() => markServed(order.id)} disabled={isUpdating}>
              <Ionicons name="checkmark-circle" size={16} color="white" />
              <Text style={s.actionBtnText}>Served</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.iconAction}
            onPress={() => setPrintMenuOrderId(printMenuOrderId === order.id ? null : order.id)}
          >
            <Ionicons name="print-outline" size={20} color="#6b7280" />
          </TouchableOpacity>
          {isActive && (
            <>
              <TouchableOpacity style={s.iconAction} onPress={() => cancelOrder(order.id)} disabled={isUpdating}>
                <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
              <TouchableOpacity style={s.iconAction} onPress={() => {
                setEditOrderContext({
                  existingOrderId: order.id,
                  tableNumber: order.tableNumber,
                  tableId: order.tableId,
                  floorName: order.floorName,
                });
                setShowWaiterOrderModal(true);
              }} disabled={isUpdating}>
                <Ionicons name="create-outline" size={20} color="#6b7280" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Print Menu Dropdown */}
        {printMenuOrderId === order.id && (
          <View style={s.printMenu}>
            <TouchableOpacity style={s.printMenuItem} onPress={() => handlePrintKOT(order)}>
              <Ionicons name="restaurant-outline" size={16} color="#374151" />
              <Text style={s.printMenuText}>Print KOT</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.printMenuItem} onPress={() => handlePrintBill(order)}>
              <Ionicons name="receipt-outline" size={16} color="#374151" />
              <Text style={s.printMenuText}>
                {order.status === 'completed' || order.status === 'served' ? 'Print Bill' : 'Print Pre-Bill'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // Skeleton
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.headerSection}>
          <Animated.View style={[s.skelBox, { width: 160, height: 22 }, { opacity: shimmerAnim }]} />
          <Animated.View style={[s.skelBox, { width: 100, height: 14, marginTop: 6 }, { opacity: shimmerAnim }]} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map(i => <Animated.View key={i} style={[s.skelBox, { width: 70, height: 32, borderRadius: 16 }, { opacity: shimmerAnim }]} />)}
        </View>
        <View style={{ padding: 12, gap: 10 }}>
          {[1, 2, 3, 4].map(i => (
            <Animated.View key={i} style={[s.skelBox, { height: 120, borderRadius: 14 }, { opacity: shimmerAnim }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.headerSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={[s.headerTitle, { fontSize: fs(20) }]}>Active Orders</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {isLive && (
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>Live</Text>
              </View>
            )}
            <View style={s.countBadge}>
              <Text style={s.countText}>{orders.length}</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <Text style={s.statText}>Revenue {formatCurrency(stats.revenue)}</Text>
          <Text style={s.statDivider}>·</Text>
          <Text style={s.statText}>{orders.length} orders</Text>
          <Text style={s.statDivider}>·</Text>
          <Text style={s.statText}>{stats.completedCount} completed</Text>
        </View>

        {/* Search */}
        <View style={s.searchRow}>
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            style={s.searchInput}
            placeholder="Search by order #, table, customer..."
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
      </View>

      {/* Filter Tabs */}
      <View style={s.filterRow}>
        {FILTER_TABS.map(tab => {
          const active = selectedFilter === tab.key;
          const count = tabCounts[tab.key] || 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.filterPill, active && s.filterPillActive]}
              onPress={() => setSelectedFilter(tab.key)}
            >
              <Text style={[s.filterPillText, active && s.filterPillTextActive]}>{tab.label}</Text>
              <View style={[s.filterBadge, active && s.filterBadgeActive]}>
                <Text style={[s.filterBadgeText, active && s.filterBadgeTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Orders List */}
      <FlatList
        data={filteredOrders}
        renderItem={renderOrderCard}
        keyExtractor={item => item.id || item._id}
        contentContainerStyle={[s.listContent, isTablet && { maxWidth: 700, alignSelf: 'center', width: '100%' }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(false); }} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setPrintMenuOrderId(null)}
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyTitle}>No orders found</Text>
            <Text style={s.emptySubtext}>
              {searchTerm ? 'Try a different search' : selectedFilter === 'mine' ? 'No orders assigned to you' : 'No orders for this filter'}
            </Text>
          </View>
        }
      />
      <ToastView />
      <WaiterOrderModal
        visible={showWaiterOrderModal}
        onClose={() => { setShowWaiterOrderModal(false); setEditOrderContext(null); }}
        existingOrderId={editOrderContext?.existingOrderId}
        tableNumber={editOrderContext?.tableNumber}
        tableId={editOrderContext?.tableId}
        floorName={editOrderContext?.floorName}
        posSettings={restaurant?.posSettings}
        onOrderSent={() => {
          setShowWaiterOrderModal(false);
          setEditOrderContext(null);
          loadDataRef.current?.(false);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Header
  headerSection: {
    backgroundColor: 'white', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  countBadge: {
    backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
  },
  countText: { fontSize: 13, fontWeight: '700', color: 'white' },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  liveText: { fontSize: 10, fontWeight: '600', color: '#16a34a' },

  // Stats
  statsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
  },
  statText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  statDivider: { fontSize: 12, color: '#d1d5db' },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2937', padding: 0 },

  // Filter
  filterRow: {
    flexDirection: 'row', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  filterPillActive: { backgroundColor: Colors.primary },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterPillTextActive: { color: 'white' },
  filterBadge: {
    backgroundColor: '#e5e7eb', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
    minWidth: 20, alignItems: 'center',
  },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterBadgeText: { fontSize: 10, fontWeight: '700', color: '#6b7280' },
  filterBadgeTextActive: { color: 'white' },

  // List
  listContent: { padding: 12, gap: 8, paddingBottom: 120 },

  // Card
  card: {
    backgroundColor: 'white', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#f3f4f6', ...Shadows.small, position: 'relative',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10, borderRadius: 14,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  orderId: { fontSize: 15, fontWeight: '800', color: '#1f2937' },
  statusBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  orderAmount: { fontSize: 16, fontWeight: '800' },

  // Meta
  cardMeta: { paddingHorizontal: 14, paddingBottom: 6 },
  metaText: { fontSize: 12, color: '#6b7280' },
  metaTime: { fontSize: 10, color: '#9ca3af', marginTop: 2 },

  // Items toggle
  itemsToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  itemsCount: { fontSize: 12, fontWeight: '600', color: '#374151' },
  viewText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

  // Items list
  itemsList: { paddingHorizontal: 14, paddingBottom: 8 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
  },
  itemQty: { fontSize: 13, fontWeight: '700', color: '#374151', minWidth: 24 },
  itemName: { flex: 1, fontSize: 13, color: '#374151' },
  itemPrice: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

  // Actions
  actionsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, borderRadius: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: 'white' },
  iconAction: {
    width: 40, height: 40, borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
    justifyContent: 'center', alignItems: 'center',
  },

  // Print Menu
  printMenu: {
    paddingHorizontal: 14, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  printMenuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  printMenuText: { fontSize: 13, fontWeight: '500', color: '#374151' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  emptySubtext: { fontSize: 12, color: '#9ca3af' },

  // Skeleton
  skelBox: { backgroundColor: '#e5e7eb', borderRadius: 8 },
});
