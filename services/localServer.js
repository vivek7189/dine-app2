/**
 * Local-server configuration for dine-app (waiter/POS app).
 *
 * Points this device at the on-prem "local server" machine (the one running
 * dine-backend + local Postgres on the LAN) for complete offline operation, the
 * same way the desktop app does. When set:
 *   - api.js uses it as the API base (normal authenticated fetch, same endpoints).
 *   - lanClient opens a socket.io connection to it and bridges live events into the
 *     app's existing onEvent consumers (orders / tables / KOT).
 *
 * Unset (default) ⇒ cloud behaviour, unchanged.
 *
 * Persisted in AsyncStorage; a cached value is kept so callers have a synchronous
 * getter after init() (mirrors how api.js reads config).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dineopen_local_server_url';
let _cached = null;   // normalized url or null
let _loaded = false;

export function normalizeServerUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

/** Load the persisted value into the cache. Call once at startup. */
export async function initLocalServer() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    _cached = normalizeServerUrl(raw);
  } catch (_) {
    _cached = null;
  }
  _loaded = true;
  return _cached;
}

/** Synchronous getter (valid after initLocalServer()). */
export function getLocalServerUrl() {
  return _cached;
}

export function isLocalServerMode() {
  return !!_cached;
}

/** Persist + update cache. Pass null/'' to clear. */
export async function setLocalServerUrl(url) {
  const norm = normalizeServerUrl(url);
  _cached = norm;
  _loaded = true;
  try {
    if (norm) await AsyncStorage.setItem(KEY, norm);
    else await AsyncStorage.removeItem(KEY);
  } catch (_) {}
  return norm;
}

export function isLoaded() { return _loaded; }
