import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_multi_pricing';

const TAKEAWAY_NAMES = ['takeaway', 'take away', 'take-away'];
const DELIVERY_NAMES = ['delivery'];
const DINEIN_NAMES = ['dine-in', 'dine in', 'dinein'];

const DEFAULT_RULES = [
  { id: 'rule_ac_dining', name: 'AC Dining', type: 'fixed', defaultMarkupType: 'none', defaultMarkupValue: 0, tableMappings: [], isActive: true, order: 0 },
  { id: 'rule_non_ac', name: 'Non-AC Dining', type: 'fixed', defaultMarkupType: 'none', defaultMarkupValue: 0, tableMappings: [], isActive: true, order: 1 },
  { id: 'rule_takeaway', name: 'Takeaway', type: 'fixed', defaultMarkupType: 'none', defaultMarkupValue: 0, tableMappings: [], isActive: false, order: 2 },
  { id: 'rule_delivery', name: 'Delivery', type: 'fixed', defaultMarkupType: 'none', defaultMarkupValue: 0, tableMappings: [], isActive: false, order: 3 },
];

export default function MultiTierPricingSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState([]);
  const [floors, setFloors] = useState([]);

  useEffect(() => {
    loadSettings();
  }, [restaurantId]);

  const loadSettings = async () => {
    if (!restaurantId) return;
    try {
      const cached = await AsyncStorage.getItem(`${STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        const data = JSON.parse(cached);
        setEnabled(data.enabled || false);
        setRules(data.rules || []);
        setLoading(false);
      }
      fetchSettings();
      fetchFloors();
    } catch {
      fetchSettings();
      fetchFloors();
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.getPricingSettings(restaurantId);
      const mp = response.settings?.multiPricing || {};
      setEnabled(mp.enabled || false);
      setRules(mp.rules || []);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify({
        enabled: mp.enabled || false,
        rules: mp.rules || [],
      }));
    } catch (error) {
      console.error('Error fetching multi-pricing settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFloors = async () => {
    try {
      const response = await apiClient.getFloors(restaurantId);
      setFloors(response.floors || response || []);
    } catch (error) {
      console.log('Could not load floors:', error);
    }
  };

  const saveSettings = async (newEnabled, newRules) => {
    setSaving(true);
    try {
      await apiClient.updatePricingSettings(restaurantId, {
        multiPricing: { enabled: newEnabled, rules: newRules },
      });
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify({
        enabled: newEnabled,
        rules: newRules,
      }));
      if (onSettingsChange) onSettingsChange({ enabled: newEnabled, rules: newRules });
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
      fetchSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (val) => {
    setEnabled(val);
    const newRules = val && rules.length === 0 ? DEFAULT_RULES : rules;
    if (val && rules.length === 0) setRules(newRules);
    saveSettings(val, newRules);
  };

  // Categorize rules
  const dineInZoneRules = rules.filter(r => {
    const name = (r.name || '').toLowerCase().trim();
    return !TAKEAWAY_NAMES.includes(name) && !DELIVERY_NAMES.includes(name) && !DINEIN_NAMES.includes(name);
  });
  const takeawayRule = rules.find(r => TAKEAWAY_NAMES.includes((r.name || '').toLowerCase().trim()));
  const deliveryRule = rules.find(r => DELIVERY_NAMES.includes((r.name || '').toLowerCase().trim()));

  const updateRule = (ruleId, updates) => {
    const newRules = rules.map(r => r.id === ruleId ? { ...r, ...updates } : r);
    setRules(newRules);
    saveSettings(enabled, newRules);
  };

  const addZoneRule = () => {
    const newRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      type: 'fixed',
      defaultMarkupType: 'none',
      defaultMarkupValue: 0,
      tableMappings: [],
      isActive: true,
      order: rules.length,
    };
    const newRules = [...rules, newRule];
    setRules(newRules);
    // Don't auto-save until name is entered
  };

  const deleteZoneRule = (ruleId) => {
    Alert.alert('Delete Zone', 'Remove this zone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const newRules = rules.filter(r => r.id !== ruleId);
          setRules(newRules);
          saveSettings(enabled, newRules);
        },
      },
    ]);
  };

  const ensureChannelRule = (type) => {
    const names = type === 'takeaway' ? TAKEAWAY_NAMES : DELIVERY_NAMES;
    const existing = rules.find(r => names.includes((r.name || '').toLowerCase().trim()));
    if (existing) {
      updateRule(existing.id, { isActive: !existing.isActive });
    } else {
      const newRule = {
        id: `rule_${type}`,
        name: type === 'takeaway' ? 'Takeaway' : 'Delivery',
        type: 'fixed',
        defaultMarkupType: 'none',
        defaultMarkupValue: 0,
        tableMappings: [],
        isActive: true,
        order: rules.length,
      };
      const newRules = [...rules, newRule];
      setRules(newRules);
      saveSettings(enabled, newRules);
    }
  };

  // Get floors already assigned to other rules
  const getAvailableFloors = (currentRuleId) => {
    const usedFloors = new Set();
    rules.forEach(r => {
      if (r.id !== currentRuleId) {
        (r.tableMappings || []).forEach(f => usedFloors.add(f.toLowerCase()));
      }
    });
    return floors.filter(f => !usedFloors.has((f.name || '').toLowerCase()));
  };

  const addFloorToRule = (ruleId, floorName) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const mappings = [...(rule.tableMappings || []), floorName];
    updateRule(ruleId, { tableMappings: mappings });
  };

  const removeFloorFromRule = (ruleId, floorName) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const mappings = (rule.tableMappings || []).filter(f => f !== floorName);
    updateRule(ruleId, { tableMappings: mappings });
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="pricetags" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Multi-Tier Pricing</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="pricetags" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Multi-Tier Pricing</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Enable Toggle */}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>Enable Multi-Tier Pricing</Text>
          <Text style={styles.toggleHint}>Different prices for zones, takeaway & delivery</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
          thumbColor={enabled ? Colors.primary : '#f4f4f5'}
        />
      </View>

      {enabled && (
        <ScrollView style={{ maxHeight: 500 }} nestedScrollEnabled>
          {/* Dine-In Zones Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="restaurant-outline" size={16} color="#7c3aed" />
              <Text style={styles.sectionTitle}>Dine-In Zones</Text>
            </View>

            {dineInZoneRules.map(rule => (
              <View key={rule.id} style={styles.zoneRow}>
                {/* Active checkbox */}
                <TouchableOpacity
                  onPress={() => updateRule(rule.id, { isActive: !rule.isActive })}
                  style={styles.checkbox}
                >
                  <Ionicons
                    name={rule.isActive ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={rule.isActive ? '#7c3aed' : '#d1d5db'}
                  />
                </TouchableOpacity>

                {/* Zone name */}
                <TextInput
                  style={[styles.zoneNameInput, !rule.isActive && { opacity: 0.5 }]}
                  value={rule.name}
                  onChangeText={(text) => {
                    const newRules = rules.map(r => r.id === rule.id ? { ...r, name: text } : r);
                    setRules(newRules);
                  }}
                  onBlur={() => saveSettings(enabled, rules)}
                  placeholder="Zone name"
                  placeholderTextColor={Colors.textLight}
                />

                {/* Floor mapping */}
                <View style={styles.floorSection}>
                  {(rule.tableMappings || []).map(floor => (
                    <TouchableOpacity
                      key={floor}
                      style={styles.floorChip}
                      onPress={() => removeFloorFromRule(rule.id, floor)}
                    >
                      <Text style={styles.floorChipText}>{floor}</Text>
                      <Ionicons name="close-circle" size={14} color="#7c3aed" />
                    </TouchableOpacity>
                  ))}
                  {getAvailableFloors(rule.id).length > 0 && (
                    <TouchableOpacity
                      style={styles.addFloorChip}
                      onPress={() => {
                        const available = getAvailableFloors(rule.id);
                        if (available.length === 1) {
                          addFloorToRule(rule.id, available[0].name);
                        } else {
                          Alert.alert(
                            'Select Floor',
                            'Choose a floor to map',
                            [
                              ...available.map(f => ({
                                text: f.name,
                                onPress: () => addFloorToRule(rule.id, f.name),
                              })),
                              { text: 'Cancel', style: 'cancel' },
                            ]
                          );
                        }
                      }}
                    >
                      <Ionicons name="add" size={14} color="#7c3aed" />
                      <Text style={styles.addFloorText}>Floor</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Delete button */}
                <TouchableOpacity onPress={() => deleteZoneRule(rule.id)} style={styles.deleteBtn}>
                  <Ionicons name="trash-outline" size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addZoneButton} onPress={addZoneRule}>
              <Ionicons name="add-circle-outline" size={16} color="#7c3aed" />
              <Text style={styles.addZoneText}>Add Zone</Text>
            </TouchableOpacity>
          </View>

          {/* Takeaway Section */}
          <View style={styles.section}>
            <View style={styles.channelRow}>
              <View style={styles.channelLeft}>
                <Ionicons name="bag-handle-outline" size={16} color="#f59e0b" />
                <Text style={styles.sectionTitle}>Takeaway</Text>
              </View>
              <Switch
                value={takeawayRule?.isActive || false}
                onValueChange={() => ensureChannelRule('takeaway')}
                trackColor={{ false: '#e5e7eb', true: '#f59e0b50' }}
                thumbColor={takeawayRule?.isActive ? '#f59e0b' : '#f4f4f5'}
              />
            </View>
            {takeawayRule?.isActive && (
              <View style={styles.markupRow}>
                <Text style={styles.markupLabel}>Default Markup</Text>
                <View style={styles.markupInputs}>
                  <TouchableOpacity
                    style={[styles.markupTypeChip, takeawayRule.defaultMarkupType === 'percentage' && styles.markupTypeActive]}
                    onPress={() => updateRule(takeawayRule.id, { defaultMarkupType: 'percentage' })}
                  >
                    <Text style={[styles.markupTypeText, takeawayRule.defaultMarkupType === 'percentage' && styles.markupTypeTextActive]}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.markupTypeChip, takeawayRule.defaultMarkupType === 'flat' && styles.markupTypeActive]}
                    onPress={() => updateRule(takeawayRule.id, { defaultMarkupType: 'flat' })}
                  >
                    <Text style={[styles.markupTypeText, takeawayRule.defaultMarkupType === 'flat' && styles.markupTypeTextActive]}>₹</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.markupValueInput}
                    value={String(takeawayRule.defaultMarkupValue || '')}
                    onChangeText={(text) => {
                      const val = parseFloat(text) || 0;
                      const newRules = rules.map(r => r.id === takeawayRule.id ? { ...r, defaultMarkupValue: val } : r);
                      setRules(newRules);
                    }}
                    onBlur={() => saveSettings(enabled, rules)}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Delivery Section */}
          <View style={styles.section}>
            <View style={styles.channelRow}>
              <View style={styles.channelLeft}>
                <Ionicons name="bicycle-outline" size={16} color="#10b981" />
                <Text style={styles.sectionTitle}>Delivery</Text>
              </View>
              <Switch
                value={deliveryRule?.isActive || false}
                onValueChange={() => ensureChannelRule('delivery')}
                trackColor={{ false: '#e5e7eb', true: '#10b98150' }}
                thumbColor={deliveryRule?.isActive ? '#10b981' : '#f4f4f5'}
              />
            </View>
            {deliveryRule?.isActive && (
              <View style={styles.markupRow}>
                <Text style={styles.markupLabel}>Default Markup</Text>
                <View style={styles.markupInputs}>
                  <TouchableOpacity
                    style={[styles.markupTypeChip, deliveryRule.defaultMarkupType === 'percentage' && styles.markupTypeActive]}
                    onPress={() => updateRule(deliveryRule.id, { defaultMarkupType: 'percentage' })}
                  >
                    <Text style={[styles.markupTypeText, deliveryRule.defaultMarkupType === 'percentage' && styles.markupTypeTextActive]}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.markupTypeChip, deliveryRule.defaultMarkupType === 'flat' && styles.markupTypeActive]}
                    onPress={() => updateRule(deliveryRule.id, { defaultMarkupType: 'flat' })}
                  >
                    <Text style={[styles.markupTypeText, deliveryRule.defaultMarkupType === 'flat' && styles.markupTypeTextActive]}>₹</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.markupValueInput}
                    value={String(deliveryRule.defaultMarkupValue || '')}
                    onChangeText={(text) => {
                      const val = parseFloat(text) || 0;
                      const newRules = rules.map(r => r.id === deliveryRule.id ? { ...r, defaultMarkupValue: val } : r);
                      setRules(newRules);
                    }}
                    onBlur={() => saveSettings(enabled, rules)}
                    placeholder="0"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  toggleHint: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  section: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textDark,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  checkbox: {
    padding: 2,
  },
  zoneNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textDark,
    paddingVertical: 4,
    paddingHorizontal: 6,
    minWidth: 80,
  },
  floorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    flex: 1,
  },
  floorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ede9fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  floorChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
  },
  addFloorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7c3aed40',
    borderStyle: 'dashed',
  },
  addFloorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7c3aed',
  },
  deleteBtn: {
    padding: 4,
  },
  addZoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7c3aed30',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addZoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7c3aed',
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  markupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  markupLabel: {
    fontSize: 12,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  markupInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markupTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  markupTypeActive: {
    backgroundColor: Colors.primary,
  },
  markupTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  markupTypeTextActive: {
    color: '#fff',
  },
  markupValueInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 14,
    color: Colors.textDark,
    width: 60,
    textAlign: 'center',
  },
});
