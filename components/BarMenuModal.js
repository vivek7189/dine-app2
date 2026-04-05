import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';

export default function BarMenuModal({ visible, onClose, menuItems, activeTab, onAddItem, onUpdateQty }) {
  const { gridColumns } = useResponsive();
  const cols = gridColumns();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set();
    (menuItems || []).forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [menuItems]);

  // Build map of items already in the tab for qty badge
  const tabItemMap = useMemo(() => {
    const map = {};
    (activeTab?.items || []).forEach(item => {
      map[item.menuItemId || item.id] = item.quantity;
    });
    return map;
  }, [activeTab?.items]);

  // Filter menu items
  const filteredItems = useMemo(() => {
    let items = menuItems || [];
    if (selectedCategory !== 'All') {
      items = items.filter(i => i.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name?.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, search]);

  // Running totals from tab
  const tabItemCount = (activeTab?.items || []).reduce((sum, i) => sum + i.quantity, 0);
  const tabSubtotal = (activeTab?.items || []).reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handleClose = () => {
    setSearch('');
    setSelectedCategory('All');
    onClose();
  };

  const renderMenuItem = ({ item }) => {
    const itemId = item.id || item._id;
    const qtyInTab = tabItemMap[itemId] || 0;

    return (
      <View style={styles.menuCard}>
        <TouchableOpacity
          style={styles.menuCardInner}
          onPress={() => onAddItem(item)}
          activeOpacity={0.7}
        >
          {/* Category tag */}
          {item.category && (
            <Text style={styles.categoryTag} numberOfLines={1}>{item.category}</Text>
          )}

          {/* Item name */}
          <Text style={styles.menuItemName} numberOfLines={2}>{item.name}</Text>

          {/* Bar-specific badges */}
          {(item.spiritCategory || item.abv || item.bottleSize) && (
            <View style={styles.barBadgeRow}>
              {item.spiritCategory && (
                <View style={styles.barBadge}>
                  <Text style={styles.barBadgeText}>{item.spiritCategory}</Text>
                </View>
              )}
              {item.abv && (
                <View style={[styles.barBadge, { backgroundColor: '#fef3c7' }]}>
                  <Text style={[styles.barBadgeText, { color: '#d97706' }]}>{item.abv}%</Text>
                </View>
              )}
              {item.bottleSize && (
                <View style={[styles.barBadge, { backgroundColor: '#dbeafe' }]}>
                  <Text style={[styles.barBadgeText, { color: '#2563eb' }]}>{item.bottleSize}</Text>
                </View>
              )}
            </View>
          )}

          {/* Price */}
          <Text style={styles.menuItemPrice}>₹{(item.price || 0).toFixed(2)}</Text>

          {/* Qty badge or Add button */}
          {qtyInTab > 0 ? (
            <View style={styles.qtyBadgeRow}>
              <TouchableOpacity
                style={styles.qtySmallButton}
                onPress={() => onUpdateQty(itemId, -1)}
              >
                <Ionicons name="remove" size={14} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.qtyBadge}>
                <Text style={styles.qtyBadgeText}>{qtyInTab}</Text>
              </View>
              <TouchableOpacity
                style={styles.qtySmallButton}
                onPress={() => onUpdateQty(itemId, 1)}
              >
                <Ionicons name="add" size={14} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.addBtnRow}>
              <View style={styles.addBtn}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBtnText}>Add</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Ionicons name="chevron-back" size={24} color={Colors.textDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Add Items
            </Text>
            {activeTab?.customerInfo?.name && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {activeTab.customerInfo.name}'s Tab
              </Text>
            )}
          </View>
          <View style={styles.backButton} />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textLight} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search menu..."
              placeholderTextColor={Colors.textLight}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* Category Chips */}
        <View style={styles.categoryContainer}>
          <FlatList
            data={categories}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item}
            contentContainerStyle={styles.categoryList}
            renderItem={({ item: cat }) => {
              const isActive = cat === selectedCategory;
              const count = cat === 'All'
                ? filteredItems.length
                : (menuItems || []).filter(i => i.category === cat).length;
              return (
                <TouchableOpacity
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                  <Text style={[styles.categoryChipCount, isActive && styles.categoryChipCountActive]}>
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Menu Grid */}
        <FlatList
          data={filteredItems}
          numColumns={cols}
          key={`bar-menu-${cols}`}
          keyExtractor={(item) => item.id || item._id}
          renderItem={renderMenuItem}
          contentContainerStyle={styles.menuGrid}
          columnWrapperStyle={styles.menuRow}
          ListEmptyComponent={
            <View style={styles.emptyMenu}>
              <Ionicons name="search-outline" size={48} color={Colors.borderLight} />
              <Text style={styles.emptyMenuText}>No items found</Text>
            </View>
          }
        />

        {/* Sticky Footer */}
        <View style={styles.footer}>
          <View style={styles.footerInfo}>
            <Text style={styles.footerItemCount}>{tabItemCount} items</Text>
            <Text style={styles.footerSubtotal}>₹{tabSubtotal.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 1,
  },

  // Search
  searchContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textDark,
  },

  // Categories
  categoryContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  categoryChipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textLight,
  },
  categoryChipCountActive: {
    color: '#fff',
    opacity: 0.8,
  },

  // Menu Grid
  menuGrid: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  menuRow: {
    gap: 10,
    marginBottom: 10,
  },
  menuCard: {
    flex: 1,
    flex: 1,
  },
  menuCardInner: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  categoryTag: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    lineHeight: 20,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textDark,
  },
  barBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  barBadge: {
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  barBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7c3aed',
  },
  addBtnRow: {
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  qtyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  qtySmallButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  qtyBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  // Empty
  emptyMenu: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  emptyMenuText: {
    fontSize: 15,
    color: Colors.textMedium,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  footerInfo: {
    gap: 2,
  },
  footerItemCount: {
    fontSize: 13,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  footerSubtotal: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentGreen,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  doneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
