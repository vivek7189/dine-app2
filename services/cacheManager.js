import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Simple stale-while-revalidate cache using AsyncStorage.
 * Each cache entry stores: { data, timestamp }
 */

export async function getCached(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCache(key, data) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('Cache write failed:', e.message);
  }
}

export function isFresh(timestamp, maxAgeMs = 5 * 60 * 1000) {
  if (!timestamp) return false;
  return Date.now() - timestamp < maxAgeMs;
}

export async function clearCache(keyPrefix = 'cache_') {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(k => k.startsWith(keyPrefix));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch (e) {
    console.warn('Cache clear failed:', e.message);
  }
}
