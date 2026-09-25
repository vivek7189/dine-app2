/**
 * Centralized Offer Engine (native port).
 *
 * Mirrors dine-backend/services/offerEngine.js verbatim for the six pure
 * functions and adds `calculateOfferResult` matching the web hook shape.
 *
 * No React Native imports, no Firestore imports — pure JS so it can be used
 * from any billing screen or background task. CommonJS style to match the rest
 * of dine-app/services/ (see services/api.js which uses `import`/class exports;
 * this file uses ES module default+named exports for parity with app code).
 */

// ---------- helpers ----------

const normalizePhone = (phone) => {
  if (phone === null || phone === undefined || phone === '') return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
};

const getItemId = (item) => item.menuItemId || item.id;
const getItemCategory = (item) => (item.category || item.categoryId || '').toString();
const getItemLineTotal = (item) => item.total || (item.price || 0) * (item.quantity || 1);

// Normalize category names for comparison — "Hot beverages", "Hot-Beverages", "hot_beverages" all match
const normalizeCategory = (cat) => String(cat || '').toLowerCase().replace(/[-_\s]+/g, '');

// Check if an item is excluded from a specific offer (backend parity: offerEngine.js:34)
const isItemExcluded = (item, offer) => {
  if (Array.isArray(offer.excludedItems) && offer.excludedItems.length > 0) {
    if (offer.excludedItems.includes(getItemId(item))) return true;
  }
  if (Array.isArray(offer.excludedCategories) && offer.excludedCategories.length > 0) {
    const normalizedExcluded = offer.excludedCategories.map(normalizeCategory);
    if (normalizedExcluded.includes(normalizeCategory(getItemCategory(item)))) return true;
  }
  return false;
};

// ---------- schedule & date validation ----------

const isScheduleValid = (offer, now = new Date(), timezone = null) => {
  if (!offer || !offer.schedule || offer.schedule.type !== 'recurring') return true;
  // Evaluate in the restaurant's local time when a timezone is provided (backend parity:
  // offerEngine.js:47). Without one, fall back to the device clock (unchanged behavior).
  let currentDay, currentHours, currentMins;
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(now);
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const weekday = parts.find(p => p.type === 'weekday')?.value || '';
      currentDay = dayMap[weekday] ?? now.getDay();
      currentHours = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      currentMins = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      if (currentHours === 24) currentHours = 0;
    } catch (_) {
      currentDay = now.getDay();
      currentHours = now.getHours();
      currentMins = now.getMinutes();
    }
  } else {
    currentDay = now.getDay();
    currentHours = now.getHours();
    currentMins = now.getMinutes();
  }
  const currentTime = `${String(currentHours).padStart(2, '0')}:${String(currentMins).padStart(2, '0')}`;
  const scheduleDays = offer.schedule.days || [];
  const startTime = offer.schedule.startTime || '00:00';
  const endTime = offer.schedule.endTime || '23:59';
  // Handle overnight ranges (e.g., 22:00–02:00)
  if (endTime < startTime) {
    const prevDay = (currentDay + 6) % 7;
    return (scheduleDays.includes(currentDay) && currentTime >= startTime) ||
           (scheduleDays.includes(prevDay) && currentTime <= endTime);
  }
  return scheduleDays.includes(currentDay) && currentTime >= startTime && currentTime <= endTime;
};

const isDateValid = (offer, now = new Date()) => {
  if (!offer) return false;
  if (offer.validFrom) {
    const from = new Date(offer.validFrom);
    if (now < from) return false;
  }
  if (offer.validUntil) {
    const until = new Date(offer.validUntil);
    until.setHours(23, 59, 59, 999);
    if (now > until) return false;
  }
  return true;
};

// ---------- audience matching ----------

const matchesAudience = (offer, context = {}) => {
  const legacyFirstOrder = offer.isFirstOrderOnly === true;
  const audience = offer.audience || (legacyFirstOrder ? { type: 'first_order' } : { type: 'all' });
  const type = audience.type || 'all';

  if (type === 'all') return true;
  if (type === 'first_order') return context.isFirstOrder === true;

  if (type === 'groups') {
    const offerGroups = Array.isArray(audience.groupIds) ? audience.groupIds : [];
    if (offerGroups.length === 0) return false;
    const custGroups = Array.isArray(context.customerGroupIds) ? context.customerGroupIds : [];
    if (custGroups.length === 0) return false;
    return offerGroups.some(gid => custGroups.includes(gid));
  }

  if (type === 'customers') {
    const custIds = Array.isArray(audience.customerIds) ? audience.customerIds : [];
    const custPhones = Array.isArray(audience.customerPhones)
      ? audience.customerPhones.map(normalizePhone).filter(Boolean)
      : [];
    if (context.customerId && custIds.includes(context.customerId)) return true;
    const normPhone = normalizePhone(context.customerPhone);
    if (normPhone && custPhones.includes(normPhone)) return true;
    return false;
  }

  return true;
};

