import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'dineopen_offline_pin';
const PIN_UNLOCKED_KEY = 'dineopen_pin_unlocked';

/**
 * Hash a 4-digit PIN using SHA-256.
 */
async function hashPin(pin) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin);
}

/**
 * Set (or update) the offline PIN.
 */
export async function setPin(pin) {
  const hash = await hashPin(pin);
  await AsyncStorage.setItem(PIN_HASH_KEY, hash);
}

/**
 * Verify a PIN against the stored hash.
 * Returns true if correct, false otherwise.
 */
export async function verifyPin(pin) {
  const stored = await AsyncStorage.getItem(PIN_HASH_KEY);
  if (!stored) return true; // No PIN set — always passes
  const hash = await hashPin(pin);
  return hash === stored;
}

/**
 * Check if a PIN has been set.
 */
export async function hasPin() {
  const stored = await AsyncStorage.getItem(PIN_HASH_KEY);
  return !!stored;
}

/**
 * Remove the offline PIN.
 */
export async function clearPin() {
  await AsyncStorage.removeItem(PIN_HASH_KEY);
  await AsyncStorage.removeItem(PIN_UNLOCKED_KEY);
}

/**
 * Mark session as unlocked (in-memory flag persisted until app restart/background).
 */
export async function markUnlocked() {
  await AsyncStorage.setItem(PIN_UNLOCKED_KEY, String(Date.now()));
}

/**
 * Check if current session is unlocked.
 * Unlocks expire after 30 minutes of inactivity.
 */
export async function isUnlocked() {
  const ts = await AsyncStorage.getItem(PIN_UNLOCKED_KEY);
  if (!ts) return false;
  const elapsed = Date.now() - parseInt(ts, 10);
  return elapsed < 30 * 60 * 1000; // 30 min
}

/**
 * Clear unlock state (e.g., on app background or logout).
 */
export async function lockSession() {
  await AsyncStorage.removeItem(PIN_UNLOCKED_KEY);
}
