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

// ---------- schedule & date validation ----------

const isScheduleValid = (offer, now = new Date()) => {
  if (!offer || !offer.schedule || offer.schedule.type !== 'recurring') return true;
  const currentDay = now.getDay();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const scheduleDays = offer.schedule.days || [];
  const startTime = offer.schedule.startTime || '00:00';
  const endTime = offer.schedule.endTime || '23:59';
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
    const id = getItemId(item);
    const cat = getItemCategory(item);
    const qty = item.quantity || 0;
    const matchById = buyItemIds.length > 0 && buyItemIds.includes(id);
    const matchByCat = buyCategoryIds.length > 0 && buyCategoryIds.includes(cat);
    if (matchById || matchByCat) buyUnits += qty;
  }

  const applications = Math.min(Math.floor(buyUnits / buyQty), maxApps);
  if (applications <= 0) return { discount: 0, freeItems: [] };

  const pool = [];
  for (const item of cart) {
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
  if (!offer || subtotal <= 0) return { discount: 0, freeItems: [], appliedTier: null };

  const offerScope = offer.scope || 'order';
  let applicableSubtotal = subtotal;

  if (offerScope === 'category' && Array.isArray(offer.targetCategories) && offer.targetCategories.length > 0) {
    const lowered = offer.targetCategories.map(c => String(c).toLowerCase());
    applicableSubtotal = cart
      .filter(item => lowered.includes(getItemCategory(item).toLowerCase()))
      .reduce((sum, item) => sum + getItemLineTotal(item), 0);
  } else if (offerScope === 'item' && Array.isArray(offer.targetItems) && offer.targetItems.length > 0) {
    applicableSubtotal = cart
      .filter(item => offer.targetItems.includes(getItemId(item)))
      .reduce((sum, item) => sum + getItemLineTotal(item), 0);
  }

  const appliedTier = resolveTier(offer, subtotal);
  const effectiveDiscountType = appliedTier ? appliedTier.discountType : offer.discountType;
  const effectiveDiscountValue = appliedTier ? Number(appliedTier.discountValue) : (offer.discountValue || 0);

  let baseDiscount = 0;

  if (offer.promotionType === 'bogo' && offer.bogoConfig) {
    const bogoItems = offerScope === 'item' && offer.targetItems?.length > 0
      ? cart.filter(item => offer.targetItems.includes(getItemId(item)))
      : cart;
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
    } else {
      baseDiscount = Math.round(Math.min(effectiveDiscountValue, applicableSubtotal) * 100) / 100;
    }
  }

  const cross = calculateCrossItemBogo(offer, cart);
  const totalDiscount = Math.round((baseDiscount + cross.discount) * 100) / 100;

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
    const lowered = offer.targetCategories.map(c => String(c).toLowerCase());
    return cart.some(item => lowered.includes(getItemCategory(item).toLowerCase()));
  }
  if (scope === 'item' && Array.isArray(offer.targetItems) && offer.targetItems.length > 0) {
    return cart.some(item => offer.targetItems.includes(getItemId(item)));
  }
  return true;
};

export const filterApplicableOffers = (offers, { subtotal, cart, context, now }) => {
  if (!Array.isArray(offers)) return [];
  const n = now || new Date();
  return offers.filter(offer => {
    if (!offer) return false;
    if (offer.isActive === false) return false;
    if (!isScheduleValid(offer, n)) return false;
    if (!isDateValid(offer, n)) return false;
    if (offer.minOrderValue && subtotal < offer.minOrderValue) return false;
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
};

export default {
  normalizePhone,
  isScheduleValid,
  isDateValid,
  matchesAudience,
  calculateDiscountForOffer,
  calculateOfferResult,
  filterApplicableOffers,
  pickBestOffer,
};
