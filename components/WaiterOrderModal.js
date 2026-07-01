import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator, Alert, Vibration, Animated,
  KeyboardAvoidingView, Platform, Keyboard, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import * as printerService from '../services/printerService';
import { getPrintStationConfig, printKOTsByStation, getLocalKotPrintingEnabled } from '../services/multiPrinterService';
import { formatCurrency } from '../utils/formatCurrency';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';
import { useToast } from './Toast';
import ItemCustomizationModal from './ItemCustomizationModal';
import KOTModal from './KOTModal';

// ─── Theme ───
const PRIMARY = '#c0392b';       // Deep rich red (header)
const PRIMARY_DARK = '#a93226';  // Darker red
const PRIMARY_LIGHT = '#fadbd8'; // Light red tint
const GREEN = '#10b981';
const GREEN_DARK = '#059669';
const GREEN_BG = '#ecfdf5';
const BG = '#f5f5f7';           // Subtle warm gray background
const CARD = '#ffffff';
const TEXT = '#1a1a2e';          // Near-black
const TEXT_SEC = '#6b7280';      // Secondary text
const TEXT_LIGHT = '#9ca3af';    // Tertiary text
const BORDER = '#ebebef';        // Subtle border

/**
 * Filter out items excluded from KOT printing by category or item ID.
 */
function filterKotExcludedItems(items, printSettings) {
  if (!printSettings?.kotExclusionEnabled) return items;
  const excludedCats = new Set(printSettings.kotExcludedCategories || []);
  const excludedIds = new Set(printSettings.kotExcludedItemIds || []);
  if (excludedCats.size === 0 && excludedIds.size === 0) return items;
  return items.filter(item => {
    if (excludedIds.has(item.id || item.menuItemId)) return false;
    if (excludedCats.has(item.categoryId)) return false;
    return true;
  });
}

