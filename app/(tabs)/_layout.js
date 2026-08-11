import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { View, Text, Platform, Animated, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import apiClient, { WEB_BASE_URL } from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { TabBarProvider, useTabBar } from '../../contexts/TabBarContext';
import { TabModeProvider } from '../../contexts/TabModeContext';
import { TerminalLockProvider } from '../../contexts/TerminalLockContext';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { WebView } from 'react-native-webview';
import PrinterNotificationOverlay from '../../components/PrinterNotificationOverlay';
import OrderReadyNotificationOverlay from '../../components/OrderReadyNotificationOverlay';

function AnimatedTabBar(props) {
  const { translateY } = useTabBar();
  return (
    <Animated.View style={[
      styles.tabBarWrapper,
      { transform: [{ translateY }] },
    ]}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

function TabsNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const [userRole, setUserRole] = useState(null);
  const [pageAccess, setPageAccess] = useState(null);
  const [businessType, setBusinessType] = useState(null);
  const [parkingEnabled, setParkingEnabled] = useState(false);
  const [isDeliveryPartner, setIsDeliveryPartner] = useState(false);
  const [waiterAppConfig, setWaiterAppConfig] = useState({});

  useEffect(() => {
    // Check authentication on mount
    const checkAuth = async () => {
      const isAuth = await apiClient.isAuthenticated();
      if (!isAuth) {
        router.replace('/(auth)/login');
        return;
      }

      // Get user role for conditional tab visibility
      const userData = await apiClient.getUser();
      if (userData) {
        setUserRole(userData.role);
        setPageAccess(userData.pageAccess || null);
        if (userData.isDeliveryPartner) setIsDeliveryPartner(true);
        if (userData.restaurant?.posSettings?.waiterAppConfig) {
          setWaiterAppConfig(userData.restaurant.posSettings.waiterAppConfig);
        }
        // Route to correct backend based on restaurant config
        if (userData.restaurant) apiClient.setRestaurantBaseURL(userData.restaurant);
        apiClient.setBusinessDayStartHour(userData.restaurant?.posSettings?.businessDayStartHour || 0);
        const storedType = userData.restaurant?.businessType;
        if (userData.restaurant?.parkingEnabled) setParkingEnabled(true);
        if (storedType) {
          setBusinessType(storedType);
        } else {
          // Fallback: fetch fresh restaurant data if not in stored user
          const restaurantId = userData.restaurantId || userData.restaurant?.id;
          if (restaurantId) {
            try {
              const res = await apiClient.getRestaurant(restaurantId);
              const freshType = res?.restaurant?.businessType || res?.businessType || 'restaurant';
              setBusinessType(freshType);
              // Re-apply backend routing from the fresh doc (it carries pgBackendUrl) in case the
              // stored login object predates the dine-admin switch.
              if (res?.restaurant) apiClient.setRestaurantBaseURL(res.restaurant);
              if (res?.restaurant?.parkingEnabled || res?.parkingEnabled) setParkingEnabled(true);
            } catch (e) {
              setBusinessType('restaurant');
            }
          } else {
            setBusinessType('restaurant');
          }
        }
      }
    };
    checkAuth();
  }, []);

  const roleLower = userRole?.toLowerCase() || '';
  const { r } = useResponsive();
  const iconSize = r(26, 30);
  const { pendingCount } = useOffline();
  const insets = useSafeAreaInsets();
  // Add bottom safe area so tab bar sits above Android nav bar / iOS home indicator
  const bottomInset = Platform.OS === 'android'
    ? Math.max(insets.bottom, 24)
    : insets.bottom;

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          height: r(64, 74) + bottomInset,
          paddingBottom: bottomInset + r(4, 6),
          paddingTop: r(8, 10),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: r(11, 13),
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      {/* Home — visible to all roles */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={iconSize}
              color={color}
            />
          ),
        }}
      />

      {/* Tables — hidden for cashier/sales */}
      <Tabs.Screen
        name="tables"
        options={{
          title: 'Tables',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "restaurant" : "restaurant-outline"}
              size={iconSize}
              color={color}
            />
          ),
          // owner/admin/waiter/manager always see tables; other roles need pageAccess.tables
          href: (() => {
            if (!roleLower) return undefined;
            if (roleLower === 'waiter') return waiterAppConfig.showTablesTab !== false ? undefined : null;
            if (['owner', 'admin', 'captain', 'manager'].includes(roleLower)) return undefined;
            // For cashier, sales, employee, and custom roles — check pageAccess
            if (pageAccess) {
              const val = pageAccess.tables;
              if (val === true) return undefined;
              if (typeof val === 'object' && val !== null && Object.values(val).some(Boolean)) return undefined;
            }
            return null;
          })(),
        }}
      />

      {/* Billing — hidden from bottom nav, accessible via More screen */}
      <Tabs.Screen
        name="billing-tab"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      {/* Menu (Billing) — hidden for bar-type restaurants */}
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "fast-food" : "fast-food-outline"}
              size={iconSize}
              color={color}
            />
          ),
          href: (() => {
            if (businessType === 'bar') return null;
            // owner/admin/waiter/manager/cashier always see menu tab
            if (!roleLower) return undefined;
            if (roleLower === 'waiter') return waiterAppConfig.showMenuTab !== false ? undefined : null;
            if (['owner', 'admin', 'captain', 'manager', 'cashier'].includes(roleLower)) return undefined;
            // Other roles need pageAccess.menu
            if (pageAccess) {
              const val = pageAccess.menu;
              if (val === true) return undefined;
              if (typeof val === 'object' && val !== null && Object.values(val).some(Boolean)) return undefined;
            }
            return null;
          })(),
        }}
      />

      {/* Bar POS — shown only for bar-type restaurants */}
      <Tabs.Screen
        name="bar-billing"
        options={{
          title: 'Bar',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "beer" : "beer-outline"}
              size={iconSize}
              color={color}
            />
          ),
          href: businessType === 'bar' ? undefined : null,
        }}
      />

      {/* Orders — visible to all roles (waiter can be hidden via config) */}
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "receipt" : "receipt-outline"}
              size={iconSize}
              color={color}
            />
          ),
          headerShown: false,
          href: roleLower === 'waiter' && waiterAppConfig.showOrdersTab === false ? null : undefined,
        }}
      />

      {/* Deliveries — visible when user is delivery partner */}
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'Deliveries',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "bicycle" : "bicycle-outline"}
              size={iconSize}
              color={color}
            />
          ),
          href: isDeliveryPartner ? undefined : null,
        }}
      />

      {/* Parking — visible when parkingEnabled */}
      <Tabs.Screen
        name="parking"
        options={{
          title: 'Parking',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "car-sport" : "car-sport-outline"}
              size={iconSize}
              color={color}
            />
          ),
          href: parkingEnabled ? undefined : null,
        }}
      />

      {/* More — visible to all roles */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "grid" : "grid-outline"}
              size={iconSize}
              color={color}
            />
          ),
        }}
      />

      {/* === Hidden tabs === */}
      <Tabs.Screen name="attendance" options={{ href: null }} />
      <Tabs.Screen name="hotel" options={{ href: null }} />
      <Tabs.Screen name="menu-management" options={{ href: null }} />
      <Tabs.Screen name="offers" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="headquarters" options={{ href: null }} />
      <Tabs.Screen name="kitchen" options={{ href: null }} />
      <Tabs.Screen name="order-history" options={{ href: null }} />
      <Tabs.Screen name="webview" options={{ href: null }} />
      <Tabs.Screen name="printer-settings" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="billing-webview" options={{ href: null, tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}

// Hidden 0-size WebView that pre-loads the billing page shell on app start.
// This caches JS/CSS assets so the actual billing WebView opens much faster.
function BillingPrewarmer() {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await apiClient.getToken();
        const userData = await apiClient.getUser();
        const rid = userData?.restaurantId || userData?.restaurant?.id;
        const u = new URL(`${WEB_BASE_URL}/mobile/billing?mode=preload`);
        if (token) u.searchParams.set('token', token);
        if (rid) u.searchParams.set('restaurantId', rid);
        // Delay slightly so it doesn't compete with app startup
        setTimeout(() => setUrl(u.toString()), 3000);
      } catch {}
    })();
  }, []);

  if (!url) return null;
  return (
    <View style={{ width: 0, height: 0, overflow: 'hidden', position: 'absolute' }}>
      <WebView
        source={{ uri: url }}
        style={{ width: 0, height: 0 }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        startInLoadingState={false}
        injectedJavaScriptBeforeContentLoaded={`
          window.__DINEOPEN_MOBILE_EMBED__ = true;
          window.__DINEOPEN_BILLING_MODE__ = true;
          true;
        `}
      />
    </View>
  );
}

