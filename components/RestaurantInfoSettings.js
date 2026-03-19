import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const STORAGE_KEY = 'dine_restaurant_info';

export default function RestaurantInfoSettings({ restaurantId, onSettingsChange }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  // Store original for cancel
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
      const userData = await apiClient.getUser();
      const restaurant = userData?.restaurant || {};
      const data = {
        name: restaurant.name || '',
        address: restaurant.address || '',
        phone: restaurant.phone || '',
        email: restaurant.email || '',
        description: restaurant.description || '',
      };
      applyData(data);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error fetching restaurant info:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyData = (data) => {
    setName(data.name || '');
    setAddress(data.address || '');
    setPhone(data.phone || '');
    setEmail(data.email || '');
    setDescription(data.description || '');
    setOriginal(data);
  };

  const handleCancel = () => {
    applyData(original);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Restaurant name is required');
      return;
    }

    setSaving(true);
    try {
      await apiClient.updateRestaurant(restaurantId, {
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        description: description.trim(),
      });

      const data = { name: name.trim(), address: address.trim(), phone: phone.trim(), email: email.trim(), description: description.trim() };
      setOriginal(data);
      await AsyncStorage.setItem(`${STORAGE_KEY}_${restaurantId}`, JSON.stringify(data));

      // Sync user data
      const userData = await apiClient.getUser();
      if (userData?.restaurant) {
        userData.restaurant.name = data.name;
        userData.restaurant.address = data.address;
        userData.restaurant.phone = data.phone;
        userData.restaurant.email = data.email;
        await apiClient.setUser(userData);
      }

      if (onSettingsChange) onSettingsChange(data);
      setIsEditing(false);
      Alert.alert('Success', 'Restaurant info updated');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="storefront" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Restaurant Info</Text>
        </View>
        <ActivityIndicator size="small" color={Colors.primary} style={{ padding: Spacing.lg }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="storefront" size={20} color={Colors.primary} />
          <Text style={styles.headerTitle}>Restaurant Info</Text>
        </View>
        {saving && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      <View style={styles.body}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Restaurant Name</Text>
          {isEditing ? (
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Restaurant name" placeholderTextColor={Colors.textLight} />
          ) : (
            <Text style={styles.fieldValue}>{name || '—'}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Address</Text>
          {isEditing ? (
            <TextInput style={[styles.input, styles.multilineInput]} value={address} onChangeText={setAddress} placeholder="Full address" placeholderTextColor={Colors.textLight} multiline numberOfLines={2} />
          ) : (
            <Text style={styles.fieldValue}>{address || '—'}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Phone</Text>
          {isEditing ? (
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={Colors.textLight} keyboardType="phone-pad" />
          ) : (
            <Text style={styles.fieldValue}>{phone || '—'}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Email</Text>
          {isEditing ? (
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor={Colors.textLight} keyboardType="email-address" autoCapitalize="none" />
          ) : (
            <Text style={styles.fieldValue}>{email || '—'}</Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Description</Text>
          {isEditing ? (
            <TextInput style={[styles.input, styles.multilineInput]} value={description} onChangeText={setDescription} placeholder="Short description" placeholderTextColor={Colors.textLight} multiline numberOfLines={3} />
          ) : (
            <Text style={styles.fieldValue}>{description || '—'}</Text>
          )}
        </View>
      </View>

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
            <Text style={styles.editButtonText}>Edit</Text>
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
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldValue: {
    fontSize: 15,
    color: Colors.textDark,
    lineHeight: 22,
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
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: 60,
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
