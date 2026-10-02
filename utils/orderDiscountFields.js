// Discount fields to re-send when COMPLETING / settling an already-saved order, built from the
// stored order — same contract as a fresh save (web dashboard): discountAmount / offerDiscount =
// offer part only, totalDiscountAmount = offer + manual + loyalty + coupon, the other parts as
// their own numbers. Always sending offerDiscount + totalDiscountAmount also keeps the server's
// old-app compatibility rewrite (discountAmount read as the TOTAL when those are absent) from
// mis-reading the stored offer amount.
export function storedOrderDiscountFields(order) {
  if (!order || typeof order !== 'object') return {};
  const n = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const offer = n(order.offerDiscount ?? order.discountAmount);
  const manual = n(order.manualDiscount);
  const loyalty = n(order.loyaltyDiscount);
  const coupon = n(order.couponDiscount);
  const offerIds = Array.isArray(order.offerIds) && order.offerIds.length
    ? order.offerIds
    : (Array.isArray(order.appliedOffers) ? order.appliedOffers.map((o) => o && o.id).filter(Boolean) : []);
  return {
    offerIds,
    ...(order.selectedOfferName ? { selectedOfferName: order.selectedOfferName } : {}),
    discountAmount: offer,
    offerDiscount: offer,
    manualDiscount: manual,
    ...(order.manualDiscountType ? { manualDiscountType: order.manualDiscountType } : {}),
    ...(order.manualDiscountValue != null ? { manualDiscountValue: order.manualDiscountValue } : {}),
    loyaltyDiscount: loyalty,
    ...(Number(order.redeemLoyaltyPoints) > 0 ? { redeemLoyaltyPoints: Number(order.redeemLoyaltyPoints) } : {}),
    couponDiscount: coupon,
    totalDiscountAmount: n(offer + manual + loyalty + coupon),
  };
}
