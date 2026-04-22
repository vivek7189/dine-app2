import { getDb } from './db';

const now = () => Date.now();

// ============================================
// Helper: parse JSON data column safely
// ============================================
function parseData(row) {
  if (!row) return null;
  try {
    return typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  } catch {
    return null;
  }
}

function parseRows(rows) {
  return rows.map(r => parseData(r)).filter(Boolean);
}

// ============================================
// Restaurant
// ============================================
export function saveRestaurant(id, data) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO restaurant (id, data, synced_at) VALUES (?, ?, ?)',
    [id, JSON.stringify(data), now()]
  );
}

export function getRestaurant(id) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM restaurant WHERE id = ?', [id]);
  return parseData(row);
}

// ============================================
// Menu Items
// ============================================
export function saveMenuItems(restaurantId, items) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM menu_items WHERE restaurant_id = ?', [restaurantId]);
    for (const item of items) {
      db.runSync(
        'INSERT INTO menu_items (id, restaurant_id, name, category, price, data, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [item.id, restaurantId, item.name || '', item.category || '', item.price || 0, JSON.stringify(item), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getMenuItems(restaurantId, category) {
  const db = getDb();
  if (category) {
    return parseRows(
      db.getAllSync('SELECT data FROM menu_items WHERE restaurant_id = ? AND category = ?', [restaurantId, category])
    );
  }
  return parseRows(
    db.getAllSync('SELECT data FROM menu_items WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Floors
// ============================================
export function saveFloors(restaurantId, floors) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM floors WHERE restaurant_id = ?', [restaurantId]);
    for (const floor of floors) {
      db.runSync(
        'INSERT INTO floors (id, restaurant_id, name, data, synced_at) VALUES (?, ?, ?, ?, ?)',
        [floor.id, restaurantId, floor.name || '', JSON.stringify(floor), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getFloors(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM floors WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Tables
// ============================================
export function saveTables(restaurantId, tables) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM tables_local WHERE restaurant_id = ?', [restaurantId]);
    for (const table of tables) {
      db.runSync(
        'INSERT INTO tables_local (id, restaurant_id, floor_id, name, status, current_order_id, data, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [table.id, restaurantId, table.floor || table.floorId || '', table.name || '', table.status || 'available', table.currentOrderId || null, JSON.stringify(table), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getTables(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM tables_local WHERE restaurant_id = ?', [restaurantId])
  );
}

export function updateTableStatus(tableId, status, orderId) {
  const db = getDb();
  // Get existing data, update status field
  const row = db.getFirstSync('SELECT data FROM tables_local WHERE id = ?', [tableId]);
  if (row) {
    const data = parseData(row);
    if (data) {
      data.status = status;
      data.currentOrderId = orderId || null;
      db.runSync(
        'UPDATE tables_local SET status = ?, current_order_id = ?, data = ?, synced_at = ? WHERE id = ?',
        [status, orderId || null, JSON.stringify(data), now(), tableId]
      );
    }
  }
}

// ============================================
// Tax Settings
// ============================================
export function saveTaxSettings(restaurantId, data) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO tax_settings (restaurant_id, data, synced_at) VALUES (?, ?, ?)',
    [restaurantId, JSON.stringify(data), now()]
  );
}

export function getTaxSettings(restaurantId) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM tax_settings WHERE restaurant_id = ?', [restaurantId]);
  return parseData(row);
}

// ============================================
// Billing Settings
// ============================================
export function saveBillingSettings(restaurantId, data) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO billing_settings (restaurant_id, data, synced_at) VALUES (?, ?, ?)',
    [restaurantId, JSON.stringify(data), now()]
  );
}

export function getBillingSettings(restaurantId) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM billing_settings WHERE restaurant_id = ?', [restaurantId]);
  return parseData(row);
}

// ============================================
// Pricing Settings
// ============================================
export function savePricingSettings(restaurantId, data) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO pricing_settings (restaurant_id, data, synced_at) VALUES (?, ?, ?)',
    [restaurantId, JSON.stringify(data), now()]
  );
}

export function getPricingSettings(restaurantId) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM pricing_settings WHERE restaurant_id = ?', [restaurantId]);
  return parseData(row);
}

