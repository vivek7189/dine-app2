import { useMemo } from 'react';

// Order-type tax gating (mirrors dine-frontend OrderSummary + dine-backend). A tax
// with NO `orderTypes` (absent/empty) applies to ALL order types — today's
// behavior. When set, applies only to the listed types. Normalizes dine_in.
export function taxAppliesToOrderType(tax, orderType) {
  const list = tax && tax.orderTypes;
  if (!Array.isArray(list) || list.length === 0) return true;
  const canon = (x) => String(x || '').toLowerCase().replace(/[_\s]+/g, '-');
  const cur = canon(orderType);
  return list.some((x) => canon(x) === cur);
}

/**
 * Resolve which taxes apply to a given item.
 * Priority: item.taxGroupId > category.taxGroupId > restaurant default taxes
 * When a tax group has alsoApplyGlobalTax: true, both group taxes AND global taxes apply.
 * By default (alsoApplyGlobalTax: false/undefined), group taxes override global taxes.
 */
export function resolveTaxesForItem(item, taxSettings, categories) {
  if (!taxSettings?.enabled) return [];
  const groups = taxSettings.taxGroups || [];
  const globalTaxes = (taxSettings.taxes && taxSettings.taxes.length > 0)
    ? taxSettings.taxes.filter(t => t.enabled)
    : (taxSettings.defaultTaxRate
      ? [{ name: 'Tax', rate: taxSettings.defaultTaxRate, type: 'percentage' }]
      : []);

  const resolveGroup = (group) => {
    const groupTaxes = group.taxes || [];
    if (group.alsoApplyGlobalTax && globalTaxes.length > 0) {
      const merged = [...groupTaxes];
      for (const gt of globalTaxes) {
        if (!merged.some(t => t.name === gt.name && t.rate === gt.rate)) merged.push(gt);
      }
      return merged;
    }
    return groupTaxes;
  };

  // Priority 1: Item-level tax group
  if (item.taxGroupId) {
    const g = groups.find(gr => gr.id === item.taxGroupId);
    if (g) return resolveGroup(g);
  }
  // Priority 2: Category-level tax group
  const catId = item.category || item.categoryId;
  if (catId && categories && categories.length > 0) {
    const cat = categories.find(c => c.id === catId || c.name === catId);
    if (cat?.taxGroupId) {
      const g = groups.find(gr => gr.id === cat.taxGroupId);
      if (g) return resolveGroup(g);
    }
  }
  // Priority 3: Restaurant default taxes (global)
  return globalTaxes;
}

/**
 * Determine if an item's price includes tax (inclusive pricing).
 * Priority: item-level override > global taxInclusivePricing > false
 */
export function isItemTaxInclusive(item, taxSettings) {
  if (item.taxInclusive === true) return true;
  if (item.taxInclusive === false) return false;
  return taxSettings?.taxInclusivePricing === true;
}

/**
 * Compute tax breakdown for a cart — shared by the billing hook AND MenuNative's inline
 * calc so both agree (per-item tax groups, inclusive/exclusive, discountApplicable, SC
 * distribution). Returns { taxBreakdown, totalTax, exclusiveTaxTotal }.
 *
 * `totalDiscount` and `serviceChargeAmount` are already-computed amounts; `discountedSubtotal`
 * is subtotal - totalDiscount (used for SC distribution).
 */
export function computeTaxBreakdown({
  cart = [],
  taxSettings = {},
  categories = [],
  totalDiscount = 0,
  discountedSubtotal = 0,
  serviceChargeAmount = 0,
  defaultTaxName = 'Tax',
  orderType = '',
}) {
  let taxBreakdown = [];
  let totalTax = 0;
  let exclusiveTaxTotal = 0;
  if (!taxSettings?.enabled) return { taxBreakdown, totalTax, exclusiveTaxTotal };

  const hasTaxGroups = taxSettings?.taxGroups && taxSettings.taxGroups.length > 0;
  if (hasTaxGroups && cart.length > 0) {
    const discountableSubtotal = cart.reduce((sum, cartItem) => {
      if (cartItem.discountApplicable === false) return sum;
      return sum + (cartItem.price || 0) * (cartItem.quantity || 1);
    }, 0);
    const taxTotals = {};
    for (const cartItem of cart) {
      const itemTotal = (cartItem.price || 0) * (cartItem.quantity || 1);
      const isDiscountable = cartItem.discountApplicable !== false;
      const isInclusive = isItemTaxInclusive(cartItem, taxSettings);
      const itemDiscShare = (isDiscountable && discountableSubtotal > 0)
        ? (itemTotal / discountableSubtotal) * totalDiscount
        : 0;
      const itemTaxable = Math.max(0, itemTotal - itemDiscShare);
      const itemSCShare = discountedSubtotal > 0 ? (Math.max(0, itemTotal - itemDiscShare) / discountedSubtotal) * serviceChargeAmount : 0;
      const itemTaxableWithSC = itemTaxable + itemSCShare;
      const itemTaxes = resolveTaxesForItem(cartItem, taxSettings, categories)
        .filter(tax => taxAppliesToOrderType(tax, orderType));
      const totalRate = itemTaxes.reduce((sum, t) => sum + (t.rate || 0), 0);
      for (const tax of itemTaxes) {
        const amt = isInclusive
          ? Math.round((itemTaxableWithSC * (tax.rate || 0) / (100 + totalRate)) * 100) / 100
          : Math.round((itemTaxableWithSC * (tax.rate || 0) / 100) * 100) / 100;
        const key = `${tax.name || 'Tax'}|${tax.rate || 0}|${isInclusive}`;
        if (!taxTotals[key]) taxTotals[key] = { name: tax.name || 'Tax', rate: tax.rate || 0, amount: 0, inclusive: isInclusive };
        taxTotals[key].amount += amt;
        totalTax += amt;
        if (!isInclusive) exclusiveTaxTotal += amt;
      }
    }
    taxBreakdown = Object.values(taxTotals).map(t => ({ ...t, amount: Math.round(t.amount * 100) / 100 }));
    totalTax = Math.round(totalTax * 100) / 100;
    exclusiveTaxTotal = Math.round(exclusiveTaxTotal * 100) / 100;
  } else {
    const taxableAmount = discountedSubtotal + serviceChargeAmount;
    const isGlobalInclusive = taxSettings.taxInclusivePricing === true;
    if (taxSettings.taxes && taxSettings.taxes.length > 0) {
      const enabledTaxes = taxSettings.taxes.filter(t => t.enabled && taxAppliesToOrderType(t, orderType));
      const totalRate = enabledTaxes.reduce((sum, t) => sum + (t.rate || 0), 0);
      taxBreakdown = enabledTaxes.map(t => ({
        name: t.name,
        rate: t.rate,
        amount: isGlobalInclusive
          ? Math.round(taxableAmount * t.rate / (100 + totalRate) * 100) / 100
          : Math.round(taxableAmount * t.rate / 100 * 100) / 100,
        inclusive: isGlobalInclusive,
      }));
      totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
      exclusiveTaxTotal = isGlobalInclusive ? 0 : totalTax;
    } else if (taxSettings.defaultTaxRate) {
      const amount = isGlobalInclusive
        ? Math.round(taxableAmount * taxSettings.defaultTaxRate / (100 + taxSettings.defaultTaxRate) * 100) / 100
        : Math.round(taxableAmount * taxSettings.defaultTaxRate / 100 * 100) / 100;
      taxBreakdown = [{ name: defaultTaxName, rate: taxSettings.defaultTaxRate, amount, inclusive: isGlobalInclusive }];
      totalTax = amount;
      exclusiveTaxTotal = isGlobalInclusive ? 0 : amount;
    }
  }
  return { taxBreakdown, totalTax, exclusiveTaxTotal };
}

