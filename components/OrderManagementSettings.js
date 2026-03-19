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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_order_mgmt_settings';

export default function OrderManagementSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [sequentialNumbering, setSequentialNumbering] = useState(false);
  const [orderPrefix, setOrderPrefix] = useState('');
  const [autoAccept, setAutoAccept] = useState(false);
  const [requireConfirmation, setRequireConfirmation] = useState(true);
  const [prepTime, setPrepTime] = useState('30');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [maxOrderValue, setMaxOrderValue] = useState('');

  const [original, setOriginal] = useState({});

  useEffect(() => {
    loadSettings();
  }, [restaurantId]);

  const loadSettings = async () => {
    if (!restaurantId) return;
    try {
      const cached = await AsyncStorage.getItem(`${STORAGE_KEY}_${restaurantId}`);
      if (cached) {
        applyData(JSON.parse(cached));
        setLoading(false);
      }
      fetchSettings();
    } catch {
      fetchSettings();
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await apiClient.getAdminSettings(restaurantId);
      const settings = response.settings || {};
      const orderSettings = settings.orderSettings || {};
      const systemSettings = settings.systemSettings || {};

      const data = {
        sequentialNumbering: orderSettings.sequentialNumbering || false,
        orderPrefix: orderSettings.orderPrefix || '',
        autoAccept: systemSettings.autoAcceptOrders || false,
        requireConfirmation: systemSettings.requireConfirmation !== false,
        prepTime: String(orderSettings.prepTime || '30'),
        minOrderValue: String(orderSettings.minOrderValue || ''),
        maxOrderValue: String(orderSettings.maxOrderValue || ''),
      };

      applyData(data);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error fetching order settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyData = (data) => {
    setSequentialNumbering(data.sequentialNumbering || false);
    setOrderPrefix(data.orderPrefix || '');
    setAutoAccept(data.autoAccept || false);
    setRequireConfirmation(data.requireConfirmation !== false);
    setPrepTime(data.prepTime || '30');
    setMinOrderValue(data.minOrderValue || '');
    setMaxOrderValue(data.maxOrderValue || '');
    setOriginal(data);
  };

  const handleCancel = () => {
    applyData(original);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.updateAdminSettings(restaurantId, {
        orderSettings: {
          sequentialNumbering,
          orderPrefix: orderPrefix.trim(),
          prepTime: parseInt(prepTime) || 30,
          minOrderValue: parseFloat(minOrderValue) || 0,
          maxOrderValue: parseFloat(maxOrderValue) || 0,
        },
        systemSettings: {
          autoAcceptOrders: autoAccept,
          requireConfirmation,
        },
      });

      const data = {
        sequentialNumbering,
        orderPrefix: orderPrefix.trim(),
        autoAccept,
        requireConfirmation,
        prepTime,
        minOrderValue,
        maxOrderValue,
      };
      setOriginal(data);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(data));
      if (onSettingsChange) onSettingsChange(data);
      setIsEditing(false);
      Alert.alert('Success', 'Order settings updated');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const previewOrderId = orderPrefix
    ? `${orderPrefix}-001`
    : sequentialNumbering
    ? '#001'
    : '#a3f2c1';

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="settings" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Order Management</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="settings" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Order Management</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      <View style={styles.body}>
        {/* Sequential Numbering */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Sequential Numbering</Text>
            <Text style={styles.toggleHint}>Orders numbered 1, 2, 3... daily</Text>
          </View>
          <Switch
            value={sequentialNumbering}
            onValueChange={(val) => { setSequentialNumbering(val); if (!isEditing) setIsEditing(true); }}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={sequentialNumbering ? Colors.primary : '#f4f4f5'}
          />
        </View>

        {/* Order Prefix */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Order Prefix</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={orderPrefix}
              onChangeText={setOrderPrefix}
              placeholder="e.g. ORD, TBL"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="characters"
              maxLength={10}
            />
          ) : (
            <Text style={styles.fieldValue}>{orderPrefix || 'None'}</Text>
          )}
        </View>

        {/* Preview */}
        <View style={styles.previewBox}>
          <Text style={styles.previewLabel}>Order ID Preview</Text>
          <Text style={styles.previewValue}>{previewOrderId}</Text>
        </View>

        {/* Auto Accept */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Auto Accept Orders</Text>
            <Text style={styles.toggleHint}>Automatically confirm incoming orders</Text>
          </View>
          <Switch
            value={autoAccept}
            onValueChange={(val) => { setAutoAccept(val); if (!isEditing) setIsEditing(true); }}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={autoAccept ? Colors.primary : '#f4f4f5'}
          />
        </View>

        {/* Require Confirmation */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.toggleLabel}>Require Confirmation</Text>
            <Text style={styles.toggleHint}>Ask for confirmation before placing order</Text>
          </View>
          <Switch
            value={requireConfirmation}
            onValueChange={(val) => { setRequireConfirmation(val); if (!isEditing) setIsEditing(true); }}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '50' }}
            thumbColor={requireConfirmation ? Colors.primary : '#f4f4f5'}
          />
        </View>

        {/* Prep Time */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Default Prep Time (minutes)</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={prepTime}
              onChangeText={setPrepTime}
              placeholder="30"
              placeholderTextColor={Colors.textLight}
              keyboardType="numeric"
            />
          ) : (
            <Text style={styles.fieldValue}>{prepTime} min</Text>
          )}
        </View>

        {/* Min/Max Order Value */}
        {isEditing && (
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Min Order Value</Text>
              <TextInput
                style={styles.input}
                value={minOrderValue}
                onChangeText={setMinOrderValue}
                placeholder="0"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Max Order Value</Text>
              <TextInput
                style={styles.input}
                value={maxOrderValue}
                onChangeText={setMaxOrderValue}
                placeholder="0 (no limit)"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
              />
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {isEditing ? (
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveButtonText}>Save</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
            <Ionicons name="create-outline" size={16} color={Colors.primary} />
            <Text style={styles.editButtonText}>Edit Settings</Text>
          </TouchableOpacity>
        )}
      </View>
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
  body: {
    padding: Spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
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
  fieldGroup: {
    marginTop: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 15,
    color: Colors.textDark,
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
  rowFields: {
    flexDirection: 'row',
    gap: 10,
  },
  previewBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: Spacing.sm,
    alignItems: 'center',
    marginTop: 10,
  },
  previewLabel: {
    fontSize: 11,
    color: Colors.textMedium,
    marginBottom: 2,
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#10b981',
    fontFamily: 'monospace',
  },
  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
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
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary + '10',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
});
