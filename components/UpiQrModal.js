import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function UpiQrModal({
  visible,
  onClose,
  onConfirmPayment,
  amount = 0,
  restaurantName = '',
  upiId = '',
  upiQrCodeUrl = '',
  upiDisplayName = '',
  currencySymbol = '₹',
}) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const displayName = upiDisplayName || restaurantName || 'Restaurant';
  const fmt = (v) => `${currencySymbol}${Math.abs(v).toFixed(2)}`;

  const handleCopy = async () => {
    if (upiId) {
      await Clipboard.setStringAsync(upiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirmPayment?.();
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    if (confirming) return;
    setCopied(false);
    setConfirming(false);
    onClose?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="phone-portrait-outline" size={20} color="#6366f1" />
              </View>
              <View>
                <Text style={styles.headerTitle}>UPI Payment</Text>
                <Text style={styles.headerSub}>Ask customer to scan & pay</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={confirming} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Amount */}
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Amount to Pay</Text>
            <Text style={styles.amountValue}>{fmt(amount)}</Text>
            <Text style={styles.amountTo}>to {displayName}</Text>
          </View>

          {/* QR Code */}
          {upiQrCodeUrl ? (
            <View style={styles.qrSection}>
              <View style={styles.qrLabelRow}>
                <Ionicons name="qr-code-outline" size={16} color="#6366f1" />
                <Text style={styles.qrLabel}>Scan QR Code to Pay</Text>
              </View>
              <View style={styles.qrFrame}>
                <Image source={{ uri: upiQrCodeUrl }} style={styles.qrImage} resizeMode="contain" />
              </View>
              <Text style={styles.qrHint}>Open any UPI app and scan this code</Text>
            </View>
          ) : null}

          {/* UPI ID */}
          {upiId ? (
            <View style={styles.upiIdSection}>
              <Text style={styles.upiIdLabel}>{upiQrCodeUrl ? 'Or pay to UPI ID:' : 'Pay to UPI ID:'}</Text>
              <View style={styles.upiIdRow}>
                <Text style={styles.upiIdText} numberOfLines={1}>{upiId}</Text>
                <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                  <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? '#16a34a' : '#6366f1'} />
                  <Text style={[styles.copyText, copied && { color: '#16a34a' }]}>
                    {copied ? 'Copied' : 'Copy'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleClose}
              disabled={confirming}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, confirming && { opacity: 0.7 }]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.8}
            >
              {confirming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={styles.confirmText}>Payment Received</Text>
                </>
              )}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  headerSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  amountSection: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  amountLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  amountValue: {
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  amountTo: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  qrSection: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  qrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  qrLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  qrFrame: {
    padding: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 10,
  },
  upiIdSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  upiIdLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  upiIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  upiIdText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  copyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6366f1',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: 'row',
    paddingVertical: 14,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
