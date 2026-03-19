import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import BarMenuModal from '../../components/BarMenuModal';
import BarSettleModal from '../../components/BarSettleModal';

export default function BarBillingScreen() {
  // Core data
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [taxSettings, setTaxSettings] = useState(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [creatingTab, setCreatingTab] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [savingTab, setSavingTab] = useState(false);

  // Customer info editing
  const [editingName, setEditingName] = useState('');
  const [editingPhone, setEditingPhone] = useState('');

  // Debounce refs (mirror web pattern)
  const activeTabIdRef = useRef(null);
  const tabsRef = useRef([]);
  const updateTimerRef = useRef(null);
  const pendingUpdateRef = useRef(null);

  // Keep refs in sync
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, []);

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  // Sync customer fields when switching tabs
  useEffect(() => {
    if (activeTab) {
      setEditingName(activeTab.customerInfo?.name || '');
      setEditingPhone(activeTab.customerInfo?.phone || '');
    }
  }, [activeTabId]);

  // Load user & initial data
  useEffect(() => {
    const init = async () => {
      try {
        const userData = await apiClient.getUser();
        if (!userData) return;
        setUser(userData);
        const rid = userData.restaurantId || userData.restaurant?.id;
        setRestaurantId(rid);
        if (rid) {
          await Promise.all([
            fetchOpenTabs(rid),
            fetchMenu(rid),
            fetchTaxSettings(rid),
          ]);
        }
      } catch (error) {
        console.error('Bar POS init error:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchOpenTabs = async (rid) => {
    try {
      const response = await apiClient.getOrders(rid || restaurantId, { status: 'saved', limit: 50 });
      const openTabs = (response.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setTabs(openTabs);
      // Auto-select first tab if none selected
      if (!activeTabIdRef.current && openTabs.length > 0) {
        setActiveTabId(openTabs[0].id);
      }
    } catch (error) {
      console.error('Error fetching tabs:', error);
    }
  };

  const fetchMenu = async (rid) => {
    try {
      const response = await apiClient.getMenu(rid || restaurantId);
      const items = response.menuItems || response.items || response || [];
      setMenuItems(Array.isArray(items) ? items.filter(i => i.isAvailable !== false) : []);
    } catch (error) {
      console.error('Error fetching menu:', error);
    }
  };

  const fetchTaxSettings = async (rid) => {
    try {
      const response = await apiClient.getTaxSettings(rid || restaurantId);
      setTaxSettings(response.taxSettings || response);
    } catch (error) {
      console.error('Error fetching tax settings:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOpenTabs();
    setRefreshing(false);
  };

  // ==================== TAX CALCULATION ====================

  const calculateTax = useCallback((amount) => {
    if (!taxSettings?.taxes?.length) return { taxBreakdown: [], totalTax: 0 };
    const taxBreakdown = taxSettings.taxes
      .filter(t => t.enabled !== false)
      .map(t => ({
        name: t.name,
        rate: t.rate,
        amount: Math.round((amount * t.rate / 100) * 100) / 100,
      }));
    const totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
    return { taxBreakdown, totalTax: Math.round(totalTax * 100) / 100 };
  }, [taxSettings]);

  // ==================== TAB OPERATIONS ====================

  const openTab = async () => {
    if (!newTabName.trim() || !restaurantId) return;
    setCreatingTab(true);
    try {
      const orderData = {
        restaurantId,
        tableNumber: null,
        items: [],
        orderType: 'dine-in',
        paymentMethod: 'cash',
        status: 'saved',
        totalAmount: 0,
        taxBreakdown: [],
        taxAmount: 0,
        finalAmount: 0,
        customerInfo: { name: newTabName.trim() },
        staffInfo: {
          userId: user?.id,
          name: user?.name || 'Staff',
          loginId: user?.loginId || user?.phone || user?.id,
          phone: user?.phone || '',
          role: user?.role || 'waiter',
        },
      };
      const response = await apiClient.createOrder(orderData);
      if (response.order) {
        setTabs(prev => [response.order, ...prev]);
        setActiveTabId(response.order.id);
        setShowNewTabModal(false);
        setNewTabName('');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open tab: ' + error.message);
    } finally {
      setCreatingTab(false);
    }
  };

  // Debounced update — same pattern as web bar POS
  const scheduleUpdate = useCallback((tabId, updateData) => {
    pendingUpdateRef.current = { tabId, data: updateData };
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    updateTimerRef.current = setTimeout(async () => {
      const pending = pendingUpdateRef.current;
      if (pending) {
        try {
          await apiClient.updateOrder(pending.tabId, pending.data);
        } catch (err) {
          console.error('Failed to update tab:', err);
        }
        pendingUpdateRef.current = null;
      }
    }, 300);
  }, []);

  const addItemToTab = useCallback((menuItem) => {
    const currentTabId = activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    if (!currentTabId) return;

    const tabIndex = currentTabs.findIndex(t => t.id === currentTabId);
    if (tabIndex === -1) return;

    const tab = { ...currentTabs[tabIndex] };
    const items = [...(tab.items || [])];
    const existingIndex = items.findIndex(i => (i.menuItemId || i.id) === (menuItem.id || menuItem._id));

    if (existingIndex >= 0) {
      items[existingIndex] = { ...items[existingIndex], quantity: items[existingIndex].quantity + 1 };
    } else {
      items.push({
        menuItemId: menuItem.id || menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: 1,
        category: menuItem.category,
      });
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { taxBreakdown, totalTax } = calculateTax(subtotal);

    tab.items = items;
    tab.totalAmount = subtotal;
    tab.taxBreakdown = taxBreakdown;
    tab.taxAmount = totalTax;
    tab.finalAmount = Math.round((subtotal + totalTax) * 100) / 100;

    const newTabs = [...currentTabs];
    newTabs[tabIndex] = tab;
    setTabs(newTabs);

    scheduleUpdate(currentTabId, {
      items,
      totalAmount: subtotal,
      taxBreakdown,
      taxAmount: totalTax,
      finalAmount: tab.finalAmount,
    });
  }, [calculateTax, scheduleUpdate]);

  const updateItemQuantity = useCallback((menuItemId, delta) => {
    const currentTabId = activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    if (!currentTabId) return;

    const tabIndex = currentTabs.findIndex(t => t.id === currentTabId);
    if (tabIndex === -1) return;

    const tab = { ...currentTabs[tabIndex] };
    let items = [...(tab.items || [])];
    const itemIndex = items.findIndex(i => (i.menuItemId || i.id) === menuItemId);
    if (itemIndex === -1) return;

    const newQty = items[itemIndex].quantity + delta;
    if (newQty <= 0) {
      items = items.filter((_, idx) => idx !== itemIndex);
    } else {
      items[itemIndex] = { ...items[itemIndex], quantity: newQty };
    }

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { taxBreakdown, totalTax } = calculateTax(subtotal);

    tab.items = items;
    tab.totalAmount = subtotal;
    tab.taxBreakdown = taxBreakdown;
    tab.taxAmount = totalTax;
    tab.finalAmount = Math.round((subtotal + totalTax) * 100) / 100;

    const newTabs = [...currentTabs];
    newTabs[tabIndex] = tab;
    setTabs(newTabs);

    scheduleUpdate(currentTabId, {
      items,
      totalAmount: subtotal,
      taxBreakdown,
      taxAmount: totalTax,
      finalAmount: tab.finalAmount,
    });
  }, [calculateTax, scheduleUpdate]);

  const saveTab = async () => {
    if (!activeTabId || !activeTab) return;
    setSavingTab(true);
    try {
      // Flush pending updates
      if (pendingUpdateRef.current?.tabId === activeTabId) {
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
        await apiClient.updateOrder(pendingUpdateRef.current.tabId, pendingUpdateRef.current.data);
        pendingUpdateRef.current = null;
      }
      // Save customer info
      await apiClient.updateOrder(activeTabId, {
        customerInfo: {
          name: editingName.trim() || activeTab.customerInfo?.name,
          phone: editingPhone.trim() || activeTab.customerInfo?.phone,
        },
      });
      // Update local state
      setTabs(prev => prev.map(t =>
        t.id === activeTabId
          ? { ...t, customerInfo: { ...t.customerInfo, name: editingName.trim(), phone: editingPhone.trim() } }
          : t
      ));
      Alert.alert('Saved', 'Tab saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save tab: ' + error.message);
    } finally {
      setSavingTab(false);
    }
  };

  const handleSettle = async (paymentMethod, discount) => {
    if (!activeTabId || !activeTab) return;

    try {
      // Flush pending updates
      if (pendingUpdateRef.current?.tabId === activeTabId) {
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
        await apiClient.updateOrder(pendingUpdateRef.current.tabId, pendingUpdateRef.current.data);
        pendingUpdateRef.current = null;
      }

      const subtotal = (activeTab.items || []).reduce((sum, i) => sum + i.price * i.quantity, 0);
      const discountAmount = discount?.amount || 0;
      const afterDiscount = Math.max(0, subtotal - discountAmount);
      const { taxBreakdown, totalTax } = calculateTax(afterDiscount);
      const finalAmount = Math.round((afterDiscount + totalTax) * 100) / 100;

      // Step 1: Update order to completed
      await apiClient.updateOrder(activeTabId, {
        items: activeTab.items,
        status: 'completed',
        paymentStatus: 'paid',
        paymentMethod,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalAmount: subtotal,
        discountAmount: Math.round(discountAmount * 100) / 100,
        manualDiscount: discountAmount > 0 ? { type: discount.type, value: discount.value, amount: discountAmount } : null,
        taxBreakdown,
        taxAmount: totalTax,
        finalAmount,
        customerInfo: {
          name: editingName.trim() || activeTab.customerInfo?.name,
          phone: editingPhone.trim() || activeTab.customerInfo?.phone,
        },
        lastUpdatedBy: { name: user?.name, id: user?.id, role: user?.role },
      });

      // Step 2: Verify payment
      await apiClient.verifyPayment({
        orderId: activeTabId,
        paymentMethod,
        amount: finalAmount,
        userId: user?.id,
        restaurantId,
        paymentStatus: 'completed',
      });

      // Step 3: Remove from local state
      setTabs(prev => prev.filter(t => t.id !== activeTabId));
      setActiveTabId(null);
      setShowSettleModal(false);
      Alert.alert('Success', 'Tab settled successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to settle tab: ' + error.message);
    }
  };

  const voidTab = () => {
    if (!activeTabId) return;
    const tab = tabs.find(t => t.id === activeTabId);
    Alert.alert(
      'Void Tab',
      `Are you sure you want to void "${tab?.customerInfo?.name || 'this tab'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void Tab',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.updateOrder(activeTabId, { status: 'cancelled' });
              setTabs(prev => prev.filter(t => t.id !== activeTabId));
              setActiveTabId(null);
            } catch (error) {
              Alert.alert('Error', 'Failed to void tab: ' + error.message);
            }
          },
        },
      ]
    );
  };

  // ==================== HELPERS ====================

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading Bar POS...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderTabChip = ({ item }) => {
    const isActive = item.id === activeTabId;
    const itemCount = (item.items || []).reduce((sum, i) => sum + i.quantity, 0);
    const total = item.finalAmount || item.totalAmount || 0;

    return (
      <TouchableOpacity
        style={[styles.tabChip, isActive && styles.tabChipActive]}
        onPress={() => setActiveTabId(item.id)}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabChipName, isActive && styles.tabChipNameActive]} numberOfLines={1}>
          {item.customerInfo?.name || 'Tab'}
        </Text>
        <View style={styles.tabChipMeta}>
          {itemCount > 0 && (
            <Text style={[styles.tabChipAmount, isActive && styles.tabChipAmountActive]}>
              {formatCurrency(total)}
            </Text>
          )}
          <Text style={[styles.tabChipTime, isActive && styles.tabChipTimeActive]}>
            {timeAgo(item.createdAt)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderActiveTab = () => {
    if (!activeTab) {
      return (
        <View style={styles.emptyTabView}>
          <Ionicons name="beer-outline" size={80} color={Colors.borderLight} />
          <Text style={styles.emptyTabTitle}>
            {tabs.length === 0 ? 'No open tabs' : 'Select a tab'}
          </Text>
          <Text style={styles.emptyTabSubtitle}>
            {tabs.length === 0 ? 'Tap "+ New Tab" to get started' : 'Tap a tab above to view details'}
          </Text>
          {tabs.length === 0 && (
            <TouchableOpacity
              style={styles.emptyTabCTA}
              onPress={() => setShowNewTabModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.emptyTabCTAText}>Open First Tab</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    const items = activeTab.items || [];
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { taxBreakdown, totalTax } = calculateTax(subtotal);
    const grandTotal = Math.round((subtotal + totalTax) * 100) / 100;

    return (
      <ScrollView
        style={styles.activeTabScroll}
        contentContainerStyle={styles.activeTabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Customer Info */}
        <View style={styles.customerSection}>
          <View style={styles.customerRow}>
            <Ionicons name="person-outline" size={18} color={Colors.textMedium} />
            <TextInput
              style={styles.customerInput}
              value={editingName}
              onChangeText={setEditingName}
              placeholder="Customer name"
              placeholderTextColor={Colors.textLight}
            />
          </View>
          <View style={styles.customerRow}>
            <Ionicons name="call-outline" size={18} color={Colors.textMedium} />
            <TextInput
              style={styles.customerInput}
              value={editingPhone}
              onChangeText={setEditingPhone}
              placeholder="Phone (optional)"
              placeholderTextColor={Colors.textLight}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Items List */}
        {items.length === 0 ? (
          <View style={styles.noItemsContainer}>
            <Ionicons name="fast-food-outline" size={48} color={Colors.borderLight} />
            <Text style={styles.noItemsText}>No items yet</Text>
            <Text style={styles.noItemsHint}>Tap "Add Items" to browse the menu</Text>
          </View>
        ) : (
          <View style={styles.itemsCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsHeaderText}>Items ({items.reduce((s, i) => s + i.quantity, 0)})</Text>
            </View>
            {items.map((item, idx) => (
              <View key={item.menuItemId || idx} style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemPrice}>{formatCurrency(item.price)} each</Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => updateItemQuantity(item.menuItemId || item.id, -1)}
                  >
                    <Ionicons name="remove" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => updateItemQuantity(item.menuItemId || item.id, 1)}
                  >
                    <Ionicons name="add" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.itemTotal}>{formatCurrency(item.price * item.quantity)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
            </View>
            {taxBreakdown.map((tax, idx) => (
              <View key={idx} style={styles.totalRow}>
                <Text style={styles.taxLabel}>{tax.name} ({tax.rate}%)</Text>
                <Text style={styles.taxValue}>{formatCurrency(tax.amount)}</Text>
              </View>
            ))}
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{formatCurrency(grandTotal)}</Text>
            </View>
          </View>
        )}

        {/* Bottom spacer for action bar */}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="beer" size={24} color={Colors.primary} />
          <Text style={styles.headerTitle}>Bar POS</Text>
          {tabs.length > 0 && (
            <View style={styles.tabCountBadge}>
              <Text style={styles.tabCountText}>{tabs.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.newTabButton}
          onPress={() => setShowNewTabModal(true)}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newTabButtonText}>New Tab</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Strip */}
      {tabs.length > 0 && (
        <View style={styles.tabStripContainer}>
          <FlatList
            data={tabs}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            renderItem={renderTabChip}
            contentContainerStyle={styles.tabStripContent}
          />
        </View>
      )}

      {/* Active Tab Content */}
      <View style={styles.mainContent}>
        {renderActiveTab()}
      </View>

      {/* Action Bar */}
      {activeTab && (
        <View style={styles.actionBar}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.addItemsButton]}
              onPress={() => setShowMenuModal(true)}
            >
              <Ionicons name="fast-food-outline" size={20} color="#fff" />
              <Text style={styles.addItemsText}>Add Items</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.settleButton, !(activeTab.items?.length) && styles.actionButtonDisabled]}
              onPress={() => activeTab.items?.length && setShowSettleModal(true)}
              disabled={!activeTab.items?.length}
            >
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.settleText}>Settle</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.saveButton]}
              onPress={saveTab}
              disabled={savingTab}
            >
              {savingTab ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={18} color={Colors.primary} />
                  <Text style={styles.saveText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.voidButton]}
              onPress={voidTab}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={styles.voidText}>Void</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* New Tab Modal */}
      <Modal
        visible={showNewTabModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewTabModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.newTabCard}>
            <Text style={styles.newTabTitle}>Open New Tab</Text>
            <Text style={styles.newTabHint}>Enter a name for this tab (customer name, table, etc.)</Text>
            <TextInput
              style={styles.newTabInput}
              value={newTabName}
              onChangeText={setNewTabName}
              placeholder="e.g. John, Table 5, VIP..."
              placeholderTextColor={Colors.textLight}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => newTabName.trim() && openTab()}
            />
            <View style={styles.newTabActions}>
              <TouchableOpacity
                style={styles.newTabCancel}
                onPress={() => { setShowNewTabModal(false); setNewTabName(''); }}
              >
                <Text style={styles.newTabCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.newTabSubmit, (!newTabName.trim() || creatingTab) && styles.newTabSubmitDisabled]}
                onPress={openTab}
                disabled={!newTabName.trim() || creatingTab}
              >
                {creatingTab ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.newTabSubmitText}>Open Tab</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Menu Modal */}
      <BarMenuModal
        visible={showMenuModal}
        onClose={() => setShowMenuModal(false)}
        menuItems={menuItems}
        activeTab={activeTab}
        onAddItem={addItemToTab}
        onUpdateQty={updateItemQuantity}
      />

      {/* Settle Modal */}
      <BarSettleModal
        visible={showSettleModal}
        onClose={() => setShowSettleModal(false)}
        tab={activeTab}
        taxSettings={taxSettings}
        onSettle={handleSettle}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textMedium,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textDark,
  },
  tabCountBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  tabCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  newTabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newTabButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Tab Strip
  tabStripContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabStripContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  tabChip: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 100,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabChipActive: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary,
  },
  tabChipName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  tabChipNameActive: {
    color: Colors.primary,
  },
  tabChipMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabChipAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  tabChipAmountActive: {
    color: Colors.primary,
  },
  tabChipTime: {
    fontSize: 11,
    color: Colors.textLight,
  },
  tabChipTimeActive: {
    color: Colors.primary + '80',
  },

  // Main Content
  mainContent: {
    flex: 1,
  },

  // Empty State
  emptyTabView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
    marginTop: Spacing.md,
  },
  emptyTabSubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
    textAlign: 'center',
  },
  emptyTabCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: Spacing.md,
  },
  emptyTabCTAText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Active Tab
  activeTabScroll: {
    flex: 1,
  },
  activeTabContent: {
    padding: Spacing.md,
    gap: Spacing.md,
  },

  // Customer Section
  customerSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 10,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textDark,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  // No Items
  noItemsContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  noItemsText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  noItemsHint: {
    fontSize: 13,
    color: Colors.textLight,
  },

  // Items Card
  itemsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  itemsHeader: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemsHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  itemPrice: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 14,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    minWidth: 20,
    textAlign: 'center',
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    minWidth: 60,
    textAlign: 'right',
  },

  // Totals Card
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  taxLabel: {
    fontSize: 13,
    color: Colors.textLight,
  },
  taxValue: {
    fontSize: 13,
    color: Colors.textLight,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
  },
  grandTotalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },

  // Action Bar
  actionBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 6 : 10,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  addItemsButton: {
    backgroundColor: Colors.primary,
  },
  addItemsText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  settleButton: {
    backgroundColor: Colors.accentGreen,
  },
  settleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  saveText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  voidButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.error + '40',
  },
  voidText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600',
  },

  // New Tab Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  newTabCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 380,
  },
  newTabTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textDark,
    marginBottom: 4,
  },
  newTabHint: {
    fontSize: 13,
    color: Colors.textMedium,
    marginBottom: Spacing.md,
  },
  newTabInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.textDark,
    borderWidth: 2,
    borderColor: '#f0f0f0',
    marginBottom: Spacing.md,
  },
  newTabActions: {
    flexDirection: 'row',
    gap: 10,
  },
  newTabCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  newTabCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  newTabSubmit: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  newTabSubmitDisabled: {
    opacity: 0.5,
  },
  newTabSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
