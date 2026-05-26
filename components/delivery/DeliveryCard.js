import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Card showing a delivery assignment with order details and accept/reject buttons.
 */
export default function DeliveryCard({ delivery, onAccept, onReject, showActions = true }) {
  const {
    id,
    orderNumber,
    deliveryStatus,
    deliveryAddress,
    customerInfo,
    totalAmount,
    items,
    createdAt,
    deliveryAssignedAt,
  } = delivery;

  const itemCount = items?.length || 0;
  const addressText = typeof deliveryAddress === 'string'
    ? deliveryAddress
    : deliveryAddress?.street
      ? `${deliveryAddress.street}, ${deliveryAddress.city || ''}`
      : 'Address not provided';

  const statusColors = {
    assigned: '#f59e0b',
    accepted: '#3b82f6',
    picked_up: '#8b5cf6',
    on_the_way: '#6366f1',
    delivered: '#10b981',
    rejected: '#ef4444',
  };

  const statusLabels = {
    assigned: 'Waiting for Accept',
    accepted: 'Accepted',
    picked_up: 'Picked Up',
    on_the_way: 'On the Way',
    delivered: 'Delivered',
    rejected: 'Rejected',
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.orderInfo}>
          <Text style={styles.orderNumber}>Order #{orderNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColors[deliveryStatus] + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColors[deliveryStatus] }]} />
            <Text style={[styles.statusText, { color: statusColors[deliveryStatus] }]}>
              {statusLabels[deliveryStatus] || deliveryStatus}
            </Text>
          </View>
        </View>
        <Text style={styles.amount}>
          {totalAmount ? `₹${Number(totalAmount).toFixed(0)}` : ''}
        </Text>
      </View>

      {/* Customer */}
      {customerInfo?.name && (
        <View style={styles.row}>
          <Ionicons name="person-outline" size={16} color="#6b7280" />
          <Text style={styles.rowText}>{customerInfo.name}</Text>
          {customerInfo.phone && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${customerInfo.phone}`)}
              style={styles.callBtn}
            >
              <Ionicons name="call-outline" size={14} color="#10b981" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Address */}
      <View style={styles.row}>
        <Ionicons name="location-outline" size={16} color="#6b7280" />
        <Text style={styles.rowText} numberOfLines={2}>{addressText}</Text>
      </View>

      {/* Items summary */}
      <View style={styles.row}>
        <Ionicons name="fast-food-outline" size={16} color="#6b7280" />
        <Text style={styles.rowText}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
      </View>

      {/* Actions */}
      {showActions && deliveryStatus === 'assigned' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject && onReject(id)}
          >
            <Ionicons name="close" size={18} color="#ef4444" />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={() => onAccept && onAccept(id)}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderInfo: { flex: 1 },
  orderNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rowText: {
    fontSize: 14,
    color: '#4b5563',
    flex: 1,
  },
  callBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  acceptBtn: {
    backgroundColor: '#10b981',
  },
  rejectText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
  acceptText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
