// Display a stock quantity without float noise: 0.44999999999999996 → "0.45", 2.5000 → "2.5".
// Up to 3 decimals (grams of a kg, ml of a L); non-numbers are shown as they are.
export function fmtQty(value) {
  if (value === null || value === undefined || value === '') return value ?? '';
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const r = Math.round(n * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
}
