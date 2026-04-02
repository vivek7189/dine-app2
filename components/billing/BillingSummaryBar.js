import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

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
}) {
  const fmt = (v) => `${currencySymbol}${Math.abs(v).toFixed(2)}`;

  return (
    <View style={styles.container}>
      {/* Breakdown on left, grand total on right */}
      <View style={styles.row}>
        <View style={styles.breakdownCol}>
          <Text style={styles.heading}>Total</Text>

          {/* Subtotal */}
          <View style={styles.lineRow}>
            <Text style={styles.lineLabel}>Subtotal</Text>
            <Text style={styles.lineValue}>{fmt(subtotal)}</Text>
          </View>

          {/* Discount */}
          {totalDiscount > 0 && (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, styles.discountColor]}>Discount</Text>
              <Text style={[styles.lineValue, styles.discountColor]}>-{fmt(totalDiscount)}</Text>
            </View>
          )}

          {/* Service Charge */}
          {serviceChargeAmount > 0 && (
            <View style={styles.lineRow}>
              <Text style={styles.lineLabel}>{serviceChargeLabel} ({serviceChargeRate}%)</Text>
              <Text style={styles.lineValue}>{fmt(serviceChargeAmount)}</Text>
            </View>
          )}

          {/* Tax breakdown */}
          {taxBreakdown.map((tax, i) => (
            <View key={i} style={styles.lineRow}>
              <Text style={styles.lineLabel}>{tax.name} ({tax.rate}%)</Text>
              <Text style={styles.lineValue}>{fmt(tax.amount)}</Text>
            </View>
          ))}

          {/* Tip */}
          {tipAmount > 0 && (
            <View style={styles.lineRow}>
              <Text style={[styles.lineLabel, styles.tipColor]}>
                Tip{tipPercentage ? ` (${tipPercentage}%)` : ''}
              </Text>
              <Text style={[styles.lineValue, styles.tipColor]}>{fmt(tipAmount)}</Text>
            </View>
          )}

          {/* Round-off */}
          {roundOffAmount !== 0 && (
            <View style={styles.lineRow}>
              <Text style={styles.lineLabel}>Round-off</Text>
              <Text style={styles.lineValue}>
                {roundOffAmount > 0 ? '+' : '-'}{fmt(roundOffAmount)}
              </Text>
            </View>
          )}
        </View>

        {/* Grand Total */}
        <View style={styles.grandTotalCol}>
          <Text style={styles.grandTotalValue}>{fmt(grandTotal)}</Text>
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
