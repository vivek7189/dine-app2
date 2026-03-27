import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Alert } from 'react-native';
import apiClient from '../../services/api';
import * as ImagePicker from 'expo-image-picker';

const CATEGORY_OPTIONS = [
  'Vegetables', 'Fruits', 'Dairy', 'Meat', 'Seafood', 'Grains',
  'Spices', 'Oils', 'Beverages', 'Packaging', 'Cleaning', 'Other',
];

const UNIT_OPTIONS = [
  'kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'bunch', 'bottle', 'can', 'bag', 'box', 'pack',
];

const emptyItemForm = {
  name: '', category: 'Vegetables', unit: 'kg', currentStock: '', minStock: '', maxStock: '',
  costPerUnit: '', supplier: '', description: '', barcode: '', expiryDate: '', location: '',
};

const emptySupplierForm = {
  name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', notes: '',
};

const emptyPOForm = {
  supplierId: '',
  items: [{ inventoryItemId: '', inventoryItemName: '', quantity: 1, unitPrice: 0 }],
  expectedDeliveryDate: '', notes: '',
};

const emptyRecipeForm = {
  name: '', description: '', category: '', servings: 1, prepTime: 0, cookTime: 0,
  ingredients: [{ inventoryItemId: '', inventoryItemName: '', quantity: 1, unit: '' }],
  instructions: [''], notes: '',
};

export { CATEGORY_OPTIONS, UNIT_OPTIONS };

