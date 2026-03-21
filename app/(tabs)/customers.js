import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Linking,
  Share,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

// ── Tabs ────────────────────────────────────────────
const TABS = [
  { key: 'customers', label: 'Customers', icon: 'people' },
  { key: 'offers', label: 'Offers', icon: 'pricetag' },
  { key: 'loyalty', label: 'Loyalty', icon: 'diamond' },
];

const SORT_OPTIONS = [
  { key: 'lastOrderDate', label: 'Last Order' },
  { key: 'name', label: 'Name' },
  { key: 'totalOrders', label: 'Orders' },
  { key: 'totalSpent', label: 'Spent' },
  { key: 'loyaltyPoints', label: 'Points' },
];

const emptyCustomerForm = {
  name: '',
  phone: '',
  email: '',
  city: '',
  dob: '',
};

export default function CustomersScreen() {
  const router = useRouter();

  // ── Core state ──────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('customers');

  // ── Customer list state ─────────────────────────────
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('lastOrderDate');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showSortPicker, setShowSortPicker] = useState(false);

  // ── Customer form state ─────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({ ...emptyCustomerForm });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // ── Customer detail state ───────────────────────────
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loyaltyHistory, setLoyaltyHistory] = useState([]);
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);

  // ── Offers state ────────────────────────────────────
  const [offers, setOffers] = useState([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // ── Loyalty & Settings state ─────────────────────────
  const [loyaltySettings, setLoyaltySettings] = useState(null);
  const [loadingLoyaltySettings, setLoadingLoyaltySettings] = useState(false);
  const [fullSettings, setFullSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restaurantCode, setRestaurantCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [onlineOrderUrl, setOnlineOrderUrl] = useState('');
  const [urlSlug, setUrlSlug] = useState('');
  const [savingSlug, setSavingSlug] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');

  // ── Init ────────────────────────────────────────────
  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) {
        loadCustomers(restaurantId);
      }
    }, [restaurantId, loading])
  );

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      const allowedRoles = ['owner', 'manager', 'admin'];
      if (!allowedRoles.includes(userData.role?.toLowerCase())) {
        Alert.alert('Access Denied', 'Customer management requires owner/manager access.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      setUser(userData);
      const rid = userData.restaurantId || userData.restaurant?.id;
      setRestaurantId(rid);
      setRestaurantName(userData.restaurant?.name || '');
      if (rid) {
        await loadCustomers(rid);
      }
    } catch (error) {
      console.error('Error loading customer data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Data loading ────────────────────────────────────
  const loadCustomers = async (rid) => {
    try {
      const response = await apiClient.getCustomers(rid);
      setCustomers(response.customers || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const loadOffers = async () => {
    if (!restaurantId) return;
    setLoadingOffers(true);
    try {
      const response = await apiClient.getOffers(restaurantId);
      setOffers(response.offers || []);
    } catch (error) {
      console.error('Error loading offers:', error);
    } finally {
      setLoadingOffers(false);
    }
  };

  const loadLoyaltySettings = async () => {
    if (!restaurantId) return;
    setLoadingLoyaltySettings(true);
    try {
      const response = await apiClient.getCustomerAppSettings(restaurantId);
      const settings = response.settings || response || null;
      setFullSettings(settings);
      setLoyaltySettings(settings);
      if (settings?.restaurantCode) {
        setRestaurantCode(settings.restaurantCode);
      }
      // Build online order URL
      const rData = user?.restaurant;
      if (rData?.urlSlug) {
        setUrlSlug(rData.urlSlug);
        setOnlineOrderUrl(`https://www.dineopen.com/${rData.urlSlug}`);
      } else if (settings?.restaurantCode) {
        setOnlineOrderUrl(`https://www.dineopen.com/onlineorder?restaurant=${restaurantId}`);
      }
    } catch (error) {
      console.error('Error loading loyalty settings:', error);
      // Fallback to public endpoint
      try {
        const response = await apiClient.getPublicCustomerAppSettings(restaurantId);
        setLoyaltySettings(response.settings || null);
        setFullSettings(response.settings || null);
      } catch (e) {
        console.error('Fallback also failed:', e);
      }
    } finally {
      setLoadingLoyaltySettings(false);
    }
  };

  const loadCustomerOrders = async (customerId) => {
    setLoadingOrders(true);
    try {
      const response = await apiClient.getCustomerOrders(customerId);
      setCustomerOrders(response.orders || []);
    } catch (error) {
      console.error('Error loading orders:', error);
      setCustomerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadLoyaltyHistory = async (customerId) => {
    setLoadingLoyalty(true);
    try {
      const response = await apiClient.getCustomerLoyaltyHistory(customerId);
      setLoyaltyHistory(response.history || []);
    } catch (error) {
      console.error('Error loading loyalty history:', error);
      setLoyaltyHistory([]);
    } finally {
      setLoadingLoyalty(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (restaurantId) {
      if (activeTab === 'customers') await loadCustomers(restaurantId);
      else if (activeTab === 'offers') await loadOffers();
      else if (activeTab === 'loyalty') await loadLoyaltySettings();
    }
    setRefreshing(false);
  };

  // ── Tab switch ──────────────────────────────────────
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'offers' && offers.length === 0) loadOffers();
    if (tab === 'loyalty' && !loyaltySettings) loadLoyaltySettings();
  };

  // ── Filter & sort customers ─────────────────────────
  const filteredCustomers = React.useMemo(() => {
    let list = [...customers];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.phone?.includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.city?.toLowerCase().includes(term)
      );
    }

    list.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === 'lastOrderDate') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      if (sortBy === 'name') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      if (typeof aVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal || 0) - (bVal || 0) : (bVal || 0) - (aVal || 0);
    });

    return list;
  }, [customers, searchTerm, sortBy, sortOrder]);

  // ── Customer CRUD ───────────────────────────────────
  const validateForm = () => {
    const errors = {};
    if (!customerForm.name?.trim() && !customerForm.phone?.trim()) {
      errors.name = 'Name or phone is required';
      errors.phone = 'Name or phone is required';
    }
    if (customerForm.phone?.trim() && !/^[\+]?[0-9\s\-\(\)]{10,}$/.test(customerForm.phone.trim())) {
      errors.phone = 'Invalid phone number';
    }
    if (customerForm.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email.trim())) {
      errors.email = 'Invalid email address';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCustomer = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const data = {
        name: customerForm.name?.trim() || '',
        phone: customerForm.phone?.trim() || '',
        email: customerForm.email?.trim() || '',
        city: customerForm.city?.trim() || '',
        dob: customerForm.dob?.trim() || '',
        restaurantId,
      };

      if (editingCustomer) {
        await apiClient.updateCustomer(editingCustomer.id, data);
      } else {
        await apiClient.createCustomer(data);
      }

      setShowAddModal(false);
      setEditingCustomer(null);
      setCustomerForm({ ...emptyCustomerForm });
      setFormErrors({});
      await loadCustomers(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      city: customer.city || '',
      dob: customer.dob ? customer.dob.split('T')[0] : '',
    });
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleDeleteCustomer = (customer) => {
    Alert.alert(
      'Delete Customer',
      `Delete "${customer.name || customer.phone}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteCustomer(customer.id);
              await loadCustomers(restaurantId);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const openCustomerProfile = (customer) => {
    setSelectedCustomer(customer);
    setShowProfileModal(true);
    loadCustomerOrders(customer.id);
    if (customer.loyaltyPoints > 0) {
      loadLoyaltyHistory(customer.id);
    }
  };

  const openOrderHistory = (customer) => {
    setSelectedCustomer(customer);
    setShowOrderHistory(true);
    loadCustomerOrders(customer.id);
  };

  // ── Format helpers ──────────────────────────────────
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toLocaleString('en-IN')}`;
  };

  const getInitial = (name) => {
    return (name || '?').charAt(0).toUpperCase();
  };

  // ──────────────────────────────────────────────────── RENDERS

  // ── Customer Row ────────────────────────────────────
  const renderCustomerItem = ({ item }) => {
    const hasLoyalty = (item.loyaltyPoints || 0) > 0;
    const isCraveCustomer = item.source === 'customer_app';

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => openCustomerProfile(item)}
        activeOpacity={0.7}
      >
        <View style={styles.customerRow}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitial(item.name)}</Text>
          </View>

          {/* Info */}
          <View style={styles.customerInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName} numberOfLines={1}>
                {item.name || 'Unnamed'}
              </Text>
              {isCraveCustomer && (
                <View style={styles.craveBadge}>
                  <Text style={styles.craveBadgeText}>Crave</Text>
                </View>
              )}
              {hasLoyalty && (
                <View style={styles.loyaltyBadge}>
                  <Ionicons name="diamond" size={10} color="#7c3aed" />
                  <Text style={styles.loyaltyBadgeText}>{item.loyaltyPoints}</Text>
                </View>
              )}
            </View>

            <View style={styles.chipRow}>
              {item.phone && (
                <View style={styles.infoChip}>
                  <Ionicons name="call-outline" size={11} color={Colors.textLight} />
                  <Text style={styles.chipText}>{item.phone}</Text>
                </View>
              )}
              {item.city && (
                <View style={styles.infoChip}>
                  <Ionicons name="location-outline" size={11} color={Colors.textLight} />
                  <Text style={styles.chipText}>{item.city}</Text>
                </View>
              )}
            </View>

            <View style={styles.statsRow}>
              <Text style={styles.statText}>
                {item.totalOrders || 0} orders
              </Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.statText}>
                {formatCurrency(item.totalSpent)}
              </Text>
              {item.lastOrderDate && (
                <>
                  <Text style={styles.statDot}>·</Text>
                  <Text style={styles.statTextLight}>
                    {formatDate(item.lastOrderDate)}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={styles.customerActions}>
            <TouchableOpacity
              style={styles.actionIcon}
              onPress={() => openOrderHistory(item)}
            >
              <Ionicons name="receipt-outline" size={18} color={Colors.info} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIcon}
              onPress={() => handleEditCustomer(item)}
            >
              <Ionicons name="create-outline" size={18} color={Colors.secondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionIcon}
              onPress={() => handleDeleteCustomer(item)}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Offer Row ───────────────────────────────────────
  const renderOfferItem = ({ item }) => {
    const isActive = item.isActive !== false;
    const isExpired = item.validUntil && new Date(item.validUntil) < new Date();

    return (
      <View style={[styles.offerCard, !isActive && styles.offerCardInactive]}>
        <View style={styles.offerHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.offerName}>{item.name}</Text>
            {item.description && (
              <Text style={styles.offerDesc} numberOfLines={2}>{item.description}</Text>
            )}
          </View>
          <View style={[
            styles.offerBadge,
            { backgroundColor: isActive && !isExpired ? '#dcfce7' : '#fee2e2' },
          ]}>
            <Text style={[
              styles.offerBadgeText,
              { color: isActive && !isExpired ? '#16a34a' : '#dc2626' },
            ]}>
              {isExpired ? 'Expired' : isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={styles.offerDetails}>
          {/* Discount */}
          <View style={styles.offerDetailChip}>
            <Ionicons name="pricetag" size={12} color={Colors.primary} />
            <Text style={styles.offerDetailText}>
              {item.discountType === 'percentage'
                ? `${item.discountValue}% off`
                : `₹${item.discountValue} off`}
            </Text>
          </View>

          {/* Min order */}
          {item.minOrderValue > 0 && (
            <View style={styles.offerDetailChip}>
              <Ionicons name="cart-outline" size={12} color={Colors.textLight} />
              <Text style={styles.offerDetailText}>Min ₹{item.minOrderValue}</Text>
            </View>
          )}

          {/* Max discount */}
          {item.maxDiscount > 0 && (
            <View style={styles.offerDetailChip}>
              <Ionicons name="trending-down" size={12} color={Colors.textLight} />
              <Text style={styles.offerDetailText}>Max ₹{item.maxDiscount}</Text>
            </View>
          )}

          {/* Usage */}
          {item.usageLimit > 0 && (
            <View style={styles.offerDetailChip}>
              <Ionicons name="people-outline" size={12} color={Colors.textLight} />
              <Text style={styles.offerDetailText}>
                {item.usageCount || 0}/{item.usageLimit} used
              </Text>
            </View>
          )}

          {/* First order */}
          {item.isFirstOrderOnly && (
            <View style={[styles.offerDetailChip, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="star" size={12} color="#7c3aed" />
              <Text style={[styles.offerDetailText, { color: '#7c3aed' }]}>First order</Text>
            </View>
          )}

          {/* Auto-apply */}
          {item.autoApply && (
            <View style={[styles.offerDetailChip, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="flash" size={12} color="#2563eb" />
              <Text style={[styles.offerDetailText, { color: '#2563eb' }]}>Auto-apply</Text>
            </View>
          )}
        </View>

        {/* Validity dates */}
        {(item.validFrom || item.validUntil) && (
          <View style={styles.offerDates}>
            <Ionicons name="calendar-outline" size={12} color={Colors.textLight} />
            <Text style={styles.offerDateText}>
              {item.validFrom ? formatDate(item.validFrom) : 'Start'} — {item.validUntil ? formatDate(item.validUntil) : 'No end'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // ── Settings helpers ─────────────────────────────────
  const updateSettingsField = (path, value) => {
    setFullSettings(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      if (path.includes('.')) {
        const [parent, child] = path.split('.');
        updated[parent] = { ...(updated[parent] || {}), [child]: value };
      } else {
        updated[path] = value;
      }
      return updated;
    });
  };

  const handleSaveSettings = async () => {
    if (!restaurantId || !fullSettings) return;
    setSavingSettings(true);
    try {
      await apiClient.updateCustomerAppSettings(restaurantId, fullSettings);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!restaurantId) return;
    setGeneratingCode(true);
    try {
      const response = await apiClient.generateRestaurantCode(restaurantId);
      const code = response.restaurantCode || response.code;
      if (code) {
        setRestaurantCode(code);
        updateSettingsField('restaurantCode', code);
        Alert.alert('Success', `Restaurant code generated: ${code}`);
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to generate code');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleSaveSlug = async () => {
    if (!restaurantId || !urlSlug.trim()) return;
    setSavingSlug(true);
    try {
      await apiClient.updateRestaurantSlug(restaurantId, urlSlug.trim().toLowerCase());
      setOnlineOrderUrl(`https://www.dineopen.com/${urlSlug.trim().toLowerCase()}`);
      Alert.alert('Saved', `Your URL: dineopen.com/${urlSlug.trim().toLowerCase()}`);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save URL');
    } finally {
      setSavingSlug(false);
    }
  };

  const handleCopyToClipboard = async (text) => {
    try {
      await Share.share({ message: text });
    } catch {
      Alert.alert('Copy this', text);
    }
  };

  const handleShareUrl = async () => {
    if (!onlineOrderUrl) return;
    try {
      await Share.share({
        message: `Order online from ${restaurantName}: ${onlineOrderUrl}`,
        url: onlineOrderUrl,
      });
    } catch (error) {
      Alert.alert('Share', onlineOrderUrl);
    }
  };

  // ── Loyalty Section ─────────────────────────────────
  const renderLoyaltyTab = () => {
    if (loadingLoyaltySettings) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      );
    }

    const settings = fullSettings || {};
    const ls = settings.loyaltySettings || {};
    const isLoyaltyEnabled = ls.enabled;
    const isAppEnabled = settings.enabled;

    return (
      <ScrollView
        contentContainerStyle={styles.loyaltyContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* ── General Settings ──────────────────────── */}
        <View style={styles.loyaltyRuleCard}>
          <View style={styles.loyaltyRuleHeader}>
            <Ionicons name="settings-outline" size={20} color={Colors.textDark} />
            <Text style={styles.loyaltyRuleTitle}>General Settings</Text>
          </View>

          {/* Enable Customer App */}
          <View style={styles.settingsToggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.loyaltyRuleLabel}>Enable Customer App</Text>
              <Text style={styles.settingsHint}>Allow customers to order via Crave app</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isAppEnabled && styles.toggleBtnOn]}
              onPress={() => updateSettingsField('enabled', !isAppEnabled)}
            >
              <View style={[styles.toggleKnob, isAppEnabled && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          {/* Restaurant Code */}
          <View style={styles.settingsFieldRow}>
            <Text style={styles.loyaltyRuleLabel}>Restaurant Code</Text>
            <Text style={styles.settingsHint}>Customers use this to find you in the Crave app</Text>
            <View style={styles.codeRow}>
              <View style={styles.codeDisplay}>
                <Text style={styles.codeText}>{restaurantCode || 'Not generated'}</Text>
              </View>
              {!restaurantCode ? (
                <TouchableOpacity
                  style={[styles.codeActionBtn, generatingCode && { opacity: 0.6 }]}
                  onPress={handleGenerateCode}
                  disabled={generatingCode}
                >
                  {generatingCode ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.codeActionBtnText}>Generate</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.codeActionBtn, { backgroundColor: Colors.textMedium }]}
                  onPress={() => handleCopyToClipboard(restaurantCode)}
                >
                  <Ionicons name="copy-outline" size={16} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Custom URL */}
          <View style={styles.settingsFieldRow}>
            <Text style={styles.loyaltyRuleLabel}>Custom URL (Short Link)</Text>
            <Text style={styles.settingsHint}>dineopen.com/your-slug</Text>
            <View style={styles.codeRow}>
              <Text style={styles.urlPrefix}>dineopen.com/</Text>
              <TextInput
                style={[styles.formInput, { flex: 1 }]}
                placeholder="your-name"
                placeholderTextColor={Colors.textLight}
                value={urlSlug}
                onChangeText={(t) => setUrlSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                autoCapitalize="none"
                maxLength={30}
              />
              <TouchableOpacity
                style={[styles.codeActionBtn, savingSlug && { opacity: 0.6 }]}
                onPress={handleSaveSlug}
                disabled={savingSlug || !urlSlug.trim()}
              >
                {savingSlug ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.codeActionBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Online Order Link & Share ─────────────── */}
        {onlineOrderUrl ? (
          <View style={styles.loyaltyRuleCard}>
            <View style={styles.loyaltyRuleHeader}>
              <Ionicons name="link-outline" size={20} color="#2563eb" />
              <Text style={styles.loyaltyRuleTitle}>Online Order Link</Text>
            </View>
            <View style={styles.urlDisplayBox}>
              <Text style={styles.urlDisplayText} numberOfLines={1}>{onlineOrderUrl}</Text>
            </View>
            <View style={styles.urlActionsRow}>
              <TouchableOpacity
                style={styles.urlActionBtn}
                onPress={() => handleCopyToClipboard(onlineOrderUrl)}
              >
                <Ionicons name="copy-outline" size={18} color={Colors.primary} />
                <Text style={styles.urlActionBtnText}>Copy URL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.urlActionBtn}
                onPress={handleShareUrl}
              >
                <Ionicons name="share-outline" size={18} color={Colors.primary} />
                <Text style={styles.urlActionBtnText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.urlActionBtn}
                onPress={() => Linking.openURL(onlineOrderUrl)}
              >
                <Ionicons name="open-outline" size={18} color={Colors.primary} />
                <Text style={styles.urlActionBtnText}>Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── Order Types ──────────────────────────── */}
        <View style={styles.loyaltyRuleCard}>
          <View style={styles.loyaltyRuleHeader}>
            <Ionicons name="cart-outline" size={20} color={Colors.secondary} />
            <Text style={styles.loyaltyRuleTitle}>Order Types</Text>
          </View>

          <View style={styles.settingsToggleRow}>
            <Text style={styles.loyaltyRuleLabel}>Allow Dine-In Orders</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, settings.allowDineIn && styles.toggleBtnOn]}
              onPress={() => updateSettingsField('allowDineIn', !settings.allowDineIn)}
            >
              <View style={[styles.toggleKnob, settings.allowDineIn && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsToggleRow}>
            <Text style={styles.loyaltyRuleLabel}>Allow Takeaway Orders</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, settings.allowTakeaway && styles.toggleBtnOn]}
              onPress={() => updateSettingsField('allowTakeaway', !settings.allowTakeaway)}
            >
              <View style={[styles.toggleKnob, settings.allowTakeaway && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsToggleRow}>
            <Text style={styles.loyaltyRuleLabel}>Allow Delivery Orders</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, settings.allowDelivery && styles.toggleBtnOn]}
              onPress={() => updateSettingsField('allowDelivery', !settings.allowDelivery)}
            >
              <View style={[styles.toggleKnob, settings.allowDelivery && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.settingsToggleRow}>
            <Text style={styles.loyaltyRuleLabel}>Require Table Selection (Dine-In)</Text>
            <TouchableOpacity
              style={[styles.toggleBtn, settings.requireTableSelection && styles.toggleBtnOn]}
              onPress={() => updateSettingsField('requireTableSelection', !settings.requireTableSelection)}
            >
              <View style={[styles.toggleKnob, settings.requireTableSelection && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>

          {/* Min order */}
          <View style={styles.settingsFieldRow}>
            <Text style={styles.loyaltyRuleLabel}>Minimum Order Amount (₹)</Text>
            <TextInput
              style={styles.formInput}
              placeholder="0"
              placeholderTextColor={Colors.textLight}
              keyboardType="number-pad"
              value={String(settings.minimumOrder || '')}
              onChangeText={(t) => updateSettingsField('minimumOrder', parseInt(t) || 0)}
            />
          </View>
        </View>

        {/* ── Loyalty Program ──────────────────────── */}
        <View style={[styles.loyaltyStatusCard, isLoyaltyEnabled ? styles.loyaltyEnabled : styles.loyaltyDisabled]}>
          <Ionicons
            name={isLoyaltyEnabled ? 'checkmark-circle' : 'close-circle'}
            size={28}
            color={isLoyaltyEnabled ? '#16a34a' : '#dc2626'}
          />
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <Text style={styles.loyaltyStatusTitle}>
              Loyalty Program {isLoyaltyEnabled ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, isLoyaltyEnabled && styles.toggleBtnOn]}
            onPress={() => updateSettingsField('loyaltySettings.enabled', !isLoyaltyEnabled)}
          >
            <View style={[styles.toggleKnob, isLoyaltyEnabled && styles.toggleKnobOn]} />
          </TouchableOpacity>
        </View>

        {isLoyaltyEnabled && (
          <>
            {/* Earn rules - editable */}
            <View style={styles.loyaltyRuleCard}>
              <View style={styles.loyaltyRuleHeader}>
                <Ionicons name="trending-up" size={20} color="#16a34a" />
                <Text style={styles.loyaltyRuleTitle}>Earning Rules</Text>
              </View>
              <Text style={styles.settingsHint}>For every ₹X spent, earn Y points</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Amount (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="100"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    value={String(ls.earnPerAmount || '')}
                    onChangeText={(t) => updateSettingsField('loyaltySettings.earnPerAmount', parseInt(t) || 0)}
                  />
                </View>
                <View style={{ width: Spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Points Earned</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="4"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    value={String(ls.pointsEarned || '')}
                    onChangeText={(t) => updateSettingsField('loyaltySettings.pointsEarned', parseInt(t) || 0)}
                  />
                </View>
              </View>
            </View>

            {/* Redeem rules - editable */}
            <View style={styles.loyaltyRuleCard}>
              <View style={styles.loyaltyRuleHeader}>
                <Ionicons name="gift" size={20} color="#7c3aed" />
                <Text style={styles.loyaltyRuleTitle}>Redemption Rules</Text>
              </View>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Points for ₹1</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="100"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    value={String(ls.redemptionRate || '')}
                    onChangeText={(t) => updateSettingsField('loyaltySettings.redemptionRate', parseInt(t) || 0)}
                  />
                </View>
                <View style={{ width: Spacing.sm }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Max % per order</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="20"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="number-pad"
                    value={String(ls.maxRedemptionPercent || '')}
                    onChangeText={(t) => updateSettingsField('loyaltySettings.maxRedemptionPercent', parseInt(t) || 0)}
                  />
                </View>
              </View>

              {/* Earn on redemption */}
              <View style={[styles.settingsToggleRow, { marginTop: Spacing.md }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loyaltyRuleLabel}>Earn points when redeeming</Text>
                  <Text style={styles.settingsHint}>Allow earning on orders where points are redeemed</Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleBtn, ls.earnPointsOnRedemption && styles.toggleBtnOn]}
                  onPress={() => updateSettingsField('loyaltySettings.earnPointsOnRedemption', !ls.earnPointsOnRedemption)}
                >
                  <View style={[styles.toggleKnob, ls.earnPointsOnRedemption && styles.toggleKnobOn]} />
                </TouchableOpacity>
              </View>

              {ls.earnPointsOnRedemption && (
                <View style={[styles.settingsToggleRow, { marginTop: Spacing.sm }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.loyaltyRuleLabel}>Earn on full amount</Text>
                    <Text style={styles.settingsHint}>Earn on total before redemption discount</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.toggleBtn, ls.earnOnFullAmount && styles.toggleBtnOn]}
                    onPress={() => updateSettingsField('loyaltySettings.earnOnFullAmount', !ls.earnOnFullAmount)}
                  >
                    <View style={[styles.toggleKnob, ls.earnOnFullAmount && styles.toggleKnobOn]} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Example Calculation */}
            <View style={[styles.loyaltyRuleCard, { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' }]}>
              <View style={styles.loyaltyRuleHeader}>
                <Ionicons name="calculator-outline" size={20} color="#16a34a" />
                <Text style={styles.loyaltyRuleTitle}>Example Calculation</Text>
              </View>
              <Text style={styles.exampleText}>
                Customer spends ₹1,000 → Earns {Math.floor(1000 / (ls.earnPerAmount || 100)) * (ls.pointsEarned || 0)} points
              </Text>
              <Text style={styles.exampleText}>
                With {(ls.redemptionRate || 100) * 100} points → Can redeem ₹{Math.floor(((ls.redemptionRate || 100) * 100) / (ls.redemptionRate || 100))}
              </Text>
              <Text style={styles.exampleText}>
                Max redemption per order: {ls.maxRedemptionPercent || 20}% of order value
              </Text>
            </View>

            {/* Top customers by loyalty */}
            <View style={styles.loyaltyRuleCard}>
              <View style={styles.loyaltyRuleHeader}>
                <Ionicons name="trophy" size={20} color="#d97706" />
                <Text style={styles.loyaltyRuleTitle}>Top Loyalty Customers</Text>
              </View>
              {customers
                .filter(c => (c.loyaltyPoints || 0) > 0)
                .sort((a, b) => (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0))
                .slice(0, 10)
                .map((c, i) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.topCustomerRow}
                    onPress={() => openCustomerProfile(c)}
                  >
                    <Text style={styles.topCustomerRank}>#{i + 1}</Text>
                    <View style={styles.topCustomerAvatar}>
                      <Text style={styles.topCustomerInitial}>{getInitial(c.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topCustomerName}>{c.name || c.phone}</Text>
                      <Text style={styles.topCustomerOrders}>{c.totalOrders} orders</Text>
                    </View>
                    <View style={styles.topCustomerPoints}>
                      <Ionicons name="diamond" size={12} color="#7c3aed" />
                      <Text style={styles.topCustomerPointsText}>{c.loyaltyPoints}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              }
              {customers.filter(c => (c.loyaltyPoints || 0) > 0).length === 0 && (
                <Text style={styles.emptySubtitle}>No customers with loyalty points yet.</Text>
              )}
            </View>
          </>
        )}

        {/* ── Save All Settings Button ─────────────── */}
        <TouchableOpacity
          style={[styles.saveSettingsBtn, savingSettings && { opacity: 0.6 }]}
          onPress={handleSaveSettings}
          disabled={savingSettings}
        >
          {savingSettings ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveSettingsBtnText}>Save All Settings</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  // ──────────────────────────────────────────────────── MODALS

  // ── Add/Edit Customer Modal ─────────────────────────
  const renderCustomerFormModal = () => (
    <Modal
      visible={showAddModal}
      animationType="slide"
      onRequestClose={() => { setShowAddModal(false); setEditingCustomer(null); }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => { setShowAddModal(false); setEditingCustomer(null); }}
            >
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingCustomer ? 'Edit Customer' : 'Add Customer'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name</Text>
              <TextInput
                style={[styles.formInput, formErrors.name && styles.formInputError]}
                placeholder="Customer name"
                placeholderTextColor={Colors.textLight}
                value={customerForm.name}
                onChangeText={(t) => setCustomerForm({ ...customerForm, name: t })}
              />
              {formErrors.name && <Text style={styles.formError}>{formErrors.name}</Text>}
            </View>

            {/* Phone */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={[styles.formInput, formErrors.phone && styles.formInputError]}
                placeholder="Phone number"
                placeholderTextColor={Colors.textLight}
                keyboardType="phone-pad"
                value={customerForm.phone}
                onChangeText={(t) => setCustomerForm({ ...customerForm, phone: t })}
              />
              {formErrors.phone && <Text style={styles.formError}>{formErrors.phone}</Text>}
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={[styles.formInput, formErrors.email && styles.formInputError]}
                placeholder="Email address (optional)"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                value={customerForm.email}
                onChangeText={(t) => setCustomerForm({ ...customerForm, email: t })}
              />
              {formErrors.email && <Text style={styles.formError}>{formErrors.email}</Text>}
            </View>

            {/* City */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>City</Text>
              <TextInput
                style={styles.formInput}
                placeholder="City (optional)"
                placeholderTextColor={Colors.textLight}
                value={customerForm.city}
                onChangeText={(t) => setCustomerForm({ ...customerForm, city: t })}
              />
            </View>

            {/* DOB */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Date of Birth</Text>
              <TextInput
                style={styles.formInput}
                placeholder="YYYY-MM-DD (optional)"
                placeholderTextColor={Colors.textLight}
                value={customerForm.dob}
                onChangeText={(t) => setCustomerForm({ ...customerForm, dob: t })}
              />
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Footer buttons */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setShowAddModal(false); setEditingCustomer(null); }}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSaveCustomer}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>
                  {editingCustomer ? 'Update' : 'Add'} Customer
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Customer Profile Modal ──────────────────────────
  const renderProfileModal = () => {
    if (!selectedCustomer) return null;
    const c = selectedCustomer;

    return (
      <Modal
        visible={showProfileModal}
        animationType="slide"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: '#7c3aed' }]}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowProfileModal(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: '#fff' }]}>Customer Profile</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => {
                setShowProfileModal(false);
                handleEditCustomer(c);
              }}
            >
              <Ionicons name="create-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Profile header */}
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{getInitial(c.name)}</Text>
              </View>
              <Text style={styles.profileName}>{c.name || 'Unnamed'}</Text>
              {c.phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                  <Text style={styles.profilePhone}>{c.phone}</Text>
                </TouchableOpacity>
              )}
              {c.source === 'customer_app' && (
                <View style={[styles.craveBadge, { marginTop: Spacing.xs }]}>
                  <Text style={styles.craveBadgeText}>Crave App Customer</Text>
                </View>
              )}
            </View>

            {/* Loyalty Points Summary */}
            {(c.loyaltyPoints > 0 || c.lifetimePoints > 0) && (
              <View style={styles.profileSection}>
                <Text style={styles.profileSectionTitle}>Loyalty Points</Text>
                <View style={styles.statsGrid}>
                  <View style={[styles.statBox, { backgroundColor: '#f5f3ff' }]}>
                    <Text style={[styles.statBoxValue, { color: '#7c3aed' }]}>{c.loyaltyPoints || 0}</Text>
                    <Text style={styles.statBoxLabel}>Current</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[styles.statBoxValue, { color: '#16a34a' }]}>{c.lifetimePoints || c.loyaltyPoints || 0}</Text>
                    <Text style={styles.statBoxLabel}>Earned</Text>
                  </View>
                  <View style={[styles.statBox, { backgroundColor: '#fef2f2' }]}>
                    <Text style={[styles.statBoxValue, { color: '#dc2626' }]}>{(c.lifetimePoints || 0) - (c.loyaltyPoints || 0)}</Text>
                    <Text style={styles.statBoxLabel}>Redeemed</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Contact Info */}
            <View style={styles.profileSection}>
              <Text style={styles.profileSectionTitle}>Contact Information</Text>
              <View style={styles.profileInfoRow}>
                <Ionicons name="call-outline" size={16} color={Colors.textLight} />
                <Text style={styles.profileInfoText}>{c.phone || '-'}</Text>
              </View>
              <View style={styles.profileInfoRow}>
                <Ionicons name="mail-outline" size={16} color={Colors.textLight} />
                <Text style={styles.profileInfoText}>{c.email || '-'}</Text>
              </View>
              <View style={styles.profileInfoRow}>
                <Ionicons name="location-outline" size={16} color={Colors.textLight} />
                <Text style={styles.profileInfoText}>{c.city || '-'}</Text>
              </View>
              {c.dob && (
                <View style={styles.profileInfoRow}>
                  <Ionicons name="gift-outline" size={16} color={Colors.textLight} />
                  <Text style={styles.profileInfoText}>{formatDate(c.dob)}</Text>
                </View>
              )}
              <View style={styles.profileInfoRow}>
                <Ionicons name="time-outline" size={16} color={Colors.textLight} />
                <Text style={styles.profileInfoText}>Customer since {formatDate(c.createdAt)}</Text>
              </View>
            </View>

            {/* Order Statistics */}
            <View style={styles.profileSection}>
              <Text style={styles.profileSectionTitle}>Order Statistics</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{c.totalOrders || 0}</Text>
                  <Text style={styles.statBoxLabel}>Total Orders</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={[styles.statBoxValue, { color: Colors.primary }]}>{formatCurrency(c.totalSpent)}</Text>
                  <Text style={styles.statBoxLabel}>Total Spent</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {c.totalOrders > 0 ? formatCurrency(Math.round((c.totalSpent || 0) / c.totalOrders)) : '₹0'}
                  </Text>
                  <Text style={styles.statBoxLabel}>Avg Order</Text>
                </View>
              </View>
            </View>

            {/* Loyalty History */}
            {loyaltyHistory.length > 0 && (
              <View style={styles.profileSection}>
                <Text style={styles.profileSectionTitle}>Points History</Text>
                {loyaltyHistory.slice(0, 10).map((h, i) => (
                  <View key={h.id || i} style={styles.loyaltyHistoryRow}>
                    <Ionicons
                      name={h.type === 'earned' ? 'trending-up' : 'trending-down'}
                      size={16}
                      color={h.type === 'earned' ? '#16a34a' : '#dc2626'}
                    />
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <Text style={styles.loyaltyHistoryText}>{h.description || h.type}</Text>
                      <Text style={styles.loyaltyHistoryDate}>{formatDate(h.date)}</Text>
                    </View>
                    <Text style={[
                      styles.loyaltyHistoryPoints,
                      { color: h.type === 'earned' ? '#16a34a' : '#dc2626' },
                    ]}>
                      {h.type === 'earned' ? '+' : '-'}{h.points}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Recent Orders */}
            <View style={styles.profileSection}>
              <View style={styles.profileSectionHeaderRow}>
                <Text style={styles.profileSectionTitle}>Recent Orders</Text>
                <TouchableOpacity onPress={() => {
                  setShowProfileModal(false);
                  setTimeout(() => openOrderHistory(c), 300);
                }}>
                  <Text style={styles.viewAllText}>View All</Text>
                </TouchableOpacity>
              </View>
              {loadingOrders ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : customerOrders.length === 0 ? (
                <Text style={styles.emptySubtitle}>No orders yet.</Text>
              ) : (
                customerOrders.slice(0, 5).map((order) => (
                  <View key={order.orderNumber || order.id} style={styles.orderRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.orderNumberRow}>
                        <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                        {order.orderType && (
                          <View style={styles.orderTypeBadge}>
                            <Text style={styles.orderTypeText}>
                              {order.orderTypeLabel || order.orderType?.replace('_', ' ')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.orderDate}>{formatDate(order.orderDate)}</Text>
                    </View>
                    <Text style={styles.orderAmount}>{formatCurrency(order.totalAmount)}</Text>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ── Order History Modal ─────────────────────────────
  const renderOrderHistoryModal = () => {
    if (!selectedCustomer) return null;

    return (
      <Modal
        visible={showOrderHistory}
        animationType="slide"
        onRequestClose={() => setShowOrderHistory(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowOrderHistory(false)}
            >
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Orders — {selectedCustomer.name || selectedCustomer.phone}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          {loadingOrders ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : customerOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={56} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Orders</Text>
              <Text style={styles.emptySubtitle}>This customer hasn't placed any orders yet.</Text>
            </View>
          ) : (
            <FlatList
              data={customerOrders}
              keyExtractor={(item) => item.orderNumber || item.id}
              contentContainerStyle={{ padding: Spacing.md }}
              renderItem={({ item: order }) => (
                <View style={styles.orderHistoryCard}>
                  <View style={styles.orderHistoryHeader}>
                    <View style={styles.orderNumberRow}>
                      <Text style={styles.orderHistoryNumber}>#{order.orderNumber}</Text>
                      {order.orderType && (
                        <View style={styles.orderTypeBadge}>
                          <Text style={styles.orderTypeText}>
                            {order.orderTypeLabel || order.orderType?.replace('_', ' ')}
                          </Text>
                        </View>
                      )}
                      {order.orderSource === 'crave_app' && (
                        <View style={[styles.orderTypeBadge, { backgroundColor: '#dbeafe' }]}>
                          <Text style={[styles.orderTypeText, { color: '#2563eb' }]}>Crave</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.orderHistoryAmount}>{formatCurrency(order.totalAmount)}</Text>
                  </View>

                  <View style={styles.orderHistoryMeta}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textLight} />
                    <Text style={styles.orderHistoryDate}>{formatDate(order.orderDate)}</Text>
                    {order.tableNumber && (
                      <>
                        <Text style={styles.statDot}>·</Text>
                        <Ionicons name="restaurant-outline" size={13} color={Colors.textLight} />
                        <Text style={styles.orderHistoryDate}>Table {order.tableNumber}</Text>
                      </>
                    )}
                  </View>

                  {/* Discount / Loyalty info */}
                  {(order.discountAmount > 0 || order.loyaltyDiscount > 0 || order.loyaltyPointsEarned > 0) && (
                    <View style={styles.orderHistoryExtras}>
                      {order.discountAmount > 0 && (
                        <View style={[styles.offerDetailChip, { backgroundColor: '#fef3c7' }]}>
                          <Ionicons name="pricetag" size={11} color="#d97706" />
                          <Text style={[styles.offerDetailText, { color: '#d97706' }]}>
                            Offer -₹{order.discountAmount}
                          </Text>
                        </View>
                      )}
                      {order.loyaltyDiscount > 0 && (
                        <View style={[styles.offerDetailChip, { backgroundColor: '#f5f3ff' }]}>
                          <Ionicons name="diamond" size={11} color="#7c3aed" />
                          <Text style={[styles.offerDetailText, { color: '#7c3aed' }]}>
                            Loyalty -₹{order.loyaltyDiscount}
                          </Text>
                        </View>
                      )}
                      {order.loyaltyPointsEarned > 0 && (
                        <View style={[styles.offerDetailChip, { backgroundColor: '#f0fdf4' }]}>
                          <Ionicons name="trending-up" size={11} color="#16a34a" />
                          <Text style={[styles.offerDetailText, { color: '#16a34a' }]}>
                            +{order.loyaltyPointsEarned} pts
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    );
  };

  // ──────────────────────────────────────────────────── MAIN RENDER

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading customers...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── Header ─────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Customers</Text>
          <Text style={styles.headerSubtitle}>
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {activeTab === 'customers' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingCustomer(null);
              setCustomerForm({ ...emptyCustomerForm });
              setFormErrors({});
              setShowAddModal(true);
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Tabs ───────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Ionicons
                name={isActive ? tab.icon : `${tab.icon}-outline`}
                size={18}
                color={isActive ? Colors.primary : Colors.textLight}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tab Content ────────────────────────────── */}

      {/* CUSTOMERS TAB */}
      {activeTab === 'customers' && (
        <>
          {/* Search & Sort */}
          <View style={styles.searchSortRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search name, phone, email..."
                placeholderTextColor={Colors.textLight}
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
              {searchTerm.length > 0 && (
                <TouchableOpacity onPress={() => setSearchTerm('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textLight} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setShowSortPicker(!showSortPicker)}
            >
              <Ionicons name="swap-vertical" size={18} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              <Ionicons
                name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'}
                size={18}
                color={Colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Sort picker */}
          {showSortPicker && (
            <View style={styles.sortPickerRow}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
                  onPress={() => { setSortBy(opt.key); setShowSortPicker(false); }}
                >
                  <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Customer list */}
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            renderItem={renderCustomerItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons
                  name={searchTerm ? 'search' : 'people-outline'}
                  size={56}
                  color={Colors.textLight}
                />
                <Text style={styles.emptyTitle}>
                  {searchTerm ? 'No customers found' : 'No customers yet'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchTerm
                    ? 'Try a different search term'
                    : 'Customers will appear here when they place orders or are added manually.'}
                </Text>
                {!searchTerm && (
                  <TouchableOpacity
                    style={[styles.addButton, { marginTop: Spacing.lg }]}
                    onPress={() => {
                      setEditingCustomer(null);
                      setCustomerForm({ ...emptyCustomerForm });
                      setShowAddModal(true);
                    }}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addButtonText}>Add First Customer</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        </>
      )}

      {/* OFFERS TAB */}
      {activeTab === 'offers' && (
        loadingOffers ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : offers.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyState}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            <Ionicons name="pricetag-outline" size={56} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No Offers</Text>
            <Text style={styles.emptySubtitle}>
              Create offers from the Offers section in More menu or from the web dashboard.
            </Text>
            <TouchableOpacity
              style={[styles.addButton, { marginTop: Spacing.lg }]}
              onPress={() => router.push('/(tabs)/offers')}
            >
              <Ionicons name="pricetag" size={18} color="#fff" />
              <Text style={styles.addButtonText}>Go to Offers</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(item) => item.id}
            renderItem={renderOfferItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          />
        )
      )}

      {/* LOYALTY TAB */}
      {activeTab === 'loyalty' && renderLoyaltyTab()}

      {/* ── Modals ──────────────────────────────────── */}
      {renderCustomerFormModal()}
      {renderProfileModal()}
      {renderOrderHistoryModal()}
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────── STYLES

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textMedium,
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Tabs ────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundWhite,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textLight,
  },
  tabTextActive: {
    color: Colors.primary,
  },

  // ── Search & Sort ───────────────────────────────────
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
  },
  sortBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  sortChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.backgroundWhite,
  },
  sortChipActive: {
    backgroundColor: Colors.primary,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  sortChipTextActive: {
    color: '#fff',
  },

  // ── Customer card ───────────────────────────────────
  listContent: {
    padding: Spacing.md,
    paddingBottom: 120,
  },
  customerCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  customerInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    flexShrink: 1,
  },
  craveBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  craveBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563eb',
  },
  loyaltyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  loyaltyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7c3aed',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chipText: {
    fontSize: 12,
    color: Colors.textLight,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  statTextLight: {
    fontSize: 11,
    color: Colors.textLight,
  },
  statDot: {
    fontSize: 10,
    color: Colors.textLight,
  },
  customerActions: {
    flexDirection: 'column',
    gap: 6,
    marginLeft: Spacing.sm,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Offer card ──────────────────────────────────────
  offerCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  offerCardInactive: {
    opacity: 0.6,
  },
  offerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  offerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  offerDesc: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  offerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: Spacing.sm,
  },
  offerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  offerDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  offerDetailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  offerDetailText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  offerDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  offerDateText: {
    fontSize: 11,
    color: Colors.textLight,
  },

  // ── Loyalty section ─────────────────────────────────
  loyaltyContent: {
    padding: Spacing.md,
    paddingBottom: 120,
  },
  loyaltyStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.md,
  },
  loyaltyEnabled: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  loyaltyDisabled: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  loyaltyStatusTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  loyaltyStatusSubtitle: {
    fontSize: 13,
    color: Colors.textMedium,
    marginTop: 3,
  },
  loyaltyRuleCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  loyaltyRuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  loyaltyRuleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  loyaltyRuleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  loyaltyRuleLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  loyaltyRuleValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  topCustomerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  topCustomerRank: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textLight,
    width: 24,
  },
  topCustomerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#7c3aed15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topCustomerInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c3aed',
  },
  topCustomerName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  topCustomerOrders: {
    fontSize: 11,
    color: Colors.textLight,
  },
  topCustomerPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f5f3ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topCustomerPointsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c3aed',
  },

  // ── Empty state ─────────────────────────────────────
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },

  // ── Modal ───────────────────────────────────────────
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    flex: 1,
    textAlign: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  cancelBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  saveBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // ── Form ────────────────────────────────────────────
  formScroll: {
    flex: 1,
    padding: Spacing.lg,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  formInput: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.textDark,
  },
  formInputError: {
    borderColor: Colors.error,
  },
  formError: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 4,
  },

  // ── Profile modal ───────────────────────────────────
  profileHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: '#f5f3ff',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  profileAvatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
  },
  profilePhone: {
    fontSize: 14,
    color: '#7c3aed',
    marginTop: 4,
  },
  profileSection: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  profileSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.md,
  },
  profileSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7c3aed',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statBoxLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  profileInfoText: {
    fontSize: 14,
    color: Colors.textMedium,
  },

  // ── Loyalty history ─────────────────────────────────
  loyaltyHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  loyaltyHistoryText: {
    fontSize: 13,
    color: Colors.textDark,
    textTransform: 'capitalize',
  },
  loyaltyHistoryDate: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
  },
  loyaltyHistoryPoints: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Order rows ──────────────────────────────────────
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  orderTypeBadge: {
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMedium,
    textTransform: 'capitalize',
  },
  orderDate: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
  },
  orderAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },

  // ── Order history cards ─────────────────────────────
  orderHistoryCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  orderHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderHistoryNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  orderHistoryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  orderHistoryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderHistoryDate: {
    fontSize: 12,
    color: Colors.textLight,
  },
  orderHistoryExtras: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },

  // ── Settings styles ─────────────────────────────────
  settingsToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  settingsHint: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 2,
    marginBottom: Spacing.xs,
  },
  settingsFieldRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  toggleBtn: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleBtnOn: {
    backgroundColor: '#16a34a',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  codeDisplay: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 2,
  },
  codeActionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeActionBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  urlPrefix: {
    fontSize: 14,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  urlDisplayBox: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  urlDisplayText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  urlActionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  urlActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.backgroundLight,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
  },
  urlActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  row: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 13,
    color: '#16a34a',
    marginBottom: 4,
    lineHeight: 20,
  },
  saveSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.medium,
    marginTop: Spacing.md,
  },
  saveSettingsBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
