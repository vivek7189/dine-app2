import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * A themed modal to pick/switch restaurant.
 * Replaces native ActionSheetIOS / Alert.alert across the app.
 *
 * Props:
 *  - visible (bool)
 *  - onClose ()
 *  - restaurants ([{ id/_id, name, address?, businessType? }])
 *  - currentRestaurantId (string)
 *  - onSelect (restaurantId) — called when user taps a restaurant
 *  - switching (bool) — show loader on the selected item while switching
 *  - switchingId (string|null) — which restaurant is currently switching
 */
export default function RestaurantPickerModal({
  visible,
  onClose,
  restaurants = [],
  currentRestaurantId,
  onSelect,
  switching = false,
  switchingId = null,
}) {
  const renderItem = ({ item }) => {
    const rid = item.id || item._id;
    const isCurrent = rid === currentRestaurantId;
    const isSwitching = switching && switchingId === rid;
    const name = item.name || rid;
    const businessType = item.businessType || 'restaurant';

    const iconName =
      businessType === 'bar' ? 'beer-outline' :
      businessType === 'hotel' ? 'bed-outline' :
      businessType === 'bakery' ? 'cafe-outline' :
      'storefront-outline';

    return (
      <TouchableOpacity
        style={[styles.item, isCurrent && styles.itemCurrent]}
        activeOpacity={isCurrent ? 1 : 0.6}
        onPress={() => {
          if (!isCurrent && !switching) onSelect(rid);
        }}
        disabled={isCurrent || switching}
      >
        <View style={[styles.itemIcon, isCurrent && styles.itemIconCurrent]}>
          <Ionicons name={iconName} size={18} color={isCurrent ? '#dc2626' : '#64748b'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, isCurrent && styles.itemNameCurrent]} numberOfLines={1}>
            {name}
          </Text>
          {item.address ? (
            <Text style={styles.itemAddress} numberOfLines={1}>{item.address}</Text>
          ) : null}
        </View>
        {isSwitching ? (
          <ActivityIndicator size="small" color="#dc2626" />
        ) : isCurrent ? (
          <View style={styles.currentBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#dc2626" />
            <Text style={styles.currentBadgeText}>Current</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="swap-horizontal" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Switch Restaurant</Text>
              <Text style={styles.headerSub}>{restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''} available</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <FlatList
            data={restaurants}
            keyExtractor={(item) => item.id || item._id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            bounces={false}
            style={{ maxHeight: 320 }}
          />

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    maxHeight: '70%',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  headerSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  itemCurrent: {
    backgroundColor: '#fef2f2',
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemIconCurrent: {
    backgroundColor: '#fee2e2',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  itemNameCurrent: {
    color: '#dc2626',
  },
  itemAddress: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
});
