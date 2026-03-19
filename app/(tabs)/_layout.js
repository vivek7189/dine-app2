import { Tabs, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Theme';
import apiClient from '../../services/api';

export default function TabsLayout() {
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
        setBusinessType(userData.restaurant?.businessType || 'restaurant');
      }
    };
    checkAuth();
  }, []);

  const roleLower = userRole?.toLowerCase() || '';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E5E5',
          borderTopWidth: 1,
          height: 75,
          paddingBottom: 20,
          paddingTop: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginTop: 5,
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
              size={26}
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
              size={26}
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
              size={26}
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
              size={26}
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
              size={26}
              color={color}
            />
          ),
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
              size={26}
              color={color}
            />
          ),
        }}
      />

      {/* === Hidden tabs — accessible via More screen navigation but not shown in tab bar === */}

      {/* Hotel — accessed from More screen */}
      <Tabs.Screen
        name="hotel"
        options={{
          href: null, // Always hidden from tab bar
        }}
      />

      {/* Menu Management — accessed from More screen */}
      <Tabs.Screen
        name="menu-management"
        options={{
          href: null, // Always hidden from tab bar
        }}
      />

      {/* Offers — accessed from More screen */}
      <Tabs.Screen
        name="offers"
        options={{
          href: null, // Always hidden from tab bar
        }}
      />

      {/* Profile/Settings — accessed from More screen */}
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Always hidden from tab bar
        }}
      />
    </Tabs>
  );
}
