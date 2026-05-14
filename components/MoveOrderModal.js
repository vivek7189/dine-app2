import React, { useState, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, StyleSheet, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors } from '../constants/Theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MODAL_MAX_WIDTH = Math.min(420, SCREEN_WIDTH - 32);
const CARD_GAP = 8;
const CARDS_PER_ROW = 2;
const CARD_WIDTH = (MODAL_MAX_WIDTH - 32 - CARD_GAP * (CARDS_PER_ROW - 1)) / CARDS_PER_ROW;

export default function MoveOrderModal({
  visible,
  onClose,
  sourceTable,   // { id, name, currentOrderId, floorId, floorName }
  floors = [],
  restaurantId,
  onMoveComplete, // (oldTableId, newTableId) => void
}) {
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [moving, setMoving] = useState(false);

  // Compute available tables per floor
  const floorData = useMemo(() => {
    if (!floors || floors.length === 0) return [];
    return floors.map(floor => {
      const available = (floor.tables || []).filter(t =>
        t.status === 'available' && t.id !== sourceTable?.id
      );
      return {
        id: floor.id,
        name: floor.name || 'Floor',
        tables: available,
      };
    }).filter(f => f.tables.length > 0 || f.id === sourceTable?.floorId);
  }, [floors, sourceTable]);

  const activeFloorId = selectedFloorId
    || sourceTable?.floorId
    || floorData.find(f => f.tables.length > 0)?.id
    || floorData[0]?.id;

  const activeFloor = floorData.find(f => f.id === activeFloorId);
  const availableTables = activeFloor?.tables || [];
  const showFloorTabs = floorData.length > 1;

  const handleMove = async () => {
    if (!selectedTarget || !sourceTable?.currentOrderId || moving) return;
    setMoving(true);

    try {
      const targetFloor = floorData.find(f => f.id === activeFloorId);
      await apiClient.moveOrderToTable(sourceTable.currentOrderId, {
        targetTableId: selectedTarget.id,
        targetTableName: selectedTarget.name || selectedTarget.number,
        targetFloorId: activeFloorId || null,
        targetFloorName: targetFloor?.name || null,
        restaurantId,
      });

      if (onMoveComplete) {
        onMoveComplete(sourceTable.id, selectedTarget.id);
      }
      onClose();
    } catch (err) {
      console.error('Move order failed:', err);
      Alert.alert('Move Failed', err.message || 'Failed to move order. Please try again.');
    } finally {
      setMoving(false);
    }
  };

  const handleClose = () => {
    setSelectedFloorId(null);
    setSelectedTarget(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <View style={styles.card} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Ionicons name="swap-horizontal" size={16} color="#3b82f6" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Move Order</Text>
                <Text style={styles.headerSubtitle}>
                  Table {sourceTable?.name}{sourceTable?.floorName ? ` · ${sourceTable.floorName}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Floor Tabs */}
          {showFloorTabs && (
            <View style={styles.floorTabsContainer}>
              <View style={styles.floorTabs}>
                {floorData.map(floor => {
                  const isActive = floor.id === activeFloorId;
                  return (
                    <TouchableOpacity
                      key={floor.id}
                      onPress={() => { setSelectedFloorId(floor.id); setSelectedTarget(null); }}
                      style={[styles.floorChip, isActive && styles.floorChipActive]}
                    >
                      <Text style={[styles.floorChipText, isActive && styles.floorChipTextActive]} numberOfLines={1}>
                        {floor.name} ({floor.tables.length})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Table Grid */}
          <ScrollView style={styles.tableGrid} contentContainerStyle={styles.tableGridContent}>
            {availableTables.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="restaurant-outline" size={28} color="#d1d5db" />
                <Text style={styles.emptyText}>No available tables on this floor</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {availableTables.map(table => {
                  const isSelected = selectedTarget?.id === table.id;
                  return (
                    <TouchableOpacity
                      key={table.id}
                      onPress={() => setSelectedTarget(table)}
                      style={[styles.tableCard, isSelected && styles.tableCardSelected]}
                    >
                      <Text style={[styles.tableName, isSelected && styles.tableNameSelected]}>
                        {table.name || table.number}
                      </Text>
                      {table.capacity ? (
                        <Text style={styles.tableCapacity}>{table.capacity} seats</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleClose}
              disabled={moving}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleMove}
              disabled={!selectedTarget || moving}
              style={[styles.moveBtn, (!selectedTarget || moving) && styles.moveBtnDisabled]}
            >
              {moving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="swap-horizontal" size={14} color="#fff" />
                  <Text style={styles.moveBtnText}>
                    {selectedTarget ? `Move to ${selectedTarget.name || selectedTarget.number}` : 'Move'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
  closeBtn: {
    padding: 4,
  },
  floorTabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  floorTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  floorChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    maxWidth: '48%',
  },
  floorChipActive: {
    backgroundColor: '#111827',
  },
  floorChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  floorChipTextActive: {
    color: '#fff',
  },
  tableGrid: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 120,
  },
  tableGridContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  tableCard: {
    width: CARD_WIDTH,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  tableCardSelected: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  tableName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  tableNameSelected: {
    color: '#1d4ed8',
  },
  tableCapacity: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    padding: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  moveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  moveBtnDisabled: {
    backgroundColor: '#d1d5db',
  },
  moveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
