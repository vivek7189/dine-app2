import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

export default function OrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  
  // Filter states
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedOrderType, setSelectedOrderType] = useState('all');
  const [myOrdersOnly, setMyOrdersOnly] = useState(false);
  const [todayOrdersOnly, setTodayOrdersOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
  }, [selectedStatus, selectedOrderType, myOrdersOnly, todayOrdersOnly, searchTerm, restaurantId]);

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
      await loadOrders(rid);
    } catch (error) {
      console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (rid) => {
    try {
      const filters = {
        limit: 100,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
        orderType: selectedOrderType !== 'all' ? selectedOrderType : undefined,
        waiterId: myOrdersOnly && user?.id ? user.id : undefined,
        todayOnly: todayOrdersOnly ? 'true' : undefined,
        search: searchTerm.trim() || undefined,
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const response = await apiClient.getOrders(rid, filters);
      const ordersList = response.orders || [];
      
      // Sort by created date (newest first)
      ordersList.sort((a, b) => {
        const dateA = getOrderDate(a.createdAt);
        const dateB = getOrderDate(b.createdAt);
        return dateB - dateA;
      });
      
      setOrders(ordersList);
    } catch (error) {
      console.error('Error loading orders:', error);
      throw error;
    }
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
      case 'pending':
      default:
        return '#6b7280'; // gray
    }
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
    const totalAmount = item.totalAmount || item.finalAmount || 0;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => {
          router.push({
            pathname: '/(tabs)/menu',
            params: {
              orderId: item.id,
              tableNumber: item.tableNumber,
              editMode: 'true',
            },
          });
        }}
        activeOpacity={0.7}
      >
        {/* Order Header - short ID only (like web app) */}
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
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(item.status || 'pending').toUpperCase()}
            </Text>
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

        {/* Card footer: date + full order number in small text (like web app) */}
        <View style={styles.cardFooter}>
          <View style={styles.dateContainer}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMedium} />
            <Text style={styles.dateText}>{date}</Text>
          </View>
          <Text style={styles.orderIdFull} numberOfLines={1} ellipsizeMode="middle">
            {item.orderNumber || item.id || ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'dine-in', label: 'Dine In' },
    { value: 'takeaway', label: 'Takeaway' },
    { value: 'delivery', label: 'Delivery' },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Filters */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Orders</Text>
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshButton}>
            <Ionicons
              name="refresh"
              size={22}
              color={Colors.primary}
              style={refreshing && { opacity: 0.5 }}
            />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.textMedium} style={styles.searchIcon} />
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

        {/* Filter Pills */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {/* Status Filter */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
          >
            {statusOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterPill,
                  selectedStatus === option.value && styles.filterPillActive,
                  selectedStatus === option.value && { backgroundColor: Colors.primary }
                ]}
                onPress={() => setSelectedStatus(option.value)}
              >
                <Text style={[
                  styles.filterPillText,
                  selectedStatus === option.value && styles.filterPillTextActive
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Type Filter */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
          >
            {typeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.filterPill,
                  selectedOrderType === option.value && styles.filterPillActive,
                  selectedOrderType === option.value && { backgroundColor: '#3b82f6' }
                ]}
                onPress={() => setSelectedOrderType(option.value)}
              >
                <Text style={[
                  styles.filterPillText,
                  selectedOrderType === option.value && styles.filterPillTextActive
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Toggle Filters */}
          <View style={styles.toggleFiltersRow}>
            <TouchableOpacity
              style={[
                styles.toggleFilter,
                myOrdersOnly && styles.toggleFilterActive,
                myOrdersOnly && { backgroundColor: '#8b5cf6' }
              ]}
              onPress={() => setMyOrdersOnly(!myOrdersOnly)}
            >
              <Ionicons 
                name={myOrdersOnly ? "person" : "person-outline"} 
                size={14} 
                color={myOrdersOnly ? '#fff' : Colors.textMedium} 
              />
              <Text style={[
                styles.toggleFilterText,
                myOrdersOnly && styles.toggleFilterTextActive
              ]}>
                My Orders
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleFilter,
                todayOrdersOnly && styles.toggleFilterActive,
                todayOrdersOnly && { backgroundColor: '#10b981' }
              ]}
              onPress={() => setTodayOrdersOnly(!todayOrdersOnly)}
            >
              <Ionicons 
                name={todayOrdersOnly ? "today" : "today-outline"} 
                size={14} 
                color={todayOrdersOnly ? '#fff' : Colors.textMedium} 
              />
              <Text style={[
                styles.toggleFilterText,
                todayOrdersOnly && styles.toggleFilterTextActive
              ]}>
                Today
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

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
            <Ionicons name="receipt-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No orders found</Text>
            <Text style={styles.emptySubtext}>
              {searchTerm || selectedStatus !== 'all' || selectedOrderType !== 'all' || myOrdersOnly || todayOrdersOnly
                ? 'Try adjusting your filters'
                : 'Orders will appear here once placed'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textDark,
  },
  refreshButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.textDark,
  },
  clearSearchButton: {
    padding: 4,
  },
  filtersContainer: {
    maxHeight: 120,
  },
  filtersContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: Spacing.xs,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  filterPillTextActive: {
    color: '#fff',
  },
  toggleFiltersRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  toggleFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: Spacing.xs,
  },
  toggleFilterActive: {
    backgroundColor: Colors.primary,
  },
  toggleFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  toggleFilterTextActive: {
    color: '#fff',
  },
  list: {
    padding: Spacing.md,
  },
  orderCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f3f4f6',
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
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    gap: 4,
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
  orderIdFull: {
    fontSize: 10,
    color: Colors.textLight,
    fontFamily: 'monospace',
    maxWidth: '100%',
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
});
