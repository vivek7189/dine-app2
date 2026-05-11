/**
 * LAN Client for dine-app (React Native)
 *
 * Connects to the DineOpen LAN Hub via HTTP + WebSocket.
 * Routes API calls through the hub instead of cloud when paired.
 * Provides real-time event subscription (replaces Pusher on LAN).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAN_CONFIG_KEY = 'dineopen_lan_config';

class LanClient {
  constructor() {
    this.hubUrl = null; // e.g. 'http://192.168.1.50:3847'
    this.terminalId = null;
    this.restaurantId = null;
    this.ws = null;
    this._eventListeners = new Map();
    this._reconnectTimer = null;
    this._initialized = false;
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  async init() {
    if (this._initialized) return;
    try {
      const raw = await AsyncStorage.getItem(LAN_CONFIG_KEY);
      if (raw) {
        const config = JSON.parse(raw);
        this.hubUrl = config.hubUrl;
        this.terminalId = config.terminalId;
        this.restaurantId = config.restaurantId;
      }
    } catch {
      // ignore
    }
    this._initialized = true;
  }

  // ─── Pairing ────────────────────────────────────────────────────────────

  async pair(host, port, pairingCode, deviceName) {
    const url = `http://${host}:${port}/hub/pair`;
    const terminalId = this.terminalId || this._generateUUID();

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingCode,
        terminalId,
        name: deviceName || 'Waiter Device',
        deviceType: 'react-native',
        role: 'waiter-device',
      }),
    });

    const data = await resp.json();
    if (!data.success) {
      throw new Error(data.error || 'Pairing failed');
    }

    this.hubUrl = `http://${host}:${port}`;
    this.terminalId = terminalId;
    this.restaurantId = data.restaurantId;

    await AsyncStorage.setItem(LAN_CONFIG_KEY, JSON.stringify({
      hubUrl: this.hubUrl,
      terminalId,
      restaurantId: data.restaurantId,
      restaurantName: data.restaurantName,
      pairedAt: Date.now(),
      hubHost: host,
      hubPort: port,
    }));

    // Connect WebSocket for real-time events
    this.connectWebSocket();

    return data;
  }

  // ─── Staff Login via Hub ────────────────────────────────────────────────

  async staffLogin(loginId, password) {
    if (!this.hubUrl) throw new Error('Not paired with any hub');

    const resp = await fetch(`${this.hubUrl}/hub/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password }),
    });

    return resp.json();
  }

  // ─── HTTP Request Proxy ─────────────────────────────────────────────────

  async request(endpoint, options = {}) {
    if (!this.hubUrl) throw new Error('Not paired with any hub');

    const url = `${this.hubUrl}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();

    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: method !== 'GET' && options.data
        ? JSON.stringify(options.data)
        : undefined,
    });

    return resp.json();
  }

  // ─── WebSocket Connection (real-time events) ───────────────────────────

  connectWebSocket() {
    if (!this.hubUrl || this.ws) return;

    const wsUrl = this.hubUrl.replace('http://', 'ws://');
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[LanClient] WebSocket connected to hub');
        // Identify ourselves
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'identify',
            terminalId: this.terminalId,
            name: 'Waiter Device',
          }));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event' && msg.event) {
            this._emit(msg.event, msg.data);
          }
          if (msg.type === 'change') {
            this._emit('change', msg);
          }
        } catch {
          // ignore parse errors
        }
      };

      this.ws.onclose = () => {
        console.log('[LanClient] WebSocket disconnected, reconnecting in 5s');
        this.ws = null;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
      };

      this.ws.onerror = (err) => {
        console.error('[LanClient] WebSocket error:', err.message || err);
      };
    } catch (err) {
      console.error('[LanClient] Failed to connect WebSocket:', err);
    }
  }

  disconnectWebSocket() {
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  // ─── Event System ─────────────────────────────────────────────────────

  onEvent(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, new Set());
    }
    this._eventListeners.get(eventName).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this._eventListeners.get(eventName);
      if (listeners) listeners.delete(callback);
    };
  }

  offEvent(eventName, callback) {
    if (callback) {
      const listeners = this._eventListeners.get(eventName);
      if (listeners) listeners.delete(callback);
    } else {
      this._eventListeners.delete(eventName);
    }
  }

  _emit(eventName, data) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      for (const cb of listeners) {
        try { cb(data); } catch (e) {
          console.error('[LanClient] Event handler error:', e);
        }
      }
    }
  }

  // ─── State Queries ────────────────────────────────────────────────────

  isPaired() {
    return !!(this.hubUrl && this.terminalId);
  }

  async getConfig() {
    try {
      const raw = await AsyncStorage.getItem(LAN_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async unpair() {
    this.disconnectWebSocket();
    await AsyncStorage.removeItem(LAN_CONFIG_KEY);
    this.hubUrl = null;
    this.terminalId = null;
    this.restaurantId = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  _generateUUID() {
    // Simple UUID v4 for React Native (no crypto.randomUUID)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

const lanClient = new LanClient();
export default lanClient;
