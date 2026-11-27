// "Scan to pay" after a bill is completed — the restaurant's UPI QR + ID to show the guest
// (utils/posUpiAfterBill.js). View only: nothing about the bill changes; staff tap Close.
import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image } from 'react-native';
import { formatCurrency } from '../utils/formatCurrency';

export default function UpiAfterBillModal({ upi, onClose }) {
  if (!upi) return null;
  const amount = Number(upi.amount) || 0;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} testID="pos-upi-after-bill">
          <Text style={styles.done}>BILL COMPLETED</Text>
          <Text style={styles.title}>{amount > 0 ? `Scan to pay ${formatCurrency(amount)}` : 'Scan to pay'}</Text>
          {upi.name ? <Text style={styles.name}>{upi.name}</Text> : null}
          {upi.qrUrl ? <Image source={{ uri: upi.qrUrl }} style={styles.qr} resizeMode="contain" /> : null}
          {upi.upiId ? (
            <Text style={styles.idLabel}>UPI ID: <Text style={styles.id}>{upi.upiId}</Text></Text>
          ) : null}
          <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 18, width: '100%', maxWidth: 400, padding: 20, alignItems: 'center' },
  done: { fontSize: 12, fontWeight: '700', color: '#059669', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4, textAlign: 'center' },
  name: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  qr: { width: 260, height: 260, marginTop: 14 },
  idLabel: { fontSize: 13, color: '#6b7280', marginTop: 12, textAlign: 'center' },
  id: { fontSize: 16, fontWeight: '700', color: '#111827' },
  close: { marginTop: 16, alignSelf: 'stretch', backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
