import React, { useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/Theme';
import { CATEGORY_OPTIONS, UNIT_OPTIONS } from './useInventoryData';

// ── Shared Modal Wrapper ─────────────────────────────
const ModalWrapper = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} animationType="slide" transparent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={Colors.textDark} />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

const Label = ({ text }) => <Text style={styles.label}>{text}</Text>;
const Input = ({ value, onChangeText, placeholder, keyboardType, multiline, numberOfLines }) => (
  <TextInput
    style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={Colors.textLight}
    keyboardType={keyboardType}
    multiline={multiline}
    numberOfLines={numberOfLines}
  />
);

// ── 1. Add/Edit Inventory Item ───────────────────────
export function AddEditItemModal({
  visible, onClose, editingItem, itemFormData, setItemFormData,
  onSave, onUpdate, saving, suppliers,
}) {
  const isEdit = !!editingItem;
  const form = itemFormData;
  const set = (key, val) => setItemFormData(prev => ({ ...prev, [key]: val }));

  return (
    <ModalWrapper visible={visible} onClose={onClose} title={isEdit ? 'Edit Item' : 'Add Item'}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        <Label text="Name *" />
        <Input value={form.name} onChangeText={v => set('name', v)} placeholder="Item name" />

        <Label text="Category" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {CATEGORY_OPTIONS.map(cat => (
            <TouchableOpacity key={cat} style={[styles.chip, form.category === cat && styles.chipActive]} onPress={() => set('category', cat)}>
              <Text style={[styles.chipText, form.category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Label text="Unit" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {UNIT_OPTIONS.map(u => (
            <TouchableOpacity key={u} style={[styles.chip, form.unit === u && styles.chipActive]} onPress={() => set('unit', u)}>
              <Text style={[styles.chipText, form.unit === u && styles.chipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.row}>
          <View style={styles.halfCol}><Label text="Current Stock" /><Input value={form.currentStock} onChangeText={v => set('currentStock', v)} placeholder="0" keyboardType="numeric" /></View>
          <View style={styles.halfCol}><Label text="Min Stock" /><Input value={form.minStock} onChangeText={v => set('minStock', v)} placeholder="0" keyboardType="numeric" /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.halfCol}><Label text="Max Stock" /><Input value={form.maxStock} onChangeText={v => set('maxStock', v)} placeholder="0" keyboardType="numeric" /></View>
          <View style={styles.halfCol}><Label text="Cost/Unit" /><Input value={form.costPerUnit} onChangeText={v => set('costPerUnit', v)} placeholder="0" keyboardType="numeric" /></View>
        </View>

        <Label text="Supplier" />
        {suppliers?.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, !form.supplier && styles.chipActive]} onPress={() => set('supplier', '')}>
              <Text style={[styles.chipText, !form.supplier && styles.chipTextActive]}>None</Text>
            </TouchableOpacity>
            {suppliers.map(s => (
              <TouchableOpacity key={s._id || s.id} style={[styles.chip, form.supplier === s.name && styles.chipActive]} onPress={() => set('supplier', s.name)}>
                <Text style={[styles.chipText, form.supplier === s.name && styles.chipTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Input value={form.supplier} onChangeText={v => set('supplier', v)} placeholder="Supplier name" />
        )}

        <Label text="Barcode" />
        <Input value={form.barcode} onChangeText={v => set('barcode', v)} placeholder="Barcode / SKU" />

        <Label text="Expiry Date" />
        <Input value={form.expiryDate} onChangeText={v => set('expiryDate', v)} placeholder="YYYY-MM-DD" />

        <Label text="Location" />
        <Input value={form.location} onChangeText={v => set('location', v)} placeholder="Storage location" />

        <Label text="Description" />
        <Input value={form.description} onChangeText={v => set('description', v)} placeholder="Description" multiline numberOfLines={3} />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={isEdit ? onUpdate : onSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={styles.saveBtnText}>{isEdit ? 'Update Item' : 'Add Item'}</Text>
          )}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── 2. Add Supplier ──────────────────────────────────
export function AddSupplierModal({
  visible, onClose, supplierFormData, setSupplierFormData, onSave, saving,
}) {
  const form = supplierFormData;
  const set = (key, val) => setSupplierFormData(prev => ({ ...prev, [key]: val }));
  const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'COD', 'Advance'];

  return (
    <ModalWrapper visible={visible} onClose={onClose} title="Add Supplier">
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        <Label text="Name *" />
        <Input value={form.name} onChangeText={v => set('name', v)} placeholder="Supplier name" />

        <Label text="Contact Person *" />
        <Input value={form.contact} onChangeText={v => set('contact', v)} placeholder="Contact person" />

        <Label text="Phone" />
        <Input value={form.phone} onChangeText={v => set('phone', v)} placeholder="Phone number" keyboardType="phone-pad" />

        <Label text="Email" />
        <Input value={form.email} onChangeText={v => set('email', v)} placeholder="Email address" />

        <Label text="Address" />
        <Input value={form.address} onChangeText={v => set('address', v)} placeholder="Address" multiline numberOfLines={2} />

        <Label text="Payment Terms" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {PAYMENT_TERMS.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, form.paymentTerms === t && styles.chipActive]} onPress={() => set('paymentTerms', t)}>
              <Text style={[styles.chipText, form.paymentTerms === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Label text="Notes" />
        <Input value={form.notes} onChangeText={v => set('notes', v)} placeholder="Notes" multiline numberOfLines={2} />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Add Supplier</Text>}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── 3. Add/Edit Recipe ───────────────────────────────
export function AddEditRecipeModal({
  visible, onClose, isEdit, recipeFormData, setRecipeFormData,
  inventoryItems, onSave, onUpdate, saving,
  addIngredient, removeIngredient, updateIngredient,
  addInstruction, removeInstruction, updateInstruction,
  onGenerateSteps, generatingSteps,
}) {
  const form = recipeFormData;
  const set = (key, val) => setRecipeFormData(prev => ({ ...prev, [key]: val }));
  const [ingredientSearch, setIngredientSearch] = useState('');

  const filteredItems = ingredientSearch
    ? inventoryItems.filter(i => i.name?.toLowerCase().includes(ingredientSearch.toLowerCase())).slice(0, 5)
    : [];

  return (
    <ModalWrapper visible={visible} onClose={onClose} title={isEdit ? 'Edit Recipe' : 'Add Recipe'}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        <Label text="Name *" />
        <Input value={form.name} onChangeText={v => set('name', v)} placeholder="Recipe name" />

        <Label text="Description" />
        <Input value={form.description} onChangeText={v => set('description', v)} placeholder="Brief description" multiline numberOfLines={2} />

        <Label text="Category" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {['Main Course', 'Appetizer', 'Dessert', 'Beverage', 'Salad', 'Soup', 'Bread', 'Sauce', 'Side Dish'].map(cat => (
            <TouchableOpacity key={cat} style={[styles.chip, form.category === cat && styles.chipActive]} onPress={() => set('category', cat)}>
              <Text style={[styles.chipText, form.category === cat && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.row}>
          <View style={styles.thirdCol}><Label text="Servings" /><Input value={String(form.servings)} onChangeText={v => set('servings', Number(v) || 0)} placeholder="1" keyboardType="numeric" /></View>
          <View style={styles.thirdCol}><Label text="Prep (min)" /><Input value={String(form.prepTime)} onChangeText={v => set('prepTime', Number(v) || 0)} placeholder="0" keyboardType="numeric" /></View>
          <View style={styles.thirdCol}><Label text="Cook (min)" /><Input value={String(form.cookTime)} onChangeText={v => set('cookTime', Number(v) || 0)} placeholder="0" keyboardType="numeric" /></View>
        </View>

        {/* Ingredients */}
        <View style={styles.sectionRow}>
          <Label text="Ingredients *" />
          <TouchableOpacity onPress={addIngredient}>
            <Text style={styles.addLink}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {form.ingredients.map((ing, idx) => (
          <View key={idx} style={styles.ingredientRow}>
            <View style={{ flex: 2 }}>
              <TextInput
                style={styles.input}
                placeholder="Search ingredient..."
                placeholderTextColor={Colors.textLight}
                value={ing.inventoryItemName || ''}
                onChangeText={v => {
                  updateIngredient(idx, 'inventoryItemName', v);
                  setIngredientSearch(v);
                }}
              />
              {ingredientSearch && ing.inventoryItemName === ingredientSearch && filteredItems.length > 0 && (
                <View style={styles.dropdown}>
                  {filteredItems.map(item => (
                    <TouchableOpacity
                      key={item._id || item.id}
                      style={styles.dropdownItem}
                      onPress={() => {
                        updateIngredient(idx, 'inventoryItemId', item._id || item.id);
                        updateIngredient(idx, 'inventoryItemName', item.name);
                        updateIngredient(idx, 'unit', item.unit || '');
                        setIngredientSearch('');
                      }}
                    >
                      <Text style={styles.dropdownText}>{item.name}</Text>
                      <Text style={styles.dropdownSub}>{item.unit}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={{ width: 60 }}>
              <TextInput
                style={styles.input}
                placeholder="Qty"
                placeholderTextColor={Colors.textLight}
                value={String(ing.quantity)}
                onChangeText={v => updateIngredient(idx, 'quantity', Number(v) || 0)}
                keyboardType="numeric"
              />
            </View>
            <Text style={styles.unitLabel}>{ing.unit || ''}</Text>
            {form.ingredients.length > 1 && (
              <TouchableOpacity onPress={() => removeIngredient(idx)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        {/* Instructions */}
        <View style={styles.sectionRow}>
          <Label text="Instructions" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onGenerateSteps} disabled={generatingSteps}>
              <Text style={[styles.addLink, { color: '#8b5cf6' }]}>
                {generatingSteps ? 'Generating...' : 'AI Generate'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={addInstruction}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>
        {form.instructions.map((step, idx) => (
          <View key={idx} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{idx + 1}</Text>
            </View>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder={`Step ${idx + 1}`}
              placeholderTextColor={Colors.textLight}
              value={step}
              onChangeText={v => updateInstruction(idx, v)}
              multiline
            />
            {form.instructions.length > 1 && (
              <TouchableOpacity onPress={() => removeInstruction(idx)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}

        <Label text="Notes" />
        <Input value={form.notes} onChangeText={v => set('notes', v)} placeholder="Additional notes" multiline numberOfLines={2} />

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={isEdit ? onUpdate : onSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text style={styles.saveBtnText}>{isEdit ? 'Update Recipe' : 'Add Recipe'}</Text>
          )}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── 4. View Recipe ───────────────────────────────────
export function ViewRecipeModal({ visible, onClose, recipe, inventoryItems, getIngredientCost, getCostPerServing }) {
  if (!recipe) return null;
  const totalCost = (recipe.ingredients || []).reduce((sum, ing) => sum + getIngredientCost(ing), 0);
  const costPerServing = getCostPerServing(recipe);

  return (
    <ModalWrapper visible={visible} onClose={onClose} title={recipe.name}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        {recipe.description && <Text style={styles.viewDesc}>{recipe.description}</Text>}

        <View style={styles.viewStats}>
          {recipe.category && <View style={styles.viewStatItem}><Ionicons name="pricetag" size={14} color="#8b5cf6" /><Text style={styles.viewStatText}>{recipe.category}</Text></View>}
          {recipe.servings > 0 && <View style={styles.viewStatItem}><Ionicons name="people" size={14} color="#3b82f6" /><Text style={styles.viewStatText}>{recipe.servings} servings</Text></View>}
          {recipe.prepTime > 0 && <View style={styles.viewStatItem}><Ionicons name="timer" size={14} color="#f59e0b" /><Text style={styles.viewStatText}>{recipe.prepTime}m prep</Text></View>}
          {recipe.cookTime > 0 && <View style={styles.viewStatItem}><Ionicons name="flame" size={14} color="#ef4444" /><Text style={styles.viewStatText}>{recipe.cookTime}m cook</Text></View>}
        </View>

        <Label text="Ingredients" />
        {(recipe.ingredients || []).map((ing, idx) => {
          const cost = getIngredientCost(ing);
          return (
            <View key={idx} style={styles.viewIngRow}>
              <Text style={styles.viewIngName}>{ing.inventoryItemName || ing.name || 'Item'}</Text>
              <Text style={styles.viewIngQty}>{ing.quantity} {ing.unit}</Text>
              {cost > 0 && <Text style={styles.viewIngCost}>{'\u20B9'}{cost.toFixed(2)}</Text>}
            </View>
          );
        })}

        {totalCost > 0 && (
          <View style={styles.costSummary}>
            <View style={styles.costLine}><Text style={styles.costLabel}>Total Cost</Text><Text style={styles.costVal}>{'\u20B9'}{totalCost.toFixed(2)}</Text></View>
            {costPerServing > 0 && <View style={styles.costLine}><Text style={styles.costLabel}>Per Serving</Text><Text style={[styles.costVal, { color: '#10b981' }]}>{'\u20B9'}{costPerServing.toFixed(2)}</Text></View>}
          </View>
        )}

        {(recipe.instructions || []).length > 0 && (
          <>
            <Label text="Instructions" />
            {(Array.isArray(recipe.instructions) ? recipe.instructions : [recipe.instructions]).map((step, idx) => (
              <View key={idx} style={styles.viewStepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{idx + 1}</Text></View>
                <Text style={styles.viewStepText}>{step}</Text>
              </View>
            ))}
          </>
        )}

        {recipe.notes && (
          <>
            <Label text="Notes" />
            <Text style={styles.viewNotes}>{recipe.notes}</Text>
          </>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── 5. Quick Stock Adjustment ────────────────────────
export function QuickStockModal({
  visible, onClose, inventoryItems, quickStockAdjustments, setQuickStockAdjustments,
  onSave, saving,
}) {
  const [search, setSearch] = useState('');
  const filtered = inventoryItems.filter(i =>
    !search || i.name?.toLowerCase().includes(search.toLowerCase())
  );

  const getAdj = (id) => quickStockAdjustments[id] || 0;
  const setAdj = (id, val) => setQuickStockAdjustments(prev => ({ ...prev, [id]: val }));

  const totalChanges = Object.values(quickStockAdjustments).filter(v => v !== 0).length;

  return (
    <ModalWrapper visible={visible} onClose={onClose} title="Quick Stock Update">
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search items..."
          placeholderTextColor={Colors.textLight}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item._id || item.id}
        renderItem={({ item }) => {
          const id = item._id || item.id;
          const adj = getAdj(id);
          const newStock = Math.max(0, (Number(item.currentStock) || 0) + adj);
          return (
            <View style={styles.qsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.qsName}>{item.name}</Text>
                <Text style={styles.qsSub}>Current: {item.currentStock || 0} {item.unit}{adj !== 0 ? ` → ${newStock}` : ''}</Text>
              </View>
              <View style={styles.qsControls}>
                <TouchableOpacity style={styles.qsBtn} onPress={() => setAdj(id, adj - 1)}>
                  <Ionicons name="remove" size={18} color="#ef4444" />
                </TouchableOpacity>
                <Text style={[styles.qsAdj, adj !== 0 && { color: adj > 0 ? '#10b981' : '#ef4444', fontWeight: '800' }]}>
                  {adj > 0 ? `+${adj}` : adj}
                </Text>
                <TouchableOpacity style={styles.qsBtn} onPress={() => setAdj(id, adj + 1)}>
                  <Ionicons name="add" size={18} color="#10b981" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <TouchableOpacity
        style={[styles.saveBtn, (saving || totalChanges === 0) && { opacity: 0.5 }]}
        onPress={onSave}
        disabled={saving || totalChanges === 0}
      >
        {saving ? <ActivityIndicator color="#fff" size="small" /> : (
          <Text style={styles.saveBtnText}>Save {totalChanges} Change{totalChanges !== 1 ? 's' : ''}</Text>
        )}
      </TouchableOpacity>
    </ModalWrapper>
  );
}

// ── 6. Add Purchase Order ────────────────────────────
export function AddPurchaseOrderModal({
  visible, onClose, poFormData, setPOFormData,
  suppliers, inventoryItems,
  addPOItem, removePOItem, updatePOItem,
  onSave, saving,
}) {
  const form = poFormData;
  const set = (key, val) => setPOFormData(prev => ({ ...prev, [key]: val }));
  const [itemSearch, setItemSearch] = useState('');

  const poTotal = form.items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);

  return (
    <ModalWrapper visible={visible} onClose={onClose} title="Create Purchase Order">
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        <Label text="Supplier *" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {suppliers.map(s => (
            <TouchableOpacity
              key={s._id || s.id}
              style={[styles.chip, form.supplierId === (s._id || s.id) && styles.chipActive]}
              onPress={() => set('supplierId', s._id || s.id)}
            >
              <Text style={[styles.chipText, form.supplierId === (s._id || s.id) && styles.chipTextActive]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sectionRow}>
          <Label text="Items *" />
          <TouchableOpacity onPress={addPOItem}>
            <Text style={styles.addLink}>+ Add Item</Text>
          </TouchableOpacity>
        </View>
        {form.items.map((item, idx) => (
          <View key={idx} style={styles.poItemRow}>
            <View style={{ flex: 2 }}>
              <TextInput
                style={styles.input}
                placeholder="Search item..."
                placeholderTextColor={Colors.textLight}
                value={item.inventoryItemName || ''}
                onChangeText={v => {
                  updatePOItem(idx, 'inventoryItemName', v);
                  setItemSearch(v);
                }}
              />
              {itemSearch && item.inventoryItemName === itemSearch && (
                <View style={styles.dropdown}>
                  {inventoryItems
                    .filter(i => i.name?.toLowerCase().includes(itemSearch.toLowerCase()))
                    .slice(0, 5)
                    .map(i => (
                      <TouchableOpacity
                        key={i._id || i.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          updatePOItem(idx, 'inventoryItemId', i._id || i.id);
                          updatePOItem(idx, 'inventoryItemName', i.name);
                          setItemSearch('');
                        }}
                      >
                        <Text style={styles.dropdownText}>{i.name}</Text>
                      </TouchableOpacity>
                    ))}
                </View>
              )}
            </View>
            <View style={{ width: 55 }}>
              <TextInput
                style={styles.input}
                placeholder="Qty"
                placeholderTextColor={Colors.textLight}
                value={String(item.quantity)}
                onChangeText={v => updatePOItem(idx, 'quantity', Number(v) || 0)}
                keyboardType="numeric"
              />
            </View>
            <View style={{ width: 70 }}>
              <TextInput
                style={styles.input}
                placeholder="Price"
                placeholderTextColor={Colors.textLight}
                value={String(item.unitPrice)}
                onChangeText={v => updatePOItem(idx, 'unitPrice', Number(v) || 0)}
                keyboardType="numeric"
              />
            </View>
            {form.items.length > 1 && (
              <TouchableOpacity onPress={() => removePOItem(idx)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        <Text style={styles.poTotalText}>Total: {'\u20B9'}{poTotal.toLocaleString('en-IN')}</Text>

        <Label text="Expected Delivery" />
        <Input value={form.expectedDeliveryDate} onChangeText={v => set('expectedDeliveryDate', v)} placeholder="YYYY-MM-DD" />

        <Label text="Notes" />
        <Input value={form.notes} onChangeText={v => set('notes', v)} placeholder="Notes" multiline numberOfLines={2} />

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Create PO</Text>}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── 7. Quick Order Logger ────────────────────────────
const ORDER_SOURCES = [
  { key: 'zomato', label: 'Zomato' }, { key: 'swiggy', label: 'Swiggy' },
  { key: 'whatsapp', label: 'WhatsApp' }, { key: 'phone', label: 'Phone' },
  { key: 'walk_in', label: 'Walk-in' }, { key: 'other', label: 'Other' },
];
const QO_MODES = [
  { key: 'manual', label: 'Manual', icon: 'list' },
  { key: 'text', label: 'Paste Text', icon: 'document-text' },
  { key: 'image', label: 'Photo', icon: 'camera' },
];

export function QuickOrderModal({
  visible, onClose,
  quickOrderMode, setQuickOrderMode,
  quickOrderText, setQuickOrderText,
  quickOrderParsedItems, setQuickOrderParsedItems,
  quickOrderSource, setQuickOrderSource,
  quickOrderParsing, quickOrderConfirming,
  quickOrderManualItems, quickMenuSearch, setQuickMenuSearch,
  menuItems,
  handleParseText, handlePickOrderImage,
  addManualItem, updateManualItemQty,
  handleConfirmQuickOrder, resetQuickOrder,
}) {
  const filteredMenu = quickMenuSearch
    ? menuItems.filter(i => i.name?.toLowerCase().includes(quickMenuSearch.toLowerCase())).slice(0, 8)
    : [];

  return (
    <ModalWrapper visible={visible} onClose={() => resetQuickOrder()} title="Log External Order">
      <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
        {/* Source */}
        <Label text="Order Source" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {ORDER_SOURCES.map(s => (
            <TouchableOpacity key={s.key} style={[styles.chip, quickOrderSource === s.key && styles.chipActive]} onPress={() => setQuickOrderSource(s.key)}>
              <Text style={[styles.chipText, quickOrderSource === s.key && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Mode tabs */}
        <View style={styles.qoModeRow}>
          {QO_MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.qoModeBtn, quickOrderMode === m.key && styles.qoModeBtnActive]}
              onPress={() => setQuickOrderMode(m.key)}
            >
              <Ionicons name={m.icon} size={16} color={quickOrderMode === m.key ? '#fff' : Colors.textMedium} />
              <Text style={[styles.qoModeText, quickOrderMode === m.key && styles.qoModeTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Manual mode */}
        {quickOrderMode === 'manual' && (
          <>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={Colors.textLight} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search menu items..."
                placeholderTextColor={Colors.textLight}
                value={quickMenuSearch}
                onChangeText={setQuickMenuSearch}
              />
            </View>
            {filteredMenu.length > 0 && (
              <View style={styles.menuList}>
                {filteredMenu.map(item => (
                  <TouchableOpacity
                    key={item.id || item._id}
                    style={styles.menuRow}
                    onPress={() => addManualItem(item)}
                  >
                    <Text style={styles.menuName}>{item.name}</Text>
                    <Text style={styles.menuPrice}>{'\u20B9'}{item.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {quickOrderManualItems.length > 0 && (
              <View style={styles.itemsList}>
                {quickOrderManualItems.map(item => (
                  <View key={item.menuItemId} style={styles.qoItemRow}>
                    <Text style={styles.qoItemName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.qsControls}>
                      <TouchableOpacity style={styles.qsBtn} onPress={() => updateManualItemQty(item.menuItemId, -1)}>
                        <Ionicons name="remove" size={16} color="#ef4444" />
                      </TouchableOpacity>
                      <Text style={styles.qoQty}>{item.quantity}</Text>
                      <TouchableOpacity style={styles.qsBtn} onPress={() => updateManualItemQty(item.menuItemId, 1)}>
                        <Ionicons name="add" size={16} color="#10b981" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.qoPrice}>{'\u20B9'}{(item.price * item.quantity).toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Text mode */}
        {quickOrderMode === 'text' && (
          <>
            <TextInput
              style={styles.textArea}
              placeholder="Paste order text here (from Zomato, Swiggy, etc.)"
              placeholderTextColor={Colors.textLight}
              value={quickOrderText}
              onChangeText={setQuickOrderText}
              multiline
              numberOfLines={6}
            />
            <TouchableOpacity
              style={[styles.parseBtn, quickOrderParsing && { opacity: 0.6 }]}
              onPress={handleParseText}
              disabled={quickOrderParsing}
            >
              {quickOrderParsing ? <ActivityIndicator color="#fff" size="small" /> : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.parseBtnText}>Parse with AI</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Image mode */}
        {quickOrderMode === 'image' && (
          <View style={styles.imageActions}>
            <TouchableOpacity
              style={styles.imageModeBtn}
              onPress={() => handlePickOrderImage(true)}
              disabled={quickOrderParsing}
            >
              <Ionicons name="camera" size={24} color="#3b82f6" />
              <Text style={styles.imageModeBtnText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imageModeBtn}
              onPress={() => handlePickOrderImage(false)}
              disabled={quickOrderParsing}
            >
              <Ionicons name="images" size={24} color="#8b5cf6" />
              <Text style={styles.imageModeBtnText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Parsed items */}
        {quickOrderParsedItems.length > 0 && (quickOrderMode === 'text' || quickOrderMode === 'image') && (
          <>
            <Label text="Parsed Items" />
            {quickOrderParsedItems.map((item, idx) => (
              <View key={idx} style={styles.qoItemRow}>
                <Text style={styles.qoItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.qoQty}>x{item.quantity}</Text>
                <Text style={styles.qoPrice}>{'\u20B9'}{(item.price * item.quantity).toFixed(0)}</Text>
                {item.matchType === 'fuzzy' && (
                  <View style={[styles.matchBadge, { backgroundColor: '#fef3c7' }]}>
                    <Text style={{ fontSize: 9, color: '#92400e' }}>Fuzzy</Text>
                  </View>
                )}
              </View>
            ))}
          </>
        )}

        {quickOrderParsing && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={{ fontSize: 13, color: Colors.textLight, marginTop: 8 }}>Processing...</Text>
          </View>
        )}

        {/* Confirm */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: '#10b981' }, quickOrderConfirming && { opacity: 0.6 }]}
          onPress={handleConfirmQuickOrder}
          disabled={quickOrderConfirming}
        >
          {quickOrderConfirming ? <ActivityIndicator color="#fff" size="small" /> : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
              <Text style={[styles.saveBtnText, { marginLeft: 6 }]}>Confirm & Deduct Inventory</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </ModalWrapper>
  );
}

// ── Styles ───────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%', paddingBottom: Platform.OS === 'ios' ? 30 : 16,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: Colors.textDark },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  modalScroll: { paddingHorizontal: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textMedium, marginTop: Spacing.md, marginBottom: 4 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: BorderRadius.medium, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.textDark,
  },
  chipRow: { maxHeight: 38, marginTop: 2 },
  chip: {
    borderRadius: 16, borderWidth: 1, borderColor: Colors.borderLight,
    paddingHorizontal: 14, paddingVertical: 6, marginRight: 6, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { fontSize: 12, color: Colors.textMedium, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: Spacing.sm },
  halfCol: { flex: 1 },
  thirdCol: { flex: 1 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md },
  addLink: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.xs },
  stepNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  stepNumText: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  removeBtn: { padding: 4, marginTop: 8 },
  unitLabel: { fontSize: 13, color: Colors.textLight, marginTop: 12, minWidth: 24 },
  dropdown: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: BorderRadius.medium, ...Shadows.medium, marginTop: 2, zIndex: 20,
  },
  dropdownItem: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  dropdownText: { fontSize: 13, color: Colors.textDark },
  dropdownSub: { fontSize: 12, color: Colors.textLight },
  saveBtn: {
    backgroundColor: '#3b82f6', borderRadius: BorderRadius.large,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', marginTop: Spacing.lg,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // View recipe
  viewDesc: { fontSize: 14, color: Colors.textMedium, lineHeight: 20, marginTop: Spacing.sm },
  viewStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: Spacing.sm },
  viewStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewStatText: { fontSize: 13, color: Colors.textMedium },
  viewIngRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  viewIngName: { flex: 1, fontSize: 14, color: Colors.textDark },
  viewIngQty: { fontSize: 13, color: Colors.textMedium, marginRight: 8 },
  viewIngCost: { fontSize: 13, fontWeight: '600', color: '#10b981' },
  costSummary: {
    backgroundColor: '#f8fafc', borderRadius: BorderRadius.medium,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  costLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  costLabel: { fontSize: 13, color: Colors.textMedium },
  costVal: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  viewStepRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.xs },
  viewStepText: { flex: 1, fontSize: 14, color: Colors.textDark, lineHeight: 20 },
  viewNotes: { fontSize: 13, color: Colors.textMedium, fontStyle: 'italic', marginTop: 4 },
  // Quick stock
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9',
    borderRadius: BorderRadius.large, paddingHorizontal: 12, height: 40,
    marginHorizontal: Spacing.md, marginTop: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textDark, marginLeft: 8 },
  qsRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  qsName: { fontSize: 14, fontWeight: '600', color: Colors.textDark },
  qsSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  qsControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qsBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  qsAdj: { fontSize: 16, fontWeight: '600', color: Colors.textLight, minWidth: 30, textAlign: 'center' },
  // PO
  poItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: Spacing.xs },
  poTotalText: { fontSize: 15, fontWeight: '700', color: Colors.textDark, marginTop: Spacing.sm, textAlign: 'right' },
  // Quick order
  qoModeRow: { flexDirection: 'row', gap: 8, marginTop: Spacing.md },
  qoModeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: BorderRadius.large, borderWidth: 1, borderColor: Colors.borderLight,
    paddingVertical: 10, backgroundColor: '#fff',
  },
  qoModeBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  qoModeText: { fontSize: 13, fontWeight: '600', color: Colors.textMedium },
  qoModeTextActive: { color: '#fff' },
  textArea: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: BorderRadius.medium, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: Colors.textDark, height: 120, textAlignVertical: 'top', marginTop: Spacing.sm,
  },
  parseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#8b5cf6', borderRadius: BorderRadius.large,
    paddingVertical: 12, marginTop: Spacing.sm,
  },
  parseBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  imageActions: { flexDirection: 'row', gap: 12, marginTop: Spacing.md },
  imageModeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: BorderRadius.large, paddingVertical: 24,
  },
  imageModeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textDark, marginTop: 6 },
  menuList: { backgroundColor: '#f8fafc', borderRadius: BorderRadius.medium, marginTop: 4 },
  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  menuName: { fontSize: 14, color: Colors.textDark },
  menuPrice: { fontSize: 13, fontWeight: '600', color: '#10b981' },
  itemsList: { marginTop: Spacing.sm },
  qoItemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  qoItemName: { flex: 1, fontSize: 14, color: Colors.textDark },
  qoQty: { fontSize: 14, fontWeight: '700', color: Colors.textDark, marginHorizontal: 8 },
  qoPrice: { fontSize: 13, fontWeight: '600', color: '#10b981' },
  matchBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
});
