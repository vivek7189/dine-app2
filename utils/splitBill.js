// Split bill — payload for the backend + per-guest receipts.
//
// Payload shape = the web's calculateSplitBillData (OrderSummary.js), which POST/PATCH /api/orders
// store as `splitBill` (with paymentMethod 'split-bill'):
//   { method: 'equal'|'by-item'|'by-amount', guestCount,
//     splits: [{ guestIndex, guestLabel, guestName, items|null, subtotal, proportion, taxAmount,
//                taxBreakdown, serviceChargeAmount, tipAmount, discountAmount, roundOffAmount,
//                totalAmount, paymentMethod, paid }] }
// Every money field of a guest is the guest's SHARE of the bill's own figure (share = 1/N for equal,
// guest item subtotal / cart subtotal for by-item, typed amount / grand total for by-amount), and
// each guest's totalAmount is exactly the share of the grand total (the last guest takes the paise
// remainder) — so the guest receipts add up to the bill. (The web's equal split adds tax twice —
// 100 + 5% over 2 gives 55.13 / 49.87 — this does not.)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MODE = { equal: 'equal', item: 'by-item', amount: 'by-amount' };

/**
 * @param {object} cfg    { mode: 'equal'|'item'|'amount', guestCount, amounts?: number[],
 *                          lineGuest?: number[] (by-item: guest index per cart line, same order as cart) }
 * @param {object} bill   { cart, subtotal, totalDiscount, serviceChargeAmount, additionalChargesTotal, taxBreakdown, totalTax,
 *                          tipAmount, roundOffAmount, grandTotal, lineTotal(line) }
 */
export function buildSplitBillPayload(cfg, bill) {
  const n = Math.max(2, Number(cfg?.guestCount) || 0);
  const method = MODE[cfg?.mode] || 'equal';
  const cart = Array.isArray(bill.cart) ? bill.cart : [];
  const lineTotal = typeof bill.lineTotal === 'function'
    ? bill.lineTotal : (l) => (Number(l.price) || 0) * (Number(l.quantity) || 1);
  const grand = r2(bill.grandTotal);
  const subtotal = r2(bill.subtotal);

  // Per-guest share (proportion of the bill)
  let shares;
  const guestItems = Array.from({ length: n }, () => []);
  if (method === 'by-item') {
    const subs = new Array(n).fill(0);
    cart.forEach((line, i) => {
      const g = Math.min(n - 1, Math.max(0, Number(cfg.lineGuest?.[i]) || 0));
      subs[g] += lineTotal(line);
      guestItems[g].push({
        name: line.name, quantity: line.quantity, price: line.price, total: r2(lineTotal(line)),
        selectedVariant: line.selectedVariant || null, selectedCustomizations: line.selectedCustomizations || [],
      });
    });
    const tot = subs.reduce((a, b) => a + b, 0) || 1;
    shares = subs.map(s => s / tot);
  } else if (method === 'by-amount') {
    const amts = Array.from({ length: n }, (_, i) => Number(cfg.amounts?.[i]) || 0);
    shares = amts.map(a => (grand > 0 ? a / grand : 1 / n));
  } else {
    shares = new Array(n).fill(1 / n);
  }

  const exclusiveTax = (Array.isArray(bill.taxBreakdown) && bill.taxBreakdown.length)
    ? bill.taxBreakdown.filter(t => !t.inclusive).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    : (Number(bill.totalTax) || 0);

  let accTotal = 0;
  const splits = shares.map((p, i) => {
    const last = i === n - 1;
    // by-amount: typed amounts; the last guest takes any remainder (e.g. the cart changed after
    // "Apply Split") so the guests always add up to the bill
    const totalAmount = method === 'by-amount'
      ? (last ? r2(grand - accTotal) : r2(cfg.amounts?.[i]))
      : (last ? r2(grand - accTotal) : r2(grand * p));
    accTotal = r2(accTotal + totalAmount);
    const sub = r2(subtotal * p);
    const disc = r2((Number(bill.totalDiscount) || 0) * p);
    const sc = r2((Number(bill.serviceChargeAmount) || 0) * p);
    const addl = r2((Number(bill.additionalChargesTotal) || 0) * p);
    const tip = r2((Number(bill.tipAmount) || 0) * p);
    const taxBreakdown = (bill.taxBreakdown || []).map(t => ({ ...t, amount: r2((Number(t.amount) || 0) * p) }));
    const taxAmount = r2((Number(bill.totalTax) || 0) * p);
    const exclTax = r2(exclusiveTax * p);
    return {
      guestIndex: i,
      guestLabel: `Guest ${i + 1}`,
      guestName: '',
      items: method === 'by-item' ? guestItems[i] : null,
      subtotal: sub,
      proportion: Math.round(p * 10000) / 10000,
      taxAmount,
      taxBreakdown,
      serviceChargeAmount: sc,
      additionalChargesTotal: addl,
      tipAmount: tip,
      discountAmount: disc,
      // makes each guest receipt add up exactly to its total after share rounding
      roundOffAmount: r2(totalAmount - (sub - disc + sc + addl + exclTax + tip)),
      totalAmount,
      paymentMethod: null,
      paid: false,
    };
  });
  return { method, guestCount: n, splits };
}

/** Invoice data for guest `i` — reuse with printerService.generateBillText / HTML. */
export function buildGuestInvoice(invoiceData, splitBill, i) {
  const s = splitBill?.splits?.[i];
  if (!s) return invoiceData;
  const p = Number(s.proportion) || 0;
  return {
    ...invoiceData,
    items: Array.isArray(s.items) ? s.items.map(x => ({ ...x })) : (invoiceData.items || []).map(x => ({ ...x })),
    subtotal: s.subtotal,
    tax: s.taxAmount,
    taxBreakdown: (s.taxBreakdown || []).map(t => ({ ...t })),
    offerDiscount: r2((Number(invoiceData.offerDiscount) || 0) * p),
    manualDiscount: r2((Number(invoiceData.manualDiscount) || 0) * p),
    loyaltyDiscount: r2((Number(invoiceData.loyaltyDiscount) || 0) * p),
    couponDiscount: r2((Number(invoiceData.couponDiscount) || 0) * p),
    serviceChargeAmount: s.serviceChargeAmount,
    additionalCharges: Array.isArray(invoiceData.additionalCharges)
      ? invoiceData.additionalCharges.map(c => ({ ...c, amount: r2((Number(c.amount) || 0) * p) }))
      : invoiceData.additionalCharges,
    additionalChargesTotal: s.additionalChargesTotal || 0,
    tipAmount: s.tipAmount,
    roundOffAmount: s.roundOffAmount,
    grandTotal: s.totalAmount,
    cashReceived: null,
    changeReturned: null,
    splitPayments: null,
    walletRedeemAmount: 0,
    paidAmount: null,
    outstandingAmount: null,
    splitInfo: {
      method: splitBill.method,
      guestLabel: s.guestLabel,
      guestName: s.guestName || '',
      guestCount: splitBill.guestCount,
    },
  };
}
