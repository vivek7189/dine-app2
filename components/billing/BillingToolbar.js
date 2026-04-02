import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Horizontal scroll of billing feature pill buttons.
 * Shows only features enabled in billingSettings.
 */
export default function BillingToolbar({
  billingSettings = {},
  activeBillingPanel,
  setActiveBillingPanel,
  // Active state indicators
  serviceChargeAmount = 0,
  tipAmount = 0,
  splitPayments = [],
  cashReceived = '',
  partialPayAmount = '',
  selectedCompItems = [],
  selectedVoidItems = [],
}) {
  const buttons = [];

  if (billingSettings.serviceChargeEnabled) {
    buttons.push({ key: 'service', icon: 'add-circle-outline', label: 'SC', color: '#059669' });
  }
  if (billingSettings.roundOffEnabled) {
    buttons.push({ key: 'roundoff', icon: 'refresh-outline', label: 'Round', color: '#7c3aed' });
  }
  if (billingSettings.cashTenderingEnabled) {
    buttons.push({ key: 'cash', icon: 'cash-outline', label: 'Cash', color: '#d97706' });
  }
  if (billingSettings.splitPaymentEnabled) {
    buttons.push({ key: 'split', icon: 'git-branch-outline', label: 'Split', color: '#2563eb' });
  }
  if (billingSettings.tipsEnabled) {
    buttons.push({ key: 'tip', icon: 'heart-outline', label: 'Tip', color: '#ec4899' });
  }
  if (billingSettings.partialPaymentEnabled) {
    buttons.push({ key: 'partial', icon: 'wallet-outline', label: 'Khata', color: '#f59e0b' });
  }
  if (billingSettings.compVoidEnabled) {
    buttons.push({ key: 'comp', icon: 'gift-outline', label: 'Comp', color: '#14b8a6' });
    buttons.push({ key: 'void', icon: 'close-circle-outline', label: 'Void', color: '#ef4444' });
  }

  if (buttons.length === 0) return null;

  const isActive = (key) => {
    if (activeBillingPanel === key) return true;
    if (key === 'service' && serviceChargeAmount > 0) return true;
    if (key === 'tip' && tipAmount > 0) return true;
    if (key === 'split' && splitPayments.length > 0) return true;
    if (key === 'cash' && cashReceived) return true;
    if (key === 'partial' && partialPayAmount) return true;
    if (key === 'comp' && selectedCompItems.length > 0) return true;
    if (key === 'void' && selectedVoidItems.length > 0) return true;
    return false;
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbar}>
      {buttons.map((btn) => {
        const active = isActive(btn.key);
        return (
          <TouchableOpacity
            key={btn.key}
            style={[styles.btn, active && { backgroundColor: btn.color }]}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setActiveBillingPanel(activeBillingPanel === btn.key ? null : btn.key);
            }}
          >
            <Ionicons name={btn.icon} size={16} color={active ? '#fff' : btn.color} />
            <Text style={[styles.label, active && { color: '#fff' }]}>{btn.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
});
