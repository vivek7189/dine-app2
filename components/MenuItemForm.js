import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';
import { getCurrencySymbol } from '../utils/formatCurrency';

// Picker options per business type
const SPIRIT_CATEGORIES = ['Whiskey', 'Vodka', 'Rum', 'Gin', 'Beer', 'Wine', 'Cocktail', 'Mocktail', 'Shots', 'Mixer', 'Bar Snack'];
const SERVING_UNITS = ['ml', 'peg', 'glass', 'bottle', 'pint', 'can'];
const BOTTLE_SIZES = ['30ml', '60ml', '90ml', '180ml', '375ml', '500ml', '750ml', '1L'];
const BAKERY_UNITS = ['piece', 'kg', 'gram', 'dozen', 'box', 'slice', 'pack'];
const SERVING_SIZES = ['scoop', 'cup', 'cone', 'sundae', 'shake', 'tub', 'stick'];

const STOCK_UNITS = ['pcs', 'kg', 'gram', 'liter', 'ml', 'bottle', 'dozen', 'box', 'plate', 'slice'];
const TAX_PRICING_OPTIONS = ['Follow restaurant setting', 'Price includes tax', 'Add tax on top'];
const PRICE_UNIT_OPTIONS = [
  { value: 'per_kg', label: 'per kg' },
  { value: 'per_100g', label: 'per 100g' },
  { value: 'per_lb', label: 'per lb' },
];

const TAKEAWAY_NAMES = ['takeaway', 'take away', 'take-away'];
const DELIVERY_NAMES = ['delivery'];
const DINEIN_NAMES = ['dine-in', 'dine in', 'dinein'];

// AI stock suggestion patterns
const BOTTLED_PATTERNS = /\b(water|soda|cola|pepsi|coke|sprite|fanta|beer|wine|bottle|can|tin|juice|energy drink|redbull|monster)\b/i;
const PACKAGED_PATTERNS = /\b(bread|bun|pav|roti|naan|paratha|chips|lays|kurkure|biscuit|cookie|wafer|packet|pack)\b/i;
const COUNTABLE_PATTERNS = /\b(cigarette|gutka|pan masala|ice cream|egg|samosa|burger|wrap|sandwich|momo|dumpling|spring roll|roll|puff|patty|cutlet|vada|idli|dosa)\b/i;
const DESSERT_PATTERNS = /\b(gulab jamun|rasgulla|laddu|barfi|jalebi|cake slice|pastry|brownie|donut|muffin|cupcake)\b/i;

const getStockSuggestion = (name) => {
  if (!name) return null;
  if (BOTTLED_PATTERNS.test(name)) return { unit: 'bottle', label: 'bottled item' };
  if (PACKAGED_PATTERNS.test(name)) return { unit: 'pcs', label: 'packaged item' };
  if (COUNTABLE_PATTERNS.test(name)) return { unit: 'pcs', label: 'countable item' };
  if (DESSERT_PATTERNS.test(name)) return { unit: 'pcs', label: 'dessert item' };
  return null;
};

