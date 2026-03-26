import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PURPLE = '#7c3aed';
const AMBER = '#f59e0b';

const TABS = ['Overview', 'Orders', 'Loyalty'];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

// Pulsing placeholder for loading state
function SkeletonBlock({ width, height, style }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width || '100%',
          height: height || 60,
          backgroundColor: '#e0e0e0',
          borderRadius: 12,
          opacity,
        },
        style,
      ]}
    />
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonContainer}>
      <View style={styles.statsGrid}>
        <SkeletonBlock width={(SCREEN_WIDTH - 56) / 2} height={80} />
        <SkeletonBlock width={(SCREEN_WIDTH - 56) / 2} height={80} />
      </View>
      <View style={styles.statsGrid}>
        <SkeletonBlock width={(SCREEN_WIDTH - 56) / 2} height={80} />
        <SkeletonBlock width={(SCREEN_WIDTH - 56) / 2} height={80} />
      </View>
    </View>
  );
}

// Status badge component
function StatusBadge({ status }) {
  const colorMap = {
    confirmed: { bg: '#dbeafe', text: '#2563eb' },
    completed: { bg: '#dcfce7', text: '#16a34a' },
    cancelled: { bg: '#fee2e2', text: '#dc2626' },
  };
  const colors = colorMap[status] || { bg: '#f3f4f6', text: '#6b7280' };

  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.statusBadgeText, { color: colors.text }]}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'}
      </Text>
    </View>
  );
}

