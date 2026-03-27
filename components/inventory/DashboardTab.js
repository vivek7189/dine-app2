import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

export default function DashboardTab({
  totalItems, lowStockCount, totalValue, categoryCount, suppliers,
  lowStockItems, purchaseOrders, inventoryItems,
  getStockStatus, getStockColor, getStockPercent,
  getOrderStatusColor,
  openAddItem, setShowQuickStockModal, setActiveTab,
  onQuickAction,
}) {
  const recentPOs = (purchaseOrders || []).slice(0, 5);
  const expiringCount = inventoryItems.filter(i => {
    if (!i.expiryDate) return false;
    const d = new Date(i.expiryDate);
    const now = new Date();
    const diff = (d - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }).length;
  const expiredCount = inventoryItems.filter(i => {
    if (!i.expiryDate) return false;
    return new Date(i.expiryDate) < new Date();
  }).length;

  const alertCount = lowStockCount + expiringCount + expiredCount;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Alert Banner */}
      {alertCount > 0 && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => setActiveTab('stock')}
          activeOpacity={0.8}
        >
          <View style={styles.alertIconWrap}>
            <Ionicons name="warning" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>Attention Required</Text>
            <Text style={styles.alertText}>
              {lowStockCount > 0 ? `${lowStockCount} low stock` : ''}
              {lowStockCount > 0 && expiringCount > 0 ? ', ' : ''}
              {expiringCount > 0 ? `${expiringCount} expiring soon` : ''}
              {(lowStockCount > 0 || expiringCount > 0) && expiredCount > 0 ? ', ' : ''}
              {expiredCount > 0 ? `${expiredCount} expired` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
        </TouchableOpacity>
      )}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickGrid}>
        <TouchableOpacity style={styles.quickBtn} onPress={openAddItem}>
          <View style={[styles.quickIcon, { backgroundColor: '#eff6ff' }]}>
            <Ionicons name="add-circle" size={24} color="#3b82f6" />
          </View>
          <Text style={styles.quickLabel}>Add Item</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setShowQuickStockModal(true)}>
          <View style={[styles.quickIcon, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="swap-vertical" size={24} color="#10b981" />
          </View>
          <Text style={styles.quickLabel}>Quick Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setActiveTab('stock')}>
          <View style={[styles.quickIcon, { backgroundColor: '#fefce8' }]}>
            <Ionicons name="cube" size={24} color="#f59e0b" />
          </View>
          <Text style={styles.quickLabel}>View Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickBtn} onPress={() => setActiveTab('insights')}>
          <View style={[styles.quickIcon, { backgroundColor: '#fdf2f8' }]}>
            <Ionicons name="sparkles" size={24} color="#ec4899" />
          </View>
          <Text style={styles.quickLabel}>AI Insights</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Grid */}
      <Text style={styles.sectionTitle}>Overview</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}>
          <Text style={styles.statValue}>{totalItems}</Text>
          <Text style={styles.statLabel}>Total Items</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#ef4444' }]}>
          <Text style={[styles.statValue, lowStockCount > 0 && { color: '#ef4444' }]}>{lowStockCount}</Text>
          <Text style={styles.statLabel}>Low Stock</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#10b981' }]}>
          <Text style={styles.statValue}>
            {'\u20B9'}{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
          <Text style={styles.statLabel}>Total Value</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#8b5cf6' }]}>
          <Text style={styles.statValue}>{suppliers?.length || 0}</Text>
          <Text style={styles.statLabel}>Suppliers</Text>
        </View>
      </View>

      {/* Low Stock Items */}
      {lowStockItems.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Low Stock Items</Text>
            <TouchableOpacity onPress={() => setActiveTab('stock')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {lowStockItems.slice(0, 8).map((item) => {
            const pct = getStockPercent(item);
            const color = getStockColor(getStockStatus(item));
            return (
              <View key={item._id || item.id} style={styles.lowStockRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lowStockName}>{item.name}</Text>
                  <Text style={styles.lowStockMeta}>
                    {Number(item.currentStock) || 0} / {Number(item.minStock) || 0} {item.unit}
                  </Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.quickStockBtn}
                  onPress={() => setShowQuickStockModal(true)}
                >
                  <Ionicons name="add" size={16} color="#3b82f6" />
                  <Text style={styles.quickStockText}>Stock</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}

      {/* Recent Purchase Orders */}
      {recentPOs.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Purchase Orders</Text>
            <TouchableOpacity onPress={() => { setActiveTab('procurement'); }}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentPOs.map((po) => (
            <View key={po._id || po.id} style={styles.poRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.poNumber}>PO #{po.poNumber || po.orderNumber || '—'}</Text>
                <Text style={styles.poSupplier}>{po.supplierName || '—'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getOrderStatusColor(po.status) + '20' }]}>
                <Text style={[styles.statusText, { color: getOrderStatusColor(po.status) }]}>
                  {(po.status || 'pending').charAt(0).toUpperCase() + (po.status || 'pending').slice(1)}
                </Text>
              </View>
              <Text style={styles.poTotal}>
                {'\u20B9'}{(po.totalAmount || po.total || 0).toLocaleString('en-IN')}
              </Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.md },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.large, padding: Spacing.md, marginTop: Spacing.md,
    borderWidth: 1, borderColor: '#fecaca',
  },
  alertIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm,
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
  alertText: { fontSize: 12, color: '#b91c1c', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  seeAll: { fontSize: 13, color: '#3b82f6', fontWeight: '600' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quickBtn: {
    width: '48%', backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, alignItems: 'center', ...Shadows.small,
  },
  quickIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  quickLabel: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard: {
    width: '48%', backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, borderLeftWidth: 4, ...Shadows.small,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.textDark },
  statLabel: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  lowStockRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: BorderRadius.medium, padding: Spacing.md, marginBottom: Spacing.xs, ...Shadows.small,
  },
  lowStockName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  lowStockMeta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  barBg: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, marginTop: 6 },
  barFill: { height: 6, borderRadius: 3 },
  quickStockBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff',
    borderRadius: BorderRadius.medium, paddingHorizontal: 10, paddingVertical: 6, marginLeft: Spacing.sm,
  },
  quickStockText: { fontSize: 12, color: '#3b82f6', fontWeight: '600', marginLeft: 4 },
  poRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: BorderRadius.medium, padding: Spacing.md, marginBottom: Spacing.xs, ...Shadows.small,
  },
  poNumber: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  poSupplier: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: Spacing.sm },
  statusText: { fontSize: 11, fontWeight: '700' },
  poTotal: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
});
