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
  RefreshControl,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { WEB_BASE_URL } from '../services/api';
import restaurantEvents from '../services/restaurantEvents';
import * as printerService from '../services/printerService';
import { getPrintStationConfig, printKOTsByStation, getLocalKotPrintingEnabled } from '../services/multiPrinterService';
import lanClient from '../services/lanClient';

const TAX_STORAGE_KEY = 'dine_tax_settings';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/Theme';
import { getDisplayImage } from '../utils/placeholderImages';
import { canPerform } from '../utils/permissions';
// import VoiceOrderModal from '../components/VoiceOrderModal';
import CartModal from '../components/CartModal';
import ItemCustomizationModal from '../components/ItemCustomizationModal';
// WaiterCartModal and CashierCartModal are deprecated — all modes now handled by CartModal with mode prop
import CashierInvoiceModal from '../components/CashierInvoiceModal';
import KOTModal from '../components/KOTModal';
import { useToast } from '../components/Toast';
import { getCached, setCache } from '../services/cacheManager';
// SyncIndicator moved to settings page
// import Pusher from 'pusher-js/react-native';
import { ref, onChildAdded, off, query, orderByChild, startAt } from 'firebase/database';
import { database } from '../config/firebase';
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import { useTabBar } from '../contexts/TabBarContext';
import { getCurrencySymbol } from '../utils/formatCurrency';
import { sanitizeSeat } from '../utils/seatOrdering';
import { resolveCustomizationExtras } from '../utils/customizationPrice';
import { resolveVariantTierPrice } from '../utils/variantPricing';
import { computeTaxBreakdown } from '../hooks/useBillingCalculation';

const TAKEAWAY_NAMES = ['takeaway', 'take away', 'take-away'];
const DELIVERY_NAMES = ['delivery'];
const DINEIN_NAMES = ['dine-in', 'dine in', 'dinein'];
const CHANNEL_NAMES = [...DINEIN_NAMES, ...TAKEAWAY_NAMES, ...DELIVERY_NAMES];
const isZoneRule = (rule) => !CHANNEL_NAMES.includes((rule?.name || '').toLowerCase().trim());
const findDineInRule = (rules) => (rules || []).find(r => r.isActive && DINEIN_NAMES.includes((r.name || '').toLowerCase().trim()));

// Forward wallet (G12) / schedule (G14) / ECR (G16) fields from the cart's discountData straight
// to the order payload so all placement flows (place/complete/kot+bill) carry them.
const extractPassthroughBilling = (dd = {}) => {
  const out = {};
  if (dd.walletRedeemAmount != null) out.walletRedeemAmount = dd.walletRedeemAmount;
  if (dd.walletCustomerId) out.walletCustomerId = dd.walletCustomerId;
  if (dd.scheduledFor) { out.scheduledFor = dd.scheduledFor; out.isScheduled = true; }
  if (dd.ecrResponse) out.ecrResponse = dd.ecrResponse;
  return out;
};

// const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec';
// const PUSHER_CLUSTER = 'ap2';

/**
 * Filter out items excluded from KOT printing by category or item ID.
 * Returns items unchanged when the feature is disabled.
 */
function filterKotExcludedItems(items, printSettings) {
  if (!printSettings?.kotExclusionEnabled) return items;
  const excludedCats = new Set(printSettings.kotExcludedCategories || []);
  const excludedIds = new Set(printSettings.kotExcludedItemIds || []);
  if (excludedCats.size === 0 && excludedIds.size === 0) return items;
  return items.filter(item => {
    if (excludedIds.has(item.id || item.menuItemId)) return false;
    if (excludedCats.has(item.categoryId)) return false;
    return true;
  });
}

