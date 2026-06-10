import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrencySymbol } from '../utils/formatCurrency';

const RED = '#ef4444';
const GRAY_50 = '#f9fafb';
const GRAY_100 = '#f3f4f6';
const GRAY_200 = '#e5e7eb';
const GRAY_300 = '#d1d5db';
const GRAY_500 = '#6b7280';
const GRAY_700 = '#374151';
const GRAY_900 = '#1f2937';
const ORANGE_50 = '#fff7ed';
const ORANGE_200 = '#fed7aa';

const ItemCustomizationModal = ({
  item,
  isOpen,
  onClose,
  onAddToCart,
}) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedCustomizations, setSelectedCustomizations] = useState([]);
  const [quantity, setQuantity] = useState(1);

  const hasVariants = item?.variants && Array.isArray(item.variants) && item.variants.length > 0;
  const hasCustomizations = item?.customizations && Array.isArray(item.customizations) && item.customizations.length > 0;

  useEffect(() => {
    if (!isOpen || !item) {
      setSelectedVariant(null);
      setSelectedCustomizations([]);
      setQuantity(1);
      return;
    }
    // Auto-select variant if only one exists
    if (item.variants && Array.isArray(item.variants) && item.variants.length === 1) {
      setSelectedVariant(item.variants[0]);
    } else {
      setSelectedVariant(null);
    }
  }, [isOpen, item]);

  if (!item) return null;

  const isVeg = item.isVeg !== false;

  const getBasePrice = () => {
    if (hasVariants && selectedVariant) {
      return selectedVariant.price;
    }
    return item.price || 0;
  };

  const getCustomizationPrice = () => {
    return selectedCustomizations.reduce((total, c) => total + (c.price || 0), 0);
  };

  const getTotalPrice = () => {
    return (getBasePrice() + getCustomizationPrice()) * quantity;
  };

  const handleCustomizationToggle = (customization) => {
    setSelectedCustomizations(prev => {
      const exists = prev.find(c => (c.id || c.name) === (customization.id || customization.name));
      if (exists) {
        return prev.filter(c => (c.id || c.name) !== (customization.id || customization.name));
      }
      return [...prev, customization];
    });
  };

  const handleAddToCart = () => {
    if (hasVariants && !selectedVariant) return;

    const cartItem = {
      ...item,
      cartId: `${item.id}-${Date.now()}`,
      selectedVariant: selectedVariant ? {
        name: selectedVariant.name,
        price: selectedVariant.price,
      } : null,
      selectedCustomizations: selectedCustomizations.map(c => ({
        id: c.id || null,
        name: c.name,
        price: c.price || 0,
      })),
      basePrice: getBasePrice(),
      customizationPrice: getCustomizationPrice(),
      finalPrice: getBasePrice() + getCustomizationPrice(),
      quantity,
    };

    onAddToCart(cartItem);
    setSelectedVariant(null);
    setSelectedCustomizations([]);
    setQuantity(1);
    onClose();
  };

  const canAdd = !hasVariants || !!selectedVariant;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.vegBadge, { backgroundColor: isVeg ? '#22c55e' : RED }]}>
                <Ionicons name={isVeg ? 'leaf' : 'flame'} size={12} color="#fff" />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.itemDescription} numberOfLines={2}>{item.description}</Text>
                ) : null}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={GRAY_500} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Variants */}
            {hasVariants && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Select Size/Portion <Text style={{ color: RED }}>*</Text>
                </Text>
                {item.variants.map((variant, index) => {
                  const isSelected = selectedVariant?.name === variant.name;
                  return (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedVariant(variant)}
                      style={[
                        styles.optionBtn,
                        isSelected && styles.optionBtnSelected,
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.radio, isSelected && styles.radioSelected]}>
                          {isSelected && <View style={styles.radioInner} />}
                        </View>
                        <View>
                          <Text style={styles.optionName}>{variant.name}</Text>
                          {variant.description ? (
                            <Text style={styles.optionDesc}>{variant.description}</Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={[styles.optionPrice, isSelected && { color: RED }]}>
                        {getCurrencySymbol()}{variant.price}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Customizations */}
            {hasCustomizations && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Add Toppings/Extras</Text>
                {item.customizations.map((customization, index) => {
                  const isSelected = selectedCustomizations.some(
                    c => (c.id || c.name) === (customization.id || customization.name)
                  );
                  return (
                    <TouchableOpacity
                      key={customization.id || index}
                      onPress={() => handleCustomizationToggle(customization)}
                      style={[
                        styles.optionBtn,
                        isSelected && styles.optionBtnSelected,
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={styles.optionLeft}>
                        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                          {isSelected && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </View>
                        <View>
                          <Text style={styles.optionName}>{customization.name}</Text>
                          {customization.description ? (
                            <Text style={styles.optionDesc}>{customization.description}</Text>
                          ) : null}
                        </View>
                      </View>
                      {customization.price > 0 && (
                        <Text style={[styles.optionPrice, isSelected && { color: RED }]}>
                          +{getCurrencySymbol()}{customization.price}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Quantity */}
            <View style={styles.quantityRow}>
              <Text style={styles.quantityLabel}>Quantity</Text>
              <View style={styles.quantityControls}>
                <TouchableOpacity
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  style={[styles.qtyBtn, quantity <= 1 && styles.qtyBtnDisabled]}
                  disabled={quantity <= 1}
                >
                  <Ionicons name="remove" size={16} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.qtyValue}>{quantity}</Text>
                <TouchableOpacity
                  onPress={() => setQuantity(quantity + 1)}
                  style={styles.qtyBtn}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Price Summary */}
            <View style={styles.priceSummary}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Base Price</Text>
                <Text style={styles.priceValue}>{getCurrencySymbol()}{getBasePrice()}</Text>
              </View>
              {selectedCustomizations.length > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Toppings/Extras ({selectedCustomizations.length})</Text>
                  <Text style={styles.priceValue}>+{getCurrencySymbol()}{getCustomizationPrice()}</Text>
                </View>
              )}
              {quantity > 1 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Quantity</Text>
                  <Text style={styles.priceValue}>× {quantity}</Text>
                </View>
              )}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{getCurrencySymbol()}{getTotalPrice()}</Text>
              </View>
            </View>
          </ScrollView>

          {/* Add to Cart Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleAddToCart}
              disabled={!canAdd}
              style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add to Cart — {getCurrencySymbol()}{getTotalPrice()}</Text>
            </TouchableOpacity>
            {hasVariants && !selectedVariant && (
              <Text style={styles.validationText}>Please select a size/portion</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_200,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  vegBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemName: {
    fontSize: 20,
    fontWeight: '700',
    color: GRAY_900,
  },
  itemDescription: {
    fontSize: 14,
    color: GRAY_500,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GRAY_100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: GRAY_900,
    marginBottom: 12,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: GRAY_50,
    borderWidth: 2,
    borderColor: GRAY_200,
    borderRadius: 12,
    marginBottom: 8,
  },
  optionBtnSelected: {
    backgroundColor: '#fef2f2',
    borderColor: RED,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GRAY_300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: RED,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RED,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: GRAY_300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: RED,
    borderColor: RED,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600',
    color: GRAY_900,
  },
  optionDesc: {
    fontSize: 13,
    color: GRAY_500,
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: GRAY_900,
    marginLeft: 8,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: GRAY_50,
    borderRadius: 12,
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: GRAY_700,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnDisabled: {
    backgroundColor: GRAY_300,
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: GRAY_900,
    minWidth: 30,
    textAlign: 'center',
  },
  priceSummary: {
    padding: 16,
    backgroundColor: ORANGE_50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ORANGE_200,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: GRAY_500,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: GRAY_900,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: ORANGE_200,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: GRAY_900,
  },
  totalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: RED,
  },
  footer: {
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: GRAY_200,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: RED,
    paddingVertical: 16,
    borderRadius: 12,
  },
  addBtnDisabled: {
    backgroundColor: GRAY_300,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  validationText: {
    fontSize: 12,
    color: RED,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default ItemCustomizationModal;
