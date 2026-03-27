import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const URGENCY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

export default function InsightsTab({
  aiReorderSuggestions, wastePredictions, wasteSummary,
  inventoryItems, lowStockCount, totalValue,
  getStockStatus,
}) {
  const [expandedReport, setExpandedReport] = useState(null);

  const expiredItems = inventoryItems.filter(i => i.expiryDate && new Date(i.expiryDate) < new Date());
  const lowStockItems = inventoryItems.filter(i => getStockStatus(i) === 'low');

  const toggleReport = (key) => setExpandedReport(expandedReport === key ? null : key);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Summary banner */}
      <View style={styles.banner}>
        <View style={styles.bannerIcon}>
          <Ionicons name="sparkles" size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>AI Inventory Insights</Text>
          <Text style={styles.bannerSub}>
            {aiReorderSuggestions.length} reorder suggestions · {wastePredictions.length} waste alerts
          </Text>
        </View>
      </View>

      {/* Waste summary */}
      {wasteSummary && (
        <View style={styles.wasteBanner}>
          <Ionicons name="alert-circle" size={18} color="#f59e0b" />
          <Text style={styles.wasteText}>
            {wasteSummary.totalWaste !== undefined
              ? `Estimated waste: ${'\u20B9'}${Number(wasteSummary.totalWaste || 0).toLocaleString('en-IN')} this month`
              : wasteSummary.summary || 'Waste analysis available'
            }
          </Text>
        </View>
      )}

      {/* Reorder Suggestions */}
      <Text style={styles.sectionTitle}>Reorder Suggestions</Text>
      {aiReorderSuggestions.length > 0 ? (
        aiReorderSuggestions.map((s, idx) => {
          const urgency = (s.urgency || 'low').toLowerCase();
          const urgColor = URGENCY_COLORS[urgency] || '#6b7280';
          return (
            <View key={s._id || idx} style={[styles.suggestionCard, { borderLeftColor: urgColor }]}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionName}>{s.itemName || s.name || 'Item'}</Text>
                <View style={[styles.urgencyBadge, { backgroundColor: urgColor + '18' }]}>
                  <Text style={[styles.urgencyText, { color: urgColor }]}>{urgency.toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.suggestionMeta}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Current</Text>
                  <Text style={styles.metaValue}>{s.currentStock ?? '—'} {s.unit || ''}</Text>
                </View>
                <View style={styles.metaCol}>
                  <Text style={styles.metaLabel}>Suggested</Text>
                  <Text style={[styles.metaValue, { color: '#3b82f6' }]}>{s.suggestedQuantity ?? s.reorderQty ?? '—'} {s.unit || ''}</Text>
                </View>
              </View>
              {s.reason && <Text style={styles.reason}>{s.reason}</Text>}
            </View>
          );
        })
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={36} color="#10b981" />
          <Text style={styles.emptyText}>No reorder suggestions — stock looks healthy!</Text>
        </View>
      )}

      {/* Waste Predictions */}
      <Text style={styles.sectionTitle}>Waste Predictions</Text>
      {wastePredictions.length > 0 ? (
        wastePredictions.map((w, idx) => {
          const risk = (w.risk || w.riskLevel || 'low').toLowerCase();
          const riskColor = RISK_COLORS[risk] || '#6b7280';
          return (
            <View key={w._id || idx} style={[styles.wasteCard, { borderLeftColor: riskColor }]}>
              <View style={styles.suggestionHeader}>
                <Text style={styles.suggestionName}>{w.itemName || w.name || 'Item'}</Text>
                <View style={[styles.urgencyBadge, { backgroundColor: riskColor + '18' }]}>
                  <Text style={[styles.urgencyText, { color: riskColor }]}>{risk.toUpperCase()} RISK</Text>
                </View>
              </View>
              {(w.daysToExpiry !== undefined || w.daysLeft !== undefined) && (
                <Text style={styles.wasteDetail}>
                  Expires in {w.daysToExpiry ?? w.daysLeft} days
                </Text>
              )}
              {(w.estimatedLoss || w.potentialLoss) && (
                <Text style={styles.wasteDetail}>
                  Potential loss: {'\u20B9'}{Number(w.estimatedLoss || w.potentialLoss || 0).toLocaleString('en-IN')}
                </Text>
              )}
              {w.recommendation && <Text style={styles.reason}>{w.recommendation}</Text>}
            </View>
          );
        })
      ) : (
        <View style={styles.emptyBox}>
          <Ionicons name="leaf-outline" size={36} color="#10b981" />
          <Text style={styles.emptyText}>No waste predictions — great job!</Text>
        </View>
      )}

      {/* Quick Reports */}
      <Text style={styles.sectionTitle}>Quick Reports</Text>
      <View style={styles.reportGrid}>
        <TouchableOpacity style={styles.reportCard} onPress={() => toggleReport('lowStock')}>
          <View style={[styles.reportIconWrap, { backgroundColor: '#fef2f2' }]}>
            <Ionicons name="trending-down" size={20} color="#ef4444" />
          </View>
          <Text style={styles.reportLabel}>Low Stock</Text>
          <Text style={styles.reportValue}>{lowStockCount} items</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportCard} onPress={() => toggleReport('expired')}>
          <View style={[styles.reportIconWrap, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="time" size={20} color="#f59e0b" />
          </View>
          <Text style={styles.reportLabel}>Expired</Text>
          <Text style={styles.reportValue}>{expiredItems.length} items</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportCard} onPress={() => toggleReport('value')}>
          <View style={[styles.reportIconWrap, { backgroundColor: '#f0fdf4' }]}>
            <Ionicons name="cash" size={20} color="#10b981" />
          </View>
          <Text style={styles.reportLabel}>Total Value</Text>
          <Text style={styles.reportValue}>{'\u20B9'}{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportCard} onPress={() => toggleReport('categories')}>
          <View style={[styles.reportIconWrap, { backgroundColor: '#faf5ff' }]}>
            <Ionicons name="grid" size={20} color="#8b5cf6" />
          </View>
          <Text style={styles.reportLabel}>Categories</Text>
          <Text style={styles.reportValue}>{[...new Set(inventoryItems.map(i => i.category).filter(Boolean))].length}</Text>
        </TouchableOpacity>
      </View>

      {/* Expanded report */}
      {expandedReport === 'lowStock' && lowStockItems.length > 0 && (
        <View style={styles.reportExpanded}>
          {lowStockItems.map(i => (
            <Text key={i._id || i.id} style={styles.reportItem}>• {i.name}: {i.currentStock} / {i.minStock} {i.unit}</Text>
          ))}
        </View>
      )}
      {expandedReport === 'expired' && expiredItems.length > 0 && (
        <View style={styles.reportExpanded}>
          {expiredItems.map(i => (
            <Text key={i._id || i.id} style={styles.reportItem}>
              • {i.name}: expired {new Date(i.expiryDate).toLocaleDateString('en-IN')}
            </Text>
          ))}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.md },
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#10b981',
    borderRadius: BorderRadius.large, padding: Spacing.md, marginTop: Spacing.sm,
  },
  bannerIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm,
  },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  bannerSub: { fontSize: 12, color: '#d1fae5', marginTop: 2 },
  wasteBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb',
    borderRadius: BorderRadius.medium, padding: Spacing.sm, marginTop: Spacing.sm, gap: 8,
    borderWidth: 1, borderColor: '#fde68a',
  },
  wasteText: { fontSize: 13, color: '#92400e', flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textDark, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  suggestionCard: {
    backgroundColor: '#fff', borderRadius: BorderRadius.large, padding: Spacing.md,
    marginBottom: Spacing.sm, borderLeftWidth: 4, ...Shadows.small,
  },
  suggestionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  suggestionName: { fontSize: 14, fontWeight: '700', color: Colors.textDark, flex: 1 },
  urgencyBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  urgencyText: { fontSize: 10, fontWeight: '800' },
  suggestionMeta: { flexDirection: 'row', gap: 20, marginTop: Spacing.sm },
  metaCol: {},
  metaLabel: { fontSize: 11, color: Colors.textLight },
  metaValue: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  reason: { fontSize: 12, color: Colors.textMedium, marginTop: Spacing.xs, fontStyle: 'italic' },
  wasteCard: {
    backgroundColor: '#fff', borderRadius: BorderRadius.large, padding: Spacing.md,
    marginBottom: Spacing.sm, borderLeftWidth: 4, ...Shadows.small,
  },
  wasteDetail: { fontSize: 12, color: Colors.textMedium, marginTop: 4 },
  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13, color: Colors.textLight, marginTop: 8, textAlign: 'center' },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reportCard: {
    width: '48%', backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, ...Shadows.small,
  },
  reportIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  reportLabel: { fontSize: 12, color: Colors.textLight },
  reportValue: { fontSize: 16, fontWeight: '800', color: Colors.textDark, marginTop: 2 },
  reportExpanded: {
    backgroundColor: '#f8fafc', borderRadius: BorderRadius.medium,
    padding: Spacing.md, marginTop: Spacing.xs,
  },
  reportItem: { fontSize: 12, color: Colors.textMedium, marginBottom: 4 },
});
