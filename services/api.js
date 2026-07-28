import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

// Get API URL from environment or use deployed backend
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dine-be2-phi.vercel.app';

// Frontend web URL for WebView embeds (mobile layout)
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://www.dineopen.com';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.isRefreshing = false;
    this.refreshQueue = [];
    // In-memory cache for GET requests
    this._cache = new Map();
    this._inflight = new Map();
    // Offline state (set by OfflineProvider)
    this._offlineState = null;
    // LAN client (set when paired with hub)
    this._lanClient = null;
    // Business day start hour (0 = midnight/default, 1-23 = custom)
    this._businessDayStartHour = 0;
  }

  /**
   * Called by OfflineProvider to pass offline state functions.
   */
  setOfflineState(state) {
    this._offlineState = state;
  }

  /**
   * Set the LAN client for routing API calls through the hub.
   */
  setLanClient(client) {
    this._lanClient = client;
  }

  /**
   * Check if the app is effectively offline.
   */
  isEffectivelyOffline() {
    return this._offlineState?.isEffectivelyOffline?.() ?? false;
  }

  /**
   * Check if offline support is explicitly enabled by the user.
   * When false, the app is online-only — no SQLite reads/writes.
   */
  isOfflineEnabled() {
    return this._offlineState?.isOfflineEnabled?.() ?? false;
  }

  // Cached GET — returns cached data if fresh, deduplicates concurrent requests
  async cachedGet(endpoint, ttlMs = 5 * 60 * 1000) {
    const cached = this._cache.get(endpoint);
    if (cached && (Date.now() - cached.timestamp < ttlMs)) {
      return cached.data;
    }
    // Dedup concurrent requests to same endpoint
    if (this._inflight.has(endpoint)) {
      return this._inflight.get(endpoint);
    }
    const promise = this.request(endpoint).then(data => {
      this._cache.set(endpoint, { data, timestamp: Date.now() });
      this._inflight.delete(endpoint);
      return data;
    }).catch(err => {
      this._inflight.delete(endpoint);
      throw err;
    });
    this._inflight.set(endpoint, promise);
    return promise;
  }

  // Invalidate cache entries matching a prefix
  invalidateCache(prefix) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
      }
    }
  }

  // Clear all cached data
  clearAllCache() {
    this._cache.clear();
  }

  /**
   * Switch API base URL based on restaurant config.
   * If restaurant has pgBackendUrl, route to that URL (e.g. GCP Cloud Run).
   * Otherwise, fall back to the default.
   */
  setRestaurantBaseURL(restaurant) {
    const customUrl = restaurant?.pgBackendUrl;
    const newBase = customUrl || API_BASE_URL;
    if (this.baseURL !== newBase) {
      console.log(`🔀 API routing: ${newBase}${customUrl ? ' (pgBackendUrl)' : ' (default)'}`);
      this.baseURL = newBase;
      this.clearAllCache();
    }
  }

  setBusinessDayStartHour(hour) {
    const n = Number(hour);
    this._businessDayStartHour = (isNaN(n) || n < 0 || n > 23) ? 0 : Math.floor(n);
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

  // Full logout: clear auth + all caches (in-memory + AsyncStorage)
  async logout() {
    // Clear in-memory API cache
    this.clearAllCache();
    // Clear auth tokens
    await this.clearToken();
    // Clear all AsyncStorage cache entries (cache_floors_*, cache_* etc.)
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(k => k.startsWith('cache_'));
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
    } catch (e) {
      console.warn('Cache clear on logout failed:', e.message);
    }
  }

  // Delete user account (Apple Guideline 5.1.1v)
  async deleteAccount() {
    return this.request('/api/user/delete-account', { method: 'POST' });
  }

  // Check if user is authenticated
  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }

  // Make authenticated request
  async request(endpoint, options = {}, isRetry = false) {
    // Auto-inject device timezone offset so backend computes correct date boundaries
    if (!endpoint.includes('tz=')) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint = `${endpoint}${sep}tz=${new Date().getTimezoneOffset()}`;
    }
    // Auto-inject business day start hour if configured
    if (this._businessDayStartHour > 0 && !endpoint.includes('dayStart=')) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint = `${endpoint}${sep}dayStart=${this._businessDayStartHour}`;
    }
    // If paired with LAN hub, route through hub (skip auth endpoints)
    if (this._lanClient?.isPaired() && !endpoint.startsWith('/api/auth/')) {
      try {
        return await this._lanClient.request(endpoint, options);
      } catch (lanErr) {
        console.warn('[API] LAN request failed, falling back to cloud:', lanErr.message);
        // Fall through to cloud
      }
    }

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
          await this.logout();
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
            // If offline, don't attempt refresh/logout — let offlineGet/offlineWrite handle it
            if (this.isEffectivelyOffline()) {
              throw new Error('Network error. Please check your connection.');
            }
            console.log('🔄 Token expired - attempting refresh...');

            // If already refreshing, wait for it
            if (this.isRefreshing) {
              try {
                await this.waitForRefresh();
                // Retry with new token
                return this.request(endpoint, options, true);
              } catch (refreshError) {
                await this.logout();
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
              await this.logout();
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

  // ==================== LOCAL-FIRST REQUEST LAYER ====================

  /**
   * Local-first GET: always read from SQLite first for instant UI.
   * Then refresh from network in background (fire-and-forget).
   */
  async offlineGet(endpoint, { localRead, onFetched, onRefreshed, ttlMs = 5 * 60 * 1000 } = {}) {
    const offlineSupported = this.isOfflineEnabled();

    // Online-first: when connected, always fetch from server (no stale data flash).
    if (!this.isEffectivelyOffline()) {
      try {
        const data = await this.cachedGet(endpoint, ttlMs);
        // Only save to SQLite when offline support is enabled
        if (offlineSupported && onFetched) {
          try { onFetched(data); } catch (e) { console.warn('offlineGet onFetched error:', e.message); }
        }
        return data;
      } catch (err) {
        console.warn(`offlineGet network failed for ${endpoint}:`, err.message);
        // If offline support is not enabled, don't fall back to SQLite — just propagate error
        if (!offlineSupported) throw err;
        // Otherwise fall through to local read below
      }
    }

    // Offline (or network failed with offline support enabled): try local read from SQLite
    let localData = null;
    if (offlineSupported && localRead) {
      try {
        localData = localRead();
      } catch (e) {
        console.warn('offlineGet localRead error:', e.message);
      }
    }

    if (localData !== null && localData !== undefined) {
      return localData;
    }

    throw new Error('No data available. Please check your connection.');
  }

  /**
   * Local-first write: always save to local SQLite + queue for sync.
   * The sync engine pushes to cloud in the background.
   * UI never waits for network — instant response.
   */
  async offlineWrite(endpoint, {
    method = 'POST',
    data,
    entityType,
    operation = 'create',
    priority = 100,
    dependsOn = null,
    onOfflineQueue,
    onSuccess,
    idempotencyKey = null,
  }) {
    // When offline support is not enabled, make a direct API call (no SQLite queue)
    if (!this.isOfflineEnabled()) {
      return this.request(endpoint, {
        method,
        data,
      });
    }

    // When online, make a direct API call to get real server response
    // This ensures callers get actual data (order IDs, etc.) instead of mock responses
    if (!this.isEffectivelyOffline()) {
      try {
        const result = await this.request(endpoint, {
          method,
          data,
        });
        // Call onSuccess callback with server response
        if (onSuccess) {
          try { onSuccess(result); } catch (e) { console.warn('offlineWrite onSuccess error:', e.message); }
        }
        return result;
      } catch (e) {
        // If direct call fails, fall through to offline queue
        console.warn('offlineWrite direct call failed, queuing offline:', e.message);
      }
    }

    // Offline path: queue for background sync
    const { enqueue, generateIdempotencyKey } = require('./syncQueueV2');
    const key = idempotencyKey || generateIdempotencyKey();

    // Add idempotency key to payload
    const payload = { ...data, idempotencyKey: key, syncSource: 'offline' };

    enqueue({
      entityType,
      operation,
      endpoint,
      method,
      payload,
      dependsOn,
      priority,
      idempotencyKey: key,
    });

    // Do optimistic local update
    if (onOfflineQueue) {
      try { onOfflineQueue(key, payload); } catch (e) { console.warn('offlineWrite onOfflineQueue error:', e.message); }
    }

    return { success: true, offline: true, idempotencyKey: key, message: 'Saved locally' };
  }

  /**
   * Seed all reference data into SQLite for offline use.
   * Called after login or manually from settings.
   */
  async seedOfflineData(restaurantId) {
    const offlineStore = require('./offlineStore');
    const { setMeta } = require('./db');
    const errors = [];

    const seed = async (label, fetcher, saver) => {
      try {
        const data = await fetcher();
        saver(data);
      } catch (e) {
        console.warn(`Seed ${label} failed:`, e.message);
        errors.push(label);
      }
    };

    // Restaurant config
    await seed('restaurant', () => this.request(`/api/restaurants/${restaurantId}`), (data) => {
      const restaurant = data.restaurant || data;
      offlineStore.saveRestaurant(restaurantId, restaurant);
    });

    // Menu
    await seed('menu', () => this.request(`/api/menus/${restaurantId}`), (data) => {
      const items = data.menu?.items || data.menuItems || data.items || [];
      offlineStore.saveMenuItems(restaurantId, items);
    });

    // Floors
    await seed('floors', () => this.request(`/api/floors/${restaurantId}`), (data) => {
      const floors = data.floors || data || [];
      offlineStore.saveFloors(restaurantId, Array.isArray(floors) ? floors : []);
    });

    // Tables
    await seed('tables', () => this.request(`/api/tables/${restaurantId}`), (data) => {
      const tables = data.tables || data || [];
      offlineStore.saveTables(restaurantId, Array.isArray(tables) ? tables : []);
    });

    // Tax settings
    await seed('tax', () => this.request(`/api/admin/tax/${restaurantId}`), (data) => {
      offlineStore.saveTaxSettings(restaurantId, data);
    });

    // Billing settings
    await seed('billing', () => this.request(`/api/restaurants/${restaurantId}/billing-settings`), (data) => {
      offlineStore.saveBillingSettings(restaurantId, data);
    });

    // Manager PIN hash (for offline validation)
    await seed('managerPin', () => this.request(`/api/restaurants/${restaurantId}/billing-settings`), (data) => {
      const bs = data?.billingSettings || data;
      if (bs?.managerPin) {
        const Crypto = require('expo-crypto');
        Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(bs.managerPin))
          .then(hash => setMeta('manager_pin_hash', hash))
          .catch(() => {});
      }
    });

    // Pricing settings
    await seed('pricing', () => this.request(`/api/restaurants/${restaurantId}/pricing-settings`), (data) => {
      offlineStore.savePricingSettings(restaurantId, data);
    });

    // Today's orders
    await seed('orders', () => this.request(`/api/orders/${restaurantId}?status=confirmed&status=pending&status=preparing&status=ready&status=saved&limit=200`), (data) => {
      const orders = data.orders || data || [];
      offlineStore.saveOrders(restaurantId, Array.isArray(orders) ? orders : []);
    });

    // Customers
    await seed('customers', () => this.request(`/api/customers/${restaurantId}`), (data) => {
      const customers = data.customers || data || [];
      offlineStore.saveCustomers(restaurantId, Array.isArray(customers) ? customers : []);
    });

    // Offers
    await seed('offers', () => this.request(`/api/offers/${restaurantId}`), (data) => {
      const offers = data.offers || data || [];
      offlineStore.saveOffers(restaurantId, Array.isArray(offers) ? offers : []);
    });

    // Offer settings (offerSettings + loyaltySettings for offline use)
    await seed('offer_settings', () => this.request(`/api/public/customer-app-settings/${restaurantId}`), (data) => {
      const s = data.settings || data || {};
      offlineStore.saveOfferSettings(restaurantId, {
        offerSettings: s.offerSettings || null,
        loyaltySettings: s.loyaltySettings || null,
      });
    });

    // Inventory
    await seed('inventory', () => this.request(`/api/inventory/${restaurantId}`), (data) => {
      const items = data.items || data.inventoryItems || data || [];
      offlineStore.saveInventoryItems(restaurantId, Array.isArray(items) ? items : []);
    });

    // Recipes
    await seed('recipes', () => this.request(`/api/recipes/${restaurantId}`), (data) => {
      const recipes = data.recipes || data || [];
      offlineStore.saveRecipes(restaurantId, Array.isArray(recipes) ? recipes : []);
    });

    // Rooms (hotel)
    await seed('rooms', () => this.request(`/api/rooms/${restaurantId}`), (data) => {
      const rooms = data.rooms || data || [];
      offlineStore.saveRooms(restaurantId, Array.isArray(rooms) ? rooms : []);
    });

    // Saved carts
    await seed('savedCarts', () => this.request(`/api/saved-carts/${restaurantId}`), (data) => {
      const carts = data.savedCarts || data.carts || data || [];
      offlineStore.saveSavedCarts(restaurantId, Array.isArray(carts) ? carts : []);
    });

    setMeta('data_seeded', 'true');
    setMeta('last_seed_at', String(Date.now()));
    setMeta('seeded_restaurant_id', restaurantId);

    return { success: errors.length === 0, errors };
  }

  /**
   * Background seed of offline data after login.
   * Fire-and-forget — does not block the login flow.
   */
  _triggerBackgroundSeed(restaurantId) {
    if (restaurantId) {
      // Fetch currency settings immediately (before seed delay) so UI shows correct symbol
      this._prefetchCurrencySettings(restaurantId);
      // Small delay to let navigation complete first
      setTimeout(() => {
        this.seedOfflineData(restaurantId).catch(e =>
          console.warn('Background seed failed:', e.message)
        );
      }, 3000);
    }
  }

  /**
   * Pre-fetch and cache currency settings so formatCurrency() uses correct symbol.
   * Called immediately after login — non-blocking.
   */
  async _prefetchCurrencySettings(restaurantId) {
    try {
      const response = await this.getCurrencySettings(restaurantId);
      if (response?.success && response?.currencySettings) {
        await AsyncStorage.setItem('currencySettings', JSON.stringify(response.currencySettings));
        // Update the in-memory formatCurrency config
        const { setCurrencyConfig } = require('../utils/formatCurrency');
        setCurrencyConfig(response.currencySettings);
      }
    } catch {} // Non-blocking
  }

  /**
   * Start background pull loop to keep local data fresh.
   * Called by OfflineProvider after DB is ready.
   * HOT data (orders, tables) refreshed every 120s when online & app is active.
   * WARM data (menu, customers) refreshed every 10 min.
   * Automatically pauses when app goes to background to save battery & reads.
   */
  _bgPullTimer = null;
  _bgPullRunning = false;
  _bgPullPaused = false;
  _bgPullAppStateSub = null;

  startBackgroundPull(restaurantId) {
    if (this._bgPullTimer) return;

    // Listen for AppState to pause/resume when app goes to background
    const { AppState } = require('react-native');
    this._bgPullPaused = AppState.currentState !== 'active';
    this._bgPullAppStateSub = AppState.addEventListener('change', (nextState) => {
      this._bgPullPaused = nextState !== 'active';
    });

    let hotCounter = 0;
    const INTERVAL = 120_000; // 120 seconds (was 10s)
    const WARM_EVERY = 5;     // every 5 intervals = 10 min

    this._bgPullTimer = setInterval(async () => {
      if (this._bgPullRunning || this._bgPullPaused || this.isEffectivelyOffline() || !restaurantId) return;
      this._bgPullRunning = true;
      hotCounter++;

      const offlineStore = require('./offlineStore');

      try {
        // HOT: orders, tables — every 10s
        const [ordersData, tablesData] = await Promise.allSettled([
          this.request(`/api/orders/${restaurantId}?status=confirmed&status=pending&status=preparing&status=ready&status=saved&limit=200`).catch(() => null),
          this.request(`/api/tables/${restaurantId}`).catch(() => null),
        ]);

        if (ordersData.status === 'fulfilled' && ordersData.value) {
          const orders = ordersData.value.orders || [];
          if (orders.length > 0) offlineStore.saveOrders(restaurantId, orders);
        }
        if (tablesData.status === 'fulfilled' && tablesData.value) {
          const tables = tablesData.value.tables || [];
          if (tables.length > 0) offlineStore.saveTables(restaurantId, tables);
        }

        // WARM: menu, customers, floors — every 5 min
        if (hotCounter % WARM_EVERY === 0) {
          const warmFetches = await Promise.allSettled([
            this.request(`/api/menus/${restaurantId}`).catch(() => null),
            this.request(`/api/customers/${restaurantId}`).catch(() => null),
            this.request(`/api/floors/${restaurantId}`).catch(() => null),
          ]);

          if (warmFetches[0].status === 'fulfilled' && warmFetches[0].value) {
            const items = warmFetches[0].value.menu?.items || warmFetches[0].value.menuItems || [];
            if (items.length > 0) offlineStore.saveMenuItems(restaurantId, items);
          }
          if (warmFetches[1].status === 'fulfilled' && warmFetches[1].value) {
            const customers = warmFetches[1].value.customers || [];
            if (customers.length > 0) offlineStore.saveCustomers(restaurantId, customers);
          }
          if (warmFetches[2].status === 'fulfilled' && warmFetches[2].value) {
            const floors = warmFetches[2].value.floors || [];
            if (floors.length > 0) offlineStore.saveFloors(restaurantId, floors);
          }
        }
      } catch (e) {
        // Background pull failed — not critical
      } finally {
        this._bgPullRunning = false;
      }
    }, INTERVAL);
  }

  stopBackgroundPull() {
    if (this._bgPullTimer) {
      clearInterval(this._bgPullTimer);
      this._bgPullTimer = null;
    }
    if (this._bgPullAppStateSub) {
      this._bgPullAppStateSub.remove();
      this._bgPullAppStateSub = null;
    }
    this._bgPullRunning = false;
    this._bgPullPaused = false;
  }

  // Staff login
  async staffLogin(loginId, password) {
    const response = await this.request('/api/auth/staff/login', {
      method: 'POST',
      data: { loginId, password, platform: 'dine-app' },
    });

    if (response.token) {
      await this.setToken(response.token);
      // Clear any stale caches from previous user session
      this._cache.clear();
      if (response.user) {
        await this.setUser({
          ...response.user,
          restaurant: response.restaurant,
          owner: response.owner,
        });
        // Route to correct backend based on restaurant config
        if (response.restaurant) this.setRestaurantBaseURL(response.restaurant);
        // Seed offline data in background
        this._triggerBackgroundSeed(response.user.restaurantId || response.restaurant?.id);
      }
    }

    return response;
  }

  // ==================== OWNER AUTH ====================

  // Google login (owner)
  async googleLogin(uid, email, name, picture) {
    const response = await this.request('/api/auth/google', {
      method: 'POST',
      data: { uid, email, name, picture, platform: 'dine-app' },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
      }
    }

    return response;
  }

  // Apple login (owner)
  async appleLogin(uid, email, name, picture) {
    const response = await this.request('/api/auth/apple', {
      method: 'POST',
      data: { uid, email, name, picture, platform: 'dine-app' },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
      }
    }

    return response;
  }

  // Email login (owner)
  async emailLogin(email, password) {
    const response = await this.request('/api/auth/email/login', {
      method: 'POST',
      data: { email, password, platform: 'dine-app' },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
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
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
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
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
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
      data: { phone, otp, platform: 'dine-app' },
    });

    if (response.token) {
      await this.setToken(response.token);
      if (response.user) {
        await this.setUser(response.user);
        this._triggerBackgroundSeed(response.user.restaurantId || response.user.restaurant?.id);
      }
    }

    return response;
  }

  // Get menu items
  async getMenu(restaurantId) {
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/menus/${restaurantId}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const items = offlineStore.getMenuItems(restaurantId);
        if (items && items.length > 0) return { menuItems: items };
        return null;
      },
      onFetched: (data) => {
        const items = data?.menu?.items || data?.menuItems || data?.items || [];
        if (items.length > 0) offlineStore.saveMenuItems(restaurantId, items);
      },
    });
  }

  // Get floors and tables
  async getFloors(restaurantId) {
    const offlineStore = require('./offlineStore');
    const endpoint = `/api/floors/${restaurantId}`;

    // When online, always fetch directly from API — no stale data
    if (!this.isEffectivelyOffline()) {
      try {
        this.invalidateCache(endpoint);
        const data = await this.request(endpoint);
        // Save to offline store in background (don't let save errors block the return)
        try {
          const floors = data?.floors || (Array.isArray(data) ? data : []);
          if (floors.length > 0) {
            offlineStore.saveFloors(restaurantId, floors);
            const allTables = [];
            for (const floor of floors) {
              if (floor.tables) allTables.push(...floor.tables);
            }
            if (allTables.length > 0) offlineStore.saveTables(restaurantId, allTables);
          }
        } catch (saveErr) {
          console.warn('getFloors offline save failed (non-blocking):', saveErr.message);
        }
        return data;
      } catch (err) {
        console.warn('getFloors API failed, falling back to offline:', err.message);
      }
    }

    // Offline fallback — read from SQLite
    try {
      const floors = offlineStore.getFloors(restaurantId);
      if (floors && floors.length > 0) return { floors };
    } catch (readErr) {
      console.warn('getFloors offline read failed:', readErr.message);
    }
    return { floors: [] };
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/tables/${restaurantId}`, {
      ttlMs: 2 * 60 * 1000,
      localRead: () => {
        const tables = offlineStore.getTables(restaurantId);
        if (tables && tables.length > 0) return { tables };
        return null;
      },
      onFetched: (data) => {
        const tables = data?.tables || (Array.isArray(data) ? data : []);
        if (tables.length > 0) offlineStore.saveTables(restaurantId, tables);
      },
    });
  }

  // Reset all tables to available
  async resetAllTables(restaurantId) {
    return this.request(`/api/tables/${restaurantId}/reset-all`, {
      method: 'POST',
    });
  }

  // Update table status
  async updateTableStatus(tableId, status, orderId = null, restaurantId = null) {
    const body = { status };
    if (orderId) body.orderId = orderId;
    if (restaurantId) body.restaurantId = restaurantId;

    const result = await this.offlineWrite(`/api/tables/${tableId}/status`, {
      method: 'PATCH',
      data: body,
      entityType: 'table_status',
      operation: 'update',
      priority: 25,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateTableStatus(tableId, status, orderId);
      },
      onSuccess: () => {
        this.invalidateCache('/api/tables/');
        this.invalidateCache('/api/floors/');
      },
    });
    if (!result.offline) {
      this.invalidateCache('/api/tables/');
      this.invalidateCache('/api/floors/');
    }
    return result;
  }

  // Dynamic parties (Path A): add another independent party (check) to a table on demand.
  // Base table stays Party A; siblings are named 7-B / 7-C… Returns { party }.
  async addTableParty(restaurantId, tableId, partyName = null) {
    const result = await this.request(`/api/tables/${restaurantId}/add-party`, {
      method: 'POST',
      data: { tableId, partyName: partyName || null },
    });
    this.invalidateCache('/api/tables/');
    this.invalidateCache('/api/floors/');
    return result;
  }
  // Remove an empty party (no active order).
  async removeTableParty(restaurantId, tableId) {
    const result = await this.request(`/api/tables/${restaurantId}/remove-party`, {
      method: 'POST',
      data: { tableId },
    });
    this.invalidateCache('/api/tables/');
    this.invalidateCache('/api/floors/');
    return result;
  }

  // Get orders
  async getOrders(restaurantId, params = {}, { onRefreshed } = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/orders/${restaurantId}${queryString ? `?${queryString}` : ''}`;
    const offlineStore = require('./offlineStore');

    return this.offlineGet(endpoint, {
      ttlMs: 0, // Don't cache GET orders (always fresh)
      localRead: () => {
        const filters = {};
        if (params.search) filters.search = params.search;
        if (params.status) filters.status = params.status;
        if (params.today || params.period === 'today') filters.today = true;
        if (params.startDate) filters.startDate = params.startDate;
        if (params.endDate) filters.endDate = params.endDate;
        if (params.limit) filters.limit = parseInt(params.limit, 10);
        const orders = offlineStore.getOrders(restaurantId, filters);
        if (orders) return { orders };
        return null;
      },
      onFetched: (data) => {
        const orders = data?.orders || (Array.isArray(data) ? data : []);
        if (orders.length > 0) offlineStore.saveOrders(restaurantId, orders);
      },
      onRefreshed,
    });
  }

  // Get analytics for restaurant
  async getAnalytics(restaurantId, period = 'today', options = {}, { onRefreshed } = {}) {
    const params = new URLSearchParams({ period });
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    const endpoint = `/api/analytics/${restaurantId}?${params.toString()}`;
    const offlineStore = require('./offlineStore');
    return this.offlineGet(endpoint, {
      ttlMs: 2 * 60 * 1000,
      localRead: () => {
        // Compute basic stats from local orders
        const orders = offlineStore.getOrders(restaurantId, { today: true });
        if (!orders) return null;
        const completed = orders.filter(o => o.status === 'completed' || o.status === 'served');
        // Exclude due orders from revenue; use paidAmount for partial orders
        const totalRevenue = completed.reduce((sum, o) => {
          if (o.paymentStatus === 'due') return sum;
          if ((o.paymentStatus === 'partial' || o.outstandingAmount > 0) && o.paidAmount != null) return sum + (Number(o.paidAmount) || 0);
          return sum + (o.finalAmount || o.totalAmount || 0);
        }, 0);
        return {
          totalOrders: orders.length,
          completedOrders: completed.length,
          totalRevenue,
          _offlineComputed: true,
        };
      },
      onRefreshed,
    });
  }

  async getDailySummary(restaurantId, options = {}) {
    const params = new URLSearchParams();
    if (options.date) params.append('date', options.date);
    if (options.period) params.append('period', options.period);
    if (options.startDate) params.append('startDate', options.startDate);
    if (options.endDate) params.append('endDate', options.endDate);
    const qs = params.toString();
    const endpoint = `/api/analytics/${restaurantId}/daily-summary${qs ? '?' + qs : ''}`;

    // Always invalidate in-memory cache so we get fresh data per period
    this.invalidateCache(`/api/analytics/${restaurantId}/daily-summary`);

    // When online, fetch directly from API (no offline-first for summary)
    if (!this.isEffectivelyOffline()) {
      try {
        const data = await this.request(endpoint);
        return data;
      } catch (err) {
        console.warn('getDailySummary network error, falling back to offline:', err.message);
      }
    }

    // Offline fallback: compute basic stats from local orders
    const offlineStore = require('./offlineStore');
    const orders = offlineStore.getOrders(restaurantId, { today: true });
    if (!orders) throw new Error('No data available offline.');
    const completed = orders.filter(o => o.status === 'completed' || o.status === 'served');
    const totalRevenue = completed.reduce((sum, o) => sum + (o.finalAmount || o.totalAmount || 0), 0);
    return {
      success: true,
      summary: {
        totalOrders: orders.length,
        totalRevenue,
        avgOrderValue: completed.length > 0 ? totalRevenue / completed.length : 0,
      },
      _offlineComputed: true,
    };
  }

  // Create order
  async createOrder(orderData) {
    const offlineStore = require('./offlineStore');

    const result = await this.offlineWrite('/api/orders', {
      method: 'POST',
      data: orderData,
      entityType: 'order',
      operation: 'create',
      priority: 10,
      idempotencyKey: orderData.idempotencyKey || null,
      onOfflineQueue: (key, payload) => {
        // Generate local order ID
        const seq = offlineStore.getNextLocalOrderSequence(orderData.restaurantId);
        const dailyOrderId = `OFF-${String(seq).padStart(3, '0')}`;
        const localOrder = {
          ...payload,
          id: key,
          dailyOrderId,
          idempotencyKey: key,
          status: orderData.status || 'confirmed',
          createdAt: new Date().toISOString(),
        };
        offlineStore.insertLocalOrder(localOrder);
        // Update table status locally if dine-in
        if (orderData.tableId || orderData.tableNumber) {
          offlineStore.updateTableStatus(orderData.tableId || orderData.tableNumber, 'occupied', key);
        }
      },
      onSuccess: (result) => {
        if (result?.order) {
          offlineStore.saveOrders(orderData.restaurantId, [result.order]);
        }
        this.invalidateCache('/api/floors/');
        this.invalidateCache('/api/tables/');
      },
    });

    if (!result.offline) {
      this.invalidateCache('/api/floors/');
      this.invalidateCache('/api/tables/');
    }
    return result;
  }

  // Update order
  async updateOrder(orderId, orderData) {
    const result = await this.offlineWrite(`/api/orders/${orderId}`, {
      method: 'PATCH',
      data: orderData,
      entityType: 'order_update',
      operation: 'update',
      priority: 15,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, orderData);
      },
      onSuccess: () => {
        this.invalidateCache('/api/floors/');
        this.invalidateCache('/api/tables/');
      },
    });
    if (!result.offline) {
      this.invalidateCache('/api/floors/');
      this.invalidateCache('/api/tables/');
    }
    return result;
  }

  // Move order to a different table
  async moveOrderToTable(orderId, { targetTableId, targetTableName, targetFloorId, targetFloorName, restaurantId }) {
    const result = await this.request(`/api/orders/${orderId}/move-table`, {
      method: 'POST',
      data: { targetTableId, targetTableName, targetFloorId, targetFloorName, restaurantId },
    });
    this.invalidateCache('/api/floors/');
    this.invalidateCache('/api/tables/');
    return result;
  }

  // Trigger remote print (KOT, bill, or pre-bill) via backend → RTDB
  async triggerPrint(orderId, printType = 'kot') {
    return this.request(`/api/orders/${orderId}/manual-print`, {
      method: 'POST',
      data: { printType },
    });
  }

  // Update order status
  async updateOrderStatus(orderId, status, restaurantId) {
    const result = await this.offlineWrite(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      data: { status, restaurantId },
      entityType: 'order_status',
      operation: 'update',
      priority: 20,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status });
      },
      onSuccess: () => {
        this.invalidateCache('/api/floors/');
        this.invalidateCache('/api/tables/');
      },
    });
    if (!result.offline) {
      this.invalidateCache('/api/floors/');
      this.invalidateCache('/api/tables/');
    }
    return result;
  }

  // Mark order as served (convenience wrapper)
  async markServed(orderId, restaurantId) {
    return this.updateOrderStatus(orderId, 'served', restaurantId);
  }

  // Delete order (soft delete - sets status to 'deleted')
  async deleteOrder(orderId, reason) {
    const result = await this.offlineWrite(`/api/orders/${orderId}`, {
      method: 'DELETE',
      data: reason ? { reason } : {},
      entityType: 'order_status',
      operation: 'delete',
      priority: 20,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status: 'deleted' });
      },
      onSuccess: () => {
        this.invalidateCache('/api/floors/');
        this.invalidateCache('/api/tables/');
        this.invalidateCache('/api/menus/');
      },
    });
    if (!result.offline) {
      this.invalidateCache('/api/floors/');
      this.invalidateCache('/api/tables/');
      this.invalidateCache('/api/menus/');
    }
    return result;
  }

  // KOT (Kitchen Order Ticket) endpoints
  async getKotOrders(restaurantId) {
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/kot/${restaurantId}`, {
      ttlMs: 0,
      localRead: () => {
        const orders = offlineStore.getOrders(restaurantId, {
          status: ['confirmed', 'pending', 'preparing', 'ready'],
        });
        if (orders) return { orders };
        return null;
      },
      onFetched: (data) => {
        const orders = data?.orders || (Array.isArray(data) ? data : []);
        if (orders.length > 0) offlineStore.saveOrders(restaurantId, orders);
      },
    });
  }

  async startCooking(orderId) {
    return this.offlineWrite(`/api/kot/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'preparing', cookingStartTime: new Date().toISOString() },
      entityType: 'kot_status',
      operation: 'update',
      priority: 30,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status: 'preparing' });
      },
    });
  }

  async markReady(orderId) {
    return this.offlineWrite(`/api/kot/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'ready', cookingEndTime: new Date().toISOString() },
      entityType: 'kot_status',
      operation: 'update',
      priority: 30,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status: 'ready' });
      },
    });
  }

  async completeOrder(orderId) {
    return this.offlineWrite(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      data: { status: 'completed' },
      entityType: 'order_status',
      operation: 'update',
      priority: 20,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status: 'completed' });
      },
    });
  }

  async cancelKotOrder(orderId, reason = '') {
    return this.offlineWrite(`/api/orders/${orderId}/cancel`, {
      method: 'PATCH',
      data: { reason },
      entityType: 'order_status',
      operation: 'update',
      priority: 20,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, { status: 'cancelled' });
      },
    });
  }

  async restoreOrder(orderId, reason = '') {
    return this.request(`/api/orders/${orderId}/restore`, {
      method: 'PATCH',
      data: { reason },
    });
  }

  // Saved Carts (parked orders & templates)
  async getSavedCarts(restaurantId, type = null) {
    const query = type ? `?type=${type}` : '';
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/saved-carts/${restaurantId}${query}`, {
      ttlMs: 2 * 60 * 1000,
      localRead: () => {
        const carts = offlineStore.getSavedCarts(restaurantId, type);
        if (carts && carts.length > 0) return { savedCarts: carts };
        return null;
      },
      onFetched: (data) => {
        const carts = data?.savedCarts || data?.carts || (Array.isArray(data) ? data : []);
        if (carts.length > 0) offlineStore.saveSavedCarts(restaurantId, carts);
      },
    });
  }

  async createSavedCart(cartData) {
    const offlineStore = require('./offlineStore');
    return this.offlineWrite('/api/saved-carts', {
      method: 'POST',
      data: cartData,
      entityType: 'saved_cart',
      operation: 'create',
      priority: 40,
      onOfflineQueue: (key, payload) => {
        offlineStore.upsertSavedCart({ ...payload, id: key });
      },
      onSuccess: (result) => {
        if (result?.savedCart) offlineStore.upsertSavedCart(result.savedCart);
      },
    });
  }

  async updateSavedCart(cartId, updateData) {
    const offlineStore = require('./offlineStore');
    return this.offlineWrite(`/api/saved-carts/${cartId}`, {
      method: 'PATCH',
      data: updateData,
      entityType: 'saved_cart',
      operation: 'update',
      priority: 40,
      onOfflineQueue: (key, payload) => {
        offlineStore.upsertSavedCart({ ...payload, id: cartId });
      },
    });
  }

  async deleteSavedCart(cartId) {
    const offlineStore = require('./offlineStore');
    return this.offlineWrite(`/api/saved-carts/${cartId}`, {
      method: 'DELETE',
      data: {},
      entityType: 'saved_cart',
      operation: 'delete',
      priority: 40,
      onOfflineQueue: () => {
        offlineStore.deleteSavedCart(cartId);
      },
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/restaurants/${restaurantId}`, {
      ttlMs: 10 * 60 * 1000,
      localRead: () => {
        const restaurant = offlineStore.getRestaurant(restaurantId);
        if (restaurant) return { restaurant };
        return null;
      },
      onFetched: (data) => {
        const restaurant = data?.restaurant || data;
        if (restaurant?.id || restaurant?.name) offlineStore.saveRestaurant(restaurantId, restaurant);
      },
    });
  }

  // Update restaurant details (business info, legal name, GSTIN, etc.)
  async updateRestaurant(restaurantId, data) {
    const result = await this.request(`/api/restaurants/${restaurantId}`, {
      method: 'PATCH',
      data,
    });
    this.invalidateCache(`/api/restaurants`);
    return result;
  }

  // Get all restaurants for authenticated user
  async getRestaurants() {
    // For multi-restaurant owners, just use in-memory cache + network
    // SQLite stores single restaurant. For offline, rely on cached user data.
    return this.cachedGet('/api/restaurants', 10 * 60 * 1000); // 10 min
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
    const result = await this.request(`/api/menus/${restaurantId}`, {
      method: 'POST',
      data: itemData,
    });
    this.invalidateCache(`/api/menus/${restaurantId}`);
    return result;
  }

  async updateMenuItem(itemId, itemData, restaurantId) {
    const query = restaurantId ? `?restaurantId=${restaurantId}` : '';
    const result = await this.request(`/api/menus/item/${itemId}${query}`, {
      method: 'PATCH',
      data: itemData,
    });
    if (restaurantId) {
      this.invalidateCache(`/api/menus/${restaurantId}`);
    }
    this.invalidateCache('/api/menus/');
    return result;
  }

  async deleteMenuItem(itemId, restaurantId) {
    const query = restaurantId ? `?restaurantId=${restaurantId}` : '';
    const result = await this.request(`/api/menus/item/${itemId}${query}`, {
      method: 'DELETE',
    });
    if (restaurantId) {
      this.invalidateCache(`/api/menus/${restaurantId}`);
    }
    this.invalidateCache('/api/menus/');
    return result;
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

  async getCategories(restaurantId) {
    return this.request(`/api/categories/${restaurantId}`);
  }

  async createCategory(restaurantId, data) {
    return this.request(`/api/categories/${restaurantId}`, {
      method: 'POST',
      data,
    });
  }

  async updateCategory(restaurantId, categoryId, data) {
    return this.request(`/api/categories/${restaurantId}/${categoryId}`, {
      method: 'PATCH',
      data,
    });
  }

  async deleteCategory(restaurantId, categoryId) {
    return this.request(`/api/categories/${restaurantId}/${categoryId}`, {
      method: 'DELETE',
    });
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
    return this.offlineWrite(`/api/menus/item/${itemId}`, {
      method: 'PATCH',
      data: { isAvailable },
      entityType: 'menu_availability',
      operation: 'update',
      priority: 80,
      onOfflineQueue: () => {
        this.invalidateCache('/api/menus/');
      },
      onSuccess: () => {
        this.invalidateCache('/api/menus/');
      },
    });
  }

  // ==================== HOTEL MANAGEMENT ====================

  // Room Management
  async getRooms(restaurantId, filters = {}) {
    const params = new URLSearchParams(filters);
    const queryString = params.toString();
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/rooms/${restaurantId}${queryString ? `?${queryString}` : ''}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const rooms = offlineStore.getRooms(restaurantId);
        if (rooms && rooms.length > 0) return { rooms };
        return null;
      },
      onFetched: (data) => {
        const rooms = data?.rooms || (Array.isArray(data) ? data : []);
        if (rooms.length > 0) offlineStore.saveRooms(restaurantId, rooms);
      },
    });
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
    return this.offlineGet(`/api/bookings/${restaurantId}${queryString ? `?${queryString}` : ''}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => null, // Bookings not cached locally — shows "No data" offline
    });
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

  async updateBooking(bookingId, updateData) {
    return this.request(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      data: updateData,
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/offers/${restaurantId}/active${params}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const offers = offlineStore.getOffers(restaurantId);
        if (offers && offers.length > 0) {
          // Filter to active offers locally
          const active = offers.filter(o => o.isActive !== false);
          return { offers: active };
        }
        return null;
      },
      onFetched: (data) => {
        const offers = data?.offers || (Array.isArray(data) ? data : []);
        if (offers.length > 0) offlineStore.saveOffers(restaurantId, offers);
      },
    });
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

  // WhatsApp APIs
  async getWhatsAppSettings(restaurantId) {
    return this.request(`/api/automation/${restaurantId}/whatsapp`);
  }

  async sendBillOnWhatsApp(restaurantId, { customerPhone, customerName, amount, orderId, invoiceText, restaurantName }) {
    return this.request(`/api/automation/${restaurantId}/whatsapp/send-bill`, {
      method: 'POST',
      data: { customerPhone, customerName, amount, orderId, invoiceText, restaurantName },
    });
  }

  // Google Reviews APIs
  async getGoogleReviewSettings(restaurantId) {
    return this.request(`/api/google-reviews/settings/${restaurantId}`);
  }

  async getGoogleAuthStatus(restaurantId) {
    return this.request(`/api/google-reviews/auth/status/${restaurantId}`);
  }

  async getGoogleReviews(restaurantId, params = {}) {
    const query = new URLSearchParams(params).toString();
    const queryString = query ? `?${query}` : '';
    return this.request(`/api/google-reviews/reviews/${restaurantId}${queryString}`);
  }

  async replyToGoogleReview(restaurantId, reviewId, comment) {
    return this.request(`/api/google-reviews/reviews/${restaurantId}/${encodeURIComponent(reviewId)}/reply`, {
      method: 'POST',
      data: { comment },
    });
  }

  async generateGoogleReviewReply(restaurantId, data) {
    return this.request(`/api/google-reviews/reviews/${restaurantId}/generate-reply`, {
      method: 'POST',
      data,
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

  // Lookup customer by wallet card number
  async lookupCustomerByCard(restaurantId, cardNumber) {
    return this.request(`/api/customers/lookup-card/${encodeURIComponent(cardNumber)}`, {
      method: 'GET',
      params: { restaurantId },
    });
  }

  // ==================== TAX SETTINGS ====================

  // Get tax settings for a restaurant
  async getTaxSettings(restaurantId) {
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/admin/tax/${restaurantId}`, {
      ttlMs: 10 * 60 * 1000,
      localRead: () => offlineStore.getTaxSettings(restaurantId),
      onFetched: (data) => offlineStore.saveTaxSettings(restaurantId, data),
    });
  }

  // Update tax settings for a restaurant
  async updateTaxSettings(restaurantId, taxSettings) {
    const result = await this.request(`/api/admin/tax/${restaurantId}`, {
      method: 'PUT',
      data: { taxSettings },
    });
    this.invalidateCache(`/api/admin/tax/`);
    return result;
  }

  // ==================== PRICING SETTINGS ====================

  // Get pricing settings (zone pricing) for a restaurant
  async getPricingSettings(restaurantId) {
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/restaurants/${restaurantId}/pricing-settings`, {
      ttlMs: 10 * 60 * 1000,
      localRead: () => offlineStore.getPricingSettings(restaurantId),
      onFetched: (data) => offlineStore.savePricingSettings(restaurantId, data),
    });
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/offers/${restaurantId}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const offers = offlineStore.getOffers(restaurantId);
        if (offers && offers.length > 0) return { offers };
        return null;
      },
      onFetched: (data) => {
        const offers = data?.offers || (Array.isArray(data) ? data : []);
        if (offers.length > 0) offlineStore.saveOffers(restaurantId, offers);
      },
    });
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

  // ==================== COUPONS ====================

  async validateCoupon(restaurantId, code, customerPhone, cartTotal) {
    return this.request(`/api/automation/${restaurantId}/coupons/validate`, {
      method: 'POST',
      data: { code, customerPhone, cartTotal },
    });
  }

  async redeemCoupon(restaurantId, couponId, orderId) {
    return this.request(`/api/automation/${restaurantId}/coupons/redeem`, {
      method: 'POST',
      data: { couponId, orderId },
    });
  }

  async getCustomerCoupons(restaurantId, phone) {
    return this.request(`/api/automation/${restaurantId}/coupons/customer/${encodeURIComponent(phone)}`);
  }

  // ==================== CUSTOMER GROUPS ====================

  async getCustomerGroups(restaurantId) {
    return this.request(`/api/customer-groups/${restaurantId}`);
  }

  async createCustomerGroup(restaurantId, data) {
    return this.request(`/api/customer-groups/${restaurantId}`, {
      method: 'POST',
      data,
    });
  }

  async updateCustomerGroup(restaurantId, groupId, data) {
    return this.request(`/api/customer-groups/${restaurantId}/${groupId}`, {
      method: 'PATCH',
      data,
    });
  }

  async deleteCustomerGroup(restaurantId, groupId) {
    return this.request(`/api/customer-groups/${restaurantId}/${groupId}`, {
      method: 'DELETE',
    });
  }

  async addGroupMembers(restaurantId, groupId, data) {
    return this.request(`/api/customer-groups/${restaurantId}/${groupId}/members`, {
      method: 'POST',
      data,
    });
  }

  async removeGroupMember(restaurantId, groupId, data) {
    return this.request(`/api/customer-groups/${restaurantId}/${groupId}/members`, {
      method: 'DELETE',
      data,
    });
  }

  // ==================== CUSTOMERS ====================

  // Get customers list for a restaurant
  async getCustomers(restaurantId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/customers/${restaurantId}${queryString ? `?${queryString}` : ''}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const customers = offlineStore.getCustomers(restaurantId, params.search);
        if (customers) return { customers };
        return null;
      },
      onFetched: (data) => {
        const customers = data?.customers || (Array.isArray(data) ? data : []);
        if (customers.length > 0) offlineStore.saveCustomers(restaurantId, customers);
      },
    });
  }

  // Get full customer detail by ID
  async getCustomerDetail(customerId) {
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/customers/detail/${customerId}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const db = require('./db').getDb();
        const row = db.getFirstSync('SELECT data FROM customers WHERE id = ?', [customerId]);
        if (row) {
          try {
            const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
            return { customer: data };
          } catch { return null; }
        }
        return null;
      },
    });
  }

  // Get customer loyalty history
  async getCustomerLoyaltyHistory(customerId, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return this.request(`/api/public/customer/${customerId}/loyalty-history${queryString ? `?${queryString}` : ''}`);
  }

  // Create customer
  async createCustomer(customerData) {
    return this.offlineWrite('/api/customers', {
      method: 'POST',
      data: customerData,
      entityType: 'customer',
      operation: 'create',
      priority: 50,
      onOfflineQueue: (key, payload) => {
        const offlineStore = require('./offlineStore');
        offlineStore.upsertCustomer({ ...payload, id: key });
      },
      onSuccess: (result) => {
        if (result?.customer) {
          const offlineStore = require('./offlineStore');
          offlineStore.upsertCustomer(result.customer);
        }
      },
    });
  }

  // Update customer
  async updateCustomer(customerId, customerData) {
    return this.offlineWrite(`/api/customers/${customerId}`, {
      method: 'PATCH',
      data: customerData,
      entityType: 'customer',
      operation: 'update',
      priority: 50,
      onOfflineQueue: (key, payload) => {
        const offlineStore = require('./offlineStore');
        offlineStore.upsertCustomer({ ...payload, id: customerId });
      },
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
    return this.offlineGet(`/api/public/customer/${customerId}/orders${queryString ? `?${queryString}` : ''}`, {
      ttlMs: 2 * 60 * 1000,
      localRead: () => {
        const db = require('./db').getDb();
        const rows = db.getAllSync('SELECT data FROM orders WHERE data LIKE ?', [`%"customerId":"${customerId}"%`]);
        if (rows && rows.length > 0) {
          const orders = rows.map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
          return { orders };
        }
        return null;
      },
    });
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/inventory/${restaurantId}${qs ? `?${qs}` : ''}`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => {
        const items = offlineStore.getInventoryItems(restaurantId);
        if (items && items.length > 0) return { items };
        return null;
      },
      onFetched: (data) => {
        const items = data?.items || data?.inventoryItems || (Array.isArray(data) ? data : []);
        if (items.length > 0) offlineStore.saveInventoryItems(restaurantId, items);
      },
    });
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/recipes/${restaurantId}`, {
      ttlMs: 10 * 60 * 1000,
      localRead: () => {
        const recipes = offlineStore.getRecipes(restaurantId);
        if (recipes && recipes.length > 0) return { recipes };
        return null;
      },
      onFetched: (data) => {
        const recipes = data?.recipes || (Array.isArray(data) ? data : []);
        if (recipes.length > 0) offlineStore.saveRecipes(restaurantId, recipes);
      },
    });
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

  // ==================== SMART IMPORT ====================

  async smartImportParse(restaurantId, { text, imageUri, mimeType }) {
    if (imageUri) {
      const token = await this.getToken();
      const url = `${this.baseURL}/api/inventory/${restaurantId}/smart-import/parse`;
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: mimeType || 'image/jpeg',
        name: 'smart-import.jpg',
      });
      try {
        const response = await axios(url, {
          method: 'POST',
          data: formData,
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        return response.data;
      } catch (error) {
        if (error.response) {
          throw new Error(error.response.data?.error || 'Smart import parse failed');
        }
        throw new Error(error.message || 'Smart import parse failed');
      }
    }
    return this.request(`/api/inventory/${restaurantId}/smart-import/parse`, {
      method: 'POST',
      data: { text },
    });
  }

  async smartImportConfirm(restaurantId, data) {
    return this.request(`/api/inventory/${restaurantId}/smart-import/confirm`, {
      method: 'POST',
      data,
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

  // Waste Management
  async getWasteEntries(restaurantId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/inventory/${restaurantId}/waste-entries${qs ? `?${qs}` : ''}`);
  }

  async getWasteSummary(restaurantId) {
    return this.request(`/api/inventory/${restaurantId}/waste-summary`);
  }

  async getExpiryAlerts(restaurantId, days = 7) {
    return this.request(`/api/inventory/${restaurantId}/expiry-alerts?days=${days}`);
  }

  async createWasteEntry(restaurantId, data) {
    return this.offlineWrite(`/api/inventory/${restaurantId}/waste-entries`, {
      method: 'POST',
      data,
      entityType: 'waste_entry',
      operation: 'create',
      priority: 85,
    });
  }

  async markExpiredWaste(restaurantId, batchId) {
    return this.request(`/api/inventory/${restaurantId}/mark-expired-waste`, { method: 'POST', data: { batchId } });
  }

  async analyzeLeftovers(restaurantId, text) {
    return this.request(`/api/inventory/${restaurantId}/analyze-leftovers`, { method: 'POST', data: { text } });
  }

  async confirmLeftoverWaste(restaurantId, items) {
    return this.request(`/api/inventory/${restaurantId}/confirm-leftover-waste`, { method: 'POST', data: { items } });
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

  async getTokenRender(restaurantId, orderId) {
    return this.request(`/api/token/render/${restaurantId}/${orderId}`);
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
    const offlineStore = require('./offlineStore');
    return this.offlineGet(`/api/restaurants/${restaurantId}/billing-settings`, {
      ttlMs: 10 * 60 * 1000,
      localRead: () => offlineStore.getBillingSettings(restaurantId),
      onFetched: (data) => offlineStore.saveBillingSettings(restaurantId, data),
    });
  }

  async updateBillingSettings(restaurantId, settings) {
    const result = await this.request(`/api/restaurants/${restaurantId}/billing-settings`, {
      method: 'PUT',
      data: settings,
    });
    this.invalidateCache(`/api/restaurants/${restaurantId}/billing-settings`);
    return result;
  }

  async validateManagerPin(restaurantId, pin) {
    // If offline, validate against locally stored hash
    if (this.isEffectivelyOffline()) {
      const { getMeta } = require('./db');
      const storedHash = getMeta('manager_pin_hash');
      if (!storedHash) {
        throw new Error('Manager PIN not available offline. Please sync data first.');
      }
      const Crypto = require('expo-crypto');
      const inputHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, String(pin));
      if (inputHash === storedHash) {
        return { valid: true };
      }
      throw new Error('Invalid PIN');
    }
    return this.request('/api/billing/validate-manager-pin', {
      method: 'POST',
      data: { restaurantId, pin },
    });
  }

  async processRefund(orderId, data) {
    return this.offlineWrite(`/api/orders/${orderId}/refund`, {
      method: 'POST',
      data: { ...data, orderId },
      entityType: 'refund',
      operation: 'create',
      priority: 20,
    });
  }

  async recordPartialPayment(orderId, data) {
    return this.offlineWrite(`/api/orders/${orderId}/partial-payment`, {
      method: 'POST',
      data: { ...data, orderId },
      entityType: 'partial_payment',
      operation: 'create',
      priority: 20,
    });
  }

  async compVoidItems(orderId, data) {
    return this.offlineWrite(`/api/orders/${orderId}/comp-void`, {
      method: 'POST',
      data: { ...data, orderId },
      entityType: 'comp_void',
      operation: 'create',
      priority: 20,
      onOfflineQueue: (key) => {
        const offlineStore = require('./offlineStore');
        offlineStore.updateLocalOrder(orderId, data);
      },
    });
  }

  async getCustomerCreditHistory(customerId) {
    return this.offlineGet(`/api/customers/${customerId}/credit-history`, {
      ttlMs: 5 * 60 * 1000,
      localRead: () => null, // No local fallback — shows "No data" when offline
    });
  }

  async settleCustomerCredit(customerId, data) {
    return this.offlineWrite(`/api/customers/${customerId}/settle-credit`, {
      method: 'POST',
      data: { ...data, customerId },
      entityType: 'credit_settle',
      operation: 'create',
      priority: 50,
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

  // ==================== CUSTOMER WALLET ====================
  // Returns { walletBalance } for a customer (used to redeem wallet as a tender at billing).
  async getCustomerWallet(customerId) {
    return this.request(`/api/customers/${customerId}/wallet`);
  }

  // ==================== ECR / CARD TERMINAL (Sadad Cloud, Qatar) ====================
  // Sadad Cloud is fully backend-routed, so it works on mobile with no local hardware.
  async ecrSadadCreateOrder({ restaurantId, amount, merchantOrderNo, description }) {
    return this.request('/api/sadad/create-order', {
      method: 'POST',
      data: { restaurantId, amount: parseFloat(amount).toFixed(2), merchantOrderNo, description },
    });
  }
  async ecrSadadPoll(merchantOrderNo, restaurantId) {
    return this.request(`/api/sadad/poll/${merchantOrderNo}?restaurantId=${encodeURIComponent(restaurantId)}`);
  }
  async ecrSadadCloseOrder({ restaurantId, merchantOrderNo }) {
    return this.request('/api/sadad/close-order', {
      method: 'POST',
      data: { restaurantId, merchantOrderNo },
    });
  }
  // NAPS Direct terminals are reached via the backend proxy (local-HTTPS from the device
  // needs a native module; the proxy is the portable path).
  async ecrProxy({ terminalIp, port, endpoint, payload, restaurantId }) {
    return this.request('/api/ecr/proxy', {
      method: 'POST',
      data: { terminalIp, port, endpoint, payload, restaurantId },
    });
  }

  // ==================== ATTENDANCE ====================

  async clockIn(restaurantId, { staffId, staffName, location }) {
    return this.request(`/api/attendance/${restaurantId}/clock-in`, {
      method: 'POST',
      data: { staffId, staffName, location },
    });
  }

  async clockOut(restaurantId, { staffId, location }) {
    return this.request(`/api/attendance/${restaurantId}/clock-out`, {
      method: 'POST',
      data: { staffId, location },
    });
  }

  async getAttendanceToday(restaurantId) {
    return this.request(`/api/attendance/${restaurantId}/today`);
  }

  async getAttendanceHistory(restaurantId, params = {}) {
    const qs = new URLSearchParams();
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.staffId) qs.set('staffId', params.staffId);
    if (params.status) qs.set('status', params.status);
    const query = qs.toString();
    return this.request(`/api/attendance/${restaurantId}/history${query ? '?' + query : ''}`);
  }

  async getLeaveConfig(restaurantId) {
    return this.request(`/api/attendance/${restaurantId}/leave/config`);
  }

  async saveLeaveConfig(restaurantId, config) {
    return this.request(`/api/attendance/${restaurantId}/leave/config`, {
      method: 'PUT',
      data: config,
    });
  }

  async applyLeave(restaurantId, data) {
    return this.request(`/api/attendance/${restaurantId}/leave/apply`, {
      method: 'POST',
      data,
    });
  }

  async getLeaveRequests(restaurantId, params = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.staffId) qs.set('staffId', params.staffId);
    const query = qs.toString();
    return this.request(`/api/attendance/${restaurantId}/leave/requests${query ? '?' + query : ''}`);
  }

  async getLeaveBalances(restaurantId, staffId) {
    return this.request(`/api/attendance/${restaurantId}/leave/balances/${staffId}`);
  }

  // ==================== PARKING MANAGEMENT ====================

  getParkingConfig(restaurantId) { return this.request(`/api/parking/config/${restaurantId}`); }
  getParkingDashboardStats(restaurantId) { return this.request(`/api/parking/config/${restaurantId}/dashboard-stats`); }
  getParkingZones(restaurantId) { return this.request(`/api/parking/zones/${restaurantId}`); }
  getParkingRates(restaurantId) { return this.request(`/api/parking/rates/${restaurantId}`); }
  getParkingTickets(restaurantId, filters = {}) {
    const query = Object.entries(filters).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return this.request(`/api/parking/tickets/${restaurantId}${query ? `?${query}` : ''}`);
  }
  createParkingEntry(restaurantId, data) { return this.request(`/api/parking/tickets/${restaurantId}/entry`, { method: 'POST', data }); }
  processParkingExit(restaurantId, data) { return this.request(`/api/parking/tickets/${restaurantId}/exit`, { method: 'POST', data }); }
  confirmParkingExit(restaurantId, data) { return this.request(`/api/parking/tickets/${restaurantId}/exit/confirm`, { method: 'POST', data }); }
  cancelParkingTicket(restaurantId, ticketId, reason) { return this.request(`/api/parking/tickets/${restaurantId}/${ticketId}/cancel`, { method: 'POST', data: { reason } }); }
  recognizeLicensePlate(restaurantId, formData) {
    return this.request(`/api/parking/ai/recognize-plate/${restaurantId}`, {
      method: 'POST',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  // ─── Delivery Management ────────────────────────────────────────────────────
  getMyDeliveries(restaurantId, staffId) {
    return this.request(`/api/delivery/${restaurantId}/partner/${staffId}/active`, { skipCache: true });
  }
  respondToDelivery(restaurantId, orderId, action) {
    return this.request(`/api/delivery/${restaurantId}/respond`, { method: 'POST', data: { orderId, action } });
  }
  markDeliveryPickedUp(restaurantId, orderId) {
    return this.request(`/api/delivery/${restaurantId}/mark-picked-up`, { method: 'POST', data: { orderId } });
  }
  markDeliveryDelivered(restaurantId, orderId, paymentInfo = {}) {
    return this.request(`/api/delivery/${restaurantId}/mark-delivered`, {
      method: 'POST',
      data: { orderId, paymentCollected: paymentInfo.paymentCollected, paymentMethod: paymentInfo.paymentMethod },
    });
  }
  registerDeliveryToken(restaurantId, token, platform) {
    return this.request(`/api/delivery/${restaurantId}/register-token`, { method: 'POST', data: { token, platform } });
  }
  getDeliveryPartners(restaurantId) {
    return this.request(`/api/delivery/${restaurantId}/partners`);
  }
  assignDeliveryPartner(restaurantId, orderId, staffId, staffName) {
    return this.request(`/api/delivery/${restaurantId}/assign`, { method: 'POST', data: { orderId, staffId, staffName } });
  }
  getActiveDeliveries(restaurantId) {
    return this.request(`/api/delivery/${restaurantId}/active`, { skipCache: true });
  }
  getDeliverySettings(restaurantId) {
    return this.request(`/api/delivery/${restaurantId}/settings`);
  }

  // Print Stations
  getPrintStations(restaurantId) {
    return this.request(`/api/admin/print-stations/${restaurantId}`);
  }

  // Bar Inventory
  getBarBottles(restaurantId, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/api/bar/bottles/${restaurantId}${qs ? '?' + qs : ''}`);
  }
  createBarBottle(restaurantId, data) {
    return this.request(`/api/bar/bottles/${restaurantId}`, { method: 'POST', data });
  }
  updateBarBottle(restaurantId, bottleId, data) {
    return this.request(`/api/bar/bottles/${restaurantId}/${bottleId}`, { method: 'PUT', data });
  }
  recordBarWastage(restaurantId, bottleId, data) {
    return this.request(`/api/bar/bottles/${restaurantId}/${bottleId}/wastage`, { method: 'POST', data });
  }
  deleteBarBottle(restaurantId, bottleId) {
    return this.request(`/api/bar/bottles/${restaurantId}/${bottleId}`, { method: 'DELETE' });
  }
  getBarReconciliations(restaurantId) {
    return this.request(`/api/bar/reconciliation/${restaurantId}`);
  }
  openBarReconciliation(restaurantId, data) {
    return this.request(`/api/bar/reconciliation/${restaurantId}`, { method: 'POST', data });
  }
  closeBarReconciliation(restaurantId, id, data) {
    return this.request(`/api/bar/reconciliation/${restaurantId}/${id}`, { method: 'PUT', data });
  }

  // Discount Approval
  requestDiscountApproval(restaurantId, data) {
    return this.request(`/api/discount-approval/${restaurantId}/request`, { method: 'POST', data });
  }
  verifyDiscountApproval(restaurantId, data) {
    return this.request(`/api/discount-approval/${restaurantId}/verify`, { method: 'POST', data });
  }
}

export default new ApiClient();
