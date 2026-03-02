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
import AppDrawer from '../../components/AppDrawer';

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
  const [drawerVisible, setDrawerVisible] = useState(false);
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
    // Don't allow any actions if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

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
    } else if (table.status === 'cleaning') {
      // Allow operations on cleaning tables
      if (table.currentOrderId) {
        router.push({
          pathname: '/(tabs)/orders',
          params: { orderId: table.currentOrderId },
        });
      } else {
        router.push({
          pathname: '/(tabs)/menu',
          params: { tableId: table.id, tableNumber: table.name },
        });
      }
    } else {
      Alert.alert('Table Unavailable', `Table ${table.name} is ${table.status}.`);
    }
  };

  const handleAddToOrder = (table) => {
    // Don't allow adding to order if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

    // Allow adding to order for occupied or cleaning tables
    if ((table.status === 'occupied' || table.status === 'cleaning') && table.currentOrderId) {
      setSelectedOrderId(table.currentOrderId);
      setSelectedTableForOrder(table);
      setOrderModalMode('add');
      setShowOrderModal(true);
    }
  };

  const handleViewOrder = (table) => {
    // Don't allow viewing order if table is out of service
    if (table.status === 'out-of-service') {
      Alert.alert('Table Out of Service', `Table ${table.name} is currently out of service and cannot be used.`);
      return;
    }

    // Allow viewing order for occupied or cleaning tables
    if ((table.status === 'occupied' || table.status === 'cleaning') && table.currentOrderId) {
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

  const getTimeElapsed = (createdAt) => {
    if (!createdAt) return '';
    try {
      const now = new Date();
      let created;
      if (createdAt._seconds) {
        created = new Date(createdAt._seconds * 1000);
      } else if (createdAt.toDate) {
        created = createdAt.toDate();
      } else if (typeof createdAt === 'string') {
        created = new Date(createdAt);
      } else {
        created = new Date(createdAt);
      }
      if (isNaN(created.getTime())) return '';
      const diffMs = now - created;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      if (diffHrs < 24) {
        return remainingMins > 0 ? `${diffHrs}h ${remainingMins}m ago` : `${diffHrs}h ago`;
      }
      const diffDays = Math.floor(diffHrs / 24);
      return `${diffDays}d ago`;
    } catch (e) {
      return '';
    }
  };

  const renderTable = ({ item: table }) => {
    // Normalize status to avoid undefined showing as blank/grey cards
    const normalizedStatus = table.status || 'available';
    const isOccupied = normalizedStatus === 'occupied';
    const isAvailable = normalizedStatus === 'available';
    const isReserved = normalizedStatus === 'reserved';
    const isCleaning = normalizedStatus === 'cleaning';
    const isOutOfService = normalizedStatus === 'out-of-service';

    return (
      <TouchableOpacity
        style={[
          styles.tableCard,
          isAvailable && styles.tableCardAvailable,
          isOccupied && styles.tableCardOccupied,
          isReserved && styles.tableCardReserved,
          isCleaning && styles.tableCardCleaning,
          isOutOfService && styles.tableCardOutOfService,
        ]}
        onPress={() => {
          // Don't allow actions if out of service
          if (!isOutOfService) {
            handleTablePress(table);
          }
        }}
        activeOpacity={isOutOfService ? 1 : 0.8}
        disabled={isOutOfService}
      >
        {/* Gradient Overlay */}
        <View style={styles.cardGradient}>
          {/* Status Indicator */}
          <View style={styles.statusIndicator}>
            {isAvailable && <View style={styles.statusDotGreen} />}
            {isOccupied && <View style={styles.statusDotOrange} />}
            {isReserved && <View style={styles.statusDotPurple} />}
            {isCleaning && <View style={styles.statusDotBlue} />}
            {isOutOfService && <View style={styles.statusDotRed} />}
          </View>

          {/* Restaurant Icon Watermark */}
          <View style={styles.watermarkIcon}>
            <Ionicons
              name="restaurant"
              size={60}
              color={
                isAvailable ? "rgba(16, 185, 129, 0.06)" : 
                isOccupied ? "rgba(245, 158, 11, 0.06)" : 
                isReserved ? "rgba(139, 92, 246, 0.06)" :
                isCleaning ? "rgba(59, 130, 246, 0.06)" :
                "rgba(239, 68, 68, 0.06)"
              }
            />
          </View>

          {/* Table Content */}
          <View style={styles.tableContent}>
            {/* Table Number + Elapsed Time */}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={[styles.tableNumber, isOutOfService && styles.tableNumberDisabled]}>{table.name}</Text>
              {isOccupied && table.lastOrderTime && (() => {
                const elapsed = getTimeElapsed(table.lastOrderTime);
                if (!elapsed) return null;
                const isOverADay = elapsed.includes('d');
                return (
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: isOverADay ? '#dc2626' : '#92400e',
                  }}>
                    {elapsed}
                  </Text>
                );
              })()}
            </View>

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
            {isCleaning && (
              <View style={styles.statusBadgeCleaning}>
                <Text style={styles.statusBadgeText}>CLEANING</Text>
              </View>
            )}
            {isOutOfService && (
              <View style={styles.statusBadgeOutOfService}>
                <Text style={styles.statusBadgeText}>OUT OF SERVICE</Text>
              </View>
            )}

            {/* Seats */}
            {table.capacity && (
              <View style={styles.seatsRow}>
                <Ionicons name="people" size={12} color={isOutOfService ? Colors.textMedium : Colors.textMedium} />
                <Text style={[styles.seatsText, isOutOfService && styles.seatsTextDisabled]}>{table.capacity} Seats</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.tableActions}>
              {isOutOfService ? (
                // Out of service - no actions allowed
                <View style={styles.outOfServiceButtonContainer}>
                  <Ionicons name="ban" size={12} color="#9ca3af" />
                  <Text style={styles.outOfServiceButtonText}>Not Available</Text>
                </View>
              ) : isAvailable ? (
                <View style={styles.takeOrderButtonContainer}>
                  <Ionicons name="restaurant" size={12} color="#fff" />
                  <Text style={styles.takeOrderButtonText}>Take Order</Text>
                </View>
              ) : (
                // Cleaning, occupied, or reserved - allow all operations
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
  
  // Sort tables: text-named tables first (alphabetically), then pure numbers (numerically)
  // Example: "Sofa", "apple sofa 1", "apple sofa 2", "banana table 1", then "1", "2", "3", "10"
  const sortTablesAlphabetically = (tables) => {
    return [...tables].sort((a, b) => {
      const nameA = (a.name || '').trim();
      const nameB = (b.name || '').trim();
      
      // Check if both are pure numbers (like "1", "2", "10")
      const isPureNumberA = /^\d+$/.test(nameA);
      const isPureNumberB = /^\d+$/.test(nameB);
      
      // If both are pure numbers, sort numerically (1, 2, 3, 10, 11, not 1, 10, 11, 2, 3)
      if (isPureNumberA && isPureNumberB) {
        return parseInt(nameA, 10) - parseInt(nameB, 10);
      }
      
      // If one is pure number and other has text, text comes first
      if (isPureNumberA && !isPureNumberB) {
        return 1; // Pure numbers come after text
      }
      if (!isPureNumberA && isPureNumberB) {
        return -1; // Text comes before numbers
      }
      
      // Both have text, extract text and number parts
      // Handles: "apple sofa 1" -> text: "apple sofa", number: 1
      // Handles: "Table 10" -> text: "Table", number: 10
      // Handles: "Sofa" -> text: "Sofa", number: 0
      const extractParts = (name) => {
        // Match text and trailing numbers (numbers at the end)
        const match = name.match(/^(.+?)\s*(\d+)$/);
        if (match) {
          const text = match[1].trim().toLowerCase();
          const number = parseInt(match[2], 10);
          return { text, number };
        }
        // No number found, just text
        return { text: name.toLowerCase(), number: 0 };
      };
      
      const partsA = extractParts(nameA);
      const partsB = extractParts(nameB);
      
      // First compare by text alphabetically
      const textCompare = partsA.text.localeCompare(partsB.text);
      if (textCompare !== 0) {
        return textCompare;
      }
      
      // If text is same, compare by number numerically
      return partsA.number - partsB.number;
    });
  };
  
  // Sort tables alphabetically
  currentFloorTables = sortTablesAlphabetically(currentFloorTables);
  
  // Filter and sort tables by selected status
  if (selectedStatus) {
    const filtered = currentFloorTables.filter(t => t.status === selectedStatus);
    const rest = currentFloorTables.filter(t => t.status !== selectedStatus);
    // Sort both groups alphabetically
    currentFloorTables = [...sortTablesAlphabetically(filtered), ...sortTablesAlphabetically(rest)];
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setDrawerVisible(true)}
          style={styles.menuButton}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={28} color={Colors.textDark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
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

      {/* App Drawer */}
      <AppDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        user={user}
        onLogout={async () => {
          await apiClient.logout();
          router.replace('/(auth)/login');
        }}
      />
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
  menuButton: {
    padding: 6,
    marginRight: 4,
  },
  headerCenter: {
    flex: 1,
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
    backgroundColor: '#fff', // default background to prevent grey bleed when status missing
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
  tableCardCleaning: {
    backgroundColor: '#eff6ff',
  },
  tableCardOutOfService: {
    backgroundColor: '#f9fafb',
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
  statusDotBlue: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 2,
  },
  statusDotRed: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
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
  tableNumberDisabled: {
    color: '#9ca3af',
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
  statusBadgeCleaning: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeOutOfService: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#e5e7eb',
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
  seatsTextDisabled: {
    color: '#9ca3af',
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
  outOfServiceButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  outOfServiceButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
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