export default function CustomerDetailModal({ visible, customerId, restaurantId, onClose }) {
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loyaltyTransactions, setLoyaltyTransactions] = useState([]);

  useEffect(() => {
    if (visible && customerId) {
      setLoading(true);
      setActiveTab(0);

      Promise.allSettled([
        apiClient.getCustomerDetail(customerId),
        apiClient.getCustomerOrders(customerId, { page: 1, limit: 15 }),
        apiClient.getCustomerLoyaltyHistory(customerId, { page: 1, limit: 20 }),
      ]).then(([customerResult, ordersResult, loyaltyResult]) => {
        if (customerResult.status === 'fulfilled' && customerResult.value?.customer) {
          setCustomer(customerResult.value.customer);
        } else {
          setCustomer(null);
        }

        if (ordersResult.status === 'fulfilled' && ordersResult.value?.orders) {
          setOrders(ordersResult.value.orders);
        } else {
          setOrders([]);
        }

        if (loyaltyResult.status === 'fulfilled' && loyaltyResult.value?.transactions) {
          setLoyaltyTransactions(loyaltyResult.value.transactions);
        } else {
          setLoyaltyTransactions([]);
        }

        setLoading(false);
      });
    }
  }, [visible, customerId]);

  const renderOverviewTab = () => {
    if (!customer) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="person-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyStateText}>Customer not found</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Stat cards */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatCurrency(customer.totalSpent)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{customer.totalOrders ?? 0}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {customer.loyaltyPoints ?? 0} <Text style={styles.starEmoji}>⭐</Text>
            </Text>
            <Text style={styles.statLabel}>Loyalty Points</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDate(customer.createdAt)}</Text>
            <Text style={styles.statLabel}>Member Since</Text>
          </View>
        </View>

        {/* Customer info rows */}
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>Contact Information</Text>

          {customer.phone ? (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{customer.phone}</Text>
            </View>
          ) : null}

          {customer.email ? (
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue} numberOfLines={1}>{customer.email}</Text>
            </View>
          ) : null}

          {customer.city ? (
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>City</Text>
              <Text style={styles.infoValue}>{customer.city}</Text>
            </View>
          ) : null}

          {customer.dob ? (
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>DOB</Text>
              <Text style={styles.infoValue}>{formatDate(customer.dob)}</Text>
            </View>
          ) : null}

          {customer.source ? (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Source</Text>
              <Text style={styles.infoValue}>{customer.source}</Text>
            </View>
          ) : null}

          {customer.lastOrderDate ? (
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={18} color={PURPLE} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Last Order</Text>
              <Text style={styles.infoValue}>{formatDate(customer.lastOrderDate)}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  };

  const renderOrderItem = ({ item }) => {
    const itemCount = item.items?.length ?? 0;

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>#{item.orderNumber || item._id?.slice(-6)}</Text>
            <Text style={styles.orderDate}>{formatDate(item.createdAt)}</Text>
          </View>
          <Text style={styles.orderTotal}>{formatCurrency(item.total)}</Text>
        </View>
        <View style={styles.orderFooter}>
          <StatusBadge status={item.status} />
          <Text style={styles.orderItemsCount}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </View>
    );
  };

  const renderOrdersTab = () => {
    if (orders.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyStateText}>No orders yet</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={orders}
        keyExtractor={(item, index) => item._id || String(index)}
        renderItem={renderOrderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  const renderLoyaltyItem = ({ item }) => {
    const isEarned = item.type === 'earned' || item.type === 'credit';
    const iconName = isEarned ? 'arrow-up-circle' : 'arrow-down-circle';
    const iconColor = isEarned ? '#16a34a' : '#dc2626';
    const amountPrefix = isEarned ? '+' : '-';

    return (
      <View style={styles.loyaltyItem}>
        <Ionicons name={iconName} size={28} color={iconColor} style={styles.loyaltyIcon} />
        <View style={styles.loyaltyItemContent}>
          <Text style={styles.loyaltyDescription} numberOfLines={1}>
            {item.description || (isEarned ? 'Points earned' : 'Points redeemed')}
          </Text>
          <Text style={styles.loyaltyDate}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={[styles.loyaltyAmount, { color: iconColor }]}>
          {amountPrefix}{item.points ?? item.amount ?? 0}
        </Text>
      </View>
    );
  };

  const renderLoyaltyTab = () => {
    return (
      <View style={styles.tabContentFlex}>
        {/* Points balance card */}
        <View style={styles.pointsBalanceCard}>
          <Text style={styles.pointsBalanceValue}>
            {customer?.loyaltyPoints ?? 0}
          </Text>
          <Text style={styles.pointsBalanceLabel}>Available Points</Text>
        </View>

        {loyaltyTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="star-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyStateText}>No loyalty activity yet</Text>
          </View>
        ) : (
          <FlatList
            data={loyaltyTransactions}
            keyExtractor={(item, index) => item._id || String(index)}
            renderItem={renderLoyaltyItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  };

  const renderContent = () => {
    if (loading) return <LoadingSkeleton />;

    switch (activeTab) {
      case 0:
        return renderOverviewTab();
      case 1:
        return renderOrdersTab();
      case 2:
        return renderLoyaltyTab();
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {customer?.name ? customer.name : 'Customer Details'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {TABS.map((tab, index) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === index && styles.tabActive,
              ]}
              onPress={() => setActiveTab(index)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === index && styles.tabTextActive,
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          {renderContent()}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PURPLE,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: PURPLE,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  headerSpacer: {
    width: 36,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: PURPLE,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  tabTextActive: {
    color: PURPLE,
  },

  // Content
  contentContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  tabContentFlex: {
    flex: 1,
    padding: 16,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  starEmoji: {
    fontSize: 16,
  },

  // Info section
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  infoSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  infoIcon: {
    marginRight: 10,
    width: 22,
  },
  infoLabel: {
    fontSize: 13,
    color: '#9ca3af',
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    textAlign: 'right',
  },

  // Orders
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  orderDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderItemsCount: {
    fontSize: 12,
    color: '#6b7280',
  },

  // Loyalty
  pointsBalanceCard: {
    backgroundColor: AMBER,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  pointsBalanceValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
  },
  pointsBalanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  loyaltyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  loyaltyIcon: {
    marginRight: 12,
  },
  loyaltyItemContent: {
    flex: 1,
  },
  loyaltyDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  loyaltyDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  loyaltyAmount: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#9ca3af',
    marginTop: 12,
    fontWeight: '500',
  },

  // Skeleton
  skeletonContainer: {
    padding: 16,
  },

  // Shared list
  listContent: {
    padding: 16,
  },
});
