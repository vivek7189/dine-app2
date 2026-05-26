import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Compact billing summary bar with flex-wrap chips for line items
 * and a prominent grand total. Optimized for mobile & tablet.
 */
export default function BillingSummaryBar({
  subtotal = 0,
  totalDiscount = 0,
  discountedSubtotal = 0,
  serviceChargeAmount = 0,
  serviceChargeLabel = 'Service',
  serviceChargeRate = 0,
  taxBreakdown = [],
  totalTax = 0,
  tipAmount = 0,
  tipPercentage = null,
  roundOffAmount = 0,
  grandTotal = 0,
  currencySymbol = '₹',
  offerDiscount = 0,
  offerName = null,
  appliedOffers = [],
  manualDiscount = 0,
  loyaltyDiscount = 0,
}) {
  const { fs } = useResponsive();
  const fmt = (v) => `${currencySymbol}${Math.abs(v).toFixed(2)}`;

  // Build a dynamic list of chips
  const chips = [];
  chips.push({ key: 'sub', label: 'Subtotal', value: fmt(subtotal) });

  if (offerDiscount > 0 || manualDiscount > 0 || loyaltyDiscount > 0) {
    if (offerDiscount > 0) {
      if (appliedOffers.length > 1) {
        // Multiple offers — show individual chips
        appliedOffers.forEach((ao, i) => {
          chips.push({
            key: `offer-${i}`,
            label: ao.name || 'Offer',
            value: `−${fmt(ao.discountApplied || 0)}`,
            tone: 'discount',
          });
        });
      } else {
        // Single offer or fallback
        chips.push({
          key: 'offer',
          label: offerName ? `${offerName}` : 'Offer',
          value: `−${fmt(offerDiscount)}`,
          tone: 'discount',
        });
      }
    }
    if (manualDiscount > 0) {
      chips.push({ key: 'manual', label: 'Discount', value: `−${fmt(manualDiscount)}`, tone: 'discount' });
    }
    if (loyaltyDiscount > 0) {
      chips.push({ key: 'loyalty', label: 'Loyalty', value: `−${fmt(loyaltyDiscount)}`, tone: 'loyalty' });
    }
  } else if (totalDiscount > 0) {
    chips.push({ key: 'disc', label: 'Discount', value: `−${fmt(totalDiscount)}`, tone: 'discount' });
  }

  if (serviceChargeAmount > 0) {
    chips.push({
      key: 'sc',
      label: `${serviceChargeLabel}${serviceChargeRate ? ` ${serviceChargeRate}%` : ''}`,
      value: fmt(serviceChargeAmount),
    });
  }

  taxBreakdown.forEach((tax, i) => {
    const inclLabel = tax.inclusive ? ' incl.' : '';
    chips.push({
      key: `tax-${i}`,
      label: `${tax.name}${tax.rate ? ` ${tax.rate}%` : ''}${inclLabel}`,
      value: fmt(tax.amount),
    });
  });

  if (tipAmount > 0) {
    chips.push({
      key: 'tip',
      label: `Tip${tipPercentage ? ` ${tipPercentage}%` : ''}`,
      value: fmt(tipAmount),
      tone: 'tip',
    });
  }

  if (roundOffAmount !== 0) {
    chips.push({
      key: 'round',
      label: 'Round-off',
      value: `${roundOffAmount > 0 ? '+' : '−'}${fmt(roundOffAmount)}`,
    });
  }

  const toneStyle = (tone) => {
    if (tone === 'discount') return { color: '#bbf7d0' };
    if (tone === 'loyalty') return { color: '#e9d5ff' };
    if (tone === 'tip') return { color: '#fef08a' };
    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={[styles.heading, { fontSize: fs(10) }]}>TOTAL</Text>
        <Text style={[styles.grandTotalValue, { fontSize: fs(24) }]}>{fmt(grandTotal)}</Text>
      </View>

      <View style={styles.chipsWrap}>
        {chips.map((c) => (
          <View key={c.key} style={styles.chip}>
            <Text style={[styles.chipLabel, { fontSize: fs(10) }]} numberOfLines={1}>{c.label}</Text>
            <Text style={[styles.chipValue, toneStyle(c.tone), { fontSize: fs(11) }]}>{c.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 0,
    marginTop: 8,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heading: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  chipValue: {
    color: '#fff',
    fontWeight: '800',
  },
});
