import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import { getItemSubline } from '../utils/itemSubline';
import { useResponsive } from '../hooks/useResponsive';

export default function WaiterCartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onSendToKitchen,
  total,
  tableNumber,
  sending,
}) {
  const { fs } = useResponsive();
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [showKitchenNotes, setShowKitchenNotes] = useState(false);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemInfo}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        {getItemSubline(item) ? (
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
        ) : null}
        <Text style={styles.cartItemPrice}>₹{item.price}</Text>
      </View>
      <View style={styles.cartItemControls}>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          disabled={sending}
        >
          <Ionicons name="remove" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={styles.quantityText}>{item.quantity}</Text>
        <TouchableOpacity
          style={styles.quantityButton}
          onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          disabled={sending}
        >
          <Ionicons name="add" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => onRemoveItem(item.id)}
          disabled={sending}
        >
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cartItemTotal}>
        ₹{(item.price * item.quantity).toFixed(2)}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Order Summary</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={styles.itemCount}>{itemCount} item(s)</Text>
                  {tableNumber && (
                    <>
                      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.textLight }} />
                      <Ionicons name="restaurant" size={12} color={Colors.textMedium} />
                      <Text style={styles.subtitle}>Table {tableNumber}</Text>
                    </>
                  )}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.notesToggle, showKitchenNotes && styles.notesToggleActive]}
                onPress={() => setShowKitchenNotes(!showKitchenNotes)}
              >
                <Ionicons name="document-text-outline" size={18} color={showKitchenNotes ? '#d97706' : Colors.textLight} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} disabled={sending}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Cart Items */}
          <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
                <Text style={styles.emptySubtext}>Add items to place order</Text>
              </View>
            ) : (
              <>
                <FlatList
                  data={cart}
                  renderItem={renderCartItem}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                />
                
                {/* Customer Phone (optional - for loyalty points) */}
                <View style={styles.phoneContainer}>
                  <Ionicons name="call-outline" size={16} color={Colors.textLight} />
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Customer phone (for loyalty)"
                    placeholderTextColor="#999"
                    keyboardType="phone-pad"
                    value={customerPhone}
                    onChangeText={(t) => setCustomerPhone(t.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                  />
                </View>

                {/* Kitchen Notes — collapsible */}
                {showKitchenNotes && (
                  <View style={styles.kitchenNotesBar}>
                    <Ionicons name="document-text" size={14} color="#d97706" />
                    <TextInput
                      style={styles.kitchenNotesInput}
                      placeholder="Kitchen notes: No onions, extra spicy..."
                      placeholderTextColor="#9ca3af"
                      value={specialInstructions}
                      onChangeText={setSpecialInstructions}
                      autoFocus
                    />
                    {specialInstructions ? (
                      <TouchableOpacity onPress={() => setSpecialInstructions('')}>
                        <Ionicons name="close-circle" size={18} color="#9ca3af" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}

                {/* Total */}
                <View style={styles.totalContainer}>
                  <Text style={[styles.totalLabel, { fontSize: fs(16) }]}>Total Amount</Text>
                  <Text style={[styles.totalAmount, { fontSize: fs(20) }]}>₹{total.toFixed(2)}</Text>
                </View>
              </>
            )}
          </ScrollView>

          {/* Footer - Send to Kitchen Button */}
          {cart.length > 0 && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={() => onSendToKitchen(customerPhone, specialInstructions.trim() || null)}
                disabled={sending}
              >
                {sending ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.sendButtonText}>Sending to Kitchen...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="restaurant" size={20} color="#fff" />
                    <Text style={styles.sendButtonText}>Send to Kitchen</Text>
                  </>
                )}
              </TouchableOpacity>
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.backgroundWhite,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '85%',
  },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.backgroundLight,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: 2,
  },
  itemCount: {
    fontSize: Typography.small.fontSize,
    color: Colors.textLight,
  },
  cartList: {
    maxHeight: 400,
    paddingHorizontal: Spacing.lg,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  cartItemInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  cartItemName: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
  },
  cartItemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.md,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.textDark,
    minWidth: 24,
    textAlign: 'center',
  },
  removeButton: {
    padding: Spacing.xs,
  },
  cartItemTotal: {
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
    color: Colors.primary,
    minWidth: 70,
    textAlign: 'right',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
  },
  emptySubtext: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textLight,
  },
  notesToggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  notesToggleActive: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  kitchenNotesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  kitchenNotesInput: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    padding: 0,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  phoneInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
    paddingVertical: 2,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 2,
    borderTopColor: Colors.borderLight,
  },
  totalLabel: {
    fontSize: Typography.h3.fontSize,
    fontWeight: Typography.h3.fontWeight,
    color: Colors.textDark,
  },
  totalAmount: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.primary,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.backgroundLight,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
});
