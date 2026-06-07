import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { formatCurrency } from '../../utils/formatCurrency';

// Parking-specific colors
const ParkingColors = {
  blue: '#0369a1',
  green: '#16a34a',
  red: '#dc2626',
  blueBg: '#e0f2fe',
  greenBg: '#dcfce7',
  redBg: '#fee2e2',
  purpleBg: '#f3e8ff',
  yellowBg: '#fef9c3',
};

// Vehicle type config
const VEHICLE_TYPES = [
  { id: 'car', label: 'Car', icon: 'car-outline' },
  { id: 'suv', label: 'SUV', icon: 'car-sport-outline' },
  { id: 'bike', label: 'Bike', icon: 'bicycle-outline' },
  { id: 'truck', label: 'Truck', icon: 'bus-outline' },
];

// Animation constants
const HEADER_EXPANDED_HEIGHT = 170;
const HEADER_COLLAPSED_HEIGHT = 50;
const SCROLL_THRESHOLD = 100;

// Tabs config
const TABS = [
  { id: 'active', label: 'Active', icon: 'car-outline' },
  { id: 'entry', label: 'Entry', icon: 'arrow-down-circle-outline' },
  { id: 'exit', label: 'Exit', icon: 'arrow-up-circle-outline' },
  { id: 'history', label: 'History', icon: 'time-outline' },
];

