import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyOffer = {
  name: '',
  description: '',
  discountType: 'percentage',
  discountValue: '10',
  minOrderValue: '0',
  maxDiscount: '',
  validFrom: '',
  validUntil: '',
  isActive: true,
  usageLimit: '',
  isFirstOrderOnly: false,
  autoApply: false,
  scope: 'order',
  targetCategories: [],
  targetItems: [],
  schedule: null,
  promotionType: 'discount',
  bogoConfig: null,
  eventLabel: '',
};

export default function OffersScreen() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [offers, setOffers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [formData, setFormData] = useState({ ...emptyOffer });

  useEffect(() => {
    loadInitialData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (restaurantId && !loading) {
        loadOffers(restaurantId);
      }
    }, [restaurantId, loading])
  );

  const loadInitialData = async () => {
    try {
      const userData = await apiClient.getUser();
      if (!userData) {
        router.replace('/(auth)/login');
        return;
      }
      setUser(userData);
      const rid = userData.restaurantId || userData.restaurant?.id;
      setRestaurantId(rid);
      if (rid) {
        await loadOffers(rid);
      }
    } catch (error) {
      console.error('Error loading offers data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOffers = async (rid) => {
    try {
      const response = await apiClient.getOffers(rid);
      setOffers(response.offers || []);
    } catch (error) {
      console.error('Error loading offers:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (restaurantId) await loadOffers(restaurantId);
    setRefreshing(false);
  };

  const handleOpenModal = (offer = null) => {
    if (offer) {
      setEditingOffer(offer);
      setFormData({
        ...offer,
        discountValue: String(offer.discountValue || ''),
        minOrderValue: String(offer.minOrderValue || '0'),
        maxDiscount: offer.maxDiscount ? String(offer.maxDiscount) : '',
        usageLimit: offer.usageLimit ? String(offer.usageLimit) : '',
        validFrom: offer.validFrom ? new Date(offer.validFrom).toISOString().split('T')[0] : '',
        validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString().split('T')[0] : '',
        targetCategories: offer.targetCategories || [],
        targetItems: offer.targetItems || [],
      });
    } else {
      setEditingOffer(null);
      setFormData({ ...emptyOffer, validFrom: new Date().toISOString().split('T')[0] });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      Alert.alert('Error', 'Please enter an offer name');
      return;
    }
    if (!restaurantId) {
      Alert.alert('Error', 'No restaurant found');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        discountValue: parseFloat(formData.discountValue) || 0,
        minOrderValue: parseInt(formData.minOrderValue) || 0,
        maxDiscount: formData.maxDiscount ? parseInt(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
        validFrom: formData.validFrom || null,
        validUntil: formData.validUntil || null,
      };

      if (editingOffer) {
        await apiClient.updateOffer(restaurantId, editingOffer.id, payload);
      } else {
        await apiClient.createOffer(restaurantId, payload);
      }
      await loadOffers(restaurantId);
      setShowModal(false);
      Alert.alert('Success', editingOffer ? 'Offer updated' : 'Offer created');
    } catch (error) {
      console.error('Error saving offer:', error);
      Alert.alert('Error', 'Failed to save offer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (offerId) => {
    Alert.alert('Delete Offer', 'Are you sure you want to delete this offer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiClient.deleteOffer(restaurantId, offerId);
            await loadOffers(restaurantId);
          } catch (error) {
            console.error('Error deleting offer:', error);
            Alert.alert('Error', 'Failed to delete offer');
          }
        },
      },
    ]);
  };

  const handleToggleActive = async (offer) => {
    try {
      await apiClient.updateOffer(restaurantId, offer.id, {
        ...offer,
        isActive: !offer.isActive,
      });
      await loadOffers(restaurantId);
    } catch (error) {
      console.error('Error toggling offer:', error);
    }
  };

  const getDiscountLabel = (offer) => {
    if (offer.promotionType === 'bogo') {
      const bc = offer.bogoConfig || {};
      return `Buy ${bc.buyQty || 2} Get ${bc.getQty || 1}`;
    }
    if (offer.discountType === 'percentage') return `${offer.discountValue}% OFF`;
    return `Rs. ${offer.discountValue} OFF`;
  };

  const isOfferActiveNow = (offer) => {
    if (!offer.isActive) return false;
    if (!offer.schedule) return true;
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const days = offer.schedule.days || [];
    return days.includes(currentDay) && currentTime >= (offer.schedule.startTime || '00:00') && currentTime <= (offer.schedule.endTime || '23:59');
  };

  const updateForm = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleScheduleDay = (dayIndex) => {
    const days = formData.schedule?.days || [];
    const newDays = days.includes(dayIndex)
      ? days.filter(d => d !== dayIndex)
      : [...days, dayIndex];
    updateForm('schedule', { ...formData.schedule, days: newDays });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const renderOfferCard = (offer) => {
    const activeNow = isOfferActiveNow(offer);
    return (
      <View
        key={offer.id}
        style={[
          styles.offerCard,
          offer.isActive && styles.offerCardActive,
          !offer.isActive && styles.offerCardInactive,
        ]}
      >
        <View style={styles.offerCardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={[
                styles.discountBadge,
                { backgroundColor: offer.discountType === 'percentage' ? '#fef3c7' : '#dbeafe' }
              ]}>
                <Text style={[
                  styles.discountBadgeText,
                  { color: offer.discountType === 'percentage' ? '#92400e' : '#1e40af' }
                ]}>
                  {getDiscountLabel(offer)}
                </Text>
              </View>
              {offer.isFirstOrderOnly && (
                <View style={[styles.tagBadge, { backgroundColor: '#f3e8ff' }]}>
                  <Text style={[styles.tagBadgeText, { color: '#7c3aed' }]}>First Order</Text>
                </View>
              )}
              {offer.autoApply && (
                <View style={[styles.tagBadge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={[styles.tagBadgeText, { color: '#16a34a' }]}>Auto</Text>
                </View>
              )}
              {offer.schedule && activeNow && (
                <View style={[styles.tagBadge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={[styles.tagBadgeText, { color: '#16a34a' }]}>Live Now</Text>
                </View>
              )}
            </View>
            <Text style={styles.offerName}>{offer.name}</Text>
            {offer.description ? (
              <Text style={styles.offerDescription}>{offer.description}</Text>
            ) : null}
            <View style={styles.offerMeta}>
              {offer.minOrderValue > 0 && (
                <Text style={styles.offerMetaText}>Min: Rs.{offer.minOrderValue}</Text>
              )}
              {offer.maxDiscount ? (
                <Text style={styles.offerMetaText}>Max: Rs.{offer.maxDiscount}</Text>
              ) : null}
              {offer.usageLimit ? (
                <Text style={styles.offerMetaText}>Used: {offer.usageCount || 0}/{offer.usageLimit}</Text>
              ) : null}
              {offer.validUntil ? (
                <Text style={styles.offerMetaText}>Until: {new Date(offer.validUntil).toLocaleDateString()}</Text>
              ) : null}
              {offer.scope !== 'order' && (
                <Text style={styles.offerMetaText}>
                  Scope: {offer.scope === 'category' ? 'Categories' : 'Items'}
                </Text>
              )}
              {offer.schedule && (
                <Text style={styles.offerMetaText}>
                  {(offer.schedule.days || []).map(d => DAYS[d]).join(', ')} {offer.schedule.startTime}-{offer.schedule.endTime}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.offerActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleToggleActive(offer)}
          >
            <Ionicons
              name={offer.isActive ? 'toggle' : 'toggle-outline'}
              size={28}
              color={offer.isActive ? Colors.success : '#9ca3af'}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => handleOpenModal(offer)}
          >
            <Ionicons name="create-outline" size={20} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(offer.id)}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderFormModal = () => (
    <Modal
      visible={showModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingOffer ? 'Edit Offer' : 'Create Offer'}
            </Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Offer Name */}
            <Text style={styles.label}>Offer Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(v) => updateForm('name', v)}
              placeholder="e.g. New Year Special"
              placeholderTextColor="#9ca3af"
            />

            {/* Description */}
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
              value={formData.description}
              onChangeText={(v) => updateForm('description', v)}
              placeholder="Describe the offer"
              placeholderTextColor="#9ca3af"
              multiline
            />

            {/* Discount Type + Value */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Discount Type</Text>
                <View style={styles.segmentRow}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, formData.discountType === 'percentage' && styles.segmentBtnActive]}
                    onPress={() => updateForm('discountType', 'percentage')}
                  >
                    <Text style={[styles.segmentText, formData.discountType === 'percentage' && styles.segmentTextActive]}>%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.segmentBtn, formData.discountType === 'flat' && styles.segmentBtnActive]}
                    onPress={() => updateForm('discountType', 'flat')}
                  >
                    <Text style={[styles.segmentText, formData.discountType === 'flat' && styles.segmentTextActive]}>Rs.</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.label}>Value</Text>
                <TextInput
                  style={styles.input}
                  value={formData.discountValue}
                  onChangeText={(v) => updateForm('discountValue', v)}
                  keyboardType="numeric"
                  placeholder="10"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            {/* Min Order + Max Discount */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Min Order (Rs.)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.minOrderValue}
                  onChangeText={(v) => updateForm('minOrderValue', v)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.label}>Max Discount (Rs.)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.maxDiscount}
                  onChangeText={(v) => updateForm('maxDiscount', v)}
                  keyboardType="numeric"
                  placeholder="No limit"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            {/* Valid From + Valid Until */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Valid From</Text>
                <TextInput
                  style={styles.input}
                  value={formData.validFrom}
                  onChangeText={(v) => updateForm('validFrom', v)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.label}>Valid Until</Text>
                <TextInput
                  style={styles.input}
                  value={formData.validUntil}
                  onChangeText={(v) => updateForm('validUntil', v)}
                  placeholder="No expiry"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            {/* Usage Limit */}
            <Text style={styles.label}>Usage Limit</Text>
            <TextInput
              style={styles.input}
              value={formData.usageLimit}
              onChangeText={(v) => updateForm('usageLimit', v)}
              keyboardType="numeric"
              placeholder="Unlimited"
              placeholderTextColor="#9ca3af"
            />

            {/* Promotion Type */}
            <Text style={styles.label}>Promotion Type</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'discount', label: 'Discount', icon: 'pricetag-outline' },
                { value: 'bogo', label: 'BOGO', icon: 'gift-outline' },
                { value: 'event', label: 'Event', icon: 'calendar-outline' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segmentBtn, { flex: 1 }, formData.promotionType === opt.value && styles.segmentBtnActive]}
                  onPress={() => updateForm('promotionType', opt.value)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={formData.promotionType === opt.value ? '#be185d' : '#6b7280'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.segmentText, formData.promotionType === opt.value && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* BOGO Config */}
            {formData.promotionType === 'bogo' && (
              <View style={styles.configBox}>
                <Text style={styles.configBoxTitle}>BOGO Configuration</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.labelSmall}>Buy Qty</Text>
                    <TextInput
                      style={styles.inputSmall}
                      value={String(formData.bogoConfig?.buyQty || '2')}
                      onChangeText={(v) => updateForm('bogoConfig', {
                        ...(formData.bogoConfig || {}),
                        buyQty: parseInt(v) || 2,
                        getQty: formData.bogoConfig?.getQty || 1,
                        getDiscount: formData.bogoConfig?.getDiscount || 100,
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.labelSmall}>Get Qty</Text>
                    <TextInput
                      style={styles.inputSmall}
                      value={String(formData.bogoConfig?.getQty || '1')}
                      onChangeText={(v) => updateForm('bogoConfig', {
                        ...(formData.bogoConfig || {}),
                        buyQty: formData.bogoConfig?.buyQty || 2,
                        getQty: parseInt(v) || 1,
                        getDiscount: formData.bogoConfig?.getDiscount || 100,
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.labelSmall}>Discount %</Text>
                    <TextInput
                      style={styles.inputSmall}
                      value={String(formData.bogoConfig?.getDiscount || '100')}
                      onChangeText={(v) => updateForm('bogoConfig', {
                        ...(formData.bogoConfig || {}),
                        buyQty: formData.bogoConfig?.buyQty || 2,
                        getQty: formData.bogoConfig?.getQty || 1,
                        getDiscount: parseInt(v) || 100,
                      })}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Text style={styles.hintText}>
                  e.g. Buy 2 Get 1 at 100% off = Buy 2 Get 1 Free
                </Text>
              </View>
            )}

            {/* Event Label */}
            {formData.promotionType === 'event' && (
              <>
                <Text style={styles.label}>Event Label</Text>
                <TextInput
                  style={styles.input}
                  value={formData.eventLabel || ''}
                  onChangeText={(v) => updateForm('eventLabel', v)}
                  placeholder="e.g. Ladies Night, Happy Hour"
                  placeholderTextColor="#9ca3af"
                />
              </>
            )}

            {/* Scope */}
            <Text style={styles.label}>Applies To</Text>
            <View style={styles.segmentRow}>
              {[
                { value: 'order', label: 'Whole Order' },
                { value: 'category', label: 'Categories' },
                { value: 'item', label: 'Items' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.segmentBtn, { flex: 1 }, formData.scope === opt.value && styles.segmentBtnActive]}
                  onPress={() => updateForm('scope', opt.value)}
                >
                  <Text style={[styles.segmentText, formData.scope === opt.value && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Target Categories */}
            {formData.scope === 'category' && (
              <>
                <Text style={styles.label}>Target Categories (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={(formData.targetCategories || []).join(', ')}
                  onChangeText={(v) => updateForm('targetCategories', v.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="e.g. Whiskey, Beer, Cocktails"
                  placeholderTextColor="#9ca3af"
                />
              </>
            )}

            {/* Target Items */}
            {formData.scope === 'item' && (
              <>
                <Text style={styles.label}>Target Item IDs (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={(formData.targetItems || []).join(', ')}
                  onChangeText={(v) => updateForm('targetItems', v.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="e.g. item_123, item_456"
                  placeholderTextColor="#9ca3af"
                />
                <Text style={styles.hintText}>Copy item IDs from your menu</Text>
              </>
            )}

            {/* Schedule (Happy Hour) */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Time-based schedule (Happy Hour)</Text>
              <Switch
                value={!!formData.schedule}
                onValueChange={(v) => {
                  updateForm('schedule', v
                    ? { type: 'recurring', days: [1, 2, 3, 4, 5], startTime: '16:00', endTime: '19:00' }
                    : null
                  );
                }}
                trackColor={{ false: '#d1d5db', true: '#fecdd3' }}
                thumbColor={formData.schedule ? Colors.primary : '#f4f3f4'}
              />
            </View>

            {formData.schedule && (
              <View style={styles.configBox}>
                <Text style={styles.labelSmall}>Days</Text>
                <View style={styles.daysRow}>
                  {DAYS.map((day, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.dayChip,
                        (formData.schedule.days || []).includes(i) && styles.dayChipActive,
                      ]}
                      onPress={() => toggleScheduleDay(i)}
                    >
                      <Text style={[
                        styles.dayChipText,
                        (formData.schedule.days || []).includes(i) && styles.dayChipTextActive,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[styles.row, { marginTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.labelSmall}>Start Time</Text>
                    <TextInput
                      style={styles.inputSmall}
                      value={formData.schedule.startTime || '16:00'}
                      onChangeText={(v) => updateForm('schedule', { ...formData.schedule, startTime: v })}
                      placeholder="16:00"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.labelSmall}>End Time</Text>
                    <TextInput
                      style={styles.inputSmall}
                      value={formData.schedule.endTime || '19:00'}
                      onChangeText={(v) => updateForm('schedule', { ...formData.schedule, endTime: v })}
                      placeholder="19:00"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Toggles */}
            <View style={styles.togglesSection}>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>First order only</Text>
                <Switch
                  value={formData.isFirstOrderOnly}
                  onValueChange={(v) => updateForm('isFirstOrderOnly', v)}
                  trackColor={{ false: '#d1d5db', true: '#fecdd3' }}
                  thumbColor={formData.isFirstOrderOnly ? Colors.primary : '#f4f3f4'}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Auto-apply</Text>
                <Switch
                  value={formData.autoApply}
                  onValueChange={(v) => updateForm('autoApply', v)}
                  trackColor={{ false: '#d1d5db', true: '#fecdd3' }}
                  thumbColor={formData.autoApply ? Colors.primary : '#f4f3f4'}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Active</Text>
                <Switch
                  value={formData.isActive}
                  onValueChange={(v) => updateForm('isActive', v)}
                  trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
                  thumbColor={formData.isActive ? Colors.success : '#f4f3f4'}
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textDark} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Offers & Promotions</Text>
          <Text style={styles.headerSubtitle}>{offers.length} offer{offers.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => handleOpenModal()}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.createBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {offers.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="gift-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Offers Yet</Text>
            <Text style={styles.emptySubtitle}>Create your first offer to attract more customers</Text>
            <TouchableOpacity style={styles.emptyCreateBtn} onPress={() => handleOpenModal()}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.emptyCreateBtnText}>Create First Offer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          offers.map(renderOfferCard)
        )}
      </ScrollView>

      {renderFormModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    marginRight: 12,
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerSubtitle: {
    ...Typography.small,
    color: Colors.textLight,
    marginTop: 1,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  createBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textDark,
    marginTop: 16,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ec4899',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
  },
  emptyCreateBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  // Offer Card
  offerCard: {
    backgroundColor: '#fff',
    borderRadius: BorderRadius.large,
    padding: 16,
    marginBottom: 12,
    ...Shadows.small,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  offerCardActive: {
    borderColor: Colors.success,
    borderWidth: 2,
  },
  offerCardInactive: {
    opacity: 0.6,
  },
  offerCardHeader: {
    flexDirection: 'row',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  discountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  discountBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tagBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  offerName: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 2,
  },
  offerDescription: {
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: 6,
  },
  offerMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  offerMetaText: {
    fontSize: 12,
    color: Colors.textMedium,
  },
  offerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
  editBtn: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 8,
  },
  deleteBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 8,
  },
  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalBody: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: '#fff',
  },
  // Form
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
    marginBottom: 6,
    marginTop: 14,
  },
  labelSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textLight,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textDark,
  },
  inputSmall: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.textDark,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    backgroundColor: '#fff',
  },
  segmentBtnActive: {
    borderColor: '#ec4899',
    backgroundColor: '#fdf2f8',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  segmentTextActive: {
    color: '#be185d',
  },
  configBox: {
    backgroundColor: '#fdf2f8',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fce7f3',
  },
  configBoxTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#831843',
    marginBottom: 8,
  },
  hintText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
  },
  // Schedule days
  daysRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  dayChipActive: {
    borderColor: '#f59e0b',
    backgroundColor: '#fef3c7',
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  dayChipTextActive: {
    color: '#92400e',
  },
  // Toggles
  togglesSection: {
    marginTop: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textDark,
  },
});
