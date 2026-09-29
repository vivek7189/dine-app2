// Fingerprint of an order's items — must stay identical to orderItemsSignature() in the backend
// (dine-backend index.js). Computed on the items AS LOADED from the server and sent as
// `baseItemsSignature` with item updates; the backend answers 409 ORDER_CHANGED if another device
// changed the order in between, instead of silently overwriting (and cancelling) its items.
export function orderItemsSignature(items) {
  const totals = {};
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it) continue;
    const key = `${it.menuItemId || it.id || it.name || ''}|${(it.selectedVariant && it.selectedVariant.name) || ''}`;
    totals[key] = (totals[key] || 0) + (Number(it.quantity) || 0);
  }
  return Object.keys(totals).sort().map(k => `${k}#${Math.round(totals[k] * 1000) / 1000}`).join(';');
}

export const isOrderChangedError = (e) => e && (e.status === 409 || e.code === 'ORDER_CHANGED');