/**
 * Shared billing calculation hook — matches web OrderSummary.js logic.
 *
 * Flow: Subtotal → Discount → Service Charge → Tax → Tips → Round-off → Grand Total
 *
 * When taxGroups exist, tax is calculated per-item (each item may have different tax rates).
 * Otherwise falls back to flat tax on the entire taxable amount.
 *
 * Supports taxInclusivePricing: when enabled, tax is back-calculated from the price
 * (price already includes tax) and NOT added to the grand total.
 */
export default function useBillingCalculation({
  subtotal = 0,
  offerDiscount = 0,
  manualDiscountAmount = 0,
  loyaltyDiscount = 0,
  couponDiscount = 0,
  compAmount = 0,
  voidAmount = 0,
  taxSettings = {},
  billingSettings = {},
  tipAmount = 0,
  cart = [],        // Cart items (needed for per-item tax)
  categories = [],  // Restaurant categories with taxGroupId (needed for per-item tax)
  defaultTaxName = 'Tax',  // Fallback tax name when no named taxes defined (from currencySettings.taxLabel)
  orderType = '',          // Current order type — for order-type tax gating (dine-in/takeaway/delivery)
}) {
  return useMemo(() => {
    // Step 1: Total discount.
    // NOTE (web parity): comp/void items are AUDIT METADATA ONLY on web — web never subtracts
    // them from the subtotal/grand total, and the backend's finalAmount ignores them too. So we
    // must NOT reduce the payable amount for comp/void here, otherwise the app would display a
    // total lower than what the backend actually charges. compAmount/voidAmount are accepted for
    // API compatibility but intentionally excluded from the payable total.
    const totalDiscount = offerDiscount + manualDiscountAmount + loyaltyDiscount + couponDiscount;

    // Step 2: Discounted subtotal
    const discountedSubtotal = Math.max(0, subtotal - totalDiscount);

    // Step 3: Service charge (applied after discount, before tax)
    const serviceChargeRate = billingSettings.serviceChargeEnabled ? (billingSettings.serviceChargeRate || 0) : 0;
    const serviceChargeAmount = serviceChargeRate > 0
      ? Math.round(discountedSubtotal * serviceChargeRate / 100 * 100) / 100
      : 0;

    // Step 4: Tax (shared with MenuNative via computeTaxBreakdown)
    const { taxBreakdown, totalTax, exclusiveTaxTotal } = computeTaxBreakdown({
      cart, taxSettings, categories, totalDiscount, discountedSubtotal, serviceChargeAmount, defaultTaxName, orderType,
    });

    // Step 5: After tax + tips — only add exclusive tax (inclusive is already in subtotal)
    const taxableAmount = discountedSubtotal + serviceChargeAmount;
    const afterTax = taxableAmount + Math.round(exclusiveTaxTotal * 100) / 100;
    const withTips = afterTax + tipAmount;

    // Step 6: Round-off
    let roundOffAmount = 0;
    if (billingSettings.roundOffEnabled) {
      const roundTo = billingSettings.roundOffTo || 1;
      const rounded = Math.round(withTips / roundTo) * roundTo;
      roundOffAmount = Math.round((rounded - withTips) * 100) / 100;
    }

    // Step 7: Grand total
    const grandTotal = Math.round((withTips + roundOffAmount) * 100) / 100;

    return {
      totalDiscount,
      discountedSubtotal,
      serviceChargeAmount,
      serviceChargeRate,
      taxableAmount,
      taxBreakdown,
      totalTax,
      roundOffAmount,
      grandTotal,
    };
  }, [subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, couponDiscount, compAmount, voidAmount, taxSettings, billingSettings, tipAmount, cart, categories, orderType]);
}
