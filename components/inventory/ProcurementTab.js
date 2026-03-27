import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/Theme';

const SUB_TABS = [
  { key: 'suppliers', label: 'Suppliers', icon: 'people' },
  { key: 'orders', label: 'POs', icon: 'document-text' },
  { key: 'requisitions', label: 'Requisitions', icon: 'clipboard' },
  { key: 'grn', label: 'GRN', icon: 'checkmark-done' },
  { key: 'invoices', label: 'Invoices', icon: 'receipt' },
  { key: 'returns', label: 'Returns', icon: 'arrow-undo' },
  { key: 'transfers', label: 'Transfers', icon: 'swap-horizontal' },
];

export default function ProcurementTab({
  procurementSubTab, setProcurementSubTab,
  suppliers, supplierPerformance, purchaseOrders,
  requisitions, grns, invoices, supplierReturns, stockTransfers,
  setShowAddSupplierModal, setShowAddPOModal,
  handleDeleteSupplier, handleUpdatePOStatus, handleEmailPO,
  getOrderStatusColor, getNextPOAction, getNextPOActionLabel,
}) {
  const renderSuppliers = () => (
    <View>
      <View style={styles.subHeader}>
        <Text style={styles.subCount}>{suppliers.length} Suppliers</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddSupplierModal(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {suppliers.length > 0 ? suppliers.map(s => {
        const perf = supplierPerformance.find(p => (p.supplierId || p._id) === (s._id || s.id));
        return (
          <View key={s._id || s.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.supplierIcon}>
                <Ionicons name="business" size={20} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{s.name}</Text>
                {s.contact && <Text style={styles.cardSub}>{s.contact}</Text>}
                {s.phone && <Text style={styles.cardSub}>{s.phone}</Text>}
                {perf?.rating > 0 && (
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Ionicons key={n} name={n <= perf.rating ? 'star' : 'star-outline'} size={12} color="#f59e0b" />
                    ))}
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteSupplier(s)}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={40} color={Colors.textLight} />
          <Text style={styles.emptyText}>No suppliers yet</Text>
        </View>
      )}
    </View>
  );

  const renderPurchaseOrders = () => (
    <View>
      <View style={styles.subHeader}>
        <Text style={styles.subCount}>{purchaseOrders.length} Purchase Orders</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddPOModal(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Create PO</Text>
        </TouchableOpacity>
      </View>
      {purchaseOrders.length > 0 ? purchaseOrders.map(po => {
        const statusColor = getOrderStatusColor(po.status);
        const nextAction = getNextPOAction(po.status);
        const nextLabel = getNextPOActionLabel(po.status);
        return (
          <View key={po._id || po.id} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.cardTitle}>PO #{po.poNumber || po.orderNumber || '—'}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {(po.status || 'pending').charAt(0).toUpperCase() + (po.status || 'pending').slice(1)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardSub}>{po.supplierName || '—'}</Text>
                <Text style={styles.cardSub}>
                  {po.items?.length || 0} items · {'\u20B9'}{(po.totalAmount || po.total || 0).toLocaleString('en-IN')}
                </Text>
                {po.createdAt && (
                  <Text style={styles.cardDate}>
                    {new Date(po.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.poActions}>
              {nextAction && (
                <TouchableOpacity
                  style={[styles.poActionBtn, { backgroundColor: statusColor + '18' }]}
                  onPress={() => handleUpdatePOStatus(po._id || po.id, nextAction)}
                >
                  <Text style={[styles.poActionText, { color: statusColor }]}>{nextLabel}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.poActionBtn, { backgroundColor: '#eff6ff' }]}
                onPress={() => handleEmailPO(po)}
              >
                <Ionicons name="mail-outline" size={14} color="#3b82f6" />
                <Text style={[styles.poActionText, { color: '#3b82f6' }]}>Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }) : (
        <View style={styles.emptyBox}>
          <Ionicons name="document-text-outline" size={40} color={Colors.textLight} />
          <Text style={styles.emptyText}>No purchase orders yet</Text>
        </View>
      )}
    </View>
  );

  const renderReadOnlyList = (data, emptyLabel, titleKey, subKeys) => (
    <View>
      {data.length > 0 ? data.map((item, idx) => (
        <View key={item._id || item.id || idx} style={styles.card}>
          <Text style={styles.cardTitle}>{item[titleKey] || item.name || `#${idx + 1}`}</Text>
          {subKeys.map(k => item[k] ? (
            <Text key={k} style={styles.cardSub}>{k}: {typeof item[k] === 'object' ? JSON.stringify(item[k]) : String(item[k])}</Text>
          ) : null)}
          {item.status && (
            <View style={[styles.statusBadge, { backgroundColor: '#f1f5f9', alignSelf: 'flex-start', marginTop: 4 }]}>
              <Text style={[styles.statusText, { color: Colors.textMedium }]}>{item.status}</Text>
            </View>
          )}
        </View>
      )) : (
        <View style={styles.emptyBox}>
          <Ionicons name="folder-open-outline" size={40} color={Colors.textLight} />
          <Text style={styles.emptyText}>{emptyLabel}</Text>
        </View>
      )}
    </View>
  );

  const renderContent = () => {
    switch (procurementSubTab) {
      case 'suppliers': return renderSuppliers();
      case 'orders': return renderPurchaseOrders();
      case 'requisitions': return renderReadOnlyList(requisitions, 'No requisitions', 'requisitionNumber', ['requestedBy', 'department']);
      case 'grn': return renderReadOnlyList(grns, 'No goods receipts', 'grnNumber', ['supplierName', 'receivedDate']);
      case 'invoices': return renderReadOnlyList(invoices, 'No invoices', 'invoiceNumber', ['supplierName', 'totalAmount']);
      case 'returns': return renderReadOnlyList(supplierReturns, 'No returns', 'returnNumber', ['supplierName', 'reason']);
      case 'transfers': return renderReadOnlyList(stockTransfers, 'No transfers', 'transferNumber', ['fromLocation', 'toLocation']);
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Sub-tab pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subTabRow}>
        {SUB_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.subTab, procurementSubTab === tab.key && styles.subTabActive]}
            onPress={() => setProcurementSubTab(tab.key)}
          >
            <Ionicons name={tab.icon} size={14} color={procurementSubTab === tab.key ? '#fff' : Colors.textMedium} />
            <Text style={[styles.subTabText, procurementSubTab === tab.key && styles.subTabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1, paddingHorizontal: Spacing.md }} showsVerticalScrollIndicator={false}>
        {renderContent()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  subTabRow: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, maxHeight: 44 },
  subTab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.borderLight,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, backgroundColor: '#fff',
  },
  subTabActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  subTabText: { fontSize: 12, color: Colors.textMedium, fontWeight: '600' },
  subTabTextActive: { color: '#fff' },
  subHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.md, marginBottom: Spacing.sm,
  },
  subCount: { fontSize: 15, fontWeight: '700', color: Colors.textDark },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
  },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: BorderRadius.large,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.small,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  supplierIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textDark },
  cardSub: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  cardDate: { fontSize: 11, color: Colors.textLight, marginTop: 4 },
  ratingRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef2f2',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  poActions: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  poActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  poActionText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: Colors.textLight, marginTop: 8 },
});
