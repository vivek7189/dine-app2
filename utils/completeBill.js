import { storedOrderDiscountFields } from './orderDiscountFields';

// The PATCH that completes (settles) a running order from its details popup — shared by Tables
// and Order History so both send exactly the same bill. `sd` = the popup's settle-time choices
// (payment method, tender, split, tip, khata); `tableName` = the table it was opened from, if any.
// Same payload as the web's DashboardTablesPanel flow, so the server can update customer stats
// (totalOrders, totalSpent, loyaltyPoints).
// Already paid online by the guest (QR Razorpay / Paytm) — completing it must keep that payment,
// never record it again as cash / split / part payment.
export function isPaidOnline(order) {
  if (!order || String(order.paymentStatus || '').toLowerCase() !== 'paid') return false;
  const m = String(order.paymentMethod || '').toLowerCase();
  return m === 'razorpay' || m === 'paytm' || !!order.razorpayPaymentId || !!order.paytm;
}

export function completeBillUpdate(order, sd = {}, user = null, tableName = null) {
  sd = sd || {};
  if (isPaidOnline(order)) {
    // keep the online payment; only a tip chosen now is taken from the settle screen
    sd = sd.tipAmount != null ? { tipAmount: sd.tipAmount, ...(sd.tipPercentage != null ? { tipPercentage: sd.tipPercentage } : {}) } : {};
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
