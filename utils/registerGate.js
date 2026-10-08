// "Register must be open to bill" (Admin → POS Settings → requireRegisterOpen) — web parity
// (dashboard/page.js processOrder): billing is allowed when the cash register OR the person's
// Shifts & Cash shift is open. App-specific safety: it blocks ONLY when the server answered and
// nothing is open — if the check can't reach the server (offline / error), billing goes on, so an
// offline restaurant is never stopped by this check.
import { Alert } from 'react-native';
import apiClient from '../services/api';

const openCache = new Map(); // restaurantId → time an open register/shift was last seen

export async function registerBlocksBilling(restaurantId, posSettings) {
  if (!restaurantId || !posSettings || !posSettings.requireRegisterOpen) return false;
  const seen = openCache.get(restaurantId);
  if (seen && Date.now() - seen < 60 * 1000) return false;
  const [reg, shift] = await Promise.allSettled([
    apiClient.getCurrentRegister(restaurantId),
    apiClient.getCurrentShift(restaurantId),
  ]);
  const answered = reg.status === 'fulfilled' || shift.status === 'fulfilled';
  const open = (reg.status === 'fulfilled' && !!reg.value?.register)
    || (shift.status === 'fulfilled' && !!shift.value?.shift);
  if (open) { openCache.set(restaurantId, Date.now()); return false; }
  return answered; // nothing open and the server said so → block; no answer → don't block
}

export function alertRegisterNotOpen() {
  Alert.alert(
    'Register not open',
    'Open the cash register (More → Register) or start your shift (More → Shifts & Cash) before billing.',
  );
}
