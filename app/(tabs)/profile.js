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
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../../services/api';
import { resetDatabase } from '../../services/db';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import SettingsHub from '../../components/SettingsHub';
import { useResponsive } from '../../hooks/useResponsive';
import { useOffline } from '../../hooks/useOffline';
import SyncDetailsSheet from '../../components/SyncDetailsSheet';
import { hasPin, setPin, clearPin } from '../../services/pinLock';

export default function ProfileScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const tabletContentStyle = isTablet ? { maxWidth: 600, alignSelf: 'center', width: '100%' } : undefined;
  const { isOnline, isOfflineMode, effectivelyOffline, pendingCount, failedCount, lastSyncAt, toggleOfflineMode, triggerSync } = useOffline();
  const [showSyncSheet, setShowSyncSheet] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinInput, setPinInput] = useState('');
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
    hasPin().then(setPinEnabled);
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

  const handleClearDataAndLogout = () => {
    Alert.alert(
      'Clear All Data & Logout',
      'This will delete all locally stored data including cached menus, orders, offline data, and log you out. This cannot be undone.\n\nAre you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear & Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Clear in-memory API cache
              apiClient.clearAllCache?.();
              // 2. Clear SQLite offline database
              await resetDatabase();
              // 3. Clear ALL AsyncStorage (auth, cache, preferences, everything)
              await AsyncStorage.clear();
              // 4. Navigate to login
              router.replace('/(auth)/login');
            } catch (e) {
              console.error('Clear data error:', e);
              // Fallback: at least try to logout normally
              await apiClient.logout();
              router.replace('/(auth)/login');
            }
          },
        },
      ]
    );
  };

  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Your account and all associated data will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            // Second confirmation
            Alert.alert(
              'Are you sure?',
              'This is permanent. You will lose access to all restaurants and data linked to this account.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true);
                    try {
                      await apiClient.deleteAccount();
                      await apiClient.logout();
                      await AsyncStorage.clear();
                      router.replace('/(auth)/login');
                    } catch (error) {
                      console.error('Delete account error:', error);
                      Alert.alert('Error', 'Failed to delete account. Please try again.');
                      setDeletingAccount(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const getRoleDisplayName = (role) => {
    switch (role?.toLowerCase()) {
      case 'owner': return 'Owner';
      case 'admin': return 'Admin';
      case 'manager': return 'Manager';
      case 'waiter': return 'Waiter';
      case 'employee': return 'Employee';
      case 'cashier': return 'Cashier';
      case 'sales': return 'Sales';
      default: return role || 'Staff';
    }
  };

  // Check if user is a staff member (can change password via staff API)
  const isStaffMember = () => {
    if (!user) return false;
    const role = user.role?.toLowerCase();
    const hasLoginId = !!user.loginId;
    const isStaffRole = ['admin', 'waiter', 'manager', 'employee', 'cashier', 'sales'].includes(role);
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
      <ScrollView contentContainerStyle={[styles.content, tabletContentStyle]}>
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

        {/* Connectivity & Offline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connectivity</Text>
          <View style={styles.settingsCard}>
            {/* Status */}
            <View style={styles.connectivityRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
                <Text style={styles.connectivityLabel}>{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
              {lastSyncAt && (
                <Text style={styles.connectivityMeta}>
                  Last synced: {(() => {
                    const diff = Date.now() - lastSyncAt;
                    if (diff < 60000) return 'Just now';
                    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                    return `${Math.floor(diff / 3600000)}h ago`;
                  })()}
                </Text>
              )}
            </View>

            {/* Offline Toggle */}
            <TouchableOpacity
              style={styles.connectivityRow}
              onPress={() => toggleOfflineMode()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={isOfflineMode ? 'cloud-offline' : 'cloud-done'} size={20} color={isOfflineMode ? '#f59e0b' : '#22c55e'} />
                <View>
                  <Text style={styles.connectivityLabel}>Offline Mode</Text>
                  <Text style={styles.connectivityMeta}>Work without internet. Changes sync later.</Text>
                </View>
              </View>
              <View style={[styles.toggleTrack, isOfflineMode && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, isOfflineMode && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            {/* Download Data */}
            {getRestaurantId() && (
              <TouchableOpacity
                style={styles.connectivityRow}
                disabled={seedingData || !isOnline}
                onPress={async () => {
                  setSeedingData(true);
                  try {
                    const result = await apiClient.seedOfflineData(getRestaurantId());
                    Alert.alert(
                      result.success ? 'Data Downloaded' : 'Partial Download',
                      result.success
                        ? 'All data saved for offline use.'
                        : `Some data failed to download: ${result.errors.join(', ')}`
                    );
                  } catch (e) {
                    Alert.alert('Error', 'Failed to download data: ' + e.message);
                  } finally {
                    setSeedingData(false);
                  }
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="download-outline" size={20} color={Colors.primary} />
                  <View>
                    <Text style={styles.connectivityLabel}>Download Data for Offline</Text>
                    <Text style={styles.connectivityMeta}>Pre-load menu, tables, customers</Text>
                  </View>
                </View>
                {seedingData ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
                )}
              </TouchableOpacity>
            )}

            {/* Sync Status — always visible */}
            <TouchableOpacity
              style={styles.connectivityRow}
              onPress={() => setShowSyncSheet(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons
                  name={failedCount > 0 ? 'alert-circle' : pendingCount > 0 ? 'sync' : 'checkmark-circle'}
                  size={20}
                  color={failedCount > 0 ? '#ef4444' : pendingCount > 0 ? '#f59e0b' : '#22c55e'}
                />
                <View>
                  <Text style={styles.connectivityLabel}>Sync Status</Text>
                  <Text style={styles.connectivityMeta}>
                    {failedCount > 0
                      ? `${failedCount} failed, ${pendingCount} pending`
                      : pendingCount > 0
                        ? `${pendingCount} changes pending sync`
                        : 'All changes synced'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </TouchableOpacity>

            {/* Manual Sync Button */}
            {(pendingCount > 0 || failedCount > 0) && (
              <TouchableOpacity
                style={[styles.connectivityRow, { backgroundColor: failedCount > 0 ? '#fef2f2' : '#f0f9ff' }]}
                onPress={async () => {
                  try {
                    await triggerSync();
                    Alert.alert('Sync Started', 'Syncing pending changes...');
                  } catch (e) {
                    Alert.alert('Sync Error', e.message);
                  }
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="refresh" size={20} color={failedCount > 0 ? '#ef4444' : '#3b82f6'} />
                  <Text style={[styles.connectivityLabel, { color: failedCount > 0 ? '#ef4444' : '#3b82f6' }]}>
                    {failedCount > 0 ? 'Retry Failed Syncs' : 'Sync Now'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Offline PIN Lock */}
            <TouchableOpacity
              style={[styles.connectivityRow, { borderBottomWidth: 0 }]}
              onPress={() => {
                if (pinEnabled) {
                  Alert.alert('Remove PIN?', 'This will disable offline PIN lock.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        await clearPin();
                        setPinEnabled(false);
                      },
                    },
                  ]);
                } else {
                  setShowPinSetup(true);
                  setPinInput('');
                }
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="lock-closed-outline" size={20} color={pinEnabled ? '#f59e0b' : Colors.textMedium} />
                <View>
                  <Text style={styles.connectivityLabel}>Offline PIN Lock</Text>
                  <Text style={styles.connectivityMeta}>
                    {pinEnabled ? 'PIN set — tap to remove' : 'Set a 4-digit PIN for offline access'}
                  </Text>
                </View>
              </View>
              {pinEnabled ? (
                <View style={[styles.toggleTrack, styles.toggleTrackActive]}>
                  <View style={[styles.toggleThumb, styles.toggleThumbActive]} />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              )}
            </TouchableOpacity>

            {/* PIN Setup Inline */}
            {showPinSetup && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                <Text style={{ fontSize: 13, color: Colors.textMedium, marginBottom: 8 }}>
                  Enter a 4-digit PIN:
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    style={{
                      flex: 1,
                      backgroundColor: '#f3f4f6',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 18,
                      letterSpacing: 8,
                      textAlign: 'center',
                      fontWeight: '700',
                    }}
                    value={pinInput}
                    onChangeText={(t) => setPinInput(t.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                    placeholder="····"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={{
                      backgroundColor: pinInput.length === 4 ? Colors.primary : '#d1d5db',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 8,
                    }}
                    disabled={pinInput.length !== 4}
                    onPress={async () => {
                      await setPin(pinInput);
                      setPinEnabled(true);
                      setShowPinSetup(false);
                      setPinInput('');
                      Alert.alert('PIN Set', 'Your offline PIN lock is now active.');
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Set</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setShowPinSetup(false);
                      setPinInput('');
                    }}
                  >
                    <Ionicons name="close-circle" size={24} color={Colors.textLight} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>

        <SyncDetailsSheet visible={showSyncSheet} onClose={() => setShowSyncSheet(false)} />

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
          <TouchableOpacity style={styles.clearDataButton} onPress={handleClearDataAndLogout}>
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <Text style={styles.clearDataButtonText}>Clear Data & Logout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Ionicons name="person-remove-outline" size={20} color={Colors.error} />
            )}
            <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
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
  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
  },
  connectivityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  connectivityLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  connectivityMeta: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: '#f59e0b',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  clearDataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.error,
    backgroundColor: '#fff',
    marginBottom: Spacing.sm,
  },
  clearDataButtonText: {
    color: Colors.error,
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
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
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    marginTop: Spacing.lg,
  },
  deleteAccountButtonText: {
    color: Colors.error,
    fontSize: Typography.body.fontSize,
    fontWeight: '500',
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
