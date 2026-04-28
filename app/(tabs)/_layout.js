import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { View, Platform, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import apiClient, { WEB_BASE_URL } from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { TabBarProvider, useTabBar } from '../../contexts/TabBarContext';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { WebView } from 'react-native-webview';

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
        const storedType = userData.restaurant?.businessType;
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
            if (['owner', 'admin', 'waiter', 'manager'].includes(roleLower)) return undefined;
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
            if (['owner', 'admin', 'waiter', 'manager', 'cashier'].includes(roleLower)) return undefined;
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

      {/* Orders — visible to all roles */}
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
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          tabBarBadgeStyle: pendingCount > 0 ? { backgroundColor: '#3b82f6', fontSize: 10 } : undefined,
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

export default function TabsLayout() {
  return (
    <TabBarProvider>
      <View style={{ flex: 1 }}>
        <TabsNavigator />
        <BillingPrewarmer />
      </View>
    </TabBarProvider>
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
