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
import { Spacing, BorderRadius } from '../constants/Theme';
import { useResponsive } from '../hooks/useResponsive';
import * as printerService from '../services/printerService';
import apiClient from '../services/api';
import { getPrintStationConfig, printKOTsByStation } from '../services/multiPrinterService';
import { renderKOT } from '../utils/printTemplates/index';
import { getItemSubline } from '../utils/itemSubline';
import { seatLetter } from '../utils/seatOrdering';

// ─── Theme ───
const PRIMARY = '#c0392b';
const PRIMARY_DARK = '#922b21';
const PRIMARY_BG = '#fdedec';
const DARK = '#1a1a2e';
const DARK_SEC = '#2d2d44';

export default function KOTModal({
  visible,
  onClose,
  orderData,
  onPrint,
  printSettings = {},
  userRole,
}) {
  const { modalWidth } = useResponsive();
  const [printing, setPrinting] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);

  if (!orderData) return null;

  const {
    orderNumber,
    orderId,
    dailyOrderId,
    tableNumber,
    roomNumber,
    items = [],
    removedItems = [],
    isIncremental = false,
    waiterName,
    waiterId,
    timestamp,
    restaurantName,
    orderType,
    floorName,
    customerName,
    specialInstructions,
    notes,
  } = orderData;

  const isWaiter = userRole?.toLowerCase() === 'waiter';

  // Categorize items for update display
  const hasChanges = isIncremental && (items.length > 0 || removedItems.length > 0);
  const newItems = hasChanges ? items.filter(i => i.isNew) : [];
  const increasedItems = hasChanges ? items.filter(i => i.isUpdated && i.quantityDelta > 0) : [];
  const reducedItems = hasChanges ? items.filter(i => i.isUpdated && i.quantityDelta < 0) : [];
  const unchangedItems = hasChanges ? items.filter(i => !i.isNew && !i.isUpdated) : items;

  const totalQty = items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const displayOrderNum = orderNumber || dailyOrderId || 'N/A';
  const locationLabel = roomNumber ? `Room ${roomNumber}` : tableNumber ? `Table ${tableNumber}` : null;

  const changeCount = newItems.length + increasedItems.length + reducedItems.length + removedItems.length;

  const formatTime = (date) => {
    if (!date) return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const { generateKOTText } = printerService;

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

  const handleSilentPrint = async () => {
    try {
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
      const remotePrint = await printerService.getRemotePrintEnabled();
      if (remotePrint) {
        const remoteOrderId = orderData.orderId || orderData.id;
        if (!remoteOrderId) throw new Error('Order ID is missing; cannot queue desktop reprint.');
        await apiClient.triggerPrint(remoteOrderId, 'kot');
        Alert.alert('Sent to Desktop Print', 'KOT queued for the desktop printer.');
        return;
      }

      const restaurantId = orderData.restaurantId;
      if (restaurantId) {
        const { stations, mode, categories } = await getPrintStationConfig(restaurantId);
        if (stations.length > 1) {
          const result = await printKOTsByStation(orderData, stations, categories, mode, printSettings);
          if (result.printed > 0) {
            Alert.alert('Sent to printer', `${result.printed} KOT print job${result.printed === 1 ? '' : 's'} sent.`);
            return;
          }
        }
      }
      const kotText = generateKOTText(orderData);
      const kotHtml = renderKOT(buildKotData(), printSettings, {});
      const result = await printerService.printWithFeedback({
        html: kotHtml,
        text: kotText,
        silentOnly: false,
        label: 'KOT reprint',
      });
      if (!result.success) throw new Error(result.error || 'KOT could not be printed.');
      Alert.alert('Sent to printer', 'KOT was sent to the configured printer.');
    } catch (error) {
      console.error('Print error:', error);
      Alert.alert('Print failed', error?.message || 'Failed to print. Check printer connection.');
    } finally {
      setPrinting(false);
    }
  };

  const handleWhatsAppShare = async () => {
    setSharingWhatsApp(true);
    try {
      const kotText = generateKOTText(orderData);
      const whatsappMessage = `*KITCHEN ORDER TICKET*\n\n${kotText}`;
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(whatsappMessage)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        try {
          await Linking.openURL(whatsappUrl);
        } catch (error) {
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

  const renderItemRow = (item, index, opts = {}) => {
    const { tagColor, tagBg, tagText, strikethrough, showDelta } = opts;
    const subline = getItemSubline(item);
    const qty = showDelta ? Math.abs(item.quantityDelta || item.quantity) : (item.quantity || 1);

    return (
      <View key={index} style={[st.itemRow, strikethrough && { opacity: 0.7 }]}>
        <View style={[st.itemQtyBadge, tagBg && { backgroundColor: tagBg }]}>
          <Text style={[st.itemQtyText, tagColor && { color: tagColor }]}>{qty}x</Text>
        </View>
        <View style={st.itemInfo}>
          <View style={st.itemNameRow}>
            <Text
              style={[st.itemName, strikethrough && { textDecorationLine: 'line-through', color: '#94a3b8' }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            {item.seat != null && (
              <View style={st.seatBadge}>
                <Text style={st.seatBadgeText}>{seatLetter(item.seat)}</Text>
              </View>
            )}
          </View>
          {subline ? <Text style={st.itemSub} numberOfLines={1}>{subline}</Text> : null}
          {item.notes ? (
            <View style={st.itemNoteRow}>
              <Ionicons name="chatbubble-outline" size={10} color="#f59e0b" />
              <Text style={st.itemNotes}>{item.notes}</Text>
            </View>
          ) : null}
        </View>
        {tagText && (
          <View style={[st.itemTag, { backgroundColor: tagBg || '#f3f4f6' }]}>
            <Text style={[st.itemTagText, { color: tagColor || '#6b7280' }]}>{tagText}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderChangeSection = (label, icon, items, color, bgColor, opts = {}) => {
    if (!items || items.length === 0) return null;
    return (
      <View style={st.changeSection}>
        <View style={[st.changeLabelRow, { borderLeftColor: color }]}>
          <Ionicons name={icon} size={14} color={color} />
          <Text style={[st.changeLabelText, { color }]}>{label}</Text>
          <View style={[st.changeCount, { backgroundColor: bgColor }]}>
            <Text style={[st.changeCountText, { color }]}>{items.length}</Text>
          </View>
        </View>
        {items.map((item, idx) => renderItemRow(item, `${label}-${idx}`, {
          tagColor: color, tagBg: bgColor, tagText: opts.tagText, strikethrough: opts.strikethrough, showDelta: opts.showDelta,
        }))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={st.overlay}>
        <View style={[st.modal, modalWidth(420)]}>
          {/* ─── Header ─── */}
          <View style={st.header}>
            <View style={st.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={st.headerLabel}>
                  {hasChanges ? 'ORDER UPDATE' : 'KITCHEN ORDER'}
                </Text>
                <View style={st.orderNumRow}>
                  <Text style={st.orderNum}>#{displayOrderNum}</Text>
                  {hasChanges && (
                    <View style={st.updateBadge}>
                      <Ionicons name="sync" size={10} color="#fff" />
                      <Text style={st.updateBadgeText}>UPDATED</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={st.closeBtn}>
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>

            {/* Info pills */}
            <View style={st.pillRow}>
              {locationLabel && (
                <View style={st.pill}>
                  <Ionicons name={roomNumber ? 'bed-outline' : 'grid-outline'} size={12} color="#fff" />
                  <Text style={st.pillText}>{locationLabel}</Text>
                </View>
              )}
              {floorName ? (
                <View style={st.pill}>
                  <Ionicons name="layers-outline" size={12} color="#fff" />
                  <Text style={st.pillText}>{floorName}</Text>
                </View>
              ) : null}
              <View style={st.pill}>
                <Ionicons name="time-outline" size={12} color="#fff" />
                <Text style={st.pillText}>{formatTime(timestamp)}</Text>
              </View>
              {waiterName ? (
                <View style={st.pill}>
                  <Ionicons name="person-outline" size={12} color="#fff" />
                  <Text style={st.pillText}>{waiterName}</Text>
                </View>
              ) : null}
              {orderType && orderType.toLowerCase() !== 'dine-in' ? (
                <View style={[st.pill, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Ionicons name={orderType === 'delivery' ? 'bicycle-outline' : 'bag-handle-outline'} size={12} color="#fff" />
                  <Text style={st.pillText}>{orderType === 'delivery' ? 'Delivery' : 'Pickup'}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* ─── Items ─── */}
          <ScrollView style={st.content} showsVerticalScrollIndicator={false}>
            {hasChanges ? (
              <>
                {/* New items added */}
                {renderChangeSection('New Items', 'add-circle', newItems, '#16a34a', '#f0fdf4', { tagText: 'NEW' })}

                {/* Quantity increased */}
                {renderChangeSection('Qty Increased', 'arrow-up-circle', increasedItems, '#2563eb', '#eff6ff', { tagText: '+QTY', showDelta: true })}

                {/* Quantity reduced */}
                {renderChangeSection('Qty Reduced', 'arrow-down-circle', reducedItems, '#d97706', '#fffbeb', { tagText: '-QTY', showDelta: true })}

                {/* Cancelled items */}
                {renderChangeSection('Cancelled', 'close-circle', removedItems, '#dc2626', '#fef2f2', { tagText: 'CANCEL', strikethrough: true })}

                {/* Unchanged items */}
                {unchangedItems.length > 0 && (
                  <View style={st.unchangedSection}>
                    <Text style={st.unchangedLabel}>Unchanged Items</Text>
                    {unchangedItems.map((item, idx) => renderItemRow(item, `unch-${idx}`))}
                  </View>
                )}
              </>
            ) : (
              items.map((item, idx) => renderItemRow(item, idx))
            )}

            {/* Special instructions */}
            {(specialInstructions || notes) ? (
              <View style={st.notesBox}>
                <Ionicons name="chatbubble-ellipses" size={14} color="#f59e0b" />
                <Text style={st.notesText}>{specialInstructions || notes}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* ─── Summary ─── */}
          <View style={st.summaryBar}>
            <View style={st.summaryChip}>
              <Text style={st.summaryChipNum}>{totalQty}</Text>
              <Text style={st.summaryChipLabel}>items</Text>
            </View>
            {hasChanges && (
              <>
                {(newItems.length + increasedItems.length) > 0 && (
                  <View style={[st.summaryChip, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[st.summaryChipNum, { color: '#16a34a' }]}>+{newItems.length + increasedItems.length}</Text>
                    <Text style={[st.summaryChipLabel, { color: '#16a34a' }]}>added</Text>
                  </View>
                )}
                {(removedItems.length + reducedItems.length) > 0 && (
                  <View style={[st.summaryChip, { backgroundColor: '#fef2f2' }]}>
                    <Text style={[st.summaryChipNum, { color: '#dc2626' }]}>-{removedItems.length + reducedItems.length}</Text>
                    <Text style={[st.summaryChipLabel, { color: '#dc2626' }]}>removed</Text>
                  </View>
                )}
              </>
            )}
            {restaurantName ? (
              <>
                <View style={{ flex: 1 }} />
                <Text style={st.restaurantName} numberOfLines={1}>{restaurantName}</Text>
              </>
            ) : null}
          </View>

          {/* ─── Footer ─── */}
          <View style={st.footer}>
            {!isWaiter && (
              <TouchableOpacity
                style={[st.whatsappBtn, sharingWhatsApp && { opacity: 0.6 }]}
                onPress={handleWhatsAppShare}
                disabled={sharingWhatsApp}
              >
                {sharingWhatsApp ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[st.printBtn, printing && { opacity: 0.6 }]}
              onPress={handlePrint}
              disabled={printing}
            >
              {printing ? (
                <ActivityIndicator size="small" color={PRIMARY} />
              ) : (
                <Ionicons name="print-outline" size={18} color={PRIMARY} />
              )}
            </TouchableOpacity>
            <TouchableOpacity style={st.doneBtn} onPress={onClose} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={st.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 28,
    elevation: 16,
    overflow: 'hidden',
  },

  // ─── Header ───
  header: {
    backgroundColor: PRIMARY,
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  orderNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderNum: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  updateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  updateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },

  // ─── Pills ───
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // ─── Content ───
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    maxHeight: 360,
  },

  // ─── Change sections ───
  changeSection: {
    marginBottom: 16,
  },
  changeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderLeftWidth: 3,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  changeLabelText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  changeCount: {
    width: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  changeCountText: {
    fontSize: 11, fontWeight: '800',
  },
  unchangedSection: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  unchangedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  // ─── Item rows ───
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f7',
  },
  itemQtyBadge: {
    backgroundColor: '#f5f5f7',
    minWidth: 36,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  itemQtyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#374151',
  },
  itemInfo: {
    flex: 1,
    paddingTop: 2,
  },
  itemNameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a2e',
    lineHeight: 20,
    flexShrink: 1,
  },
  seatBadge: {
    backgroundColor: PRIMARY_BG,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  seatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: PRIMARY_DARK,
  },
  itemSub: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  itemNoteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 3,
  },
  itemNotes: {
    fontSize: 11,
    color: '#d97706',
    fontStyle: 'italic',
  },
  itemTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  itemTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ─── Notes ───
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  notesText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },

  // ─── Summary ───
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fafafa',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f2',
  },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  summaryChipNum: {
    fontSize: 14, fontWeight: '800', color: '#374151',
  },
  summaryChipLabel: {
    fontSize: 11, fontWeight: '600', color: '#6b7280',
  },
  restaurantName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9ca3af',
    maxWidth: 130,
  },

  // ─── Footer ───
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f2',
  },
  whatsappBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#25D366',
    justifyContent: 'center', alignItems: 'center',
  },
  printBtn: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: PRIMARY_BG,
    justifyContent: 'center', alignItems: 'center',
  },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
