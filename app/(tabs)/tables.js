import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import OrderDetailsModal from '../../components/OrderDetailsModal';

export default function TablesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [floors, setFloors] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [user, setUser] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null); // 'available', 'occupied', 'reserved', or null
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedTableForOrder, setSelectedTableForOrder] = useState(null);
  const [orderModalMode, setOrderModalMode] = useState('view'); // 'view' or 'add'
  const isInitialLoadRef = useRef(true);
  const isRefreshingRef = useRef(false);
  const restaurantIdRef = useRef(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Memoize loadFloorsAndTables to prevent recreation
  const loadFloorsAndTables = useCallback(async (restaurantId) => {
    // Prevent multiple simultaneous calls
    if (isRefreshingRef.current) {
      return;
    }
    
    try {
      isRefreshingRef.current = true;
      const response = await apiClient.getFloors(restaurantId);

      let floorsData = [];
      if (response.floors) {
        floorsData = response.floors;
      } else if (Array.isArray(response)) {
        floorsData = response;
      }

      setFloors(floorsData);
      setSelectedFloor(prev => {
        if (!prev && floorsData.length > 0) {
          return floorsData[0];
        }
        return prev;
      });

      const allTables = floorsData.flatMap(floor => floor.tables || []);
      setTables(allTables);
    } catch (error) {
      console.error('Error loading floors:', error);
      throw error;
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Optimistically update table status
  const updateTableStatusOptimistically = useCallback((tableId, status, orderId) => {
    // Convert tableId to string for comparison (params come as strings)
    const tableIdStr = String(tableId);
    
    setFloors(prevFloors => {
      return prevFloors.map(floor => ({
        ...floor,
        tables: floor.tables?.map(table => {
          // Compare as strings to handle both string and number IDs
          if (String(table.id) === tableIdStr) {
            return {
              ...table,
              status: status,
              currentOrderId: orderId || table.currentOrderId,
            };
          }
          return table;
        }) || [],
      }));
    });

    setTables(prevTables => {
      return prevTables.map(table => {
        // Compare as strings to handle both string and number IDs
        if (String(table.id) === tableIdStr) {
          return {
            ...table,
            status: status,
            currentOrderId: orderId || table.currentOrderId,
          };
        }
        return table;
      });
    });
  }, []);

  // Background refresh without blocking
  const refreshInBackground = useCallback(async (restaurantId) => {
    if (isRefreshingRef.current) return;
    
    try {
      isRefreshingRef.current = true;
      const response = await apiClient.getFloors(restaurantId);

      let floorsData = [];
      if (response.floors) {
        floorsData = response.floors;
      } else if (Array.isArray(response)) {
        floorsData = response;
      }

      setFloors(floorsData);
      setSelectedFloor(prev => {
        if (!prev && floorsData.length > 0) {
          return floorsData[0];
        }
        // Update selected floor with fresh data
        if (prev) {
          const updatedFloor = floorsData.find(f => f.id === prev.id);
          return updatedFloor || prev;
        }
        return prev;
      });

      const allTables = floorsData.flatMap(floor => floor.tables || []);
      setTables(allTables);
    } catch (error) {
      console.error('Error refreshing in background:', error);
      // Don't show error to user, just log it
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // Refresh tables when screen comes into focus (only after initial load)
  useFocusEffect(
    useCallback(() => {
      // Skip refresh on initial mount
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        return;
      }

      // Check if we have table update params (from menu screen)
      if (params.tableId && params.tableStatus) {
        // Optimistically update table status immediately (don't wait)
        // Note: params come as strings, so we need to match by string or convert
        const tableIdToUpdate = params.tableId;
        updateTableStatusOptimistically(
          tableIdToUpdate,
          params.tableStatus,
          params.orderId
        );
      }

      // Refresh in background without blocking (small delay to let optimistic update show first)
      const restaurantId = restaurantIdRef.current;
      if (restaurantId && !isRefreshingRef.current) {
        // Delay background refresh slightly to let optimistic update show first
        setTimeout(() => {
          refreshInBackground(restaurantId);
        }, 500);
      }
    }, [params.tableId, params.tableStatus, params.orderId, updateTableStatusOptimistically, refreshInBackground, router])
  );

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

      const restaurant = { id: restaurantId, ...userData.restaurant };
      setSelectedRestaurant(restaurant);
      restaurantIdRef.current = restaurantId;
      await loadFloorsAndTables(restaurantId);
    } catch (error) {
      console.error('Error loading initial data:', error);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
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

  const handleAddToOrder = (table) => {
    if (table.status === 'occupied' && table.currentOrderId) {
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('add');
      setShowOrderModal(true);
    }
  };

  const handleViewOrder = (table) => {
    if (table.status === 'occupied' && table.currentOrderId) {
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('view');
      setShowOrderModal(true);
    }
  };

  const handleAddItemsToOrder = (order, cartItems) => {
    // Navigate to menu with existing order items
    router.push({
      pathname: '/(tabs)/menu',
      params: {
        tableId: selectedTableForOrder?.id,
        tableNumber: selectedTableForOrder?.name,
        orderId: order.id,
        existingOrder: 'true',
        cartItems: JSON.stringify(cartItems),
      },
    });
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
              size={60}
              color={isAvailable ? "rgba(16, 185, 129, 0.06)" : isOccupied ? "rgba(245, 158, 11, 0.06)" : "rgba(139, 92, 246, 0.06)"}
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
                <Ionicons name="people" size={12} color={Colors.textMedium} />
                <Text style={styles.seatsText}>{table.capacity} Seats</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.tableActions}>
              {isAvailable ? (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="restaurant" size={12} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Take Order</Text>
                </View>
              ) : (
                <View style={styles.occupiedActions}>
                  <TouchableOpacity
                    style={styles.viewButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleViewOrder(table);
                    }}
                  >
                    <Ionicons name="eye-outline" size={11} color={Colors.textDark} />
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleAddToOrder(table);
                    }}
                  >
                    <Ionicons name="add-circle" size={11} color="#5b7ff5" />
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
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
          size={14}
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
  let currentFloorTables = selectedFloor?.tables || [];
  
  // Filter and sort tables by selected status
  if (selectedStatus) {
    const filtered = currentFloorTables.filter(t => t.status === selectedStatus);
    const rest = currentFloorTables.filter(t => t.status !== selectedStatus);
    currentFloorTables = [...filtered, ...rest];
  }

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

      {/* Quick Stats - Icon + Count Only */}
      <View style={styles.quickStats}>
        <TouchableOpacity
          style={[styles.statCard, selectedStatus === 'available' && styles.statCardSelected]}
          onPress={() => setSelectedStatus(selectedStatus === 'available' ? null : 'available')}
        >
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={[styles.statCount, selectedStatus === 'available' && styles.statCountSelected]}>
            {stats.available}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, selectedStatus === 'occupied' && styles.statCardSelected]}
          onPress={() => setSelectedStatus(selectedStatus === 'occupied' ? null : 'occupied')}
        >
          <Ionicons name="time" size={18} color="#ea580c" />
          <Text style={[styles.statCount, selectedStatus === 'occupied' && styles.statCountSelected]}>
            {stats.occupied}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, selectedStatus === 'reserved' && styles.statCardSelected]}
          onPress={() => setSelectedStatus(selectedStatus === 'reserved' ? null : 'reserved')}
        >
          <Ionicons name="calendar" size={18} color="#9333ea" />
          <Text style={[styles.statCount, selectedStatus === 'reserved' && styles.statCountSelected]}>
            {stats.reserved}
          </Text>
        </TouchableOpacity>
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

      {/* Order Details Modal */}
      <OrderDetailsModal
        visible={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setSelectedOrderId(null);
          setSelectedTableForOrder(null);
          setOrderModalMode('view');
        }}
        orderId={selectedOrderId}
        tableNumber={selectedTableForOrder?.name}
        restaurantId={selectedRestaurant?.id}
        onAddItems={orderModalMode === 'add' ? handleAddItemsToOrder : undefined}
      />

      {/* Bottom Action Bar */}
      <View style={styles.bottomActionBar}>
        <TouchableOpacity style={styles.actionButtonSecondary}>
          <Ionicons name="mic" size={16} color="#fff" />
          <Text style={styles.actionButtonSecondaryText}>Voice Order</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButtonPrimary}
          onPress={() => router.push('/(tabs)/orders')}
        >
          <Ionicons name="receipt" size={16} color="#fff" />
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
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
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  userName: {
    fontSize: 11,
    color: Colors.textMedium,
    marginTop: 1,
  },
  refreshButton: {
    padding: 4,
  },
  quickStats: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#fff',
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    gap: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  statCardSelected: {
    backgroundColor: '#fef2f2',
    borderColor: Colors.primary,
  },
  statCount: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statCountSelected: {
    color: Colors.primary,
  },
  floorSelector: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  floorChipsContainer: {
    paddingHorizontal: 14,
    gap: 6,
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  floorChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  floorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textDark,
  },
  floorChipTextSelected: {
    color: '#fff',
  },
  floorBadge: {
    backgroundColor: '#e5e5e5',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 18,
    alignItems: 'center',
  },
  floorBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  floorBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textDark,
  },
  floorBadgeTextSelected: {
    color: '#fff',
  },
  tablesGrid: {
    padding: 10,
    paddingBottom: 90,
  },
  tableRow: {
    justifyContent: 'space-between',
    gap: 8,
  },
  tableCard: {
    flex: 1,
    margin: 4,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
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
    padding: 10,
    minHeight: 130,
    position: 'relative',
  },
  statusIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
  },
  statusDotGreen: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  statusDotOrange: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ea580c',
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  statusDotPurple: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#9333ea',
    shadowColor: '#9333ea',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  watermarkIcon: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    opacity: 0.6,
  },
  tableContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  tableNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 0,
  },
  statusBadgeOccupied: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#fed7aa',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeReserved: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#e9d5ff',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 0.3,
  },
  seatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  seatsText: {
    fontSize: 12,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  tableActions: {
    marginTop: 8,
  },
  takeOrderButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  takeOrderButtonText: {
    fontSize: 11,
    fontWeight: '600',
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
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  viewButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#5b7ff5',
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5b7ff5',
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 12,
    gap: 10,
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
    gap: 6,
    paddingVertical: 11,
    backgroundColor: '#10b981',
    borderRadius: 10,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonPrimaryText: {
    fontSize: 12,
    fontWeight: '600',
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