// ============================================
// Customers
// ============================================
export function saveCustomers(restaurantId, customers) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM customers WHERE restaurant_id = ?', [restaurantId]);
    for (const customer of customers) {
      db.runSync(
        'INSERT INTO customers (id, restaurant_id, name, phone, data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
        [customer.id, restaurantId, customer.name || '', customer.phone || '', JSON.stringify(customer), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getCustomers(restaurantId, search) {
  const db = getDb();
  if (search) {
    const pattern = `%${search}%`;
    return parseRows(
      db.getAllSync(
        'SELECT data FROM customers WHERE restaurant_id = ? AND (name LIKE ? OR phone LIKE ?)',
        [restaurantId, pattern, pattern]
      )
    );
  }
  return parseRows(
    db.getAllSync('SELECT data FROM customers WHERE restaurant_id = ?', [restaurantId])
  );
}

export function upsertCustomer(customer) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO customers (id, restaurant_id, name, phone, data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
    [customer.id, customer.restaurantId, customer.name || '', customer.phone || '', JSON.stringify(customer), now()]
  );
}

// ============================================
// Offers
// ============================================
export function saveOffers(restaurantId, offers) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM offers WHERE restaurant_id = ?', [restaurantId]);
    for (const offer of offers) {
      db.runSync(
        'INSERT INTO offers (id, restaurant_id, data, synced_at) VALUES (?, ?, ?, ?)',
        [offer.id, restaurantId, JSON.stringify(offer), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getOffers(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM offers WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Offer Settings (offerSettings + loyaltySettings)
// ============================================
export function saveOfferSettings(restaurantId, data) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO offer_settings (restaurant_id, data, synced_at) VALUES (?, ?, ?)',
    [restaurantId, JSON.stringify(data), now()]
  );
}

export function getOfferSettings(restaurantId) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM offer_settings WHERE restaurant_id = ?', [restaurantId]);
  return parseData(row);
}

// ============================================
// Inventory Items
// ============================================
export function saveInventoryItems(restaurantId, items) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM inventory_items WHERE restaurant_id = ?', [restaurantId]);
    for (const item of items) {
      db.runSync(
        'INSERT INTO inventory_items (id, restaurant_id, name, current_stock, data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
        [item.id, restaurantId, item.name || '', item.currentStock || 0, JSON.stringify(item), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getInventoryItems(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM inventory_items WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Recipes
// ============================================
export function saveRecipes(restaurantId, recipes) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM recipes WHERE restaurant_id = ?', [restaurantId]);
    for (const recipe of recipes) {
      db.runSync(
        'INSERT INTO recipes (id, restaurant_id, menu_item_id, data, synced_at) VALUES (?, ?, ?, ?, ?)',
        [recipe.id, restaurantId, recipe.menuItemId || '', JSON.stringify(recipe), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getRecipes(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM recipes WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Rooms (Hotel)
// ============================================
export function saveRooms(restaurantId, rooms) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM rooms WHERE restaurant_id = ?', [restaurantId]);
    for (const room of rooms) {
      db.runSync(
        'INSERT INTO rooms (id, restaurant_id, data, synced_at) VALUES (?, ?, ?, ?)',
        [room.id, restaurantId, JSON.stringify(room), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getRooms(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM rooms WHERE restaurant_id = ?', [restaurantId])
  );
}

// ============================================
// Saved Carts
// ============================================
export function saveSavedCarts(restaurantId, carts) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    db.runSync('DELETE FROM saved_carts WHERE restaurant_id = ?', [restaurantId]);
    for (const cart of carts) {
      db.runSync(
        'INSERT INTO saved_carts (id, restaurant_id, type, name, data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
        [cart.id, restaurantId, cart.type || 'parked', cart.name || '', JSON.stringify(cart), ts]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getSavedCarts(restaurantId, type) {
  const db = getDb();
  if (type) {
    return parseRows(
      db.getAllSync('SELECT data FROM saved_carts WHERE restaurant_id = ? AND type = ?', [restaurantId, type])
    );
  }
  return parseRows(
    db.getAllSync('SELECT data FROM saved_carts WHERE restaurant_id = ?', [restaurantId])
  );
}

export function upsertSavedCart(cart) {
  const db = getDb();
  db.runSync(
    'INSERT OR REPLACE INTO saved_carts (id, restaurant_id, type, name, data, synced_at) VALUES (?, ?, ?, ?, ?, ?)',
    [cart.id, cart.restaurantId, cart.type || 'parked', cart.name || '', JSON.stringify(cart), now()]
  );
}

export function deleteSavedCart(cartId) {
  const db = getDb();
  db.runSync('DELETE FROM saved_carts WHERE id = ?', [cartId]);
}

// ============================================
// Orders
// ============================================
export function saveOrders(restaurantId, orders) {
  const db = getDb();
  const ts = now();
  db.execSync('BEGIN TRANSACTION;');
  try {
    for (const order of orders) {
      db.runSync(
        `INSERT OR REPLACE INTO orders
         (id, restaurant_id, daily_order_id, status, table_id, total, data, idempotency_key, is_local, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id,
          restaurantId,
          order.dailyOrderId || null,
          order.status || 'confirmed',
          order.tableNumber || order.tableId || null,
          order.finalAmount || order.totalAmount || 0,
          JSON.stringify(order),
          order.idempotencyKey || null,
          0, // is_local = false (from server)
          ts,
          order.createdAt ? new Date(order.createdAt).getTime() : ts,
          order.updatedAt ? new Date(order.updatedAt).getTime() : ts,
        ]
      );
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

export function getOrders(restaurantId, filters = {}) {
  const db = getDb();
  let query = 'SELECT data FROM orders WHERE restaurant_id = ?';
  const params = [restaurantId];

  if (filters.search) {
    query += ' AND (id = ? OR daily_order_id = ? OR idempotency_key = ?)';
    params.push(filters.search, filters.search, filters.search);
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query += ` AND status IN (${filters.status.map(() => '?').join(',')})`;
      params.push(...filters.status);
    } else {
      query += ' AND status = ?';
      params.push(filters.status);
    }
  }

  if (filters.today) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    query += ' AND created_at >= ?';
    params.push(startOfDay.getTime());
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  return parseRows(db.getAllSync(query, params));
}

export function insertLocalOrder(order) {
  const db = getDb();
  const ts = now();
  db.runSync(
    `INSERT INTO orders
     (id, restaurant_id, daily_order_id, status, table_id, total, data, idempotency_key, is_local, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      order.id || order.idempotencyKey,
      order.restaurantId,
      order.dailyOrderId || null,
      order.status || 'confirmed',
      order.tableNumber || order.tableId || null,
      order.finalAmount || order.totalAmount || 0,
      JSON.stringify(order),
      order.idempotencyKey,
      1, // is_local = true
      null, // not synced yet
      ts,
      ts,
    ]
  );
}

export function updateLocalOrder(id, updates) {
  const db = getDb();
  const row = db.getFirstSync('SELECT data FROM orders WHERE id = ?', [id]);
  if (!row) return;
  const data = parseData(row);
  if (!data) return;
  const updated = { ...data, ...updates };
  db.runSync(
    'UPDATE orders SET status = ?, total = ?, data = ?, updated_at = ? WHERE id = ?',
    [updated.status || data.status, updated.finalAmount || updated.totalAmount || data.finalAmount || 0, JSON.stringify(updated), now(), id]
  );
}

export function getLocalOnlyOrders(restaurantId) {
  const db = getDb();
  return parseRows(
    db.getAllSync('SELECT data FROM orders WHERE restaurant_id = ? AND is_local = 1', [restaurantId])
  );
}

export function replaceLocalOrderWithServer(localId, serverOrder, restaurantId) {
  const db = getDb();
  // Delete the local entry
  db.runSync('DELETE FROM orders WHERE id = ?', [localId]);
  // Insert the server version
  saveOrders(restaurantId, [serverOrder]);
}

// ============================================
// Local Sequences (for offline order IDs)
// ============================================
export function getNextLocalOrderSequence(restaurantId) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const row = db.getFirstSync(
    'SELECT next_sequence FROM local_sequences WHERE restaurant_id = ? AND date = ?',
    [restaurantId, today]
  );
  const seq = row ? row.next_sequence : 1;
  db.runSync(
    'INSERT OR REPLACE INTO local_sequences (restaurant_id, date, next_sequence) VALUES (?, ?, ?)',
    [restaurantId, today, seq + 1]
  );
  return seq;
}

// ============================================
// Clear all data (for logout or full reset)
// ============================================
export function clearAllData() {
  const db = getDb();
  const tables = [
    'restaurant', 'menu_items', 'floors', 'tables_local',
    'tax_settings', 'billing_settings', 'pricing_settings',
    'customers', 'offers', 'offer_settings', 'inventory_items', 'recipes', 'rooms',
    'saved_carts', 'orders', 'local_sequences', 'sync_queue', 'sync_log',
  ];
  db.execSync('BEGIN TRANSACTION;');
  try {
    for (const table of tables) {
      db.runSync(`DELETE FROM ${table}`);
    }
    db.execSync('COMMIT;');
  } catch (e) {
    db.execSync('ROLLBACK;');
    throw e;
  }
}

// ============================================
// Get last sync timestamp for a table
// ============================================
const VALID_TABLES = new Set([
  'restaurant', 'menu_items', 'floors', 'tables_local',
  'tax_settings', 'billing_settings', 'pricing_settings',
  'customers', 'offers', 'offer_settings', 'inventory_items', 'recipes', 'rooms', 'saved_carts', 'orders',
]);

export function getLastSyncTime(tableName, restaurantId) {
  if (!VALID_TABLES.has(tableName)) return null;
  const db = getDb();
  const row = db.getFirstSync(
    `SELECT MAX(synced_at) as last_sync FROM ${tableName} WHERE restaurant_id = ?`,
    [restaurantId]
  );
  return row ? row.last_sync : null;
}