export default function useInventoryData() {
  // Core
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [procurementSubTab, setProcurementSubTab] = useState('suppliers');
  const [saving, setSaving] = useState(false);
  const hasLoadedOnce = useRef(false);

  // Data
  const [inventoryItems, setInventoryItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [menuItems, setMenuItems] = useState([]);

  // Usage
  const [usageSummary, setUsageSummary] = useState([]);
  const [usageTransactions, setUsageTransactions] = useState([]);
  const [usagePeriod, setUsagePeriod] = useState('today');
  const [usageStartDate, setUsageStartDate] = useState('');
  const [usageEndDate, setUsageEndDate] = useState('');
  const [todayUsageSummary, setTodayUsageSummary] = useState([]);

  // SCM
  const [grns, setGrns] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [supplierReturns, setSupplierReturns] = useState([]);
  const [stockTransfers, setStockTransfers] = useState([]);
  const [supplierPerformance, setSupplierPerformance] = useState([]);

  // AI
  const [aiReorderSuggestions, setAiReorderSuggestions] = useState([]);
  const [wastePredictions, setWastePredictions] = useState([]);
  const [wasteSummary, setWasteSummary] = useState(null);

  // Modals
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddPOModal, setShowAddPOModal] = useState(false);
  const [showAddRecipeModal, setShowAddRecipeModal] = useState(false);
  const [showEditRecipeModal, setShowEditRecipeModal] = useState(false);
  const [showViewRecipeModal, setShowViewRecipeModal] = useState(false);
  const [showQuickStockModal, setShowQuickStockModal] = useState(false);
  const [showQuickOrderModal, setShowQuickOrderModal] = useState(false);

  // Forms
  const [itemFormData, setItemFormData] = useState({ ...emptyItemForm });
  const [supplierFormData, setSupplierFormData] = useState({ ...emptySupplierForm });
  const [poFormData, setPOFormData] = useState({ ...emptyPOForm });
  const [recipeFormData, setRecipeFormData] = useState({ ...emptyRecipeForm });
  const [editingItem, setEditingItem] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [generatingSteps, setGeneratingSteps] = useState(false);

  // Filter/sort
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  // Quick order
  const [quickOrderMode, setQuickOrderMode] = useState('manual');
  const [quickOrderText, setQuickOrderText] = useState('');
  const [quickOrderParsedItems, setQuickOrderParsedItems] = useState([]);
  const [quickOrderSource, setQuickOrderSource] = useState('zomato');
  const [quickOrderParsing, setQuickOrderParsing] = useState(false);
  const [quickOrderConfirming, setQuickOrderConfirming] = useState(false);
  const [quickOrderManualItems, setQuickOrderManualItems] = useState([]);
  const [quickMenuSearch, setQuickMenuSearch] = useState('');

  // Quick stock
  const [quickStockAdjustments, setQuickStockAdjustments] = useState({});

  // ── Stock helpers ────────────────────────────────
  const getStockStatus = (item) => {
    const current = Number(item.currentStock) || 0;
    const min = Number(item.minStock) || 0;
    if (current <= min) return 'low';
    if (current <= min * 1.5) return 'warning';
    return 'good';
  };

  const getStockColor = (status) => {
    switch (status) {
      case 'low': return '#ef4444';
      case 'warning': return '#f59e0b';
      default: return '#10b981';
    }
  };

  const getStockPercent = (item) => {
    const current = Number(item.currentStock) || 0;
    const max = Number(item.maxStock) || Number(item.minStock) * 2 || 100;
    return Math.min(100, Math.max(0, (current / max) * 100));
  };

  // ── Filtered & sorted items ──────────────────────
  const filteredSortedItems = useMemo(() => {
    let items = [...inventoryItems];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(i =>
        i.name?.toLowerCase().includes(q) ||
        i.category?.toLowerCase().includes(q) ||
        i.supplier?.toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'all') {
      items = items.filter(i => i.category === selectedCategory);
    }
    items.sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case 'stock': va = Number(a.currentStock) || 0; vb = Number(b.currentStock) || 0; break;
        case 'category': va = a.category || ''; vb = b.category || ''; break;
        case 'cost': va = Number(a.costPerUnit) || 0; vb = Number(b.costPerUnit) || 0; break;
        default: va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase();
      }
      if (va < vb) return sortOrder === 'asc' ? -1 : 1;
      if (va > vb) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [inventoryItems, searchTerm, selectedCategory, sortBy, sortOrder]);

  // ── Data loaders ─────────────────────────────────
  const loadCoreData = async (rid) => {
    try {
      if (!hasLoadedOnce.current) setLoading(true);
      const results = await Promise.allSettled([
        apiClient.getInventoryItems(rid),
        apiClient.getInventoryCategories(rid),
        apiClient.getSuppliers(rid),
        apiClient.getInventoryDashboard(rid),
        apiClient.getRecipes(rid),
        apiClient.getPurchaseOrders(rid),
      ]);
      setInventoryItems(results[0].status === 'fulfilled' ? (results[0].value.items || []) : []);
      setCategories(results[1].status === 'fulfilled' ? (results[1].value.categories || []) : []);
      setSuppliers(results[2].status === 'fulfilled' ? (results[2].value.suppliers || []) : []);
      setDashboardStats(results[3].status === 'fulfilled' ? (results[3].value.stats || results[3].value.dashboard || null) : null);
      setRecipes(results[4].status === 'fulfilled' ? (results[4].value.recipes || []) : []);
      setPurchaseOrders(results[5].status === 'fulfilled' ? (results[5].value.orders || []) : []);

      // Load menu items for quick order
      try {
        const menuRes = await apiClient.getMenu(rid);
        setMenuItems((menuRes.items || menuRes.menuItems || []).filter(i => i.status === 'active'));
      } catch (e) { /* silently fail */ }

      hasLoadedOnce.current = true;
    } catch (error) {
      console.error('Error loading inventory data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsageData = async (periodOverride) => {
    const rid = restaurantId;
    if (!rid) return;
    try {
      const period = periodOverride || usagePeriod;
      const params = { period };
      if (period === 'custom' && usageStartDate && usageEndDate) {
        params.startDate = usageStartDate;
        params.endDate = usageEndDate;
      }
      const [txRes, summaryRes] = await Promise.allSettled([
        apiClient.getInventoryTransactions(rid, {
          ...(period === 'today' ? { date: new Date().toISOString().split('T')[0] } : {}),
          limit: 100,
        }),
        apiClient.getInventoryUsageSummary(rid, params),
      ]);
      setUsageTransactions(txRes.status === 'fulfilled' ? (txRes.value.transactions || []) : []);
      setUsageSummary(summaryRes.status === 'fulfilled' ? (summaryRes.value.summary || []) : []);
    } catch (error) {
      console.error('Error loading usage data:', error);
    }
  };

  const loadTodayUsage = async (rid) => {
    try {
      const res = await apiClient.getInventoryUsageSummary(rid, { period: 'today' });
      setTodayUsageSummary(res.summary || []);
    } catch (e) { /* silently fail */ }
  };

  const loadSCMData = async () => {
    const rid = restaurantId;
    if (!rid) return;
    try {
      if (activeTab === 'procurement') {
        if (procurementSubTab === 'grn') {
          const d = await apiClient.getGRNs(rid); setGrns(d.grns || []);
        } else if (procurementSubTab === 'requisitions') {
          const d = await apiClient.getPurchaseRequisitions(rid); setRequisitions(d.requisitions || []);
        } else if (procurementSubTab === 'invoices') {
          const d = await apiClient.getSupplierInvoices(rid); setInvoices(d.invoices || []);
        } else if (procurementSubTab === 'suppliers') {
          const d = await apiClient.getAllSuppliersPerformance(rid).catch(() => ({ performances: [] }));
          setSupplierPerformance(d.performances || []);
        } else if (procurementSubTab === 'returns') {
          const d = await apiClient.getSupplierReturns(rid); setSupplierReturns(d.returns || []);
        } else if (procurementSubTab === 'transfers') {
          const d = await apiClient.getStockTransfers(rid); setStockTransfers(d.transfers || []);
        }
      } else if (activeTab === 'insights') {
        const [sugRes, wasteRes, summRes] = await Promise.allSettled([
          apiClient.getAIReorderSuggestions(rid),
          apiClient.getAIWastePrediction(rid),
          apiClient.getAIWasteSummary(rid),
        ]);
        setAiReorderSuggestions(sugRes.status === 'fulfilled' ? (sugRes.value.suggestions || []) : []);
        setWastePredictions(wasteRes.status === 'fulfilled' ? (wasteRes.value.predictions || []) : []);
        setWasteSummary(summRes.status === 'fulfilled' ? (summRes.value.summary || null) : null);
      }
    } catch (error) {
      console.error('Error loading SCM data:', error);
    }
  };

  const refreshData = async () => {
    if (!restaurantId) return;
    switch (activeTab) {
      case 'dashboard': case 'stock':
        await loadCoreData(restaurantId);
        if (activeTab === 'stock') await loadTodayUsage(restaurantId);
        break;
      case 'recipes':
        await loadCoreData(restaurantId);
        break;
      case 'usage':
        await loadUsageData();
        break;
      case 'procurement':
        await loadSCMData();
        break;
      case 'insights':
        await loadSCMData();
        break;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  // Lazy load when tab changes
  useEffect(() => {
    if (!restaurantId) return;
    if (activeTab === 'usage') loadUsageData();
    if (activeTab === 'stock') loadTodayUsage(restaurantId);
    if (activeTab === 'procurement' || activeTab === 'insights') loadSCMData();
  }, [activeTab, restaurantId]);

  useEffect(() => {
    if (activeTab === 'procurement' && restaurantId) loadSCMData();
  }, [procurementSubTab]);

  // ── CRUD: Inventory Items ────────────────────────
  const handleAddItem = async () => {
    if (!itemFormData.name.trim()) { Alert.alert('Error', 'Item name is required.'); return; }
    setSaving(true);
    try {
      await apiClient.createInventoryItem(restaurantId, {
        name: itemFormData.name.trim(),
        category: itemFormData.category,
        unit: itemFormData.unit,
        currentStock: Number(itemFormData.currentStock) || 0,
        minStock: Number(itemFormData.minStock) || 0,
        maxStock: Number(itemFormData.maxStock) || 0,
        costPerUnit: Number(itemFormData.costPerUnit) || 0,
        supplier: itemFormData.supplier,
        description: itemFormData.description,
        barcode: itemFormData.barcode,
        expiryDate: itemFormData.expiryDate || null,
        location: itemFormData.location,
      });
      setShowAddItemModal(false);
      setItemFormData({ ...emptyItemForm });
      setEditingItem(null);
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add item.');
    } finally { setSaving(false); }
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      await apiClient.updateInventoryItem(restaurantId, editingItem.id || editingItem._id, {
        name: itemFormData.name.trim(),
        category: itemFormData.category,
        unit: itemFormData.unit,
        currentStock: Number(itemFormData.currentStock) || 0,
        minStock: Number(itemFormData.minStock) || 0,
        maxStock: Number(itemFormData.maxStock) || 0,
        costPerUnit: Number(itemFormData.costPerUnit) || 0,
        supplier: itemFormData.supplier,
        description: itemFormData.description,
        barcode: itemFormData.barcode,
        expiryDate: itemFormData.expiryDate || null,
        location: itemFormData.location,
      });
      setShowAddItemModal(false);
      setEditingItem(null);
      setItemFormData({ ...emptyItemForm });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update item.');
    } finally { setSaving(false); }
  };

  const handleDeleteItem = (item) => {
    Alert.alert('Delete Item', `Are you sure you want to delete "${item.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteInventoryItem(restaurantId, item.id || item._id);
            await loadCoreData(restaurantId);
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to delete item.');
          }
        },
      },
    ]);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name || '',
      category: item.category || 'Vegetables',
      unit: item.unit || 'kg',
      currentStock: String(item.currentStock || ''),
      minStock: String(item.minStock || ''),
      maxStock: String(item.maxStock || ''),
      costPerUnit: String(item.costPerUnit || ''),
      supplier: item.supplier || '',
      description: item.description || '',
      barcode: item.barcode || '',
      expiryDate: item.expiryDate || '',
      location: item.location || '',
    });
    setShowAddItemModal(true);
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemFormData({ ...emptyItemForm });
    setShowAddItemModal(true);
  };

  // ── CRUD: Suppliers ──────────────────────────────
  const handleAddSupplier = async () => {
    if (!supplierFormData.name.trim()) { Alert.alert('Error', 'Supplier name is required.'); return; }
    if (!supplierFormData.contact.trim()) { Alert.alert('Error', 'Contact person is required.'); return; }
    setSaving(true);
    try {
      await apiClient.createSupplier(restaurantId, supplierFormData);
      setShowAddSupplierModal(false);
      setSupplierFormData({ ...emptySupplierForm });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add supplier.');
    } finally { setSaving(false); }
  };

  const handleDeleteSupplier = (supplier) => {
    Alert.alert('Delete Supplier', `Delete "${supplier.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteSupplier(restaurantId, supplier.id || supplier._id);
            await loadCoreData(restaurantId);
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to delete supplier.');
          }
        },
      },
    ]);
  };

  // ── CRUD: Recipes ────────────────────────────────
  const handleAddRecipe = async () => {
    if (!recipeFormData.name.trim()) { Alert.alert('Error', 'Recipe name is required.'); return; }
    const validIngredients = recipeFormData.ingredients.filter(i => i.inventoryItemId);
    if (validIngredients.length === 0) { Alert.alert('Error', 'At least one ingredient is required.'); return; }
    setSaving(true);
    try {
      await apiClient.createRecipe(restaurantId, {
        ...recipeFormData,
        ingredients: validIngredients,
        instructions: recipeFormData.instructions.filter(s => s.trim()),
      });
      setShowAddRecipeModal(false);
      setRecipeFormData({ ...emptyRecipeForm });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add recipe.');
    } finally { setSaving(false); }
  };

  const handleUpdateRecipe = async () => {
    if (!editingRecipe) return;
    const validIngredients = recipeFormData.ingredients.filter(i => i.inventoryItemId);
    if (validIngredients.length === 0) { Alert.alert('Error', 'At least one ingredient is required.'); return; }
    setSaving(true);
    try {
      await apiClient.updateRecipe(restaurantId, editingRecipe.id || editingRecipe._id, {
        ...recipeFormData,
        ingredients: validIngredients,
        instructions: recipeFormData.instructions.filter(s => s.trim()),
      });
      setShowEditRecipeModal(false);
      setEditingRecipe(null);
      setRecipeFormData({ ...emptyRecipeForm });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update recipe.');
    } finally { setSaving(false); }
  };

  const handleDeleteRecipe = (recipe) => {
    Alert.alert('Delete Recipe', `Delete "${recipe.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteRecipe(restaurantId, recipe.id || recipe._id);
            await loadCoreData(restaurantId);
          } catch (error) {
            Alert.alert('Error', error.message || 'Failed to delete recipe.');
          }
        },
      },
    ]);
  };

  const openEditRecipe = (recipe) => {
    setEditingRecipe(recipe);
    setRecipeFormData({
      name: recipe.name || '',
      description: recipe.description || '',
      category: recipe.category || '',
      servings: recipe.servings || 1,
      prepTime: recipe.prepTime || 0,
      cookTime: recipe.cookTime || 0,
      ingredients: recipe.ingredients?.length > 0 ? recipe.ingredients : [{ inventoryItemId: '', inventoryItemName: '', quantity: 1, unit: '' }],
      instructions: recipe.instructions?.length > 0 ? (Array.isArray(recipe.instructions) ? recipe.instructions : [recipe.instructions]) : [''],
      notes: recipe.notes || '',
    });
    setShowEditRecipeModal(true);
  };

  const openViewRecipe = (recipe) => {
    setViewingRecipe(recipe);
    setShowViewRecipeModal(true);
  };

  const openAddRecipe = () => {
    setEditingRecipe(null);
    setRecipeFormData({ ...emptyRecipeForm });
    setShowAddRecipeModal(true);
  };

  // Recipe form helpers
  const addRecipeIngredient = () => {
    setRecipeFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { inventoryItemId: '', inventoryItemName: '', quantity: 1, unit: '' }],
    }));
  };

  const removeRecipeIngredient = (index) => {
    setRecipeFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index),
    }));
  };

  const updateRecipeIngredient = (index, field, value) => {
    setRecipeFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === index ? { ...ing, [field]: value } : ing),
    }));
  };

  const addRecipeInstruction = () => {
    setRecipeFormData(prev => ({ ...prev, instructions: [...prev.instructions, ''] }));
  };

  const removeRecipeInstruction = (index) => {
    setRecipeFormData(prev => ({ ...prev, instructions: prev.instructions.filter((_, i) => i !== index) }));
  };

  const updateRecipeInstruction = (index, value) => {
    setRecipeFormData(prev => ({
      ...prev,
      instructions: prev.instructions.map((s, i) => i === index ? value : s),
    }));
  };

  const handleGenerateRecipeSteps = async () => {
    if (!recipeFormData.name.trim()) { Alert.alert('Error', 'Recipe name is required for AI generation.'); return; }
    setGeneratingSteps(true);
    try {
      const res = await apiClient.generateRecipeSteps(restaurantId, {
        name: recipeFormData.name,
        category: recipeFormData.category,
        description: recipeFormData.description,
        ingredients: recipeFormData.ingredients.map(i => `${i.quantity}${i.unit} ${i.inventoryItemName}`).join(', '),
        servings: recipeFormData.servings,
      });
      if (res.steps?.length > 0) {
        setRecipeFormData(prev => ({ ...prev, instructions: res.steps }));
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to generate steps.');
    } finally { setGeneratingSteps(false); }
  };

  const getIngredientCost = (ingredient) => {
    const item = inventoryItems.find(i => (i.id || i._id) === ingredient.inventoryItemId);
    return item ? (Number(ingredient.quantity) || 0) * (Number(item.costPerUnit) || 0) : 0;
  };

  const getCostPerServing = (recipe) => {
    const total = (recipe.ingredients || []).reduce((sum, ing) => sum + getIngredientCost(ing), 0);
    return recipe.servings > 0 ? total / recipe.servings : total;
  };

  // ── CRUD: Purchase Orders ────────────────────────
  const handleAddPurchaseOrder = async () => {
    if (!poFormData.supplierId) { Alert.alert('Error', 'Please select a supplier.'); return; }
    const validItems = poFormData.items.filter(i => i.inventoryItemId);
    if (validItems.length === 0) { Alert.alert('Error', 'At least one item is required.'); return; }
    setSaving(true);
    try {
      await apiClient.createPurchaseOrder(restaurantId, { ...poFormData, items: validItems });
      setShowAddPOModal(false);
      setPOFormData({ ...emptyPOForm });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create purchase order.');
    } finally { setSaving(false); }
  };

  const handleUpdatePOStatus = async (orderId, newStatus) => {
    try {
      await apiClient.updatePurchaseOrder(restaurantId, orderId, { status: newStatus });
      await loadCoreData(restaurantId);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update status.');
    }
  };

  const handleEmailPO = async (order) => {
    const supplier = suppliers.find(s => (s.id || s._id) === order.supplierId);
    if (!supplier?.email) { Alert.alert('No Email', 'This supplier has no email address.'); return; }
    try {
      await apiClient.emailPurchaseOrder(restaurantId, order.id || order._id, {
        supplierEmail: supplier.email, supplierName: supplier.name,
      });
      Alert.alert('Success', 'Purchase order emailed to supplier.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to email PO.');
    }
  };

  // PO form helpers
  const addPOItem = () => {
    setPOFormData(prev => ({
      ...prev,
      items: [...prev.items, { inventoryItemId: '', inventoryItemName: '', quantity: 1, unitPrice: 0 }],
    }));
  };

  const removePOItem = (index) => {
    setPOFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updatePOItem = (index, field, value) => {
    setPOFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  // ── Quick Stock ──────────────────────────────────
  const handleQuickStockUpdate = async () => {
    const adjustments = Object.entries(quickStockAdjustments).filter(([, val]) => val !== 0);
    if (adjustments.length === 0) { Alert.alert('No Changes', 'Adjust stock levels before saving.'); return; }
    setSaving(true);
    try {
      await Promise.all(adjustments.map(([itemId, adjustment]) => {
        const item = inventoryItems.find(i => (i.id || i._id) === itemId);
        if (!item) return null;
        const newStock = Math.max(0, (Number(item.currentStock) || 0) + adjustment);
        return apiClient.updateInventoryItem(restaurantId, itemId, { currentStock: newStock });
      }));
      setShowQuickStockModal(false);
      setQuickStockAdjustments({});
      await loadCoreData(restaurantId);
      Alert.alert('Success', `${adjustments.length} item(s) updated.`);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to update stock.');
    } finally { setSaving(false); }
  };

  // ── Quick Order Logger ───────────────────────────
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
    } finally { setQuickOrderParsing(false); }
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
        } catch (e) {
          Alert.alert('Error', e.message || 'Failed to extract from image');
        } finally { setQuickOrderParsing(false); }
      }
    } catch (e) { Alert.alert('Error', 'Failed to access camera/gallery'); }
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
      resetQuickOrder();
      Alert.alert('Success', result.message || `${items.length} item(s) logged and inventory deducted`);
      await loadCoreData(restaurantId);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to confirm order');
    } finally { setQuickOrderConfirming(false); }
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

  // ── PO status helpers ────────────────────────────
  const getOrderStatusColor = (status) => {
    const map = { pending: '#f59e0b', approved: '#3b82f6', sent: '#8b5cf6', received: '#10b981', delivered: '#059669', cancelled: '#ef4444' };
    return map[status] || '#6b7280';
  };

  const getNextPOAction = (status) => {
    const map = { pending: 'approved', approved: 'sent', sent: 'received' };
    return map[status] || null;
  };

  const getNextPOActionLabel = (status) => {
    const map = { pending: 'Approve', approved: 'Mark Sent', sent: 'Mark Received' };
    return map[status] || null;
  };

  // ── Usage period change ──────────────────────────
  const handlePeriodChange = (period) => {
    setUsagePeriod(period);
    if (period !== 'custom') loadUsageData(period);
  };

  const applyCustomDateRange = () => {
    if (usageStartDate && usageEndDate) loadUsageData('custom');
  };

  // ── Computed dashboard values ────────────────────
  const totalItems = dashboardStats?.totalItems ?? inventoryItems.length;
  const lowStockCount = dashboardStats?.lowStockItems ?? inventoryItems.filter(i => getStockStatus(i) === 'low').length;
  const totalValue = dashboardStats?.totalValue ?? inventoryItems.reduce((sum, i) => sum + (Number(i.currentStock) || 0) * (Number(i.costPerUnit) || 0), 0);
  const categoryCount = dashboardStats?.totalCategories ?? [...new Set(inventoryItems.map(i => i.category).filter(Boolean))].length;
  const lowStockItems = inventoryItems.filter(i => getStockStatus(i) === 'low');

  return {
    // Core
    loading, refreshing, restaurantId, setRestaurantId, activeTab, setActiveTab,
    procurementSubTab, setProcurementSubTab, saving,
    // Data
    inventoryItems, categories, suppliers, recipes, purchaseOrders, dashboardStats, menuItems,
    // Usage
    usageSummary, usageTransactions, usagePeriod, usageStartDate, setUsageStartDate,
    usageEndDate, setUsageEndDate, todayUsageSummary,
    // SCM
    grns, requisitions, invoices, supplierReturns, stockTransfers, supplierPerformance,
    // AI
    aiReorderSuggestions, wastePredictions, wasteSummary,
    // Modals
    showAddItemModal, setShowAddItemModal, showAddSupplierModal, setShowAddSupplierModal,
    showAddPOModal, setShowAddPOModal, showAddRecipeModal, setShowAddRecipeModal,
    showEditRecipeModal, setShowEditRecipeModal, showViewRecipeModal, setShowViewRecipeModal,
    showQuickStockModal, setShowQuickStockModal, showQuickOrderModal, setShowQuickOrderModal,
    // Forms
    itemFormData, setItemFormData, supplierFormData, setSupplierFormData,
    poFormData, setPOFormData, recipeFormData, setRecipeFormData,
    editingItem, editingRecipe, viewingRecipe, generatingSteps,
    // Filter/sort
    searchTerm, setSearchTerm, selectedCategory, setSelectedCategory,
    sortBy, setSortBy, sortOrder, setSortOrder, filteredSortedItems,
    // Quick order
    quickOrderMode, setQuickOrderMode, quickOrderText, setQuickOrderText,
    quickOrderParsedItems, setQuickOrderParsedItems, quickOrderSource, setQuickOrderSource,
    quickOrderParsing, quickOrderConfirming, quickOrderManualItems,
    quickMenuSearch, setQuickMenuSearch,
    // Quick stock
    quickStockAdjustments, setQuickStockAdjustments,
    // Handlers
    loadCoreData, loadUsageData, refreshData, onRefresh,
    handleAddItem, handleUpdateItem, handleDeleteItem, handleEditItem, openAddItem,
    handleAddSupplier, handleDeleteSupplier,
    handleAddRecipe, handleUpdateRecipe, handleDeleteRecipe, openEditRecipe, openViewRecipe, openAddRecipe,
    addRecipeIngredient, removeRecipeIngredient, updateRecipeIngredient,
    addRecipeInstruction, removeRecipeInstruction, updateRecipeInstruction,
    handleGenerateRecipeSteps, getIngredientCost, getCostPerServing,
    handleAddPurchaseOrder, handleUpdatePOStatus, handleEmailPO,
    addPOItem, removePOItem, updatePOItem,
    handleQuickStockUpdate,
    handleParseText, handlePickOrderImage, addManualItem, updateManualItemQty,
    handleConfirmQuickOrder, resetQuickOrder,
    handlePeriodChange, applyCustomDateRange,
    // Helpers
    getStockStatus, getStockColor, getStockPercent, getOrderStatusColor, getNextPOAction, getNextPOActionLabel,
    // Computed
    totalItems, lowStockCount, totalValue, categoryCount, lowStockItems,
    // Constants
    CATEGORY_OPTIONS, UNIT_OPTIONS,
  };
}
