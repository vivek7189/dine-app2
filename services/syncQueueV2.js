import { getDb } from './db';
import * as Crypto from 'expo-crypto';

const now = () => Date.now();

/**
 * Generate a UUID v4 idempotency key.
 */
export function generateIdempotencyKey() {
  return Crypto.randomUUID();
}

/**
 * Enqueue a write operation for offline sync.
 * @param {Object} params
 * @param {string} params.entityType - 'order','order_status','table_status','kot_status','customer','waste_entry','saved_cart','settings'
 * @param {string} params.operation - 'create','update','delete'
 * @param {string} params.endpoint - API endpoint path
 * @param {string} params.method - 'POST','PATCH','PUT','DELETE'
 * @param {Object} params.payload - Request body
 * @param {string} [params.dependsOn] - idempotencyKey of item that must sync first
 * @param {number} [params.priority] - Lower = higher priority (default 100)
 * @param {string} [params.idempotencyKey] - Provide existing key or auto-generate
 * @returns {string} idempotencyKey
 */
export function enqueue({
  entityType,
  operation,
  endpoint,
  method,
  payload,
  dependsOn = null,
  priority = 100,
  idempotencyKey = null,
}) {
  const db = getDb();
  const key = idempotencyKey || generateIdempotencyKey();
  const ts = now();

  db.runSync(
    `INSERT INTO sync_queue
     (idempotency_key, entity_type, operation, endpoint, method, payload, depends_on, status, retry_count, priority, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    [key, entityType, operation, endpoint, method, JSON.stringify(payload), dependsOn, priority, ts, ts]
  );

  addSyncLog(key, entityType, 'queued', null);
  return key;
}

/**
 * Get the next pending item to sync, respecting priority and dependencies.
 */
export function dequeue() {
  const db = getDb();
  // Get the highest priority pending item whose dependency (if any) is already synced or has no dependency
  const row = db.getFirstSync(
    `SELECT * FROM sync_queue
     WHERE status = 'pending'
     AND (depends_on IS NULL
       OR depends_on IN (SELECT idempotency_key FROM sync_queue WHERE status = 'synced')
       OR depends_on NOT IN (SELECT idempotency_key FROM sync_queue))
     ORDER BY priority ASC, created_at ASC
     LIMIT 1`
  );
  if (!row) return null;
  return {
    ...row,
    payload: JSON.parse(row.payload),
  };
}

/**
 * Get all pending items in sync order.
 */
export function getPendingItems() {
  const db = getDb();
  return db.getAllSync(
    `SELECT * FROM sync_queue
     WHERE status = 'pending'
     ORDER BY priority ASC, created_at ASC`
  ).map(row => ({ ...row, payload: JSON.parse(row.payload) }));
}

/**
 * Mark an item as syncing.
 */
export function markSyncing(idempotencyKey) {
  const db = getDb();
  db.runSync(
    'UPDATE sync_queue SET status = ?, updated_at = ? WHERE idempotency_key = ?',
    ['syncing', now(), idempotencyKey]
  );
}

/**
 * Mark an item as successfully synced.
 */
export function markSynced(idempotencyKey) {
  const db = getDb();
  db.runSync(
    'UPDATE sync_queue SET status = ?, updated_at = ? WHERE idempotency_key = ?',
    ['synced', now(), idempotencyKey]
  );
  addSyncLog(idempotencyKey, null, 'synced', null);
}

/**
 * Mark an item as failed.
 */
export function markFailed(idempotencyKey, error) {
  const db = getDb();
  db.runSync(
    'UPDATE sync_queue SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = ? WHERE idempotency_key = ?',
    ['failed', typeof error === 'string' ? error : JSON.stringify(error), now(), idempotencyKey]
  );
  addSyncLog(idempotencyKey, null, 'failed', error);
}

/**
 * Revert a syncing item back to pending (e.g., app killed during sync).
 */
export function revertSyncing() {
  const db = getDb();
  db.runSync(
    "UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = 'syncing'",
    [now()]
  );
}

/**
 * Retry a specific failed item.
 */
export function retryItem(idempotencyKey) {
  const db = getDb();
  db.runSync(
    "UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE idempotency_key = ? AND status = 'failed'",
    [now(), idempotencyKey]
  );
}

/**
 * Retry all failed items.
 */
export function retryAllFailed() {
  const db = getDb();
  db.runSync(
    "UPDATE sync_queue SET status = 'pending', updated_at = ? WHERE status = 'failed'",
    [now()]
  );
}

/**
 * Get queue statistics.
 */
export function getQueueStats() {
  const db = getDb();
  const rows = db.getAllSync(
    "SELECT status, COUNT(*) as count FROM sync_queue WHERE status != 'synced' GROUP BY status"
  );
  const stats = { pending: 0, syncing: 0, failed: 0, total: 0 };
  for (const row of rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  return stats;
}

/**
 * Get count of pending items.
 */
export function getPendingCount() {
  const db = getDb();
  const row = db.getFirstSync("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'");
  return row ? row.count : 0;
}

/**
 * Get count of failed items.
 */
export function getFailedCount() {
  const db = getDb();
  const row = db.getFirstSync("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'");
  return row ? row.count : 0;
}

/**
 * Get failed items with details.
 */
export function getFailedItems() {
  const db = getDb();
  return db.getAllSync(
    "SELECT * FROM sync_queue WHERE status = 'failed' ORDER BY created_at ASC"
  ).map(row => ({ ...row, payload: JSON.parse(row.payload) }));
}

/**
 * Delete a specific item from the queue.
 */
export function deleteItem(idempotencyKey) {
  const db = getDb();
  db.runSync('DELETE FROM sync_queue WHERE idempotency_key = ?', [idempotencyKey]);
}

/**
 * Clean up synced items older than maxAge (default 7 days).
 */
export function cleanupSynced(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  const db = getDb();
  const cutoff = now() - maxAgeMs;
  db.runSync("DELETE FROM sync_queue WHERE status = 'synced' AND updated_at < ?", [cutoff]);
}

/**
 * Check if a specific idempotency key exists in the queue.
 */
export function hasItem(idempotencyKey) {
  const db = getDb();
  const row = db.getFirstSync('SELECT 1 FROM sync_queue WHERE idempotency_key = ?', [idempotencyKey]);
  return !!row;
}

// ============================================
// Sync Log
// ============================================
function addSyncLog(idempotencyKey, entityType, action, details) {
  try {
    const db = getDb();
    db.runSync(
      'INSERT INTO sync_log (idempotency_key, entity_type, action, details, created_at) VALUES (?, ?, ?, ?, ?)',
      [idempotencyKey, entityType, action, details ? JSON.stringify(details) : null, now()]
    );
    // Cap at 500 entries
    db.runSync(
      'DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 500)'
    );
  } catch (e) {
    console.error('Sync log write error:', e);
  }
}

export function getSyncLogs(limit = 50) {
  const db = getDb();
  return db.getAllSync(
    'SELECT * FROM sync_log ORDER BY id DESC LIMIT ?',
    [limit]
  );
}