// ---------- tiered discount resolution ----------

const resolveTier = (offer, subtotal) => {
  if (!Array.isArray(offer.tiers) || offer.tiers.length === 0) return null;
  const sorted = [...offer.tiers]
    .filter(t => t && typeof t.minSubtotal === 'number')
    .sort((a, b) => a.minSubtotal - b.minSubtotal);
  let matched = null;
  for (const tier of sorted) {
    if (subtotal >= tier.minSubtotal) matched = tier;
  }
  return matched;
};

// ---------- cross-item BOGO ----------

const calculateCrossItemBogo = (offer, cart) => {
  const cfg = offer.crossItemBogo;
  if (!cfg || !cfg.enabled) return { discount: 0, freeItems: [] };

  const buyItemIds = Array.isArray(cfg.buyItemIds) ? cfg.buyItemIds : [];
  const buyCategoryIds = Array.isArray(cfg.buyCategoryIds) ? cfg.buyCategoryIds : [];
  const getItemIds = Array.isArray(cfg.getItemIds) ? cfg.getItemIds : [];
  const buyQty = Number(cfg.buyQty) || 1;
  const getQty = Number(cfg.getQty) || 1;
  const maxApps = cfg.maxApplications != null ? Number(cfg.maxApplications) : Infinity;

  if (buyQty <= 0 || getQty <= 0 || getItemIds.length === 0) {
    return { discount: 0, freeItems: [] };
  }

  let buyUnits = 0;
  for (const item of cart) {
    if (item.discountApplicable === false) continue;
    if (isItemExcluded(item, offer)) continue;
    const id = getItemId(item);
    const cat = getItemCategory(item);
    const qty = item.quantity || 0;
    const matchById = buyItemIds.length > 0 && buyItemIds.includes(id);
    const matchByCat = buyCategoryIds.length > 0 && buyCategoryIds.some(bc => normalizeCategory(bc) === normalizeCategory(cat));
    if (matchById || matchByCat) buyUnits += qty;
  }

  const applications = Math.min(Math.floor(buyUnits / buyQty), maxApps);
  if (applications <= 0) return { discount: 0, freeItems: [] };

  const pool = [];
  for (const item of cart) {
    if (item.discountApplicable === false) continue;
    if (isItemExcluded(item, offer)) continue;
    const id = getItemId(item);
    if (!getItemIds.includes(id)) continue;
    const qty = item.quantity || 0;
    const price = item.price || 0;
    for (let i = 0; i < qty; i++) pool.push({ itemId: id, price });
  }
  pool.sort((a, b) => a.price - b.price);

  const totalFreeUnitsWanted = applications * getQty;
  const taken = pool.slice(0, totalFreeUnitsWanted);
  if (taken.length === 0) return { discount: 0, freeItems: [] };

  const agg = new Map();
  let discount = 0;
  for (const u of taken) {
    discount += u.price;
    const key = `${u.itemId}:${u.price}`;
    if (!agg.has(key)) agg.set(key, { itemId: u.itemId, qty: 0, unitPrice: u.price });
    agg.get(key).qty += 1;
  }

  return {
    discount: Math.round(discount * 100) / 100,
    freeItems: Array.from(agg.values()),
  };
};

// ---------- core discount calculation ----------

