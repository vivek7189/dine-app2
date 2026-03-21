import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import AppDrawer from '../../components/AppDrawer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

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

  const businessType = restaurant?.businessType || user?.restaurant?.businessType || 'restaurant';
  const isBarType = businessType === 'bar';
  const newOrderRoute = isBarType ? '/(tabs)/bar-billing' : '/(tabs)/menu';

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }
      setUser(userData);

      const restaurantId = userData.restaurantId || userData.restaurant?.id;
      // Fetch fresh restaurant data to ensure businessType and other fields are current
      let restaurantData = userData.restaurant;
      if (restaurantId) {
        try {
          const res = await apiClient.getRestaurant(restaurantId);
          const freshData = res?.restaurant || res;
          if (freshData && freshData.name) {
            restaurantData = { id: restaurantId, ...freshData };
            // Update stored user with fresh restaurant data
            const updatedUser = { ...userData, restaurant: restaurantData, restaurantId };
            await apiClient.setUser(updatedUser);
            setUser(updatedUser);
          }
        } catch (e) {
          console.log('Could not fetch fresh restaurant data:', e.message);
        }
      }
      setRestaurant(restaurantData);

      if (restaurantId) {
        await loadStats(restaurantId);
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

      setTodayStats({
        totalOrders: orders.length,
        totalRevenue: revenue,
        avgOrderValue: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
        pendingOrders: pending.length,
        completedOrders: completed.length,
      });

      const floors = floorsResponse.floors || (Array.isArray(floorsResponse) ? floorsResponse : []);
      const allTables = floors.flatMap(f => f.tables || []);
      const occupied = allTables.filter(t => t.status === 'occupied').length;

      setTableStats({
        total: allTables.length,
        occupied,
        available: allTables.length - occupied,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const restaurantId = getRestaurantId();
    if (restaurantId) {
      await loadStats(restaurantId);
    }
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await apiClient.clearToken();
    router.replace('/(auth)/login');
  };

  const role = user?.role?.toLowerCase() || '';
  const isOwnerOrManager = ['owner', 'manager', 'admin'].includes(role);
  const isCashier = role === 'cashier' || role === 'sales';
  const isWaiterOrEmployee = !isOwnerOrManager && !isCashier;
  const hasRestaurant = !!getRestaurantId();

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
    return `₹${(amount || 0).toLocaleString('en-IN')}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==================== First-time owner (no restaurant) ====================
  const renderSetupCard = () => (
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
  );

  // ==================== Cashier hero action ====================
  const renderCashierHero = () => (
    <TouchableOpacity
      style={styles.heroAction}
      onPress={() => router.push(newOrderRoute)}
      activeOpacity={0.8}
    >
      <View style={styles.heroActionInner}>
        <View style={styles.heroIconCircle}>
          <Ionicons name="calculator-outline" size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroActionTitle}>Start Billing</Text>
          <Text style={styles.heroActionSubtitle}>Open the billing screen to take orders</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </View>
    </TouchableOpacity>
  );

  // ==================== Waiter hero action ====================
  const renderWaiterHero = () => (
    <TouchableOpacity
      style={[styles.heroAction, { backgroundColor: '#3b82f6' }]}
      onPress={() => router.push(newOrderRoute)}
      activeOpacity={0.8}
    >
      <View style={styles.heroActionInner}>
        <View style={[styles.heroIconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name="add-circle-outline" size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroActionTitle}>{isBarType ? 'Open Tab' : 'New Order'}</Text>
          <Text style={styles.heroActionSubtitle}>{isBarType ? 'Open a new bar tab' : 'Take a new order for a table'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#fff" />
      </View>
    </TouchableOpacity>
  );

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
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => setDrawerVisible(true)} style={styles.menuButton}>
              <Ionicons name="menu" size={24} color={Colors.textDark} />
            </TouchableOpacity>
            <View>
              <Text style={styles.greeting}>{getGreeting()}</Text>
              <Text style={styles.userName}>{user?.name || 'Staff'}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            {hasRestaurant && (
              <View style={styles.businessBadge}>
                <Text style={styles.businessBadgeText}>{getBusinessTypeLabel()}</Text>
              </View>
            )}
            {isOwnerOrManager && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{role.charAt(0).toUpperCase() + role.slice(1)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Restaurant Name */}
        {hasRestaurant && (
          <Text style={styles.restaurantName}>
            {restaurant?.name || user?.restaurant?.name || 'My Restaurant'}
          </Text>
        )}

        {/* First-time owner without restaurant */}
        {isOwnerOrManager && !hasRestaurant && renderSetupCard()}

        {/* Cashier: Hero billing button */}
        {isCashier && hasRestaurant && renderCashierHero()}

        {/* Waiter: Hero new order button */}
        {isWaiterOrEmployee && hasRestaurant && renderWaiterHero()}

        {/* Stats Cards — Owner/Manager view */}
        {isOwnerOrManager && hasRestaurant && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#eff6ff' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#3b82f6' }]}>
                <Ionicons name="receipt-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{todayStats.totalOrders}</Text>
              <Text style={styles.statLabel}>Today's Orders</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#10b981' }]}>
                <Ionicons name="cash-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{formatCurrency(todayStats.totalRevenue)}</Text>
              <Text style={styles.statLabel}>Revenue</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#fefce8' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#f59e0b' }]}>
                <Ionicons name="trending-up-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{formatCurrency(todayStats.avgOrderValue)}</Text>
              <Text style={styles.statLabel}>Avg Order</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#fdf2f8' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#ec4899' }]}>
                <Ionicons name="restaurant-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>
                {tableStats.occupied}/{tableStats.total}
              </Text>
              <Text style={styles.statLabel}>Tables Busy</Text>
            </View>
          </View>
        )}

        {/* Cashier Stats */}
        {isCashier && hasRestaurant && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#eff6ff' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#3b82f6' }]}>
                <Ionicons name="receipt-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{todayStats.completedOrders}</Text>
              <Text style={styles.statLabel}>Bills Today</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#10b981' }]}>
                <Ionicons name="cash-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{formatCurrency(todayStats.totalRevenue)}</Text>
              <Text style={styles.statLabel}>Collected</Text>
            </View>
          </View>
        )}

        {/* Waiter/Employee — Quick Stats */}
        {isWaiterOrEmployee && hasRestaurant && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#fef3c7' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#f59e0b' }]}>
                <Ionicons name="time-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{todayStats.pendingOrders}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#10b981' }]}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>{todayStats.completedOrders}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: '#eff6ff' }]}>
              <View style={[styles.statIconCircle, { backgroundColor: '#3b82f6' }]}>
                <Ionicons name="restaurant-outline" size={20} color="#fff" />
              </View>
              <Text style={styles.statValue}>
                {tableStats.occupied}/{tableStats.total}
              </Text>
              <Text style={styles.statLabel}>Tables Busy</Text>
            </View>
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
                <View style={[styles.actionIcon, { backgroundColor: Colors.primary }]}>
                  <Ionicons name="add-circle-outline" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>{isBarType ? 'Open Tab' : 'New Order'}</Text>
              </TouchableOpacity>

              {!isCashier && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/tables')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#3b82f6' }]}>
                    <Ionicons name="restaurant-outline" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionText}>Tables</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/(tabs)/orders')}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#f59e0b' }]}>
                  <Ionicons name="receipt-outline" size={24} color="#fff" />
                </View>
                <Text style={styles.actionText}>Orders</Text>
              </TouchableOpacity>

              {role === 'owner' && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/headquarters')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#6366f1' }]}>
                    <Ionicons name="business-outline" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionText}>HQ</Text>
                </TouchableOpacity>
              )}

              {isOwnerOrManager && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push('/(tabs)/more')}
                >
                  <View style={[styles.actionIcon, { backgroundColor: '#8b5cf6' }]}>
                    <Ionicons name="settings-outline" size={24} color="#fff" />
                  </View>
                  <Text style={styles.actionText}>Manage</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
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
                    style={[styles.openTabCard, hasItems ? styles.openTabCardActive : styles.openTabCardEmpty]}
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

      {/* App Drawer */}
      <AppDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        user={user}
        onLogout={handleLogout}
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
    backgroundColor: Colors.backgroundLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    ...Typography.body,
    color: Colors.textMedium,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    padding: Spacing.xs,
  },
  greeting: {
    ...Typography.caption,
    color: Colors.textLight,
  },
  userName: {
    ...Typography.h3,
    color: Colors.textDark,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  businessBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  businessBadgeText: {
    ...Typography.small,
    color: Colors.primary,
    fontWeight: '600',
  },
  roleBadge: {
    backgroundColor: '#8b5cf6' + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  roleBadgeText: {
    fontSize: 10,
    color: '#8b5cf6',
    fontWeight: '600',
  },
  restaurantName: {
    ...Typography.caption,
    color: Colors.textMedium,
    paddingHorizontal: Spacing.md,
    marginLeft: 44,
    marginBottom: Spacing.md,
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
  // Hero Action (cashier/waiter)
  heroAction: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...Shadows.medium,
  },
  heroActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 14,
  },
  heroIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  heroActionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: 10,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - 42) / 2 - 5,
    borderRadius: BorderRadius.large,
    padding: 14,
    ...Shadows.small,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.textMedium,
  },
  // Section
  sectionTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
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
    gap: 12,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    ...Typography.small,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  // Pending Alert
  pendingAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef3c7',
    marginHorizontal: Spacing.md,
    padding: 14,
    borderRadius: BorderRadius.large,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#fde68a',
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
    padding: 14,
    borderRadius: BorderRadius.large,
    marginBottom: 8,
    ...Shadows.small,
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
    marginBottom: Spacing.lg,
  },
  openTabCard: {
    width: (SCREEN_WIDTH - 42 - 10) / 2,
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
