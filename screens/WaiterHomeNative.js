import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Animated, Vibration, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { ref, onChildAdded, off, query, orderByChild, startAt } from 'firebase/database';
import { database } from '../config/firebase';
import apiClient from '../services/api';
import lanClient from '../services/lanClient';
import { Colors, Spacing, Shadows } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import { formatCurrency } from '../utils/formatCurrency';

const QUICK_ACTIONS = [
  { key: 'order', label: 'Start Order', icon: 'add-circle', color: '#ef4444', bg: '#fef2f2', tab: 'tables' },
  { key: 'tables', label: 'Tables', icon: 'restaurant', color: '#3b82f6', bg: '#eff6ff', tab: 'tables' },
  { key: 'kitchen', label: 'Kitchen', icon: 'flame', color: '#f59e0b', bg: '#fffbeb', tab: 'kitchen' },
  { key: 'orders', label: 'Orders', icon: 'receipt', color: '#8b5cf6', bg: '#f5f3ff', tab: 'orders' },
];

const STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  preparing: '#8b5cf6',
  ready: '#22c55e',
  completed: '#6b7280',
  served: '#6b7280',
  cancelled: '#ef4444',
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const getTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
};

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return ''; }
};

export default function WaiterHomeNative() {
  const router = useRouter();
  const { fs, r, sp, isTablet } = useResponsive();
  const { effectivelyOffline } = useOffline();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [isLive, setIsLive] = useState(false);

  const loadDataRef = useRef(null);
  const mountedRef = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for ready orders
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Shimmer animation for skeleton
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

      if (showSpinner && orders.length === 0) setLoading(true);

      const data = await apiClient.getKotOrders(resId);
      if (mountedRef.current) setOrders(data.orders || []);
    } catch (error) {
      console.error('WaiterHome: Error loading data:', error);
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

  // Mark served action
  const markServed = async (orderId) => {
    try {
      await apiClient.updateOrderStatus(orderId, 'served', restaurantId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
      Vibration.vibrate(100);
      setTimeout(() => loadDataRef.current?.(false), 1500);
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to mark as served');
    }
  };

  // Advance kitchen status from the floor (waiter/runner): Start → Ready.
  // Optimistic UI update, then a background refresh reconciles with the server.
  const advanceStatus = async (orderId, next) => {
    try {
      if (next === 'preparing') await apiClient.startCooking(orderId);
      else if (next === 'ready') await apiClient.markReady(orderId);
      else return;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: next } : o));
      Vibration.vibrate(100);
      setTimeout(() => loadDataRef.current?.(false), 1500);
    } catch (e) {
      // 403 = the store restricts who can advance status (Admin → Order Status Control)
      Alert.alert('Cannot update', e?.message || 'Failed to update order status');
    }
  };

  // Derived data
  const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
  const activeOrders = orders.filter(o => activeStatuses.includes(o.status));
  const readyOrders = orders.filter(o => o.status === 'ready');
  const pendingCount = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
  const activeTables = new Set(activeOrders.filter(o => o.tableNumber).map(o => o.tableNumber)).size;
  const recentOrders = orders.slice(0, 10);

  // Whether this user may advance order status (Admin → Order Status Control).
  // owner/admin always; empty/unset orderStatusRoles = any staff (matches backend).
  const _role = (user?.role || '').toLowerCase();
  const _orderStatusRoles = restaurant?.billingSettings?.orderStatusRoles;
  const canAdvanceStatus = _role === 'owner' || _role === 'admin'
    || !Array.isArray(_orderStatusRoles) || _orderStatusRoles.length === 0
    || _orderStatusRoles.includes(_role);

  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
  const waiterName = user?.name || user?.staffName || 'Captain';

  // Skeleton
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <View style={{ gap: 8 }}>
            <Animated.View style={[s.skelBox, { width: 200, height: 22 }, { opacity: shimmerAnim }]} />
            <Animated.View style={[s.skelBox, { width: 150, height: 14 }, { opacity: shimmerAnim }]} />
          </View>
        </View>
        <View style={{ padding: Spacing.md, gap: 12 }}>
          <Animated.View style={[s.skelBox, { height: 52, borderRadius: 14 }, { opacity: shimmerAnim }]} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[1, 2, 3, 4].map(i => <Animated.View key={i} style={[s.skelBox, { flex: 1, height: 80, borderRadius: 14 }, { opacity: shimmerAnim }]} />)}
          </View>
          {[1, 2, 3].map(i => (
            <Animated.View key={i} style={[s.skelBox, { height: 80, borderRadius: 14 }, { opacity: shimmerAnim }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(false); }} tintColor={Colors.primary} />
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={[s.greeting, { fontSize: fs(22) }]}>{getGreeting()}, {waiterName}</Text>
            <Text style={s.dateLine}>{dateStr} · {restaurant?.name || 'Restaurant'}</Text>
            {readyOrders.length > 0 ? (
              <Text style={s.motivationReady}>{readyOrders.length} order{readyOrders.length !== 1 ? 's' : ''} ready for pickup!</Text>
            ) : pendingCount > 0 ? (
              <Text style={s.motivation}>Tables are waiting!</Text>
            ) : (
              <Text style={s.motivation}>All caught up</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {effectivelyOffline && (
              <View style={s.offlineBadge}>
                <Ionicons name="cloud-offline-outline" size={12} color="#ef4444" />
                <Text style={s.offlineText}>Offline</Text>
              </View>
            )}
            {isLive && (
              <View style={s.liveBadge}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>Live</Text>
              </View>
            )}
          </View>
        </View>

        {/* Primary CTA */}
        {(restaurant?.posSettings?.waiterAppConfig?.showStartOrder !== false) && (
          <View style={{ paddingHorizontal: Spacing.md, marginTop: 12 }}>
            <TouchableOpacity style={s.primaryCta} onPress={() => router.push('/(tabs)/tables')} activeOpacity={0.8}>
              <Ionicons name="add-circle" size={22} color="white" />
              <Text style={s.primaryCtaText}>Start Taking Orders</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{activeTables}</Text>
            <Text style={s.statLabel}>Active Tables</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{pendingCount}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
          <View style={[s.statCard, readyOrders.length > 0 && { borderColor: '#22c55e', borderWidth: 1.5 }]}>
            <Text style={[s.statValue, readyOrders.length > 0 && { color: '#22c55e' }]}>{readyOrders.length}</Text>
            <Text style={s.statLabel}>Ready</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{activeOrders.length}</Text>
            <Text style={s.statLabel}>Active</Text>
          </View>
        </View>

        {/* Quick Actions */}
        {(() => {
          const wac = restaurant?.posSettings?.waiterAppConfig || {};
          const configMap = { order: 'showStartOrder', tables: 'showTables', kitchen: 'showKitchen', orders: 'showOrders' };
          const visible = QUICK_ACTIONS.filter(a => wac[configMap[a.key]] !== false);
          return visible.length > 0 ? (
            <View style={s.quickActionsRow}>
              {visible.map(action => (
                <TouchableOpacity
                  key={action.key}
                  style={[s.quickAction, { backgroundColor: action.bg }]}
                  onPress={() => router.push(`/(tabs)/${action.tab}`)}
                  activeOpacity={0.7}
                >
                  <View style={[s.quickActionIcon, { backgroundColor: action.color }]}>
                    <Ionicons name={action.icon} size={20} color="white" />
                  </View>
                  <Text style={[s.quickActionLabel, { color: action.color }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null;
        })()}

        {/* Ready for Pickup */}
        {readyOrders.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={s.readyDot} />
                <Text style={s.sectionTitle}>Ready for Pickup</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
                <Text style={s.viewAll}>View all</Text>
              </TouchableOpacity>
            </View>
            {readyOrders.slice(0, 5).map(order => {
              const elapsed = getTimeAgo(order.kotTime || order.createdAt);
              const elapsedMin = Math.floor((Date.now() - new Date(order.kotTime || order.createdAt).getTime()) / 60000);
              return (
                <Animated.View
                  key={order.id}
                  style={[
                    s.readyCard,
                    elapsedMin >= 5 && { borderColor: '#22c55e', borderWidth: 2, opacity: pulseAnim },
                  ]}
                >
                  <View style={s.readyCardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text style={s.readyOrderId}>#{order.dailyOrderId || order.orderNumber || order.id.slice(-6).toUpperCase()}</Text>
                      {order.tableNumber && (
                        <View style={s.tableBadge}><Text style={s.tableBadgeText}>T{order.tableNumber}</Text></View>
                      )}
                      <View style={s.readyBadge}><Text style={s.readyBadgeText}>READY</Text></View>
                    </View>
                    <Text style={s.timeAgo}>{elapsed}</Text>
                  </View>
                  <View style={s.readyCardBottom}>
                    <Text style={s.itemCount}>{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}</Text>
                    {canAdvanceStatus && (
                      <TouchableOpacity style={s.markServedBtn} onPress={() => markServed(order.id)} activeOpacity={0.7}>
                        <Ionicons name="checkmark-circle" size={16} color="white" />
                        <Text style={s.markServedText}>Mark Served</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Recent Orders */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="receipt-outline" size={16} color="#6b7280" />
              <Text style={s.sectionTitle}>Recent Orders</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
              <Text style={s.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          {recentOrders.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color="#d1d5db" />
              <Text style={s.emptyText}>No orders yet today</Text>
            </View>
          ) : (
            recentOrders.map(order => {
              const statusColor = STATUS_COLORS[order.status] || '#6b7280';
              const amt = order.finalAmount || order.totalAmount || 0;
              const timeStr = formatTime(order.kotTime || order.createdAt);
              const ago = getTimeAgo(order.kotTime || order.createdAt);
              return (
                <TouchableOpacity
                  key={order.id}
                  style={s.recentCard}
                  onPress={() => router.push('/(tabs)/orders')}
                  activeOpacity={0.7}
                >
                  <View style={s.recentCardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={s.recentOrderId}>#{order.dailyOrderId || order.orderNumber || order.id.slice(-6).toUpperCase()}</Text>
                      {order.tableNumber && (
                        <View style={[s.tableBadge, { backgroundColor: '#f3f4f6' }]}><Text style={[s.tableBadgeText, { color: '#374151' }]}>T{order.tableNumber}</Text></View>
                      )}
                      <Text style={s.orderType}>{order.orderType === 'delivery' ? 'Delivery' : order.orderType === 'pickup' ? 'Pickup' : 'Dine In'}</Text>
                    </View>
                    <Text style={[s.recentAmount, { color: statusColor }]}>{formatCurrency(amt)}</Text>
                  </View>
                  <View style={s.recentCardBottom}>
                    <View style={[s.statusPill, { backgroundColor: statusColor + '18' }]}>
                      <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                      <Text style={[s.statusLabel, { color: statusColor }]}>{order.status}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {/* Advance status from the floor: Start → Ready → Served */}
                      {canAdvanceStatus && (order.status === 'pending' || order.status === 'confirmed') && (
                        <TouchableOpacity style={[s.statusActionBtn, { backgroundColor: '#f59e0b' }]} onPress={() => advanceStatus(order.id, 'preparing')} activeOpacity={0.7}>
                          <Ionicons name="flame" size={13} color="white" />
                          <Text style={s.statusActionText}>Start</Text>
                        </TouchableOpacity>
                      )}
                      {canAdvanceStatus && order.status === 'preparing' && (
                        <TouchableOpacity style={[s.statusActionBtn, { backgroundColor: '#16a34a' }]} onPress={() => advanceStatus(order.id, 'ready')} activeOpacity={0.7}>
                          <Ionicons name="checkmark-done" size={13} color="white" />
                          <Text style={s.statusActionText}>Ready</Text>
                        </TouchableOpacity>
                      )}
                      {canAdvanceStatus && order.status === 'ready' && (
                        <TouchableOpacity style={[s.statusActionBtn, { backgroundColor: '#2563eb' }]} onPress={() => markServed(order.id)} activeOpacity={0.7}>
                          <Ionicons name="checkmark-circle" size={13} color="white" />
                          <Text style={s.statusActionText}>Served</Text>
                        </TouchableOpacity>
                      )}
                      <Text style={s.recentTime}>{timeStr} · {ago}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: Spacing.md, paddingTop: 12, paddingBottom: 8,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  dateLine: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  motivation: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginTop: 4 },
  motivationReady: { fontSize: 13, fontWeight: '700', color: '#22c55e', marginTop: 4 },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  offlineText: { fontSize: 10, fontWeight: '600', color: '#ef4444' },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  liveText: { fontSize: 10, fontWeight: '600', color: '#16a34a' },

  // Primary CTA
  primaryCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 14,
    ...Shadows.medium,
  },
  primaryCtaText: { fontSize: 16, fontWeight: '700', color: 'white' },

  // Stats
  statsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginTop: 12,
  },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: 'white', borderRadius: 12, ...Shadows.small,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#9ca3af', marginTop: 2, textTransform: 'uppercase' },

  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginTop: 12,
  },
  quickAction: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14,
  },
  quickActionIcon: {
    width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  quickActionLabel: { fontSize: 11, fontWeight: '700' },

  // Section
  section: { paddingHorizontal: Spacing.md, marginTop: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  viewAll: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  readyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },

  // Ready Card
  readyCard: {
    backgroundColor: '#f0fdf4', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#bbf7d0', marginBottom: 8,
  },
  readyCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  readyOrderId: { fontSize: 15, fontWeight: '800', color: '#1f2937' },
  readyBadge: {
    backgroundColor: '#22c55e', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  readyBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  timeAgo: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  readyCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10,
  },
  itemCount: { fontSize: 12, color: '#6b7280' },
  markServedBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#22c55e', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  markServedText: { fontSize: 12, fontWeight: '700', color: 'white' },
  statusActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  statusActionText: { fontSize: 11, fontWeight: '700', color: 'white' },

  // Table badge
  tableBadge: {
    backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tableBadgeText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },

  // Recent Order Card
  recentCard: {
    backgroundColor: 'white', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 8,
    ...Shadows.small,
  },
  recentCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  recentOrderId: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  orderType: { fontSize: 10, color: '#9ca3af' },
  recentAmount: { fontSize: 15, fontWeight: '800' },
  recentCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  recentTime: { fontSize: 10, color: '#9ca3af' },

  // Empty
  emptyBox: {
    alignItems: 'center', paddingVertical: 40, backgroundColor: 'white',
    borderRadius: 14, ...Shadows.small,
  },
  emptyText: { fontSize: 14, color: '#9ca3af', marginTop: 8 },

  // Skeleton
  skelBox: { backgroundColor: '#e5e7eb', borderRadius: 8 },
});
