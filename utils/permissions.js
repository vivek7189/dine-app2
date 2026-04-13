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

module.exports = { FEATURE_OPS, ADMIN_TAB_OPS, ADMIN_TAB_LABELS, resolveFeaturePermissions, canPerform };
