import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
// useResponsive imported below
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActionSheetIOS,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import Pusher from 'pusher-js/react-native';
import { ref, push, onChildAdded, query, orderByChild, startAt } from 'firebase/database';
import { database } from '../config/firebase';
import apiClient from '../services/api';
import lanClient from '../services/lanClient';
import restaurantEvents from '../services/restaurantEvents';
import { getCached, setCache } from '../services/cacheManager';
import { getCurrencySymbol, formatCurrency } from '../utils/formatCurrency';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import OrderDetailsModal from '../components/OrderDetailsModal';
import MoveOrderModal from '../components/MoveOrderModal';
import WaiterOrderModal from '../components/WaiterOrderModal';
import TableFloorPlanNative from '../components/TableFloorPlanNative';
// SyncIndicator moved to settings page
import { useResponsive } from '../hooks/useResponsive';
import { useOffline } from '../hooks/useOffline';
import { canPerform } from '../utils/permissions';
import { useTabBar } from '../contexts/TabBarContext';
import * as printerService from '../services/printerService';
import { useToast } from '../components/Toast';

// const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec';
// const PUSHER_CLUSTER = 'ap2';

export default function TablesScreen() {
  const router = useRouter();
  const { effectivelyOffline } = useOffline();
  const tabBar = useTabBar();
  const params = useLocalSearchParams();
  const { gridColumns, r, fs, sp, isTablet } = useResponsive();
  const cols = gridColumns();
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [user, setUser] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'floor' — floor is view-only live map
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedTableForOrder, setSelectedTableForOrder] = useState(null);
  const [orderModalMode, setOrderModalMode] = useState('view');
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [floorForm, setFloorForm] = useState({ name: '', description: '', areaChargeType: 'none', areaChargeValue: '' });
  const [savingFloor, setSavingFloor] = useState(false);
  // Table management state
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [addTableMode, setAddTableMode] = useState('single'); // 'single' or 'bulk'
  const [tableForm, setTableForm] = useState({ name: '', capacity: '4', type: 'regular', floor: '' });
  const [bulkForm, setBulkForm] = useState({ fromNumber: '', toNumber: '', capacity: '4', floor: '' });
  const [savingTable, setSavingTable] = useState(false);
  // Inline new floor creation inside Add Table modal
  const [showInlineFloorInput, setShowInlineFloorInput] = useState(false);
  const [inlineFloorName, setInlineFloorName] = useState('');
  const [savingInlineFloor, setSavingInlineFloor] = useState(false);
  // Table action sheet state
  const [showTableActions, setShowTableActions] = useState(false);
  const [actionTable, setActionTable] = useState(null);
  // Booking state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingTable, setBookingTable] = useState(null);
  const [bookingForm, setBookingForm] = useState({
    customerName: '', customerPhone: '', partySize: '2',
    bookingDate: '', bookingTime: '', notes: '',
  });
  const [savingBooking, setSavingBooking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [moveModalTable, setMoveModalTable] = useState(null);
  const [showWaiterOrderModal, setShowWaiterOrderModal] = useState(false);
  const [waiterOrderContext, setWaiterOrderContext] = useState(null);
  const { toast, ToastView } = useToast();
  const scrollY = useRef(new Animated.Value(0)).current;
  const isInitialLoadRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const restaurantIdRef = useRef(null);
  const lastProcessedTableParamRef = useRef(null);
  const printSettingsRef = useRef(null);
  const pendingOptimisticRef = useRef(new Map()); // Map<tableId, { status, orderId, timestamp }>
  const selectedRestaurantRef = useRef(null);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => { selectedRestaurantRef.current = selectedRestaurant; }, [selectedRestaurant]);

  // Tick every 60s to keep elapsed time displays updated
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Listen for restaurant switch from other tabs
  useEffect(() => {
    const unsub = restaurantEvents.on('switch', ({ restaurantId: newRid, restaurant: newRest }) => {
      setSelectedRestaurant(newRest ? { id: newRid, ...newRest } : null);
      setFloors([]);
      setTables([]);
      setSelectedFloor(null);
      setLoading(true);
      loadInitialData();
    });
    return unsub;
  }, []);

  // Process floors response and update all related state
  const processFloorsData = useCallback((response) => {
    let floorsData = [];
    if (response.floors) {
      floorsData = response.floors;
    } else if (Array.isArray(response)) {
      floorsData = response;
    }

    // Captain floor scoping — only show assigned floors
    if (user?.role === 'captain' && user?.assignedFloorIds?.length > 0) {
      floorsData = floorsData.filter(f => user.assignedFloorIds.includes(f.id));
    }

    setFloors(floorsData);

    const allTables = floorsData.flatMap(floor =>
      (floor.tables || []).map(t => ({ ...t, _floorName: floor.name, _floorId: floor.id }))
    );
    setTables(allTables);

    // Keep selectedFloor in sync so currentFloorTables reflects new data
    setSelectedFloor(prev => {
      if (prev) {
        const updatedFloor = floorsData.find(f => f.id === prev.id);
        return updatedFloor || null;
      }
      return prev;
    });

    // Save to cache for stale-while-revalidate (only cache if we have actual data)
    const rid = restaurantIdRef.current;
    if (rid && floorsData.length > 0) {
      setCache('cache_floors_' + rid, { floors: floorsData, tables: allTables });
    }
  }, []);

  // Memoize loadFloorsAndTables to prevent recreation
  const loadFloorsAndTables = useCallback(async (restaurantId) => {
    // Prevent multiple simultaneous calls
    if (isRefreshingRef.current) {
      return;
    }

    try {
      isRefreshingRef.current = true;
      const response = await apiClient.getFloors(restaurantId);

      // If floors API returned data, use it
      if (response.floors?.length > 0 || (Array.isArray(response) && response.length > 0)) {
        processFloorsData(response);
      } else {
        // Fallback: try getTables API (same as dine-frontend)
        try {
          const tablesResponse = await apiClient.getTables(restaurantId);
          const tables = tablesResponse?.tables || [];
          if (tables.length > 0) {
            const fallbackFloors = [{ id: 'default', name: 'Main Floor', description: 'Main dining area', tables, restaurantId }];
            processFloorsData({ floors: fallbackFloors });
          } else {
            processFloorsData(response);
          }
        } catch {
          processFloorsData(response);
        }
      }

      // ── Stale table auto-release ──
      const posSettings = selectedRestaurantRef.current?.posSettings || {};
      const autoReleaseHours = posSettings.tableAutoReleaseHours;
      if (autoReleaseHours && autoReleaseHours > 0) {
        const floorsArr = response.floors || (Array.isArray(response) ? response : []);
        const allTablesArr = floorsArr.flatMap(f => f.tables || []);
        const staleTables = allTablesArr.filter(table => {
          if (table.status !== 'occupied') return false;
          if (!table.lastOrderTime) return false;
          let d;
          if (table.lastOrderTime._seconds) d = new Date(table.lastOrderTime._seconds * 1000);
          else if (table.lastOrderTime.toDate) d = table.lastOrderTime.toDate();
          else d = new Date(table.lastOrderTime);
          if (isNaN(d.getTime())) return false;
          return (Date.now() - d.getTime()) / (1000 * 60 * 60) > autoReleaseHours;
        });
        if (staleTables.length > 0) {
          staleTables.forEach(table => {
            apiClient.updateTableStatus(table.id, 'available', null, restaurantId)
              .catch(err => console.warn('Auto-release failed:', table.name, err.message));
          });
          staleTables.forEach(table => {
            updateTableStatusOptimistically(table.id, 'available', null);
          });
        }
      }
    } catch (error) {
      console.error('Error loading floors:', error);
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, [processFloorsData]);

  // Optimistically update table status — instant, no loading spinner
  const updateTableStatusOptimistically = useCallback((tableId, status, orderId) => {
    const tableIdStr = String(tableId);

    // Track this optimistic update so refreshInBackground doesn't overwrite it
    pendingOptimisticRef.current.set(tableIdStr, {
      status,
      orderId: status === 'available' ? null : (orderId || null),
      timestamp: Date.now(),
    });

    const updater = (table) => {
      if (String(table.id) !== tableIdStr) return table;
      return {
        ...table,
        status,
        currentOrderId: status === 'available' ? null : (orderId || table.currentOrderId),
        lastOrderTime: status === 'occupied' ? new Date().toISOString() : table.lastOrderTime,
      };
    };

    setFloors(prev => prev.map(floor => ({
      ...floor,
      tables: floor.tables?.map(updater) || [],
    })));
    setTables(prev => prev.map(updater));
    setSelectedFloor(prev => {
      if (!prev) return prev;
      return { ...prev, tables: prev.tables?.map(updater) || [] };
    });
  }, []);

  // Background refresh without blocking
  const refreshInBackground = useCallback(async (restaurantId) => {
    if (isRefreshingRef.current) return;

    setSyncing(true);
    try {
      isRefreshingRef.current = true;
      // Invalidate cache first so we get fresh data from server
      apiClient.invalidateCache(`/api/floors/${restaurantId}`);
      const response = await apiClient.getFloors(restaurantId);

      let floorsData = [];
      if (response.floors) {
        floorsData = response.floors;
      } else if (Array.isArray(response)) {
        floorsData = response;
      }

      // Merge: preserve optimistic status for recently-updated tables (5s window)
      const OPTIMISTIC_WINDOW_MS = 5000;
      const now = Date.now();
      // Clean expired entries
      for (const [tid, entry] of pendingOptimisticRef.current) {
        if (now - entry.timestamp > OPTIMISTIC_WINDOW_MS) pendingOptimisticRef.current.delete(tid);
      }

      const mergeTable = (t) => {
        const pending = pendingOptimisticRef.current.get(String(t.id));
        if (pending && (now - pending.timestamp <= OPTIMISTIC_WINDOW_MS)) {
          return { ...t, status: pending.status, currentOrderId: pending.orderId !== undefined ? pending.orderId : t.currentOrderId };
        }
        return t;
      };

      const mergedFloors = floorsData.map(floor => ({
        ...floor,
        tables: (floor.tables || []).map(mergeTable),
      }));

      setFloors(() => mergedFloors);
      setTables(() => mergedFloors.flatMap(floor =>
        (floor.tables || []).map(t => ({ ...t, _floorName: floor.name, _floorId: floor.id }))
      ));

      setSelectedFloor(prev => {
        if (prev) {
          const updatedFloor = mergedFloors.find(f => f.id === prev.id);
          return updatedFloor || prev;
        }
        return prev;
      });

      // Save to cache for stale-while-revalidate
      if (restaurantId) {
        const allTables = mergedFloors.flatMap(floor => floor.tables || []);
        setCache('cache_floors_' + restaurantId, { floors: mergedFloors, tables: allTables });
      }
    } catch (error) {
      console.error('Error refreshing in background:', error);
    } finally {
      isRefreshingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Refresh tables when screen comes into focus (only after initial load)
  useFocusEffect(
    useCallback(() => {
      // Show tab bar when this screen focuses
      tabBar?.reset();

      // Skip refresh on initial mount
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        return;
      }

      // Check if we have table update params (from menu screen)
      // Only process once per unique param combination to avoid stale re-applies on every focus
      if (params.tableId && params.tableStatus) {
        const paramKey = `${params.tableId}_${params.tableStatus}_${params.orderId || ''}`;
        if (lastProcessedTableParamRef.current !== paramKey) {
          lastProcessedTableParamRef.current = paramKey;
          updateTableStatusOptimistically(
            params.tableId,
            params.tableStatus,
            params.orderId
          );
        }
      }

      // Re-check restaurant ID (user may have switched on home)
      const checkAndRefresh = async () => {
        try {
          const userData = await apiClient.getUser();
          const rid = userData?.restaurantId || userData?.restaurant?.id;
          if (rid && rid !== restaurantIdRef.current) {
            // Restaurant changed — full reload
            restaurantIdRef.current = rid;
            setSelectedRestaurant({ id: rid, ...userData.restaurant });
            setUser(userData);
            await loadFloorsAndTables(rid);
          } else if (rid && !isRefreshingRef.current) {
            // Same restaurant — background refresh after optimistic update settles
            setTimeout(() => refreshInBackground(rid), params.tableId ? 2000 : 300);
          }
        } catch (e) {
          console.error('Focus refresh error:', e);
        }
      };
      checkAndRefresh();
    }, [params.tableId, params.tableStatus, params.orderId, updateTableStatusOptimistically, refreshInBackground, loadFloorsAndTables])
  );

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      const restaurantId = userData.restaurantId || userData.restaurant?.id;

      if (!restaurantId) {
        Alert.alert('Error', 'No restaurant assigned. Please contact administrator.');
        return;
      }

      const restaurant = { id: restaurantId, ...userData.restaurant };
      setSelectedRestaurant(restaurant);
      restaurantIdRef.current = restaurantId;

      // Load print settings (fire-and-forget, use cached if available)
      try {
        const cachedPS = await AsyncStorage.getItem(`dine_print_settings_${restaurantId}`);
        if (cachedPS) printSettingsRef.current = JSON.parse(cachedPS);
        apiClient.getPrintSettings(restaurantId).then(res => {
          printSettingsRef.current = res?.printSettings || res || {};
        }).catch(() => {});
      } catch (_) {}

      // Stale-while-revalidate: try cache first (only if cache has actual floor data)
      const cached = await getCached('cache_floors_' + restaurantId);
      if (cached?.data?.floors?.length > 0) {
        setFloors(cached.data.floors);
        setTables(cached.data.tables || []);
        setLoading(false);
        // Fetch fresh data in background
        setSyncing(true);
        loadFloorsAndTables(restaurantId).finally(() => setSyncing(false));
        return;
      }

      await loadFloorsAndTables(restaurantId);
    } catch (error) {
      console.error('Error loading initial data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };


  // Firebase RTDB + LAN Hub: real-time table status updates when orders change on other devices
  useEffect(() => {
    const rid = restaurantIdRef.current;
    if (!rid || !database) return;

    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshInBackground(rid);
      }, 800);
    };

    // Event handlers (shared by Firebase RTDB and LAN hub)
    const handleTableStatusUpdated = (data) => {
      if (data?.tableId && data?.status) {
        // Server confirmed — clear pending optimistic entry
        pendingOptimisticRef.current.delete(String(data.tableId));
        updateTableStatusOptimistically(data.tableId, data.status, data.orderId);
      } else if (data?.tableNumber && data?.floorId && data?.status) {
        // Safe fallback: require both floorId + tableNumber
        setFloors(prevFloors => {
          const floor = prevFloors.find(f => f.id === data.floorId);
          const match = floor?.tables?.find(t => t.name === data.tableNumber);
          if (match) {
            pendingOptimisticRef.current.delete(String(match.id));
            updateTableStatusOptimistically(match.id, data.status, data.orderId);
          }
          return prevFloors;
        });
      }
      debouncedRefresh();
    };

    const handleOrderCreated = (data) => {
      if (data?.tableId) {
        updateTableStatusOptimistically(data.tableId, 'occupied', data.orderId);
      } else if (data?.tableNumber && data?.floorId) {
        // Safe fallback: require BOTH floorId + tableNumber to avoid cross-floor collision
        setFloors(prevFloors => {
          const floor = prevFloors.find(f => f.id === data.floorId);
          const match = floor?.tables?.find(t => t.name === data.tableNumber);
          if (match) updateTableStatusOptimistically(match.id, 'occupied', data.orderId);
          return prevFloors;
        });
      }
      // If neither tableId nor floorId+tableNumber, debouncedRefresh will pick up correct state
      debouncedRefresh();
    };

    const handleOrderCompletionEvent = (data) => {
      if (data?.status === 'completed' || data?.status === 'cancelled') {
        if (data?.tableId) {
          updateTableStatusOptimistically(data.tableId, 'available', null);
        } else if (data?.tableNumber && data?.floorId) {
          setFloors(prevFloors => {
            const floor = prevFloors.find(f => f.id === data.floorId);
            const match = floor?.tables?.find(t => t.name === data.tableNumber);
            if (match) updateTableStatusOptimistically(match.id, 'available', null);
            return prevFloors;
          });
        }
      }
      debouncedRefresh();
    };

    const handleTablesReset = () => {
      const resetT = (t) =>
        t.status === 'occupied' ? { ...t, status: 'available', currentOrderId: null } : t;
      setFloors(prev => prev.map(floor => ({
        ...floor,
        tables: floor.tables?.map(resetT),
      })));
      setTables(prev => prev.map(resetT));
      setSelectedFloor(prev => {
        if (!prev) return prev;
        return { ...prev, tables: prev.tables?.map(resetT) };
      });
      debouncedRefresh();
    };

    const lanUnsubs = [];

    // LAN Hub WebSocket events (when paired)
    if (lanClient.isPaired() || lanClient.isServerConnected()) { // old hub OR new on-prem local server (offline LAN)
      lanUnsubs.push(lanClient.onEvent('table-status-updated', handleTableStatusUpdated));
      lanUnsubs.push(lanClient.onEvent('order-created', handleOrderCreated));
      lanUnsubs.push(lanClient.onEvent('order-updated', handleOrderCompletionEvent));
      lanUnsubs.push(lanClient.onEvent('order-status-updated', handleOrderCompletionEvent));
      lanUnsubs.push(lanClient.onEvent('order-completed', debouncedRefresh));
      lanUnsubs.push(lanClient.onEvent('order-deleted', debouncedRefresh));
      lanUnsubs.push(lanClient.onEvent('tables-reset', handleTablesReset));
    }

    // Firebase RTDB — subscribe to orders and tables categories
    const now = Date.now();

    const ordersQuery = query(
      ref(database, `events/${rid}/orders`),
      orderByChild('ts'),
      startAt(now)
    );

    const tablesQuery = query(
      ref(database, `events/${rid}/tables`),
      orderByChild('ts'),
      startAt(now)
    );

    const ordersHandler = (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      switch (data.type) {
        case 'order-created': handleOrderCreated(data); break;
        case 'order-updated': handleOrderCompletionEvent(data); break;
        case 'order-status-updated': handleOrderCompletionEvent(data); break;
        case 'order-completed': debouncedRefresh(); break;
        case 'order-deleted': debouncedRefresh(); break;
      }
    };

    const tablesHandler = (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      switch (data.type) {
        case 'table-status-updated': handleTableStatusUpdated(data); break;
        case 'tables-reset': handleTablesReset(); break;
      }
    };

    const unsubOrders = onChildAdded(ordersQuery, ordersHandler);
    const unsubTables = onChildAdded(tablesQuery, tablesHandler);

    return () => {
      lanUnsubs.forEach(fn => fn());
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubOrders();
      unsubTables();
    };
  }, [selectedRestaurant?.id, refreshInBackground, updateTableStatusOptimistically]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (selectedRestaurant?.id) {
        // Invalidate in-memory cache so we get fresh data from server
        apiClient.invalidateCache(`/api/floors/${selectedRestaurant.id}`);
        await loadFloorsAndTables(selectedRestaurant.id);
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [selectedRestaurant, loadFloorsAndTables]);

  const getTableStats = () => {
    const available = tables.filter(t => t.status === 'available').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    const reserved = tables.filter(t => t.status === 'reserved').length;
    return { available, occupied, reserved, total: tables.length };
  };

  const getFloorForTable = useCallback((table) => {
    if (selectedFloor) return selectedFloor;
    // When "All" is selected, find which floor this table belongs to
    return floors.find(f => f.tables?.some(t => t.id === table.id)) || null;
  }, [selectedFloor, floors]);

  // Status → color palette for the view-only Floor Map. Mirrors the grid cards'
  // dot/background/status-bar colors so both views read identically.
  const getTableStatusColors = useCallback((status) => {
    switch (status) {
      case 'occupied':
        return { bg: '#fffbeb', border: '#ea580c', text: '#92400e', dot: '#ea580c' };
      case 'reserved':
        return { bg: '#faf5ff', border: '#9333ea', text: '#6b21a8', dot: '#9333ea' };
      case 'cleaning':
        return { bg: '#f0f9ff', border: '#3b82f6', text: '#1e40af', dot: '#3b82f6' };
      case 'merged':
        return { bg: '#f0fdfa', border: '#0d9488', text: '#0f766e', dot: '#0d9488' };
      case 'out-of-service':
        return { bg: '#f9fafb', border: '#9ca3af', text: '#6b7280', dot: '#9ca3af' };
      case 'available':
      default:
        return { bg: '#f0fdf4', border: '#16a34a', text: '#166534', dot: '#16a34a' };
    }
  }, []);

  const handleTablePress = (table) => {
    // Don't allow any actions if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

    // Get floor name for multi-tier pricing auto-selection
    const tableFloor = getFloorForTable(table);
    const currentFloorName = tableFloor?.name || tableFloor?.floorName || '';

    if (table.status === 'available') {
      if (user?.role?.toLowerCase() === 'waiter') {
        setWaiterOrderContext({ tableId: table.id, tableNumber: table.name, floorName: currentFloorName, floorId: tableFloor?.id || '' });
        setShowWaiterOrderModal(true);
      } else {
        router.push({
          pathname: '/(tabs)/menu',
          params: { tableId: table.id, tableNumber: table.name, floorName: currentFloorName, floorId: tableFloor?.id || '', navStamp: Date.now().toString() },
        });
      }
    } else if (table.status === 'occupied' && table.currentOrderId) {
      // Keep user on tables page — open the order detail modal inline
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('view');
      setShowOrderModal(true);
    } else if (table.status === 'cleaning') {
      // Allow operations on cleaning tables
      if (table.currentOrderId) {
        setSelectedOrderId(table.currentOrderId);
        setSelectedTableForOrder(table);
        setOrderModalMode('view');
        setShowOrderModal(true);
      } else if (user?.role?.toLowerCase() === 'waiter') {
        setWaiterOrderContext({ tableId: table.id, tableNumber: table.name, floorName: currentFloorName, floorId: tableFloor?.id || '' });
        setShowWaiterOrderModal(true);
      } else {
        router.push({
          pathname: '/(tabs)/menu',
          params: { tableId: table.id, tableNumber: table.name, floorName: currentFloorName, floorId: tableFloor?.id || '', navStamp: Date.now().toString() },
        });
      }
    } else {
      Alert.alert('Table Unavailable', `Table ${table.name} is ${table.status}.`);
    }
  };

  // Dynamic parties (Path A): add another independent party (check) to a table on demand and
  // jump straight into Take Order for it — no pre-splitting. Base stays Party A; new sibling is
  // 7-B / 7-C… Mirrors the web flow and reuses the same order-taking navigation.
  const [addingParty, setAddingParty] = useState(false);
  const handleAddParty = async (table) => {
    const rid = restaurantIdRef.current || selectedRestaurant?.id;
    if (!table || !rid || addingParty) return;
    setShowTableActions(false);
    setAddingParty(true);
    try {
      const res = await apiClient.addTableParty(rid, table.id);
      const party = res?.party;
      // Refresh floors/tables so the new sibling + its chip appear.
      loadFloorsAndTables(rid);
      if (party?.id) {
        const tableFloor = getFloorForTable(table);
        const currentFloorName = tableFloor?.name || tableFloor?.floorName || table._floorName || '';
        const floorId = tableFloor?.id || table._floorId || '';
        if (user?.role?.toLowerCase() === 'waiter') {
          setWaiterOrderContext({ tableId: party.id, tableNumber: party.name, floorName: currentFloorName, floorId });
          setShowWaiterOrderModal(true);
        } else {
          router.push({
            pathname: '/(tabs)/menu',
            params: { tableId: party.id, tableNumber: party.name, floorName: currentFloorName, floorId, navStamp: Date.now().toString() },
          });
        }
      }
    } catch (err) {
      Alert.alert('Could not add party', err?.message || 'Please try again.');
    } finally {
      setAddingParty(false);
    }
  };

  const handleResetAllTables = async () => {
    const occupiedCount = tables.filter(t => t.status === 'occupied').length;
    if (occupiedCount === 0) {
      Alert.alert('No Tables to Reset', 'All tables are already available.');
      return;
    }
    Alert.alert(
      'Reset All Tables',
      `Free ${occupiedCount} occupied table(s)? This will mark them as available.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All', style: 'destructive', onPress: async () => {
            try {
              await apiClient.resetAllTables(selectedRestaurant?.id);
              const resetTable = (t) =>
                t.status === 'occupied' ? { ...t, status: 'available', currentOrderId: null } : t;
              // Optimistic update — floors, tables, AND selectedFloor
              setFloors(prev => prev.map(floor => ({
                ...floor,
                tables: floor.tables?.map(resetTable),
              })));
              setTables(prev => prev.map(resetTable));
              setSelectedFloor(prev => {
                if (!prev) return prev;
                return { ...prev, tables: prev.tables?.map(resetTable) };
              });
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to reset tables');
            }
          }
        },
      ]
    );
  };

  const handleAddToOrder = (table) => {
    // Don't allow adding to order if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

    // Allow adding to order for occupied or cleaning tables — open order detail modal directly
    if ((table.status === 'occupied' || table.status === 'cleaning') && table.currentOrderId) {
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('view');
      setShowOrderModal(true);
    }
  };

  // Fire-and-forget bill auto-print from order data
  const autoPrintBill = (order) => {
    if (printSettingsRef.current?.autoPrintOnBilling === false) return;
    try {
      const subtotal = (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
      const invoiceData = {
        orderId: order.id,
        orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
        restaurantName: selectedRestaurant?.name || '',
        restaurantInfo: selectedRestaurant || {},
        items: (order.items || []).map(i => ({
          name: i.name, quantity: i.quantity || 1, price: i.price || 0,
          total: (i.price || 0) * (i.quantity || 1),
          selectedVariant: i.selectedVariant || null,
          selectedCustomizations: i.selectedCustomizations || [],
          notes: i.notes || '',
        })),
        subtotal,
        tax: order.taxAmount || 0,
        taxRate: order.taxRate || 0,
        taxEnabled: !!(order.taxAmount > 0 || order.taxBreakdown?.length),
        taxBreakdown: order.taxBreakdown || null,
        grandTotal: order.finalAmount || order.totalAmount || subtotal,
        customerName: order.customerInfo?.name || 'Walk-in Customer',
        customerMobile: order.customerInfo?.phone || order.customerPhone || '',
        orderType: order.orderType || 'dine-in',
        paymentMethod: order.paymentMethod || 'cash',
        timestamp: order.completedAt || new Date(),
        staffName: user?.name || 'Staff',
        offerDiscount: order.discountAmount || 0,
        manualDiscount: order.manualDiscount || 0,
        loyaltyDiscount: order.loyaltyDiscount || 0,
        couponDiscount: order.couponDiscount || 0,
        couponCode: order.couponCode || null,
        serviceChargeAmount: order.serviceChargeAmount || 0,
        serviceChargeRate: order.serviceChargeRate || 0,
        tipAmount: order.tipAmount || 0,
        roundOffAmount: order.roundOffAmount || 0,
        cashReceived: order.cashReceived || null,
        changeReturned: order.changeReturned || null,
        splitPayments: order.splitPayments || null,
      };
      const billText = printerService.generateBillText(invoiceData);
      printerService.printWithFeedback({ text: billText, silentOnly: true, label: 'Bill' })
        .then(r => {
          if (!r.success && r.notify !== false) {
            toast.warning(r.error || 'Bill could not be printed. Check printer connection.', 4000, 'Print Failed');
          }
          // Print food court token slips after bill (category-wise, each as separate cut)
          if (printSettingsRef.current?.tokenBillingEnabled && selectedRestaurant?.id && order.id) {
            autoPrintTokens(selectedRestaurant.id, order.id);
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error('Bill auto-print build failed:', err);
    }
  };

  // Print food court token slips — one per category, each as a separate print (cut command between)
  const autoPrintTokens = async (restaurantId, orderId) => {
    try {
      // Skip local token printing when remote print is enabled — desktop handles it
      const remotePrint = await printerService.getRemotePrintEnabled();
      if (remotePrint) return;

      const tokenRes = await apiClient.getTokenRender(restaurantId, orderId);
      const tokens = tokenRes?.tokens || [];
      if (!tokenRes?.success || tokens.length === 0) return;
      for (const token of tokens) {
        const tokenText = printerService.generateTokenText(token);
        await printerService.printContent({ text: tokenText, silentOnly: true });
      }
    } catch (err) {
      console.error('Token auto-print failed:', err);
    }
  };

  // Print pre-bill: same as autoPrintBill but with isPreBill flag, does NOT complete the order.
  // When remote printing is enabled, sends event to Firebase RTDB for desktop app to print.
  const handlePrintPreBill = async (order) => {
    try {
      // Check if remote printing is enabled (delegate to desktop Electron app via backend API)
      const remotePrint = await printerService.getRemotePrintEnabled();
      if (remotePrint) {
        // Route through backend API which has RTDB write access (Admin SDK)
        await apiClient.triggerPrint(order.id, 'pre-bill');
        toast.success('Pre-bill sent to desktop printer', 3000);
        return;
      }

      // Local printing
      const subtotal = (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
      const invoiceData = {
        orderId: order.id,
        orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
        restaurantName: selectedRestaurant?.name || '',
        restaurantInfo: selectedRestaurant || {},
        items: (order.items || []).map(i => ({
          name: i.name, quantity: i.quantity || 1, price: i.price || 0,
          total: (i.price || 0) * (i.quantity || 1),
          selectedVariant: i.selectedVariant || null,
          selectedCustomizations: i.selectedCustomizations || [],
          notes: i.notes || '',
        })),
        subtotal,
        tax: order.taxAmount || 0,
        taxRate: order.taxRate || 0,
        taxEnabled: !!(order.taxAmount > 0 || order.taxBreakdown?.length),
        taxBreakdown: order.taxBreakdown || null,
        grandTotal: order.finalAmount || order.totalAmount || subtotal,
        customerName: order.customerInfo?.name || 'Walk-in Customer',
        customerMobile: order.customerInfo?.phone || order.customerPhone || '',
        orderType: order.orderType || 'dine-in',
        paymentMethod: order.paymentMethod || 'cash',
        timestamp: new Date(),
        staffName: user?.name || 'Staff',
        tableNumber: order.tableNumber || selectedTableForOrder?.name || '',
        floorName: order.floorName || '',
        waiterName: order.staffInfo?.waiterName || order.staffInfo?.name || user?.name || '',
        offerDiscount: order.discountAmount || 0,
        manualDiscount: order.manualDiscount || 0,
        loyaltyDiscount: order.loyaltyDiscount || 0,
        couponDiscount: order.couponDiscount || 0,
        couponCode: order.couponCode || null,
        serviceChargeAmount: order.serviceChargeAmount || 0,
        serviceChargeRate: order.serviceChargeRate || 0,
        tipAmount: order.tipAmount || 0,
        roundOffAmount: order.roundOffAmount || 0,
        printSettings: printSettingsRef.current || {},
        isPreBill: true,
      };
      const billText = printerService.generateBillText(invoiceData);
      const result = await printerService.printWithFeedback({ text: billText, silentOnly: true, label: 'Pre-Bill' });
      if (result.success) {
        toast.success('Pre-bill printed successfully', 3000);
      } else if (result.notify !== false) {
        toast.warning(result.error || 'Pre-bill could not be printed. Check printer connection.', 4000, 'Print Failed');
      }
    } catch (err) {
      console.error('Pre-bill print failed:', err?.message || err, err?.response?.data || '');
      toast.error(`Pre-bill failed: ${err?.message || 'Unknown error'}`, 4000);
    }
  };

  const handleMarkTableComplete = async (table) => {
    if (!table.currentOrderId) return;
    const rid = selectedRestaurant?.id;

    // Optimistic: mark the table available right away
    updateTableStatusOptimistically(table.id, 'available', null);

    try {
      // Fetch the order to get customer data for stats update
      let order = null;
      try {
        const orderRes = await apiClient.getOrderById(rid, table.currentOrderId);
        order = orderRes?.order || orderRes;
      } catch (_) {}

      // Send full update (matching web flow) so backend updates customer stats
      const updateData = {
        status: 'completed',
        paymentStatus: order?.paymentStatus === 'partial' ? 'partial' : 'paid',
        paymentMethod: order?.paymentMethod || 'cash',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...(order?.totalAmount && { totalAmount: order.totalAmount }),
        ...(order?.finalAmount && { finalAmount: order.finalAmount }),
        ...(order?.taxAmount && { taxAmount: order.taxAmount }),
        customerId: order?.customerId || null,
        customerInfo: {
          name: order?.customerInfo?.name || '',
          phone: order?.customerInfo?.phone || order?.customerInfo?.mobile || order?.customerPhone || null,
          tableNumber: order?.tableNumber || table.name || null,
        },
        ...(order?.customerPhone && { customerPhone: order.customerPhone }),
        ...(order?.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: order.redeemLoyaltyPoints }),
        ...(order?.loyaltyDiscount > 0 && { loyaltyDiscount: order.loyaltyDiscount }),
        ...(order?.discountAmount > 0 && { discountAmount: order.discountAmount }),
        lastUpdatedBy: {
          name: user?.name || 'Staff',
          id: user?.id,
          role: user?.role || 'waiter',
        },
      };

      await apiClient.updateOrder(table.currentOrderId, updateData);

      // Auto-print bill silently (fire and forget)
      if (order) autoPrintBill({ ...order, id: table.currentOrderId, completedAt: new Date().toISOString() });

      // Verify payment
      try {
        await apiClient.verifyPayment({
          orderId: table.currentOrderId,
          paymentMethod: order?.paymentMethod || 'cash',
          amount: order?.finalAmount || order?.totalAmount || 0,
          userId: user?.id,
          restaurantId: rid,
          paymentStatus: 'completed',
        });
      } catch (_) {}

      if (table.id) {
        try {
          await apiClient.updateTableStatus(table.id, 'available', null, rid);
        } catch (e) {
          console.warn('Table status update failed:', e?.message);
        }
      }
      // Refresh in background
      if (rid) refreshInBackground(rid);
    } catch (err) {
      // Revert on failure
      updateTableStatusOptimistically(table.id, 'occupied', table.currentOrderId);
      Alert.alert('Error', err?.message || 'Failed to complete order.');
    }
  };

  const handleViewOrder = (table) => {
    // Don't allow viewing order if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

    // Allow viewing order for occupied or cleaning tables
    if ((table.status === 'occupied' || table.status === 'cleaning') && table.currentOrderId) {
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('view');
      setShowOrderModal(true);
    }
  };

  const handleAddItemsToOrder = async (order, cartItems) => {
    const tableFloor = selectedTableForOrder ? getFloorForTable(selectedTableForOrder) : null;
    const floorNameVal = tableFloor?.name || tableFloor?.floorName || '';

    // Waiter: use self-contained modal instead of navigating to Menu tab
    if (user?.role?.toLowerCase() === 'waiter') {
      setShowOrderModal(false);
      setWaiterOrderContext({
        tableId: selectedTableForOrder?.id,
        tableNumber: selectedTableForOrder?.name,
        floorName: floorNameVal,
        floorId: tableFloor?.id || '',
        existingOrderId: order.id,
      });
      setShowWaiterOrderModal(true);
      return;
    }

    // Other roles: existing AsyncStorage + tab navigation flow
    try {
      await AsyncStorage.setItem('pendingAddItems', JSON.stringify({
        tableId: selectedTableForOrder?.id,
        tableNumber: selectedTableForOrder?.name,
        floorName: floorNameVal,
        floorId: tableFloor?.id || '',
        orderId: order.id,
        dailyOrderId: order.dailyOrderId || order.orderNumber || null,
        cartItems,
        timestamp: Date.now(),
      }));
    } catch (e) {
      console.error('Error storing add-items data:', e);
    }
    router.navigate({ pathname: '/(tabs)/menu' });
  };

  const getTimeElapsed = (createdAt) => {
    if (!createdAt) return '';
    try {
      const now = new Date();
      let created;
      if (createdAt._seconds) {
        created = new Date(createdAt._seconds * 1000);
      } else if (createdAt.toDate) {
        created = createdAt.toDate();
      } else if (typeof createdAt === 'string') {
        created = new Date(createdAt);
      } else {
        created = new Date(createdAt);
      }
      if (isNaN(created.getTime())) return '';
      const diffMs = now - created;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      if (diffHrs < 24) {
        return remainingMins > 0 ? `${diffHrs}h ${remainingMins}m ago` : `${diffHrs}h ago`;
      }
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ago`;
    } catch (e) {
      return '';
    }
  };

  const renderTable = ({ item: table }) => {
    // Normalize status to avoid undefined showing as blank/grey cards
    const normalizedStatus = table.status || 'available';
    const isOccupied = normalizedStatus === 'occupied';
    const isAvailable = normalizedStatus === 'available';
    const isReserved = normalizedStatus === 'reserved';
    const isCleaning = normalizedStatus === 'cleaning';
    const isOutOfService = normalizedStatus === 'out-of-service';

    // Dynamic parties: this base table's sibling parties + whether it can host them.
    const partiesEnabled = !table.isSubTable && !table.isPartyTable && !table.isSplit && !table.mergeGroupId && !table.mergedInto;
    const parties = partiesByBase[table.id] || [];

    const cardContent = (
      <TouchableOpacity
        style={[
          styles.tableCard,
          isAvailable && styles.tableCardAvailable,
          isOccupied && styles.tableCardOccupied,
          isReserved && styles.tableCardReserved,
          isCleaning && styles.tableCardCleaning,
          isOutOfService && styles.tableCardOutOfService,
        ]}
        onPress={() => {
          if (!isOutOfService) {
            handleTablePress(table);
          }
        }}
        onLongPress={() => showTableActionSheet(table)}
        activeOpacity={isOutOfService ? 1 : 0.8}
      >
        {/* Options button — opens the clean actions sheet (discoverable; not only long-press).
            Solid white pill + gear icon so it's clearly visible on any card colour. */}
        <TouchableOpacity
          onPress={() => showTableActionSheet(table)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ position: 'absolute', top: 5, right: 5, zIndex: 5, width: 26, height: 26, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }}
        >
          <Ionicons name="settings-outline" size={14} color="#475569" />
        </TouchableOpacity>
        {/* Card Inner */}
        <View style={[styles.cardInner, isTablet && { padding: sp(12) }]}>
          {/* Table Content */}
          <View style={styles.tableContent}>
            {/* Table Name Row: dot + name + elapsed time */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: r(7, 10) }}>
              <View style={[styles.statusDotInline, {
                width: r(9, 11), height: r(9, 11), borderRadius: r(5, 6),
                backgroundColor: isAvailable ? '#16a34a' : isOccupied ? '#ea580c' : isReserved ? '#9333ea' : isCleaning ? '#3b82f6' : '#9ca3af'
              }]} />
              <Text style={[styles.tableNumber, { fontSize: fs(17) }, isOutOfService && styles.tableNumberDisabled]} numberOfLines={1}>{table.name}</Text>
              {!selectedFloor && table._floorName && floors.length > 1 && (
                <Text style={styles.floorLabel} numberOfLines={1}>{table._floorName}</Text>
              )}
              {isOccupied && table.lastOrderTime && (() => {
                const elapsed = getTimeElapsed(table.lastOrderTime);
                if (!elapsed) return null;
                const isOverADay = elapsed.includes('d');
                return (
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: isOverADay ? '#dc2626' : '#92400e',
                  }}>
                    {elapsed}
                  </Text>
                );
              })()}
            </View>

            {/* Status Badge */}
            {isOccupied && (
              <View style={styles.statusBadgeOccupied}>
                <Text style={styles.statusBadgeText}>OCCUPIED</Text>
              </View>
            )}
            {isReserved && (
              <View style={styles.statusBadgeReserved}>
                <Text style={styles.statusBadgeText}>RESERVED</Text>
              </View>
            )}
            {isCleaning && (
              <View style={styles.statusBadgeCleaning}>
                <Text style={styles.statusBadgeText}>CLEANING</Text>
              </View>
            )}
            {isOutOfService && (
              <View style={styles.statusBadgeOutOfService}>
                <Text style={styles.statusBadgeText}>OUT OF SERVICE</Text>
              </View>
            )}

            {/* Seats */}
            {table.capacity && (
              <View style={styles.seatsRow}>
                <Ionicons name="people" size={14} color={isOutOfService ? Colors.textMedium : Colors.textMedium} />
                <Text style={[styles.seatsText, isOutOfService && styles.seatsTextDisabled]}>{table.capacity} Seats</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.tableActions}>
              {isOutOfService ? (
                <View style={styles.outOfServiceButtonContainer}>
                  <Ionicons name="ban" size={14} color="#9ca3af" />
                  <Text style={styles.outOfServiceButtonText}>Not Available</Text>
                </View>
              ) : isAvailable ? (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="restaurant-outline" size={15} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Take Order</Text>
                </View>
              ) : isReserved ? (
                <View style={styles.reservedInfoContainer}>
                  <Ionicons name="calendar-outline" size={14} color="#9333ea" />
                  <Text style={styles.reservedInfoText}>Reserved</Text>
                </View>
              ) : (
                // Occupied or cleaning — View and Add buttons
                <View style={styles.occupiedActions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleViewOrder(table);
                    }}
                  >
                    <Ionicons name="eye-outline" size={11} color={Colors.textDark} />
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddToOrder(table);
                    }}
                  >
                    <Ionicons name="add-outline" size={13} color="#3b82f6" />
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Party chips (Path A) — A = this base table; siblings B/C… open their own order.
                Only shown once a sibling exists, so single-party tables stay clean. */}
            {partiesEnabled && parties.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 1 }}>Parties</Text>
                <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>A</Text>
                </View>
                {parties.map((p) => {
                  const pOcc = !!p.currentOrderId || p.status === 'occupied' || p.status === 'serving';
                  return (
                    <TouchableOpacity key={p.id} onPress={() => handleTablePress(p)} style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: pOcc ? '#fef3c7' : '#ede9fe', borderWidth: 1, borderColor: pOcc ? '#fcd34d' : '#ddd6fe', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: pOcc ? '#b45309' : '#7c3aed' }}>{p.partyLabel || '?'}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={() => handleAddParty(table)} style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#c4b5fd', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="add" size={11} color="#7c3aed" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        {/* Bottom status color bar */}
        <View style={[
          styles.statusBar,
          isAvailable && styles.statusBarGreen,
          isOccupied && styles.statusBarOrange,
          isReserved && styles.statusBarPurple,
          isCleaning && styles.statusBarBlue,
          isOutOfService && styles.statusBarGrey,
        ]} />
      </TouchableOpacity>
    );

    return cardContent;
  };

  const userRole = user?.role?.toLowerCase() || '';
  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole);
  const canResetTables = canPerform(user, user?.pageAccess, 'tables', 'reset');
  const posSettings = selectedRestaurant?.posSettings || {};
  const waiterAppConfig = posSettings.waiterAppConfig || {};

  const openAddFloor = () => {
    setEditingFloor(null);
    setFloorForm({ name: '', description: '', areaChargeType: 'none', areaChargeValue: '' });
    setShowFloorModal(true);
  };

  const openEditFloor = (floor) => {
    setEditingFloor(floor);
    setFloorForm({
      name: floor.name || '',
      description: floor.description || '',
      areaChargeType: floor.areaChargeType || 'none',
      areaChargeValue: floor.areaChargeValue ? String(floor.areaChargeValue) : '',
    });
    setShowFloorModal(true);
  };

  const handleSaveFloor = async () => {
    if (!floorForm.name.trim() || !selectedRestaurant?.id) return;
    setSavingFloor(true);
    try {
      const data = {
        name: floorForm.name.trim(),
        description: floorForm.description.trim() || null,
        areaChargeType: floorForm.areaChargeType || 'none',
        areaChargeValue: parseFloat(floorForm.areaChargeValue) || 0,
      };

      if (editingFloor) {
        await apiClient.updateFloor(editingFloor.id, { ...data, restaurantId: selectedRestaurant.id });
        setFloors(prev => prev.map(f =>
          f.id === editingFloor.id ? { ...f, ...data } : f
        ));
        setSelectedFloor(prev => {
          if (prev?.id === editingFloor.id) return { ...prev, ...data };
          return prev;
        });
      } else {
        const response = await apiClient.createFloor(selectedRestaurant.id, data);
        if (response.floor) {
          const newFloorData = { ...response.floor, tables: [] };
          setFloors(prev => [...prev, newFloorData]);
          setSelectedFloor(newFloorData);
        }
      }

      setShowFloorModal(false);
      setEditingFloor(null);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save floor');
    } finally {
      setSavingFloor(false);
    }
  };

  // Delete floor
  const handleDeleteFloor = () => {
    if (!editingFloor) return;
    Alert.alert(
      'Delete Floor',
      `Are you sure you want to delete "${editingFloor.name}" and all its tables?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteFloor(editingFloor.id, selectedRestaurant?.id);
              setFloors(prev => {
                const remaining = prev.filter(f => f.id !== editingFloor.id);
                if (selectedFloor?.id === editingFloor.id) {
                  setSelectedFloor(remaining.length > 0 ? remaining[0] : null);
                }
                return remaining;
              });
              setShowFloorModal(false);
              setEditingFloor(null);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete floor');
            }
          },
        },
      ]
    );
  };

  // Open add table modal
  const openAddTable = () => {
    const defaultFloorName = selectedFloor?.name || floors[0]?.name || '';
    setTableForm({ name: '', capacity: '4', type: 'regular', floor: defaultFloorName });
    setBulkForm({ fromNumber: '', toNumber: '', capacity: '4', floor: defaultFloorName });
    setAddTableMode('single');
    setShowInlineFloorInput(false);
    setInlineFloorName('');
    setShowAddTableModal(true);
  };

  // Save single table
  const handleSaveTable = async () => {
    if (!tableForm.name.trim() || !selectedRestaurant?.id) return;
    const floorName = tableForm.floor || selectedFloor?.name || '';
    if (!floorName) {
      Alert.alert('Floor Required', 'Please select or create a floor first.');
      return;
    }
    setSavingTable(true);
    try {
      const data = {
        name: tableForm.name.trim(),
        capacity: parseInt(tableForm.capacity) || 4,
        type: tableForm.type,
        floor: floorName,
        status: 'available',
      };
      const response = await apiClient.createTable(selectedRestaurant.id, data);
      // Invalidate cache so loadFloorsAndTables fetches fresh data
      apiClient.invalidateCache('/api/floors/');
      apiClient.invalidateCache('/api/tables/');
      await loadFloorsAndTables(selectedRestaurant.id);
      setShowAddTableModal(false);
      Alert.alert('Success', 'Table added successfully!');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add table');
    } finally {
      setSavingTable(false);
    }
  };

  // Save bulk tables
  const handleBulkCreate = async () => {
    const from = parseInt(bulkForm.fromNumber);
    const to = parseInt(bulkForm.toNumber);
    if (!from || !to || from > to || !selectedRestaurant?.id) return;
    const floorName = bulkForm.floor || selectedFloor?.name || '';
    if (!floorName) {
      Alert.alert('Floor Required', 'Please select or create a floor first.');
      return;
    }
    if (to - from > 99) {
      Alert.alert('Error', 'Cannot create more than 100 tables at once');
      return;
    }
    setSavingTable(true);
    try {
      const data = {
        floor: floorName,
        fromNumber: from,
        toNumber: to,
        capacity: parseInt(bulkForm.capacity) || 4,
      };
      const response = await apiClient.bulkCreateTables(selectedRestaurant.id, data);
      // Invalidate cache so loadFloorsAndTables fetches fresh data
      apiClient.invalidateCache('/api/floors/');
      apiClient.invalidateCache('/api/tables/');
      await loadFloorsAndTables(selectedRestaurant.id);
      setShowAddTableModal(false);
      const count = response.created || (to - from + 1);
      const skipped = response.duplicatesSkipped || 0;
      Alert.alert('Success', `Created ${count} tables${skipped > 0 ? ` (${skipped} duplicates skipped)` : ''}`);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create tables');
    } finally {
      setSavingTable(false);
    }
  };

  // Create floor inline from Add Table modal
  const handleInlineFloorCreate = async () => {
    if (!inlineFloorName.trim() || !selectedRestaurant?.id) return;
    setSavingInlineFloor(true);
    try {
      const response = await apiClient.createFloor(selectedRestaurant.id, {
        name: inlineFloorName.trim(),
        description: null,
        areaChargeType: 'none',
        areaChargeValue: 0,
      });
      if (response.floor) {
        const newFloorData = { ...response.floor, tables: [] };
        setFloors(prev => [...prev, newFloorData]);
        // Auto-select the newly created floor in the table form
        const floorName = response.floor.name;
        if (addTableMode === 'single') {
          setTableForm(prev => ({ ...prev, floor: floorName }));
        } else {
          setBulkForm(prev => ({ ...prev, floor: floorName }));
        }
      }
      setInlineFloorName('');
      setShowInlineFloorInput(false);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create floor');
    } finally {
      setSavingInlineFloor(false);
    }
  };

  // Delete table
  const handleDeleteTable = (table) => {
    Alert.alert(
      'Delete Table',
      `Are you sure you want to delete table "${table.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteTable(table.id, selectedRestaurant?.id);
              // Remove from local state — floors, tables, AND selectedFloor
              setFloors(prev => prev.map(f => ({
                ...f,
                tables: f.tables?.filter(t => t.id !== table.id) || [],
              })));
              setTables(prev => prev.filter(t => t.id !== table.id));
              setSelectedFloor(prev => {
                if (!prev) return prev;
                return { ...prev, tables: prev.tables?.filter(t => t.id !== table.id) || [] };
              });
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete table');
            }
          },
        },
      ]
    );
  };

  // Change table status
  const handleChangeStatus = async (table, newStatus) => {
    try {
      await apiClient.updateTableStatus(table.id, newStatus, null, selectedRestaurant?.id);
      updateTableStatusOptimistically(table.id, newStatus, null);
      // Clear customer info if marking available
      if (newStatus === 'available') {
        const clearCustomer = (t) =>
          t.id === table.id ? { ...t, status: 'available', customerName: null, reservationTime: null, currentOrderId: null, bookingId: null, currentBookingId: null } : t;
        setFloors(prev => prev.map(f => ({
          ...f,
          tables: f.tables?.map(clearCustomer) || [],
        })));
        setSelectedFloor(prev => {
          if (!prev) return prev;
          return { ...prev, tables: prev.tables?.map(clearCustomer) || [] };
        });
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update table status');
    }
  };

  // Show table action sheet
  const showTableActionSheet = (table) => {
    setActionTable(table);
    const status = table.status || 'available';
    const canHostParties = !table.isSubTable && !table.isPartyTable && !table.isSplit && !table.mergeGroupId && !table.mergedInto;

    if (Platform.OS === 'ios') {
      const options = [];
      const actions = [];

      // Status-based actions
      if (status === 'available') {
        options.push('Take Order');
        actions.push(() => handleTablePress(table));
        options.push('Book Table');
        actions.push(() => openBookingForm(table));
      }
      // New Party — start another independent check on this table (base stays Party A).
      if (canHostParties && (status === 'available' || status === 'occupied' || status === 'cleaning')) {
        options.push('New Party');
        actions.push(() => handleAddParty(table));
      }
      if (status === 'reserved' && (table.bookingId || table.reservationId)) {
        options.push('Check In');
        actions.push(() => handleCheckInBooking(table));
      }
      if (status !== 'available') {
        options.push('Mark Available');
        actions.push(() => handleChangeStatus(table, 'available'));
      }
      if (status === 'occupied' && table.currentOrderId) {
        options.push('View Order');
        actions.push(() => handleViewOrder(table));
      }
      if (posSettings.moveOrderEnabled && status === 'occupied' && table.currentOrderId) {
        const tableFloor = getFloorForTable(table);
        options.push('Move Order');
        actions.push(() => setMoveModalTable({
          id: table.id, name: table.name, currentOrderId: table.currentOrderId,
          floorId: tableFloor?.id || null, floorName: tableFloor?.name || '',
        }));
      }
      if (status !== 'out-of-service') {
        options.push('Mark Out of Service');
        actions.push(() => handleChangeStatus(table, 'out-of-service'));
      }
      if (status !== 'cleaning') {
        options.push('Mark Cleaning');
        actions.push(() => handleChangeStatus(table, 'cleaning'));
      }
      if (isOwnerOrAdmin) {
        options.push('Delete Table');
        actions.push(() => handleDeleteTable(table));
      }
      options.push('Cancel');

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: isOwnerOrAdmin ? options.length - 2 : undefined,
          title: `Table ${table.name}`,
          message: `Status: ${status} | ${table.capacity || 4} seats`,
        },
        (index) => {
          if (index < actions.length) actions[index]();
        }
      );
    } else {
      // Android - use custom modal
      setShowTableActions(true);
    }
  };

  // Open booking form
  const handleCheckInBooking = async (table) => {
    const bookingId = table.bookingId || table.reservationId || table.currentBookingId;
    if (!bookingId) {
      Alert.alert('No Booking', 'No booking found for this table.');
      return;
    }
    const rid = restaurantIdRef.current;
    try {
      await apiClient.updateBooking(bookingId, { status: 'arrived' });

      // Explicitly update table status via API so other devices see it
      apiClient.updateTableStatus(table.id, 'occupied', null, rid)
        .catch(err => console.warn('Table status update on check-in failed:', err.message));

      // Optimistic: mark occupied but preserve customer info from reservation
      updateTableStatusOptimistically(table.id, 'occupied', null);
      const preserveCustomer = (t) =>
        t.id === table.id ? { ...t, status: 'occupied', lastOrderTime: new Date().toISOString() } : t;
      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables?.map(preserveCustomer) || [],
      })));
      setSelectedFloor(prev => {
        if (!prev) return prev;
        return { ...prev, tables: prev.tables?.map(preserveCustomer) || [] };
      });

      if (Platform.OS === 'android') {
        const { ToastAndroid: Toast } = require('react-native');
        Toast.show(`Guest checked in at Table ${table.name}`, Toast.SHORT);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to check in');
    }
  };

  const openBookingForm = (table) => {
    const now = new Date();
    setBookingTable(table);
    setBookingForm({
      customerName: '',
      customerPhone: '',
      partySize: String(table.capacity || 2),
      bookingDate: now.toISOString().split('T')[0],
      bookingTime: '',
      notes: '',
    });
    setShowBookingModal(true);
    setShowTableActions(false);
  };

  // Save booking
  const handleSaveBooking = async () => {
    if (!bookingForm.customerName.trim() || !bookingForm.bookingDate || !bookingForm.bookingTime || !bookingTable) return;
    setSavingBooking(true);
    try {
      const data = {
        tableId: bookingTable.id,
        customerName: bookingForm.customerName.trim(),
        customerPhone: bookingForm.customerPhone.trim() || null,
        partySize: parseInt(bookingForm.partySize) || 2,
        bookingDate: bookingForm.bookingDate,
        bookingTime: bookingForm.bookingTime,
        notes: bookingForm.notes.trim() || null,
        status: 'confirmed',
      };
      const bookingRes = await apiClient.createBooking(selectedRestaurant.id, data);
      const createdBookingId = bookingRes?.booking?.id || bookingRes?.id || null;

      // Explicitly update table status via API so other devices see it
      apiClient.updateTableStatus(bookingTable.id, 'reserved', null, selectedRestaurant.id)
        .catch(err => console.warn('Table status update after booking failed:', err.message));

      // Optimistic: update local state immediately
      updateTableStatusOptimistically(bookingTable.id, 'reserved', null);
      const updateBookingTable = (t) =>
        t.id === bookingTable.id ? {
          ...t, status: 'reserved', customerName: data.customerName,
          reservationTime: data.bookingTime,
          bookingId: createdBookingId, // Store bookingId for check-in
        } : t;
      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables?.map(updateBookingTable) || [],
      })));
      setSelectedFloor(prev => {
        if (!prev) return prev;
        return { ...prev, tables: prev.tables?.map(updateBookingTable) || [] };
      });
      setShowBookingModal(false);
      setBookingTable(null);
      Alert.alert('Success', `Table ${bookingTable.name} booked for ${data.customerName}`);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create booking');
    } finally {
      setSavingBooking(false);
    }
  };

  // Generate time slots (10 AM to 11 PM, 30 min intervals)
  const getTimeSlots = () => {
    const slots = [];
    for (let h = 10; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour = h.toString().padStart(2, '0');
        const min = m.toString().padStart(2, '0');
        const label = `${h > 12 ? h - 12 : h}:${min} ${h >= 12 ? 'PM' : 'AM'}`;
        slots.push({ value: `${hour}:${min}`, label });
      }
    }
    return slots;
  };

  const renderFloorTab = ({ item: floor }) => {
    const isSelected = selectedFloor?.id === floor.id;
    const hasAreaCharge = floor.areaChargeType && floor.areaChargeType !== 'none' && floor.areaChargeValue > 0;
    return (
      <TouchableOpacity
        style={[styles.floorChip, isSelected && styles.floorChipSelected]}
        onPress={() => setSelectedFloor(floor)}
        onLongPress={() => isOwnerOrAdmin && openEditFloor(floor)}
      >
        <Ionicons
          name="layers-outline"
          size={r(14, 16)}
          color={isSelected ? '#fff' : Colors.textMedium}
        />
        <Text style={[styles.floorChipText, { fontSize: fs(13) }, isSelected && styles.floorChipTextSelected]}>
          {floor.name}
        </Text>
        {hasAreaCharge && (
          <Text style={[styles.areaChargeBadge, isSelected && styles.areaChargeBadgeSelected]}>
            +{floor.areaChargeType === 'percentage' ? `${floor.areaChargeValue}%` : `${getCurrencySymbol()}${floor.areaChargeValue}`}
          </Text>
        )}
        <View style={[styles.floorBadge, isSelected && styles.floorBadgeSelected]}>
          <Text style={[styles.floorBadgeText, isSelected && styles.floorBadgeTextSelected]}>
            {floor.tables?.length || 0}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAllChip = () => {
    const isSelected = selectedFloor === null;
    return (
      <TouchableOpacity
        style={[styles.floorChip, isSelected && styles.floorChipSelected]}
        onPress={() => setSelectedFloor(null)}
      >
        <Ionicons
          name="grid-outline"
          size={14}
          color={isSelected ? '#fff' : Colors.textMedium}
        />
        <Text style={[styles.floorChipText, isSelected && styles.floorChipTextSelected]}>
          All
        </Text>
        <View style={[styles.floorBadge, isSelected && styles.floorBadgeSelected]}>
          <Text style={[styles.floorBadgeText, isSelected && styles.floorBadgeTextSelected]}>
            {tables.length}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = getTableStats();
  // When selectedFloor is null ("All"), show all tables; otherwise show selected floor's tables
  // Dynamic parties (Path A): map each base table id → its sibling parties (B, C…), and keep the
  // siblings OUT of the standalone grid — they surface as compact chips on the base card instead.
  const partiesByBase = {};
  (tables || []).forEach((t) => {
    if (t.isPartyTable && t.partyOfTableId) {
      (partiesByBase[t.partyOfTableId] = partiesByBase[t.partyOfTableId] || []).push(t);
    }
  });
  Object.values(partiesByBase).forEach((arr) => arr.sort((a, b) => (a.partyLabel || '').localeCompare(b.partyLabel || '')));

  let currentFloorTables = (selectedFloor ? (selectedFloor.tables || []) : tables).filter((t) => !t.isPartyTable);

  // Sort tables: text-named tables first (alphabetically), then pure numbers (numerically)
  // Example: "Sofa", "apple sofa 1", "apple sofa 2", "banana table 1", then "1", "2", "3", "10"
  const sortTablesAlphabetically = (tables) => {
    return [...tables].sort((a, b) => {
      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      
      // Check if both are pure numbers (like "1", "2", "10")
      const isPureNumberA = /^\d+$/.test(nameA);
      const isPureNumberB = /^\d+$/.test(nameB);
      
      // If both are pure numbers, sort numerically (1, 2, 3, 10, 11, not 1, 10, 11, 2, 3)
      if (isPureNumberA && isPureNumberB) {
        return parseInt(nameA, 10) - parseInt(nameB, 10);
      }
      
      // If one is pure number and other has text, text comes first
      if (isPureNumberA && !isPureNumberB) {
        return 1; // Pure numbers come after text
      }
      if (!isPureNumberA && isPureNumberB) {
        return -1; // Text comes before numbers
      }
      
      // Both have text, extract text and number parts
      // Handles: "apple sofa 1" -> text: "apple sofa", number: 1
      // Handles: "Table 10" -> text: "Table", number: 10
      // Handles: "Sofa" -> text: "Sofa", number: 0
      const extractParts = (name) => {
        // Match text and trailing numbers (numbers at the end)
        const match = name.match(/^(.+?)\s*(\d+)$/);
        if (match) {
          const text = match[1].trim().toLowerCase();
          const number = parseInt(match[2], 10);
          return { text, number };
        }
        // No number found, just text
        return { text: name.toLowerCase(), number: 0 };
      };
      
      const partsA = extractParts(nameA);
      const partsB = extractParts(nameB);
      
      // First compare by text alphabetically
      const textCompare = partsA.text.localeCompare(partsB.text);
      if (textCompare !== 0) {
        return textCompare;
      }
      
      // If text is same, compare by number numerically
      return partsA.number - partsB.number;
    });
  };
  
  // Sort tables alphabetically
  currentFloorTables = sortTablesAlphabetically(currentFloorTables);

  // When showing all floors with multiple floors, group by floor order then sort within each group
  if (!selectedFloor && floors.length > 1) {
    const floorOrder = new Map(floors.map((f, i) => [f.id, i]));
    currentFloorTables = [...currentFloorTables].sort((a, b) => {
      const floorA = floorOrder.get(a._floorId) ?? 999;
      const floorB = floorOrder.get(b._floorId) ?? 999;
      if (floorA !== floorB) return floorA - floorB;
      return 0; // preserve alphabetical sort within floor
    });
  }

  // Filter and sort tables by selected status
  if (selectedStatus) {
    const filtered = currentFloorTables.filter(t => t.status === selectedStatus);
    const rest = currentFloorTables.filter(t => t.status !== selectedStatus);
    // Sort both groups alphabetically
    currentFloorTables = [...sortTablesAlphabetically(filtered), ...sortTablesAlphabetically(rest)];
  }

  // Floors to render in the view-only Floor Map: the selected floor, or all floors
  // when "All" is active — matching how the grid scopes tables.
  const mapFloors = selectedFloor ? [selectedFloor] : floors;
  const showFloorLabels = !selectedFloor && floors.length > 1;

  // Animated header compaction
  const compactStatsOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const compactStatsHeight = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [44, 0],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <View style={styles.brandIcon}>
            <Ionicons name="restaurant" size={20} color="#fff" />
          </View>
          <Text style={styles.restaurantName} numberOfLines={1}>{selectedRestaurant?.name || 'Restaurant'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {canResetTables && !(userRole === 'waiter' && waiterAppConfig.showResetTablesButton === false) && (
            <TouchableOpacity onPress={handleResetAllTables} style={[styles.headerActionBtn, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="refresh-circle-outline" size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
          {isOwnerOrAdmin && (
            <TouchableOpacity onPress={openAddTable} style={[styles.headerActionBtn, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="add" size={16} color="#3b82f6" />
            </TouchableOpacity>
          )}
          {!(userRole === 'waiter' && waiterAppConfig.showRefreshButton === false) && (
            <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={[styles.headerActionBtn, { backgroundColor: '#eef2ff' }]}>
              <Ionicons name="sync-outline" size={16} color="#6366f1" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Filter Chips */}
      <Animated.View style={{ opacity: compactStatsOpacity, maxHeight: compactStatsHeight, overflow: 'hidden' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChipsRow}>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'available' && styles.statusChipActiveGreen]}
          onPress={() => setSelectedStatus(selectedStatus === 'available' ? null : 'available')}
        >
          <View style={[styles.statusChipDot, { backgroundColor: '#16a34a' }]} />
          <Text style={[styles.statusChipLabel, selectedStatus === 'available' && styles.statusChipLabelActive]}>Available</Text>
          <Text style={[styles.statusChipCount, selectedStatus === 'available' && styles.statusChipCountActive]}>{stats.available}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'occupied' && styles.statusChipActiveOrange]}
          onPress={() => setSelectedStatus(selectedStatus === 'occupied' ? null : 'occupied')}
        >
          <View style={[styles.statusChipDot, { backgroundColor: '#ea580c' }]} />
          <Text style={[styles.statusChipLabel, selectedStatus === 'occupied' && styles.statusChipLabelActive]}>Occupied</Text>
          <Text style={[styles.statusChipCount, selectedStatus === 'occupied' && styles.statusChipCountActive]}>{stats.occupied}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statusChip, selectedStatus === 'reserved' && styles.statusChipActivePurple]}
          onPress={() => setSelectedStatus(selectedStatus === 'reserved' ? null : 'reserved')}
        >
          <View style={[styles.statusChipDot, { backgroundColor: '#9333ea' }]} />
          <Text style={[styles.statusChipLabel, selectedStatus === 'reserved' && styles.statusChipLabelActive]}>Reserved</Text>
          <Text style={[styles.statusChipCount, selectedStatus === 'reserved' && styles.statusChipCountActive]}>{stats.reserved}</Text>
        </TouchableOpacity>
      </ScrollView>
      </Animated.View>

      {/* Floor Selector */}
      {(floors.length > 0 || isOwnerOrAdmin) && (
        <View style={styles.floorSelector}>
          <FlatList
            horizontal
            data={floors}
            renderItem={renderFloorTab}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorChipsContainer}
            ListHeaderComponent={floors.length > 1 ? renderAllChip : null}
            ListFooterComponent={isOwnerOrAdmin ? (
              <TouchableOpacity style={styles.addFloorChip} onPress={openAddFloor}>
                <Ionicons name="add" size={16} color="#9ca3af" />
              </TouchableOpacity>
            ) : null}
          />
        </View>
      )}

      {/* Grid / Floor Map view toggle */}
      <View style={styles.viewToggleRow}>
        <View style={styles.viewToggle}>
          {[{ k: 'grid', icon: 'grid-outline', label: 'Grid' }, { k: 'floor', icon: 'map-outline', label: 'Floor Map' }].map(v => (
            <TouchableOpacity key={v.k} onPress={() => setViewMode(v.k)} style={[styles.viewToggleBtn, viewMode === v.k && styles.viewToggleBtnActive]}>
              <Ionicons name={v.icon} size={13} color={viewMode === v.k ? '#111827' : '#9ca3af'} />
              <Text style={[styles.viewToggleText, viewMode === v.k && styles.viewToggleTextActive]}>{v.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Tables Grid */}
      {viewMode === 'grid' ? (
      <Animated.FlatList
        data={currentFloorTables}
        renderItem={renderTable}
        keyExtractor={(item) => item.id}
        key={`tables-grid-${cols}`}
        numColumns={cols}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        onScroll={(e) => {
          const y = e.nativeEvent.contentOffset.y;
          scrollY.setValue(y);
          tabBar?.handleScroll(y);
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.tablesGrid, { paddingHorizontal: r(10, 16) }]}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={[styles.tableRow, { gap: r(6, 10) }]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No tables found</Text>
            <Text style={styles.emptySubtext}>
              {isOwnerOrAdmin ? 'Tap + to add tables' : 'Pull down to refresh'}
            </Text>
            {isOwnerOrAdmin && (
              <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddTable}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyAddBtnText}>Add Tables</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
      ) : (
        <Animated.ScrollView
          onScroll={(e) => { const y = e.nativeEvent.contentOffset.y; scrollY.setValue(y); tabBar?.handleScroll(y); }}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {mapFloors.map((f) => (
            <View key={f.id}>
              {showFloorLabels && <Text style={styles.floorMapLabel}>{f.name}</Text>}
              <TableFloorPlanNative
                floor={f}
                tables={f.tables || []}
                statusColor={getTableStatusColors}
                formatCurrency={formatCurrency}
                onTablePress={handleTablePress}
              />
            </View>
          ))}
          {mapFloors.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
              <Text style={styles.emptyText}>No tables found</Text>
            </View>
          )}
        </Animated.ScrollView>
      )}

      {/* Order Details Modal */}
      <OrderDetailsModal
        visible={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setSelectedOrderId(null);
          setSelectedTableForOrder(null);
          setOrderModalMode('view');
        }}
        orderId={selectedOrderId}
        tableNumber={selectedTableForOrder?.name}
        restaurantId={selectedRestaurant?.id}
        userRole={user?.role}
        billingSettings={selectedRestaurant?.billingSettings || {}}
        onAddItems={handleAddItemsToOrder}
        onPrintPreBill={handlePrintPreBill}
        onCompleteBill={async (order, settlementData = {}) => {
          // Complete the bill inline — no navigation, no duplicate confirmations.
          // settlementData carries the cashier's settle-time choices (payment method, tender,
          // split, tip, khata) from OrderDetailsModal — web parity for table settlement.
          const tableForOrder = selectedTableForOrder;
          const rid = selectedRestaurant?.id;
          const sd = settlementData || {};
          const settleMethod = sd.paymentMethod || order.paymentMethod || 'cash';
          const settleFinal = (sd.finalAmount != null) ? sd.finalAmount : (order.finalAmount || order.totalAmount || 0);
          // Close the modal immediately for a snappy feel
          setShowOrderModal(false);

          // Optimistic: mark the table available right away
          if (tableForOrder?.id) {
            updateTableStatusOptimistically(tableForOrder.id, 'available', null);
          }

          try {
            // Build full update payload matching web's DashboardTablesPanel flow
            // so the backend can update customer stats (totalOrders, totalSpent, loyaltyPoints)
            const updateData = {
              status: 'completed',
              paymentStatus: sd.paymentStatus || (order.paymentStatus === 'partial' ? 'partial' : 'paid'),
              paymentMethod: settleMethod,
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              // Settle-time payment details (web parity)
              ...(sd.splitPayments ? { splitPayments: sd.splitPayments } : {}),
              ...(sd.cashReceived != null ? { cashReceived: sd.cashReceived } : {}),
              ...(sd.changeReturned != null ? { changeReturned: sd.changeReturned } : {}),
              ...(sd.tipAmount != null ? { tipAmount: sd.tipAmount, ...(sd.tipPercentage != null ? { tipPercentage: sd.tipPercentage } : {}) } : {}),
              ...(sd.partialPayAmount != null ? { partialPayAmount: sd.partialPayAmount } : {}),
              ...(sd.paidAmount != null ? { paidAmount: sd.paidAmount } : {}),
              ...(sd.outstandingAmount != null ? { outstandingAmount: sd.outstandingAmount } : {}),
              // Preserve existing amounts (tip may raise finalAmount)
              ...(order.totalAmount && { totalAmount: order.totalAmount }),
              ...((sd.finalAmount != null || order.finalAmount) && { finalAmount: settleFinal }),
              ...(order.taxAmount && { taxAmount: order.taxAmount }),
              ...(order.taxBreakdown && { taxBreakdown: order.taxBreakdown }),
              // Customer data — critical for customer stats update
              customerId: order.customerId || null,
              customerInfo: {
                name: order.customerInfo?.name || '',
                phone: order.customerInfo?.phone || order.customerInfo?.mobile || order.customerPhone || null,
                tableNumber: order.tableNumber || tableForOrder?.name || null,
              },
              ...(order.customerPhone && { customerPhone: order.customerPhone }),
              // Loyalty data
              ...(order.redeemLoyaltyPoints > 0 && { redeemLoyaltyPoints: order.redeemLoyaltyPoints }),
              ...(order.loyaltyDiscount > 0 && { loyaltyDiscount: order.loyaltyDiscount }),
              // Discount/offer data
              ...(order.discountAmount > 0 && { discountAmount: order.discountAmount }),
              ...(order.manualDiscount > 0 && { manualDiscount: order.manualDiscount }),
              ...(order.offerIds?.length > 0 && { offerIds: order.offerIds }),
              ...(order.selectedOfferName && { selectedOfferName: order.selectedOfferName }),
              // Billing fields (tip handled above from settlementData)
              ...(order.serviceChargeAmount > 0 && { serviceChargeAmount: order.serviceChargeAmount, serviceChargeRate: order.serviceChargeRate }),
              ...(sd.tipAmount == null && order.tipAmount > 0 && { tipAmount: order.tipAmount }),
              ...(order.roundOffAmount && { roundOffAmount: order.roundOffAmount }),
              // Staff tracking
              lastUpdatedBy: {
                name: user?.name || 'Staff',
                id: user?.id,
                role: user?.role || 'waiter',
              },
            };

            await apiClient.updateOrder(order.id, updateData);

            // Auto-print bill silently (fire and forget)
            autoPrintBill({ ...order, completedAt: new Date().toISOString() });

            // Verify payment (same as web flow)
            try {
              await apiClient.verifyPayment({
                orderId: order.id,
                paymentMethod: settleMethod,
                amount: settleFinal,
                userId: user?.id,
                restaurantId: rid,
                paymentStatus: 'completed',
              });
            } catch (_) {}

            // Free the table on the server — await so failures surface
            if (tableForOrder?.id) {
              try {
                await apiClient.updateTableStatus(tableForOrder.id, 'available', null, rid);
              } catch (e) {
                console.warn('Table status update failed:', e?.message);
              }
            }
            // Refresh tables from server so local state reflects authoritative truth
            if (rid) {
              try { loadFloorsAndTables(rid); } catch (_) {}
            }
            // Non-blocking toast on Android; silent on iOS
            try {
              const { ToastAndroid, Platform } = require('react-native');
              if (Platform.OS === 'android') {
                ToastAndroid.show(
                  `Billing complete • Table ${tableForOrder?.name || ''}`.trim(),
                  ToastAndroid.SHORT
                );
              }
            } catch (_) {}
            // Cleanup selection state
            setSelectedOrderId(null);
            setSelectedTableForOrder(null);
          } catch (err) {
            // Revert optimistic state on failure
            if (tableForOrder?.id) {
              updateTableStatusOptimistically(tableForOrder.id, 'occupied', order.id);
            }
            Alert.alert('Error', err?.message || 'Failed to complete billing.');
          }
        }}
      />

      {/* Move Order Modal */}
      <MoveOrderModal
        visible={!!moveModalTable}
        onClose={() => setMoveModalTable(null)}
        sourceTable={moveModalTable}
        floors={floors}
        restaurantId={selectedRestaurant?.id}
        onMoveComplete={(oldId, newId) => {
          updateTableStatusOptimistically(oldId, 'available', null);
          updateTableStatusOptimistically(newId, 'occupied', moveModalTable?.currentOrderId);
          setMoveModalTable(null);
        }}
      />

      {/* Waiter Order Modal — self-contained menu + cart (replaces tab navigation for waiter) */}
      <WaiterOrderModal
        visible={showWaiterOrderModal}
        onClose={() => { setShowWaiterOrderModal(false); setWaiterOrderContext(null); }}
        tableId={waiterOrderContext?.tableId}
        tableNumber={waiterOrderContext?.tableNumber}
        floorName={waiterOrderContext?.floorName}
        floorId={waiterOrderContext?.floorId}
        existingOrderId={waiterOrderContext?.existingOrderId}
        posSettings={posSettings}
        onOrderSent={() => {
          setShowWaiterOrderModal(false);
          setWaiterOrderContext(null);
          if (selectedRestaurant?.id) refreshInBackground(selectedRestaurant.id);
        }}
      />

      {/* Floor Add/Edit Modal */}
      <Modal
        visible={showFloorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFloorModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.floorModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.floorModalCard}>
            <Text style={styles.floorModalTitle}>
              {editingFloor ? 'Edit Floor' : 'Add Floor'}
            </Text>

            <View style={styles.floorFormField}>
              <Text style={styles.floorFormLabel}>Floor Name *</Text>
              <TextInput
                style={styles.floorFormInput}
                value={floorForm.name}
                onChangeText={(v) => setFloorForm({ ...floorForm, name: v })}
                placeholder="e.g., Rooftop, AC Hall, Garden"
                placeholderTextColor={Colors.textLight}
                autoFocus={!editingFloor}
              />
            </View>

            <View style={styles.floorFormField}>
              <Text style={styles.floorFormLabel}>Description</Text>
              <TextInput
                style={styles.floorFormInput}
                value={floorForm.description}
                onChangeText={(v) => setFloorForm({ ...floorForm, description: v })}
                placeholder="Optional description"
                placeholderTextColor={Colors.textLight}
              />
            </View>

            {/* Area Charge */}
            <View style={styles.floorFormField}>
              <Text style={styles.floorFormLabel}>Area Charge</Text>
              <View style={styles.chargeTypeRow}>
                {[
                  { value: 'none', label: 'No charge' },
                  { value: 'percentage', label: '% Percent' },
                  { value: 'flat', label: `${getCurrencySymbol()} Flat` },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.chargeTypeBtn,
                      floorForm.areaChargeType === opt.value && styles.chargeTypeBtnActive,
                    ]}
                    onPress={() => setFloorForm({
                      ...floorForm,
                      areaChargeType: opt.value,
                      areaChargeValue: opt.value === 'none' ? '' : floorForm.areaChargeValue,
                    })}
                  >
                    <Text style={[
                      styles.chargeTypeBtnText,
                      floorForm.areaChargeType === opt.value && styles.chargeTypeBtnTextActive,
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {floorForm.areaChargeType !== 'none' && (
                <TextInput
                  style={[styles.floorFormInput, { marginTop: 8 }]}
                  value={floorForm.areaChargeValue}
                  onChangeText={(v) => setFloorForm({ ...floorForm, areaChargeValue: v })}
                  placeholder={floorForm.areaChargeType === 'percentage' ? 'e.g., 10 (for 10%)' : `e.g., 50 (${getCurrencySymbol()}50 flat)`}
                  placeholderTextColor={Colors.textLight}
                  keyboardType="decimal-pad"
                />
              )}
              <Text style={styles.floorFormHint}>Extra charge applied to all orders on this floor</Text>
            </View>

            <View style={styles.floorModalActions}>
              {editingFloor && (
                <TouchableOpacity
                  style={styles.floorDeleteBtn}
                  onPress={handleDeleteFloor}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.floorModalCancel, !editingFloor && { flex: 1 }]}
                onPress={() => { setShowFloorModal(false); setEditingFloor(null); }}
              >
                <Text style={styles.floorModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.floorModalSave, (!floorForm.name.trim() || savingFloor) && { opacity: 0.5 }]}
                onPress={handleSaveFloor}
                disabled={!floorForm.name.trim() || savingFloor}
              >
                {savingFloor ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.floorModalSaveText}>
                    {editingFloor ? 'Update' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Table Modal */}
      <Modal
        visible={showAddTableModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTableModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.floorModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.floorModalCard, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.floorModalTitle}>Add Tables</Text>
              <TouchableOpacity onPress={() => setShowAddTableModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMedium} />
              </TouchableOpacity>
            </View>

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, addTableMode === 'single' && styles.modeBtnActive]}
                onPress={() => setAddTableMode('single')}
              >
                <Text style={[styles.modeBtnText, addTableMode === 'single' && styles.modeBtnTextActive]}>Single</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, addTableMode === 'bulk' && styles.modeBtnActive]}
                onPress={() => setAddTableMode('bulk')}
              >
                <Text style={[styles.modeBtnText, addTableMode === 'bulk' && styles.modeBtnTextActive]}>Bulk</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Floor selector */}
              <View style={styles.floorFormField}>
                <Text style={styles.floorFormLabel}>Floor *</Text>
                {floors.length === 0 && !showInlineFloorInput ? (
                  <View style={{ marginTop: 6, backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="warning-outline" size={16} color="#d97706" />
                    <Text style={{ fontSize: 13, color: '#92400e', flex: 1 }}>No floors yet. Create a floor first to add tables.</Text>
                  </View>
                ) : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {floors.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[
                          styles.floorPickChip,
                          (addTableMode === 'single' ? tableForm.floor : bulkForm.floor) === f.name && styles.floorPickChipActive,
                        ]}
                        onPress={() => {
                          if (addTableMode === 'single') {
                            setTableForm({ ...tableForm, floor: f.name });
                          } else {
                            setBulkForm({ ...bulkForm, floor: f.name });
                          }
                        }}
                      >
                        <Text style={[
                          styles.floorPickChipText,
                          (addTableMode === 'single' ? tableForm.floor : bulkForm.floor) === f.name && styles.floorPickChipTextActive,
                        ]}>{f.name}</Text>
                      </TouchableOpacity>
                    ))}
                    {/* + New Floor chip */}
                    <TouchableOpacity
                      style={[styles.floorPickChip, { borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 4 }]}
                      onPress={() => { setShowInlineFloorInput(true); setInlineFloorName(''); }}
                    >
                      <Ionicons name="add" size={14} color="#6b7280" />
                      <Text style={styles.floorPickChipText}>New Floor</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
                {/* Inline floor creation input */}
                {showInlineFloorInput && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <TextInput
                      style={[styles.floorFormInput, { flex: 1, marginBottom: 0 }]}
                      value={inlineFloorName}
                      onChangeText={setInlineFloorName}
                      placeholder="e.g., Ground Floor, Terrace"
                      placeholderTextColor={Colors.textLight}
                      autoFocus
                      onSubmitEditing={handleInlineFloorCreate}
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: savingInlineFloor ? '#d1d5db' : Colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 }}
                      onPress={handleInlineFloorCreate}
                      disabled={!inlineFloorName.trim() || savingInlineFloor}
                    >
                      {savingInlineFloor ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Add</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ padding: 8 }}
                      onPress={() => { setShowInlineFloorInput(false); setInlineFloorName(''); }}
                    >
                      <Ionicons name="close" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {addTableMode === 'single' ? (
                <>
                  <View style={styles.floorFormField}>
                    <Text style={styles.floorFormLabel}>Table Name *</Text>
                    <TextInput
                      style={styles.floorFormInput}
                      value={tableForm.name}
                      onChangeText={(v) => setTableForm({ ...tableForm, name: v })}
                      placeholder="e.g., T1, VIP 1, Sofa"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>
                  <View style={styles.floorFormField}>
                    <Text style={styles.floorFormLabel}>Capacity (seats)</Text>
                    <TextInput
                      style={styles.floorFormInput}
                      value={tableForm.capacity}
                      onChangeText={(v) => setTableForm({ ...tableForm, capacity: v })}
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>
                  <View style={styles.floorFormField}>
                    <Text style={styles.floorFormLabel}>Table Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[
                          { value: 'small', label: 'Small (1-2)' },
                          { value: 'regular', label: 'Regular' },
                          { value: 'large', label: 'Large (5-8)' },
                          { value: 'vip', label: 'VIP' },
                        ].map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.floorPickChip, tableForm.type === opt.value && styles.floorPickChipActive]}
                            onPress={() => setTableForm({ ...tableForm, type: opt.value })}
                          >
                            <Text style={[styles.floorPickChipText, tableForm.type === opt.value && styles.floorPickChipTextActive]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.floorFormField, { flex: 1 }]}>
                      <Text style={styles.floorFormLabel}>From #</Text>
                      <TextInput
                        style={styles.floorFormInput}
                        value={bulkForm.fromNumber}
                        onChangeText={(v) => setBulkForm({ ...bulkForm, fromNumber: v })}
                        keyboardType="number-pad"
                        placeholder="1"
                        placeholderTextColor={Colors.textLight}
                      />
                    </View>
                    <View style={[styles.floorFormField, { flex: 1 }]}>
                      <Text style={styles.floorFormLabel}>To #</Text>
                      <TextInput
                        style={styles.floorFormInput}
                        value={bulkForm.toNumber}
                        onChangeText={(v) => setBulkForm({ ...bulkForm, toNumber: v })}
                        keyboardType="number-pad"
                        placeholder="10"
                        placeholderTextColor={Colors.textLight}
                      />
                    </View>
                  </View>
                  <View style={styles.floorFormField}>
                    <Text style={styles.floorFormLabel}>Capacity per table</Text>
                    <TextInput
                      style={styles.floorFormInput}
                      value={bulkForm.capacity}
                      onChangeText={(v) => setBulkForm({ ...bulkForm, capacity: v })}
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>
                  {bulkForm.fromNumber && bulkForm.toNumber && parseInt(bulkForm.fromNumber) <= parseInt(bulkForm.toNumber) && (
                    <View style={styles.bulkPreview}>
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                      <Text style={styles.bulkPreviewText}>
                        Will create {parseInt(bulkForm.toNumber) - parseInt(bulkForm.fromNumber) + 1} tables ({bulkForm.fromNumber} - {bulkForm.toNumber})
                      </Text>
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.floorModalActions}>
              <TouchableOpacity
                style={styles.floorModalCancel}
                onPress={() => setShowAddTableModal(false)}
              >
                <Text style={styles.floorModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.floorModalSave, savingTable && { opacity: 0.5 }]}
                onPress={addTableMode === 'single' ? handleSaveTable : handleBulkCreate}
                disabled={savingTable || (addTableMode === 'single' ? !tableForm.name.trim() : !bulkForm.fromNumber || !bulkForm.toNumber)}
              >
                {savingTable ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.floorModalSaveText}>
                    {addTableMode === 'single' ? 'Add Table' : 'Create All'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Android Table Actions Modal */}
      {Platform.OS !== 'ios' && (
        <Modal
          visible={showTableActions}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTableActions(false)}
        >
          <TouchableOpacity
            style={styles.actionSheetOverlay}
            activeOpacity={1}
            onPress={() => setShowTableActions(false)}
          >
            <View style={styles.actionSheetCard}>
              <Text style={styles.actionSheetTitle}>Table {actionTable?.name}</Text>
              <Text style={styles.actionSheetSubtitle}>
                {actionTable?.status} | {actionTable?.capacity || 4} seats
              </Text>

              {actionTable?.status === 'available' && (
                <>
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleTablePress(actionTable); }}>
                    <Ionicons name="restaurant" size={20} color="#16a34a" />
                    <Text style={styles.actionSheetBtnText}>Take Order</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); openBookingForm(actionTable); }}>
                    <Ionicons name="calendar" size={20} color="#d97706" />
                    <Text style={styles.actionSheetBtnText}>Book Table</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* New Party — another independent check on this table (base stays Party A). */}
              {actionTable && !actionTable.isSubTable && !actionTable.isPartyTable && !actionTable.isSplit && !actionTable.mergeGroupId && !actionTable.mergedInto
                && ['available', 'occupied', 'cleaning'].includes(actionTable.status || 'available') && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => handleAddParty(actionTable)}>
                  <Ionicons name="people" size={20} color="#7c3aed" />
                  <Text style={styles.actionSheetBtnText}>New Party</Text>
                </TouchableOpacity>
              )}

              {actionTable?.status === 'reserved' && (actionTable?.bookingId || actionTable?.reservationId) && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleCheckInBooking(actionTable); }}>
                  <Ionicons name="log-in-outline" size={20} color="#059669" />
                  <Text style={styles.actionSheetBtnText}>Check In</Text>
                </TouchableOpacity>
              )}

              {actionTable?.status !== 'available' && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleChangeStatus(actionTable, 'available'); }}>
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                  <Text style={styles.actionSheetBtnText}>Mark Available</Text>
                </TouchableOpacity>
              )}

              {actionTable?.status === 'occupied' && actionTable?.currentOrderId && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleViewOrder(actionTable); }}>
                  <Ionicons name="eye" size={20} color="#3b82f6" />
                  <Text style={styles.actionSheetBtnText}>View Order</Text>
                </TouchableOpacity>
              )}

              {posSettings.moveOrderEnabled && actionTable?.status === 'occupied' && actionTable?.currentOrderId && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => {
                  setShowTableActions(false);
                  const tableFloor = getFloorForTable(actionTable);
                  setMoveModalTable({
                    id: actionTable.id, name: actionTable.name, currentOrderId: actionTable.currentOrderId,
                    floorId: tableFloor?.id || null, floorName: tableFloor?.name || '',
                  });
                }}>
                  <Ionicons name="swap-horizontal" size={20} color="#8b5cf6" />
                  <Text style={styles.actionSheetBtnText}>Move Order</Text>
                </TouchableOpacity>
              )}

              {actionTable?.status !== 'out-of-service' && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleChangeStatus(actionTable, 'out-of-service'); }}>
                  <Ionicons name="build" size={20} color="#7c3aed" />
                  <Text style={styles.actionSheetBtnText}>Mark Out of Service</Text>
                </TouchableOpacity>
              )}

              {actionTable?.status !== 'cleaning' && (
                <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowTableActions(false); handleChangeStatus(actionTable, 'cleaning'); }}>
                  <Ionicons name="water" size={20} color="#3b82f6" />
                  <Text style={styles.actionSheetBtnText}>Mark Cleaning</Text>
                </TouchableOpacity>
              )}

              {isOwnerOrAdmin && (
                <TouchableOpacity style={[styles.actionSheetBtn, { borderTopWidth: 1, borderTopColor: '#fee2e2' }]} onPress={() => { setShowTableActions(false); handleDeleteTable(actionTable); }}>
                  <Ionicons name="trash" size={20} color="#dc2626" />
                  <Text style={[styles.actionSheetBtnText, { color: '#dc2626' }]}>Delete Table</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionSheetBtn, { backgroundColor: '#f5f5f5', borderRadius: 10, marginTop: 8 }]}
                onPress={() => setShowTableActions(false)}
              >
                <Text style={[styles.actionSheetBtnText, { textAlign: 'center', color: Colors.textMedium }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Booking Modal */}
      <Modal
        visible={showBookingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookingModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.floorModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.floorModalCard, { maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.floorModalTitle}>
                Book Table {bookingTable?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowBookingModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textMedium} />
              </TouchableOpacity>
            </View>

            {bookingTable && (
              <View style={styles.bookingTableInfo}>
                <Ionicons name="restaurant" size={16} color={Colors.primary} />
                <Text style={styles.bookingTableInfoText}>
                  {bookingTable.name} - {bookingTable.capacity || 4} seats
                </Text>
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.floorFormField}>
                <Text style={styles.floorFormLabel}>Customer Name *</Text>
                <TextInput
                  style={styles.floorFormInput}
                  value={bookingForm.customerName}
                  onChangeText={(v) => setBookingForm({ ...bookingForm, customerName: v })}
                  placeholder="Customer name"
                  placeholderTextColor={Colors.textLight}
                  autoFocus
                />
              </View>

              <View style={styles.floorFormField}>
                <Text style={styles.floorFormLabel}>Phone</Text>
                <TextInput
                  style={styles.floorFormInput}
                  value={bookingForm.customerPhone}
                  onChangeText={(v) => setBookingForm({ ...bookingForm, customerPhone: v })}
                  placeholder="+91 9876543210"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.floorFormField, { flex: 1 }]}>
                  <Text style={styles.floorFormLabel}>Date *</Text>
                  <TextInput
                    style={styles.floorFormInput}
                    value={bookingForm.bookingDate}
                    onChangeText={(v) => setBookingForm({ ...bookingForm, bookingDate: v })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textLight}
                  />
                </View>
                <View style={[styles.floorFormField, { flex: 1 }]}>
                  <Text style={styles.floorFormLabel}>Party Size</Text>
                  <TextInput
                    style={styles.floorFormInput}
                    value={bookingForm.partySize}
                    onChangeText={(v) => setBookingForm({ ...bookingForm, partySize: v })}
                    keyboardType="number-pad"
                    placeholder="2"
                    placeholderTextColor={Colors.textLight}
                  />
                </View>
              </View>

              {/* Time Slots */}
              <View style={styles.floorFormField}>
                <Text style={styles.floorFormLabel}>Time *</Text>
                <View style={styles.timeSlotsGrid}>
                  {getTimeSlots().map(slot => (
                    <TouchableOpacity
                      key={slot.value}
                      style={[
                        styles.timeSlot,
                        bookingForm.bookingTime === slot.value && styles.timeSlotActive,
                      ]}
                      onPress={() => setBookingForm({ ...bookingForm, bookingTime: slot.value })}
                    >
                      <Text style={[
                        styles.timeSlotText,
                        bookingForm.bookingTime === slot.value && styles.timeSlotTextActive,
                      ]}>
                        {slot.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.floorFormField}>
                <Text style={styles.floorFormLabel}>Notes</Text>
                <TextInput
                  style={[styles.floorFormInput, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={bookingForm.notes}
                  onChangeText={(v) => setBookingForm({ ...bookingForm, notes: v })}
                  placeholder="Special requests..."
                  placeholderTextColor={Colors.textLight}
                  multiline
                />
              </View>
            </ScrollView>

            <View style={styles.floorModalActions}>
              <TouchableOpacity
                style={styles.floorModalCancel}
                onPress={() => setShowBookingModal(false)}
              >
                <Text style={styles.floorModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.floorModalSave,
                  { backgroundColor: '#d97706' },
                  (!bookingForm.customerName.trim() || !bookingForm.bookingDate || !bookingForm.bookingTime || savingBooking) && { opacity: 0.5 },
                ]}
                onPress={handleSaveBooking}
                disabled={!bookingForm.customerName.trim() || !bookingForm.bookingDate || !bookingForm.bookingTime || savingBooking}
              >
                {savingBooking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.floorModalSaveText}>Confirm Booking</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    flex: 1,
  },
  statusChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: '#fff',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#f0f0f0',
  },
  statusChipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusChipLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textMedium,
  },
  statusChipLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  statusChipCount: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statusChipCountActive: {
    color: '#fff',
  },
  statusChipActiveGreen: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  statusChipActiveOrange: {
    backgroundColor: '#ea580c',
    borderColor: '#ea580c',
  },
  statusChipActivePurple: {
    backgroundColor: '#9333ea',
    borderColor: '#9333ea',
  },
  floorSelector: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  viewToggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 2,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: '#fff',
  },
  viewToggleText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  viewToggleTextActive: { color: '#111827' },
  floorMapLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  floorChipsContainer: {
    paddingHorizontal: 14,
    paddingRight: 24,
    gap: 8,
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  floorChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  floorChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  floorChipTextSelected: {
    color: '#fff',
  },
  floorBadge: {
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 18,
    alignItems: 'center',
  },
  floorBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  floorBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textDark,
  },
  floorBadgeTextSelected: {
    color: '#fff',
  },
  tablesGrid: {
    padding: 8,
    paddingBottom: 120,
  },
  tableRow: {
    justifyContent: 'space-between',
    gap: 6,
  },
  tableCard: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  tableCardAvailable: {
    backgroundColor: '#fff',
    borderColor: '#d1fae5',
  },
  tableCardOccupied: {
    backgroundColor: '#fffbeb',
    borderColor: '#fed7aa',
  },
  tableCardReserved: {
    backgroundColor: '#faf5ff',
    borderColor: '#ddd6fe',
  },
  tableCardCleaning: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  tableCardOutOfService: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  cardInner: {
    flex: 1,
    padding: 12,
  },
  statusBar: {
    height: 3,
    backgroundColor: '#e5e7eb',
  },
  statusBarGreen: { backgroundColor: '#22c55e' },
  statusBarOrange: { backgroundColor: '#f97316' },
  statusBarPurple: { backgroundColor: '#a855f7' },
  statusBarBlue: { backgroundColor: '#3b82f6' },
  statusBarGrey: { backgroundColor: '#9ca3af' },
  statusDotInline: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  tableContent: {
    flex: 1,
  },
  tableNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: -0.2,
    flex: 1,
  },
  tableNumberDisabled: {
    color: '#9ca3af',
  },
  floorLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#6b7280',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusBadgeOccupied: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#fed7aa',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeReserved: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#e9d5ff',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeCleaning: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeOutOfService: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 0.3,
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  seatsText: {
    fontSize: 12,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  seatsTextDisabled: {
    color: '#9ca3af',
  },
  tableActions: {
    marginTop: 8,
  },
  takeOrderButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  takeOrderButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  occupiedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
  },
  outOfServiceButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  outOfServiceButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },
  reservedInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(147, 51, 234, 0.08)',
    borderRadius: 8,
  },
  reservedInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9333ea',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMedium,
  },
  // Area charge badge on floor chip
  areaChargeBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#ea580c',
    backgroundColor: '#fff7ed',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  areaChargeBadgeSelected: {
    color: '#fff',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  // Add floor chip
  addFloorChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Floor modal
  floorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  floorModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    gap: 14,
  },
  floorModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  floorFormField: {
    gap: 6,
  },
  floorFormLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  floorFormInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: Colors.textDark,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  floorFormHint: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
  },
  chargeTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  chargeTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  chargeTypeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  chargeTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  chargeTypeBtnTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  floorModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  floorDeleteBtn: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  floorModalCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  floorModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  floorModalSave: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  floorModalSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  // Header action button
  headerActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Empty state add button
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  emptyAddBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 3,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  modeBtnTextActive: {
    color: Colors.textDark,
  },
  // Floor picker chip
  floorPickChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  floorPickChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  floorPickChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  floorPickChipTextActive: {
    color: Colors.primary,
  },
  // Bulk preview
  bulkPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  bulkPreviewText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  // Action sheet (Android)
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
  },
  actionSheetSubtitle: {
    fontSize: 13,
    color: Colors.textMedium,
    textAlign: 'center',
    marginBottom: 12,
  },
  actionSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  actionSheetBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  // Booking
  bookingTableInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '10',
    padding: 10,
    borderRadius: 8,
  },
  bookingTableInfoText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  timeSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  timeSlot: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  timeSlotActive: {
    borderColor: '#d97706',
    backgroundColor: '#fffbeb',
  },
  timeSlotText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  timeSlotTextActive: {
    color: '#d97706',
  },
});