const calculateDiscountForOfferObject = (offer, subtotal, cart = [], context = {}) => {
  // Cashback offers credit the wallet AFTER payment — they never reduce the current bill
  // (backend parity: offerEngine.js:238). Prevents mobile from mis-applying them upfront.
  if (offer && offer.promotionType === 'cashback') {
    return { discount: 0, freeItems: [], appliedTier: null };
  }
  if (!offer || subtotal <= 0) return { discount: 0, freeItems: [], appliedTier: null };

  const offerScope = offer.scope || 'order';
  let applicableSubtotal = subtotal;

  // Scope filtering — also exclude non-discountable and offer-excluded items (backend parity:247)
  if (offerScope === 'category' && Array.isArray(offer.targetCategories) && offer.targetCategories.length > 0) {
    const normalizedTargets = offer.targetCategories.map(normalizeCategory);
    applicableSubtotal = cart
      .filter(item => item.discountApplicable !== false)
      .filter(item => !isItemExcluded(item, offer))
      .filter(item => normalizedTargets.includes(normalizeCategory(getItemCategory(item))))
      .reduce((sum, item) => sum + getItemLineTotal(item), 0);
  } else if (offerScope === 'item' && Array.isArray(offer.targetItems) && offer.targetItems.length > 0) {
    applicableSubtotal = cart
      .filter(item => item.discountApplicable !== false)
      .filter(item => !isItemExcluded(item, offer))
      .filter(item => offer.targetItems.includes(getItemId(item)))
      .reduce((sum, item) => sum + getItemLineTotal(item), 0);
  } else {
    applicableSubtotal = cart
      .filter(item => item.discountApplicable !== false)
      .filter(item => !isItemExcluded(item, offer))
      .reduce((sum, item) => sum + getItemLineTotal(item), 0);
  }

  // Tier override — if offer has tiers defined but none match, discount is 0
  const appliedTier = resolveTier(offer, subtotal);
  const hasTiers = Array.isArray(offer.tiers) && offer.tiers.length > 0;
  if (hasTiers && !appliedTier) return { discount: 0, freeItems: [], appliedTier: null };
  const effectiveDiscountType = appliedTier ? appliedTier.discountType : offer.discountType;
  const effectiveDiscountValue = appliedTier ? Number(appliedTier.discountValue) : (offer.discountValue || 0);

  let baseDiscount = 0;

  // Cross-item BOGO: when enabled, ONLY use free-item discount (no base discount)
  const cross = calculateCrossItemBogo(offer, cart);
  if (cross.discount > 0) {
    return { discount: cross.discount, freeItems: cross.freeItems, appliedTier };
  }

  // Legacy simple BOGO (same-item) — skip non-discountable and excluded items
  if (offer.promotionType === 'bogo' && offer.bogoConfig) {
    let bogoItems = cart.filter(item => item.discountApplicable !== false && !isItemExcluded(item, offer));
    if (offerScope === 'item' && offer.targetItems?.length > 0) {
      bogoItems = bogoItems.filter(item => offer.targetItems.includes(getItemId(item)));
    } else if (offerScope === 'category' && offer.targetCategories?.length > 0) {
      const normalizedTargets = offer.targetCategories.map(normalizeCategory);
      bogoItems = bogoItems.filter(item => normalizedTargets.includes(normalizeCategory(getItemCategory(item))));
    }
    const totalQty = bogoItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const buyQty = offer.bogoConfig.buyQty || 2;
    const getQty = offer.bogoConfig.getQty || 1;
    const getDiscount = offer.bogoConfig.getDiscount || 100;
    const sets = Math.floor(totalQty / (buyQty + getQty));
    if (sets > 0 && bogoItems.length > 0) {
      const cheapestPrice = Math.min(...bogoItems.map(item => item.price || 0));
      baseDiscount = Math.round(sets * getQty * cheapestPrice * (getDiscount / 100) * 100) / 100;
    }
  } else if (applicableSubtotal > 0) {
    if (effectiveDiscountType === 'percentage') {
      let disc = (applicableSubtotal * effectiveDiscountValue) / 100;
      if (offer.maxDiscount && disc > offer.maxDiscount) disc = offer.maxDiscount;
      baseDiscount = Math.round(disc * 100) / 100;
    } else if (effectiveDiscountType === 'flat_per_item') {
      // Fixed amount off EACH qualifying unit (e.g. "KSh 76 off every beer") — backend parity:307.
      // min(value, unitPrice) x qty across scoped, non-excluded items; never below the unit's price.
      const applicableItems = cart
        .filter(item => item.discountApplicable !== false && !isItemExcluded(item, offer))
        .filter(item => {
          if (offerScope === 'item' && offer.targetItems?.length > 0) return offer.targetItems.includes(getItemId(item));
          if (offerScope === 'category' && offer.targetCategories?.length > 0) return offer.targetCategories.map(normalizeCategory).includes(normalizeCategory(getItemCategory(item)));
          return true;
        });
      let disc = 0;
      for (const it of applicableItems) {
        disc += Math.min(effectiveDiscountValue, it.price || 0) * (it.quantity || 1);
      }
      if (offer.maxDiscount && disc > offer.maxDiscount) disc = offer.maxDiscount;
      baseDiscount = Math.round(disc * 100) / 100;
    } else {
      baseDiscount = Math.round(Math.min(effectiveDiscountValue, applicableSubtotal) * 100) / 100;
    }
  }

  const totalDiscount = baseDiscount;

  return {
    discount: totalDiscount,
    freeItems: cross.freeItems,
    appliedTier,
  };
};

