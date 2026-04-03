import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
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

    // Get business details from restaurantInfo (only if showGstOnInvoice is true)
    const showGstInfo = invoiceData.restaurantInfo?.showGstOnInvoice === true;
    const legalName = showGstInfo ? invoiceData.restaurantInfo?.legalBusinessName : null;
    const gstin = showGstInfo ? invoiceData.restaurantInfo?.gstin : null;
    const businessAddress = invoiceData.restaurantInfo?.address;

    const invoiceText = `
================================
        ${invoiceData.restaurantName}
${legalName ? `        ${legalName}` : ''}
${gstin ? `GSTIN: ${gstin}` : ''}${businessAddress ? `
${businessAddress}` : ''}
================================
Invoice #: ${invoiceData.orderNumber}
Date: ${formatDate(invoiceData.timestamp)}
================================
ITEMS:
--------------------------------
${itemsList}
--------------------------------
Subtotal:        ₹${invoiceData.subtotal.toFixed(2)}${invoiceData.offerDiscount > 0 ? `
Offer Discount:  -₹${invoiceData.offerDiscount.toFixed(2)}` : ''}${invoiceData.manualDiscount > 0 ? `
Manual Discount: -₹${invoiceData.manualDiscount.toFixed(2)}` : ''}${invoiceData.loyaltyDiscount > 0 ? `
Loyalty Points:  -₹${invoiceData.loyaltyDiscount.toFixed(2)}` : ''}${invoiceData.serviceChargeAmount > 0 ? `
Service Charge:  ₹${invoiceData.serviceChargeAmount.toFixed(2)}` : ''}${invoiceData.taxEnabled && invoiceData.tax > 0 ? `
${invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}:        ₹${invoiceData.tax.toFixed(2)}` : ''}${invoiceData.tipAmount > 0 ? `
Tip:             ₹${invoiceData.tipAmount.toFixed(2)}` : ''}${invoiceData.roundOffAmount != null && invoiceData.roundOffAmount !== 0 ? `
Round-off:       ${invoiceData.roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(invoiceData.roundOffAmount).toFixed(2)}` : ''}
================================
GRAND TOTAL:     ₹${invoiceData.grandTotal.toFixed(2)}
================================${invoiceData.cashReceived > 0 ? `
Cash Received:   ₹${invoiceData.cashReceived.toFixed(2)}${invoiceData.changeReturned > 0 ? `
Change:          ₹${invoiceData.changeReturned.toFixed(2)}` : ''}` : ''}
Payment: ${(invoiceData.paymentMethod || 'cash').toUpperCase()}

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

    // Get business details from restaurantInfo (only if showGstOnInvoice is true)
    const showGstInfo = invoiceData.restaurantInfo?.showGstOnInvoice === true;
    const legalName = showGstInfo ? invoiceData.restaurantInfo?.legalBusinessName : null;
    const gstin = showGstInfo ? invoiceData.restaurantInfo?.gstin : null;
    const businessAddress = invoiceData.restaurantInfo?.address;

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
            .legal-name {
              font-size: 12px;
              color: #444;
              margin-bottom: 5px;
            }
            .gstin {
              font-size: 11px;
              color: #666;
              margin-bottom: 3px;
            }
            .business-address {
              font-size: 10px;
              color: #888;
              margin-bottom: 8px;
            }
            .invoice-info {
              font-size: 12px;
              color: #666;
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
              ${legalName ? `<div class="legal-name">${legalName}</div>` : ''}
              ${gstin ? `<div class="gstin">GSTIN: ${gstin}</div>` : ''}
              ${businessAddress ? `<div class="business-address">${businessAddress}</div>` : ''}
              <div class="invoice-info">
                Invoice #${invoiceData.orderNumber}<br>
                ${formatDate(invoiceData.timestamp)}
              </div>
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
              ${invoiceData.offerDiscount > 0 ? `
              <div class="total-row" style="color: #10b981;">
                <span>${invoiceData.offerName || 'Offer'} Discount</span>
                <span>-₹${invoiceData.offerDiscount.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.manualDiscount > 0 ? `
              <div class="total-row" style="color: #10b981;">
                <span>Manual Discount</span>
                <span>-₹${invoiceData.manualDiscount.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.loyaltyDiscount > 0 ? `
              <div class="total-row" style="color: #10b981;">
                <span>Loyalty Points Redeemed</span>
                <span>-₹${invoiceData.loyaltyDiscount.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.serviceChargeAmount > 0 ? `
              <div class="total-row" style="color: #7c3aed;">
                <span>Service Charge${invoiceData.serviceChargeRate ? ` (${invoiceData.serviceChargeRate}%)` : ''}</span>
                <span>₹${invoiceData.serviceChargeAmount.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.taxEnabled && invoiceData.tax > 0 ? `
              <div class="total-row">
                <span>${invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}</span>
                <span>₹${invoiceData.tax.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.tipAmount > 0 ? `
              <div class="total-row" style="color: #d97706;">
                <span>Tip</span>
                <span>₹${invoiceData.tipAmount.toFixed(2)}</span>
              </div>
              ` : ''}
              ${invoiceData.roundOffAmount != null && invoiceData.roundOffAmount !== 0 ? `
              <div class="total-row" style="color: #9ca3af;">
                <span>Round-off</span>
                <span>${invoiceData.roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(invoiceData.roundOffAmount).toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="total-row grand-total">
                <span>TOTAL</span>
                <span>₹${invoiceData.grandTotal.toFixed(2)}</span>
              </div>
              ${invoiceData.cashReceived > 0 ? `
              <div style="border-top: 1px dashed #ccc; margin-top: 8px; padding-top: 8px;">
                <div class="total-row">
                  <span>Cash Received</span>
                  <span>₹${invoiceData.cashReceived.toFixed(2)}</span>
                </div>
                ${invoiceData.changeReturned > 0 ? `
                <div class="total-row" style="color: #3b82f6;">
                  <span>Change</span>
                  <span>₹${invoiceData.changeReturned.toFixed(2)}</span>
                </div>
                ` : ''}
              </div>
              ` : ''}
              ${invoiceData.splitPayments && invoiceData.splitPayments.length > 0 ? `
              <div style="border-top: 1px dashed #ccc; margin-top: 8px; padding-top: 8px;">
                ${invoiceData.splitPayments.map(sp => `
                <div class="total-row">
                  <span>${(sp.method || sp.paymentMethod || '').toUpperCase()}</span>
                  <span>₹${(sp.amount || 0).toFixed(2)}</span>
                </div>
                `).join('')}
              </div>
              ` : ''}
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
                {invoiceData.restaurantInfo?.showGstOnInvoice === true && invoiceData.restaurantInfo?.legalBusinessName && (
                  <Text style={styles.legalName}>{invoiceData.restaurantInfo.legalBusinessName}</Text>
                )}
                {invoiceData.restaurantInfo?.showGstOnInvoice === true && invoiceData.restaurantInfo?.gstin && (
                  <Text style={styles.gstinText}>GSTIN: {invoiceData.restaurantInfo.gstin}</Text>
                )}
                {invoiceData.restaurantInfo?.address && (
                  <Text style={styles.businessAddress}>{invoiceData.restaurantInfo.address}</Text>
                )}
                <View style={styles.invoiceInfo}>
                  <Text style={styles.invoiceNumber}>Invoice #{invoiceData.orderNumber}</Text>
                  <Text style={styles.invoiceDate}>{formatDate(invoiceData.timestamp)}</Text>
                </View>
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
                {invoiceData.offerDiscount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#10b981' }]}>{invoiceData.offerName || 'Offer'} Discount</Text>
                    <Text style={[styles.totalValue, { color: '#10b981' }]}>-₹{invoiceData.offerDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.manualDiscount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#10b981' }]}>Manual Discount</Text>
                    <Text style={[styles.totalValue, { color: '#10b981' }]}>-₹{invoiceData.manualDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.loyaltyDiscount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#10b981' }]}>Loyalty Points</Text>
                    <Text style={[styles.totalValue, { color: '#10b981' }]}>-₹{invoiceData.loyaltyDiscount.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.serviceChargeAmount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#7c3aed' }]}>
                      Service Charge{invoiceData.serviceChargeRate ? ` (${invoiceData.serviceChargeRate}%)` : ''}
                    </Text>
                    <Text style={[styles.totalValue, { color: '#7c3aed' }]}>₹{invoiceData.serviceChargeAmount.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.taxEnabled && invoiceData.tax > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`}</Text>
                    <Text style={styles.totalValue}>₹{invoiceData.tax.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.tipAmount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#d97706' }]}>Tip</Text>
                    <Text style={[styles.totalValue, { color: '#d97706' }]}>₹{invoiceData.tipAmount.toFixed(2)}</Text>
                  </View>
                )}
                {invoiceData.roundOffAmount != null && invoiceData.roundOffAmount !== 0 && (
                  <View style={styles.totalRow}>
                    <Text style={[styles.totalLabel, { color: '#9ca3af' }]}>Round-off</Text>
                    <Text style={[styles.totalValue, { color: '#9ca3af' }]}>
                      {invoiceData.roundOffAmount > 0 ? '+' : '-'}₹{Math.abs(invoiceData.roundOffAmount).toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Grand Total */}
              <View style={styles.grandTotalSection}>
                <Text style={styles.grandTotalLabel}>TOTAL</Text>
                <Text style={styles.grandTotalValue}>₹{invoiceData.grandTotal.toFixed(2)}</Text>
              </View>

              {/* Payment Info */}
              {(invoiceData.paymentMethod || invoiceData.cashReceived || invoiceData.splitPayments) && (
                <View style={styles.paymentInfoSection}>
                  <View style={styles.dashedSeparator} />
                  <Text style={styles.paymentInfoTitle}>Payment</Text>
                  {invoiceData.splitPayments && invoiceData.splitPayments.length > 0 ? (
                    invoiceData.splitPayments.map((sp, i) => (
                      <View key={i} style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{(sp.method || sp.paymentMethod || '').toUpperCase()}</Text>
                        <Text style={styles.totalValue}>₹{(sp.amount || 0).toFixed(2)}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Method</Text>
                      <Text style={[styles.totalValue, { textTransform: 'uppercase' }]}>{invoiceData.paymentMethod}</Text>
                    </View>
                  )}
                  {invoiceData.cashReceived > 0 && (
                    <>
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Cash Received</Text>
                        <Text style={styles.totalValue}>₹{invoiceData.cashReceived.toFixed(2)}</Text>
                      </View>
                      {invoiceData.changeReturned > 0 && (
                        <View style={styles.totalRow}>
                          <Text style={[styles.totalLabel, { color: '#3b82f6' }]}>Change</Text>
                          <Text style={[styles.totalValue, { color: '#3b82f6' }]}>₹{invoiceData.changeReturned.toFixed(2)}</Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              )}

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
    marginBottom: 2,
  },
  legalName: {
    fontSize: 11,
    color: '#444',
    marginBottom: 2,
    textAlign: 'center',
  },
  gstinText: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  businessAddress: {
    fontSize: 9,
    color: '#888',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  invoiceInfo: {
    alignItems: 'center',
    marginTop: Spacing.xs,
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
  paymentInfoSection: {
    paddingTop: 2,
  },
  paymentInfoTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
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
