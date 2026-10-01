// Tax-inclusive bill summary — mirrors dine-frontend src/utils/inclusiveTax.js (keep in sync).

// Bill summary for tax-INCLUSIVE prices (display only — never changes a total).
// Inclusive tax is already inside the item prices, so it is NOT part of the
// Subtotal → Total arithmetic. Bills show it separately under the total, the way
// retail/restaurant POS receipts do:
//   Prices are inclusive of GST
//   Taxable value   ₹238.10
//   CGST (2.5%)       ₹5.95
//   SGST (2.5%)       ₹5.95
// Returns null when the bill has no inclusive tax.
//   heading       'Prices are inclusive of GST' (or 'GST included in prices' when some taxes are added on top)
//   lines         inclusive tax lines [{ name, rate, amount }] (amounts rounded to 2dp)
//   taxableValue  price excluding the inclusive tax — only when it can be shown exactly
//                 (no tax added on top, and one combined rate explains the tax); otherwise null
//   showLines     false when the restaurant hides the inclusive tax breakdown (heading only)
export function inclusiveTaxSummary(invoice, { showLines = true } = {}) {
  if (!invoice) return null;
  const tb = Array.isArray(invoice.taxBreakdown) ? invoice.taxBreakdown.filter(Boolean) : [];
  const incl = tb.filter(t => t.inclusive === true && Number(t.amount) > 0)
    .map(t => ({ name: t.name || 'Tax', rate: Number(t.rate) || 0, amount: round2(t.amount) }));
  const mode = invoice.taxInclusiveMode;
  if (incl.length === 0 && mode !== 'inclusive' && mode !== 'mixed') return null;
  if (incl.length === 0 && !tb.length) return null; // no tax applied to this bill (e.g. tax not set for this order type)
  const mixed = tb.some(t => t.inclusive !== true && Number(t.amount) > 0);
  const label = taxLabelOf(incl.length ? incl : tb);
  const heading = mixed ? `${label} included in prices` : `Prices are inclusive of ${label}`;

  let taxableValue = null;
  if (!mixed && incl.length) {
    const inclTax = round2(incl.reduce((s, t) => s + t.amount, 0));
    // The amount the inclusive tax was taken out of: items after discounts, plus service charge.
    const discounts = (Number(invoice.discountAmount) || 0) + (Number(invoice.manualDiscount) || 0)
      + (Number(invoice.loyaltyDiscount) || 0) + (Number(invoice.couponDiscount) || 0);
    const gross = (Number(invoice.subtotal) || 0) - discounts + (Number(invoice.serviceChargeAmount) || 0);
    const value = round2(gross - inclTax);
    // Only print it when one combined rate explains the tax (a single GST slab). Mixed slabs
    // or tax-free items in the bill would make "taxable value" misleading — then omit it.
    const rate = combinedRate(incl);
    if (value > 0 && rate > 0 && Math.abs(round2(value * rate / 100) - inclTax) <= 0.02 + 0.01 * incl.length) taxableValue = value;
  }
  return { heading, label, lines: incl, taxableValue, showLines: showLines !== false && incl.length > 0, mixed };
}

// "GST" for GST/CGST/SGST/IGST/UTGST lines, else the single tax name (e.g. "VAT"), else "taxes".
function taxLabelOf(lines) {
  const names = [...new Set(lines.map(t => String(t.name || '').trim()).filter(Boolean))];
  if (names.length && names.every(n => /^(c|s|i|ut)?gst$/i.test(n))) return 'GST';
  if (names.length === 1) return names[0];
  return 'taxes';
}

// Total rate of one slab: CGST 2.5 + SGST 2.5 = 5. Several different slabs → 0 (unknown).
function combinedRate(lines) {
  const byName = {};
  for (const t of lines) {
    const k = String(t.name || '').toUpperCase();
    if (byName[k] != null && byName[k] !== t.rate) return 0; // same tax at two rates = two slabs
    byName[k] = t.rate;
  }
  return Object.values(byName).reduce((s, r) => s + r, 0);
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
