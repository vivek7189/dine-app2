import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';

const BUSINESS_TYPE_LABELS = {
  bar: 'Bar',
  cafe: 'Cafe',
  bakery: 'Bakery',
  hotel: 'Hotel',
  restaurant: 'Restaurant',
};

export default function AppDrawer({
  visible,
  onClose,
  user,
  onLogout,
  restaurants = [],
  currentRestaurantId,
  onSwitchRestaurant,
}) {
  const { r } = useResponsive();
  const router = useRouter();
  const [switching, setSwitching] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const hasMultiple = restaurants.length > 1;
  const currentRestaurant = restaurants.find(r => (r.id || r._id) === currentRestaurantId) || restaurants[0];

  const generalItems = [
    {
      title: 'Home',
      icon: 'home-outline',
      route: '/(tabs)/home',
    },
    {
      title: 'Tables',
      icon: 'grid-outline',
      route: '/(tabs)/tables',
      restrictedRoles: ['cashier', 'sales'],
    },
    {
      title: 'Menu',
      icon: 'restaurant-outline',
      route: '/(tabs)/menu',
    },
    {
      title: 'Orders',
      icon: 'receipt-outline',
      route: '/(tabs)/orders',
    },
  ];

  const managementItems = [
    {
      title: 'Menu Management',
      icon: 'construct-outline',
      route: '/(tabs)/menu-management',
      requiresRole: ['owner', 'manager'],
    },
    {
      title: 'Settings',
      icon: 'settings-outline',
      route: '/(tabs)/profile',
    },
  ];

  const handleNavigate = (route) => {
    onClose();
    setTimeout(() => {
      router.push(route);
    }, 300);
  };

  const handleLogout = () => {
    onClose();
    setTimeout(() => {
      if (onLogout) {
        onLogout();
      }
    }, 300);
  };

  const handleSwitch = async (restaurantId) => {
    if (restaurantId === currentRestaurantId || !onSwitchRestaurant) return;
    setSwitching(restaurantId);
    try {
      await onSwitchRestaurant(restaurantId);
      setExpanded(false);
    } finally {
      setSwitching(null);
    }
  };

  const shouldShowItem = (item) => {
    if (user?.role && item.restrictedRoles?.includes(user.role.toLowerCase())) return false;
    if (!item.requiresRole) return true;
    if (!user?.role) return false;
    return item.requiresRole.includes(user.role.toLowerCase());
  };

  const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const renderMenuItem = (item, index) => (
    <TouchableOpacity
      key={index}
      style={styles.menuItem}
      onPress={() => handleNavigate(item.route)}
      activeOpacity={0.6}
    >
      <Ionicons name={item.icon} size={20} color="#6b7280" />
      <Text style={styles.menuItemText}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.drawer, { maxWidth: r(320, 400) }]}>
          {/* Warm Header Banner */}
          <View style={styles.headerBanner}>
            {/* Top row: brand + close */}
            <View style={styles.headerTopRow}>
              <View style={styles.brandRow}>
                <View style={styles.brandDots}>
                  <Ionicons name="restaurant" size={18} color="#fff" />
                </View>
                <Text style={styles.brandName}>DineOpen</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Avatar */}
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>

            {/* Name + subtitle */}
            <Text style={styles.userName}>{user?.name || 'User'}</Text>
            <Text style={styles.userSubtitle}>
              {currentRestaurant?.name || 'Your Restaurant'}
            </Text>
          </View>

          <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
            {/* Restaurant Switcher (if multiple) */}
            {hasMultiple && (
              <View style={styles.switcherSection}>
                <TouchableOpacity
                  style={styles.switcherCard}
                  onPress={() => setExpanded(!expanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.switcherIcon}>
                    <Ionicons name="swap-horizontal-outline" size={16} color="#8b7355" />
                  </View>
                  <Text style={styles.switcherText}>Switch Restaurant</Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#9ca3af"
                  />
                </TouchableOpacity>

                {expanded && (
                  <View style={styles.restaurantList}>
                    {restaurants.map((rest) => {
                      const restId = rest.id || rest._id;
                      const isSelected = restId === currentRestaurantId;
                      const isSwitching = switching === restId;
                      return (
                        <TouchableOpacity
                          key={restId}
                          style={[
                            styles.restaurantOption,
                            isSelected && styles.restaurantOptionSelected,
                          ]}
                          onPress={() => handleSwitch(restId)}
                          activeOpacity={0.7}
                          disabled={isSelected || !!switching}
                        >
                          <View style={[
                            styles.restaurantDot,
                            { backgroundColor: isSelected ? '#8b7355' : '#d1d5db' },
                          ]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[
                              styles.restaurantOptionName,
                              isSelected && { color: '#8b7355', fontWeight: '700' },
                            ]} numberOfLines={1}>
                              {rest.name}
                            </Text>
                            <Text style={styles.restaurantOptionType}>
                              {BUSINESS_TYPE_LABELS[rest.businessType] || 'Restaurant'}
                            </Text>
                          </View>
                          {isSwitching ? (
                            <ActivityIndicator size="small" color="#8b7355" />
                          ) : isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color="#8b7355" />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* General */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>General</Text>
              {generalItems.filter(shouldShowItem).map(renderMenuItem)}
            </View>

            <View style={styles.sectionDivider} />

            {/* Management */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Management</Text>
              {managementItems.filter(shouldShowItem).map(renderMenuItem)}
            </View>

            <View style={styles.sectionDivider} />

            {/* Sign Out */}
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={20} color="#e5484d" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </ScrollView>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <View style={styles.footerRolePill}>
              <View style={styles.footerRoleDot} />
              <Text style={styles.footerRoleText}>{user?.role || 'Staff'}</Text>
            </View>
            <TouchableOpacity style={styles.footerVersionPill}>
              <Text style={styles.footerVersionText}>v1.6.0</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  drawer: {
    width: '82%',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 24,
  },

  // Header Banner
  headerBanner: {
    backgroundColor: '#8b7355',
    paddingTop: Platform.OS === 'android' ? 48 : 56,
    paddingBottom: 28,
    paddingHorizontal: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDots: {
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
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
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

  // Menu
  menuContainer: {
    flex: 1,
  },

  // Switcher
  switcherSection: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  switcherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: '#faf8f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f0ece6',
  },
  switcherIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#f0ece6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switcherText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  restaurantList: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#faf8f5',
    borderWidth: 1,
    borderColor: '#f0ece6',
    overflow: 'hidden',
  },
  restaurantOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  restaurantOptionSelected: {
    backgroundColor: '#f0ece6',
  },
  restaurantDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  restaurantOptionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  restaurantOptionType: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },

  // Sections
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

  // Menu items
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

  // Sign out
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

  // Footer
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
