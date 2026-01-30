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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
        ${invoiceData.restaurantName}
================================
Invoice #: ${invoiceData.orderNumber}
Date: ${formatDate(invoiceData.timestamp)}
--------------------------------
Customer: ${customerName}
${customerGST ? `GSTIN: ${customerGST}` : ''}
================================
ITEMS:
--------------------------------
${itemsList}
--------------------------------
Subtotal:        ₹${invoiceData.subtotal.toFixed(2)}${invoiceData.taxEnabled && invoiceData.tax > 0 ? `
${invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}:        ₹${invoiceData.tax.toFixed(2)}` : ''}
================================
GRAND TOTAL:     ₹${invoiceData.grandTotal.toFixed(2)}
================================

Thank you for your visit!
    `.trim();

    return invoiceText;
  };

  const generateInvoiceHTML = () => {
    const itemsHTML = invoiceData.items.map(item => `
      <tr>
        <td style="padding: 8px 0; border-bottom: 1px dashed #ddd;">${item.name}</td>
        <td style="padding: 8px 0; border-bottom: 1px dashed #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px 0; border-bottom: 1px dashed #ddd; text-align: right;">₹${item.price}</td>
        <td style="padding: 8px 0; border-bottom: 1px dashed #ddd; text-align: right; font-weight: 600;">₹${item.total.toFixed(2)}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Courier New', monospace;
              padding: 20px;
              max-width: 400px;
              margin: 0 auto;
              background: #fff;
            }
            .receipt {
              border: 2px dashed #333;
              padding: 20px;
            }
            .header {
              text-align: center;
              padding-bottom: 15px;
              border-bottom: 2px dashed #333;
              margin-bottom: 15px;
            }
            .restaurant-name {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .invoice-info {
              font-size: 12px;
              color: #666;
            }
            .customer-section {
              background: #f8f8f8;
              padding: 10px;
              margin-bottom: 15px;
              border-radius: 4px;
            }
            .customer-row {
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              margin-bottom: 4px;
            }
            .items-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
              margin-bottom: 15px;
            }
            .items-table th {
              text-align: left;
              padding: 8px 0;
              border-bottom: 2px solid #333;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .items-table th:nth-child(2),
            .items-table th:nth-child(3),
            .items-table th:nth-child(4) {
              text-align: right;
            }
            .items-table th:nth-child(2) {
              text-align: center;
            }
            .totals {
              border-top: 2px dashed #333;
              padding-top: 15px;
              margin-top: 15px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 6px 0;
              font-size: 14px;
            }
            .grand-total {
              border-top: 2px solid #333;
              margin-top: 10px;
              padding-top: 10px;
              font-size: 20px;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              padding-top: 15px;
              border-top: 2px dashed #333;
              font-size: 12px;
              color: #666;
            }
            .footer .thanks {
              font-size: 14px;
              font-weight: bold;
              color: #333;
              margin-bottom: 5px;
            }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="header">
              <div class="restaurant-name">${invoiceData.restaurantName}</div>
              <div class="invoice-info">
                Invoice #${invoiceData.orderNumber}<br>
                ${formatDate(invoiceData.timestamp)}
              </div>
            </div>

            <div class="customer-section">
              <div class="customer-row">
                <span>Customer:</span>
                <span><strong>${customerName}</strong></span>
              </div>
              ${customerGST ? `
              <div class="customer-row">
                <span>GSTIN:</span>
                <span>${customerGST}</span>
              </div>
              ` : ''}
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>

            <div class="totals">
              <div class="total-row">
                <span>Subtotal</span>
                <span>₹${invoiceData.subtotal.toFixed(2)}</span>
              </div>
              ${invoiceData.taxEnabled && invoiceData.tax > 0 ? `
              <div class="total-row">
                <span>${invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}</span>
                <span>₹${invoiceData.tax.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="total-row grand-total">
                <span>TOTAL</span>
                <span>₹${invoiceData.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            <div class="footer">
              <div class="thanks">Thank you for your visit!</div>
              <div>Served by: ${invoiceData.staffName}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handleDownloadPDF = async () => {
    try {
      const html = generateInvoiceHTML();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice #${invoiceData.orderNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Success', 'PDF saved to: ' + uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate PDF');
    }
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

      let whatsappUrl = `whatsapp://send?text=${encodedText}`;
      if (invoiceData.customerMobile) {
        let phone = invoiceData.customerMobile.replace(/\D/g, '');
        if (phone.length === 10) {
          phone = '91' + phone;
        }
        whatsappUrl = `whatsapp://send?phone=${phone}&text=${encodedText}`;
      }

      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        const webUrl = `https://wa.me/?text=${encodedText}`;
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open WhatsApp');
    }
  };

  const handlePrint = async () => {
    try {
      const html = generateInvoiceHTML();
      await Print.printAsync({ html });
    } catch (error) {
      Alert.alert('Error', 'Failed to print');
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
              <Ionicons name="checkmark-circle" size={56} color="#10b981" />
            </View>
            <Text style={styles.successTitle}>Order Completed!</Text>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Invoice Receipt */}
            <View style={styles.receiptContainer}>
              {/* Dashed border top */}
              <View style={styles.dashedBorder} />

              {/* Receipt Header */}
              <View style={styles.receiptHeader}>
                <Text style={styles.restaurantName}>{invoiceData.restaurantName}</Text>
                <View style={styles.invoiceInfo}>
                  <Text style={styles.invoiceNumber}>Invoice #{invoiceData.orderNumber}</Text>
                  <Text style={styles.invoiceDate}>{formatDate(invoiceData.timestamp)}</Text>
                </View>
              </View>

              {/* Dashed separator */}
              <View style={styles.dashedSeparator} />

              {/* Customer Info */}
              <View style={styles.customerSection}>
                <View style={styles.customerRow}>
                  <Text style={styles.customerLabel}>Customer</Text>
                  {isEditing ? (
                    <TextInput
                      style={styles.editInput}
                      value={customerName}
                      onChangeText={setCustomerName}
                      placeholder="Customer Name"
                      placeholderTextColor="#999"
                    />
                  ) : (
                    <Text style={styles.customerValue}>{customerName}</Text>
                  )}
                </View>
                {(customerGST || isEditing) && (
                  <View style={styles.customerRow}>
                    <Text style={styles.customerLabel}>GSTIN</Text>
                    {isEditing ? (
                      <TextInput
                        style={styles.editInput}
                        value={customerGST}
                        onChangeText={setCustomerGST}
                        placeholder="GST Number (Optional)"
                        placeholderTextColor="#999"
                      />
                    ) : (
                      <Text style={styles.customerValue}>{customerGST || '-'}</Text>
                    )}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => setIsEditing(!isEditing)}
                >
                  <Ionicons
                    name={isEditing ? "checkmark" : "create-outline"}
                    size={14}
                    color={Colors.primary}
                  />
                  <Text style={styles.editButtonText}>
                    {isEditing ? 'Save' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Dashed separator */}
              <View style={styles.dashedSeparator} />

              {/* Items Header */}
              <View style={styles.itemsHeader}>
                <Text style={[styles.itemHeaderText, { flex: 2 }]}>ITEM</Text>
                <Text style={[styles.itemHeaderText, { width: 40, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.itemHeaderText, { width: 60, textAlign: 'right' }]}>RATE</Text>
                <Text style={[styles.itemHeaderText, { width: 70, textAlign: 'right' }]}>AMT</Text>
              </View>

              {/* Items */}
              {invoiceData.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={[styles.itemName, { flex: 2 }]} numberOfLines={2}>{item.name}</Text>
                  <Text style={[styles.itemText, { width: 40, textAlign: 'center' }]}>{item.quantity}</Text>
                  <Text style={[styles.itemText, { width: 60, textAlign: 'right' }]}>₹{item.price}</Text>
                  <Text style={[styles.itemAmount, { width: 70, textAlign: 'right' }]}>₹{item.total.toFixed(2)}</Text>
                </View>
              ))}

              {/* Dashed separator */}
              <View style={styles.dashedSeparator} />

              {/* Totals */}
              <View style={styles.totalsSection}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalValue}>₹{invoiceData.subtotal.toFixed(2)}</Text>
                </View>
                {invoiceData.taxEnabled && invoiceData.tax > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}</Text>
                    <Text style={styles.totalValue}>₹{invoiceData.tax.toFixed(2)}</Text>
                  </View>
                )}
              </View>

              {/* Grand Total */}
              <View style={styles.grandTotalSection}>
                <Text style={styles.grandTotalLabel}>TOTAL</Text>
                <Text style={styles.grandTotalValue}>₹{invoiceData.grandTotal.toFixed(2)}</Text>
              </View>

              {/* Dashed separator */}
              <View style={styles.dashedSeparator} />

              {/* Footer */}
              <View style={styles.receiptFooter}>
                <Text style={styles.thankYouText}>Thank you for your visit!</Text>
                <Text style={styles.staffText}>Served by: {invoiceData.staffName}</Text>
              </View>

              {/* Dashed border bottom */}
              <View style={styles.dashedBorder} />
            </View>

            {/* Share Section */}
            <View style={styles.shareSection}>
              <Text style={styles.shareSectionTitle}>Share Invoice</Text>
              <View style={styles.shareButtons}>
                <TouchableOpacity style={styles.shareButton} onPress={handleShareWhatsApp}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#25D366' }]}>
                    <Ionicons name="logo-whatsapp" size={22} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handleDownloadPDF}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#E53935' }]}>
                    <Ionicons name="document-text" size={22} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handlePrint}>
                  <View style={[styles.shareIconBg, { backgroundColor: '#333' }]}>
                    <Ionicons name="print" size={22} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>Print</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={handleShareGeneric}>
                  <View style={[styles.shareIconBg, { backgroundColor: Colors.primary }]}>
                    <Ionicons name="share-social" size={22} color="#fff" />
                  </View>
                  <Text style={styles.shareButtonText}>Share</Text>
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
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  successIcon: {
    marginBottom: Spacing.xs,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10b981',
  },
  scrollContent: {
    padding: Spacing.md,
  },
  receiptContainer: {
    backgroundColor: '#fff',
    borderRadius: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    // Receipt paper effect
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dashedBorder: {
    height: 2,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#ccc',
    marginVertical: Spacing.sm,
  },
  dashedSeparator: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderColor: '#ddd',
    marginVertical: Spacing.md,
  },
  receiptHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  restaurantName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#222',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  invoiceInfo: {
    alignItems: 'center',
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 2,
  },
  invoiceDate: {
    fontSize: 12,
    color: '#666',
  },
  customerSection: {
    backgroundColor: '#fafafa',
    borderRadius: 6,
    padding: Spacing.sm,
    position: 'relative',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  customerLabel: {
    fontSize: 12,
    color: '#666',
    width: 70,
  },
  customerValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  editInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  editButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  editButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  itemsHeader: {
    flexDirection: 'row',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  itemHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  itemText: {
    fontSize: 12,
    color: '#555',
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  totalsSection: {
    paddingTop: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 13,
    color: '#666',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
  },
  grandTotalSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#222',
    letterSpacing: 1,
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#10b981',
  },
  receiptFooter: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  thankYouText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444',
    marginBottom: 4,
  },
  staffText: {
    fontSize: 11,
    color: '#888',
  },
  shareSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  shareSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  shareButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareButton: {
    alignItems: 'center',
    gap: 6,
  },
  shareIconBg: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  bottomActions: {
    padding: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl + 10 : Spacing.xl,
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
    paddingVertical: Spacing.md + 2,
    borderRadius: 12,
  },
  newOrderButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
