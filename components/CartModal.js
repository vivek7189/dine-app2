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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';

export default function CartModal({
  visible,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onPlaceOrder,
  total,
  tableNumber,
}) {
  const [orderType, setOrderType] = useState('dine-in');
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const GST_RATE = 0.05; // 5%
  const subtotal = total;
  const gst = subtotal * GST_RATE;
  const grandTotal = subtotal + gst;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <View style={styles.cartItemHeader}>
        <Text style={styles.cartItemName}>{item.name}</Text>
        <TouchableOpacity
          style={styles.removeIconButton}
          onPress={() => onRemoveItem(item.id)}
        >
          <Ionicons name="close" size={18} color={Colors.error} />
        </TouchableOpacity>
      </View>

      <View style={styles.cartItemFooter}>
        <View style={styles.cartItemPricing}>
          <Text style={styles.cartItemSubtotal}>Subtotal: ₹{item.price * item.quantity}</Text>
          <Text style={styles.cartItemPrice}>₹{item.price}</Text>
          <View style={styles.vegIndicatorTiny}>
            <View style={styles.vegDotTiny} />
          </View>
        </View>

        <View style={styles.quantityControls}>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
          >
            <Ionicons name="remove" size={16} color={Colors.textDark} />
          </TouchableOpacity>
          <Text style={styles.quantityText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.quantityButton}
            onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
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
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitle}>
              <Ionicons name="cart" size={24} color="#fff" style={styles.headerIcon} />
              <View>
                <Text style={styles.title}>Order Summary</Text>
                <Text style={styles.itemCountText}>{itemCount} items</Text>
              </View>
            </View>
            <View style={styles.orderTypeTabs}>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'dine-in' && styles.orderTypeTabActive]}
                onPress={() => setOrderType('dine-in')}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'dine-in' && styles.orderTypeTabTextActive]}>
                  DINE IN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'takeaway' && styles.orderTypeTabActive]}
                onPress={() => setOrderType('takeaway')}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'takeaway' && styles.orderTypeTabTextActive]}>
                  TAKEAWAY
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.orderTypeTab, orderType === 'delivery' && styles.orderTypeTabActive]}
                onPress={() => setOrderType('delivery')}
              >
                <Text style={[styles.orderTypeTabText, orderType === 'delivery' && styles.orderTypeTabTextActive]}>
                  DELIVERY
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Serving Table */}
            {tableNumber && orderType === 'dine-in' && (
              <View style={styles.servingTable}>
                <View style={styles.servingTableLeft}>
                  <View style={styles.tableIcon}>
                    <Ionicons name="restaurant" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.servingLabel}>SERVING</Text>
                    <Text style={styles.servingTable}>Table {tableNumber}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.changeButton}>
                  <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
                  <Text style={styles.changeButtonText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Cart Items */}
            {cart.length === 0 ? (
              <View style={styles.emptyCart}>
                <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
                <Text style={styles.emptyText}>Your cart is empty</Text>
              </View>
            ) : (
              <FlatList
                data={cart}
                renderItem={renderCartItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.cartList}
              />
            )}

            {cart.length > 0 && (
              <>
                {/* Pricing Summary */}
                <View style={styles.pricingSummary}>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingLabel}>Subtotal:</Text>
                    <Text style={styles.pricingValue}>₹{subtotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.pricingRow}>
                    <Text style={styles.pricingLabel}>GST (5%):</Text>
                    <Text style={styles.pricingValue}>₹{gst.toFixed(2)}</Text>
                  </View>
                </View>

                {/* Total */}
                <View style={styles.totalBox}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalAmount}>₹{grandTotal.toFixed(2)}</Text>
                </View>

                {/* Customer Details */}
                <View style={styles.customerDetails}>
                  <Text style={styles.sectionTitle}>Customer Name</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Customer Name"
                      placeholderTextColor={Colors.textLight}
                      value={customerName}
                      onChangeText={setCustomerName}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Mobile Number"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="phone-pad"
                      value={customerMobile}
                      onChangeText={setCustomerMobile}
                    />
                  </View>
                  {tableNumber && (
                    <TextInput
                      style={[styles.input, styles.inputFull]}
                      value={tableNumber}
                      editable={false}
                    />
                  )}
                </View>

                {/* Payment Method */}
                <View style={styles.paymentMethods}>
                  <View style={styles.paymentHeader}>
                    <Ionicons name="card-outline" size={20} color={Colors.textDark} />
                    <Text style={styles.sectionTitle}>Payment Method</Text>
                  </View>
                  <View style={styles.paymentButtons}>
                    <TouchableOpacity
                      style={[styles.paymentButton, paymentMethod === 'cash' && styles.paymentButtonActive]}
                      onPress={() => setPaymentMethod('cash')}
                    >
                      <Text style={[styles.paymentButtonText, paymentMethod === 'cash' && styles.paymentButtonTextActive]}>
                        Cash
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paymentButton, paymentMethod === 'upi' && styles.paymentButtonActive]}
                      onPress={() => setPaymentMethod('upi')}
                    >
                      <Text style={[styles.paymentButtonText, paymentMethod === 'upi' && styles.paymentButtonTextActive]}>
                        UPI
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.paymentButton, paymentMethod === 'card' && styles.paymentButtonActive]}
                      onPress={() => setPaymentMethod('card')}
                    >
                      <Text style={[styles.paymentButtonText, paymentMethod === 'card' && styles.paymentButtonTextActive]}>
                        Card
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity style={styles.saveButton}>
                    <Ionicons name="bookmark-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Order</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.placeOrderButton}
                    onPress={onPlaceOrder}
                  >
                    <Ionicons name="restaurant" size={18} color="#fff" />
                    <Text style={styles.placeOrderButtonText}>Place Order</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.completeBillingButton}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.completeBillingButtonText}>Complete Billing</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
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
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '95%',
  },
  header: {
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerIcon: {
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  itemCountText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  orderTypeTabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  orderTypeTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  orderTypeTabActive: {
    backgroundColor: '#fff',
  },
  orderTypeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  orderTypeTabTextActive: {
    color: Colors.primary,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  servingTable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef7f0',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: 8,
  },
  servingTableLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tableIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  servingLabel: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
  },
  servingTableText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  changeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  cartList: {
    paddingHorizontal: Spacing.md,
  },
  cartItem: {
    backgroundColor: '#fff',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  cartItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
    flex: 1,
  },
  removeIconButton: {
    padding: 2,
  },
  cartItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartItemPricing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cartItemSubtotal: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  cartItemPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  vegIndicatorTiny: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  vegDotTiny: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#10b981',
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quantityButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    minWidth: 20,
    textAlign: 'center',
  },
  pricingSummary: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  pricingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  customerDetails: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.textDark,
    backgroundColor: '#fff',
  },
  inputFull: {
    flex: undefined,
    width: '100%',
    backgroundColor: '#f5f5f5',
  },
  paymentMethods: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  paymentButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  paymentButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  paymentButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  paymentButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  paymentButtonTextActive: {
    color: '#fff',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  placeOrderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  placeOrderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  completeBillingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    backgroundColor: '#10b981',
  },
  completeBillingButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  emptyCart: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
});
