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
export function startRestaurantSettingsRefresh() {
  refreshRestaurantSettings({ force: true });
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') refreshRestaurantSettings();
  });
  return () => { try { sub.remove(); } catch (_) { /* ignore */ } };
}
