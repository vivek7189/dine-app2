/**
 * Consistent currency formatting across the app.
 * Uses Indian number format (₹1,23,456) with no decimal places.
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `\u20B9${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
