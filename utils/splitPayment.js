// Split payment check — web parity (OrderSummary validSplitPayments): a split is only recorded when
// at least 2 payments, each above 0, add up to the bill. Gentler than web where it is safe:
//   • no amounts typed            → not a split (the selected payment method is used)
//   • one payment = the whole bill → recorded as that single method
//   • anything else               → 'invalid': the caller blocks billing with a clear message
// (web silently ignores an unbalanced split; recording it as 'split' broke cash/card/UPI totals).
export function resolveSplitPayments(splitPayments, total) {
  const lines = (Array.isArray(splitPayments) ? splitPayments : [])
    .map((sp) => ({ ...sp, amount: Math.round((Number(sp?.amount) || 0) * 100) / 100 }))
    .filter((sp) => sp.amount > 0);
  const sum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const due = Math.round((Number(total) || 0) * 100) / 100;
  const balanced = Math.abs(sum - due) < 0.01;
  if (lines.length === 0) return { mode: 'none', sum, total: due };
  if (lines.length === 1 && balanced) return { mode: 'single', method: lines[0].method, sum, total: due };
  if (lines.length >= 2 && balanced) return { mode: 'split', lines, sum, total: due };
  return { mode: 'invalid', sum, total: due };
}
