import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import apiClient from '../../services/api';
import { queueOrder, generateIdempotencyKey, getQueueCount } from '../../services/offlineQueue';
import { syncPendingOrders, onSyncStatusChange } from '../../services/syncEngine';

const TAX_STORAGE_KEY = 'dine_tax_settings';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { getDisplayImage } from '../../utils/placeholderImages';
// import VoiceOrderModal from '../../components/VoiceOrderModal';
import CartModal from '../../components/CartModal';
import WaiterCartModal from '../../components/WaiterCartModal';
import CashierCartModal from '../../components/CashierCartModal';
import CashierInvoiceModal from '../../components/CashierInvoiceModal';
import KOTModal from '../../components/KOTModal';
import { useToast } from '../../components/Toast';
import { getCached, setCache } from '../../services/cacheManager';
import SyncIndicator from '../../components/SyncIndicator';
import Pusher from 'pusher-js/react-native';

const TAKEAWAY_NAMES = ['takeaway', 'take away', 'take-away'];
const DELIVERY_NAMES = ['delivery'];
const DINEIN_NAMES = ['dine-in', 'dine in', 'dinein'];

const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec';
const PUSHER_CLUSTER = 'ap2';

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
  // const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showKOTModal, setShowKOTModal] = useState(false);
  const [kotOrderData, setKotOrderData] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [sendingOrder, setSendingOrder] = useState(false);
  const [isWaiter, setIsWaiter] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [canCompleteBill, setCanCompleteBill] = useState(false);
  const [showImages, setShowImages] = useState(true);
  const [existingOrderId, setExistingOrderId] = useState(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [lastOrderData, setLastOrderData] = useState(null);
  const [taxSettings, setTaxSettings] = useState({ enabled: false, rate: 0, taxes: [] });
  const [billingSettings, setBillingSettings] = useState({});
  const [businessType, setBusinessType] = useState('restaurant');
  const [isBarTabMode, setIsBarTabMode] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Multi-tier pricing
  const [multiPricingEnabled, setMultiPricingEnabled] = useState(false);
  const [pricingRules, setPricingRules] = useState([]);
  const [activePricingRuleId, setActivePricingRuleId] = useState(null);
  const [autoSelectedRule, setAutoSelectedRule] = useState(false);

  const { toast, ToastView } = useToast();
  const scrollY = useRef(new Animated.Value(0)).current;
  const menuFlatListRef = useRef(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const HEADER_EXPANDED = 200;
  const HEADER_COLLAPSED = 92; // room for row1 + row2 chips (wrap)
  const SCROLL_THRESHOLD = 100;

  useEffect(() => {
    loadInitialData();
    loadImagePreference();
  }, []);

  // Network status monitoring + auto-sync
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener(state => {
      const online = !!state.isConnected;
      setIsOnline(online);
      // Auto-sync when coming back online
      if (online) {
        getQueueCount().then(setPendingSyncCount);
        syncPendingOrders(apiClient);
      }
    });

    const unsubSync = onSyncStatusChange((event) => {
      if (['sync_complete', 'synced', 'queued', 'failed'].includes(event.type)) {
        getQueueCount().then(setPendingSyncCount);
      }
    });

    // Initial count
    getQueueCount().then(setPendingSyncCount);

    return () => {
      unsubNet();
      unsubSync();
    };
  }, []);

  // Pusher real-time menu updates
  useEffect(() => {
    if (!restaurantId) return;

    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
    const channelName = `restaurant-${restaurantId}`;
    const channel = pusher.subscribe(channelName);

    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        apiClient.invalidateCache(`/api/menus/${restaurantId}`);
        loadMenu(restaurantId);
      }, 1000);
    };

    channel.bind('menu-updated', debouncedRefresh);
    channel.bind('menu-item-created', debouncedRefresh);
    channel.bind('menu-item-deleted', debouncedRefresh);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.unbind_all();
      pusher.unsubscribe(channelName);
    };
  }, [restaurantId]);

  // Refresh tax settings when tab is focused (e.g., after changing settings in Profile)
  useFocusEffect(
    useCallback(() => {
      const refreshTaxSettings = async () => {
        if (!restaurantId) return;

        // First, load from cache for instant update
        try {
          const cached = await AsyncStorage.getItem(`${TAX_STORAGE_KEY}_${restaurantId}`);
          if (cached) {
            const cachedSettings = JSON.parse(cached);
            const totalRate = cachedSettings.taxes?.filter(t => t.enabled)
              .reduce((sum, t) => sum + (t.rate || 0), 0) || 0;
            setTaxSettings({
              enabled: cachedSettings.enabled || false,
              rate: totalRate,
              taxes: cachedSettings.taxes || [],
            });
          }
        } catch (e) {
          console.log('Cache read error:', e);
        }

        // Then fetch from API in background
        try {
          const response = await apiClient.getTaxSettings(restaurantId);
          if (response.taxSettings) {
            const settings = response.taxSettings;
            const totalRate = settings.taxes?.filter(t => t.enabled)
              .reduce((sum, t) => sum + (t.rate || 0), 0) || 0;

            setTaxSettings({
              enabled: settings.enabled || false,
              rate: totalRate,
              taxes: settings.taxes || [],
            });

            // Update cache
            await AsyncStorage.setItem(
              `${TAX_STORAGE_KEY}_${restaurantId}`,
              JSON.stringify(settings)
            );
          }
        } catch (e) {
          console.log('API fetch error (using cached):', e);
        }

        // Load billing settings
        try {
          const bRes = await apiClient.getBillingSettings(restaurantId);
          if (bRes) setBillingSettings(bRes.settings || bRes.billingSettings || {});
        } catch (e) {
          console.log('Billing settings fetch error:', e);
        }
      };

      refreshTaxSettings();
    }, [restaurantId])
  );

  // Refresh user/restaurant data when tab is focused (e.g., after changing business settings in Profile)
  useFocusEffect(
    useCallback(() => {
      const refreshUserData = async () => {
        try {
          const userData = await apiClient.getUser();
          if (userData) {
            setUser(userData);
          }
        } catch (e) {
          console.log('User data refresh error:', e);
        }
      };

      refreshUserData();
    }, [])
  );

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
    } else if (params.tableNumber && params.barTabMode === 'true') {
      // Bar tab mode: use tableNumber as tab display name (no tableId)
      setSelectedTable({ id: null, name: params.tableNumber });
      setIsBarTabMode(true);
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

    if (params.barTabMode === 'true') {
      setIsBarTabMode(true);
    }
  }, [params.tableId, params.tableNumber, params.existingOrder, params.cartItems, params.orderId, params.barTabMode]);

  // Auto-select pricing rule based on table floor
  useEffect(() => {
    if (!multiPricingEnabled || pricingRules.length === 0) return;
    const floorName = params.floorName || selectedTable?.floor || '';
    if (floorName) {
      const matched = pricingRules.find(r =>
        (r.tableMappings || []).some(m => floorName.toLowerCase().trim() === m.toLowerCase().trim())
      );
      if (matched) {
        setActivePricingRuleId(matched.id);
        setAutoSelectedRule(true);
        return;
      }
    }
    setAutoSelectedRule(false);
  }, [selectedTable, params.floorName, multiPricingEnabled, pricingRules]);

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
      // Check if user is cashier/sales (counter sales mode - no table required)
      setIsCashier(userRole === 'cashier' || userRole === 'sales');
      // Check if staff has "Complete Bill" permission granted by owner
      setCanCompleteBill(userData.pageAccess?.completeBill === true);

      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        Alert.alert('Error', 'No restaurant assigned.');
        return;
      }

      setRestaurantId(rid);
      setRestaurantName(userData.restaurant?.name || 'Restaurant');
      // Store businessType for type-specific display on menu cards
      const bType = userData.restaurant?.businessType || 'restaurant';
      setBusinessType(bType);

      // Load tax settings - first from cache, then background refresh
      await loadTaxSettings(rid);

      // Load multi-pricing rules
      try {
        const pricingRes = await apiClient.getPricingSettings(rid);
        const mp = pricingRes?.settings?.multiPricing;
        if (mp?.enabled) {
          setMultiPricingEnabled(true);
          setPricingRules((mp.rules || []).filter(r => r.isActive));
        }
      } catch { /* ignore — backward compatible */ }

      // Load billing settings
      try {
        const bRes = await apiClient.getBillingSettings(rid);
        if (bRes) setBillingSettings(bRes.billingSettings || bRes || {});
      } catch { /* ignore */ }

      // Stale-while-revalidate: try menu cache first
      const cached = await getCached('cache_menu_' + rid);
      if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
        applyMenuData(cached.data);
        setLoading(false);
        // Background refresh
        setSyncing(true);
        loadMenu(rid).catch(() => {}).finally(() => setSyncing(false));
      } else {
        await loadMenu(rid);
      }
    } catch (error) {
      console.error('Error loading menu:', error);
      Alert.alert('Error', 'Failed to load menu. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load tax settings with cache-first approach
  const loadTaxSettings = async (rid) => {
    if (!rid) return;

    try {
      // First, try to load from local storage for instant use
      const cached = await AsyncStorage.getItem(`${TAX_STORAGE_KEY}_${rid}`);
      if (cached) {
        const cachedSettings = JSON.parse(cached);
        const totalRate = cachedSettings.taxes?.filter(t => t.enabled)
          .reduce((sum, t) => sum + (t.rate || 0), 0) || 0;
        setTaxSettings({
          enabled: cachedSettings.enabled || false,
          rate: totalRate,
          taxes: cachedSettings.taxes || [],
        });
      }
    } catch (cacheError) {
      console.log('No cached tax settings:', cacheError);
    }

    // Then fetch from API in background and update
    fetchTaxSettingsInBackground(rid);
  };

  // Fetch tax settings from API in background
  const fetchTaxSettingsInBackground = async (rid) => {
    try {
      const response = await apiClient.getTaxSettings(rid);
      if (response.taxSettings) {
        const settings = response.taxSettings;
        const totalRate = settings.taxes?.filter(t => t.enabled)
          .reduce((sum, t) => sum + (t.rate || 0), 0) || 0;

        setTaxSettings({
          enabled: settings.enabled || false,
          rate: totalRate,
          taxes: settings.taxes || [],
        });

        // Cache the settings
        await AsyncStorage.setItem(
          `${TAX_STORAGE_KEY}_${rid}`,
          JSON.stringify(settings)
        );
      }
    } catch (error) {
      console.log('Could not fetch tax settings from API:', error);
      // Keep using cached data or default
    }
  };

  const applyMenuData = (items) => {
    setMenuItems(items);
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
  };

  const loadMenu = async (rid) => {
    try {
      const response = await apiClient.getMenu(rid);
      const items = response.menuItems || [];
      applyMenuData(items);
      // Save to cache
      setCache('cache_menu_' + rid, items);
    } catch (error) {
      console.error('Error loading menu:', error);
      throw error;
    }
  };


  // Multi-tier pricing: resolve display price
  const getItemDisplayPrice = useCallback((item) => {
    if (!multiPricingEnabled || !activePricingRuleId) return item.price;
    if (item.pricingRules && typeof item.pricingRules[activePricingRuleId] === 'number') {
      return item.pricingRules[activePricingRuleId];
    }
    const rule = pricingRules.find(r => r.id === activePricingRuleId);
    if (rule?.defaultMarkupType === 'percentage' && rule.defaultMarkupValue) {
      return Math.round(item.price * (1 + rule.defaultMarkupValue / 100) * 100) / 100;
    }
    if (rule?.defaultMarkupType === 'flat' && rule.defaultMarkupValue) {
      return Math.round((item.price + rule.defaultMarkupValue) * 100) / 100;
    }
    return item.price;
  }, [multiPricingEnabled, activePricingRuleId, pricingRules]);

  // Handle order type change from CartModal/CashierCartModal → auto-select pricing rule
  const handleOrderTypeChange = useCallback((newType) => {
    if (!multiPricingEnabled) return;
    const t = (newType || '').toLowerCase();
    if (TAKEAWAY_NAMES.includes(t)) {
      const rule = pricingRules.find(r => TAKEAWAY_NAMES.includes((r.name || '').toLowerCase().trim()) && r.isActive);
      if (rule) { setActivePricingRuleId(rule.id); setAutoSelectedRule(true); }
    } else if (DELIVERY_NAMES.includes(t)) {
      const rule = pricingRules.find(r => DELIVERY_NAMES.includes((r.name || '').toLowerCase().trim()) && r.isActive);
      if (rule) { setActivePricingRuleId(rule.id); setAutoSelectedRule(true); }
    } else {
      // Dine-in/counter: restore floor-based auto-selection or clear
      setAutoSelectedRule(false);
      const floorName = params.floorName || selectedTable?.floor || '';
      if (floorName) {
        const matched = pricingRules.find(r =>
          (r.tableMappings || []).some(m => floorName.toLowerCase().trim() === m.toLowerCase().trim())
        );
        if (matched) { setActivePricingRuleId(matched.id); setAutoSelectedRule(true); return; }
      }
      setActivePricingRuleId(null);
    }
  }, [multiPricingEnabled, pricingRules, params.floorName, selectedTable]);

  // Re-price cart when active pricing rule changes
  useEffect(() => {
    if (!multiPricingEnabled || cart.length === 0) return;
    setCart(prev => prev.map(item => {
      const menuItem = menuItems.find(m => m.id === item.id || m.id === item.menuItemId);
      const basePrice = item.originalPrice ?? menuItem?.price ?? item.price;
      let newPrice = basePrice;
      if (activePricingRuleId) {
        const perItem = menuItem?.pricingRules?.[activePricingRuleId];
        const parsed = perItem != null ? Number(perItem) : NaN;
        if (!isNaN(parsed) && parsed >= 0) {
          newPrice = parsed;
        } else {
          const rule = pricingRules.find(r => r.id === activePricingRuleId);
          if (rule?.defaultMarkupType === 'percentage' && rule.defaultMarkupValue)
            newPrice = Math.round(basePrice * (1 + rule.defaultMarkupValue / 100) * 100) / 100;
          else if (rule?.defaultMarkupType === 'flat' && rule.defaultMarkupValue)
            newPrice = Math.round((basePrice + rule.defaultMarkupValue) * 100) / 100;
        }
      }
      return { ...item, price: newPrice, originalPrice: basePrice };
    }));
  }, [activePricingRuleId, multiPricingEnabled]);

  const addToCart = (item) => {
    const adjustedPrice = getItemDisplayPrice(item);
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
        price: adjustedPrice,
        originalPrice: item.price,
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

  // Calculate tax based on restaurant settings
  const calculateTax = (subtotal) => {
    if (!taxSettings.enabled) {
      return { taxAmount: 0, taxRate: 0, taxLabel: '' };
    }

    // If taxes array exists and has items, use total of all taxes
    if (taxSettings.taxes && taxSettings.taxes.length > 0) {
      const totalRate = taxSettings.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
      const taxAmount = subtotal * (totalRate / 100);
      const taxLabel = taxSettings.taxes.map(t => t.name || 'Tax').join(' + ');
      return { taxAmount, taxRate: totalRate, taxLabel };
    }

    // Fallback to single rate
    const rate = taxSettings.rate || 0;
    const taxAmount = subtotal * (rate / 100);
    return { taxAmount, taxRate: rate, taxLabel: rate > 0 ? `GST (${rate}%)` : '' };
  };

  const getGrandTotal = () => {
    const subtotal = getCartTotal();
    const { taxAmount } = calculateTax(subtotal);
    return subtotal + taxAmount;
  };

  const handleSendToKitchen = async (customerPhone = '') => {
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
        const idempotencyKey = generateIdempotencyKey();
        const orderData = {
          restaurantId,
          idempotencyKey,
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
          ...(customerPhone && { customerPhone }),
          pricingRuleId: activePricingRuleId || null,
        };

        // Check if offline — queue order locally
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          await queueOrder(orderData);
          setPendingSyncCount(await getQueueCount());
          toast.warning('No internet. Order saved locally and will sync when online.');
          setCart([]);
          setShowCart(false);
          setExistingOrderId(null);
          setSendingOrder(false);
          return;
        }

        try {
          response = await apiClient.createOrder(orderData);
        } catch (apiErr) {
          // Only queue for network errors, not API errors
          const isNetworkError = !apiErr.response && (apiErr.message?.includes('Network') || apiErr.message?.includes('timeout') || apiErr.code === 'ECONNABORTED');
          if (isNetworkError) {
            await queueOrder(orderData);
            setPendingSyncCount(await getQueueCount());
            toast.warning('Connection issue. Order saved and will sync when online.');
            setCart([]);
            setShowCart(false);
            setExistingOrderId(null);
            setSendingOrder(false);
            return;
          }
          throw apiErr;
        }
        orderId = response.order?.id;
      }

      // Note: Table status update to 'occupied' is now handled by backend during POST /api/orders
      // No separate updateTableStatus call needed

      // Prepare KOT data
      const orderNumber = response.order?.dailyOrderId || response.order?.orderNumber || orderId?.slice(-6);
      const kotData = {
        orderNumber,
        orderId,
        tableNumber: tableNumber,
        roomNumber: response.order?.roomNumber || null,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          notes: item.notes || '',
        })),
        waiterName: user?.name || 'Waiter',
        waiterId: user?.id,
        timestamp: new Date(),
        restaurantName: restaurantName,
      };

      // Show KOT Modal instead of Alert
      setKotOrderData(kotData);
      setShowKOTModal(true);
      setCart([]);
      setShowCart(false);
      setExistingOrderId(null);
    } catch (error) {
      console.error('Error sending order:', error);
      toast.error(error.message || 'Failed to send order to kitchen. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  const handlePlaceOrder = async (orderType = 'dine-in', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}) => {
    // For admin/manager - full billing flow with discount support
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before placing order.');
      return;
    }

    if (!selectedTable && !params.tableNumber) {
      Alert.alert('Select Table', 'Please select a table first.');
      return;
    }

    setSendingOrder(true);

    try {
      const subtotal = getCartTotal();
      const totalDiscount = discountData.totalDiscount || 0;
      const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
      const serviceCharge = discountData.serviceChargeAmount || 0;
      const taxableAmount = discountedSubtotal + serviceCharge;
      const { taxAmount } = calculateTax(taxableAmount);
      const afterTax = taxableAmount + taxAmount;
      const withTip = afterTax + (discountData.tipAmount || 0);
      let roundOff = 0;
      if (billingSettings.roundOffEnabled) {
        const roundTo = billingSettings.roundOffTo || 1;
        roundOff = Math.round(withTip / roundTo) * roundTo - withTip;
        roundOff = Math.round(roundOff * 100) / 100;
      }
      const grandTotal = Math.round((withTip + roundOff) * 100) / 100;

      // Build billing fields object
      const billingFields = {};
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (roundOff) billingFields.roundOffAmount = roundOff;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      // Partial payment
      let partialFields = {};
      if (discountData.partialPayAmount) {
        partialFields = {
          paidAmount: parseFloat(discountData.partialPayAmount),
          outstandingAmount: Math.round((grandTotal - parseFloat(discountData.partialPayAmount)) * 100) / 100,
          paymentStatus: 'partial',
        };
      }

      const items = cart.map(item => ({
        menuItemId: item.menuItemId || item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      if (existingOrderId && isBarTabMode) {
        // Settle existing bar tab — update to completed
        await apiClient.updateOrder(existingOrderId, {
          items,
          status: 'completed',
          paymentStatus: partialFields.paymentStatus || 'paid',
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          totalAmount: subtotal,
          discountAmount: totalDiscount,
          taxAmount: taxAmount,
          finalAmount: grandTotal,
          completedAt: new Date().toISOString(),
          ...(customerName && { customerInfo: { name: customerName, phone: customerMobile } }),
          offerIds: discountData.selectedOfferId ? [discountData.selectedOfferId] : [],
          manualDiscount: discountData.manualDiscountAmount || 0,
          redeemLoyaltyPoints: discountData.redeemLoyaltyPoints || 0,
          customerId: discountData.customerId || null,
          ...billingFields,
          ...partialFields,
        });

        await apiClient.verifyPayment({
          orderId: existingOrderId,
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          amount: grandTotal,
          userId: user?.id,
          restaurantId,
          paymentStatus: 'completed',
        }).catch(() => {}); // Don't block on payment verification

        toast.success('Tab settled!');
        setCart([]);
        setShowCart(false);
        setExistingOrderId(null);
        router.back();
      } else {
        const idempotencyKey = generateIdempotencyKey();
        const orderData = {
          restaurantId,
          idempotencyKey,
          tableNumber: selectedTable?.name || params.tableNumber,
          items,
          orderType: isBarTabMode ? 'dine-in' : orderType,
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          status: isBarTabMode ? 'completed' : 'confirmed',
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Manager',
          },
          ...(customerName && { customerInfo: { name: customerName, phone: customerMobile } }),
          ...(customerMobile && { customerPhone: customerMobile }),
          offerIds: discountData.selectedOfferId ? [discountData.selectedOfferId] : [],
          manualDiscount: discountData.manualDiscountAmount || 0,
          redeemLoyaltyPoints: discountData.redeemLoyaltyPoints || 0,
          customerId: discountData.customerId || null,
          pricingRuleId: activePricingRuleId || null,
          finalAmount: grandTotal,
          ...billingFields,
          ...partialFields,
        };

        let response;
        const netState = await NetInfo.fetch();
        if (!netState.isConnected && !isBarTabMode) {
          await queueOrder(orderData);
          setPendingSyncCount(await getQueueCount());
          toast.warning('No internet. Order saved locally and will sync when online.');
          setCart([]);
          setShowCart(false);
          setSendingOrder(false);
          return;
        }

        try {
          response = await apiClient.createOrder(orderData);
        } catch (apiErr) {
          if (!isBarTabMode) {
            // Only queue for network errors, not API errors
            const isNetworkError = !apiErr.response && (apiErr.message?.includes('Network') || apiErr.message?.includes('timeout') || apiErr.code === 'ECONNABORTED');
            if (isNetworkError) {
              await queueOrder(orderData);
              setPendingSyncCount(await getQueueCount());
              toast.warning('Connection issue. Order saved and will sync when online.');
              setCart([]);
              setShowCart(false);
              setSendingOrder(false);
              return;
            }
          }
          throw apiErr;
        }

        if (isBarTabMode) {
          // Verify payment for bar tab settle
          await apiClient.verifyPayment({
            orderId: response.order?.id,
            paymentMethod,
            amount: grandTotal,
            userId: user?.id,
            restaurantId,
            paymentStatus: 'completed',
          }).catch(() => {});

          toast.success('Tab settled!');
          setCart([]);
          setShowCart(false);
          router.back();
        } else {
          toast.success('Order placed successfully!');
          setCart([]);
          setShowCart(false);
          // Navigate back to tables with optimistic update if came from table view
          if (selectedTable || params.tableId) {
            router.replace({
              pathname: '/(tabs)/tables',
              params: {
                tableId: selectedTable?.id || params.tableId,
                orderId: response.order?.id,
                tableStatus: 'occupied',
                tableNumber: selectedTable?.name || params.tableNumber,
              },
            });
          } else {
            router.push('/(tabs)/orders');
          }
        }
      }
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error(error.message || 'Failed to place order. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  // Cashier/Sales - Counter sales without table requirement
  const handleCashierPlaceOrder = async (orderType = 'counter', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}) => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before placing order.');
      return;
    }

    setSendingOrder(true);

    try {
      const subtotal = getCartTotal();
      const totalDiscount = discountData.totalDiscount || 0;
      const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
      const serviceCharge = discountData.serviceChargeAmount || 0;
      const taxableAmount = discountedSubtotal + serviceCharge;
      const { taxAmount, taxRate, taxLabel } = calculateTax(taxableAmount);
      const afterTax = taxableAmount + taxAmount;
      const withTip = afterTax + (discountData.tipAmount || 0);
      let roundOff = 0;
      if (billingSettings.roundOffEnabled) {
        const roundTo = billingSettings.roundOffTo || 1;
        roundOff = Math.round(withTip / roundTo) * roundTo - withTip;
        roundOff = Math.round(roundOff * 100) / 100;
      }
      const grandTotal = Math.round((withTip + roundOff) * 100) / 100;

      // Build billing fields
      const billingFields = {};
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (roundOff) billingFields.roundOffAmount = roundOff;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      let partialFields = {};
      if (discountData.partialPayAmount) {
        partialFields = {
          paidAmount: parseFloat(discountData.partialPayAmount),
          outstandingAmount: Math.round((grandTotal - parseFloat(discountData.partialPayAmount)) * 100) / 100,
          paymentStatus: 'partial',
        };
      }

      const idempotencyKey = generateIdempotencyKey();
      const orderData = {
        restaurantId,
        idempotencyKey,
        items: cart.map(item => ({
          menuItemId: item.menuItemId || item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        orderType: orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        status: 'completed', // Counter sales are completed immediately
        staffInfo: {
          waiterId: user?.id,
          waiterName: user?.name || 'Cashier',
        },
        customerInfo: {
          name: customerName || 'Walk-in Customer',
          mobile: customerMobile || '',
        },
        subtotal: subtotal,
        tax: taxAmount,
        taxRate: taxRate,
        total: grandTotal,
        finalAmount: grandTotal,
        // Discount/loyalty data
        ...(discountData.selectedOfferId && { offerIds: [discountData.selectedOfferId] }),
        ...(discountData.manualDiscountAmount > 0 && { manualDiscount: discountData.manualDiscountAmount }),
        ...(discountData.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: discountData.redeemLoyaltyPoints }),
        ...(customerMobile && { customerPhone: customerMobile }),
        customerId: discountData.customerId || null,
        discountAmount: totalDiscount,
        pricingRuleId: activePricingRuleId || null,
        ...billingFields,
        ...partialFields,
      };

      let response;
      try {
        response = await apiClient.createOrder(orderData);
      } catch (apiErr) {
        // Only queue for network errors, not API errors
        const isNetworkError = !apiErr.response && (apiErr.message?.includes('Network') || apiErr.message?.includes('timeout') || apiErr.code === 'ECONNABORTED');
        if (isNetworkError) {
          await queueOrder(orderData);
          setPendingSyncCount(await getQueueCount());
          toast.warning('Connection issue. Order saved and will sync when online.');
          setCart([]);
          setShowCart(false);
          setSendingOrder(false);
          return;
        }
        throw apiErr;
      }

      // Fetch latest user data to get current business settings (showGstOnInvoice toggle)
      const latestUserData = await apiClient.getUser();
      const latestRestaurantInfo = latestUserData?.restaurant || user?.restaurant || {};

      // Prepare invoice data for display
      const invoiceData = {
        orderId: response.order?.id,
        orderNumber: response.order?.dailyOrderId || response.order?.orderNumber || response.order?.id?.slice(-6),
        restaurantName: restaurantName,
        restaurantInfo: latestRestaurantInfo,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        })),
        subtotal: subtotal,
        tax: taxAmount,
        taxRate: taxRate,
        taxLabel: taxLabel,
        taxEnabled: taxSettings.enabled,
        grandTotal: grandTotal,
        customerName: customerName || 'Walk-in Customer',
        customerMobile: customerMobile || '',
        orderType: orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        timestamp: new Date(),
        staffName: user?.name || 'Cashier',
        // Discount fields for invoice
        offerDiscount: discountData.offerDiscount || 0,
        offerName: discountData.selectedOfferName || null,
        manualDiscount: discountData.manualDiscountAmount || 0,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        // Billing fields for invoice
        serviceChargeAmount: serviceCharge || 0,
        serviceChargeRate: discountData.serviceChargeRate || 0,
        tipAmount: discountData.tipAmount || 0,
        roundOffAmount: roundOff || 0,
        cashReceived: discountData.cashReceived || null,
        changeReturned: discountData.changeReturned || null,
        splitPayments: discountData.splitPayments || null,
      };

      setLastOrderData(invoiceData);
      setShowInvoiceModal(true);
      setCart([]);
      setShowCart(false);
    } catch (error) {
      console.error('Error placing order:', error);
      toast.error(error.message || 'Failed to place order. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  // Admin/Manager - Complete Bill immediately (like cashier flow but for any role)
  const handleCompleteBill = async (orderType = 'dine-in', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}) => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before completing bill.');
      return;
    }

    setSendingOrder(true);

    try {
      const subtotal = getCartTotal();
      const totalDiscount = discountData.totalDiscount || 0;
      const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
      const serviceCharge = discountData.serviceChargeAmount || 0;
      const taxableAmount = discountedSubtotal + serviceCharge;
      const { taxAmount, taxRate, taxLabel } = calculateTax(taxableAmount);
      const afterTax = taxableAmount + taxAmount;
      const withTip = afterTax + (discountData.tipAmount || 0);
      let roundOff = 0;
      if (billingSettings.roundOffEnabled) {
        const roundTo = billingSettings.roundOffTo || 1;
        roundOff = Math.round(withTip / roundTo) * roundTo - withTip;
        roundOff = Math.round(roundOff * 100) / 100;
      }
      const grandTotal = Math.round((withTip + roundOff) * 100) / 100;

      // Build billing fields
      const billingFields = {};
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (roundOff) billingFields.roundOffAmount = roundOff;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      let partialFields = {};
      if (discountData.partialPayAmount) {
        partialFields = {
          paidAmount: parseFloat(discountData.partialPayAmount),
          outstandingAmount: Math.round((grandTotal - parseFloat(discountData.partialPayAmount)) * 100) / 100,
          paymentStatus: 'partial',
        };
      }

      const idempotencyKey = generateIdempotencyKey();
      const tableNum = selectedTable?.name || params.tableNumber;
      const orderData = {
        restaurantId,
        idempotencyKey,
        ...(tableNum && { tableNumber: tableNum }),
        items: cart.map(item => ({
          menuItemId: item.menuItemId || item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
        orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        status: 'completed',
        paymentStatus: partialFields.paymentStatus || 'paid',
        staffInfo: {
          waiterId: user?.id,
          waiterName: user?.name || 'Manager',
        },
        customerInfo: {
          name: customerName || 'Walk-in Customer',
          mobile: customerMobile || '',
        },
        ...(customerMobile && { customerPhone: customerMobile }),
        subtotal,
        tax: taxAmount,
        taxRate,
        total: grandTotal,
        finalAmount: grandTotal,
        completedAt: new Date().toISOString(),
        ...(discountData.selectedOfferId && { offerIds: [discountData.selectedOfferId] }),
        ...(discountData.manualDiscountAmount > 0 && { manualDiscount: discountData.manualDiscountAmount }),
        ...(discountData.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: discountData.redeemLoyaltyPoints }),
        customerId: discountData.customerId || null,
        discountAmount: totalDiscount,
        pricingRuleId: activePricingRuleId || null,
        ...billingFields,
        ...partialFields,
      };

      let response;
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await queueOrder(orderData);
        setPendingSyncCount(await getQueueCount());
        toast.warning('No internet. Order saved locally and will sync when online.');
        setCart([]);
        setShowCart(false);
        setSendingOrder(false);
        return;
      }

      try {
        response = await apiClient.createOrder(orderData);
      } catch (apiErr) {
        // Check if it's a real network error or an API error
        const isNetworkError = !apiErr.response && (apiErr.message?.includes('Network') || apiErr.message?.includes('timeout') || apiErr.code === 'ECONNABORTED');
        if (isNetworkError) {
          await queueOrder(orderData);
          setPendingSyncCount(await getQueueCount());
          toast.warning('Connection issue. Order saved and will sync when online.');
          setCart([]);
          setShowCart(false);
          setSendingOrder(false);
          return;
        }
        // Real API error — throw to show error toast
        throw apiErr;
      }

      // Verify payment
      await apiClient.verifyPayment({
        orderId: response.order?.id,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        amount: grandTotal,
        userId: user?.id,
        restaurantId,
        paymentStatus: 'completed',
      }).catch(() => {});

      // Fetch latest user data for invoice settings
      const latestUserData = await apiClient.getUser();
      const latestRestaurantInfo = latestUserData?.restaurant || user?.restaurant || {};

      // Prepare invoice data
      const invoiceData = {
        orderId: response.order?.id,
        orderNumber: response.order?.dailyOrderId || response.order?.orderNumber || response.order?.id?.slice(-6),
        restaurantName,
        restaurantInfo: latestRestaurantInfo,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
        })),
        subtotal,
        tax: taxAmount,
        taxRate,
        taxLabel,
        taxEnabled: taxSettings.enabled,
        grandTotal,
        customerName: customerName || 'Walk-in Customer',
        customerMobile: customerMobile || '',
        orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        timestamp: new Date(),
        staffName: user?.name || 'Manager',
        offerDiscount: discountData.offerDiscount || 0,
        offerName: discountData.selectedOfferName || null,
        manualDiscount: discountData.manualDiscountAmount || 0,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        serviceChargeAmount: serviceCharge || 0,
        serviceChargeRate: discountData.serviceChargeRate || null,
        roundOffAmount: roundOff || 0,
        tipAmount: discountData.tipAmount || 0,
        cashReceived: discountData.cashReceived || null,
        changeReturned: discountData.changeReturned || null,
        splitPayments: discountData.splitPayments || null,
      };

      setLastOrderData(invoiceData);
      setShowInvoiceModal(true);
      setCart([]);
      setShowCart(false);
    } catch (error) {
      console.error('Error completing bill:', error);
      toast.error(error.message || 'Failed to complete bill. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  // Bar Tab: Save as open tab (status: 'saved')
  const handleSaveTab = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items before saving the tab.');
      return;
    }

    setSendingOrder(true);
    try {
      const subtotal = getCartTotal();
      const { taxAmount } = calculateTax(subtotal);
      const grandTotal = subtotal + taxAmount;

      if (existingOrderId) {
        // Update existing tab
        await apiClient.updateOrder(existingOrderId, {
          items: cart.map(item => ({
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
          totalAmount: subtotal,
          taxAmount: taxAmount,
          finalAmount: grandTotal,
          status: 'saved',
        });
      } else {
        // Create new tab
        await apiClient.createOrder({
          restaurantId,
          tableNumber: selectedTable?.name || 'Tab',
          items: cart.map(item => ({
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
          })),
          orderType: 'dine-in',
          paymentMethod: 'cash',
          status: 'saved',
          totalAmount: subtotal,
          taxAmount: taxAmount,
          finalAmount: grandTotal,
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Staff',
          },
        });
      }

      setCart([]);
      setShowCart(false);
      setExistingOrderId(null);
      // Navigate back to bar billing
      router.back();
    } catch (error) {
      console.error('Error saving tab:', error);
      toast.error(error.message || 'Failed to save tab.');
    } finally {
      setSendingOrder(false);
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

  // Build type-specific subtitle for menu cards
  const getTypeSubtitle = (item) => {
    const parts = [];
    if (businessType === 'bar') {
      if (item.spiritCategory) parts.push(item.spiritCategory);
      if (item.abv) parts.push(`${item.abv}% ABV`);
      if (item.bottleSize) parts.push(item.bottleSize);
    } else if (businessType === 'bakery') {
      if (item.weight) parts.push(item.weight);
      if (item.unit) parts.push(`per ${item.unit}`);
    } else if (businessType === 'ice_cream') {
      if (item.servingSize) parts.push(item.servingSize);
    }
    return parts.length > 0 ? parts.join(' | ') : null;
  };

  const renderMenuItem = ({ item }) => {
    const cartItem = cart.find(c => c.id === item.id);
    const quantity = cartItem?.quantity || 0;
    const imageUrl = showImages ? getItemImage(item) : null;
    const isVeg = item.isVeg !== false;
    const hasImage = imageUrl !== null;
    const typeSubtitle = getTypeSubtitle(item);

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
            {typeSubtitle && (
              <Text style={styles.typeSubtitleImage} numberOfLines={1}>{typeSubtitle}</Text>
            )}

            <View style={styles.priceAddRow}>
              <Text style={styles.menuItemPriceImage}>₹{getItemDisplayPrice(item)}</Text>
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
          {typeSubtitle && (
            <Text style={styles.typeSubtitleNoImage} numberOfLines={1}>{typeSubtitle}</Text>
          )}
        </View>

        {/* Bottom Section */}
        <View style={styles.bottomSectionNoImage}>
          <Text style={styles.menuItemPriceNoImage}>₹{getItemDisplayPrice(item)}</Text>
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
      {/* Clean Header - shrinks on scroll in default mode */}
      <Animated.View
        style={[
          styles.headerSection,
          !selectedTable && {
            height: scrollY.interpolate({
              inputRange: [0, SCROLL_THRESHOLD],
              outputRange: [182, HEADER_COLLAPSED], // tight to content (title+search+chips)
              extrapolate: 'clamp',
            }),
            overflow: 'hidden',
          },
        ]}
      >
        {selectedTable ? (
          <>
            {/* Table Selection Mode */}
            <View style={styles.headerTop}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Ionicons name="arrow-back" size={24} color="#1f2937" />
              </TouchableOpacity>
              <View style={styles.tableInfoCard}>
                <Ionicons name={isBarTabMode ? "beer" : "restaurant"} size={18} color={Colors.primary} />
                <Text style={styles.tableInfoText}>{isBarTabMode ? selectedTable.name : `Table ${selectedTable.name}`}</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setSelectedTable(null);
                    setCart([]);
                    setExistingOrderId(null);
                  }}
                  style={styles.clearTableButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={styles.headerIcons}>
                {/* Network status dot */}
                <View style={[styles.networkDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
                {pendingSyncCount > 0 && (
                  <View style={styles.syncBadge}>
                    <Text style={styles.syncBadgeText}>{pendingSyncCount}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.iconBtn} onPress={toggleImages}>
                  <Ionicons
                    name={showImages ? "image" : "image-outline"}
                    size={22}
                    color="#6b7280"
                  />
                </TouchableOpacity>
                {/* <TouchableOpacity style={styles.iconBtn} onPress={() => setShowVoiceModal(true)}>
                  <Ionicons name="mic" size={22} color={Colors.primary} />
                </TouchableOpacity> */}
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Default Menu Mode - Expanded: clean modern header */}
            <Animated.View style={[styles.headerTop, styles.headerTopAccent, { opacity: scrollY.interpolate({ inputRange: [0, SCROLL_THRESHOLD], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
              <View style={styles.headerTitleSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.headerTitle}>Menu</Text>
                  {menuItems.length > 0 && (
                    <View style={styles.itemCountBadge}>
                      <Text style={styles.itemCountText}>{menuItems.length}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.headerSubtitle}>{restaurantName}</Text>
              </View>
              <View style={styles.headerIcons}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => router.push('/(tabs)/menu-management')}
                  accessibilityLabel="Manage menu"
                >
                  <Ionicons name="create-outline" size={20} color="#6b7280" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={toggleImages}>
                  <Ionicons
                    name={showImages ? "image" : "image-outline"}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Expanded Search Bar */}
            <Animated.View style={[styles.searchContainer, { opacity: scrollY.interpolate({ inputRange: [0, SCROLL_THRESHOLD], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
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
                <TouchableOpacity onPress={() => { setSearchTerm(''); setShortCodeSearch(''); }}>
                  <Ionicons name="close-circle" size={20} color="#9ca3af" />
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* Expanded Category Pills - hide when scrolled (chips move to compact bar) */}
            <Animated.View style={[styles.categoriesSection, { maxHeight: scrollY.interpolate({ inputRange: [0, SCROLL_THRESHOLD], outputRange: [44, 0], extrapolate: 'clamp' }), overflow: 'hidden', opacity: scrollY.interpolate({ inputRange: [0, SCROLL_THRESHOLD * 0.6], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
              <FlatList
                horizontal
                data={categories}
                renderItem={renderCategory}
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesContainer}
              />
            </Animated.View>

            {/* Compact sticky bar - visible when scrolled: row1 = name + search, row2 = chips (wrap) */}
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.compactHeaderBar,
                {
                  opacity: scrollY.interpolate({ inputRange: [SCROLL_THRESHOLD * 0.4, SCROLL_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' }),
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 10,
                }
              ]}
            >
              <View style={styles.compactHeaderRow1}>
                <Text style={styles.compactHeaderName} numberOfLines={1}>{restaurantName}</Text>
                <View style={styles.compactSearchWrap}>
                  <Ionicons name="search" size={16} color="#9ca3af" />
                  <TextInput
                    style={styles.compactSearchInput}
                    placeholder="Search..."
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
                </View>
                <TouchableOpacity
                  style={styles.compactManageBtn}
                  onPress={() => router.push('/(tabs)/menu-management')}
                >
                  <Ionicons name="create-outline" size={18} color="#6b7280" />
                </TouchableOpacity>
              </View>
              <View style={styles.compactChipsWrap}>
                {categories.map((item) => {
                  const isSelected = selectedCategory === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.categoryPillCompact, isSelected && styles.categoryPillCompactSelected]}
                      onPress={() => setSelectedCategory(item.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.categoryPillCompactText,
                          isSelected && styles.categoryPillCompactTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Animated.View>
          </>
        )}

      </Animated.View>

      {/* Multi-Tier Pricing Rule Selector */}
      {multiPricingEnabled && pricingRules.length > 0 && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexWrap: 'wrap', backgroundColor: '#faf5ff', borderBottomWidth: 1, borderBottomColor: '#e9d5ff' }}>
          <TouchableOpacity
            onPress={() => { setActivePricingRuleId(null); setAutoSelectedRule(false); }}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
              backgroundColor: !activePricingRuleId ? '#7c3aed' : '#f3f4f6',
              borderWidth: 1, borderColor: !activePricingRuleId ? '#7c3aed' : '#d1d5db',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '500', color: !activePricingRuleId ? '#fff' : '#6b7280' }}>Base Price</Text>
          </TouchableOpacity>
          {pricingRules.filter(r => {
            const n = (r.name || '').toLowerCase().trim();
            return !TAKEAWAY_NAMES.includes(n) && !DELIVERY_NAMES.includes(n) && !DINEIN_NAMES.includes(n);
          }).map(rule => (
            <TouchableOpacity
              key={rule.id}
              onPress={() => { if (!autoSelectedRule) setActivePricingRuleId(rule.id); }}
              style={{
                paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
                backgroundColor: activePricingRuleId === rule.id ? '#7c3aed' : '#f3f4f6',
                borderWidth: 1, borderColor: activePricingRuleId === rule.id ? '#7c3aed' : '#d1d5db',
                opacity: autoSelectedRule && activePricingRuleId !== rule.id ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: activePricingRuleId === rule.id ? '#fff' : '#6b7280' }}>
                {rule.name}{autoSelectedRule && activePricingRuleId === rule.id ? ' (auto)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <SyncIndicator visible={syncing} />

      {/* Offline Sync Banner */}
      {(!isOnline || pendingSyncCount > 0) && (
        <View style={styles.syncBanner}>
          <Ionicons
            name={isOnline ? 'sync' : 'cloud-offline-outline'}
            size={16}
            color="#92400e"
          />
          <Text style={styles.syncBannerText}>
            {!isOnline
              ? "You're offline. Orders will sync when connected."
              : `Syncing ${pendingSyncCount} pending order${pendingSyncCount > 1 ? 's' : ''}...`}
          </Text>
          {isOnline && pendingSyncCount > 0 && (
            <ActivityIndicator size="small" color="#92400e" />
          )}
        </View>
      )}

      {/* Categories section - only for table mode; default mode has categories inside header above */}
      {selectedTable && (
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
      )}

      {/* Menu Items - 2 Column Grid */}
      <FlatList
        ref={menuFlatListRef}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
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

      {/* Unified Bottom Checkout Bar - all roles */}
      {cart.length > 0 && (
        <View style={styles.checkoutBar}>
          <View style={styles.checkoutBarLeft}>
            <View style={styles.checkoutBadge}>
              <Text style={styles.checkoutBadgeText}>{cart.length}</Text>
            </View>
            <View>
              <Text style={styles.checkoutTotal}>
                ₹{(isBarTabMode || isCashier ? getGrandTotal() : getCartTotal()).toFixed(2)}
              </Text>
              {taxSettings.enabled && taxSettings.rate > 0 && (isBarTabMode || isCashier) && (
                <Text style={styles.checkoutTaxNote}>incl. {taxSettings.rate}% tax</Text>
              )}
            </View>
          </View>
          <View style={styles.checkoutBarRight}>
            {isBarTabMode ? (
              <>
                <TouchableOpacity
                  style={[styles.checkoutBtn, styles.checkoutBtnSecondary, sendingOrder && styles.orderButtonDisabled]}
                  onPress={handleSaveTab}
                  disabled={sendingOrder}
                >
                  {sendingOrder ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text style={styles.checkoutBtnText}>Save Tab</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.checkoutBtn, styles.checkoutBtnGreen, sendingOrder && styles.orderButtonDisabled]}
                  onPress={() => setShowCart(true)}
                  disabled={sendingOrder}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Settle</Text>
                </TouchableOpacity>
              </>
            ) : isWaiter && !canCompleteBill ? (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnPrimary, sendingOrder && styles.orderButtonDisabled]}
                onPress={handleSendToKitchen}
                disabled={sendingOrder}
              >
                {sendingOrder ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="send" size={16} color="#fff" />
                    <Text style={styles.checkoutBtnText}>Send to Kitchen</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : isCashier ? (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnGreen, sendingOrder && styles.orderButtonDisabled]}
                onPress={() => setShowCart(true)}
                disabled={sendingOrder}
              >
                {sendingOrder ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="receipt" size={16} color="#fff" />
                    <Text style={styles.checkoutBtnText}>Place Order</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnPrimary]}
                onPress={() => setShowCart(true)}
              >
                <Ionicons name="cart" size={16} color="#fff" />
                <Text style={styles.checkoutBtnText}>View Cart</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Voice Order Modal - Disabled */}
      {/* <VoiceOrderModal
        visible={showVoiceModal}
        onClose={() => setShowVoiceModal(false)}
        onItemsAdded={(items) => {
          items.forEach(item => addToCart(item));
          setShowVoiceModal(false);
        }}
        restaurantId={restaurantId}
      /> */}

      {/* Cart Modal - Permission Based */}
      {isWaiter && !canCompleteBill ? (
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
      ) : isCashier ? (
        <CashierCartModal
          visible={showCart}
          onClose={() => setShowCart(false)}
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onPlaceOrder={handleCashierPlaceOrder}
          total={getCartTotal()}
          restaurantName={restaurantName}
          sending={sendingOrder}
          taxSettings={taxSettings}
          restaurantId={restaurantId}
          countryCode="IN"
          onOrderTypeChange={handleOrderTypeChange}
          multiPricingEnabled={multiPricingEnabled}
          activePricingRuleName={pricingRules.find(r => r.id === activePricingRuleId)?.name}
          billingSettings={billingSettings}
          pricingRules={pricingRules}
          activePricingRuleId={activePricingRuleId}
          setActivePricingRuleId={setActivePricingRuleId}
          autoSelectedRule={autoSelectedRule}
        />
      ) : (
        <CartModal
          visible={showCart}
          onClose={() => setShowCart(false)}
          cart={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemoveItem={removeFromCart}
          onPlaceOrder={handlePlaceOrder}
          onCompleteBill={handleCompleteBill}
          total={getCartTotal()}
          tableNumber={selectedTable?.name || params.tableNumber}
          restaurantId={restaurantId}
          sending={sendingOrder}
          countryCode="IN"
          onOrderTypeChange={handleOrderTypeChange}
          hasTable={!!selectedTable?.name || !!params.tableNumber}
          multiPricingEnabled={multiPricingEnabled}
          activePricingRuleName={pricingRules.find(r => r.id === activePricingRuleId)?.name}
          billingSettings={billingSettings}
          taxSettings={taxSettings}
          pricingRules={pricingRules}
          activePricingRuleId={activePricingRuleId}
          setActivePricingRuleId={setActivePricingRuleId}
          autoSelectedRule={autoSelectedRule}
        />
      )}

      {/* KOT Modal - Shows after order is sent to kitchen */}
      <KOTModal
        visible={showKOTModal}
        onClose={() => {
          setShowKOTModal(false);
          setKotOrderData(null);
          if (isBarTabMode) {
            // Bar tab mode: go back to bar billing
            router.back();
          } else if (selectedTable || params.tableId) {
            // Redirect to tables screen after closing KOT
            router.replace({
              pathname: '/(tabs)/tables',
              params: {
                tableId: selectedTable?.id || params.tableId,
                orderId: kotOrderData?.orderId,
                tableStatus: 'occupied',
                tableNumber: selectedTable?.name || params.tableNumber,
              },
            });
          }
        }}
        orderData={kotOrderData}
      />

      {/* Cashier Invoice Modal - Shows after counter sale order is placed */}
      <CashierInvoiceModal
        visible={showInvoiceModal}
        onClose={() => {
          setShowInvoiceModal(false);
          setLastOrderData(null);
          // Navigate back to tables if came from table view (Complete Bill flow)
          if (selectedTable || params.tableId) {
            router.replace({
              pathname: '/(tabs)/tables',
              params: {
                tableId: selectedTable?.id || params.tableId,
                tableStatus: 'available',
                tableNumber: selectedTable?.name || params.tableNumber,
              },
            });
          }
        }}
        invoiceData={lastOrderData}
        onNewOrder={() => {
          setShowInvoiceModal(false);
          setLastOrderData(null);
        }}
      />
      {/* Floating Category FAB - bottom left */}
      {categories.length > 1 && (
        <TouchableOpacity
          style={styles.categoryFAB}
          onPress={() => setShowCategorySheet(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Category Bottom Sheet */}
      <Modal
        visible={showCategorySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategorySheet(false)}
      >
        <TouchableOpacity
          style={styles.categorySheetOverlay}
          activeOpacity={1}
          onPress={() => setShowCategorySheet(false)}
        >
          <View style={styles.categorySheetContainer}>
            <View style={styles.categorySheetHandle} />
            <Text style={styles.categorySheetTitle}>Categories</Text>
            <ScrollView style={styles.categorySheetScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.categorySheetGrid}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categorySheetItem, isSelected && styles.categorySheetItemSelected]}
                      onPress={() => {
                        setSelectedCategory(cat.id);
                        setShowCategorySheet(false);
                        // Scroll to top when category changes
                        setTimeout(() => {
                          menuFlatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                        }, 100);
                      }}
                    >
                      <Text style={[styles.categorySheetItemText, isSelected && styles.categorySheetItemTextSelected]} numberOfLines={2}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <ToastView />
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
    paddingBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  // Compact sticky bar (when scrolled): row1 = name + search, row2 = chips (wrap)
  compactHeaderBar: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  compactHeaderRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
  },
  compactHeaderName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    maxWidth: 72,
  },
  compactSearchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: 0,
  },
  compactSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1f2937',
    padding: 0,
    minWidth: 0,
    letterSpacing: 0,
  },
  compactManageBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignSelf: 'stretch',
  },
  compactChipsContainer: {
    gap: 4,
    paddingRight: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTopAccent: {
    paddingHorizontal: 16,
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
    flex: 1,
  },
  clearTableButton: {
    marginLeft: 8,
    padding: 4,
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    fontWeight: '500',
  },
  itemCountBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  itemCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 2,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  syncBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
    flex: 1,
  },
  syncBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginRight: 2,
  },
  syncBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
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
    letterSpacing: 0,
  },
  // Clean Category Pills
  categoriesSection: {
    backgroundColor: '#fff',
    paddingVertical: 4,
    marginBottom: 0,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 6,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    marginRight: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPillSelected: {
    backgroundColor: Colors.primary,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
  },
  categoryPillTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Compact bar chips (smaller, wrapping)
  categoryPillCompact: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginRight: 4,
    marginBottom: 4,
    minHeight: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPillCompactSelected: {
    backgroundColor: Colors.primary,
  },
  categoryPillCompactText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
  },
  categoryPillCompactTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Grid Menu List
  menuList: {
    paddingHorizontal: 16,
    paddingTop: 0,
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
  typeSubtitleImage: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  typeSubtitleNoImage: {
    fontSize: 9,
    color: '#9ca3af',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
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
  gstNote: {
    fontSize: 10,
    color: Colors.textMedium,
    marginTop: 2,
  },
  placeOrderBtn: {
    backgroundColor: '#10b981',
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
  // Category FAB
  categoryFAB: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 50,
  },
  // Category Bottom Sheet
  categorySheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  categorySheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  categorySheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 16,
  },
  categorySheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 16,
  },
  categorySheetScroll: {
    flex: 1,
  },
  categorySheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categorySheetItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minWidth: '30%',
    alignItems: 'center',
  },
  categorySheetItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categorySheetItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  categorySheetItemTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Unified Checkout Bar
  checkoutBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 40,
  },
  checkoutBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  checkoutBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  checkoutBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  checkoutTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: -0.3,
  },
  checkoutTaxNote: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 1,
  },
  checkoutBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  checkoutBtnPrimary: {
    backgroundColor: Colors.primary,
  },
  checkoutBtnSecondary: {
    backgroundColor: '#6b7280',
  },
  checkoutBtnGreen: {
    backgroundColor: '#10b981',
  },
  checkoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
