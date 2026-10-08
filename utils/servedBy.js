// "Served by" — the staff member a counter order's SALES are credited to (Staff Sales report).
// Same rules as the web (dine-frontend lib/servedBy.js): picked by a counter login (owner / admin /
// manager / cashier), remembered on THIS device per restaurant until changed, sent with every NEW
// order as servedBy: { id, name }. The server validates it and credits that person — unless the
// table has its own assigned server, which keeps priority. A waiter's own orders credit the waiter.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (rid) => `dineopen_served_by_${rid}`;

export const COUNTER_ROLES = new Set(['owner', 'admin', 'co-owner', 'manager', 'cashier']);

// Floor staff first in the list; everyone else after (web parity).
const FLOOR_ROLES = ['waiter', 'captain', 'all rounder', 'all-rounder', 'server', 'steward', 'takeaway leader', 'parcel'];
export const servedByRank = (role) => {
  const i = FLOOR_ROLES.indexOf(String(role || '').toLowerCase());
  return i === -1 ? FLOOR_ROLES.length : i;
};

export async function loadServedBy(restaurantId) {
  if (!restaurantId) return null;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(KEY(restaurantId))) || 'null');
    return v && v.id ? { id: String(v.id), name: v.name || '' } : null;
  } catch (_) { return null; }
}

export async function saveServedBy(restaurantId, staff) {
  if (!restaurantId) return;
  try {
    if (staff && staff.id) await AsyncStorage.setItem(KEY(restaurantId), JSON.stringify({ id: String(staff.id), name: staff.name || '' }));
    else await AsyncStorage.removeItem(KEY(restaurantId));
  } catch (_) { /* storage unavailable — choice just isn't remembered */ }
}
