// Bill-print fields for an ALREADY-SAVED order (reprint / auto-print after settle / pre-bill), so
// those bills match the original: per-item tax flag + HSN (inclusive split, HSN line), additional
// charges (packaging etc.), wallet tender, and Paid / Balance Due on part-paid or credit bills.
// Mirrors the order-history reprint builder.

export function savedOrderPrintItems(order) {
  return (Array.isArray(order?.items) ? order.items : []).map((i) => {
    const qty = i.quantity || 1;
    const price = Number(i.price || 0);
    return {
      name: i.name || i.itemName || 'Item',
      quantity: qty,
      price,
      total: Number(i.total ?? price * qty),
      selectedVariant: i.selectedVariant || null,
      selectedCustomizations: i.selectedCustomizations || [],
      notes: i.notes || '',
      ...(i.seat != null && i.seat !== '' ? { seat: i.seat } : {}),
      ...(i.taxInclusive != null ? { taxInclusive: i.taxInclusive } : {}),
      ...(i.hsnCode ? { hsnCode: i.hsnCode } : {}),
    };
  });
}

// `withBalance` false for a pre-bill (nothing has been tendered yet).
export function savedOrderPrintExtras(order, { withBalance = true } = {}) {
  const o = order || {};
  const status = String(o.paymentStatus || '').toLowerCase();
  const owes = withBalance && (status === 'partial' || status === 'due') && Number(o.outstandingAmount) > 0;
  return {
    additionalCharges: Array.isArray(o.additionalCharges) && o.additionalCharges.length ? o.additionalCharges : null,
    additionalChargesTotal: Number(o.additionalChargesTotal || 0),
    walletRedeemAmount: withBalance ? Number(o.walletRedeemAmount || 0) : 0,
    ...(owes ? { paidAmount: Number(o.paidAmount || 0), outstandingAmount: Number(o.outstandingAmount) } : {}),
    ...(o.taxInclusiveMode ? { taxInclusiveMode: o.taxInclusiveMode } : {}),
  };
}
