import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

export default function TablesScreen() {
  const router = useRouter();
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [user, setUser] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      const restaurantId = userData.restaurantId || userData.restaurant?.id;

      if (!restaurantId) {
        Alert.alert('Error', 'No restaurant assigned. Please contact administrator.');
        return;
      }

      setSelectedRestaurant({ id: restaurantId, ...userData.restaurant });
      await loadFloorsAndTables(restaurantId);
    } catch (error) {
      console.error('Error loading initial data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadFloorsAndTables = async (restaurantId) => {
    try {
      const response = await apiClient.getFloors(restaurantId);

      let floorsData = [];
      if (response.floors) {
        floorsData = response.floors;
      } else if (Array.isArray(response)) {
        floorsData = response;
      }

      setFloors(floorsData);
      if (floorsData.length > 0 && !selectedFloor) {
        setSelectedFloor(floorsData[0]);
      }

      const allTables = floorsData.flatMap(floor => floor.tables || []);
      setTables(allTables);
    } catch (error) {
      console.error('Error loading floors:', error);
      throw error;
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (selectedRestaurant?.id) {
        await loadFloorsAndTables(selectedRestaurant.id);
      }
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [selectedRestaurant]);

  const getTableStats = () => {
    const available = tables.filter(t => t.status === 'available').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    const reserved = tables.filter(t => t.status === 'reserved').length;
    return { available, occupied, reserved, total: tables.length };
  };

  const handleTablePress = (table) => {
    if (table.status === 'available') {
      router.push({
        pathname: '/(tabs)/menu',
        params: { tableId: table.id, tableNumber: table.name },
      });
    } else if (table.status === 'occupied' && table.currentOrderId) {
      router.push({
        pathname: '/(tabs)/orders',
        params: { orderId: table.currentOrderId },
      });
    } else {
      Alert.alert('Table Unavailable', `Table ${table.name} is ${table.status}.`);
    }
  };

  const renderTable = ({ item: table }) => {
    const isOccupied = table.status === 'occupied';
    const isAvailable = table.status === 'available';
    const isReserved = table.status === 'reserved';

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          isAvailable && styles.tableCardAvailable,
          isOccupied && styles.tableCardOccupied,
          isReserved && styles.tableCardReserved,
        ]}
        onPress={() => handleTablePress(table)}
        activeOpacity={0.8}
      >
        {/* Gradient Overlay */}
        <View style={styles.cardGradient}>
          {/* Status Indicator */}
          <View style={styles.statusIndicator}>
            {isAvailable && <View style={styles.statusDotGreen} />}
            {isOccupied && <View style={styles.statusDotOrange} />}
            {isReserved && <View style={styles.statusDotPurple} />}
          </View>

          {/* Restaurant Icon Watermark */}
          <View style={styles.watermarkIcon}>
            <Ionicons
              name="restaurant"
              size={80}
              color={isAvailable ? "rgba(16, 185, 129, 0.08)" : isOccupied ? "rgba(245, 158, 11, 0.08)" : "rgba(139, 92, 246, 0.08)"}
            />
          </View>

          {/* Table Content */}
          <View style={styles.tableContent}>
            {/* Table Number */}
            <Text style={styles.tableNumber}>{table.name}</Text>

            {/* Status Badge */}
            {isOccupied && (
              <View style={styles.statusBadgeOccupied}>
                <Text style={styles.statusBadgeText}>OCCUPIED</Text>
              </View>
            )}
            {isReserved && (
              <View style={styles.statusBadgeReserved}>
                <Text style={styles.statusBadgeText}>RESERVED</Text>
              </View>
            )}

            {/* Seats */}
            {table.capacity && (
              <View style={styles.seatsRow}>
                <Ionicons name="people" size={14} color={Colors.textMedium} />
                <Text style={styles.seatsText}>{table.capacity} Seats</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.tableActions}>
              {isAvailable ? (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="restaurant" size={16} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Take Order</Text>
                </View>
              ) : (
                <View style={styles.occupiedActions}>
                  <View style={styles.viewButton}>
                    <Ionicons name="eye-outline" size={14} color={Colors.textDark} />
                    <Text style={styles.viewButtonText}>View</Text>
                  </View>
                  <View style={styles.addButton}>
                    <Ionicons name="add-circle" size={14} color="#5b7ff5" />
                    <Text style={styles.addButtonText}>Add</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFloorTab = ({ item: floor }) => {
    const isSelected = selectedFloor?.id === floor.id;
    return (
      <TouchableOpacity
        style={[styles.floorChip, isSelected && styles.floorChipSelected]}
        onPress={() => setSelectedFloor(floor)}
      >
        <Ionicons
          name="layers-outline"
          size={16}
          color={isSelected ? '#fff' : Colors.textMedium}
        />
        <Text style={[styles.floorChipText, isSelected && styles.floorChipTextSelected]}>
          {floor.name}
        </Text>
        <View style={[styles.floorBadge, isSelected && styles.floorBadgeSelected]}>
          <Text style={[styles.floorBadgeText, isSelected && styles.floorBadgeTextSelected]}>
            {floor.tables?.length || 0}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading tables...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = getTableStats();
  const currentFloorTables = selectedFloor?.tables || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandIcon}>
            <Ionicons name="restaurant" size={22} color="#fff" />
          </View>
          <View>
            <Text style={styles.restaurantName}>{selectedRestaurant?.name || 'Restaurant'}</Text>
            <Text style={styles.userName}>Hello, {user?.name || 'Staff'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} disabled={refreshing} style={styles.refreshButton}>
          <Ionicons name="refresh-circle" size={32} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: '#dcfce7' }]}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
          </View>
          <View style={styles.statInfo}>
            <Text style={styles.statNumber}>{stats.available}</Text>
            <Text style={styles.statLabel}>Available</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: '#fed7aa' }]}>
            <Ionicons name="time" size={20} color="#ea580c" />
          </View>
          <View style={styles.statInfo}>
            <Text style={styles.statNumber}>{stats.occupied}</Text>
            <Text style={styles.statLabel}>Occupied</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIconContainer, { backgroundColor: '#e9d5ff' }]}>
            <Ionicons name="calendar" size={20} color="#9333ea" />
          </View>
          <View style={styles.statInfo}>
            <Text style={styles.statNumber}>{stats.reserved}</Text>
            <Text style={styles.statLabel}>Reserved</Text>
          </View>
        </View>
      </View>

      {/* Floor Selector */}
      {floors.length > 1 && (
        <View style={styles.floorSelector}>
          <FlatList
            horizontal
            data={floors}
            renderItem={renderFloorTab}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.floorChipsContainer}
          />
        </View>
      )}

      {/* Tables Grid */}
      <FlatList
        data={currentFloorTables}
        renderItem={renderTable}
        keyExtractor={(item) => item.id}
        numColumns={2}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        contentContainerStyle={styles.tablesGrid}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.tableRow}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyText}>No tables found</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
          </View>
        }
      />

      {/* Bottom Action Bar */}
      <View style={styles.bottomActionBar}>
        <TouchableOpacity style={styles.actionButtonSecondary}>
          <Ionicons name="mic" size={20} color="#fff" />
          <Text style={styles.actionButtonSecondaryText}>Voice Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonPrimary}
          onPress={() => router.push('/(tabs)/orders')}
        >
          <Ionicons name="receipt" size={20} color="#fff" />
          <Text style={styles.actionButtonPrimaryText}>View Orders</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  userName: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  refreshButton: {
    padding: 4,
  },
  quickStats: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fafafa',
    borderRadius: 12,
    gap: 10,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statInfo: {
    flex: 1,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textDark,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textMedium,
    marginTop: 2,
  },
  floorSelector: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  floorChipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  floorChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  floorChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
  },
  floorChipTextSelected: {
    color: '#fff',
  },
  floorBadge: {
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  floorBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  floorBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textDark,
  },
  floorBadgeTextSelected: {
    color: '#fff',
  },
  tablesGrid: {
    padding: 12,
    paddingBottom: 100,
  },
  tableRow: {
    justifyContent: 'space-between',
  },
  tableCard: {
    flex: 1,
    margin: 6,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  tableCardAvailable: {
    backgroundColor: '#fff',
  },
  tableCardOccupied: {
    backgroundColor: '#fffbeb',
  },
  tableCardReserved: {
    backgroundColor: '#faf5ff',
  },
  cardGradient: {
    padding: 16,
    minHeight: 180,
    position: 'relative',
  },
  statusIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
  },
  statusDotGreen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  statusDotOrange: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ea580c',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  statusDotPurple: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#9333ea',
    shadowColor: '#9333ea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  watermarkIcon: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    opacity: 1,
  },
  tableContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  tableNumber: {
    fontSize: 42,
    fontWeight: '900',
    color: Colors.textDark,
    letterSpacing: -1,
  },
  statusBadgeOccupied: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fed7aa',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeReserved: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#e9d5ff',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textDark,
    letterSpacing: 0.5,
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  seatsText: {
    fontSize: 13,
    color: Colors.textMedium,
    fontWeight: '600',
  },
  tableActions: {
    marginTop: 12,
  },
  takeOrderButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  takeOrderButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  occupiedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  viewButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#5b7ff5',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b7ff5',
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#10b981',
    borderRadius: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMedium,
  },
});
