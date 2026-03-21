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
  Image,
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
  const [uploading, setUploading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [processingStep, setProcessingStep] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // Track which item action is loading
  const [businessType, setBusinessType] = useState('restaurant');
  const [hasDefaultMenu, setHasDefaultMenu] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    category: '',
    shortCode: '',
    isVeg: true,
    spiceLevel: 'medium',
    status: 'active',
    images: [],
    variants: [],
    customizations: [],
    // Bar fields
    spiritCategory: '',
    abv: '',
    servingUnit: '',
    bottleSize: '',
    ingredients: '',
    // Bakery fields
    unit: '',
    weight: '',
    shelfLife: '',
    mfgDate: '',
    expiryDate: '',
    // Ice cream fields
    servingSize: '',
    scoopOptions: '',
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

      const allowedRoles = ['owner', 'manager', 'cashier', 'admin'];
      if (!allowedRoles.includes(userData.role?.toLowerCase())) {
        Alert.alert(
          'Access Denied',
          'Menu management is only available for authorized staff.',
          [{ text: 'OK', onPress: () => router.back() }]
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
      setBusinessType(userData.restaurant?.businessType || 'restaurant');
      setHasDefaultMenu(!!userData.restaurant?.hasDefaultMenu);
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
        Alert.alert('Error', 'Failed to refresh menu.');
      } finally {
        setLoading(false);
      }
    }
  };

  const loadMenu = async (rid) => {
    const response = await apiClient.getMenu(rid);
    const items = response.menuItems || [];
    setMenuItems(items);

    const categorySet = new Set(['all-items']);
    items.forEach(item => {
      if (item.category) {
        categorySet.add(item.category.toLowerCase());
      }
    });

    const cats = Array.from(categorySet).map(cat => ({
      id: cat,
      name: cat === 'all-items' ? 'All Items' : cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, ' '),
    }));
    setCategories(cats);
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
        return;
      }
      if (!response.data || response.data.length === 0) {
        setUploadError('No menu data extracted. Try a clearer photo.');
        return;
      }
      const allMenuItems = response.data.flatMap((m) => m.menuItems || []);
      if (allMenuItems.length === 0) {
        setUploadError('No menu items found.');
        return;
      }
      const normalized = allMenuItems.map((it) => ({ ...it, category: toCategoryId(it.category) }));
      setProcessingStep('Saving to menu...');
      await apiClient.bulkSaveMenuItems(restaurantId, normalized, response.extractedCategories || []);
      setUploadSuccess(`${normalized.length} items added!`);
      setHasDefaultMenu(false);
      await loadMenu(restaurantId);
    } catch (error) {
      setUploadError(error.message || 'Upload failed.');
    } finally {
      setUploading(false);
      setProcessingStep('');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access required.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        await uploadAndExtract({
          uri: result.assets[0].uri,
          name: 'menu.jpg',
          type: 'image/jpeg',
        });
      }
    } catch (error) {
      setUploadError(error.message || 'Camera failed');
    }
  };

  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/csv'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        await uploadAndExtract({
          uri: asset.uri,
          name: asset.name || 'menu',
          type: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (error) {
      setUploadError(error.message || 'Upload failed');
    }
  };

  const filterItems = () => {
    let filtered = [...menuItems].filter(i => i.status !== 'deleted');

    if (selectedCategory !== 'all-items') {
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === selectedCategory
      );
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(term) ||
        item.shortCode?.toLowerCase().includes(term)
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
      shortCode: '',
      isVeg: true,
      spiceLevel: 'medium',
      status: 'active',
      images: [],
      variants: [],
      customizations: [],
      spiritCategory: '',
      abv: '',
      servingUnit: '',
      bottleSize: '',
      ingredients: '',
      unit: '',
      weight: '',
      shelfLife: '',
      mfgDate: '',
      expiryDate: '',
      servingSize: '',
      scoopOptions: '',
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
      shortCode: item.shortCode || '',
      isVeg: item.isVeg !== false,
      spiceLevel: item.spiceLevel || 'medium',
      status: item.status || 'active',
      images: item.images || [],
      variants: item.variants || [],
      customizations: item.customizations || [],
      spiritCategory: item.spiritCategory || '',
      abv: item.abv?.toString() || '',
      servingUnit: item.servingUnit || '',
      bottleSize: item.bottleSize || '',
      ingredients: item.ingredients || '',
      unit: item.unit || '',
      weight: item.weight || '',
      shelfLife: item.shelfLife?.toString() || '',
      mfgDate: item.mfgDate || '',
      expiryDate: item.expiryDate || '',
      servingSize: item.servingSize || '',
      scoopOptions: item.scoopOptions?.toString() || '',
    });
    setEditingItem(item);
    setShowAddModal(true);
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Item',
      `Delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(item.id);
              await apiClient.deleteMenuItem(item.id);
              await loadMenu(restaurantId);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  const handleToggleFavorite = async (item) => {
    try {
      setActionLoading(item.id);
      const newFavorite = !item.isFavorite;
      await apiClient.toggleMenuItemFavorite(restaurantId, item.id, newFavorite);
      setMenuItems(items =>
        items.map(i => i.id === item.id ? { ...i, isFavorite: newFavorite } : i)
      );
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      setActionLoading(item.id);
      const newAvailability = item.isAvailable === false ? true : false;
      await apiClient.toggleMenuItemAvailability(item.id, newAvailability);
      setMenuItems(items =>
        items.map(i => i.id === item.id ? { ...i, isAvailable: newAvailability } : i)
      );
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  const handleImageUpload = async (assets) => {
    if (!editingItem) {
      // For new items, just add to local state
      const newImages = assets.map(a => ({ uri: a.uri, local: true }));
      setFormData(prev => ({
        ...prev,
        images: [...(prev.images || []), ...newImages].slice(0, 4),
      }));
      return;
    }

    // For existing items, upload immediately
    try {
      setUploadingImage(true);
      const uploadFormData = new FormData();
      assets.forEach((asset, index) => {
        uploadFormData.append('images', {
          uri: asset.uri,
          name: `image_${index}.jpg`,
          type: 'image/jpeg',
        });
      });
      const response = await apiClient.uploadMenuItemImages(editingItem.id, uploadFormData);
      if (response.images) {
        setFormData(prev => ({
          ...prev,
          images: [...(prev.images || []), ...response.images].slice(0, 4),
        }));
      }
      await loadMenu(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async (index) => {
    const image = formData.images[index];

    if (image.local) {
      // Local image, just remove from state
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
      }));
      return;
    }

    if (!editingItem) return;

    try {
      setUploadingImage(true);
      await apiClient.deleteMenuItemImage(editingItem.id, index);
      setFormData(prev => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
      }));
      await loadMenu(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to delete image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.price || !formData.category) {
      Alert.alert('Required', 'Please fill name, price, and category');
      return;
    }

    try {
      const itemData = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        category: formData.category,
        shortCode: formData.shortCode || undefined,
        isVeg: formData.isVeg,
        spiceLevel: formData.spiceLevel,
        status: formData.status,
      };

      // Variants & customizations
      if (formData.variants?.length > 0) {
        itemData.variants = formData.variants
          .filter(v => v.name?.trim())
          .map(v => ({ name: v.name.trim(), price: v.price ? parseFloat(v.price) : 0 }));
      }
      if (formData.customizations?.length > 0) {
        itemData.customizations = formData.customizations
          .filter(c => c.name?.trim())
          .map(c => ({ name: c.name.trim(), price: c.price ? parseFloat(c.price) : 0 }));
      }

      // Bar fields
      if (businessType === 'bar') {
        if (formData.spiritCategory) itemData.spiritCategory = formData.spiritCategory;
        if (formData.abv) itemData.abv = parseFloat(formData.abv);
        if (formData.servingUnit) itemData.servingUnit = formData.servingUnit;
        if (formData.bottleSize) itemData.bottleSize = formData.bottleSize;
        if (formData.ingredients) itemData.ingredients = formData.ingredients;
      }

      // Bakery fields
      if (businessType === 'bakery') {
        if (formData.unit) itemData.unit = formData.unit;
        if (formData.weight) itemData.weight = formData.weight;
        if (formData.shelfLife) itemData.shelfLife = parseInt(formData.shelfLife);
        if (formData.mfgDate) itemData.mfgDate = formData.mfgDate;
        if (formData.expiryDate) itemData.expiryDate = formData.expiryDate;
      }

      // Ice cream fields
      if (businessType === 'ice_cream') {
        if (formData.servingSize) itemData.servingSize = formData.servingSize;
        if (formData.scoopOptions) itemData.scoopOptions = parseInt(formData.scoopOptions);
      }

      if (editingItem) {
        await apiClient.updateMenuItem(editingItem.id, itemData);
      } else {
        const response = await apiClient.createMenuItem(restaurantId, itemData);
        // Upload local images for new item
        const localImages = formData.images.filter(img => img.local);
        if (localImages.length > 0 && response.menuItem?.id) {
          const uploadFormData = new FormData();
          localImages.forEach((img, index) => {
            uploadFormData.append('images', {
              uri: img.uri,
              name: `image_${index}.jpg`,
              type: 'image/jpeg',
            });
          });
          await apiClient.uploadMenuItemImages(response.menuItem.id, uploadFormData);
        }
      }

      setShowAddModal(false);
      resetForm();
      setHasDefaultMenu(false);
      await loadMenu(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    }
  };

  const renderMenuItem = ({ item }) => {
    const isOutOfStock = item.isAvailable === false;
    const isLoading = actionLoading === item.id;

    return (
      <View style={[styles.menuItemCard, isOutOfStock && styles.menuItemCardOutOfStock]}>
        {/* Image */}
        {item.images?.[0] && (
          <Image
            source={{ uri: item.images[0].url }}
            style={styles.menuItemImage}
          />
        )}

        {/* Content */}
        <View style={styles.menuItemContent}>
          <View style={styles.menuItemHeader}>
            <View style={styles.menuItemTitleRow}>
              <View style={[styles.vegIndicator, { borderColor: item.isVeg !== false ? Colors.accentGreen : Colors.primary }]}>
                <View style={[styles.vegDot, { backgroundColor: item.isVeg !== false ? Colors.accentGreen : Colors.primary }]} />
              </View>
              <Text style={styles.menuItemName} numberOfLines={1}>{item.name}</Text>
              {item.isFavorite && (
                <Ionicons name="star" size={14} color={Colors.accentYellow} />
              )}
            </View>
            <Text style={styles.menuItemCategory}>{item.category || 'Uncategorized'}</Text>
          </View>

          {item.description && (
            <Text style={styles.menuItemDescription} numberOfLines={2}>{item.description}</Text>
          )}

          <View style={styles.menuItemFooter}>
            <View style={styles.priceContainer}>
              <Text style={styles.menuItemPrice}>₹{item.price}</Text>
              {item.shortCode && (
                <Text style={styles.menuItemShortCode}>#{item.shortCode}</Text>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.menuItemActions}>
              {isLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.actionBtn, item.isFavorite && styles.actionBtnActive]}
                    onPress={() => handleToggleFavorite(item)}
                  >
                    <Ionicons
                      name={item.isFavorite ? 'star' : 'star-outline'}
                      size={18}
                      color={item.isFavorite ? Colors.accentYellow : Colors.textLight}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleEdit(item)}
                  >
                    <Ionicons name="create-outline" size={18} color={Colors.info} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, isOutOfStock && styles.actionBtnOutOfStock]}
                    onPress={() => handleToggleAvailability(item)}
                  >
                    <Ionicons
                      name={isOutOfStock ? 'add-circle-outline' : 'remove-circle-outline'}
                      size={18}
                      color={isOutOfStock ? Colors.accentGreen : Colors.secondary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleDelete(item)}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {/* Status badges */}
          <View style={styles.badgeRow}>
            {isOutOfStock && (
              <View style={styles.outOfStockBadge}>
                <Text style={styles.outOfStockText}>Out of Stock</Text>
              </View>
            )}
            {item.status === 'inactive' && (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveText}>Inactive</Text>
              </View>
            )}
            {/* Type-specific badges */}
            {item.spiritCategory && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.outOfStockText, { color: '#7c3aed' }]}>{item.spiritCategory}</Text>
              </View>
            )}
            {item.abv && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.outOfStockText, { color: '#d97706' }]}>{item.abv}% ABV</Text>
              </View>
            )}
            {item.bottleSize && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#dbeafe' }]}>
                <Text style={[styles.outOfStockText, { color: '#2563eb' }]}>{item.bottleSize}</Text>
              </View>
            )}
            {item.weight && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.outOfStockText, { color: '#d97706' }]}>{item.weight}</Text>
              </View>
            )}
            {item.unit && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.outOfStockText, { color: '#d97706' }]}>per {item.unit}</Text>
              </View>
            )}
            {item.servingSize && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#ecfeff' }]}>
                <Text style={[styles.outOfStockText, { color: '#0891b2' }]}>{item.servingSize}</Text>
              </View>
            )}
            {item.variants?.length > 0 && (
              <View style={[styles.outOfStockBadge, { backgroundColor: '#f0fdf4' }]}>
                <Text style={[styles.outOfStockText, { color: '#16a34a' }]}>{item.variants.length} variants</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderCategory = ({ item }) => {
    const isSelected = selectedCategory === item.id;
    return (
      <TouchableOpacity
        style={[styles.categoryButton, isSelected && styles.categoryButtonSelected]}
        onPress={() => setSelectedCategory(item.id)}
      >
        <Text style={[styles.categoryText, isSelected && styles.categoryTextSelected]}>
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

  if (menuItems.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateCard}>
            <Ionicons name="restaurant-outline" size={56} color={Colors.primary} />
            <Text style={styles.emptyStateTitle}>Menu Management</Text>
            <Text style={styles.emptyStateSubtitle}>
              Take a photo or upload your menu. AI will extract items automatically.
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
                <Text style={styles.uploadActionLabel}>Upload</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.manualAddButton} onPress={handleAdd}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.manualAddText}>Add item manually</Text>
            </TouchableOpacity>
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
        {/* Add Modal */}
        <Modal
          visible={showAddModal}
          animationType="slide"
          onRequestClose={() => { setShowAddModal(false); resetForm(); }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => { setShowAddModal(false); resetForm(); }}
                >
                  <Ionicons name="close" size={24} color={Colors.textDark} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Add Menu Item</Text>
                <View style={styles.closeButtonPlaceholder} />
              </View>
              <MenuItemForm
                formData={formData}
                setFormData={setFormData}
                isEditing={false}
                categories={categories}
                onImageUpload={handleImageUpload}
                onImageDelete={handleImageDelete}
                uploadingImage={uploadingImage}
                businessType={businessType}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddModal(false); resetForm(); }}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSubmit}>
                  <Text style={styles.saveButtonText}>Add Item</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Menu Management</Text>
          <Text style={styles.headerSubtitle}>{filteredItems.length} of {menuItems.filter(i => i.status !== 'deleted').length} items</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={handleRefresh}>
            <Ionicons name="refresh" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleTakePhoto}>
            <Ionicons name="camera" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={handleUploadFile}>
            <Ionicons name="document-attach" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {uploadError ? <Text style={styles.inlineError}>{uploadError}</Text> : null}
      {uploadSuccess ? <Text style={styles.inlineSuccess}>{uploadSuccess}</Text> : null}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items or short code..."
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

      {/* Demo Menu Banner */}
      {hasDefaultMenu && (
        <View style={{
          backgroundColor: '#fef3c7',
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 14,
          padding: 16,
          borderWidth: 1,
          borderColor: '#f59e0b',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 20, marginRight: 8 }}>🍽️</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#92400e' }}>Sample Menu</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#78350f', lineHeight: 18, marginBottom: 14 }}>
            This is a demo menu to help you explore DineOpen. Adding your own items will automatically replace it.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={handleUploadFile}
              style={{
                flex: 1,
                backgroundColor: '#f59e0b',
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="cloud-upload" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Upload Menu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAdd}
              style={{
                flex: 1,
                backgroundColor: '#fff',
                paddingVertical: 10,
                borderRadius: 10,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 2,
                borderColor: '#f59e0b',
              }}
            >
              <Ionicons name="add" size={16} color="#92400e" />
              <Text style={{ color: '#92400e', fontWeight: '600', fontSize: 13 }}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Menu Items */}
      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No items found</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        onRequestClose={() => { setShowAddModal(false); resetForm(); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => { setShowAddModal(false); resetForm(); }}
              >
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
              </Text>
              <View style={styles.closeButtonPlaceholder} />
            </View>
            <MenuItemForm
              formData={formData}
              setFormData={setFormData}
              isEditing={!!editingItem}
              categories={categories}
              onImageUpload={handleImageUpload}
              onImageDelete={handleImageDelete}
              uploadingImage={uploadingImage}
              businessType={businessType}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddModal(false); resetForm(); }}>
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

      {/* Processing Modal */}
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
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    padding: Spacing.sm,
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  inlineError: {
    backgroundColor: '#fee2e2',
    color: Colors.error,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    fontSize: 12,
  },
  inlineSuccess: {
    backgroundColor: '#d1fae5',
    color: Colors.success,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textDark,
  },
  categoriesContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  categoryButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.backgroundWhite,
    marginRight: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryButtonSelected: {
    backgroundColor: Colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  categoryTextSelected: {
    color: '#fff',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 160,
  },
  menuItemCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  menuItemCardOutOfStock: {
    opacity: 0.7,
  },
  menuItemImage: {
    width: '100%',
    height: 140,
    backgroundColor: Colors.backgroundLight,
  },
  menuItemContent: {
    padding: Spacing.md,
  },
  menuItemHeader: {
    marginBottom: Spacing.xs,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  vegIndicator: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vegDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  menuItemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  menuItemCategory: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
    marginLeft: 20,
  },
  menuItemDescription: {
    fontSize: 13,
    color: Colors.textMedium,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  menuItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  menuItemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  menuItemShortCode: {
    fontSize: 12,
    color: Colors.textLight,
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  menuItemActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnActive: {
    backgroundColor: Colors.accentYellow + '20',
  },
  actionBtnOutOfStock: {
    backgroundColor: Colors.accentGreen + '20',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  outOfStockBadge: {
    backgroundColor: Colors.secondary + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  outOfStockText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.secondary,
  },
  inactiveBadge: {
    backgroundColor: Colors.textLight + '20',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMedium,
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
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  uploadActionButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  takePhotoButton: {
    backgroundColor: Colors.primary,
  },
  uploadFileButton: {
    backgroundColor: Colors.secondary,
  },
  uploadActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  manualAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  manualAddText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  uploadErrorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  uploadSuccessText: {
    fontSize: 12,
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
    minWidth: 180,
  },
  processingStep: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.textDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 60 : Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.backgroundWhite,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonPlaceholder: {
    width: 40,
  },
  modalActions: {
    flexDirection: 'row',
    padding: Spacing.md,
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
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