export default function MenuScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { gridColumns, r, fs, sp, isTablet } = useResponsive();
  const { effectivelyOffline, pendingCount } = useOffline();
  const tabBar = useTabBar();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? Math.max(insets.bottom, 24) : insets.bottom;
  const tabBarHeight = r(64, 74) + bottomInset + 17; // +17 for version label in AnimatedTabBar
  const cols = gridColumns();
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all-items');
  const [searchTerm, setSearchTerm] = useState('');
  const [shortCodeSearch, setShortCodeSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState(''); // debounced lowercase name-search term
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [parkedCarts, setParkedCarts] = useState([]);
  const [showParkedModal, setShowParkedModal] = useState(false);
  // KOT+Bill settle-after prompt (flag-gated flow only). placedOrderIdRef records the just-placed
  // order id; kotBillModeRef tells handlePlaceOrder to SKIP navigation so we can prompt to settle.
  const placedOrderIdRef = useRef(null);
  const kotBillModeRef = useRef(false);
  const [kotBillSettle, setKotBillSettle] = useState(null); // { orderId, amount, wasTable, tableParams } | null
  const [kotBillSettling, setKotBillSettling] = useState(false);
  // const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showKOTModal, setShowKOTModal] = useState(false);
  const [kotOrderData, setKotOrderData] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [deliveryStaff, setDeliveryStaff] = useState([]); // for delivery-order assignment
  const [sendingOrder, setSendingOrder] = useState(false);
  const [isWaiter, setIsWaiter] = useState(false);
  const [isCashier, setIsCashier] = useState(false);
  const [canCompleteBill, setCanCompleteBill] = useState(false);
  const [showImages, setShowImages] = useState(true);
  const [globalHideImages, setGlobalHideImages] = useState(false);
  const [existingOrderId, setExistingOrderId] = useState(null);
  const [existingDailyOrderId, setExistingDailyOrderId] = useState(null); // daily order number for KOT updates
  const [existingOrderItems, setExistingOrderItems] = useState(null); // snapshot of items when order was loaded for editing
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [lastOrderData, setLastOrderData] = useState(null);
  const [taxSettings, setTaxSettings] = useState({ enabled: false, rate: 0, taxes: [], taxInclusivePricing: false, defaultTaxRate: 0 });
  const [billingSettings, setBillingSettings] = useState({});
  const [businessType, setBusinessType] = useState('restaurant');
  const [isBarTabMode, setIsBarTabMode] = useState(false);
  const [customizationModalOpen, setCustomizationModalOpen] = useState(false);
  const [selectedItemForCustomization, setSelectedItemForCustomization] = useState(null);
  const [isFromTablesPage, setIsFromTablesPage] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Multi-tier pricing
  const [multiPricingEnabled, setMultiPricingEnabled] = useState(false);
  const [pricingRules, setPricingRules] = useState([]);
  const [activePricingRuleId, setActivePricingRuleId] = useState(null);
  const [autoSelectedRule, setAutoSelectedRule] = useState(false);
  const [floors, setFloors] = useState([]);
  const [upiSettings, setUpiSettings] = useState({});
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [taxCategories, setTaxCategories] = useState([]); // Real categories from API (with taxGroupId) for tax resolution
  const [printSettings, setPrintSettings] = useState(null);
  const [printStationCount, setPrintStationCount] = useState(0); // Enabled station count for multi-station skip
  const [localKotPrintingOn, setLocalKotPrintingOn] = useState(false); // Whether this device prints KOTs locally for multi-station

  const { toast, ToastView } = useToast();
  const scrollY = useRef(new Animated.Value(0)).current;
  const menuFlatListRef = useRef(null);
  const categoryChipsRef = useRef(null);
  const categoryChipLayouts = useRef({});
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const HEADER_EXPANDED = 200;
  const HEADER_COLLAPSED = 92; // room for row1 + row2 chips (wrap)
  const SCROLL_THRESHOLD = 100;

  useEffect(() => {
    loadInitialData();
    loadImagePreference();
  }, []);

  // Printer disconnect modal state (replaces Alert.alert with actionable modal)
  const [showPrinterDisconnectModal, setShowPrinterDisconnectModal] = useState(false);

  // Listen for printer disconnect events — show modal so user knows
  // Skip when remote print is enabled — no local printer expected
  // Skip when user has disabled this alert
  useEffect(() => {
    const unsub = printerService.onPrinterEvent(async (event) => {
      if (event.type === 'disconnected') {
        const remotePrint = await printerService.getRemotePrintEnabled();
        if (remotePrint) return; // Remote print mode — no local printer needed
        const alertEnabled = await printerService.getDisconnectAlertEnabled();
        if (!alertEnabled) return; // User dismissed this alert
        setShowPrinterDisconnectModal(true);
      }
    });
    return unsub;
  }, []);

  // Listen for restaurant switch from other tabs (e.g. home drawer)
  useEffect(() => {
    const unsub = restaurantEvents.on('switch', ({ restaurantId: newRid, restaurant: newRest }) => {
      // Reset all menu-related state for the new restaurant
      setRestaurantId(newRid);
      setRestaurantName(newRest?.name || 'Restaurant');
      setBusinessType(newRest?.businessType || 'restaurant');
      const hideGlobal = newRest?.posSettings?.hideMenuImages === true;
      setGlobalHideImages(hideGlobal);
      if (hideGlobal) setShowImages(false);
      setMenuItems([]);
      setCategories([{ id: 'all-items', name: 'All Items' }]);
      setSelectedCategory('all-items');
      setMultiPricingEnabled(false);
      setPricingRules([]);
      setActivePricingRuleId(null);
      setAutoSelectedRule(false);
      setBillingSettings({});
      setUpiSettings({});
      setWhatsappConnected(false);
      setTaxSettings({ enabled: false, rate: 0, taxes: [], taxInclusivePricing: false, defaultTaxRate: 0 });
      setCart([]);
      setSelectedTable(null);
      setIsFromTablesPage(false);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
      setSearchTerm('');
      setShortCodeSearch('');
      tableParamsStampRef.current = null;
      lastAppliedStampRef.current = null;
      setSyncing(true);
      // Reload everything for the new restaurant
      loadInitialData();
    });
    return unsub;
  }, []);

  // Firebase RTDB + LAN Hub real-time menu updates
  useEffect(() => {
    if (!restaurantId || !database) return;

    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        apiClient.invalidateCache(`/api/menus/${restaurantId}`);
        loadMenu(restaurantId);
      }, 1000);
    };

    const menuEvents = ['menu-updated', 'menu-item-created', 'menu-item-deleted'];
    const lanUnsubs = [];

    // LAN Hub WebSocket events (when paired)
    if (lanClient.isPaired() || lanClient.isServerConnected()) { // old hub OR new on-prem local server (offline LAN)
      menuEvents.forEach(evt => {
        lanUnsubs.push(lanClient.onEvent(evt, debouncedRefresh));
      });
    }

    // Firebase RTDB — subscribe to menu and orders categories
    const now = Date.now();

    const menuQuery = query(
      ref(database, `events/${restaurantId}/menu`),
      orderByChild('ts'),
      startAt(now)
    );

    const ordersQuery = query(
      ref(database, `events/${restaurantId}/orders`),
      orderByChild('ts'),
      startAt(now)
    );

    const menuHandler = (snapshot) => {
      const data = snapshot.val();
      if (data && menuEvents.includes(data.type)) {
        debouncedRefresh();
      }
    };

    const ordersHandler = (snapshot) => {
      const data = snapshot.val();
      if (data && data.type === 'order-created') {
        debouncedRefresh();
      }
    };

    onChildAdded(menuQuery, menuHandler);
    onChildAdded(ordersQuery, ordersHandler);

    return () => {
      lanUnsubs.forEach(fn => fn());
      if (debounceTimer) clearTimeout(debounceTimer);
      off(menuQuery, 'child_added', menuHandler);
      off(ordersQuery, 'child_added', ordersHandler);
    };
  }, [restaurantId]);

  // Show tab bar when this screen focuses
  useFocusEffect(
    useCallback(() => {
      tabBar?.reset();
    }, [tabBar])
  );

  // Silently refresh menu items on focus so stock quantities are up-to-date
  // (e.g., after completing an order, deleting an order, or navigating back from another tab)
  const menuRefreshRef = useRef(0);
  const isMenuRefreshingRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!restaurantId) return;
      // Skip the very first focus (initial load already fetches menu)
      menuRefreshRef.current += 1;
      if (menuRefreshRef.current <= 1) return;
      // Skip if a refresh is already in progress (e.g., from Firebase handler)
      if (isMenuRefreshingRef.current) return;
      // Bypass offline cache layer — fetch directly from API for fresh stock data
      isMenuRefreshingRef.current = true;
      (async () => {
        try {
          apiClient.invalidateCache(`/api/menus/${restaurantId}`);
          const response = await apiClient.request(`/api/menus/${restaurantId}`);
          const items = response?.menuItems || response?.menu?.items || [];
          if (items.length > 0) {
            applyMenuData(items);
            setCache('cache_menu_' + restaurantId, items);
          }
        } catch (e) {
          // Silent fail — user still sees previously loaded data
        } finally {
          isMenuRefreshingRef.current = false;
        }
      })();
    }, [restaurantId])
  );

  // Refresh tax settings when tab is focused (e.g., after changing settings in Profile)
  // Backend endpoints use KV cache (3-min TTL) so these calls are cheap — no client throttle needed
  useFocusEffect(
    useCallback(() => {
      const refreshTaxSettings = async () => {
        if (!restaurantId) return;

        // Always load from local cache for instant update
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
              taxGroups: cachedSettings.taxGroups || [],
              taxInclusivePricing: cachedSettings.taxInclusivePricing || false,
              defaultTaxRate: cachedSettings.defaultTaxRate || 0,
            });
            // Load real categories if tax groups exist
            if (cachedSettings.taxGroups?.length > 0) {
              apiClient.getCategories(restaurantId).then(res => {
                setTaxCategories(res?.categories || []);
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.log('Cache read error:', e);
        }

        // Fetch from API in background (backend KV-cached, so this is cheap)
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
              taxGroups: settings.taxGroups || [],
              taxInclusivePricing: settings.taxInclusivePricing || false,
              defaultTaxRate: settings.defaultTaxRate || 0,
            });

            // Load real categories if tax groups exist
            if (settings.taxGroups?.length > 0) {
              apiClient.getCategories(restaurantId).then(res => {
                setTaxCategories(res?.categories || []);
              }).catch(() => {});
            }

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

        // Load UPI settings from customer app settings
        try {
          const csRes = await apiClient.getCustomerAppSettings(restaurantId);
          if (csRes?.paymentSettings) setUpiSettings(csRes.paymentSettings);
        } catch (e) {
          console.log('Customer app settings fetch error:', e);
        }

        // Load WhatsApp connection status
        try {
          const waRes = await apiClient.getWhatsAppSettings(restaurantId);
          setWhatsappConnected(waRes?.connected || false);
        } catch (e) {
          console.log('WhatsApp settings fetch error:', e);
        }
      };

      refreshTaxSettings();
    }, [restaurantId])
  );

  // Refresh user/restaurant data + pricing rules when tab is focused
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

      const refreshPricingRules = async () => {
        if (!restaurantId) return;
        try {
          const pricingRes = await apiClient.getPricingSettings(restaurantId);
          const mp = pricingRes?.settings?.multiPricing;
          if (mp?.enabled) {
            setMultiPricingEnabled(true);
            setPricingRules((mp.rules || []).filter(r => r.isActive));
          } else {
            setMultiPricingEnabled(false);
            setPricingRules([]);
          }
        } catch (e) {
          console.log('Pricing rules refresh error:', e);
        }
      };

      refreshUserData();
      refreshPricingRules();
    }, [restaurantId])
  );

  const loadImagePreference = async () => {
    try {
      if (globalHideImages) { setShowImages(false); return; }
      const saved = await AsyncStorage.getItem('menu_show_images');
      if (saved !== null) {
        setShowImages(saved === 'true');
      }
    } catch (error) {
      console.error('Error loading image preference:', error);
    }
  };

  const toggleImages = async () => {
    if (globalHideImages) return; // Global setting overrides — can't enable images
    const newValue = !showImages;
    setShowImages(newValue);
    try {
      await AsyncStorage.setItem('menu_show_images', newValue.toString());
    } catch (error) {
      console.error('Error saving image preference:', error);
    }
  };

  // Track table params stamp so we know when to clear stale table selection
  const tableParamsStampRef = useRef(null);
  const lastAppliedStampRef = useRef(null);
  // Tracks whether we just received fresh navigation params (prevents useFocusEffect from clearing them)
  const freshParamsRef = useRef(false);
  // Tracks which param combination we've already consumed (prevents re-applying stale URL params)
  const consumedParamsKeyRef = useRef(null);

  useEffect(() => {
    if (params.tableId && params.tableNumber) {
      // Build a stable key from param values — skip if we already consumed these exact params
      const paramsKey = `${params.tableId}_${params.tableNumber}_${params.orderId || ''}_${params.navStamp || ''}`;
      if (consumedParamsKeyRef.current === paramsKey) return; // Already applied & consumed
      consumedParamsKeyRef.current = paramsKey;

      const stamp = `${paramsKey}_${Date.now()}`;
      tableParamsStampRef.current = stamp;
      lastAppliedStampRef.current = stamp;
      freshParamsRef.current = true;
      setSelectedTable({ id: params.tableId, name: params.tableNumber, floor: params.floorName || '', floorId: params.floorId || '' });
      setIsFromTablesPage(true);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null); // Clear stale order when switching tables
    } else if (params.tableNumber && params.barTabMode === 'true') {
      const paramsKey = `bartab_${params.tableNumber}`;
      if (consumedParamsKeyRef.current === paramsKey) return;
      consumedParamsKeyRef.current = paramsKey;

      const stamp = `${paramsKey}_${Date.now()}`;
      tableParamsStampRef.current = stamp;
      lastAppliedStampRef.current = stamp;
      freshParamsRef.current = true;
      setSelectedTable({ id: null, name: params.tableNumber });
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
      setIsBarTabMode(true);
    }

    // Note: existing order items are now loaded via useFocusEffect from AsyncStorage (pendingAddItems)

    if (params.barTabMode === 'true') {
      setIsBarTabMode(true);
    }
  }, [params.tableId, params.tableNumber, params.existingOrder, params.orderId, params.barTabMode, params.navStamp]);

  // When menu tab regains focus WITHOUT fresh table params, clear stale table selection
  // This handles: user taps "Menu" tab directly (no table context) or navigates back
  const hasBlurredRef = useRef(false);
  const selectedTableRef = useRef(null);
  // Keep ref in sync with state
  useEffect(() => { selectedTableRef.current = selectedTable; }, [selectedTable]);

  useFocusEffect(
    useCallback(() => {
      // Check if returning from billing-webview — clear stale order state
      AsyncStorage.getItem('billingWebViewResult').then(result => {
        if (result) {
          AsyncStorage.removeItem('billingWebViewResult');
          setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
          setCart([]);
          setSelectedTable(null);
          setIsFromTablesPage(false);
          setIsBarTabMode(false);
          setAutoSelectedRule(false);
          setActivePricingRuleId(null);
          tableParamsStampRef.current = null;
          lastAppliedStampRef.current = null;
          consumedParamsKeyRef.current = null;
          router.setParams({ tableId: '', tableNumber: '', floorName: '', navStamp: '', orderId: '' });

          hasBlurredRef.current = false;
          freshParamsRef.current = false;
        }
      }).catch(() => {});

      // Check for pending "Add Items" data from tables page (stored in AsyncStorage)
      AsyncStorage.getItem('pendingAddItems').then(stored => {
        if (stored) {
          AsyncStorage.removeItem('pendingAddItems');
          try {
            const data = JSON.parse(stored);
            // Only use if recent (within 10 seconds) to avoid stale data
            if (data.timestamp && Date.now() - data.timestamp < 10000) {
              const stamp = `${data.tableId}_${data.tableNumber}_${data.orderId || ''}_${Date.now()}`;
              tableParamsStampRef.current = stamp;
              lastAppliedStampRef.current = stamp;
              freshParamsRef.current = true;
              setSelectedTable({ id: data.tableId, name: data.tableNumber, floor: data.floorName || '', floorId: data.floorId || '' });
              setIsFromTablesPage(true);
              if (data.orderId) setExistingOrderId(data.orderId);
              if (data.dailyOrderId) setExistingDailyOrderId(data.dailyOrderId);
              if (data.cartItems) {
                setCart(data.cartItems);
                setExistingOrderItems(data.cartItems.map(i => ({ menuItemId: i.menuItemId || i.id, name: i.name, quantity: i.quantity })));
              }
            }
          } catch (e) {
            console.error('Error parsing pendingAddItems:', e);
          }
          hasBlurredRef.current = false;
          return;
        }

        // No pending add-items — normal focus behavior: clear stale table selection
        // Skip if fresh params were just applied (user selected a new table from Tables tab)
        if (freshParamsRef.current) {
          freshParamsRef.current = false;
          hasBlurredRef.current = false;
          return;
        }
        if (hasBlurredRef.current && selectedTableRef.current && tableParamsStampRef.current !== null) {
          setSelectedTable(null);
          setIsFromTablesPage(false);
          setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
          setCart([]);
          setIsBarTabMode(false);
          setAutoSelectedRule(false);
          setActivePricingRuleId(null);
          tableParamsStampRef.current = null;
          lastAppliedStampRef.current = null;
          consumedParamsKeyRef.current = null;
          // Clear stale URL params
          router.setParams({ tableId: '', tableNumber: '', floorName: '', navStamp: '', orderId: '' });
        }
        hasBlurredRef.current = false;
      }).catch(() => {
        hasBlurredRef.current = false;
      });

      // On blur: mark that we left this screen
      return () => {
        hasBlurredRef.current = true;
      };
    }, []) // No deps — runs on every focus/blur
  );

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

  // Debounce the free-text search so a large menu (100s of items) isn't re-filtered on every
  // keystroke. The input stays instant (controlled); only the filtering waits ~180ms.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim().toLowerCase()), 180);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Use useMemo instead of useEffect to prevent infinite loops
  const filteredItems = useMemo(() => {
    let filtered = [...menuItems];

    // Filter by category
    if (selectedCategory !== 'all-items') {
      filtered = filtered.filter(item =>
        item.category?.toLowerCase() === selectedCategory
      );
    }

    // Filter by search term (name or description) — uses the debounced value.
    if (debouncedSearch) {
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(debouncedSearch) ||
        item.description?.toLowerCase().includes(debouncedSearch)
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
  }, [selectedCategory, debouncedSearch, shortCodeSearch, menuItems]);

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      const userRole = userData.role?.toLowerCase();
      setIsWaiter(userRole === 'waiter' || userRole === 'employee');
      setIsCashier(userRole === 'cashier' || userRole === 'sales');
      setCanCompleteBill(canPerform(userData, userData.pageAccess, 'orders', 'completeBill'));

      const rid = userData.restaurantId || userData.restaurant?.id;
      if (!rid) {
        Alert.alert('Error', 'No restaurant assigned.');
        return;
      }

      setRestaurantId(rid);
      setRestaurantName(userData.restaurant?.name || 'Restaurant');
      const bType = userData.restaurant?.businessType || 'restaurant';
      setBusinessType(bType);
      if (userData.restaurant?.posSettings?.hideMenuImages) {
        setGlobalHideImages(true);
        setShowImages(false);
      }

      // Show cached menu IMMEDIATELY — don't wait for settings
      const cached = await getCached('cache_menu_' + rid);
      if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
        applyMenuData(cached.data);
        setLoading(false);
      }

      // Load settings + fresh menu in parallel (background)
      setSyncing(true);
      await Promise.allSettled([
        loadTaxSettings(rid),
        (async () => {
          try {
            const pricingRes = await apiClient.getPricingSettings(rid);
            const mp = pricingRes?.settings?.multiPricing;
            if (mp?.enabled) {
              setMultiPricingEnabled(true);
              setPricingRules((mp.rules || []).filter(r => r.isActive));
            }
          } catch { /* ignore */ }
        })(),
        (async () => {
          try {
            const bRes = await apiClient.getBillingSettings(rid);
            if (bRes) setBillingSettings(bRes.billingSettings || bRes || {});
          } catch { /* ignore */ }
        })(),
        loadMenu(rid),
        (async () => {
          try {
            const fRes = await apiClient.getFloors(rid);
            setFloors(fRes?.floors || []);
          } catch { /* ignore */ }
        })(),
        (async () => {
          try {
            const pRes = await apiClient.getPrintSettings(rid);
            if (pRes) {
              const ps = pRes.printSettings || pRes || {};
              setPrintSettings(ps);
              // Configure opt-in image (HTML) receipt printing (default OFF).
              try { printerService.setImagePrintConfig({ enabled: ps.imagePrintEnabled, printerWidth: ps.printerWidth, autoImageForCurrency: ps.autoImageForCurrency }); } catch (_) {}
            }
          } catch { /* ignore */ }
        })(),
        (async () => {
          try {
            const sRes = await apiClient.getPrintStations(rid);
            if (sRes?.success) {
              const enabled = (sRes.printStations || []).filter(s => s.enabled).length;
              setPrintStationCount(enabled);
            }
          } catch { /* ignore */ }
        })(),
        getLocalKotPrintingEnabled().then(v => setLocalKotPrintingOn(v)).catch(() => {}),
        // Auto-reconnect saved printer for silent printing
        printerService.autoReconnect().catch(() => {}),
      ]);
      setSyncing(false);
    } catch (error) {
      console.error('Error loading menu:', error);
      if (loading) Alert.alert('Error', 'Failed to load menu. Please try again.');
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
          taxGroups: cachedSettings.taxGroups || [],
          taxInclusivePricing: cachedSettings.taxInclusivePricing || false,
          defaultTaxRate: cachedSettings.defaultTaxRate || 0,
        });
        if (cachedSettings.taxGroups?.length > 0) {
          apiClient.getCategories(rid).then(res => {
            setTaxCategories(res?.categories || []);
          }).catch(() => {});
        }
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
          taxGroups: settings.taxGroups || [],
          taxInclusivePricing: settings.taxInclusivePricing || false,
          defaultTaxRate: settings.defaultTaxRate || 0,
        });

        // Load real categories if tax groups exist
        if (settings.taxGroups?.length > 0) {
          apiClient.getCategories(rid).then(res => {
            setTaxCategories(res?.categories || []);
          }).catch(() => {});
        }

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

  const handleMenuRefresh = async () => {
    if (!restaurantId) return;
    setRefreshing(true);
    try {
      apiClient.invalidateCache(`/api/menus/${restaurantId}`);
      await loadMenu(restaurantId);
      toast.success('Menu refreshed');
    } catch (error) {
      console.error('Error refreshing menu:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Multi-tier pricing: resolve display price
  const getItemDisplayPrice = useCallback((item) => {
    if (!multiPricingEnabled || !activePricingRuleId) return item.price;
    // Priority 1: Per-item override for this exact rule
    if (item.pricingRules && typeof item.pricingRules[activePricingRuleId] === 'number') {
      return item.pricingRules[activePricingRuleId];
    }
    // Priority 2: Zone rules inherit from Dine-In per-item price
    const rule = pricingRules.find(r => r.id === activePricingRuleId);
    if (rule && isZoneRule(rule)) {
      const diRule = findDineInRule(pricingRules);
      if (diRule && item.pricingRules && typeof item.pricingRules[diRule.id] === 'number') {
        return item.pricingRules[diRule.id];
      }
    }
    // Priority 3: Rule default markup
    if (rule?.defaultMarkupType === 'percentage' && rule.defaultMarkupValue) {
      return Math.round(item.price * (1 + rule.defaultMarkupValue / 100) * 100) / 100;
    }
    if (rule?.defaultMarkupType === 'flat' && rule.defaultMarkupValue) {
      return Math.round((item.price + rule.defaultMarkupValue) * 100) / 100;
    }
    return item.price;
  }, [multiPricingEnabled, activePricingRuleId, pricingRules]);

  // Takeaway pricing rule (for showing takeaway price on menu cards)
  const takeawayRule = useMemo(() => {
    if (!multiPricingEnabled) return null;
    return pricingRules.find(r => TAKEAWAY_NAMES.includes((r.name || '').toLowerCase().trim()) && r.isActive) || null;
  }, [multiPricingEnabled, pricingRules]);

  const getItemTakeawayPrice = useCallback((item) => {
    if (!takeawayRule) return null;
    if (item.pricingRules && typeof item.pricingRules[takeawayRule.id] === 'number') {
      return item.pricingRules[takeawayRule.id];
    }
    if (takeawayRule.defaultMarkupType === 'percentage' && takeawayRule.defaultMarkupValue) {
      return Math.round(item.price * (1 + takeawayRule.defaultMarkupValue / 100) * 100) / 100;
    }
    if (takeawayRule.defaultMarkupType === 'flat' && takeawayRule.defaultMarkupValue) {
      return Math.round((item.price + takeawayRule.defaultMarkupValue) * 100) / 100;
    }
    return null;
  }, [takeawayRule]);

  // Handle order type change from CartModal/CashierCartModal → auto-select pricing rule
  const handleOrderTypeChange = useCallback((newType) => {
    if (!multiPricingEnabled) return;
    const t = (newType || '').toLowerCase().trim();
    const isDineInLike = DINEIN_NAMES.includes(t) || t === 'counter';

    // CHANNEL order types (takeaway / delivery / custom like "snoonu"): lock to the pricing rule
    // whose NAME matches this order type. Exact-name match handles CUSTOM channels; the alias sets
    // handle takeaway/delivery spelling variants. No matching rule → base price (null). Whenever
    // the tab changes, activePricingRuleId updates → the re-price effect re-resolves every cart
    // line (item- AND variant/sub-price) to that channel's price. Extends web (which only knew
    // takeaway/delivery) to any admin-defined channel.
    if (!isDineInLike) {
      let rule = pricingRules.find(r => r.isActive && (r.name || '').toLowerCase().trim() === t);
      if (!rule && TAKEAWAY_NAMES.includes(t)) rule = pricingRules.find(r => r.isActive && TAKEAWAY_NAMES.includes((r.name || '').toLowerCase().trim()));
      if (!rule && DELIVERY_NAMES.includes(t)) rule = pricingRules.find(r => r.isActive && DELIVERY_NAMES.includes((r.name || '').toLowerCase().trim()));
      setActivePricingRuleId(rule ? rule.id : null);
      setAutoSelectedRule(!!rule);
      return;
    }

    // DINE-IN / COUNTER: floor-based auto-selection (locked) → else clear to base and let the
    // user pick a zone from the selector.
    setAutoSelectedRule(false);
    const floorName = params.floorName || selectedTable?.floor || '';
    if (floorName) {
      const matched = pricingRules.find(r =>
        (r.tableMappings || []).some(m => floorName.toLowerCase().trim() === m.toLowerCase().trim())
      );
      if (matched) { setActivePricingRuleId(matched.id); setAutoSelectedRule(true); return; }
    }
    setActivePricingRuleId(null);
  }, [multiPricingEnabled, pricingRules, params.floorName, selectedTable]);

  // Handle table number entered from CashierCartModal → lookup floor → auto-select pricing rule
  const handleCashierTableSelect = useCallback((tableName, floorName) => {
    if (tableName && floorName) {
      setSelectedTable({ id: null, name: tableName, floor: floorName });
    } else if (tableName) {
      setSelectedTable({ id: null, name: tableName, floor: '' });
    } else {
      setSelectedTable(null);
      setIsFromTablesPage(false);
      setAutoSelectedRule(false);
      setActivePricingRuleId(null);
    }
  }, []);

  // Re-price cart when active pricing rule changes
  useEffect(() => {
    if (!multiPricingEnabled || cart.length === 0) return;
    setCart(prev => prev.map(item => {
      // Never re-price a manually price-edited line or a custom (ad-hoc) item —
      // those prices are set by the cashier and must stick across rule changes.
      if (item.priceEdited === true || item.isCustomItem === true) return item;
      const menuItem = menuItems.find(m => m.id === item.id || m.id === item.menuItemId);
      // Variant lines: re-resolve the VARIANT's own tier price for the active zone
      // (per-variant pricingRules → Dine-In inherit → variant base). Keeps the cart line,
      // total and payload consistent when switching DINE IN/TAKEAWAY/DELIVERY. Falls back to
      // the stored variant price when the variant has no per-tier prices.
      if (item.selectedVariant && item.selectedVariant.price != null) {
        const freshVariant = menuItem?.variants?.find(v => v.name === item.selectedVariant.name) || item.selectedVariant;
        const vBase = typeof freshVariant?.price === 'number' ? freshVariant.price : item.selectedVariant.price;
        const vPrice = resolveVariantTierPrice(freshVariant, activePricingRuleId, pricingRules);
        // Cart line price (item.price) is a per-unit total incl. customization extras — mirror how
        // addToCart stores finalPrice — so CartModal's displayed price matches getEffectiveItemPrice
        // (which reads selectedVariant.price + extras).
        const extras = resolveCustomizationExtras(item.selectedCustomizations, menuItem);
        return {
          ...item,
          price: vPrice + (extras || 0),
          originalPrice: vBase + (extras || 0),
          selectedVariant: {
            ...item.selectedVariant,
            price: vPrice,
            ...(freshVariant?.pricingRules ? { pricingRules: freshVariant.pricingRules } : {}),
          },
          appliedPricingRuleId: activePricingRuleId || null,
        };
      }
      const basePrice = item.originalPrice ?? menuItem?.price ?? item.price;
      let newPrice = basePrice;
      if (activePricingRuleId) {
        // Priority 1: Per-item override
        const perItem = menuItem?.pricingRules?.[activePricingRuleId];
        const parsed = perItem != null ? Number(perItem) : NaN;
        if (!isNaN(parsed) && parsed >= 0) {
          newPrice = parsed;
        } else {
          const rule = pricingRules.find(r => r.id === activePricingRuleId);
          // Priority 2: Zone rules inherit from Dine-In per-item price
          if (rule && isZoneRule(rule)) {
            const diRule = findDineInRule(pricingRules);
            if (diRule) {
              const diPrice = menuItem?.pricingRules?.[diRule.id];
              const diParsed = diPrice != null ? Number(diPrice) : NaN;
              if (!isNaN(diParsed) && diParsed >= 0) {
                newPrice = diParsed;
              }
            }
          }
          // Priority 3: Apply default markup from rule
          if (newPrice === basePrice) {
            if (rule?.defaultMarkupType === 'percentage' && rule.defaultMarkupValue)
              newPrice = Math.round(basePrice * (1 + rule.defaultMarkupValue / 100) * 100) / 100;
            else if (rule?.defaultMarkupType === 'flat' && rule.defaultMarkupValue)
              newPrice = Math.round((basePrice + rule.defaultMarkupValue) * 100) / 100;
          }
        }
      }
      return { ...item, price: newPrice, originalPrice: basePrice, appliedPricingRuleId: activePricingRuleId || null };
    }));
    // menuItems + pricingRules are in the deps so the cart re-prices as soon as the
    // menu/pricing data (which loads asynchronously on focus) arrives — otherwise a
    // zone selected before the data loaded would keep showing the stale/base price.
  }, [activePricingRuleId, multiPricingEnabled, menuItems, pricingRules]);

  // Cart lookup map for O(1) access instead of .find() per item
  // Aggregates quantity across variant entries sharing the same menu item id
  const cartMap = useMemo(() => {
    const map = {};
    cart.forEach(c => {
      if (map[c.id]) {
        map[c.id] = { ...map[c.id], quantity: map[c.id].quantity + c.quantity };
      } else {
        map[c.id] = c;
      }
    });
    return map;
  }, [cart]);

  const addToCart = useCallback((item) => {
    // Block out-of-stock items
    if (item.isAvailable === false) {
      Alert.alert('Out of Stock', `"${item.name}" is currently out of stock`);
      return;
    }

    // Items from customization modal have cartId — each variant/customization combo is a separate entry
    if (item.cartId) {
      setCart(prev => [...prev, {
        id: item.id, cartId: item.cartId, name: item.name,
        price: item.finalPrice || item.price,
        originalPrice: item.originalPrice || item.price,
        quantity: item.quantity || 1, menuItemId: item.id,
        category: item.category || item.categoryId || null,
        categoryId: item.categoryId || item.category || null,
        selectedVariant: item.selectedVariant || null,
        selectedCustomizations: item.selectedCustomizations || [],
        basePrice: item.basePrice || item.price,
        taxGroupId: item.taxGroupId || null,
        pricingRules: item.pricingRules || null,
        isStockManaged: item.isStockManaged || false,
        stockQuantity: item.stockQuantity,
        lowStockThreshold: item.lowStockThreshold,
        ...(activePricingRuleId ? { appliedPricingRuleId: activePricingRuleId } : {}),
      }]);
      return;
    }

    // Check stock limit
    if (item.isStockManaged && typeof item.stockQuantity === 'number') {
      setCart(prev => {
        const currentInCart = prev.find(c => c.id === item.id && !c.cartId)?.quantity || 0;
        if (currentInCart >= item.stockQuantity) {
          Alert.alert('Stock Limit', `Only ${item.stockQuantity} "${item.name}" in stock`);
          return prev;
        }
        const adjustedPrice = getItemDisplayPrice(item);
        const existing = prev.find(c => c.id === item.id && !c.cartId && (c.seat ?? null) === (item.seat ?? null));
        if (existing) {
          return prev.map(c => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
        }
        return [...prev, {
          id: item.id, name: item.name, price: adjustedPrice, originalPrice: item.price,
          quantity: 1, menuItemId: item.id,
          category: item.category || item.categoryId || null,
          categoryId: item.categoryId || item.category || null,
          taxGroupId: item.taxGroupId || null,
          pricingRules: item.pricingRules || null,
          isStockManaged: item.isStockManaged || false,
          stockQuantity: item.stockQuantity,
          lowStockThreshold: item.lowStockThreshold,
          ...(activePricingRuleId ? { appliedPricingRuleId: activePricingRuleId } : {}),
          spiritCategory: item.spiritCategory || null, abv: item.abv || null,
          servingUnit: item.servingUnit || null, bottleSize: item.bottleSize || null,
          unit: item.unit || null, weight: item.weight || null,
          servingSize: item.servingSize || null, scoopOptions: item.scoopOptions || null,
        }];
      });
      return;
    }

    const adjustedPrice = getItemDisplayPrice(item);
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id && !c.cartId && (c.seat ?? null) === (item.seat ?? null));
      if (existing) {
        return prev.map(c => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        id: item.id, name: item.name, price: adjustedPrice, originalPrice: item.price,
        quantity: 1, menuItemId: item.id,
        category: item.category || item.categoryId || null,
        categoryId: item.categoryId || item.category || null,
        taxGroupId: item.taxGroupId || null,
        pricingRules: item.pricingRules || null,
        isStockManaged: item.isStockManaged || false,
        stockQuantity: item.stockQuantity,
        lowStockThreshold: item.lowStockThreshold,
        ...(activePricingRuleId ? { appliedPricingRuleId: activePricingRuleId } : {}),
        spiritCategory: item.spiritCategory || null, abv: item.abv || null,
        servingUnit: item.servingUnit || null, bottleSize: item.bottleSize || null,
        unit: item.unit || null, weight: item.weight || null,
        servingSize: item.servingSize || null, scoopOptions: item.scoopOptions || null,
      }];
    });
  }, [getItemDisplayPrice, activePricingRuleId]);

  // Opens customization modal if item has variants/customizations, otherwise adds directly
  const handleItemPress = useCallback((item) => {
    const hasVariants = item?.variants && Array.isArray(item.variants) && item.variants.length > 0;
    const hasCustomizations = item?.customizations && Array.isArray(item.customizations) && item.customizations.length > 0;
    if (hasVariants || hasCustomizations || item.modifierGroups?.length > 0) {
      setSelectedItemForCustomization(item);
      setCustomizationModalOpen(true);
    } else {
      addToCart(item);
    }
  }, [addToCart]);

  const removeFromCart = useCallback((itemId) => {
    setCart(prev => prev.filter(item => (item.cartId || item.id) !== itemId));
  }, []);

  const updateCartQuantity = useCallback((itemId, quantity) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => (item.cartId || item.id) !== itemId));
    } else {
      setCart(prev => prev.map(item =>
        (item.cartId || item.id) === itemId ? { ...item, quantity } : item
      ));
    }
  }, []);

  // Edit a cart line's unit price (role-gated in CartModal via billingSettings.priceEditRoles).
  // Marks priceEdited so the tier re-price effect won't overwrite it. Flows through
  // getEffectiveItemPrice → subtotal/tax/payload/print like any other price.
  const editCartItemPrice = useCallback((itemId, newPrice) => {
    const p = Math.max(0, Number(newPrice) || 0);
    setCart(prev => prev.map(item =>
      (item.cartId || item.id) === itemId
        ? { ...item, price: p, priceEdited: true, originalPrice: item.originalPrice ?? item.price }
        : item
    ));
  }, []);

  // Add a custom (ad-hoc) line item (role-gated in CartModal via billingSettings.customItemRoles).
  // qty defaults to 1 but the modal can pass a quantity.
  const addCustomItem = useCallback(({ name, price, quantity }) => {
    const p = Math.max(0, Number(price) || 0);
    const q = Math.max(1, parseInt(quantity, 10) || 1);
    const nm = (name || '').trim() || 'Custom Item';
    const cid = `custom-${Date.now()}`;
    setCart(prev => [...prev, {
      cartId: cid, id: cid, menuItemId: null,
      name: nm, price: p, originalPrice: p, quantity: q,
      isCustomItem: true, category: '', categoryId: null, pricingRules: null,
    }]);
  }, []);

  // Best-effort load of delivery staff for delivery-order assignment (Gap 7).
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      try {
        const res = await apiClient.getStaff(restaurantId);
        const list = res?.staff || res?.staffList || res?.data || (Array.isArray(res) ? res : []);
        const del = (list || []).filter(s => {
          const r = (s.role || '').toLowerCase();
          const rs = Array.isArray(s.roles) ? s.roles.map(x => (x || '').toLowerCase()) : [];
          return r === 'delivery' || rs.includes('delivery');
        }).map(s => ({ id: s.id || s._id || s.staffId, name: s.name || s.fullName || 'Staff' }));
        setDeliveryStaff(del);
      } catch { /* optional feature */ }
    })();
  }, [restaurantId]);

  // After a successful order, locally decrement stock so UI updates instantly
  const decrementLocalStock = useCallback((orderedItems) => {
    if (!orderedItems || orderedItems.length === 0) return;
    const qtyMap = {};
    orderedItems.forEach(item => {
      const id = item.menuItemId || item.id;
      qtyMap[id] = (qtyMap[id] || 0) + (item.quantity || 1);
    });
    setMenuItems(prev => prev.map(mi => {
      if (!mi.isStockManaged || typeof mi.stockQuantity !== 'number') return mi;
      const ordered = qtyMap[mi.id];
      if (!ordered) return mi;
      const newQty = Math.max(0, mi.stockQuantity - ordered);
      return { ...mi, stockQuantity: newQty, isAvailable: newQty > 0 };
    }));
  }, []);

  // Returns the effective per-unit price for a cart item (variant + customizations included).
  //
  // SINGLE SOURCE OF TRUTH: use item.price. For multi-tier pricing, addToCart sets
  // item.price via getItemDisplayPrice (the FULL resolver: per-item override → zone
  // inherits Dine-In → rule default markup → base) and the re-price effect keeps it
  // current when the active rule changes. Re-resolving here from item.pricingRules with
  // a partial chain is what caused the cart line (₹60 tier) and the total/tax (₹50 base)
  // to diverge — so we deliberately DON'T re-resolve; the line, subtotal, tax and the
  // per-item order/print payload all read the same item.price.
  const getEffectiveItemPrice = (item) => {
    let base;
    if (item?.selectedVariant?.price != null) {
      base = item.selectedVariant.price;
    } else if (typeof item?.price === 'number') {
      base = item.price;
    } else if (multiPricingEnabled && activePricingRuleId) {
      // Defensive fallback only when item.price is missing (never for the normal path).
      base = getItemDisplayPrice(item);
    } else {
      base = 0;
    }
    // Re-validate add-on/customization prices against the fresh menu item (all roles),
    // so a changed modifier price is corrected rather than trusting the stale cart value.
    const freshMenuItem = menuItems.find(m => m.id === item.id || m.id === item.menuItemId);
    const extras = resolveCustomizationExtras(item?.selectedCustomizations, freshMenuItem);
    return (base || 0) + (extras || 0);
  };

  // Builds a standardized item payload for all API calls (POST/PATCH)
  const buildItemPayload = (item) => {
    const effectivePrice = getEffectiveItemPrice(item);
    return {
      menuItemId: item.menuItemId || item.id,
      name: item.name,
      price: effectivePrice,
      quantity: item.quantity,
      total: effectivePrice * (item.quantity || 1),
      notes: item.notes || '',
      category: item.category || '',
      categoryId: item.categoryId || null,
      taxGroupId: item.taxGroupId || null,
      // Carry per-item tax fields onto the order (bill/reports) — mirrors web
      ...(item.taxInclusive != null ? { taxInclusive: item.taxInclusive } : {}),
      ...(item.hsnCode ? { hsnCode: item.hsnCode } : {}),
      selectedVariant: item.selectedVariant || null,
      selectedCustomizations: Array.isArray(item.selectedCustomizations) ? item.selectedCustomizations : [],
      basePrice: typeof item.originalPrice === 'number' ? item.originalPrice : item.price,
      seat: sanitizeSeat(item.seat),
      ...(item.appliedPricingRuleId ? { appliedPricingRuleId: item.appliedPricingRuleId } : {}),
      ...(item.priceEdited === true ? { priceEdited: true } : {}),
      ...(item.isCustomItem ? { isCustomItem: true } : {}),
      ...(item.isStockManaged ? { isStockManaged: true, stockQuantity: item.stockQuantity } : {}),
    };
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (getEffectiveItemPrice(item) * (item.quantity || 1)), 0);
  };

  // Calculate tax — uses the SHARED computeTaxBreakdown (same as CartModal/useBillingCalculation)
  // so this fallback path (flows that bypass the CartModal billing panel) agrees with the panel:
  // honours tax GROUPS, per-item inclusive/exclusive, and only ENABLED taxes. `taxableAmount`
  // is the already-discounted (+SC) base; we pass it as discountedSubtotal for the flat path.
  const calculateTax = (taxableAmount) => {
    if (!taxSettings.enabled) return { taxAmount: 0, taxRate: 0, taxLabel: '' };
    // Normalize the cart so each line carries its full effective unit price (base + extras),
    // matching getCartTotal, so per-item group tax lines up with the subtotal.
    const cartForTax = cart.map(it => ({ ...it, price: getEffectiveItemPrice(it), quantity: it.quantity || 1 }));
    const { taxBreakdown, exclusiveTaxTotal } = computeTaxBreakdown({
      cart: cartForTax,
      taxSettings,
      categories: taxCategories,
      totalDiscount: 0,
      discountedSubtotal: taxableAmount,
      serviceChargeAmount: 0,
      defaultTaxName: user?.restaurant?.currencySettings?.taxLabel || 'Tax',
    });
    const taxRate = taxBreakdown.reduce((s, t) => s + (t.rate || 0), 0);
    const taxLabel = taxBreakdown.map(t => t.name || 'Tax').join(' + ');
    // Only exclusive tax is added to the total (inclusive is already inside the price).
    return { taxAmount: exclusiveTaxTotal, taxRate, taxLabel };
  };

  const getGrandTotal = () => {
    const subtotal = getCartTotal();
    const { taxAmount } = calculateTax(subtotal);
    return subtotal + taxAmount;
  };

  // --- WebView Billing ---
  const shouldUseWebViewBilling = billingSettings.useWebViewBilling && !effectivelyOffline;

  const ensureOrderExists = async () => {
    if (existingOrderId) return existingOrderId;
    // Create order WITHOUT tableNumber — backend auto-sets table to 'occupied' if tableNumber is present.
    // We don't want that yet; table status should only change when billing completes.
    // The tableNumber is passed via billingPayload and gets added during updateOrder on completion.
    const orderData = {
      restaurantId,
      items: cart.map(buildItemPayload),
      orderType: selectedTable || params.tableNumber ? 'dine-in' : (isCashier ? 'counter' : 'dine-in'),
      paymentMethod: 'cash',
      status: 'pending',
      staffInfo: {
        waiterId: user?.id,
        waiterName: user?.name || 'Staff',
      },
      ...(activePricingRuleId && { pricingRuleId: activePricingRuleId }),
    };

    const response = await apiClient.createOrder(orderData);
    const newOrderId = response?.order?.id || response?.id;
    if (newOrderId) {
      setExistingOrderId(newOrderId);
    }
    return newOrderId;
  };

  const handleOpenWebViewBilling = (orderId) => {
    const returnTo = selectedTable || params.tableNumber ? 'tables' : 'orders';

    // Build billing data payload — pass everything the web page needs
    const billingPayload = JSON.stringify({
      type: 'BILLING_DATA',
      payload: {
        orderId,
        restaurantId,
        cart: cart.map(item => ({
          ...buildItemPayload(item),
          id: item.id,
          originalPrice: item.originalPrice || item.price,
          pricingRules: item.pricingRules || {},
        })),
        orderType: selectedTable || params.tableNumber ? 'dine-in' : (isCashier ? 'counter' : 'dine-in'),
        paymentMethod: 'cash',
        tableNumber: selectedTable?.name || params.tableNumber || '',
        customerName: '',
        customerMobile: '',
        taxSettings,
        billingSettings,
        menuItems: menuItems.map(m => ({
          id: m.id, name: m.name, price: m.price,
          pricingRules: m.pricingRules || {},
          category: m.category,
        })),
        multiPricingEnabled,
        pricingRules,
        activePricingRuleId,
        upiSettings,
        restaurant: {
          name: restaurantName,
          businessType,
          countryCode: 'IN',
        },
      },
    });

    router.push({
      pathname: '/(tabs)/billing-webview',
      params: {
        billingData: billingPayload,
        returnTo,
        tableId: selectedTable?.id || params.tableId || '',
        tableNumber: selectedTable?.name || params.tableNumber || '',
      },
    });
  };

  const handleCartButtonPress = async () => {
    if (!shouldUseWebViewBilling) {
      setShowCart(true);
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart first.');
      return;
    }
    setSendingOrder(true);
    try {
      const orderId = await ensureOrderExists();
      if (orderId) {
        handleOpenWebViewBilling(orderId);
      } else {
        Alert.alert('Error', 'Failed to create order. Please try again.');
      }
    } catch (e) {
      console.error('WebView billing error:', e);
      Alert.alert('Error', 'Failed to open billing. ' + (e.message || ''));
    } finally {
      setSendingOrder(false);
    }
  };

  const handleSendToKitchen = async (customerPhone = '', specialInstructions = null, discountData = {}, tableNumberFromModal = '') => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before sending to kitchen.');
      return;
    }

    setSendingOrder(true);

    try {
      const tableId = selectedTable?.id || null;
      const tableNumber = selectedTable?.name || tableNumberFromModal || '';
      let response;
      let orderId;

      if (existingOrderId) {
        // Update existing order
        const orderData = {
          items: cart.map(buildItemPayload),
          status: 'confirmed', // Send directly to kitchen
        };

        response = await apiClient.updateOrder(existingOrderId, orderData);
        orderId = existingOrderId;
      } else {
        // Create new order — include full billing data from WaiterCartModal
        const orderData = {
          restaurantId,
          tableNumber: tableNumber,
          tableId: selectedTable?.id || null,
          floorId: selectedTable?.floorId || null,
          floorName: selectedTable?.floor || null,
          items: cart.map(buildItemPayload),
          orderType: 'dine-in',
          paymentMethod: 'cash',
          status: 'confirmed', // Send directly to kitchen
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Waiter',
          },
          ...(customerPhone && { customerPhone }),
          ...(discountData.customerId && { customerId: discountData.customerId }),
          ...(discountData.selectedOfferIds?.length > 0 && { offerIds: discountData.selectedOfferIds }),
          ...(discountData.selectedOfferNames?.length > 0 && { selectedOfferName: discountData.selectedOfferNames.join(', ') }),
          ...(discountData.appliedOffers?.length > 0 && { appliedOffers: discountData.appliedOffers }),
          ...(discountData.offerDiscount > 0 && { discountAmount: discountData.offerDiscount }),
          ...(discountData.totalDiscount > 0 && { totalDiscount: discountData.totalDiscount }),
          ...(discountData.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: discountData.redeemLoyaltyPoints }),
          ...(discountData.loyaltyDiscount > 0 && { loyaltyDiscount: discountData.loyaltyDiscount }),
          ...(discountData.serviceChargeAmount > 0 && {
            serviceChargeAmount: discountData.serviceChargeAmount,
            serviceChargeRate: discountData.serviceChargeRate,
            serviceChargeLabel: discountData.serviceChargeLabel,
          }),
          ...(discountData.taxBreakdown && { taxBreakdown: discountData.taxBreakdown }),
          ...(discountData.totalTax > 0 && { taxAmount: discountData.totalTax }),
          ...(discountData.deliveryStaffId && { deliveryStaffId: discountData.deliveryStaffId, deliveryStaffName: discountData.deliveryStaffName, deliveryPartnerId: discountData.deliveryStaffId, deliveryPartnerName: discountData.deliveryStaffName }),
          ...(discountData.tipAmount && { tipAmount: discountData.tipAmount }),
          ...(discountData.tipPercentage && { tipPercentage: discountData.tipPercentage }),
          ...(discountData.roundOffAmount != null && discountData.roundOffAmount !== 0 && { roundOffAmount: discountData.roundOffAmount }),
          ...(discountData.grandTotal && { finalAmount: discountData.grandTotal }),
          ...(specialInstructions && { specialInstructions }),
          pricingRuleId: activePricingRuleId || null,
        };

        response = await apiClient.createOrder(orderData);
        orderId = response.order?.id;
      }

      // Note: Table status update to 'occupied' is now handled by backend during POST /api/orders
      // No separate updateTableStatus call needed

      // Compute incremental items (new/changed) for KOT when updating an existing order
      let kotItems = cart;
      let isIncremental = false;
      let removedItems = [];
      if (existingOrderId && existingOrderItems) {
        const existingMap = new Map(existingOrderItems.map(i => [i.menuItemId || i.id, i]));
        const cartMap = new Map(cart.map(i => [i.menuItemId || i.id, i]));

        const newItems = cart.filter(item => !existingMap.has(item.menuItemId || item.id)).map(item => ({
          ...item,
          isNew: true,
        }));

        const updatedItems = cart.filter(item => {
          const existing = existingMap.get(item.menuItemId || item.id);
          return existing && existing.quantity !== item.quantity;
        }).map(item => {
          const existing = existingMap.get(item.menuItemId || item.id);
          return {
            ...item,
            isUpdated: true,
            previousQuantity: existing.quantity,
            quantityDelta: item.quantity - existing.quantity,
          };
        });

        // Detect removed items
        removedItems = existingOrderItems
          .filter(existing => !cartMap.has(existing.menuItemId || existing.id))
          .map(item => ({
            ...item,
            isRemoved: true,
            previousQuantity: item.quantity,
          }));

        const incrementalItems = [...newItems, ...updatedItems];
        if (incrementalItems.length > 0 || removedItems.length > 0) {
          kotItems = incrementalItems;
          isIncremental = true;
        }
      }

      // Prepare KOT data
      const orderNumber = response.order?.dailyOrderId || response.order?.orderNumber || orderId?.slice(-6);
      const kotData = {
        orderNumber,
        orderId,
        tableNumber: tableNumber,
        floorName: selectedTable?.floor || '',
        roomNumber: response.order?.roomNumber || null,
        isIncremental,
        items: filterKotExcludedItems(kotItems, printSettings).map(item => ({
          name: item.name,
          quantity: item.isUpdated && item.quantityDelta > 0 ? item.quantityDelta : item.quantity,
          notes: item.notes || '',
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          isNew: item.isNew || false,
          isUpdated: item.isUpdated || false,
          quantityDelta: item.quantityDelta || 0,
          previousQuantity: item.previousQuantity || 0,
        })),
        removedItems: removedItems.map(item => ({
          name: item.name,
          quantity: item.previousQuantity || item.quantity,
          notes: item.notes || '',
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          isRemoved: true,
        })),
        waiterName: user?.name || 'Waiter',
        waiterId: user?.id,
        timestamp: new Date(),
        restaurantName: restaurantName,
        orderType: selectedTable || tableNumberFromModal ? 'Dine-in' : 'Counter',
        customerName: customerPhone || '',
        specialInstructions: specialInstructions || '',
        dailyOrderId: orderNumber,
        printSettings: printSettings || {},
        covers: discountData.covers || 1,
      };

      // Auto-print KOT silently — show toast if print fails so waiter knows
      if (printSettings?.autoPrintOnKOT !== false) {
        if (printStationCount >= 2 && localKotPrintingOn) {
          // Multi-station: route KOTs to station printers from this device
          getPrintStationConfig(restaurantId).then(({ stations, mode, categories }) => {
            printKOTsByStation(kotData, stations, categories, mode, printSettings)
              .then(r => { if (r.printed === 0 && r.total > 0) toast.error('KOT print failed for all stations'); })
              .catch(() => {});
          }).catch(() => {});
        } else if (printStationCount < 2) {
          // Single station: print to default printer
          const kotText = printerService.generateKOTText(kotData);
          const kotHtml = printerService.wrapKOTTextInHTML(kotText);
          // imageHtml = rich designed KOT, used only by the opt-in image-print path (else ignored).
          const kotImageHtml = printerService.generateKOTHTML(kotData, printSettings || {});
          printerService.printWithFeedback({ html: kotHtml, text: kotText, imageHtml: kotImageHtml, silentOnly: true, label: 'KOT' })
            .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
            .catch(() => {});
        }
        // else: multi-station + !localKotPrintingOn → desktop handles it
      }

      // Show KOT Modal
      setKotOrderData(kotData);
      setShowKOTModal(true);
      const orderedItems = [...cart];
      setCart([]);
      decrementLocalStock(orderedItems);
      setShowCart(false);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
    } catch (error) {
      console.error('Error sending order:', error);
      toast.error(error.message || 'Failed to send order to kitchen. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  const handlePlaceOrder = async (orderType = 'dine-in', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}, tableNumberFromModal = '') => {
    // For admin/manager - full billing flow with discount support
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before placing order.');
      return;
    }

    // Table is only mandatory for dine-in orders
    const isDineIn = DINEIN_NAMES.includes((orderType || '').toLowerCase().trim());
    if (!existingOrderId && isDineIn && !selectedTable && !tableNumberFromModal) {
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
      // Prefer CartModal's per-item tax; fall back to flat tax
      const flatTaxPlaceOrder = calculateTax(taxableAmount);
      const taxAmount = discountData.totalTax != null ? discountData.totalTax : flatTaxPlaceOrder.taxAmount;
      // Prefer CartModal's grand total (computed with per-item tax)
      let grandTotal;
      if (discountData.grandTotal != null) {
        grandTotal = discountData.grandTotal;
      } else {
        const afterTax = taxableAmount + taxAmount;
        const withTip = afterTax + (discountData.tipAmount || 0);
        let localRoundOff = 0;
        if (billingSettings.roundOffEnabled) {
          const roundTo = billingSettings.roundOffTo || 1;
          localRoundOff = Math.round(withTip / roundTo) * roundTo - withTip;
          localRoundOff = Math.round(localRoundOff * 100) / 100;
        }
        grandTotal = Math.round((withTip + localRoundOff) * 100) / 100;
      }

      // Build billing fields object
      const billingFields = {};
      Object.assign(billingFields, extractPassthroughBilling(discountData));
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (discountData.roundOffAmount != null && discountData.roundOffAmount !== 0) billingFields.roundOffAmount = discountData.roundOffAmount;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      // Partial payment (use != null so partialPayAmount of 0 means "full due")
      let partialFields = {};
      if (discountData.partialPayAmount != null) {
        const paid = parseFloat(discountData.partialPayAmount) || 0;
        partialFields = {
          paidAmount: paid,
          outstandingAmount: Math.max(0, Math.round((grandTotal - paid) * 100) / 100),
          paymentStatus: paid === 0 ? 'due' : (paid >= grandTotal ? 'paid' : 'partial'),
        };
      }

      const items = cart.map(buildItemPayload);

      if (existingOrderId && isBarTabMode) {
        // Settle existing bar tab — update to completed
        await apiClient.updateOrder(existingOrderId, {
          items,
          status: 'completed',
          paymentStatus: partialFields.paymentStatus || 'paid',
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          totalAmount: subtotal,
          discountAmount: totalDiscount,
          loyaltyDiscount: discountData.loyaltyDiscount || 0,
          taxAmount: discountData.totalTax || taxAmount,
          finalAmount: discountData.grandTotal || grandTotal,
          completedAt: new Date().toISOString(),
          ...(customerName && { customerInfo: { name: customerName, phone: customerMobile, floorName: selectedTable?.floor || '' } }),
          offerIds: discountData.selectedOfferIds?.length > 0 ? discountData.selectedOfferIds : (discountData.selectedOfferId ? [discountData.selectedOfferId] : []),
          selectedOfferName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
          manualDiscount: discountData.manualDiscountAmount || 0,
          redeemLoyaltyPoints: discountData.redeemLoyaltyPoints || 0,
          customerId: discountData.customerId || null,
          pricingRuleId: activePricingRuleId || null,
          ...(discountData.taxBreakdown && { taxBreakdown: discountData.taxBreakdown }),
          ...(discountData.couponDiscount && { couponDiscount: discountData.couponDiscount }),
          ...(discountData.couponCode && { couponCode: discountData.couponCode }),
          ...(discountData.couponId && { couponId: discountData.couponId }),
          ...billingFields,
          ...partialFields,
        });

        // Redeem coupon after bar tab settle
        if (discountData.couponId) {
          apiClient.redeemCoupon(restaurantId, discountData.couponId, existingOrderId).catch(err => console.warn('Coupon redeem:', err));
        }

        await apiClient.verifyPayment({
          orderId: existingOrderId,
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          amount: grandTotal,
          userId: user?.id,
          restaurantId,
          paymentStatus: 'completed',
        }).catch(() => {}); // Don't block on payment verification

        // Explicitly release table after bar tab settle
        const barTabTable = selectedTable || (params.tableId ? { id: params.tableId } : null);
        if (barTabTable?.id) {
          apiClient.updateTableStatus(barTabTable.id, 'available', null, restaurantId)
            .catch(err => console.warn('Table release after tab settle failed:', err.message));
        }

        toast.success('Tab settled!');
        const orderedItems = [...cart];
        setCart([]);
        decrementLocalStock(orderedItems);
        setShowCart(false);
        setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
        router.back();
      } else if (existingOrderId) {
        // Update existing order (adding items to occupied table)
        const updateData = {
          items,
          status: 'confirmed',
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          totalAmount: subtotal,
          discountAmount: totalDiscount,
          loyaltyDiscount: discountData.loyaltyDiscount || 0,
          taxAmount: taxAmount,
          ...(customerName && { customerInfo: { name: customerName, phone: customerMobile, floorName: selectedTable?.floor || '' } }),
          ...(customerMobile && { customerPhone: customerMobile }),
          offerIds: discountData.selectedOfferIds?.length > 0 ? discountData.selectedOfferIds : (discountData.selectedOfferId ? [discountData.selectedOfferId] : []),
          selectedOfferName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
          manualDiscount: discountData.manualDiscountAmount || 0,
          redeemLoyaltyPoints: discountData.redeemLoyaltyPoints || 0,
          customerId: discountData.customerId || null,
          finalAmount: grandTotal,
          ...(discountData.couponDiscount && { couponDiscount: discountData.couponDiscount }),
          ...(discountData.couponCode && { couponCode: discountData.couponCode }),
          ...(discountData.couponId && { couponId: discountData.couponId }),
          ...billingFields,
          ...partialFields,
        };

        const updateResponse = await apiClient.updateOrder(existingOrderId, updateData);

        // Auto-print KOT for newly added/changed items (fire and forget)
        if (printSettings?.autoPrintOnKOT !== false) {
          let kotItems = cart;
          let isIncremental = false;
          let removedKotItems = [];
          if (existingOrderItems) {
            const existingMap = new Map(existingOrderItems.map(i => [i.menuItemId || i.id, i]));
            const cartMap = new Map(cart.map(i => [i.menuItemId || i.id, i]));

            const newItems = cart.filter(item => !existingMap.has(item.menuItemId || item.id)).map(item => ({
              ...item,
              isNew: true,
            }));
            const updatedItems = cart.filter(item => {
              const existing = existingMap.get(item.menuItemId || item.id);
              return existing && existing.quantity !== item.quantity;
            }).map(item => {
              const existing = existingMap.get(item.menuItemId || item.id);
              return {
                ...item,
                isUpdated: true,
                previousQuantity: existing.quantity,
                quantityDelta: item.quantity - existing.quantity,
              };
            });

            removedKotItems = existingOrderItems
              .filter(existing => !cartMap.has(existing.menuItemId || existing.id))
              .map(item => ({
                name: item.name,
                quantity: item.quantity,
                isRemoved: true,
              }));

            const incrementalItems = [...newItems, ...updatedItems];
            if (incrementalItems.length > 0 || removedKotItems.length > 0) {
              kotItems = incrementalItems;
              isIncremental = true;
            }
          }
          if (kotItems.length > 0 || removedKotItems.length > 0) {
            const kotData = {
              orderNumber: updateResponse?.order?.dailyOrderId || updateResponse?.order?.orderNumber || existingDailyOrderId || '',
              orderId: existingOrderId,
              dailyOrderId: updateResponse?.order?.dailyOrderId || updateResponse?.order?.orderNumber || existingDailyOrderId || '',
              tableNumber: selectedTable?.name || '',
              floorName: selectedTable?.floor || '',
              isIncremental,
              items: filterKotExcludedItems(kotItems, printSettings).map(item => ({
                name: item.name,
                quantity: item.isUpdated && item.quantityDelta > 0 ? item.quantityDelta : item.quantity,
                notes: item.notes || '',
                selectedVariant: item.selectedVariant || null,
                selectedCustomizations: item.selectedCustomizations || [],
                isNew: item.isNew || false,
                isUpdated: item.isUpdated || false,
                quantityDelta: item.quantityDelta || 0,
                previousQuantity: item.previousQuantity || 0,
              })),
              removedItems: removedKotItems,
              waiterName: user?.name || 'Staff',
              timestamp: new Date(),
              restaurantName: restaurantName,
              orderType: orderType || 'Dine-in',
              customerName: customerName || '',
              specialInstructions: discountData.specialInstructions || '',
              printSettings: printSettings || {},
              restaurantId,
              covers: discountData.covers || 1,
            };

            if (printStationCount >= 2 && localKotPrintingOn) {
              // Multi-station: route KOTs to station printers from this device
              getPrintStationConfig(restaurantId).then(({ stations, mode, categories }) => {
                printKOTsByStation(kotData, stations, categories, mode, printSettings)
                  .then(r => { if (r.printed === 0 && r.total > 0) toast.error('KOT print failed for all stations'); })
                  .catch(() => {});
              }).catch(() => {});
            } else if (printStationCount < 2) {
              // Single station: print to default printer
              const kotText = printerService.generateKOTText(kotData);
              printerService.printWithFeedback({ text: kotText, silentOnly: true, label: 'KOT' })
                .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
                .catch(() => {});
            }
            // else: multi-station + !localKotPrintingOn → desktop handles it
          }
        }

        // Redeem coupon after order update
        if (discountData.couponId) {
          apiClient.redeemCoupon(restaurantId, discountData.couponId, existingOrderId).catch(err => console.warn('Coupon redeem:', err));
        }

        toast.success('Order updated successfully!');
        const orderedItems = [...cart];
        setCart([]);
        decrementLocalStock(orderedItems);
        setShowCart(false);
        setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
        if (selectedTable) {
          router.replace({
            pathname: '/(tabs)/tables',
            params: {
              tableId: selectedTable?.id,
              orderId: existingOrderId,
              tableStatus: 'occupied',
              tableNumber: selectedTable?.name,
            },
          });
        } else {
          router.push('/(tabs)/orders');
        }
      } else {
        const orderData = {
          restaurantId,
          tableNumber: selectedTable?.name || tableNumberFromModal || '',
          tableId: selectedTable?.id || null,
          floorId: selectedTable?.floorId || null,
          floorName: selectedTable?.floor || null,
          items,
          orderType: isBarTabMode ? 'dine-in' : orderType,
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          status: isBarTabMode ? 'completed' : 'confirmed',
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Manager',
          },
          totalAmount: subtotal,
          discountAmount: totalDiscount,
          loyaltyDiscount: discountData.loyaltyDiscount || 0,
          taxAmount: taxAmount,
          ...(customerName && { customerInfo: { name: customerName, phone: customerMobile, floorName: selectedTable?.floor || '' } }),
          ...(customerMobile && { customerPhone: customerMobile }),
          offerIds: discountData.selectedOfferIds?.length > 0 ? discountData.selectedOfferIds : (discountData.selectedOfferId ? [discountData.selectedOfferId] : []),
          selectedOfferName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
          manualDiscount: discountData.manualDiscountAmount || 0,
          redeemLoyaltyPoints: discountData.redeemLoyaltyPoints || 0,
          customerId: discountData.customerId || null,
          pricingRuleId: activePricingRuleId || null,
          finalAmount: grandTotal,
          // Coupon fields
          ...(discountData.couponDiscount && { couponDiscount: discountData.couponDiscount }),
          ...(discountData.couponCode && { couponCode: discountData.couponCode }),
          ...(discountData.couponId && { couponId: discountData.couponId }),
          ...billingFields,
          ...partialFields,
        };

        let response;
        response = await apiClient.createOrder(orderData);
        placedOrderIdRef.current = response.order?.id || null; // for the KOT+Bill settle prompt

        // Redeem coupon after successful order (fire-and-forget)
        if (discountData.couponId && response.order?.id) {
          apiClient.redeemCoupon(restaurantId, discountData.couponId, response.order.id).catch(err => console.warn('Coupon redeem:', err));
        }

        // Auto-print KOT silently for confirmed orders (fire and forget)
        if (!isBarTabMode && orderData.status === 'confirmed' && printSettings?.autoPrintOnKOT !== false) {
          const kotData = {
            orderNumber: response.order?.dailyOrderId || response.order?.orderNumber || '',
            orderId: response.order?.id,
            tableNumber: orderData.tableNumber || '',
            floorName: selectedTable?.floor || '',
            roomNumber: response.order?.roomNumber || null,
            items: filterKotExcludedItems(cart, printSettings).map(item => ({ name: item.name, quantity: item.quantity, notes: item.notes || '', selectedVariant: item.selectedVariant || null, selectedCustomizations: item.selectedCustomizations || [] })),
            waiterName: user?.name || 'Manager',
            waiterId: user?.id,
            timestamp: new Date(),
            restaurantName,
            orderType: orderType || '',
            customerName: customerName || '',
            specialInstructions: discountData.specialInstructions || '',
            printSettings: printSettings || {},
            restaurantId,
            covers: discountData.covers || 1,
          };

          if (printStationCount >= 2 && localKotPrintingOn) {
            // Multi-station: route KOTs to station printers from this device
            getPrintStationConfig(restaurantId).then(({ stations, mode, categories }) => {
              printKOTsByStation(kotData, stations, categories, mode, printSettings)
                .then(r => { if (r.printed === 0 && r.total > 0) toast.error('KOT print failed for all stations'); })
                .catch(() => {});
            }).catch(() => {});
          } else if (printStationCount < 2) {
            // Single station: print to default printer
            const kotText = printerService.generateKOTText(kotData);
            const kotHtml = printerService.wrapKOTTextInHTML(kotText);
            const kotImageHtml = printerService.generateKOTHTML(kotData, printSettings || {});
            printerService.printWithFeedback({ html: kotHtml, text: kotText, imageHtml: kotImageHtml, silentOnly: true, label: 'KOT' })
              .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
              .catch(() => {});
          }
          // else: multi-station + !localKotPrintingOn → desktop handles it
        }

        if (isBarTabMode) {
          await apiClient.verifyPayment({
            orderId: response.order?.id,
            paymentMethod,
            amount: grandTotal,
            userId: user?.id,
            restaurantId,
            paymentStatus: 'completed',
          }).catch(() => {});

          // Release table after new bar tab settle
          const barTable = selectedTable || (params.tableId ? { id: params.tableId } : null);
          if (barTable?.id) {
            apiClient.updateTableStatus(barTable.id, 'available', null, restaurantId)
              .catch(err => console.warn('Table release after tab settle failed:', err.message));
          }

          toast.success('Tab settled!');
          const orderedItems = [...cart];
          setCart([]);
          decrementLocalStock(orderedItems);
          setShowCart(false);
          router.back();
        } else {
          toast.success('Order placed successfully!');
          const orderedItems = [...cart];
          setCart([]);
          decrementLocalStock(orderedItems);
          setShowCart(false);
          // KOT+Bill flow: DON'T navigate — handleKotAndBill will show a settle prompt on this
          // screen and navigate after. Normal Place Order (ref false) keeps its exact behaviour.
          if (kotBillModeRef.current) {
            // stay put for the settle prompt
          } else if (selectedTable || params.tableId) {
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
  const handleCashierPlaceOrder = async (orderType = 'counter', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}, tableNumberFromModal = '') => {
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
      // Prefer CartModal's per-item tax calculation; fall back to flat tax
      const flatTax = calculateTax(taxableAmount);
      const taxAmount = discountData.totalTax != null ? discountData.totalTax : flatTax.taxAmount;
      const taxRate = flatTax.taxRate;
      const taxLabel = flatTax.taxLabel;
      // Prefer CartModal's grand total (computed with per-item tax) over local flat recalculation
      let grandTotal;
      if (discountData.grandTotal != null) {
        grandTotal = discountData.grandTotal;
      } else {
        const afterTax = taxableAmount + taxAmount;
        const withTip = afterTax + (discountData.tipAmount || 0);
        let localRoundOff = 0;
        if (billingSettings.roundOffEnabled) {
          const roundTo = billingSettings.roundOffTo || 1;
          localRoundOff = Math.round(withTip / roundTo) * roundTo - withTip;
          localRoundOff = Math.round(localRoundOff * 100) / 100;
        }
        grandTotal = Math.round((withTip + localRoundOff) * 100) / 100;
      }

      // Build billing fields
      const billingFields = {};
      Object.assign(billingFields, extractPassthroughBilling(discountData));
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (discountData.roundOffAmount != null && discountData.roundOffAmount !== 0) billingFields.roundOffAmount = discountData.roundOffAmount;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      let partialFields = {};
      if (discountData.partialPayAmount != null) {
        const paid = parseFloat(discountData.partialPayAmount) || 0;
        partialFields = {
          paidAmount: paid,
          outstandingAmount: Math.max(0, Math.round((grandTotal - paid) * 100) / 100),
          paymentStatus: paid === 0 ? 'due' : (paid >= grandTotal ? 'paid' : 'partial'),
        };
      }

      const orderData = {
        restaurantId,
        ...(tableNumberFromModal ? { tableNumber: tableNumberFromModal } : {}),
        items: cart.map(buildItemPayload),
        orderType: orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        status: 'completed', // Counter sales are completed immediately
        paymentStatus: partialFields.paymentStatus || 'paid',
        completedAt: new Date().toISOString(),
        staffInfo: {
          waiterId: user?.id,
          waiterName: user?.name || 'Cashier',
        },
        customerInfo: {
          name: customerName || 'Walk-in Customer',
          phone: customerMobile || '',
        },
        subtotal: subtotal,
        tax: taxAmount,
        taxRate: taxRate,
        ...(discountData.taxBreakdown && { taxBreakdown: discountData.taxBreakdown }),
        total: grandTotal,
        finalAmount: grandTotal,
        // Discount/loyalty data
        ...(((discountData.selectedOfferIds?.length > 0) || discountData.selectedOfferId) && { offerIds: discountData.selectedOfferIds?.length > 0 ? discountData.selectedOfferIds : [discountData.selectedOfferId] }),
        selectedOfferName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
        ...(discountData.manualDiscountAmount > 0 && { manualDiscount: discountData.manualDiscountAmount }),
        ...(discountData.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: discountData.redeemLoyaltyPoints }),
        ...(customerMobile && { customerPhone: customerMobile }),
        customerId: discountData.customerId || null,
        discountAmount: totalDiscount,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        ...(discountData.couponDiscount > 0 && { couponDiscount: discountData.couponDiscount }),
        ...(discountData.couponCode && { couponCode: discountData.couponCode }),
        ...(discountData.couponId && { couponId: discountData.couponId }),
        pricingRuleId: activePricingRuleId || null,
        ...billingFields,
        ...partialFields,
      };

      let response;
      response = await apiClient.createOrder(orderData);

      // Verify payment — triggers customer stats update (totalOrders, totalSpent, loyaltyPoints)
      if (response?.order?.id) {
        await apiClient.verifyPayment({
          orderId: response.order.id,
          paymentMethod: billingFields.paymentMethod || paymentMethod,
          amount: grandTotal,
          userId: user?.id,
          restaurantId,
          paymentStatus: 'completed',
        }).catch(() => {});

        // Redeem coupon after successful order (fire-and-forget)
        if (discountData.couponId) {
          apiClient.redeemCoupon(restaurantId, discountData.couponId, response.order.id).catch(() => {});
        }
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
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          notes: item.notes || '',
        })),
        subtotal: subtotal,
        tax: taxAmount,
        taxRate: taxRate,
        taxLabel: taxLabel,
        taxEnabled: taxSettings.enabled,
        taxBreakdown: discountData.taxBreakdown || null,
        grandTotal: grandTotal,
        customerName: customerName || 'Walk-in Customer',
        customerMobile: customerMobile || '',
        orderType: orderType,
        ...(tableNumberFromModal ? { tableNumber: tableNumberFromModal } : {}),
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        timestamp: new Date(),
        staffName: user?.name || 'Cashier',
        // Discount fields for invoice
        offerDiscount: discountData.offerDiscount || 0,
        offerName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
        appliedOffers: discountData.appliedOffers || [],
        manualDiscount: discountData.manualDiscountAmount || 0,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        couponDiscount: discountData.couponDiscount || 0,
        couponCode: discountData.couponCode || null,
        // Billing fields for invoice
        serviceChargeAmount: serviceCharge || 0,
        serviceChargeRate: discountData.serviceChargeRate || 0,
        tipAmount: discountData.tipAmount || 0,
        roundOffAmount: discountData.roundOffAmount || 0,
        cashReceived: discountData.cashReceived || null,
        changeReturned: discountData.changeReturned || null,
        splitPayments: discountData.splitPayments || null,
        printSettings: printSettings || {},
      };

      // Auto-print bill silently — per-guest receipts if the bill was split.
      if (printSettings?.autoPrintOnBilling !== false) {
        const guests = discountData.splitBill?.guests;
        if (Array.isArray(guests) && guests.length > 1) {
          guests.forEach((g, i) => {
            const guestInvoice = { ...invoiceData, grandTotal: g.amount, splitLabel: `Split ${i + 1} of ${guests.length}${g.name ? ` — ${g.name}` : ''}`, customerName: g.name || invoiceData.customerName };
            printerService.printWithFeedback({ text: printerService.generateBillText(guestInvoice), imageHtml: printerService.generateBillHTML(guestInvoice, printSettings || {}), silentOnly: true, label: `Bill (split ${i + 1}/${guests.length})` }).catch(() => {});
          });
        } else {
          const billText = printerService.generateBillText(invoiceData);
          // imageHtml = rich designed bill, used only by the opt-in image-print path (else ignored).
          const billImageHtml = printerService.generateBillHTML(invoiceData, printSettings || {});
          printerService.printWithFeedback({ text: billText, imageHtml: billImageHtml, silentOnly: true, label: 'Bill' })
            .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
            .catch(() => {});
        }
      }

      setLastOrderData(invoiceData);
      setShowInvoiceModal(true);
      const orderedItems = [...cart];
      setCart([]);
      decrementLocalStock(orderedItems);
      setShowCart(false);
      setSelectedTable(null);
      setIsFromTablesPage(false);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
      setAutoSelectedRule(false);
      setActivePricingRuleId(null);
      tableParamsStampRef.current = null;
      lastAppliedStampRef.current = null;
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
      // Prefer CartModal's per-item tax; fall back to flat tax
      const flatTaxResult = calculateTax(taxableAmount);
      const taxRate = flatTaxResult.taxRate;
      const taxLabel = flatTaxResult.taxLabel;
      const taxAmount = discountData.totalTax != null ? discountData.totalTax : flatTaxResult.taxAmount;
      // Prefer CartModal's grand total (computed with per-item tax)
      let grandTotal;
      if (discountData.grandTotal != null) {
        grandTotal = discountData.grandTotal;
      } else {
        const afterTax = taxableAmount + taxAmount;
        const withTip = afterTax + (discountData.tipAmount || 0);
        let localRoundOff = 0;
        if (billingSettings.roundOffEnabled) {
          const roundTo = billingSettings.roundOffTo || 1;
          localRoundOff = Math.round(withTip / roundTo) * roundTo - withTip;
          localRoundOff = Math.round(localRoundOff * 100) / 100;
        }
        grandTotal = Math.round((withTip + localRoundOff) * 100) / 100;
      }

      // Build billing fields
      const billingFields = {};
      Object.assign(billingFields, extractPassthroughBilling(discountData));
      if (discountData.serviceChargeRate) billingFields.serviceChargeRate = discountData.serviceChargeRate;
      if (serviceCharge) billingFields.serviceChargeAmount = serviceCharge;
      if (discountData.tipAmount) billingFields.tipAmount = discountData.tipAmount;
      if (discountData.tipPercentage) billingFields.tipPercentage = discountData.tipPercentage;
      if (discountData.cashReceived) billingFields.cashReceived = discountData.cashReceived;
      if (discountData.changeReturned) billingFields.changeReturned = discountData.changeReturned;
      if (discountData.splitPayments) billingFields.splitPayments = discountData.splitPayments;
      if (discountData.compItems) billingFields.compItems = discountData.compItems;
      if (discountData.voidItems) billingFields.voidItems = discountData.voidItems;
      if (discountData.roundOffAmount != null && discountData.roundOffAmount !== 0) billingFields.roundOffAmount = discountData.roundOffAmount;
      if (discountData.splitPayments) billingFields.paymentMethod = 'split';

      let partialFields = {};
      if (discountData.partialPayAmount != null) {
        const paid = parseFloat(discountData.partialPayAmount) || 0;
        partialFields = {
          paidAmount: paid,
          outstandingAmount: Math.max(0, Math.round((grandTotal - paid) * 100) / 100),
          paymentStatus: paid === 0 ? 'due' : (paid >= grandTotal ? 'paid' : 'partial'),
        };
      }

      const tableNum = selectedTable?.name || params.tableNumber;
      const orderData = {
        restaurantId,
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
          phone: customerMobile || '',
        },
        ...(customerMobile && { customerPhone: customerMobile }),
        subtotal,
        tax: taxAmount,
        taxRate,
        ...(discountData.taxBreakdown && { taxBreakdown: discountData.taxBreakdown }),
        total: grandTotal,
        finalAmount: grandTotal,
        completedAt: new Date().toISOString(),
        ...(((discountData.selectedOfferIds?.length > 0) || discountData.selectedOfferId) && { offerIds: discountData.selectedOfferIds?.length > 0 ? discountData.selectedOfferIds : [discountData.selectedOfferId] }),
        selectedOfferName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
        ...(discountData.manualDiscountAmount > 0 && { manualDiscount: discountData.manualDiscountAmount }),
        ...(discountData.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: discountData.redeemLoyaltyPoints }),
        customerId: discountData.customerId || null,
        discountAmount: totalDiscount,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        pricingRuleId: activePricingRuleId || null,
        ...billingFields,
        ...partialFields,
      };

      let response;
      let completedOrderId;

      if (existingOrderId) {
        // Update existing order to completed (billing an occupied table's order)
        response = await apiClient.updateOrder(existingOrderId, {
          ...orderData,
          tableNumber: undefined, // Don't send tableNumber to avoid validation
        });
        completedOrderId = existingOrderId;
      } else {
        response = await apiClient.createOrder(orderData);
        completedOrderId = response.order?.id;
      }

      // Verify payment
      await apiClient.verifyPayment({
        orderId: completedOrderId,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        amount: grandTotal,
        userId: user?.id,
        restaurantId,
        paymentStatus: 'completed',
      }).catch(() => {});

      // Explicitly release table (don't rely solely on Firebase RTDB event)
      const tableToRelease = selectedTable || (params.tableId ? { id: params.tableId } : null);
      if (tableToRelease?.id) {
        apiClient.updateTableStatus(tableToRelease.id, 'available', null, restaurantId)
          .catch(err => console.warn('Table release after billing failed:', err.message));
      }

      // Fetch latest user data for invoice settings
      const latestUserData = await apiClient.getUser();
      const latestRestaurantInfo = latestUserData?.restaurant || user?.restaurant || {};

      // Prepare invoice data
      const invoiceData = {
        orderId: completedOrderId,
        orderNumber: response?.order?.dailyOrderId || response?.order?.orderNumber || completedOrderId?.slice(-6),
        restaurantName,
        restaurantInfo: latestRestaurantInfo,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          notes: item.notes || '',
        })),
        subtotal,
        tax: taxAmount,
        taxRate,
        taxLabel,
        taxEnabled: taxSettings.enabled,
        taxBreakdown: discountData.taxBreakdown || null,
        grandTotal,
        customerName: customerName || 'Walk-in Customer',
        customerMobile: customerMobile || '',
        orderType,
        paymentMethod: billingFields.paymentMethod || paymentMethod,
        timestamp: new Date(),
        staffName: user?.name || 'Manager',
        offerDiscount: discountData.offerDiscount || 0,
        offerName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
        appliedOffers: discountData.appliedOffers || [],
        manualDiscount: discountData.manualDiscountAmount || 0,
        loyaltyDiscount: discountData.loyaltyDiscount || 0,
        couponDiscount: discountData.couponDiscount || 0,
        couponCode: discountData.couponCode || null,
        serviceChargeAmount: serviceCharge || 0,
        serviceChargeRate: discountData.serviceChargeRate || null,
        roundOffAmount: discountData.roundOffAmount || 0,
        tipAmount: discountData.tipAmount || 0,
        cashReceived: discountData.cashReceived || null,
        changeReturned: discountData.changeReturned || null,
        splitPayments: discountData.splitPayments || null,
        printSettings: printSettings || {},
      };

      // Auto-print bill silently. If the bill was split among guests, print one
      // receipt per guest (same generateBillText, grandTotal = that guest's share).
      if (printSettings?.autoPrintOnBilling !== false) {
        const guests = discountData.splitBill?.guests;
        if (Array.isArray(guests) && guests.length > 1) {
          guests.forEach((g, i) => {
            const guestInvoice = {
              ...invoiceData,
              grandTotal: g.amount,
              splitLabel: `Split ${i + 1} of ${guests.length}${g.name ? ` — ${g.name}` : ''}`,
              customerName: g.name || invoiceData.customerName,
            };
            const gt = printerService.generateBillText(guestInvoice);
            printerService.printWithFeedback({ text: gt, silentOnly: true, label: `Bill (split ${i + 1}/${guests.length})` })
              .catch(() => {});
          });
        } else {
          const billText = printerService.generateBillText(invoiceData);
          printerService.printWithFeedback({ text: billText, silentOnly: true, label: 'Bill' })
            .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
            .catch(() => {});
        }
      }

      // Auto-open cash drawer for cash payments
      if ((billingFields.paymentMethod || paymentMethod) === 'cash' && user?.restaurant?.posSettings?.enableCashDrawer) {
        printerService.openCashDrawer().catch(() => {});
      }

      setLastOrderData(invoiceData);
      setShowInvoiceModal(true);
      const orderedItems = [...cart];
      setCart([]);
      decrementLocalStock(orderedItems);
      setShowCart(false);
      setSelectedTable(null);
      setIsFromTablesPage(false);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
      setAutoSelectedRule(false);
      setActivePricingRuleId(null);
      tableParamsStampRef.current = null;
      lastAppliedStampRef.current = null;
    } catch (error) {
      console.error('Error completing bill:', error);
      toast.error(error.message || 'Failed to complete bill. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  // One-click "KOT + Bill" (printSettings.kotThenBill, default off): place the order (status
  // 'confirmed', UNPAID) + print the KOT, then print the bill. Payment is settled later via
  // Complete Bill. Reuses handlePlaceOrder for order-create + KOT + navigation (so behaviour
  // stays identical to Place Order), then prints the bill from a snapshot taken before the
  // cart clears. Additive — does not change any existing handler.
  const handleKotAndBill = async (orderType = 'dine-in', paymentMethod = 'cash', customerName = '', customerMobile = '', discountData = {}, tableNumberFromModal = '') => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to cart before placing order.');
      return;
    }

    // Totals — computed identically to Complete Bill so the printed bill matches.
    const subtotal = getCartTotal();
    const totalDiscount = discountData.totalDiscount || 0;
    const discountedSubtotal = Math.max(0, subtotal - totalDiscount);
    const serviceCharge = discountData.serviceChargeAmount || 0;
    const taxableAmount = discountedSubtotal + serviceCharge;
    const flatTaxResult = calculateTax(taxableAmount);
    const taxRate = flatTaxResult.taxRate;
    const taxLabel = flatTaxResult.taxLabel;
    const taxAmount = discountData.totalTax != null ? discountData.totalTax : flatTaxResult.taxAmount;
    let grandTotal;
    if (discountData.grandTotal != null) {
      grandTotal = discountData.grandTotal;
    } else {
      const afterTax = taxableAmount + taxAmount;
      const withTip = afterTax + (discountData.tipAmount || 0);
      let localRoundOff = 0;
      if (billingSettings.roundOffEnabled) {
        const roundTo = billingSettings.roundOffTo || 1;
        localRoundOff = Math.round(withTip / roundTo) * roundTo - withTip;
        localRoundOff = Math.round(localRoundOff * 100) / 100;
      }
      grandTotal = Math.round((withTip + localRoundOff) * 100) / 100;
    }

    // Snapshot the bill BEFORE handlePlaceOrder clears the cart.
    let latestRestaurantInfo = user?.restaurant || {};
    try { const lu = await apiClient.getUser(); latestRestaurantInfo = lu?.restaurant || latestRestaurantInfo; } catch { /* use cached */ }
    const billInvoice = {
      orderNumber: '',
      restaurantName,
      restaurantInfo: latestRestaurantInfo,
      items: cart.map(item => ({
        name: item.name, quantity: item.quantity, price: item.price,
        total: item.price * item.quantity,
        selectedVariant: item.selectedVariant || null,
        selectedCustomizations: item.selectedCustomizations || [],
        notes: item.notes || '',
      })),
      subtotal, tax: taxAmount, taxRate, taxLabel, taxEnabled: taxSettings.enabled,
      taxBreakdown: discountData.taxBreakdown || null,
      grandTotal,
      customerName: customerName || 'Walk-in Customer',
      customerMobile: customerMobile || '',
      orderType,
      paymentMethod: discountData.splitPayments ? 'split' : paymentMethod,
      timestamp: new Date(),
      staffName: user?.name || 'Manager',
      offerDiscount: discountData.offerDiscount || 0,
      offerName: discountData.selectedOfferNames?.length > 0 ? discountData.selectedOfferNames.join(', ') : (discountData.selectedOfferName || null),
      appliedOffers: discountData.appliedOffers || [],
      manualDiscount: discountData.manualDiscountAmount || 0,
      loyaltyDiscount: discountData.loyaltyDiscount || 0,
      couponDiscount: discountData.couponDiscount || 0,
      couponCode: discountData.couponCode || null,
      serviceChargeAmount: serviceCharge || 0,
      serviceChargeRate: discountData.serviceChargeRate || null,
      roundOffAmount: discountData.roundOffAmount || 0,
      tipAmount: discountData.tipAmount || 0,
      printSettings: printSettings || {},
    };

    // Snapshot the table context BEFORE placing (handlePlaceOrder clears/replaces it).
    const wasTable = !!(selectedTable || params.tableId);
    const tableParams = wasTable ? {
      tableId: selectedTable?.id || params.tableId,
      tableStatus: 'occupied',
      tableNumber: selectedTable?.name || params.tableNumber,
    } : null;

    // Place order (UNPAID) + print KOT + clear cart. kotBillModeRef suppresses navigation so the
    // settle prompt can show on this screen.
    placedOrderIdRef.current = null;
    kotBillModeRef.current = true;
    try {
      await handlePlaceOrder(orderType, paymentMethod, customerName, customerMobile, discountData, tableNumberFromModal);
    } finally {
      kotBillModeRef.current = false;
    }

    // Then print the bill (enqueued after the KOT so KOT prints first). Order stays unpaid.
    try {
      const billText = printerService.generateBillText(billInvoice);
      printerService.printWithFeedback({ text: billText, silentOnly: true, label: 'Bill' })
        .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
        .catch(() => {});
    } catch { /* bill print best-effort */ }

    // Prompt to settle (record how the payment was tendered). If the order id is missing
    // (e.g. offline / failed), fall back to the normal navigation so nothing gets stuck.
    const oid = placedOrderIdRef.current;
    if (oid) {
      setKotBillSettle({ orderId: oid, amount: grandTotal, wasTable, tableParams });
    } else {
      if (wasTable) router.replace({ pathname: '/(tabs)/tables', params: { ...tableParams, orderId: oid || '' } });
      else router.push('/(tabs)/orders');
    }
  };

  // Navigate away after the KOT+Bill settle prompt is dismissed (settled or "later").
  const finishKotBillSettle = (settle) => {
    setKotBillSettle(null);
    if (settle?.wasTable) router.replace({ pathname: '/(tabs)/tables', params: { ...(settle.tableParams || {}), orderId: settle.orderId } });
    else router.push('/(tabs)/orders');
  };

  // Settle a KOT+Bill order with the tendered method → mark completed/paid.
  const handleKotBillSettleConfirm = async (method) => {
    if (!kotBillSettle?.orderId || kotBillSettling) return;
    setKotBillSettling(true);
    const { orderId: oid, amount } = kotBillSettle;
    try {
      await apiClient.updateOrder(oid, {
        status: 'completed', paymentStatus: 'paid', paymentMethod: method,
        finalAmount: amount, completedAt: new Date().toISOString(),
      });
      try { await apiClient.verifyPayment({ orderId: oid, paymentMethod: method, amount, userId: user?.id, restaurantId, paymentStatus: 'completed' }); } catch (_) {}
      toast.success('Payment settled');
    } catch (e) {
      toast.error(e?.message || 'Failed to settle payment');
    } finally {
      setKotBillSettling(false);
      finishKotBillSettle(kotBillSettle);
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

      const orderedItems = [...cart];
      setCart([]);
      decrementLocalStock(orderedItems);
      setShowCart(false);
      setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
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
    // Clear table order state before going back
    setSelectedTable(null);
    setIsFromTablesPage(false);
    setCart([]);
    setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
    setIsBarTabMode(false);
    setAutoSelectedRule(false);
    setActivePricingRuleId(null);
    tableParamsStampRef.current = null;
    lastAppliedStampRef.current = null;
    router.back();
  };

  // Called from CartModal when user taps X on table chip to clear stale table
  const handleClearTable = () => {
    setSelectedTable(null);
    setIsFromTablesPage(false);
    setAutoSelectedRule(false);
    setActivePricingRuleId(null);
    tableParamsStampRef.current = null;
    lastAppliedStampRef.current = null;
  };

  // Save/Hold (G13): park the current cart as a saved cart (type 'parked') to resume later.
  const loadParkedCarts = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await apiClient.getSavedCarts(restaurantId, 'parked');
      setParkedCarts((res?.savedCarts || res?.carts || (Array.isArray(res) ? res : [])).slice(0, 20));
    } catch (_) { /* offline / empty */ }
  }, [restaurantId]);

  useEffect(() => { loadParkedCarts(); }, [loadParkedCarts]);

  const handleSaveOrder = async (extra = {}) => {
    if (cart.length === 0) return;
    try {
      const items = cart.map(buildItemPayload);
      const name = (selectedTable?.name ? `T${selectedTable.name}` : 'Cart')
        + ` - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await apiClient.createSavedCart({
        restaurantId,
        name,
        type: 'parked',
        items,
        customerInfo: extra.customerInfo || null,
        customerId: extra.customerId || null,
        orderType: extra.orderType || 'dine-in',
        tableNumber: extra.tableNumber || selectedTable?.name || null,
        paymentMethod: extra.paymentMethod || 'cash',
        notes: extra.notes || '',
      });
      setCart([]);
      setShowCart(false);
      loadParkedCarts();
      toast?.success?.('Cart parked — resume it from Parked');
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to save cart');
    }
  };

  // Reload a parked cart into the current cart (refreshing prices from the live menu), then remove it.
  const reloadParkedCart = async (sc) => {
    const items = (sc.items || []).map((it, idx) => {
      const menuItem = menuItems.find(m => m.id === (it.menuItemId || it.id));
      const variantPrice = it.selectedVariant?.price;
      const price = variantPrice != null ? variantPrice : (menuItem?.price ?? it.price ?? 0);
      return {
        id: it.menuItemId || it.id,
        menuItemId: it.menuItemId || it.id,
        cartId: `parked-${it.menuItemId || it.id}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        name: it.name,
        price,
        originalPrice: menuItem?.price ?? it.price ?? price,
        quantity: it.quantity || 1,
        category: it.category || it.categoryId || null,
        categoryId: it.categoryId || it.category || null,
        selectedVariant: it.selectedVariant || null,
        selectedCustomizations: it.selectedCustomizations || [],
        taxGroupId: it.taxGroupId || null,
        seat: it.seat ?? null,
      };
    });
    setCart(items);
    if (sc.tableNumber && floors?.length) {
      // best-effort: leave table selection to the user; just load items
    }
    try { await apiClient.deleteSavedCart(sc.id); } catch (_) {}
    setParkedCarts(prev => prev.filter(p => p.id !== sc.id));
    setShowParkedModal(false);
    setShowCart(true);
  };

  const getItemImage = useCallback((item) => {
    if (!showImages || globalHideImages || item.hideImage) return null;
    // Use the placeholder images utility which handles all cases
    return getDisplayImage(item, 'https://dineopen.com');
  }, [showImages, globalHideImages]);

  const getCategoryName = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category?.name || 'Main Course';
  };

  // Build type-specific subtitle for menu cards
  const getTypeSubtitle = useCallback((item) => {
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
  }, [businessType]);

  const getExpiryStatus = (expiryDate) => {
    if (!expiryDate) return null;
    const days = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 2) return 'expiring-soon';
    if (days <= 7) return 'expiring-week';
    return null;
  };

  const renderMenuItem = useCallback(({ item }) => {
    const cartItem = cartMap[item.id];
    const quantity = cartItem?.quantity || 0;
    const imageUrl = (showImages && !globalHideImages && !item.hideImage) ? getItemImage(item) : null;
    const isVeg = item.isVeg !== false;
    const hasImage = imageUrl !== null;
    const typeSubtitle = getTypeSubtitle(item);
    const isStockManaged = item.isStockManaged && typeof item.stockQuantity === 'number';
    const isLowStock = isStockManaged && item.stockQuantity > 0 && item.stockQuantity <= (item.lowStockThreshold || 5);
    const isOutOfStock = item.isAvailable === false || (isStockManaged && item.stockQuantity === 0);
    const expiryStatus = getExpiryStatus(item.expiryDate);

    // Stock/Expiry badge row component
    const StockExpiryBadges = () => {
      if (!isStockManaged && !expiryStatus) return null;
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
          {isStockManaged && (
            <View style={{
              paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
              backgroundColor: item.stockQuantity === 0 ? '#fee2e2' : isLowStock ? '#fef3c7' : '#dcfce7',
            }}>
              <Text style={{
                fontSize: 8, fontWeight: '700',
                color: item.stockQuantity === 0 ? '#dc2626' : isLowStock ? '#92400e' : '#166534',
              }}>
                {item.stockQuantity === 0 ? 'OUT' : isLowStock ? `⚠ ${item.stockQuantity} left` : `${item.stockQuantity} in stock`}
              </Text>
            </View>
          )}
          {expiryStatus && (
            <View style={{
              paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
              backgroundColor: expiryStatus === 'expired' ? '#fee2e2' : '#fef3c7',
            }}>
              <Text style={{
                fontSize: 8, fontWeight: '700',
                color: expiryStatus === 'expired' ? '#dc2626' : '#92400e',
              }}>
                {expiryStatus === 'expired' ? 'EXPIRED' : expiryStatus === 'expiring-soon' ? 'Exp Soon' : 'Exp 7d'}
              </Text>
            </View>
          )}
        </View>
      );
    };

    // Clean Card Design — image on top, white info section below (like food delivery apps)
    if (hasImage) {
      return (
        <TouchableOpacity
          style={[styles.menuItemCard, isOutOfStock && { opacity: 0.45 }]}
          onPress={() => handleItemPress(item)}
          activeOpacity={0.92}
        >
          {/* Image Section — top portion */}
          <View style={[styles.cardImageSection, { height: r(110, 140, 160) }]}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.cardImage}
              resizeMode="cover"
            />
            {/* Veg/Non-Veg Badge - Top Left on image */}
            <View style={[styles.cardVegBadge, { backgroundColor: isVeg ? '#22c55e' : '#ef4444' }]}>
              <Ionicons name={isVeg ? "leaf" : "nutrition"} size={9} color="#fff" />
            </View>
            {/* Shortcode badge - Top Right on image */}
            {item.shortCode && (
              <View style={styles.cardShortCodeBadge}>
                <Text style={styles.cardShortCodeText}>{item.shortCode}</Text>
              </View>
            )}
          </View>

          {/* Info Section — white bottom */}
          <View style={[styles.cardInfoSection, isTablet && { padding: 14 }]}>
            <Text style={[styles.cardItemName, { fontSize: fs(13) }]} numberOfLines={2}>{item.name}</Text>
            {typeSubtitle && (
              <Text style={styles.cardTypeSubtitle} numberOfLines={1}>{typeSubtitle}</Text>
            )}
            <StockExpiryBadges />
            <View style={styles.cardPriceRow}>
              <View>
                <Text style={[styles.cardPrice, { fontSize: fs(15) }]}>{getCurrencySymbol()}{getItemDisplayPrice(item)}</Text>
                {takeawayRule && activePricingRuleId !== takeawayRule.id && (() => {
                  const tp = getItemTakeawayPrice(item);
                  return tp && tp !== getItemDisplayPrice(item) ? (
                    <Text style={styles.cardTakeawayPrice}>T: {getCurrencySymbol()}{tp}</Text>
                  ) : null;
                })()}
              </View>
              {quantity > 0 ? (
                <View style={styles.cardQuantityControls}>
                  <TouchableOpacity
                    style={styles.cardQtyBtn}
                    onPress={(e) => { e.stopPropagation(); updateCartQuantity(item.id, quantity - 1); }}
                  >
                    <Ionicons name="remove" size={14} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.cardQtyText}>{quantity}</Text>
                  <TouchableOpacity
                    style={styles.cardQtyBtn}
                    onPress={(e) => { e.stopPropagation(); updateCartQuantity(item.id, quantity + 1); }}
                  >
                    <Ionicons name="add" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.cardAddButton}
                  onPress={(e) => { e.stopPropagation(); handleItemPress(item); }}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // Card without image — placeholder icon area on top
    return (
      <TouchableOpacity
        style={[styles.menuItemCard, isOutOfStock && { opacity: 0.45 }]}
        onPress={() => handleItemPress(item)}
        activeOpacity={0.92}
      >
        {/* Placeholder image area */}
        <View style={[styles.cardImageSection, styles.cardPlaceholderSection, { height: r(110, 140, 160) }]}>
          <Ionicons name="restaurant-outline" size={r(32, 40)} color="#d1d5db" />
          {/* Veg/Non-Veg Badge */}
          <View style={[styles.cardVegBadge, { backgroundColor: isVeg ? '#22c55e' : '#ef4444' }]}>
            <Ionicons name={isVeg ? "leaf" : "nutrition"} size={9} color="#fff" />
          </View>
          {item.shortCode && (
            <View style={styles.cardShortCodeBadge}>
              <Text style={styles.cardShortCodeText}>{item.shortCode}</Text>
            </View>
          )}
        </View>

        {/* Info Section */}
        <View style={[styles.cardInfoSection, isTablet && { padding: 14 }]}>
          <Text style={[styles.cardItemName, { fontSize: fs(13) }]} numberOfLines={2}>{item.name}</Text>
          {item.description && (
            <Text style={styles.cardDescription} numberOfLines={1}>{item.description}</Text>
          )}
          {typeSubtitle && (
            <Text style={styles.cardTypeSubtitle} numberOfLines={1}>{typeSubtitle}</Text>
          )}
          <StockExpiryBadges />
          <View style={styles.cardPriceRow}>
            <View>
              <Text style={[styles.cardPrice, { fontSize: fs(15) }]}>{getCurrencySymbol()}{getItemDisplayPrice(item)}</Text>
              {takeawayRule && activePricingRuleId !== takeawayRule.id && (() => {
                const tp = getItemTakeawayPrice(item);
                return tp && tp !== getItemDisplayPrice(item) ? (
                  <Text style={styles.cardTakeawayPrice}>T: {getCurrencySymbol()}{tp}</Text>
                ) : null;
              })()}
            </View>
            {quantity > 0 ? (
              <View style={styles.cardQuantityControls}>
                <TouchableOpacity
                  style={styles.cardQtyBtn}
                  onPress={(e) => { e.stopPropagation(); updateCartQuantity(item.id, quantity - 1); }}
                >
                  <Ionicons name="remove" size={14} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.cardQtyText}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.cardQtyBtn}
                  onPress={(e) => { e.stopPropagation(); updateCartQuantity(item.id, quantity + 1); }}
                >
                  <Ionicons name="add" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.cardAddButton}
                onPress={(e) => { e.stopPropagation(); handleItemPress(item); }}
              >
                <Ionicons name="add" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [cartMap, addToCart, handleItemPress, updateCartQuantity, showImages, globalHideImages, getItemImage, getTypeSubtitle, getItemDisplayPrice, getItemTakeawayPrice, takeawayRule, activePricingRuleId]);

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
            {/* Table Selection Mode — Compact Header */}
            <View style={[styles.headerTop, { paddingVertical: 8, gap: 8 }]}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Ionicons name="arrow-back" size={20} color="#1f2937" />
              </TouchableOpacity>
              <View style={styles.tableInfoCard}>
                <Ionicons name={isBarTabMode ? "beer" : "restaurant"} size={14} color={Colors.primary} />
                <Text style={styles.tableInfoText}>{isBarTabMode ? selectedTable.name : `Table ${selectedTable.name}`}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedTable(null);
                    setIsFromTablesPage(false);
                    setCart([]);
                    setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
                    setIsBarTabMode(false);
                    setAutoSelectedRule(false);
                    setActivePricingRuleId(null);
                    tableParamsStampRef.current = null;
                    lastAppliedStampRef.current = null;
          
                  }}
                  style={styles.clearTableButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <View style={[styles.headerIcons, { gap: 6 }]}>
                <View style={[styles.networkDot, { backgroundColor: !effectivelyOffline ? '#22c55e' : '#ef4444' }]} />
                {pendingCount > 0 && (
                  <View style={styles.syncBadge}>
                    <Text style={styles.syncBadgeText}>{pendingCount}</Text>
                  </View>
                )}
                <TouchableOpacity style={[styles.iconBtn, { width: 34, height: 34, borderRadius: 10, backgroundColor: refreshing ? '#f3f4f6' : '#eef2ff' }]} onPress={handleMenuRefresh} disabled={refreshing}>
                  <Ionicons name="refresh" size={18} color={refreshing ? '#9ca3af' : '#6366f1'} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconBtn, { width: 34, height: 34, borderRadius: 10, backgroundColor: showImages ? '#dcfce7' : '#f3f4f6' }]} onPress={toggleImages}>
                  <Ionicons name={showImages ? "image" : "image-outline"} size={18} color={showImages ? '#16a34a' : '#9ca3af'} />
                </TouchableOpacity>
              </View>
            </View>
            {/* Search bar for table order mode */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 4, gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
                <Ionicons name="search" size={16} color="#9ca3af" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#1f2937', padding: 0, fontWeight: '500' }}
                  placeholder="Search items..."
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
                {(searchTerm || shortCodeSearch) ? (
                  <TouchableOpacity onPress={() => { setSearchTerm(''); setShortCodeSearch(''); }}>
                    <Ionicons name="close-circle" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                ) : null}
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
                  style={[styles.iconBtn, { backgroundColor: refreshing ? '#f3f4f6' : '#eef2ff' }]}
                  onPress={handleMenuRefresh}
                  disabled={refreshing}
                  accessibilityLabel="Refresh menu"
                >
                  <Ionicons name="refresh" size={20} color={refreshing ? '#9ca3af' : '#6366f1'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: '#fef3c7' }]}
                  onPress={() => router.push('/(tabs)/menu-management')}
                  accessibilityLabel="Manage menu"
                >
                  <Ionicons name="create-outline" size={20} color="#d97706" />
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Clean Pill Search Bar */}
            <Animated.View style={[styles.searchContainer, { opacity: scrollY.interpolate({ inputRange: [0, SCROLL_THRESHOLD], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
              <View style={styles.searchBarPill}>
                <Ionicons name="search" size={18} color="#9ca3af" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name or code..."
                  placeholderTextColor="#94a3b8"
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
                {(searchTerm || shortCodeSearch) ? (
                  <TouchableOpacity onPress={() => { setSearchTerm(''); setShortCodeSearch(''); }}>
                    <Ionicons name="close-circle" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity style={styles.searchFilterBtn} onPress={toggleImages}>
                <Ionicons name={showImages ? "image" : "image-outline"} size={20} color={showImages ? '#10b981' : '#9ca3af'} />
              </TouchableOpacity>
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
                  onPress={handleMenuRefresh}
                  disabled={refreshing}
                >
                  <Ionicons name="refresh" size={18} color={refreshing ? '#9ca3af' : '#6366f1'} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.compactManageBtn}
                  onPress={() => router.push('/(tabs)/menu-management')}
                >
                  <Ionicons name="create-outline" size={18} color="#d97706" />
                </TouchableOpacity>
              </View>
              <ScrollView
                ref={categoryChipsRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.compactChipsScroll}
              >
                {categories.map((item, index) => {
                  const isSelected = selectedCategory === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.categoryPillCompact, isSelected && styles.categoryPillCompactSelected]}
                      onPress={() => setSelectedCategory(item.id)}
                      activeOpacity={0.7}
                      onLayout={(e) => {
                        categoryChipLayouts.current[item.id] = e.nativeEvent.layout;
                      }}
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
              </ScrollView>
            </Animated.View>
          </>
        )}

      </Animated.View>

      {/* Multi-Tier Pricing: Auto-applied info when table selects rule */}
      {multiPricingEnabled && autoSelectedRule && activePricingRuleId && (() => {
        const activeRule = pricingRules.find(r => r.id === activePricingRuleId);
        return activeRule ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 6, backgroundColor: '#f0fdf4', borderBottomWidth: 1, borderBottomColor: '#bbf7d0' }}>
            <Ionicons name="pricetag" size={13} color="#059669" />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>
              {activeRule.name} pricing (auto-applied for this table)
            </Text>
          </View>
        ) : null;
      })()}

      {/* Multi-Tier Pricing Rule Selector — hidden when table auto-selects a rule */}
      {multiPricingEnabled && pricingRules.length > 0 && !autoSelectedRule && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexWrap: 'wrap', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
          <TouchableOpacity
            onPress={() => { setActivePricingRuleId(null); setAutoSelectedRule(false); }}
            style={{
              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
              backgroundColor: !activePricingRuleId ? '#1f2937' : '#f3f4f6',
              borderWidth: 1, borderColor: !activePricingRuleId ? '#1f2937' : '#d1d5db',
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
              onPress={() => setActivePricingRuleId(rule.id)}
              style={{
                paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14,
                backgroundColor: activePricingRuleId === rule.id ? '#1f2937' : '#f3f4f6',
                borderWidth: 1, borderColor: activePricingRuleId === rule.id ? '#1f2937' : '#d1d5db',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: activePricingRuleId === rule.id ? '#fff' : '#6b7280' }}>
                {rule.name}
              </Text>
            </TouchableOpacity>
          ))}
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

      {/* Active Order Info Bar — table indicator + clear button */}
      {(cart.length > 0 || selectedTable) && (
        <View style={styles.orderInfoBar}>
          <View style={styles.orderInfoLeft}>
            {selectedTable && (
              <View style={styles.orderInfoTableChip}>
                <Ionicons name="restaurant-outline" size={13} color="#dc2626" />
                <Text style={styles.orderInfoTableText}>{selectedTable.name}</Text>
                {selectedTable.floor ? (
                  <Text style={styles.orderInfoFloorText}>{selectedTable.floor}</Text>
                ) : null}
              </View>
            )}
            {cart.length > 0 && (
              <View style={styles.orderInfoCartChip}>
                <Ionicons name="cart-outline" size={13} color="#6366f1" />
                <Text style={styles.orderInfoCartText}>{cart.length} items · {getCurrencySymbol()}{getCartTotal().toFixed(0)}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.orderInfoClearBtn}
            onPress={() => {
              setSelectedTable(null);
              setIsFromTablesPage(false);
              setCart([]);
              setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
              setIsBarTabMode(false);
              setAutoSelectedRule(false);
              setActivePricingRuleId(null);
              tableParamsStampRef.current = null;
              lastAppliedStampRef.current = null;
    
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
            <Text style={styles.orderInfoClearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Menu Items - 2 Column Grid */}
      <FlatList
        ref={menuFlatListRef}
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.setValue(y);
          tabBar?.handleScroll(y);
        }}
        scrollEventThrottle={16}
        // Keep the list interactive while the search keyboard is up — without these, the first
        // tap only dismisses the keyboard, so after searching it felt "stuck" (couldn't tap an
        // item or leave the screen). Scrolling now also dismisses the keyboard.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        data={filteredItems}
        renderItem={renderMenuItem}
        keyExtractor={(item) => item.id}
        key={`menu-grid-${cols}`}
        numColumns={cols}
        contentContainerStyle={[styles.menuList, { paddingHorizontal: r(16, 24) }]}
        columnWrapperStyle={[styles.menuRow, { gap: r(12, 16, 20) }]}
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={7}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleMenuRefresh} tintColor={Colors.primary} />
        }
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
        <View style={[styles.checkoutBar, { bottom: tabBarHeight }]}>
          <View style={styles.checkoutBarLeft}>
            <View style={styles.checkoutBadge}>
              <Text style={styles.checkoutBadgeText}>{cart.length}</Text>
            </View>
            <View>
              <Text style={styles.checkoutTotal}>
                {getCurrencySymbol()}{(isBarTabMode || isCashier ? getGrandTotal() : getCartTotal()).toFixed(2)}
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
                  onPress={handleCartButtonPress}
                  disabled={sendingOrder}
                >
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.checkoutBtnText}>Settle</Text>
                </TouchableOpacity>
              </>
            ) : isWaiter && !canCompleteBill ? (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnPrimary, sendingOrder && styles.orderButtonDisabled]}
                onPress={() => setShowCart(true)}
                disabled={sendingOrder}
              >
                <Ionicons name="cart" size={16} color="#fff" />
                <Text style={styles.checkoutBtnText}>Send to Kitchen</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            ) : isCashier ? (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnGreen, sendingOrder && styles.orderButtonDisabled]}
                onPress={handleCartButtonPress}
                disabled={sendingOrder}
              >
                {sendingOrder ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name={existingOrderId ? "refresh" : "receipt"} size={16} color="#fff" />
                    <Text style={styles.checkoutBtnText}>{existingOrderId ? 'Update Order' : 'Place Order'}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.checkoutBtn, styles.checkoutBtnPrimary, sendingOrder && styles.orderButtonDisabled]}
                onPress={handleCartButtonPress}
                disabled={sendingOrder}
              >
                {sendingOrder ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="cart" size={16} color="#fff" />
                    <Text style={styles.checkoutBtnText}>View Cart</Text>
                    <Ionicons name="chevron-forward" size={16} color="#fff" />
                  </>
                )}
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

      {/* Cart Modal — unified with mode prop */}
      <CartModal
        mode={isWaiter && !canCompleteBill ? 'waiter' : isCashier ? 'cashier' : 'owner'}
        userRole={user?.role?.toLowerCase() || 'waiter'}
        visible={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        onUpdateQuantity={updateCartQuantity}
        onRemoveItem={removeFromCart}
        onEditItemPrice={editCartItemPrice}
        onAddCustomItem={addCustomItem}
        onPlaceOrder={isCashier ? handleCashierPlaceOrder : handlePlaceOrder}
        onCompleteBill={handleCompleteBill}
        onKotAndBill={printSettings?.kotThenBill ? handleKotAndBill : undefined}
        onSendToKitchen={handleSendToKitchen}
        total={getCartTotal()}
        tableNumber={selectedTable?.name || ''}
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        sending={sendingOrder}
        countryCode={user?.restaurant?.currencySettings?.countryCode || 'IN'}
        defaultTaxName={user?.restaurant?.currencySettings?.taxLabel || 'Tax'}
        onOrderTypeChange={handleOrderTypeChange}
        hasTable={!!selectedTable?.name}
        multiPricingEnabled={multiPricingEnabled}
        activePricingRuleName={pricingRules.find(r => r.id === activePricingRuleId)?.name}
        billingSettings={billingSettings}
        posSettings={user?.restaurant?.posSettings || {}}
        deliveryStaff={deliveryStaff}
        taxSettings={taxSettings}
        categories={taxCategories.length > 0 ? taxCategories : categories}
        pricingRules={pricingRules}
        activePricingRuleId={activePricingRuleId}
        setActivePricingRuleId={setActivePricingRuleId}
        autoSelectedRule={autoSelectedRule}
        isUpdateOrder={!!existingOrderId}
        existingOrderItems={existingOrderItems}
        floors={floors}
        onTableSelect={handleCashierTableSelect}
        selectedTable={selectedTable}
        upiSettings={upiSettings}
        tableFromNavigation={isFromTablesPage}
        onClearTable={handleClearTable}
        ecrSettings={user?.restaurant?.ecrSettings ? { ...user.restaurant.ecrSettings, restaurantId } : {}}
        onSaveOrder={!existingOrderId ? handleSaveOrder : undefined}
      />

      {/* KOT Modal - Shows after order is sent to kitchen */}
      <KOTModal
        visible={showKOTModal}
        onClose={() => {
          setShowKOTModal(false);
          setKotOrderData(null);
          setSelectedTable(null);
          setIsFromTablesPage(false);
          setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
          setActivePricingRuleId(null);
          setAutoSelectedRule(false);
          tableParamsStampRef.current = null;
          lastAppliedStampRef.current = null;
          consumedParamsKeyRef.current = null;
          // Clear stale URL params so they don't leak into next order
          router.setParams({ tableId: '', tableNumber: '', floorName: '', navStamp: '', orderId: '' });

          if (isBarTabMode) {
            // Bar tab mode: go back to bar billing
            router.back();
          } else {
            // Always redirect to tables screen after closing KOT
            router.replace('/(tabs)/tables');
          }
        }}
        orderData={kotOrderData}
        printSettings={printSettings || {}}
        userRole={user?.role}
      />

      {/* Cashier Invoice Modal - Shows after counter sale order is placed */}
      <CashierInvoiceModal
        visible={showInvoiceModal}
        onClose={() => {
          setShowInvoiceModal(false);
          setLastOrderData(null);
          setCart([]);
          setSelectedTable(null);
          setIsFromTablesPage(false);
          setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
          setActivePricingRuleId(null);
          setAutoSelectedRule(false);
          tableParamsStampRef.current = null;
          lastAppliedStampRef.current = null;
          consumedParamsKeyRef.current = null;
          router.setParams({ tableId: '', tableNumber: '', floorName: '', navStamp: '', orderId: '' });

          // Navigate back to tables page
          router.replace('/(tabs)/tables');
        }}
        invoiceData={lastOrderData}
        restaurantId={restaurantId}
        whatsappConnected={whatsappConnected}
        tokenBillingEnabled={printSettings?.tokenBillingEnabled || false}
        manualPrintEnabled={printSettings?.manualPrintEnabled !== false}
        printSettings={printSettings || {}}
        onNewOrder={() => {
          setShowInvoiceModal(false);
          setLastOrderData(null);
          setCart([]);
          setSelectedTable(null);
          setIsFromTablesPage(false);
          setExistingOrderId(null); setExistingDailyOrderId(null); setExistingOrderItems(null);
          setActivePricingRuleId(null);
          setAutoSelectedRule(false);
          tableParamsStampRef.current = null;
          lastAppliedStampRef.current = null;
          consumedParamsKeyRef.current = null;
          router.setParams({ tableId: '', tableNumber: '', floorName: '', navStamp: '', orderId: '' });

          // Navigate to Tables page for fresh table selection
          router.replace('/(tabs)/tables');
        }}
      />

      {/* Item Customization Modal - for variant/customization selection */}
      <ItemCustomizationModal
        item={selectedItemForCustomization}
        isOpen={customizationModalOpen}
        onClose={() => { setCustomizationModalOpen(false); setSelectedItemForCustomization(null); }}
        onAddToCart={(cartItem) => addToCart(cartItem)}
        multiPricingEnabled={multiPricingEnabled}
        activePricingRuleId={activePricingRuleId}
        pricingRules={pricingRules}
      />

      {/* Floating Category FAB - bottom right, above checkout bar */}
      {categories.length > 1 && (
        <TouchableOpacity
          style={[styles.categoryFAB, { bottom: tabBarHeight + (cart.length > 0 ? 60 : 8) }]}
          onPress={() => setShowCategorySheet(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="grid" size={22} color="#fff" />
          <Text style={styles.categoryFABLabel}>Menu</Text>
        </TouchableOpacity>
      )}

      {/* Parked carts (G13) — resume a held cart */}
      {parkedCarts.length > 0 && (
        <TouchableOpacity
          style={{ position: 'absolute', left: 12, bottom: tabBarHeight + (cart.length > 0 ? 60 : 8), flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, backgroundColor: '#ea580c', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}
          onPress={() => setShowParkedModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="bookmark" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Parked {parkedCarts.length}</Text>
        </TouchableOpacity>
      )}

      {/* Parked carts modal */}
      <Modal visible={showParkedModal} transparent animationType="slide" onRequestClose={() => setShowParkedModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowParkedModal(false)} />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>Parked Carts</Text>
              <TouchableOpacity onPress={() => setShowParkedModal(false)}><Ionicons name="close" size={22} color="#64748b" /></TouchableOpacity>
            </View>
            <ScrollView>
              {parkedCarts.map((sc) => (
                <View key={sc.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' }}>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => reloadParkedCart(sc)} activeOpacity={0.7}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{sc.name || 'Cart'}</Text>
                    <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      {(sc.items?.length || 0)} item{(sc.items?.length || 0) === 1 ? '' : 's'}
                      {sc.customerInfo?.name ? ` · ${sc.customerInfo.name}` : ''}
                      {sc.tableNumber ? ` · T${sc.tableNumber}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => reloadParkedCart(sc)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#ea580c', marginRight: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Resume</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async () => { try { await apiClient.deleteSavedCart(sc.id); } catch (_) {} setParkedCarts(prev => prev.filter(p => p.id !== sc.id)); }}>
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* KOT+Bill settle prompt — record how the payment was tendered (flag-gated flow only) */}
      <Modal visible={!!kotBillSettle} transparent animationType="fade" onRequestClose={() => { if (!kotBillSettling && kotBillSettle) finishKotBillSettle(kotBillSettle); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          {kotBillSettle && (() => {
            const ps = user?.restaurant?.posSettings || {};
            const methods = (Array.isArray(ps.paymentMethods) && ps.paymentMethods.length > 0
              ? ps.paymentMethods.filter(m => m && (typeof m === 'string' || m.enabled !== false))
                  .map(m => (typeof m === 'string' ? { id: m, label: m } : { id: (m.id || m.value || m.method || m.name), label: (m.label || m.name || m.id) }))
              : [
                  { id: 'cash', label: 'Cash' },
                  ...(ps.hideUPI ? [] : [{ id: 'upi', label: 'UPI' }]),
                  ...(ps.hideCard ? [] : [{ id: 'card', label: 'Card' }]),
                ]).filter(m => m.id);
            const mColor = { cash: '#16a34a', upi: '#7c3aed', card: '#2563eb' };
            return (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 380, overflow: 'hidden' }}>
                <View style={{ padding: 18, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eef2f6' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                    <Ionicons name="print" size={20} color="#059669" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>KOT & Bill printed</Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Settle payment — {getCurrencySymbol()}{Number(kotBillSettle.amount || 0).toFixed(2)}</Text>
                </View>
                <View style={{ padding: 16 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 10 }}>How was it tendered?</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {methods.map(m => {
                      const c = mColor[String(m.id).toLowerCase()] || '#0891b2';
                      return (
                        <TouchableOpacity key={m.id} disabled={kotBillSettling}
                          onPress={() => handleKotBillSettleConfirm(m.id)}
                          style={{ flexGrow: 1, flexBasis: '30%', paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: c, backgroundColor: `${c}12`, alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: c }}>{m.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {kotBillSettling && <ActivityIndicator size="small" color="#059669" style={{ marginTop: 12 }} />}
                  <TouchableOpacity onPress={() => { if (!kotBillSettling) finishKotBillSettle(kotBillSettle); }}
                    style={{ marginTop: 12, paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#94a3b8' }}>Settle later (leave unpaid)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Category Bottom Sheet */}
      {showCategorySheet && (
        <Modal
          visible={true}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCategorySheet(false)}
        >
          <View style={{ flex: 1 }}>
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
              onPress={() => setShowCategorySheet(false)}
            />
            <View style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: Platform.OS === 'android' ? 40 : 44,
              maxHeight: '80%',
            }}>
              <View style={styles.categorySheetHandle} />
              <Text style={styles.categorySheetTitle}>Categories</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.categorySheetGrid}>
                  {categories.map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.categorySheetItem, isSelected && styles.categorySheetItemSelected]}
                        onPress={() => {
                          const catId = cat.id;
                          setSelectedCategory(catId);
                          setShowCategorySheet(false);
                          setTimeout(() => {
                            menuFlatListRef.current?.scrollToOffset({ offset: 0, animated: true });
                            // Scroll the top chips to show the selected category
                            const layout = categoryChipLayouts.current[catId];
                            if (layout && categoryChipsRef.current) {
                              categoryChipsRef.current.scrollTo({
                                x: Math.max(0, layout.x - 16),
                                animated: true,
                              });
                            }
                          }, 150);
                        }}
                      >
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'restaurant-outline'}
                          size={18}
                          color={isSelected ? '#fff' : '#6b7280'}
                        />
                        <Text style={[styles.categorySheetItemText, isSelected && styles.categorySheetItemTextSelected]} numberOfLines={2}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Printer Disconnected Modal — replaces Alert.alert with actionable options */}
      <Modal
        visible={showPrinterDisconnectModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrinterDisconnectModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 340, overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 24 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="print-outline" size={26} color="#ef4444" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#1f2937', marginBottom: 8 }}>Printer Disconnected</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 }}>
                Could not reach the printer. Please check it is powered on and on the same WiFi network.
              </Text>
            </View>
            {/* Actions */}
            <View style={{ padding: 20, gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowPrinterDisconnectModal(false);
                  router.push('/(tabs)/printer-settings');
                }}
                style={{ backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name="settings-outline" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Setup Printer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowPrinterDisconnectModal(false);
                  printerService.setDisconnectAlertEnabled(false);
                }}
                style={{ backgroundColor: '#f3f4f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Ionicons name="notifications-off-outline" size={18} color="#6b7280" />
                <Text style={{ color: '#374151', fontSize: 15, fontWeight: '600' }}>Don't Show Again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowPrinterDisconnectModal(false)}
                style={{ paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: '#9ca3af', fontSize: 13 }}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ToastView />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  compactChipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 16,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tableInfoCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  tableInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    letterSpacing: 0.2,
    flex: 1,
  },
  clearTableButton: {
    marginLeft: 4,
    padding: 2,
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1f2937',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
    fontWeight: '600',
  },
  itemCountBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  itemCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
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
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },
  // Clean Pill Search Bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    gap: 10,
  },
  searchBarPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
    padding: 0,
    fontWeight: '400',
    letterSpacing: 0,
  },
  searchFilterBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryPillSelected: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  categoryPillTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Compact bar chips (smaller, wrapping)
  categoryPillCompact: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#fff',
    marginRight: 6,
    marginBottom: 4,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryPillCompactSelected: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  categoryPillCompactText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  categoryPillCompactTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  // Grid Menu List
  menuList: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: Platform.OS === 'android' ? 200 : 180,
  },
  menuRow: {
    justifyContent: 'space-between',
    gap: 12,
  },
  // Clean Card Design — image on top, info section below
  menuItemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 12,
    flex: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardImageSection: {
    height: 110,
    position: 'relative',
    overflow: 'hidden',
  },
  cardPlaceholderSection: {
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardVegBadge: {
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
  },
  cardShortCodeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    zIndex: 10,
  },
  cardShortCodeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardInfoSection: {
    padding: 10,
  },
  cardItemName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    lineHeight: 17,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 11,
    color: '#9ca3af',
    lineHeight: 14,
    marginBottom: 2,
  },
  cardTypeSubtitle: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 2,
  },
  cardTakeawayPrice: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '600',
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f2937',
  },
  cardAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  cardQuantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 20,
    overflow: 'hidden',
  },
  cardQtyBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardQtyText: {
    minWidth: 24,
    height: 30,
    lineHeight: 30,
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    textAlignVertical: 'center',
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
    right: 16,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1f2937',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 50,
  },
  categoryFABLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Category Bottom Sheet
  categorySheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  categorySheetContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'android' ? 40 : 44,
    maxHeight: '55%',
  },
  categorySheetHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 16,
  },
  categorySheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  categorySheetScroll: {
    flex: 1,
  },
  categorySheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 8,
  },
  categorySheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    minWidth: '45%',
    flexGrow: 1,
  },
  categorySheetItemSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categorySheetItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
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
    paddingBottom: 14,
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
  // Active Order Info Bar
  orderInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  orderInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  orderInfoTableChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  orderInfoTableText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },
  orderInfoFloorText: {
    fontSize: 10,
    color: '#9ca3af',
    marginLeft: 2,
  },
  orderInfoCartChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  orderInfoCartText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  orderInfoClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  orderInfoClearText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
});