export default function ParkingScreen() {
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;
  const tabScrollRef = useRef(null);

  // Header animations
  const headerTitleScale = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  const summaryCardHeight = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [80, 0],
    extrapolate: 'clamp',
  });

  const summaryCardOpacity = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD * 0.5],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const headerPaddingBottom = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [16, 8],
    extrapolate: 'clamp',
  });

  const compactStatsOpacity = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD * 0.7, SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const tabsPadding = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [8, 4],
    extrapolate: 'clamp',
  });

  // Core state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  // Dashboard stats
  const [stats, setStats] = useState({
    total: 0,
    occupied: 0,
    available: 0,
    todayRevenue: 0,
  });

  // Active tab state
  const [activeTickets, setActiveTickets] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Entry tab state
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [entryForm, setEntryForm] = useState({
    vehicleNumber: '',
    vehicleType: 'car',
    zoneId: '',
    rateId: '',
    notes: '',
    vehiclePhoto: null,
  });
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [scanningPlate, setScanningPlate] = useState(false);
  const [showRateDropdown, setShowRateDropdown] = useState(false);

  // Exit tab state
  const [ticketSearch, setTicketSearch] = useState('');
  const [exitTicket, setExitTicket] = useState(null);
  const [findingTicket, setFindingTicket] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [confirmingExit, setConfirmingExit] = useState(false);

  // History tab state
  const [historyTickets, setHistoryTickets] = useState([]);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [historyStatusFilter, setHistoryStatusFilter] = useState('completed');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Initial load
  useEffect(() => {
    loadInitialData();
  }, []);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      if (restaurantId) {
        loadDataForTab();
      }
    }, [restaurantId, activeTab])
  );

  // Clear success/error after timeout
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }

      setUser(userData);
      const restId = userData.restaurantId || userData.restaurant?.id;
      setRestaurantId(restId);

      if (restId) {
        await Promise.all([
          loadDashboardStats(restId),
          loadActiveTickets(restId),
          loadZones(restId),
          loadRates(restId),
        ]);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadDataForTab = async () => {
    if (!restaurantId) return;
    try {
      switch (activeTab) {
        case 'active':
          await Promise.all([
            loadDashboardStats(restaurantId),
            loadActiveTickets(restaurantId),
          ]);
          break;
        case 'entry':
          await Promise.all([
            loadZones(restaurantId),
            loadRates(restaurantId),
          ]);
          break;
        case 'exit':
          break;
        case 'history':
          await loadHistoryTickets(restaurantId);
          break;
      }
    } catch (err) {
      console.error('Error loading tab data:', err);
    }
  };

  const loadDashboardStats = async (restId) => {
    try {
      const response = await apiClient.request(`/api/parking/config/${restId}/dashboard-stats`);
      if (response) {
        setStats({
          total: response.total || 0,
          occupied: response.occupied || 0,
          available: response.available || 0,
          todayRevenue: response.todayRevenue || 0,
        });
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    }
  };

  const loadActiveTickets = async (restId) => {
    try {
      const response = await apiClient.request(`/api/parking/tickets/${restId}?status=active`);
      setActiveTickets(response?.tickets || []);
    } catch (err) {
      console.error('Error loading active tickets:', err);
      setActiveTickets([]);
    }
  };

  const loadZones = async (restId) => {
    try {
      const response = await apiClient.request(`/api/parking/zones/${restId}`);
      setZones(response?.zones || []);
    } catch (err) {
      console.error('Error loading zones:', err);
      setZones([]);
    }
  };

  const loadRates = async (restId) => {
    try {
      const response = await apiClient.request(`/api/parking/rates/${restId}`);
      setRates(response?.rates || []);
    } catch (err) {
      console.error('Error loading rates:', err);
      setRates([]);
    }
  };

  const loadHistoryTickets = async (restId) => {
    try {
      setLoadingHistory(true);
      const response = await apiClient.request(
        `/api/parking/tickets/${restId}?status=${historyStatusFilter}&date=${historyDate}`
      );
      setHistoryTickets(response?.tickets || []);
    } catch (err) {
      console.error('Error loading history:', err);
      setHistoryTickets([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadDataForTab();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTabPress = (tabId, index) => {
    setActiveTab(tabId);
    tabScrollRef.current?.scrollTo({ x: index * 100, animated: true });
  };

  // ─── Entry Tab Actions ───

  const handleScanPlate = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to scan license plates.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setScanningPlate(true);
        try {
          const response = await apiClient.request('/api/parking/recognizeLicensePlate', {
            method: 'POST',
            data: { image: result.assets[0].base64 },
          });
          if (response?.plateNumber) {
            setEntryForm(prev => ({
              ...prev,
              vehicleNumber: response.plateNumber.toUpperCase(),
            }));
            setSuccess(`Plate recognized: ${response.plateNumber}`);
          } else {
            Alert.alert('Scan Failed', 'Could not recognize the license plate. Please enter manually.');
          }
        } catch (err) {
          console.error('Plate recognition error:', err);
          Alert.alert('Scan Error', 'Failed to process the image. Please enter the plate number manually.');
        } finally {
          setScanningPlate(false);
        }
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Camera Error', 'Failed to open camera.');
    }
  };

  const handleTakeVehiclePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.[0]) {
        setEntryForm(prev => ({
          ...prev,
          vehiclePhoto: result.assets[0].uri,
        }));
        setSuccess('Vehicle photo captured');
      }
    } catch (err) {
      console.error('Camera error:', err);
      Alert.alert('Camera Error', 'Failed to open camera.');
    }
  };

  const handleCreateEntry = async () => {
    if (!entryForm.vehicleNumber.trim()) {
      Alert.alert('Required', 'Please enter the vehicle number.');
      return;
    }
    if (!entryForm.zoneId) {
      Alert.alert('Required', 'Please select a parking zone.');
      return;
    }

    try {
      setSubmittingEntry(true);
      const data = {
        vehicleNumber: entryForm.vehicleNumber.trim().toUpperCase(),
        vehicleType: entryForm.vehicleType,
        zoneId: entryForm.zoneId,
        rateId: entryForm.rateId || undefined,
        notes: entryForm.notes || undefined,
        vehiclePhoto: entryForm.vehiclePhoto || undefined,
      };

      const response = await apiClient.request(`/api/parking/tickets/${restaurantId}/entry`, {
        method: 'POST',
        data,
      });

      if (response?.ticket) {
        Alert.alert(
          'Entry Created',
          `Ticket #${response.ticket.ticketNumber || response.ticket.id}\nVehicle: ${data.vehicleNumber}\nZone: ${response.ticket.zoneName || entryForm.zoneId}`,
          [{ text: 'OK' }]
        );
        // Reset form
        setEntryForm({
          vehicleNumber: '',
          vehicleType: 'car',
          zoneId: '',
          rateId: '',
          notes: '',
          vehiclePhoto: null,
        });
        // Refresh stats
        loadDashboardStats(restaurantId);
      }
    } catch (err) {
      console.error('Error creating entry:', err);
      Alert.alert('Error', err.message || 'Failed to create parking entry.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  // ─── Exit Tab Actions ───

  const handleFindTicket = async () => {
    if (!ticketSearch.trim()) {
      Alert.alert('Required', 'Please enter a ticket number.');
      return;
    }

    try {
      setFindingTicket(true);
      const response = await apiClient.request(`/api/parking/tickets/${restaurantId}/exit`, {
        method: 'POST',
        data: { ticketNumber: ticketSearch.trim() },
      });

      if (response?.ticket) {
        setExitTicket(response.ticket);
      } else {
        Alert.alert('Not Found', 'No active ticket found with this number.');
      }
    } catch (err) {
      console.error('Error finding ticket:', err);
      Alert.alert('Error', err.message || 'Failed to find ticket.');
    } finally {
      setFindingTicket(false);
    }
  };

  const handleQuickExit = async (ticket) => {
    try {
      setFindingTicket(true);
      const response = await apiClient.request(`/api/parking/tickets/${restaurantId}/exit`, {
        method: 'POST',
        data: { ticketNumber: ticket.ticketNumber || ticket.id },
      });

      if (response?.ticket) {
        setExitTicket(response.ticket);
        setActiveTab('exit');
      }
    } catch (err) {
      console.error('Error preparing exit:', err);
      Alert.alert('Error', err.message || 'Failed to prepare exit.');
    } finally {
      setFindingTicket(false);
    }
  };

  const handleConfirmExit = async () => {
    if (!exitTicket) return;

    try {
      setConfirmingExit(true);
      const response = await apiClient.request(`/api/parking/tickets/${restaurantId}/exit/confirm`, {
        method: 'POST',
        data: {
          ticketId: exitTicket.id || exitTicket._id,
          paymentMethod,
        },
      });

      if (response?.success) {
        Alert.alert(
          'Exit Confirmed',
          `Vehicle ${exitTicket.vehicleNumber} has exited.\nAmount: ${formatCurrency(exitTicket.amount || 0)}\nPayment: ${paymentMethod}`,
          [{ text: 'OK' }]
        );
        setExitTicket(null);
        setTicketSearch('');
        setPaymentMethod('cash');
        // Refresh stats and active list
        loadDashboardStats(restaurantId);
        loadActiveTickets(restaurantId);
      }
    } catch (err) {
      console.error('Error confirming exit:', err);
      Alert.alert('Error', err.message || 'Failed to confirm exit.');
    } finally {
      setConfirmingExit(false);
    }
  };

  // ─── Helpers ───

  const formatDuration = (entryTime) => {
    if (!entryTime) return '--';
    const entry = new Date(entryTime);
    const now = new Date();
    const diffMs = now - entry;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getVehicleIcon = (type) => {
    const found = VEHICLE_TYPES.find(v => v.id === type);
    return found?.icon || 'car-outline';
  };

  const filteredActiveTickets = activeTickets.filter(ticket => {
    if (!searchQuery) return true;
    const query = searchQuery.toUpperCase();
    return (
      (ticket.vehicleNumber || '').toUpperCase().includes(query) ||
      (ticket.ticketNumber || '').toUpperCase().includes(query)
    );
  });

  // ─── Render: Active Ticket Card ───

  const renderActiveTicketCard = ({ item }) => (
    <View style={styles.ticketCard}>
      <View style={styles.ticketCardHeader}>
        <View style={styles.ticketVehicleInfo}>
          <View style={[styles.vehicleIconBadge, { backgroundColor: ParkingColors.blueBg }]}>
            <Ionicons name={getVehicleIcon(item.vehicleType)} size={20} color={ParkingColors.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleNumber}>{item.vehicleNumber || '--'}</Text>
            <Text style={styles.ticketMeta}>
              {(item.vehicleType || '').toUpperCase()} {item.zoneName ? `\u2022 ${item.zoneName}` : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.quickExitBtn}
          onPress={() => handleQuickExit(item)}
        >
          <Ionicons name="log-out-outline" size={16} color="#fff" />
          <Text style={styles.quickExitBtnText}>Exit</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.ticketCardBody}>
        <View style={styles.ticketDetailRow}>
          <Ionicons name="ticket-outline" size={14} color={Colors.textLight} />
          <Text style={styles.ticketDetailText}>#{item.ticketNumber || item.id || '--'}</Text>
        </View>
        <View style={styles.ticketDetailRow}>
          <Ionicons name="time-outline" size={14} color={Colors.textLight} />
          <Text style={styles.ticketDetailText}>
            {formatTime(item.entryTime || item.createdAt)} ({formatDuration(item.entryTime || item.createdAt)})
          </Text>
        </View>
      </View>
    </View>
  );

  // ─── Render: Zone Card ───

  const renderZoneCard = ({ item }) => {
    const isSelected = entryForm.zoneId === item.id || entryForm.zoneId === item._id;
    const available = (item.capacity || 0) - (item.occupied || 0);
    const isFull = available <= 0;

    return (
      <TouchableOpacity
        style={[
          styles.zoneCard,
          isSelected && styles.zoneCardSelected,
          isFull && styles.zoneCardDisabled,
        ]}
        onPress={() => {
          if (!isFull) {
            setEntryForm(prev => ({ ...prev, zoneId: item.id || item._id }));
          }
        }}
        disabled={isFull}
      >
        <View style={styles.zoneCardHeader}>
          <Text style={[styles.zoneCardName, isSelected && styles.zoneCardNameSelected]}>
            {item.name || item.zoneName || 'Zone'}
          </Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={18} color={ParkingColors.blue} />
          )}
        </View>
        <View style={styles.zoneAvailability}>
          <Text style={[
            styles.zoneAvailableCount,
            isFull ? { color: ParkingColors.red } : { color: ParkingColors.green },
          ]}>
            {isFull ? 'FULL' : `${available} available`}
          </Text>
          <Text style={styles.zoneCapacity}>/ {item.capacity || 0} total</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render: History Ticket Card ───

  const renderHistoryTicketCard = ({ item }) => (
    <View style={styles.historyCard}>
      <View style={styles.historyCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyVehicle}>{item.vehicleNumber || '--'}</Text>
          <Text style={styles.historyTicketNum}>#{item.ticketNumber || item.id || '--'}</Text>
        </View>
        <View style={[
          styles.historyStatusBadge,
          {
            backgroundColor: item.status === 'completed' ? ParkingColors.greenBg :
              item.status === 'cancelled' ? ParkingColors.redBg : ParkingColors.yellowBg,
          },
        ]}>
          <Text style={[
            styles.historyStatusText,
            {
              color: item.status === 'completed' ? ParkingColors.green :
                item.status === 'cancelled' ? ParkingColors.red : '#a16207',
            },
          ]}>
            {(item.status || 'unknown').toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.historyCardBottom}>
        <View style={styles.historyDetail}>
          <Ionicons name="time-outline" size={13} color={Colors.textLight} />
          <Text style={styles.historyDetailText}>
            {item.duration || formatDuration(item.entryTime)} duration
          </Text>
        </View>
        <View style={styles.historyDetail}>
          <Ionicons name="cash-outline" size={13} color={Colors.textLight} />
          <Text style={styles.historyDetailText}>
            {formatCurrency(item.amount || item.totalAmount || 0)}
          </Text>
        </View>
        <View style={styles.historyDetail}>
          <Ionicons name="calendar-outline" size={13} color={Colors.textLight} />
          <Text style={styles.historyDetailText}>
            {formatDate(item.exitTime || item.updatedAt)}
          </Text>
        </View>
      </View>
    </View>
  );

  // ─── Render: Tab Content ───

  const renderActiveTab = () => (
    <View style={{ flex: 1 }}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search vehicle number..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="characters"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Animated.FlatList
        data={filteredActiveTickets}
        renderItem={renderActiveTicketCard}
        keyExtractor={(item, index) => item?.id || item?._id || `ticket-${index}`}
        contentContainerStyle={styles.listContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ParkingColors.blue]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="car-outline" size={48} color={Colors.borderMedium} />
            <Text style={styles.emptyStateTitle}>No Active Parking</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery ? 'No vehicles match your search.' : 'No vehicles are currently parked.'}
            </Text>
          </View>
        }
      />
    </View>
  );

  const renderEntryTab = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={120}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.formContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle Number */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Vehicle Number</Text>
          <View style={styles.vehicleNumberRow}>
            <TextInput
              style={[styles.formInput, { flex: 1 }]}
              placeholder="e.g. KA01AB1234"
              placeholderTextColor={Colors.textLight}
              value={entryForm.vehicleNumber}
              onChangeText={(text) =>
                setEntryForm(prev => ({ ...prev, vehicleNumber: text.toUpperCase() }))
              }
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={styles.scanPlateBtn}
              onPress={handleScanPlate}
              disabled={scanningPlate}
            >
              {scanningPlate ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={styles.scanPlateBtnText}>AI Scan Plate</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Vehicle Type */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Vehicle Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScrollView}>
            {VEHICLE_TYPES.map(vType => {
              const isSelected = entryForm.vehicleType === vType.id;
              return (
                <TouchableOpacity
                  key={vType.id}
                  style={[styles.vehicleChip, isSelected && styles.vehicleChipSelected]}
                  onPress={() => setEntryForm(prev => ({ ...prev, vehicleType: vType.id }))}
                >
                  <Ionicons
                    name={vType.icon}
                    size={20}
                    color={isSelected ? '#fff' : ParkingColors.blue}
                  />
                  <Text style={[styles.vehicleChipText, isSelected && styles.vehicleChipTextSelected]}>
                    {vType.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Zone Picker */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Parking Zone</Text>
          {zones.length > 0 ? (
            <FlatList
              data={zones}
              renderItem={renderZoneCard}
              keyExtractor={(item, index) => item?.id || item?._id || `zone-${index}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10 }}
            />
          ) : (
            <Text style={styles.noDataText}>No zones configured</Text>
          )}
        </View>

        {/* Rate Picker */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Rate</Text>
          <TouchableOpacity
            style={styles.dropdownBtn}
            onPress={() => setShowRateDropdown(!showRateDropdown)}
          >
            <Text style={[
              styles.dropdownBtnText,
              !entryForm.rateId && { color: Colors.textLight },
            ]}>
              {entryForm.rateId
                ? (rates.find(r => (r.id || r._id) === entryForm.rateId)?.name || 'Selected')
                : 'Select rate (optional)'}
            </Text>
            <Ionicons
              name={showRateDropdown ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.textLight}
            />
          </TouchableOpacity>
          {showRateDropdown && (
            <View style={styles.dropdownList}>
              {rates.map(rate => (
                <TouchableOpacity
                  key={rate.id || rate._id}
                  style={[
                    styles.dropdownItem,
                    entryForm.rateId === (rate.id || rate._id) && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    setEntryForm(prev => ({ ...prev, rateId: rate.id || rate._id }));
                    setShowRateDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{rate.name || 'Rate'}</Text>
                  <Text style={styles.dropdownItemPrice}>
                    {formatCurrency(rate.price || rate.amount || 0)}/{rate.unit || 'hr'}
                  </Text>
                </TouchableOpacity>
              ))}
              {rates.length === 0 && (
                <Text style={styles.noDataText}>No rates configured</Text>
              )}
            </View>
          )}
        </View>

        {/* Take Vehicle Photo */}
        <TouchableOpacity style={styles.photoBtn} onPress={handleTakeVehiclePhoto}>
          <Ionicons
            name={entryForm.vehiclePhoto ? 'checkmark-circle' : 'camera-outline'}
            size={20}
            color={entryForm.vehiclePhoto ? ParkingColors.green : ParkingColors.blue}
          />
          <Text style={[
            styles.photoBtnText,
            entryForm.vehiclePhoto && { color: ParkingColors.green },
          ]}>
            {entryForm.vehiclePhoto ? 'Photo Captured' : 'Take Vehicle Photo'}
          </Text>
        </TouchableOpacity>

        {/* Notes */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Notes (Optional)</Text>
          <TextInput
            style={[styles.formInput, styles.notesInput]}
            placeholder="Any notes about the vehicle..."
            placeholderTextColor={Colors.textLight}
            value={entryForm.notes}
            onChangeText={(text) => setEntryForm(prev => ({ ...prev, notes: text }))}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Create Entry Button */}
        <TouchableOpacity
          style={[styles.primaryBtn, submittingEntry && styles.primaryBtnDisabled]}
          onPress={handleCreateEntry}
          disabled={submittingEntry}
        >
          {submittingEntry ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>Create Entry Ticket</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderExitTab = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={120}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.formContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Ticket Number Input */}
        <View style={styles.formGroup}>
          <Text style={styles.formLabel}>Ticket Number</Text>
          <View style={styles.vehicleNumberRow}>
            <TextInput
              style={[styles.formInput, { flex: 1 }]}
              placeholder="Enter ticket number"
              placeholderTextColor={Colors.textLight}
              value={ticketSearch}
              onChangeText={setTicketSearch}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={[styles.scanPlateBtn, { backgroundColor: Colors.tableReserved }]}
              onPress={() => Alert.alert('QR Scanner', 'QR scanning will use expo-camera. Coming soon!')}
            >
              <Ionicons name="qr-code-outline" size={18} color="#fff" />
              <Text style={styles.scanPlateBtnText}>Scan QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Find Ticket Button */}
        <TouchableOpacity
          style={[styles.findTicketBtn, findingTicket && styles.primaryBtnDisabled]}
          onPress={handleFindTicket}
          disabled={findingTicket}
        >
          {findingTicket ? (
            <ActivityIndicator size="small" color={ParkingColors.blue} />
          ) : (
            <>
              <Ionicons name="search-outline" size={18} color={ParkingColors.blue} />
              <Text style={styles.findTicketBtnText}>Find Ticket</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Exit Preview */}
        {exitTicket && (
          <View style={styles.exitPreview}>
            <Text style={styles.exitPreviewTitle}>Exit Preview</Text>

            <View style={styles.exitDetailGrid}>
              <View style={styles.exitDetailItem}>
                <Text style={styles.exitDetailLabel}>Vehicle</Text>
                <Text style={styles.exitDetailValue}>{exitTicket.vehicleNumber || '--'}</Text>
              </View>
              <View style={styles.exitDetailItem}>
                <Text style={styles.exitDetailLabel}>Type</Text>
                <Text style={styles.exitDetailValue}>
                  {(exitTicket.vehicleType || '--').toUpperCase()}
                </Text>
              </View>
              <View style={styles.exitDetailItem}>
                <Text style={styles.exitDetailLabel}>Entry</Text>
                <Text style={styles.exitDetailValue}>
                  {formatTime(exitTicket.entryTime || exitTicket.createdAt)}
                </Text>
              </View>
              <View style={styles.exitDetailItem}>
                <Text style={styles.exitDetailLabel}>Duration</Text>
                <Text style={styles.exitDetailValue}>
                  {exitTicket.duration || formatDuration(exitTicket.entryTime || exitTicket.createdAt)}
                </Text>
              </View>
            </View>

            <View style={styles.exitAmountRow}>
              <Text style={styles.exitAmountLabel}>Amount Due</Text>
              <Text style={styles.exitAmountValue}>
                {formatCurrency(exitTicket.amount || exitTicket.totalAmount || 0)}
              </Text>
            </View>

            {/* Payment Method */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Payment Method</Text>
            <View style={styles.paymentMethodRow}>
              {[
                { id: 'cash', label: 'Cash', icon: 'cash-outline' },
                { id: 'card', label: 'Card', icon: 'card-outline' },
                { id: 'digital', label: 'Digital', icon: 'phone-portrait-outline' },
              ].map(pm => {
                const isSelected = paymentMethod === pm.id;
                return (
                  <TouchableOpacity
                    key={pm.id}
                    style={[styles.paymentBtn, isSelected && styles.paymentBtnSelected]}
                    onPress={() => setPaymentMethod(pm.id)}
                  >
                    <Ionicons
                      name={pm.icon}
                      size={20}
                      color={isSelected ? '#fff' : ParkingColors.blue}
                    />
                    <Text style={[
                      styles.paymentBtnText,
                      isSelected && styles.paymentBtnTextSelected,
                    ]}>
                      {pm.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Confirm Exit Button */}
            <TouchableOpacity
              style={[styles.confirmExitBtn, confirmingExit && styles.primaryBtnDisabled]}
              onPress={handleConfirmExit}
              disabled={confirmingExit}
            >
              {confirmingExit ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.confirmExitBtnText}>Confirm Exit</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderHistoryTab = () => (
    <View style={{ flex: 1 }}>
      {/* Date and Status Filters */}
      <View style={styles.historyFilters}>
        <View style={styles.historyDateRow}>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => {
              const d = new Date(historyDate);
              d.setDate(d.getDate() - 1);
              setHistoryDate(d.toISOString().split('T')[0]);
            }}
          >
            <Ionicons name="chevron-back" size={18} color={ParkingColors.blue} />
          </TouchableOpacity>
          <View style={styles.historyDateDisplay}>
            <Ionicons name="calendar-outline" size={16} color={ParkingColors.blue} />
            <Text style={styles.historyDateText}>{formatDate(historyDate)}</Text>
          </View>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => {
              const d = new Date(historyDate);
              d.setDate(d.getDate() + 1);
              setHistoryDate(d.toISOString().split('T')[0]);
            }}
          >
            <Ionicons name="chevron-forward" size={18} color={ParkingColors.blue} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.todayBtn}
            onPress={() => setHistoryDate(new Date().toISOString().split('T')[0])}
          >
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusFilterRow}>
          {['completed', 'cancelled', 'all'].map(status => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusFilterBtn,
                historyStatusFilter === status && styles.statusFilterBtnActive,
              ]}
              onPress={() => setHistoryStatusFilter(status)}
            >
              <Text style={[
                styles.statusFilterText,
                historyStatusFilter === status && styles.statusFilterTextActive,
              ]}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Load history button */}
      <TouchableOpacity
        style={styles.loadHistoryBtn}
        onPress={() => loadHistoryTickets(restaurantId)}
        disabled={loadingHistory}
      >
        {loadingHistory ? (
          <ActivityIndicator size="small" color={ParkingColors.blue} />
        ) : (
          <>
            <Ionicons name="refresh-outline" size={16} color={ParkingColors.blue} />
            <Text style={styles.loadHistoryBtnText}>Load History</Text>
          </>
        )}
      </TouchableOpacity>

      <FlatList
        data={historyTickets}
        renderItem={renderHistoryTicketCard}
        keyExtractor={(item, index) => item?.id || item?._id || `history-${index}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHistoryTickets(restaurantId)}
            colors={[ParkingColors.blue]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color={Colors.borderMedium} />
            <Text style={styles.emptyStateTitle}>No History</Text>
            <Text style={styles.emptyStateText}>
              No parking records found for this date.
            </Text>
          </View>
        }
      />
    </View>
  );

  // ─── Loading State ───

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={ParkingColors.blue} />
        <Text style={styles.loadingText}>Loading parking...</Text>
      </SafeAreaView>
    );
  }

  // ─── Main Render ───

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Animated Header with Summary Card */}
      <Animated.View style={[styles.headerSection, { paddingBottom: headerPaddingBottom }]}>
        <View style={styles.headerTop}>
          <Animated.View style={{ transform: [{ scale: headerTitleScale }] }}>
            <Text style={styles.headerGreeting}>Parking Management</Text>
            <View style={styles.headerSubRow}>
              <Text style={styles.headerDate}>
                {new Date().toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              {/* Compact stats - appears when scrolled */}
              <Animated.View style={[styles.compactStats, { opacity: compactStatsOpacity }]}>
                <View style={styles.compactStatItem}>
                  <View style={[styles.compactDot, { backgroundColor: ParkingColors.green }]} />
                  <Text style={styles.compactStatText}>{stats.available}</Text>
                </View>
                <View style={styles.compactStatItem}>
                  <View style={[styles.compactDot, { backgroundColor: ParkingColors.red }]} />
                  <Text style={styles.compactStatText}>{stats.occupied}</Text>
                </View>
                <View style={styles.compactStatItem}>
                  <View style={[styles.compactDot, { backgroundColor: ParkingColors.blue }]} />
                  <Text style={styles.compactStatText}>{stats.total}</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        {/* Animated Summary Stats Card - collapses on scroll */}
        <Animated.View style={[
          styles.summaryCard,
          { height: summaryCardHeight, opacity: summaryCardOpacity, overflow: 'hidden' },
        ]}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIcon, { backgroundColor: ParkingColors.blueBg }]}>
              <Ionicons name="car" size={18} color={ParkingColors.blue} />
            </View>
            <View>
              <Text style={styles.summaryValue}>{stats.total}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIcon, { backgroundColor: ParkingColors.redBg }]}>
              <Ionicons name="stop-circle" size={18} color={ParkingColors.red} />
            </View>
            <View>
              <Text style={styles.summaryValue}>{stats.occupied}</Text>
              <Text style={styles.summaryLabel}>Occupied</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIcon, { backgroundColor: ParkingColors.greenBg }]}>
              <Ionicons name="checkmark-circle" size={18} color={ParkingColors.green} />
            </View>
            <View>
              <Text style={styles.summaryValue}>{stats.available}</Text>
              <Text style={styles.summaryLabel}>Available</Text>
            </View>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIcon, { backgroundColor: ParkingColors.yellowBg }]}>
              <Ionicons name="cash" size={18} color="#a16207" />
            </View>
            <View>
              <Text style={styles.summaryValue}>{formatCurrency(stats.todayRevenue)}</Text>
              <Text style={styles.summaryLabel}>Today</Text>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Success/Error Messages */}
      {success && (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#166534" />
          <Text style={styles.successText}>{success}</Text>
        </View>
      )}
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#991b1b" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => setError(null)}>
            <Ionicons name="close" size={16} color="#991b1b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Scrollable Tabs */}
      <Animated.View style={[styles.tabsWrapper, { paddingVertical: tabsPadding }]}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {TABS.map((tab, index) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.activeTab]}
              onPress={() => handleTabPress(tab.id, index)}
            >
              <Ionicons
                name={activeTab === tab.id ? tab.icon.replace('-outline', '') : tab.icon}
                size={16}
                color={activeTab === tab.id ? ParkingColors.blue : Colors.textLight}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'active' && renderActiveTab()}
        {activeTab === 'entry' && renderEntryTab()}
        {activeTab === 'exit' && renderExitTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textMedium,
    ...Typography.body,
  },
  headerSection: {
    backgroundColor: Colors.backgroundWhite,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerDate: {
    fontSize: 13,
    color: Colors.textLight,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: Spacing.md,
  },
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  compactStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  compactDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactStatText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: -2,
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e2e8f0',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: '#dcfce7',
    borderRadius: BorderRadius.medium,
  },
  successText: {
    marginLeft: Spacing.sm,
    color: '#166534',
    ...Typography.caption,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.medium,
  },
  errorText: {
    marginLeft: Spacing.sm,
    color: '#991b1b',
    ...Typography.caption,
    flex: 1,
  },
  tabsWrapper: {
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tabsScrollContent: {
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 6,
    backgroundColor: Colors.backgroundLight,
  },
  activeTab: {
    backgroundColor: '#e0f2fe',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textLight,
  },
  activeTabText: {
    color: ParkingColors.blue,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },

  // ─── Search ───
  searchContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.search,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textDark,
    padding: 0,
  },

  // ─── List ───
  listContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },

  // ─── Ticket Card ───
  ticketCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
    ...Shadows.small,
    overflow: 'hidden',
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  ticketVehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  vehicleIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 0.5,
  },
  ticketMeta: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  quickExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ParkingColors.red,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.large,
    gap: 4,
  },
  quickExitBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  ticketCardBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  ticketDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ticketDetailText: {
    fontSize: 12,
    color: Colors.textMedium,
  },

  // ─── Empty State ───
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: Spacing.sm,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  emptyStateText: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
  },

  // ─── Form ───
  formContainer: {
    padding: Spacing.md,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  formInput: {
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: Colors.textDark,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  vehicleNumberRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  // ─── Scan / Photo Buttons ───
  scanPlateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ParkingColors.blue,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.medium,
    gap: 6,
  },
  scanPlateBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.medium,
    paddingVertical: 14,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: ParkingColors.blue,
  },

  // ─── Vehicle Type Chips ───
  chipScrollView: {
    flexDirection: 'row',
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: ParkingColors.blue,
    marginRight: 10,
    gap: 6,
    backgroundColor: Colors.backgroundWhite,
  },
  vehicleChipSelected: {
    backgroundColor: ParkingColors.blue,
    borderColor: ParkingColors.blue,
  },
  vehicleChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: ParkingColors.blue,
  },
  vehicleChipTextSelected: {
    color: '#fff',
  },

  // ─── Zone Cards ───
  zoneCard: {
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.large,
    padding: Spacing.md,
    minWidth: 140,
  },
  zoneCardSelected: {
    borderColor: ParkingColors.blue,
    backgroundColor: ParkingColors.blueBg,
  },
  zoneCardDisabled: {
    opacity: 0.5,
  },
  zoneCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  zoneCardName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  zoneCardNameSelected: {
    color: ParkingColors.blue,
  },
  zoneAvailability: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  zoneAvailableCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  zoneCapacity: {
    fontSize: 11,
    color: Colors.textLight,
  },

  // ─── Rate Dropdown ───
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  dropdownBtnText: {
    fontSize: 15,
    color: Colors.textDark,
  },
  dropdownList: {
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    marginTop: 4,
    ...Shadows.small,
  },
  dropdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dropdownItemSelected: {
    backgroundColor: ParkingColors.blueBg,
  },
  dropdownItemText: {
    fontSize: 14,
    color: Colors.textDark,
  },
  dropdownItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: ParkingColors.blue,
  },
  noDataText: {
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },

  // ─── Primary Button ───
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParkingColors.blue,
    paddingVertical: 16,
    borderRadius: BorderRadius.large,
    gap: Spacing.sm,
    ...Shadows.small,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── Exit Tab ───
  findTicketBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParkingColors.blueBg,
    paddingVertical: 14,
    borderRadius: BorderRadius.large,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  findTicketBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: ParkingColors.blue,
  },
  exitPreview: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    ...Shadows.medium,
  },
  exitPreviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.md,
  },
  exitDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  exitDetailItem: {
    width: '47%',
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.sm,
  },
  exitDetailLabel: {
    fontSize: 11,
    color: Colors.textLight,
    marginBottom: 2,
  },
  exitDetailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  exitAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  exitAmountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  exitAmountValue: {
    fontSize: 24,
    fontWeight: '800',
    color: ParkingColors.green,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  paymentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: BorderRadius.large,
    borderWidth: 1.5,
    borderColor: ParkingColors.blue,
    gap: 6,
    backgroundColor: Colors.backgroundWhite,
  },
  paymentBtnSelected: {
    backgroundColor: ParkingColors.blue,
    borderColor: ParkingColors.blue,
  },
  paymentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: ParkingColors.blue,
  },
  paymentBtnTextSelected: {
    color: '#fff',
  },
  confirmExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParkingColors.green,
    paddingVertical: 16,
    borderRadius: BorderRadius.large,
    gap: Spacing.sm,
    ...Shadows.small,
  },
  confirmExitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── History Tab ───
  historyFilters: {
    backgroundColor: Colors.backgroundWhite,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  historyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dateNavBtn: {
    padding: 6,
  },
  historyDateDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  historyDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  todayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: ParkingColors.blueBg,
    borderRadius: BorderRadius.full,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: ParkingColors.blue,
  },
  statusFilterRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  statusFilterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundLight,
  },
  statusFilterBtnActive: {
    backgroundColor: ParkingColors.blue,
  },
  statusFilterText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMedium,
  },
  statusFilterTextActive: {
    color: '#fff',
  },
  loadHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  loadHistoryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: ParkingColors.blue,
  },

  // ─── History Card ───
  historyCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    ...Shadows.small,
  },
  historyCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  historyVehicle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 0.5,
  },
  historyTicketNum: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyCardBottom: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  historyDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyDetailText: {
    fontSize: 12,
    color: Colors.textMedium,
  },
});
