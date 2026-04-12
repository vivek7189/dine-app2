import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Platform, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Theme';
import apiClient from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import { TabBarProvider, useTabBar } from '../../contexts/TabBarContext';
import { BottomTabBar } from '@react-navigation/bottom-tabs';

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
          // Hide for simple mode roles
          href: roleLower && ['cashier', 'sales'].includes(roleLower) ? null : undefined,
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
          href: businessType === 'bar' ? null : undefined,
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
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <TabBarProvider>
      <View style={{ flex: 1 }}>
        <TabsNavigator />
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
