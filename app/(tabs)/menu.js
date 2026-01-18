import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { getDisplayImage } from '../../utils/placeholderImages';
import VoiceOrderModal from '../../components/VoiceOrderModal';
import CartModal from '../../components/CartModal';
import WaiterCartModal from '../../components/WaiterCartModal';

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all-items');
  const [searchTerm, setSearchTerm] = useState('');
  const [shortCodeSearch, setShortCodeSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [sendingOrder, setSendingOrder] = useState(false);
  const [isWaiter, setIsWaiter] = useState(false);
  const [showImages, setShowImages] = useState(true);
  const [existingOrderId, setExistingOrderId] = useState(null);

  useEffect(() => {
    loadInitialData();
    loadImagePreference();
  }, []);

  const loadImagePreference = async () => {
    try {
      const saved = await AsyncStorage.getItem('menu_show_images');
      if (saved !== null) {
        setShowImages(saved === 'true');
      }
    } catch (error) {
      console.error('Error loading image preference:', error);
    }
  };

  const toggleImages = async () => {
    const newValue = !showImages;
    setShowImages(newValue);
    try {
      await AsyncStorage.setItem('menu_show_images', newValue.toString());
    } catch (error) {
      console.error('Error saving image preference:', error);
    }
  };

  useEffect(() => {
    if (params.tableId && params.tableNumber) {
      setSelectedTable({ id: params.tableId, name: params.tableNumber });
    }
    
    // Handle existing order items from params
    if (params.existingOrder === 'true' && params.cartItems) {
      try {
        const existingItems = JSON.parse(params.cartItems);
        setCart(existingItems);
        if (params.orderId) {
          setExistingOrderId(params.orderId);
        }
      } catch (error) {
        console.error('Error parsing cart items:', error);
      }
    }
  }, [params.tableId, params.tableNumber, params.existingOrder, params.cartItems, params.orderId]);

  // Use useMemo instead of useEffect to prevent infinite loops
  const filteredItems = useMemo(() => {
    let filtered = [...menuItems];

    // Filter by category
    if (selectedCategory !== 'all-items') {
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === selectedCategory
      );
    }

    // Filter by search term (name or description)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }

    // Filter by short code
    if (shortCodeSearch.trim()) {
      const code = shortCodeSearch.toLowerCase();
      filtered = filtered.filter(item =>
        item.shortCode?.toLowerCase().includes(code) ||
        item.name?.toLowerCase().startsWith(code)
      );
    }

    // Filter only active items
    filtered = filtered.filter(item => item.status === 'active');

    return filtered;
  }, [selectedCategory, searchTerm, shortCodeSearch, menuItems]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      // Check if user is waiter (not owner/manager)
      const userRole = userData.role?.toLowerCase();
      setIsWaiter(userRole === 'waiter' || userRole === 'employee');

      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        Alert.alert('Error', 'No restaurant assigned.');
        return;
      }

      setRestaurantId(rid);
      setRestaurantName(userData.restaurant?.name || 'Restaurant');
      await loadMenu(rid);
    } catch (error) {
      console.error('Error loading menu:', error);
      Alert.alert('Error', 'Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadMenu = async (rid) => {
    try {
      const response = await apiClient.getMenu(rid);
      const items = response.menuItems || [];
      setMenuItems(items);

      // Generate categories
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


  const addToCart = (item) => {
    const existingItem = cart.find(cartItem => cartItem.id === item.id);

    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem.id === item.id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ));
    } else {
      setCart([...cart, {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        menuItemId: item.id,
      }]);
    }
  };

  const removeFromCart = (itemId) => {
    setCart(cart.filter(item => item.id !== itemId));
  };

  const updateCartQuantity = (itemId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(itemId);
    } else {
      setCart(cart.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      ));
    }
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before sending to kitchen.');
      return;
    }

    if (!selectedTable && !params.tableNumber) {
      Alert.alert('Select Table', 'Please select a table first.');
      return;
    }

    setSendingOrder(true);

    try {
      const tableId = selectedTable?.id || params.tableId;
      const tableNumber = selectedTable?.name || params.tableNumber;
      let response;
      let orderId;

      if (existingOrderId) {
        // Update existing order
        const orderData = {
          items: cart.map(item => ({
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
          status: 'confirmed', // Send directly to kitchen
        };

        response = await apiClient.updateOrder(existingOrderId, orderData);
        orderId = existingOrderId;
      } else {
        // Create new order
        const orderData = {
          restaurantId,
          tableNumber: tableNumber,
          items: cart.map(item => ({
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
          orderType: 'dine-in',
          paymentMethod: 'cash',
          status: 'confirmed', // Send directly to kitchen
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Waiter',
          },
        };

        response = await apiClient.createOrder(orderData);
        orderId = response.order?.id;
      }

      // Update table status to occupied in background (don't wait)
      if (tableId && restaurantId) {
        apiClient.updateTableStatus(tableId, 'occupied', orderId, restaurantId).catch(err => {
          console.error('Error updating table status:', err);
          // Don't block user, just log error
        });
      }

      // Show success and redirect immediately
      const orderNumber = response.order?.dailyOrderId || orderId?.slice(-6);
      Alert.alert(
        existingOrderId ? 'Order Updated! 👨‍🍳' : 'Order Sent to Kitchen! 👨‍🍳',
        existingOrderId 
          ? `Order #${orderNumber} has been updated and sent to kitchen.`
          : `Order #${orderNumber} has been sent to kitchen.`,
        [
          {
            text: 'OK',
            onPress: () => {
              setCart([]);
              setShowCart(false);
              setExistingOrderId(null);
              // Redirect to tables screen with table update info for optimistic update
              router.replace({
                pathname: '/(tabs)/tables',
                params: { 
                  tableId: tableId,
                  orderId: orderId,
                  tableStatus: 'occupied',
                  tableNumber: tableNumber,
                },
              });
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error sending order:', error);
      Alert.alert('Error', error.message || 'Failed to send order to kitchen. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  const handlePlaceOrder = async () => {
    // For admin/manager - full billing flow
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before placing order.');
      return;
    }

    if (!selectedTable && !params.tableNumber) {
      Alert.alert('Select Table', 'Please select a table first.');
      return;
    }

    try {
      const orderData = {
        restaurantId,
        tableNumber: selectedTable?.name || params.tableNumber,
        items: cart.map(item => ({
          menuItemId: item.menuItemId || item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        orderType: 'dine-in',
        paymentMethod: 'cash',
        status: 'confirmed',
        staffInfo: {
          waiterId: user?.id,
          waiterName: user?.name || 'Waiter',
        },
      };

      const response = await apiClient.createOrder(orderData);

      Alert.alert('Success', 'Order placed successfully!', [
        {
          text: 'OK',
          onPress: () => {
            setCart([]);
            setShowCart(false);
            router.push('/(tabs)/orders');
          },
        },
      ]);
    } catch (error) {
      console.error('Error placing order:', error);
      Alert.alert('Error', error.message || 'Failed to place order. Please try again.');
    }
  };

  const handleBack = () => {
    router.back();
  };

  const getItemImage = (item) => {
    if (!showImages) return null;
    // Use the placeholder images utility which handles all cases
    return getDisplayImage(item, 'https://dineopen.com');
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Main Course';
  };

  const renderMenuItem = ({ item }) => {
    const cartItem = cart.find(c => c.id === item.id);
    const quantity = cartItem?.quantity || 0;
    const imageUrl = showImages ? getItemImage(item) : null;
    const isVeg = item.isVeg !== false;
    const hasImage = imageUrl !== null;

    // Modern Design with Full Image Background (when image exists)
    if (hasImage) {
      return (
        <TouchableOpacity
          style={styles.menuItemCardImage}
          onPress={() => addToCart(item)}
          activeOpacity={0.9}
        >
          {/* Full Background Image */}
          <View style={styles.fullImageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.fullImage}
              resizeMode="cover"
            />
            {/* Dark Gradient Overlay - Simulated with multiple layers */}
            <View style={styles.darkGradientOverlay} />
            <View style={styles.darkGradientOverlayBottom} />
          </View>

          {/* Veg/Non-Veg Badge - Top Left */}
          <View style={[styles.vegBadgeImage, { backgroundColor: isVeg ? '#22c55e' : '#ef4444' }]}>
            <Ionicons 
              name={isVeg ? "leaf" : "nutrition"} 
              size={8} 
              color="#fff" 
            />
          </View>

          {/* Top Right Badges */}
          <View style={styles.topRightBadges}>
            {item.shortCode && (
              <View style={styles.shortCodeBadgeImage}>
                <Text style={styles.shortCodeTextImage}>{item.shortCode}</Text>
              </View>
            )}
          </View>

          {/* Bottom Content - Overlaid on image */}
          <View style={styles.bottomContentOverlay}>
            <Text style={styles.menuItemNameImage} numberOfLines={2}>
              {item.name}
            </Text>
            
            <View style={styles.priceAddRow}>
              <Text style={styles.menuItemPriceImage}>₹{item.price}</Text>
              {quantity > 0 ? (
                <View style={styles.quantityControlsImage}>
                  <TouchableOpacity
                    style={styles.quantityButtonImage}
                    onPress={(e) => {
                      e.stopPropagation();
                      updateCartQuantity(item.id, quantity - 1);
                    }}
                  >
                    <Ionicons name="remove" size={9} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.quantityTextImage}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.quantityButtonImage}
                    onPress={(e) => {
                      e.stopPropagation();
                      updateCartQuantity(item.id, quantity + 1);
                    }}
                  >
                    <Ionicons name="add" size={9} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addButtonImage}
                  onPress={(e) => {
                    e.stopPropagation();
                    addToCart(item);
                  }}
                >
                  <Ionicons name="add" size={8} color="#1f2937" />
                  <Text style={styles.addButtonText}>ADD</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Fallback Design (no image)
    return (
      <TouchableOpacity
        style={[styles.menuItemCardNoImage, { borderTopColor: isVeg ? '#22c55e' : '#ef4444' }]}
        onPress={() => addToCart(item)}
        activeOpacity={0.9}
      >
        {/* Veg/Non-Veg Badge - Top Left */}
        <View style={[styles.vegBadgeNoImage, { backgroundColor: isVeg ? '#22c55e' : '#ef4444' }]}>
          <Ionicons 
            name={isVeg ? "leaf" : "nutrition"} 
            size={9} 
            color="#fff" 
          />
        </View>

        {/* Top Right Badges */}
        <View style={styles.topRightBadgesNoImage}>
          {item.shortCode && (
            <View style={styles.shortCodeBadgeNoImage}>
              <Text style={styles.shortCodeTextNoImage}>{item.shortCode}</Text>
            </View>
          )}
        </View>

        {/* Main Content */}
        <View style={styles.contentNoImage}>
          <Text style={styles.menuItemNameNoImage} numberOfLines={2}>
            {item.name}
          </Text>
          {item.description && (
            <Text style={styles.menuItemDescriptionNoImage} numberOfLines={1}>
              {item.description}
            </Text>
          )}
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSectionNoImage}>
          <Text style={styles.menuItemPriceNoImage}>₹{item.price}</Text>
          {quantity > 0 ? (
            <View style={styles.quantityControlsNoImage}>
              <TouchableOpacity
                style={styles.quantityButtonNoImage}
                onPress={(e) => {
                  e.stopPropagation();
                  updateCartQuantity(item.id, quantity - 1);
                }}
              >
                <Ionicons name="remove" size={10} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.quantityTextNoImage}>{quantity}</Text>
              <TouchableOpacity
                style={styles.quantityButtonNoImage}
                onPress={(e) => {
                  e.stopPropagation();
                  updateCartQuantity(item.id, quantity + 1);
                }}
              >
                <Ionicons name="add" size={10} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addButtonNoImage}
              onPress={(e) => {
                e.stopPropagation();
                addToCart(item);
              }}
            >
              <Ionicons name="add" size={8} color="#6b7280" />
              <Text style={styles.addButtonTextNoImage}>ADD</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategory = ({ item }) => {
    const isSelected = selectedCategory === item.id;
    return (
      <TouchableOpacity
        style={[styles.categoryPill, isSelected && styles.categoryPillSelected]}
        onPress={() => setSelectedCategory(item.id)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.categoryPillText,
            isSelected && styles.categoryPillTextSelected,
          ]}
          numberOfLines={1}
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
      {/* Clean Header */}
      <View style={styles.headerSection}>
        {selectedTable ? (
          <>
            {/* Table Selection Mode */}
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Ionicons name="arrow-back" size={24} color="#1f2937" />
              </TouchableOpacity>
              <View style={styles.tableInfoCard}>
                <Ionicons name="restaurant" size={18} color={Colors.primary} />
                <Text style={styles.tableInfoText}>Table {selectedTable.name}</Text>
              </View>
              <View style={styles.headerIcons}>
                <TouchableOpacity style={styles.iconBtn} onPress={toggleImages}>
                  <Ionicons
                    name={showImages ? "image" : "image-outline"}
                    size={22}
                    color="#6b7280"
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowVoiceModal(true)}>
                  <Ionicons name="mic" size={22} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Default Menu Mode */}
            <View style={styles.headerTop}>
              <View style={styles.headerTitleSection}>
                <Text style={styles.headerTitle}>Menu</Text>
                <Text style={styles.headerSubtitle}>{restaurantName}</Text>
              </View>
              <View style={styles.headerIcons}>
                <TouchableOpacity style={styles.iconBtn} onPress={toggleImages}>
                  <Ionicons
                    name={showImages ? "image" : "image-outline"}
                    size={22}
                    color="#6b7280"
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowVoiceModal(true)}>
                  <Ionicons name="mic" size={22} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Separate Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
            placeholderTextColor="#9ca3af"
            value={searchTerm || shortCodeSearch}
            onChangeText={(text) => {
              if (text.length <= 5 && text === text.toUpperCase()) {
                setShortCodeSearch(text);
                setSearchTerm('');
              } else {
                setSearchTerm(text);
                setShortCodeSearch('');
              }
            }}
          />
          {(searchTerm || shortCodeSearch) && (
            <TouchableOpacity onPress={() => {
              setSearchTerm('');
              setShortCodeSearch('');
            }}>
              <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Compact Category Pills */}
      <View style={styles.categoriesSection}>
        <FlatList
          horizontal
          data={categories}
          renderItem={renderCategory}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
        />
      </View>

      {/* Menu Items - 2 Column Grid */}
      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.menuList}
        columnWrapperStyle={styles.menuRow}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No items found</Text>
            <Text style={styles.emptySubtext}>
              {searchTerm || shortCodeSearch ? 'Try a different search term' : 'No menu items available'}
            </Text>
          </View>
        }
      />

      {/* Bottom Order Button - For Waiters */}
      {isWaiter && cart.length > 0 && (
        <View style={styles.bottomOrderBar}>
          <View style={styles.orderSummary}>
            <Text style={styles.orderItemsCount}>{cart.length} items</Text>
            <Text style={styles.orderTotal}>₹{getCartTotal().toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.orderButton, sendingOrder && styles.orderButtonDisabled]}
            onPress={handleSendToKitchen}
            disabled={sendingOrder}
          >
            {sendingOrder ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.orderButtonText}>Send to Kitchen</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Cart FAB - For Admin/Manager */}
      {!isWaiter && cart.length > 0 && (
        <TouchableOpacity
          style={styles.cartFAB}
          onPress={() => setShowCart(true)}
        >
          <Ionicons name="cart" size={24} color="#fff" />
          <View style={styles.cartFABBadge}>
            <Text style={styles.cartFABBadgeText}>{cart.length}</Text>
          </View>
          <Text style={styles.cartFABText}>₹{getCartTotal().toFixed(2)}</Text>
        </TouchableOpacity>
      )}

      {/* Voice Order Modal */}
      <VoiceOrderModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onItemsAdded={(items) => {
          items.forEach(item => addToCart(item));
          setShowVoiceModal(false);
        }}
        restaurantId={restaurantId}
      />

      {/* Cart Modal - Permission Based */}
      {isWaiter ? (
        <WaiterCartModal
          visible={showCart}
          onClose={() => setShowCart(false)}
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onSendToKitchen={handleSendToKitchen}
          total={getCartTotal()}
          tableNumber={selectedTable?.name || params.tableNumber}
          sending={sendingOrder}
        />
      ) : (
        <CartModal
          visible={showCart}
          onClose={() => setShowCart(false)}
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onPlaceOrder={handlePlaceOrder}
          total={getCartTotal()}
          tableNumber={selectedTable?.name || params.tableNumber}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  // Clean Header Section
  headerSection: {
    backgroundColor: '#fff',
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tableInfoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  tableInfoText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '500',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Separate Clean Search Bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    padding: 0,
    fontWeight: '500',
  },
  // Clean Category Pills
  categoriesSection: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    marginBottom: 8,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    marginRight: 10,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPillSelected: {
    backgroundColor: Colors.primary,
  },
  categoryPillText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4b5563',
  },
  categoryPillTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Grid Menu List
  menuList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  menuRow: {
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },
  // Modern Design with Full Image Background
  menuItemCardImage: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    width: '48%',
    height: 140,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  fullImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  darkGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  darkGradientOverlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  vegBadgeImage: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 2,
    borderColor: '#fff',
    ...Shadows.small,
  },
  topRightBadges: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    gap: 4,
  },
  shortCodeBadgeImage: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  shortCodeTextImage: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bottomContentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    padding: 10,
    gap: 6,
  },
  menuItemNameImage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  priceAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  menuItemPriceImage: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  quantityControlsImage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityButtonImage: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityTextImage: {
    width: 32,
    height: 28,
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  addButtonImage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    ...Shadows.small,
  },
  addButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1f2937',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Fallback Design (No Image)
  menuItemCardNoImage: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderTopWidth: 3,
    borderRadius: 16,
    marginBottom: 12,
    width: '48%',
    height: 120,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
  },
  vegBadgeNoImage: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    borderWidth: 2,
    borderColor: '#fff',
    ...Shadows.small,
  },
  topRightBadgesNoImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    gap: 4,
  },
  shortCodeBadgeNoImage: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shortCodeTextNoImage: {
    fontSize: 9,
    fontWeight: '600',
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  contentNoImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  menuItemNameNoImage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 4,
  },
  menuItemDescriptionNoImage: {
    fontSize: 10,
    color: '#6b7280',
    lineHeight: 12,
    textAlign: 'center',
  },
  bottomSectionNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    marginTop: 8,
  },
  menuItemPriceNoImage: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  quantityControlsNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    overflow: 'hidden',
  },
  quantityButtonNoImage: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityTextNoImage: {
    width: 36,
    height: 28,
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  addButtonNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  addButtonTextNoImage: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Bottom Order Bar (for waiters)
  bottomOrderBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundWhite,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg + 8, // Extra padding for tab bar
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    ...Shadows.medium,
  },
  orderSummary: {
    flex: 1,
  },
  orderItemsCount: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: 2,
  },
  orderTotal: {
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    color: Colors.textDark,
  },
  orderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  orderButtonDisabled: {
    opacity: 0.6,
  },
  orderButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: '600',
  },
  cartFAB: {
    position: 'absolute',
    bottom: 80,
    right: Spacing.md,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartFABBadge: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.full,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartFABBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  cartFABText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
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
});
