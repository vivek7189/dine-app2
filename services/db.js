import * as SQLite from 'expo-sqlite';

const DB_NAME = 'dineopen.db';
const SCHEMA_VERSION = 2;

let db = null;

/**
 * Get or create the SQLite database instance.
 * Uses WAL mode for better concurrent read/write performance.
 */
export function getDb() {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync('PRAGMA journal_mode = WAL;');
    db.execSync('PRAGMA foreign_keys = ON;');
  }
  return db;
}

/**
 * Run all pending migrations. Called once on app startup.
 */
export function runMigrations() {
  const database = getDb();

  // Create meta table if not exists
  database.execSync(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  // Get current schema version
  const row = database.getFirstSync('SELECT value FROM _meta WHERE key = ?', ['schema_version']);
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion < 1) {
    applyV1(database);
  }

  if (currentVersion < 2) {
    applyV2(database);
  }

  // Update schema version
  database.runSync(
    'INSERT OR REPLACE INTO _meta (key, value, updated_at) VALUES (?, ?, ?)',
    ['schema_version', String(SCHEMA_VERSION), Date.now()]
  );
}

/**
 * V1 schema — initial tables for offline mode.
 */
function applyV1(database) {
  // Reference data tables
  database.execSync(`
    CREATE TABLE IF NOT EXISTS restaurant (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT,
      category TEXT,
      price REAL,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_menu_restaurant ON menu_items(restaurant_id);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category);');

  database.execSync(`
    CREATE TABLE IF NOT EXISTS floors (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS tables_local (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      floor_id TEXT,
      name TEXT,
      status TEXT DEFAULT 'available',
      current_order_id TEXT,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables_local(restaurant_id);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_tables_status ON tables_local(status);');

  database.execSync(`
    CREATE TABLE IF NOT EXISTS tax_settings (
      restaurant_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS billing_settings (
      restaurant_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS pricing_settings (
      restaurant_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);');

  database.execSync(`
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      name TEXT,
      current_stock REAL,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);');

  database.execSync(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      menu_item_id TEXT,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  database.execSync(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);

  // Transactional data
  database.execSync(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      daily_order_id TEXT,
      status TEXT NOT NULL,
      table_id TEXT,
      total REAL,
      data TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      is_local INTEGER DEFAULT 0,
      synced_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_orders_local ON orders(is_local);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);');

  // Sync queue
  database.execSync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      entity_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      method TEXT NOT NULL,
      payload TEXT NOT NULL,
      depends_on TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 5,
      last_error TEXT,
      priority INTEGER DEFAULT 100,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_sync_priority ON sync_queue(priority, created_at);');
  database.execSync('CREATE INDEX IF NOT EXISTS idx_sync_depends ON sync_queue(depends_on);');

  // Local order sequences
  database.execSync(`
    CREATE TABLE IF NOT EXISTS local_sequences (
      restaurant_id TEXT NOT NULL,
      date TEXT NOT NULL,
      next_sequence INTEGER DEFAULT 1,
      PRIMARY KEY (restaurant_id, date)
    );
  `);

  // Sync log
  database.execSync(`
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT,
      entity_type TEXT,
      action TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

/**
 * V2 schema — saved carts (parked orders & templates).
 */
function applyV2(database) {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS saved_carts (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      type TEXT DEFAULT 'parked',
      name TEXT,
      data TEXT NOT NULL,
      synced_at INTEGER NOT NULL
    );
  `);
  database.execSync('CREATE INDEX IF NOT EXISTS idx_saved_carts_restaurant ON saved_carts(restaurant_id);');
}

/**
 * Delete the database and reset (nuclear option).
 */
export async function resetDatabase() {
  if (db) {
    db.closeSync();
    db = null;
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
}

/**
 * Get a metadata value.
 */
export function getMeta(key) {
  const database = getDb();
  const row = database.getFirstSync('SELECT value FROM _meta WHERE key = ?', [key]);
  return row ? row.value : null;
}

/**
 * Set a metadata value.
 */
export function setMeta(key, value) {
  const database = getDb();
  database.runSync(
    'INSERT OR REPLACE INTO _meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, String(value), Date.now()]
  );
}
