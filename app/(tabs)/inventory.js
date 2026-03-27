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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import * as ImagePicker from 'expo-image-picker';

// ── Tabs ────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview', icon: 'stats-chart' },
  { key: 'stock', label: 'Stock', icon: 'cube' },
  { key: 'recipes', label: 'Recipes', icon: 'list' },
  { key: 'usage', label: 'Usage', icon: 'time' },
];

const USAGE_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: '7days', label: '7 Days' },
  { key: '30days', label: '30 Days' },
];

const CATEGORY_OPTIONS = [
  'Vegetables', 'Fruits', 'Dairy', 'Meat', 'Seafood', 'Grains',
  'Spices', 'Oils', 'Beverages', 'Packaging', 'Cleaning', 'Other',
];

const UNIT_OPTIONS = [
  'kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'bag', 'can', 'bottle',
];

const QUICK_ORDER_MODES = [
  { key: 'manual', label: 'Manual', icon: 'list' },
  { key: 'text', label: 'Paste Text', icon: 'document-text' },
  { key: 'image', label: 'Photo', icon: 'camera' },
];

const ORDER_SOURCES = [
  { key: 'zomato', label: 'Zomato' },
  { key: 'swiggy', label: 'Swiggy' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'phone', label: 'Phone' },
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'other', label: 'Other' },
];

const emptyItemForm = {
  name: '',
  category: 'Vegetables',
  unit: 'kg',
  currentStock: '',
  minStock: '',
  costPerUnit: '',
};

