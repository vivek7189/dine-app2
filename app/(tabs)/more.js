import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient, { WEB_BASE_URL } from '../../services/api';
import restaurantEvents from '../../services/restaurantEvents';
import { Colors } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';

export default function MoreScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const { effectivelyOffline, pendingCount, failedCount } = useOffline();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  // Listen for restaurant switch from other tabs
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
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const role = user?.role?.toLowerCase() || '';
  const businessType = restaurant?.businessType || user?.restaurant?.businessType || 'restaurant';
  const isOwnerOrManager = ['owner', 'manager', 'admin'].includes(role);
  const isHotelType = businessType === 'hotel';
  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const menuSections = [
    {
      title: 'Management',
      items: [
        {
          title: 'Headquarters',
          icon: 'analytics-outline',
          route: '/(tabs)/headquarters',
          roles: ['owner'],
        },
        {
          title: 'Menu Management',
          icon: 'restaurant-outline',
          route: '/(tabs)/menu-management',
          roles: ['owner', 'manager', 'admin', 'cashier'],
        },
        {
          title: 'Customers',
          icon: 'people-outline',
          route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/customers`, title: 'Customers' } },
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Inventory',
          icon: 'cube-outline',
          route: '/(tabs)/inventory',
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Kitchen Display',
          icon: 'flame-outline',
          route: '/(tabs)/kitchen',
          roles: ['owner', 'manager', 'admin', 'waiter', 'employee'],
        },
        {
          title: 'Google Reviews',
          icon: 'star-outline',
          route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/admin?tab=google-reviews`, title: 'Google Reviews' } },
          roles: ['owner', 'manager', 'admin'],
        },
      ],
    },
    {
      title: 'Finance',
      items: [
        {
          title: 'Books',
          icon: 'book-outline',
          route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/books`, title: 'Books' } },
          roles: ['owner', 'manager', 'admin'],
        },
        {
          title: 'Invoices',
          icon: 'document-text-outline',
          route: { pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile/invoice`, title: 'Invoices' } },
          roles: ['owner', 'manager', 'admin'],
        },
      ],
    },
    {
      title: 'History',
      items: [
        {
          title: 'Order History',
          icon: 'time-outline',
          route: '/(tabs)/order-history',
          roles: null,
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
                icon: 'bed-outline',
                route: '/(tabs)/hotel',
                roles: null,
              },
            ],
          },
        ]
      : []),
    {
      title: 'Account',
      items: [
        {
          title: 'Settings',
          icon: 'settings-outline',
          route: '/(tabs)/profile',
          roles: null,
        },
      ],
    },
  ];

  const shouldShowItem = (item) => {
    if (!item.roles) return true;
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ── Branded Header Banner ──────────────────── */}
        <View style={styles.headerBanner}>
          {/* Brand row */}
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Ionicons name="restaurant" size={18} color="#fff" />
            </View>
            <Text style={styles.brandName}>DineOpen</Text>
          </View>

          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>

          {/* User info */}
          <Text style={styles.userName}>{user?.name || 'Staff Member'}</Text>
          <Text style={styles.userSubtitle}>
            {restaurant?.name || 'Your Restaurant'}
          </Text>
        </View>

        {/* ── Sync Status (conditional) ──────────────── */}
        {(effectivelyOffline || pendingCount > 0 || failedCount > 0) && (
          <View style={styles.syncCard}>
            <View style={[styles.syncIcon, { backgroundColor: effectivelyOffline ? '#fef3c7' : '#ecfdf5' }]}>
              <Ionicons
                name={effectivelyOffline ? 'cloud-offline-outline' : 'cloud-done-outline'}
                size={20}
                color={effectivelyOffline ? '#d97706' : '#10b981'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncTitle}>
                {effectivelyOffline ? 'Offline Mode' : 'Online'}
              </Text>
              {(pendingCount > 0 || failedCount > 0) && (
                <Text style={styles.syncSubtitle}>
                  {pendingCount > 0 ? `${pendingCount} pending` : ''}{pendingCount > 0 && failedCount > 0 ? ' · ' : ''}{failedCount > 0 ? `${failedCount} failed` : ''}
                </Text>
              )}
            </View>
            {pendingCount > 0 && (
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Menu Sections ──────────────────────────── */}
        {menuSections.map((section, sectionIndex) => {
          const visibleItems = section.items.filter(shouldShowItem);
          if (visibleItems.length === 0) return null;

          return (
            <View key={section.title}>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>{section.title}</Text>
                {visibleItems.map((item) => (
                  <TouchableOpacity
                    key={item.title}
                    style={styles.menuItem}
                    onPress={() => handleNavigate(item.route)}
                    activeOpacity={0.6}
                  >
                    <Ionicons name={item.icon} size={20} color="#6b7280" />
                    <Text style={styles.menuItemText}>{item.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sectionDivider} />
            </View>
          );
        })}

        {/* ── Sign Out ───────────────────────────────── */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color="#e5484d" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Footer ─────────────────────────────────── */}
      <View style={styles.footer}>
        <View style={styles.footerRolePill}>
          <View style={styles.footerRoleDot} />
          <Text style={styles.footerRoleText}>{role || 'Staff'}</Text>
        </View>
        <TouchableOpacity style={styles.footerVersionPill}>
          <Text style={styles.footerVersionText}>v1.6.0</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  userSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },

  // ── Sync Card ───────────────────────────────────
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: '#faf8f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0ece6',
  },
  syncIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  syncSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },
  syncBadge: {
    backgroundColor: '#8b7355',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: 'center',
  },
  syncBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Sections ────────────────────────────────────
  section: {
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    paddingHorizontal: 22,
    marginBottom: 6,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 22,
    marginTop: 8,
  },

  // ── Menu Items ──────────────────────────────────
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 13,
    gap: 14,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },

  // ── Sign Out ────────────────────────────────────
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 8,
    gap: 14,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e5484d',
  },

  // ── Footer ──────────────────────────────────────
  footer: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingBottom: Platform.OS === 'android' ? 16 : 28,
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
    borderColor: '#e5e7eb',
  },
  footerVersionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
});
