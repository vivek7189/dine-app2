import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsive } from '../../hooks/useResponsive';

/**
 * Multi-tier pricing rule selector.
 * Shows horizontal pill buttons for each pricing rule (AC/Non-AC/Takeaway, etc.).
 */
export default function PricingRuleSelector({
  pricingRules = [],
  activePricingRuleId,
  setActivePricingRuleId,
  autoSelectedRule = false,
  multiPricingEnabled = false,
}) {
  const { fs } = useResponsive();

  if (!multiPricingEnabled || pricingRules.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="pricetags-outline" size={fs(14)} color="#6b7280" />
        <Text style={[styles.headerText, { fontSize: fs(11) }]}>Pricing Zone</Text>
        {autoSelectedRule && (
          <View style={styles.autoBadge}>
            <Ionicons name="lock-closed" size={fs(10)} color="#059669" />
            <Text style={[styles.autoText, { fontSize: fs(9) }]}>Auto</Text>
          </View>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {pricingRules.map((rule) => {
          const ruleId = rule.id || rule._id;
          const isActive = activePricingRuleId === ruleId;
          return (
            <TouchableOpacity
              key={ruleId}
              style={[
                styles.pill,
                isActive && (autoSelectedRule ? styles.pillAutoActive : styles.pillActive),
              ]}
              onPress={() => {
                if (autoSelectedRule) return; // Locked
                setActivePricingRuleId(isActive ? null : ruleId);
              }}
              disabled={autoSelectedRule}
            >
              <Text style={[
                styles.pillText,
                { fontSize: fs(12) },
                isActive && styles.pillTextActive,
              ]}>
                {rule.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  autoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  autoText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  pillActive: {
    backgroundColor: '#374151',
    borderColor: '#374151',
  },
  pillAutoActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  pillTextActive: {
    color: '#fff',
  },
});
