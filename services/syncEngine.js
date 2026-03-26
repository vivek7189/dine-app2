import NetInfo from '@react-native-community/netinfo';
import {
  getQueuedOrders,
  removeFromQueue,
  updateOrderInQueue,
  getQueueCount,
  generateIdempotencyKey,
} from './offlineQueue';

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 30000;

let isSyncing = false;
let syncListeners = [];

/**
 * Register a listener for sync status changes.
 * Returns unsubscribe function.
 */
export function onSyncStatusChange(listener) {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifyListeners(event) {
  syncListeners.forEach(fn => {
    try { fn(event); } catch (e) { console.error('Sync listener error:', e); }
  });
}

/**
 * Process all pending offline orders.
 * Sends them to the server one by one (FIFO).
 * Uses exponential backoff on failure.
 */
export async function syncPendingOrders(apiClient) {
  if (isSyncing) return;

  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  isSyncing = true;
  notifyListeners({ type: 'sync_started' });

  try {
    const allOrders = await getQueuedOrders();
    const pending = allOrders.filter(o => o.syncStatus === 'pending');

    if (pending.length === 0) {
      isSyncing = false;
      notifyListeners({ type: 'sync_complete', pendingCount: 0 });
      return;
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const order of pending) {
      // Skip orders that exceeded max retries
      if (order.retryCount >= MAX_RETRIES) {
        await updateOrderInQueue(order.idempotencyKey, { syncStatus: 'failed' });
        notifyListeners({ type: 'failed', idempotencyKey: order.idempotencyKey });
        failedCount++;
        continue;
      }

      // Check network before each order
      const currentNet = await NetInfo.fetch();
      if (!currentNet.isConnected) break;

      try {
        await updateOrderInQueue(order.idempotencyKey, { syncStatus: 'syncing' });

        // Build clean order data for API (strip sync metadata)
        const { syncStatus, retryCount, createdAt, updatedAt, ...orderData } = order;
        const response = await apiClient.createOrder(orderData);

        if (response.order) {
          await removeFromQueue(order.idempotencyKey);
          notifyListeners({
            type: 'synced',
            idempotencyKey: order.idempotencyKey,
            orderId: response.order.id,
            dailyOrderId: response.order.dailyOrderId,
            idempotent: response.idempotent || false,
          });
          syncedCount++;
        }
      } catch (err) {
        const newRetryCount = order.retryCount + 1;
        await updateOrderInQueue(order.idempotencyKey, {
          syncStatus: 'pending',
          retryCount: newRetryCount,
          lastError: err.message,
        });

        // Exponential backoff
        const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, order.retryCount), MAX_BACKOFF_MS);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const remaining = await getQueueCount();
    notifyListeners({
      type: 'sync_complete',
      pendingCount: remaining,
      syncedCount,
      failedCount,
    });
  } catch (err) {
    console.error('Sync engine error:', err);
    notifyListeners({ type: 'sync_error', error: err.message });
  } finally {
    isSyncing = false;
  }
}

/**
 * Check if sync is currently in progress.
 */
export function isSyncInProgress() {
  return isSyncing;
}

export { generateIdempotencyKey };
