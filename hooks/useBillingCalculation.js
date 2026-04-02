import { useMemo } from 'react';

/**
 * Shared billing calculation hook — matches web OrderSummary.js logic.
 *
 * Flow: Subtotal → Discount → Service Charge → Tax → Tips → Round-off → Grand Total
 */
export default function useBillingCalculation({
  subtotal = 0,
  offerDiscount = 0,
  manualDiscountAmount = 0,
  loyaltyDiscount = 0,
  compAmount = 0,
  taxSettings = {},
  billingSettings = {},
  tipAmount = 0,
}) {
  return useMemo(() => {
    // Step 1: Total discount
    const totalDiscount = offerDiscount + manualDiscountAmount + loyaltyDiscount + compAmount;

    // Step 2: Discounted subtotal
    const discountedSubtotal = Math.max(0, subtotal - totalDiscount);

    // Step 3: Service charge (applied after discount, before tax)
    const serviceChargeRate = billingSettings.serviceChargeEnabled ? (billingSettings.serviceChargeRate || 0) : 0;
    const serviceChargeAmount = serviceChargeRate > 0
      ? Math.round(discountedSubtotal * serviceChargeRate / 100 * 100) / 100
      : 0;

    // Step 4: Tax (applied to discountedSubtotal + serviceCharge)
    const taxableAmount = discountedSubtotal + serviceChargeAmount;
    let taxBreakdown = [];
    let totalTax = 0;

    if (taxSettings?.enabled) {
      if (taxSettings.taxes && taxSettings.taxes.length > 0) {
        taxBreakdown = taxSettings.taxes
          .filter(t => t.enabled)
          .map(t => ({
            name: t.name,
            rate: t.rate,
            amount: Math.round(taxableAmount * t.rate / 100 * 100) / 100,
          }));
        totalTax = taxBreakdown.reduce((sum, t) => sum + t.amount, 0);
      } else if (taxSettings.defaultTaxRate) {
        const amount = Math.round(taxableAmount * taxSettings.defaultTaxRate / 100 * 100) / 100;
        taxBreakdown = [{ name: 'GST', rate: taxSettings.defaultTaxRate, amount }];
        totalTax = amount;
      }
    }

    // Step 5: After tax + tips
    const afterTax = taxableAmount + totalTax;
    const withTips = afterTax + tipAmount;

    // Step 6: Round-off
    let roundOffAmount = 0;
    if (billingSettings.roundOffEnabled) {
      const roundTo = billingSettings.roundOffTo || 1;
      const rounded = Math.round(withTips / roundTo) * roundTo;
      roundOffAmount = Math.round((rounded - withTips) * 100) / 100;
    }

    // Step 7: Grand total
    const grandTotal = Math.round((withTips + roundOffAmount) * 100) / 100;

    return {
      totalDiscount,
      discountedSubtotal,
      serviceChargeAmount,
      serviceChargeRate,
      taxableAmount,
      taxBreakdown,
      totalTax,
      roundOffAmount,
      grandTotal,
    };
  }, [subtotal, offerDiscount, manualDiscountAmount, loyaltyDiscount, compAmount, taxSettings, billingSettings, tipAmount]);
}
