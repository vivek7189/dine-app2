import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const RECIPE_COLORS = {
  'Main Course': '#ef4444', 'Appetizer': '#f59e0b', 'Dessert': '#ec4899',
  'Beverage': '#3b82f6', 'Salad': '#10b981', 'Soup': '#8b5cf6',
  'Bread': '#d97706', 'Sauce': '#6366f1', 'Side Dish': '#14b8a6',
};

export default function RecipesTab({
  recipes, inventoryItems,
  openAddRecipe, openEditRecipe, openViewRecipe, handleDeleteRecipe,
  getCostPerServing,
}) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  const recipeCats = [...new Set(recipes.map(r => r.category).filter(Boolean))];

  const filtered = recipes.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !search || r.name?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q);
    const matchCat = filterCat === 'all' || r.category === filterCat;
    return matchSearch && matchCat;
  });

  const renderRecipe = ({ item }) => {
    const color = RECIPE_COLORS[item.category] || '#6b7280';
    const cost = getCostPerServing(item);
    const ingredients = item.ingredients || [];

    return (
      <View style={styles.card}>
        <View style={[styles.colorStrip, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.recipeName}>{item.name}</Text>
              {item.category && (
                <View style={[styles.catBadge, { backgroundColor: color + '18' }]}>
                  <Text style={[styles.catBadgeText, { color }]}>{item.category}</Text>
                </View>
              )}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => openViewRecipe(item)}>
                <Ionicons name="eye-outline" size={17} color="#3b82f6" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => openEditRecipe(item)}>
                <Ionicons name="create-outline" size={17} color="#f59e0b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleDeleteRecipe(item)}>
                <Ionicons name="trash-outline" size={17} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {item.servings > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="people-outline" size={14} color={Colors.textLight} />
                <Text style={styles.statText}>{item.servings} srv</Text>
              </View>
            )}
            {item.prepTime > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="timer-outline" size={14} color={Colors.textLight} />
                <Text style={styles.statText}>{item.prepTime}m prep</Text>
              </View>
            )}
            {item.cookTime > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="flame-outline" size={14} color={Colors.textLight} />
                <Text style={styles.statText}>{item.cookTime}m cook</Text>
              </View>
            )}
          </View>

          {/* Ingredients pills */}
          {ingredients.length > 0 && (
            <View style={styles.ingredientRow}>
              {ingredients.slice(0, 3).map((ing, idx) => (
                <View key={idx} style={styles.ingredientPill}>
                  <Text style={styles.ingredientText} numberOfLines={1}>
                    {ing.inventoryItemName || ing.name || 'Item'}
                  </Text>
                </View>
              ))}
              {ingredients.length > 3 && (
                <View style={styles.morePill}>
                  <Text style={styles.moreText}>+{ingredients.length - 3}</Text>
                </View>
              )}
            </View>
          )}

          {/* Description */}
          {item.description ? (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          ) : null}

          {/* Cost per serving */}
          {cost > 0 && (
            <View style={styles.costRow}>
              <Ionicons name="pricetag-outline" size={14} color="#10b981" />
              <Text style={styles.costText}>{'\u20B9'}{cost.toFixed(2)} / serving</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerCount}>{recipes.length} Recipes</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAddRecipe}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Recipe</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={Colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textLight} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Category filter */}
      {recipeCats.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, filterCat === 'all' && styles.chipActive]}
            onPress={() => setFilterCat('all')}
          >
            <Text style={[styles.chipText, filterCat === 'all' && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {recipeCats.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, filterCat === cat && styles.chipActive]}
              onPress={() => setFilterCat(filterCat === cat ? 'all' : cat)}
            >
              <Text style={[styles.chipText, filterCat === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        keyExtractor={item => item._id || item.id}
        renderItem={renderRecipe}
        contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: Spacing.md }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No recipes found</Text>
            <TouchableOpacity style={styles.addBtn} onPress={openAddRecipe}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Recipe</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
  },
  headerCount: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9',
    borderRadius: BorderRadius.large, paddingHorizontal: 12, height: 40,
    marginHorizontal: Spacing.md, marginTop: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark, marginLeft: 8 },
  chipRow: { paddingHorizontal: Spacing.md, marginTop: Spacing.xs, maxHeight: 38 },
  chip: {
    borderRadius: 16, borderWidth: 1, borderColor: Colors.borderLight,
    paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { fontSize: 12, color: Colors.textMedium, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  card: { borderRadius: BorderRadius.large, overflow: 'hidden', marginTop: Spacing.sm, ...Shadows.small },
  colorStrip: { height: 4 },
  cardBody: { backgroundColor: '#fff', padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  recipeName: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  catBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 4 },
  catBadgeText: { fontSize: 11, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f8fafc',
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: Spacing.sm },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12, color: Colors.textLight },
  ingredientRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.sm },
  ingredientPill: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  ingredientText: { fontSize: 11, color: Colors.textMedium, maxWidth: 80 },
  morePill: { backgroundColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  moreText: { fontSize: 11, color: Colors.textMedium, fontWeight: '600' },
  description: { fontSize: 13, color: Colors.textLight, marginTop: Spacing.xs, lineHeight: 18 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm },
  costText: { fontSize: 13, fontWeight: '700', color: '#10b981' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, color: Colors.textLight, marginTop: Spacing.sm, marginBottom: Spacing.md },
});
