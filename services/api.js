import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// Get API URL from environment or use deployed backend
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dine-backend-lake.vercel.app';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.isRefreshing = false;
    this.refreshQueue = [];
  }

  // Process queued requests after token refresh
  processQueue(newToken) {
    this.refreshQueue.forEach(({ resolve }) => resolve(newToken));
    this.refreshQueue = [];
  }

  // Reject all queued requests on refresh failure
  rejectQueue(error) {
    this.refreshQueue.forEach(({ reject }) => reject(error));
    this.refreshQueue = [];
  }

  // Wait for token refresh if one is in progress
  waitForRefresh() {
    return new Promise((resolve, reject) => {
      this.refreshQueue.push({ resolve, reject });
    });
  }

  // Attempt to refresh the token
  async refreshToken() {
    const currentToken = await this.getToken();
    if (!currentToken) {
      throw new Error('No token to refresh');
    }

    try {
      const response = await axios({
        url: `${this.baseURL}/api/auth/refresh`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        }
      });

      const data = response.data;

      if (!data.success) {
        throw new Error(data.error || 'Token refresh failed');
      }

      // Save the new token
      await this.setToken(data.token);
      return data.token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
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
      // Reset refresh state
      this.isRefreshing = false;
      this.refreshQueue = [];
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
  async request(endpoint, options = {}, isRetry = false) {
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
        // Staff/employee deactivated: show friendly notice, clear auth, then redirect to login
        if (error.response.status === 401 && error.response.data?.inactive === true) {
          await this.clearToken();
          const message = error.response.data?.message || 'Your account has been deactivated. Please contact your manager.';
          Alert.alert(
            'Account deactivated',
            `${message} You have been logged out.`,
            [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
            { cancelable: false }
          );
          throw new Error('Account deactivated');
        }

        // Handle token expiration (403 with "Invalid or expired token")
        if (error.response.status === 403 && !isRetry) {
          const errorMsg = error.response.data?.error || error.response.data?.message || '';

          if (errorMsg.toLowerCase().includes('invalid or expired token')) {
            console.log('🔄 Token expired - attempting refresh...');

            // If already refreshing, wait for it
            if (this.isRefreshing) {
              try {
                await this.waitForRefresh();
                // Retry with new token
                return this.request(endpoint, options, true);
              } catch (refreshError) {
                await this.clearToken();
                Alert.alert(
                  'Session Expired',
                  'Your session has expired. Please login again.',
                  [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
                  { cancelable: false }
                );
                throw new Error('Session expired. Please login again.');
              }
            }

            // Start token refresh
            this.isRefreshing = true;

            try {
              const newToken = await this.refreshToken();
              this.isRefreshing = false;
              this.processQueue(newToken);

              console.log('✅ Token refreshed successfully - retrying request');
              // Retry the original request with new token
              return this.request(endpoint, options, true);
            } catch (refreshError) {
              this.isRefreshing = false;
              this.rejectQueue(refreshError);

              console.log('❌ Token refresh failed - logging out');
              await this.clearToken();
              Alert.alert(
                'Session Expired',
                'Your session has expired. Please login again.',
                [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }],
                { cancelable: false }
              );
              throw new Error('Session expired. Please login again.');
            }
          }
        }

        throw new Error(error.response.data?.error || error.response.data?.message || 'Request failed');
      } else if (error.request) {
        throw new Error('Network error. Please check your connection.');
      } else {
        throw new Error(error.message || 'An unexpected error occurred');
      }
    }
  }

  // Manually refresh the auth token - can be used proactively
  async refreshAuthToken() {
    try {
      const newToken = await this.refreshToken();
      console.log('✅ Auth token refreshed successfully');
      return { success: true, token: newToken };
    } catch (error) {
      console.error('❌ Failed to refresh auth token:', error);
      return { success: false, error: error.message };
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

  // ==================== OWNER AUTH ====================

  // Google login (owner)
  async googleLogin(uid, email, name, picture) {
    const response = await this.request('/api/auth/google', {
      method: 'POST',
      data: { uid, email, name, picture },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
      }
    }

    return response;
  }

  // Email login (owner)
  async emailLogin(email, password) {
    const response = await this.request('/api/auth/email/login', {
      method: 'POST',
      data: { email, password },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
      }
    }

    return response;
  }

  // Email registration with OTP (owner)
  async emailRegister(email, password, confirmPassword, name, otp) {
    const response = await this.request('/api/auth/email/register', {
      method: 'POST',
      data: { email, password, confirmPassword, name, otp },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
      }
    }

    return response;
  }

  // Send email OTP for registration or linking
  async emailSendOtp(email, purpose = 'registration') {
    return this.request('/api/auth/email/send-otp', {
      method: 'POST',
      data: { email, purpose },
    });
  }

  // Firebase verify (for phone OTP login via Firebase)
  async firebaseVerify(uid, phoneNumber, email, displayName) {
    const response = await this.request('/api/auth/firebase/verify', {
      method: 'POST',
      data: { uid, phoneNumber, email, displayName },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
      }
    }

    return response;
  }

  // Backend phone OTP (for test/whitelisted numbers that bypass Firebase)
  async phoneSendOtp(phone) {
    return this.request('/api/auth/phone/send-otp', {
      method: 'POST',
      data: { phone },
    });
  }

  async phoneVerifyOtp(phone, otp) {
    const response = await this.request('/api/auth/phone/verify-otp', {
      method: 'POST',
      data: { phone, otp },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
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

  // Create a new floor
  async createFloor(restaurantId, floorData) {
    return this.request(`/api/floors/${restaurantId}`, {
      method: 'POST',
      data: floorData,
    });
  }

  // Update a floor
  async updateFloor(floorId, floorData) {
    return this.request(`/api/floors/${floorId}`, {
      method: 'PATCH',
      data: floorData,
    });
  }

  // Create a table
  async createTable(restaurantId, tableData) {
    return this.request(`/api/tables/${restaurantId}`, {
      method: 'POST',
      data: tableData,
    });
  }

  // Bulk create tables
  async bulkCreateTables(restaurantId, bulkData) {
    return this.request(`/api/tables/${restaurantId}/bulk`, {
      method: 'POST',
      data: bulkData,
    });
  }

  // Delete a table
  async deleteTable(tableId, restaurantId = null) {
    const data = {};
    if (restaurantId) data.restaurantId = restaurantId;
    return this.request(`/api/tables/${tableId}`, {
      method: 'DELETE',
      data,
    });
  }

  // Delete a floor
  async deleteFloor(floorId, restaurantId = null) {
    const data = {};
    if (restaurantId) data.restaurantId = restaurantId;
    return this.request(`/api/floors/${floorId}`, {
      method: 'DELETE',
      data,
    });
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

  // Get analytics for restaurant
  async getAnalytics(restaurantId, period = 'today', options = {}) {
    const params = new URLSearchParams({ period });
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    return this.request(`/api/analytics/${restaurantId}?${params.toString()}`);
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

  // Delete order (soft delete - sets status to 'deleted')
  async deleteOrder(orderId, reason) {
    return this.request(`/api/orders/${orderId}`, {
      method: 'DELETE',
      data: reason ? { reason } : undefined,
    });
  }

  // KOT (Kitchen Order Ticket) endpoints
  async getKotOrders(restaurantId) {
    return this.request(`/api/kot/${restaurantId}`);
  }

  async startCooking(orderId) {
    return this.request(`/api/kot/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'preparing', cookingStartTime: new Date().toISOString() },
    });
  }

  async markReady(orderId) {
    return this.request(`/api/kot/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'ready', cookingEndTime: new Date().toISOString() },
    });
  }

  async completeOrder(orderId) {
    return this.request(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'completed' },
    });
  }

  async cancelKotOrder(orderId, reason = '') {
    return this.request(`/api/orders/${orderId}/cancel`, {
      method: 'PATCH',
      data: { reason },
    });
  }

  // Saved Carts (parked orders & templates — separate from orders, no side effects)
  async getSavedCarts(restaurantId, type = null) {
    const query = type ? `?type=${type}` : '';
    return this.request(`/api/saved-carts/${restaurantId}${query}`);
  }

  async createSavedCart(cartData) {
    return this.request('/api/saved-carts', {
      method: 'POST',
      data: cartData,
    });
  }

  async updateSavedCart(cartId, updateData) {
    return this.request(`/api/saved-carts/${cartId}`, {
      method: 'PATCH',
      data: updateData,
    });
  }

  async deleteSavedCart(cartId) {
    return this.request(`/api/saved-carts/${cartId}`, {
      method: 'DELETE',
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

  // Update restaurant details (business info, legal name, GSTIN, etc.)
  async updateRestaurant(restaurantId, data) {
    return this.request(`/api/restaurants/${restaurantId}`, {
      method: 'PATCH',
      data,
    });
  }

  // Get all restaurants for authenticated user
  async getRestaurants() {
    return this.request('/api/restaurants');
  }

  // Update user preferences (e.g. defaultRestaurantId)
  async updateUserPreferences(preferences) {
    return this.request('/api/user/preferences', {
      method: 'PATCH',
      data: preferences,
    });
  }

  // Create a new restaurant
  async createRestaurant(data) {
    return this.request('/api/restaurants', {
      method: 'POST',
      data,
    });
  }

  // Delete a restaurant
  async deleteRestaurant(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}`, {
      method: 'DELETE',
    });
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

  // Bulk menu upload (image/PDF/CSV/doc) - AI extraction, same as web
  async bulkUploadMenu(restaurantId, formData) {
    const token = await this.getToken();
    const url = `${this.baseURL}/api/menus/bulk-upload/${restaurantId}`;
    const config = {
      method: 'POST',
      data: formData,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        // Omit Content-Type so axios sets multipart/form-data with boundary
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    };
    try {
      const response = await axios(url, config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.response.data?.message || 'Upload failed');
      }
      if (error.request) {
        throw new Error('Network error. Please check your connection.');
      }
      throw new Error(error.message || 'Upload failed');
    }
  }

  async bulkSaveMenuItems(restaurantId, menuItems, categories = null) {
    const body = { menuItems };
    if (categories && Array.isArray(categories) && categories.length > 0) {
      body.categories = categories;
    }
    return this.request(`/api/menus/bulk-save/${restaurantId}`, {
      method: 'POST',
      data: body,
    });
  }

  // Upload images to menu item (max 4 images)
  async uploadMenuItemImages(itemId, formData) {
    const token = await this.getToken();
    const url = `${this.baseURL}/api/menu-items/${itemId}/images`;
    const config = {
      method: 'POST',
      data: formData,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    };
    try {
      const response = await axios(url, config);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.error || error.response.data?.message || 'Image upload failed');
      }
      throw new Error(error.message || 'Image upload failed');
    }
  }

  // Delete menu item image
  async deleteMenuItemImage(itemId, imageIndex) {
    return this.request(`/api/menu-items/${itemId}/images/${imageIndex}`, {
      method: 'DELETE',
    });
  }

  // Toggle menu item favorite
  async toggleMenuItemFavorite(restaurantId, itemId, isFavorite) {
    if (isFavorite) {
      return this.request(`/api/menus/${restaurantId}/item/${itemId}/favorite`, {
        method: 'POST',
      });
    } else {
      return this.request(`/api/menus/${restaurantId}/item/${itemId}/favorite`, {
        method: 'DELETE',
      });
    }
  }

  // Toggle menu item availability (out of stock)
  async toggleMenuItemAvailability(itemId, isAvailable) {
    return this.request(`/api/menus/item/${itemId}`, {
      method: 'PATCH',
      data: { isAvailable },
    });
  }

  // ==================== HOTEL MANAGEMENT ====================

  // Room Management
  async getRooms(restaurantId, filters = {}) {
    const params = new URLSearchParams(filters);
    const queryString = params.toString();
    return this.request(`/api/rooms/${restaurantId}${queryString ? `?${queryString}` : ''}`);
  }

  async addRoom(roomData) {
    return this.request('/api/room', {
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
    return this.request(`/api/room/${roomId}/status`, {
      method: 'PATCH',
      data: { status, currentGuest },
    });
  }

  async deleteRoom(roomId) {
    return this.request(`/api/room/${roomId}`, {
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

  // Table Booking Management
  async getBookings(restaurantId, filters = {}) {
    const params = new URLSearchParams(filters);
    const queryString = params.toString();
    return this.request(`/api/bookings/${restaurantId}${queryString ? `?${queryString}` : ''}`);
  }

  async createBooking(restaurantId, bookingData) {
    return this.request(`/api/bookings/${restaurantId}`, {
      method: 'POST',
      data: bookingData,
    });
  }

  async cancelBooking(bookingId) {
    return this.request(`/api/bookings/${bookingId}`, {
      method: 'DELETE',
    });
  }

  // Hotel Room Booking Management
  async getHotelBookings(restaurantId, filters = {}) {
    const params = new URLSearchParams(filters);
    const queryString = params.toString();
    return this.request(`/api/room-bookings/${restaurantId}${queryString ? `?${queryString}` : ''}`);
  }

  async createHotelBooking(bookingData) {
    return this.request('/api/booking', {
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

  async cancelHotelBooking(bookingId, reason) {
    return this.request(`/api/booking/${bookingId}/cancel`, {
      method: 'PATCH',
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

  // Staff password change (for staff members using loginId)
  async changeStaffPassword(loginId, currentPassword, newPassword, confirmPassword) {
    return this.request('/api/staff/change-password', {
      method: 'POST',
      data: { loginId, currentPassword, newPassword, confirmPassword },
    });
  }

  // ==================== CRAVE APP PUBLIC ENDPOINTS ====================

  // Get restaurant by code (for QR scanning)
  async getRestaurantByCode(code) {
    return this.request(`/api/public/restaurant/code/${code}`);
  }

  // Get public menu (no auth required)
  async getPublicMenu(restaurantId) {
    return this.request(`/api/public/menu/${restaurantId}`);
  }

  // Get public menu theme
  async getPublicMenuTheme(restaurantId) {
    return this.request(`/api/public/menu-theme/${restaurantId}`);
  }

  // Get active offers for a restaurant
  async getActiveOffers(restaurantId) {
    return this.request(`/api/public/offers/${restaurantId}`);
  }

  // Get active offers for POS (authenticated, full fields including scope/schedule/bogoConfig)
  async getActiveOffersForPOS(restaurantId, isFirstOrder) {
    const params = isFirstOrder !== undefined ? `?isFirstOrder=${isFirstOrder}` : '';
    return this.request(`/api/offers/${restaurantId}/active${params}`);
  }

  // Place public order (for customer self-ordering)
  async placePublicOrder(restaurantId, orderData) {
    return this.request(`/api/public/orders/${restaurantId}`, {
      method: 'POST',
      data: orderData,
    });
  }

  // Get floors and tables (public)
  async getPublicTables(restaurantId) {
    return this.request(`/api/tables/${restaurantId}`);
  }

  // Get public floors
  async getPublicFloors(restaurantId) {
    return this.request(`/api/floors/${restaurantId}`);
  }

  // Get customer app settings (public)
  async getPublicCustomerAppSettings(restaurantId) {
    return this.request(`/api/public/customer-app-settings/${restaurantId}`);
  }

  // Get customer app settings (authenticated - full settings)
  async getCustomerAppSettings(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}/customer-app-settings`);
  }

  // Save customer app settings
  async updateCustomerAppSettings(restaurantId, settings) {
    return this.request(`/api/restaurants/${restaurantId}/customer-app-settings`, {
      method: 'PUT',
      data: settings,
    });
  }

  // Generate restaurant code for Crave app
  async generateRestaurantCode(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}/generate-code`, {
      method: 'POST',
    });
  }

  // Check URL slug availability
  async checkSlugAvailability(slug, excludeRestaurantId = null) {
    const params = excludeRestaurantId ? `?excludeRestaurantId=${excludeRestaurantId}` : '';
    return this.request(`/api/public/check-slug/${slug}${params}`);
  }

  // Save custom URL slug
  async updateRestaurantSlug(restaurantId, slug) {
    return this.request(`/api/restaurants/${restaurantId}/slug`, {
      method: 'PATCH',
      data: { slug },
    });
  }

  // Lookup customer by phone (for loyalty points)
  async lookupCustomerByPhone(restaurantId, phone, countryCode) {
    return this.request('/api/public/customer/lookup', {
      method: 'POST',
      data: { restaurantId, phone, countryCode },
    });
  }

  // ==================== TAX SETTINGS ====================

  // Get tax settings for a restaurant
  async getTaxSettings(restaurantId) {
    return this.request(`/api/admin/tax/${restaurantId}`);
  }

  // Update tax settings for a restaurant
  async updateTaxSettings(restaurantId, taxSettings) {
    return this.request(`/api/admin/tax/${restaurantId}`, {
      method: 'PUT',
      data: { taxSettings },
    });
  }

  // ==================== PRICING SETTINGS ====================

  // Get pricing settings (zone pricing) for a restaurant
  async getPricingSettings(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}/pricing-settings`);
  }

  // Update pricing settings for a restaurant
  async updatePricingSettings(restaurantId, settings) {
    return this.request(`/api/restaurants/${restaurantId}/pricing-settings`, {
      method: 'PUT',
      data: settings,
    });
  }

  // ==================== ADMIN SETTINGS ====================

  // Get admin settings (order management, system settings, etc.)
  async getAdminSettings(restaurantId) {
    return this.request(`/api/admin/settings/${restaurantId}`);
  }

  // Update admin settings
  async updateAdminSettings(restaurantId, settings) {
    return this.request(`/api/admin/settings/${restaurantId}`, {
      method: 'PUT',
      data: settings,
    });
  }

  // ==================== OFFERS ====================

  // Get all offers for a restaurant (admin)
  async getOffers(restaurantId) {
    return this.request(`/api/offers/${restaurantId}`);
  }

  // Create an offer
  async createOffer(restaurantId, offerData) {
    return this.request(`/api/offers/${restaurantId}`, {
      method: 'POST',
      data: offerData,
    });
  }

  // Update an offer
  async updateOffer(restaurantId, offerId, offerData) {
    return this.request(`/api/offers/${restaurantId}/${offerId}`, {
      method: 'PUT',
      data: offerData,
    });
  }

  // Delete an offer
  async deleteOffer(restaurantId, offerId) {
    return this.request(`/api/offers/${restaurantId}/${offerId}`, {
      method: 'DELETE',
    });
  }

  // ==================== CUSTOMERS ====================

  // Get customers list for a restaurant
  async getCustomers(restaurantId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/customers/${restaurantId}${queryString ? `?${queryString}` : ''}`);
  }

  // Get full customer detail by ID
  async getCustomerDetail(customerId) {
    return this.request(`/api/customers/detail/${customerId}`);
  }

  // Get customer loyalty history
  async getCustomerLoyaltyHistory(customerId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/public/customer/${customerId}/loyalty-history${queryString ? `?${queryString}` : ''}`);
  }

  // Create customer
  async createCustomer(customerData) {
    return this.request('/api/customers', {
      method: 'POST',
      data: customerData,
    });
  }

  // Update customer
  async updateCustomer(customerId, customerData) {
    return this.request(`/api/customers/${customerId}`, {
      method: 'PATCH',
      data: customerData,
    });
  }

  // Delete customer
  async deleteCustomer(customerId) {
    return this.request(`/api/customers/${customerId}`, {
      method: 'DELETE',
    });
  }

  // Get customer orders
  async getCustomerOrders(customerId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/public/customer/${customerId}/orders${queryString ? `?${queryString}` : ''}`);
  }

  // ==================== STAFF MANAGEMENT ====================

  async getStaffList(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/owner/staff${queryString ? `?${queryString}` : ''}`);
  }

  async addStaff(restaurantId, staffData) {
    return this.request(`/api/staff/${restaurantId}`, {
      method: 'POST',
      data: staffData,
    });
  }

  async updateStaff(staffId, data) {
    return this.request(`/api/staff/${staffId}`, {
      method: 'PATCH',
      data,
    });
  }

  async deleteStaff(staffId) {
    return this.request(`/api/staff/${staffId}`, {
      method: 'DELETE',
    });
  }

  async updateStaffStatus(staffId, status) {
    return this.request(`/api/owner/staff/${staffId}/status`, {
      method: 'PATCH',
      data: { status },
    });
  }

  // Get staff credentials (loginId + temporary password)
  async getStaffCredentials(staffId) {
    return this.request(`/api/staff/${staffId}/credentials`);
  }

  // Reset staff password (generates new temporary password)
  async resetStaffPassword(staffId) {
    return this.request(`/api/staff/${staffId}/reset-password`, {
      method: 'POST',
    });
  }

  // ==================== HEADQUARTERS / OWNER DASHBOARD ====================

  async getOwnerDashboard(params = {}) {
    const query = new URLSearchParams();
    if (params.period) query.append('period', params.period);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    const qs = query.toString();
    return this.request(`/api/owner/dashboard${qs ? `?${qs}` : ''}`);
  }

  async getOwnerAnalytics(params = {}) {
    const query = new URLSearchParams();
    if (params.period) query.append('period', params.period);
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    if (params.restaurantIds) {
      params.restaurantIds.forEach(id => query.append('restaurantIds[]', id));
    }
    const qs = query.toString();
    return this.request(`/api/owner/analytics${qs ? `?${qs}` : ''}`);
  }

  async getAIInsights(params = {}) {
    const query = new URLSearchParams();
    if (params.period) query.append('period', params.period);
    if (params.restaurantIds) {
      params.restaurantIds.forEach(id => query.append('restaurantIds[]', id));
    }
    const qs = query.toString();
    return this.request(`/api/ai/insights${qs ? `?${qs}` : ''}`);
  }

  async getAIUsage() {
    return this.request('/api/ai/usage');
  }

  async getOwnerMenuItems(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.category) query.append('category', params.category);
    if (params.search) query.append('search', params.search);
    if (params.restaurantIds) {
      params.restaurantIds.forEach(id => query.append('restaurantIds[]', id));
    }
    const qs = query.toString();
    return this.request(`/api/owner/menu-items${qs ? `?${qs}` : ''}`);
  }

  async getOwnerInventory(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.limit) query.append('limit', params.limit);
    if (params.stockStatus) query.append('stockStatus', params.stockStatus);
    if (params.category) query.append('category', params.category);
    if (params.search) query.append('search', params.search);
    if (params.restaurantIds) {
      params.restaurantIds.forEach(id => query.append('restaurantIds[]', id));
    }
    const qs = query.toString();
    return this.request(`/api/owner/inventory${qs ? `?${qs}` : ''}`);
  }

  // ==================== INVENTORY MANAGEMENT ====================

  async getInventoryItems(restaurantId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/inventory/${restaurantId}${qs ? `?${qs}` : ''}`);
  }

  async getInventoryDashboard(restaurantId) {
    return this.request(`/api/inventory/${restaurantId}/dashboard`);
  }

  async getInventoryTransactions(restaurantId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/inventory/${restaurantId}/transactions${qs ? `?${qs}` : ''}`);
  }

  async getInventoryUsageSummary(restaurantId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/inventory/${restaurantId}/usage-summary${qs ? `?${qs}` : ''}`);
  }

  async getRecipes(restaurantId) {
    return this.request(`/api/recipes/${restaurantId}`);
  }

  async createInventoryItem(restaurantId, itemData) {
    return this.request(`/api/inventory/${restaurantId}`, { method: 'POST', data: itemData });
  }

  async updateInventoryItem(restaurantId, itemId, updateData) {
    return this.request(`/api/inventory/${restaurantId}/${itemId}`, { method: 'PATCH', data: updateData });
  }

  // Quick Order Logger
  async parseQuickOrderText(restaurantId, text) {
    return this.request(`/api/inventory/${restaurantId}/quick-order`, {
      method: 'POST',
      data: { mode: 'parse', subMode: 'text', text },
    });
  }

  async parseQuickOrderImage(restaurantId, imageUri, mimeType = 'image/jpeg') {
    const formData = new FormData();
    formData.append('mode', 'parse');
    formData.append('subMode', 'image');
    formData.append('image', {
      uri: imageUri,
      name: 'order_photo.jpg',
      type: mimeType,
    });
    return this.request(`/api/inventory/${restaurantId}/quick-order`, {
      method: 'POST',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async confirmQuickOrder(restaurantId, items, source, notes = '') {
    return this.request(`/api/inventory/${restaurantId}/quick-order`, {
      method: 'POST',
      data: { mode: 'confirm', items, source, notes },
    });
  }

  // ==================== INVENTORY EXTENDED ====================

  async deleteInventoryItem(restaurantId, itemId) {
    return this.request(`/api/inventory/${restaurantId}/${itemId}`, { method: 'DELETE' });
  }

  async getInventoryCategories(restaurantId) {
    return this.request(`/api/inventory/${restaurantId}/categories`);
  }

  // ==================== SUPPLIERS ====================

  async getSuppliers(restaurantId) {
    return this.request(`/api/suppliers/${restaurantId}`);
  }

  async createSupplier(restaurantId, data) {
    return this.request(`/api/suppliers/${restaurantId}`, { method: 'POST', data });
  }

  async deleteSupplier(restaurantId, supplierId) {
    return this.request(`/api/suppliers/${restaurantId}/${supplierId}`, { method: 'DELETE' });
  }

  async getAllSuppliersPerformance(restaurantId) {
    return this.request(`/api/suppliers/${restaurantId}/performance`);
  }

  // ==================== RECIPES EXTENDED ====================

  async createRecipe(restaurantId, data) {
    return this.request(`/api/recipes/${restaurantId}`, { method: 'POST', data });
  }

  async updateRecipe(restaurantId, recipeId, data) {
    return this.request(`/api/recipes/${restaurantId}/${recipeId}`, { method: 'PATCH', data });
  }

  async deleteRecipe(restaurantId, recipeId) {
    return this.request(`/api/recipes/${restaurantId}/${recipeId}`, { method: 'DELETE' });
  }

  async generateRecipeSteps(restaurantId, data) {
    return this.request(`/api/recipes/${restaurantId}/generate-steps`, { method: 'POST', data });
  }

  // ==================== PURCHASE ORDERS ====================

  async getPurchaseOrders(restaurantId) {
    return this.request(`/api/purchase-orders/${restaurantId}`);
  }

  async createPurchaseOrder(restaurantId, data) {
    return this.request(`/api/purchase-orders/${restaurantId}`, { method: 'POST', data });
  }

  async updatePurchaseOrder(restaurantId, orderId, data) {
    return this.request(`/api/purchase-orders/${restaurantId}/${orderId}`, { method: 'PATCH', data });
  }

  async emailPurchaseOrder(restaurantId, orderId, data) {
    return this.request(`/api/purchase-orders/${restaurantId}/${orderId}/email`, { method: 'POST', data });
  }

  // ==================== AI INSIGHTS ====================

  async getAIReorderSuggestions(restaurantId) {
    return this.request(`/api/ai/reorder-suggestions/${restaurantId}`);
  }

  async getAIWastePrediction(restaurantId) {
    return this.request(`/api/ai/waste-prediction/${restaurantId}`);
  }

  async getAIWasteSummary(restaurantId) {
    return this.request(`/api/ai/waste-summary/${restaurantId}`);
  }

  // ==================== SCM (READ-ONLY) ====================

  async getPurchaseRequisitions(restaurantId) {
    return this.request(`/api/purchase-requisitions/${restaurantId}`);
  }

  async getGRNs(restaurantId) {
    return this.request(`/api/grn/${restaurantId}`);
  }

  async getSupplierInvoices(restaurantId) {
    return this.request(`/api/supplier-invoices/${restaurantId}`);
  }

  async getSupplierReturns(restaurantId) {
    return this.request(`/api/supplier-returns/${restaurantId}`);
  }

  async getStockTransfers(restaurantId) {
    return this.request(`/api/stock-transfers/${restaurantId}`);
  }

  // ==================== PRINT SETTINGS ====================

  async getPrintSettings(restaurantId) {
    return this.request(`/api/admin/print-settings/${restaurantId}`);
  }

  async updatePrintSettings(restaurantId, printSettings) {
    return this.request(`/api/admin/print-settings/${restaurantId}`, {
      method: 'PUT',
      data: { printSettings },
    });
  }

  // ==================== CURRENCY SETTINGS ====================

  async getCurrencySettings(restaurantId) {
    return this.request(`/api/admin/currency/${restaurantId}`);
  }

  async updateCurrencySettings(restaurantId, currencySettings) {
    return this.request(`/api/admin/currency/${restaurantId}`, {
      method: 'PUT',
      data: currencySettings,
    });
  }

  // ==================== BUSINESS SETTINGS ====================

  // Get business settings for a restaurant (legal name, GSTIN for invoices)
  async getBusinessSettings(restaurantId) {
    return this.request(`/api/admin/business/${restaurantId}`);
  }

  // Update business settings for a restaurant
  async updateBusinessSettings(restaurantId, settings) {
    return this.request(`/api/admin/business/${restaurantId}`, {
      method: 'PUT',
      data: settings,
    });
  }

  // ==================== BILLING SETTINGS ====================

  async getBillingSettings(restaurantId) {
    return this.request(`/api/restaurants/${restaurantId}/billing-settings`);
  }

  async updateBillingSettings(restaurantId, settings) {
    return this.request(`/api/restaurants/${restaurantId}/billing-settings`, {
      method: 'PUT',
      data: settings,
    });
  }

  async validateManagerPin(restaurantId, pin) {
    return this.request('/api/billing/validate-manager-pin', {
      method: 'POST',
      data: { restaurantId, pin },
    });
  }

  async processRefund(orderId, data) {
    return this.request(`/api/orders/${orderId}/refund`, {
      method: 'POST',
      data: data,
    });
  }

  async recordPartialPayment(orderId, data) {
    return this.request(`/api/orders/${orderId}/partial-payment`, {
      method: 'POST',
      data: data,
    });
  }

  async compVoidItems(orderId, data) {
    return this.request(`/api/orders/${orderId}/comp-void`, {
      method: 'POST',
      data: data,
    });
  }

  async getCustomerCreditHistory(customerId) {
    return this.request(`/api/customers/${customerId}/credit-history`);
  }

  async settleCustomerCredit(customerId, data) {
    return this.request(`/api/customers/${customerId}/settle-credit`, {
      method: 'POST',
      data: data,
    });
  }

  async getStaffTips(userId) {
    return this.request(`/api/staff/${userId}/tips`);
  }

  // ==================== PAYMENTS ====================

  // Verify/record a payment
  async verifyPayment(paymentData) {
    return this.request('/api/payments/verify', {
      method: 'POST',
      data: paymentData,
    });
  }
}

export default new ApiClient();