/**
 * Web-hook-parity helper: returns { discount, freeItems, appliedTier }.
 */
export const calculateOfferResult = (offer, subtotal, cart = [], context = {}) =>
  calculateDiscountForOfferObject(offer, subtotal, cart, context);

/**
 * Backend-parity signature: returns { discount, freeItems, appliedTier }.
 */
export const calculateDiscountForOffer = (offer, subtotal, cart = [], context = {}) =>
  calculateDiscountForOfferObject(offer, subtotal, cart, context);

// ---------- filter & pick ----------

const hasScopeMatchingCart = (offer, cart) => {
  const scope = offer.scope || 'order';
  if (scope === 'category' && Array.isArray(offer.targetCategories) && offer.targetCategories.length > 0) {
    const normalizedTargets = offer.targetCategories.map(normalizeCategory);
    return cart.some(item => normalizedTargets.includes(normalizeCategory(getItemCategory(item))));
  }
  if (scope === 'item' && Array.isArray(offer.targetItems) && offer.targetItems.length > 0) {
    return cart.some(item => offer.targetItems.includes(getItemId(item)));
  }
  return true;
};

export const filterApplicableOffers = (offers, { subtotal, cart, context, now, timezone }) => {
  if (!Array.isArray(offers)) return [];
  const n = now || new Date();
  return offers.filter(offer => {
    if (!offer) return false;
    if (offer.isActive === false) return false;
    // Cashback offers are automatic post-payment credits, not selectable discounts (backend parity:359)
    if (offer.promotionType === 'cashback') return false;
    if (!isScheduleValid(offer, n, timezone)) return false;
    if (!isDateValid(offer, n)) return false;
    if (offer.minOrderValue && subtotal < offer.minOrderValue) return false;
    // Tiered offers: must meet at least the lowest tier's minSubtotal
    if (Array.isArray(offer.tiers) && offer.tiers.length > 0) {
      const lowestMin = Math.min(...offer.tiers.filter(t => t && typeof t.minSubtotal === 'number').map(t => t.minSubtotal));
      if (subtotal < lowestMin) return false;
    }
    if (!hasScopeMatchingCart(offer, cart)) return false;
    if (!matchesAudience(offer, context || {})) return false;
    return true;
  });
};

export const pickBestOffer = (applicableOffers, subtotal, cart, context = {}) => {
  if (!Array.isArray(applicableOffers) || applicableOffers.length === 0) return null;
  let best = null;
  let bestDiscount = -1;
  for (const offer of applicableOffers) {
    const { discount } = calculateDiscountForOfferObject(offer, subtotal, cart, context);
    if (discount > bestDiscount) {
      best = offer;
      bestDiscount = discount;
    } else if (discount === bestDiscount && best) {
      const offerPrio = Number(offer.priority || 0);
      const bestPrio = Number(best.priority || 0);
      if (offerPrio > bestPrio) {
        best = offer;
      } else if (offerPrio === bestPrio) {
        const a = offer.createdAt ? new Date(offer.createdAt).getTime() : Infinity;
        const b = best.createdAt ? new Date(best.createdAt).getTime() : Infinity;
        if (a < b) best = offer;
      }
    }
  }
  return best;
};

export {
  normalizePhone,
  isScheduleValid,
  isDateValid,
  matchesAudience,
  isItemExcluded,
};

export default {
  normalizePhone,
  isScheduleValid,
  isDateValid,
  matchesAudience,
  isItemExcluded,
  calculateDiscountForOffer,
  calculateOfferResult,
  filterApplicableOffers,
  pickBestOffer,
};