export default function WaiterOrderModal({
  visible,
  onClose,
  tableId,
  tableNumber,
  floorName,
  floorId,
  existingOrderId,
  onOrderSent,
}) {
  const { fs, r, isTablet } = useResponsive();
  const { toast, ToastView } = useToast();

  // Data state
  const [loading, setLoading] = useState(true);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');

  // Cart state
  const [cart, setCart] = useState([]);
  const [existingOrderItems, setExistingOrderItems] = useState(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [sendingOrder, setSendingOrder] = useState(false);

  // Customer state
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerData, setCustomerData] = useState(null);
  const [customerLookupStatus, setCustomerLookupStatus] = useState('idle'); // idle | loading | found | not_found
  const customerLookupRef = useRef(null);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [customizationItem, setCustomizationItem] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);

  // KOT modal state
  const [showKOTModal, setShowKOTModal] = useState(false);
  const [kotOrderData, setKotOrderData] = useState(null);

  // Vibration setting
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // Print config refs
  const printSettingsRef = useRef(null);
  const printStationCountRef = useRef(0);
  const localKotPrintingRef = useRef(false);

  // Animation for cart bar
  const cartSlide = useRef(new Animated.Value(0)).current;

  // ─── Data Loading ───
  useEffect(() => {
    if (!visible) {
      setCart([]);
      setExistingOrderItems(null);
      setSpecialInstructions('');
      setSelectedCategory('all');
      setSearchTerm('');
      setShowReview(false);
      setCustomizationItem(null);
      setEditingNoteId(null);
      setShowKOTModal(false);
      setKotOrderData(null);
      setCustomerPhone('');
      setCustomerName('');
      setCustomerData(null);
      setCustomerLookupStatus('idle');
      setLoading(true);
      return;
    }

    let cancelled = false;

    AsyncStorage.getItem('@vibration_enabled').then(val => {
      if (val !== null) setVibrationEnabled(val === 'true');
    });

    const load = async () => {
      try {
        const userData = await apiClient.getUser();
        if (cancelled) return;
        if (!userData) return;
        setUser(userData);

        let rid = userData.restaurantId;
        let rName = userData.restaurant?.name || '';
        if (!rid && (userData.role === 'owner' || userData.role === 'admin')) {
          const res = await apiClient.getRestaurants();
          if (res?.restaurants?.length > 0) {
            rid = res.restaurants[0].id;
            rName = res.restaurants[0].name || rName;
          }
        }
        if (!rid || cancelled) return;
        setRestaurantId(rid);
        setRestaurantName(rName);

        const [menuRes] = await Promise.all([
          apiClient.getMenu(rid),
          apiClient.getPrintSettings(rid).then(res => {
            printSettingsRef.current = res?.printSettings || res || {};
          }).catch(() => {}),
          apiClient.getPrintStations(rid).then(sRes => {
            if (sRes?.success) {
              printStationCountRef.current = (sRes.printStations || []).filter(s => s.enabled).length;
            }
          }).catch(() => {}),
          getLocalKotPrintingEnabled().then(v => { localKotPrintingRef.current = v; }).catch(() => {}),
          printerService.autoReconnect().catch(() => {}),
        ]);

        if (cancelled) return;

        const items = menuRes?.menuItems || [];
        setMenuItems(items);

        const catSet = new Map();
        items.forEach(item => {
          if (item.category && !catSet.has(item.category)) {
            catSet.set(item.category, { name: item.category, id: item.categoryId || item.category });
          }
        });
        setCategories([...catSet.values()]);

        if (existingOrderId) {
          try {
            const orderRes = await apiClient.getOrders(rid, { orderId: existingOrderId });
            const order = orderRes?.orders?.[0] || orderRes?.order;
            if (order?.items && !cancelled) {
              const cartItems = order.items.map((item, idx) => ({
                ...item,
                cartId: `existing-${item.menuItemId || item.id || idx}-${Date.now()}`,
                menuItemId: item.menuItemId || item.id,
              }));
              setCart(cartItems);
              setExistingOrderItems(cartItems.map(i => ({
                menuItemId: i.menuItemId || i.id,
                name: i.name,
                quantity: i.quantity,
              })));
              if (order.specialInstructions) setSpecialInstructions(order.specialInstructions);
              // Pre-fill customer info from existing order
              if (order.customerPhone) setCustomerPhone(order.customerPhone);
              if (order.customerInfo?.name) setCustomerName(order.customerInfo.name);
              if (order.customerInfo?.phone && !order.customerPhone) setCustomerPhone(order.customerInfo.phone);
            }
          } catch (e) {
            console.error('Failed to load existing order:', e);
          }
        }
      } catch (error) {
        console.error('WaiterOrderModal: load error:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [visible, existingOrderId]);

  useEffect(() => {
    Animated.spring(cartSlide, {
      toValue: cart.length > 0 ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [cart.length]);

  // ─── Customer Phone Lookup ───
  const handlePhoneChange = useCallback((text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 13);
    setCustomerPhone(cleaned);
    setCustomerData(null);
    setCustomerLookupStatus('idle');

    if (customerLookupRef.current) clearTimeout(customerLookupRef.current);

    if (cleaned.length >= 8 && restaurantId) {
      customerLookupRef.current = setTimeout(async () => {
        setCustomerLookupStatus('loading');
        try {
          const res = await apiClient.lookupCustomerByPhone(restaurantId, cleaned, 'IN');
          if (res?.customer) {
            setCustomerData(res.customer);
            setCustomerName(res.customer.name || '');
            setCustomerLookupStatus('found');
          } else {
            setCustomerLookupStatus('not_found');
          }
        } catch {
          setCustomerLookupStatus('not_found');
        }
      }, 500);
    }
  }, [restaurantId]);

  // ─── Menu Filtering ───
  const filteredItems = useMemo(() => {
    let result = menuItems;
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.category === selectedCategory);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(item => item.name?.toLowerCase().includes(q));
    }
    return result;
  }, [menuItems, selectedCategory, searchTerm]);

  // ─── Cart Actions ───
  const addToCart = useCallback((item) => {
    const hasOptions = (item.variants?.length > 0) || (item.customizations?.length > 0);
    if (hasOptions) {
      setCustomizationItem(item);
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.menuItemId === item.id && !c.selectedVariant && (!c.selectedCustomizations || c.selectedCustomizations.length === 0));
      if (existing) {
        return prev.map(c => c === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, {
        ...item,
        cartId: `${item.id}-${Date.now()}`,
        menuItemId: item.id,
        quantity: 1,
        notes: '',
        selectedVariant: null,
        selectedCustomizations: [],
      }];
    });
    if (vibrationEnabled) Vibration.vibrate(30);
  }, [vibrationEnabled]);

  const handleCustomizationAdd = useCallback((cartItem) => {
    setCart(prev => [...prev, {
      ...cartItem,
      menuItemId: cartItem.menuItemId || cartItem.id,
    }]);
    setCustomizationItem(null);
    if (vibrationEnabled) Vibration.vibrate(30);
  }, [vibrationEnabled]);

  const updateQuantity = useCallback((cartId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.cartId !== cartId) return item;
      const newQty = item.quantity + delta;
      if (newQty <= 0) return null;
      return { ...item, quantity: newQty };
    }).filter(Boolean));
  }, []);

  const removeFromCart = useCallback((cartId) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  }, []);

  const updateItemNote = useCallback((cartId, note) => {
    setCart(prev => prev.map(item =>
      item.cartId === cartId ? { ...item, notes: note } : item
    ));
  }, []);

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => {
      const base = item.selectedVariant?.price ?? item.price ?? 0;
      const extras = (item.selectedCustomizations || []).reduce((s, c) => s + (c?.price || 0), 0);
      return total + (base + extras) * (item.quantity || 1);
    }, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => cart.reduce((sum, i) => sum + (i.quantity || 1), 0), [cart]);

  const cartSummaryText = useMemo(() => {
    if (cart.length === 0) return '';
    const names = cart.slice(0, 3).map(i => `${i.quantity}x ${i.name}`);
    if (cart.length > 3) names.push(`+${cart.length - 3} more`);
    return names.join(', ');
  }, [cart]);

  // ─── Change Detection (for edit order) ───
  const orderChanges = useMemo(() => {
    if (!existingOrderId || !existingOrderItems) return null;
    const existingMap = new Map(existingOrderItems.map(i => [i.menuItemId || i.id, i]));
    const cartMap = new Map(cart.map(i => [i.menuItemId || i.id, i]));

    const newItems = cart.filter(item => !existingMap.has(item.menuItemId || item.id));
    const qtyIncreased = cart.filter(item => {
      const ex = existingMap.get(item.menuItemId || item.id);
      return ex && item.quantity > ex.quantity;
    }).map(item => {
      const ex = existingMap.get(item.menuItemId || item.id);
      return { ...item, prevQty: ex.quantity, delta: item.quantity - ex.quantity };
    });
    const qtyDecreased = cart.filter(item => {
      const ex = existingMap.get(item.menuItemId || item.id);
      return ex && item.quantity < ex.quantity;
    }).map(item => {
      const ex = existingMap.get(item.menuItemId || item.id);
      return { ...item, prevQty: ex.quantity, delta: ex.quantity - item.quantity };
    });
    const removedFromOrder = existingOrderItems.filter(ex => !cartMap.has(ex.menuItemId || ex.id));
    const unchanged = cart.filter(item => {
      const ex = existingMap.get(item.menuItemId || item.id);
      return ex && item.quantity === ex.quantity;
    });

    const hasAnyChange = newItems.length > 0 || qtyIncreased.length > 0 || qtyDecreased.length > 0 || removedFromOrder.length > 0;
    return { newItems, qtyIncreased, qtyDecreased, removedFromOrder, unchanged, hasAnyChange };
  }, [cart, existingOrderId, existingOrderItems]);

  // ─── Build Item Payload (same as MenuNative) ───
  const buildItemPayload = (item) => {
    const base = item.selectedVariant?.price ?? item.price ?? 0;
    const extras = (item.selectedCustomizations || []).reduce((s, c) => s + (c?.price || 0), 0);
    const effectivePrice = base + extras;
    return {
      menuItemId: item.menuItemId || item.id,
      name: item.name,
      price: effectivePrice,
      quantity: item.quantity,
      total: effectivePrice * (item.quantity || 1),
      notes: item.notes || '',
      category: item.category || '',
      categoryId: item.categoryId || null,
      taxGroupId: item.taxGroupId || null,
      selectedVariant: item.selectedVariant || null,
      selectedCustomizations: Array.isArray(item.selectedCustomizations) ? item.selectedCustomizations : [],
      basePrice: typeof item.originalPrice === 'number' ? item.originalPrice : item.price,
      ...(item.isStockManaged ? { isStockManaged: true, stockQuantity: item.stockQuantity } : {}),
    };
  };

  // ─── Send to Kitchen ───
  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      Alert.alert('Empty Cart', 'Add items before sending to kitchen.');
      return;
    }

    setSendingOrder(true);
    Keyboard.dismiss();

    try {
      let response;
      let orderId;

      // Build customer info object
      const customerInfo = {};
      if (customerPhone) customerInfo.phone = customerPhone;
      if (customerName) customerInfo.name = customerName;
      const hasCustomer = customerPhone || customerName;

      if (existingOrderId) {
        const orderData = {
          items: cart.map(buildItemPayload),
          status: 'confirmed',
          ...(specialInstructions && { specialInstructions }),
          ...(hasCustomer && { customerInfo }),
          ...(customerPhone && { customerPhone }),
          ...(customerData?.id && { customerId: customerData.id }),
        };
        response = await apiClient.updateOrder(existingOrderId, orderData);
        orderId = existingOrderId;
      } else {
        const orderData = {
          restaurantId,
          tableNumber: tableNumber || '',
          tableId: tableId || null,
          floorId: floorId || null,
          floorName: floorName || null,
          items: cart.map(buildItemPayload),
          orderType: 'dine-in',
          paymentMethod: 'cash',
          status: 'confirmed',
          staffInfo: {
            waiterId: user?.id,
            waiterName: user?.name || 'Waiter',
          },
          ...(specialInstructions && { specialInstructions }),
          ...(hasCustomer && { customerInfo }),
          ...(customerPhone && { customerPhone }),
          ...(customerData?.id && { customerId: customerData.id }),
        };
        response = await apiClient.createOrder(orderData);
        orderId = response.order?.id;
      }

      // ─── Incremental KOT detection ───
      let kotItems = cart;
      let isIncremental = false;
      let removedItems = [];

      if (existingOrderId && existingOrderItems) {
        const existingMap = new Map(existingOrderItems.map(i => [i.menuItemId || i.id, i]));
        const cartMap = new Map(cart.map(i => [i.menuItemId || i.id, i]));

        const newItems = cart.filter(item => !existingMap.has(item.menuItemId || item.id)).map(item => ({ ...item, isNew: true }));
        const updatedItems = cart.filter(item => {
          const existing = existingMap.get(item.menuItemId || item.id);
          return existing && existing.quantity !== item.quantity;
        }).map(item => {
          const existing = existingMap.get(item.menuItemId || item.id);
          return { ...item, isUpdated: true, previousQuantity: existing.quantity, quantityDelta: item.quantity - existing.quantity };
        });
        removedItems = existingOrderItems
          .filter(existing => !cartMap.has(existing.menuItemId || existing.id))
          .map(item => ({ ...item, isRemoved: true, previousQuantity: item.quantity }));

        const incrementalItems = [...newItems, ...updatedItems];
        if (incrementalItems.length > 0 || removedItems.length > 0) {
          kotItems = incrementalItems;
          isIncremental = true;
        }
      }

      // ─── KOT Data ───
      const ps = printSettingsRef.current || {};
      const orderNumber = response.order?.dailyOrderId || response.order?.orderNumber || orderId?.slice(-6);
      const kotData = {
        orderNumber,
        orderId,
        restaurantId,
        tableNumber: tableNumber || '',
        floorName: floorName || '',
        roomNumber: response.order?.roomNumber || null,
        isIncremental,
        items: filterKotExcludedItems(kotItems, ps).map(item => ({
          name: item.name,
          quantity: item.isUpdated && item.quantityDelta > 0 ? item.quantityDelta : item.quantity,
          notes: item.notes || '',
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          isNew: item.isNew || false,
          isUpdated: item.isUpdated || false,
          quantityDelta: item.quantityDelta || 0,
          previousQuantity: item.previousQuantity || 0,
        })),
        removedItems: removedItems.map(item => ({
          name: item.name,
          quantity: item.previousQuantity || item.quantity,
          notes: item.notes || '',
          selectedVariant: item.selectedVariant || null,
          selectedCustomizations: item.selectedCustomizations || [],
          isRemoved: true,
        })),
        waiterName: user?.name || 'Waiter',
        waiterId: user?.id,
        timestamp: new Date(),
        restaurantName,
        orderType: tableNumber ? 'Dine-in' : 'Counter',
        specialInstructions: specialInstructions || '',
        dailyOrderId: orderNumber,
        printSettings: ps,
      };

      // ─── Auto-print KOT ───
      if (ps?.autoPrintOnKOT !== false) {
        const stationCount = printStationCountRef.current;
        const localKot = localKotPrintingRef.current;

        if (stationCount >= 2 && localKot) {
          getPrintStationConfig(restaurantId).then(({ stations, mode, categories: cats }) => {
            printKOTsByStation(kotData, stations, cats, mode, ps)
              .then(r => { if (r.printed === 0 && r.total > 0) toast.error('KOT print failed for all stations'); })
              .catch(() => {});
          }).catch(() => {});
        } else if (stationCount < 2) {
          const kotText = printerService.generateKOTText(kotData);
          const kotHtml = printerService.wrapKOTTextInHTML(kotText);
          printerService.printWithFeedback({ html: kotHtml, text: kotText, silentOnly: true, label: 'KOT' })
            .then(r => { if (!r.success && r.notify !== false) toast.error(r.error); })
            .catch(() => {});
        }
      }

      setShowReview(false);
      setKotOrderData(kotData);
      setShowKOTModal(true);
      if (vibrationEnabled) Vibration.vibrate(200);
    } catch (error) {
      console.error('Send to kitchen error:', error);
      Alert.alert('Error', error.message || 'Failed to send order. Please try again.');
    } finally {
      setSendingOrder(false);
    }
  };

  const handleKOTClose = () => {
    setShowKOTModal(false);
    setKotOrderData(null);
    onOrderSent?.();
  };

  const handleBack = () => {
    if (showReview) {
      setShowReview(false);
      setEditingNoteId(null);
      return;
    }
    if (cart.length > 0) {
      Alert.alert(
        'Discard Order?',
        `You have ${cartItemCount} item${cartItemCount > 1 ? 's' : ''} in your cart. Going back will discard them.`,
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  // ─── Item Card ───
  const renderMenuItem = useCallback(({ item }) => {
    const isOutOfStock = item.isStockManaged && (item.stockQuantity === 0 || item.stockQuantity === null);
    const cartQty = cart.filter(c => (c.menuItemId || c.id) === item.id).reduce((s, c) => s + c.quantity, 0);
    const isVeg = item.isVeg;

    return (
      <View style={[st.menuCard, isOutOfStock && { opacity: 0.4 }, cartQty > 0 && st.menuCardActive]}>
        <View style={st.menuCardTop}>
          <View style={[st.vegBadge, { borderColor: isVeg ? '#22c55e' : '#ef4444' }]}>
            <View style={[st.vegDot, { backgroundColor: isVeg ? '#22c55e' : '#ef4444' }]} />
          </View>
          {cartQty > 0 && (
            <View style={st.menuCardQtyBadge}>
              <Text style={st.menuCardQtyBadgeText}>{cartQty}</Text>
            </View>
          )}
        </View>

        <Text style={st.menuItemName} numberOfLines={2}>{item.name}</Text>

        {item.isStockManaged && !isOutOfStock && (
          <Text style={st.stockText}>{item.stockQuantity} left</Text>
        )}
        {isOutOfStock && <Text style={[st.stockText, { color: '#ef4444' }]}>Out of stock</Text>}

        <View style={st.menuItemBottom}>
          <Text style={st.menuItemPrice}>{formatCurrency(item.price)}</Text>
          {isOutOfStock ? (
            <View style={st.addBtnDisabled}>
              <Ionicons name="close" size={16} color="#d1d5db" />
            </View>
          ) : cartQty > 0 ? (
            <View style={st.qtyControl}>
              <TouchableOpacity
                style={st.qtyBtn}
                onPress={() => {
                  const cartItem = cart.find(c => (c.menuItemId || c.id) === item.id);
                  if (cartItem) updateQuantity(cartItem.cartId, -1);
                }}
              >
                <Ionicons name="remove" size={15} color="#fff" />
              </TouchableOpacity>
              <Text style={st.qtyText}>{cartQty}</Text>
              <TouchableOpacity style={st.qtyBtn} onPress={() => addToCart(item)}>
                <Ionicons name="add" size={15} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={st.addBtn} onPress={() => addToCart(item)} activeOpacity={0.7}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }, [cart, addToCart, updateQuantity]);

  if (!visible) return null;

  // ─── Review Item Card ───
  const renderReviewItemCard = (item, idx, changeTag) => {
    const base = item.selectedVariant?.price ?? item.price ?? 0;
    const extras = (item.selectedCustomizations || []).reduce((s, c) => s + (c?.price || 0), 0);
    const itemTotal = (base + extras) * (item.quantity || 1);
    const subline = getItemSubline(item);
    const isEditingNote = editingNoteId === item.cartId;

    return (
      <View key={item.cartId || idx} style={[st.reviewItem, changeTag?.borderColor && { borderLeftWidth: 3, borderLeftColor: changeTag.borderColor }]}>
        {/* Main row: veg badge + name/price + qty + trash */}
        <View style={st.reviewItemRow}>
          <View style={st.reviewItemLeft}>
            <View style={[st.vegBadgeSmall, { borderColor: item.isVeg !== false ? '#22c55e' : '#ef4444' }]}>
              <View style={[st.vegDotSmall, { backgroundColor: item.isVeg !== false ? '#22c55e' : '#ef4444' }]} />
            </View>
            <View style={st.reviewItemInfo}>
              <View style={st.reviewItemNameRow}>
                <Text style={st.reviewItemName} numberOfLines={1}>{item.name}</Text>
                {changeTag && (
                  <View style={[st.changeTag, { backgroundColor: changeTag.bg }]}>
                    <Ionicons name={changeTag.icon} size={10} color={changeTag.color} />
                    <Text style={[st.changeTagText, { color: changeTag.color }]}>{changeTag.label}</Text>
                  </View>
                )}
              </View>
              {subline ? <Text style={st.reviewItemSub}>{subline}</Text> : null}
              <Text style={st.reviewItemPriceInline}>{formatCurrency(itemTotal)}</Text>
            </View>
          </View>
          <View style={st.reviewItemRight}>
            <View style={st.reviewQtyRow}>
              <TouchableOpacity style={st.reviewQtyBtn} onPress={() => updateQuantity(item.cartId, -1)}>
                <Ionicons name="remove" size={14} color={GREEN_DARK} />
              </TouchableOpacity>
              <Text style={st.reviewQtyText}>{item.quantity}</Text>
              <TouchableOpacity style={st.reviewQtyBtn} onPress={() => updateQuantity(item.cartId, 1)}>
                <Ionicons name="add" size={14} color={GREEN_DARK} />
              </TouchableOpacity>
            </View>
            {!item.notes && !isEditingNote && (
              <TouchableOpacity
                onPress={() => setEditingNoteId(item.cartId)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chatbubble-outline" size={13} color={TEXT_LIGHT} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => removeFromCart(item.cartId)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color="#d1d5db" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Per-item kitchen instruction — compact */}
        {isEditingNote ? (
          <View style={st.noteInputRow}>
            <Ionicons name="restaurant-outline" size={12} color="#f59e0b" />
            <TextInput
              style={st.noteInput}
              placeholder="e.g. No onion, extra spicy..."
              placeholderTextColor="#9ca3af"
              value={item.notes || ''}
              onChangeText={(text) => updateItemNote(item.cartId, text)}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => setEditingNoteId(null)}
              onBlur={() => setEditingNoteId(null)}
            />
          </View>
        ) : item.notes ? (
          <TouchableOpacity
            style={st.noteDisplay}
            onPress={() => setEditingNoteId(item.cartId)}
            activeOpacity={0.7}
          >
            <Ionicons name="restaurant-outline" size={11} color="#f59e0b" />
            <Text style={st.noteDisplayText} numberOfLines={1}>{item.notes}</Text>
            <Ionicons name="pencil" size={10} color="#d1d5db" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  // ─── Get change tag for an item ───
  const getChangeTag = (item) => {
    if (!orderChanges) return null;
    const id = item.menuItemId || item.id;
    if (orderChanges.newItems.find(i => (i.menuItemId || i.id) === id)) {
      return { label: 'NEW', icon: 'add-circle', color: '#16a34a', bg: '#f0fdf4', borderColor: '#16a34a' };
    }
    const inc = orderChanges.qtyIncreased.find(i => (i.menuItemId || i.id) === id);
    if (inc) {
      return { label: `QTY ${inc.prevQty} → ${item.quantity}`, icon: 'arrow-up-circle', color: '#2563eb', bg: '#eff6ff', borderColor: '#2563eb' };
    }
    const dec = orderChanges.qtyDecreased.find(i => (i.menuItemId || i.id) === id);
    if (dec) {
      return { label: `QTY ${dec.prevQty} → ${item.quantity}`, icon: 'arrow-down-circle', color: '#d97706', bg: '#fffbeb', borderColor: '#d97706' };
    }
    return null;
  };

  // ─────────────────────────────────────────────
  // REVIEW VIEW — full-screen order review
  // ─────────────────────────────────────────────
  const renderReviewView = () => {
    const isEditing = !!existingOrderId;
    const hasChanges = orderChanges?.hasAnyChange;
    const noChanges = isEditing && !hasChanges;
    const btnDisabled = sendingOrder || noChanges;

    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Review Header */}
        <View style={st.reviewHeader}>
          <TouchableOpacity onPress={() => { setShowReview(false); setEditingNoteId(null); }} style={st.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={st.headerInfo}>
            <Text style={st.headerTitle}>{isEditing ? 'Update Order' : 'Review Order'}</Text>
            <Text style={st.headerSub}>{cartItemCount} items · {formatCurrency(cartTotal)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowReview(false)}
            style={st.addMoreBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={18} color={PRIMARY} />
            <Text style={st.addMoreText}>Add Items</Text>
          </TouchableOpacity>
        </View>

        {/* Table Context Bar */}
        {(tableNumber || existingOrderId) && (
          <View style={st.reviewContextBar}>
            {tableNumber && (
              <View style={st.reviewContextChip}>
                <Ionicons name="grid-outline" size={11} color={PRIMARY_DARK} />
                <Text style={st.reviewContextText}>Table {tableNumber}</Text>
              </View>
            )}
            {floorName && (
              <View style={st.reviewContextChip}>
                <Ionicons name="business-outline" size={11} color={PRIMARY_DARK} />
                <Text style={st.reviewContextText}>{floorName}</Text>
              </View>
            )}
            {isEditing && (
              <View style={[st.reviewContextChip, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="sync" size={11} color="#92400e" />
                <Text style={[st.reviewContextText, { color: '#92400e' }]}>Editing</Text>
              </View>
            )}
          </View>
        )}

        {/* Change summary banner for edit mode */}
        {isEditing && hasChanges && (
          <View style={st.changeSummaryBanner}>
            <Ionicons name="information-circle" size={14} color="#2563eb" />
            <Text style={st.changeSummaryText}>
              {[
                orderChanges.newItems.length > 0 && `${orderChanges.newItems.length} new`,
                orderChanges.qtyIncreased.length > 0 && `${orderChanges.qtyIncreased.length} increased`,
                orderChanges.qtyDecreased.length > 0 && `${orderChanges.qtyDecreased.length} decreased`,
                orderChanges.removedFromOrder.length > 0 && `${orderChanges.removedFromOrder.length} removed`,
              ].filter(Boolean).join(', ')} — changes will be sent to kitchen
            </Text>
          </View>
        )}

        {/* No changes warning */}
        {noChanges && (
          <View style={st.noChangeBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={st.noChangeText}>No changes made to this order</Text>
          </View>
        )}

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Cart Items List */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={st.reviewList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Removed items (edit mode only) */}
            {isEditing && orderChanges?.removedFromOrder?.length > 0 && (
              <View style={st.removedSection}>
                <View style={st.removedSectionHeader}>
                  <Ionicons name="close-circle" size={14} color="#dc2626" />
                  <Text style={st.removedSectionTitle}>Removed Items</Text>
                </View>
                {orderChanges.removedFromOrder.map((item, idx) => (
                  <View key={`removed-${idx}`} style={st.removedItemRow}>
                    <Text style={st.removedItemQty}>{item.quantity}x</Text>
                    <Text style={st.removedItemName}>{item.name}</Text>
                    <View style={st.removedTag}>
                      <Text style={st.removedTagText}>REMOVED</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Cart items */}
            {cart.map((item, idx) => renderReviewItemCard(item, idx, getChangeTag(item)))}

            {/* Order-level special instructions */}
            <View style={st.orderNotesSection}>
              <View style={st.orderNotesHeader}>
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={TEXT_SEC} />
                <Text style={st.orderNotesLabel}>Special Instructions</Text>
              </View>
              <TextInput
                style={st.orderNotesInput}
                placeholder="Instructions for the entire order... (e.g. Rush order, VIP table)"
                placeholderTextColor={TEXT_LIGHT}
                value={specialInstructions}
                onChangeText={setSpecialInstructions}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Customer Info */}
            <View style={st.customerSection}>
              <View style={st.customerRow}>
                <View style={st.customerInputWrap}>
                  <Ionicons name="call-outline" size={14} color={TEXT_LIGHT} />
                  <TextInput
                    style={st.customerInput}
                    placeholder="Phone number"
                    placeholderTextColor={TEXT_LIGHT}
                    value={customerPhone}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    maxLength={13}
                  />
                  {customerLookupStatus === 'loading' && (
                    <ActivityIndicator size="small" color={PRIMARY} />
                  )}
                  {customerLookupStatus === 'found' && (
                    <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                  )}
                </View>
                <View style={st.customerInputWrap}>
                  <Ionicons name="person-outline" size={14} color={TEXT_LIGHT} />
                  <TextInput
                    style={st.customerInput}
                    placeholder="Name"
                    placeholderTextColor={TEXT_LIGHT}
                    value={customerName}
                    onChangeText={setCustomerName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
              {customerLookupStatus === 'found' && customerData && (
                <View style={st.customerFoundRow}>
                  <Ionicons name="person-circle" size={13} color={GREEN} />
                  <Text style={st.customerFoundText}>
                    {customerData.name}{customerData.loyaltyPoints ? ` · ${customerData.loyaltyPoints} pts` : ''}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ height: 110 }} />
          </ScrollView>

          {/* Bottom Send Bar */}
          <View style={st.reviewFooter}>
            <View style={st.reviewFooterTop}>
              <View>
                <Text style={st.reviewFooterLabel}>{cartItemCount} items</Text>
                <Text style={st.reviewFooterTotal}>{formatCurrency(cartTotal)}</Text>
              </View>
              {isEditing && hasChanges && (
                <View style={st.changeCountBadge}>
                  <Text style={st.changeCountBadgeText}>
                    {(orderChanges.newItems.length + orderChanges.qtyIncreased.length + orderChanges.qtyDecreased.length + orderChanges.removedFromOrder.length)} changes
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[st.sendBtnLarge, btnDisabled && { opacity: 0.5 }]}
              onPress={handleSendToKitchen}
              disabled={btnDisabled}
              activeOpacity={0.8}
            >
              {sendingOrder ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={isEditing ? 'sync' : 'restaurant'} size={20} color="#fff" />
                  <Text style={st.sendBtnLargeText}>
                    {isEditing ? 'Update Order' : 'Send to Kitchen'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    );
  };

  // ─────────────────────────────────────────────
  // MENU VIEW — browse & add items
  // ─────────────────────────────────────────────
  const renderMenuView = () => {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        {/* Menu Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={handleBack} style={st.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={st.headerInfo}>
            <Text style={st.headerTitle} numberOfLines={1}>
              {tableNumber ? `Table ${tableNumber}` : existingOrderId ? 'Edit Order' : 'New Order'}
            </Text>
            {floorName ? <Text style={st.headerSub}>{floorName}</Text> : null}
          </View>
          {existingOrderId && (
            <View style={st.editBadge}>
              <Text style={st.editBadgeText}>EDITING</Text>
            </View>
          )}
          <TouchableOpacity onPress={handleBack} style={st.closeHeaderBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={st.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY} />
            <Text style={st.loadingText}>Loading menu...</Text>
          </View>
        ) : (
          <>
            {/* Search */}
            <View style={st.searchRow}>
              <Ionicons name="search" size={18} color={TEXT_LIGHT} />
              <TextInput
                style={st.searchInput}
                placeholder="Search menu items..."
                placeholderTextColor={TEXT_LIGHT}
                value={searchTerm}
                onChangeText={setSearchTerm}
                returnKeyType="search"
              />
              {searchTerm ? (
                <TouchableOpacity onPress={() => setSearchTerm('')}>
                  <Ionicons name="close-circle" size={20} color={TEXT_LIGHT} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Category Tabs */}
            <View style={st.catContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={st.catRow}
              >
                {[{ name: 'All', id: 'all' }, ...categories].map(cat => {
                  const isActive = (cat.id === 'all' && selectedCategory === 'all') || cat.name === selectedCategory;
                  return (
                    <TouchableOpacity
                      key={cat.id || cat.name}
                      style={[st.catPill, isActive && st.catPillActive]}
                      onPress={() => setSelectedCategory(cat.id === 'all' ? 'all' : cat.name)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.catPillText, isActive && st.catPillTextActive]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Menu Grid */}
            <FlatList
              data={filteredItems}
              renderItem={renderMenuItem}
              keyExtractor={item => item.id || item._id}
              numColumns={2}
              columnWrapperStyle={st.menuRow}
              contentContainerStyle={[st.menuGrid, { paddingBottom: cart.length > 0 ? 110 : 24 }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={st.emptyMenu}>
                  <Ionicons name="restaurant-outline" size={44} color="#d1d5db" />
                  <Text style={st.emptyMenuText}>No items found</Text>
                  <Text style={st.emptyMenuSub}>Try a different search or category</Text>
                </View>
              }
            />

            {/* Sticky Cart Bar */}
            {cart.length > 0 && (
              <Animated.View style={[st.cartBar, { transform: [{ translateY: cartSlide.interpolate({ inputRange: [0, 1], outputRange: [100, 0] }) }] }]}>
                <TouchableOpacity style={st.cartBarInner} onPress={() => setShowReview(true)} activeOpacity={0.95}>
                  <View style={st.cartBarLeft}>
                    <View style={st.cartBadge}>
                      <Text style={st.cartBadgeText}>{cartItemCount}</Text>
                    </View>
                    <View style={st.cartBarInfo}>
                      <Text style={st.cartBarTotal}>{formatCurrency(cartTotal)}</Text>
                      <Text style={st.cartBarSummary} numberOfLines={1}>{cartSummaryText}</Text>
                    </View>
                  </View>
                  <View style={st.cartBarReview}>
                    <Text style={st.cartBarReviewText}>Review Order</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleBack}>
      <SafeAreaView style={st.container} edges={['top']}>
        {showReview ? renderReviewView() : renderMenuView()}
      </SafeAreaView>

      <ItemCustomizationModal
        item={customizationItem}
        isOpen={!!customizationItem}
        onClose={() => setCustomizationItem(null)}
        onAddToCart={handleCustomizationAdd}
      />

      <KOTModal
        visible={showKOTModal}
        onClose={handleKOTClose}
        orderData={kotOrderData}
        printSettings={printSettingsRef.current || {}}
        userRole={user?.role}
      />

      <ToastView />
    </Modal>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // ─── Header ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_DARK,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1, fontWeight: '500' },
  editBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  editBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.8 },
  closeHeaderBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
  addMoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  addMoreText: { fontSize: 12, fontWeight: '700', color: PRIMARY },

  // ─── Loading ───
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: TEXT_SEC, fontWeight: '500' },

  // ─── Search ───
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 14, marginTop: 14, marginBottom: 4,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: CARD, borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: TEXT, padding: 0, fontWeight: '400' },

  // ─── Category Tabs ───
  catContainer: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
    marginTop: 8,
  },
  catRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  catPill: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22,
    backgroundColor: BG, borderWidth: 1.5, borderColor: BORDER,
  },
  catPillActive: {
    backgroundColor: PRIMARY, borderColor: PRIMARY,
  },
  catPillText: { fontSize: 14, fontWeight: '600', color: TEXT },
  catPillTextActive: { color: '#fff', fontWeight: '700' },

  // ─── Menu Grid ───
  menuGrid: { paddingHorizontal: 10, paddingTop: 10 },
  menuRow: { gap: 10, paddingHorizontal: 4, marginBottom: 10 },
  menuCard: {
    flex: 1, backgroundColor: CARD, borderRadius: 16,
    padding: 14, borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  menuCardActive: {
    borderColor: GREEN, borderWidth: 1.5,
  },
  menuCardTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  menuCardQtyBadge: {
    backgroundColor: GREEN, width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  menuCardQtyBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  vegBadge: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  menuItemName: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 4, lineHeight: 19 },
  stockText: { fontSize: 11, fontWeight: '600', color: GREEN, marginBottom: 6 },
  menuItemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 4 },
  menuItemPrice: { fontSize: 16, fontWeight: '800', color: TEXT },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GREEN,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  addBtnDisabled: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
  },
  qtyControl: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: GREEN, borderRadius: 20, overflow: 'hidden',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  qtyBtn: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 14, fontWeight: '800', color: '#fff', minWidth: 20, textAlign: 'center' },

  // ─── Empty ───
  emptyMenu: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyMenuText: { fontSize: 16, fontWeight: '600', color: TEXT_SEC },
  emptyMenuSub: { fontSize: 13, color: TEXT_LIGHT },

  // ─── Cart Bar (menu view) ───
  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingBottom: Platform.OS === 'ios' ? 30 : 14, paddingTop: 8,
  },
  cartBarInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111827', borderRadius: 18, paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 16,
  },
  cartBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cartBadge: {
    backgroundColor: GREEN, width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center',
  },
  cartBadgeText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  cartBarInfo: { flex: 1 },
  cartBarTotal: { fontSize: 17, fontWeight: '800', color: '#fff' },
  cartBarSummary: { fontSize: 11, color: '#64748b', marginTop: 2 },
  cartBarReview: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: GREEN, paddingHorizontal: 18, paddingVertical: 13, borderRadius: 14,
  },
  cartBarReviewText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ─── Review View ───
  reviewContextBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  reviewContextChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PRIMARY_LIGHT, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  reviewContextText: { fontSize: 11, fontWeight: '600', color: PRIMARY_DARK },

  reviewList: { paddingHorizontal: 12, paddingTop: 8 },

  reviewItem: {
    backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  reviewItemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  reviewItemLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1,
  },
  vegBadgeSmall: {
    width: 14, height: 14, borderRadius: 3, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  vegDotSmall: { width: 6, height: 6, borderRadius: 3 },
  reviewItemInfo: { flex: 1 },
  reviewItemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewItemName: { fontSize: 13, fontWeight: '600', color: TEXT, lineHeight: 17, flexShrink: 1 },
  reviewItemSub: { fontSize: 11, color: TEXT_LIGHT, marginTop: 1 },
  reviewItemPriceInline: { fontSize: 13, fontWeight: '700', color: TEXT_SEC, marginTop: 1 },
  reviewItemRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewQtyRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  reviewQtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN_BG,
    justifyContent: 'center', alignItems: 'center',
  },
  reviewQtyText: { fontSize: 14, fontWeight: '700', color: TEXT, minWidth: 22, textAlign: 'center' },

  // ─── Per-item kitchen notes ───
  noteInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  noteInput: {
    flex: 1, fontSize: 13, color: TEXT, padding: 0,
    borderBottomWidth: 1.5, borderBottomColor: '#fbbf24',
    paddingBottom: 4,
  },
  noteDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 8, paddingTop: 7, paddingHorizontal: 4,
    borderTopWidth: 1, borderTopColor: BORDER,
    backgroundColor: '#fffbeb', marginHorizontal: -4, paddingBottom: 3,
    borderRadius: 6, marginBottom: -3,
  },
  noteDisplayText: { flex: 1, fontSize: 12, color: '#92400e', fontStyle: 'italic' },
  noteAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 7, paddingTop: 7,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  noteAddText: { fontSize: 12, color: TEXT_LIGHT },

  // ─── Order-level instructions ───
  orderNotesSection: {
    backgroundColor: CARD, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 2, marginBottom: 8,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  orderNotesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  orderNotesLabel: { fontSize: 13, fontWeight: '600', color: TEXT_SEC },
  orderNotesInput: {
    fontSize: 13, color: TEXT, padding: 0,
    minHeight: 36, maxHeight: 72,
    lineHeight: 18,
  },

  // ─── Review Footer ───
  reviewFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 14, paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: CARD,
    borderTopWidth: 1, borderTopColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
  },
  reviewFooterTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  reviewFooterLabel: { fontSize: 12, fontWeight: '500', color: TEXT_SEC },
  reviewFooterTotal: { fontSize: 22, fontWeight: '800', color: TEXT },
  sendBtnLarge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, paddingVertical: 14, borderRadius: 14,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 5,
  },
  sendBtnLargeText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ─── Customer Info ───
  customerSection: {
    marginTop: 2, marginBottom: 8,
  },
  customerRow: {
    flexDirection: 'row', gap: 8,
  },
  customerInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 10, paddingVertical: 0,
    height: 42,
  },
  customerInput: {
    flex: 1, fontSize: 13, color: TEXT, padding: 0,
  },
  customerFoundRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, paddingHorizontal: 4,
  },
  customerFoundText: {
    fontSize: 11, fontWeight: '600', color: GREEN,
  },

  // ─── Change Tags (edit mode) ───
  changeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5,
  },
  changeTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  // ─── Change Summary Banner ───
  changeSummaryBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#eff6ff', borderRadius: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  changeSummaryText: { flex: 1, fontSize: 11, fontWeight: '500', color: '#1e40af', lineHeight: 15 },

  // ─── No Changes Banner ───
  noChangeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#f0fdf4', borderRadius: 8,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  noChangeText: { flex: 1, fontSize: 11, fontWeight: '500', color: '#166534' },

  // ─── Removed Items Section ───
  removedSection: {
    backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
    borderWidth: 1, borderColor: '#fecaca',
  },
  removedSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6,
  },
  removedSectionTitle: { fontSize: 11, fontWeight: '700', color: '#dc2626' },
  removedItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#fecaca',
  },
  removedItemQty: { fontSize: 12, fontWeight: '600', color: '#991b1b' },
  removedItemName: {
    flex: 1, fontSize: 12, fontWeight: '500', color: '#991b1b',
    textDecorationLine: 'line-through',
  },
  removedTag: {
    backgroundColor: '#dc2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  removedTagText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },

  // ─── Change Count Badge ───
  changeCountBadge: {
    backgroundColor: PRIMARY_LIGHT, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  changeCountBadgeText: { fontSize: 11, fontWeight: '700', color: PRIMARY_DARK },
});
