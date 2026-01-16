import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
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
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (params.orderId) {
      // Load specific order
      loadOrderById(params.orderId);
    }
  }, [params.orderId]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

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
      const response = await apiClient.getOrders(rid, { limit: 50 });
      const ordersList = response.orders || [];
      // Sort by created date (newest first)
      ordersList.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return dateB - dateA;
      });
      setOrders(ordersList);
    } catch (error) {
      console.error('Error loading orders:', error);
      throw error;
    }
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
          setSelectedOrder(order);
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
        return Colors.warning;
      case 'ready':
        return Colors.accentGreen;
      case 'completed':
        return Colors.accentGreen;
      case 'cancelled':
        return Colors.error;
      case 'pending':
      default:
        return Colors.textMedium;
    }
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderOrder = ({ item }) => {
    const statusColor = getStatusColor(item.status);
    const itemCount = item.items?.length || 0;

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => {
          // Navigate to order details or edit
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
        <View style={styles.orderHeader}>
          <View style={styles.orderInfo}>
            <Text style={styles.orderNumber}>{item.orderNumber || item.dailyOrderId || 'N/A'}</Text>
            {item.tableNumber && (
              <Text style={styles.tableNumber}>Table: {item.tableNumber}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status || 'pending'}
            </Text>
          </View>
        </View>

        <View style={styles.orderDetails}>
          <View style={styles.orderDetailRow}>
            <Ionicons name="receipt-outline" size={16} color={Colors.textMedium} />
            <Text style={styles.orderDetailText}>{itemCount} item(s)</Text>
          </View>
          <View style={styles.orderDetailRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textMedium} />
            <Text style={styles.orderDetailText}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={styles.orderDetailRow}>
            <Ionicons name="cash-outline" size={16} color={Colors.textMedium} />
            <Text style={styles.orderDetailText}>₹{item.totalAmount?.toFixed(2) || '0.00'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing}>
          <Ionicons
            name="refresh"
            size={24}
            color={Colors.primary}
            style={refreshing && { opacity: 0.5 }}
          />
        </TouchableOpacity>
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
            <Text style={styles.emptySubtext}>Orders will appear here once placed</Text>
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
    backgroundColor: Colors.backgroundCream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
  },
  list: {
    padding: Spacing.md,
  },
  orderCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  orderInfo: {
    flex: 1,
  },
  orderNumber: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.textDark,
    marginBottom: 4,
  },
  tableNumber: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.small,
  },
  statusText: {
    fontSize: Typography.small.fontSize,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  orderDetails: {
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  orderDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  orderDetailText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
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
  },
  emptyText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
    textAlign: 'center',
  },
});
