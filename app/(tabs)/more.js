import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Animated,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import apiClient, { WEB_BASE_URL } from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { clearCache } from '../../services/cacheManager';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import SyncDetailsSheet from '../../components/SyncDetailsSheet';
import BusinessSettings from '../../components/BusinessSettings';
import { hasPin, setPin, clearPin } from '../../services/pinLock';
import lanClient from '../../services/lanClient';
import { resolveFeaturePermissions } from '../../utils/permissions';
import RestaurantPickerModal from '../../components/RestaurantPickerModal';
import { useTabModes } from '../../contexts/TabModeContext';

export default function MoreScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { isOnline, offlineEnabled, isOfflineMode, effectivelyOffline, pendingCount, failedCount, lastSyncAt, toggleOfflineEnabled, toggleOfflineMode, triggerSync } = useOffline();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [businessInfoExpanded, setBusinessInfoExpanded] = useState(false);
  const [connectivityExpanded, setConnectivityExpanded] = useState(false);
  const chevronAnim = useRef(new Animated.Value(0)).current;
  const bizChevronAnim = useRef(new Animated.Value(0)).current;
  const connChevronAnim = useRef(new Animated.Value(0)).current;
  const [showSyncSheet, setShowSyncSheet] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [restaurants, setRestaurants] = useState([]);
  const [switchingRestaurant, setSwitchingRestaurant] = useState(false);
  const [showRestaurantModal, setShowRestaurantModal] = useState(false);
  const [switchingRestaurantId, setSwitchingRestaurantId] = useState(null);
  const [lanPaired, setLanPaired] = useState(false);
  const [lanConfig, setLanConfig] = useState(null);
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const displayChevronAnim = useRef(new Animated.Value(0)).current;
  const { modes: tabModes, setMode: setTabMode } = useTabModes();

  useEffect(() => {
    loadUserData();
    hasPin().then(setPinEnabled);
    // Check LAN pairing status
    lanClient.init().then(() => {
      setLanPaired(lanClient.isPaired());
      lanClient.getConfig().then(setLanConfig);
    });
  }, []);

  useEffect(() => {
    const unsub = restaurantEvents.on('switch', ({ restaurant: newRest }) => {
      setRestaurant(newRest);
      loadUserData();
    });
    return unsub;
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (userData) {
        setUser(userData);
        setRestaurant(userData.restaurant);
      }
      // Fetch restaurants list for switcher
      try {
        const restResponse = await apiClient.getRestaurants();
        const restList = restResponse?.restaurants || [];
        if (restList.length > 0) setRestaurants(restList);
      } catch (e) {
        console.log('Could not fetch restaurants:', e.message);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const handleSwitchRestaurant = async (newRestaurantId) => {
    const currentId = getRestaurantId();
    if (newRestaurantId === currentId) return;
    try {
      setSwitchingRestaurant(true);
      setSwitchingRestaurantId(newRestaurantId);
      // Clear all caches (AsyncStorage + in-memory API cache)
      await clearCache('cache_');
      apiClient.clearAllCache?.();
      // Update backend preference
      await apiClient.updateUserPreferences({ defaultRestaurantId: newRestaurantId });
      // Fetch fresh restaurant data
      const res = await apiClient.getRestaurant(newRestaurantId);
      const freshData = res?.restaurant || res;
      const newRestaurant = freshData?.name ? { id: newRestaurantId, ...freshData } : null;
      // Update stored user
      const updatedUser = { ...user, restaurantId: newRestaurantId, restaurant: newRestaurant || user?.restaurant };
      await apiClient.setUser(updatedUser);
      setUser(updatedUser);
      setRestaurant(newRestaurant || user?.restaurant);
      // Broadcast switch to all tabs
      restaurantEvents.emit('switch', { restaurantId: newRestaurantId, restaurant: newRestaurant || user?.restaurant });
      setShowRestaurantModal(false);
    } catch (error) {
      console.error('Error switching restaurant:', error);
      Alert.alert('Error', 'Failed to switch restaurant. Please try again.');
    } finally {
      setSwitchingRestaurant(false);
      setSwitchingRestaurantId(null);
    }
  };

  const showRestaurantPicker = () => {
    if (restaurants.length <= 1) return;
    setShowRestaurantModal(true);
  };

  const role = user?.role?.toLowerCase() || '';
  const businessType = restaurant?.businessType || user?.restaurant?.businessType || 'restaurant';
  const isOwnerOrAdmin = ['owner', 'admin'].includes(role);
  const isHotelType = businessType === 'hotel';
  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const getRestaurantId = () => user?.restaurantId || user?.restaurant?.id || restaurant?.id;

  const menuSections = [
    {
      title: 'Management',
      items: [
        { title: 'Headquarters', icon: 'analytics-outline', route: '/(tabs)/headquarters', roles: ['owner', 'admin'] },
        { title: 'Menu Management', icon: 'restaurant-outline', route: '/(tabs)/menu-management', roles: ['owner', 'manager', 'admin', 'cashier'], feature: 'menu' },
        { title: 'Customers', icon: 'people-outline', route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/customers`, title: 'Customers' } }, roles: ['owner', 'manager', 'admin'], feature: 'customers' },
        { title: 'Inventory', icon: 'cube-outline', route: '/(tabs)/inventory', roles: ['owner', 'manager', 'admin'], feature: 'inventory' },
        { title: 'Kitchen Display', icon: 'flame-outline', route: '/(tabs)/kitchen', roles: ['owner', 'manager', 'admin', 'waiter', 'employee'], feature: 'kot' },
        { title: 'Google Reviews', icon: 'star-outline', route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/google-reviews`, title: 'Google Reviews' } }, roles: ['owner', 'manager', 'admin'] },
        { title: 'Attendance', icon: 'time-outline', route: '/(tabs)/attendance', roles: null },
        { title: 'Billing', icon: 'card-outline', route: '/(tabs)/billing-tab', roles: null },
        { title: 'Printer', icon: 'print-outline', route: '/(tabs)/printer-settings', roles: null },
      ],
    },
    {
      title: 'Finance',
      items: [
        { title: 'Books', icon: 'book-outline', route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/books`, title: 'Books' } }, roles: ['owner', 'manager', 'admin'], feature: 'admin' },
        { title: 'Invoices', icon: 'document-text-outline', route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/invoice`, title: 'Invoices' } }, roles: ['owner', 'manager', 'admin'], feature: 'invoice' },
      ],
    },
    {
      title: 'History',
      items: [
        { title: 'Order History', icon: 'time-outline', route: '/(tabs)/order-history', roles: null, feature: 'history' },
        { title: 'Sales Summary', icon: 'stats-chart-outline', route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/sales-summary`, title: 'Sales Summary' } }, roles: ['owner', 'manager', 'admin'] },
      ],
    },
    ...(isHotelType ? [{
      title: 'Hotel',
      items: [
        { title: 'Hotel Management', icon: 'bed-outline', route: '/(tabs)/hotel', roles: null },
      ],
    }] : []),
    ...(restaurant?.parkingEnabled ? [{
      title: 'Parking',
      items: [
        { title: 'Parking Management', icon: 'car-outline', route: '/(tabs)/parking', roles: ['owner', 'admin', 'manager'] },
      ],
    }] : []),
  ];

  const adminTabs = [
    { title: 'General', icon: 'settings-outline', tabId: 'settings', color: '#6366f1' },
    { title: 'Restaurants', icon: 'storefront-outline', tabId: 'restaurants', color: '#ec4899' },
    { title: 'Staff', icon: 'people-outline', tabId: 'staff', color: '#8b5cf6' },
    { title: 'Tax', icon: 'receipt-outline', tabId: 'tax', color: '#f59e0b' },
    { title: 'Pricing', icon: 'pricetag-outline', tabId: 'pricing', color: '#10b981' },
    { title: 'Payments', icon: 'card-outline', tabId: 'payments', color: '#3b82f6' },
    { title: 'Billing', icon: 'document-text-outline', tabId: 'billing-settings', color: '#ef4444' },
    { title: 'Currency', icon: 'cash-outline', tabId: 'currency', color: '#14b8a6' },
    { title: 'Print', icon: 'print-outline', tabId: 'print', color: '#64748b' },
    { title: 'Orders', icon: 'clipboard-outline', tabId: 'order-management', color: '#f97316' },
    { title: 'Features', icon: 'toggle-outline', tabId: 'features', color: '#a855f7' },
    { title: 'Offers', icon: 'gift-outline', tabId: 'offers', color: '#e11d48' },
    { title: 'Loyalty', icon: 'star-outline', tabId: 'loyalty', color: '#eab308' },
  ];

  const TAB_ID_TO_PERM_KEY = {
    'settings': 'settings', 'tax': 'tax', 'pricing': 'pricing', 'payments': 'payments',
    'billing-settings': 'billingSettings', 'currency': 'currency', 'print': 'print',
    'features': 'features', 'restaurants': 'restaurants', 'staff': 'staff',
    'order-management': 'orderManagement', 'offers': 'offers', 'loyalty': 'loyalty',
    'google-reviews': 'googleReviews',
  };

  const filteredAdminTabs = (() => {
    if (role === 'owner' || role === 'admin') return adminTabs;
    const adminPerms = resolveFeaturePermissions(user?.pageAccess || {}, 'admin');
    return adminTabs.filter(tab => {
      const permKey = TAB_ID_TO_PERM_KEY[tab.tabId];
      return permKey ? !!adminPerms[permKey] : true;
    });
  })();

  const hasAnyAdminAccess = role === 'owner' || role === 'admin' || (() => {
    const pa = user?.pageAccess?.admin;
    if (typeof pa === 'object' && pa !== null) return Object.values(pa).some(Boolean);
    return !!pa;
  })();

  const shouldShowItem = (item) => {
    // For items with no role restriction, show by default — but allow owner to disable via pageAccess
    if (!item.roles) {
      if (item.feature && user?.pageAccess && user.pageAccess[item.feature] === false) return false;
      return true;
    }
    if (!role) return false;
    // If role is in the hardcoded list, show it
    if (item.roles.includes(role)) return true;
    // For roles not in the list, check pageAccess (supports custom roles, employee, etc.)
    if (item.feature && user?.pageAccess) {
      const val = user.pageAccess[item.feature];
      if (val === true) return true;
      if (typeof val === 'object' && val !== null) return Object.values(val).some(Boolean);
    }
    return false;
  };

  const toggleSettings = () => {
    const toValue = settingsExpanded ? 0 : 1;
    Animated.spring(chevronAnim, { toValue, useNativeDriver: true, tension: 200, friction: 15 }).start();
    setSettingsExpanded(!settingsExpanded);
  };

  const toggleBusinessInfo = () => {
    const toValue = businessInfoExpanded ? 0 : 1;
    Animated.spring(bizChevronAnim, { toValue, useNativeDriver: true, tension: 200, friction: 15 }).start();
    setBusinessInfoExpanded(!businessInfoExpanded);
  };

  const toggleConnectivity = () => {
    const toValue = connectivityExpanded ? 0 : 1;
    Animated.spring(connChevronAnim, { toValue, useNativeDriver: true, tension: 200, friction: 15 }).start();
    setConnectivityExpanded(!connectivityExpanded);
  };

  const toggleDisplay = () => {
    const toValue = displayExpanded ? 0 : 1;
    Animated.spring(displayChevronAnim, { toValue, useNativeDriver: true, tension: 200, friction: 15 }).start();
    setDisplayExpanded(!displayExpanded);
  };

  const chevronRotation = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const bizChevronRotation = bizChevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const connChevronRotation = connChevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const displayChevronRotation = displayChevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const handleNavigate = (route) => {
    router.push(route);
  };

  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await apiClient.logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Your account and all associated data will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'This is permanent. You will lose access to all restaurants and data linked to this account.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await apiClient.deleteAccount();
                      await apiClient.logout();
                      router.replace('/(auth)/login');
                    } catch (error) {
                      console.error('Delete account error:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                    } finally {
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const lastSyncText = lastSyncAt ? (() => {
    const diff = Date.now() - lastSyncAt;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  })() : null;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── Header Banner ──────────────────────────── */}
        <View style={styles.headerBanner}>
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Ionicons name="restaurant" size={18} color="#fff" />
            </View>
            <Text style={styles.brandName}>DineOpen</Text>
          </View>

          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.userName}>{user?.name || 'Staff Member'}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>{role || 'Staff'}</Text>
          </View>
        </View>

        {/* ── Profile Info Card ──────────────────────── */}
        <View style={styles.profileCard}>
          {/* Restaurant Info + Switcher */}
          <View style={styles.profileRow}>
            <View style={[styles.profileIconBg, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="storefront-outline" size={16} color="#d97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileLabel}>Restaurant</Text>
              <Text style={styles.profileValue}>{restaurant?.name || 'Not set'}</Text>
            </View>
            {restaurants.length > 1 && (
              <TouchableOpacity
                style={styles.switchRestaurantBtn}
                onPress={showRestaurantPicker}
                activeOpacity={0.7}
                disabled={switchingRestaurant}
              >
                {switchingRestaurant ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <>
                    <Ionicons name="swap-horizontal" size={14} color="#dc2626" />
                    <Text style={styles.switchRestaurantText}>Switch</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          {restaurant?.address && (
            <View style={styles.profileRow}>
              <View style={[styles.profileIconBg, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="location-outline" size={16} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileLabel}>Address</Text>
                <Text style={styles.profileValue} numberOfLines={2}>{restaurant.address}</Text>
              </View>
            </View>
          )}
          {user?.email && (
            <View style={styles.profileRow}>
              <View style={[styles.profileIconBg, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="mail-outline" size={16} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileLabel}>Email</Text>
                <Text style={styles.profileValue}>{user.email}</Text>
              </View>
            </View>
          )}
          {user?.phone && (
            <View style={styles.profileRow}>
              <View style={[styles.profileIconBg, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="call-outline" size={16} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileLabel}>Phone</Text>
                <Text style={styles.profileValue}>{user.phone}</Text>
              </View>
            </View>
          )}
          {restaurant?.phone && !user?.phone && (
            <View style={styles.profileRow}>
              <View style={[styles.profileIconBg, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="call-outline" size={16} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileLabel}>Restaurant Phone</Text>
                <Text style={styles.profileValue}>{restaurant.phone}</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Business Info — collapsible (owner, admin, cashier, manager) ── */}
        {['owner', 'admin', 'cashier', 'manager'].includes(role) && getRestaurantId() && (
          <View style={styles.sectionContainer}>
            <TouchableOpacity onPress={toggleBusinessInfo} activeOpacity={0.7} style={styles.collapsibleHeader}>
              <Ionicons name="business-outline" size={18} color="#8b7355" />
              <Text style={styles.collapsibleHeaderText}>Business Info</Text>
              <View style={{ flex: 1 }} />
              <Animated.View style={{ transform: [{ rotate: bizChevronRotation }] }}>
                <Ionicons name="chevron-down" size={18} color="#9ca3af" />
              </Animated.View>
            </TouchableOpacity>
            {businessInfoExpanded && (
              <View style={{ marginTop: 10 }}>
                <BusinessSettings restaurantId={getRestaurantId()} countryCode={restaurant?.currencySettings?.countryCode || 'IN'} />
              </View>
            )}
          </View>
        )}

        {/* ── Display — tab view mode toggles ──────────────── */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity onPress={toggleDisplay} activeOpacity={0.7} style={styles.collapsibleHeader}>
            <Ionicons name="eye-outline" size={18} color="#8b7355" />
            <Text style={styles.collapsibleHeaderText}>Display</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 8 }}>View Modes</Text>
            <Animated.View style={{ transform: [{ rotate: displayChevronRotation }] }}>
              <Ionicons name="chevron-down" size={18} color="#9ca3af" />
            </Animated.View>
          </TouchableOpacity>
          {displayExpanded && (
          <View style={[styles.card, { marginTop: 10 }]}>
            <Text style={{ fontSize: 12, color: '#9ca3af', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              Switch tabs between Web View (modern) and Native (classic) mode
            </Text>
            {[
              { key: 'tables', label: 'Tables', icon: 'restaurant-outline' },
              { key: 'menu', label: 'Menu', icon: 'fast-food-outline' },
              { key: 'billing', label: 'Billing', icon: 'card-outline' },
            ].map((tab, idx, arr) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.connectRow, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => setTabMode(tab.key, tabModes[tab.key] === 'webview' ? 'native' : 'webview')}
                activeOpacity={0.7}
              >
                <View style={styles.connectLeft}>
                  <Ionicons name={tab.icon} size={18} color={tabModes[tab.key] === 'webview' ? '#f59e0b' : '#9ca3af'} />
                  <View>
                    <Text style={styles.connectLabel}>{tab.label}</Text>
                    <Text style={styles.connectHint}>{tabModes[tab.key] === 'webview' ? 'Web View' : 'Native'}</Text>
                  </View>
                </View>
                <View style={[styles.toggle, tabModes[tab.key] === 'webview' && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, tabModes[tab.key] === 'webview' && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
          )}
        </View>

        {/* ── Connectivity — collapsible ──────────────── */}
        <View style={styles.sectionContainer}>
          <TouchableOpacity onPress={toggleConnectivity} activeOpacity={0.7} style={styles.collapsibleHeader}>
            <Ionicons name="wifi-outline" size={18} color="#8b7355" />
            <Text style={styles.collapsibleHeaderText}>Connectivity</Text>
            <View style={{ flex: 1 }} />
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444', marginRight: 6 }]} />
            <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 8 }}>{isOnline ? 'Online' : 'Offline'}</Text>
            <Animated.View style={{ transform: [{ rotate: connChevronRotation }] }}>
              <Ionicons name="chevron-down" size={18} color="#9ca3af" />
            </Animated.View>
          </TouchableOpacity>
          {connectivityExpanded && (
          <View style={[styles.card, { marginTop: 10 }]}>
            {/* Online/Offline Status */}
            <View style={styles.connectRow}>
              <View style={styles.connectLeft}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
                <Text style={styles.connectLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
              {lastSyncText && (
                <Text style={styles.connectMeta}>Synced {lastSyncText}</Text>
              )}
            </View>

            {/* Enable Offline Support — master toggle */}
            <TouchableOpacity style={styles.connectRow} onPress={() => toggleOfflineEnabled()}>
              <View style={styles.connectLeft}>
                <Ionicons name={offlineEnabled ? 'cloud-download' : 'cloud-outline'} size={18} color={offlineEnabled ? '#3b82f6' : '#9ca3af'} />
                <View>
                  <Text style={styles.connectLabel}>Enable Offline Support</Text>
                  <Text style={styles.connectHint}>{offlineEnabled ? 'Data cached locally' : 'Online only (recommended)'}</Text>
                </View>
              </View>
              <View style={[styles.toggle, offlineEnabled && styles.toggleOn]}>
                <View style={[styles.toggleKnob, offlineEnabled && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            {offlineEnabled && (
              <>
                {/* Force Offline Toggle */}
                <TouchableOpacity style={styles.connectRow} onPress={() => toggleOfflineMode()}>
                  <View style={styles.connectLeft}>
                    <Ionicons name={isOfflineMode ? 'cloud-offline' : 'cloud-done'} size={18} color={isOfflineMode ? '#f59e0b' : '#22c55e'} />
                    <View>
                      <Text style={styles.connectLabel}>Force Offline Mode</Text>
                      <Text style={styles.connectHint}>Work without internet</Text>
                    </View>
                  </View>
                  <View style={[styles.toggle, isOfflineMode && styles.toggleOn]}>
                    <View style={[styles.toggleKnob, isOfflineMode && styles.toggleKnobOn]} />
                  </View>
                </TouchableOpacity>

                {/* Download Data */}
                {getRestaurantId() && (
                  <TouchableOpacity
                    style={styles.connectRow}
                    disabled={seedingData || !isOnline}
                    onPress={async () => {
                      setSeedingData(true);
                      try {
                        const result = await apiClient.seedOfflineData(getRestaurantId());
                        Alert.alert(
                          result.success ? 'Data Downloaded' : 'Partial Download',
                          result.success ? 'All data saved for offline use.' : `Some data failed: ${result.errors.join(', ')}`
                        );
                      } catch (e) {
                        Alert.alert('Error', 'Failed to download: ' + e.message);
                      } finally {
                        setSeedingData(false);
                      }
                    }}
                  >
                    <View style={styles.connectLeft}>
                      <Ionicons name="download-outline" size={18} color="#8b7355" />
                      <View>
                        <Text style={styles.connectLabel}>Download Data</Text>
                        <Text style={styles.connectHint}>Pre-load for offline use</Text>
                      </View>
                    </View>
                    {seedingData ? (
                      <ActivityIndicator size="small" color="#8b7355" />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Sync Status & PIN Lock — only when offline support enabled */}
            {offlineEnabled && (
              <>
                <TouchableOpacity style={styles.connectRow} onPress={() => setShowSyncSheet(true)}>
                  <View style={styles.connectLeft}>
                    <Ionicons
                      name={failedCount > 0 ? 'alert-circle' : pendingCount > 0 ? 'sync' : 'checkmark-circle'}
                      size={18}
                      color={failedCount > 0 ? '#ef4444' : pendingCount > 0 ? '#f59e0b' : '#22c55e'}
                    />
                    <View>
                      <Text style={styles.connectLabel}>Sync Status</Text>
                      <Text style={styles.connectHint}>
                        {failedCount > 0 ? `${failedCount} failed, ${pendingCount} pending`
                          : pendingCount > 0 ? `${pendingCount} pending`
                          : 'All synced'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                </TouchableOpacity>

                {/* Manual Sync */}
                {(pendingCount > 0 || failedCount > 0) && (
                  <TouchableOpacity
                    style={[styles.connectRow, { backgroundColor: failedCount > 0 ? '#fef2f2' : '#f0f9ff' }]}
                    onPress={async () => {
                      try {
                        await triggerSync();
                        Alert.alert('Sync Started', 'Syncing pending changes...');
                      } catch (e) {
                        Alert.alert('Sync Error', e.message);
                      }
                    }}
                  >
                    <View style={styles.connectLeft}>
                      <Ionicons name="refresh" size={18} color={failedCount > 0 ? '#ef4444' : '#3b82f6'} />
                      <Text style={[styles.connectLabel, { color: failedCount > 0 ? '#ef4444' : '#3b82f6' }]}>
                        {failedCount > 0 ? 'Retry Failed' : 'Sync Now'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* PIN Lock — only when offline support enabled */}
            {offlineEnabled && (
              <>
                <TouchableOpacity
                  style={[styles.connectRow, { borderBottomWidth: 0 }]}
                  onPress={() => {
                    if (pinEnabled) {
                      Alert.alert('Remove PIN?', 'This will disable offline PIN lock.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: async () => { await clearPin(); setPinEnabled(false); } },
                      ]);
                    } else {
                      setShowPinSetup(true);
                      setPinInput('');
                    }
                  }}
                >
                  <View style={styles.connectLeft}>
                    <Ionicons name="lock-closed-outline" size={18} color={pinEnabled ? '#f59e0b' : '#9ca3af'} />
                    <View>
                      <Text style={styles.connectLabel}>PIN Lock</Text>
                      <Text style={styles.connectHint}>{pinEnabled ? 'PIN active — tap to remove' : 'Set 4-digit PIN for offline'}</Text>
                    </View>
                  </View>
                  {pinEnabled ? (
                    <View style={[styles.toggle, styles.toggleOn]}>
                      <View style={[styles.toggleKnob, styles.toggleKnobOn]} />
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                  )}
                </TouchableOpacity>

                {/* PIN Setup */}
                {showPinSetup && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>Enter a 4-digit PIN:</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput
                        style={styles.pinInput}
                        value={pinInput}
                        onChangeText={(t) => setPinInput(t.replace(/\D/g, '').slice(0, 4))}
                        keyboardType="number-pad"
                        maxLength={4}
                        secureTextEntry
                        placeholder="····"
                        autoFocus
                      />
                      <TouchableOpacity
                        style={[styles.pinButton, pinInput.length === 4 && styles.pinButtonActive]}
                        disabled={pinInput.length !== 4}
                        onPress={async () => {
                          await setPin(pinInput);
                          setPinEnabled(true);
                          setShowPinSetup(false);
                          setPinInput('');
                          Alert.alert('PIN Set', 'Offline PIN lock is now active.');
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Set</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setShowPinSetup(false); setPinInput(''); }}>
                        <Ionicons name="close-circle" size={22} color="#d1d5db" />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}

            {/* LAN Hub Connection */}
            {lanPaired && lanConfig && (
              <View style={[styles.connectRow, { borderBottomWidth: 0 }]}>
                <View style={styles.connectLeft}>
                  <Ionicons name="git-network-outline" size={18} color="#8b5cf6" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectLabel}>LAN Hub</Text>
                    <Text style={styles.connectHint}>
                      Connected to {lanConfig.hubUrl || `${lanConfig.hubHost}:${lanConfig.hubPort}`}
                      {lanConfig.restaurantName ? ` (${lanConfig.restaurantName})` : ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  onPress={() => {
                    Alert.alert('Unpair from Hub', 'This will disconnect from the LAN hub. You can pair again later.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Unpair', style: 'destructive', onPress: async () => {
                        await lanClient.unpair();
                        setLanPaired(false);
                        setLanConfig(null);
                        Alert.alert('Unpaired', 'Disconnected from LAN hub.');
                      }},
                    ]);
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#ef4444' }}>Unpair</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          )}
        </View>

        {/* ── Menu Sections + Admin Settings after Management ── */}
        {menuSections.map((section) => {
          const visibleItems = section.items.filter(shouldShowItem);
          if (visibleItems.length === 0) return null;

          return (
            <React.Fragment key={section.title}>
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <View style={styles.card}>
                  {visibleItems.map((item, i) => (
                    <TouchableOpacity
                      key={item.title}
                      style={[styles.menuItem, i === visibleItems.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => handleNavigate(item.route)}
                      activeOpacity={0.6}
                    >
                      <View style={styles.menuIconBg}>
                        <Ionicons name={item.icon} size={18} color="#8b7355" />
                      </View>
                      <Text style={styles.menuItemText}>{item.title}</Text>
                      <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Admin Settings — right after Management */}
              {section.title === 'Management' && hasAnyAdminAccess && filteredAdminTabs.length > 0 && (
                <View style={styles.sectionContainer}>
                  <TouchableOpacity
                    onPress={toggleSettings}
                    activeOpacity={0.7}
                    style={styles.collapsibleHeader}
                  >
                    <Ionicons name="settings-outline" size={18} color="#8b7355" />
                    <Text style={styles.collapsibleHeaderText}>Admin Settings</Text>
                    <View style={{ flex: 1 }} />
                    <View style={styles.adminBadge}>
                      <Text style={styles.adminBadgeText}>{filteredAdminTabs.length}</Text>
                    </View>
                    <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
                      <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                    </Animated.View>
                  </TouchableOpacity>

                  {settingsExpanded && (
                    <View style={styles.adminGrid}>
                      {filteredAdminTabs.map((tab) => (
                        <TouchableOpacity
                          key={tab.tabId}
                          style={styles.adminTile}
                          activeOpacity={0.7}
                          onPress={() => handleNavigate({
                            pathname: '/(tabs)/webview',
                            params: { url: `${WEB_BASE_URL}/mobile/admin?tab=${tab.tabId}`, title: tab.title },
                          })}
                        >
                          <View style={[styles.adminTileIcon, { backgroundColor: tab.color + '15' }]}>
                            <Ionicons name={tab.icon} size={20} color={tab.color} />
                          </View>
                          <Text style={styles.adminTileLabel} numberOfLines={1}>{tab.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </React.Fragment>
          );
        })}

        {/* ── Sign Out ───────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={18} color="#e5484d" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* ── Delete Account ──────────────────────────── */}
        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={handleDeleteAccount}
          activeOpacity={0.7}
          disabled={deletingAccount}
        >
          <Ionicons name="trash-outline" size={16} color="#9ca3af" />
          <Text style={styles.deleteAccountText}>
            {deletingAccount ? 'Deleting...' : 'Delete Account'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Footer ─────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerRolePill}>
          <View style={styles.footerRoleDot} />
          <Text style={styles.footerRoleText}>{role || 'Staff'}</Text>
        </View>
        <TouchableOpacity style={styles.footerVersionPill}>
          <Text style={styles.footerVersionText}>v{Constants.expoConfig?.version || Constants.manifest?.version || '?.?.?'}</Text>
        </TouchableOpacity>
      </View>

      <SyncDetailsSheet visible={showSyncSheet} onClose={() => setShowSyncSheet(false)} />
      <RestaurantPickerModal
        visible={showRestaurantModal}
        onClose={() => setShowRestaurantModal(false)}
        restaurants={restaurants}
        currentRestaurantId={getRestaurantId()}
        onSelect={handleSwitchRestaurant}
        switching={!!switchingRestaurantId}
        switchingId={switchingRestaurantId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f3ef',
  },

  // ── Header Banner ───────────────────────────────
  headerBanner: {
    backgroundColor: '#8b7355',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 28,
    paddingHorizontal: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginBottom: 20,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  avatarContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  rolePill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },

  // ── Profile Card ──────────────────────────────────
  profileCard: {
    marginHorizontal: 16,
    marginTop: -12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  profileValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 1,
  },
  switchRestaurantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  switchRestaurantText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },

  // ── Sections ──────────────────────────────────────
  sectionContainer: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8b7355',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  // ── Connectivity ──────────────────────────────────
  connectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f3ef',
  },
  connectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  connectLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  connectHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  connectMeta: {
    fontSize: 11,
    color: '#9ca3af',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: '#f59e0b',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  pinInput: {
    flex: 1,
    backgroundColor: '#f5f3ef',
    borderRadius: 8,
    padding: 10,
    fontSize: 18,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  pinButton: {
    backgroundColor: '#d1d5db',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  pinButtonActive: {
    backgroundColor: '#8b7355',
  },

  // ── Menu Items ────────────────────────────────────
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f3ef',
  },
  menuIconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f5f3ef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },

  // ── Collapsible Headers ───────────────────────────
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  collapsibleHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8b7355',
  },

  // ── Admin Settings Grid ───────────────────────────
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  adminHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#8b7355',
  },
  adminBadge: {
    backgroundColor: '#f5f3ef',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 4,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8b7355',
  },
  adminGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 10,
  },
  adminTile: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  adminTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminTileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },

  // ── Sign Out ──────────────────────────────────────
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    gap: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5484d',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9ca3af',
  },

  // ── Footer ────────────────────────────────────────
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: '#ece8e1',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingBottom: Platform.OS === 'android' ? 16 : 28,
    backgroundColor: '#f5f3ef',
  },
  footerRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b7355',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  footerRoleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d4c5a9',
  },
  footerRoleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'capitalize',
  },
  footerVersionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#d4c5a9',
  },
  footerVersionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
});
