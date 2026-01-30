import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';

export default function MenuItemForm({
  formData,
  setFormData,
  isEditing,
  categories = [],
  onImageUpload,
  onImageDelete,
  uploadingImage = false,
}) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

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

      {/* Spice Level */}
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
      <View style={{ height: 20 }} />
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
