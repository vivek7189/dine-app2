import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, AppState } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { startDeliveryTracking, stopDeliveryTracking } from '../../services/locationTracking';
import DeliveryCard from '../../components/delivery/DeliveryCard';
import DeliveryActiveView from '../../components/delivery/DeliveryActiveView';

export default function DeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [userData, setUserData] = useState(null);

  const fetchDeliveries = useCallback(async () => {
    try {
      const user = await apiClient.getUser();
      setUserData(user);
      const restaurantId = user?.restaurantId || user?.restaurant?.id;
      const staffId = user?.staffId || user?.userId || user?.id;
      if (!restaurantId || !staffId) return;

      const res = await apiClient.getMyDeliveries(restaurantId, staffId);
      if (res?.success) {
        setDeliveries(res.data || []);
      }
    } catch (err) {
      console.error('Fetch deliveries error:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Poll every 60s for new assignments, only when app is active
  const appActive = useRef(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { appActive.current = s === 'active'; });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    fetchDeliveries();
    const interval = setInterval(() => {
      if (appActive.current) fetchDeliveries();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchDeliveries]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDeliveries();
  };

  const handleAccept = async (orderId) => {
    setActionLoading(true);
    try {
      const restaurantId = userData?.restaurantId || userData?.restaurant?.id;
      const res = await apiClient.respondToDelivery(restaurantId, orderId, 'accept');
      if (res?.success) {
        // Start location tracking
        const staffId = userData?.staffId || userData?.userId || userData?.id;
        await startDeliveryTracking(restaurantId, staffId, orderId);
        fetchDeliveries();
      }
    } catch (err) {
      console.error('Accept delivery error:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (orderId) => {
    setActionLoading(true);
    try {
      const restaurantId = userData?.restaurantId || userData?.restaurant?.id;
      await apiClient.respondToDelivery(restaurantId, orderId, 'reject');
      fetchDeliveries();
    } catch (err) {
      console.error('Reject delivery error:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePickedUp = async (orderId) => {
    setActionLoading(true);
    try {
      const restaurantId = userData?.restaurantId || userData?.restaurant?.id;
      await apiClient.markDeliveryPickedUp(restaurantId, orderId);
      fetchDeliveries();
    } catch (err) {
      console.error('Pick up error:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelivered = async (orderId, paymentInfo) => {
    setActionLoading(true);
    try {
      const restaurantId = userData?.restaurantId || userData?.restaurant?.id;
      await apiClient.markDeliveryDelivered(restaurantId, orderId, paymentInfo);
      // Stop location tracking
      await stopDeliveryTracking();
      fetchDeliveries();
    } catch (err) {
      console.error('Delivered error:', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Split into pending (assigned) and active (accepted/picked_up)
  const pendingDeliveries = deliveries.filter(d => d.deliveryStatus === 'assigned');
  const activeDeliveries = deliveries.filter(d => ['accepted', 'picked_up', 'on_the_way'].includes(d.deliveryStatus));

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  // If there's an active delivery, show the active view full-screen
  if (activeDeliveries.length > 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <Ionicons name="bicycle" size={24} color="#10b981" />
          <Text style={styles.headerTitle}>Active Delivery</Text>
        </View>
        <DeliveryActiveView
          delivery={activeDeliveries[0]}
          onPickedUp={handlePickedUp}
          onDelivered={handleDelivered}
          loading={actionLoading}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Ionicons name="bicycle" size={24} color="#10b981" />
        <Text style={styles.headerTitle}>Deliveries</Text>
        {pendingDeliveries.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{pendingDeliveries.length}</Text>
          </View>
        )}
      </View>

      {deliveries.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bicycle-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No Deliveries</Text>
          <Text style={styles.emptySubtitle}>
            New delivery assignments will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={pendingDeliveries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DeliveryCard
              delivery={item}
              onAccept={handleAccept}
              onReject={handleReject}
              showActions={true}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#10b981']} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  list: { paddingHorizontal: 16 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
});