// Loads terminalLock config from the logged-in restaurant and wraps the app in
// the PIN-lock provider. No-op (pass-through) until posSettings.terminalLock.enabled.
function TerminalLockGate({ children }) {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        const restaurant = userData?.restaurant || null;
        setCfg({
          restaurantId: userData?.restaurantId || restaurant?.id || null,
          restaurantName: restaurant?.name || null,
          terminalLock: restaurant?.posSettings?.terminalLock || null,
        });
      } catch {
        setCfg({ restaurantId: null, restaurantName: null, terminalLock: null });
      }
    })();
  }, []);

  // Always render the Provider (stable tree — no remount of the tabs when config
  // resolves). Until cfg loads it is a pass-through (terminalLock undefined ->
  // enabled=false); once cfg arrives with the lock enabled, the provider locks.
  return (
    <TerminalLockProvider
      restaurantId={cfg?.restaurantId}
      restaurantName={cfg?.restaurantName}
      terminalLock={cfg?.terminalLock}
    >
      {children}
    </TerminalLockProvider>
  );
}

export default function TabsLayout() {
  return (
    <TabModeProvider>
    <TabBarProvider>
      <TerminalLockGate>
        <View style={{ flex: 1 }}>
          <TabsNavigator />
          <BillingPrewarmer />
          <PrinterNotificationOverlay />
          <OrderReadyNotificationOverlay />
        </View>
      </TerminalLockGate>
    </TabBarProvider>
    </TabModeProvider>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
