import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant', icon: 'restaurant' },
  { value: 'cafe', label: 'Cafe', icon: 'cafe' },
  { value: 'bar', label: 'Bar', icon: 'beer' },
  { value: 'bakery', label: 'Bakery', icon: 'nutrition' },
  { value: 'qsr', label: 'Quick Service', icon: 'fast-food' },
  { value: 'hotel', label: 'Hotel', icon: 'bed' },
  { value: 'cloud_kitchen', label: 'Cloud Kitchen', icon: 'cloud' },
];

export default function RestaurantManagement({ restaurantId }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRestaurant, setEditingRestaurant] = useState(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCuisine, setFormCuisine] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBusinessType, setFormBusinessType] = useState('restaurant');

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      const response = await apiClient.getRestaurants();
      setRestaurants(response.restaurants || []);
    } catch (error) {
      console.error('Error fetching restaurants:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormAddress('');
    setFormCity('');
    setFormPhone('');
    setFormEmail('');
    setFormCuisine('');
    setFormDescription('');
    setFormBusinessType('restaurant');
    setEditingRestaurant(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (rest) => {
    setFormName(rest.name || '');
    setFormAddress(rest.address || '');
    setFormCity(rest.city || '');
    setFormPhone(rest.phone || '');
    setFormEmail(rest.email || '');
    setFormCuisine(Array.isArray(rest.cuisine) ? rest.cuisine.join(', ') : (rest.cuisine || ''));
    setFormDescription(rest.description || '');
    setFormBusinessType(rest.businessType || 'restaurant');
    setEditingRestaurant(rest);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Restaurant name is required');
      return;
    }

    setSaving(true);
    try {
      const data = {
        name: formName.trim(),
        address: formAddress.trim(),
        city: formCity.trim(),
        phone: formPhone.trim(),
        email: formEmail.trim(),
        cuisine: formCuisine.trim() ? formCuisine.split(',').map((c) => c.trim()).filter(Boolean) : [],
        description: formDescription.trim(),
        businessType: formBusinessType,
      };

      if (editingRestaurant) {
        await apiClient.updateRestaurant(editingRestaurant.id, data);
        Alert.alert('Success', 'Restaurant updated');
      } else {
        const response = await apiClient.createRestaurant(data);
        if (response.restaurant) {
          Alert.alert('Success', `Restaurant "${data.name}" created!`);
        }
      }

      setShowModal(false);
      resetForm();
      fetchRestaurants();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rest) => {
    Alert.alert(
      'Delete Restaurant',
      `Are you sure you want to delete "${rest.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiClient.deleteRestaurant(rest.id);
              fetchRestaurants();
              Alert.alert('Success', 'Restaurant deleted');
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to delete');
            }
          },
        },
      ]
    );
  };

  const renderRestaurant = ({ item }) => {
    const isCurrent = item.id === restaurantId;
    const typeInfo = BUSINESS_TYPES.find((t) => t.value === item.businessType) || BUSINESS_TYPES[0];

    return (
      <View style={[styles.restaurantCard, isCurrent && styles.restaurantCardCurrent]}>
        {isCurrent && <View style={styles.currentBorder} />}
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.restaurantIcon}>
                <Ionicons name={typeInfo.icon} size={20} color={Colors.primary} />
              </View>
              <View style={styles.cardHeaderInfo}>
                <Text style={styles.restaurantName}>{item.name}</Text>
                {item.city && <Text style={styles.restaurantCity}>{item.city}</Text>}
              </View>
            </View>
            <View style={styles.badgeRow}>
              {isCurrent && (
                <View style={styles.currentBadge}>
                  <Text style={styles.currentBadgeText}>Current</Text>
                </View>
              )}
              <View style={[styles.statusBadge, item.isActive === false ? styles.statusInactive : styles.statusActive]}>
                <View style={[styles.statusDot, { backgroundColor: item.isActive === false ? '#ef4444' : '#10b981' }]} />
                <Text style={[styles.statusText, { color: item.isActive === false ? '#ef4444' : '#10b981' }]}>
                  {item.isActive === false ? 'Inactive' : 'Active'}
                </Text>
              </View>
            </View>
          </View>

          {/* Details */}
          <View style={styles.detailsSection}>
            {item.phone && (
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={14} color={Colors.textMedium} />
                <Text style={styles.detailText}>{item.phone}</Text>
              </View>
            )}
            {item.email && (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={14} color={Colors.textMedium} />
                <Text style={styles.detailText}>{item.email}</Text>
              </View>
            )}
            {item.address && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={14} color={Colors.textMedium} />
                <Text style={styles.detailText} numberOfLines={2}>{item.address}</Text>
              </View>
            )}
            {item.cuisine && item.cuisine.length > 0 && (
              <View style={styles.detailRow}>
                <Ionicons name="pizza-outline" size={14} color={Colors.textMedium} />
                <Text style={styles.detailText}>{Array.isArray(item.cuisine) ? item.cuisine.join(', ') : item.cuisine}</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(item)}>
              <Ionicons name="create-outline" size={16} color={Colors.primary} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            {!isCurrent && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading restaurants...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>{restaurants.length} restaurant{restaurants.length !== 1 ? 's' : ''}</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add Restaurant</Text>
        </TouchableOpacity>
      </View>

      {/* Restaurant List */}
      <FlatList
        data={restaurants}
        renderItem={renderRestaurant}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="storefront-outline" size={48} color={Colors.textLight} />
            <Text style={styles.emptyText}>No restaurants yet</Text>
            <Text style={styles.emptySubtext}>Tap "Add Restaurant" to create your first one</Text>
          </View>
        }
      />

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRestaurant ? 'Edit Restaurant' : 'Add Restaurant'}</Text>
              <TouchableOpacity onPress={() => { setShowModal(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Restaurant Name *</Text>
              <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Restaurant name" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Business Type</Text>
              <View style={styles.typeGrid}>
                {BUSINESS_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[styles.typeChip, formBusinessType === type.value && styles.typeChipActive]}
                    onPress={() => setFormBusinessType(type.value)}
                  >
                    <Ionicons name={type.icon} size={16} color={formBusinessType === type.value ? '#fff' : Colors.textMedium} />
                    <Text style={[styles.typeChipText, formBusinessType === type.value && styles.typeChipTextActive]}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput style={[styles.input, styles.multilineInput]} value={formAddress} onChangeText={setFormAddress} placeholder="Full address" placeholderTextColor={Colors.textLight} multiline />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput style={styles.input} value={formCity} onChangeText={setFormCity} placeholder="City" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} placeholder="Phone number" placeholderTextColor={Colors.textLight} keyboardType="phone-pad" />

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.input} value={formEmail} onChangeText={setFormEmail} placeholder="Email" placeholderTextColor={Colors.textLight} keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.inputLabel}>Cuisine (comma-separated)</Text>
              <TextInput style={styles.input} value={formCuisine} onChangeText={setFormCuisine} placeholder="e.g. Indian, Chinese, Italian" placeholderTextColor={Colors.textLight} />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput style={[styles.input, styles.multilineInput]} value={formDescription} onChangeText={setFormDescription} placeholder="Short description" placeholderTextColor={Colors.textLight} multiline numberOfLines={3} />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowModal(false); resetForm(); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : (
                  <Text style={styles.saveButtonText}>{editingRestaurant ? 'Update' : 'Create'}</Text>
                )}
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
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  list: {
    padding: Spacing.md,
    paddingTop: 0,
  },
  restaurantCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  restaurantCardCurrent: {
    borderColor: Colors.primary + '30',
  },
  currentBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.primary,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardContent: {
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  restaurantIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  restaurantCity: {
    fontSize: 13,
    color: Colors.textMedium,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusActive: {
    backgroundColor: '#f0fdf4',
  },
  statusInactive: {
    backgroundColor: '#fef2f2',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailsSection: {
    gap: 6,
    marginBottom: Spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMedium,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.primary + '10',
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textDark,
  },
  emptySubtext: {
    fontSize: 13,
    color: Colors.textMedium,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '85%',
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
    marginTop: 14,
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  typeChipActive: {
    backgroundColor: Colors.primary,
  },
  typeChipText: {
    fontSize: 12,
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
    borderRadius: 10,
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
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
