import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get API URL from environment or use deployed backend
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dine-backend-lake.vercel.app';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Get auth token from storage
  async getToken() {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  // Set auth token in storage
  async setToken(token) {
    try {
      await AsyncStorage.setItem('authToken', token);
    } catch (error) {
      console.error('Error setting token:', error);
    }
  }

  // Get user data from storage
  async getUser() {
    try {
      const userData = await AsyncStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  // Set user data in storage
  async setUser(userData) {
    try {
      await AsyncStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Error setting user:', error);
    }
  }

  // Clear auth data
  async clearToken() {
    try {
      await AsyncStorage.multiRemove(['authToken', 'user']);
    } catch (error) {
      console.error('Error clearing token:', error);
    }
  }

  // Check if user is authenticated
  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }

  // Make authenticated request
  async request(endpoint, options = {}) {
    const token = await this.getToken();
    const url = `${this.baseURL}${endpoint}`;

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    };

    try {
      const response = await axios(url, config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.response.data?.message || 'Request failed');
      } else if (error.request) {
        throw new Error('Network error. Please check your connection.');
      } else {
        throw new Error(error.message || 'An unexpected error occurred');
      }
    }
  }

  // Staff login
  async staffLogin(loginId, password) {
    const response = await this.request('/api/auth/staff/login', {
      method: 'POST',
      data: { loginId, password },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser({
          ...response.user,
          restaurant: response.restaurant,
          owner: response.owner,
        });
      }
    }

    return response;
  }

  // Get menu items
  async getMenu(restaurantId) {
    return this.request(`/api/menus/${restaurantId}`);
  }

  // Get floors and tables
  async getFloors(restaurantId) {
    // Use the floors endpoint which returns floors with nested tables
    return this.request(`/api/floors/${restaurantId}`);
  }

  // Get tables (alternative endpoint)
  async getTables(restaurantId) {
    return this.request(`/api/tables/${restaurantId}`);
  }

  // Update table status
  async updateTableStatus(tableId, status, orderId = null, restaurantId = null) {
    const body = { status };
    if (orderId) body.orderId = orderId;
    if (restaurantId) body.restaurantId = restaurantId;
    
    return this.request(`/api/tables/${tableId}/status`, {
      method: 'PATCH',
      data: body,
    });
  }

  // Get orders
  async getOrders(restaurantId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/orders/${restaurantId}${queryString ? `?${queryString}` : ''}`;
    return this.request(endpoint);
  }

  // Create order
  async createOrder(orderData) {
    return this.request('/api/orders', {
      method: 'POST',
      data: orderData,
    });
  }

  // Update order
  async updateOrder(orderId, orderData) {
    return this.request(`/api/orders/${orderId}`, {
      method: 'PATCH',
      data: orderData,
    });
  }

  // Update order status
  async updateOrderStatus(orderId, status, restaurantId) {
    return this.request(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      data: { status, restaurantId },
    });
  }

  // Get order by ID
  async getOrderById(restaurantId, orderId) {
    const response = await this.getOrders(restaurantId, { search: orderId, limit: 1 });
    if (response.orders && response.orders.length > 0) {
      return response.orders[0];
    }
    return null;
  }

  // Process voice order
  async processVoiceOrder(transcript, restaurantId) {
    return this.request('/api/voice/process-order', {
      method: 'POST',
      data: { transcript, restaurantId },
    });
  }

  // Get restaurant details
  async getRestaurant(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}`);
  }

  // Menu Management
  async createMenuItem(restaurantId, itemData) {
    return this.request(`/api/menus/${restaurantId}`, {
      method: 'POST',
      data: itemData,
    });
  }

  async updateMenuItem(itemId, itemData) {
    return this.request(`/api/menus/item/${itemId}`, {
      method: 'PATCH',
      data: itemData,
    });
  }

  async deleteMenuItem(itemId) {
    return this.request(`/api/menus/item/${itemId}`, {
      method: 'DELETE',
    });
  }

  // ==================== HOTEL MANAGEMENT ====================

  // Room Management
  async getRooms(restaurantId, filters = {}) {
    const params = new URLSearchParams({ restaurantId, ...filters });
    return this.request(`/api/rooms?${params.toString()}`);
  }

  async addRoom(roomData) {
    return this.request('/api/rooms', {
      method: 'POST',
      data: roomData,
    });
  }

  async bulkAddRooms(bulkData) {
    return this.request('/api/rooms/bulk', {
      method: 'POST',
      data: bulkData,
    });
  }

  async updateRoomStatus(roomId, status, currentGuest = null) {
    return this.request(`/api/rooms/${roomId}/status`, {
      method: 'PATCH',
      data: { status, currentGuest },
    });
  }

  async deleteRoom(roomId) {
    return this.request(`/api/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }

  async getRoomMaintenanceSchedules(roomId, restaurantId) {
    return this.request(`/api/room/${roomId}/maintenance?restaurantId=${restaurantId}`);
  }

  async cancelRoomMaintenance(roomId, restaurantId, startDate = null, endDate = null) {
    const data = { restaurantId };
    if (startDate) data.startDate = startDate;
    if (endDate) data.endDate = endDate;
    return this.request(`/api/room/${roomId}/maintenance`, {
      method: 'DELETE',
      data,
    });
  }

  async getRoomAvailability(restaurantId, date) {
    return this.request(`/api/hotel/rooms/availability?date=${date}&restaurantId=${restaurantId}`);
  }

  // Booking Management
  async getBookings(restaurantId, filters = {}) {
    const params = new URLSearchParams({ restaurantId, ...filters });
    return this.request(`/api/bookings/${restaurantId}?${params.toString()}`);
  }

  async createBooking(bookingData) {
    return this.request('/api/bookings', {
      method: 'POST',
      data: bookingData,
    });
  }

  async validateBooking(validationData) {
    return this.request('/api/hotel/bookings/validate', {
      method: 'POST',
      data: validationData,
    });
  }

  async cancelBooking(bookingId, reason) {
    return this.request(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      data: { reason },
    });
  }

  // Check-in/Check-out
  async hotelCheckIn(checkInData) {
    return this.request('/api/hotel/checkin', {
      method: 'POST',
      data: checkInData,
    });
  }

  async getHotelCheckIns(restaurantId, status = 'all') {
    return this.request(`/api/hotel/checkins/${restaurantId}?status=${status}`);
  }

  async hotelCheckOut(checkInId, checkoutData) {
    return this.request(`/api/hotel/checkout/${checkInId}`, {
      method: 'POST',
      data: checkoutData,
    });
  }

  // Invoice
  async getHotelInvoice(checkInId) {
    return this.request(`/api/hotel/invoice/${checkInId}`);
  }

  // History
  async getHotelHistory(restaurantId, filters = {}) {
    const params = new URLSearchParams({ restaurantId, ...filters });
    return this.request(`/api/hotel/history?${params.toString()}`);
  }

  // Calendar
  async getCalendarSummary(restaurantId, month, year) {
    return this.request(`/api/hotel/calendar/summary?month=${month}&year=${year}&restaurantId=${restaurantId}`);
  }
}

export default new ApiClient();
