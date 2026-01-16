import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      setRestaurant(userData.restaurant);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
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
            await apiClient.clearToken();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const getRoleDisplayName = (role) => {
    switch (role?.toLowerCase()) {
      case 'owner':
        return 'Owner';
      case 'manager':
        return 'Manager';
      case 'waiter':
        return 'Waiter';
      case 'employee':
        return 'Employee';
      default:
        return role || 'Staff';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color={Colors.primary} />
          </View>
          {user && (
            <>
              <Text style={styles.name}>{user.name || 'Staff Member'}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{getRoleDisplayName(user.role)}</Text>
              </View>
            </>
          )}
        </View>

        {/* User Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={20} color={Colors.textMedium} />
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{user?.email || 'N/A'}</Text>
            </View>
            {user?.phone && (
              <View style={styles.infoRow}>
                <Ionicons name="call-outline" size={20} color={Colors.textMedium} />
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{user.phone}</Text>
              </View>
            )}
            {user?.loginId && (
              <View style={styles.infoRow}>
                <Ionicons name="id-card-outline" size={20} color={Colors.textMedium} />
                <Text style={styles.infoLabel}>User ID</Text>
                <Text style={styles.infoValue}>{user.loginId}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Restaurant Info */}
        {restaurant && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Restaurant</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="restaurant-outline" size={20} color={Colors.textMedium} />
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{restaurant.name || 'N/A'}</Text>
              </View>
              {restaurant.address && (
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color={Colors.textMedium} />
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{restaurant.address}</Text>
                </View>
              )}
              {restaurant.phone && (
                <View style={styles.infoRow}>
                  <Ionicons name="call-outline" size={20} color={Colors.textMedium} />
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{restaurant.phone}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>DineOpen Waiter App</Text>
          <Text style={styles.footerText}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  content: {
    padding: Spacing.md,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.large,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  name: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  roleBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  roleText: {
    color: '#fff',
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    minWidth: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
    fontWeight: '500',
    textAlign: 'right',
  },
  logoutButton: {
    backgroundColor: Colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: Typography.small.fontSize,
    color: Colors.textLight,
  },
});
