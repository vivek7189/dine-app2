import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Red gradient total bar with full billing breakdown.
 * Matches web OrderSummary's total display section.
 */
export default function BillingSummaryBar({
  subtotal = 0,
  totalDiscount = 0,
  discountedSubtotal = 0,
  serviceChargeAmount = 0,
  serviceChargeLabel = 'Service Charge',
  serviceChargeRate = 0,
  taxBreakdown = [],
  totalTax = 0,
  tipAmount = 0,
  tipPercentage = null,
  roundOffAmount = 0,
  grandTotal = 0,
  currencySymbol = '₹',
  // Separate discount breakdown (optional — if provided, shows individual rows)
  offerDiscount = 0,
  offerName = null,
  manualDiscount = 0,
  loyaltyDiscount = 0,
}) {
  const { fs } = useResponsive();
  const fmt = (v) => `${currencySymbol}${Math.abs(v).toFixed(2)}`;

  return (
    <View style={styles.container}>
      {/* Breakdown on left, grand total on right */}
      <View style={styles.row}>
        <View style={styles.breakdownCol}>
          <Text style={[styles.heading, { fontSize: fs(13) }]}>Total</Text>

          {/* Subtotal */}
          <View style={styles.lineRow}>
            <Text style={[styles.lineLabel, { fontSize: fs(11) }]}>Subtotal</Text>
            <Text style={[styles.lineValue, { fontSize: fs(11) }]}>{fmt(subtotal)}</Text>
          </View>

          {/* Discount — separate rows if breakdown provided, else combined */}
          {(offerDiscount > 0 || manualDiscount > 0 || loyaltyDiscount > 0) ? (
            <>
              {offerDiscount > 0 && (
                <View style={styles.lineRow}>
                  <Text style={[styles.lineLabel, styles.discountColor, { fontSize: fs(11) }]}>
                    {offerName ? `Offer: ${offerName}` : 'Offer Discount'}
                  </Text>
                  <Text style={[styles.lineValue, styles.discountColor, { fontSize: fs(11) }]}>-{fmt(offerDiscount)}</Text>
                </View>
              )}
              {manualDiscount > 0 && (
                <View style={styles.lineRow}>
                  <Text style={[styles.lineLabel, styles.discountColor, { fontSize: fs(11) }]}>Manual Discount</Text>
                  <Text style={[styles.lineValue, styles.discountColor, { fontSize: fs(11) }]}>-{fmt(manualDiscount)}</Text>
                </View>
              )}
              {loyaltyDiscount > 0 && (
                <View style={styles.lineRow}>
                  <Text style={[styles.lineLabel, styles.loyaltyColor, { fontSize: fs(11) }]}>Loyalty Points</Text>
                  <Text style={[styles.lineValue, styles.loyaltyColor, { fontSize: fs(11) }]}>-{fmt(loyaltyDiscount)}</Text>
                </View>
              )}
            </>
          ) : totalDiscount > 0 ? (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, styles.discountColor, { fontSize: fs(11) }]}>Discount</Text>
              <Text style={[styles.lineValue, styles.discountColor, { fontSize: fs(11) }]}>-{fmt(totalDiscount)}</Text>
            </View>
          ) : null}

          {/* Service Charge */}
          {serviceChargeAmount > 0 && (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, { fontSize: fs(11) }]}>{serviceChargeLabel} ({serviceChargeRate}%)</Text>
              <Text style={[styles.lineValue, { fontSize: fs(11) }]}>{fmt(serviceChargeAmount)}</Text>
            </View>
          )}

          {/* Tax breakdown */}
          {taxBreakdown.map((tax, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={[styles.lineLabel, { fontSize: fs(11) }]}>{tax.name} ({tax.rate}%)</Text>
              <Text style={[styles.lineValue, { fontSize: fs(11) }]}>{fmt(tax.amount)}</Text>
            </View>
          ))}

          {/* Tip */}
          {tipAmount > 0 && (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, styles.tipColor, { fontSize: fs(11) }]}>
                Tip{tipPercentage ? ` (${tipPercentage}%)` : ''}
              </Text>
              <Text style={[styles.lineValue, styles.tipColor, { fontSize: fs(11) }]}>{fmt(tipAmount)}</Text>
            </View>
          )}

          {/* Round-off */}
          {roundOffAmount !== 0 && (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, { fontSize: fs(11) }]}>Round-off</Text>
              <Text style={[styles.lineValue, { fontSize: fs(11) }]}>
                {roundOffAmount > 0 ? '+' : '-'}{fmt(roundOffAmount)}
              </Text>
            </View>
          )}
        </View>

        {/* Grand Total */}
        <View style={styles.grandTotalCol}>
          <Text style={[styles.grandTotalValue, { fontSize: fs(22) }]}>{fmt(grandTotal)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
    // Gradient approximation with solid color (RN doesn't have CSS gradients natively)
    backgroundColor: '#ef4444',
  },
  row: {
    flexDirection: 'row',
    padding: 12,
  },
  breakdownCol: {
    flex: 1,
    marginRight: 12,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 1.5,
  },
  lineLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  lineValue: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  discountColor: {
    color: '#bbf7d0',
  },
  loyaltyColor: {
    color: '#e9d5ff',
  },
  tipColor: {
    color: '#fef08a',
  },
  grandTotalCol: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 80,
  },
  grandTotalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
});
