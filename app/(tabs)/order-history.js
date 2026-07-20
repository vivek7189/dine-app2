import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/api';
import { Colors, Spacing } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { formatCurrency } from '../../utils/formatCurrency';

const STATUS_COLORS = {
  completed: '#22c55e',
  served: '#3b82f6',
  cancelled: '#ef4444',
  refunded: '#f59e0b',
};

export default function OrderHistoryScreen() {
  const { fs, r, isTablet } = useResponsive();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [restoringOrder, setRestoringOrder] = useState(false);

  // Date filter
  const [dateMode, setDateMode] = useState('today');
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Stats — use paidAmount for due/partial orders so unpaid dues don't inflate revenue
  const stats = useMemo(() => {
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'served');
    const revenue = completed.reduce((sum, o) => {
      if (o.paymentStatus === 'due') return sum;
      if ((o.paymentStatus === 'partial' || o.outstandingAmount > 0) && o.paidAmount != null) return sum + (Number(o.paidAmount) || 0);
      return sum + (o.finalAmount || o.totalAmount || 0);
    }, 0);
    return { count: completed.length, total: orders.length, revenue };
  }, [orders]);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (restaurantId) loadOrders();
  }, [restaurantId, dateMode, customStartDate, customEndDate]);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) loadOrders();
    }, [restaurantId])
  );

  const loadUser = async () => {
    try {
      const userData = await apiClient.getUser();
      const rid = userData?.restaurantId || userData?.restaurant?.id;
      if (rid) setRestaurantId(rid);
      if (userData?.role) setUserRole(userData.role);
    } catch (e) {
      console.error('Failed to load user:', e);
    }
  };

  const getDateRange = useCallback(() => {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    switch (dateMode) {
      case 'today': return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
      case 'yesterday': {
        const y = new Date(todayStart); y.setDate(y.getDate() - 1);
        const ye = new Date(y); ye.setHours(23, 59, 59, 999);
        return { startDate: y.toISOString(), endDate: ye.toISOString() };
      }
      case 'week': {
        const w = new Date(todayStart); w.setDate(w.getDate() - 7);
        return { startDate: w.toISOString(), endDate: todayEnd.toISOString() };
      }
      case 'month': {
        const m = new Date(todayStart); m.setDate(m.getDate() - 30);
        return { startDate: m.toISOString(), endDate: todayEnd.toISOString() };
      }
      case 'custom': {
        const cs = new Date(customStartDate); cs.setHours(0, 0, 0, 0);
        const ce = new Date(customEndDate); ce.setHours(23, 59, 59, 999);
        return { startDate: cs.toISOString(), endDate: ce.toISOString() };
      }
      default: return {};
    }
  }, [dateMode, customStartDate, customEndDate]);

  const loadOrders = async () => {
    if (!restaurantId) return;
    try {
      if (!refreshing) setLoading(true);
      const dateRange = getDateRange();
      const response = await apiClient.getOrders(restaurantId, {
        ...dateRange,
        limit: 200,
        sort: 'newest',
      }, {
        onRefreshed: (freshData) => {
          const allFresh = freshData?.orders || [];
          const freshHistory = allFresh.filter(o =>
            ['completed', 'served', 'cancelled', 'refunded'].includes(o.status)
          );
          setOrders(freshHistory);
        },
      });
      const allOrders = response?.orders || [];
      // Show completed, served, cancelled, refunded
      const historyOrders = allOrders.filter(o =>
        ['completed', 'served', 'cancelled', 'refunded'].includes(o.status)
      );
      setOrders(historyOrders);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const q = searchTerm.toLowerCase();
    return orders.filter(o =>
      (o.dailyOrderId && String(o.dailyOrderId).includes(q)) ||
      (o.orderNumber && String(o.orderNumber).toLowerCase().includes(q)) ||
      (o.customerInfo?.name && o.customerInfo.name.toLowerCase().includes(q)) ||
      (o.customerInfo?.phone && o.customerInfo.phone.includes(q)) ||
      (o.tableNumber && String(o.tableNumber).toLowerCase().includes(q))
    );
  }, [orders, searchTerm]);

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };
  const formatTime = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const canRestore = userRole === 'owner' || userRole === 'manager';

  const handleRestoreOrder = (order) => {
    Alert.alert(
      'Restore Order',
      `Restore order #${order.dailyOrderId || order.orderNumber || ''}?\nThis will re-apply inventory, loyalty, and stats.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              setRestoringOrder(true);
              await apiClient.restoreOrder(order.id || order._id, 'Restored from mobile');
              Alert.alert('Success', 'Order has been restored');
              setSelectedOrder(null);
              loadOrders();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to restore order');
            } finally {
              setRestoringOrder(false);
            }
          },
        },
      ],
    );
  };

  const renderOrderCard = ({ item }) => {
    const amt = item.finalAmount || item.totalAmount || 0;
    const statusColor = STATUS_COLORS[item.status] || '#6b7280';
    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => setSelectedOrder(item)}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardTop}>
          <View style={styles.orderIdRow}>
            <Text style={styles.orderId}>#{item.dailyOrderId || item.orderNumber || ''}</Text>
            {item.tableNumber && (
              <View style={styles.tableBadge}>
                <Text style={styles.tableBadgeText}>T{item.tableNumber}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.orderAmount, { color: statusColor }]}>{formatCurrency(amt)}</Text>
        </View>
        <View style={styles.orderCardMid}>
          <Text style={styles.orderMeta}>
            {item.items?.length || 0} items · {item.orderType || 'dine-in'} · {item.paymentMethod || 'cash'}
          </Text>
          {item.customerInfo?.name && (
            <Text style={styles.orderCustomer}>{item.customerInfo.name}</Text>
          )}
        </View>
        <View style={styles.orderCardBottom}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {item.status}
            </Text>
          </View>
          <Text style={styles.orderTime}>
            {formatDate(item.completedAt || item.createdAt)} · {formatTime(item.completedAt || item.createdAt)}
          </Text>
        </View>

        {/* Discount info */}
        {(item.discountAmount > 0 || item.manualDiscount > 0 || item.loyaltyDiscount > 0) && (
          <View style={styles.discountRow}>
            {item.discountAmount > 0 && (
              <Text style={styles.discountTag}>Offer -{formatCurrency(item.discountAmount)}</Text>
            )}
            {item.manualDiscount > 0 && (
              <Text style={styles.discountTag}>Manual -{formatCurrency(item.manualDiscount)}</Text>
            )}
            {item.loyaltyDiscount > 0 && (
              <Text style={[styles.discountTag, { color: '#7c3aed' }]}>Loyalty -{formatCurrency(item.loyaltyDiscount)}</Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { fontSize: fs(20) }]}>Order History</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Text style={styles.statValue}>{stats.count}</Text>
            <Text style={styles.statLabel}>orders</Text>
          </View>
          <View style={[styles.statBadge, styles.statBadgeRevenue]}>
            <Text style={[styles.statValue, { color: '#059669' }]}>{formatCurrency(stats.revenue)}</Text>
            <Text style={styles.statLabel}>revenue</Text>
          </View>
        </View>
      </View>

      {/* Date Filter Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContainer}>
        {[
          { key: 'today', label: 'Today' },
          { key: 'yesterday', label: 'Yesterday' },
          { key: 'week', label: 'This Week' },
          { key: 'month', label: '30 Days' },
          { key: 'custom', label: 'Custom' },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterPill, dateMode === f.key && styles.filterPillActive]}
            onPress={() => setDateMode(f.key)}
          >
            <Text style={[styles.filterPillText, dateMode === f.key && styles.filterPillTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Custom Date Pickers */}
      {dateMode === 'custom' && (
        <View style={styles.customDateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
            <Text style={styles.dateBtnText}>{customStartDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <Text style={styles.dateSep}>to</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Ionicons name="calendar-outline" size={14} color="#6b7280" />
            <Text style={styles.dateBtnText}>{customEndDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dateGoBtn} onPress={loadOrders}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
          {showStartPicker && (
            <DateTimePicker value={customStartDate} mode="date" display="default"
              onChange={(_, d) => { setShowStartPicker(false); if (d) setCustomStartDate(d); }} />
          )}
          {showEndPicker && (
            <DateTimePicker value={customEndDate} mode="date" display="default"
              onChange={(_, d) => { setShowEndPicker(false); if (d) setCustomEndDate(d); }} />
          )}
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by order #, customer, table..."
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

      {/* Orders List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>No orders found</Text>
          <Text style={styles.emptySubtext}>
            {searchTerm ? 'Try a different search' : 'No completed orders for this period'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          renderItem={renderOrderCard}
          keyExtractor={(item) => item.id || item._id}
          contentContainerStyle={[styles.listContent, isTablet && { maxWidth: 700, alignSelf: 'center', width: '100%' }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} colors={[Colors.primary]} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Order Detail Modal */}
      <Modal visible={!!selectedOrder} animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedOrder(null)} style={styles.modalBack}>
              <Ionicons name="arrow-back" size={22} color="#1f2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Order #{selectedOrder?.dailyOrderId || selectedOrder?.orderNumber || ''}
            </Text>
            <View style={{ width: 36 }} />
          </View>
          {selectedOrder && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Status + Time */}
              <View style={styles.detailSection}>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[selectedOrder.status] || '#6b7280') + '18', alignSelf: 'flex-start' }]}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[selectedOrder.status] || '#6b7280' }]} />
                  <Text style={[styles.statusText, { color: STATUS_COLORS[selectedOrder.status] || '#6b7280' }]}>
                    {selectedOrder.status}
                  </Text>
                </View>
                <Text style={styles.detailTime}>
                  {new Date(selectedOrder.completedAt || selectedOrder.createdAt).toLocaleString('en-IN')}
                </Text>
                {selectedOrder.tableNumber && (
                  <Text style={styles.detailMeta}>Table: {selectedOrder.tableNumber}</Text>
                )}
                <Text style={styles.detailMeta}>
                  Type: {selectedOrder.orderType || 'dine-in'} · Payment: {selectedOrder.paymentMethod || 'cash'}
                </Text>
                {selectedOrder.customerInfo?.name && (
                  <Text style={styles.detailMeta}>Customer: {selectedOrder.customerInfo.name} {selectedOrder.customerInfo.phone ? `(${selectedOrder.customerInfo.phone})` : ''}</Text>
                )}
                {selectedOrder.staffInfo?.waiterName && (
                  <Text style={styles.detailMeta}>Staff: {selectedOrder.staffInfo.waiterName}</Text>
                )}
              </View>

              {/* Items */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Items</Text>
                {(selectedOrder.items || []).map((item, i) => (
                  <View key={i} style={styles.detailItem}>
                    <Text style={styles.detailItemName}>{item.quantity}× {item.name}</Text>
                    <Text style={styles.detailItemPrice}>{formatCurrency(item.price * item.quantity)}</Text>
                  </View>
                ))}
              </View>

              {/* Bill Summary */}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Bill Summary</Text>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Subtotal</Text>
                  <Text style={styles.detailValue}>{formatCurrency(selectedOrder.totalAmount || 0)}</Text>
                </View>
                {selectedOrder.discountAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#10b981' }]}>
                      {(() => { const n = typeof selectedOrder.appliedOffer === 'string' ? selectedOrder.appliedOffer : (selectedOrder.appliedOffer?.name || selectedOrder.selectedOfferName); return n ? `Offer: ${n}` : 'Offer Discount'; })()}
                    </Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>-{formatCurrency(selectedOrder.discountAmount)}</Text>
                  </View>
                )}
                {selectedOrder.manualDiscount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#10b981' }]}>Manual Discount</Text>
                    <Text style={[styles.detailValue, { color: '#10b981' }]}>-{formatCurrency(selectedOrder.manualDiscount)}</Text>
                  </View>
                )}
                {selectedOrder.loyaltyDiscount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#7c3aed' }]}>Loyalty Points</Text>
                    <Text style={[styles.detailValue, { color: '#7c3aed' }]}>-{formatCurrency(selectedOrder.loyaltyDiscount)}</Text>
                  </View>
                )}
                {selectedOrder.serviceChargeAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Service Charge</Text>
                    <Text style={styles.detailValue}>{formatCurrency(selectedOrder.serviceChargeAmount)}</Text>
                  </View>
                )}
                {selectedOrder.taxBreakdown && selectedOrder.taxBreakdown.length > 0 ? (
                  selectedOrder.taxBreakdown.map((tax, idx) => (
                    <View key={idx} style={styles.detailItem}>
                      <Text style={styles.detailLabel}>{tax.name}{tax.rate ? ` (${tax.rate}%)` : ''}{tax.inclusive ? ' (incl.)' : ''}</Text>
                      <Text style={styles.detailValue}>{formatCurrency(tax.amount || 0)}</Text>
                    </View>
                  ))
                ) : selectedOrder.taxAmount > 0 ? (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Tax</Text>
                    <Text style={styles.detailValue}>{formatCurrency(selectedOrder.taxAmount)}</Text>
                  </View>
                ) : null}
                {selectedOrder.tipAmount > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={[styles.detailLabel, { color: '#f59e0b' }]}>Tip</Text>
                    <Text style={[styles.detailValue, { color: '#f59e0b' }]}>{formatCurrency(selectedOrder.tipAmount)}</Text>
                  </View>
                )}
                <View style={[styles.detailItem, styles.grandTotalRow]}>
                  <Text style={styles.grandTotalLabel}>Grand Total</Text>
                  <Text style={styles.grandTotalValue}>{formatCurrency(selectedOrder.finalAmount || selectedOrder.totalAmount || 0)}</Text>
                </View>

                {/* Loyalty points earned */}
                {selectedOrder.loyaltyPointsEarned > 0 && (
                  <View style={styles.loyaltyEarnedRow}>
                    <Ionicons name="star" size={14} color="#f59e0b" />
                    <Text style={styles.loyaltyEarnedText}>+{selectedOrder.loyaltyPointsEarned} points earned</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
          {selectedOrder?.status === 'cancelled' && canRestore && (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' }}>
              <TouchableOpacity
                onPress={() => handleRestoreOrder(selectedOrder)}
                disabled={restoringOrder}
                style={{ backgroundColor: '#f59e0b', paddingVertical: 12, borderRadius: 8, alignItems: 'center', opacity: restoringOrder ? 0.6 : 1 }}
                activeOpacity={0.7}
              >
                {restoringOrder ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Restore Order</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  statBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statBadgeRevenue: { backgroundColor: '#ecfdf5' },
  statValue: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#6b7280' },

  // Filters
  filterScroll: { flexGrow: 0, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  filterContainer: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  filterPillActive: { backgroundColor: '#ef4444' },
  filterPillText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  filterPillTextActive: { color: '#fff' },

  // Custom date
  customDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff',
  },
  dateBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#f9fafb',
    borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  dateBtnText: { fontSize: 12, color: '#374151' },
  dateSep: { fontSize: 12, color: '#9ca3af' },
  dateGoBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#ef4444',
    justifyContent: 'center', alignItems: 'center',
  },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1f2937', padding: 0 },

  // List
  listContent: { padding: 12, gap: 8, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  loadingText: { fontSize: 13, color: '#9ca3af', marginTop: 8 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#6b7280', marginTop: 8 },
  emptySubtext: { fontSize: 12, color: '#9ca3af' },

  // Order card
  orderCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  orderCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  tableBadge: {
    backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tableBadgeText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },
  orderAmount: { fontSize: 16, fontWeight: '800' },
  orderCardMid: { marginTop: 6 },
  orderMeta: { fontSize: 11, color: '#9ca3af' },
  orderCustomer: { fontSize: 12, fontWeight: '500', color: '#6b7280', marginTop: 2 },
  orderCardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  orderTime: { fontSize: 10, color: '#9ca3af' },
  discountRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  discountTag: { fontSize: 10, fontWeight: '600', color: '#10b981' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalBack: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#1f2937' },
  modalContent: { flex: 1 },
  detailSection: {
    backgroundColor: '#fff', marginTop: 8, marginHorizontal: 12, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#f3f4f6',
  },
  detailSectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailTime: { fontSize: 13, color: '#374151', marginTop: 6 },
  detailMeta: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  detailItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  detailItemName: { fontSize: 13, color: '#374151', flex: 1 },
  detailItemPrice: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  detailLabel: { fontSize: 13, color: '#6b7280' },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#1f2937' },
  grandTotalRow: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  grandTotalLabel: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  grandTotalValue: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  loyaltyEarnedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: '#fefce8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start',
  },
  loyaltyEarnedText: { fontSize: 11, fontWeight: '600', color: '#92400e' },
});
