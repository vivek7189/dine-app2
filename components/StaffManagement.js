import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';
import { ADMIN_TAB_OPS, ADMIN_TAB_LABELS } from '../utils/permissions';

const STORAGE_KEY = 'dine_staff_list';

const ROLES = ['admin', 'manager', 'waiter', 'cashier', 'employee'];
const ROLE_FILTERS = ['all', ...ROLES];

// SYNC: Keep in sync with dine-backend/index.js and dine-frontend/src/app/(dashboard)/admin/page.js
const ROLE_DEFAULT_PAGE_ACCESS = {
  admin:    { dashboard:true, history:true, tables:true, menu:true, analytics:true, inventory:true, kot:true, admin:{ settings:true, tax:true, pricing:true, payments:true, billingSettings:true, currency:true, print:true, features:true, restaurants:true, staff:true, orderManagement:true, offers:true, loyalty:true, googleReviews:true, whatsapp:true }, completeBill:true, invoice:true, customers:true, offers:true, printer:true },
  manager:  { dashboard:true, history:true, tables:true, menu:true, analytics:true, inventory:true, kot:true, admin:false, completeBill:true, invoice:true, customers:true, offers:true, printer:true },
  waiter:   { dashboard:true, history:true, tables:true, menu:true, analytics:false, inventory:false, kot:false, admin:false, completeBill:false, invoice:false, customers:false, offers:false, printer:true },
  cashier:  { dashboard:true, history:true, tables:false, menu:true, analytics:false, inventory:false, kot:false, admin:false, completeBill:true, invoice:true, customers:false, offers:false, printer:true },
  employee: { dashboard:true, history:true, tables:true, menu:true, analytics:false, inventory:false, kot:false, admin:false, completeBill:false, invoice:false, customers:false, offers:false, printer:true },
  sales:    { dashboard:true, history:true, tables:false, menu:true, analytics:false, inventory:false, kot:false, admin:false, completeBill:false, invoice:false, customers:true, offers:true, printer:true },
};

const ROLE_DESCRIPTIONS = {
  admin:    'Full access like owner. Can manage multiple locations. Owner can restrict.',
  manager:  'Elevated staff. Most features except admin settings.',
  waiter:   'Service staff. Tables, orders, and menu access.',
  cashier:  'Billing staff. POS, orders, and invoices.',
  employee: 'Basic staff. Only granted access.',
  sales:    'Sales staff. Customers and offers.',
};

const DEFAULT_PAGE_ACCESS = ROLE_DEFAULT_PAGE_ACCESS.employee;
const ALL_ADMIN_TABS = Object.fromEntries(ADMIN_TAB_OPS.map(k => [k, true]));

const PAGE_ACCESS_OPTIONS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline' },
  { key: 'history', label: 'Orders', icon: 'receipt-outline' },
  { key: 'tables', label: 'Tables', icon: 'tablet-landscape-outline' },
  { key: 'menu', label: 'Menu', icon: 'restaurant-outline' },
  { key: 'analytics', label: 'Analytics', icon: 'bar-chart-outline' },
  { key: 'inventory', label: 'Inventory', icon: 'cube-outline' },
  { key: 'kot', label: 'KOT / Kitchen', icon: 'flame-outline' },
  { key: 'admin', label: 'Admin', icon: 'settings-outline' },
  { key: 'completeBill', label: 'Complete Bill', icon: 'checkmark-circle-outline' },
  { key: 'invoice', label: 'Invoices', icon: 'document-text-outline' },
  { key: 'customers', label: 'Customers', icon: 'people-outline' },
  { key: 'offers', label: 'Offers', icon: 'pricetag-outline' },
];

