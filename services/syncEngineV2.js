import NetInfo from '@react-native-community/netinfo';
import {
  dequeue,
  markSyncing,
  markSynced,
  markFailed,
  revertSyncing,
  revertSyncingItem,
  getQueueStats,
  getPendingCount,
} from './syncQueueV2';
import * as offlineStore from './offlineStore';

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const MAX_CONSECUTIVE_AUTH_FAILURES = 3;
const SYNC_TIMEOUT_MS = 120000; // 2 minutes max for entire sync run

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
  for (const fn of syncListeners) {
    try { fn(event); } catch (e) { console.error('Sync listener error:', e); }
  }
}

/**
 * Initialize sync engine: revert any items stuck in 'syncing' state
 * (e.g., app was killed during previous sync).
 */
export function initSyncEngine() {
  revertSyncing();
}

/**
 * Process all pending sync queue items.
 * Sends them to the server respecting priority and dependencies.
 */
export async function syncAll(apiClient) {
  if (isSyncing) return { synced: 0, failed: 0, skipped: 0 };

  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return { synced: 0, failed: 0, skipped: 0 };

  isSyncing = true;
  notifyListeners({ type: 'sync_started' });

  let syncedCount = 0;
  let failedCount = 0;
  let authFailures = 0;
  const startTime = Date.now();

  try {
    while (true) {
      // Timeout check — don't sync forever
      if (Date.now() - startTime > SYNC_TIMEOUT_MS) {
        console.warn('Sync timeout reached after', SYNC_TIMEOUT_MS, 'ms');
        break;
      }

      // Check network before each item
      const currentNet = await NetInfo.fetch();
      if (!currentNet.isConnected) {
        // Network dropped mid-sync — notify UI so banner doesn't stick
        notifyListeners({ type: 'sync_error', error: 'Network disconnected during sync' });
        break;
      }

      // Too many auth failures — stop and let user re-auth
      if (authFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
        notifyListeners({ type: 'auth_required' });
        break;
      }

      const item = dequeue();
      if (!item) break; // No more pending items (or all blocked by deps)

      // Skip items that exceeded max retries
      if (item.retry_count >= (item.max_retries || MAX_RETRIES)) {
        markFailed(item.idempotency_key, 'Max retries exceeded');
        notifyListeners({ type: 'item_failed', idempotencyKey: item.idempotency_key, error: 'Max retries exceeded' });
        failedCount++;
        continue;
      }

      markSyncing(item.idempotency_key);

      try {
        const response = await executeRequest(apiClient, item);

        markSynced(item.idempotency_key);
        syncedCount++;

        // Post-sync: update local data with server response
        await handlePostSync(item, response);

        notifyListeners({
          type: 'item_synced',
          idempotencyKey: item.idempotency_key,
          entityType: item.entity_type,
          response,
        });

        authFailures = 0; // Reset on success

      } catch (err) {
        const statusCode = err.response?.status || err.statusCode;

        if (statusCode === 403 || statusCode === 401) {
          // Auth failure — mark failed and count
          markFailed(item.idempotency_key, `Auth error: ${statusCode}`);
          authFailures++;
          failedCount++;
          continue;
        }

        if (statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429) {
          // Client error (not retryable) — mark as failed permanently
          markFailed(item.idempotency_key, err.message || `HTTP ${statusCode}`);
          failedCount++;
          notifyListeners({
            type: 'item_failed',
            idempotencyKey: item.idempotency_key,
            error: err.message,
          });
          continue;
        }

        // Network/server error — revert ONLY THIS ITEM to pending for retry
        revertSyncingItem(item.idempotency_key);
        failedCount++;

        // Exponential backoff
        const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, item.retry_count), MAX_BACKOFF_MS);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (err) {
    console.error('Sync engine error:', err);
    notifyListeners({ type: 'sync_error', error: err.message });
  } finally {
    // ALWAYS emit sync_complete so UI never gets stuck on "Syncing..."
    const stats = getQueueStats();
    notifyListeners({
      type: 'sync_complete',
      syncedCount,
      failedCount,
      pendingCount: stats.pending,
    });
    isSyncing = false;
  }

  return { synced: syncedCount, failed: failedCount };
}

/**
 * Execute a single sync queue item against the API.
 */
async function executeRequest(apiClient, item) {
  const { endpoint, method, payload } = item;

  // Ensure the payload has the idempotency key
  const data = { ...payload, idempotencyKey: item.idempotency_key, syncSource: 'offline' };

  // Tell backend to skip table availability checks for offline synced orders
  const headers = { 'x-sync-source': 'offline' };

  switch (method) {
    case 'POST':
      return apiClient.request(endpoint, { method: 'POST', data, headers });
    case 'PATCH':
      return apiClient.request(endpoint, { method: 'PATCH', data, headers });
    case 'PUT':
      return apiClient.request(endpoint, { method: 'PUT', data, headers });
    case 'DELETE':
      return apiClient.request(endpoint, { method: 'DELETE', data, headers });
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

/**
 * After a sync item succeeds, update local SQLite with the server response.
 */
async function handlePostSync(item, response) {
  try {
    switch (item.entity_type) {
      case 'order': {
        const serverOrder = response?.order;
        if (serverOrder) {
          const restaurantId = item.payload.restaurantId;
          // Replace local order with server version
          offlineStore.replaceLocalOrderWithServer(
            item.idempotency_key, // local ID was the idempotency key
            serverOrder,
            restaurantId
          );
        }
        break;
      }

      case 'order_status':
      case 'order_update': {
        // Update local order with any returned data
        const orderId = item.payload.orderId || extractOrderIdFromEndpoint(item.endpoint);
        if (orderId && response) {
          offlineStore.updateLocalOrder(orderId, response.order || response);
        }
        break;
      }

      case 'table_status': {
        // Server confirmed table status — already updated locally
        break;
      }

      case 'customer': {
        if (response?.customer) {
          offlineStore.upsertCustomer(response.customer);
        }
        break;
      }

      // Other entity types — no special post-sync handling
      default:
        break;
    }
  } catch (e) {
    console.error('Post-sync handler error:', e);
    // Non-blocking — the sync itself succeeded
  }
}

/**
 * Extract order ID from endpoint path like /api/orders/:orderId/status
 */
function extractOrderIdFromEndpoint(endpoint) {
  const match = endpoint.match(/\/api\/orders\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Check if sync is in progress.
 */
export function isSyncInProgress() {
  return isSyncing;
}

/**
 * Get current sync queue statistics.
 */
export function getSyncStats() {
  return getQueueStats();
}

/**
 * Get pending count for UI badges.
 */
export function getSyncPendingCount() {
  return getPendingCount();
}
