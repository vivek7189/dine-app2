import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  ScrollView, ActivityIndicator, Alert, Animated, Vibration, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import Pusher from 'pusher-js/react-native';
import apiClient from '../../services/api';
import lanClient from '../../services/lanClient';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';

// ─── Tab Definitions ───
const TABS = [
  { key: 'new', label: 'New', statuses: ['pending', 'confirmed'] },
  { key: 'cooking', label: 'Cooking', statuses: ['preparing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'done', label: 'Done', statuses: ['completed'] },
];

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'last24hours', label: '24h' },
  { key: 'all', label: 'All' },
];

// ─── Timer Color Helper ───
const getTimerColor = (minutes) => {
  if (minutes >= 15) return { color: '#ef4444', bg: '#fef2f2' };
  if (minutes >= 8) return { color: '#f59e0b', bg: '#fffbeb' };
  return { color: '#22c55e', bg: '#f0fdf4' };
};

export default function KitchenScreen() {
  const router = useRouter();
  const { gridColumns } = useResponsive();
  const { effectivelyOffline } = useOffline();
  const cols = gridColumns(1);
  const [kotOrders, setKotOrders] = useState([]);
  const [selectedTab, setSelectedTab] = useState('new');
  const [dateFilter, setDateFilter] = useState('today');
  const [loading, setLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [transitioning, setTransitioning] = useState({});
  const [undoToast, setUndoToast] = useState(null);
  const [selectedKot, setSelectedKot] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [timers, setTimers] = useState({});

  const undoTimeoutRef = useRef(null);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  const loadDataRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(1)).current;

  // ─── Pulse animation for overdue timers ───
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Shimmer animation for skeleton ───
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Load Data ───
  const loadKotData = useCallback(async (showSpinner = true) => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) return;
      setUserRole(userData.role);

      let resId = userData.restaurantId;
      if (!resId && (userData.role === 'owner' || userData.role === 'admin')) {
        const res = await apiClient.getRestaurants();
        if (res?.restaurants?.length > 0) {
          resId = res.restaurants[0].id;
          setRestaurant(res.restaurants[0]);
        }
      } else if (userData.restaurant) {
        setRestaurant(userData.restaurant);
      }

      if (!resId) return;
      setRestaurantId(resId);

      if (showSpinner && kotOrders.length === 0) {
        setLoading(true);
      } else {
        setBackgroundLoading(true);
      }

      const data = await apiClient.getKotOrders(resId);
      setKotOrders(data.orders || []);
    } catch (error) {
      console.error('Error loading KOT data:', error);
    } finally {
      setLoading(false);
      setBackgroundLoading(false);
      setRefreshing(false);
    }
  }, []);

  loadDataRef.current = loadKotData;

  // ─── Initial Load ───
  useEffect(() => {
    loadKotData(true);
  }, []);

  // ─── Refresh on screen focus (offline data sync) ───
  useFocusEffect(
    useCallback(() => {
      if (restaurantId) {
        loadDataRef.current?.(false);
      }
    }, [restaurantId])
  );

  // ─── Pusher + LAN Hub Events ───
  useEffect(() => {
    if (!restaurantId) return;

    const handleEvent = () => {
      loadDataRef.current?.(false);
      if (soundEnabled) Vibration.vibrate(100);
    };

    const eventNames = ['order-created', 'order-status-updated', 'order-updated', 'order-deleted'];
    const lanUnsubs = [];

    // LAN Hub WebSocket events (when paired)
    if (lanClient.isPaired()) {
      eventNames.forEach(evt => {
        lanUnsubs.push(lanClient.onEvent(evt, handleEvent));
      });
      setIsLive(true);
    }

    // Pusher (cloud) — subscribe alongside LAN, whichever is active delivers events
    pusherRef.current = new Pusher(process.env.EXPO_PUBLIC_PUSHER_KEY || '4e1f74ae05c66bbc4eec', {
      cluster: process.env.EXPO_PUBLIC_PUSHER_CLUSTER || 'ap2',
    });

    const channelName = `restaurant-${restaurantId}`;
    channelRef.current = pusherRef.current.subscribe(channelName);
    setIsLive(true);

    eventNames.forEach(evt => channelRef.current.bind(evt, handleEvent));

    return () => {
      lanUnsubs.forEach(fn => fn());
      channelRef.current?.unbind_all();
      pusherRef.current?.unsubscribe(channelName);
      pusherRef.current?.disconnect();
      setIsLive(false);
    };
  }, [restaurantId, soundEnabled]);

  // ─── Cooking Timers ───
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const next = { ...prev };
        kotOrders.forEach(order => {
          if (order.status === 'preparing' && order.cookingStartTime) {
            const elapsed = Math.floor((Date.now() - new Date(order.cookingStartTime).getTime()) / 1000);
            next[order.id] = Math.max(0, elapsed);
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [kotOrders]);

  // ─── Cleanup ───
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // ─── Helpers ───
  const getTimeElapsed = (kotTime) => {
    if (!kotTime) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(kotTime).getTime()) / (1000 * 60)));
  };

  const formatTime = (timeString) => {
    if (!timeString) return '--:--';
    try {
      return new Date(timeString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return '--:--'; }
  };

  const formatCookingTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const getOrderDateCategory = (d) => {
    if (!d) return 'unknown';
    const orderDate = new Date(d); orderDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (orderDate.getTime() === today.getTime()) return 'today';
    return 'older';
  };

  const getTypeLabel = (type) => {
    if (type === 'delivery') return 'Delivery';
    if (type === 'pickup') return 'Pickup';
    return 'Dine In';
  };

  const getVariantName = (item) => {
    if (!item) return null;
    return item.selectedVariant?.name || item.variantName || item.variant?.name || item.size || item.portion || null;
  };

  const getToppings = (item) => {
    if (!item) return [];
    return item.selectedCustomizations || item.customizations || item.addons || item.toppings || [];
  };

  // ─── Smooth Transition ───
  const smoothTransition = (kotId, orderId, newStatus, targetTab, label) => {
    setTransitioning(prev => ({ ...prev, [orderId]: { label, targetTab } }));
    setTimeout(() => {
      setKotOrders(orders => orders.map(o =>
        o.kotId === kotId ? {
          ...o, status: newStatus,
          ...(newStatus === 'preparing' ? { cookingStartTime: new Date().toISOString() } : {}),
          ...(newStatus === 'ready' ? { cookingEndTime: new Date().toISOString() } : {}),
        } : o
      ));
      setTransitioning(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      setSelectedTab(targetTab);
    }, 1500);
  };

  // ─── Actions ───
  const startCooking = async (kotId, orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await apiClient.startCooking(orderId);
      setUpdatingOrderId(null);
      smoothTransition(kotId, orderId, 'preparing', 'cooking', 'Cooking');
      setTimeout(() => loadKotData(false), 2500);
    } catch (e) {
      setUpdatingOrderId(null);
      Alert.alert('Error', 'Failed to start cooking');
    }
  };

  const markReady = async (kotId, orderId) => {
    setUpdatingOrderId(orderId);
    try {
      await apiClient.markReady(orderId);
      setUpdatingOrderId(null);
      if (soundEnabled) Vibration.vibrate(200);
      smoothTransition(kotId, orderId, 'ready', 'ready', 'Ready');
      setTimeout(() => loadKotData(false), 2500);
    } catch (e) {
      setUpdatingOrderId(null);
      Alert.alert('Error', 'Failed to mark ready');
    }
  };

  const markDone = (kotId, orderId) => {
    setTransitioning(prev => ({ ...prev, [orderId]: { label: 'Done', targetTab: 'done' } }));
    setTimeout(() => {
      setKotOrders(orders => orders.map(o => o.kotId === kotId ? { ...o, status: 'completed' } : o));
      setTransitioning(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    }, 1500);

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoToast({ orderId, kotId });

    undoTimeoutRef.current = setTimeout(async () => {
      try {
        await apiClient.completeOrder(orderId);
        setTimeout(() => loadKotData(false), 1000);
      } catch (e) {
        setKotOrders(orders => orders.map(o => o.kotId === kotId ? { ...o, status: 'ready' } : o));
        Alert.alert('Error', 'Failed to complete order');
      }
      setUndoToast(null);
      undoTimeoutRef.current = null;
    }, 5000);
  };

  const undoMarkDone = () => {
    if (!undoToast) return;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setKotOrders(orders => orders.map(o => o.kotId === undoToast.kotId ? { ...o, status: 'ready' } : o));
    setUndoToast(null);
    undoTimeoutRef.current = null;
  };

  const cancelOrder = (kotId, orderId) => {
    Alert.prompt ? Alert.prompt('Cancel Order', 'Reason (optional):', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async (reason) => {
        setUpdatingOrderId(orderId);
        try {
          await apiClient.cancelKotOrder(orderId, reason || '');
          setKotOrders(orders => orders.filter(o => o.kotId !== kotId));
          setTimeout(() => loadKotData(false), 1000);
        } catch (e) { Alert.alert('Error', 'Failed to cancel'); }
        finally { setUpdatingOrderId(null); }
      }}
    ]) : Alert.alert('Cancel Order', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: 'destructive', onPress: async () => {
        setUpdatingOrderId(orderId);
        try {
          await apiClient.cancelKotOrder(orderId, '');
          setKotOrders(orders => orders.filter(o => o.kotId !== kotId));
          setTimeout(() => loadKotData(false), 1000);
        } catch (e) { Alert.alert('Error', 'Failed to cancel'); }
        finally { setUpdatingOrderId(null); }
      }}
    ]);
  };

  const deleteOrder = (orderId) => {
    Alert.alert('Delete Order', `Delete #${orderId.slice(-6).toUpperCase()}? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setUpdatingOrderId(orderId);
        try {
          await apiClient.deleteOrder(orderId);
          setKotOrders(prev => prev.filter(o => o.id !== orderId));
          if (selectedKot?.id === orderId) setSelectedKot(null);
        } catch (e) { Alert.alert('Error', 'Failed to delete'); }
        finally { setUpdatingOrderId(null); }
      }}
    ]);
  };

  // ─── Filtering & Sorting ───
  const currentTab = TABS.find(t => t.key === selectedTab) || TABS[0];

  const filteredOrders = kotOrders
    .filter(order => {
      const orderDate = order.kotTime || order.createdAt || order.timestamp;
      if (!orderDate) return false;
      if (dateFilter === 'today' && getOrderDateCategory(orderDate) !== 'today') return false;
      if (dateFilter === 'last24hours') {
        if ((Date.now() - new Date(orderDate).getTime()) / (1000 * 60 * 60) > 24) return false;
      }
      return currentTab.statuses.includes(order.status);
    })
    .sort((a, b) => {
      const aT = new Date(a.kotTime || a.createdAt || a.timestamp).getTime();
      const bT = new Date(b.kotTime || b.createdAt || b.timestamp).getTime();
      return bT - aT; // Newest first on all tabs
    });

  const tabCounts = {};
  TABS.forEach(tab => {
    tabCounts[tab.key] = kotOrders.filter(o => {
      const d = o.kotTime || o.createdAt || o.timestamp;
      if (!d) return false;
      if (dateFilter === 'today' && getOrderDateCategory(d) !== 'today') return false;
      if (dateFilter === 'last24hours' && (Date.now() - new Date(d).getTime()) / 3600000 > 24) return false;
      return tab.statuses.includes(o.status);
    }).length;
  });

  // ─── Get action for current tab ───
  const getAction = (kot) => {
    if (selectedTab === 'new') return { label: 'START COOKING', icon: 'play', onPress: () => startCooking(kot.kotId, kot.id) };
    if (selectedTab === 'cooking') return { label: 'MARK READY', icon: 'checkmark-circle', onPress: () => markReady(kot.kotId, kot.id) };
    if (selectedTab === 'ready') return { label: 'DONE', icon: 'checkmark', onPress: () => markDone(kot.kotId, kot.id) };
    return null;
  };

  // ─── Render Card ───
  const renderCard = ({ item: kot }) => {
    const elapsed = getTimeElapsed(kot.kotTime);
    const timerInfo = getTimerColor(elapsed);
    const action = getAction(kot);
    const isUpdating = updatingOrderId === kot.id;
    const isTransitioning = !!transitioning[kot.id];
    const transInfo = transitioning[kot.id];
    const itemCount = Array.isArray(kot.items) ? kot.items.length : 0;

    return (
      <View style={[s.card, (isUpdating || isTransitioning) && { opacity: 0.6 }]}>
        {/* Updating Spinner */}
        {isUpdating && (
          <View style={s.cardOverlay}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        )}

        {/* Transition Overlay */}
        {isTransitioning && (
          <View style={[s.cardOverlay, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
            <Ionicons name="checkmark-circle" size={28} color={Colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 4 }}>
              Moved to {transInfo.label}
            </Text>
          </View>
        )}

        {/* Header */}
        <View style={s.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
            <Text style={s.orderId}>#{kot.id.slice(-6).toUpperCase()}</Text>
            {kot.tableNumber && <View style={s.tableBadge}><Text style={s.tableBadgeText}>T{kot.tableNumber}</Text></View>}
            <Text style={s.typeLabel}>{getTypeLabel(kot.orderType)}</Text>
            {kot.orderSource === 'customer_app' && <View style={s.appBadge}><Text style={s.appBadgeText}>App</Text></View>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {selectedTab === 'cooking' && timers[kot.id] != null && (
              <View style={s.cookingTimerBadge}>
                <Ionicons name="flame" size={10} color="#3b82f6" />
                <Text style={s.cookingTimerText}>{formatCookingTime(timers[kot.id])}</Text>
              </View>
            )}
            <Animated.Text style={[s.timerText, { color: timerInfo.color }, elapsed >= 15 && { opacity: pulseAnim }]}>
              {elapsed}m
            </Animated.Text>
            <TouchableOpacity onPress={() => setSelectedKot(kot)} style={s.eyeBtn}>
              <Ionicons name="eye-outline" size={14} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Items */}
        <View style={s.itemsContainer}>
          <Text style={s.itemCountLabel}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
          {Array.isArray(kot.items) && kot.items.map((item, idx) => (
            <View key={idx} style={[s.itemRow, idx < itemCount - 1 && s.itemRowBorder]}>
              <Text style={s.itemQty}>{item.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.name}</Text>
                {(getVariantName(item) || getToppings(item).length > 0) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                    {getVariantName(item) && <View style={s.variantPill}><Text style={s.variantPillText}>{getVariantName(item)}</Text></View>}
                    {getToppings(item).map((c, i) => <View key={i} style={s.toppingPill}><Text style={s.toppingPillText}>{c.name || c}</Text></View>)}
                  </View>
                )}
                {item.notes && <Text style={s.itemNotes}>— {item.notes}</Text>}
              </View>
            </View>
          ))}

          {kot.specialInstructions && (
            <View style={s.specialBox}>
              <Text style={s.specialText}><Text style={{ fontWeight: '700' }}>Note: </Text>{kot.specialInstructions}</Text>
            </View>
          )}
        </View>

        {/* Action Footer */}
        <View style={s.cardFooter}>
          {action ? (
            <TouchableOpacity
              style={[s.actionBtn, isUpdating && { opacity: 0.5 }]}
              onPress={action.onPress}
              disabled={isUpdating || isTransitioning}
            >
              <Ionicons name={action.icon} size={16} color="white" />
              <Text style={s.actionBtnText}>{action.label}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.viewDetailsBtn} onPress={() => setSelectedKot(kot)}>
              <Ionicons name="eye-outline" size={14} color="#374151" />
              <Text style={s.viewDetailsBtnText}>View Details</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.menuBtn}
            onPress={() => setOpenMenuId(openMenuId === kot.id ? null : kot.id)}
          >
            <Ionicons name="ellipsis-vertical" size={16} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* Overflow Menu */}
        {openMenuId === kot.id && (
          <View style={s.overflowMenu}>
            <TouchableOpacity style={s.menuItem} onPress={() => { setSelectedKot(kot); setOpenMenuId(null); }}>
              <Ionicons name="eye-outline" size={16} color="#374151" />
              <Text style={s.menuItemText}>View Details</Text>
            </TouchableOpacity>
            {kot.status !== 'completed' && kot.status !== 'cancelled' && (
              <TouchableOpacity style={s.menuItem} onPress={() => { cancelOrder(kot.kotId, kot.id); setOpenMenuId(null); }}>
                <Ionicons name="close-circle-outline" size={16} color="#f59e0b" />
                <Text style={[s.menuItemText, { color: '#f59e0b' }]}>Cancel</Text>
              </TouchableOpacity>
            )}
            {(userRole === 'admin' || userRole === 'owner') && (
              <TouchableOpacity style={s.menuItem} onPress={() => { deleteOrder(kot.id); setOpenMenuId(null); }}>
                <Ionicons name="trash-outline" size={16} color="#dc2626" />
                <Text style={[s.menuItemText, { color: '#dc2626' }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  // ─── Skeleton Loading ───
  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Animated.View style={[s.skelBox, { width: 40, height: 40, borderRadius: 12 }, { opacity: shimmerAnim }]} />
            <View>
              <Animated.View style={[s.skelBox, { width: 150, height: 18, marginBottom: 6 }, { opacity: shimmerAnim }]} />
              <Animated.View style={[s.skelBox, { width: 100, height: 12 }, { opacity: shimmerAnim }]} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1, 2, 3, 4].map(i => <Animated.View key={i} style={[s.skelBox, { width: 70, height: 32, borderRadius: 16 }, { opacity: shimmerAnim }]} />)}
          </View>
        </View>
        <View style={{ padding: Spacing.md }}>
          {[1, 2, 3].map(i => (
            <Animated.View key={i} style={[s.skelBox, { height: 160, borderRadius: 16, marginBottom: 12 }, { opacity: shimmerAnim }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main Render ───
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            <View style={s.headerIcon}>
              <Ionicons name="flame" size={22} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.headerTitle}>Kitchen Display</Text>
                {effectivelyOffline && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
                    <Ionicons name="cloud-offline-outline" size={12} color="#ef4444" />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#ef4444', marginLeft: 3 }}>Offline</Text>
                  </View>
                )}
              </View>
              <Text style={s.headerSub}>
                {restaurant?.name || 'Restaurant'} · {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
                {isLive && <Text style={{ color: Colors.success }}> · Live</Text>}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={[s.iconBtn, soundEnabled && { backgroundColor: '#f0fdf4' }]}
              onPress={() => setSoundEnabled(!soundEnabled)}
            >
              <Ionicons name={soundEnabled ? 'volume-high' : 'volume-mute'} size={16} color={soundEnabled ? '#16a34a' : '#9ca3af'} />
            </TouchableOpacity>
            <TouchableOpacity style={s.refreshBtn} onPress={() => { setRefreshing(true); loadKotData(false); }}>
              <Ionicons name="refresh" size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date + Tab Row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {DATE_FILTERS.map(df => (
            <TouchableOpacity
              key={df.key}
              style={[s.dateChip, dateFilter === df.key && s.dateChipActive]}
              onPress={() => setDateFilter(df.key)}
            >
              <Text style={[s.dateChipText, dateFilter === df.key && s.dateChipTextActive]}>{df.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {TABS.map(tab => {
              const active = selectedTab === tab.key;
              const count = tabCounts[tab.key] || 0;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tabPill, active && s.tabPillActive]}
                  onPress={() => setSelectedTab(tab.key)}
                >
                  <Text style={[s.tabPillText, active && s.tabPillTextActive]}>{tab.label}</Text>
                  <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                    <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Background loading bar */}
      {backgroundLoading && (
        <View style={s.loadingBar}>
          <View style={s.loadingBarInner} />
        </View>
      )}

      {/* Close overflow menu on list scroll */}
      <FlatList
        data={filteredOrders}
        renderItem={renderCard}
        keyExtractor={item => item.id}
        key={`kitchen-grid-${cols}`}
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? { gap: 12 } : undefined}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}
        onScrollBeginDrag={() => setOpenMenuId(null)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadKotData(false); }} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <View style={s.emptyIcon}>
              <Ionicons name="flame-outline" size={40} color="#9ca3af" />
            </View>
            <Text style={s.emptyTitle}>No {currentTab.label.toLowerCase()} orders</Text>
            <Text style={s.emptyText}>
              {selectedTab === 'new' && 'New orders will appear here when they come in.'}
              {selectedTab === 'cooking' && 'Start cooking orders from the New tab.'}
              {selectedTab === 'ready' && 'Orders will appear here when cooking is done.'}
              {selectedTab === 'done' && 'Completed orders will show here for reference.'}
            </Text>
            {selectedTab !== 'new' && (
              <TouchableOpacity style={s.emptyBtn} onPress={() => setSelectedTab('new')}>
                <Text style={s.emptyBtnText}>View New Orders</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Undo Toast */}
      {undoToast && (
        <View style={s.undoToast}>
          <Text style={s.undoToastText}>Order #{undoToast.orderId.slice(-6).toUpperCase()} marked done</Text>
          <TouchableOpacity onPress={undoMarkDone} style={s.undoBtn}>
            <Text style={s.undoBtnText}>UNDO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selectedKot} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            {selectedKot && (
              <>
                <View style={s.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={s.modalIcon}>
                      <Ionicons name="flame" size={18} color="white" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle}>Order #{selectedKot.id.slice(-6).toUpperCase()}</Text>
                      <Text style={s.modalSub}>
                        {getTypeLabel(selectedKot.orderType)}
                        {selectedKot.tableNumber && ` · Table ${selectedKot.tableNumber}`}
                        {selectedKot.waiterName && ` · ${selectedKot.waiterName}`}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedKot(null)} style={s.modalClose}>
                    <Ionicons name="close" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md }}>
                  {/* Info Grid */}
                  <View style={s.infoGrid}>
                    {[
                      { label: 'Order Time', value: formatTime(selectedKot.orderTime) },
                      { label: 'KOT Time', value: formatTime(selectedKot.kotTime) },
                      { label: 'Elapsed', value: `${getTimeElapsed(selectedKot.kotTime)}m` },
                      { label: 'Customer', value: selectedKot.customerName || '—' },
                    ].map((info, i) => (
                      <View key={i} style={s.infoCard}>
                        <Text style={s.infoLabel}>{info.label}</Text>
                        <Text style={s.infoValue}>{info.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Items */}
                  <Text style={s.modalSectionTitle}>Items ({Array.isArray(selectedKot.items) ? selectedKot.items.length : 0})</Text>
                  {Array.isArray(selectedKot.items) && selectedKot.items.map((item, idx) => (
                    <View key={idx} style={s.modalItem}>
                      <View style={s.modalItemQty}><Text style={s.modalItemQtyText}>{item.quantity}×</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalItemName}>{item.name}</Text>
                        {(getVariantName(item) || getToppings(item).length > 0) && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                            {getVariantName(item) && <View style={s.variantPill}><Text style={s.variantPillText}>{getVariantName(item)}</Text></View>}
                            {getToppings(item).map((c, i) => <View key={i} style={s.toppingPill}><Text style={s.toppingPillText}>{c.name || c}</Text></View>)}
                          </View>
                        )}
                        {item.notes && <Text style={s.itemNotes}>— {item.notes}</Text>}
                      </View>
                      {item.estimatedTime && <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600' }}>{item.estimatedTime}m</Text>}
                    </View>
                  ))}

                  {selectedKot.specialInstructions && (
                    <View style={[s.specialBox, { marginTop: 12 }]}>
                      <Text style={s.specialText}><Text style={{ fontWeight: '700' }}>Special: </Text>{selectedKot.specialInstructions}</Text>
                    </View>
                  )}
                </ScrollView>

                <View style={s.modalFooter}>
                  <TouchableOpacity style={s.modalCloseBtn} onPress={() => setSelectedKot(null)}>
                    <Text style={s.modalCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },

  // Header
  header: { backgroundColor: 'white', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.textDark },
  headerSub: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderLight, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb' },
  refreshBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },

  // Date chips
  dateChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: 'white' },
  dateChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dateChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMedium },
  dateChipTextActive: { color: 'white' },

  // Tab pills
  tabPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: 'white', gap: 6 },
  tabPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabPillText: { fontSize: 13, fontWeight: '600', color: Colors.textMedium },
  tabPillTextActive: { color: 'white' },
  tabBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 7, paddingVertical: 1, borderRadius: 10, minWidth: 22, alignItems: 'center' },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  tabBadgeTextActive: { color: 'white' },

  // Loading bar
  loadingBar: { height: 2, backgroundColor: '#f3f4f6', overflow: 'hidden' },
  loadingBarInner: { height: '100%', width: '40%', backgroundColor: Colors.primary },

  // Card
  card: { flex: 1, backgroundColor: 'white', borderRadius: 16, marginBottom: 12, ...Shadows.small, overflow: 'hidden', position: 'relative' },
  cardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10, borderRadius: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fef2f2' },
  orderId: { fontSize: 15, fontWeight: '800', color: Colors.textDark, letterSpacing: -0.3 },
  tableBadge: { backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tableBadgeText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  typeLabel: { fontSize: 10, fontWeight: '500', color: '#9ca3af' },
  appBadge: { backgroundColor: '#fce7f3', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  appBadgeText: { fontSize: 9, fontWeight: '600', color: '#ec4899' },
  cookingTimerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  cookingTimerText: { fontSize: 11, fontWeight: '700', color: '#3b82f6' },
  timerText: { fontSize: 12, fontWeight: '700' },
  eyeBtn: { padding: 5, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.05)' },

  // Items
  itemsContainer: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  itemCountLabel: { fontSize: 10, fontWeight: '600', color: '#b0b0b0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  itemQty: { fontSize: 14, fontWeight: '700', color: '#374151', minWidth: 26, textAlign: 'right' },
  itemName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  itemNotes: { fontSize: 11, color: '#f59e0b', fontWeight: '500', marginTop: 2 },
  variantPill: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  variantPillText: { fontSize: 10, fontWeight: '600', color: '#c2410c' },
  toppingPill: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  toppingPillText: { fontSize: 10, fontWeight: '600', color: '#065f46' },
  specialBox: { marginTop: 8, padding: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8 },
  specialText: { fontSize: 12, color: '#92400e', fontWeight: '500' },

  // Footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 11, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: 'white', letterSpacing: 0.5 },
  viewDetailsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f3f4f6', paddingVertical: 11, borderRadius: 10 },
  viewDetailsBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  menuBtn: { padding: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderLight },

  // Overflow Menu
  overflowMenu: { position: 'absolute', bottom: 52, right: 14, backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: Colors.borderLight, ...Shadows.medium, zIndex: 20, minWidth: 150, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuItemText: { fontSize: 13, fontWeight: '500', color: '#374151' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', maxWidth: 280, marginBottom: 16 },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  emptyBtnText: { fontSize: 13, fontWeight: '600', color: 'white' },

  // Undo Toast
  undoToast: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#1f2937', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, ...Shadows.large },
  undoToastText: { fontSize: 14, fontWeight: '500', color: 'white', flex: 1 },
  undoBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, marginLeft: 10 },
  undoBtnText: { fontSize: 13, fontWeight: '700', color: 'white' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 16, backgroundColor: '#fef2f2', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  modalIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.textDark },
  modalSub: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  modalClose: { padding: 6, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: 'white' },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  infoCard: { flex: 1, minWidth: '45%', backgroundColor: '#f9fafb', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#f3f4f6' },
  infoLabel: { fontSize: 10, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.textDark },

  modalSectionTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#f9fafb', borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: '#f3f4f6' },
  modalItemQty: { backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  modalItemQtyText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  modalItemName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },

  modalFooter: { padding: Spacing.md, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  modalCloseBtn: { backgroundColor: '#f3f4f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalCloseBtnText: { fontSize: 15, fontWeight: '600', color: '#374151' },

  // Skeleton
  skelBox: { backgroundColor: '#e5e7eb', borderRadius: 8 },
});
