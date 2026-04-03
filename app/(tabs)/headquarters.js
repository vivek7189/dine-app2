import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator, RefreshControl,
  FlatList, Dimensions, Switch, Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'bar-chart' },
  { key: 'staff', label: 'Staff', icon: 'people' },
  { key: 'menu', label: 'Menu', icon: 'fast-food' },
  { key: 'inventory', label: 'Inventory', icon: 'cube' },
];
const DATE_PRESETS = [
  { key: 'today', label: 'Today', icon: 'today' },
  { key: '7d', label: '7 Days', icon: 'calendar' },
  { key: '30d', label: '30 Days', icon: 'calendar-outline' },
  { key: '90d', label: '90 Days', icon: 'stats-chart' },
];
const ROLE_FILTERS = ['All', 'Manager', 'Waiter', 'Cashier', 'Chef'];
const STATUS_FILTERS = ['All', 'Active', 'Inactive'];
const STOCK_FILTERS = ['All', 'Normal', 'Low', 'Out'];

export function HeadquartersContent({ embedded = false, drawerToggle, initialUser = null }) {
  return <HeadquartersScreen embedded={embedded} drawerToggle={drawerToggle} initialUser={initialUser} />;
}

export default function HeadquartersScreen({ embedded = false, drawerToggle, initialUser = null }) {
  const router = useRouter();

  // Auth/loading
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab & filter state
  const [activeTab, setActiveTab] = useState('overview');
  const [datePreset, setDatePreset] = useState(embedded ? 'today' : '7d');
  const [selectedRestaurants, setSelectedRestaurants] = useState([]);
  const [showRestaurantFilter, setShowRestaurantFilter] = useState(false);

  // Dashboard/analytics
  const [dashboardData, setDashboardData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);

  // AI Insights
  const [aiInsights, setAiInsights] = useState(null);
  const [showInsightsModal, setShowInsightsModal] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [aiRemaining, setAiRemaining] = useState(10);

  // Staff
  const [staffData, setStaffData] = useState({ staff: [], pagination: {} });
  const [staffRole, setStaffRole] = useState('All');
  const [staffStatus, setStaffStatus] = useState('All');
  const [staffSearch, setStaffSearch] = useState('');
  const [staffPage, setStaffPage] = useState(1);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Menu
  const [menuData, setMenuData] = useState({ menuItems: [], categories: [], pagination: {} });
  const [menuCategory, setMenuCategory] = useState('');
  const [menuSearch, setMenuSearch] = useState('');
  const [menuPage, setMenuPage] = useState(1);
  const [loadingMenu, setLoadingMenu] = useState(false);

  // Inventory
  const [inventoryData, setInventoryData] = useState({ inventory: [], alerts: {}, categories: [], pagination: {} });
  const [invStockStatus, setInvStockStatus] = useState('All');
  const [invCategory, setInvCategory] = useState('');
  const [invSearch, setInvSearch] = useState('');
  const [invPage, setInvPage] = useState(1);
  const [loadingInv, setLoadingInv] = useState(false);

  const searchTimerRef = useRef(null);
  const dataLoadedRef = useRef(false);

  // ── Helpers ──────────────────────────────────────
  const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const getRestaurantIds = () => selectedRestaurants.length > 0 ? selectedRestaurants : undefined;

  const getHeadline = () => {
    switch (datePreset) {
      case 'today': return "Today's Snapshot";
      case '7d': return 'Weekly Highlights';
      case '30d': return 'Monthly Overview';
      case '90d': return 'Quarterly Insights';
      default: return 'Headquarters';
    }
  };

  // ── Data Loading ──────────────────────────────────
  const loadInitialData = async () => {
    try {
      const userData = initialUser || await apiClient.getUser();
      if (!userData) { router.replace('/(auth)/login'); return; }
      if (!embedded && userData.role !== 'owner') {
        Alert.alert('Access Denied', 'Headquarters is available for restaurant owners only.');
        router.back();
        return;
      }
      setUser(userData);
      await Promise.all([loadDashboard(), loadAnalytics(), loadAIUsage()]);
      dataLoadedRef.current = true;
    } catch (error) {
      console.error('HQ load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDashboard = async () => {
    try {
      const res = await apiClient.getOwnerDashboard({ period: datePreset });
      if (res.success) setDashboardData(res);
    } catch (e) { console.error('Dashboard error:', e); }
  };

  const loadAnalytics = async () => {
    try {
      const res = await apiClient.getOwnerAnalytics({ period: datePreset, restaurantIds: getRestaurantIds() });
      if (res.success) setAnalyticsData(res.analytics);
    } catch (e) { console.error('Analytics error:', e); }
  };

  const loadAIUsage = async () => {
    try {
      const res = await apiClient.getAIUsage();
      if (res.success) setAiRemaining(res.remaining);
    } catch (e) { console.error('AI usage error:', e); }
  };

  const loadAIInsights = async () => {
    if (aiRemaining <= 0) {
      Alert.alert('Limit Reached', 'You\'ve used all 10 AI insights for today. Try again tomorrow.');
      return;
    }
    setLoadingInsights(true);
    try {
      const res = await apiClient.getAIInsights({ period: datePreset, restaurantIds: getRestaurantIds() });
      if (res.success) {
        setAiInsights(res.insights);
        setAiRemaining(res.remaining ?? aiRemaining - 1);
        setShowInsightsModal(true);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to generate AI insights. Please try again.');
      console.error('AI Insights error:', e);
    } finally {
      setLoadingInsights(false);
    }
  };

  const loadStaff = async (page = 1, append = false) => {
    setLoadingStaff(true);
    try {
      const params = { page, limit: 50, restaurantIds: getRestaurantIds() };
      if (staffRole !== 'All') params.role = staffRole.toLowerCase();
      if (staffStatus !== 'All') params.status = staffStatus.toLowerCase();
      if (staffSearch) params.search = staffSearch;
      const res = await apiClient.getStaffList(params);
      if (res.success) {
        setStaffData({
          staff: append ? [...staffData.staff, ...res.staff] : res.staff,
          pagination: res.pagination,
        });
      }
    } catch (e) { console.error('Staff error:', e); }
    finally { setLoadingStaff(false); }
  };

  const loadMenuItems = async (page = 1, append = false) => {
    setLoadingMenu(true);
    try {
      const params = { page, limit: 50, restaurantIds: getRestaurantIds() };
      if (menuCategory) params.category = menuCategory;
      if (menuSearch) params.search = menuSearch;
      const res = await apiClient.getOwnerMenuItems(params);
      if (res.success) {
        setMenuData({
          menuItems: append ? [...menuData.menuItems, ...res.menuItems] : res.menuItems,
          categories: res.categories || [],
          pagination: res.pagination,
        });
      }
    } catch (e) { console.error('Menu error:', e); }
    finally { setLoadingMenu(false); }
  };

  const loadInventory = async (page = 1, append = false) => {
    setLoadingInv(true);
    try {
      const params = { page, limit: 50, restaurantIds: getRestaurantIds() };
      if (invStockStatus !== 'All') params.stockStatus = invStockStatus.toLowerCase();
      if (invCategory) params.category = invCategory;
      if (invSearch) params.search = invSearch;
      const res = await apiClient.getOwnerInventory(params);
      if (res.success) {
        setInventoryData({
          inventory: append ? [...inventoryData.inventory, ...res.inventory] : res.inventory,
          alerts: res.alerts || {},
          categories: res.categories || [],
          pagination: res.pagination,
        });
      }
    } catch (e) { console.error('Inventory error:', e); }
    finally { setLoadingInv(false); }
  };

  const toggleStaffActive = async (staffId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.updateStaffStatus(staffId, newStatus);
      setStaffData(prev => ({
        ...prev,
        staff: prev.staff.map(s => s.id === staffId ? { ...s, status: newStatus } : s),
      }));
    } catch (e) { Alert.alert('Error', 'Failed to update staff status.'); }
  };

  // ── Effects ──────────────────────────────────────
  useEffect(() => { loadInitialData(); }, []);

  useFocusEffect(useCallback(() => {
    if (dataLoadedRef.current) {
      loadDashboard();
      loadAnalytics();
    }
  }, [datePreset, selectedRestaurants]));

  useEffect(() => {
    if (!dataLoadedRef.current) return;
    loadDashboard();
    loadAnalytics();
  }, [datePreset, selectedRestaurants]);

  useEffect(() => {
    if (!dataLoadedRef.current) return;
    if (activeTab === 'staff') loadStaff(1);
    else if (activeTab === 'menu') loadMenuItems(1);
    else if (activeTab === 'inventory') loadInventory(1);
  }, [activeTab]);

  // Debounced search for staff/menu/inventory
  useEffect(() => {
    if (!dataLoadedRef.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (activeTab === 'staff') { setStaffPage(1); loadStaff(1); }
    }, 300);
  }, [staffSearch, staffRole, staffStatus]);

  useEffect(() => {
    if (!dataLoadedRef.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (activeTab === 'menu') { setMenuPage(1); loadMenuItems(1); }
    }, 300);
  }, [menuSearch, menuCategory]);

  useEffect(() => {
    if (!dataLoadedRef.current) return;
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (activeTab === 'inventory') { setInvPage(1); loadInventory(1); }
    }, 300);
  }, [invSearch, invStockStatus, invCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'overview') {
      await Promise.all([loadDashboard(), loadAnalytics()]);
    } else if (activeTab === 'staff') { await loadStaff(1); }
    else if (activeTab === 'menu') { await loadMenuItems(1); }
    else if (activeTab === 'inventory') { await loadInventory(1); }
    setRefreshing(false);
  };

  // ── Render: Loading (only when opened standalone, not embedded) ──
  if (loading && !embedded) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Sub-components ─────────────────────────

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={embedded && drawerToggle ? drawerToggle : () => router.back()} style={styles.backBtn}>
          <Ionicons name={embedded ? "menu" : "arrow-back"} size={22} color={Colors.textDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{getHeadline()}</Text>
          <Text style={styles.headerSubtitle}>
            {dashboardData?.restaurants?.length || 0} restaurant{(dashboardData?.restaurants?.length || 0) !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.aiBtn}
          onPress={loadAIInsights}
          disabled={loadingInsights}
        >
          {loadingInsights ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color="#fff" />
              <Text style={styles.aiBtnText}>AI</Text>
            </>
          )}
          {aiRemaining < 10 && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{aiRemaining}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={Colors.textMedium} />
        </TouchableOpacity>
      </View>

      {/* Date Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datePillsRow}>
        {DATE_PRESETS.map(dp => (
          <TouchableOpacity
            key={dp.key}
            style={[styles.datePill, datePreset === dp.key && styles.datePillActive]}
            onPress={() => setDatePreset(dp.key)}
          >
            <Ionicons name={dp.icon} size={14} color={datePreset === dp.key ? '#fff' : Colors.textMedium} />
            <Text style={[styles.datePillText, datePreset === dp.key && styles.datePillTextActive]}>
              {dp.label}
            </Text>
          </TouchableOpacity>
        ))}
        {(dashboardData?.restaurants?.length || 0) > 1 && (
          <TouchableOpacity
            style={[styles.datePill, selectedRestaurants.length > 0 && styles.datePillActive]}
            onPress={() => setShowRestaurantFilter(true)}
          >
            <Ionicons name="business" size={14} color={selectedRestaurants.length > 0 ? '#fff' : Colors.textMedium} />
            <Text style={[styles.datePillText, selectedRestaurants.length > 0 && styles.datePillTextActive]}>
              {selectedRestaurants.length > 0 ? `${selectedRestaurants.length} selected` : 'All Locations'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );

  const renderTabPills = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
      {TABS.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.tabPill, activeTab === tab.key && styles.tabPillActive]}
          onPress={() => setActiveTab(tab.key)}
        >
          <Ionicons name={tab.icon} size={15} color={activeTab === tab.key ? '#fff' : Colors.textMedium} />
          <Text style={[styles.tabPillText, activeTab === tab.key && styles.tabPillTextActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  // ── Overview Tab ──────────────────────────────────
  const renderOverviewTab = () => {
    const restaurants = dashboardData?.restaurants || [];
    const totals = dashboardData?.totals || {};
    const maxRevenue = Math.max(...restaurants.map(r => r.revenue || r.todayRevenue || 0), 1);

    return (
      <View style={styles.tabContent}>
        {/* Metric Cards */}
        <View style={styles.metricGrid}>
          <View style={[styles.metricCard, { backgroundColor: '#f3f0ff' }]}>
            <View style={[styles.metricIcon, { backgroundColor: '#8b5cf6' }]}>
              <Ionicons name="business" size={20} color="#fff" />
            </View>
            <Text style={styles.metricValue}>{totals.totalRestaurants || restaurants.length}</Text>
            <Text style={styles.metricLabel}>Total Restaurants</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: '#ecfdf5' }]}>
            <View style={[styles.metricIcon, { backgroundColor: '#10b981' }]}>
              <Ionicons name="cash" size={20} color="#fff" />
            </View>
            <Text style={styles.metricValue}>{formatCurrency(totals.totalRevenue || totals.totalTodayRevenue || 0)}</Text>
            <Text style={styles.metricLabel}>Revenue</Text>
            {(totals.totalRevenueWithTax || 0) > 0 && (
              <Text style={styles.metricSubLabel}>incl. tax: {formatCurrency(totals.totalRevenueWithTax)}</Text>
            )}
          </View>
          <View style={[styles.metricCard, { backgroundColor: '#eff6ff' }]}>
            <View style={[styles.metricIcon, { backgroundColor: '#3b82f6' }]}>
              <Ionicons name="cart" size={20} color="#fff" />
            </View>
            <Text style={styles.metricValue}>{totals.totalOrders || totals.totalTodayOrders || 0}</Text>
            <Text style={styles.metricLabel}>Total Orders</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: '#fffbeb' }]}>
            <View style={[styles.metricIcon, { backgroundColor: '#f59e0b' }]}>
              <Ionicons name="trending-up" size={20} color="#fff" />
            </View>
            <Text style={styles.metricValue}>{formatCurrency(analyticsData?.avgOrderValue || 0)}</Text>
            <Text style={styles.metricLabel}>Avg Order Value</Text>
          </View>
        </View>

        {/* Revenue Trend (simple bar chart) */}
        {analyticsData?.revenueByDay?.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Revenue Trend</Text>
              <Text style={styles.sectionBadge}>{formatCurrency(analyticsData.totalRevenue)}</Text>
            </View>
            <View style={styles.barChartRow}>
              {analyticsData.revenueByDay.slice(-7).map((day, i) => {
                const maxRev = Math.max(...analyticsData.revenueByDay.map(d => d.revenue || 0), 1);
                const height = Math.max(4, ((day.revenue || 0) / maxRev) * 100);
                const label = day.date ? new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }) : '';
                return (
                  <View key={i} style={styles.barChartCol}>
                    <Text style={styles.barChartValue}>{day.revenue > 0 ? formatCurrency(day.revenue) : ''}</Text>
                    <View style={[styles.barChartBar, { height, backgroundColor: '#10b981' }]} />
                    <Text style={styles.barChartLabel}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Restaurant Rankings */}
        {restaurants.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Restaurant Rankings</Text>
              <Text style={styles.sectionSubtitle}>{restaurants.length} locations</Text>
            </View>
            {[...restaurants]
              .sort((a, b) => (b.revenue || b.todayRevenue || 0) - (a.revenue || a.todayRevenue || 0))
              .slice(0, 5)
              .map((rest, i) => {
                const rev = rest.revenue || rest.todayRevenue || 0;
                const pct = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0;
                return (
                  <View key={rest.id} style={styles.rankRow}>
                    <View style={[styles.rankBadge, i < 3 && { backgroundColor: Colors.primary }]}>
                      <Text style={[styles.rankBadgeText, i < 3 && { color: '#fff' }]}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankName}>{rest.name}</Text>
                      <View style={styles.progressBg}>
                        <View style={[styles.progressFill, { width: `${pct}%` }]} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.rankRevenue}>{formatCurrency(rev)}</Text>
                      <Text style={styles.rankOrders}>{rest.orders || rest.todayOrders || 0} orders</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* Order Types */}
        {analyticsData?.ordersByType?.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Order Types</Text>
            {analyticsData.ordersByType.map((type, i) => {
              const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
              return (
                <View key={i} style={styles.orderTypeRow}>
                  <Text style={styles.orderTypeLabel}>{type.type}</Text>
                  <View style={styles.orderTypeBg}>
                    <View style={[styles.orderTypeFill, { width: `${type.percentage || 0}%`, backgroundColor: colors[i % colors.length] }]} />
                  </View>
                  <Text style={styles.orderTypePct}>{type.count} ({Math.round(type.percentage || 0)}%)</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top Sellers */}
        {analyticsData?.popularItems?.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Top Sellers</Text>
            {analyticsData.popularItems.slice(0, 5).map((item, i) => (
              <View key={i} style={styles.topItemRow}>
                <View style={[styles.topItemRank, i < 3 && { backgroundColor: '#fef3c7' }]}>
                  <Text style={styles.topItemRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.topItemName}>{item.name}</Text>
                  <Text style={styles.topItemSub}>{item.orders} sold</Text>
                </View>
                <Text style={styles.topItemRevenue}>{formatCurrency(item.revenue)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Inventory Alert */}
        {(dashboardData?.totals?.totalLowStockItems || 0) > 0 && (
          <View style={styles.alertBanner}>
            <Ionicons name="warning" size={18} color="#f59e0b" />
            <Text style={styles.alertText}>
              {dashboardData.totals.totalLowStockItems} items low on stock across your restaurants
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ── Staff Tab ──────────────────────────────────────
  const renderStaffFilters = () => (
    <View style={styles.filterSection}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search staff..."
          placeholderTextColor={Colors.textLight}
          value={staffSearch}
          onChangeText={setStaffSearch}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsRow}>
        {ROLE_FILTERS.map(r => (
          <TouchableOpacity key={r} style={[styles.filterPill, staffRole === r && styles.filterPillActive]} onPress={() => setStaffRole(r)}>
            <Text style={[styles.filterPillText, staffRole === r && styles.filterPillTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterDivider} />
        {STATUS_FILTERS.map(s => (
          <TouchableOpacity key={s} style={[styles.filterPill, staffStatus === s && styles.filterPillActive]} onPress={() => setStaffStatus(s)}>
            <Text style={[styles.filterPillText, staffStatus === s && styles.filterPillTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderStaffItem = ({ item }) => (
    <View style={styles.listCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.listCardTitle}>{item.name || 'Staff'}</Text>
        <Text style={styles.listCardSub}>{item.restaurantName || 'Unknown'}</Text>
        {item.phone && <Text style={styles.listCardDetail}>{item.phone}</Text>}
      </View>
      <View style={[styles.roleBadge, { backgroundColor: getRoleBgColor(item.role) }]}>
        <Text style={[styles.roleBadgeText, { color: getRoleTextColor(item.role) }]}>
          {item.role || 'Staff'}
        </Text>
      </View>
      <Switch
        value={item.status === 'active'}
        onValueChange={() => toggleStaffActive(item.id, item.status)}
        trackColor={{ false: '#fee2e2', true: '#dcfce7' }}
        thumbColor={item.status === 'active' ? '#10b981' : '#ef4444'}
        style={{ marginLeft: 10 }}
      />
    </View>
  );

  // ── Menu Tab ──────────────────────────────────────
  const renderMenuFilters = () => (
    <View style={styles.filterSection}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search menu items..."
          placeholderTextColor={Colors.textLight}
          value={menuSearch}
          onChangeText={setMenuSearch}
        />
      </View>
      {menuData.categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsRow}>
          <TouchableOpacity style={[styles.filterPill, !menuCategory && styles.filterPillActive]} onPress={() => setMenuCategory('')}>
            <Text style={[styles.filterPillText, !menuCategory && styles.filterPillTextActive]}>All</Text>
          </TouchableOpacity>
          {menuData.categories.map(c => (
            <TouchableOpacity key={c} style={[styles.filterPill, menuCategory === c && styles.filterPillActive]} onPress={() => setMenuCategory(c)}>
              <Text style={[styles.filterPillText, menuCategory === c && styles.filterPillTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderMenuItem = ({ item }) => (
    <View style={styles.listCard}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.menuItemImage} />
      ) : (
        <View style={[styles.menuItemImage, { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="fast-food-outline" size={20} color={Colors.textLight} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.listCardTitle}>{item.name}</Text>
        <Text style={styles.listCardSub}>{item.restaurantName}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.menuPrice}>{formatCurrency(item.price)}</Text>
        <View style={[styles.statusDot, { backgroundColor: item.isAvailable !== false ? '#10b981' : '#ef4444' }]}>
          <Text style={styles.statusDotText}>{item.isAvailable !== false ? 'Available' : 'Unavailable'}</Text>
        </View>
      </View>
    </View>
  );

  // ── Inventory Tab ──────────────────────────────────
  const renderInventoryFilters = () => (
    <View style={styles.filterSection}>
      {/* Alert badges */}
      {(inventoryData.alerts.outOfStock > 0 || inventoryData.alerts.lowStock > 0) && (
        <View style={styles.alertBadgesRow}>
          {inventoryData.alerts.outOfStock > 0 && (
            <View style={[styles.alertBadgePill, { backgroundColor: '#fef2f2' }]}>
              <View style={[styles.alertDot, { backgroundColor: '#ef4444' }]} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444' }}>{inventoryData.alerts.outOfStock} Out of Stock</Text>
            </View>
          )}
          {inventoryData.alerts.lowStock > 0 && (
            <View style={[styles.alertBadgePill, { backgroundColor: '#fffbeb' }]}>
              <View style={[styles.alertDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#f59e0b' }}>{inventoryData.alerts.lowStock} Low Stock</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.textLight} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search inventory..."
          placeholderTextColor={Colors.textLight}
          value={invSearch}
          onChangeText={setInvSearch}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterPillsRow}>
        {STOCK_FILTERS.map(s => (
          <TouchableOpacity key={s} style={[styles.filterPill, invStockStatus === s && styles.filterPillActive]} onPress={() => setInvStockStatus(s)}>
            <Text style={[styles.filterPillText, invStockStatus === s && styles.filterPillTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
        {inventoryData.categories.length > 0 && (
          <>
            <View style={styles.filterDivider} />
            <TouchableOpacity style={[styles.filterPill, !invCategory && styles.filterPillActive]} onPress={() => setInvCategory('')}>
              <Text style={[styles.filterPillText, !invCategory && styles.filterPillTextActive]}>All Cat.</Text>
            </TouchableOpacity>
            {inventoryData.categories.map(c => (
              <TouchableOpacity key={c} style={[styles.filterPill, invCategory === c && styles.filterPillActive]} onPress={() => setInvCategory(c)}>
                <Text style={[styles.filterPillText, invCategory === c && styles.filterPillTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );

  const renderInventoryItem = ({ item }) => {
    const statusColors = { normal: '#10b981', low: '#f59e0b', out: '#ef4444' };
    const statusLabels = { normal: 'Normal', low: 'Low', out: 'Out' };
    const status = item.stockStatus || 'normal';
    return (
      <View style={styles.listCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.listCardTitle}>{item.name}</Text>
          <Text style={styles.listCardSub}>{item.restaurantName}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.invStock}>{item.currentStock} {item.unit || ''}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColors[status] || '#6b7280' }]}>
            <Text style={styles.statusDotText}>{statusLabels[status] || status}</Text>
          </View>
        </View>
      </View>
    );
  };

  // ── AI Insights Modal ─────────────────────────────
  const renderInsightsModal = () => (
    <Modal visible={showInsightsModal} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
        {/* Header */}
        <View style={styles.insightsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.insightsTitle}>AI Insights</Text>
            <Text style={styles.insightsSubtitle}>{aiRemaining} insights remaining today</Text>
          </View>
          <TouchableOpacity onPress={() => setShowInsightsModal(false)} style={styles.insightsClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          {aiInsights ? (
            <>
              {/* Summary */}
              {aiInsights.summary && (
                <View style={styles.insightSummary}>
                  <Ionicons name="bulb" size={20} color={Colors.primary} />
                  <Text style={styles.insightSummaryText}>{aiInsights.summary}</Text>
                </View>
              )}

              {/* Performance */}
              {aiInsights.performance?.length > 0 && (
                <View style={styles.insightSection}>
                  <Text style={styles.insightSectionTitle}>Performance</Text>
                  {aiInsights.performance.map((p, i) => (
                    <View key={i} style={styles.insightCard}>
                      <Text style={styles.insightCardIcon}>{p.icon || '📊'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightCardTitle}>{p.title}</Text>
                        <Text style={styles.insightCardMsg}>{p.message}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Recommendations */}
              {aiInsights.recommendations?.length > 0 && (
                <View style={styles.insightSection}>
                  <Text style={styles.insightSectionTitle}>Recommendations</Text>
                  {aiInsights.recommendations.map((r, i) => {
                    const pColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
                    return (
                      <View key={i} style={[styles.insightCard, { borderLeftWidth: 3, borderLeftColor: pColors[r.priority] || '#6b7280' }]}>
                        <Text style={styles.insightCardIcon}>{r.icon || '💡'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.insightCardTitle}>{r.title}</Text>
                          <Text style={styles.insightCardMsg}>{r.message}</Text>
                          {r.action && <Text style={styles.insightAction}>{r.action}</Text>}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Alerts */}
              {aiInsights.alerts?.length > 0 && (
                <View style={styles.insightSection}>
                  <Text style={styles.insightSectionTitle}>Alerts</Text>
                  {aiInsights.alerts.map((a, i) => (
                    <View key={i} style={[styles.insightCard, {
                      backgroundColor: a.severity === 'critical' ? '#fef2f2' : '#fffbeb',
                    }]}>
                      <Text style={styles.insightCardIcon}>{a.icon || '⚠️'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightCardTitle}>{a.title}</Text>
                        <Text style={styles.insightCardMsg}>{a.message}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Trends */}
              {aiInsights.trends?.length > 0 && (
                <View style={styles.insightSection}>
                  <Text style={styles.insightSectionTitle}>Trends</Text>
                  {aiInsights.trends.map((t, i) => (
                    <View key={i} style={styles.insightCard}>
                      <Text style={styles.insightCardIcon}>{t.icon || '📈'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightCardTitle}>{t.title}</Text>
                        <Text style={styles.insightCardMsg}>{t.message}</Text>
                      </View>
                      <View style={[styles.trendBadge, {
                        backgroundColor: t.direction === 'up' ? '#dcfce7' : t.direction === 'down' ? '#fef2f2' : '#f3f4f6',
                      }]}>
                        <Ionicons
                          name={t.direction === 'up' ? 'trending-up' : t.direction === 'down' ? 'trending-down' : 'remove'}
                          size={14}
                          color={t.direction === 'up' ? '#10b981' : t.direction === 'down' ? '#ef4444' : '#6b7280'}
                        />
                        {t.value && <Text style={styles.trendValue}>{t.value}</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Pricing Insights */}
              {aiInsights.pricingInsights?.length > 0 && (
                <View style={styles.insightSection}>
                  <Text style={styles.insightSectionTitle}>Pricing Insights</Text>
                  {aiInsights.pricingInsights.map((p, i) => (
                    <View key={i} style={styles.insightCard}>
                      <Text style={styles.insightCardIcon}>{p.icon || '💰'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.insightCardTitle}>{p.title}</Text>
                        <Text style={styles.insightCardMsg}>{p.message}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ── Restaurant Filter Modal ───────────────────────
  const renderRestaurantFilterModal = () => {
    const restaurants = dashboardData?.restaurants || [];
    return (
      <Modal visible={showRestaurantFilter} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Select Restaurants</Text>
              <TouchableOpacity onPress={() => setShowRestaurantFilter(false)}>
                <Ionicons name="close" size={22} color={Colors.textDark} />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={styles.filterModalBtn} onPress={() => setSelectedRestaurants([])}>
                <Text style={styles.filterModalBtnText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterModalBtn} onPress={() => setSelectedRestaurants(restaurants.map(r => r.id))}>
                <Text style={styles.filterModalBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={restaurants}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const selected = selectedRestaurants.length === 0 || selectedRestaurants.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.filterRestRow, selected && styles.filterRestRowActive]}
                    onPress={() => {
                      if (selectedRestaurants.length === 0) {
                        // First selection — select only this one
                        setSelectedRestaurants([item.id]);
                      } else if (selectedRestaurants.includes(item.id)) {
                        const newList = selectedRestaurants.filter(id => id !== item.id);
                        setSelectedRestaurants(newList.length === 0 ? [] : newList);
                      } else {
                        setSelectedRestaurants([...selectedRestaurants, item.id]);
                      }
                    }}
                  >
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? Colors.primary : Colors.textLight} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.filterRestName}>{item.name}</Text>
                      <Text style={styles.filterRestSub}>{item.city || ''} {item.orders || 0} orders</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.filterApplyBtn}
              onPress={() => setShowRestaurantFilter(false)}
            >
              <Text style={styles.filterApplyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ── Helpers for colors ───────────────────────────
  const getRoleBgColor = (role) => {
    const map = { manager: '#ede9fe', waiter: '#e0f2fe', cashier: '#fef3c7', chef: '#fce7f3' };
    return map[role?.toLowerCase()] || '#f3f4f6';
  };
  const getRoleTextColor = (role) => {
    const map = { manager: '#7c3aed', waiter: '#0284c7', cashier: '#d97706', chef: '#db2777' };
    return map[role?.toLowerCase()] || '#374151';
  };

  // ── Main Render ──────────────────────────────────
  const listHeaderComponent = (
    <>
      {renderHeader()}
      {renderTabPills()}
    </>
  );

  const renderEmptyState = (message) => (
    <View style={styles.emptyState}>
      <Ionicons name="file-tray-outline" size={48} color={Colors.textLight} />
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  );

  if (activeTab === 'overview') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {renderHeader()}
          {renderTabPills()}
          {renderOverviewTab()}
        </ScrollView>
        {renderInsightsModal()}
        {renderRestaurantFilterModal()}
      </SafeAreaView>
    );
  }

  if (activeTab === 'staff') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={staffData.staff}
          keyExtractor={(item, i) => item.id || `${i}`}
          ListHeaderComponent={<>{listHeaderComponent}{renderStaffFilters()}</>}
          renderItem={renderStaffItem}
          ListEmptyComponent={!loadingStaff ? renderEmptyState('No staff found') : null}
          ListFooterComponent={loadingStaff ? <ActivityIndicator style={{ padding: 20 }} color={Colors.primary} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          onEndReached={() => {
            const { page, totalPages } = staffData.pagination;
            if (page < totalPages && !loadingStaff) {
              const nextPage = page + 1;
              setStaffPage(nextPage);
              loadStaff(nextPage, true);
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
        {renderInsightsModal()}
        {renderRestaurantFilterModal()}
      </SafeAreaView>
    );
  }

  if (activeTab === 'menu') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <FlatList
          data={menuData.menuItems}
          keyExtractor={(item, i) => item.id || `${i}`}
          ListHeaderComponent={<>{listHeaderComponent}{renderMenuFilters()}</>}
          renderItem={renderMenuItem}
          ListEmptyComponent={!loadingMenu ? renderEmptyState('No menu items found') : null}
          ListFooterComponent={loadingMenu ? <ActivityIndicator style={{ padding: 20 }} color={Colors.primary} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          onEndReached={() => {
            const { page, totalPages } = menuData.pagination;
            if (page < totalPages && !loadingMenu) {
              const nextPage = page + 1;
              setMenuPage(nextPage);
              loadMenuItems(nextPage, true);
            }
          }}
          onEndReachedThreshold={0.5}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
        {renderInsightsModal()}
        {renderRestaurantFilterModal()}
      </SafeAreaView>
    );
  }

  // Inventory tab
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={inventoryData.inventory}
        keyExtractor={(item, i) => item.id || `${i}`}
        ListHeaderComponent={<>{listHeaderComponent}{renderInventoryFilters()}</>}
        renderItem={renderInventoryItem}
        ListEmptyComponent={!loadingInv ? renderEmptyState('No inventory items found') : null}
        ListFooterComponent={loadingInv ? <ActivityIndicator style={{ padding: 20 }} color={Colors.primary} /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        onEndReached={() => {
          const { page, totalPages } = inventoryData.pagination;
          if (page < totalPages && !loadingInv) {
            const nextPage = page + 1;
            setInvPage(nextPage);
            loadInventory(nextPage, true);
          }
        }}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
      {renderInsightsModal()}
      {renderRestaurantFilterModal()}
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { backgroundColor: '#fff', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  headerSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  aiBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  aiBadge: {
    position: 'absolute', top: -5, right: -5,
    backgroundColor: '#fbbf24', borderRadius: 8, width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  aiBadgeText: { fontSize: 9, fontWeight: '800', color: '#1f2937' },
  refreshBtn: { padding: 6, marginLeft: 8 },

  // Date pills
  datePillsRow: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8 },
  datePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f3f4f6', marginRight: 8,
  },
  datePillActive: { backgroundColor: Colors.primary },
  datePillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  datePillTextActive: { color: '#fff' },

  // Tab pills
  tabRow: { marginTop: 4, marginBottom: 8 },
  tabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', marginRight: 8,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  tabPillActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  tabPillText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabPillTextActive: { color: '#fff' },

  // Overview
  tabContent: { padding: 16 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: {
    width: (SCREEN_WIDTH - 42) / 2, borderRadius: 14, padding: 14,
  },
  metricIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  metricLabel: { fontSize: 12, fontWeight: '500', color: '#6b7280', marginTop: 2 },
  metricSubLabel: { fontSize: 10, color: '#9ca3af', marginTop: 1 },

  // Section card
  sectionCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  sectionSubtitle: { fontSize: 12, color: '#9ca3af' },
  sectionBadge: {
    fontSize: 13, fontWeight: '700', color: '#10b981',
    backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },

  // Bar chart
  barChartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, paddingTop: 15 },
  barChartCol: { alignItems: 'center', flex: 1 },
  barChartValue: { fontSize: 8, color: '#6b7280', marginBottom: 2 },
  barChartBar: { width: 22, borderRadius: 4, minHeight: 4 },
  barChartLabel: { fontSize: 10, color: '#9ca3af', marginTop: 4 },

  // Rankings
  rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rankBadge: {
    width: 28, height: 28, borderRadius: 8, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  rankBadgeText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  rankName: { fontSize: 14, fontWeight: '600', color: '#1f2937', marginBottom: 4 },
  progressBg: { height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  rankRevenue: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  rankOrders: { fontSize: 11, color: '#9ca3af' },

  // Order types
  orderTypeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  orderTypeLabel: { width: 80, fontSize: 12, fontWeight: '500', color: '#374151' },
  orderTypeBg: { flex: 1, height: 10, backgroundColor: '#f3f4f6', borderRadius: 5, overflow: 'hidden', marginHorizontal: 8 },
  orderTypeFill: { height: 10, borderRadius: 5 },
  orderTypePct: { width: 70, fontSize: 11, color: '#6b7280', textAlign: 'right' },

  // Top items
  topItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  topItemRank: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  topItemRankText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  topItemName: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  topItemSub: { fontSize: 11, color: '#9ca3af' },
  topItemRevenue: { fontSize: 13, fontWeight: '700', color: '#10b981' },

  // Alert banner
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginTop: 8,
  },
  alertText: { fontSize: 13, color: '#92400e', flex: 1 },

  // Filters
  filterSection: { paddingHorizontal: 16, paddingBottom: 8, backgroundColor: '#fff' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2937' },
  filterPillsRow: { marginBottom: 8 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', marginRight: 6,
  },
  filterPillActive: { backgroundColor: '#1f2937' },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterPillTextActive: { color: '#fff' },
  filterDivider: { width: 1, height: 20, backgroundColor: '#e5e7eb', marginHorizontal: 4, alignSelf: 'center' },

  // List cards
  listCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 16, marginVertical: 4,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  listCardTitle: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  listCardSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  listCardDetail: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // Role badge
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  roleBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  // Menu item
  menuItemImage: { width: 44, height: 44, borderRadius: 8 },
  menuPrice: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  statusDot: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  statusDotText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Inventory
  invStock: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  alertBadgesRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  alertBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  alertDot: { width: 8, height: 8, borderRadius: 4 },

  // AI Insights Modal
  insightsHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primary, padding: 16,
  },
  insightsTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  insightsSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  insightsClose: { padding: 4 },
  insightSummary: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, marginBottom: 16,
  },
  insightSummaryText: { flex: 1, fontSize: 14, color: '#1f2937', lineHeight: 20 },
  insightSection: { marginBottom: 20 },
  insightSectionTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  insightCardIcon: { fontSize: 18 },
  insightCardTitle: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  insightCardMsg: { fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 17 },
  insightAction: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 4 },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  trendValue: { fontSize: 11, fontWeight: '700', color: '#374151' },

  // Restaurant filter modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterModal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  filterModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  filterModalTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  filterModalBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f3f4f6' },
  filterModalBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  filterRestRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  filterRestRowActive: { backgroundColor: '#f0fdf4' },
  filterRestName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  filterRestSub: { fontSize: 12, color: '#9ca3af' },
  filterApplyBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 12,
  },
  filterApplyText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyStateText: { fontSize: 14, color: '#9ca3af', marginTop: 10 },
});
