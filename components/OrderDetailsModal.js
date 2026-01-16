import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/Theme';

export default function OrderDetailsModal({ visible, onClose, orderId, tableNumber, restaurantId, onAddItems }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible && orderId && restaurantId) {
      loadOrderDetails();
    } else {
      setOrder(null);
      setError(null);
    }
  }, [visible, orderId, restaurantId]);

  const loadOrderDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.getOrders(restaurantId, {
        search: orderId,
        limit: 1,
      });

      if (response.orders && response.orders.length > 0) {
        const orderData = response.orders[0];
        console.log('Order data:', orderData);
        console.log('Order items:', orderData.items);
        console.log('Items length:', orderData.items?.length);
        console.log('Items type:', Array.isArray(orderData.items));
        setOrder(orderData);
      } else if (response.order) {
        // Handle case where API returns order directly
        console.log('Order data (direct):', response.order);
        console.log('Order items:', response.order.items);
        setOrder(response.order);
      } else {
        setError('Order not found');
      }
    } catch (err) {
      console.error('Error loading order:', err);
      setError(err.message || 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    if (!order?.items) return 0;
    return order.items.reduce((sum, item) => {
      const price = item.price || 0;
      const quantity = item.quantity || 1;
      return sum + (price * quantity);
    }, 0);
  };

  const formatDate = (dateInput) => {
    if (!dateInput) return 'N/A';
    
    try {
      let date;
      
      // Handle Firestore timestamp
      if (dateInput.toDate && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
      } else if (dateInput._seconds) {
        // Handle Firestore timestamp format
        date = new Date(dateInput._seconds * 1000);
      } else if (dateInput instanceof Date) {
        date = dateInput;
      } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
        date = new Date(dateInput);
      } else {
        return 'N/A';
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'N/A';
      }
      
      return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'N/A';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'confirmed':
      case 'preparing':
        return Colors.warning;
      case 'ready':
        return Colors.success;
      case 'completed':
        return Colors.textMedium;
      default:
        return Colors.textMedium;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>
                Order #{order?.dailyOrderId || order?.orderNumber || orderId?.slice(-6)}
              </Text>
              {order?.status && (
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                    {order.status.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.scrollContent}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading order details...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : order ? (
              <>
                {/* Order Info */}
                <View style={styles.infoSection}>
                  <View style={styles.infoCard}>
                    <Ionicons name="time-outline" size={18} color={Colors.primary} />
                    <Text style={styles.infoTextBold}>
                      {formatDate(order.createdAt || order.timestamp || order.kotTime)}
                    </Text>
                  </View>
                  {(tableNumber || order.tableNumber) && (
                    <View style={styles.infoCard}>
                      <Ionicons name="restaurant-outline" size={18} color={Colors.primary} />
                      <Text style={styles.infoTextBold}>
                        Table {tableNumber || order.tableNumber}
                      </Text>
                    </View>
                  )}
                  {(order.staffInfo?.name || order.staffInfo?.waiterName) && (
                    <View style={styles.infoCard}>
                      <Ionicons name="person-outline" size={18} color={Colors.primary} />
                      <Text style={styles.infoTextBold}>
                        {order.staffInfo?.name || order.staffInfo?.waiterName}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Items List */}
                <View style={styles.itemsSection}>
                  <Text style={styles.sectionTitle}>
                    Order Items {order.items ? `(${order.items.length})` : '(0)'}
                  </Text>
                  {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((item, index) => {
                      // Handle different item structures
                      const itemName = item.name || item.menuItem?.name || item.itemName || 'Unknown Item';
                      const itemPrice = item.price || item.unitPrice || item.itemPrice || item.menuItem?.price || 0;
                      const itemQuantity = item.quantity || 1;
                      const itemTotal = item.total || (itemPrice * itemQuantity);
                      
                      return (
                        <View key={`item-${index}-${item.menuItemId || item.id || index}`} style={styles.itemRow}>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemName}>{itemName}</Text>
                            {(item.description || item.menuItem?.description) && (
                              <Text style={styles.itemDescription} numberOfLines={1}>
                                {item.description || item.menuItem?.description}
                              </Text>
                            )}
                          </View>
                          <View style={styles.itemQuantity}>
                            <Text style={styles.quantityText}>x{itemQuantity}</Text>
                          </View>
                          <View style={styles.itemPrice}>
                            <Text style={styles.priceText}>
                              ₹{itemTotal.toFixed(2)}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.emptyItemsContainer}>
                      <Ionicons name="receipt-outline" size={32} color={Colors.textLight} />
                      <Text style={styles.emptyItemsText}>No items found</Text>
                      <Text style={styles.emptyItemsSubtext}>
                        {order.items ? `Items type: ${typeof order.items}, isArray: ${Array.isArray(order.items)}, length: ${order.items?.length}` : 'Items is undefined'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Total */}
                <View style={styles.totalSection}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Amount</Text>
                    <Text style={styles.totalAmount}>₹{calculateTotal().toFixed(2)}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </ScrollView>

          {/* Footer Actions */}
          {order && !loading && !error && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>Close</Text>
              </TouchableOpacity>
              {typeof onAddItems === 'function' && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    onClose();
                    // Pass order items to menu screen
                    if (order.items) {
                      const cartItems = order.items.map(item => ({
                        id: item.menuItemId || item.id,
                        menuItemId: item.menuItemId || item.id,
                        name: item.name,
                        price: item.price || 0,
                        quantity: item.quantity || 1,
                        description: item.description,
                      }));
                      onAddItems(order, cartItems);
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={18} color="#fff" />
                  <Text style={styles.addButtonText}>Add Items</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.lg,
    width: '100%',
    maxWidth: 500,
    height: '85%',
    maxHeight: '90%',
    overflow: 'hidden',
    ...Shadows.large,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  closeButton: {
    padding: Spacing.xs,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.lg,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textMedium,
    fontSize: 14,
  },
  errorContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    marginTop: Spacing.sm,
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  infoSection: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    flex: 1,
    minWidth: '45%',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
    flex: 1,
    minWidth: '45%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  infoText: {
    fontSize: 13,
    color: Colors.textMedium,
  },
  infoTextBold: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  itemsSection: {
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.backgroundWhite,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 2,
  },
  itemDescription: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  itemQuantity: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  itemPrice: {
    width: 80,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  totalSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
    backgroundColor: Colors.backgroundLight,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyItemsContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyItemsText: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
  },
  emptyItemsSubtext: {
    marginTop: Spacing.xs,
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
  },
});
