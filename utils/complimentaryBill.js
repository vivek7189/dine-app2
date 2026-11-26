// Complimentary (fully free) bill: items worth something, a manual discount, and nothing left to
// pay — e.g. a 100% discount for the landlord or the band. Only shown when the restaurant turns on
// printSettings.complimentaryTag (off by default); the bill itself is the same as any other.

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// A saved order (Orders page cards, reprint).
export function isComplimentaryOrder(order) {
  if (!order) return false;
  const subtotal = num(order.subtotal) || (order.items || []).reduce((t, i) => t + (num(i.total) || num(i.price) * (num(i.quantity) || 1)), 0);
  const manual = num(order.manualDiscount);
  if (!(subtotal > 0) || !(manual > 0)) return false;
  if (order.finalAmount === undefined || order.finalAmount === null || order.finalAmount === '') return false;
  return num(order.finalAmount) <= 0.005 && manual + num(order.discountAmount) + 0.01 >= subtotal;
}

// Short reason typed with the discount ("Landlord"), for the tag and the bill line.
export function complimentaryReason(src) {
  return String(src?.discountReason || '').trim().slice(0, 40);
}

// A bill about to print (invoice): same rule, using the printed total.
export function isComplimentaryInvoice(inv) {
  if (!inv) return false;
  const subtotal = num(inv.subtotal);
  const manual = num(inv.manualDiscount);
  const total = inv.grandTotal !== undefined && inv.grandTotal !== null && inv.grandTotal !== '' ? num(inv.grandTotal) : NaN;
  return subtotal > 0 && manual > 0 && Number.isFinite(total) && total <= 0.005;
}
