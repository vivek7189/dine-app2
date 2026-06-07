import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import OrderDetailsModal from '../../components/OrderDetailsModal';
import { useOffline } from '../../hooks/useOffline';

export default function BarBillingScreen() {
  const router = useRouter();
  const { effectivelyOffline } = useOffline();
  const { gridColumns } = useResponsive();
  const cols = gridColumns();
  const [tabs, setTabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);

  // OrderDetailsModal state
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);
  const [orderModalMode, setOrderModalMode] = useState('view');

  const isInitialLoadRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const restaurantIdRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Refresh tabs when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        return;
      }
      const rid = restaurantIdRef.current;
      if (rid && !isRefreshingRef.current) {
        setTimeout(() => {
          refreshInBackground(rid);
        }, 300);
      }
    }, [refreshInBackground])
  );

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
        Alert.alert('Error', 'No restaurant assigned.');
        return;
      }
      setRestaurantId(rid);
      restaurantIdRef.current = rid;
      await fetchOpenTabs(rid);
    } catch (error) {
      console.error('Bar POS init error:', error);
      Alert.alert('Error', 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOpenTabs = async (rid) => {
    try {
      const res = await apiClient.getOrders(rid, { status: 'saved', limit: 50 });
      const openTabs = (res.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setTabs(openTabs);
    } catch (error) {
      console.error('Fetch tabs error:', error);
    }
  };

  const refreshInBackground = useCallback(async (rid) => {
    if (isRefreshingRef.current) return;
    try {
      isRefreshingRef.current = true;
      await fetchOpenTabs(rid || restaurantIdRef.current);
    } catch (error) {
      console.error('Background refresh error:', error);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchOpenTabs(restaurantIdRef.current);
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // ==================== NAVIGATION ====================

  // New Tab: Navigate to menu instantly, no API wait
  const handleNewTab = () => {
    const nextTabNum = tabs.length + 1;
    router.push({
      pathname: '/(tabs)/menu',
      params: {
        tableNumber: `Tab ${nextTabNum}`,
        barTabMode: 'true',
      },
    });
  };

  // Tap existing tab card — go to orders
  const handleTabPress = (tab) => {
    if (tab.items?.length > 0) {
      router.push({
        pathname: '/(tabs)/orders',
        params: { orderId: tab.id },
      });
    } else {
      // Empty tab — navigate to menu to add items
      handleAddToTab(tab);
    }
  };

  // View order details
  const handleViewOrder = (tab) => {
    setSelectedOrderId(tab.id);
    setSelectedTab(tab);
    setOrderModalMode('view');
    setShowOrderModal(true);
  };

  // Add items to existing tab — open OrderDetailsModal in 'add' mode
  const handleAddToTab = (tab) => {
    if (tab.items?.length > 0) {
      setSelectedOrderId(tab.id);
      setSelectedTab(tab);
      setOrderModalMode('add');
      setShowOrderModal(true);
    } else {
      // No items yet — go straight to menu
      router.push({
        pathname: '/(tabs)/menu',
        params: {
          tableNumber: tab.customerInfo?.name || `Tab`,
          orderId: tab.id,
          existingOrder: 'true',
          cartItems: JSON.stringify([]),
          barTabMode: 'true',
        },
      });
    }
  };

  // Called from OrderDetailsModal "Add Items" button
  const handleAddItemsToOrder = (order, cartItems) => {
    router.push({
      pathname: '/(tabs)/menu',
      params: {
        tableNumber: order.customerInfo?.name || order.tableNumber || 'Tab',
        orderId: order.id,
        existingOrder: 'true',
        cartItems: JSON.stringify(cartItems),
        barTabMode: 'true',
      },
    });
  };

  // Long press actions
  const showTabActionSheet = (tab) => {
    const options = ['Void Tab', 'Cancel'];
    const destructiveButtonIndex = 0;
    const cancelButtonIndex = 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex, destructiveButtonIndex },
        (index) => {
          if (index === 0) voidTab(tab);
        }
      );
    } else {
      Alert.alert('Tab Actions', null, [
        { text: 'Void Tab', style: 'destructive', onPress: () => voidTab(tab) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const voidTab = (tab) => {
    Alert.alert('Void Tab', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Void',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.cancelKotOrder(tab.id, 'Voided from bar billing');
            setTabs(prev => prev.filter(t => t.id !== tab.id));
          } catch (e) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  // ==================== HELPERS ====================
  const getTabDisplayName = (tab) => {
    return tab.customerInfo?.name || tab.tableNumber || (tab.tabNumber ? `Tab #${tab.tabNumber}` : 'Tab');
  };

  const getTimeElapsed = (createdAt) => {
    if (!createdAt) return '';
    try {
      const now = new Date();
      let created;
      if (createdAt._seconds) {
        created = new Date(createdAt._seconds * 1000);
      } else if (typeof createdAt === 'string') {
        created = new Date(createdAt);
      } else {
        created = new Date(createdAt);
      }
      if (isNaN(created.getTime())) return '';
      const diffMs = now - created;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      if (diffHrs < 24) {
        return remainingMins > 0 ? `${diffHrs}h ${remainingMins}m ago` : `${diffHrs}h ago`;
      }
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ago`;
    } catch (e) {
      return '';
    }
  };

  const getTabStats = () => {
    const totalItems = tabs.reduce((s, t) => s + (t.items || []).reduce((a, i) => a + i.quantity, 0), 0);
    const totalRunning = tabs.reduce((s, t) => s + (t.finalAmount || t.totalAmount || 0), 0);
    return { openTabs: tabs.length, totalItems, totalRunning };
  };

  const getTabColor = (tab) => {
    const itemCount = (tab.items || []).reduce((s, i) => s + i.quantity, 0);
    if (itemCount === 0) return { bg: '#f0f9ff', border: '#bae6fd', dot: '#38bdf8' };
    const total = tab.finalAmount || tab.totalAmount || 0;
    if (total > 2000) return { bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b' };
    return { bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' };
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = getTabStats();

  const renderTabCard = ({ item: tab }) => {
    const itemCount = (tab.items || []).reduce((a, i) => a + i.quantity, 0);
    const total = tab.finalAmount || tab.totalAmount || 0;
    const hasItems = itemCount > 0;
    const c = getTabColor(tab);
    const elapsed = getTimeElapsed(tab.createdAt);
    const isOld = elapsed.includes('d');

    return (
      <TouchableOpacity
        style={[styles.tabCard, { backgroundColor: c.bg, borderColor: c.border }]}
        onPress={() => handleTabPress(tab)}
        onLongPress={() => showTabActionSheet(tab)}
        activeOpacity={0.8}
      >
        {/* Gradient Overlay */}
        <View style={styles.cardGradient}>
          {/* Status Indicator */}
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: c.dot }]} />
          </View>

          {/* Watermark Icon */}
          <View style={styles.watermarkIcon}>
            <Ionicons name="beer" size={60} color={c.dot} style={{ opacity: 0.06 }} />
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {/* Tab Name + Elapsed */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={styles.tabName} numberOfLines={1}>{getTabDisplayName(tab)}</Text>
              {elapsed ? (
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: isOld ? '#dc2626' : '#92400e',
                }}>
                  {elapsed}
                </Text>
              ) : null}
            </View>

            {/* Status Badge */}
            {hasItems ? (
              <View style={styles.statusBadgeActive}>
                <Text style={styles.statusBadgeText}>OPEN</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeEmpty}>
                <Text style={styles.statusBadgeText}>EMPTY</Text>
              </View>
            )}

            {/* Items count */}
            <View style={styles.seatsRow}>
              <Ionicons name="fast-food-outline" size={12} color={Colors.textMedium} />
              <Text style={styles.seatsText}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
              {total > 0 && (
                <Text style={styles.tabTotal}>₹{total.toFixed(0)}</Text>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.tabActions}>
              {hasItems ? (
                <View style={styles.occupiedActions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleViewOrder(tab);
                    }}
                  >
                    <Ionicons name="eye-outline" size={11} color={Colors.textDark} />
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddToTab(tab);
                    }}
                  >
                    <Ionicons name="add-circle" size={11} color="#5b7ff5" />
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="fast-food" size={12} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Add Items</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="beer" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Bar POS</Text>
          {tabs.length > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{tabs.length}</Text>
            </View>
          )}
          {effectivelyOffline && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 4 }} />
              <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '600' }}>Offline</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.newTabBtn} onPress={handleNewTab}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newTabBtnText}>New Tab</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      {tabs.length > 0 && (
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Ionicons name="receipt-outline" size={15} color={Colors.primary} />
            <Text style={styles.statValue}>{stats.openTabs}</Text>
            <Text style={styles.statLabel}>Open</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="fast-food-outline" size={15} color="#f59e0b" />
            <Text style={styles.statValue}>{stats.totalItems}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Ionicons name="cash-outline" size={15} color="#10b981" />
            <Text style={styles.statValue}>₹{stats.totalRunning.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Running</Text>
          </View>
        </View>
      )}

      {/* Tabs Grid */}
      <FlatList
        data={tabs}
        renderItem={renderTabCard}
        keyExtractor={(item) => item.id}
        key={`bar-grid-${cols}`}
        numColumns={cols}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="beer-outline" size={72} color="#ddd" />
            <Text style={styles.emptyTitle}>No open tabs</Text>
            <Text style={styles.emptySubtitle}>Tap "New Tab" to start serving</Text>
            <TouchableOpacity style={styles.emptyCTA} onPress={handleNewTab}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.emptyCTAText}>Open First Tab</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Order Details Modal */}
      <OrderDetailsModal
        visible={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setSelectedOrderId(null);
          setSelectedTab(null);
        }}
        orderId={selectedOrderId}
        tableNumber={selectedTab?.customerInfo?.name || selectedTab?.tableNumber}
        restaurantId={restaurantIdRef.current}
        onAddItems={handleAddItemsToOrder}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textDark,
  },
  headerBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  newTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newTabBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Stats Bar
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textLight,
  },
  statDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#e5e5e5',
  },

  // Grid
  grid: {
    padding: 8,
    paddingBottom: 90,
  },
  gridRow: {
    gap: 8,
  },

  // Tab Card (matching tables card pattern)
  tabCard: {
    flex: 1,
    margin: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 155,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    padding: 12,
  },
  statusIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  watermarkIcon: {
    position: 'absolute',
    bottom: -4,
    right: -4,
  },
  tabContent: {
    flex: 1,
    gap: 4,
  },
  tabName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    flex: 1,
  },
  tabTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.textDark,
    marginLeft: 'auto',
  },

  // Status Badges
  statusBadgeActive: {
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeEmpty: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#374151',
    letterSpacing: 0.5,
  },

  // Seats Row (reused for item count)
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  seatsText: {
    fontSize: 11,
    color: Colors.textMedium,
    fontWeight: '500',
  },

  // Action Buttons (matching tables pattern exactly)
  tabActions: {
    marginTop: 'auto',
    paddingTop: 8,
  },
  occupiedActions: {
    flexDirection: 'row',
    gap: 6,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b7ff5',
  },
  takeOrderButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  takeOrderButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // Empty State
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 12,
  },
  emptyCTAText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
