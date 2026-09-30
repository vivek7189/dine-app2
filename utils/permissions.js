// Granular feature permission utilities for dine-app

const ADMIN_TAB_OPS = [
  'settings', 'tax', 'pricing', 'payments', 'billingSettings',
  'currency', 'print', 'features', 'restaurants', 'staff',
  'orderManagement', 'offers', 'loyalty', 'googleReviews', 'whatsapp'
];

const FEATURE_OPS = {
  inventory: ['read', 'add', 'update', 'delete'],
  menu: ['read', 'add', 'update', 'delete', 'markOutOfStock'],
  orders: ['read', 'update', 'cancel', 'refund', 'completeBill'],
  tables: ['read', 'add', 'update', 'delete', 'reset'],
  customers: ['read', 'add', 'update', 'delete'],
  offers: ['read', 'add', 'update', 'delete'],
  admin: ADMIN_TAB_OPS
};

const ADMIN_TAB_LABELS = {
  settings: 'General',
  tax: 'Tax Management',
  pricing: 'Pricing Rules',
  payments: 'Payment Settings',
  billingSettings: 'Billing',
  currency: 'Currency',
  print: 'Print Settings',
  features: 'Features',
  restaurants: 'Restaurants',
  staff: 'Staff',
  orderManagement: 'Order Management',
  offers: 'Offers & Discounts',
  loyalty: 'Loyalty Program',
  googleReviews: 'Google Reviews',
  whatsapp: 'WhatsApp',
};

function resolveFeaturePermissions(pageAccess, feature) {
  const ops = FEATURE_OPS[feature] || ['read', 'add', 'update', 'delete'];
  const val = pageAccess?.[feature];
  if (typeof val === 'object' && val !== null) {
    const result = {};
    for (const op of ops) result[op] = !!val[op];
    return result;
  }
  const boolVal = !!val;
  const result = {};
  for (const op of ops) result[op] = boolVal;
  return result;
}

function canPerform(user, pageAccess, feature, operation) {
  const role = user?.role?.toLowerCase();
  if (role === 'owner' || role === 'admin') return true;

  // Legacy standalone boolean fallbacks
  if (feature === 'orders' && operation === 'completeBill' && pageAccess?.completeBill !== undefined) {
    return !!pageAccess.completeBill;
  }
  if (feature === 'tables' && operation === 'reset' && pageAccess?.resetTables !== undefined) {
    return !!pageAccess.resetTables;
  }

  const perms = resolveFeaturePermissions(pageAccess, feature);
  if (perms[operation]) return true;

  return false;
}

/**
 * Check if a user has access to a feature based on role + pageAccess.
 * - owner, admin always have access (bypass).
 * - For all other roles, checks pageAccess[feature].
 *   If boolean true → access granted.
 *   If object → access granted when at least one sub-permission is true.
 * - bypassRoles: additional roles that always get access (e.g. 'waiter' for tables).
 */
function hasFeatureAccess(user, feature, bypassRoles = []) {
  const role = user?.role?.toLowerCase();
  if (role === 'owner' || role === 'admin') return true;
  if (bypassRoles.includes(role)) return true;

  const pa = user?.pageAccess;
  if (!pa) return false;

  const val = pa[feature];
  if (val === true) return true;
  if (typeof val === 'object' && val !== null) {
    return Object.values(val).some(Boolean);
  }
  return false;
}


// Floor / waiter-app roles: a plain `menu: true` means "use the menu"; what they may change comes from
// Admin → Waiter App → Menu permissions (restaurant.posSettings.waiterAppConfig). Same rule as the backend.
// Admin → Waiter App settings (tabs, More-menu items, table buttons) apply to waiters, and to any
// other role the owner ticked under "Apply these settings to" (waiterAppConfig.applyToRoles).
// Owner / admin / co-owner / manager are never limited by them.
function followsWaiterAppConfig(role, waiterAppConfig) {
  const r = String(role || '').toLowerCase();
  if (!r) return false;
  if (r === 'waiter') return true;
  if (['owner', 'admin', 'co-owner', 'manager'].includes(r)) return false;
  const list = Array.isArray(waiterAppConfig?.applyToRoles) ? waiterAppConfig.applyToRoles : [];
  return list.some(x => String(x).toLowerCase() === r);
}

const WAITER_APP_MENU_ROLES = ['waiter', 'captain', 'employee', 'chef', 'cook', 'kitchen', 'parcel', 'delivery', 'steward', 'runner', 'helper'];

const MENU_OP_KEY = { read: 'menu.view', add: 'menu.add', update: 'menu.edit', delete: 'menu.delete', markOutOfStock: 'menu.outOfStock' };

function canDoMenu(user, operation, waiterAppConfig) {
  const role = String(user?.role || '').toLowerCase();
  if (['owner', 'admin'].includes(role)) return true;
  const byRole = MENU_OP_KEY[operation] ? roleCan(user, MENU_OP_KEY[operation]) : null;
  if (byRole !== null) return byRole;
  const pa = user?.pageAccess;
  if (WAITER_APP_MENU_ROLES.includes(role) && !(pa?.menu && typeof pa.menu === 'object')) {
    if (!pa?.menu) return false;
    const cfg = waiterAppConfig || {};
    if (operation === 'read') return true;
    if (operation === 'markOutOfStock') return cfg.menuCanMarkOutOfStock !== false;
    if (operation === 'update') return cfg.menuCanEdit === true;
    if (operation === 'add') return cfg.menuCanAdd === true;
    if (operation === 'delete') return cfg.menuCanDelete === true;
    return false;
  }
  if (['manager', 'cashier'].includes(role) && !pa?.menu) return true; // screen was always open to them
  return !!resolveFeaturePermissions(pa, 'menu')[operation];
}

// Roles (restaurants with roles switched on): the person's permissions from the server, saved on the
// user as rolePermissions = { rid, permissions: { key: 'allow' | 'deny' } } by the settings refresh.
// Returns true / false when roles are on for the user's current restaurant, or null when they aren't
// (callers then keep today's logic). Owner / admin / co-owner: always true.
function roleCan(user, key) {
  const role = String(user?.role || '').toLowerCase();
  const rp = user?.rolePermissions;
  const rid = user?.restaurantId || user?.restaurant?.id;
  if (!rp || !rp.permissions || !rid || rp.rid !== rid) return null;
  if (['owner', 'admin', 'co-owner'].includes(role)) return true;
  return rp.permissions[key] === 'allow';
}

// One CommonJS export for everything. (Mixing `module.exports = {…}` with ES `export` made Babel drop
// the `export`ed functions — canDoMenu / followsWaiterAppConfig came out undefined at runtime.)
module.exports = {
  FEATURE_OPS, ADMIN_TAB_OPS, ADMIN_TAB_LABELS, resolveFeaturePermissions, canPerform, hasFeatureAccess,
  WAITER_APP_MENU_ROLES, canDoMenu, followsWaiterAppConfig, roleCan,
};
