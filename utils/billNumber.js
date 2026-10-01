// Bill number as PRINTED on a bill — same rule as dine-frontend src/utils/orderNumber.js billNumberLabel.
//   • Saved offline, not synced yet (no number from the server): "OFFLINE-CBCF" (last 4 of the
//     offline key) — was blank / "-" on app bills.
//   • Made offline and synced since: "513 (offline CBCF)", so the customer's offline paper can be matched.
//   • Otherwise the normal number.
// Returns '' when nothing is known (callers keep their old fallback).
const last4 = (v) => String(v || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();

export function billNumberLabel(order, { offlineKey } = {}) {
  const o = order || {};
  const daily = o.orderNumberDisplay != null ? o.orderNumberDisplay
    : (o.dailyOrderId != null && /^\d+$/.test(String(o.dailyOrderId).trim()) ? o.dailyOrderId : null);
  if (daily == null) {
    const key = offlineKey || (/-/.test(String(o.id || o.orderId || '')) ? (o.id || o.orderId) : null);
    return key ? `OFFLINE-${last4(key)}` : '';
  }
  const ref = o.offlineRef || (String(o.syncSource || '').toLowerCase() === 'offline' && o.idempotencyKey ? last4(o.idempotencyKey) : '');
  return ref ? `${daily} (offline ${ref})` : String(daily);
}
