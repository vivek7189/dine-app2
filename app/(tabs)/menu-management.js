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
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import MenuItemForm from '../../components/MenuItemForm';
import { useResponsive } from '../../hooks/useResponsive';
import { getDisplayImage } from '../../utils/placeholderImages';

const toCategoryId = (s) => (s && String(s).trim()) ? String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'other' : 'other';

export default function MenuManagementScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const tabletContentStyle = isTablet ? { maxWidth: 800, alignSelf: 'center', width: '100%' } : undefined;
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
  const [refreshing, setRefreshing] = useState(false);
  const [hasDefaultMenu, setHasDefaultMenu] = useState(false);
  const [multiPricingEnabled, setMultiPricingEnabled] = useState(false);
  const [activePricingRules, setActivePricingRules] = useState([]);

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
    pricingRules: {},
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

      // Load multi-tier pricing rules
      try {
        const pricingRes = await apiClient.getPricingSettings(rid);
        const mp = pricingRes?.settings?.multiPricing;
        if (mp?.enabled) {
          setMultiPricingEnabled(true);
          setActivePricingRules((mp.rules || []).filter(r => r.isActive));
        }
      } catch { /* backward compatible */ }

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
        setRefreshing(true);
        // Invalidate in-memory cache so we get fresh data from server
        apiClient.invalidateCache(`/api/menus/${restaurantId}`);
        await loadMenu(restaurantId);
      } catch (error) {
        Alert.alert('Error', 'Failed to refresh menu.');
      } finally {
        setRefreshing(false);
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

  const handleUploadFile = () => {
    Alert.alert(
      'Upload Menu',
      'Choose a file type to upload your menu from',
      [
        {
          text: 'Photo from Gallery',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
              });
              if (!result.canceled && result.assets?.[0]) {
                await uploadAndExtract({
                  uri: result.assets[0].uri,
                  name: 'menu.jpg',
                  type: 'image/jpeg',
                });
              }
            } catch (error) {
              setUploadError(error.message || 'Upload failed');
            }
          },
        },
        {
          text: 'PDF or CSV File',
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/csv'],
                copyToCacheDirectory: true,
              });
              if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                await uploadAndExtract({
                  uri: asset.uri,
                  name: asset.name || 'menu',
                  type: asset.mimeType || 'application/pdf',
                });
              }
            } catch (error) {
              setUploadError(error.message || 'Upload failed');
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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
      pricingRules: {},
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
      pricingRules: item.pricingRules || {},
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

      // Multi-tier pricing rules (per-item)
      if (multiPricingEnabled && formData.pricingRules) {
        const cleaned = {};
        Object.entries(formData.pricingRules).forEach(([ruleId, val]) => {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed >= 0) cleaned[ruleId] = parsed;
        });
        if (Object.keys(cleaned).length > 0) itemData.pricingRules = cleaned;
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
        <Image
          source={{ uri: getDisplayImage(item) }}
          style={styles.menuItemImage}
        />

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
                multiPricingEnabled={multiPricingEnabled}
                activePricingRules={activePricingRules}
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
      {/* Clean Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Menu Management</Text>
          <Text style={styles.headerSubtitle}>{filteredItems.length} of {menuItems.filter(i => i.status !== 'deleted').length} items</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#eef2ff' }]} onPress={handleRefresh} disabled={refreshing}>
            <Ionicons name="sync-outline" size={20} color={refreshing ? '#d1d5db' : '#6366f1'} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#ecfdf5' }]} onPress={handleTakePhoto}>
            <Ionicons name="camera-outline" size={20} color="#10b981" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, { backgroundColor: '#fffbeb' }]} onPress={handleUploadFile}>
            <Ionicons name="cloud-upload-outline" size={20} color="#f59e0b" />
          </TouchableOpacity>
        </View>
      </View>

      {uploadError ? <Text style={styles.inlineError}>{uploadError}</Text> : null}
      {uploadSuccess ? <Text style={styles.inlineSuccess}>{uploadSuccess}</Text> : null}

      {/* Pill Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchPill}>
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items or short code..."
            placeholderTextColor="#9ca3af"
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity onPress={() => setSearchTerm('')}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
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
        contentContainerStyle={[styles.list, tabletContentStyle]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
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
              multiPricingEnabled={multiPricingEnabled}
              activePricingRules={activePricingRules}
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
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  inlineError: {
    backgroundColor: '#fef2f2',
    color: '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  inlineSuccess: {
    backgroundColor: '#f0fdf4',
    color: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
    padding: 0,
    fontWeight: '500',
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingRight: 32,
    paddingVertical: 10,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 36,
  },
  categoryButtonSelected: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 18,
  },
  categoryTextSelected: {
    color: '#fff',
  },
  list: {
    padding: 16,
    paddingBottom: 160,
  },
  menuItemCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  menuItemCardOutOfStock: {
    opacity: 0.6,
  },
  menuItemImage: {
    width: '100%',
    height: 160,
    backgroundColor: '#f9fafb',
  },
  menuItemContent: {
    padding: 14,
  },
  menuItemHeader: {
    marginBottom: 6,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontWeight: '700',
    color: '#1f2937',
  },
  menuItemCategory: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    marginLeft: 22,
  },
  menuItemDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
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
    gap: 8,
  },
  menuItemPrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
  },
  menuItemShortCode: {
    fontSize: 11,
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '600',
  },
  menuItemActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  actionBtnActive: {
    backgroundColor: '#fef9c3',
    borderColor: '#fde68a',
  },
  actionBtnOutOfStock: {
    backgroundColor: '#ecfdf5',
    borderColor: '#d1fae5',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  outOfStockBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  outOfStockText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ef4444',
  },
  inactiveBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  inactiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: '#9ca3af',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    fontWeight: '500',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyStateCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1f2937',
    marginTop: 16,
    letterSpacing: -0.3,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  uploadActionButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
    gap: 6,
  },
  takePhotoButton: {
    backgroundColor: '#10b981',
  },
  uploadFileButton: {
    backgroundColor: '#3b82f6',
  },
  uploadActionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  manualAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingVertical: 8,
  },
  manualAddText: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  uploadErrorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 16,
    textAlign: 'center',
  },
  uploadSuccessText: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 16,
    textAlign: 'center',
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  processingStep: {
    marginTop: 16,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 60 : 32,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonPlaceholder: {
    width: 40,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#10b981',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
