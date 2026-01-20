import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Share,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
// Note: For direct thermal printer support, install:
// npm install react-native-thermal-receipt-printer
// This component uses Share API as a fallback which works with most printer apps

export default function KOTModal({
  visible,
  onClose,
  orderData,
  onPrint,
}) {
  const [printing, setPrinting] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [showFullInstructions, setShowFullInstructions] = useState(false);

  if (!orderData) return null;

  const {
    orderNumber,
    orderId,
    tableNumber,
    roomNumber,
    items = [],
    waiterName,
    waiterId,
    timestamp,
    restaurantName,
  } = orderData;

  const formatTime = (date) => {
    if (!date) return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    if (!date) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const handlePrint = async () => {
    if (onPrint) {
      onPrint(orderData);
      return;
    }

    // For thermal printer support, you can integrate libraries like:
    // - react-native-thermal-receipt-printer (for ESC/POS printers)
    // - react-native-bluetooth-escpos-printer (for Bluetooth printers)
    // - expo-print (for general printing via system print dialog)
    
    setPrinting(true);
    try {
      // Generate KOT text for printing
      const kotText = generateKOTText(orderData);
      
      // Use Share API to share KOT text to printer apps
      // This works with most thermal printer apps on Android and iOS
      try {
        const result = await Share.share({
          message: kotText,
          title: 'KOT - Kitchen Order Ticket',
        });
        
        if (result.action === Share.sharedAction) {
          Alert.alert('Success', 'KOT shared. Select your thermal printer app to print.');
        }
      } catch (shareError) {
        // If share fails, show the KOT text for manual printing
        Alert.alert(
          'KOT Text',
          kotText,
          [
            { text: 'OK', onPress: () => {
              // User can manually copy and paste to printer app
            }},
          ],
          { userInterfaceStyle: 'light' }
        );
      }
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Error', 'Failed to print. Please check printer connection.');
    } finally {
      setPrinting(false);
    }
  };

  // Generate plain text KOT for thermal printers (ESC/POS format)
  // Best practices for thermal printing:
  // - Use monospace font (Courier)
  // - Keep line width to 32-48 characters (80mm paper)
  // - Use simple ASCII characters
  // - Avoid special formatting that may not print
  // - Use dashes and equals for separators
  const generateKOTText = (data) => {
    const location = data.roomNumber ? `Room: ${data.roomNumber}` : `Table: ${data.tableNumber || 'N/A'}`;
    const itemsText = data.items.map(item => {
      const itemLine = `${item.quantity}x ${item.name}`;
      const notesLine = item.notes ? `  Note: ${item.notes}` : '';
      return notesLine ? `${itemLine}\n${notesLine}` : itemLine;
    }).join('\n');
    
    // ESC/POS format for thermal printers (80mm width = 48 chars)
    const width = 48;
    const centerText = (text, w = width) => {
      const padding = Math.max(0, Math.floor((w - text.length) / 2));
      return ' '.repeat(padding) + text;
    };
    
    return `
${'='.repeat(width)}
${centerText((data.restaurantName || 'RESTAURANT').toUpperCase())}
${centerText('KITCHEN ORDER TICKET')}
${'='.repeat(width)}
Order #: ${data.orderNumber || data.orderId?.slice(-6) || 'N/A'}
${location}
Time: ${formatTime(data.timestamp)}
Date: ${formatDate(data.timestamp)}
${data.waiterName ? `Waiter: ${data.waiterName}` : ''}
${'-'.repeat(width)}
${itemsText}
${'-'.repeat(width)}
Total Items: ${data.items.reduce((sum, item) => sum + (item.quantity || 1), 0)}
${'='.repeat(width)}
${centerText('Thank you!')}
${centerText(new Date().toLocaleString('en-IN'))}
${'='.repeat(width)}
    `.trim();
  };

  const handleWhatsAppShare = async () => {
    setSharingWhatsApp(true);
    try {
      const kotText = generateKOTText(orderData);
      const whatsappMessage = `*KITCHEN ORDER TICKET*\n\n${kotText}`;
      
      // WhatsApp URL format: whatsapp://send?text=message
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(whatsappMessage)}`;
      
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback: Try to open WhatsApp Business or regular WhatsApp
        const whatsappBusinessUrl = `whatsapp://send?text=${encodeURIComponent(whatsappMessage)}`;
        try {
          await Linking.openURL(whatsappBusinessUrl);
        } catch (error) {
          // If WhatsApp is not installed, use Share API
          await Share.share({
            message: whatsappMessage,
            title: 'KOT - Kitchen Order Ticket',
          });
        }
      }
    } catch (error) {
      console.error('WhatsApp share error:', error);
      Alert.alert('Error', 'Could not open WhatsApp. Please share manually.');
    } finally {
      setSharingWhatsApp(false);
    }
  };

  const generateKOTHTML = (data) => {
    const location = data.roomNumber ? `Room: ${data.roomNumber}` : `Table: ${data.tableNumber || 'N/A'}`;
    const itemsHTML = data.items.map(item => `
      <tr>
        <td style="padding: 4px 0; border-bottom: 1px dashed #ddd;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px;">${item.name}</div>
              ${item.notes ? `<div style="font-size: 11px; color: #666; font-style: italic;">${item.notes}</div>` : ''}
            </div>
            <div style="text-align: right; margin-left: 10px;">
              <div style="font-weight: bold; font-size: 16px;">${item.quantity}x</div>
            </div>
          </div>
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            @media print {
              @page { margin: 0; size: 80mm auto; }
              body { margin: 0; padding: 0; }
            }
            body {
              font-family: 'Courier New', monospace;
              width: 80mm;
              margin: 0;
              padding: 8px;
              font-size: 12px;
              line-height: 1.4;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 8px;
              margin-bottom: 8px;
            }
            .restaurant-name {
              font-size: 16px;
              font-weight: bold;
              margin-bottom: 4px;
            }
            .kot-label {
              font-size: 14px;
              font-weight: bold;
              margin-top: 4px;
            }
            .order-info {
              margin: 8px 0;
              line-height: 1.6;
            }
            .order-info-row {
              display: flex;
              justify-content: space-between;
              margin: 3px 0;
            }
            .items-table {
              width: 100%;
              margin: 8px 0;
            }
            .footer {
              margin-top: 12px;
              padding-top: 8px;
              border-top: 2px dashed #000;
              text-align: center;
              font-size: 11px;
            }
            .divider {
              border-top: 1px dashed #000;
              margin: 8px 0;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="restaurant-name">${data.restaurantName || 'RESTAURANT'}</div>
            <div class="kot-label">KITCHEN ORDER TICKET</div>
          </div>
          
          <div class="order-info">
            <div class="order-info-row">
              <span><strong>Order #:</strong> ${data.orderNumber || data.orderId?.slice(-6) || 'N/A'}</span>
            </div>
            <div class="order-info-row">
              <span><strong>${location}</strong></span>
            </div>
            <div class="order-info-row">
              <span><strong>Time:</strong> ${formatTime(data.timestamp)}</span>
              <span><strong>Date:</strong> ${formatDate(data.timestamp)}</span>
            </div>
            ${data.waiterName ? `
            <div class="order-info-row">
              <span><strong>Waiter:</strong> ${data.waiterName}</span>
            </div>
            ` : ''}
          </div>

          <div class="divider"></div>

          <table class="items-table">
            ${itemsHTML}
          </table>

          <div class="divider"></div>

          <div class="order-info">
            <div class="order-info-row">
              <span><strong>Total Items:</strong> ${data.items.reduce((sum, item) => sum + (item.quantity || 1), 0)}</span>
            </div>
          </div>

          <div class="footer">
            <div>Thank you!</div>
            <div style="margin-top: 4px;">${new Date().toLocaleString('en-IN')}</div>
          </div>
        </body>
      </html>
    `;
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.headerTop}>
                <View style={styles.restaurantBadge}>
                  <Ionicons name="restaurant" size={20} color="#fff" />
                  <Text style={styles.restaurantName}>{restaurantName || 'RESTAURANT'}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={Colors.textDark} />
                </TouchableOpacity>
              </View>
              <View style={styles.kotLabel}>
                <Ionicons name="receipt" size={18} color={Colors.primary} />
                <Text style={styles.kotLabelText}>KITCHEN ORDER TICKET</Text>
              </View>
            </View>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Order Info Section */}
            <View style={styles.orderInfoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Order #:</Text>
                <Text style={styles.infoValue}>{orderNumber || orderId?.slice(-6) || 'N/A'}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>
                  {roomNumber ? 'Room:' : 'Table:'}
                </Text>
                <Text style={styles.infoValueBold}>
                  {roomNumber || tableNumber || 'N/A'}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Time:</Text>
                <Text style={styles.infoValue}>{formatTime(timestamp)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date:</Text>
                <Text style={styles.infoValue}>{formatDate(timestamp)}</Text>
              </View>

              {waiterName && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Waiter:</Text>
                  <Text style={styles.infoValue}>{waiterName}</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Items Section */}
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>ITEMS</Text>
              {items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    {item.notes && (
                      <Text style={styles.itemNotes}>{item.notes}</Text>
                    )}
                  </View>
                  <View style={styles.itemRight}>
                    <View style={styles.quantityBadge}>
                      <Text style={styles.quantityText}>{item.quantity}x</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Summary */}
            <View style={styles.summarySection}>
              <View style={styles.infoRow}>
                <Text style={styles.summaryLabel}>Total Items:</Text>
                <Text style={styles.summaryValue}>
                  {items.reduce((sum, item) => sum + (item.quantity || 1), 0)}
                </Text>
              </View>
            </View>

            {/* Print Instructions Section */}
            <View style={styles.instructionsSection}>
              <View style={styles.instructionsHeader}>
                <Ionicons name="print-outline" size={18} color={Colors.primary} />
                <Text style={styles.instructionsTitle}>How to Print</Text>
              </View>
              
              <View style={styles.instructionsContent}>
                <Text style={styles.instructionText}>
                  <Text style={styles.instructionBold}>WiFi Thermal Printers:</Text> Connect your phone and printer to the same WiFi network. Use the Print button and select your printer app.
                </Text>
                
                {showFullInstructions ? (
                  <>
                    <Text style={styles.instructionText}>
                      <Text style={styles.instructionBold}>Bluetooth Printers:</Text> Pair your printer via Bluetooth settings, then use the Print button to select your printer.
                    </Text>
                    <Text style={styles.instructionText}>
                      <Text style={styles.instructionBold}>USB/OTG Printers:</Text> Connect printer via USB cable or OTG adapter. Install a printer app that supports USB printing.
                    </Text>
                    <Text style={styles.instructionText}>
                      <Text style={styles.instructionBold}>Cloud Printers:</Text> Ensure your printer is connected to the internet. Use the printer's mobile app to print.
                    </Text>
                    <Text style={styles.instructionText}>
                      <Text style={styles.instructionBold}>Recommended Apps:</Text> Star Print, ESC/POS Print, PrintNode, or your printer's official app.
                    </Text>
                    <Text style={styles.instructionText}>
                      <Text style={styles.instructionBold}>Note:</Text> This KOT is formatted for 80mm thermal paper. Ensure your printer supports ESC/POS commands for best results.
                    </Text>
                    <TouchableOpacity
                      onPress={() => setShowFullInstructions(false)}
                      style={styles.readMoreButton}
                    >
                      <Text style={styles.readMoreText}>Show Less</Text>
                      <Ionicons name="chevron-up" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowFullInstructions(true)}
                    style={styles.readMoreButton}
                  >
                    <Text style={styles.readMoreText}>Read More</Text>
                    <Ionicons name="chevron-down" size={16} color={Colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.printButton, printing && styles.printButtonDisabled]}
                onPress={handlePrint}
                disabled={printing}
              >
                {printing ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.printButtonText}>Printing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="print" size={20} color="#fff" />
                    <Text style={styles.printButtonText}>Print KOT</Text>
                  </>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.whatsappButton, sharingWhatsApp && styles.printButtonDisabled]}
                onPress={handleWhatsAppShare}
                disabled={sharingWhatsApp}
              >
                {sharingWhatsApp ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.whatsappButtonText}>Sharing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={styles.whatsappButtonText}>Share</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={styles.closeButtonFooter}
              onPress={onClose}
            >
              <Text style={styles.closeButtonText}>Close</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    backgroundColor: Colors.primary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  headerContent: {
    gap: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  restaurantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.medium,
  },
  restaurantName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  kotLabelText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  content: {
    padding: Spacing.lg,
    maxHeight: 500,
  },
  orderInfoSection: {
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 13,
    color: Colors.textDark,
    fontWeight: '600',
  },
  infoValueBold: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  itemsSection: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  itemNotes: {
    fontSize: 11,
    color: Colors.textMedium,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  quantityBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.medium,
    minWidth: 50,
    alignItems: 'center',
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  summarySection: {
    marginTop: Spacing.xs,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
  },
  instructionsSection: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  instructionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textDark,
  },
  instructionsContent: {
    gap: Spacing.xs,
  },
  instructionText: {
    fontSize: 11,
    color: Colors.textMedium,
    lineHeight: 16,
  },
  instructionBold: {
    fontWeight: '700',
    color: Colors.textDark,
  },
  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  readMoreText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.backgroundLight,
    gap: Spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  printButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.sm,
  },
  printButtonDisabled: {
    opacity: 0.6,
  },
  printButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  whatsappButton: {
    flex: 0.4,
    backgroundColor: '#25D366',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: Spacing.xs,
  },
  whatsappButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  closeButtonFooter: {
    padding: Spacing.sm,
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.textMedium,
    fontSize: 14,
    fontWeight: '600',
  },
});
