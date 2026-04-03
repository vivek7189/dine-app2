import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import SettingsHub from '../../components/SettingsHub';

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');

  // Tip earnings
  const [tipData, setTipData] = useState(null);
  const [billingSettings, setBillingSettings] = useState({});

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

      // Load billing settings to check if tips enabled
      const rid = userData?.restaurantId || userData?.restaurant?.id;
      if (rid) {
        apiClient.getBillingSettings(rid)
          .then(res => {
            const bs = res?.billingSettings || res || {};
            setBillingSettings(bs);
            // Load tip data if tips enabled
            if (bs.tipsEnabled && userData?.id) {
              apiClient.getStaffTips(userData.id)
                .then(tipRes => setTipData(tipRes))
                .catch(() => setTipData(null));
            }
          })
          .catch(() => setBillingSettings({}));
      }
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
            await apiClient.logout();
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

  // Check if user is a staff member (can change password via staff API)
  const isStaffMember = () => {
    if (!user) return false;
    const role = user.role?.toLowerCase();
    const hasLoginId = !!user.loginId;
    const isStaffRole = ['waiter', 'manager', 'employee', 'cashier', 'sales'].includes(role);
    return hasLoginId && isStaffRole;
  };

  // Get restaurant ID for settings
  const getRestaurantId = () => {
    return user?.restaurantId || user?.restaurant?.id || restaurant?.id;
  };

  const handlePasswordChange = async () => {
    // Reset error
    setPasswordChangeError('');

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordChangeError('All fields are required');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordChangeError('New password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordChangeError('New password and confirmation do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordChangeError('New password must be different from current password');
      return;
    }

    setPasswordChangeLoading(true);

    try {
      await apiClient.changeStaffPassword(
        user?.loginId,
        currentPassword,
        newPassword,
        confirmPassword
      );
      
      Alert.alert(
        'Success',
        'Password changed successfully!',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowPasswordChange(false);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            },
          },
        ]
      );
    } catch (error) {
      setPasswordChangeError(error.message || 'Failed to change password');
    } finally {
      setPasswordChangeLoading(false);
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
            {user?.username && (
              <View style={styles.infoRow}>
                <Ionicons name="person-outline" size={20} color={Colors.textMedium} />
                <Text style={styles.infoLabel}>Username</Text>
                <Text style={styles.infoValue}>{user.username}</Text>
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

        {/* Reset / Change Password Section - for all staff (waiter, manager, employee, cashier, sales) */}
        {isStaffMember() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Security</Text>
            <View style={styles.infoCard}>
              <Text style={styles.securityHint}>Reset your password. Enter your current password, then set a new one.</Text>
              {!showPasswordChange ? (
                <TouchableOpacity
                  style={styles.changePasswordButton}
                  onPress={() => setShowPasswordChange(true)}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} />
                  <Text style={styles.changePasswordButtonText}>Change Password</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.passwordChangeForm}>
                  <Text style={styles.passwordChangeTitle}>Change Password</Text>
                  
                  {passwordChangeError ? (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>{passwordChangeError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Current Password</Text>
                    <TextInput
                      style={styles.input}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="Enter current password"
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!passwordChangeLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Enter new password (min 6 characters)"
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!passwordChangeLoading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm new password"
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!passwordChangeLoading}
                    />
                  </View>

                  <View style={styles.passwordChangeActions}>
                    <TouchableOpacity
                      style={[styles.passwordChangeButton, styles.cancelButton]}
                      onPress={() => {
                        setShowPasswordChange(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordChangeError('');
                      }}
                      disabled={passwordChangeLoading}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.passwordChangeButton, styles.submitButton, passwordChangeLoading && styles.submitButtonDisabled]}
                      onPress={handlePasswordChange}
                      disabled={passwordChangeLoading}
                    >
                      {passwordChangeLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.submitButtonText}>Change Password</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Tip Earnings */}
        {billingSettings.tipsEnabled && tipData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tip Earnings</Text>
            <View style={styles.infoCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#059669' }}>₹{tipData.totalTips || tipData.tipEarnings || 0}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMedium, marginTop: 2 }}>Total Tips</Text>
                </View>
                <View style={{ width: 1, backgroundColor: '#e5e7eb' }} />
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: '#ec4899' }}>₹{tipData.thisMonthTips || 0}</Text>
                  <Text style={{ fontSize: 12, color: Colors.textMedium, marginTop: 2 }}>This Month</Text>
                </View>
              </View>
              {tipData.tipHistory && tipData.tipHistory.length > 0 && (
                <View style={{ borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textDark, marginBottom: 6 }}>Recent Tips</Text>
                  {tipData.tipHistory.slice(0, 5).map((tip, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: Colors.textMedium }}>
                        #{tip.orderNumber} - {new Date(tip.date).toLocaleDateString()}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>₹{tip.amount}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Settings Hub - iPhone-style settings navigation */}
        {getRestaurantId() && user && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <SettingsHub
              restaurantId={getRestaurantId()}
              user={user}
              restaurant={restaurant}
              onRestaurantChange={(data) => {
                if (data && restaurant) {
                  setRestaurant({ ...restaurant, ...data });
                }
              }}
            />
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
          <Text style={styles.footerText}>DineOpen Staff App</Text>
          <Text style={styles.footerText}>Version 1.1.5</Text>
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
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.sm,
  },
  changePasswordButtonText: {
    color: Colors.primary,
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
  securityHint: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: Spacing.sm,
  },
  passwordChangeForm: {
    gap: Spacing.md,
  },
  passwordChangeTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#dc2626',
    fontSize: Typography.caption.fontSize,
  },
  inputContainer: {
    gap: Spacing.xs,
  },
  inputLabel: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    fontWeight: '600',
  },
  input: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.small,
    padding: Spacing.sm,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
  },
  passwordChangeActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  passwordChangeButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  cancelButtonText: {
    color: Colors.textDark,
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
  submitButton: {
    backgroundColor: Colors.primary,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
});
