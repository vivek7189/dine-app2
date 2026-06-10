import { View, Text, StyleSheet } from 'react-native';
import { getCurrencySymbol } from '../../utils/formatCurrency';

/**
 * Displays the list of items in a delivery order.
 */
export default function DeliveryOrderDetails({ items }) {
  if (!items || items.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No items</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item, idx) => (
        <View key={item.id || idx} style={styles.itemRow}>
          <View style={styles.qtyBadge}>
            <Text style={styles.qtyText}>{item.quantity || 1}x</Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name || item.menuItemName || 'Item'}</Text>
            {item.selectedVariant && (
              <Text style={styles.variant}>{item.selectedVariant.name || item.selectedVariant}</Text>
            )}
            {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
          </View>
          <Text style={styles.itemPrice}>
            {getCurrencySymbol()}{((item.price || 0) * (item.quantity || 1)).toFixed(0)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  qtyBadge: {
    width: 30,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  qtyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  itemInfo: { flex: 1 },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  variant: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  notes: {
    fontSize: 12,
    color: '#f59e0b',
    marginTop: 2,
    fontStyle: 'italic',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
});
