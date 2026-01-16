import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import VoiceOrderModal from '../../components/VoiceOrderModal';
import CartModal from '../../components/CartModal';

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [menuItems, setMenuItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (params.tableId && params.tableNumber) {
      setSelectedTable({ id: params.tableId, name: params.tableNumber });
    }
  }, [params.tableId, params.tableNumber]);

  const filterItems = useCallback(() => {
    let filtered = [...menuItems];

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }

    // Filter only active items
    filtered = filtered.filter(item => item.status === 'active');

    setFilteredItems(filtered);
  }, [menuItems, selectedCategory, searchTerm]);

  useEffect(() => {
    filterItems();
  }, [filterItems]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
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
      const categorySet = new Set(['all']);
      items.forEach(item => {
        if (item.category) {
          categorySet.add(item.category);
        }
      });

      setCategories(Array.from(categorySet));
    } catch (error) {
      console.error('Error loading menu:', error);
      throw error;
    }
  };

  const getCategoryBadge = (category) => {
    if (!category) return 'GEN';
    const words = category.split(' ');
    if (words.length > 1) {
      return words.map(w => w[0]).join('').toUpperCase().slice(0, 3);
    }
    return category.slice(0, 3).toUpperCase();
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

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const handlePlaceOrder = async () => {
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

      await apiClient.createOrder(orderData);

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

  const renderMenuItem = ({ item, index }) => {
    const cartItem = cart.find(c => c.id === item.id);
    const quantity = cartItem?.quantity || 0;
    const categoryBadge = getCategoryBadge(item.category);
    const isInStock = item.status === 'active';

    return (
      <View style={styles.menuCard}>
        {/* Top Status Bar */}
        <View style={[styles.statusBar, { backgroundColor: isInStock ? '#10b981' : '#ef4444' }]} />

        {/* Category Badge */}
        <View style={styles.categoryBadgeContainer}>
          <Text style={styles.categoryBadgeText}>{categoryBadge}</Text>
        </View>

        {/* Veg Indicator */}
        {item.isVeg !== false && (
          <View style={styles.vegIndicatorSmall}>
            <View style={styles.vegDotSmall} />
          </View>
        )}

        {/* Item Name */}
        <View style={styles.menuCardBody}>
          <Text style={styles.menuItemName} numberOfLines={2}>{item.name}</Text>
        </View>

        {/* Price and Add Button */}
        <View style={styles.menuCardFooter}>
          <Text style={styles.menuItemPrice}>₹{item.price}</Text>
          {quantity > 0 ? (
            <View style={styles.quantityBadge}>
              <Text style={styles.quantityBadgeText}>{quantity}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => addToCart(item)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>
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
        <View style={styles.headerLeft}>
          <View style={styles.brandIcon}>
            <Ionicons name="restaurant" size={24} color="#fff" />
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.languageText}>English ▼</Text>
          <TouchableOpacity style={styles.menuButton}>
            <Ionicons name="menu" size={28} color={Colors.textDark} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Restaurant Info */}
      <View style={styles.restaurantInfo}>
        <Text style={styles.restaurantName}>{restaurantName}</Text>
        <Text style={styles.itemCount}>
          {filteredItems.length} items • All Categories
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>Order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButtonSecondary}>
          <Text style={styles.actionButtonSecondaryText}>SC</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButtonPrimary}>
          <Text style={styles.actionButtonPrimaryText}>FRESH ORDER</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonVoice}
          onPress={() => setShowVoiceModal(true)}
        >
          <Ionicons name="mic" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonTable}
          onPress={() => router.push('/(tabs)/tables')}
        >
          <Text style={styles.actionButtonTableText}>TABLES</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          placeholderTextColor={Colors.textLight}
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {/* Menu Grid */}
      <FlatList
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.menuGrid}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No items found</Text>
          </View>
        }
      />

      {/* Cart Button */}
      {cart.length > 0 && (
        <TouchableOpacity
          style={styles.cartButton}
          onPress={() => setShowCart(true)}
        >
          <View style={styles.cartButtonContent}>
            <Ionicons name="cart" size={24} color="#fff" />
            <Text style={styles.cartButtonText}>Cart</Text>
          </View>
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

      {/* Cart Modal */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  languageText: {
    fontSize: 14,
    color: Colors.textDark,
    fontWeight: '500',
  },
  menuButton: {
    padding: 4,
  },
  restaurantInfo: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  restaurantName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  itemCount: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: '#fff',
  },
  actionButtonSecondary: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    backgroundColor: '#fef3c7',
  },
  actionButtonSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  actionButtonPrimary: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  actionButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  actionButtonVoice: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonTable: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: '#fff',
  },
  actionButtonTableText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
  },
  menuGrid: {
    paddingHorizontal: Spacing.xs,
    paddingBottom: 100,
  },
  menuCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    margin: Spacing.xs,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 140,
  },
  statusBar: {
    height: 4,
    width: '100%',
  },
  categoryBadgeContainer: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 1,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textDark,
  },
  vegIndicatorSmall: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  vegDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  menuCardBody: {
    paddingHorizontal: Spacing.md,
    paddingTop: 36,
    paddingBottom: Spacing.sm,
    minHeight: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    textAlign: 'center',
  },
  menuCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    justifyContent: 'space-between',
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  quantityBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  quantityBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  addButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  cartButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartButtonContent: {
    alignItems: 'center',
    gap: 4,
  },
  cartButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    marginTop: Spacing.xxl,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
});