export default function MenuItemForm({
  formData,
  setFormData,
  isEditing,
  categories = [],
  onImageUpload,
  onImageDelete,
  uploadingImage = false,
  businessType = 'restaurant',
  multiPricingEnabled = false,
  activePricingRules = [],
  isOwnerOrAdmin = false,
}) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSpiritPicker, setShowSpiritPicker] = useState(false);
  const [showServingUnitPicker, setShowServingUnitPicker] = useState(false);
  const [showBottleSizePicker, setShowBottleSizePicker] = useState(false);
  const [showBakeryUnitPicker, setShowBakeryUnitPicker] = useState(false);
  const [showServingSizePicker, setShowServingSizePicker] = useState(false);
  const [showTaxPricingPicker, setShowTaxPricingPicker] = useState(false);
  const [showStockUnitPicker, setShowStockUnitPicker] = useState(false);
  const [showPriceUnitPicker, setShowPriceUnitPicker] = useState(false);

  const isBar = businessType === 'bar';
  const isBakery = businessType === 'bakery';
  const isIceCream = businessType === 'ice_cream';

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery access is required to select images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 4 - (formData.images?.length || 0),
      });

      if (!result.canceled && result.assets?.length > 0) {
        if (onImageUpload) {
          onImageUpload(result.assets);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick images');
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        if (onImageUpload) {
          onImageUpload(result.assets);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const existingCategories = categories.filter(c => c.id !== 'all-items');

  // --- Variant helpers ---
  const addVariant = () => {
    const variants = [...(formData.variants || []), { name: '', price: '', description: '' }];
    setFormData({ ...formData, variants });
  };

  const updateVariant = (index, field, value) => {
    const variants = [...(formData.variants || [])];
    variants[index] = { ...variants[index], [field]: value };
    setFormData({ ...formData, variants });
  };

  const removeVariant = (index) => {
    const variants = (formData.variants || []).filter((_, i) => i !== index);
    setFormData({ ...formData, variants });
  };

  const addTemplateVariants = (templates) => {
    const existing = formData.variants || [];
    const newVariants = templates
      .filter(t => !existing.some(v => v.name.toLowerCase() === t.name.toLowerCase()))
      .map(t => ({ name: t.name, price: t.price || '' }));
    setFormData({ ...formData, variants: [...existing, ...newVariants] });
  };

  // --- Customization helpers ---
  const addCustomization = () => {
    const customizations = [...(formData.customizations || []), { name: '', price: '', description: '' }];
    setFormData({ ...formData, customizations });
  };

  const updateCustomization = (index, field, value) => {
    const customizations = [...(formData.customizations || [])];
    customizations[index] = { ...customizations[index], [field]: value };
    setFormData({ ...formData, customizations });
  };

  const removeCustomization = (index) => {
    const customizations = (formData.customizations || []).filter((_, i) => i !== index);
    setFormData({ ...formData, customizations });
  };

  // --- Modifier Group helpers ---
  const addModifierGroup = () => {
    const groups = [...(formData.modifierGroups || []), {
      id: `mg_${Date.now()}`,
      name: '',
      required: false,
      min: 0,
      max: 1,
      items: [],
    }];
    setFormData({ ...formData, modifierGroups: groups });
  };

  const updateModifierGroup = (index, field, value) => {
    const groups = [...(formData.modifierGroups || [])];
    groups[index] = { ...groups[index], [field]: value };
    setFormData({ ...formData, modifierGroups: groups });
  };

  const removeModifierGroup = (index) => {
    const groups = (formData.modifierGroups || []).filter((_, i) => i !== index);
    setFormData({ ...formData, modifierGroups: groups });
  };

  const addItemToGroup = (groupIndex) => {
    const groups = [...(formData.modifierGroups || [])];
    groups[groupIndex] = {
      ...groups[groupIndex],
      items: [...(groups[groupIndex].items || []), { id: `gi_${Date.now()}`, name: '', price: '' }],
    };
    setFormData({ ...formData, modifierGroups: groups });
  };

  const updateGroupItem = (groupIndex, itemIndex, field, value) => {
    const groups = [...(formData.modifierGroups || [])];
    const items = [...(groups[groupIndex].items || [])];
    items[itemIndex] = { ...items[itemIndex], [field]: value };
    groups[groupIndex] = { ...groups[groupIndex], items };
    setFormData({ ...formData, modifierGroups: groups });
  };

  const removeGroupItem = (groupIndex, itemIndex) => {
    const groups = [...(formData.modifierGroups || [])];
    groups[groupIndex] = {
      ...groups[groupIndex],
      items: (groups[groupIndex].items || []).filter((_, i) => i !== itemIndex),
    };
    setFormData({ ...formData, modifierGroups: groups });
  };

  const migrateCustomizationsToGroup = () => {
    if (!formData.customizations?.length) return;
    const newGroup = {
      id: `mg_${Date.now()}`,
      name: 'Add-ons',
      required: false,
      min: 0,
      max: formData.customizations.length,
      items: formData.customizations.map((c, i) => ({
        id: c.id || `gi_migrated_${i}_${Date.now()}`,
        name: c.name,
        price: c.price || '',
      })),
    };
    setFormData({
      ...formData,
      modifierGroups: [...(formData.modifierGroups || []), newGroup],
      customizations: [],
    });
  };

  // --- Generic dropdown picker ---
  const renderDropdownPicker = (options, currentValue, onSelect, showState, setShowState, placeholder) => (
    <>
      <TouchableOpacity
        style={styles.pickerButton}
        onPress={() => setShowState(!showState)}
      >
        <Text style={currentValue ? styles.pickerText : styles.pickerPlaceholder}>
          {currentValue || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.textLight} />
      </TouchableOpacity>
      {showState && (
        <View style={styles.categoryDropdown}>
          <ScrollView style={styles.categoryList} nestedScrollEnabled>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={styles.categoryOption}
                onPress={() => {
                  onSelect(opt);
                  setShowState(false);
                }}
              >
                <Text style={[
                  styles.categoryOptionText,
                  currentValue === opt && { color: Colors.primary, fontWeight: '700' },
                ]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );

  return (
    <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
      {/* Name and Short Code Row */}
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 2 }]}>
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="Dish name"
            placeholderTextColor={Colors.textLight}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.sm }]}>
          <Text style={styles.label}>Short Code</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., DAL"
            placeholderTextColor={Colors.textLight}
            value={formData.shortCode}
            onChangeText={(text) => setFormData({ ...formData, shortCode: text.toUpperCase() })}
            autoCapitalize="characters"
            maxLength={6}
          />
        </View>
      </View>

      {/* Description */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe this dish..."
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={3}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
        />
      </View>

      {/* Price and Category Row */}
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Price (*) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.textLight}
            keyboardType="decimal-pad"
            value={formData.price}
            onChangeText={(text) => setFormData({ ...formData, price: text })}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.sm }]}>
          <Text style={styles.label}>Category *</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          >
            <Text style={formData.category ? styles.pickerText : styles.pickerPlaceholder}>
              {formData.category || 'Select category'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={Colors.textLight} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Picker Dropdown */}
      {showCategoryPicker && (
        <View style={styles.categoryDropdown}>
          <TextInput
            style={styles.categoryInput}
            placeholder="Type new category or select below"
            placeholderTextColor={Colors.textLight}
            value={formData.category}
            onChangeText={(text) => setFormData({ ...formData, category: text })}
          />
          <ScrollView style={styles.categoryList} nestedScrollEnabled>
            {existingCategories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryOption}
                onPress={() => {
                  setFormData({ ...formData, category: cat.name });
                  setShowCategoryPicker(false);
                }}
              >
                <Text style={styles.categoryOptionText}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.categoryDone}
            onPress={() => setShowCategoryPicker(false)}
          >
            <Text style={styles.categoryDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tax Pricing */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Tax Pricing</Text>
        {renderDropdownPicker(
          TAX_PRICING_OPTIONS,
          formData.taxInclusive === null || formData.taxInclusive === undefined
            ? 'Follow restaurant setting'
            : formData.taxInclusive ? 'Price includes tax' : 'Add tax on top',
          (val) => {
            const taxVal = val === 'Follow restaurant setting' ? null : val === 'Price includes tax';
            setFormData({ ...formData, taxInclusive: taxVal });
          },
          showTaxPricingPicker,
          setShowTaxPricingPicker,
          'Follow restaurant setting'
        )}
      </View>

      {/* Channel & Zone Prices — Tree Layout */}
      {multiPricingEnabled && activePricingRules.length > 0 && (
        <View style={styles.pricingRulesSection}>
          <Text style={styles.pricingRulesTitle}>Channel Prices</Text>
          <Text style={styles.pricingRulesHint}>Empty zones inherit Dine-In price</Text>
          {(() => {
            const dineInRule = activePricingRules.find(r => DINEIN_NAMES.includes((r.name || '').toLowerCase().trim()));
            const zoneRules = activePricingRules.filter(r => {
              const n = (r.name || '').toLowerCase().trim();
              return !TAKEAWAY_NAMES.includes(n) && !DELIVERY_NAMES.includes(n) && !DINEIN_NAMES.includes(n);
            });
            const takeawayRule = activePricingRules.find(r => TAKEAWAY_NAMES.includes((r.name || '').toLowerCase().trim()));
            const deliveryRule = activePricingRules.find(r => DELIVERY_NAMES.includes((r.name || '').toLowerCase().trim()));
            const dineInPrice = dineInRule ? (formData.pricingRules?.[dineInRule.id]?.toString() || '') : '';
            const inheritedPrice = dineInPrice || formData.price || 'Base';
            return (
              <>
                {/* Dine-In */}
                {dineInRule && (
                  <View style={styles.pricingRuleRow}>
                    <Text style={styles.pricingChannelName}>🍽️ Dine-In</Text>
                    <TextInput
                      style={[styles.pricingRuleInput, dineInPrice ? styles.pricingRuleInputActive : null]}
                      placeholder={formData.price || 'Base'}
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                      value={dineInPrice}
                      onChangeText={(text) => setFormData({
                        ...formData,
                        pricingRules: { ...(formData.pricingRules || {}), [dineInRule.id]: text }
                      })}
                    />
                  </View>
                )}
                {/* Zone children — tree indented under Dine-In */}
                {zoneRules.length > 0 && (
                  <View style={styles.zoneTreeContainer}>
                    {zoneRules.map(rule => {
                      const val = formData.pricingRules?.[rule.id]?.toString() || '';
                      const hasCustom = val !== '';
                      return (
                        <View key={rule.id} style={styles.zoneRuleRow}>
                          <View style={[styles.zoneDot, { backgroundColor: hasCustom ? '#10b981' : '#cbd5e1' }]} />
                          <Text style={styles.zoneRuleName}>{rule.name}</Text>
                          <TextInput
                            style={[styles.pricingRuleInput, styles.zoneRuleInput, hasCustom ? styles.pricingRuleInputActive : styles.zoneRuleInputInherited]}
                            placeholder={`${getCurrencySymbol()}${inheritedPrice}`}
                            placeholderTextColor="#94a3b8"
                            keyboardType="numeric"
                            value={val}
                            onChangeText={(text) => setFormData({
                              ...formData,
                              pricingRules: { ...(formData.pricingRules || {}), [rule.id]: text }
                            })}
                          />
                          {!hasCustom && <Text style={styles.inheritedLabel}>inherited</Text>}
                        </View>
                      );
                    })}
                  </View>
                )}
                {/* Takeaway */}
                {takeawayRule && (
                  <View style={[styles.pricingRuleRow, { marginTop: 4 }]}>
                    <Text style={styles.pricingChannelName}>🥡 Takeaway</Text>
                    <TextInput
                      style={[styles.pricingRuleInput, formData.pricingRules?.[takeawayRule.id] ? styles.pricingRuleInputActive : null]}
                      placeholder={formData.price || 'Base'}
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                      value={formData.pricingRules?.[takeawayRule.id]?.toString() || ''}
                      onChangeText={(text) => setFormData({
                        ...formData,
                        pricingRules: { ...(formData.pricingRules || {}), [takeawayRule.id]: text }
                      })}
                    />
                  </View>
                )}
                {/* Delivery */}
                {deliveryRule && (
                  <View style={styles.pricingRuleRow}>
                    <Text style={styles.pricingChannelName}>🛵 Delivery</Text>
                    <TextInput
                      style={[styles.pricingRuleInput, formData.pricingRules?.[deliveryRule.id] ? styles.pricingRuleInputActive : null]}
                      placeholder={formData.price || 'Base'}
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                      value={formData.pricingRules?.[deliveryRule.id]?.toString() || ''}
                      onChangeText={(text) => setFormData({
                        ...formData,
                        pricingRules: { ...(formData.pricingRules || {}), [deliveryRule.id]: text }
                      })}
                    />
                  </View>
                )}
              </>
            );
          })()}
        </View>
      )}

      {/* Food Type (Veg/Non-Veg) */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Food Type</Text>
        <View style={styles.foodTypeContainer}>
          <TouchableOpacity
            style={[styles.foodTypeButton, formData.isVeg && styles.foodTypeButtonVeg]}
            onPress={() => setFormData({ ...formData, isVeg: true })}
          >
            <View style={[styles.vegIndicator, { borderColor: Colors.accentGreen }]}>
              <View style={[styles.vegDot, { backgroundColor: Colors.accentGreen }]} />
            </View>
            <Text style={[styles.foodTypeText, formData.isVeg && styles.foodTypeTextSelected]}>Veg</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.foodTypeButton, !formData.isVeg && styles.foodTypeButtonNonVeg]}
            onPress={() => setFormData({ ...formData, isVeg: false })}
          >
            <View style={[styles.vegIndicator, { borderColor: Colors.primary }]}>
              <View style={[styles.vegDot, { backgroundColor: Colors.primary }]} />
            </View>
            <Text style={[styles.foodTypeText, !formData.isVeg && styles.foodTypeTextSelected]}>Non-Veg</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Spice Level — hide for bar/ice_cream */}
      {!isBar && !isIceCream && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Spice Level</Text>
          <View style={styles.spiceLevelContainer}>
            {['mild', 'medium', 'hot'].map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.spiceButton,
                  formData.spiceLevel === level && styles.spiceButtonSelected,
                ]}
                onPress={() => setFormData({ ...formData, spiceLevel: level })}
              >
                <Text
                  style={[
                    styles.spiceText,
                    formData.spiceLevel === level && styles.spiceTextSelected,
                  ]}
                >
                  {level === 'mild' ? '🌶️' : level === 'medium' ? '🌶️🌶️' : '🌶️🌶️🌶️'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ========== VARIANTS SECTION ========== */}
      <View style={styles.inputGroup}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.label}>Variants</Text>
          <TouchableOpacity style={styles.addRowButton} onPress={addVariant}>
            <Ionicons name="add-circle" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          Add size/portion options (e.g., Half/Full, Small/Large)
        </Text>

        {/* Template buttons by type */}
        {(formData.variants || []).length === 0 && (
          <View style={styles.templateRow}>
            {isBar && (
              <TouchableOpacity
                style={styles.templateButton}
                onPress={() => addTemplateVariants([
                  { name: 'Peg (30ml)', price: '' },
                  { name: 'Large (60ml)', price: '' },
                  { name: 'Bottle', price: '' },
                ])}
              >
                <Text style={styles.templateButtonText}>+ Peg / Large / Bottle</Text>
              </TouchableOpacity>
            )}
            {isBakery && (
              <TouchableOpacity
                style={styles.templateButton}
                onPress={() => addTemplateVariants([
                  { name: 'Piece', price: '' },
                  { name: 'Box of 6', price: '' },
                  { name: 'Box of 12', price: '' },
                ])}
              >
                <Text style={styles.templateButtonText}>+ Piece / Box of 6 / Box of 12</Text>
              </TouchableOpacity>
            )}
            {isIceCream && (
              <TouchableOpacity
                style={styles.templateButton}
                onPress={() => addTemplateVariants([
                  { name: 'Single Scoop', price: '' },
                  { name: 'Double Scoop', price: '' },
                  { name: 'Triple Scoop', price: '' },
                ])}
              >
                <Text style={styles.templateButtonText}>+ Single / Double / Triple Scoop</Text>
              </TouchableOpacity>
            )}
            {!isBar && !isBakery && !isIceCream && (
              <TouchableOpacity
                style={styles.templateButton}
                onPress={() => addTemplateVariants([
                  { name: 'Half', price: '' },
                  { name: 'Full', price: '' },
                ])}
              >
                <Text style={styles.templateButtonText}>+ Half / Full</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Variant rows */}
        {(formData.variants || []).map((variant, index) => (
          <View key={index} style={styles.variantCard}>
            <View style={styles.variantRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder="Name (e.g., Large)"
                placeholderTextColor={Colors.textLight}
                value={variant.name}
                onChangeText={(text) => updateVariant(index, 'name', text)}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginLeft: Spacing.xs }]}
                placeholder="Price"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={variant.price?.toString() || ''}
                onChangeText={(text) => updateVariant(index, 'price', text)}
              />
              <TouchableOpacity
                style={styles.removeRowButton}
                onPress={() => removeVariant(index)}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, styles.variantDescInput]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.textLight}
              value={variant.description || ''}
              onChangeText={(text) => updateVariant(index, 'description', text)}
            />
          </View>
        ))}
      </View>

      {/* ========== CUSTOMIZATIONS SECTION ========== */}
      <View style={styles.inputGroup}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.label}>
            {isIceCream ? 'Toppings / Add-ons' : 'Customizations / Add-ons'}
          </Text>
          <TouchableOpacity style={styles.addRowButton} onPress={addCustomization}>
            <Ionicons name="add-circle" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          {isIceCream
            ? 'Add toppings like sprinkles, nuts, chocolate sauce'
            : 'Add extras like cheese, butter, extra gravy'}
        </Text>

        {(formData.customizations || []).map((custom, index) => (
          <View key={index} style={styles.variantCard}>
            <View style={styles.variantRow}>
              <TextInput
                style={[styles.input, { flex: 2 }]}
                placeholder={isIceCream ? 'Topping name' : 'Add-on name'}
                placeholderTextColor={Colors.textLight}
                value={custom.name}
                onChangeText={(text) => updateCustomization(index, 'name', text)}
              />
              <TextInput
                style={[styles.input, { flex: 1, marginLeft: Spacing.xs }]}
                placeholder="Price"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={custom.price?.toString() || ''}
                onChangeText={(text) => updateCustomization(index, 'price', text)}
              />
              <TouchableOpacity
                style={styles.removeRowButton}
                onPress={() => removeCustomization(index)}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, styles.variantDescInput]}
              placeholder="Description (optional)"
              placeholderTextColor={Colors.textLight}
              value={custom.description || ''}
              onChangeText={(text) => updateCustomization(index, 'description', text)}
            />
          </View>
        ))}
      </View>

      {/* ========== MODIFIER GROUPS SECTION ========== */}
      <View style={styles.inputGroup}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.label}>Modifier Groups</Text>
          <TouchableOpacity style={styles.addRowButton} onPress={addModifierGroup}>
            <Ionicons name="add-circle" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.hintText}>
          Group add-ons together (e.g., "Choose Sauce", "Select Toppings")
        </Text>

        {/* Migrate existing customizations */}
        {(formData.customizations || []).length > 0 && (formData.modifierGroups || []).length === 0 && (
          <TouchableOpacity
            style={[styles.templateButton, { marginBottom: Spacing.sm }]}
            onPress={migrateCustomizationsToGroup}
          >
            <Text style={styles.templateButtonText}>Migrate existing add-ons to a group</Text>
          </TouchableOpacity>
        )}

        {(formData.modifierGroups || []).map((group, gIndex) => (
          <View key={group.id || gIndex} style={[styles.variantCard, { padding: 12 }]}>
            {/* Group header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Group name (e.g., Choose Sauce)"
                placeholderTextColor={Colors.textLight}
                value={group.name}
                onChangeText={(text) => updateModifierGroup(gIndex, 'name', text)}
              />
              <TouchableOpacity
                style={styles.removeRowButton}
                onPress={() => removeModifierGroup(gIndex)}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>

            {/* Group settings row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => updateModifierGroup(gIndex, 'required', !group.required)}
              >
                <Ionicons
                  name={group.required ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={group.required ? Colors.primary : Colors.textLight}
                />
                <Text style={{ fontSize: 12, color: Colors.textDark }}>Required</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                <Text style={{ fontSize: 12, color: Colors.textMedium }}>Min:</Text>
                <TextInput
                  style={[styles.input, { width: 40, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'center', fontSize: 12 }]}
                  keyboardType="number-pad"
                  value={String(group.min || 0)}
                  onChangeText={(text) => updateModifierGroup(gIndex, 'min', parseInt(text) || 0)}
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12, color: Colors.textMedium }}>Max:</Text>
                <TextInput
                  style={[styles.input, { width: 40, paddingVertical: 4, paddingHorizontal: 6, textAlign: 'center', fontSize: 12 }]}
                  keyboardType="number-pad"
                  value={String(group.max || 1)}
                  onChangeText={(text) => updateModifierGroup(gIndex, 'max', parseInt(text) || 1)}
                />
              </View>
            </View>

            {/* Group items */}
            {(group.items || []).map((gItem, iIndex) => (
              <View key={gItem.id || iIndex} style={styles.variantRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  placeholder="Item name"
                  placeholderTextColor={Colors.textLight}
                  value={gItem.name}
                  onChangeText={(text) => updateGroupItem(gIndex, iIndex, 'name', text)}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: Spacing.xs }]}
                  placeholder="Price"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="decimal-pad"
                  value={gItem.price?.toString() || ''}
                  onChangeText={(text) => updateGroupItem(gIndex, iIndex, 'price', text)}
                />
                <TouchableOpacity
                  style={styles.removeRowButton}
                  onPress={() => removeGroupItem(gIndex, iIndex)}
                >
                  <Ionicons name="close-circle" size={22} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}

            {/* Add item button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
              onPress={() => addItemToGroup(gIndex)}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>Add Item</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* ========== BAR-SPECIFIC FIELDS ========== */}
      {isBar && (
        <View style={styles.typeSectionContainer}>
          <View style={styles.typeSectionHeader}>
            <Ionicons name="beer-outline" size={18} color="#7c3aed" />
            <Text style={styles.typeSectionTitle}>Bar Details</Text>
          </View>

          {/* Spirit Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Spirit Category</Text>
            {renderDropdownPicker(
              SPIRIT_CATEGORIES,
              formData.spiritCategory,
              (val) => setFormData({ ...formData, spiritCategory: val }),
              showSpiritPicker,
              setShowSpiritPicker,
              'Select category'
            )}
          </View>

          {/* ABV + Serving Unit Row */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>ABV %</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 42.8"
                placeholderTextColor={Colors.textLight}
                keyboardType="decimal-pad"
                value={formData.abv?.toString() || ''}
                onChangeText={(text) => setFormData({ ...formData, abv: text })}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.sm }]}>
              <Text style={styles.label}>Serving Unit</Text>
              {renderDropdownPicker(
                SERVING_UNITS,
                formData.servingUnit,
                (val) => setFormData({ ...formData, servingUnit: val }),
                showServingUnitPicker,
                setShowServingUnitPicker,
                'Select unit'
              )}
            </View>
          </View>

          {/* Bottle Size */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bottle Size</Text>
            {renderDropdownPicker(
              BOTTLE_SIZES,
              formData.bottleSize,
              (val) => setFormData({ ...formData, bottleSize: val }),
              showBottleSizePicker,
              setShowBottleSizePicker,
              'Select size'
            )}
          </View>

          {/* Ingredients */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ingredients / Mix</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g., Vodka, lime juice, soda, mint..."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={2}
              value={formData.ingredients || ''}
              onChangeText={(text) => setFormData({ ...formData, ingredients: text })}
            />
          </View>
        </View>
      )}

      {/* ========== BAKERY-SPECIFIC FIELDS ========== */}
      {isBakery && (
        <View style={[styles.typeSectionContainer, { borderColor: '#f59e0b30' }]}>
          <View style={[styles.typeSectionHeader, { backgroundColor: '#fef3c720' }]}>
            <Ionicons name="cafe-outline" size={18} color="#d97706" />
            <Text style={[styles.typeSectionTitle, { color: '#d97706' }]}>Bakery Details</Text>
          </View>

          {/* Unit + Weight Row */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Unit</Text>
              {renderDropdownPicker(
                BAKERY_UNITS,
                formData.unit,
                (val) => setFormData({ ...formData, unit: val }),
                showBakeryUnitPicker,
                setShowBakeryUnitPicker,
                'Select unit'
              )}
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.sm }]}>
              <Text style={styles.label}>Weight</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 250g"
                placeholderTextColor={Colors.textLight}
                value={formData.weight || ''}
                onChangeText={(text) => setFormData({ ...formData, weight: text })}
              />
            </View>
          </View>

          {/* Shelf Life */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Shelf Life (days)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 3"
              placeholderTextColor={Colors.textLight}
              keyboardType="number-pad"
              value={formData.shelfLife?.toString() || ''}
              onChangeText={(text) => setFormData({ ...formData, shelfLife: text })}
            />
          </View>

          {/* MFG Date + Expiry Date Row */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>MFG Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textLight}
                value={formData.mfgDate || ''}
                onChangeText={(text) => setFormData({ ...formData, mfgDate: text })}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.sm }]}>
              <Text style={styles.label}>Expiry Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textLight}
                value={formData.expiryDate || ''}
                onChangeText={(text) => setFormData({ ...formData, expiryDate: text })}
              />
            </View>
          </View>
        </View>
      )}

      {/* ========== ICE CREAM-SPECIFIC FIELDS ========== */}
      {isIceCream && (
        <View style={[styles.typeSectionContainer, { borderColor: '#06b6d430' }]}>
          <View style={[styles.typeSectionHeader, { backgroundColor: '#ecfeff20' }]}>
            <Ionicons name="ice-cream-outline" size={18} color="#0891b2" />
            <Text style={[styles.typeSectionTitle, { color: '#0891b2' }]}>Ice Cream Details</Text>
          </View>

          {/* Serving Size */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Serving Size</Text>
            {renderDropdownPicker(
              SERVING_SIZES,
              formData.servingSize,
              (val) => setFormData({ ...formData, servingSize: val }),
              showServingSizePicker,
              setShowServingSizePicker,
              'Select serving size'
            )}
          </View>

          {/* Max Scoops */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Max Scoops</Text>
            <View style={styles.spiceLevelContainer}>
              {[1, 2, 3, 4, 5].map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.spiceButton,
                    parseInt(formData.scoopOptions) === num && {
                      borderColor: '#0891b2',
                      backgroundColor: '#0891b215',
                    },
                  ]}
                  onPress={() => setFormData({ ...formData, scoopOptions: num.toString() })}
                >
                  <Text style={[
                    styles.scoopText,
                    parseInt(formData.scoopOptions) === num && { color: '#0891b2', fontWeight: '700' },
                  ]}>
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={styles.hintText}>
            Use "Toppings / Add-ons" above for sprinkles, nuts, sauces etc.
          </Text>
        </View>
      )}

      {/* ========== SOLD BY WEIGHT ========== */}
      <View style={[styles.soldByWeightContainer, formData.soldByWeight && styles.soldByWeightActive]}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          onPress={() => setFormData({ ...formData, soldByWeight: !formData.soldByWeight })}
          activeOpacity={0.7}
        >
          <Ionicons
            name={formData.soldByWeight ? 'checkbox' : 'square-outline'}
            size={20}
            color={formData.soldByWeight ? '#ca8a04' : Colors.textLight}
          />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: formData.soldByWeight ? '#854d0e' : Colors.textDark }}>
              Sold by Weight
            </Text>
            <Text style={{ fontSize: 11, color: formData.soldByWeight ? '#a16207' : Colors.textLight, marginTop: 2 }}>
              {formData.soldByWeight ? 'Price is calculated based on weight from the scale' : 'Enable for items priced per kg/lb (requires weighing scale)'}
            </Text>
          </View>
          {formData.soldByWeight && (
            <View style={{ backgroundColor: '#fef9c3', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#ca8a04' }}>Active</Text>
            </View>
          )}
        </TouchableOpacity>

        {formData.soldByWeight && (
          <View style={{ marginTop: 12, gap: 10 }}>
            {/* Price Unit */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151' }}>Price Unit:</Text>
              {renderDropdownPicker(
                PRICE_UNIT_OPTIONS.map(o => o.label),
                PRICE_UNIT_OPTIONS.find(o => o.value === (formData.priceUnit || 'per_kg'))?.label || 'per kg',
                (val) => {
                  const opt = PRICE_UNIT_OPTIONS.find(o => o.label === val);
                  setFormData({ ...formData, priceUnit: opt?.value || 'per_kg' });
                },
                showPriceUnitPicker,
                setShowPriceUnitPicker,
                'per kg'
              )}
            </View>

            {/* PLU Code */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', flexShrink: 0 }}>PLU Code:</Text>
              <TextInput
                style={[styles.input, { width: 90, fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center' }]}
                placeholder="0001"
                placeholderTextColor={Colors.textLight}
                keyboardType="number-pad"
                maxLength={5}
                value={formData.pluCode || ''}
                onChangeText={(text) => setFormData({ ...formData, pluCode: text.replace(/\D/g, '').slice(0, 5) })}
              />
              <Text style={{ fontSize: 10, color: '#6b7280', flex: 1 }}>
                Code programmed in your weighing scale
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Images Section */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Images (Max 4)</Text>
        <View style={styles.imagesContainer}>
          {/* Existing Images */}
          {formData.images?.map((img, index) => (
            <View key={index} style={styles.imageWrapper}>
              <Image
                source={{ uri: img.url || img.uri }}
                style={styles.imageThumb}
              />
              <TouchableOpacity
                style={styles.imageRemove}
                onPress={() => onImageDelete && onImageDelete(index)}
              >
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add Image Buttons */}
          {(formData.images?.length || 0) < 4 && (
            <View style={styles.imageActions}>
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={handlePickImage}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="images-outline" size={24} color={Colors.primary} />
                    <Text style={styles.addImageText}>Gallery</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={handleTakePhoto}
                disabled={uploadingImage}
              >
                <Ionicons name="camera-outline" size={24} color={Colors.primary} />
                <Text style={styles.addImageText}>Camera</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Hide Image Toggle — only when editing and owner/admin */}
      {isEditing && isOwnerOrAdmin && (
        <View style={[styles.hideImageContainer, formData.hideImage && styles.hideImageActive]}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            onPress={() => setFormData({ ...formData, hideImage: !formData.hideImage })}
            activeOpacity={0.7}
          >
            <Ionicons
              name={formData.hideImage ? 'checkbox' : 'square-outline'}
              size={20}
              color={formData.hideImage ? '#ef4444' : Colors.textLight}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: formData.hideImage ? '#991b1b' : Colors.textDark }}>
                Hide image for this item
              </Text>
              <Text style={{ fontSize: 11, color: formData.hideImage ? '#b91c1c' : Colors.textLight, marginTop: 2 }}>
                Image will not be shown on POS menu across all devices
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Stock Suggestion Banner */}
      {!formData.isStockManaged && (() => {
        const suggestion = getStockSuggestion(formData.name);
        if (!suggestion) return null;
        return (
          <View style={{
            backgroundColor: '#eff6ff',
            borderRadius: 10,
            padding: 12,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: '#bfdbfe',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}>
            <Ionicons name="bulb-outline" size={20} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '600' }}>
                This looks like a {suggestion.label}
              </Text>
              <Text style={{ fontSize: 11, color: '#3b82f6', marginTop: 2 }}>
                Enable stock tracking to manage inventory
              </Text>
            </View>
            <TouchableOpacity
              style={{
                backgroundColor: '#2563eb',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
              }}
              onPress={() => setFormData({
                ...formData,
                isStockManaged: true,
                stockUnit: suggestion.unit,
                deductionQuantity: 1,
                stockQuantity: formData.stockQuantity || '',
              })}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Enable</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Stock Management */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Stock Management</Text>
        <TouchableOpacity
          style={[
            styles.statusButton,
            { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14 },
            formData.isStockManaged && { backgroundColor: '#059669', borderColor: '#059669' },
          ]}
          onPress={() => setFormData({ ...formData, isStockManaged: !formData.isStockManaged, ...(!formData.isStockManaged ? { stockQuantity: formData.stockQuantity || '', stockUnit: formData.stockUnit || 'pcs' } : {}) })}
        >
          <Ionicons name={formData.isStockManaged ? 'checkbox' : 'square-outline'} size={18} color={formData.isStockManaged ? '#fff' : Colors.textLight} />
          <Text style={[styles.statusText, formData.isStockManaged && { color: '#fff' }]}>Track Stock</Text>
        </TouchableOpacity>
        {formData.isStockManaged && (
          <>
            <View style={[styles.row, { marginTop: 10 }]}>
              <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.label, { fontSize: 12 }]}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={String(formData.stockQuantity ?? '')}
                  onChangeText={(text) => setFormData({ ...formData, stockQuantity: text ? parseInt(text) || 0 : '' })}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.xs, marginBottom: 0 }]}>
                <Text style={[styles.label, { fontSize: 12 }]}>Unit</Text>
                {renderDropdownPicker(
                  STOCK_UNITS,
                  formData.stockUnit || 'pcs',
                  (val) => setFormData({ ...formData, stockUnit: val }),
                  showStockUnitPicker,
                  setShowStockUnitPicker,
                  'pcs'
                )}
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: Spacing.xs, marginBottom: 0 }]}>
                <Text style={[styles.label, { fontSize: 12 }]}>Low Alert</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={String(formData.lowStockThreshold ?? '')}
                  onChangeText={(text) => setFormData({ ...formData, lowStockThreshold: text ? parseInt(text) || 0 : '' })}
                />
              </View>
            </View>
            <View style={[styles.row, { marginTop: 10 }]}>
              <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                <Text style={[styles.label, { fontSize: 12 }]}>Deduct per sale</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  value={String(formData.deductionQuantity ?? 1)}
                  onChangeText={(text) => setFormData({ ...formData, deductionQuantity: text ? parseInt(text) || 1 : 1 })}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2, marginLeft: Spacing.sm, marginBottom: 0, justifyContent: 'flex-end' }]}>
                <Text style={{ fontSize: 11, color: Colors.textLight, marginTop: 4 }}>
                  Each sale deducts {formData.deductionQuantity || 1} {formData.stockUnit || 'pcs'} from stock
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Generate Smart Recipe — only for new items, not bar */}
      {!isEditing && businessType !== 'bar' && (
        <View style={styles.inputGroup}>
          <TouchableOpacity
            style={[
              styles.statusButton,
              { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14 },
              formData.generateRecipe && { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
            ]}
            onPress={() => setFormData({ ...formData, generateRecipe: !formData.generateRecipe })}
          >
            <Ionicons name={formData.generateRecipe ? 'checkbox' : 'square-outline'} size={18} color={formData.generateRecipe ? '#fff' : Colors.textLight} />
            <Text style={[styles.statusText, formData.generateRecipe && { color: '#fff' }]}>Generate Smart Recipe</Text>
          </TouchableOpacity>
          <Text style={[styles.hintText, { marginTop: 4 }]}>Auto-create recipe with ingredients list using AI</Text>
        </View>
      )}

      {/* Status */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Status</Text>
        <View style={styles.statusContainer}>
          <TouchableOpacity
            style={[
              styles.statusButton,
              formData.status === 'active' && styles.statusButtonActive,
            ]}
            onPress={() => setFormData({ ...formData, status: 'active' })}
          >
            <Text
              style={[
                styles.statusText,
                formData.status === 'active' && styles.statusTextSelected,
              ]}
            >
              Active
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.statusButton,
              formData.status === 'inactive' && styles.statusButtonInactive,
            ]}
            onPress={() => setFormData({ ...formData, status: 'inactive' })}
          >
            <Text
              style={[
                styles.statusText,
                formData.status === 'inactive' && styles.statusTextSelected,
              ]}
            >
              Inactive
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom padding for scroll */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    padding: Spacing.lg,
  },
  pricingRulesSection: {
    marginBottom: Spacing.md,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: Spacing.sm,
  },
  pricingRulesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 2,
  },
  pricingRulesHint: {
    fontSize: 11,
    color: Colors.textMedium,
    marginBottom: 8,
  },
  pricingRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pricingChannelName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  pricingRuleInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.textDark,
    width: 90,
    textAlign: 'center',
  },
  pricingRuleInputActive: {
    borderColor: '#10b981',
    borderWidth: 1.5,
    backgroundColor: '#f0fdf4',
    color: '#166534',
    fontWeight: '600',
  },
  zoneTreeContainer: {
    marginLeft: 24,
    borderLeftWidth: 2,
    borderLeftColor: '#e2e8f0',
    paddingLeft: 12,
    marginBottom: 4,
  },
  zoneRuleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  zoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  zoneRuleName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    flex: 1,
  },
  zoneRuleInput: {
    width: 80,
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  zoneRuleInputInherited: {
    borderColor: '#d1d5db',
    backgroundColor: '#fafafa',
    fontStyle: 'italic',
  },
  inheritedLabel: {
    fontSize: 9,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    backgroundColor: Colors.backgroundLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
  },
  pickerPlaceholder: {
    fontSize: Typography.body.fontSize,
    color: Colors.textLight,
  },
  categoryDropdown: {
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
  },
  categoryInput: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.small,
    padding: Spacing.sm,
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.xs,
  },
  categoryList: {
    maxHeight: 120,
  },
  categoryOption: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  categoryOptionText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textDark,
  },
  categoryDone: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.small,
  },
  categoryDoneText: {
    color: '#fff',
    fontWeight: '600',
  },
  foodTypeContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  foodTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: Spacing.sm,
  },
  foodTypeButtonVeg: {
    borderColor: Colors.accentGreen,
    backgroundColor: Colors.accentGreen + '15',
  },
  foodTypeButtonNonVeg: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  vegIndicator: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderRadius: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  foodTypeText: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  foodTypeTextSelected: {
    color: Colors.textDark,
  },
  spiceLevelContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  spiceButton: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  spiceButtonSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + '15',
  },
  spiceText: {
    fontSize: 16,
  },
  spiceTextSelected: {
    // No change needed for emoji
  },
  scoopText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  // Variant / Customization rows
  variantCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 8,
    marginBottom: Spacing.sm,
  },
  variantDescInput: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 12,
    minHeight: 0,
  },
  // Sold by weight
  soldByWeightContainer: {
    marginBottom: Spacing.md,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  soldByWeightActive: {
    backgroundColor: '#fefce8',
    borderColor: '#fde047',
  },
  // Hide image
  hideImageContainer: {
    marginBottom: Spacing.md,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  hideImageActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  addRowButton: {
    padding: 2,
  },
  hintText: {
    fontSize: 11,
    color: Colors.textLight,
    marginBottom: Spacing.sm,
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  templateButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  templateButtonText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  variantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  removeRowButton: {
    padding: 4,
  },
  // Type-specific section
  typeSectionContainer: {
    borderWidth: 1,
    borderColor: '#7c3aed30',
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundWhite,
  },
  typeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: '#f5f3ff20',
    marginHorizontal: -Spacing.md,
    marginTop: -Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    borderTopLeftRadius: BorderRadius.medium,
    borderTopRightRadius: BorderRadius.medium,
  },
  typeSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#7c3aed',
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  imageWrapper: {
    position: 'relative',
  },
  imageThumb: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
  },
  imageRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Colors.backgroundWhite,
    borderRadius: 11,
  },
  imageActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addImageButton: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.medium,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.backgroundLight,
  },
  addImageText: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statusButtonActive: {
    borderColor: Colors.accentGreen,
    backgroundColor: Colors.accentGreen + '15',
  },
  statusButtonInactive: {
    borderColor: Colors.textLight,
    backgroundColor: Colors.textLight + '15',
  },
  statusText: {
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  statusTextSelected: {
    color: Colors.textDark,
  },
});
