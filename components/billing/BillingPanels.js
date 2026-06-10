import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';
import { getCurrencySymbol } from '../../utils/formatCurrency';

/**
 * Expandable billing panels for each feature.
 * Renders the currently active panel based on activeBillingPanel.
 */
export default function BillingPanels({
  activeBillingPanel,
  billingSettings = {},
  grandTotal = 0,
  discountedSubtotal = 0,
  cart = [],
  // Cash tendering
  cashReceived,
  setCashReceived,
  changeAmount,
  setChangeAmount,
  // Split payments
  splitPayments,
  setSplitPayments,
  // Tips
  tipAmount,
  setTipAmount,
  tipPercentage,
  setTipPercentage,
  // Partial payment
  partialPayAmount,
  setPartialPayAmount,
  customerData,
  // Comp / Void
  selectedCompItems,
  setSelectedCompItems,
  selectedVoidItems,
  setSelectedVoidItems,
  compReason,
  setCompReason,
  voidReason,
  setVoidReason,
  billingManagerPin,
  setBillingManagerPin,
  // Service charge (info-only)
  serviceChargeAmount = 0,
  // Round-off (info-only)
  roundOffAmount = 0,
}) {
  const { fs } = useResponsive();

  if (!activeBillingPanel) return null;

  // Cash Tendering Panel
  if (activeBillingPanel === 'cash') {
    const denominations = billingSettings.denominations || [100, 200, 500, 2000];
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Cash Tendering</Text>
        <TextInput
          style={styles.input}
          placeholder="Cash Received"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={cashReceived}
          onChangeText={(v) => {
            setCashReceived(v);
            const received = parseFloat(v) || 0;
            setChangeAmount(Math.max(0, Math.round((received - grandTotal) * 100) / 100));
          }}
        />
        <View style={styles.denomRow}>
          {denominations.map((d) => (
            <TouchableOpacity
              key={d}
              style={styles.denomBtn}
              onPress={() => {
                setCashReceived(String(d));
                setChangeAmount(Math.max(0, Math.round((d - grandTotal) * 100) / 100));
              }}
            >
              <Text style={styles.denomText}>{d >= 1000 ? `${d / 1000}K` : `${getCurrencySymbol()}${d}`}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.denomBtn, { backgroundColor: '#059669' }]}
            onPress={() => {
              setCashReceived(String(Math.ceil(grandTotal)));
              setChangeAmount(0);
            }}
          >
            <Text style={[styles.denomText, { color: '#fff' }]}>Exact</Text>
          </TouchableOpacity>
        </View>
        {parseFloat(cashReceived) > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Change to Return:</Text>
            <Text style={[styles.infoValue, { color: changeAmount > 0 ? '#059669' : '#ef4444' }]}>
              {getCurrencySymbol()}{changeAmount.toFixed(2)}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Split Payment Panel
  if (activeBillingPanel === 'split') {
    const splitTotal = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const remaining = Math.max(0, grandTotal - splitTotal);
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Split Payment</Text>
        {splitPayments.map((sp, idx) => (
          <View key={idx} style={styles.splitRow}>
            <View style={styles.splitMethods}>
              {['cash', 'upi', 'card'].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.splitMethodBtn, sp.method === m && styles.splitMethodActive]}
                  onPress={() => {
                    const updated = [...splitPayments];
                    updated[idx] = { ...sp, method: m };
                    setSplitPayments(updated);
                  }}
                >
                  <Text style={[styles.splitMethodText, sp.method === m && { color: '#fff' }]}>
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.splitInput}
              placeholder={`${getCurrencySymbol()} Amount`}
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={sp.amount ? String(sp.amount) : ''}
              onChangeText={(v) => {
                const updated = [...splitPayments];
                updated[idx] = { ...sp, amount: parseFloat(v) || 0 };
                setSplitPayments(updated);
              }}
            />
            <TouchableOpacity onPress={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))}>
              <Ionicons name="close-circle" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setSplitPayments([...splitPayments, { method: 'cash', amount: 0 }])}
        >
          <Ionicons name="add" size={16} color="#2563eb" />
          <Text style={{ color: '#2563eb', fontWeight: '600', fontSize: fs(13) }}>Add Payment</Text>
        </TouchableOpacity>
        {splitPayments.length > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Remaining:</Text>
            <Text style={[styles.infoValue, { color: remaining > 0.01 ? '#ef4444' : '#059669' }]}>
              {getCurrencySymbol()}{remaining.toFixed(2)}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Tip Panel
  if (activeBillingPanel === 'tip') {
    const presets = billingSettings.tipPresets || [5, 10, 15, 20];
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Add Tip</Text>
        <View style={styles.denomRow}>
          {presets.map((pct) => (
            <TouchableOpacity
              key={pct}
              style={[styles.denomBtn, tipPercentage === pct && { backgroundColor: '#ec4899' }]}
              onPress={() => {
                setTipPercentage(pct);
                setTipAmount(Math.round(discountedSubtotal * pct / 100 * 100) / 100);
              }}
            >
              <Text style={[styles.denomText, tipPercentage === pct && { color: '#fff' }]}>{pct}%</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="Custom tip amount"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={tipAmount ? String(tipAmount) : ''}
          onChangeText={(v) => {
            setTipPercentage(null);
            setTipAmount(parseFloat(v) || 0);
          }}
        />
        {tipAmount > 0 && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tip:</Text>
            <Text style={[styles.infoValue, { color: '#ec4899' }]}>{getCurrencySymbol()}{tipAmount.toFixed(2)}</Text>
          </View>
        )}
      </View>
    );
  }

  // Partial Payment (Khata) Panel
  if (activeBillingPanel === 'partial') {
    const outstanding = Math.max(0, grandTotal - (parseFloat(partialPayAmount) || 0));
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Partial Payment (Khata)</Text>
        {customerData?.outstandingBalance > 0 && (
          <View style={[styles.infoRow, { marginBottom: 8, backgroundColor: '#fef2f2', padding: 8, borderRadius: 6 }]}>
            <Text style={{ fontSize: fs(12), color: '#dc2626' }}>Existing Balance:</Text>
            <Text style={{ fontSize: fs(13), fontWeight: '700', color: '#dc2626' }}>{getCurrencySymbol()}{customerData.outstandingBalance}</Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          placeholder="Amount paying now"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={partialPayAmount}
          onChangeText={setPartialPayAmount}
        />
        {partialPayAmount ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Outstanding after:</Text>
            <Text style={[styles.infoValue, { color: '#f59e0b' }]}>{getCurrencySymbol()}{outstanding.toFixed(2)}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // Comp Panel
  if (activeBillingPanel === 'comp') {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Comp Items</Text>
        {cart.map((item) => {
          const isSelected = selectedCompItems.some(c => c.id === item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.compRow, isSelected && { backgroundColor: '#ecfdf5' }]}
              onPress={() => {
                if (isSelected) {
                  setSelectedCompItems(selectedCompItems.filter(c => c.id !== item.id));
                } else {
                  setSelectedCompItems([...selectedCompItems, item]);
                }
              }}
            >
              <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={isSelected ? '#14b8a6' : '#9ca3af'} />
              <Text style={{ flex: 1, fontSize: fs(13), color: Colors.textDark }}>{item.quantity}x {item.name}</Text>
              <Text style={{ fontSize: fs(13), fontWeight: '600', color: Colors.textDark }}>{getCurrencySymbol()}{(item.price * item.quantity).toFixed(0)}</Text>
            </TouchableOpacity>
          );
        })}
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="Reason for comp"
          placeholderTextColor="#9ca3af"
          value={compReason}
          onChangeText={setCompReason}
        />
        {billingSettings.compVoidRequiresPin && (
          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            placeholder="Manager PIN"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            keyboardType="number-pad"
            value={billingManagerPin}
            onChangeText={setBillingManagerPin}
            maxLength={6}
          />
        )}
      </View>
    );
  }

  // Void Panel
  if (activeBillingPanel === 'void') {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Void Items</Text>
        {cart.map((item) => {
          const isSelected = selectedVoidItems.some(v => v.id === item.id);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.compRow, isSelected && { backgroundColor: '#fef2f2' }]}
              onPress={() => {
                if (isSelected) {
                  setSelectedVoidItems(selectedVoidItems.filter(v => v.id !== item.id));
                } else {
                  setSelectedVoidItems([...selectedVoidItems, item]);
                }
              }}
            >
              <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={20} color={isSelected ? '#ef4444' : '#9ca3af'} />
              <Text style={{ flex: 1, fontSize: fs(13), color: Colors.textDark }}>{item.quantity}x {item.name}</Text>
              <Text style={{ fontSize: fs(13), fontWeight: '600', color: Colors.textDark }}>{getCurrencySymbol()}{(item.price * item.quantity).toFixed(0)}</Text>
            </TouchableOpacity>
          );
        })}
        <TextInput
          style={[styles.input, { marginTop: 8 }]}
          placeholder="Reason for void"
          placeholderTextColor="#9ca3af"
          value={voidReason}
          onChangeText={setVoidReason}
        />
        {billingSettings.compVoidRequiresPin && (
          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            placeholder="Manager PIN"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            keyboardType="number-pad"
            value={billingManagerPin}
            onChangeText={setBillingManagerPin}
            maxLength={6}
          />
        )}
      </View>
    );
  }

  // Round-off Info (read-only)
  if (activeBillingPanel === 'roundoff') {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>Round-off</Text>
        <Text style={{ fontSize: fs(13), color: '#6b7280', marginBottom: 8 }}>
          Bills will be automatically rounded to the nearest {getCurrencySymbol()}{billingSettings.roundOffTo || 1}.
        </Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Round-off amount:</Text>
          <Text style={[styles.infoValue, { color: roundOffAmount >= 0 ? '#059669' : '#ef4444' }]}>
            {roundOffAmount >= 0 ? '+' : ''}{getCurrencySymbol()}{roundOffAmount.toFixed(2)}
          </Text>
        </View>
      </View>
    );
  }

  // Service Charge Info (read-only)
  if (activeBillingPanel === 'service') {
    return (
      <View style={styles.panel}>
        <Text style={styles.title}>{billingSettings.serviceChargeLabel || 'Service Charge'}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rate:</Text>
          <Text style={styles.infoValue}>{billingSettings.serviceChargeRate || 0}%</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Amount:</Text>
          <Text style={[styles.infoValue, { color: '#059669' }]}>{getCurrencySymbol()}{serviceChargeAmount.toFixed(2)}</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a202c',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1a202c',
  },
  denomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  denomBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: '#e5e7eb',
  },
  denomText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#059669',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  splitMethods: {
    flexDirection: 'row',
    gap: 4,
  },
  splitMethodBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  splitMethodActive: {
    backgroundColor: '#2563eb',
  },
  splitMethodText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  splitInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1a202c',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
});
