// Seat-level ordering helpers.
// A "seat" is an integer 1..65 assigned per order item (null/absent = shared "Table").
// Seats display as letters: 1 -> A, 26 -> Z, 27 -> AA ... 65 -> BM.

export const MAX_SEAT = 65;

// Coerce any input to a valid seat number (integer 1..MAX_SEAT) or null.
// Non-integers are rejected (not truncated) to match web/backend sanitization exactly.
export function sanitizeSeat(seat) {
  if (seat === null || seat === undefined || seat === '') return null;
  const n = Number(seat);
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > MAX_SEAT) return null;
  return n;
}

// Convert seat number to letter(s): 1 -> A ... 26 -> Z, 27 -> AA.
export function seatLetter(seat) {
  const n = sanitizeSeat(seat);
  if (n === null) return '';
  let s = '';
  let v = n;
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(65 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s;
}

// Human label for a seat: seat 1 + table '7' -> '7A'; without tableNumber -> 'A'; null -> 'Table'.
export function seatLabel(seat, tableNumber) {
  const letter = seatLetter(seat);
  if (!letter) return 'Table';
  return tableNumber !== undefined && tableNumber !== null && `${tableNumber}` !== ''
    ? `${tableNumber}${letter}`
    : letter;
}

// Per-CHAIR orders (posSettings.seatOrdering === 'chair'): each chair on a table is its own order
// with an order-level `chairNumber` letter ("A", "B"). Different from per-ITEM seats above.
export function isChairModeEnabled(posSettings) {
  return posSettings?.seatOrdering === 'chair';
}

// Display-only, same as the web's withSeatLabel (printHtmlGenerator.js): when an order/KOT/bill has
// a chair, show it next to the table ("7 · Seat B"). Returns a shallow clone; no chair → unchanged.
export function withSeatLabel(obj) {
  if (!obj) return obj;
  const seat = obj.chairNumber ?? obj.customerInfo?.chairNumber ?? obj.customerInfo?.seat;
  if (seat == null || String(seat).trim() === '' || !obj.tableNumber) return obj;
  if (String(obj.tableNumber).includes('· Seat')) return obj; // already labelled — never double up
  return { ...obj, tableNumber: `${obj.tableNumber} · Seat ${String(seat).trim()}` };
}

// Feature flag check: posSettings.seatOrdering = 'off' | 'optional' | 'required'.
export function isSeatOrderingEnabled(posSettings) {
  const v = posSettings?.seatOrdering;
  return v === 'optional' || v === 'required';
}
