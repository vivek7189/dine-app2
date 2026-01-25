import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Theme';

export default function AppDrawer({ visible, onClose, user, onLogout }) {
  const router = useRouter();

  const menuItems = [
    {
      title: 'Tables',
      icon: 'restaurant',
      route: '/(tabs)/tables',
      color: Colors.primary,
      restrictedRoles: ['cashier', 'sales'],
    },
    {
      title: 'Menu',
      icon: 'fast-food',
      route: '/(tabs)/menu',
      color: '#10b981',
    },
    {
      title: 'Orders',
      icon: 'receipt',
      route: '/(tabs)/orders',
      color: '#f59e0b',
    },
    {
      title: 'Menu Management',
      icon: 'settings',
      route: '/(tabs)/menu-management',
      color: '#8b5cf6',
      requiresRole: ['owner', 'manager'],
    },
    {
      title: 'Profile',
      icon: 'person',
      route: '/(tabs)/profile',
      color: '#06b6d4',
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

  const shouldShowItem = (item) => {
    if (user?.role && item.restrictedRoles?.includes(user.role.toLowerCase())) return false;
    if (!item.requiresRole) return true;
    if (!user?.role) return false;
    return item.requiresRole.includes(user.role.toLowerCase());
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.drawer}>
          {/* Drawer Header */}
          <View style={styles.drawerHeader}>
            <View style={styles.headerContent}>
              <View style={styles.avatarContainer}>
                <Ionicons name="person" size={32} color="#fff" />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user?.name || 'User'}</Text>
                <Text style={styles.userRole}>{user?.role || 'Staff'}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
            <View style={styles.menuSection}>
              <Text style={styles.sectionTitle}>NAVIGATION</Text>
              {menuItems.filter(shouldShowItem).map((item, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.menuItem}
                  onPress={() => handleNavigate(item.route)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuIconContainer, { backgroundColor: item.color + '15' }]}>
                    <Ionicons name={item.icon} size={24} color={item.color} />
                  </View>
                  <Text style={styles.menuItemText}>{item.title}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Additional Options */}
            <View style={styles.menuSection}>
              <Text style={styles.sectionTitle}>MORE</Text>
              <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
                <View style={[styles.menuIconContainer, { backgroundColor: '#64748b15' }]}>
                  <Ionicons name="help-circle" size={24} color="#64748b" />
                </View>
                <Text style={styles.menuItemText}>Help & Support</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
                <View style={[styles.menuIconContainer, { backgroundColor: '#64748b15' }]}>
                  <Ionicons name="information-circle" size={24} color="#64748b" />
                </View>
                <Text style={styles.menuItemText}>About</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
              </TouchableOpacity>
            </View>

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out" size={24} color="#ef4444" />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Footer */}
          <View style={styles.drawerFooter}>
            <Text style={styles.footerText}>DineOpen Staff</Text>
            <Text style={styles.footerVersion}>Version 1.0.0</Text>
          </View>
        </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  drawer: {
    width: '80%',
    maxWidth: 320,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 16,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    paddingTop: 50,
    backgroundColor: Colors.primary,
  },
  headerContent: {
    flex: 1,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: {
    gap: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  userRole: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'capitalize',
  },
  closeButton: {
    padding: 4,
  },
  menuContainer: {
    flex: 1,
  },
  menuSection: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
    paddingHorizontal: 20,
    paddingBottom: 8,
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 16,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },
  drawerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  footerVersion: {
    fontSize: 12,
    color: Colors.textLight,
  },
});
