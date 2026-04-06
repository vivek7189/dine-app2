import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';

export default function MoreScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { effectivelyOffline, pendingCount, failedCount } = useOffline();
  const tabletContentStyle = isTablet ? { maxWidth: 600, alignSelf: 'center', width: '100%' } : undefined;
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (userData) {
        setUser(userData);
        setRestaurant(userData.restaurant);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const role = user?.role?.toLowerCase() || '';
  const businessType = restaurant?.businessType || user?.restaurant?.businessType || 'restaurant';
  const isOwnerOrManager = ['owner', 'manager', 'admin'].includes(role);
  const isHotelType = businessType === 'hotel';

  const menuSections = [
    {
      title: 'Management',
      items: [
        {
          title: 'Headquarters',
          subtitle: 'Multi-restaurant overview & analytics',
          icon: 'business',
          color: '#6366f1',
          route: '/(tabs)/headquarters',
          roles: ['owner'],
        },
        {
          title: 'Menu Management',
          subtitle: 'Add, edit, and manage menu items',
          icon: 'fast-food',
          color: '#8b5cf6',
          route: '/(tabs)/menu-management',
          roles: ['owner', 'manager', 'admin', 'cashier'],
        },
        {
          title: 'Offers',
          subtitle: 'Happy hour, discounts, BOGO deals',
          icon: 'pricetag',
          color: '#ec4899',
          route: '/(tabs)/offers',
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Customers',
          subtitle: 'Customer list, loyalty points',
          icon: 'people',
          color: '#06b6d4',
          route: '/(tabs)/customers',
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Inventory',
          subtitle: 'Stock levels, usage & recipes',
          icon: 'cube',
          color: '#059669',
          route: '/(tabs)/inventory',
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Kitchen Display',
          subtitle: 'Live kitchen orders & KOT tracking',
          icon: 'flame',
          color: '#ef4444',
          route: '/(tabs)/kitchen',
          roles: ['owner', 'manager', 'admin', 'waiter', 'employee'],
        },
        {
          title: 'Google Reviews',
          subtitle: 'Manage, reply & collect reviews',
          icon: 'star',
          color: '#ea4335',
          route: { pathname: '/(tabs)/webview', params: { url: 'https://www.dineopen.com/admin?tab=google-reviews', title: 'Google Reviews' } },
          roles: ['owner', 'manager', 'admin'],
        },
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          title: 'Books',
          subtitle: 'Accounting & financial reports',
          icon: 'book',
          color: '#10b981',
          route: { pathname: '/(tabs)/webview', params: { url: 'https://www.dineopen.com/books', title: 'Books' } },
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Invoices',
          subtitle: 'Create & manage invoices',
          icon: 'document-text',
          color: '#3b82f6',
          route: { pathname: '/(tabs)/webview', params: { url: 'https://www.dineopen.com/invoice/dashboard', title: 'Invoices' } },
          roles: ['owner', 'manager', 'admin'],
        },
      ],
    },
    {
      title: 'History & Reports',
      items: [
        {
          title: 'Order History',
          subtitle: 'Past orders and revenue',
          icon: 'time',
          color: '#f59e0b',
          route: '/(tabs)/order-history',
          roles: null, // all roles
        },
      ],
    },
    ...(isHotelType
      ? [
          {
            title: 'Hotel',
            items: [
              {
                title: 'Hotel Management',
                subtitle: 'Rooms, bookings, check-in/out',
                icon: 'bed',
                color: '#3b82f6',
                route: '/(tabs)/hotel',
                roles: null,
              },
            ],
          },
        ]
      : []),
    {
      title: 'Settings',
      items: [
        {
          title: 'Settings',
          subtitle: 'Tax, business info, zone pricing',
          icon: 'settings',
          color: '#6b7280',
          route: '/(tabs)/profile',
          roles: null,
        },
      ],
    },
  ];

  const shouldShowItem = (item) => {
    if (!item.roles) return true; // null = all roles
    if (!role) return false;
    return item.roles.includes(role);
  };

  const handleNavigate = (route) => {
    router.push(route);
  };

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.scrollContent, tabletContentStyle]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>More</Text>
        </View>

        {/* User Card */}
        <TouchableOpacity style={styles.userCard} onPress={() => router.push('/(tabs)/profile')}>
          <View style={styles.userAvatar}>
            <Ionicons name="person" size={28} color={Colors.primary} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name || 'Staff Member'}</Text>
            <Text style={styles.userRole}>
              {role.charAt(0).toUpperCase() + role.slice(1) || 'Staff'}
              {restaurant?.name ? ` · ${restaurant.name}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
        </TouchableOpacity>

        {/* Offline / Sync Status */}
        {(effectivelyOffline || pendingCount > 0 || failedCount > 0) && (
          <View style={[styles.sectionCard, { marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <Ionicons name={effectivelyOffline ? 'cloud-offline' : 'cloud-done'} size={22} color={effectivelyOffline ? '#f59e0b' : '#22c55e'} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textDark }}>
                {effectivelyOffline ? 'Offline Mode' : 'Online'}
              </Text>
              {(pendingCount > 0 || failedCount > 0) && (
                <Text style={{ fontSize: 12, color: Colors.textMedium, marginTop: 1 }}>
                  {pendingCount > 0 ? `${pendingCount} pending` : ''}{pendingCount > 0 && failedCount > 0 ? ' · ' : ''}{failedCount > 0 ? `${failedCount} failed` : ''}
                </Text>
              )}
            </View>
            {pendingCount > 0 && (
              <View style={{ backgroundColor: '#3b82f6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{pendingCount}</Text>
              </View>
            )}
          </View>
        )}

        {/* Menu Sections */}
        {menuSections.map((section) => {
          const visibleItems = section.items.filter(shouldShowItem);
          if (visibleItems.length === 0) return null;

          return (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.sectionCard}>
                {visibleItems.map((item, index) => (
                  <TouchableOpacity
                    key={item.title}
                    style={[
                      styles.menuItem,
                      index < visibleItems.length - 1 && styles.menuItemBorder,
                    ]}
                    onPress={() => handleNavigate(item.route)}
                  >
                    <View style={[styles.menuItemIcon, { backgroundColor: item.color + '15' }]}>
                      <Ionicons name={item.icon} size={22} color={item.color} />
                    </View>
                    <View style={styles.menuItemContent}>
                      <Text style={styles.menuItemTitle}>{item.title}</Text>
                      <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>DineOpen v1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.textDark,
  },
  // User Card
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.large,
    marginBottom: Spacing.lg,
    ...Shadows.small,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  userRole: {
    ...Typography.small,
    color: Colors.textMedium,
    marginTop: 2,
  },
  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.small,
    color: Colors.textLight,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.large,
    ...Shadows.small,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    fontSize: 15,
  },
  menuItemSubtitle: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 1,
  },
  // Logout
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: Colors.error + '30',
    marginBottom: Spacing.md,
  },
  logoutText: {
    ...Typography.bodyBold,
    color: Colors.error,
    fontSize: 15,
  },
  versionText: {
    ...Typography.small,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
});
