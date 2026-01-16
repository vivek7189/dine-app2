import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';

export default function MenuItemForm({ formData, setFormData, onSubmit, onCancel, isEditing }) {
  return (
    <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="Item name"
          placeholderTextColor={Colors.textLight}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Item description"
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={3}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Price (₹) *</Text>
        <TextInput
          style={styles.input}
          placeholder="0.00"
          placeholderTextColor={Colors.textLight}
          keyboardType="decimal-pad"
          value={formData.price}
          onChangeText={(text) => setFormData({ ...formData, price: text })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Category *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Main Course, Appetizer"
          placeholderTextColor={Colors.textLight}
          value={formData.category}
          onChangeText={(text) => setFormData({ ...formData, category: text })}
        />
      </View>

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
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.switchContainer}>
          <Text style={styles.label}>Vegetarian</Text>
          <Switch
            value={formData.isVeg}
            onValueChange={(value) => setFormData({ ...formData, isVeg: value })}
            trackColor={{ false: Colors.borderMedium, true: Colors.accentGreen }}
            thumbColor={formData.isVeg ? '#fff' : '#f4f3f4'}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Status</Text>
        <View style={styles.statusContainer}>
          {['active', 'inactive'].map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusButton,
                formData.status === status && styles.statusButtonSelected,
              ]}
              onPress={() => setFormData({ ...formData, status })}
            >
              <Text
                style={[
                  styles.statusText,
                  formData.status === status && styles.statusTextSelected,
                ]}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: Spacing.lg,
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
  },
  spiceButtonSelected: {
    backgroundColor: Colors.primary,
  },
  spiceText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  spiceTextSelected: {
    color: '#fff',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusButton: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.backgroundLight,
    alignItems: 'center',
  },
  statusButtonSelected: {
    backgroundColor: Colors.accentGreen,
  },
  statusText: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  statusTextSelected: {
    color: '#fff',
  },
});
