import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Share,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/Theme';

export default function CashierInvoiceModal({
  visible,
  onClose,
  invoiceData,
  onNewOrder,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerGST, setCustomerGST] = useState('');

  useEffect(() => {
    if (invoiceData) {
      setCustomerName(invoiceData.customerName || 'Walk-in Customer');
      setCustomerGST('');
    }
  }, [invoiceData]);

  if (!invoiceData) return null;

  const formatDate = (date) => {
    if (!date) return new Date().toLocaleString('en-IN');
    const d = new Date(date);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const generateInvoiceText = () => {
    const itemsList = invoiceData.items.map(item =>
      `${item.quantity} x ${item.name} @ ₹${item.price} = ₹${item.total.toFixed(2)}`
    ).join('\n');

    const invoiceText = `
================================
        *${invoiceData.restaurantName}*
================================
Invoice #: ${invoiceData.orderNumber}
Date: ${formatDate(invoiceData.timestamp)}
Type: ${invoiceData.orderType?.toUpperCase() || 'COUNTER'}
Payment: ${invoiceData.paymentMethod?.toUpperCase() || 'CASH'}
--------------------------------
Customer: ${customerName}
${customerGST ? `GSTIN: ${customerGST}` : ''}
================================
ITEMS:
--------------------------------
${itemsList}
--------------------------------
Subtotal:        ₹${invoiceData.subtotal.toFixed(2)}
GST (5%):        ₹${invoiceData.gst.toFixed(2)}
================================
*GRAND TOTAL:    ₹${invoiceData.grandTotal.toFixed(2)}*
================================

Thank you for your business!
Served by: ${invoiceData.staffName}
    `.trim();

    return invoiceText;
  };

  const handleShareGeneric = async () => {
    try {
      const invoiceText = generateInvoiceText();
      await Share.share({
        message: invoiceText,
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share invoice');
    }
  };

  const handleShareWhatsApp = async () => {
    try {
      const invoiceText = generateInvoiceText();
      const encodedText = encodeURIComponent(invoiceText);

      // If customer has mobile number, pre-fill it
      let whatsappUrl = `whatsapp://send?text=${encodedText}`;
      if (invoiceData.customerMobile) {
        // Format phone number (add country code if needed)
        let phone = invoiceData.customerMobile.replace(/\D/g, '');
        if (phone.length === 10) {
          phone = '91' + phone; // Add India country code
        }
        whatsappUrl = `whatsapp://send?phone=${phone}&text=${encodedText}`;
      }

      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to web WhatsApp
        const webUrl = `https://wa.me/?text=${encodedText}`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open WhatsApp. Make sure WhatsApp is installed.');
    }
  };

  const handleShareEmail = async () => {
    try {
      const invoiceText = generateInvoiceText();
      const subject = `Invoice #${invoiceData.orderNumber} - ${invoiceData.restaurantName}`;
      const emailUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(invoiceText)}`;

      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
      } else {
        Alert.alert('Error', 'No email app available');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open email app');
    }
  };

  const handlePrint = async () => {
    // For now, we'll use share which can trigger print on some devices
    // In a production app, you'd integrate with a thermal printer SDK
    try {
      const invoiceText = generateInvoiceText();
      await Share.share({
        message: invoiceText,
        title: `Invoice #${invoiceData.orderNumber}`,
      });
    } catch (error) {
      Alert.alert('Print', 'Connect a Bluetooth printer in Settings to enable printing.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Success Header */}
          <View style={styles.successHeader}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            </View>
            <Text style={styles.successTitle}>Order Completed!</Text>
            <Text style={styles.successSubtitle}>Invoice #{invoiceData.orderNumber}</Text>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Invoice Card */}
            <View style={styles.invoiceCard}>
              {/* Invoice Header */}
              <View style={styles.invoiceHeader}>
                <Text style={styles.restaurantName}>{invoiceData.restaurantName}</Text>
                <Text style={styles.invoiceDate}>{formatDate(invoiceData.timestamp)}</Text>
              </View>

              {/* Customer Info - Editable */}
              <View style={styles.customerSection}>
                <View style={styles.customerRow}>
                  <Text style={styles.customerLabel}>Customer:</Text>
                  {isEditing ? (
                    <TextInput
                      style={styles.editInput}
                      value={customerName}
                      onChangeText={setCustomerName}
                      placeholder="Customer Name"
                    />
                  ) : (
                    <Text style={styles.customerValue}>{customerName}</Text>
                  )}
                </View>
                <View style={styles.customerRow}>
                  <Text style={styles.customerLabel}>GSTIN:</Text>
                  {isEditing ? (
                    <TextInput
                      style={styles.editInput}
                      value={customerGST}
                      onChangeText={setCustomerGST}
                      placeholder="GST Number (Optional)"
                    />
                  ) : (
                    <Text style={styles.customerValue}>{customerGST || '-'}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditing(!isEditing)}
                >
                  <Ionicons
                    name={isEditing ? "checkmark" : "pencil"}
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={styles.editButtonText}>
                    {isEditing ? 'Done' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Order Type & Payment */}
              <View style={styles.orderInfoRow}>
                <View style={styles.orderInfoItem}>
                  <Ionicons name="storefront-outline" size={16} color={Colors.textMedium} />
                  <Text style={styles.orderInfoText}>
                    {invoiceData.orderType?.toUpperCase() || 'COUNTER'}
                  </Text>
                </View>
                <View style={styles.orderInfoItem}>
                  <Ionicons name="card-outline" size={16} color={Colors.textMedium} />
                  <Text style={styles.orderInfoText}>
                    {invoiceData.paymentMethod?.toUpperCase() || 'CASH'}
                  </Text>
                </View>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Items */}
              <View style={styles.itemsSection}>
                <Text style={styles.itemsSectionTitle}>ITEMS</Text>
                {invoiceData.items.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemQty}>
                        {item.quantity} x ₹{item.price}
                      </Text>
                    </View>
                    <Text style={styles.itemTotal}>₹{item.total.toFixed(2)}</Text>
                  </View>
                ))}
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Totals */}
              <View style={styles.totalsSection}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>₹{invoiceData.subtotal.toFixed(2)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>GST (5%)</Text>
                  <Text style={styles.totalValue}>₹{invoiceData.gst.toFixed(2)}</Text>
                </View>
                <View style={styles.grandTotalRow}>
                  <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
                  <Text style={styles.grandTotalValue}>₹{invoiceData.grandTotal.toFixed(2)}</Text>
                </View>
              </View>

              {/* Footer */}
              <View style={styles.invoiceFooter}>
                <Text style={styles.footerText}>Thank you for your business!</Text>
                <Text style={styles.staffText}>Served by: {invoiceData.staffName}</Text>
              </View>
            </View>

            {/* Share Options */}
            <View style={styles.shareSection}>
              <Text style={styles.shareSectionTitle}>Share Invoice</Text>
              <View style={styles.shareButtons}>
                <TouchableOpacity style={styles.shareButton} onPress={handleShareWhatsApp}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#25D366' }]}>
                    <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handleShareEmail}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#EA4335' }]}>
                    <Ionicons name="mail" size={24} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>Email</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handlePrint}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#333' }]}>
                    <Ionicons name="print" size={24} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>Print</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handleShareGeneric}>
                  <View style={[styles.shareIconBg, { backgroundColor: Colors.primary }]}>
                    <Ionicons name="share-social" size={24} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>More</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.newOrderButton} onPress={onNewOrder}>
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.newOrderButtonText}>New Order</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '95%',
  },
  successHeader: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  successIcon: {
    marginBottom: Spacing.sm,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  successSubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  invoiceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: Spacing.lg,
    ...Shadows.medium,
  },
  invoiceHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  customerSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerLabel: {
    fontSize: 13,
    color: Colors.textMedium,
    width: 80,
  },
  customerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    flex: 1,
  },
  editInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
  },
  editButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  orderInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5e5',
    marginVertical: Spacing.md,
  },
  itemsSection: {
    marginBottom: Spacing.sm,
  },
  itemsSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMedium,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 2,
  },
  itemQty: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  totalsSection: {
    marginTop: Spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
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
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 2,
    borderTopColor: '#e5e5e5',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10b981',
  },
  invoiceFooter: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerText: {
    fontSize: 13,
    color: Colors.textMedium,
    fontStyle: 'italic',
  },
  staffText: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  shareSection: {
    marginTop: Spacing.lg,
  },
  shareSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.md,
  },
  shareButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareButton: {
    alignItems: 'center',
    gap: 8,
  },
  shareIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.small,
  },
  shareButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  bottomActions: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  newOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md + 4,
    borderRadius: 12,
    ...Shadows.medium,
  },
  newOrderButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
