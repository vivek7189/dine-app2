import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7days', label: '7 Days' },
  { key: '30days', label: '30 Days' },
  { key: 'custom', label: 'Custom' },
];

const SOURCE_COLORS = {
  order: '#3b82f6', manual: '#8b5cf6', waste: '#ef4444',
  adjustment: '#f59e0b', restock: '#10b981', production: '#6366f1',
};

export default function UsageTab({
  usageSummary, usageTransactions, usagePeriod,
  usageStartDate, setUsageStartDate, usageEndDate, setUsageEndDate,
  handlePeriodChange, applyCustomDateRange,
}) {
  const { fs } = useResponsive();
  const [showTransactions, setShowTransactions] = useState(false);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Period filter */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodBtn, usagePeriod === p.key && styles.periodBtnActive]}
            onPress={() => handlePeriodChange(p.key)}
          >
            <Text style={[styles.periodText, usagePeriod === p.key && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom date range */}
      {usagePeriod === 'custom' && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.dateInput}
            placeholder="Start (YYYY-MM-DD)"
            placeholderTextColor={Colors.textLight}
            value={usageStartDate}
            onChangeText={setUsageStartDate}
          />
          <Text style={styles.dateSep}>to</Text>
          <TextInput
            style={styles.dateInput}
            placeholder="End (YYYY-MM-DD)"
            placeholderTextColor={Colors.textLight}
            value={usageEndDate}
            onChangeText={setUsageEndDate}
          />
          <TouchableOpacity style={styles.applyBtn} onPress={applyCustomDateRange}>
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top consumed */}
      <Text style={styles.sectionTitle}>Top Consumed Ingredients</Text>
      {usageSummary.length > 0 ? (
        <View style={styles.summaryGrid}>
          {usageSummary.slice(0, 10).map((item, idx) => (
            <View key={item._id || item.inventoryItemId || idx} style={styles.summaryCard}>
              <Text style={styles.summaryName} numberOfLines={1}>{item.name || item.inventoryItemName || 'Item'}</Text>
              <Text style={styles.summaryQty}>
                {Number(item.totalQuantity || item.quantity || 0).toFixed(1)} {item.unit || ''}
              </Text>
              {Number(item.totalCost || item.cost || 0) > 0 && (
                <Text style={styles.summaryCost}>
                  {'\u20B9'}{Number(item.totalCost || item.cost || 0).toFixed(0)}
                </Text>
              )}
              {Number(item.orderCount || 0) > 0 && (
                <Text style={styles.summaryOrders}>{item.orderCount} orders</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="analytics-outline" size={32} color={Colors.textLight} />
          <Text style={styles.emptyText}>No usage data for this period</Text>
        </View>
      )}

      {/* Transaction toggle */}
      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => setShowTransactions(!showTransactions)}
      >
        <Text style={styles.sectionTitle}>Transaction Log</Text>
        <Ionicons name={showTransactions ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMedium} />
      </TouchableOpacity>

      {showTransactions && (
        usageTransactions.length > 0 ? (
          usageTransactions.map((tx, idx) => {
            const source = (tx.source || tx.type || 'manual').toLowerCase();
            const srcColor = SOURCE_COLORS[source] || '#6b7280';
            const qtyChange = Number(tx.quantityChange || tx.quantity || 0);
            const isNeg = qtyChange < 0 || source === 'order' || source === 'waste';
            return (
              <View key={tx._id || idx} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txName}>{tx.inventoryItemName || tx.name || 'Item'}</Text>
                  <Text style={styles.txDate}>
                    {tx.date ? new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
                <Text style={[styles.txQty, { color: isNeg ? '#ef4444' : '#10b981' }]}>
                  {isNeg ? '' : '+'}{qtyChange} {tx.unit || ''}
                </Text>
                <View style={[styles.srcBadge, { backgroundColor: srcColor + '18' }]}>
                  <Text style={[styles.srcText, { color: srcColor }]}>{source.charAt(0).toUpperCase() + source.slice(1)}</Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.noTx}>No transactions found</Text>
        )
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.md },
  periodRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm },
  periodBtn: {
    flex: 1, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderLight,
    paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff',
  },
  periodBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  periodText: { fontSize: 13, color: Colors.textMedium, fontWeight: '600' },
  periodTextActive: { color: '#fff' },
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm,
  },
  dateInput: {
    flex: 1, backgroundColor: '#f1f5f9', borderRadius: BorderRadius.medium,
    paddingHorizontal: 10, height: 36, fontSize: 13, color: Colors.textDark,
  },
  dateSep: { fontSize: 13, color: Colors.textLight },
  applyBtn: {
    backgroundColor: '#3b82f6', borderRadius: BorderRadius.medium,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  applyText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  summaryCard: {
    flex: 1, minWidth: '40%', backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, ...Shadows.small,
  },
  summaryName: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  summaryQty: { fontSize: 18, fontWeight: '800', color: '#3b82f6', marginTop: 4 },
  summaryCost: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  summaryOrders: { fontSize: 11, color: Colors.textLight, marginTop: 1 },
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 13, color: Colors.textLight, marginTop: 8 },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: BorderRadius.medium, padding: Spacing.sm, marginBottom: Spacing.xs, ...Shadows.small,
  },
  txName: { fontSize: 13, fontWeight: '600', color: Colors.textDark },
  txDate: { fontSize: 11, color: Colors.textLight, marginTop: 2 },
  txQty: { fontSize: 14, fontWeight: '700', marginHorizontal: Spacing.sm },
  srcBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  srcText: { fontSize: 10, fontWeight: '700' },
  noTx: { fontSize: 13, color: Colors.textLight, textAlign: 'center', paddingVertical: 20 },
});
