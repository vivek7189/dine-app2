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
import { useResponsive } from '../hooks/useResponsive';
import * as printerService from '../services/printerService';
import { getPrintStationConfig, printKOTsByStation } from '../services/multiPrinterService';
import { renderKOT } from '../utils/printTemplates/index';
import { getItemSubline } from '../utils/itemSubline';

export default function KOTModal({
  visible,
  onClose,
  orderData,
  onPrint,
  printSettings = {},
}) {
  const { modalWidth } = useResponsive();
  const [printing, setPrinting] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);

  if (!orderData) return null;

  const {
    orderNumber,
    orderId,
    tableNumber,
    roomNumber,
    items = [],
    removedItems = [],
    isIncremental = false,
    waiterName,
    waiterId,
    timestamp,
    restaurantName,
  } = orderData;

  // Categorize items for update display
  const hasChanges = isIncremental && (items.length > 0 || removedItems.length > 0);
  const newAndIncItems = hasChanges ? items.filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0)) : [];
  const reducedItems = hasChanges ? items.filter(i => i.isUpdated && i.quantityDelta < 0) : [];
  const unmarkedItems = hasChanges ? items.filter(i => !i.isNew && !i.isUpdated) : items;

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

  const { generateKOTText } = printerService;

  // Build kotData object for the template system
  const buildKotData = () => ({
    restaurantName: orderData.restaurantName || '',
    restaurantPhone: orderData.restaurantPhone || '',
    orderId: orderData.orderId,
    dailyOrderId: orderData.orderNumber || orderData.dailyOrderId || orderData.orderId,
    tableNumber: orderData.tableNumber || '',
    roomNumber: orderData.roomNumber || '',
    floorName: orderData.floorName || '',
    customerName: orderData.customerName || '',
    orderType: orderData.orderType || '',
    waiterName: orderData.waiterName || '',
    specialInstructions: orderData.specialInstructions || orderData.notes || '',
    items: orderData.items || [],
    removedItems: orderData.removedItems || [],
    isIncremental: orderData.isIncremental || false,
    currencySymbol: orderData.currencySymbol || '',
  });

  // Silent print via connected thermal printer (no dialog fallback)
  const handleSilentPrint = async () => {
    try {
      // Check if station-based printing is configured
      const restaurantId = orderData.restaurantId;
      if (restaurantId) {
        const { stations, mode, categories } = await getPrintStationConfig(restaurantId);
        if (stations.length > 1) {
          await printKOTsByStation(orderData, stations, categories, mode, printSettings);
          return;
        }
      }

      const kotText = generateKOTText(orderData);
      const kotHtml = renderKOT(buildKotData(), printSettings, {});
      const result = await printerService.printWithFeedback({ html: kotHtml, text: kotText, silentOnly: true, label: 'KOT' });
      if (!result.success) {
        console.warn('KOT auto-print failed:', result.error);
      }
    } catch (err) {
      console.error('KOT auto-print failed:', err);
    }
  };

  const handlePrint = async () => {
    if (onPrint) {
      onPrint(orderData);
      return;
    }

    setPrinting(true);
    try {
      // Check if station-based printing is configured
      const restaurantId = orderData.restaurantId;
      if (restaurantId) {
        const { stations, mode, categories } = await getPrintStationConfig(restaurantId);
        if (stations.length > 1) {
          const result = await printKOTsByStation(orderData, stations, categories, mode, printSettings);
          if (result.printed > 0) {
            setPrinting(false);
            return;
          }
        }
      }

      const kotText = generateKOTText(orderData);
      const kotHtml = renderKOT(buildKotData(), printSettings, {});
      await printerService.printContent({ html: kotHtml, text: kotText });
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Error', 'Failed to print. Check printer connection.');
    } finally {
      setPrinting(false);
    }
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

  // Generate KOT HTML using the template system
  const generateKOTHTML = (data) => {
    const kotData = {
      restaurantName: data.restaurantName || '',
      restaurantPhone: data.restaurantPhone || '',
      orderId: data.orderId,
      dailyOrderId: data.orderNumber || data.dailyOrderId || data.orderId,
      tableNumber: data.tableNumber || '',
      roomNumber: data.roomNumber || '',
      floorName: data.floorName || '',
      customerName: data.customerName || '',
      orderType: data.orderType || '',
      waiterName: data.waiterName || '',
      specialInstructions: data.specialInstructions || data.notes || '',
      items: data.items || [],
      removedItems: data.removedItems || [],
      isIncremental: data.isIncremental || false,
      currencySymbol: data.currencySymbol || '',
    };
    return renderKOT(kotData, printSettings, {});
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.modalContent, modalWidth(400)]}>
          {/* Header - Sleek and Compact */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.restaurantBadge}>
                <Ionicons name="restaurant" size={18} color="#fff" />
                <Text style={styles.restaurantName}>{restaurantName || 'RESTAURANT'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Order Info Section - Two Column Layout */}
            <View style={styles.orderInfoSection}>
              <View style={styles.orderInfoGrid}>
                <View style={styles.orderInfoColumn}>
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
                </View>

                <View style={styles.orderInfoColumn}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Date:</Text>
                    <Text style={styles.infoValue}>{formatDate(timestamp)}</Text>
                  </View>

                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Time:</Text>
                    <Text style={styles.infoValue}>{formatTime(timestamp)}</Text>
                  </View>

                  {waiterName && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Staff:</Text>
                      <Text style={styles.infoValue}>{waiterName}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Items Section */}
            <View style={styles.itemsSection}>
              <Text style={styles.sectionTitle}>{hasChanges ? 'KOT UPDATE' : 'ITEMS'}</Text>

              {hasChanges ? (
                <>
                  {/* Cancelled items */}
                  {removedItems.length > 0 && (
                    <>
                      <View style={{ backgroundColor: '#fee2e2', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626', textAlign: 'center' }}>CANCELLED</Text>
                      </View>
                      {removedItems.map((item, index) => (
                        <View key={`rem-${index}`} style={[styles.itemRow, { opacity: 0.6 }]}>
                          <View style={styles.itemLeft}>
                            <Text style={[styles.itemName, { textDecorationLine: 'line-through', color: '#ef4444' }]}>{item.name}</Text>
                            {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                          </View>
                          <View style={styles.itemRight}>
                            <View style={[styles.quantityBadge, { backgroundColor: '#fee2e2' }]}>
                              <Text style={[styles.quantityText, { color: '#ef4444' }]}>{item.quantity}x</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Reduced quantity items */}
                  {reducedItems.length > 0 && (
                    <>
                      <View style={{ backgroundColor: '#fef3c7', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginBottom: 4, marginTop: removedItems.length > 0 ? 8 : 0 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#d97706', textAlign: 'center' }}>REDUCED</Text>
                      </View>
                      {reducedItems.map((item, index) => (
                        <View key={`dec-${index}`} style={styles.itemRow}>
                          <View style={styles.itemLeft}>
                            <Text style={[styles.itemName, { color: '#d97706' }]}>{item.name}</Text>
                            {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                          </View>
                          <View style={styles.itemRight}>
                            <View style={[styles.quantityBadge, { backgroundColor: '#fef3c7' }]}>
                              <Text style={[styles.quantityText, { color: '#d97706' }]}>{Math.abs(item.quantityDelta)}x</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {/* New / increased items */}
                  {newAndIncItems.length > 0 && (
                    <>
                      <View style={{ backgroundColor: '#dcfce7', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, marginBottom: 4, marginTop: (removedItems.length > 0 || reducedItems.length > 0) ? 8 : 0 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a', textAlign: 'center' }}>NEW ITEMS</Text>
                      </View>
                      {newAndIncItems.map((item, index) => (
                        <View key={`new-${index}`} style={styles.itemRow}>
                          <View style={styles.itemLeft}>
                            <Text style={styles.itemName}>{item.name}</Text>
                            {getItemSubline(item) ? (
                              <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
                            ) : null}
                            {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                          </View>
                          <View style={styles.itemRight}>
                            <View style={[styles.quantityBadge, { backgroundColor: '#dcfce7' }]}>
                              <Text style={[styles.quantityText, { color: '#16a34a' }]}>{item.quantity}x</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Unmarked items (fallback) */}
                  {unmarkedItems.length > 0 && unmarkedItems.map((item, index) => (
                    <View key={`unk-${index}`} style={styles.itemRow}>
                      <View style={styles.itemLeft}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {getItemSubline(item) ? (
                          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
                        ) : null}
                        {item.notes ? <Text style={styles.itemNotes}>{item.notes}</Text> : null}
                      </View>
                      <View style={styles.itemRight}>
                        <View style={styles.quantityBadge}>
                          <Text style={styles.quantityText}>{item.quantity}x</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                // Normal order — all items flat
                items.map((item, index) => (
                  <View key={index} style={styles.itemRow}>
                    <View style={styles.itemLeft}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {getItemSubline(item) ? (
                        <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }} numberOfLines={1}>{getItemSubline(item)}</Text>
                      ) : null}
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
                ))
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Summary */}
            <View style={styles.summarySection}>
              <View style={styles.infoRow}>
                <Text style={styles.summaryLabel}>
                  {hasChanges ? 'Changes:' : 'Total Items:'}
                </Text>
                <Text style={styles.summaryValue}>
                  {hasChanges
                    ? `+${newAndIncItems.length} new, ${removedItems.length + reducedItems.length} removed`
                    : items.reduce((sum, item) => sum + (item.quantity || 1), 0)
                  }
                </Text>
              </View>
            </View>

            {/* Extra spacing before footer */}
            <View style={{ height: Spacing.xl }} />
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <View style={styles.actionButtonsRow}>
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
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.medium,
  },
  restaurantName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
    maxHeight: 500,
  },
  orderInfoSection: {
    marginBottom: Spacing.xs,
  },
  orderInfoGrid: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  orderInfoColumn: {
    flex: 1,
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
