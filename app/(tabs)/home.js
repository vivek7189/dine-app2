import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Pusher from 'pusher-js/react-native';
import apiClient from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { getCached, setCache, clearCache } from '../../services/cacheManager';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { HeadquartersContent } from './headquarters';
import RestaurantPickerModal from '../../components/RestaurantPickerModal';
const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec';
const PUSHER_CLUSTER = 'ap2';

// Animated loader shown while home data loads
function HomeLoader() {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.8, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotation = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Animated.View style={{ transform: [{ rotate: rotation }, { scale: pulse }], marginBottom: 20 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 16, backgroundColor: '#ef4444',
            justifyContent: 'center', alignItems: 'center',
            shadowColor: '#ef4444', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12,
          }}>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>D</Text>
          </View>
        </Animated.View>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.3 }}>Loading...</Text>
      </View>
    </SafeAreaView>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { effectivelyOffline, pendingCount } = useOffline();
  const { width: SCREEN_WIDTH, isTablet } = useResponsive();
  const tabCols = isTablet ? 3 : 2;
  const tabCardWidth = (SCREEN_WIDTH - 42 - 10 * (tabCols - 1)) / tabCols;
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Daily summary
  const [dailySummary, setDailySummary] = useState(null);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);

  // Stats
  const [todayOrders, setTodayOrders] = useState([]);
  const [todayStats, setTodayStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    pendingOrders: 0,
    completedOrders: 0,
  });
  const [tableStats, setTableStats] = useState({
    total: 0,
    occupied: 0,
    available: 0,
  });

  // Bar tabs (for bar-type businesses)
  const [openTabs, setOpenTabs] = useState([]);

  // Multi-restaurant
  const [restaurants, setRestaurants] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [switchingRestaurantId, setSwitchingRestaurantId] = useState(null);
  const loadStatsRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user && !loading) {
        loadStats(getRestaurantId());
      }
    }, [user, loading])
  );

  const getRestaurantId = () => {
    return user?.restaurantId || user?.restaurant?.id || restaurant?.id;
  };

  // Keep loadStats ref current for Pusher handler
  useEffect(() => { loadStatsRef.current = loadStats; });

  // Pusher: real-time updates when orders change on other devices
  useEffect(() => {
    const rid = getRestaurantId();
    if (!rid) return;

    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
    const channel = pusher.subscribe(`restaurant-${rid}`);

    let debounceTimer = null;
    const handleEvent = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadStatsRef.current?.(rid);
      }, 1000);
    };

    channel.bind('order-created', handleEvent);
    channel.bind('order-updated', handleEvent);
    channel.bind('order-completed', handleEvent);
    channel.bind('order-deleted', handleEvent);
    channel.bind('table-status-updated', handleEvent);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.unbind_all();
      pusher.unsubscribe(`restaurant-${rid}`);
    };
  }, [user, restaurant]);

  const businessType = restaurant?.businessType || user?.restaurant?.businessType || 'restaurant';
  const isBarType = businessType === 'bar';

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }
      setUser(userData);

      // Fetch all user's restaurants for switcher + default resolution
      let restList = [];
      let apiDefaultId = null;
      try {
        const restResponse = await apiClient.getRestaurants();
        restList = restResponse?.restaurants || [];
        apiDefaultId = restResponse?.defaultRestaurantId || null;
      } catch (e) {
        console.log('Could not fetch restaurants list:', e.message);
      }

      // Resolve the correct restaurant
      const storedRestaurantId = userData.restaurantId || userData.restaurant?.id;
      const userRole = (userData.role || '').toLowerCase();
      // Admin can have multiple restaurants (like owner); other staff are single-restaurant
      const isMultiRestaurantRole = userRole === 'owner' || userRole === 'customer' || userRole === 'admin';
      const isStaff = !isMultiRestaurantRole;

      let restaurantId = storedRestaurantId;

      if (isStaff) {
        // Non-admin staff always use their assigned restaurant — no switching allowed
        restaurantId = storedRestaurantId;
      } else if (restList.length > 0) {
        // Owners & admin: Priority: defaultRestaurantId → stored restaurantId → first restaurant
        const defaultId = apiDefaultId || userData.defaultRestaurantId;
        const defaultInList = defaultId ? restList.find(r => (r.id || r._id) === defaultId) : null;
        const currentInList = storedRestaurantId ? restList.find(r => (r.id || r._id) === storedRestaurantId) : null;

        if (defaultInList) {
          restaurantId = defaultInList.id || defaultInList._id;
        } else if (currentInList) {
          restaurantId = currentInList.id || currentInList._id;
        } else {
          restaurantId = restList[0].id || restList[0]._id;
        }
      }

      // Fetch fresh restaurant data to ensure businessType and other fields are current
      let restaurantData = userData.restaurant;
      if (restaurantId) {
        try {
          const res = await apiClient.getRestaurant(restaurantId);
          const freshData = res?.restaurant || res;
          if (freshData && freshData.name) {
            restaurantData = { id: restaurantId, ...freshData };
          }
        } catch (e) {
          console.log('Could not fetch fresh restaurant data:', e.message);
        }
      }

      // Update stored user with resolved restaurant
      if (restaurantId) {
        const updatedUser = { ...userData, restaurant: restaurantData, restaurantId };
        await apiClient.setUser(updatedUser);
        setUser(updatedUser);
      }
      setRestaurant(restaurantData);

      if (restList.length > 0) {
        setRestaurants(restList);
      } else if (restaurantData) {
        setRestaurants([restaurantData]);
      }

      if (restaurantId) {
        // Stale-while-revalidate: try cache first
        const cached = await getCached('cache_home_stats_' + restaurantId);
        if (cached?.data) {
          const { todayStats: cs, tableStats: ts, todayOrders: co, openTabs: ct } = cached.data;
          if (cs) setTodayStats(cs);
          if (ts) setTableStats(ts);
          if (co) setTodayOrders(co);
          if (ct) setOpenTabs(ct);
          setLoading(false);
          // Fetch fresh in background
          setSyncing(true);
          loadStats(restaurantId).finally(() => setSyncing(false));
        } else {
          await loadStats(restaurantId);
        }
      }
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async (restaurantId) => {
    if (!restaurantId) return;

    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999).toISOString();

      const [ordersResponse, floorsResponse, tabsResponse] = await Promise.all([
        apiClient.getOrders(restaurantId, { startDate: startOfDay, endDate: endOfDay, limit: 200 }),
        apiClient.getFloors(restaurantId).catch(() => ({ floors: [] })),
        // Fetch open bar tabs for bar-type businesses
        apiClient.getOrders(restaurantId, { status: 'saved', limit: 20 }).catch(() => ({ orders: [] })),
      ]);

      // Set open tabs (for bar home view)
      const savedTabs = (tabsResponse.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOpenTabs(savedTabs);

      const orders = ordersResponse.orders || [];
      setTodayOrders(orders.slice(0, 5));

      const completed = orders.filter(o => o.status === 'completed' || o.status === 'delivered');
      const pending = orders.filter(o => o.status === 'pending' || o.status === 'confirmed' || o.status === 'preparing');
      const revenue = completed.reduce((sum, o) => sum + (o.finalAmount || o.totalAmount || o.total || 0), 0);

      const newTodayStats = {
        totalOrders: orders.length,
        totalRevenue: revenue,
        avgOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
        pendingOrders: pending.length,
        completedOrders: completed.length,
      };
      setTodayStats(newTodayStats);

      const floors = floorsResponse.floors || (Array.isArray(floorsResponse) ? floorsResponse : []);
      const allTables = floors.flatMap(f => f.tables || []);
      const occupied = allTables.filter(t => t.status === 'occupied').length;

      const newTableStats = {
        total: allTables.length,
        occupied,
        available: allTables.length - occupied,
      };
      setTableStats(newTableStats);

      // Save to cache
      setCache('cache_home_stats_' + restaurantId, {
        todayStats: newTodayStats,
        tableStats: newTableStats,
        todayOrders: orders.slice(0, 5),
        openTabs: savedTabs,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const restaurantId = getRestaurantId();
    if (restaurantId) {
      // Invalidate in-memory cache so we get fresh data from server
      apiClient.invalidateCache(`/api/floors/${restaurantId}`);
      apiClient.invalidateCache(`/api/orders/${restaurantId}`);
      apiClient.invalidateCache(`/api/analytics/${restaurantId}`);
      await Promise.all([
        loadStats(restaurantId),
        fetchDailySummary(),
      ]);
    }
    setRefreshing(false);
  };

  const fetchDailySummary = useCallback(async () => {
    const restaurantId = getRestaurantId();
    if (!restaurantId) return;
    setDailySummaryLoading(true);
    try {
      const res = await apiClient.getDailySummary(restaurantId, { period: 'today' });
      if (res?.success) setDailySummary(res.summary);
    } catch (err) {
      console.error('Daily summary error:', err);
    } finally {
      setDailySummaryLoading(false);
    }
  }, [user, restaurant]);

  const toggleDailySummary = useCallback(() => {
    if (!showDailySummary && !dailySummary) fetchDailySummary();
    setShowDailySummary(prev => !prev);
  }, [showDailySummary, dailySummary, fetchDailySummary]);

  const handleSwitchRestaurant = async (newRestaurantId) => {
    const currentId = getRestaurantId();
    if (newRestaurantId === currentId) return;

    try {
      // Show loading while switching
      setLoading(true);
      setSwitchingRestaurantId(newRestaurantId);

      // Reset stats so old restaurant data doesn't flash
      setTodayStats({ totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, pendingOrders: 0, completedOrders: 0 });
      setTableStats({ total: 0, occupied: 0, available: 0 });
      setTodayOrders([]);
      setOpenTabs([]);
      setDailySummary(null);
      setShowDailySummary(false);

      // Clear all tab caches so new restaurant loads fresh
      await clearCache('cache_');

      // Invalidate all in-memory API caches
      apiClient.clearAllCache?.();

      // Update backend preference
      await apiClient.updateUserPreferences({ defaultRestaurantId: newRestaurantId });

      // Fetch fresh restaurant data
      const res = await apiClient.getRestaurant(newRestaurantId);
      const freshData = res?.restaurant || res;
      const newRestaurant = freshData?.name ? { id: newRestaurantId, ...freshData } : null;

      // Update stored user
      const updatedUser = { ...user, restaurantId: newRestaurantId, restaurant: newRestaurant || user?.restaurant };
      await apiClient.setUser(updatedUser);
      setUser(updatedUser);
      setRestaurant(newRestaurant || user?.restaurant);

      // Reload stats for new restaurant
      await loadStats(newRestaurantId);

      // Broadcast switch to all other tabs so they reload immediately
      restaurantEvents.emit('switch', { restaurantId: newRestaurantId, restaurant: newRestaurant || user?.restaurant });

      setShowRestaurantModal(false);
    } catch (error) {
      console.error('Error switching restaurant:', error);
    } finally {
      setLoading(false);
      setSwitchingRestaurantId(null);
    }
  };

  const showRestaurantPicker = () => {
    // Only owner and admin can switch restaurants (admin can be assigned to multiple)
    const userRole = (user?.role || '').toLowerCase();
    if (userRole !== 'owner' && userRole !== 'admin') return;
    if (restaurants.length <= 1) return;
    setShowRestaurantModal(true);
  };

  const role = user?.role?.toLowerCase() || '';
  // Owner and admin (co-owner) both see the full Headquarters dashboard.
  const isOwnerOrManager = role === 'owner' || role === 'admin';
  const isCashier = role === 'cashier' || role === 'sales';
  const isWaiterOrEmployee = !isOwnerOrManager && !isCashier;
  const hasRestaurant = !!getRestaurantId();
  // Cashiers go directly to Menu (no table selection needed); other non-admin roles go to Tables first
  const newOrderRoute = isBarType ? '/(tabs)/bar-billing' : ((isOwnerOrManager || isCashier) ? '/(tabs)/menu' : '/(tabs)/tables');

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getBusinessTypeLabel = () => {
    const type = restaurant?.businessType || user?.restaurant?.businessType;
    switch (type) {
      case 'bar': return 'Bar';
      case 'cafe': return 'Cafe';
      case 'bakery': return 'Bakery';
      case 'hotel': return 'Hotel';
      default: return 'Restaurant';
    }
  };

  const formatCurrency = (amount) => {
    return `\u20B9${(amount || 0).toLocaleString('en-IN')}`;
  };

  if (loading) {
    return <HomeLoader />;
  }

  // Owner/Admin: Render full dashboard as home with quick actions + sales summary embedded
  if (isOwnerOrManager && hasRestaurant) {
    const renderHomeExtras = () => (
      <View style={{ paddingTop: 8 }}>
        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push(newOrderRoute)}>
            <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="add-circle" size={26} color="#ef4444" />
            </View>
            <Text style={styles.actionText}>{isBarType ? 'Open Tab' : 'New Order'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/tables')}>
            <View style={[styles.actionIcon, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="restaurant" size={24} color="#3b82f6" />
            </View>
            <Text style={styles.actionText}>Tables</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/orders')}>
            <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="receipt" size={24} color="#f59e0b" />
            </View>
            <Text style={styles.actionText}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/more')}>
            <View style={[styles.actionIcon, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="settings" size={24} color="#10b981" />
            </View>
            <Text style={styles.actionText}>Manage</Text>
          </TouchableOpacity>
        </View>

        {/* Sales Summary */}
        {todayStats.totalOrders > 0 && (
          <View style={summaryStyles.container}>
            <TouchableOpacity style={summaryStyles.header} onPress={toggleDailySummary} activeOpacity={0.7}>
              <View style={summaryStyles.headerLeft}>
                <View style={summaryStyles.headerIcon}>
                  <Ionicons name="analytics-outline" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={summaryStyles.headerTitle}>Today&apos;s Sales Summary</Text>
                  {dailySummary && (
                    <Text style={summaryStyles.headerSubtitle}>{dailySummary.items?.length || 0} items sold</Text>
                  )}
                </View>
              </View>
              <View style={summaryStyles.headerRight}>
                {dailySummary && (
                  <Text style={summaryStyles.headerAmount}>
                    {formatCurrency(dailySummary.totalRevenueWithTax || dailySummary.totalRevenue || 0)}
                  </Text>
                )}
                <Ionicons name={showDailySummary ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMedium} />
              </View>
            </TouchableOpacity>
            {showDailySummary && (
              <View style={summaryStyles.body}>
                {dailySummaryLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 20 }} />
                ) : dailySummary && dailySummary.items?.length > 0 ? (
                  <>
                    <View style={summaryStyles.statsRow}>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Revenue</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#dc2626' }]}>{formatCurrency(dailySummary.totalRevenueWithTax || dailySummary.totalRevenue || 0)}</Text>
                      </View>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Orders</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#3b82f6' }]}>{dailySummary.totalOrders}</Text>
                      </View>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Items</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#f59e0b' }]}>{dailySummary.items.length}</Text>
                      </View>
                    </View>
                    <View style={summaryStyles.tableHeader}>
                      <Text style={[summaryStyles.tableHeaderText, { flex: 1 }]}>Item</Text>
                      <Text style={[summaryStyles.tableHeaderText, { width: 50, textAlign: 'center' }]}>Qty</Text>
                      <Text style={[summaryStyles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Amount</Text>
                    </View>
                    {[...dailySummary.items].sort((a, b) => b.quantity - a.quantity).map((item, idx) => (
                      <View key={item.originalKey || item.name} style={[summaryStyles.itemRow, idx % 2 === 0 && summaryStyles.itemRowAlt]}>
                        <Text style={summaryStyles.itemName} numberOfLines={1}>{item.name}</Text>
                        <View style={summaryStyles.qtyBadge}><Text style={summaryStyles.qtyText}>{item.quantity}</Text></View>
                        <Text style={summaryStyles.itemAmount}>{formatCurrency(item.revenue)}</Text>
                      </View>
                    ))}
                    <View style={summaryStyles.totalRow}>
                      <Text style={summaryStyles.totalLabel}>Total</Text>
                      <View style={summaryStyles.qtyBadge}><Text style={summaryStyles.qtyText}>{dailySummary.items.reduce((s, i) => s + i.quantity, 0)}</Text></View>
                      <Text style={[summaryStyles.itemAmount, { fontWeight: '700', color: '#dc2626' }]}>{formatCurrency(dailySummary.items.reduce((s, i) => s + i.revenue, 0))}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={summaryStyles.emptyText}>No sales data for today yet</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Pending Orders */}
        {todayStats.pendingOrders > 0 && (
          <TouchableOpacity style={styles.pendingAlert} onPress={() => router.push('/(tabs)/orders')}>
            <View style={styles.pendingAlertLeft}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingAlertText}>{todayStats.pendingOrders} order{todayStats.pendingOrders > 1 ? 's' : ''} pending</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
          </TouchableOpacity>
        )}

        {/* Recent Orders */}
        {todayOrders.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {todayOrders.map((order) => (
              <View key={order.id || order._id} style={styles.orderCard}>
                <View style={styles.orderCardLeft}>
                  <Text style={styles.orderNumber}>#{order.orderNumber || order.id?.slice(-6)}</Text>
                  <Text style={styles.orderMeta}>{order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}{order.tableName ? ` · ${order.tableName}` : ''}</Text>
                </View>
                <View style={styles.orderCardRight}>
                  <Text style={styles.orderAmount}>{formatCurrency(order.finalAmount || order.totalAmount || order.total || 0)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>{order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}
      </View>
    );

    return <HeadquartersContent embedded initialUser={user} extraContent={renderHomeExtras} restaurants={restaurants} onSwitchRestaurant={handleSwitchRestaurant} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.aiButton} onPress={() => router.push('/(tabs)/headquarters')} activeOpacity={0.7}>
                <Ionicons name="sparkles" size={14} color="#fff" />
                <Text style={styles.aiButtonText}>AI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconBtn} onPress={onRefresh} activeOpacity={0.7}>
                <Ionicons name={refreshing ? 'sync' : 'refresh-outline'} size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
          {/* Restaurant selector — always show current restaurant name */}
          {hasRestaurant && (
            <TouchableOpacity
              style={styles.restaurantChip}
              onPress={restaurants.length > 1 && (role === 'owner' || role === 'admin') ? showRestaurantPicker : undefined}
              activeOpacity={restaurants.length > 1 && (role === 'owner' || role === 'admin') ? 0.7 : 1}
            >
              <Ionicons name="storefront-outline" size={14} color="#dc2626" />
              <Text style={styles.restaurantChipText} numberOfLines={1}>
                {restaurant?.name || user?.restaurant?.name || 'My Restaurant'}
              </Text>
              {restaurants.length > 1 && (role === 'owner' || role === 'admin') && (
                <Ionicons name="swap-horizontal" size={14} color="#94a3b8" />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Big CTA — Start Taking Order */}
        {hasRestaurant && (
          <TouchableOpacity
            style={styles.bigCta}
            onPress={() => router.push(newOrderRoute)}
            activeOpacity={0.8}
          >
            <View style={styles.bigCtaInner}>
              <View style={styles.bigCtaIconWrap}>
                <Ionicons name={isBarType ? 'beer-outline' : 'restaurant-outline'} size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bigCtaTitle}>{isBarType ? 'Open New Tab' : 'Start Taking Order'}</Text>
                <Text style={styles.bigCtaSub}>{isBarType ? 'Tap to open a new bar tab' : 'Tap to create a new order'}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
            </View>
          </TouchableOpacity>
        )}

        {/* Stats — 2x2 grid like web dashboard */}
        {hasRestaurant && (
          <View style={styles.snapshotSection}>
            <View style={styles.snapshotGrid}>
              <View style={[styles.snapshotCard, { backgroundColor: '#fef2f2' }]}>
                <View style={[styles.snapshotCardIcon, { backgroundColor: '#ef4444' }]}>
                  <Ionicons name="storefront-outline" size={18} color="#fff" />
                </View>
                <Text style={styles.snapshotCardValue}>{todayStats.totalOrders}</Text>
                <Text style={styles.snapshotCardLabel}>Total Orders</Text>
              </View>
              <View style={[styles.snapshotCard, { backgroundColor: '#ecfdf5' }]}>
                <View style={[styles.snapshotCardIcon, { backgroundColor: '#10b981' }]}>
                  <Ionicons name="cash-outline" size={18} color="#fff" />
                </View>
                <Text style={styles.snapshotCardValue}>{formatCurrency(todayStats.totalRevenue)}</Text>
                <Text style={styles.snapshotCardLabel}>Revenue</Text>
              </View>
              <View style={[styles.snapshotCard, { backgroundColor: '#eff6ff' }]}>
                <View style={[styles.snapshotCardIcon, { backgroundColor: '#3b82f6' }]}>
                  <Ionicons name="restaurant-outline" size={18} color="#fff" />
                </View>
                <Text style={styles.snapshotCardValue}>{tableStats.occupied}/{tableStats.total}</Text>
                <Text style={styles.snapshotCardLabel}>Tables Busy</Text>
              </View>
              <View style={[styles.snapshotCard, { backgroundColor: '#fef9c3' }]}>
                <View style={[styles.snapshotCardIcon, { backgroundColor: '#f59e0b' }]}>
                  <Ionicons name="trending-up-outline" size={18} color="#fff" />
                </View>
                <Text style={styles.snapshotCardValue}>{formatCurrency(todayStats.avgOrderValue)}</Text>
                <Text style={styles.snapshotCardLabel}>Avg Order Value</Text>
              </View>
            </View>
          </View>
        )}

        {/* First-time owner without restaurant */}
        {isOwnerOrManager && !hasRestaurant && (
          <View style={styles.setupCard}>
            <View style={styles.setupIconCircle}>
              <Ionicons name="restaurant-outline" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.setupTitle}>Welcome to DineOpen!</Text>
            <Text style={styles.setupSubtitle}>
              Set up your restaurant to start taking orders, managing tables, and growing your business.
            </Text>
            <TouchableOpacity
              style={styles.setupButton}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.setupButtonText}>Set Up Restaurant</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        {hasRestaurant && (
          <>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push(newOrderRoute)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="add-circle" size={26} color={Colors.primary} />
                </View>
                <Text style={styles.actionText}>{isBarType ? 'Open Tab' : 'New Order'}</Text>
              </TouchableOpacity>

              {!isCashier && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/tables')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#eff6ff' }]}>
                    <Ionicons name="restaurant" size={24} color="#3b82f6" />
                  </View>
                  <Text style={styles.actionText}>Tables</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/(tabs)/orders')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="receipt" size={24} color="#f59e0b" />
                </View>
                <Text style={styles.actionText}>Orders</Text>
              </TouchableOpacity>

              {isOwnerOrManager && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/headquarters')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#f0fdf4' }]}>
                    <Ionicons name="bar-chart" size={24} color="#10b981" />
                  </View>
                  <Text style={styles.actionText}>Dashboard</Text>
                </TouchableOpacity>
              )}

              {isOwnerOrManager && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/more')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#f1f5f9' }]}>
                    <Ionicons name="settings" size={24} color="#64748b" />
                  </View>
                  <Text style={styles.actionText}>Manage</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* Today's Sales Summary — collapsible item-wise breakdown */}
        {(isOwnerOrManager || isCashier) && hasRestaurant && todayStats.totalOrders > 0 && (
          <View style={summaryStyles.container}>
            <TouchableOpacity
              style={summaryStyles.header}
              onPress={toggleDailySummary}
              activeOpacity={0.7}
            >
              <View style={summaryStyles.headerLeft}>
                <View style={summaryStyles.headerIcon}>
                  <Ionicons name="analytics-outline" size={18} color="#fff" />
                </View>
                <View>
                  <Text style={summaryStyles.headerTitle}>Today&apos;s Sales Summary</Text>
                  {dailySummary && (
                    <Text style={summaryStyles.headerSubtitle}>
                      {dailySummary.items?.length || 0} items sold
                    </Text>
                  )}
                </View>
              </View>
              <View style={summaryStyles.headerRight}>
                {dailySummary && (
                  <Text style={summaryStyles.headerAmount}>
                    {formatCurrency(dailySummary.totalRevenueWithTax || dailySummary.totalRevenue || 0)}
                  </Text>
                )}
                <Ionicons
                  name={showDailySummary ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMedium}
                />
              </View>
            </TouchableOpacity>

            {showDailySummary && (
              <View style={summaryStyles.body}>
                {dailySummaryLoading ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: 20 }} />
                ) : dailySummary && dailySummary.items?.length > 0 ? (
                  <>
                    {/* Summary stats row */}
                    <View style={summaryStyles.statsRow}>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Revenue</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#dc2626' }]}>
                          {formatCurrency(dailySummary.totalRevenueWithTax || dailySummary.totalRevenue || 0)}
                        </Text>
                      </View>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Orders</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#3b82f6' }]}>
                          {dailySummary.totalOrders}
                        </Text>
                      </View>
                      <View style={summaryStyles.statPill}>
                        <Text style={summaryStyles.statPillLabel}>Items</Text>
                        <Text style={[summaryStyles.statPillValue, { color: '#f59e0b' }]}>
                          {dailySummary.items.length}
                        </Text>
                      </View>
                    </View>

                    {/* Table header */}
                    <View style={summaryStyles.tableHeader}>
                      <Text style={[summaryStyles.tableHeaderText, { flex: 1 }]}>Item</Text>
                      <Text style={[summaryStyles.tableHeaderText, { width: 50, textAlign: 'center' }]}>Qty</Text>
                      <Text style={[summaryStyles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Amount</Text>
                    </View>

                    {/* Item rows */}
                    {[...dailySummary.items]
                      .sort((a, b) => b.quantity - a.quantity)
                      .map((item, idx) => (
                        <View
                          key={item.originalKey || item.name}
                          style={[summaryStyles.itemRow, idx % 2 === 0 && summaryStyles.itemRowAlt]}
                        >
                          <Text style={summaryStyles.itemName} numberOfLines={1}>{item.name}</Text>
                          <View style={summaryStyles.qtyBadge}>
                            <Text style={summaryStyles.qtyText}>{item.quantity}</Text>
                          </View>
                          <Text style={summaryStyles.itemAmount}>{formatCurrency(item.revenue)}</Text>
                        </View>
                      ))}

                    {/* Total row */}
                    <View style={summaryStyles.totalRow}>
                      <Text style={summaryStyles.totalLabel}>Total</Text>
                      <View style={summaryStyles.qtyBadge}>
                        <Text style={summaryStyles.qtyText}>
                          {dailySummary.items.reduce((s, i) => s + i.quantity, 0)}
                        </Text>
                      </View>
                      <Text style={[summaryStyles.itemAmount, { fontWeight: '700', color: '#dc2626' }]}>
                        {formatCurrency(dailySummary.items.reduce((s, i) => s + i.revenue, 0))}
                      </Text>
                    </View>

                    {/* Order type breakdown */}
                    {dailySummary.ordersByType && Object.keys(dailySummary.ordersByType).length > 0 && (
                      <View style={summaryStyles.orderTypeRow}>
                        {Object.entries(dailySummary.ordersByType).map(([type, count]) => (
                          <View key={type} style={summaryStyles.orderTypePill}>
                            <Text style={summaryStyles.orderTypeText}>
                              {type.replace(/_/g, ' ')}: {count}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={summaryStyles.emptyText}>No sales data for today yet</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Open Bar Tabs (bar-type only) */}
        {isBarType && hasRestaurant && openTabs.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Open Tabs</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/bar-billing')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.openTabsGrid}>
              {openTabs.slice(0, 4).map((tab) => {
                const itemCount = (tab.items || []).reduce((sum, i) => sum + i.quantity, 0);
                const total = tab.finalAmount || tab.totalAmount || 0;
                const tabName = tab.customerInfo?.name || (tab.tabNumber ? `Tab #${tab.tabNumber}` : 'Tab');
                const elapsed = getTabTimeAgo(tab.createdAt);
                const hasItems = itemCount > 0;

                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.openTabCard, { width: tabCardWidth }, hasItems ? styles.openTabCardActive : styles.openTabCardEmpty]}
                    onPress={() => router.push('/(tabs)/bar-billing')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.openTabCardHeader}>
                      <View style={[styles.openTabDot, { backgroundColor: hasItems ? '#22c55e' : '#38bdf8' }]} />
                      {elapsed ? <Text style={styles.openTabTime}>{elapsed}</Text> : null}
                    </View>
                    <Text style={styles.openTabName} numberOfLines={1}>{tabName}</Text>
                    {total > 0 ? (
                      <Text style={styles.openTabAmount}>{formatCurrency(total)}</Text>
                    ) : (
                      <Text style={styles.openTabEmptyLabel}>No items</Text>
                    )}
                    <View style={styles.openTabFooter}>
                      <Ionicons name="fast-food-outline" size={11} color={Colors.textMedium} />
                      <Text style={styles.openTabItemCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Pending Orders Alert */}
        {todayStats.pendingOrders > 0 && (
          <TouchableOpacity
            style={styles.pendingAlert}
            onPress={() => router.push('/(tabs)/orders')}
          >
            <View style={styles.pendingAlertLeft}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingAlertText}>
                {todayStats.pendingOrders} order{todayStats.pendingOrders > 1 ? 's' : ''} pending
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#f59e0b" />
          </TouchableOpacity>
        )}

        {/* Recent Orders */}
        {todayOrders.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Orders</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {todayOrders.map((order) => (
              <View key={order.id || order._id} style={styles.orderCard}>
                <View style={styles.orderCardLeft}>
                  <Text style={styles.orderNumber}>
                    #{order.orderNumber || order.id?.slice(-6)}
                  </Text>
                  <Text style={styles.orderMeta}>
                    {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
                    {order.tableName ? ` · ${order.tableName}` : ''}
                  </Text>
                </View>
                <View style={styles.orderCardRight}>
                  <Text style={styles.orderAmount}>
                    {formatCurrency(order.finalAmount || order.totalAmount || order.total || 0)}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(order.status) + '20' }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: getStatusColor(order.status) }
                    ]}>
                      {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Empty state */}
        {todayOrders.length === 0 && !loading && hasRestaurant && (
          <View style={styles.emptyState}>
            <Ionicons name="cafe-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyStateTitle}>No orders yet today</Text>
            <Text style={styles.emptyStateSubtitle}>
              Start taking orders to see your daily stats here
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => router.push(newOrderRoute)}
            >
              <Text style={styles.emptyStateButtonText}>{isBarType ? 'Open First Tab' : 'Take First Order'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <RestaurantPickerModal
        visible={showRestaurantModal}
        onClose={() => setShowRestaurantModal(false)}
        restaurants={restaurants}
        currentRestaurantId={getRestaurantId()}
        onSelect={handleSwitchRestaurant}
        switching={!!switchingRestaurantId}
        switchingId={switchingRestaurantId}
      />
    </SafeAreaView>
  );
}

function getTabTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getStatusColor(status) {
  switch (status) {
    case 'completed':
    case 'delivered':
      return '#10b981';
    case 'pending':
      return '#f59e0b';
    case 'confirmed':
    case 'preparing':
      return '#3b82f6';
    case 'cancelled':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  // Header
  headerSection: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  aiButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '500',
  },
  restaurantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 10,
  },
  restaurantChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
  },
  // Big CTA button
  bigCta: {
    marginHorizontal: Spacing.md,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 16,
    backgroundColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  bigCtaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  bigCtaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigCtaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.3,
  },
  bigCtaSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    marginTop: 2,
  },
  // Stats section
  snapshotSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    marginBottom: 8,
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  snapshotCard: {
    flex: 1,
    minWidth: '46%',
    borderRadius: 20,
    padding: 16,
  },
  snapshotCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  snapshotCardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 2,
  },
  snapshotCardLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  // Setup Card (first-time owner)
  setupCard: {
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    padding: 24,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.primary + '20',
    borderStyle: 'dashed',
  },
  setupIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  setupTitle: {
    ...Typography.h3,
    color: Colors.textDark,
    marginBottom: 8,
  },
  setupSubtitle: {
    ...Typography.caption,
    color: Colors.textMedium,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  setupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // (stats in snapshot section)
  // (hero action removed)
  // Section
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1c1e',
    paddingHorizontal: Spacing.md,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: Spacing.md,
    marginBottom: Spacing.sm,
  },
  seeAllText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  // Quick Actions
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: 8,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 11,
    color: '#8e8e93',
    fontWeight: '600',
    textAlign: 'center',
  },
  // Management Dashboard Card
  dashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    marginHorizontal: Spacing.md,
    marginBottom: 12,
    padding: 16,
    borderRadius: 20,
  },
  dashboardCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dashboardCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dashboardCardText: {
    flex: 1,
  },
  dashboardCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#065f46',
    marginBottom: 2,
  },
  dashboardCardSubtitle: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '400',
  },
  dashboardArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Pending Alert
  pendingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff7ed',
    marginHorizontal: Spacing.md,
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
  },
  pendingAlertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f59e0b',
  },
  pendingAlertText: {
    ...Typography.caption,
    color: '#92400e',
    fontWeight: '600',
  },
  // Order Cards
  orderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  orderCardLeft: {
    flex: 1,
  },
  orderNumber: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  orderMeta: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  orderCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  orderAmount: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    ...Typography.small,
    fontWeight: '600',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: Spacing.xl,
  },
  emptyStateTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptyStateSubtitle: {
    ...Typography.caption,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  emptyStateButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: BorderRadius.large,
    marginTop: Spacing.lg,
  },
  emptyStateButtonText: {
    ...Typography.bodyBold,
    color: '#fff',
  },
  // Open Bar Tabs Grid
  openTabsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: Spacing.md,
  },
  openTabCard: {
    borderRadius: 12,
    padding: 10,
    minHeight: 110,
    borderWidth: 1.5,
  },
  openTabCardActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  openTabCardEmpty: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  openTabCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  openTabDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  openTabTime: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  openTabName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  openTabAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textDark,
  },
  openTabEmptyLabel: {
    fontSize: 12,
    color: Colors.textLight,
    fontStyle: 'italic',
  },
  openTabFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  openTabItemCount: {
    fontSize: 10,
    color: Colors.textMedium,
    fontWeight: '500',
  },
});

const summaryStyles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.md,
    marginBottom: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065f46',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065f46',
  },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#a7f3d0',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statPillLabel: {
    fontSize: 10,
    color: Colors.textLight,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  statPillValue: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textLight,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
  },
  itemRowAlt: {
    backgroundColor: '#fafafa',
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textDark,
  },
  qtyBadge: {
    width: 50,
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3b82f6',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
  },
  itemAmount: {
    width: 80,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 2,
    borderTopColor: '#e5e7eb',
    marginTop: 4,
  },
  totalLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  orderTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  orderTypePill: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderTypeText: {
    fontSize: 11,
    color: Colors.textMedium,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: Colors.textLight,
    fontSize: 13,
  },
});
