// Owner changes in web Admin (Waiter App settings, menu permissions, POS settings) reach phones
// without a re-login. The staff screens read the restaurant saved at login (apiClient.getUser()
// .restaurant); this refreshes the saved posSettings from the server when the app starts and each
// time it comes back to the foreground (at most once a minute), then tells the open screens via
// restaurantEvents 'settings' → { restaurantId, posSettings }.
import { AppState } from 'react-native';
import apiClient from './api';
import restaurantEvents from './restaurantEvents';

const MIN_GAP_MS = 60 * 1000;
let lastRun = 0;
let inflight = null;
// restaurantId → true/false: does the restaurant have roles switched on (from the fresh restaurant).
const rolesOnByRestaurant = {};

// Roles on (rolesV2): keep this person's role permissions and page access current without a re-login.
// Saved on the user as rolePermissions {rid, permissions}; removed again when roles are off. Tells
// the open screens via restaurantEvents 'access'.
export async function refreshRoleAccess() {
  try {
    if (typeof apiClient.isEffectivelyOffline === 'function' && apiClient.isEffectivelyOffline()) return null;
    const user = await apiClient.getUser();
    const rid = user?.restaurantId || user?.restaurant?.id;
    const role = String(user?.role || '').toLowerCase();
    if (!rid || !role || ['owner', 'admin', 'co-owner', 'customer'].includes(role)) return null;
    // Only ask when the restaurant has roles on (or saved permissions need clearing) — no extra
    // request for restaurants without roles.
    if (rolesOnByRestaurant[rid] !== true && !user.rolePermissions) return null;
    const res = await apiClient.request(`/api/user/page-access?restaurantId=${encodeURIComponent(rid)}`);
    const latest = await apiClient.getUser();
    if (!latest || (latest.restaurantId || latest.restaurant?.id) !== rid) return null; // switched meanwhile
    let next = null;
    if (res && res.rolesV2 === true && res.permissions) {
      const rp = { rid, permissions: res.permissions };
      const paChanged = res.pageAccess && JSON.stringify(res.pageAccess) !== JSON.stringify(latest.pageAccess || null);
      if (JSON.stringify(rp) !== JSON.stringify(latest.rolePermissions || null) || paChanged) {
        next = { ...latest, rolePermissions: rp, ...(res.pageAccess ? { pageAccess: res.pageAccess } : {}) };
      }
    } else if (latest.rolePermissions) {
      const { rolePermissions, ...rest } = latest;
      next = rest;
    }
    if (next) {
      await apiClient.setUser(next);
      restaurantEvents.emit('access', { restaurantId: rid });
    }
    return next;
  } catch (e) {
    return null; // best effort
  }
}

export async function refreshRestaurantSettings({ force = false } = {}) {
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return null;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (typeof apiClient.isEffectivelyOffline === 'function' && apiClient.isEffectivelyOffline()) return null;
      const user = await apiClient.getUser();
      const rid = user?.restaurantId || user?.restaurant?.id;
      if (!rid || !user?.restaurant) return null;
      lastRun = Date.now();
      if (typeof apiClient.invalidateCache === 'function') apiClient.invalidateCache(`/api/restaurants/${rid}`);
      const res = await apiClient.getRestaurant(rid);
      const fresh = res?.restaurant || null;
      if (fresh && (!fresh.id || fresh.id === rid)) rolesOnByRestaurant[rid] = fresh.rolesV2 === true;
      if (!fresh || !fresh.posSettings || (fresh.id && fresh.id !== rid)) return null;
      // Re-read: the user may have logged out or switched restaurant while we were fetching.
      const latest = await apiClient.getUser();
      if (!latest?.restaurant || (latest.restaurantId || latest.restaurant.id) !== rid) return null;
      const before = JSON.stringify(latest.restaurant.posSettings || {});
      const after = JSON.stringify(fresh.posSettings);
      if (before === after) return null; // nothing changed
      await apiClient.setUser({ ...latest, restaurant: { ...latest.restaurant, posSettings: fresh.posSettings } });
      restaurantEvents.emit('settings', { restaurantId: rid, posSettings: fresh.posSettings });
      return fresh.posSettings;
    } catch (e) {
      return null; // best effort — the saved settings stay as they were
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Start once (tabs layout). Returns a stop function.
let lastAccessRun = 0;
function refreshRoleAccessThrottled(force) {
  if (!force && Date.now() - lastAccessRun < MIN_GAP_MS) return;
  lastAccessRun = Date.now();
  refreshRoleAccess();
}

// Settings first, then role access — one after the other, so the two never overwrite each other's
// saved user (both re-read and save it).
export function refreshSettingsThenAccess({ force = false } = {}) {
  return Promise.resolve(refreshRestaurantSettings({ force }))
    .catch(() => null)
    .finally(() => refreshRoleAccessThrottled(force));
}

export function startRestaurantSettingsRefresh() {
  refreshSettingsThenAccess({ force: true });
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshSettingsThenAccess();
  });
  return () => { try { sub.remove(); } catch (_) { /* ignore */ } };
}
