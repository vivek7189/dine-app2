// Which order line is "the same" as another — same rule as the web (dine-frontend
// src/utils/orderItemKey.js): menu item + size (variant) + add-ons (+ seat). Used to tell the
// kitchen exactly what changed when items are added to a running order: "Pizza Large" added to an
// order that has "Pizza Small" is a NEW line, not a quantity change of the old one.
import { sanitizeSeat } from './seatOrdering';

export function getOrderItemKey(item) {
  const id = item.menuItemId || item.id || '';
  const variant = item.selectedVariant?.name || '';
  const custs = Array.isArray(item.selectedCustomizations) && item.selectedCustomizations.length > 0
    ? [...item.selectedCustomizations].map((c) => c.id || c.name || '').sort().join(',')
    : '';
  const seat = sanitizeSeat(item.seat);
  const base = `${id}|${variant}|${custs}`;
  return seat === null ? base : `${base}|s${seat}`;
}

// Without the seat — kitchen changes are counted on this, so moving an item between seats is
// not "removed + new" for the kitchen (web does the same).
export function getOrderItemBaseKey(item) {
  return getOrderItemKey({ ...item, seat: null });
}

// The snapshot of a running order's items kept when it is opened for adding items — everything
// the key needs (size, add-ons, seat), not just the menu item id.
export function snapshotOrderItems(items) {
  return (Array.isArray(items) ? items : []).map((i) => ({
    menuItemId: i.menuItemId || i.id,
    name: i.name,
    quantity: i.quantity,
    selectedVariant: i.selectedVariant || null,
    selectedCustomizations: Array.isArray(i.selectedCustomizations) ? i.selectedCustomizations : [],
    ...(i.seat != null && i.seat !== '' ? { seat: i.seat } : {}),
    ...(i.notes ? { notes: i.notes } : {}),
    ...(i.category ? { category: i.category } : {}),
    ...(i.categoryId ? { categoryId: i.categoryId } : {}),
  }));
}

// What changed between the saved order (`existing`) and the cart, counted per base key:
//   lines[i]  the delta marker for cart[i]: {} (already sent), { isNew: true }, or
//             { isUpdated, previousQuantity, quantityDelta } (more / fewer of a line already sent)
//   removed   saved lines whose item+size+add-ons is no longer in the cart at all
// The cart may hold several lines of the same item+size (e.g. added twice from the options
// popup), so the saved quantity is matched across them in order. For a plain item (one line)
// this is exactly the old id-based result.
export function computeKotDelta(existing, cart) {
  const oldQty = new Map();
  const oldLines = new Map();
  (existing || []).forEach((e) => {
    const k = getOrderItemBaseKey(e);
    oldQty.set(k, (oldQty.get(k) || 0) + (Number(e.quantity) || 0));
    if (!oldLines.has(k)) oldLines.set(k, []);
    oldLines.get(k).push(e);
  });
  const remaining = new Map(oldQty);
  const lastIdx = new Map();
  const lines = (cart || []).map((item, i) => {
    const k = getOrderItemBaseKey(item);
    lastIdx.set(k, i);
    if (!oldQty.has(k)) return { isNew: true };
    const qty = Number(item.quantity) || 0;
    const left = remaining.get(k) || 0;
    const covered = Math.min(qty, left);
    remaining.set(k, left - covered);
    if (covered === qty) return {};
    if (covered === 0) return { isNew: true };
    return { isUpdated: true, previousQuantity: covered, quantityDelta: qty - covered };
  });
  const removed = [];
  remaining.forEach((left, k) => {
    if (left <= 0) return;
    if (!lastIdx.has(k)) { removed.push(...oldLines.get(k)); return; } // gone from the cart
    // Fewer than before: shown on the last line of that item, like the old id-based delta did.
    const i = lastIdx.get(k);
    const qty = Number(cart[i].quantity) || 0;
    const d = lines[i];
    const prev = (d.isUpdated ? d.previousQuantity : (d.isNew ? 0 : qty)) + left;
    lines[i] = { isUpdated: true, previousQuantity: prev, quantityDelta: qty - prev };
  });
  return { lines, removed };
}
