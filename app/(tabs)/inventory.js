import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  RefreshControl, ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import apiClient from '../../services/api';
import { Alert } from 'react-native';
import { hasFeatureAccess } from '../../utils/permissions';

// Hook & components
import { useOffline } from '../../hooks/useOffline';
import OnlineOnly from '../../components/OnlineOnly';
import useInventoryData from '../../components/inventory/useInventoryData';
import DashboardTab from '../../components/inventory/DashboardTab';
import StockTab from '../../components/inventory/StockTab';
import RecipesTab from '../../components/inventory/RecipesTab';
import UsageTab from '../../components/inventory/UsageTab';
import ProcurementTab from '../../components/inventory/ProcurementTab';
import InsightsTab from '../../components/inventory/InsightsTab';
import WasteTab from '../../components/inventory/WasteTab';
import {
  AddEditItemModal, AddSupplierModal, AddEditRecipeModal,
  ViewRecipeModal, QuickStockModal, AddPurchaseOrderModal, QuickOrderModal,
  LogWasteModal, AILeftoverModal, SmartImportModal,
} from '../../components/inventory/InventoryModals';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'stats-chart' },
  { key: 'stock', label: 'Stock', icon: 'cube' },
  { key: 'recipes', label: 'Recipes', icon: 'restaurant' },
  { key: 'usage', label: 'Usage', icon: 'time' },
  { key: 'procurement', label: 'Procurement', icon: 'cart' },
  { key: 'insights', label: 'AI Insights', icon: 'sparkles' },
  { key: 'waste', label: 'Waste', icon: 'trash' },
];

