import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import MenuItemForm from '../../components/MenuItemForm';

export default function MenuManagementScreen() {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all-items');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    isVeg: true,
    spiceLevel: 'medium',
    status: 'active',
  });

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const checkAccessAndLoad = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      // Check if user has access to menu management (owner or manager only)
      const allowedRoles = ['owner', 'manager'];
      if (!allowedRoles.includes(userData.role?.toLowerCase())) {
        Alert.alert(
          'Access Denied',
          'Menu management is only available for owners and managers.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
        return;
      }

      await loadInitialData();
    } catch (error) {
      console.error('Error checking access:', error);
      router.replace('/(auth)/login');
    }
  };

  useEffect(() => {
    filterItems();
  }, [selectedCategory, searchTerm, menuItems]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        Alert.alert('Error', 'No restaurant assigned.');
        return;
      }

      setRestaurantId(rid);
      await loadMenu(rid);
    } catch (error) {
      console.error('Error loading menu:', error);
      Alert.alert('Error', 'Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (restaurantId) {
      try {
        setLoading(true);
        await loadMenu(restaurantId);
      } catch (error) {
        console.error('Error refreshing menu:', error);
        Alert.alert('Error', 'Failed to refresh menu.');
      } finally {
        setLoading(false);
      }
    }
  };

  const loadMenu = async (rid) => {
    try {
      const response = await apiClient.getMenu(rid);
      const items = response.menuItems || [];
      setMenuItems(items);

      // Extract unique categories
      const categorySet = new Set(['all-items']);
      items.forEach(item => {
        if (item.category) {
          categorySet.add(item.category.toLowerCase());
        }
      });

      const cats = Array.from(categorySet).map(cat => ({
        id: cat,
        name: cat === 'all-items' ? 'All Items' : cat.charAt(0).toUpperCase() + cat.slice(1),
      }));
      setCategories(cats);
    } catch (error) {
      console.error('Error loading menu:', error);
      throw error;
    }
  };

  const filterItems = () => {
    let filtered = [...menuItems];

    if (selectedCategory !== 'all-items') {
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === selectedCategory
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }

    setFilteredItems(filtered);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      price: '',
      category: '',
      isVeg: true,
      spiceLevel: 'medium',
      status: 'active',
    });
    setEditingItem(null);
  };

  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleEdit = (item) => {
    setFormData({
      name: item.name || '',
      description: item.description || '',
      price: item.price?.toString() || '',
      category: item.category || '',
      isVeg: item.isVeg !== false,
      spiceLevel: item.spiceLevel || 'medium',
      status: item.status || 'active',
    });
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Menu Item',
      `Are you sure you want to delete "${item.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteMenuItem(item.id);
              setMenuItems(items => items.filter(i => i.id !== item.id));
              Alert.alert('Success', 'Menu item deleted successfully');
              await loadMenu(restaurantId);
            } catch (error) {
              console.error('Error deleting item:', error);
              Alert.alert('Error', error.message || 'Failed to delete menu item');
            }
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.price || !formData.category) {
      Alert.alert('Validation Error', 'Please fill in name, price, and category');
      return;
    }

    try {
      const itemData = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        isVeg: formData.isVeg,
        spiceLevel: formData.spiceLevel,
        status: formData.status,
      };

      if (editingItem) {
        await apiClient.updateMenuItem(editingItem.id, itemData);
        Alert.alert('Success', 'Menu item updated successfully');
      } else {
        await apiClient.createMenuItem(restaurantId, itemData);
        Alert.alert('Success', 'Menu item added successfully');
      }

      setShowAddModal(false);
      resetForm();
      await loadMenu(restaurantId);
    } catch (error) {
      console.error('Error saving item:', error);
      Alert.alert('Error', error.message || 'Failed to save menu item');
    }
  };

  const renderMenuItem = ({ item }) => (
    <View style={styles.menuItemCard}>
      <View style={styles.menuItemHeader}>
        <View style={styles.menuItemInfo}>
          <Text style={styles.menuItemName}>{item.name}</Text>
          <Text style={styles.menuItemCategory}>{item.category || 'Uncategorized'}</Text>
        </View>
        <View style={styles.menuItemActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleEdit(item)}
          >
            <Ionicons name="create-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
      {item.description && (
        <Text style={styles.menuItemDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}
      <View style={styles.menuItemFooter}>
        <Text style={styles.menuItemPrice}>₹{item.price}</Text>
        <View style={styles.menuItemBadges}>
          {item.isVeg !== false && (
            <View style={styles.vegBadge}>
              <Text style={styles.vegText}>VEG</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? Colors.accentGreen + '20' : Colors.textLight + '20' }]}>
            <Text style={[styles.statusText, { color: item.status === 'active' ? Colors.accentGreen : Colors.textLight }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderCategory = ({ item }) => {
    const isSelected = selectedCategory === item.id;
    return (
      <TouchableOpacity
        style={[styles.categoryButton, isSelected && styles.categoryButtonSelected]}
        onPress={() => setSelectedCategory(item.id)}
      >
        <Text
          style={[
            styles.categoryText,
            isSelected && styles.categoryTextSelected,
          ]}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading menu...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Menu Management</Text>
          <Text style={styles.headerSubtitle}>{menuItems.length} items</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={loading}
          >
            <Ionicons
              name="refresh"
              size={24}
              color={Colors.primary}
              style={loading && { opacity: 0.5 }}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleAdd}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search menu items..."
          placeholderTextColor={Colors.textLight}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
        {searchTerm.length > 0 && (
          <TouchableOpacity onPress={() => setSearchTerm('')}>
            <Ionicons name="close-circle" size={20} color={Colors.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Categories */}
      <FlatList
        horizontal
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoriesContainer}
      />

      {/* Menu Items List */}
      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No items found</Text>
            <Text style={styles.emptySubtext}>
              {searchTerm ? 'Try a different search term' : 'Add your first menu item'}
            </Text>
          </View>
        }
      />

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowAddModal(false);
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <MenuItemForm
              formData={formData}
              setFormData={setFormData}
              isEditing={!!editingItem}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSubmit}>
                <Text style={styles.saveButtonText}>
                  {editingItem ? 'Update' : 'Add'} Item
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  refreshButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginTop: 2,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
  },
  categoriesContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundLight,
    marginRight: Spacing.sm,
  },
  categoryButtonSelected: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  categoryTextSelected: {
    color: '#fff',
  },
  list: {
    padding: Spacing.md,
  },
  menuItemCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.textDark,
    marginBottom: 4,
  },
  menuItemCategory: {
    fontSize: Typography.small.fontSize,
    color: Colors.textMedium,
  },
  menuItemActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  menuItemDescription: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: Spacing.sm,
  },
  menuItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  menuItemPrice: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.primary,
  },
  menuItemBadges: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  vegBadge: {
    backgroundColor: Colors.accentGreen,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.small,
  },
  vegText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.small,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
  },
  modalActions: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.textDark,
  },
  saveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: '#fff',
  },
});
