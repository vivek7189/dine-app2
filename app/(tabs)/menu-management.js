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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import MenuItemForm from '../../components/MenuItemForm';

const toCategoryId = (s) => (s && String(s).trim()) ? String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'other' : 'other';

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
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [processingStep, setProcessingStep] = useState('');

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
      const allowedRoles = ['owner', 'manager',"cashier"];
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

  const uploadAndExtract = async (fileInfo) => {
    if (!restaurantId || !fileInfo) return;
    try {
      setUploading(true);
      setUploadError('');
      setUploadSuccess('');
      setProcessingStep('Uploading...');
      const formData = new FormData();
      formData.append('menuFiles', fileInfo);
      setProcessingStep('Extracting menu with AI...');
      const response = await apiClient.bulkUploadMenu(restaurantId, formData);
      if (!response.success && response.success !== undefined) {
        setUploadError(response.error || 'Upload failed');
        setUploading(false);
        return;
      }
      if (!response.data || response.data.length === 0) {
        setUploadError('No menu data was extracted. Try a clearer photo or PDF.');
        setUploading(false);
        return;
      }
      const allMenuItems = response.data.flatMap((m) => m.menuItems || []);
      if (allMenuItems.length === 0) {
        setUploadError('No menu items found in the file. Try a different file.');
        setUploading(false);
        return;
      }
      const normalized = allMenuItems.map((it) => ({ ...it, category: toCategoryId(it.category) }));
      const extractedCategories = response.extractedCategories || [];
      setProcessingStep('Saving to menu...');
      await apiClient.bulkSaveMenuItems(restaurantId, normalized, extractedCategories);
      setUploadSuccess(`${normalized.length} items added to menu!`);
      await loadMenu(restaurantId);
    } catch (error) {
      console.error('Upload/extract error:', error);
      setUploadError(error.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setProcessingStep('');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take a photo of your menu.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const fileInfo = {
        uri: asset.uri,
        name: 'menu.jpg',
        type: 'image/jpeg',
      };
      await uploadAndExtract(fileInfo);
    } catch (error) {
      setUploadError(error.message || 'Camera failed');
      setUploading(false);
    }
  };

  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileInfo = {
        uri: asset.uri,
        name: asset.name || 'menu',
        type: asset.mimeType || 'image/jpeg',
      };
      await uploadAndExtract(fileInfo);
    } catch (error) {
      setUploadError(error.message || 'Upload failed');
      setUploading(false);
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

  // Empty state: no menu items — show Take Photo / Upload File
  if (menuItems.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateCard}>
            <Ionicons name="restaurant-outline" size={56} color={Colors.primary} />
            <Text style={styles.emptyStateTitle}>Menu Management</Text>
            <Text style={styles.emptyStateSubtitle}>
              Take a photo of your menu or upload a file. AI will extract items, prices, and categories.
            </Text>
            {uploadError ? <Text style={styles.uploadErrorText}>{uploadError}</Text> : null}
            {uploadSuccess ? <Text style={styles.uploadSuccessText}>{uploadSuccess}</Text> : null}
            <View style={styles.emptyStateActions}>
              <TouchableOpacity
                style={[styles.uploadActionButton, styles.takePhotoButton]}
                onPress={handleTakePhoto}
                disabled={uploading}
              >
                <Ionicons name="camera" size={28} color="#fff" />
                <Text style={styles.uploadActionLabel}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.uploadActionButton, styles.uploadFileButton]}
                onPress={handleUploadFile}
                disabled={uploading}
              >
                <Ionicons name="document-attach" size={28} color="#fff" />
                <Text style={styles.uploadActionLabel}>Upload File</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.emptyStateHint}>Images, PDF, CSV, or documents — one file at a time.</Text>
          </View>
        </View>
        {uploading && (
          <Modal visible transparent animationType="fade">
            <View style={styles.processingOverlay}>
              <View style={styles.processingCard}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.processingStep}>{processingStep}</Text>
              </View>
            </View>
          </Modal>
        )}
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
            <Ionicons name="refresh" size={24} color={Colors.primary} style={loading && { opacity: 0.5 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadIconButton} onPress={handleTakePhoto} disabled={uploading}>
            <Ionicons name="camera" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.uploadIconButton} onPress={handleUploadFile} disabled={uploading}>
            <Ionicons name="document-attach" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
      {uploadError ? <Text style={styles.inlineError}>{uploadError}</Text> : null}
      {uploadSuccess ? <Text style={styles.inlineSuccess}>{uploadSuccess}</Text> : null}

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

      {/* Floating Action Button - Add item */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleAdd}
        activeOpacity={0.9}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>

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
      {uploading && (
        <Modal visible transparent animationType="fade">
          <View style={styles.processingOverlay}>
            <View style={styles.processingCard}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.processingStep}>{processingStep}</Text>
            </View>
          </View>
        </Modal>
      )}
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
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  uploadIconButton: {
    padding: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineError: {
    backgroundColor: '#fee2e2',
    color: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
  },
  inlineSuccess: {
    backgroundColor: '#d1fae5',
    color: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  emptyStateCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.large,
    padding: Spacing.xl,
    alignItems: 'center',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyStateTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptyStateSubtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  uploadActionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 120,
  },
  takePhotoButton: {
    backgroundColor: Colors.primary,
  },
  uploadFileButton: {
    backgroundColor: Colors.secondary,
  },
  uploadActionLabel: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: '#fff',
  },
  emptyStateHint: {
    fontSize: Typography.small.fontSize,
    color: Colors.textLight,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  uploadErrorText: {
    fontSize: 13,
    color: Colors.error,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  uploadSuccessText: {
    fontSize: 13,
    color: Colors.success,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.large,
    padding: Spacing.xl,
    alignItems: 'center',
    minWidth: 200,
  },
  processingStep: {
    marginTop: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
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
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    minHeight: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundLight,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryButtonSelected: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  categoryTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
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