export default function InventoryScreen() {
  const router = useRouter();
  const { effectivelyOffline } = useOffline();
  const inv = useInventoryData();
  const [showSmartImport, setShowSmartImport] = useState(false);

  // ── Init ──────────────────────────────────────────
  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        const userData = await apiClient.getUser();
        const rid = userData?.restaurantId || userData?.restaurant?.id;
        if (rid && rid !== inv.restaurantId) {
          // Restaurant was switched on another screen — reload
          inv.setRestaurantId(rid);
          await inv.loadCoreData(rid);
        } else if (inv.restaurantId && !inv.loading) {
          inv.refreshData();
        }
      };
      checkAndRefresh();
    }, [inv.restaurantId, inv.loading, inv.activeTab])
  );

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) { router.replace('/(auth)/login'); return; }

      // owner/admin always allowed; manager kept for backwards compat; custom roles check pageAccess
      const role = userData.role?.toLowerCase();
      if (!['owner', 'admin', 'manager'].includes(role) && !hasFeatureAccess(userData, 'inventory')) {
        Alert.alert('Access Denied', 'You do not have permission to access inventory.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        return;
      }

      const rid = userData.restaurantId || userData.restaurant?.id;
      inv.setRestaurantId(rid);
      if (rid) await inv.loadCoreData(rid);
    } catch (error) {
      console.error('Error loading inventory data:', error);
    }
  };

  // ── Loading ───────────────────────────────────────
  if (inv.loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </SafeAreaView>
    );
  }

  // ── Header action for current tab ─────────────────
  const getHeaderAction = () => {
    switch (inv.activeTab) {
      case 'stock': return { icon: 'add', onPress: inv.openAddItem };
      case 'recipes': return { icon: 'add', onPress: inv.openAddRecipe };
      case 'procurement':
        if (inv.procurementSubTab === 'suppliers') return { icon: 'add', onPress: () => inv.setShowAddSupplierModal(true) };
        if (inv.procurementSubTab === 'orders') return { icon: 'add', onPress: () => inv.setShowAddPOModal(true) };
        return null;
      default: return null;
    }
  };

  const headerAction = getHeaderAction();

  // ── Render tab content ────────────────────────────
  const renderTabContent = () => {
    switch (inv.activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            totalItems={inv.totalItems} lowStockCount={inv.lowStockCount}
            totalValue={inv.totalValue} categoryCount={inv.categoryCount}
            suppliers={inv.suppliers} lowStockItems={inv.lowStockItems}
            purchaseOrders={inv.purchaseOrders} inventoryItems={inv.inventoryItems}
            getStockStatus={inv.getStockStatus} getStockColor={inv.getStockColor}
            getStockPercent={inv.getStockPercent} getOrderStatusColor={inv.getOrderStatusColor}
            openAddItem={inv.openAddItem} setShowQuickStockModal={inv.setShowQuickStockModal}
            setActiveTab={inv.setActiveTab}
            onLogWaste={() => inv.setShowLogWasteModal(true)}
          />
        );
      case 'stock':
        return (
          <StockTab
            filteredSortedItems={inv.filteredSortedItems} inventoryItems={inv.inventoryItems}
            categories={inv.categories} todayUsageSummary={inv.todayUsageSummary}
            searchTerm={inv.searchTerm} setSearchTerm={inv.setSearchTerm}
            selectedCategory={inv.selectedCategory} setSelectedCategory={inv.setSelectedCategory}
            sortBy={inv.sortBy} setSortBy={inv.setSortBy}
            sortOrder={inv.sortOrder} setSortOrder={inv.setSortOrder}
            totalItems={inv.totalItems} lowStockCount={inv.lowStockCount}
            totalValue={inv.totalValue} categoryCount={inv.categoryCount}
            getStockStatus={inv.getStockStatus} getStockColor={inv.getStockColor}
            getStockPercent={inv.getStockPercent}
            handleEditItem={inv.handleEditItem} handleDeleteItem={inv.handleDeleteItem}
            openAddItem={inv.openAddItem}
          />
        );
      case 'recipes':
        return (
          <RecipesTab
            recipes={inv.recipes} inventoryItems={inv.inventoryItems}
            openAddRecipe={inv.openAddRecipe} openEditRecipe={inv.openEditRecipe}
            openViewRecipe={inv.openViewRecipe} handleDeleteRecipe={inv.handleDeleteRecipe}
            getCostPerServing={inv.getCostPerServing}
          />
        );
      case 'usage':
        return (
          <UsageTab
            usageSummary={inv.usageSummary} usageTransactions={inv.usageTransactions}
            usagePeriod={inv.usagePeriod}
            usageStartDate={inv.usageStartDate} setUsageStartDate={inv.setUsageStartDate}
            usageEndDate={inv.usageEndDate} setUsageEndDate={inv.setUsageEndDate}
            handlePeriodChange={inv.handlePeriodChange} applyCustomDateRange={inv.applyCustomDateRange}
          />
        );
      case 'procurement':
        return (
          <ProcurementTab
            procurementSubTab={inv.procurementSubTab} setProcurementSubTab={inv.setProcurementSubTab}
            suppliers={inv.suppliers} supplierPerformance={inv.supplierPerformance}
            purchaseOrders={inv.purchaseOrders}
            requisitions={inv.requisitions} grns={inv.grns}
            invoices={inv.invoices} supplierReturns={inv.supplierReturns}
            stockTransfers={inv.stockTransfers}
            setShowAddSupplierModal={inv.setShowAddSupplierModal}
            setShowAddPOModal={inv.setShowAddPOModal}
            handleDeleteSupplier={inv.handleDeleteSupplier}
            handleUpdatePOStatus={inv.handleUpdatePOStatus} handleEmailPO={inv.handleEmailPO}
            getOrderStatusColor={inv.getOrderStatusColor}
            getNextPOAction={inv.getNextPOAction} getNextPOActionLabel={inv.getNextPOActionLabel}
          />
        );
      case 'insights':
        return (
          <OnlineOnly mode="badge">
            <InsightsTab
              aiReorderSuggestions={inv.aiReorderSuggestions}
              wastePredictions={inv.wastePredictions} wasteSummary={inv.wasteSummary}
              inventoryItems={inv.inventoryItems} lowStockCount={inv.lowStockCount}
              totalValue={inv.totalValue} getStockStatus={inv.getStockStatus}
            />
          </OnlineOnly>
        );
      case 'waste':
        return (
          <WasteTab
            wasteEntries={inv.wasteEntries}
            wasteSummary={inv.wasteSummary}
            expiryAlerts={inv.wasteExpiryAlerts}
            wastePeriod={inv.wastePeriod}
            setWastePeriod={inv.setWastePeriod}
            wasteReason={inv.wasteReason}
            setWasteReason={inv.setWasteReason}
            loading={inv.saving}
            onLogWaste={() => inv.setShowLogWasteModal(true)}
            onAILeftover={() => inv.setShowAILeftoverModal(true)}
            onRefresh={inv.loadWasteData}
            onMarkExpiredWaste={inv.handleMarkExpiredWaste}
            onDismissExpired={inv.handleDismissExpired}
          />
        );
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inventory</Text>
        {effectivelyOffline && (
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, marginRight: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444', marginRight: 4 }} />
            <Text style={{ fontSize: 11, color: '#ef4444', fontWeight: '600' }}>Offline</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setShowSmartImport(true)}
          style={[styles.headerBtn, { backgroundColor: '#059669' }]}
        >
          <Ionicons name="sparkles" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => inv.setShowQuickOrderModal(true)}
          style={[styles.headerBtn, { backgroundColor: '#7c3aed' }]}
        >
          <Ionicons name="receipt-outline" size={18} color="#fff" />
        </TouchableOpacity>
        {headerAction && (
          <TouchableOpacity onPress={headerAction.onPress} style={styles.headerBtn}>
            <Ionicons name={headerAction.icon} size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
        style={styles.tabBar}
      >
        {TABS.map((tab) => {
          const isActive = inv.activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => inv.setActiveTab(tab.key)}
            >
              <Ionicons name={tab.icon} size={16} color={isActive ? '#059669' : Colors.textLight} />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content with pull-to-refresh */}
      <View style={styles.content}>
        {inv.activeTab === 'stock' || inv.activeTab === 'recipes' || inv.activeTab === 'waste' ? (
          // FlatList tabs handle their own scroll
          renderTabContent()
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            refreshControl={<RefreshControl refreshing={inv.refreshing} onRefresh={inv.onRefresh} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {renderTabContent()}
          </ScrollView>
        )}
      </View>

      {/* ── Modals ─────────────────────────────────────── */}
      <AddEditItemModal
        visible={inv.showAddItemModal}
        onClose={() => { inv.setShowAddItemModal(false); }}
        editingItem={inv.editingItem}
        itemFormData={inv.itemFormData}
        setItemFormData={inv.setItemFormData}
        onSave={inv.handleAddItem}
        onUpdate={inv.handleUpdateItem}
        saving={inv.saving}
        suppliers={inv.suppliers}
      />

      <AddSupplierModal
        visible={inv.showAddSupplierModal}
        onClose={() => inv.setShowAddSupplierModal(false)}
        supplierFormData={inv.supplierFormData}
        setSupplierFormData={inv.setSupplierFormData}
        onSave={inv.handleAddSupplier}
        saving={inv.saving}
      />

      <AddEditRecipeModal
        visible={inv.showAddRecipeModal || inv.showEditRecipeModal}
        onClose={() => { inv.setShowAddRecipeModal(false); inv.setShowEditRecipeModal(false); }}
        isEdit={inv.showEditRecipeModal}
        recipeFormData={inv.recipeFormData}
        setRecipeFormData={inv.setRecipeFormData}
        inventoryItems={inv.inventoryItems}
        onSave={inv.handleAddRecipe}
        onUpdate={inv.handleUpdateRecipe}
        saving={inv.saving}
        addIngredient={inv.addRecipeIngredient}
        removeIngredient={inv.removeRecipeIngredient}
        updateIngredient={inv.updateRecipeIngredient}
        addInstruction={inv.addRecipeInstruction}
        removeInstruction={inv.removeRecipeInstruction}
        updateInstruction={inv.updateRecipeInstruction}
        onGenerateSteps={inv.handleGenerateRecipeSteps}
        generatingSteps={inv.generatingSteps}
      />

      <ViewRecipeModal
        visible={inv.showViewRecipeModal}
        onClose={() => inv.setShowViewRecipeModal(false)}
        recipe={inv.viewingRecipe}
        inventoryItems={inv.inventoryItems}
        getIngredientCost={inv.getIngredientCost}
        getCostPerServing={inv.getCostPerServing}
      />

      <QuickStockModal
        visible={inv.showQuickStockModal}
        onClose={() => { inv.setShowQuickStockModal(false); inv.setQuickStockBatchInfo({}); }}
        inventoryItems={inv.inventoryItems}
        quickStockAdjustments={inv.quickStockAdjustments}
        setQuickStockAdjustments={inv.setQuickStockAdjustments}
        batchInfo={inv.quickStockBatchInfo}
        setBatchInfo={inv.setQuickStockBatchInfo}
        onSave={inv.handleQuickStockUpdate}
        saving={inv.saving}
      />

      <AddPurchaseOrderModal
        visible={inv.showAddPOModal}
        onClose={() => inv.setShowAddPOModal(false)}
        poFormData={inv.poFormData}
        setPOFormData={inv.setPOFormData}
        suppliers={inv.suppliers}
        inventoryItems={inv.inventoryItems}
        addPOItem={inv.addPOItem}
        removePOItem={inv.removePOItem}
        updatePOItem={inv.updatePOItem}
        onSave={inv.handleAddPurchaseOrder}
        saving={inv.saving}
      />

      <LogWasteModal
        visible={inv.showLogWasteModal}
        onClose={() => inv.setShowLogWasteModal(false)}
        inventoryItems={inv.inventoryItems}
        wasteFormData={inv.wasteFormData}
        setWasteFormData={inv.setWasteFormData}
        onSave={inv.handleCreateWasteEntry}
        saving={inv.saving}
      />

      <AILeftoverModal
        visible={inv.showAILeftoverModal}
        onClose={() => { inv.setShowAILeftoverModal(false); inv.setLeftoverAnalysis?.(null); }}
        leftoverText={inv.leftoverText}
        setLeftoverText={inv.setLeftoverText}
        leftoverAnalysis={inv.leftoverAnalysis}
        analyzingLeftovers={inv.analyzingLeftovers}
        confirmingLeftovers={inv.confirmingLeftovers}
        onAnalyze={inv.handleAnalyzeLeftovers}
        onConfirm={inv.handleConfirmLeftoverWaste}
      />

      <QuickOrderModal
        visible={inv.showQuickOrderModal}
        onClose={inv.resetQuickOrder}
        quickOrderMode={inv.quickOrderMode} setQuickOrderMode={inv.setQuickOrderMode}
        quickOrderText={inv.quickOrderText} setQuickOrderText={inv.setQuickOrderText}
        quickOrderParsedItems={inv.quickOrderParsedItems} setQuickOrderParsedItems={inv.setQuickOrderParsedItems}
        quickOrderSource={inv.quickOrderSource} setQuickOrderSource={inv.setQuickOrderSource}
        quickOrderParsing={inv.quickOrderParsing} quickOrderConfirming={inv.quickOrderConfirming}
        quickOrderManualItems={inv.quickOrderManualItems}
        quickMenuSearch={inv.quickMenuSearch} setQuickMenuSearch={inv.setQuickMenuSearch}
        menuItems={inv.menuItems}
        handleParseText={inv.handleParseText} handlePickOrderImage={inv.handlePickOrderImage}
        addManualItem={inv.addManualItem} updateManualItemQty={inv.updateManualItemQty}
        handleConfirmQuickOrder={inv.handleConfirmQuickOrder} resetQuickOrder={inv.resetQuickOrder}
      />

      <SmartImportModal
        visible={showSmartImport}
        onClose={() => setShowSmartImport(false)}
        restaurantId={inv.restaurantId}
        onSuccess={() => inv.refreshData()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  loadingText: { marginTop: Spacing.sm, fontSize: 14, color: Colors.textLight },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.textDark, marginLeft: Spacing.sm },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.xs,
  },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', maxHeight: 48 },
  tabBarContent: { paddingHorizontal: Spacing.md, gap: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 20, backgroundColor: 'transparent',
  },
  tabActive: { backgroundColor: '#ecfdf5' },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textLight },
  tabLabelActive: { color: '#059669' },
  content: { flex: 1 },
});
