import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// VIEW-ONLY live floor plan for the mobile waiter/POS tables screen.
// Mirrors the web dashboard's TableFloorPlan (posX/posY/width/height/rotation/shape),
// but strips every edit affordance: no drag, no resize, no rotate, no reshape.
// Tapping a table simply fires onTablePress(table) so the host can wire it to the
// EXISTING take-order / open-order handler. This component never touches order or
// billing logic — it only renders positions the web app already saved.

const DEFAULT_W = 92;
const DEFAULT_H = 92;

// Auto-grid fallback when a floor has no saved layout (tables lack posX/posY).
const CELL = 100;   // cell size incl. gap
const COLS = 4;     // tables across

const num = (v, d) => (v == null || isNaN(Number(v)) ? d : Number(v));

export default function TableFloorPlanNative({
  floor,
  tables = [],
  statusColor,      // (status) => { bg, border, text, dot }
  formatCurrency,   // (amount) => string
  onTablePress,     // (table) => void — host wires the existing take/open-order flow
}) {
  // Resolve a position for every table: saved layout first, else auto-grid.
  const { positioned, hasSavedLayout, extentW, extentH } = useMemo(() => {
    let anySaved = false;
    let auto = 0;
    const list = (tables || []).map((t) => {
      const hasPos = t.posX != null && t.posY != null;
      if (hasPos) anySaved = true;
      let pos;
      if (hasPos) {
        pos = {
          posX: num(t.posX, 0),
          posY: num(t.posY, 0),
          width: num(t.width, DEFAULT_W),
          height: num(t.height, DEFAULT_H),
          rotation: num(t.rotation, 0),
          shape: t.shape || 'rect',
        };
      } else {
        const col = auto % COLS;
        const row = Math.floor(auto / COLS);
        pos = {
          posX: 12 + col * CELL,
          posY: 12 + row * CELL,
          width: DEFAULT_W,
          height: DEFAULT_H,
          rotation: 0,
          shape: t.shape || 'rect',
        };
        auto += 1;
      }
      return { table: t, pos };
    });

    // Canvas must grow to fit the furthest table.
    const w = Math.max(320, ...list.map(({ pos }) => pos.posX + pos.width + 24));
    const h = Math.max(240, ...list.map(({ pos }) => pos.posY + pos.height + 24));

    return { positioned: list, hasSavedLayout: anySaved, extentW: w, extentH: h };
  }, [tables]);

  const shapeRadius = (shape, width, height) => {
    if (shape === 'round') return Math.min(width, height) / 2;
    return 12;
  };

  const defaultColors = { bg: '#f0fdf4', border: '#16a34a', text: '#166534', dot: '#16a34a' };

  if (!positioned.length) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="grid-outline" size={40} color="#cbd5e1" />
        <Text style={styles.emptyText}>No tables on this floor</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {!hasSavedLayout && (
        <View style={styles.hintRow}>
          <Ionicons name="information-circle-outline" size={14} color="#64748b" />
          <Text style={styles.hintText}>Auto-arranged. Arrange the layout on the web dashboard.</Text>
        </View>
      )}
      {/* Horizontal scroll for the canvas; the host owns the vertical scroll so
          multiple floors can stack without nesting same-axis ScrollViews. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
      >
          <View style={[styles.canvas, { width: extentW, height: extentH }]}>
            {positioned.map(({ table, pos }) => {
              const status = table.status || 'available';
              const c = (statusColor && statusColor(status)) || defaultColors;
              const isOccupied = status === 'occupied';
              const bill = table.currentOrderFinalAmount ?? table.currentOrderTotal;
              const showBill = isOccupied && bill != null && Number(bill) > 0;
              const covers = table.currentOrderCovers;
              return (
                <TouchableOpacity
                  key={table.id}
                  activeOpacity={0.8}
                  onPress={() => onTablePress && onTablePress(table)}
                  style={[
                    styles.table,
                    {
                      left: pos.posX,
                      top: pos.posY,
                      width: pos.width,
                      height: pos.height,
                      transform: [{ rotate: `${pos.rotation || 0}deg` }],
                      backgroundColor: c.bg,
                      borderColor: c.border,
                      borderRadius: shapeRadius(pos.shape, pos.width, pos.height),
                    },
                  ]}
                >
                  <Text style={[styles.tableName, { color: c.text }]} numberOfLines={1}>
                    {table.name}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={9} color={c.text} />
                    <Text style={[styles.metaText, { color: c.text }]} numberOfLines={1}>
                      {covers > 0 ? `${covers}/${table.capacity || '-'}` : (table.capacity || '-')}
                    </Text>
                  </View>
                  {showBill && (
                    <Text style={[styles.billText, { color: c.text }]} numberOfLines={1}>
                      {formatCurrency ? formatCurrency(bill) : bill}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  hintText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  canvas: {
    position: 'relative',
    margin: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  table: {
    position: 'absolute',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  tableName: { fontSize: 12, fontWeight: '800', lineHeight: 14, maxWidth: '100%' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1, opacity: 0.85 },
  metaText: { fontSize: 9, fontWeight: '600' },
  billText: { fontSize: 10, fontWeight: '700', marginTop: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
});
