import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const QUEUE_KEY = 'dineopen_offline_orders';
const SYNC_LOG_KEY = 'dineopen_sync_log';

/**
 * Generate a UUID v4 idempotency key.
 */
export function generateIdempotencyKey() {
  return Crypto.randomUUID();
}

/**
 * Get all queued offline orders.
 */
export async function getQueuedOrders() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading offline queue:', e);
    return [];
  }
}

/**
 * Queue an order for offline sync.
 */
export async function queueOrder(orderData) {
  const idempotencyKey = orderData.idempotencyKey || generateIdempotencyKey();
  const order = {
    ...orderData,
    idempotencyKey,
    syncSource: 'offline',
    syncStatus: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  };

  const queue = await getQueuedOrders();
  queue.push(order);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  await addSyncLog({ idempotencyKey, action: 'queued', restaurantId: orderData.restaurantId });

  return idempotencyKey;
}

/**
 * Remove a synced order from the queue.
 */
export async function removeFromQueue(idempotencyKey) {
  const queue = await getQueuedOrders();
  const filtered = queue.filter(o => o.idempotencyKey !== idempotencyKey);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

/**
 * Update an order's sync status in the queue.
 */
export async function updateOrderInQueue(idempotencyKey, updates) {
  const queue = await getQueuedOrders();
  const idx = queue.findIndex(o => o.idempotencyKey === idempotencyKey);
  if (idx !== -1) {
    queue[idx] = { ...queue[idx], ...updates, updatedAt: Date.now() };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}

/**
 * Get count of pending orders.
 */
export async function getQueueCount() {
  const queue = await getQueuedOrders();
  return queue.filter(o => o.syncStatus === 'pending').length;
}

/**
 * Get count of failed orders.
 */
export async function getFailedCount() {
  const queue = await getQueuedOrders();
  return queue.filter(o => o.syncStatus === 'failed').length;
}

// ==========================================
// Sync Log (for debugging)
// ==========================================

async function addSyncLog(entry) {
  try {
    const raw = await AsyncStorage.getItem(SYNC_LOG_KEY);
    const logs = raw ? JSON.parse(raw) : [];
    logs.push({ ...entry, timestamp: Date.now() });
    // Keep last 100 entries
    const trimmed = logs.slice(-100);
    await AsyncStorage.setItem(SYNC_LOG_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Error writing sync log:', e);
  }
}

export async function getSyncLogs() {
  try {
    const raw = await AsyncStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw).reverse() : [];
  } catch (e) {
    return [];
  }
}
