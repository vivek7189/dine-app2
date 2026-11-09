import { storedOrderDiscountFields } from './orderDiscountFields';

// The PATCH that completes (settles) a running order from its details popup — shared by Tables
// and Order History so both send exactly the same bill. `sd` = the popup's settle-time choices
// (payment method, tender, split, tip, khata); `tableName` = the table it was opened from, if any.
// Same payload as the web's DashboardTablesPanel flow, so the server can update customer stats
// (totalOrders, totalSpent, loyaltyPoints).
// Paid online by the guest at the QR (Razorpay / Paytm) — the amount the gateway actually received.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export function onlinePaidAmount(order) {
  if (!order) return 0;
  const amt = r2(Number(order.razorpayAmountPaid) || Number(order.paytmAmountPaid) || 0);
  if (amt > 0) return amt;
  // older orders without the stored amount: a paid Razorpay / Paytm order covered its total
  const m = String(order.paymentMethod || '').toLowerCase();
  const paidOnline = String(order.paymentStatus || '').toLowerCase() === 'paid'
    && (m === 'razorpay' || m === 'paytm' || !!order.razorpayPaymentId || !!order.paytm);
  return paidOnline ? r2(order.finalAmount || order.totalAmount || 0) : 0;
}
const onlineMethodOf = (order) => (Number(order.paytmAmountPaid) > 0 || String(order.paymentMethod || '').toLowerCase() === 'paytm' ? 'paytm' : 'razorpay');
const billTotalOf = (order) => r2(order.finalAmount || order.totalAmount || 0);

// What is still to be collected on an order paid online (items added after the guest paid). 0 = none.
export function onlineBalance(order) {
  const paid = onlinePaidAmount(order);
  if (!(paid > 0)) return 0;
  // a balance already collected some other way (part payment) counts as paid
  const covered = Math.max(paid, r2(order.paidAmount));
  const bal = r2(billTotalOf(order) - covered);
  return bal > 0.5 ? bal : 0;
}

// Fully paid online — completing it keeps that payment, never records it again as cash / split / part.
export function isPaidOnline(order) {
  return onlinePaidAmount(order) > 0 && onlineBalance(order) === 0;
}
// Paid online but items were added since: only the balance is collected (online part + this method).
export function hasOnlineBalance(order) {
  return onlineBalance(order) > 0;
}

// The payment to record (verifyPayment) after completing: nothing for a fully-online order, only the
// collected balance for a part-online one, else the bill as settled.
export function paymentToRecord(order, updateData) {
  if (isPaidOnline(order)) return null;
  if (hasOnlineBalance(order)) {
    const rest = (updateData.splitPayments || []).filter(sp => sp.method !== onlineMethodOf(order));
    return rest.length ? { method: rest[0].method, amount: r2(rest.reduce((t, sp) => t + (Number(sp.amount) || 0), 0)) } : null;
  }
  return { method: updateData.paymentMethod, amount: updateData.finalAmount ?? billTotalOf(order) };
}

export function completeBillUpdate(order, sd = {}, user = null, tableName = null) {
  sd = sd || {};
  const tipOnly = sd.tipAmount != null ? { tipAmount: sd.tipAmount, ...(sd.tipPercentage != null ? { tipPercentage: sd.tipPercentage } : {}) } : {};
  if (isPaidOnline(order)) {
    // keep the online payment; only a tip chosen now is taken from the settle screen
    sd = tipOnly;
  } else if (hasOnlineBalance(order)) {
    // online part + the balance by the method chosen now (split / part pay on this screen don't apply)
    const paid = onlinePaidAmount(order), bal = onlineBalance(order);
    const m = sd.paymentMethod && sd.paymentMethod !== 'split' ? sd.paymentMethod : 'cash';
    sd = {
      ...tipOnly,
      paymentMethod: 'split',
      splitPayments: [{ method: onlineMethodOf(order), amount: paid }, { method: m, amount: bal }],
      paymentStatus: 'paid', paidAmount: billTotalOf(order), outstandingAmount: 0,
    };
  }
  const settleMethod = sd.paymentMethod || order.paymentMethod || 'cash';
  const settleFinal = (sd.finalAmount != null) ? sd.finalAmount : (order.finalAmount || order.totalAmount || 0);
  return {
    status: 'completed',
    paymentStatus: sd.paymentStatus || (order.paymentStatus === 'partial' ? 'partial' : 'paid'),
    paymentMethod: settleMethod,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Settle-time payment details (web parity)
    ...(sd.splitPayments ? { splitPayments: sd.splitPayments } : {}),
    ...(sd.cashReceived != null ? { cashReceived: sd.cashReceived } : {}),
    ...(sd.changeReturned != null ? { changeReturned: sd.changeReturned } : {}),
    ...(sd.tipAmount != null ? { tipAmount: sd.tipAmount, ...(sd.tipPercentage != null ? { tipPercentage: sd.tipPercentage } : {}) } : {}),
    ...(sd.partialPayAmount != null ? { partialPayAmount: sd.partialPayAmount } : {}),
    ...(sd.paidAmount != null ? { paidAmount: sd.paidAmount } : {}),
    ...(sd.outstandingAmount != null ? { outstandingAmount: sd.outstandingAmount } : {}),
    // Preserve existing amounts (tip may raise finalAmount). The server reads
    // `subtotal || totalAmount` as the PRE-discount subtotal when vetting this bill —
    // totalAmount is post-discount, so send the order's subtotal (else its items' sum).
    ...(() => {
      const sub = Number(order.subtotal) > 0 ? Number(order.subtotal)
        : (Array.isArray(order.items) && order.items.length
          ? Math.round(order.items.reduce((s, i) => s + (typeof i?.total === 'number' ? i.total : (Number(i?.price) || 0) * (Number(i?.quantity) || 1)), 0) * 100) / 100
          : 0);
      return sub > 0 ? { subtotal: sub } : {};
    })(),
    ...(order.totalAmount && { totalAmount: order.totalAmount }),
    ...((sd.finalAmount != null || order.finalAmount) && { finalAmount: settleFinal }),
    ...(order.taxAmount && { taxAmount: order.taxAmount }),
    ...(order.taxBreakdown && { taxBreakdown: order.taxBreakdown }),
    // the order's stored charges, so the server vets this tax including their tax
    ...(order.taxBreakdown && {
      additionalCharges: Array.isArray(order.additionalCharges) ? order.additionalCharges : [],
      additionalChargesTotal: Number(order.additionalChargesTotal) || 0,
    }),
    // Customer data — critical for customer stats update
    customerId: order.customerId || null,
    customerInfo: {
      name: order.customerInfo?.name || '',
      phone: order.customerInfo?.phone || order.customerInfo?.mobile || order.customerPhone || null,
      tableNumber: order.tableNumber || tableName || null,
    },
    ...(order.customerPhone && { customerPhone: order.customerPhone }),
    // Loyalty + discount/offer data (offer part, manual, loyalty, coupon, total)
    ...storedOrderDiscountFields(order),
    // Billing fields (tip handled above from settlementData)
    ...(order.serviceChargeAmount > 0 && { serviceChargeAmount: order.serviceChargeAmount, serviceChargeRate: order.serviceChargeRate }),
    ...(sd.tipAmount == null && order.tipAmount > 0 && { tipAmount: order.tipAmount }),
    ...(order.roundOffAmount && { roundOffAmount: order.roundOffAmount }),
    // Staff tracking
    lastUpdatedBy: {
      name: user?.name || 'Staff',
      id: user?.id,
      role: user?.role || 'waiter',
    },
  };
}
