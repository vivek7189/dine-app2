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

export default function CaptainHomeNative() {
  const router = useRouter();
  const { fs, r, sp, isTablet } = useResponsive();
  const { effectivelyOffline } = useOffline();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [isLive, setIsLive] = useState(false);

  // Captain dashboard data
  const [dashData, setDashData] = useState(null);

  const loadDataRef = useRef(null);
  const mountedRef = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for alerts
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Shimmer for skeleton
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

      if (showSpinner && !dashData) setLoading(true);

      // Fetch captain dashboard endpoint
      const data = await apiClient.request(`/api/captain/dashboard/${resId}`);
      if (mountedRef.current) setDashData(data);
    } catch (error) {
      console.error('CaptainHome: Error loading data:', error);
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

  // Firebase RTDB + LAN Hub real-time
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

  // Derived data
  const stats = dashData?.stats || {};
  const alerts = dashData?.alerts || [];
  const waiters = dashData?.waiters || [];
  const activeOrders = dashData?.activeOrders || [];
  const captainName = user?.name || user?.staffName || 'Captain';
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });

  // Skeleton loading
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
            <Text style={[s.greeting, { fontSize: fs(22) }]}>{getGreeting()}, {captainName}</Text>
            <Text style={s.dateLine}>{dateStr} · {restaurant?.name || 'Restaurant'}</Text>
            {alerts.length > 0 ? (
              <Text style={s.motivationAlert}>{alerts.length} table{alerts.length !== 1 ? 's' : ''} need attention!</Text>
            ) : stats.totalActiveOrders > 0 ? (
              <Text style={s.motivation}>Floor is running smoothly</Text>
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
        <View style={{ paddingHorizontal: Spacing.md, marginTop: 12 }}>
          <TouchableOpacity style={s.primaryCta} onPress={() => router.push('/(tabs)/tables')} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={22} color="white" />
            <Text style={s.primaryCtaText}>Start Taking Orders</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{stats.totalActiveOrders || 0}</Text>
            <Text style={s.statLabel}>Active Orders</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{stats.tablesOccupied || 0}</Text>
            <Text style={s.statLabel}>Occupied</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{stats.tablesAvailable || 0}</Text>
            <Text style={s.statLabel}>Available</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{stats.avgWaitTime ? `${stats.avgWaitTime}m` : '—'}</Text>
            <Text style={s.statLabel}>Avg Wait</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={s.quickActionsRow}>
          {QUICK_ACTIONS.map(action => (
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

        {/* Alerts — Long Wait */}
        {alerts.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={[s.sectionTitle, { color: '#ef4444' }]}>Needs Attention</Text>
              </View>
            </View>
            {alerts.slice(0, 5).map((alert, idx) => (
              <Animated.View key={alert.orderId || idx} style={[s.alertCard, { opacity: pulseAnim }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="time-outline" size={18} color="#ef4444" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertTitle}>Table {alert.tableNumber || '?'}</Text>
                    <Text style={s.alertSub}>Waiting {alert.waitMinutes}+ min</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.alertAction}
                  onPress={() => router.push('/(tabs)/orders')}
                  activeOpacity={0.7}
                >
                  <Text style={s.alertActionText}>View</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </View>
        )}

        {/* My Waiters */}
        {waiters.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="people-outline" size={16} color="#6b7280" />
                <Text style={s.sectionTitle}>My Waiters</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {waiters.map(waiter => (
                <View key={waiter.id} style={s.waiterCard}>
                  <View style={s.waiterAvatar}>
                    <Text style={s.waiterInitial}>{(waiter.name || '?').charAt(0).toUpperCase()}</Text>
                    {waiter.activeOrderCount > 0 && (
                      <View style={s.waiterBadge}>
                        <Text style={s.waiterBadgeText}>{waiter.activeOrderCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.waiterName} numberOfLines={1}>{waiter.name}</Text>
                  <Text style={s.waiterStat}>{waiter.activeTableCount || 0} table{(waiter.activeTableCount || 0) !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Active Orders */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="receipt-outline" size={16} color="#6b7280" />
              <Text style={s.sectionTitle}>Active Orders</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
              <Text style={s.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          {activeOrders.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="receipt-outline" size={32} color="#d1d5db" />
              <Text style={s.emptyText}>No active orders</Text>
            </View>
          ) : (
            activeOrders.slice(0, 10).map(order => {
              const statusColor = STATUS_COLORS[order.status] || '#6b7280';
              const amt = order.total || order.finalAmount || order.totalAmount || 0;
              const timeStr = formatTime(order.createdAt);
              const ago = getTimeAgo(order.createdAt);
              const waitMin = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
              return (
                <TouchableOpacity
                  key={order.id}
                  style={[s.orderCard, waitMin >= 15 && { borderColor: '#ef4444', borderWidth: 1.5 }]}
                  onPress={() => router.push('/(tabs)/orders')}
                  activeOpacity={0.7}
                >
                  <View style={s.orderCardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Text style={s.orderId}>#{order.dailyOrderId || order.orderNumber || order.id?.slice(-6).toUpperCase()}</Text>
                      {order.tableNumber && (
                        <View style={s.tableBadge}><Text style={s.tableBadgeText}>T{order.tableNumber}</Text></View>
                      )}
                      {order.floorName && (
                        <Text style={s.floorLabel}>{order.floorName}</Text>
                      )}
                    </View>
                    <Text style={[s.orderAmount, { color: statusColor }]}>{formatCurrency(amt)}</Text>
                  </View>
                  <View style={s.orderCardBottom}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={[s.statusPill, { backgroundColor: statusColor + '18' }]}>
                        <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[s.statusLabel, { color: statusColor }]}>{order.status}</Text>
                      </View>
                      {order.waiterName && (
                        <Text style={s.waiterLabel}>{order.waiterName}</Text>
                      )}
                    </View>
                    <Text style={s.orderTime}>{timeStr} · {ago}</Text>
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
  motivationAlert: { fontSize: 13, fontWeight: '700', color: '#ef4444', marginTop: 4 },
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

  // Alert Card
  alertCard: {
    backgroundColor: '#fef2f2', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#fecaca', marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
  alertSub: { fontSize: 11, color: '#dc2626', marginTop: 2 },
  alertAction: {
    backgroundColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
  },
  alertActionText: { fontSize: 12, fontWeight: '700', color: 'white' },

  // Waiter Card
  waiterCard: {
    alignItems: 'center', width: 80, paddingVertical: 12,
    backgroundColor: 'white', borderRadius: 14, ...Shadows.small,
  },
  waiterAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#7e22ce',
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  waiterInitial: { fontSize: 16, fontWeight: '800', color: 'white' },
  waiterBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#ef4444', width: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white',
  },
  waiterBadgeText: { fontSize: 9, fontWeight: '800', color: 'white' },
  waiterName: { fontSize: 11, fontWeight: '600', color: '#1f2937', width: 70, textAlign: 'center' },
  waiterStat: { fontSize: 9, color: '#9ca3af', marginTop: 2 },

  // Order Card
  orderCard: {
    backgroundColor: 'white', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6', marginBottom: 8,
    ...Shadows.small,
  },
  orderCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  orderId: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  orderAmount: { fontSize: 15, fontWeight: '800' },
  orderCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  orderTime: { fontSize: 10, color: '#9ca3af' },

  // Table badge
  tableBadge: {
    backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tableBadgeText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },
  floorLabel: { fontSize: 10, color: '#9ca3af' },
  waiterLabel: { fontSize: 11, color: '#7e22ce', fontWeight: '600' },

  // Empty
  emptyBox: {
    alignItems: 'center', paddingVertical: 40, backgroundColor: 'white',
    borderRadius: 14, ...Shadows.small,
  },
  emptyText: { fontSize: 14, color: '#9ca3af', marginTop: 8 },

  // Skeleton
  skelBox: { backgroundColor: '#e5e7eb', borderRadius: 8 },
});
