// Additional charges (packaging / delivery / service fee) — BYTE-EXACT copy of dine-frontend
// src/utils/additionalCharges.js, itself a mirror of the backend resolveAdditionalCharges()
// (dine-backend index.js). Keep all three identical so the app's total == what the server saves.
//
// Charge model (taxSettings.additionalCharges[]):
//   { id, name, type:'fixed'|'percent', value, appliesTo:[orderTypeIds]|[]|['all'],
//     taxable, taxRate, maxCap, minOrderValue, enabled }
//
// Returns { charges, total, foldTaxableTotal, ownTaxTotal, taxLines }.
// - total          = sum of charge amounts
// - ownTaxTotal    = tax on charges that carry their own taxRate (added on top)
// - foldTaxableTotal = taxable charges with NO own rate (POS folds these into item tax; the
//   public page keeps them at face value so FE and server totals always match exactly)

// Order-type scope matching — EXACT mirror of the backend taxAppliesToOrderType(): lowercase +
// collapse underscores/spaces to hyphens, then compare. The 'all' sentinel is a plain lowercase
// match, same as the backend. Keeping this identical guarantees a charge applies (or not) on the
// customer page exactly as it will on the server → no payment mismatch.
const canon = (x) => String(x || '').toLowerCase().replace(/[_\s]+/g, '-');

export function resolveAdditionalCharges(taxSettings, orderType, base) {
  const list = Array.isArray(taxSettings?.additionalCharges) ? taxSettings.additionalCharges : [];
  const cur = canon(orderType);
  const applied = [];
  let total = 0, foldTaxableTotal = 0, ownTaxTotal = 0;
  const taxLines = [];
  for (const c of list) {
    if (!c || c.enabled === false) continue;
    // Scope: empty OR contains 'all' = every order type; otherwise only the listed types.
    const scope = Array.isArray(c.appliesTo) ? c.appliesTo : [];
    const appliesAll = scope.length === 0 || scope.some((s) => String(s).toLowerCase() === 'all');
    if (!appliesAll && !scope.some((s) => canon(s) === cur)) continue;
    const value = Number(c.value) || 0;
    if (value <= 0) continue;
    // Only apply above an optional minimum order subtotal.
    const minOrder = Number(c.minOrderValue) || 0;
    if (minOrder > 0 && base < minOrder) continue;
    const type = c.type === 'fixed' ? 'fixed' : 'percent';
    let raw = type === 'fixed' ? value : base * value / 100;
    // Optional cap (mainly for percent charges).
    const cap = Number(c.maxCap) || 0;
    if (cap > 0 && raw > cap) raw = cap;
    const amount = Math.round(raw * 100) / 100;
    if (amount <= 0) continue;
    const taxable = c.taxable !== false; // default: taxable
    const taxRate = Math.max(0, Number(c.taxRate) || 0);
    let ownTax = 0;
    if (taxable && taxRate > 0) {
      ownTax = Math.round((amount * taxRate / 100) * 100) / 100;
      ownTaxTotal += ownTax;
      taxLines.push({ name: `${c.name || 'Charge'} Tax`, rate: taxRate, amount: ownTax, inclusive: false, isChargeTax: true });
    } else if (taxable) {
      foldTaxableTotal += amount;
    }
    applied.push({ id: String(c.id || c.name || `charge_${applied.length}`), name: String(c.name || 'Charge'), type, value, amount, taxable, taxRate: taxRate || null, tax: ownTax });
    total += amount;
  }
  return {
    charges: applied,
    total: Math.round(total * 100) / 100,
    foldTaxableTotal: Math.round(foldTaxableTotal * 100) / 100,
    ownTaxTotal: Math.round(ownTaxTotal * 100) / 100,
    taxLines,
  };
}