export default function InventoryScreen() {
  const router = useRouter();

  // ── Core state ──────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // ── Overview state ────────────────────────────────
  const [dashboard, setDashboard] = useState(null);

  // ── Stock state ───────────────────────────────────
  const [stockItems, setStockItems] = useState([]);
  const [stockSearch, setStockSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemForm, setItemForm] = useState({ ...emptyItemForm });
  const [saving, setSaving] = useState(false);

  // ── Recipe state ──────────────────────────────────
  const [recipes, setRecipes] = useState([]);

  // ── Usage state ───────────────────────────────────
  const [usagePeriod, setUsagePeriod] = useState('today');
  const [usageSummary, setUsageSummary] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Quick Order Logger
  const [showQuickOrderModal, setShowQuickOrderModal] = useState(false);
  const [quickOrderMode, setQuickOrderMode] = useState('manual');
  const [quickOrderText, setQuickOrderText] = useState('');
  const [quickOrderParsedItems, setQuickOrderParsedItems] = useState([]);
  const [quickOrderSource, setQuickOrderSource] = useState('zomato');
  const [quickOrderParsing, setQuickOrderParsing] = useState(false);
  const [quickOrderConfirming, setQuickOrderConfirming] = useState(false);
  const [quickOrderManualItems, setQuickOrderManualItems] = useState([]);
  const [quickMenuItems, setQuickMenuItems] = useState([]);
  const [quickMenuSearch, setQuickMenuSearch] = useState('');

  // ── Init ──────────────────────────────────────────
  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) {
        refreshData();
      }
    }, [restaurantId, loading, activeTab])
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
        Alert.alert('Access Denied', 'Inventory management requires owner/manager access.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      const rid = userData.restaurantId || userData.restaurant?.id;
      setRestaurantId(rid);
      if (rid) {
        await loadAllData(rid);
      }
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllData = async (rid) => {
    await Promise.all([
      loadDashboard(rid),
      loadStockItems(rid),
      loadRecipes(rid),
      loadUsageData(rid, usagePeriod),
    ]);
  };

  const refreshData = async () => {
    if (!restaurantId) return;
    switch (activeTab) {
      case 'overview':
        await loadDashboard(restaurantId);
        break;
      case 'stock':
        await loadStockItems(restaurantId);
        break;
      case 'recipes':
        await loadRecipes(restaurantId);
        break;
      case 'usage':
        await loadUsageData(restaurantId, usagePeriod);
        break;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  // ── Data loaders ──────────────────────────────────
  const loadDashboard = async (rid) => {
    try {
      const res = await apiClient.getInventoryDashboard(rid);
      setDashboard(res.dashboard || res || null);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  const loadStockItems = async (rid) => {
    try {
      const res = await apiClient.getInventoryItems(rid);
      setStockItems(res.items || res.inventory || []);
    } catch (error) {
      console.error('Error loading stock items:', error);
    }
  };

  const loadRecipes = async (rid) => {
    try {
      const res = await apiClient.getRecipes(rid);
      setRecipes(res.recipes || []);
    } catch (error) {
      console.error('Error loading recipes:', error);
    }
  };

  const loadUsageData = async (rid, period) => {
    try {
      const [summaryRes, txRes] = await Promise.all([
        apiClient.getInventoryUsageSummary(rid, { period }),
        apiClient.getInventoryTransactions(rid, { period, limit: '20' }),
      ]);
      setUsageSummary(summaryRes.summary || summaryRes.items || []);
      setTransactions(txRes.transactions || []);
    } catch (error) {
      console.error('Error loading usage data:', error);
    }
  };

  // ── Stock helpers ─────────────────────────────────
  const getStockStatus = (item) => {
    const current = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 0;
    if (current <= min) return 'low';
    if (current <= min * 1.5) return 'warning';
    return 'good';
  };

  const getStockColor = (status) => {
    switch (status) {
      case 'low': return Colors.error;
      case 'warning': return Colors.warning;
      default: return Colors.success;
    }
  };

  const getStockLabel = (status) => {
    switch (status) {
      case 'low': return 'Low';
      case 'warning': return 'Warning';
      default: return 'OK';
    }
  };

  const filteredStock = stockItems.filter((item) =>
    item.name?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  // ── Add item ──────────────────────────────────────
  const handleAddItem = async () => {
    if (!itemForm.name.trim()) {
      Alert.alert('Error', 'Item name is required.');
      return;
    }
    if (!itemForm.currentStock) {
      Alert.alert('Error', 'Current stock is required.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.createInventoryItem(restaurantId, {
        name: itemForm.name.trim(),
        category: itemForm.category,
        unit: itemForm.unit,
        currentStock: Number(itemForm.currentStock),
        minStock: Number(itemForm.minStock) || 0,
        costPerUnit: Number(itemForm.costPerUnit) || 0,
      });
      setShowAddModal(false);
      setItemForm({ ...emptyItemForm });
      await loadStockItems(restaurantId);
      if (activeTab === 'overview') await loadDashboard(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add item.');
    } finally {
      setSaving(false);
    }
  };

  // ── Period change ─────────────────────────────────
  const handlePeriodChange = (period) => {
    setUsagePeriod(period);
    if (restaurantId) loadUsageData(restaurantId, period);
  };

  const loadMenuItems = async () => {
    try {
      const res = await apiClient.getMenu(restaurantId);
      const items = (res.items || res.menuItems || []).filter(i => i.status === 'active');
      setQuickMenuItems(items);
    } catch (e) {
      console.error('Failed to load menu items:', e);
    }
  };

  const handleParseText = async () => {
    if (!quickOrderText.trim()) return;
    try {
      setQuickOrderParsing(true);
      const result = await apiClient.parseQuickOrderText(restaurantId, quickOrderText);
      setQuickOrderParsedItems(result.parsedItems || []);
      if (result.unmatchedNames?.length > 0) {
        Alert.alert('Parsed', `${result.totalMatched} matched, ${result.totalUnmatched} could not be matched.`);
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to parse text');
    } finally {
      setQuickOrderParsing(false);
    }
  };

  const handlePickOrderImage = async (useCamera = false) => {
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required'); return; }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery access is required'); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      }
      if (!result.canceled && result.assets?.[0]) {
        setQuickOrderParsing(true);
        try {
          const res = await apiClient.parseQuickOrderImage(restaurantId, result.assets[0].uri);
          setQuickOrderParsedItems(res.parsedItems || []);
          if (res.totalMatched > 0) {
            Alert.alert('Extracted', `${res.totalMatched} item(s) found in image`);
          }
        } catch (e) {
          Alert.alert('Error', e.message || 'Failed to extract from image');
        } finally {
          setQuickOrderParsing(false);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to access camera/gallery');
    }
  };

  const addManualItem = (menuItem) => {
    const existing = quickOrderManualItems.find(i => i.menuItemId === menuItem.id);
    if (existing) {
      setQuickOrderManualItems(prev => prev.map(i =>
        i.menuItemId === menuItem.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setQuickOrderManualItems(prev => [...prev, {
        menuItemId: menuItem.id, name: menuItem.name, price: menuItem.price, quantity: 1, matchType: 'exact',
      }]);
    }
    setQuickMenuSearch('');
  };

  const updateManualItemQty = (menuItemId, delta) => {
    setQuickOrderManualItems(prev => prev.map(i =>
      i.menuItemId === menuItemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
    ).filter(i => i.quantity > 0));
  };

  const handleConfirmQuickOrder = async () => {
    const items = quickOrderMode === 'manual'
      ? quickOrderManualItems.filter(i => i.quantity > 0)
      : quickOrderParsedItems.filter(i => i.menuItemId && i.quantity > 0);
    if (!items.length) { Alert.alert('No items', 'Add items before confirming'); return; }
    try {
      setQuickOrderConfirming(true);
      const result = await apiClient.confirmQuickOrder(restaurantId, items, quickOrderSource);
      setShowQuickOrderModal(false);
      setQuickOrderText('');
      setQuickOrderParsedItems([]);
      setQuickOrderManualItems([]);
      setQuickOrderMode('manual');
      Alert.alert('Success', result.message || `${items.length} item(s) logged and inventory deducted`);
      await loadAllData(restaurantId);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to confirm order');
    } finally {
      setQuickOrderConfirming(false);
    }
  };

  const resetQuickOrder = () => {
    setQuickOrderText('');
    setQuickOrderParsedItems([]);
    setQuickOrderManualItems([]);
    setQuickOrderMode('manual');
    setQuickOrderSource('zomato');
    setQuickMenuSearch('');
    setShowQuickOrderModal(false);
  };

  // ── Computed dashboard values ─────────────────────
  const totalItems = dashboard?.totalItems ?? stockItems.length;
  const lowStockCount = dashboard?.lowStockCount ?? stockItems.filter((i) => getStockStatus(i) === 'low').length;
  const categories = dashboard?.categoryCount ?? [...new Set(stockItems.map((i) => i.category).filter(Boolean))].length;
  const expiredCount = dashboard?.expiredCount ?? 0;
  const lowStockItems = dashboard?.lowStockItems ?? stockItems.filter((i) => getStockStatus(i) === 'low');
  const topUsage = dashboard?.topUsage ?? [];

  // ── Render helpers ────────────────────────────────

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.textDark} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Inventory</Text>
      <TouchableOpacity
        onPress={() => { loadMenuItems(); setShowQuickOrderModal(true); }}
        style={[styles.addBtn, { backgroundColor: '#7c3aed', marginRight: 8 }]}
      >
        <Ionicons name="receipt-outline" size={18} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addBtn}>
        <Ionicons name="add" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderTabBar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBarContent}
      style={styles.tabBar}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={isActive ? '#059669' : Colors.textLight}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  // ── OVERVIEW TAB ──────────────────────────────────
  const renderOverview = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Stat Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: Colors.info }]}>
          <Text style={styles.statValue}>{totalItems}</Text>
          <Text style={styles.statLabel}>Total Items</Text>
          <View style={[styles.statIconBg, { backgroundColor: Colors.info + '15' }]}>
            <Ionicons name="cube" size={18} color={Colors.info} />
          </View>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.error }]}>
          <Text style={[styles.statValue, { color: lowStockCount > 0 ? Colors.error : Colors.textDark }]}>{lowStockCount}</Text>
          <Text style={styles.statLabel}>Low Stock</Text>
          <View style={[styles.statIconBg, { backgroundColor: Colors.error + '15' }]}>
            <Ionicons name="warning" size={18} color={Colors.error} />
          </View>
        </View>
        <View style={[styles.statCard, { borderLeftColor: Colors.warning }]}>
          <Text style={styles.statValue}>{categories}</Text>
          <Text style={styles.statLabel}>Categories</Text>
          <View style={[styles.statIconBg, { backgroundColor: Colors.warning + '15' }]}>
            <Ionicons name="folder" size={18} color={Colors.warning} />
          </View>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#f97316' }]}>
          <Text style={[styles.statValue, { color: expiredCount > 0 ? '#f97316' : Colors.textDark }]}>{expiredCount}</Text>
          <Text style={styles.statLabel}>Expired</Text>
          <View style={[styles.statIconBg, { backgroundColor: '#f9731615' }]}>
            <Ionicons name="close-circle" size={18} color="#f97316" />
          </View>
        </View>
      </View>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Low Stock Alerts</Text>
          {lowStockItems.map((item, idx) => (
            <View key={item._id || item.id || idx} style={styles.alertRow}>
              <View style={styles.alertDot} />
              <Text style={styles.alertName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.alertStock}>
                {item.currentStock} / {item.minStock} {item.unit || ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Top Usage */}
      {topUsage.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Today's Top Usage</Text>
          {topUsage.slice(0, 3).map((item, idx) => (
            <View key={item._id || item.name || idx} style={styles.usagePreviewRow}>
              <Text style={styles.usagePreviewRank}>{idx + 1}</Text>
              <Text style={styles.usagePreviewName} numberOfLines={1}>{item.inventoryItemName || item.name}</Text>
              <Text style={styles.usagePreviewQty}>
                {item.totalQuantityConsumed || item.totalUsed || 0} {item.unit || ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {totalItems === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="cube-outline" size={60} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No inventory items yet</Text>
          <Text style={styles.emptySubtitle}>Tap the + button to add your first stock item</Text>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // ── STOCK TAB ─────────────────────────────────────
  const renderStockItem = ({ item }) => {
    const status = getStockStatus(item);
    const statusColor = getStockColor(status);
    return (
      <View style={styles.stockCard}>
        <View style={[styles.stockStatusBar, { backgroundColor: statusColor }]} />
        <View style={styles.stockCardBody}>
          <View style={styles.stockCardTop}>
            <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.stockBadge, { backgroundColor: statusColor + '15' }]}>
              <Text style={[styles.stockBadgeText, { color: statusColor }]}>
                {getStockLabel(status)}
              </Text>
            </View>
          </View>
          <Text style={styles.stockCategory}>{item.category || 'Uncategorized'}</Text>
          <Text style={styles.stockQty}>
            {item.currentStock} {item.unit || ''}
          </Text>
        </View>
      </View>
    );
  };

  const renderStock = () => (
    <View style={styles.tabContent}>
      <View style={styles.stockSearchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={Colors.textLight}
            value={stockSearch}
            onChangeText={setStockSearch}
          />
          {stockSearch.length > 0 && (
            <TouchableOpacity onPress={() => setStockSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.stockAddBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={filteredStock}
        renderItem={renderStockItem}
        keyExtractor={(item) => item._id || item.id || item.name}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={50} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>
                {stockSearch ? 'No matching items' : 'No stock items'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {stockSearch ? 'Try a different search term' : 'Tap + to add inventory items'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );

  // ── RECIPES TAB ───────────────────────────────────
  const renderRecipeItem = ({ item }) => {
    const ingredients = item.ingredients || [];
    const shown = ingredients.slice(0, 3);
    const remaining = ingredients.length - 3;
    return (
      <View style={styles.recipeCard}>
        <View style={styles.recipeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.recipeName} numberOfLines={1}>{item.name}</Text>
            {item.menuItemName && (
              <Text style={styles.recipeMenuItem} numberOfLines={1}>
                <Ionicons name="fast-food" size={12} color={Colors.textLight} />{' '}
                {item.menuItemName}
              </Text>
            )}
          </View>
          <View style={styles.recipeBadge}>
            <Text style={styles.recipeBadgeText}>
              {ingredients.length} ingredient{ingredients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        {shown.length > 0 && (
          <View style={styles.recipeIngredients}>
            {shown.map((ing, idx) => (
              <Text key={idx} style={styles.recipeIngText}>
                {'\u2022'} {ing.name || ing.itemName}: {ing.quantity} {ing.unit || ''}
              </Text>
            ))}
            {remaining > 0 && (
              <Text style={styles.recipeMore}>+{remaining} more</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderRecipes = () => (
    <FlatList
      data={recipes}
      renderItem={renderRecipeItem}
      keyExtractor={(item) => item._id || item.id || item.name}
      contentContainerStyle={[styles.listContent, styles.tabContent]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        !loading && (
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={50} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No recipes yet</Text>
            <Text style={styles.emptySubtitle}>Recipes link menu items to inventory ingredients</Text>
          </View>
        )
      }
    />
  );

  // ── USAGE TAB ─────────────────────────────────────
  const renderUsage = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Period selector */}
      <View style={styles.periodBar}>
        {USAGE_PERIODS.map((p) => {
          const isActive = usagePeriod === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.periodBtn, isActive && styles.periodBtnActive]}
              onPress={() => handlePeriodChange(p.key)}
            >
              <Text style={[styles.periodBtnText, isActive && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* By-ingredient summary */}
      {usageSummary.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>By Ingredient</Text>
          {usageSummary.map((item, idx) => (
            <View key={item._id || item.name || idx} style={styles.usageSummaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.usageSummaryName} numberOfLines={1}>
                  {item.inventoryItemName || item.name}
                </Text>
                <Text style={styles.usageSummaryCount}>
                  {item.transactionCount || 0} transaction{(item.transactionCount || 0) !== 1 ? 's' : ''}
                </Text>
              </View>
              <Text style={styles.usageSummaryQty}>
                -{item.totalQuantityConsumed || 0} {item.unit || ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent deductions */}
      {transactions.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionTitle}>Recent Deductions</Text>
          {transactions.map((tx, idx) => {
            const qty = Number(tx.quantityChange || tx.quantity || 0);
            const isNegative = qty < 0;
            return (
              <View key={tx._id || idx} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txName} numberOfLines={1}>
                    {tx.inventoryItemName || tx.itemName || tx.name}
                  </Text>
                  <Text style={styles.txDate}>
                    {tx.date ? new Date(tx.date).toLocaleString() : ''}
                  </Text>
                </View>
                <Text style={[styles.txQty, { color: isNegative ? Colors.error : Colors.success }]}>
                  {isNegative ? '' : '+'}{qty} {tx.unit || ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {usageSummary.length === 0 && transactions.length === 0 && !loading && (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={50} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No usage data</Text>
          <Text style={styles.emptySubtitle}>Usage will appear as orders deduct inventory</Text>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // ── ADD ITEM MODAL ────────────────────────────────
  const renderAddModal = () => (
    <Modal visible={showAddModal} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Inventory Item</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Name */}
            <Text style={styles.fieldLabel}>Item Name *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g. Tomatoes"
              placeholderTextColor={Colors.textLight}
              value={itemForm.name}
              onChangeText={(v) => setItemForm({ ...itemForm, name: v })}
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, itemForm.category === cat && styles.chipActive]}
                  onPress={() => setItemForm({ ...itemForm, category: cat })}
                >
                  <Text style={[styles.chipText, itemForm.category === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Unit */}
            <Text style={styles.fieldLabel}>Unit</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, itemForm.unit === u && styles.chipActive]}
                  onPress={() => setItemForm({ ...itemForm, unit: u })}
                >
                  <Text style={[styles.chipText, itemForm.unit === u && styles.chipTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Current Stock */}
            <Text style={styles.fieldLabel}>Current Stock *</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="0"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              value={itemForm.currentStock}
              onChangeText={(v) => setItemForm({ ...itemForm, currentStock: v })}
            />

            {/* Min Stock */}
            <Text style={styles.fieldLabel}>Minimum Stock (alert threshold)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="0"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              value={itemForm.minStock}
              onChangeText={(v) => setItemForm({ ...itemForm, minStock: v })}
            />

            {/* Cost Per Unit */}
            <Text style={styles.fieldLabel}>Cost Per Unit</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="0.00"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
              value={itemForm.costPerUnit}
              onChangeText={(v) => setItemForm({ ...itemForm, costPerUnit: v })}
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleAddItem}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Add Item</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── QUICK ORDER MODAL ───────────────────────────────
  const renderQuickOrderModal = () => {
    const validCount = quickOrderMode === 'manual'
      ? quickOrderManualItems.filter(i => i.quantity > 0).length
      : quickOrderParsedItems.filter(i => i.menuItemId && i.quantity > 0).length;

    const filteredMenuItems = quickMenuItems.filter(i =>
      quickMenuSearch.length > 0 && i.name?.toLowerCase().includes(quickMenuSearch.toLowerCase())
    ).slice(0, 5);

    const renderParsedItems = () => (
      quickOrderParsedItems.length > 0 && (
        <View style={{ marginTop: Spacing.sm }}>
          <Text style={styles.fieldLabel}>Parsed Items</Text>
          {quickOrderParsedItems.map((item, idx) => {
            const matchIcon = item.matchType === 'exact' ? 'checkmark-circle' : item.matchType === 'fuzzy' ? 'alert-circle' : 'close-circle';
            const matchColor = item.matchType === 'exact' ? Colors.success : item.matchType === 'fuzzy' ? Colors.warning : Colors.error;
            const isUnmatched = !item.menuItemId;
            return (
              <View key={idx} style={[styles.parsedItemRow, { backgroundColor: isUnmatched ? '#fef2f2' : '#fff' }]}>
                <Ionicons name={matchIcon} size={20} color={matchColor} />
                <Text style={styles.parsedItemName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.qtyControl}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => {
                      setQuickOrderParsedItems(prev => prev.map((p, i) =>
                        i === idx ? { ...p, quantity: Math.max(0, p.quantity - 1) } : p
                      ).filter(p => p.quantity > 0));
                    }}
                  >
                    <Ionicons name="remove" size={16} color={Colors.textDark} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => {
                      setQuickOrderParsedItems(prev => prev.map((p, i) =>
                        i === idx ? { ...p, quantity: p.quantity + 1 } : p
                      ));
                    }}
                  >
                    <Ionicons name="add" size={16} color={Colors.textDark} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )
    );

    return (
      <Modal visible={showQuickOrderModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quick Order Logger</Text>
              <TouchableOpacity onPress={resetQuickOrder}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Mode selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {QUICK_ORDER_MODES.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.chip, quickOrderMode === m.key && styles.chipActive]}
                    onPress={() => setQuickOrderMode(m.key)}
                  >
                    <Ionicons name={m.icon} size={14} color={quickOrderMode === m.key ? '#059669' : Colors.textLight} />
                    <Text style={[styles.chipText, quickOrderMode === m.key && styles.chipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Manual mode */}
              {quickOrderMode === 'manual' && (
                <View style={{ marginTop: Spacing.sm }}>
                  <Text style={styles.fieldLabel}>Search Menu Items</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Search by item name..."
                    placeholderTextColor={Colors.textLight}
                    value={quickMenuSearch}
                    onChangeText={setQuickMenuSearch}
                  />
                  {filteredMenuItems.length > 0 && (
                    <View style={{ marginTop: 6 }}>
                      {filteredMenuItems.map((item) => (
                        <View key={item.id || item._id} style={styles.menuSearchResult}>
                          <Text style={styles.menuSearchName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.menuSearchPrice}>{item.price ? `₹${item.price}` : ''}</Text>
                          <TouchableOpacity style={styles.menuSearchAddBtn} onPress={() => addManualItem(item)}>
                            <Ionicons name="add" size={18} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  {quickOrderManualItems.length > 0 && (
                    <View style={{ marginTop: Spacing.sm }}>
                      <Text style={styles.fieldLabel}>Added Items</Text>
                      {quickOrderManualItems.map((item) => (
                        <View key={item.menuItemId} style={styles.manualItemRow}>
                          <Text style={styles.manualItemName} numberOfLines={1}>{item.name}</Text>
                          <View style={styles.qtyControl}>
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateManualItemQty(item.menuItemId, -1)}>
                              <Ionicons name="remove" size={16} color={Colors.textDark} />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{item.quantity}</Text>
                            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateManualItemQty(item.menuItemId, 1)}>
                              <Ionicons name="add" size={16} color={Colors.textDark} />
                            </TouchableOpacity>
                          </View>
                          <Text style={{ ...Typography.small, color: Colors.textLight, marginLeft: 8 }}>
                            ₹{(item.price || 0) * item.quantity}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Text mode */}
              {quickOrderMode === 'text' && (
                <View style={{ marginTop: Spacing.sm }}>
                  <Text style={styles.fieldLabel}>Paste Order Text</Text>
                  <TextInput
                    style={[styles.fieldInput, { minHeight: 120, textAlignVertical: 'top' }]}
                    placeholder={"Paste orders here...\ne.g. '10 cardamom tea, 5 black coffee'\nor paste WhatsApp/Zomato orders"}
                    placeholderTextColor={Colors.textLight}
                    value={quickOrderText}
                    onChangeText={setQuickOrderText}
                    multiline
                    numberOfLines={5}
                  />
                  <TouchableOpacity
                    style={[styles.parseBtn, quickOrderParsing && { opacity: 0.6 }]}
                    onPress={handleParseText}
                    disabled={quickOrderParsing}
                  >
                    {quickOrderParsing ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#fff" />
                        <Text style={styles.parseBtnText}>Parse with AI</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {renderParsedItems()}
                </View>
              )}

              {/* Image mode */}
              {quickOrderMode === 'image' && (
                <View style={{ marginTop: Spacing.sm }}>
                  <View style={styles.photoButtons}>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickOrderImage(true)}>
                      <Ionicons name="camera" size={22} color={Colors.textDark} />
                      <Text style={styles.photoBtnText}>Camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickOrderImage(false)}>
                      <Ionicons name="images" size={22} color={Colors.textDark} />
                      <Text style={styles.photoBtnText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                  {quickOrderParsing && (
                    <View style={{ alignItems: 'center', marginTop: Spacing.md }}>
                      <ActivityIndicator size="large" color="#059669" />
                      <Text style={{ ...Typography.small, color: Colors.textLight, marginTop: 8 }}>Extracting items from image...</Text>
                    </View>
                  )}
                  {renderParsedItems()}
                </View>
              )}

              {/* Source selector */}
              <Text style={styles.fieldLabel}>Order Source</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {ORDER_SOURCES.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, quickOrderSource === s.key && styles.chipActive]}
                    onPress={() => setQuickOrderSource(s.key)}
                  >
                    <Text style={[styles.chipText, quickOrderSource === s.key && styles.chipTextActive]}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Confirm button */}
              <TouchableOpacity
                style={[styles.saveBtn, (quickOrderConfirming || validCount === 0) && { opacity: 0.6 }]}
                onPress={handleConfirmQuickOrder}
                disabled={quickOrderConfirming || validCount === 0}
              >
                {quickOrderConfirming ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Confirm & Deduct Inventory ({validCount})</Text>
                )}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  // ── MAIN RENDER ───────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Loading inventory...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeader()}
      {renderTabBar()}

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'stock' && renderStock()}
      {activeTab === 'recipes' && renderRecipes()}
      {activeTab === 'usage' && renderUsage()}

      {renderAddModal()}
      {renderQuickOrderModal()}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textLight,
    marginTop: Spacing.sm,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.textDark,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Tab bar
  tabBar: {
    maxHeight: 48,
    marginBottom: Spacing.sm,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#ecfdf5',
  },
  tabLabel: {
    ...Typography.small,
    color: Colors.textLight,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#059669',
  },

  tabContent: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: 12,
    marginTop: Spacing.sm,
  },
  statCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    padding: 16,
    borderLeftWidth: 4,
    ...Shadows.small,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statLabel: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 4,
  },
  statIconBg: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Sections
  sectionBlock: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },

  // Low stock alerts
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: BorderRadius.medium,
    marginBottom: 8,
    ...Shadows.small,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
    marginRight: 10,
  },
  alertName: {
    ...Typography.body,
    color: Colors.textDark,
    flex: 1,
  },
  alertStock: {
    ...Typography.small,
    color: Colors.error,
    fontWeight: '600',
  },

  // Top usage preview
  usagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: BorderRadius.medium,
    marginBottom: 8,
    ...Shadows.small,
  },
  usagePreviewRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669' + '15',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
    marginRight: 10,
    overflow: 'hidden',
  },
  usagePreviewName: {
    ...Typography.body,
    color: Colors.textDark,
    flex: 1,
  },
  usagePreviewQty: {
    ...Typography.small,
    color: Colors.textMedium,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },

  // Stock tab
  stockSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    paddingHorizontal: 12,
    height: 42,
    ...Shadows.small,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    ...Typography.body,
    color: Colors.textDark,
  },
  stockAddBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Stock card
  stockCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    marginBottom: 10,
    borderRadius: BorderRadius.large,
    overflow: 'hidden',
    ...Shadows.small,
  },
  stockStatusBar: {
    width: 5,
  },
  stockCardBody: {
    flex: 1,
    padding: 14,
  },
  stockCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockName: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    flex: 1,
    marginRight: 8,
  },
  stockBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  stockBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stockCategory: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  stockQty: {
    ...Typography.body,
    color: Colors.textMedium,
    fontWeight: '600',
    marginTop: 4,
  },

  // Recipe card
  recipeCard: {
    backgroundColor: '#fff',
    marginHorizontal: Spacing.md,
    marginBottom: 10,
    borderRadius: BorderRadius.large,
    padding: 14,
    ...Shadows.small,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeName: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  recipeMenuItem: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  recipeBadge: {
    backgroundColor: '#059669' + '15',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  recipeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  recipeIngredients: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 10,
  },
  recipeIngText: {
    ...Typography.small,
    color: Colors.textMedium,
    marginBottom: 3,
  },
  recipeMore: {
    ...Typography.small,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },

  // Usage tab
  periodBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.large,
    backgroundColor: '#fff',
    alignItems: 'center',
    ...Shadows.small,
  },
  periodBtnActive: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#059669',
  },
  periodBtnText: {
    ...Typography.small,
    fontWeight: '600',
    color: Colors.textLight,
  },
  periodBtnTextActive: {
    color: '#059669',
  },

  // Usage summary
  usageSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: BorderRadius.medium,
    marginBottom: 8,
    ...Shadows.small,
  },
  usageSummaryName: {
    ...Typography.body,
    color: Colors.textDark,
    fontWeight: '600',
  },
  usageSummaryCount: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  usageSummaryQty: {
    ...Typography.bodyBold,
    color: Colors.error,
    fontSize: 14,
  },

  // Transactions
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: BorderRadius.medium,
    marginBottom: 8,
    ...Shadows.small,
  },
  txName: {
    ...Typography.body,
    color: Colors.textDark,
    fontWeight: '600',
  },
  txDate: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  txQty: {
    ...Typography.bodyBold,
    fontSize: 14,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: 20,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textDark,
  },
  fieldLabel: {
    ...Typography.small,
    color: Colors.textMedium,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  fieldInput: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Typography.body,
    color: Colors.textDark,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  chipRow: {
    flexDirection: 'row',
    maxHeight: 40,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.backgroundLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  chipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#059669',
  },
  chipText: {
    ...Typography.small,
    color: Colors.textMedium,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#059669',
  },
  saveBtn: {
    backgroundColor: '#059669',
    borderRadius: BorderRadius.large,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  saveBtnText: {
    ...Typography.bodyBold,
    color: '#fff',
    fontSize: 16,
  },

  // Quick Order styles
  quickModeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  menuSearchResult: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, backgroundColor: '#f9fafb', borderRadius: BorderRadius.medium,
    marginBottom: 6,
  },
  menuSearchName: {
    ...Typography.body, color: Colors.textDark, flex: 1,
  },
  menuSearchPrice: {
    ...Typography.small, color: Colors.textLight, marginRight: 8,
  },
  menuSearchAddBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center',
  },
  manualItemRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, backgroundColor: '#fff', borderRadius: BorderRadius.medium,
    marginBottom: 6, ...Shadows.small,
  },
  manualItemName: {
    ...Typography.body, color: Colors.textDark, flex: 1, fontWeight: '600',
  },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center',
  },
  qtyText: {
    ...Typography.bodyBold, color: Colors.textDark, minWidth: 24, textAlign: 'center',
  },
  parseBtn: {
    backgroundColor: '#059669', borderRadius: BorderRadius.large,
    paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  parseBtnText: {
    ...Typography.bodyBold, color: '#fff',
  },
  photoButtons: {
    flexDirection: 'row', gap: 12, marginTop: Spacing.sm,
  },
  photoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: BorderRadius.large,
    backgroundColor: '#f3f4f6', ...Shadows.small,
  },
  photoBtnText: {
    ...Typography.body, color: Colors.textDark, fontWeight: '600',
  },
  parsedItemRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 10, borderRadius: BorderRadius.medium,
    marginBottom: 6, ...Shadows.small,
  },
  parsedItemName: {
    ...Typography.body, color: Colors.textDark, flex: 1, fontWeight: '600', marginLeft: 8,
  },
});
