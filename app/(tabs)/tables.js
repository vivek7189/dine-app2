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
  Easing,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Pusher from 'pusher-js/react-native';
import apiClient from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { getCached, setCache } from '../../services/cacheManager';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import OrderDetailsModal from '../../components/OrderDetailsModal';
// SyncIndicator moved to settings page
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { canPerform } from '../../utils/permissions';
import { useTabBar } from '../../contexts/TabBarContext';

const PUSHER_KEY = process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec';
const PUSHER_CLUSTER = 'ap2';

export default function TablesScreen() {
  const router = useRouter();
  const { effectivelyOffline } = useOffline();
  const tabBar = useTabBar();
  const params = useLocalSearchParams();
  const { gridColumns, r } = useResponsive();
  const cols = gridColumns();
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [user, setUser] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
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
  const [updatingTables, setUpdatingTables] = useState(new Set()); // tables with pending status change
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const isInitialLoadRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const restaurantIdRef = useRef(null);
  const lastProcessedTableParamRef = useRef(null);

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

  // Pulse animation for tables being updated
  useEffect(() => {
    if (updatingTables.size > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [updatingTables.size]);

  // Memoize loadFloorsAndTables to prevent recreation
  const loadFloorsAndTables = useCallback(async (restaurantId) => {
    // Prevent multiple simultaneous calls
    if (isRefreshingRef.current) {
      return;
    }
    
    try {
      isRefreshingRef.current = true;
      const response = await apiClient.getFloors(restaurantId);

      let floorsData = [];
      if (response.floors) {
        floorsData = response.floors;
      } else if (Array.isArray(response)) {
        floorsData = response;
      }

      setFloors(floorsData);

      const allTables = floorsData.flatMap(floor => floor.tables || []);
      setTables(allTables);

      // Keep selectedFloor in sync so currentFloorTables reflects new data
      setSelectedFloor(prev => {
        if (prev) {
          const updatedFloor = floorsData.find(f => f.id === prev.id);
          return updatedFloor || null;
        }
        return prev;
      });

      // Save to cache for stale-while-revalidate
      const rid = restaurantIdRef.current;
      if (rid) {
        setCache('cache_floors_' + rid, { floors: floorsData, tables: allTables });
      }
    } catch (error) {
      console.error('Error loading floors:', error);
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Optimistically update table status
  const updateTableStatusOptimistically = useCallback((tableId, status, orderId) => {
    // Convert tableId to string for comparison (params come as strings)
    const tableIdStr = String(tableId);

    // Mark table as updating (shows pulse animation)
    setUpdatingTables(prev => new Set(prev).add(tableIdStr));

    setFloors(prevFloors => {
      return prevFloors.map(floor => ({
        ...floor,
        tables: floor.tables?.map(table => {
          if (String(table.id) === tableIdStr) {
            return {
              ...table,
              status: status,
              currentOrderId: status === 'available' ? null : (orderId || table.currentOrderId),
              lastOrderTime: status === 'occupied' ? new Date().toISOString() : table.lastOrderTime,
            };
          }
          return table;
        }) || [],
      }));
    });

    setTables(prevTables => {
      return prevTables.map(table => {
        if (String(table.id) === tableIdStr) {
          return {
            ...table,
            status: status,
            currentOrderId: status === 'available' ? null : (orderId || table.currentOrderId),
            lastOrderTime: status === 'occupied' ? new Date().toISOString() : table.lastOrderTime,
          };
        }
        return table;
      });
    });

    // Keep selectedFloor in sync
    const updateTable = (table) => {
      if (String(table.id) === tableIdStr) {
        return {
          ...table,
          status: status,
          currentOrderId: status === 'available' ? null : (orderId || table.currentOrderId),
          lastOrderTime: status === 'occupied' ? new Date().toISOString() : table.lastOrderTime,
        };
      }
      return table;
    };
    setSelectedFloor(prev => {
      if (!prev) return prev;
      return { ...prev, tables: prev.tables?.map(updateTable) || [] };
    });

    // Clear updating state after server has had time to process, then do a final refresh
    setTimeout(() => {
      setUpdatingTables(prev => {
        const next = new Set(prev);
        next.delete(tableIdStr);
        return next;
      });
      // Final refresh to get authoritative server state
      const rid = restaurantIdRef.current;
      if (rid) refreshInBackground(rid);
    }, 5000);
  }, [refreshInBackground]);

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

      // Merge: preserve optimistic state for tables that are still mid-update,
      // so a stale server response doesn't overwrite a just-set status.
      setUpdatingTables(prevUpdating => {
        const pending = prevUpdating;
        const mergeTable = (serverTable, localTable) => {
          if (pending.has(String(serverTable.id)) && localTable) {
            return {
              ...serverTable,
              status: localTable.status,
              currentOrderId: localTable.currentOrderId,
              lastOrderTime: localTable.lastOrderTime,
            };
          }
          return serverTable;
        };

        setTables(prevTables => {
          const byId = new Map(prevTables.map(t => [String(t.id), t]));
          return floorsData
            .flatMap(floor => floor.tables || [])
            .map(t => mergeTable(t, byId.get(String(t.id))));
        });

        setFloors(prevFloors => {
          const localById = new Map(
            prevFloors.flatMap(f => f.tables || []).map(t => [String(t.id), t])
          );
          return floorsData.map(floor => ({
            ...floor,
            tables: (floor.tables || []).map(t => mergeTable(t, localById.get(String(t.id)))),
          }));
        });

        // Don't wipe the set — per-table 3s timeout clears individual entries.
        return prevUpdating;
      });

      setSelectedFloor(prev => {
        if (prev) {
          const updatedFloor = floorsData.find(f => f.id === prev.id);
          return updatedFloor || prev;
        }
        return prev;
      });

      // Save to cache for stale-while-revalidate
      if (restaurantId) {
        const allTables = floorsData.flatMap(floor => floor.tables || []);
        setCache('cache_floors_' + restaurantId, { floors: floorsData, tables: allTables });
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
            // Same restaurant — background refresh with slight delay for optimistic update
            setTimeout(() => refreshInBackground(rid), params.tableId ? 500 : 100);
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

      // Stale-while-revalidate: try cache first
      const cached = await getCached('cache_floors_' + restaurantId);
      if (cached?.data?.floors) {
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


  // Pusher: real-time table status updates when orders change on other devices
  useEffect(() => {
    const rid = restaurantIdRef.current;
    if (!rid) return;

    const pusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER });
    const channelName = `restaurant-${rid}`;
    const channel = pusher.subscribe(channelName);

    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshInBackground(rid);
      }, 800);
    };

    // Handle table-specific events with optimistic update
    channel.bind('table-status-updated', (data) => {
      if (data?.tableId && data?.status) {
        updateTableStatusOptimistically(data.tableId, data.status, data.orderId);
      }
      debouncedRefresh();
    });

    // All order events that can affect table status
    channel.bind('order-created', (data) => {
      // Optimistic: find table by tableNumber and mark occupied
      if (data?.tableNumber) {
        setFloors(prevFloors => {
          for (const floor of prevFloors) {
            const match = floor.tables?.find(t => t.name === data.tableNumber);
            if (match) {
              updateTableStatusOptimistically(match.id, 'occupied', data.orderId);
              break;
            }
          }
          return prevFloors;
        });
      }
      debouncedRefresh();
    });
    channel.bind('order-updated', (data) => {
      // Optimistic: when order is completed/cancelled via update, release the table
      if (data?.tableNumber && (data?.status === 'completed' || data?.status === 'cancelled')) {
        setFloors(prevFloors => {
          for (const floor of prevFloors) {
            const match = floor.tables?.find(t => t.name === data.tableNumber);
            if (match) {
              updateTableStatusOptimistically(match.id, 'available', null);
              break;
            }
          }
          return prevFloors;
        });
      }
      debouncedRefresh();
    });
    channel.bind('order-status-updated', (data) => {
      // Optimistic: when order is completed/cancelled, release the table
      if (data?.tableNumber && (data?.status === 'completed' || data?.status === 'cancelled')) {
        setFloors(prevFloors => {
          for (const floor of prevFloors) {
            const match = floor.tables?.find(t => t.name === data.tableNumber);
            if (match) {
              updateTableStatusOptimistically(match.id, 'available', null);
              break;
            }
          }
          return prevFloors;
        });
      }
      debouncedRefresh();
    });
    channel.bind('order-completed', debouncedRefresh);
    channel.bind('order-deleted', debouncedRefresh);
    channel.bind('tables-reset', () => {
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
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      channel.unbind_all();
      pusher.unsubscribe(channelName);
      pusher.disconnect();
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
  }, [selectedRestaurant]);

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
      router.push({
        pathname: '/(tabs)/menu',
        params: { tableId: table.id, tableNumber: table.name, floorName: currentFloorName },
      });
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
      } else {
        router.push({
          pathname: '/(tabs)/menu',
          params: { tableId: table.id, tableNumber: table.name, floorName: currentFloorName },
        });
      }
    } else {
      Alert.alert('Table Unavailable', `Table ${table.name} is ${table.status}.`);
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
    // Store full add-items context in AsyncStorage for reliable cross-tab navigation
    const tableFloor = selectedTableForOrder ? getFloorForTable(selectedTableForOrder) : null;
    const floorName = tableFloor?.name || tableFloor?.floorName || '';
    try {
      await AsyncStorage.setItem('pendingAddItems', JSON.stringify({
        tableId: selectedTableForOrder?.id,
        tableNumber: selectedTableForOrder?.name,
        floorName,
        orderId: order.id,
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
    const isUpdating = updatingTables.has(String(table.id));

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
        {/* Card Inner */}
        <View style={styles.cardInner}>
          {/* Table Content */}
          <View style={styles.tableContent}>
            {/* Table Name Row: dot + name + elapsed time */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View style={[styles.statusDotInline, {
                backgroundColor: isAvailable ? '#16a34a' : isOccupied ? '#ea580c' : isReserved ? '#9333ea' : isCleaning ? '#3b82f6' : '#9ca3af'
              }]} />
              <Text style={[styles.tableNumber, isOutOfService && styles.tableNumberDisabled]} numberOfLines={1}>{table.name}</Text>
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
                // Out of service - no actions allowed
                <View style={styles.outOfServiceButtonContainer}>
                  <Ionicons name="ban" size={14} color="#9ca3af" />
                  <Text style={styles.outOfServiceButtonText}>Not Available</Text>
                </View>
              ) : isAvailable ? (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="restaurant-outline" size={15} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Take Order</Text>
                </View>
              ) : (
                // Cleaning, occupied, or reserved - allow all operations
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

    // Show a subtle syncing overlay if table is being updated
    if (isUpdating) {
      return (
        <View style={{ flex: 1, position: 'relative' }}>
          {cardContent}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 8, right: 8, zIndex: 10,
              backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999,
              paddingHorizontal: 6, paddingVertical: 2,
              flexDirection: 'row', alignItems: 'center', gap: 3,
              shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
            }}
          >
            <ActivityIndicator size="small" color={Colors.primary} style={{ transform: [{ scale: 0.6 }] }} />
          </View>
        </View>
      );
    }

    return cardContent;
  };

  const isOwnerOrAdmin = ['owner', 'admin'].includes(user?.role?.toLowerCase());
  const canResetTables = canPerform(user, user?.pageAccess, 'tables', 'reset');

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
              setFloors(prev => prev.filter(f => f.id !== editingFloor.id));
              if (selectedFloor?.id === editingFloor.id) {
                setSelectedFloor(floors.length > 1 ? floors.find(f => f.id !== editingFloor.id) : null);
              }
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
    setShowAddTableModal(true);
  };

  // Save single table
  const handleSaveTable = async () => {
    if (!tableForm.name.trim() || !selectedRestaurant?.id) return;
    setSavingTable(true);
    try {
      const data = {
        name: tableForm.name.trim(),
        capacity: parseInt(tableForm.capacity) || 4,
        type: tableForm.type,
        floor: tableForm.floor || selectedFloor?.name || '',
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
    if (to - from > 99) {
      Alert.alert('Error', 'Cannot create more than 100 tables at once');
      return;
    }
    setSavingTable(true);
    try {
      const data = {
        floor: bulkForm.floor || selectedFloor?.name || '',
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
          t.id === table.id ? { ...t, status: 'available', customerName: null, reservationTime: null, currentOrderId: null } : t;
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
      if (status !== 'available') {
        options.push('Mark Available');
        actions.push(() => handleChangeStatus(table, 'available'));
      }
      if (status === 'occupied' && table.currentOrderId) {
        options.push('View Order');
        actions.push(() => handleViewOrder(table));
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
      await apiClient.createBooking(selectedRestaurant.id, data);
      // Update table status to reserved
      updateTableStatusOptimistically(bookingTable.id, 'reserved', null);
      setFloors(prev => prev.map(f => ({
        ...f,
        tables: f.tables?.map(t =>
          t.id === bookingTable.id ? { ...t, status: 'reserved', customerName: data.customerName, reservationTime: data.bookingTime } : t
        ) || [],
      })));
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
          size={14}
          color={isSelected ? '#fff' : Colors.textMedium}
        />
        <Text style={[styles.floorChipText, isSelected && styles.floorChipTextSelected]}>
          {floor.name}
        </Text>
        {hasAreaCharge && (
          <Text style={[styles.areaChargeBadge, isSelected && styles.areaChargeBadgeSelected]}>
            +{floor.areaChargeType === 'percentage' ? `${floor.areaChargeValue}%` : `₹${floor.areaChargeValue}`}
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
  let currentFloorTables = selectedFloor ? (selectedFloor.tables || []) : tables;
  
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
  
  // Filter and sort tables by selected status
  if (selectedStatus) {
    const filtered = currentFloorTables.filter(t => t.status === selectedStatus);
    const rest = currentFloorTables.filter(t => t.status !== selectedStatus);
    // Sort both groups alphabetically
    currentFloorTables = [...sortTablesAlphabetically(filtered), ...sortTablesAlphabetically(rest)];
  }

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
          {canResetTables && (
            <TouchableOpacity onPress={handleResetAllTables} style={[styles.headerActionBtn, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="refresh-circle-outline" size={16} color="#ef4444" />
            </TouchableOpacity>
          )}
          {isOwnerOrAdmin && (
            <TouchableOpacity onPress={openAddTable} style={[styles.headerActionBtn, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="add" size={16} color="#3b82f6" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={[styles.headerActionBtn, { backgroundColor: '#eef2ff' }]}>
            <Ionicons name="sync-outline" size={16} color="#6366f1" />
          </TouchableOpacity>
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

      {/* Tables Grid */}
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
        contentContainerStyle={styles.tablesGrid}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.tableRow}
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
        onAddItems={handleAddItemsToOrder}
        onCompleteBill={async (order) => {
          // Complete the bill inline — no navigation, no duplicate confirmations.
          const tableForOrder = selectedTableForOrder;
          const rid = selectedRestaurant?.id;
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
              paymentStatus: order.paymentStatus === 'partial' ? 'partial' : 'paid',
              paymentMethod: order.paymentMethod || 'cash',
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              // Preserve existing amounts
              ...(order.totalAmount && { totalAmount: order.totalAmount }),
              ...(order.finalAmount && { finalAmount: order.finalAmount }),
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
              // Billing fields
              ...(order.serviceChargeAmount > 0 && { serviceChargeAmount: order.serviceChargeAmount, serviceChargeRate: order.serviceChargeRate }),
              ...(order.tipAmount > 0 && { tipAmount: order.tipAmount }),
              ...(order.roundOffAmount && { roundOffAmount: order.roundOffAmount }),
              // Staff tracking
              lastUpdatedBy: {
                name: user?.name || 'Staff',
                id: user?.id,
                role: user?.role || 'waiter',
              },
            };

            await apiClient.updateOrder(order.id, updateData);

            // Verify payment (same as web flow)
            try {
              await apiClient.verifyPayment({
                orderId: order.id,
                paymentMethod: order.paymentMethod || 'cash',
                amount: order.finalAmount || order.totalAmount || 0,
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
                  { value: 'flat', label: '₹ Flat' },
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
                  placeholder={floorForm.areaChargeType === 'percentage' ? 'e.g., 10 (for 10%)' : 'e.g., 50 (₹50 flat)'}
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
                <Text style={styles.floorFormLabel}>Floor</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
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
                  </View>
                </ScrollView>
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
    paddingBottom: 100,
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