export default function StaffManagement({ restaurantId }) {
  const [staff, setStaff] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(restaurantId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [showCredentials, setShowCredentials] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Form fields
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('waiter');
  const [formAddress, setFormAddress] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formPageAccess, setFormPageAccess] = useState({ ...DEFAULT_PAGE_ACCESS });

  useEffect(() => {
    loadRestaurants();
  }, []);

  useEffect(() => {
    loadStaff();
  }, [selectedRestaurantId]);

  const loadRestaurants = async () => {
    try {
      const response = await apiClient.getRestaurants();
      setRestaurants(response.restaurants || []);
    } catch (error) {
      console.error('Error fetching restaurants:', error);
    }
  };

  const loadStaff = async () => {
    if (!selectedRestaurantId) return;
    setLoading(true);
    try {
      const cached = await AsyncStorage.getItem(`${STORAGE_KEY}_${selectedRestaurantId}`);
      if (cached) {
        setStaff(JSON.parse(cached));
        setLoading(false);
      }
      fetchStaff();
    } catch {
      fetchStaff();
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await apiClient.getStaffList({ restaurantId: selectedRestaurantId });
      const list = response.staff || [];
      setStaff(list);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${selectedRestaurantId}`, JSON.stringify(list));
    } catch (error) {
      console.error('Error fetching staff:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtered staff
  const filteredStaff = useMemo(() => {
    let list = staff;
    if (filterRole !== 'all') {
      list = list.filter((s) => s.role === filterRole);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.phone || '').includes(q) ||
          (s.email || '').toLowerCase().includes(q) ||
          (s.loginId || '').includes(q)
      );
    }
    return list;
  }, [staff, filterRole, searchQuery]);

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormRole('waiter');
    setFormAddress('');
    setFormUsername('');
    setFormStartDate('');
    setFormPageAccess({ ...DEFAULT_PAGE_ACCESS });
    setEditingStaff(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (member) => {
    setFormName(member.name || '');
    setFormPhone(member.phone || '');
    setFormEmail(member.email || '');
    setFormRole(member.role || 'waiter');
    setFormAddress(member.address || '');
    setFormUsername(member.username || '');
    setFormStartDate(member.startDate || '');
    setFormPageAccess(member.pageAccess || { ...DEFAULT_PAGE_ACCESS });
    setEditingStaff(member);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (!formPhone.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        role: formRole,
        address: formAddress.trim(),
        username: formUsername.trim(),
        startDate: formStartDate.trim(),
        pageAccess: formPageAccess,
      };

      if (editingStaff) {
        await apiClient.updateStaff(editingStaff.id, data);
        Alert.alert('Success', 'Staff member updated');
      } else {
        const response = await apiClient.addStaff(selectedRestaurantId, data);
        if (response.credentials) {
          setShowCredentials(response.credentials);
        }
        Alert.alert('Success', 'Staff member added');
      }
      setShowAddModal(false);
      resetForm();
      fetchStaff();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (member) => {
    Alert.alert('Delete Staff', `Are you sure you want to remove ${member.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteStaff(member.id);
            fetchStaff();
            Alert.alert('Success', 'Staff member removed');
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to delete');
          }
        },
      },
    ]);
  };

  const handleToggleStatus = async (member) => {
    const newStatus = member.status === 'active' ? 'inactive' : 'active';
    try {
      await apiClient.updateStaffStatus(member.id, newStatus);
      fetchStaff();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update status');
    }
  };

  const handleViewCredentials = async (member) => {
    setCredentialsLoading(true);
    setShowPassword(false);
    try {
      const response = await apiClient.getStaffCredentials(member.id);
      setShowCredentials({
        loginId: response.loginId || member.loginId,
        password: response.temporaryPassword || response.password || '(no temp password)',
        staffName: member.name,
      });
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to fetch credentials');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleResetPassword = (member) => {
    Alert.alert('Reset Password', `Generate a new temporary password for ${member.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        onPress: async () => {
          try {
            const response = await apiClient.resetStaffPassword(member.id);
            setShowCredentials({
              loginId: response.loginId || member.loginId,
              password: response.temporaryPassword || response.password || 'Check email',
              staffName: member.name,
            });
            setShowPassword(true);
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to reset password');
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const togglePageAccess = (key) => {
    if (key === 'admin') {
      setFormPageAccess((prev) => {
        const cur = prev.admin;
        if (typeof cur === 'object' && cur !== null) {
          const anyTrue = Object.values(cur).some(Boolean);
          return { ...prev, admin: anyTrue ? false : { ...ALL_ADMIN_TABS } };
        }
        return { ...prev, admin: cur ? false : { ...ALL_ADMIN_TABS } };
      });
      return;
    }
    setFormPageAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAdminSubTab = (tabKey) => {
    setFormPageAccess((prev) => {
      const cur = typeof prev.admin === 'object' && prev.admin !== null ? prev.admin : { ...ALL_ADMIN_TABS };
      const updated = { ...cur, [tabKey]: !cur[tabKey] };
      const anyChecked = Object.values(updated).some(Boolean);
      return { ...prev, admin: anyChecked ? updated : false };
    });
  };

  const renderStaffItem = ({ item }) => {
    const isActive = item.status === 'active';
    return (
      <View style={styles.staffCard}>
        {/* Card Header */}
        <View style={styles.staffCardHeader}>
          <View style={styles.staffAvatar}>
            <Text style={styles.staffAvatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.staffHeaderInfo}>
            <View style={styles.staffNameRow}>
              <Text style={styles.staffName}>{item.name}</Text>
              <View style={[styles.statusPill, isActive ? styles.statusPillActive : styles.statusPillInactive]}>
                <View style={[styles.statusDot, { backgroundColor: isActive ? '#10b981' : '#ef4444' }]} />
                <Text style={[styles.statusPillText, { color: isActive ? '#10b981' : '#ef4444' }]}>
                  {isActive ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
            <View style={styles.staffBadgeRow}>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{(item.role || 'waiter').toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Details */}
        <View style={styles.staffDetailSection}>
          {item.phone && (
            <View style={styles.staffDetailRow}>
              <Ionicons name="call-outline" size={14} color={Colors.textMedium} />
              <Text style={styles.staffDetailText}>{item.phone}</Text>
            </View>
          )}
          {item.email && (
            <View style={styles.staffDetailRow}>
              <Ionicons name="mail-outline" size={14} color={Colors.textMedium} />
              <Text style={styles.staffDetailText}>{item.email}</Text>
            </View>
          )}
          {item.loginId && (
            <View style={styles.staffDetailRow}>
              <Ionicons name="key-outline" size={14} color={Colors.textMedium} />
              <Text style={styles.staffDetailText}>ID: {item.loginId}</Text>
            </View>
          )}
          {item.startDate && (
            <View style={styles.staffDetailRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.textMedium} />
              <Text style={styles.staffDetailText}>Joined: {formatDate(item.startDate)}</Text>
            </View>
          )}
          {item.lastLogin && (
            <View style={styles.staffDetailRow}>
              <Ionicons name="time-outline" size={14} color={Colors.textLight} />
              <Text style={[styles.staffDetailText, { color: Colors.textLight }]}>Last login: {formatDate(item.lastLogin)}</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.staffCardActions}>
          <Switch
            value={isActive}
            onValueChange={() => handleToggleStatus(item)}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={isActive ? Colors.primary : '#f4f4f5'}
            style={styles.statusSwitch}
          />
          <TouchableOpacity onPress={() => handleViewCredentials(item)} style={styles.cardActionBtn}>
            <Ionicons name="eye-outline" size={16} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleResetPassword(item)} style={styles.cardActionBtn}>
            <Ionicons name="refresh-outline" size={16} color="#f59e0b" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEditModal(item)} style={styles.cardActionBtn}>
            <Ionicons name="create-outline" size={16} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.cardActionBtn}>
            <Ionicons name="trash-outline" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading && staff.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading staff...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Restaurant Selector (multi-restaurant owners) */}
      {restaurants.length > 1 && (
        <View style={styles.restaurantSelector}>
          <Text style={styles.selectorLabel}>Select Restaurant</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectorChips}>
            {restaurants.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.selectorChip, selectedRestaurantId === r.id && styles.selectorChipActive]}
                onPress={() => setSelectedRestaurantId(r.id)}
              >
                <Ionicons name="storefront" size={14} color={selectedRestaurantId === r.id ? '#fff' : Colors.textMedium} />
                <Text style={[styles.selectorChipText, selectedRestaurantId === r.id && styles.selectorChipTextActive]}>
                  {r.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Header + Add */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>{filteredStaff.length} staff member{filteredStaff.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add Staff</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textMedium} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by name, phone, email..."
          placeholderTextColor={Colors.textLight}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMedium} />
          </TouchableOpacity>
        )}
      </View>

      {/* Role Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.roleFilterRow} contentContainerStyle={styles.roleFilterContent}>
        {ROLE_FILTERS.map((role) => (
          <TouchableOpacity
            key={role}
            style={[styles.roleFilterChip, filterRole === role && styles.roleFilterChipActive]}
            onPress={() => setFilterRole(role)}
          >
            <Text style={[styles.roleFilterText, filterRole === role && styles.roleFilterTextActive]}>
              {role === 'all' ? 'All' : role.charAt(0).toUpperCase() + role.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Staff List */}
      <FlatList
        data={filteredStaff}
        renderItem={renderStaffItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.staffList}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No staff members found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery || filterRole !== 'all' ? 'Try adjusting your search or filter' : 'Tap "Add Staff" to add your first member'}
            </Text>
          </View>
        }
      />

      {/* Add/Edit Modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingStaff ? 'Edit Staff' : 'Add Staff'}</Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Staff name" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Phone *</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} placeholder="Phone number" placeholderTextColor={Colors.textLight} keyboardType="phone-pad" />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.input} value={formEmail} onChangeText={setFormEmail} placeholder="Email address" placeholderTextColor={Colors.textLight} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput style={[styles.input, styles.multilineInput]} value={formAddress} onChangeText={setFormAddress} placeholder="Residential address" placeholderTextColor={Colors.textLight} multiline />

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput style={styles.input} value={formUsername} onChangeText={setFormUsername} placeholder="Login username" placeholderTextColor={Colors.textLight} autoCapitalize="none" />

              <Text style={styles.inputLabel}>Start Date</Text>
              <TextInput style={styles.input} value={formStartDate} onChangeText={setFormStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Role *</Text>
              <View style={styles.roleOptions}>
                {ROLES.map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[styles.roleChip, formRole === role && styles.roleChipActive]}
                    onPress={() => {
                      setFormRole(role);
                      // Auto-select role-appropriate page access defaults
                      const defaults = ROLE_DEFAULT_PAGE_ACCESS[role];
                      if (defaults) setFormPageAccess({ ...defaults });
                    }}
                  >
                    <Text style={[styles.roleChipText, formRole === role && styles.roleChipTextActive]}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {ROLE_DESCRIPTIONS[formRole] && (
                <View style={{ marginTop: 10, padding: 12, backgroundColor: '#f0f9ff', borderLeftWidth: 3, borderLeftColor: '#3b82f6', borderRadius: 8 }}>
                  <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700', color: '#1e40af' }}>{formRole.charAt(0).toUpperCase() + formRole.slice(1)}: </Text>
                    {ROLE_DESCRIPTIONS[formRole]}
                  </Text>
                </View>
              )}

              <Text style={[styles.inputLabel, { marginTop: 18 }]}>Page Access Permissions</Text>
              <Text style={styles.permissionHint}>Select which pages this staff member can access</Text>
              <View style={styles.permissionsGrid}>
                {PAGE_ACCESS_OPTIONS.map((perm) => {
                  const val = formPageAccess[perm.key];
                  const isChecked = perm.key === 'admin'
                    ? (typeof val === 'object' && val !== null ? Object.values(val).some(Boolean) : !!val)
                    : !!val;
                  const adminExpanded = perm.key === 'admin' && typeof formPageAccess.admin === 'object' && formPageAccess.admin !== null;
                  return (
                    <View key={perm.key} style={{ width: adminExpanded ? '100%' : '48%' }}>
                      <TouchableOpacity
                        style={[styles.permissionItem, isChecked && styles.permissionItemActive, { width: '100%' }]}
                        onPress={() => togglePageAccess(perm.key)}
                      >
                        <Ionicons
                          name={isChecked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={isChecked ? Colors.primary : Colors.textLight}
                        />
                        <Ionicons name={perm.icon} size={16} color={isChecked ? Colors.primary : Colors.textMedium} />
                        <Text style={[styles.permissionLabel, isChecked && styles.permissionLabelActive]}>{perm.label}</Text>
                      </TouchableOpacity>
                      {perm.key === 'admin' && typeof formPageAccess.admin === 'object' && formPageAccess.admin !== null && (
                        <View style={styles.adminSubTabs}>
                          {ADMIN_TAB_OPS.map((tabKey) => {
                            const tabChecked = !!formPageAccess.admin[tabKey];
                            return (
                              <TouchableOpacity
                                key={tabKey}
                                style={[styles.adminSubTabItem, tabChecked && styles.adminSubTabItemActive]}
                                onPress={() => toggleAdminSubTab(tabKey)}
                              >
                                <Ionicons
                                  name={tabChecked ? 'checkbox' : 'square-outline'}
                                  size={16}
                                  color={tabChecked ? Colors.primary : Colors.textLight}
                                />
                                <Text style={[styles.adminSubTabLabel, tabChecked && { color: Colors.primary }]}>
                                  {ADMIN_TAB_LABELS[tabKey] || tabKey}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={styles.saveButtonText}>{editingStaff ? 'Update' : 'Add Staff'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Credentials Modal */}
      <Modal visible={!!showCredentials} transparent animationType="fade" onRequestClose={() => setShowCredentials(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Staff Credentials</Text>
              <TouchableOpacity onPress={() => { setShowCredentials(null); setShowPassword(false); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>
            <View style={styles.credentialsBody}>
              {showCredentials?.staffName && (
                <Text style={styles.credentialsStaffName}>{showCredentials.staffName}</Text>
              )}
              <View style={styles.credentialsBanner}>
                <Ionicons name="key" size={24} color="#f59e0b" />
                <Text style={styles.credentialsBannerText}>
                  Share these credentials with the staff member. The password is temporary.
                </Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Login ID</Text>
                <Text style={styles.credentialValue}>{showCredentials?.loginId}</Text>
              </View>
              <View style={styles.credentialRow}>
                <Text style={styles.credentialLabel}>Password</Text>
                <View style={styles.passwordRow}>
                  <Text style={styles.credentialValue}>
                    {showPassword ? showCredentials?.password : '••••••••'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMedium} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.saveButton} onPress={() => { setShowCredentials(null); setShowPassword(false); }}>
                <Text style={styles.saveButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  restaurantSelector: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  selectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  selectorChips: {
    gap: 8,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  selectorChipActive: {
    backgroundColor: Colors.primary,
  },
  selectorChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  selectorChipTextActive: {
    color: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
  },
  roleFilterRow: {
    marginTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  roleFilterContent: {
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  roleFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  roleFilterChipActive: {
    backgroundColor: Colors.primary,
  },
  roleFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  roleFilterTextActive: {
    color: '#fff',
  },
  staffList: {
    padding: Spacing.md,
  },
  staffCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  staffCardHeader: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: 12,
  },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  staffHeaderInfo: {
    flex: 1,
  },
  staffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  staffName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  staffBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillActive: {
    backgroundColor: '#f0fdf4',
  },
  statusPillInactive: {
    backgroundColor: '#fef2f2',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  staffDetailSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: 5,
  },
  staffDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staffDetailText: {
    fontSize: 13,
    color: Colors.textMedium,
  },
  staffCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 4,
  },
  statusSwitch: {
    marginRight: 'auto',
  },
  cardActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMedium,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  modalBody: {
    padding: Spacing.md,
    maxHeight: 500,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textDark,
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 60,
  },
  roleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  roleChipActive: {
    backgroundColor: Colors.primary,
  },
  roleChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  roleChipTextActive: {
    color: '#fff',
  },
  permissionHint: {
    fontSize: 12,
    color: Colors.textLight,
    marginBottom: 8,
  },
  permissionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  permissionItemActive: {
    backgroundColor: Colors.primary + '08',
    borderColor: Colors.primary + '30',
  },
  permissionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  permissionLabelActive: {
    color: Colors.primary,
  },
  adminSubTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginLeft: 8,
    padding: 10,
    backgroundColor: Colors.primary + '08',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary + '15',
    width: '100%',
  },
  adminSubTabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  adminSubTabItemActive: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary + '30',
  },
  adminSubTabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMedium,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  credentialsBody: {
    padding: Spacing.md,
  },
  credentialsStaffName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  credentialsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fef9c3',
    padding: Spacing.sm,
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  credentialsBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
  },
  credentialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  credentialLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  credentialValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    fontFamily: 'monospace',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyeBtn: {
    padding: 4,
  },
});
