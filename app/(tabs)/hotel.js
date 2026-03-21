import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

// Room status colors
const RoomStatusColors = {
  available: '#10b981',
  occupied: '#ef4444',
  booked: '#3b82f6',
  cleaning: '#f59e0b',
  maintenance: '#f97316',
  reserved: '#3b82f6',
  'out-of-service': '#6b7280',
};

const RoomStatusText = {
  available: 'Available',
  occupied: 'Occupied',
  booked: 'Booked',
  cleaning: 'Cleaning',
  maintenance: 'Maintenance',
  reserved: 'Reserved',
  'out-of-service': 'Out of Service',
};

// Animation constants
const HEADER_EXPANDED_HEIGHT = 170; // Full header with stats card
const HEADER_COLLAPSED_HEIGHT = 50; // Compact header
const SCROLL_THRESHOLD = 100;

export default function HotelScreen() {
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;
  const tabScrollRef = useRef(null);

  // Header title animation - stays visible but gets smaller
  const headerTitleScale = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  // Summary card animation - fades out and collapses
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

  // Header section padding animation
  const headerPaddingBottom = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [16, 8],
    extrapolate: 'clamp',
  });

  // Compact stats that appear when collapsed
  const compactStatsOpacity = scrollY.interpolate({
    inputRange: [SCROLL_THRESHOLD * 0.7, SCROLL_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Tabs section padding animation
  const tabsPadding = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [8, 4],
    extrapolate: 'clamp',
  });

  // Date picker section animation
  const datePickerHeight = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [56, 40],
    extrapolate: 'clamp',
  });

  const datePickerPadding = scrollY.interpolate({
    inputRange: [0, SCROLL_THRESHOLD],
    outputRange: [12, 6],
    extrapolate: 'clamp',
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Active tab
  const [activeTab, setActiveTab] = useState('rooms');

  // Data
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [history, setHistory] = useState([]);

  // Filters
  const [checkInStatusFilter, setCheckInStatusFilter] = useState('active');

  // Bookings calendar view
  const [bookingsViewMode, setBookingsViewMode] = useState('calendar'); // 'calendar' or 'list'
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarSummary, setCalendarSummary] = useState({});
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [loadingCalendarSummary, setLoadingCalendarSummary] = useState(false);

  // Room availability
  const [roomsViewDate, setRoomsViewDate] = useState(new Date());
  const [roomAvailability, setRoomAvailability] = useState(null);
  const [loadingRoomAvailability, setLoadingRoomAvailability] = useState(false);
  
  // Room card dropdown
  const [openRoomDropdown, setOpenRoomDropdown] = useState(null);
  
  // Per-card loading states
  const [loadingRooms, setLoadingRooms] = useState({}); // { roomId: true/false }
  const [successRooms, setSuccessRooms] = useState({}); // { roomId: timestamp }

  // History filters
  const [historyFilters, setHistoryFilters] = useState({
    startDate: null,
    endDate: null,
    roomId: '',
    status: '',
  });

  // Modals
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showCheckOutModal, setShowCheckOutModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showRoomActionsModal, setShowRoomActionsModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null);

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedCheckIn, setSelectedCheckIn] = useState(null);
  const [invoice, setInvoice] = useState(null);

  // Form states
  const [roomForm, setRoomForm] = useState({
    roomNumber: '',
    type: 'standard',
    floor: 'Ground',
    capacity: '2',
    tariff: '',
  });

  const [bulkRoomForm, setBulkRoomForm] = useState({
    fromNumber: '',
    toNumber: '',
    type: 'standard',
    floor: 'Ground',
    capacity: '2',
    tariff: '',
  });

  const [bookingForm, setBookingForm] = useState({
    roomNumber: '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    checkInDate: new Date(),
    checkOutDate: new Date(Date.now() + 86400000),
    numberOfGuests: '1',
    estimatedTariff: '',
    specialRequests: '',
  });

  const [checkInForm, setCheckInForm] = useState({
    roomNumber: '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    checkInDate: new Date(),
    checkOutDate: new Date(Date.now() + 86400000),
    numberOfGuests: '1',
    roomTariff: '',
    advancePayment: '',
    paymentMode: 'cash',
    idProofType: 'aadhar',
    idProofNumber: '',
  });

  const [checkOutForm, setCheckOutForm] = useState({
    finalPayment: '',
    paymentMode: 'cash',
    discount: '',
    notes: '',
  });

  // Stats
  const availableRooms = rooms.filter(r => r.status === 'available').length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;

  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId) {
        loadDataForTab();
      }
    }, [restaurantId, activeTab])
  );

  // Load room availability when date changes
  useEffect(() => {
    if (restaurantId && activeTab === 'rooms' && roomsViewDate) {
      loadRoomAvailability();
    }
  }, [roomsViewDate, restaurantId, activeTab]);

  // Close dropdown when clicking outside (using a simple approach)
  useEffect(() => {
    if (openRoomDropdown) {
      // Close dropdown when tab changes
      const timer = setTimeout(() => {
        if (activeTab !== 'rooms') {
          setOpenRoomDropdown(null);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, openRoomDropdown]);

  // Load calendar summary when month/year changes or bookings tab is active
  useEffect(() => {
    if (restaurantId && activeTab === 'bookings') {
      loadCalendarSummary();
    }
  }, [calendarMonth, calendarYear, restaurantId, activeTab]);

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
        await loadRooms(restId);
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
        case 'rooms':
          await loadRooms(restaurantId);
          await loadBookings(restaurantId);
          break;
        case 'bookings':
          await loadBookings(restaurantId);
          break;
        case 'checkins':
          await loadCheckIns(restaurantId);
          break;
        case 'history':
          await loadHistory(restaurantId);
          break;
      }
    } catch (err) {
      console.error('Error loading tab data:', err);
    }
  };

  const loadRooms = async (restId) => {
    try {
      const response = await apiClient.getRooms(restId, {});
      const roomsData = response?.rooms || response || [];
      // Ensure all rooms have required fields
      const safeRooms = Array.isArray(roomsData) 
        ? roomsData.map(room => ({
            id: room?.id || '',
            roomNumber: room?.roomNumber || '',
            status: room?.status || 'available',
            type: room?.type || '',
            floor: room?.floor || '',
            capacity: room?.capacity || '',
            tariff: room?.tariff || 0,
            currentGuest: room?.currentGuest || null,
          }))
        : [];
      setRooms(safeRooms);
    } catch (err) {
      console.error('Error loading rooms:', err);
      setError('Failed to load rooms');
      setRooms([]);
    }
  };

  const loadBookings = async (restId) => {
    try {
      const response = await apiClient.getHotelBookings(restId, {});
      setBookings(response.bookings || []);
    } catch (err) {
      console.error('Error loading bookings:', err);
    }
  };

  const loadCalendarSummary = async () => {
    if (!restaurantId) return;
    try {
      setLoadingCalendarSummary(true);
      const response = await apiClient.getCalendarSummary(restaurantId, calendarMonth + 1, calendarYear);
      // API returns summary as object with date keys like "2026-01-15"
      const summaryMap = {};
      if (response?.summary && typeof response.summary === 'object') {
        Object.entries(response.summary).forEach(([dateKey, dayData]) => {
          summaryMap[dateKey] = {
            bookings: dayData.bookingCount || dayData.bookingListCount || 0,
            checkIns: dayData.checkInCount || 0,
            checkOuts: dayData.checkOutCount || 0,
            occupancyRate: dayData.occupancyRate || 0,
            availableRooms: dayData.availableRooms || 0,
          };
        });
      }
      setCalendarSummary(summaryMap);
    } catch (err) {
      console.error('Error loading calendar summary:', err);
    } finally {
      setLoadingCalendarSummary(false);
    }
  };

  const loadRoomAvailability = async () => {
    if (!restaurantId || !roomsViewDate) return;
    
    try {
      setLoadingRoomAvailability(true);
      const dateStr = roomsViewDate instanceof Date 
        ? roomsViewDate.toISOString().split('T')[0] 
        : roomsViewDate;
      const response = await apiClient.getRoomAvailability(restaurantId, dateStr);
      setRoomAvailability(response);
    } catch (err) {
      console.error('Error loading room availability:', err);
    } finally {
      setLoadingRoomAvailability(false);
    }
  };

  // Date navigation functions
  const navigateDate = (direction) => {
    const currentDate = roomsViewDate instanceof Date ? roomsViewDate : new Date(roomsViewDate);
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setRoomsViewDate(newDate);
  };

  const goToToday = () => {
    setRoomsViewDate(new Date());
  };

  // Calendar navigation
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    return new Date(year, month, 1).getDay();
  };

  const goToPreviousMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const goToCurrentMonth = () => {
    const today = new Date();
    setCalendarMonth(today.getMonth());
    setCalendarYear(today.getFullYear());
    setSelectedCalendarDate(null);
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() &&
           calendarMonth === today.getMonth() &&
           calendarYear === today.getFullYear();
  };

  const getBookingsForDate = (dateStr) => {
    return bookings.filter(booking => {
      const checkIn = new Date(booking.checkInDate);
      const checkOut = new Date(booking.checkOutDate);
      const targetDate = new Date(dateStr);
      return targetDate >= checkIn && targetDate <= checkOut && booking.status === 'confirmed';
    });
  };

  const loadCheckIns = async (restId) => {
    try {
      const response = await apiClient.getHotelCheckIns(restId, 'all');
      let allCheckIns = response.checkIns || [];

      if (checkInStatusFilter !== 'all') {
        if (checkInStatusFilter === 'active') {
          allCheckIns = allCheckIns.filter(ci => ci.status === 'checked-in');
        } else {
          allCheckIns = allCheckIns.filter(ci => ci.status === checkInStatusFilter);
        }
      }

      setCheckIns(allCheckIns);
    } catch (err) {
      console.error('Error loading check-ins:', err);
      setError('Failed to load check-ins');
    }
  };

  const loadHistory = async (restId) => {
    try {
      const params = {};
      if (historyFilters.startDate) {
        params.startDate = historyFilters.startDate.toISOString().split('T')[0];
      }
      if (historyFilters.endDate) {
        params.endDate = historyFilters.endDate.toISOString().split('T')[0];
      }
      if (historyFilters.roomId) params.roomId = historyFilters.roomId;
      if (historyFilters.status) params.status = historyFilters.status;

      const response = await apiClient.getHotelHistory(restId, params);
      setHistory(response.history || []);
    } catch (err) {
      console.error('Error loading history:', err);
      setError('Failed to load history');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDataForTab();
    setRefreshing(false);
  };

  // Room actions
  const handleAddRoom = async () => {
    if (!roomForm.roomNumber) {
      Alert.alert('Error', 'Room number is required');
      return;
    }

    try {
      setLoading(true);
      await apiClient.addRoom({
        restaurantId,
        ...roomForm,
        capacity: parseInt(roomForm.capacity),
        tariff: parseFloat(roomForm.tariff) || 0,
      });

      setSuccess('Room added successfully');
      setShowAddRoomModal(false);
      setRoomForm({
        roomNumber: '',
        type: 'standard',
        floor: 'Ground',
        capacity: '2',
        tariff: '',
      });
      await loadRooms(restaurantId);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add room');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAddRooms = async () => {
    if (!bulkRoomForm.fromNumber || !bulkRoomForm.toNumber) {
      Alert.alert('Error', 'From and To room numbers are required');
      return;
    }

    try {
      setLoading(true);
      await apiClient.bulkAddRooms({
        restaurantId,
        ...bulkRoomForm,
        capacity: parseInt(bulkRoomForm.capacity),
        tariff: parseFloat(bulkRoomForm.tariff) || 0,
      });

      setSuccess('Rooms added successfully');
      setShowBulkAddModal(false);
      setBulkRoomForm({
        fromNumber: '',
        toNumber: '',
        type: 'standard',
        floor: 'Ground',
        capacity: '2',
        tariff: '',
      });
      await loadRooms(restaurantId);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add rooms');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRoomStatus = async (roomId, newStatus) => {
    try {
      setLoadingRooms(prev => ({ ...prev, [roomId]: true }));
      await apiClient.updateRoomStatus(roomId, newStatus);
      setRooms(prevRooms =>
        prevRooms.map(room =>
          room.id === roomId ? { ...room, status: newStatus } : room
        )
      );
      
      // Reload availability if viewing by date
      if (restaurantId && roomsViewDate) {
        await loadRoomAvailability();
      }
      
      // Show success indicator
      setSuccessRooms(prev => ({ ...prev, [roomId]: Date.now() }));
      setTimeout(() => {
        setSuccessRooms(prev => {
          const newState = { ...prev };
          delete newState[roomId];
          return newState;
        });
      }, 2000);
      
      setShowRoomActionsModal(false);
      setSelectedRoom(null);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to update room status');
    } finally {
      setLoadingRooms(prev => {
        const newState = { ...prev };
        delete newState[roomId];
        return newState;
      });
    }
  };

  const handleDeleteRoom = async (roomId) => {
    Alert.alert(
      'Delete Room',
      'Are you sure you want to delete this room?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteRoom(roomId);
              setSuccess('Room deleted successfully');
              await loadRooms(restaurantId);
              setShowRoomActionsModal(false);
              setSelectedRoom(null);
              setTimeout(() => setSuccess(null), 3000);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to delete room');
            }
          },
        },
      ]
    );
  };

  // Booking actions
  const handleCreateBooking = async () => {
    if (!bookingForm.roomNumber || !bookingForm.guestName) {
      Alert.alert('Error', 'Room number and guest name are required');
      return;
    }

    try {
      setLoading(true);

      // Validate check-in date is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const checkInDate = new Date(bookingForm.checkInDate);
      checkInDate.setHours(0, 0, 0, 0);

      if (checkInDate < today) {
        Alert.alert('Error', 'Check-in date cannot be in the past');
        setLoading(false);
        return;
      }

      // Validate check-out date is not before check-in date
      if (bookingForm.checkOutDate < bookingForm.checkInDate) {
        Alert.alert('Error', 'Check-out date cannot be before check-in date');
        setLoading(false);
        return;
      }

      // Validate booking overlap
      const validationResponse = await apiClient.validateBooking({
        restaurantId,
        roomNumber: bookingForm.roomNumber,
        checkInDate: bookingForm.checkInDate.toISOString().split('T')[0],
        checkOutDate: bookingForm.checkOutDate.toISOString().split('T')[0],
      });

      if (validationResponse.hasConflict) {
        Alert.alert('Error', 'Room is already booked for these dates');
        setLoading(false);
        return;
      }

      await apiClient.createHotelBooking({
        restaurantId,
        roomNumber: bookingForm.roomNumber,
        guestInfo: {
          name: bookingForm.guestName,
          phone: bookingForm.guestPhone || null,
          email: bookingForm.guestEmail || null,
        },
        checkInDate: bookingForm.checkInDate.toISOString().split('T')[0],
        checkOutDate: bookingForm.checkOutDate.toISOString().split('T')[0],
        numberOfGuests: parseInt(bookingForm.numberOfGuests),
        estimatedTariff: parseFloat(bookingForm.estimatedTariff) || 0,
        specialRequests: bookingForm.specialRequests || null,
      });

      setSuccess('Booking created successfully');
      setShowBookingModal(false);
      resetBookingForm();
      await loadBookings(restaurantId);
      if (restaurantId && roomsViewDate) {
        await loadRoomAvailability();
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.cancelHotelBooking(bookingId, 'Cancelled by user');
              setSuccess('Booking cancelled successfully');
              await loadBookings(restaurantId);
              if (restaurantId && roomsViewDate) {
                await loadRoomAvailability();
              }
              setTimeout(() => setSuccess(null), 3000);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  };

  const handleCheckInFromBooking = (booking) => {
    setCheckInForm({
      roomNumber: booking.roomNumber || '',
      guestName: booking.guestName || '',
      guestPhone: booking.guestPhone || '',
      guestEmail: booking.guestEmail || '',
      checkInDate: booking.checkInDate ? new Date(booking.checkInDate) : new Date(),
      checkOutDate: booking.checkOutDate ? new Date(booking.checkOutDate) : new Date(Date.now() + 86400000),
      numberOfGuests: String(booking.numberOfGuests || 1),
      roomTariff: String(booking.estimatedTariff || booking.roomTariff || ''),
      advancePayment: '',
      paymentMode: 'cash',
      idProofType: 'aadhar',
      idProofNumber: '',
    });
    setSelectedBooking(booking);
    setShowBookingModal(false);
    setShowCheckInModal(true);
  };

  // Check-in/Check-out actions
  const handleCheckIn = async () => {
    if (!checkInForm.roomNumber || !checkInForm.guestName || !checkInForm.guestPhone) {
      Alert.alert('Error', 'Room number, guest name, and phone are required');
      return;
    }

    // Validate check-in date is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkInDate = new Date(checkInForm.checkInDate);
    checkInDate.setHours(0, 0, 0, 0);

    if (checkInDate < today) {
      Alert.alert('Error', 'Check-in date cannot be in the past');
      return;
    }

    // Validate check-out date is not before check-in date
    if (checkInForm.checkOutDate < checkInForm.checkInDate) {
      Alert.alert('Error', 'Check-out date cannot be before check-in date');
      return;
    }

    try {
      setLoading(true);
      await apiClient.hotelCheckIn({
        restaurantId,
        guestInfo: {
          name: checkInForm.guestName,
          phone: checkInForm.guestPhone,
          email: checkInForm.guestEmail || null,
        },
        roomNumber: checkInForm.roomNumber,
        checkInDate: checkInForm.checkInDate.toISOString().split('T')[0],
        checkOutDate: checkInForm.checkOutDate.toISOString().split('T')[0],
        numberOfGuests: parseInt(checkInForm.numberOfGuests),
        roomTariff: parseFloat(checkInForm.roomTariff) || 0,
        advancePayment: parseFloat(checkInForm.advancePayment) || 0,
        paymentMode: checkInForm.paymentMode,
        idProof: {
          type: checkInForm.idProofType,
          number: checkInForm.idProofNumber || null,
        },
      });

      setSuccess('Checked in successfully');
      setShowCheckInModal(false);
      resetCheckInForm();
      await loadRooms(restaurantId);
      await loadCheckIns(restaurantId);
      if (restaurantId && roomsViewDate) {
        await loadRoomAvailability();
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      Alert.alert('Error', err.message || 'Check-in failed');
    } finally {
      setLoading(false);
    }
  };

  const openCheckOut = async (checkIn) => {
    setSelectedCheckIn(checkIn);

    const balance = (checkIn.totalRoomCharges || 0) + (checkIn.totalFoodCharges || 0) - (checkIn.advancePayment || 0);

    setCheckOutForm({
      finalPayment: balance.toFixed(2),
      paymentMode: 'cash',
      discount: '',
      notes: '',
    });
    setShowCheckOutModal(true);
  };

  const handleCheckOut = async () => {
    try {
      setLoading(true);
      const discounts = checkOutForm.discount
        ? [{ description: 'Discount', amount: parseFloat(checkOutForm.discount) }]
        : [];

      const response = await apiClient.hotelCheckOut(selectedCheckIn.id, {
        finalPayment: parseFloat(checkOutForm.finalPayment) || 0,
        paymentMode: checkOutForm.paymentMode,
        discounts,
        notes: checkOutForm.notes || null,
      });

      setSuccess('Checked out successfully');
      setShowCheckOutModal(false);
      setCheckOutForm({ finalPayment: '', paymentMode: 'cash', discount: '', notes: '' });
      setSelectedCheckIn(null);

      await loadRooms(restaurantId);
      await loadCheckIns(restaurantId);

      if (response.invoice) {
        setInvoice(response.invoice);
        setShowInvoiceModal(true);
      }

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      Alert.alert('Error', err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const viewInvoice = async (checkIn) => {
    try {
      const response = await apiClient.getHotelInvoice(checkIn.id);
      setInvoice(response.invoice);
      setShowInvoiceModal(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to load invoice');
    }
  };

  // Reset form helpers
  const resetBookingForm = () => {
    setBookingForm({
      roomNumber: '',
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      checkInDate: new Date(),
      checkOutDate: new Date(Date.now() + 86400000),
      numberOfGuests: '1',
      estimatedTariff: '',
      specialRequests: '',
    });
  };

  const resetCheckInForm = () => {
    setCheckInForm({
      roomNumber: '',
      guestName: '',
      guestPhone: '',
      guestEmail: '',
      checkInDate: new Date(),
      checkOutDate: new Date(Date.now() + 86400000),
      numberOfGuests: '1',
      roomTariff: '',
      advancePayment: '',
      paymentMode: 'cash',
      idProofType: 'aadhar',
      idProofNumber: '',
    });
    setSelectedBooking(null);
  };

  // Get today's date at midnight for comparison
  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  };

  // Date picker handler with validation
  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate && datePickerField) {
      const { form, field } = datePickerField;
      const today = getToday();

      if (form === 'booking') {
        if (field === 'checkInDate') {
          // Check-in cannot be in the past
          if (selectedDate < today) {
            Alert.alert('Invalid Date', 'Check-in date cannot be in the past');
            return;
          }
          // If new checkInDate is after current checkOutDate, adjust checkOutDate
          setBookingForm(prev => {
            const newCheckOut = selectedDate > prev.checkOutDate
              ? new Date(selectedDate.getTime() + 86400000)
              : prev.checkOutDate;
            return { ...prev, checkInDate: selectedDate, checkOutDate: newCheckOut };
          });
        } else if (field === 'checkOutDate') {
          // Check-out cannot be before check-in
          if (selectedDate < bookingForm.checkInDate) {
            Alert.alert('Invalid Date', 'Check-out date cannot be before check-in date');
            return;
          }
          setBookingForm(prev => ({ ...prev, checkOutDate: selectedDate }));
        }
      } else if (form === 'checkIn') {
        if (field === 'checkInDate') {
          // Check-in cannot be in the past
          if (selectedDate < today) {
            Alert.alert('Invalid Date', 'Check-in date cannot be in the past');
            return;
          }
          // If new checkInDate is after current checkOutDate, adjust checkOutDate
          setCheckInForm(prev => {
            const newCheckOut = selectedDate > prev.checkOutDate
              ? new Date(selectedDate.getTime() + 86400000)
              : prev.checkOutDate;
            return { ...prev, checkInDate: selectedDate, checkOutDate: newCheckOut };
          });
        } else if (field === 'checkOutDate') {
          // Check-out cannot be before check-in
          if (selectedDate < checkInForm.checkInDate) {
            Alert.alert('Invalid Date', 'Check-out date cannot be before check-in date');
            return;
          }
          setCheckInForm(prev => ({ ...prev, checkOutDate: selectedDate }));
        }
      } else if (form === 'history') {
        if (field === 'endDate' && historyFilters.startDate && selectedDate < historyFilters.startDate) {
          Alert.alert('Invalid Date', 'End date cannot be before start date');
          return;
        }
        setHistoryFilters(prev => ({ ...prev, [field]: selectedDate }));
      } else if (form === 'roomsView') {
        setRoomsViewDate(selectedDate);
      }
    }
  };

  const openDatePicker = (form, field) => {
    setDatePickerField({ form, field });
    setShowDatePicker(true);
  };

  // Determine which status to show based on availability
  const getRoomDisplayStatus = (room) => {
    if (!roomAvailability) return room.status;

    const roomData = roomAvailability.rooms?.find(r => r.id === room.id);
    if (!roomData) return room.status;

    return roomData.currentStatus || room.status;
  };

  // Room card press handler - toggle dropdown
  const handleRoomPress = (room) => {
    if (loadingRooms[room.id]) return;
    setOpenRoomDropdown(openRoomDropdown === room.id ? null : room.id);
  };

  // Render room card
  const renderRoomCard = ({ item: room }) => {
    if (!room) return null;
    const displayStatus = getRoomDisplayStatus(room);
    const effectiveStatus = displayStatus || room.status;
    const statusColor = RoomStatusColors[effectiveStatus] || '#6b7280';
    const statusText = RoomStatusText[effectiveStatus] || effectiveStatus || 'Unknown';
    const isDropdownOpen = openRoomDropdown === room.id;
    const isLoading = loadingRooms[room.id];
    const showSuccess = successRooms[room.id];

    // Find booking for this room and date
    const roomData = roomAvailability?.rooms?.find(r => r.id === room.id);
    const bookingInfo = roomData?.booking;
    let fullBooking = null;
    if (bookingInfo?.id) {
      fullBooking = bookings.find(b => b.id === bookingInfo.id);
    }

    return (
      <View style={styles.roomCardWrapper}>
        <View style={{ position: 'relative', width: '100%' }}>
          <TouchableOpacity
            style={[
              styles.roomCard,
              { borderLeftColor: statusColor },
              isLoading && styles.roomCardLoading,
              showSuccess && styles.roomCardSuccess
            ]}
            onPress={() => handleRoomPress(room)}
            disabled={isLoading}
          >
          {/* Loading Overlay */}
          {isLoading && (
            <View style={styles.roomCardLoader}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          )}

          {/* Success Indicator */}
          {showSuccess && (
            <View style={styles.roomCardSuccessBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            </View>
          )}

          <View style={styles.roomCardHeader}>
            <Text style={styles.roomNumber}>{String(room.roomNumber || '')}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusBadgeText}>{String(statusText || '')}</Text>
            </View>
          </View>
          <View style={styles.roomCardDetails}>
            {room.floor != null && room.floor !== '' && (
              <View style={styles.roomDetail}>
                <Ionicons name="layers-outline" size={12} color={Colors.textLight} />
                <Text style={styles.roomDetailText}>{String(room.floor)}</Text>
              </View>
            )}
            {room.type != null && room.type !== '' && (
              <View style={styles.roomDetail}>
                <Ionicons name="bed-outline" size={12} color={Colors.textLight} />
                <Text style={styles.roomDetailText}>{String(room.type)}</Text>
              </View>
            )}
            {room.capacity != null && (
              <View style={styles.roomDetail}>
                <Ionicons name="people-outline" size={12} color={Colors.textLight} />
                <Text style={styles.roomDetailText}>{String(room.capacity)}</Text>
              </View>
            )}
          </View>
          {room.tariff != null && room.tariff !== 0 && (
            <Text style={styles.roomTariff}>₹{String(room.tariff)}/night</Text>
          )}
          {room.currentGuest != null && room.currentGuest !== '' && (
            <View style={styles.currentGuest}>
              <Ionicons name="person" size={12} color={Colors.primary} />
              <Text style={styles.currentGuestText} numberOfLines={1}>{String(room.currentGuest)}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <View style={styles.roomDropdown}>
            {effectiveStatus === 'available' && (
              <>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setCheckInForm({ ...checkInForm, roomNumber: room.roomNumber, roomTariff: room.tariff });
                    setShowCheckInModal(true);
                    setOpenRoomDropdown(null);
                  }}
                >
                  <Ionicons name="log-in" size={18} color="#10b981" />
                  <Text style={styles.dropdownItemText}>Check In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    setBookingForm({ ...bookingForm, roomNumber: room.roomNumber, estimatedTariff: room.tariff });
                    setShowBookingModal(true);
                    setOpenRoomDropdown(null);
                  }}
                >
                  <Ionicons name="bookmark" size={18} color="#3b82f6" />
                  <Text style={styles.dropdownItemText}>Book Room</Text>
                </TouchableOpacity>
              </>
            )}

            {effectiveStatus === 'booked' && fullBooking && (
              <>
                {fullBooking.status === 'confirmed' && (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      handleCheckInFromBooking(fullBooking);
                      setOpenRoomDropdown(null);
                    }}
                  >
                    <Ionicons name="log-in" size={18} color="#10b981" />
                    <Text style={styles.dropdownItemText}>Check In</Text>
                  </TouchableOpacity>
                )}
                {fullBooking.status === 'confirmed' && (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedBooking(fullBooking);
                      setOpenRoomDropdown(null);
                      handleCancelBooking(fullBooking.id);
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color="#ef4444" />
                    <Text style={[styles.dropdownItemText, { color: '#ef4444' }]}>Cancel Booking</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {effectiveStatus === 'occupied' && (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setActiveTab('checkins');
                  setOpenRoomDropdown(null);
                }}
              >
                <Ionicons name="log-out" size={18} color="#3b82f6" />
                <Text style={styles.dropdownItemText}>Check Out</Text>
              </TouchableOpacity>
            )}

            {(effectiveStatus === 'cleaning' || effectiveStatus === 'maintenance') && (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  handleUpdateRoomStatus(room.id, 'available');
                  setOpenRoomDropdown(null);
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#10b981" />
                ) : (
                  <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                )}
                <Text style={styles.dropdownItemText}>Mark Available</Text>
              </TouchableOpacity>
            )}

            {effectiveStatus !== 'maintenance' && (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => {
                  setSelectedRoom(room);
                  setShowRoomActionsModal(true);
                  setOpenRoomDropdown(null);
                }}
              >
                <Ionicons name="construct" size={18} color="#f59e0b" />
                <Text style={styles.dropdownItemText}>Mark Maintenance</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        </View>
      </View>
    );
  };

  // Render booking card
  const renderBookingCard = ({ item: booking }) => {
    const checkIn = booking.checkInDate ? new Date(booking.checkInDate) : null;
    const checkOut = booking.checkOutDate ? new Date(booking.checkOutDate) : null;

    return (
      <View style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View>
            <Text style={styles.bookingRoom}>Room {booking.roomNumber}</Text>
            <Text style={styles.bookingGuest}>{booking.guestName}</Text>
          </View>
          <View style={[
            styles.bookingStatusBadge,
            { backgroundColor: booking.status === 'confirmed' ? '#dcfce7' : '#fef3c7' }
          ]}>
            <Text style={[
              styles.bookingStatusText,
              { color: booking.status === 'confirmed' ? '#166534' : '#92400e' }
            ]}>
              {booking.status}
            </Text>
          </View>
        </View>
        <View style={styles.bookingDates}>
          <View style={styles.bookingDateText}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textLight} />
            <Text style={styles.bookingDateTextContent}>
              {checkIn?.toLocaleDateString()} - {checkOut?.toLocaleDateString()}
            </Text>
          </View>
        </View>
        {booking.guestPhone && (
          <View style={styles.bookingPhone}>
            <Ionicons name="call-outline" size={12} color={Colors.textLight} />
            <Text style={styles.bookingPhoneText}>{booking.guestPhone}</Text>
          </View>
        )}
        <View style={styles.bookingActions}>
          {booking.status === 'confirmed' && (
            <>
              <TouchableOpacity
                style={[styles.bookingActionBtn, styles.checkInBtn]}
                onPress={() => handleCheckInFromBooking(booking)}
              >
                <Ionicons name="log-in-outline" size={16} color="#fff" />
                <Text style={styles.bookingActionText}>Check In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.bookingActionBtn, styles.cancelBtn]}
                onPress={() => handleCancelBooking(booking.id)}
              >
                <Ionicons name="close-outline" size={16} color="#fff" />
                <Text style={styles.bookingActionText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  // Render check-in card
  const renderCheckInCard = ({ item: checkIn }) => {
    const checkInDate = checkIn.checkInDate ? new Date(checkIn.checkInDate) : null;
    const checkOutDate = checkIn.checkOutDate ? new Date(checkIn.checkOutDate) : null;
    const isActive = checkIn.status === 'checked-in';

    return (
      <View style={styles.checkInCard}>
        <View style={styles.checkInHeader}>
          <View style={styles.checkInRoomBadge}>
            <Text style={styles.checkInRoomText}>{checkIn.roomNumber}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <Text style={styles.checkInGuest}>{checkIn.guestName}</Text>
            {checkIn.guestPhone && (
              <View style={styles.checkInPhone}>
                <Ionicons name="call-outline" size={12} color={Colors.textLight} />
                <Text style={styles.checkInPhoneText}>{checkIn.guestPhone}</Text>
              </View>
            )}
            <View style={styles.checkInDates}>
              <Ionicons name="calendar-outline" size={12} color={Colors.textLight} />
              <Text style={styles.checkInDatesText}>
                {checkInDate?.toLocaleDateString()} - {checkOutDate?.toLocaleDateString()}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.checkInAmount}>
              ₹{(checkIn.totalRoomCharges || 0).toFixed(0)}
            </Text>
            {isActive && (
              <Text style={styles.checkInBalance}>
                Balance: ₹{(checkIn.balanceAmount || 0).toFixed(0)}
              </Text>
            )}
          </View>
        </View>

        {checkIn.foodOrders && checkIn.foodOrders.length > 0 && (
          <View style={styles.foodOrdersContainer}>
            <Text style={styles.foodOrdersLabel}>
              <Ionicons name="restaurant-outline" size={12} color="#92400e" />
              {' '}Food Orders ({checkIn.foodOrders.length})
            </Text>
            <Text style={styles.foodOrdersAmount}>
              ₹{checkIn.totalFoodCharges?.toFixed(0) || 0}
            </Text>
          </View>
        )}

        <View style={styles.checkInActions}>
          {isActive ? (
            <TouchableOpacity
              style={[styles.checkInActionBtn, styles.checkOutBtn]}
              onPress={() => openCheckOut(checkIn)}
            >
              <Ionicons name="log-out-outline" size={16} color="#fff" />
              <Text style={styles.checkInActionText}>Check Out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.checkInActionBtn, styles.invoiceBtn]}
              onPress={() => viewInvoice(checkIn)}
            >
              <Ionicons name="document-text-outline" size={16} color={Colors.textDark} />
              <Text style={[styles.checkInActionText, { color: Colors.textDark }]}>Invoice</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // Render history item
  const renderHistoryItem = ({ item: record }) => {
    const checkInDate = record.checkInDate ? new Date(record.checkInDate) : null;
    const checkOutDate = record.checkOutDate ? new Date(record.checkOutDate) : null;
    const nights = checkInDate && checkOutDate
      ? Math.ceil((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24))
      : 0;

    return (
      <TouchableOpacity
        style={styles.historyCard}
        onPress={() => viewInvoice(record)}
      >
        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.historyRoom}>Room {record.roomNumber}</Text>
            <Text style={styles.historyGuest}>{record.guestName}</Text>
          </View>
          <View style={[
            styles.historyStatusBadge,
            { backgroundColor: record.status === 'checked-out' ? '#dcfce7' : '#fef2f2' }
          ]}>
            <Text style={[
              styles.historyStatusText,
              { color: record.status === 'checked-out' ? '#166534' : '#991b1b' }
            ]}>
              {record.status === 'checked-out' ? 'Completed' : record.status}
            </Text>
          </View>
        </View>
        <View style={styles.historyDetails}>
          <Text style={styles.historyDate}>
            {checkInDate?.toLocaleDateString()} - {checkOutDate?.toLocaleDateString()}
          </Text>
          <Text style={styles.historyNights}>{nights} nights</Text>
          <Text style={styles.historyAmount}>₹{record.totalCharges || record.totalAmount || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && rooms.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading hotel data...</Text>
      </SafeAreaView>
    );
  }

  // Close dropdown when tapping outside
  const closeDropdown = () => {
    if (openRoomDropdown) {
      setOpenRoomDropdown(null);
    }
  };

  // Tab scroll constants
  const TAB_WIDTH = 100;
  const SCREEN_WIDTH = Dimensions.get('window').width;

  const tabs = [
    { id: 'rooms', label: 'Rooms', icon: 'bed-outline' },
    { id: 'bookings', label: 'Bookings', icon: 'calendar-outline' },
    { id: 'checkins', label: 'Check-ins', icon: 'enter-outline' },
    { id: 'history', label: 'History', icon: 'time-outline' },
    { id: 'settings', label: 'Setup', icon: 'settings-outline' },
  ];

  const handleTabPress = (tabId, index) => {
    setActiveTab(tabId);
    // Auto-scroll to center the selected tab
    if (tabScrollRef.current) {
      const scrollX = (index * TAB_WIDTH) - (SCREEN_WIDTH / 2) + (TAB_WIDTH / 2);
      tabScrollRef.current.scrollTo({ x: Math.max(0, scrollX), animated: true });
    }
  };

  // Close dropdown on scroll
  const handleScroll = () => {
    if (openRoomDropdown) {
      setOpenRoomDropdown(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        {/* Animated Header with Summary Card */}
        <Animated.View style={[styles.headerSection, { paddingBottom: headerPaddingBottom }]}>
          <View style={styles.headerTop}>
            <Animated.View style={{ transform: [{ scale: headerTitleScale }] }}>
              <Text style={styles.headerGreeting}>Hotel Management</Text>
              <View style={styles.headerSubRow}>
                <Text style={styles.headerDate}>
                  {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {/* Compact stats - appears when scrolled */}
                <Animated.View style={[styles.compactStats, { opacity: compactStatsOpacity }]}>
                  <View style={styles.compactStatItem}>
                    <View style={[styles.compactDot, { backgroundColor: '#16a34a' }]} />
                    <Text style={styles.compactStatText}>{availableRooms}</Text>
                  </View>
                  <View style={styles.compactStatItem}>
                    <View style={[styles.compactDot, { backgroundColor: '#dc2626' }]} />
                    <Text style={styles.compactStatText}>{occupiedRooms}</Text>
                  </View>
                  <View style={styles.compactStatItem}>
                    <View style={[styles.compactDot, { backgroundColor: '#4f46e5' }]} />
                    <Text style={styles.compactStatText}>{rooms.length}</Text>
                  </View>
                </Animated.View>
              </View>
            </Animated.View>
            {(activeTab === 'rooms' || activeTab === 'bookings') && (
              <TouchableOpacity
                style={styles.addBookingBtn}
                onPress={() => setShowBookingModal(true)}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBookingBtnText}>Booking</Text>
              </TouchableOpacity>
            )}
            {activeTab === 'checkins' && (
              <TouchableOpacity
                style={styles.addBookingBtn}
                onPress={() => setShowCheckInModal(true)}
              >
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.addBookingBtnText}>Check In</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Animated Summary Stats Card - collapses on scroll */}
          <Animated.View style={[
            styles.summaryCard,
            { height: summaryCardHeight, opacity: summaryCardOpacity, overflow: 'hidden' }
          ]}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{availableRooms}</Text>
                <Text style={styles.summaryLabel}>Available</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="person" size={18} color="#dc2626" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{occupiedRooms}</Text>
                <Text style={styles.summaryLabel}>Occupied</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="bed" size={18} color="#4f46e5" />
              </View>
              <View>
                <Text style={styles.summaryValue}>{rooms.length}</Text>
                <Text style={styles.summaryLabel}>Total</Text>
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
            {tabs.map((tab, index) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.activeTab]}
                onPress={() => handleTabPress(tab.id, index)}
              >
                <Ionicons
                  name={activeTab === tab.id ? tab.icon.replace('-outline', '') : tab.icon}
                  size={16}
                  color={activeTab === tab.id ? Colors.primary : Colors.textLight}
                />
                <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

      {/* Check-ins filter */}
      {activeTab === 'checkins' && (
        <View style={styles.filterContainer}>
          {['active', 'all', 'checked-out'].map(filter => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterBtn, checkInStatusFilter === filter && styles.activeFilterBtn]}
              onPress={() => {
                setCheckInStatusFilter(filter);
                loadCheckIns(restaurantId);
              }}
            >
              <Text style={[
                styles.filterBtnText,
                checkInStatusFilter === filter && styles.activeFilterBtnText
              ]}>
                {filter === 'active' ? 'Active' : filter === 'all' ? 'All' : 'Checked Out'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'rooms' && (
          <>
            {/* Date Picker and Navigation - Animated */}
            <Animated.View style={[styles.datePickerContainer, { height: datePickerHeight, paddingVertical: datePickerPadding }]}>
              <View style={styles.datePickerRow}>
                <TouchableOpacity
                  style={styles.dateNavButton}
                  onPress={() => navigateDate(-1)}
                >
                  <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => {
                    setDatePickerField({ form: 'roomsView' });
                    setShowDatePicker(true);
                  }}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                  <Text style={styles.datePickerText}>
                    {roomsViewDate instanceof Date
                      ? roomsViewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : new Date(roomsViewDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dateNavButton}
                  onPress={() => navigateDate(1)}
                >
                  <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.todayButton}
                  onPress={goToToday}
                >
                  <Text style={styles.todayButtonText}>Today</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Rooms List with Loader */}
            <View style={styles.roomsListContainer}>
              {loadingRoomAvailability && (
                <View style={styles.loaderOverlay}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loaderText}>Loading room availability...</Text>
                </View>
              )}
              
              <Animated.FlatList
                data={rooms || []}
                renderItem={renderRoomCard}
                keyExtractor={(item, index) => item?.id || `room-${index}`}
                numColumns={2}
                columnWrapperStyle={styles.roomsRow}
                contentContainerStyle={styles.listContent}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                  {
                    useNativeDriver: false,
                    listener: handleScroll
                  }
                )}
                scrollEventThrottle={16}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                  <View style={styles.emptyState}>
                    <Ionicons name="bed-outline" size={48} color={Colors.textLight} />
                    <Text style={styles.emptyText}>No rooms found</Text>
                    <Text style={styles.emptySubtext}>Add rooms to get started</Text>
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            </View>
          </>
        )}

        {activeTab === 'bookings' && (
          <ScrollView
            style={styles.bookingsContainer}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {/* View Mode Toggle */}
            <View style={styles.viewModeToggle}>
              <TouchableOpacity
                style={[styles.viewModeBtn, bookingsViewMode === 'calendar' && styles.viewModeBtnActive]}
                onPress={() => setBookingsViewMode('calendar')}
              >
                <Ionicons
                  name="calendar"
                  size={18}
                  color={bookingsViewMode === 'calendar' ? '#fff' : Colors.primary}
                />
                <Text style={[styles.viewModeBtnText, bookingsViewMode === 'calendar' && styles.viewModeBtnTextActive]}>
                  Calendar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.viewModeBtn, bookingsViewMode === 'list' && styles.viewModeBtnActive]}
                onPress={() => setBookingsViewMode('list')}
              >
                <Ionicons
                  name="list"
                  size={18}
                  color={bookingsViewMode === 'list' ? '#fff' : Colors.primary}
                />
                <Text style={[styles.viewModeBtnText, bookingsViewMode === 'list' && styles.viewModeBtnTextActive]}>
                  List
                </Text>
              </TouchableOpacity>
            </View>

            {bookingsViewMode === 'calendar' ? (
              <>
                {/* Calendar Header */}
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={goToPreviousMonth} style={styles.calendarNavBtn}>
                    <Ionicons name="chevron-back" size={24} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goToCurrentMonth} style={styles.calendarMonthBtn}>
                    <Text style={styles.calendarMonthText}>
                      {MONTH_NAMES[calendarMonth]} {calendarYear}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goToNextMonth} style={styles.calendarNavBtn}>
                    <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Weekday Headers */}
                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map(day => (
                    <View key={day} style={styles.weekdayCell}>
                      <Text style={styles.weekdayText}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Grid */}
                {loadingCalendarSummary ? (
                  <View style={styles.calendarLoading}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : (
                  <View style={styles.calendarGrid}>
                    {(() => {
                      const daysInMonth = getDaysInMonth(calendarMonth, calendarYear);
                      const firstDay = getFirstDayOfMonth(calendarMonth, calendarYear);
                      const cells = [];

                      // Empty cells for days before month starts
                      for (let i = 0; i < firstDay; i++) {
                        cells.push(<View key={`empty-${i}`} style={styles.calendarCell} />);
                      }

                      // Day cells
                      for (let day = 1; day <= daysInMonth; day++) {
                        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayData = calendarSummary[dateStr] || {};
                        const hasBookings = dayData.bookings > 0 || getBookingsForDate(dateStr).length > 0;
                        const hasCheckIns = dayData.checkIns > 0;
                        const hasCheckOuts = dayData.checkOuts > 0;
                        const isTodayDate = isToday(day);
                        const isSelected = selectedCalendarDate === dateStr;

                        cells.push(
                          <TouchableOpacity
                            key={day}
                            style={[
                              styles.calendarCell,
                              isTodayDate && styles.calendarCellToday,
                              isSelected && styles.calendarCellSelected,
                            ]}
                            onPress={() => setSelectedCalendarDate(dateStr)}
                          >
                            <Text style={[
                              styles.calendarDayText,
                              isTodayDate && styles.calendarDayTextToday,
                              isSelected && styles.calendarDayTextSelected,
                            ]}>
                              {day}
                            </Text>
                            {(hasBookings || hasCheckIns || hasCheckOuts) && (
                              <View style={styles.calendarDots}>
                                {hasBookings && <View style={[styles.calendarDot, { backgroundColor: '#3b82f6' }]} />}
                                {hasCheckIns && <View style={[styles.calendarDot, { backgroundColor: '#10b981' }]} />}
                                {hasCheckOuts && <View style={[styles.calendarDot, { backgroundColor: '#ef4444' }]} />}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      }

                      return cells;
                    })()}
                  </View>
                )}

                {/* Calendar Legend */}
                <View style={styles.calendarLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                    <Text style={styles.legendText}>Booking</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.legendText}>Check-in</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
                    <Text style={styles.legendText}>Check-out</Text>
                  </View>
                </View>

                {/* Selected Date Bookings */}
                {selectedCalendarDate && (
                  <View style={styles.selectedDateSection}>
                    <Text style={styles.selectedDateTitle}>
                      Bookings for {new Date(selectedCalendarDate).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                      })}
                    </Text>
                    {getBookingsForDate(selectedCalendarDate).length > 0 ? (
                      getBookingsForDate(selectedCalendarDate).map(booking => (
                        <View key={booking.id} style={styles.calendarBookingCard}>
                          <View style={styles.calendarBookingInfo}>
                            <Text style={styles.calendarBookingRoom}>Room {booking.room?.roomNumber || booking.roomNumber}</Text>
                            <Text style={styles.calendarBookingGuest}>{booking.guestName}</Text>
                            <Text style={styles.calendarBookingDates}>
                              {new Date(booking.checkInDate).toLocaleDateString()} - {new Date(booking.checkOutDate).toLocaleDateString()}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.calendarBookingAction}
                            onPress={() => handleCheckInFromBooking(booking)}
                          >
                            <Ionicons name="enter-outline" size={20} color={Colors.primary} />
                          </TouchableOpacity>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noBookingsText}>No bookings for this date</Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              // List View
              bookings.filter(b => b.status === 'confirmed').length > 0 ? (
                bookings.filter(b => b.status === 'confirmed').map(booking => (
                  <View key={booking.id}>
                    {renderBookingCard({ item: booking })}
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="bookmark-outline" size={48} color={Colors.textLight} />
                  <Text style={styles.emptyText}>No bookings found</Text>
                  <Text style={styles.emptySubtext}>Create a booking to get started</Text>
                </View>
              )
            )}
          </ScrollView>
        )}

        {activeTab === 'checkins' && (
          <FlatList
            data={checkIns}
            renderItem={renderCheckInCard}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="person-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyText}>No check-ins found</Text>
                <Text style={styles.emptySubtext}>Check in a guest to get started</Text>
              </View>
            }
          />
        )}

        {activeTab === 'history' && (
          <FlatList
            data={history}
            renderItem={renderHistoryItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color={Colors.textLight} />
                <Text style={styles.emptyText}>No history found</Text>
                <Text style={styles.emptySubtext}>Past check-outs will appear here</Text>
              </View>
            }
          />
        )}

        {/* Settings/Setup Tab */}
        {activeTab === 'settings' && (
          <ScrollView
            style={styles.settingsContainer}
            contentContainerStyle={styles.settingsContent}
          >
            <Text style={styles.settingsSectionTitle}>Room Management</Text>

            <TouchableOpacity
              style={styles.settingsCard}
              onPress={() => setShowAddRoomModal(true)}
            >
              <View style={styles.settingsCardIcon}>
                <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.settingsCardContent}>
                <Text style={styles.settingsCardTitle}>Add Single Room</Text>
                <Text style={styles.settingsCardDesc}>Add a new room to your hotel</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsCard}
              onPress={() => setShowBulkAddModal(true)}
            >
              <View style={styles.settingsCardIcon}>
                <Ionicons name="layers-outline" size={24} color={Colors.primary} />
              </View>
              <View style={styles.settingsCardContent}>
                <Text style={styles.settingsCardTitle}>Bulk Add Rooms</Text>
                <Text style={styles.settingsCardDesc}>Add multiple rooms at once</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </TouchableOpacity>

            <Text style={[styles.settingsSectionTitle, { marginTop: Spacing.lg }]}>Quick Stats</Text>

            <View style={styles.settingsStatsRow}>
              <View style={[styles.settingsStatCard, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="checkmark-circle" size={24} color="#166534" />
                <Text style={[styles.settingsStatValue, { color: '#166534' }]}>{availableRooms}</Text>
                <Text style={[styles.settingsStatLabel, { color: '#166534' }]}>Available</Text>
              </View>
              <View style={[styles.settingsStatCard, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="person" size={24} color="#991b1b" />
                <Text style={[styles.settingsStatValue, { color: '#991b1b' }]}>{occupiedRooms}</Text>
                <Text style={[styles.settingsStatLabel, { color: '#991b1b' }]}>Occupied</Text>
              </View>
              <View style={[styles.settingsStatCard, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="bed" size={24} color="#1d4ed8" />
                <Text style={[styles.settingsStatValue, { color: '#1d4ed8' }]}>{rooms.length}</Text>
                <Text style={[styles.settingsStatLabel, { color: '#1d4ed8' }]}>Total</Text>
              </View>
            </View>

            <Text style={[styles.settingsSectionTitle, { marginTop: Spacing.lg }]}>Legend</Text>
            <View style={styles.legendContainer}>
              {Object.entries(RoomStatusColors).map(([status, color]) => (
                <View key={status} style={styles.legendRow}>
                  <View style={[styles.legendDotLarge, { backgroundColor: color }]} />
                  <Text style={styles.legendTextLarge}>{RoomStatusText[status]}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Add Room Modal */}
      <Modal
        visible={showAddRoomModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddRoomModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Room</Text>
            <TouchableOpacity onPress={() => setShowAddRoomModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Room Number *</Text>
              <TextInput
                style={styles.formInput}
                value={roomForm.roomNumber}
                onChangeText={text => setRoomForm({ ...roomForm, roomNumber: text })}
                placeholder="e.g., 101"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Room Type</Text>
              <View style={styles.typeSelector}>
                {['standard', 'deluxe', 'suite'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, roomForm.type === type && styles.activeTypeBtn]}
                    onPress={() => setRoomForm({ ...roomForm, type })}
                  >
                    <Text style={[
                      styles.typeBtnText,
                      roomForm.type === type && styles.activeTypeBtnText
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Floor</Text>
              <TextInput
                style={styles.formInput}
                value={roomForm.floor}
                onChangeText={text => setRoomForm({ ...roomForm, floor: text })}
                placeholder="e.g., Ground, 1st, 2nd"
              />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Capacity</Text>
                <TextInput
                  style={styles.formInput}
                  value={roomForm.capacity}
                  onChangeText={text => setRoomForm({ ...roomForm, capacity: text })}
                  keyboardType="numeric"
                  placeholder="2"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Tariff (₹/night)</Text>
                <TextInput
                  style={styles.formInput}
                  value={roomForm.tariff}
                  onChangeText={text => setRoomForm({ ...roomForm, tariff: text })}
                  keyboardType="numeric"
                  placeholder="1500"
                />
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowAddRoomModal(false)}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleAddRoom}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Add Room</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Bulk Add Rooms Modal */}
      <Modal
        visible={showBulkAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBulkAddModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Bulk Add Rooms</Text>
            <TouchableOpacity onPress={() => setShowBulkAddModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>From Room *</Text>
                <TextInput
                  style={styles.formInput}
                  value={bulkRoomForm.fromNumber}
                  onChangeText={text => setBulkRoomForm({ ...bulkRoomForm, fromNumber: text })}
                  keyboardType="numeric"
                  placeholder="101"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>To Room *</Text>
                <TextInput
                  style={styles.formInput}
                  value={bulkRoomForm.toNumber}
                  onChangeText={text => setBulkRoomForm({ ...bulkRoomForm, toNumber: text })}
                  keyboardType="numeric"
                  placeholder="110"
                />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Room Type</Text>
              <View style={styles.typeSelector}>
                {['standard', 'deluxe', 'suite'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, bulkRoomForm.type === type && styles.activeTypeBtn]}
                    onPress={() => setBulkRoomForm({ ...bulkRoomForm, type })}
                  >
                    <Text style={[
                      styles.typeBtnText,
                      bulkRoomForm.type === type && styles.activeTypeBtnText
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Floor</Text>
              <TextInput
                style={styles.formInput}
                value={bulkRoomForm.floor}
                onChangeText={text => setBulkRoomForm({ ...bulkRoomForm, floor: text })}
                placeholder="e.g., 1st Floor"
              />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Capacity</Text>
                <TextInput
                  style={styles.formInput}
                  value={bulkRoomForm.capacity}
                  onChangeText={text => setBulkRoomForm({ ...bulkRoomForm, capacity: text })}
                  keyboardType="numeric"
                  placeholder="2"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Tariff (₹/night)</Text>
                <TextInput
                  style={styles.formInput}
                  value={bulkRoomForm.tariff}
                  onChangeText={text => setBulkRoomForm({ ...bulkRoomForm, tariff: text })}
                  keyboardType="numeric"
                  placeholder="1500"
                />
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowBulkAddModal(false)}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleBulkAddRooms}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Add Rooms</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Booking Modal */}
      <Modal
        visible={showBookingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBookingModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Booking</Text>
            <TouchableOpacity onPress={() => setShowBookingModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Room Number *</Text>
                <TextInput
                  style={styles.formInput}
                  value={bookingForm.roomNumber}
                  onChangeText={text => setBookingForm({ ...bookingForm, roomNumber: text })}
                  placeholder="e.g., 101"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Guests</Text>
                <TextInput
                  style={styles.formInput}
                  value={bookingForm.numberOfGuests}
                  onChangeText={text => setBookingForm({ ...bookingForm, numberOfGuests: text })}
                  keyboardType="numeric"
                  placeholder="1"
                />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Guest Name *</Text>
              <TextInput
                style={styles.formInput}
                value={bookingForm.guestName}
                onChangeText={text => setBookingForm({ ...bookingForm, guestName: text })}
                placeholder="Enter guest name"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={styles.formInput}
                value={bookingForm.guestPhone}
                onChangeText={text => setBookingForm({ ...bookingForm, guestPhone: text })}
                keyboardType="phone-pad"
                placeholder="Enter phone number"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                value={bookingForm.guestEmail}
                onChangeText={text => setBookingForm({ ...bookingForm, guestEmail: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Enter email"
              />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Check-in Date *</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => openDatePicker('booking', 'checkInDate')}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.textLight} />
                  <Text style={styles.datePickerText}>
                    {bookingForm.checkInDate.toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Check-out Date *</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => openDatePicker('booking', 'checkOutDate')}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.textLight} />
                  <Text style={styles.datePickerText}>
                    {bookingForm.checkOutDate.toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Estimated Tariff (₹)</Text>
              <TextInput
                style={styles.formInput}
                value={bookingForm.estimatedTariff}
                onChangeText={text => setBookingForm({ ...bookingForm, estimatedTariff: text })}
                keyboardType="numeric"
                placeholder="e.g., 3000"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Special Requests</Text>
              <TextInput
                style={[styles.formInput, styles.textArea]}
                value={bookingForm.specialRequests}
                onChangeText={text => setBookingForm({ ...bookingForm, specialRequests: text })}
                placeholder="Any special requests..."
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowBookingModal(false)}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleCreateBooking}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Create Booking</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Check-In Modal */}
      <Modal
        visible={showCheckInModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Check-In</Text>
            <TouchableOpacity onPress={() => {
              setShowCheckInModal(false);
              resetCheckInForm();
            }}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Room Number *</Text>
                <TextInput
                  style={styles.formInput}
                  value={checkInForm.roomNumber}
                  onChangeText={text => setCheckInForm({ ...checkInForm, roomNumber: text })}
                  placeholder="e.g., 101"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Guests</Text>
                <TextInput
                  style={styles.formInput}
                  value={checkInForm.numberOfGuests}
                  onChangeText={text => setCheckInForm({ ...checkInForm, numberOfGuests: text })}
                  keyboardType="numeric"
                  placeholder="1"
                />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Guest Name *</Text>
              <TextInput
                style={styles.formInput}
                value={checkInForm.guestName}
                onChangeText={text => setCheckInForm({ ...checkInForm, guestName: text })}
                placeholder="Enter guest name"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Phone *</Text>
              <TextInput
                style={styles.formInput}
                value={checkInForm.guestPhone}
                onChangeText={text => setCheckInForm({ ...checkInForm, guestPhone: text })}
                keyboardType="phone-pad"
                placeholder="Enter phone number"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                value={checkInForm.guestEmail}
                onChangeText={text => setCheckInForm({ ...checkInForm, guestEmail: text })}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Enter email (optional)"
              />
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Check-in Date</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => openDatePicker('checkIn', 'checkInDate')}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.textLight} />
                  <Text style={styles.datePickerText}>
                    {checkInForm.checkInDate.toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Check-out Date</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => openDatePicker('checkIn', 'checkOutDate')}
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.textLight} />
                  <Text style={styles.datePickerText}>
                    {checkInForm.checkOutDate.toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: Spacing.sm }]}>
                <Text style={styles.formLabel}>Room Tariff (₹)</Text>
                <TextInput
                  style={styles.formInput}
                  value={checkInForm.roomTariff}
                  onChangeText={text => setCheckInForm({ ...checkInForm, roomTariff: text })}
                  keyboardType="numeric"
                  placeholder="e.g., 1500"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1, marginLeft: Spacing.sm }]}>
                <Text style={styles.formLabel}>Advance (₹)</Text>
                <TextInput
                  style={styles.formInput}
                  value={checkInForm.advancePayment}
                  onChangeText={text => setCheckInForm({ ...checkInForm, advancePayment: text })}
                  keyboardType="numeric"
                  placeholder="e.g., 500"
                />
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Payment Mode</Text>
              <View style={styles.typeSelector}>
                {['cash', 'card', 'upi'].map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.typeBtn, checkInForm.paymentMode === mode && styles.activeTypeBtn]}
                    onPress={() => setCheckInForm({ ...checkInForm, paymentMode: mode })}
                  >
                    <Text style={[
                      styles.typeBtnText,
                      checkInForm.paymentMode === mode && styles.activeTypeBtnText
                    ]}>
                      {mode.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>ID Proof Type</Text>
              <View style={styles.typeSelector}>
                {['aadhar', 'passport', 'driving'].map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeBtn, checkInForm.idProofType === type && styles.activeTypeBtn]}
                    onPress={() => setCheckInForm({ ...checkInForm, idProofType: type })}
                  >
                    <Text style={[
                      styles.typeBtnText,
                      checkInForm.idProofType === type && styles.activeTypeBtnText
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>ID Proof Number</Text>
              <TextInput
                style={styles.formInput}
                value={checkInForm.idProofNumber}
                onChangeText={text => setCheckInForm({ ...checkInForm, idProofNumber: text })}
                placeholder="Enter ID number"
              />
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setShowCheckInModal(false);
                resetCheckInForm();
              }}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleCheckIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Check In</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Check-Out Modal */}
      <Modal
        visible={showCheckOutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCheckOutModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Check Out</Text>
            <TouchableOpacity onPress={() => setShowCheckOutModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {selectedCheckIn && (
              <>
                <View style={styles.checkOutSummary}>
                  <Text style={styles.checkOutSummaryTitle}>
                    Room {selectedCheckIn.roomNumber} - {selectedCheckIn.guestName}
                  </Text>
                  <View style={styles.checkOutRow}>
                    <Text style={styles.checkOutLabel}>Room Charges:</Text>
                    <Text style={styles.checkOutValue}>₹{(selectedCheckIn.totalRoomCharges || 0).toFixed(2)}</Text>
                  </View>
                  {selectedCheckIn.totalFoodCharges > 0 && (
                    <View style={styles.checkOutRow}>
                      <Text style={styles.checkOutLabel}>Food Charges:</Text>
                      <Text style={styles.checkOutValue}>₹{selectedCheckIn.totalFoodCharges.toFixed(2)}</Text>
                    </View>
                  )}
                  <View style={styles.checkOutRow}>
                    <Text style={styles.checkOutLabel}>Advance Paid:</Text>
                    <Text style={[styles.checkOutValue, { color: Colors.success }]}>
                      -₹{(selectedCheckIn.advancePayment || 0).toFixed(2)}
                    </Text>
                  </View>
                  <View style={[styles.checkOutRow, styles.checkOutTotal]}>
                    <Text style={styles.checkOutTotalLabel}>Balance Due:</Text>
                    <Text style={styles.checkOutTotalValue}>
                      ₹{((selectedCheckIn.totalRoomCharges || 0) + (selectedCheckIn.totalFoodCharges || 0) - (selectedCheckIn.advancePayment || 0)).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Final Payment (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={checkOutForm.finalPayment}
                    onChangeText={text => setCheckOutForm({ ...checkOutForm, finalPayment: text })}
                    keyboardType="numeric"
                    placeholder="Amount to collect"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Payment Mode</Text>
                  <View style={styles.typeSelector}>
                    {['cash', 'card', 'upi'].map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.typeBtn, checkOutForm.paymentMode === mode && styles.activeTypeBtn]}
                        onPress={() => setCheckOutForm({ ...checkOutForm, paymentMode: mode })}
                      >
                        <Text style={[
                          styles.typeBtnText,
                          checkOutForm.paymentMode === mode && styles.activeTypeBtnText
                        ]}>
                          {mode.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Discount (₹)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={checkOutForm.discount}
                    onChangeText={text => setCheckOutForm({ ...checkOutForm, discount: text })}
                    keyboardType="numeric"
                    placeholder="Optional discount"
                  />
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Notes</Text>
                  <TextInput
                    style={[styles.formInput, styles.textArea]}
                    value={checkOutForm.notes}
                    onChangeText={text => setCheckOutForm({ ...checkOutForm, notes: text })}
                    placeholder="Any notes..."
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </>
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowCheckOutModal(false)}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: Colors.success }]}
              onPress={handleCheckOut}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Complete Check Out</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Invoice Modal */}
      <Modal
        visible={showInvoiceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowInvoiceModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invoice</Text>
            <TouchableOpacity onPress={() => setShowInvoiceModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            {invoice && (
              <View style={styles.invoiceContainer}>
                <View style={styles.invoiceHeader}>
                  <Text style={styles.invoiceTitle}>INVOICE</Text>
                  <Text style={styles.invoiceNumber}>#{invoice.invoiceNumber || invoice.id?.slice(-8)}</Text>
                </View>

                <View style={styles.invoiceSection}>
                  <Text style={styles.invoiceSectionTitle}>Guest Details</Text>
                  <Text style={styles.invoiceText}>{invoice.guestName}</Text>
                  {invoice.guestPhone && <Text style={styles.invoiceText}>{invoice.guestPhone}</Text>}
                </View>

                <View style={styles.invoiceSection}>
                  <Text style={styles.invoiceSectionTitle}>Stay Details</Text>
                  <Text style={styles.invoiceText}>Room: {invoice.roomNumber}</Text>
                  <Text style={styles.invoiceText}>
                    Check-in: {invoice.checkInDate ? new Date(invoice.checkInDate).toLocaleDateString() : '-'}
                  </Text>
                  <Text style={styles.invoiceText}>
                    Check-out: {invoice.checkOutDate ? new Date(invoice.checkOutDate).toLocaleDateString() : '-'}
                  </Text>
                  <Text style={styles.invoiceText}>Duration: {invoice.stayDuration || 1} nights</Text>
                </View>

                <View style={styles.invoiceSection}>
                  <Text style={styles.invoiceSectionTitle}>Charges</Text>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Room Charges</Text>
                    <Text style={styles.invoiceAmount}>₹{(invoice.totalRoomCharges || 0).toFixed(2)}</Text>
                  </View>
                  {invoice.totalFoodCharges > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Food Charges</Text>
                      <Text style={styles.invoiceAmount}>₹{invoice.totalFoodCharges.toFixed(2)}</Text>
                    </View>
                  )}
                  {invoice.discountAmount > 0 && (
                    <View style={styles.invoiceRow}>
                      <Text style={styles.invoiceLabel}>Discount</Text>
                      <Text style={[styles.invoiceAmount, { color: Colors.success }]}>
                        -₹{invoice.discountAmount.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.invoiceRow, styles.invoiceTotalRow]}>
                    <Text style={styles.invoiceTotalLabel}>Total</Text>
                    <Text style={styles.invoiceTotalAmount}>
                      ₹{(invoice.totalCharges || invoice.totalAmount || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.invoiceSection}>
                  <Text style={styles.invoiceSectionTitle}>Payment</Text>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Advance</Text>
                    <Text style={styles.invoiceAmount}>₹{(invoice.advancePayment || 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceLabel}>Final Payment</Text>
                    <Text style={styles.invoiceAmount}>₹{(invoice.finalPayment || 0).toFixed(2)}</Text>
                  </View>
                  <View style={[styles.invoiceRow, styles.invoiceTotalRow]}>
                    <Text style={styles.invoiceTotalLabel}>Total Paid</Text>
                    <Text style={[styles.invoiceTotalAmount, { color: Colors.success }]}>
                      ₹{(invoice.totalPaid || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setShowInvoiceModal(false)}
            >
              <Text style={styles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Room Actions Modal */}
      <Modal
        visible={showRoomActionsModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowRoomActionsModal(false)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setShowRoomActionsModal(false)}
        >
          <View style={styles.actionModalContent}>
            {selectedRoom && (
              <>
                <Text style={styles.actionModalTitle}>Room {selectedRoom.roomNumber}</Text>
                <Text style={styles.actionModalSubtitle}>
                  {RoomStatusText[selectedRoom.status]} • {selectedRoom.type} • {selectedRoom.floor}
                </Text>

                {selectedRoom.status === 'available' && (
                  <>
                    <TouchableOpacity
                      style={styles.actionModalBtn}
                      onPress={() => {
                        setCheckInForm({
                          ...checkInForm,
                          roomNumber: selectedRoom.roomNumber,
                          roomTariff: String(selectedRoom.tariff || ''),
                        });
                        setShowRoomActionsModal(false);
                        setShowCheckInModal(true);
                      }}
                    >
                      <Ionicons name="log-in-outline" size={20} color={Colors.success} />
                      <Text style={styles.actionModalBtnText}>Check In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionModalBtn}
                      onPress={() => {
                        setBookingForm({
                          ...bookingForm,
                          roomNumber: selectedRoom.roomNumber,
                          estimatedTariff: String(selectedRoom.tariff || ''),
                        });
                        setShowRoomActionsModal(false);
                        setShowBookingModal(true);
                      }}
                    >
                      <Ionicons name="bookmark-outline" size={20} color={Colors.info} />
                      <Text style={styles.actionModalBtnText}>Book Room</Text>
                    </TouchableOpacity>
                  </>
                )}

                {selectedRoom.status === 'cleaning' && (
                  <TouchableOpacity
                    style={styles.actionModalBtn}
                    onPress={() => handleUpdateRoomStatus(selectedRoom.id, 'available')}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
                    <Text style={styles.actionModalBtnText}>Mark Available</Text>
                  </TouchableOpacity>
                )}

                {selectedRoom.status === 'maintenance' && (
                  <TouchableOpacity
                    style={styles.actionModalBtn}
                    onPress={() => handleUpdateRoomStatus(selectedRoom.id, 'available')}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
                    <Text style={styles.actionModalBtnText}>End Maintenance</Text>
                  </TouchableOpacity>
                )}

                {selectedRoom.status !== 'maintenance' && selectedRoom.status !== 'occupied' && (
                  <TouchableOpacity
                    style={styles.actionModalBtn}
                    onPress={() => handleUpdateRoomStatus(selectedRoom.id, 'maintenance')}
                  >
                    <Ionicons name="construct-outline" size={20} color={Colors.warning} />
                    <Text style={styles.actionModalBtnText}>Set Maintenance</Text>
                  </TouchableOpacity>
                )}

                {selectedRoom.status !== 'cleaning' && selectedRoom.status !== 'occupied' && (
                  <TouchableOpacity
                    style={styles.actionModalBtn}
                    onPress={() => handleUpdateRoomStatus(selectedRoom.id, 'cleaning')}
                  >
                    <Ionicons name="water-outline" size={20} color={Colors.warning} />
                    <Text style={styles.actionModalBtnText}>Set Cleaning</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.actionModalBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteRoom(selectedRoom.id)}
                >
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                  <Text style={[styles.actionModalBtnText, { color: Colors.error }]}>Delete Room</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionModalBtn, styles.cancelActionBtn]}
                  onPress={() => setShowRoomActionsModal(false)}
                >
                  <Text style={styles.cancelActionBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={
            datePickerField?.form === 'booking'
              ? bookingForm[datePickerField.field]
              : datePickerField?.form === 'checkIn'
              ? checkInForm[datePickerField.field]
              : datePickerField?.form === 'history'
              ? historyFilters[datePickerField.field] || new Date()
              : roomsViewDate
          }
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={
            // For checkInDate fields, minimum is today
            (datePickerField?.field === 'checkInDate')
              ? new Date(new Date().setHours(0, 0, 0, 0))
              // For checkOutDate fields, minimum is the corresponding checkInDate
              : datePickerField?.field === 'checkOutDate'
              ? (datePickerField?.form === 'booking'
                  ? bookingForm.checkInDate
                  : datePickerField?.form === 'checkIn'
                  ? checkInForm.checkInDate
                  : undefined)
              // For history endDate, minimum is startDate
              : datePickerField?.field === 'endDate' && historyFilters.startDate
              ? historyFilters.startDate
              : undefined
          }
        />
      )}

    </SafeAreaView>
  );
}

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
  addBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.large,
    gap: 6,
    ...Shadows.small,
  },
  addBookingBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
    fontSize: 18,
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
  // Settings tab styles
  settingsContainer: {
    flex: 1,
  },
  settingsContent: {
    padding: Spacing.md,
  },
  settingsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.sm,
    ...Shadows.small,
  },
  settingsCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryLight + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  settingsCardContent: {
    flex: 1,
  },
  settingsCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  settingsCardDesc: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  settingsStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  settingsStatCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    gap: 4,
  },
  settingsStatValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  settingsStatLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  legendContainer: {
    backgroundColor: Colors.backgroundWhite,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    ...Shadows.small,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  legendDotLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  legendTextLarge: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    marginHorizontal: 3,
    borderRadius: BorderRadius.medium,
    gap: 4,
    minWidth: 80,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: Colors.primary + '15',
  },
  tabText: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '500',
  },
  activeTabText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.backgroundGray,
    gap: Spacing.sm,
  },
  filterBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.backgroundWhite,
  },
  activeFilterBtn: {
    backgroundColor: Colors.primary,
  },
  filterBtnText: {
    ...Typography.small,
    color: Colors.textMedium,
  },
  activeFilterBtnText: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  roomsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  roomCard: {
    width: '100%',
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    borderLeftWidth: 4,
    ...Shadows.small,
    minHeight: 140,
  },
  roomCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  roomNumber: {
    ...Typography.h3,
    color: Colors.textDark,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    ...Typography.small,
    color: '#fff',
    fontWeight: '600',
  },
  roomCardDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  roomDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  roomDetailText: {
    ...Typography.small,
    color: Colors.textLight,
  },
  roomTariff: {
    ...Typography.caption,
    color: Colors.success,
    fontWeight: '600',
    marginTop: Spacing.xs,
  },
  currentGuest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  currentGuestText: {
    ...Typography.small,
    color: Colors.primary,
  },
  bookingCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  bookingRoom: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  bookingGuest: {
    ...Typography.caption,
    color: Colors.textMedium,
    marginTop: 2,
  },
  bookingStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  bookingStatusText: {
    ...Typography.small,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bookingDates: {
    marginBottom: Spacing.xs,
  },
  bookingDateText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bookingDateTextContent: {
    ...Typography.caption,
    color: Colors.textLight,
  },
  bookingPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.sm,
  },
  bookingPhoneText: {
    ...Typography.small,
    color: Colors.textLight,
  },
  bookingActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bookingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    gap: 4,
  },
  checkInBtn: {
    backgroundColor: Colors.success,
  },
  cancelBtn: {
    backgroundColor: Colors.error,
  },
  bookingActionText: {
    ...Typography.small,
    color: '#fff',
    fontWeight: '600',
  },
  checkInCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  checkInHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkInRoomBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkInRoomText: {
    ...Typography.bodyBold,
    color: '#fff',
  },
  checkInGuest: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  checkInPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  checkInPhoneText: {
    ...Typography.small,
    color: Colors.textLight,
  },
  checkInDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  checkInDatesText: {
    ...Typography.small,
    color: Colors.textLight,
  },
  checkInAmount: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  checkInBalance: {
    ...Typography.small,
    color: Colors.warning,
    marginTop: 2,
  },
  foodOrdersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: '#fef3c7',
    borderRadius: BorderRadius.small,
  },
  foodOrdersLabel: {
    ...Typography.small,
    color: '#92400e',
  },
  foodOrdersAmount: {
    ...Typography.caption,
    color: '#92400e',
    fontWeight: '600',
  },
  checkInActions: {
    marginTop: Spacing.md,
  },
  checkInActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    gap: Spacing.xs,
  },
  checkOutBtn: {
    backgroundColor: Colors.success,
  },
  invoiceBtn: {
    backgroundColor: Colors.backgroundGray,
  },
  checkInActionText: {
    ...Typography.caption,
    color: '#fff',
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.small,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  historyRoom: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  historyGuest: {
    ...Typography.caption,
    color: Colors.textMedium,
    marginTop: 2,
  },
  historyStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  historyStatusText: {
    ...Typography.small,
    fontWeight: '600',
  },
  historyDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    ...Typography.small,
    color: Colors.textLight,
  },
  historyNights: {
    ...Typography.small,
    color: Colors.textMedium,
  },
  historyAmount: {
    ...Typography.caption,
    color: Colors.textDark,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMedium,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.caption,
    color: Colors.textLight,
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundWhite,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    ...Typography.h3,
    color: Colors.textDark,
  },
  modalBody: {
    flex: 1,
    padding: Spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  formGroup: {
    marginBottom: Spacing.md,
  },
  formRow: {
    flexDirection: 'row',
  },
  formLabel: {
    ...Typography.caption,
    color: Colors.textMedium,
    marginBottom: Spacing.xs,
  },
  formInput: {
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: BorderRadius.medium,
    padding: Spacing.sm,
    ...Typography.body,
    color: Colors.textDark,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundGray,
    alignItems: 'center',
  },
  activeTypeBtn: {
    backgroundColor: Colors.primary,
  },
  typeBtnText: {
    ...Typography.caption,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  activeTypeBtnText: {
    color: '#fff',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    borderRadius: BorderRadius.medium,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.textDark,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundGray,
    alignItems: 'center',
  },
  secondaryBtnText: {
    ...Typography.body,
    color: Colors.textMedium,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    ...Typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  checkOutSummary: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  checkOutSummaryTitle: {
    ...Typography.bodyBold,
    color: Colors.textDark,
    marginBottom: Spacing.md,
  },
  checkOutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  checkOutLabel: {
    ...Typography.caption,
    color: Colors.textMedium,
  },
  checkOutValue: {
    ...Typography.caption,
    color: Colors.textDark,
    fontWeight: '500',
  },
  checkOutTotal: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  checkOutTotalLabel: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  checkOutTotalValue: {
    ...Typography.bodyBold,
    color: Colors.primary,
  },
  invoiceContainer: {
    backgroundColor: Colors.backgroundGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
  },
  invoiceHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  invoiceTitle: {
    ...Typography.h2,
    color: Colors.textDark,
  },
  invoiceNumber: {
    ...Typography.caption,
    color: Colors.textLight,
    marginTop: Spacing.xs,
  },
  invoiceSection: {
    marginBottom: Spacing.lg,
  },
  invoiceSectionTitle: {
    ...Typography.caption,
    color: Colors.textLight,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  invoiceText: {
    ...Typography.body,
    color: Colors.textDark,
    marginBottom: 2,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  invoiceLabel: {
    ...Typography.caption,
    color: Colors.textMedium,
  },
  invoiceAmount: {
    ...Typography.caption,
    color: Colors.textDark,
    fontWeight: '500',
  },
  invoiceTotalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderMedium,
  },
  invoiceTotalLabel: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  invoiceTotalAmount: {
    ...Typography.bodyBold,
    color: Colors.textDark,
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  actionModalContent: {
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.large,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 320,
  },
  actionModalTitle: {
    ...Typography.h3,
    color: Colors.textDark,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  actionModalSubtitle: {
    ...Typography.caption,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  actionModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundGray,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  actionModalBtnText: {
    ...Typography.body,
    color: Colors.textDark,
  },
  deleteBtn: {
    backgroundColor: '#fef2f2',
  },
  cancelActionBtn: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  cancelActionBtnText: {
    ...Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
  },
  // Date picker styles - Single line
  datePickerContainer: {
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.backgroundWhite,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  dateNavButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.medium,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: '#fef2f2',
    minHeight: 44,
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '700',
  },
  todayButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.primary,
    minHeight: 44,
    justifyContent: 'center',
  },
  todayButtonText: {
    ...Typography.small,
    color: '#fff',
    fontWeight: '700',
  },
  // Rooms list container
  roomsListContainer: {
    flex: 1,
    position: 'relative',
  },
  loaderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loaderText: {
    ...Typography.small,
    color: Colors.textMedium,
    marginTop: Spacing.sm,
    fontWeight: '600',
  },
  // Room card wrapper and dropdown
  roomCardWrapper: {
    width: '48%',
    alignItems: 'stretch',
  },
  roomCardLoading: {
    opacity: 0.6,
  },
  roomCardSuccess: {
    borderWidth: 2,
    borderColor: '#10b981',
  },
  roomCardLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BorderRadius.medium,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  roomCardSuccessBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 20,
  },
  roomDropdown: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: -60,
    backgroundColor: Colors.backgroundWhite,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.xs,
    ...Shadows.medium,
    zIndex: 2000,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    elevation: 8,
    width: '100%',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dropdownItemText: {
    ...Typography.body,
    color: Colors.textDark,
  },
  // Calendar styles
  bookingsContainer: {
    flex: 1,
  },
  viewModeToggle: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  viewModeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.primary,
    gap: Spacing.xs,
  },
  viewModeBtnActive: {
    backgroundColor: Colors.primary,
  },
  viewModeBtnText: {
    ...Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  viewModeBtnTextActive: {
    color: '#fff',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundWhite,
    marginHorizontal: Spacing.md,
    borderRadius: BorderRadius.medium,
    ...Shadows.small,
  },
  calendarNavBtn: {
    padding: Spacing.sm,
  },
  calendarMonthBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  calendarMonthText: {
    ...Typography.h3,
    color: Colors.textDark,
    fontWeight: '600',
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  weekdayText: {
    ...Typography.small,
    color: Colors.textMedium,
    fontWeight: '600',
  },
  calendarLoading: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
  },
  calendarCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  calendarCellToday: {
    backgroundColor: Colors.primaryLight + '30',
    borderRadius: BorderRadius.medium,
  },
  calendarCellSelected: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.medium,
  },
  calendarDayText: {
    ...Typography.body,
    color: Colors.textDark,
  },
  calendarDayTextToday: {
    color: Colors.primary,
    fontWeight: '700',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  calendarDots: {
    flexDirection: 'row',
    marginTop: 2,
    gap: 2,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...Typography.small,
    color: Colors.textMedium,
  },
  selectedDateSection: {
    padding: Spacing.md,
  },
  selectedDateTitle: {
    ...Typography.h4,
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  calendarBookingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundWhite,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.sm,
    ...Shadows.small,
  },
  calendarBookingInfo: {
    flex: 1,
  },
  calendarBookingRoom: {
    ...Typography.body,
    fontWeight: '700',
    color: Colors.textDark,
  },
  calendarBookingGuest: {
    ...Typography.caption,
    color: Colors.textMedium,
    marginTop: 2,
  },
  calendarBookingDates: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 2,
  },
  calendarBookingAction: {
    padding: Spacing.sm,
  },
  noBookingsText: {
    ...Typography.caption,
    color: Colors.textLight,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
