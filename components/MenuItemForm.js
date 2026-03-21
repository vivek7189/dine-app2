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

// Picker options per business type
const SPIRIT_CATEGORIES = ['Whiskey', 'Vodka', 'Rum', 'Gin', 'Beer', 'Wine', 'Cocktail', 'Mocktail', 'Shots', 'Mixer', 'Bar Snack'];
const SERVING_UNITS = ['ml', 'peg', 'glass', 'bottle', 'pint', 'can'];
const BOTTLE_SIZES = ['30ml', '60ml', '90ml', '180ml', '375ml', '500ml', '750ml', '1L'];
const BAKERY_UNITS = ['piece', 'kg', 'gram', 'dozen', 'box', 'slice', 'pack'];
const SERVING_SIZES = ['scoop', 'cup', 'cone', 'sundae', 'shake', 'tub', 'stick'];

export default function MenuItemForm({
  formData,
  setFormData,
  isEditing,
  categories = [],
  onImageUpload,
  onImageDelete,
  uploadingImage = false,
  businessType = 'restaurant',
}) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showSpiritPicker, setShowSpiritPicker] = useState(false);
  const [showServingUnitPicker, setShowServingUnitPicker] = useState(false);
  const [showBottleSizePicker, setShowBottleSizePicker] = useState(false);
  const [showBakeryUnitPicker, setShowBakeryUnitPicker] = useState(false);
  const [showServingSizePicker, setShowServingSizePicker] = useState(false);

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
    const variants = [...(formData.variants || []), { name: '', price: '' }];
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
    const customizations = [...(formData.customizations || []), { name: '', price: '' }];
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
          <View key={index} style={styles.variantRow}>
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
          <View key={index} style={styles.variantRow}>
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
