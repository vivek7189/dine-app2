import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const SORT_OPTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'stock', label: 'Stock' },
  { key: 'category', label: 'Category' },
  { key: 'cost', label: 'Cost' },
];

export default function StockTab({
  filteredSortedItems, inventoryItems, categories, todayUsageSummary,
  searchTerm, setSearchTerm, selectedCategory, setSelectedCategory,
  sortBy, setSortBy, sortOrder, setSortOrder,
  totalItems, lowStockCount, totalValue, categoryCount,
  getStockStatus, getStockColor, getStockPercent,
  handleEditItem, handleDeleteItem, openAddItem,
}) {
  const [expandedMenu, setExpandedMenu] = useState(null);

  const getTodayUsage = (itemId) => {
    const u = todayUsageSummary.find(s => s.inventoryItemId === itemId);
    return u ? Number(u.totalQuantity || u.quantity || 0) : 0;
  };

  const renderItem = ({ item }) => {
    const status = getStockStatus(item);
    const color = getStockColor(status);
    const pct = getStockPercent(item);
    const id = item._id || item.id;
    const usage = getTodayUsage(id);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{item.name}</Text>
            {item.category && (
              <View style={[styles.categoryBadge, { backgroundColor: color + '15' }]}>
                <Text style={[styles.categoryText, { color }]}>{item.category}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setExpandedMenu(expandedMenu === id ? null : id)}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        </View>

        {expandedMenu === id && (
          <View style={styles.menuDropdown}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setExpandedMenu(null); handleEditItem(item); }}
            >
              <Ionicons name="create-outline" size={16} color="#3b82f6" />
              <Text style={[styles.menuItemText, { color: '#3b82f6' }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setExpandedMenu(null); handleDeleteItem(item); }}
            >
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
              <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Stock bar */}
        <View style={styles.barRow}>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
          </View>
          <Text style={[styles.stockLabel, { color }]}>
            {Number(item.currentStock) || 0} {item.unit}
          </Text>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Min</Text>
            <Text style={styles.metaValue}>{item.minStock || 0}</Text>
          </View>
          {item.maxStock ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Max</Text>
              <Text style={styles.metaValue}>{item.maxStock}</Text>
            </View>
          ) : null}
          {usage > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Today</Text>
              <Text style={[styles.metaValue, { color: '#ef4444' }]}>-{usage}</Text>
            </View>
          )}
          {Number(item.wastedQty) > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Wasted</Text>
              <Text style={[styles.metaValue, { color: '#ea580c' }]}>
                {item.wastedQty} {item.unit}
              </Text>
            </View>
          )}
          {Number(item.costPerUnit) > 0 && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Cost</Text>
              <Text style={styles.metaValue}>{'\u20B9'}{item.costPerUnit}</Text>
            </View>
          )}
          {item.supplier && (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Supplier</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{item.supplier}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Compact stats */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.statsRow}
        contentContainerStyle={styles.statsRowContent}
      >
        <View style={[styles.statChip, { backgroundColor: '#eff6ff' }]}>
          <Text style={[styles.statNum, { color: '#3b82f6' }]}>{totalItems}</Text>
          <Text style={styles.statChipLabel}>Items</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#fef2f2' }]}>
          <Text style={[styles.statNum, { color: '#ef4444' }]}>{lowStockCount}</Text>
          <Text style={styles.statChipLabel}>Low</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#f0fdf4' }]}>
          <Text style={[styles.statNum, { color: '#10b981' }]}>{'\u20B9'}{(totalValue / 1000).toFixed(1)}k</Text>
          <Text style={styles.statChipLabel}>Value</Text>
        </View>
        <View style={[styles.statChip, { backgroundColor: '#faf5ff' }]}>
          <Text style={[styles.statNum, { color: '#8b5cf6' }]}>{categoryCount}</Text>
          <Text style={styles.statChipLabel}>Categories</Text>
        </View>
      </ScrollView>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={Colors.textLight}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm ? (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        <TouchableOpacity
          style={[styles.chip, selectedCategory === 'all' && styles.chipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.chipText, selectedCategory === 'all' && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {(categories.length > 0 ? categories : [...new Set(inventoryItems.map(i => i.category).filter(Boolean))]).map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.chip, selectedCategory === cat && styles.chipActive]}
            onPress={() => setSelectedCategory(selectedCategory === cat ? 'all' : cat)}
          >
            <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {SORT_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
            onPress={() => {
              if (sortBy === opt.key) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              else { setSortBy(opt.key); setSortOrder('asc'); }
            }}
          >
            <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>{opt.label}</Text>
            {sortBy === opt.key && (
              <Ionicons name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} color="#3b82f6" />
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Items list */}
      <FlatList
        data={filteredSortedItems}
        keyExtractor={item => item._id || item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: Spacing.md }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No inventory items found</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAddItem}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsRow: { flexShrink: 0, paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, marginBottom: Spacing.sm },
  statsRowContent: { alignItems: 'center', paddingRight: Spacing.md },
  statChip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8, marginRight: Spacing.xs,
  },
  statNum: { fontSize: 14, fontWeight: '800', marginRight: 4 },
  statChipLabel: { fontSize: 12, color: Colors.textLight },
  searchRow: { flexShrink: 0, paddingHorizontal: Spacing.md, paddingTop: Spacing.xs },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9',
    borderRadius: BorderRadius.large, paddingHorizontal: 12, height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark, marginLeft: 8 },
  chipRow: { flexShrink: 0, paddingHorizontal: Spacing.md, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  chipRowContent: { alignItems: 'center', paddingRight: Spacing.md },
  sortRow: { flexShrink: 0, paddingHorizontal: Spacing.md, marginTop: Spacing.xs, marginBottom: Spacing.sm },
  chip: {
    borderRadius: 16, borderWidth: 1, borderColor: Colors.borderLight,
    paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { fontSize: 12, color: Colors.textMedium, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  sortChip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    borderWidth: 1, borderColor: Colors.borderLight, paddingHorizontal: 12,
    paddingVertical: 5, marginRight: 6, backgroundColor: '#fff',
  },
  sortChipActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  sortChipText: { fontSize: 12, color: Colors.textMedium, fontWeight: '500' },
  sortChipTextActive: { color: '#3b82f6' },
  card: {
    backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, marginTop: Spacing.sm, ...Shadows.small,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  categoryBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  categoryText: { fontSize: 11, fontWeight: '600' },
  menuBtn: { padding: 4 },
  menuDropdown: {
    position: 'absolute', right: 12, top: 36, backgroundColor: '#fff',
    borderRadius: BorderRadius.medium, ...Shadows.medium, zIndex: 10, overflow: 'hidden',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  menuItemText: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  barBg: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
  barFill: { height: 8, borderRadius: 4 },
  stockLabel: { fontSize: 13, fontWeight: '700', marginLeft: 8, minWidth: 55, textAlign: 'right' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  metaItem: {},
  metaLabel: { fontSize: 10, color: Colors.textLight },
  metaValue: { fontSize: 12, fontWeight: '600', color: Colors.textDark },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: Colors.textLight, marginTop: Spacing.sm },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6',
    borderRadius: BorderRadius.large, paddingHorizontal: 16, paddingVertical: 10, marginTop: Spacing.md,
  },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
});
