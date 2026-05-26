import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: 'cash-outline', color: '#10b981' },
  { key: 'upi', label: 'UPI', icon: 'phone-portrait-outline', color: '#8b5cf6' },
  { key: 'card', label: 'Card', icon: 'card-outline', color: '#3b82f6' },
];

export default function BarSettleModal({ visible, onClose, tab, taxSettings, onSettle }) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountType, setDiscountType] = useState('flat'); // flat | percentage
  const [discountValue, setDiscountValue] = useState('');
  const [settling, setSettling] = useState(false);
  const [showItems, setShowItems] = useState(false);

  const items = tab?.items || [];
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Calculate discount
  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    if (val <= 0) return 0;
    if (discountType === 'percentage') {
      return Math.min(Math.round((subtotal * val / 100) * 100) / 100, subtotal);
    }
    return Math.min(val, subtotal);
  }, [discountValue, discountType, subtotal]);

  const afterDiscount = Math.max(0, subtotal - discountAmount);

  // Tax calculation
  const { taxBreakdown, totalTax } = useMemo(() => {
    if (!taxSettings?.taxes?.length) return { taxBreakdown: [], totalTax: 0 };
    const breakdown = taxSettings.taxes
      .filter(t => t.enabled !== false)
      .map(t => ({
        name: t.name,
        rate: t.rate,
        amount: Math.round((afterDiscount * t.rate / 100) * 100) / 100,
      }));
    return {
      taxBreakdown: breakdown,
      totalTax: Math.round(breakdown.reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
    };
  }, [taxSettings, afterDiscount]);

  const grandTotal = Math.round((afterDiscount + totalTax) * 100) / 100;

  const handleSettle = async () => {
    setSettling(true);
    try {
      await onSettle(paymentMethod, {
        type: discountType,
        value: parseFloat(discountValue) || 0,
        amount: discountAmount,
      });
    } catch (error) {
      // Error handled in parent
    } finally {
      setSettling(false);
    }
  };

  const handleClose = () => {
    setDiscountValue('');
    setDiscountType('flat');
    setPaymentMethod('cash');
    setShowItems(false);
    onClose();
  };

  if (!tab) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleClose}>
            <Ionicons name="chevron-back" size={24} color={Colors.textDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Settle Tab</Text>
            <Text style={styles.headerSubtitle}>{tab.customerInfo?.name || 'Tab'}</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView contentContainerStyle={styles.content}>
            {/* Items Summary (collapsible) */}
            <TouchableOpacity
              style={styles.itemsSummaryHeader}
              onPress={() => setShowItems(!showItems)}
              activeOpacity={0.7}
            >
              <View style={styles.itemsSummaryLeft}>
                <Ionicons name="receipt-outline" size={18} color={Colors.textMedium} />
                <Text style={styles.itemsSummaryText}>
                  {items.reduce((s, i) => s + i.quantity, 0)} items
                </Text>
              </View>
              <Ionicons
                name={showItems ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textLight}
              />
            </TouchableOpacity>

            {showItems && (
              <View style={styles.itemsList}>
                {items.map((item, idx) => (
                  <View key={item.menuItemId || idx} style={styles.itemRow}>
                    <Text style={styles.itemQty}>{item.quantity}×</Text>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemAmount}>₹{(item.price * item.quantity).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Subtotal */}
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Subtotal</Text>
              <Text style={styles.subtotalValue}>₹{subtotal.toFixed(2)}</Text>
            </View>

            {/* Discount Section */}
            <View style={styles.discountSection}>
              <Text style={styles.sectionLabel}>Discount</Text>
              <View style={styles.discountRow}>
                <View style={styles.discountTypeToggle}>
                  <TouchableOpacity
                    style={[styles.discountTypeBtn, discountType === 'flat' && styles.discountTypeBtnActive]}
                    onPress={() => setDiscountType('flat')}
                  >
                    <Text style={[styles.discountTypeText, discountType === 'flat' && styles.discountTypeTextActive]}>₹</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.discountTypeBtn, discountType === 'percentage' && styles.discountTypeBtnActive]}
                    onPress={() => setDiscountType('percentage')}
                  >
                    <Text style={[styles.discountTypeText, discountType === 'percentage' && styles.discountTypeTextActive]}>%</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.discountInput}
                  value={discountValue}
                  onChangeText={setDiscountValue}
                  placeholder="0"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
              {discountAmount > 0 && (
                <Text style={styles.discountPreview}>-₹{discountAmount.toFixed(2)} discount applied</Text>
              )}
            </View>

            {/* Tax Breakdown */}
            {taxBreakdown.length > 0 && (
              <View style={styles.taxSection}>
                {taxBreakdown.map((tax, idx) => (
                  <View key={idx} style={styles.taxRow}>
                    <Text style={styles.taxLabel}>{tax.name} ({tax.rate}%){tax.inclusive ? ' (incl.)' : ''}</Text>
                    <Text style={styles.taxValue}>₹{tax.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Grand Total */}
            <View style={styles.grandTotalContainer}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>₹{grandTotal.toFixed(2)}</Text>
            </View>

            {/* Payment Method */}
            <View style={styles.paymentSection}>
              <Text style={styles.sectionLabel}>Payment Method</Text>
              <View style={styles.paymentOptions}>
                {PAYMENT_METHODS.map(method => {
                  const isSelected = paymentMethod === method.key;
                  return (
                    <TouchableOpacity
                      key={method.key}
                      style={[
                        styles.paymentOption,
                        isSelected && { borderColor: method.color, backgroundColor: method.color + '10' },
                      ]}
                      onPress={() => setPaymentMethod(method.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={method.icon}
                        size={24}
                        color={isSelected ? method.color : Colors.textLight}
                      />
                      <Text style={[
                        styles.paymentOptionText,
                        isSelected && { color: method.color, fontWeight: '700' },
                      ]}>
                        {method.label}
                      </Text>
                      {isSelected && (
                        <View style={[styles.paymentCheck, { backgroundColor: method.color }]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          {/* Settle Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.settleButton, settling && { opacity: 0.6 }]}
              onPress={handleSettle}
              disabled={settling || items.length === 0}
            >
              {settling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={22} color="#fff" />
                  <Text style={styles.settleButtonText}>
                    Settle & Close — ₹{grandTotal.toFixed(2)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 1,
  },

  // Content
  content: {
    padding: Spacing.md,
    gap: 12,
    paddingBottom: 30,
  },

  // Items Summary
  itemsSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: Spacing.md,
    borderRadius: 14,
  },
  itemsSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemsSummaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  itemsList: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 8,
    marginTop: -4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 24,
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },

  // Subtotal
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: Spacing.md,
    borderRadius: 14,
  },
  subtotalLabel: {
    fontSize: 15,
    color: Colors.textMedium,
  },
  subtotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },

  // Discount
  discountSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  discountTypeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
  },
  discountTypeBtnActive: {
    backgroundColor: Colors.primary,
  },
  discountTypeText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textMedium,
  },
  discountTypeTextActive: {
    color: '#fff',
  },
  discountInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  discountPreview: {
    fontSize: 12,
    color: Colors.accentGreen,
    fontWeight: '600',
  },

  // Tax
  taxSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 6,
  },
  taxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taxLabel: {
    fontSize: 13,
    color: Colors.textLight,
  },
  taxValue: {
    fontSize: 13,
    color: Colors.textLight,
  },

  // Grand Total
  grandTotalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.primary + '08',
    borderRadius: 14,
    padding: Spacing.md,
    borderWidth: 2,
    borderColor: Colors.primary + '20',
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.primary,
  },

  // Payment
  paymentSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: Spacing.md,
    gap: 10,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  paymentOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  paymentCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    padding: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? 8 : Spacing.md,
  },
  settleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accentGreen,
    paddingVertical: 16,
    borderRadius: 14,
  },
  settleButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
});
