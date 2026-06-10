import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import DeliveryOrderDetails from './DeliveryOrderDetails';
import { getCurrencySymbol } from '../../utils/formatCurrency';

/**
 * Active delivery view shown after accepting an order.
 * Shows order details, address, map link, and action buttons (Pick Up / Delivered).
 */
export default function DeliveryActiveView({ delivery, onPickedUp, onDelivered, loading }) {
  const [showDetails, setShowDetails] = useState(false);
  const {
    id,
    orderNumber,
    deliveryStatus,
    deliveryAddress,
    customerInfo,
    totalAmount,
    items,
  } = delivery;

  const addressText = typeof deliveryAddress === 'string'
    ? deliveryAddress
    : deliveryAddress?.street
      ? [deliveryAddress.street, deliveryAddress.city, deliveryAddress.zipcode].filter(Boolean).join(', ')
      : 'Address not provided';

  const openInMaps = () => {
    const query = encodeURIComponent(addressText);
    const url = Platform.OS === 'ios'
      ? `maps:?q=${query}`
      : `geo:0,0?q=${query}`;

    // Try Google Maps first, fall back to native
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    Linking.canOpenURL(googleMapsUrl).then((supported) => {
      if (supported) {
        Linking.openURL(googleMapsUrl);
      } else {
        Linking.openURL(url);
      }
    });
  };

  const handlePickedUp = () => {
    Alert.alert(
      'Confirm Pickup',
      'Have you picked up the order from the restaurant?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Picked Up', onPress: () => onPickedUp && onPickedUp(id) },
      ]
    );
  };

  const handleDelivered = () => {
    Alert.alert(
      'Mark as Delivered',
      'Has the order been delivered to the customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Delivered',
          onPress: () => onDelivered && onDelivered(id, { paymentCollected: true, paymentMethod: 'cash' }),
        },
      ]
    );
  };

  const statusSteps = [
    { key: 'accepted', label: 'Accepted', icon: 'checkmark-circle' },
    { key: 'picked_up', label: 'Picked Up', icon: 'bag-check' },
    { key: 'delivered', label: 'Delivered', icon: 'flag' },
  ];

  const currentStepIndex = statusSteps.findIndex(s => s.key === deliveryStatus);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Status Progress */}
      <View style={styles.progressContainer}>
        {statusSteps.map((step, idx) => {
          const isActive = idx <= currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          return (
            <View key={step.key} style={styles.stepRow}>
              <View style={[styles.stepDot, isActive && styles.stepDotActive, isCurrent && styles.stepDotCurrent]}>
                <Ionicons
                  name={step.icon}
                  size={16}
                  color={isActive ? '#fff' : '#d1d5db'}
                />
              </View>
              <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>
                {step.label}
              </Text>
              {idx < statusSteps.length - 1 && (
                <View style={[styles.stepLine, isActive && styles.stepLineActive]} />
              )}
            </View>
          );
        })}
      </View>

      {/* Order Header */}
      <View style={styles.section}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderNumber}>Order #{orderNumber}</Text>
          <Text style={styles.amount}>{getCurrencySymbol()}{Number(totalAmount || 0).toFixed(0)}</Text>
        </View>
        <Text style={styles.itemCount}>
          {items?.length || 0} item{(items?.length || 0) !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Delivery Address */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery Address</Text>
        <View style={styles.addressCard}>
          <Ionicons name="location" size={20} color="#ef4444" />
          <Text style={styles.addressText}>{addressText}</Text>
        </View>
        <TouchableOpacity style={styles.mapsBtn} onPress={openInMaps}>
          <Ionicons name="navigate" size={18} color="#3b82f6" />
          <Text style={styles.mapsBtnText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>

      {/* Customer Info */}
      {customerInfo?.name && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{customerInfo.name}</Text>
              {customerInfo.phone && (
                <Text style={styles.customerPhone}>{customerInfo.phone}</Text>
              )}
            </View>
            {customerInfo.phone && (
              <TouchableOpacity
                style={styles.callButton}
                onPress={() => Linking.openURL(`tel:${customerInfo.phone}`)}
              >
                <Ionicons name="call" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Order Items Toggle */}
      <TouchableOpacity
        style={styles.detailsToggle}
        onPress={() => setShowDetails(!showDetails)}
      >
        <Text style={styles.detailsToggleText}>
          {showDetails ? 'Hide' : 'View'} Order Items
        </Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#6b7280" />
      </TouchableOpacity>

      {showDetails && <DeliveryOrderDetails items={items} />}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {deliveryStatus === 'accepted' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.pickupBtn]}
            onPress={handlePickedUp}
            disabled={loading}
          >
            <Ionicons name="bag-check" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Mark as Picked Up</Text>
          </TouchableOpacity>
        )}

        {deliveryStatus === 'picked_up' && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.deliveredBtn]}
            onPress={handleDelivered}
            disabled={loading}
          >
            <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
            <Text style={styles.actionBtnText}>Mark as Delivered</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
  },
  stepRow: {
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: { backgroundColor: '#10b981' },
  stepDotCurrent: { backgroundColor: '#3b82f6' },
  stepLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  stepLabelActive: { color: '#1f2937', fontWeight: '600' },
  stepLine: {
    position: 'absolute',
    top: 18,
    right: -20,
    width: 40,
    height: 2,
    backgroundColor: '#e5e7eb',
  },
  stepLineActive: { backgroundColor: '#10b981' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: { fontSize: 20, fontWeight: '700', color: '#1f2937' },
  amount: { fontSize: 20, fontWeight: '700', color: '#10b981' },
  itemCount: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  addressText: { fontSize: 15, color: '#1f2937', flex: 1, lineHeight: 22 },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  mapsBtnText: { color: '#3b82f6', fontWeight: '600', fontSize: 14 },
  customerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  customerPhone: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  detailsToggleText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  actions: { marginTop: 16 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
  },
  pickupBtn: { backgroundColor: '#8b5cf6' },
  deliveredBtn: { backgroundColor: '#10b981' },
  actionBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
