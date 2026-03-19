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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_zone_pricing';

export default function ZonePricingSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [zones, setZones] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);

  // Form
  const [zoneName, setZoneName] = useState('');
  const [sectionMatch, setSectionMatch] = useState('');
  const [markupType, setMarkupType] = useState('percentage');
  const [markupValue, setMarkupValue] = useState('');

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
        setZones(data.zones || []);
        setLoading(false);
      }
      fetchSettings();
    } catch {
      fetchSettings();
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.getPricingSettings(restaurantId);
      const zp = response.settings?.zonePricing || {};
      setEnabled(zp.enabled || false);
      setZones(zp.zones || []);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify({
        enabled: zp.enabled || false,
        zones: zp.zones || [],
      }));
    } catch (error) {
      console.error('Error fetching pricing settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newEnabled, newZones) => {
    setSaving(true);
    try {
      await apiClient.updatePricingSettings(restaurantId, {
        zonePricing: { enabled: newEnabled, zones: newZones },
      });
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify({
        enabled: newEnabled,
        zones: newZones,
      }));
      if (onSettingsChange) onSettingsChange({ enabled: newEnabled, zones: newZones });
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
      fetchSettings(); // Revert
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (val) => {
    setEnabled(val);
    saveSettings(val, zones);
  };

  const resetForm = () => {
    setZoneName('');
    setSectionMatch('');
    setMarkupType('percentage');
    setMarkupValue('');
    setEditingZone(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (zone) => {
    setZoneName(zone.name || '');
    setSectionMatch(zone.sectionMatch || '');
    setMarkupType(zone.markupType || 'percentage');
    setMarkupValue(String(zone.markupValue || ''));
    setEditingZone(zone);
    setShowAddModal(true);
  };

  const handleSaveZone = () => {
    if (!zoneName.trim()) {
      Alert.alert('Error', 'Zone name is required');
      return;
    }
    const val = parseFloat(markupValue);
    if (isNaN(val) || val < 0) {
      Alert.alert('Error', 'Please enter a valid markup value');
      return;
    }

    let newZones;
    if (editingZone) {
      newZones = zones.map((z) =>
        z.id === editingZone.id
          ? { ...z, name: zoneName.trim(), sectionMatch: sectionMatch.trim(), markupType, markupValue: val, isActive: true }
          : z
      );
    } else {
      newZones = [...zones, {
        id: `zone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: zoneName.trim(),
        sectionMatch: sectionMatch.trim(),
        markupType,
        markupValue: val,
        isActive: true,
      }];
    }

    setZones(newZones);
    saveSettings(enabled, newZones);
    setShowAddModal(false);
    resetForm();
  };

  const handleDeleteZone = (zone) => {
    Alert.alert('Delete Zone', `Remove "${zone.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const newZones = zones.filter((z) => z.id !== zone.id);
          setZones(newZones);
          saveSettings(enabled, newZones);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="layers" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Zone Pricing</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="layers" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Zone Pricing</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* Enable Toggle */}
      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>Enable Zone Pricing</Text>
          <Text style={styles.toggleHint}>Apply different price surcharges by zone/floor</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
          thumbColor={enabled ? Colors.primary : '#f4f4f5'}
        />
      </View>

      {/* Zones List */}
      {enabled && (
        <View style={styles.zonesSection}>
          {zones.map((zone) => (
            <View key={zone.id} style={styles.zoneItem}>
              <View style={styles.zoneInfo}>
                <Text style={styles.zoneName}>{zone.name}</Text>
                <Text style={styles.zoneDetail}>
                  {zone.markupType === 'percentage' ? `+${zone.markupValue}%` : `+₹${zone.markupValue}`}
                  {zone.sectionMatch ? ` · Match: "${zone.sectionMatch}"` : ''}
                </Text>
              </View>
              <View style={styles.zoneActions}>
                <TouchableOpacity onPress={() => openEditModal(zone)} style={styles.actionBtn}>
                  <Ionicons name="create-outline" size={18} color="#3b82f6" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteZone(zone)} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.addZoneButton} onPress={openAddModal}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.addZoneText}>Add Zone</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add/Edit Zone Modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingZone ? 'Edit Zone' : 'Add Zone'}</Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Zone Name *</Text>
              <TextInput style={styles.input} value={zoneName} onChangeText={setZoneName} placeholder="e.g. Rooftop, AC Section" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Section Match</Text>
              <TextInput style={styles.input} value={sectionMatch} onChangeText={setSectionMatch} placeholder="Table prefix to match (e.g. RT)" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Markup Type</Text>
              <View style={styles.typeOptions}>
                <TouchableOpacity
                  style={[styles.typeChip, markupType === 'percentage' && styles.typeChipActive]}
                  onPress={() => setMarkupType('percentage')}
                >
                  <Text style={[styles.typeChipText, markupType === 'percentage' && styles.typeChipTextActive]}>Percentage (%)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeChip, markupType === 'flat' && styles.typeChipActive]}
                  onPress={() => setMarkupType('flat')}
                >
                  <Text style={[styles.typeChipText, markupType === 'flat' && styles.typeChipTextActive]}>Flat Amount</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Markup Value *</Text>
              <TextInput style={styles.input} value={markupValue} onChangeText={setMarkupValue} placeholder={markupType === 'percentage' ? 'e.g. 10' : 'e.g. 50'} placeholderTextColor={Colors.textLight} keyboardType="numeric" />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowAddModal(false); resetForm(); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSaveZone}>
                <Text style={styles.saveButtonText}>{editingZone ? 'Update' : 'Add Zone'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  zonesSection: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    marginBottom: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  zoneDetail: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  zoneActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    padding: 6,
  },
  addZoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addZoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  modalBody: {
    padding: Spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textDark,
  },
  typeOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: Colors.primary,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  typeChipTextActive: {
    color: '#fff',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
