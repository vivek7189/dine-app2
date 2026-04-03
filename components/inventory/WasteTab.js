import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: 'this_month', label: 'This Month' },
];

const REASONS = [
  { key: 'all', label: 'All' },
  { key: 'spillage', label: 'Spillage' },
  { key: 'expired', label: 'Expired' },
  { key: 'damaged', label: 'Damaged' },
  { key: 'leftover', label: 'Leftover' },
  { key: 'shrinkage', label: 'Shrinkage' },
  { key: 'other', label: 'Other' },
];

const REASON_COLORS = {
  spillage:  { bg: '#fffbeb', color: '#f59e0b' },
  expired:   { bg: '#fef2f2', color: '#ef4444' },
  damaged:   { bg: '#f5f3ff', color: '#8b5cf6' },
  leftover:  { bg: '#eff6ff', color: '#3b82f6' },
  shrinkage: { bg: '#fdf2f8', color: '#ec4899' },
  other:     { bg: '#f3f4f6', color: '#6b7280' },
};

const SOURCE_LABELS = {
  MANUAL: 'Manual',
  AUTO_EXPIRY: 'Auto',
  EXPIRY: 'Expiry',
  LEFTOVER: 'AI Leftover',
};

function formatCurrency(val) {
  const num = Number(val || 0);
  return '\u20B9' + num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function getReasonStyle(reason) {
  const key = (reason || 'other').toLowerCase();
  return REASON_COLORS[key] || REASON_COLORS.other;
}

function getSourceLabel(source) {
  return SOURCE_LABELS[source] || SOURCE_LABELS.MANUAL;
}

export default function WasteTab({
  wasteEntries = [],
  wasteSummary = {},
  expiryAlerts = [],
  wastePeriod,
  setWastePeriod,
  wasteReason,
  setWasteReason,
  loading,
  onLogWaste,
  onAILeftover,
  onRefresh,
  onMarkExpiredWaste,
  onDismissExpired,
}) {
  const expiredAlerts = (expiryAlerts || []).filter(a => a.status === 'expired' || a.isExpired);
  const expiringSoonAlerts = (expiryAlerts || []).filter(a => !a.isExpired && a.status !== 'expired');

  const totalWasteValue = wasteEntries.reduce(
    (sum, e) => sum + Number(e.value || e.totalValue || e.cost || 0), 0
  );

  const renderSummaryCards = () => (
    <View style={styles.summaryGrid}>
      <View style={[styles.summaryCard, { borderLeftColor: '#ef4444' }]}>
        <Ionicons name="today-outline" size={18} color="#ef4444" />
        <Text style={styles.summaryLabel}>Today's Waste</Text>
        <Text style={[styles.summaryValue, { color: '#ef4444' }]}>
          {formatCurrency(wasteSummary.todayValue || 0)}
        </Text>
        <Text style={styles.summarySubtext}>
          {wasteSummary.todayCount || 0} entries
        </Text>
      </View>

      <View style={[styles.summaryCard, { borderLeftColor: '#f59e0b' }]}>
        <Ionicons name="calendar-outline" size={18} color="#f59e0b" />
        <Text style={styles.summaryLabel}>This Week</Text>
        <Text style={[styles.summaryValue, { color: '#f59e0b' }]}>
          {formatCurrency(wasteSummary.weekValue || 0)}
        </Text>
        <Text style={styles.summarySubtext}>
          {wasteSummary.weekCount || 0} entries
        </Text>
      </View>

      <View style={[styles.summaryCard, { borderLeftColor: '#8b5cf6' }]}>
        <Ionicons name="stats-chart-outline" size={18} color="#8b5cf6" />
        <Text style={styles.summaryLabel}>This Month</Text>
        <Text style={[styles.summaryValue, { color: '#8b5cf6' }]}>
          {formatCurrency(wasteSummary.monthValue || 0)}
        </Text>
        <Text style={styles.summarySubtext}>
          {wasteSummary.monthCount || 0} entries
        </Text>
      </View>

      <View style={[styles.summaryCard, { borderLeftColor: '#ec4899' }]}>
        <Ionicons name="trending-up-outline" size={18} color="#ec4899" />
        <Text style={styles.summaryLabel}>Top Wasted</Text>
        <Text style={[styles.summaryValue, { color: '#ec4899' }]} numberOfLines={1}>
          {wasteSummary.topWastedItem || '--'}
        </Text>
        <Text style={styles.summarySubtext}>
          {wasteSummary.topWastedQty ? `${wasteSummary.topWastedQty} ${wasteSummary.topWastedUnit || ''}` : 'No data'}
        </Text>
      </View>
    </View>
  );

  const renderExpiredAlerts = () => {
    if (expiredAlerts.length === 0) return null;
    return (
      <View style={styles.alertBanner}>
        <View style={styles.alertHeader}>
          <View style={[styles.alertIconWrap, { backgroundColor: '#fef2f2' }]}>
            <Ionicons name="alert-circle" size={20} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>
              {expiredAlerts.length} Expired Item{expiredAlerts.length > 1 ? 's' : ''}
            </Text>
            <Text style={styles.alertText}>These items have passed their expiry date</Text>
          </View>
        </View>
        {expiredAlerts.slice(0, 5).map((alert) => (
          <View key={alert.batchId || alert._id} style={styles.alertItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertItemName} numberOfLines={1}>
                {alert.itemName || alert.name}
              </Text>
              <Text style={styles.alertItemDetail}>
                {alert.quantity} {alert.unit} {'\u2022'} Expired {formatDate(alert.expiryDate)}
              </Text>
            </View>
            <View style={styles.alertActions}>
              <TouchableOpacity
                style={styles.alertBtnDanger}
                onPress={() => onMarkExpiredWaste(alert.batchId || alert._id)}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.alertBtnDangerText}>Mark Waste</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.alertBtnOutline}
                onPress={() => onDismissExpired(alert.batchId || alert._id)}
              >
                <Text style={styles.alertBtnOutlineText}>Used</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderExpiringSoon = () => {
    if (expiringSoonAlerts.length === 0) return null;
    return (
      <View style={styles.warningBanner}>
        <View style={styles.alertHeader}>
          <View style={[styles.alertIconWrap, { backgroundColor: '#fffbeb' }]}>
            <Ionicons name="warning-outline" size={20} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.alertTitle, { color: '#92400e' }]}>
              {expiringSoonAlerts.length} Expiring Soon
            </Text>
            <Text style={[styles.alertText, { color: '#a16207' }]}>
              {expiringSoonAlerts.slice(0, 3).map(a => a.itemName || a.name).join(', ')}
              {expiringSoonAlerts.length > 3 ? ` +${expiringSoonAlerts.length - 3} more` : ''}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderActionButtons = () => (
    <View style={styles.actionRow}>
      <TouchableOpacity style={styles.actionBtn} onPress={onLogWaste}>
        <Ionicons name="add-circle-outline" size={18} color="#fff" />
        <Text style={styles.actionBtnText}>Log Waste</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={onAILeftover}>
        <Ionicons name="sparkles-outline" size={18} color="#8b5cf6" />
        <Text style={[styles.actionBtnText, { color: '#8b5cf6' }]}>AI Leftover</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
        <Ionicons name="refresh-outline" size={20} color={Colors.textMedium} />
      </TouchableOpacity>
    </View>
  );

  const renderFilters = () => (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p.key}
            style={[styles.chip, wastePeriod === p.key && styles.chipActive]}
            onPress={() => setWastePeriod(p.key)}
          >
            <Text style={[styles.chipText, wastePeriod === p.key && styles.chipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {REASONS.map(r => {
          const rc = REASON_COLORS[r.key];
          const isActive = wasteReason === r.key;
          return (
            <TouchableOpacity
              key={r.key}
              style={[
                styles.chip,
                isActive && rc
                  ? { backgroundColor: rc.bg, borderColor: rc.color }
                  : isActive && styles.chipActive,
              ]}
              onPress={() => setWasteReason(r.key)}
            >
              <Text
                style={[
                  styles.chipText,
                  isActive && rc ? { color: rc.color, fontWeight: '700' } : isActive && styles.chipTextActive,
                ]}
              >
                {r.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderWasteEntry = ({ item }) => {
    const reasonStyle = getReasonStyle(item.reason);
    const sourceLabel = getSourceLabel(item.source);
    return (
      <View style={styles.entryRow}>
        <View style={styles.entryLeft}>
          <Text style={styles.entryDate}>{formatDate(item.date || item.createdAt)}</Text>
          <Text style={styles.entryName} numberOfLines={1}>
            {item.inventoryItemName || item.itemName || item.name || 'Unknown Item'}
          </Text>
          <Text style={styles.entryQty}>
            {Number(item.quantity || 0).toFixed(2)} {item.unit || ''}
          </Text>
        </View>
        <View style={styles.entryRight}>
          <View style={[styles.reasonBadge, { backgroundColor: reasonStyle.bg }]}>
            <Text style={[styles.reasonText, { color: reasonStyle.color }]}>
              {(item.reason || 'other').charAt(0).toUpperCase() + (item.reason || 'other').slice(1)}
            </Text>
          </View>
          <Text style={styles.entryValue}>{formatCurrency(item.value || item.totalValue || item.cost || 0)}</Text>
          <Text style={styles.entrySource}>{sourceLabel}</Text>
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View>
      {renderSummaryCards()}
      {renderExpiredAlerts()}
      {renderExpiringSoon()}
      {renderActionButtons()}
      {renderFilters()}

      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading waste data...</Text>
        </View>
      )}

      {!loading && wasteEntries.length === 0 && (
        <View style={styles.emptyBox}>
          <Ionicons name="trash-outline" size={36} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No waste entries</Text>
          <Text style={styles.emptyText}>
            Waste logged during this period will appear here
          </Text>
        </View>
      )}

      {!loading && wasteEntries.length > 0 && (
        <Text style={styles.sectionTitle}>
          Waste Log ({wasteEntries.length} entries)
        </Text>
      )}
    </View>
  );

  const renderFooter = () => {
    if (wasteEntries.length === 0) return <View style={{ height: 40 }} />;
    return (
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Waste Value</Text>
          <Text style={styles.totalValue}>{formatCurrency(totalWasteValue)}</Text>
        </View>
        <View style={{ height: 40 }} />
      </View>
    );
  };

  const sortedEntries = [...wasteEntries].sort((a, b) => {
    const da = new Date(b.date || b.createdAt || 0);
    const db = new Date(a.date || a.createdAt || 0);
    return da - db;
  });

  return (
    <FlatList
      style={styles.container}
      data={!loading ? sortedEntries : []}
      keyExtractor={(item, idx) => item._id || item.id || String(idx)}
      renderItem={renderWasteEntry}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },

  // Summary cards
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    borderLeftWidth: 3,
    ...Shadows.small,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textLight,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  summarySubtext: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
  },

  // Alert banners
  alertBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warningBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
  },
  alertText: {
    fontSize: 12,
    color: '#b91c1c',
    marginTop: 1,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  alertItemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  alertItemDetail: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 1,
  },
  alertActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: Spacing.sm,
  },
  alertBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ef4444',
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  alertBtnDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  alertBtnOutline: {
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  alertBtnOutlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMedium,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.medium,
    paddingVertical: 10,
  },
  actionBtnSecondary: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  // Filter chips
  filterScroll: {
    marginTop: Spacing.sm,
  },
  filterContent: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  chipTextActive: {
    color: '#fff',
  },

  // Section title
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Waste entries
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.medium,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    ...Shadows.small,
  },
  entryLeft: {
    flex: 1,
  },
  entryDate: {
    fontSize: 10,
    color: Colors.textLight,
  },
  entryName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginTop: 1,
  },
  entryQty: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 1,
  },
  entryRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  reasonBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reasonText: {
    fontSize: 10,
    fontWeight: '700',
  },
  entryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  entrySource: {
    fontSize: 10,
    color: Colors.textLight,
  },

  // Loading & empty
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 30,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textLight,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
    textAlign: 'center',
  },

  // Footer total
  footer: {
    marginTop: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991b1b',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ef4444',
  },
});
