// Native Home for staff (cashier, manager, employee, custom roles…) — the same Home as the web
// (dine-frontend src/app/(dashboard)/home/page.js, staff view), built in the app so it never
// depends on the phone's WebView. Same server calls, same cards, same access rules.
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import apiClient from '../services/api';
import { Colors, Spacing, Shadows } from '../constants/Theme';
import { useOffline } from '../hooks/useOffline';
import { formatCurrency } from '../utils/formatCurrency';
import { billNumberLabel } from '../utils/billNumber';
import UpcomingEventsStrip from '../components/UpcomingEventsStrip';
import MySalesCard from '../components/home/MySalesCard';
import StaffAlertsCard from '../components/home/StaffAlertsCard';
import { MeetingsHomeCard, YesterdayRecap, OpenOrdersCard } from '../components/home/HomeCards';
import {
  roleOf, ridOf, canSeeBusinessTotals, orderHistoryOff, canAccess, canOpenPage, openWeb,
  getGreeting, parseDate, timeAgo,
} from '../components/home/homeRules';

const ROLE_MESSAGE = {
  manager: "Ready to manage the floor. Let's get started!",
  waiter: 'Tables are waiting. Time to deliver great service!',
};
const DEFAULT_MESSAGE = "Welcome back! Here's your quick access panel.";

const STATUS = {
  completed: { bg: '#ecfdf5', color: '#059669', label: 'Paid' },
  pending: { bg: '#fffbeb', color: '#d97706', label: 'Pending' },
  preparing: { bg: '#eff6ff', color: '#2563eb', label: 'Preparing' },
  served: { bg: '#f0fdf4', color: '#16a34a', label: 'Served' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', label: 'Cancelled' },
  saved: { bg: '#f1f5f9', color: '#64748b', label: 'Saved' },
};
const TYPE = {
  'dine in': { icon: 'restaurant', color: '#3b82f6', bg: '#eff6ff' },
  dine_in: { icon: 'restaurant', color: '#3b82f6', bg: '#eff6ff' },
  takeaway: { icon: 'bag-handle', color: '#f59e0b', bg: '#fffbeb' },
  'take away': { icon: 'bag-handle', color: '#f59e0b', bg: '#fffbeb' },
  delivery: { icon: 'bicycle', color: '#10b981', bg: '#ecfdf5' },
  online: { icon: 'storefront', color: '#8b5cf6', bg: '#f5f3ff' },
};

const tz = () => (apiClient.getRestaurantTimezone ? apiClient.getRestaurantTimezone() : null);
const fmtTime = (d) => {
  const t = parseDate(d);
  if (!t) return '';
  try { return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...(tz() ? { timeZone: tz() } : {}) }); }
  catch (_) { return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }); }
};
const todayText = () => {
  try { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', ...(tz() ? { timeZone: tz() } : {}) }); }
  catch (_) { return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
};

export default function StaffHomeNative() {
  const router = useRouter();
  const { effectivelyOffline } = useOffline();
  const [user, setUser] = useState(null);
  const [mySales, setMySales] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [tables, setTables] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // remounts the self-loading cards on pull-to-refresh
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const u = await apiClient.getUser();
      if (!u || !mounted.current) return;
      setUser(u);
      const rid = ridOf(u);
      if (!rid) return;
      const business = canSeeBusinessTotals(u);
      await Promise.all([
        (!business && !orderHistoryOff(u.pageAccess))
          ? apiClient.getMySales(rid, 'today').then(r => { if (mounted.current && r && r.success) setMySales(r); }).catch(() => {})
          : null,
        canAccess(u, 'history')
          ? apiClient.getOrders(rid, { limit: 5, sort: 'newest' }).then(d => { if (mounted.current && d?.orders) setRecentOrders(d.orders.slice(0, 5)); }).catch(() => {})
          : null,
        canAccess(u, 'tables')
          ? apiClient.getTables(rid).then(d => {
            if (!mounted.current || !d?.tables) return;
            const total = d.tables.length;
            const occupied = d.tables.filter(t => t.status === 'occupied' || t.status === 'reserved').length;
            setTables({ total, occupied, available: total - occupied });
          }).catch(() => {})
          : null,
      ]);
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]));

  const onRefresh = () => { setRefreshing(true); setRefreshKey(k => k + 1); load(); };

  if (!user) return <SafeAreaView style={s.container} edges={['top']} />;

  const role = roleOf(user);
  const rid = ridOf(user);
  const restaurant = user.restaurant || {};
  const posSettings = restaurant.posSettings || {};
  const isBar = restaurant.businessType === 'bar';
  const business = canSeeBusinessTotals(user);
  const firstName = (user.name || '').split(' ')[0] || 'there';

  const actions = [
    canAccess(user, 'dashboard') && { key: 'pos', label: isBar ? 'Bar POS' : 'Start Order', icon: 'receipt', color: '#ef4444', go: () => router.push(isBar ? '/(tabs)/bar-billing' : '/(tabs)/menu') },
    canAccess(user, 'tables') && { key: 'tables', label: 'Tables', icon: 'restaurant', color: '#3b82f6', go: () => router.push('/(tabs)/tables') },
    canAccess(user, 'kot') && { key: 'kot', label: 'Kitchen', icon: 'flame', color: '#f97316', go: () => router.push('/(tabs)/kitchen') },
    canAccess(user, 'menu') && { key: 'menu', label: 'Menu', icon: 'fast-food', color: '#10b981', go: () => router.push('/(tabs)/menu-management') },
    canAccess(user, 'history') && { key: 'orders', label: 'Orders', icon: 'clipboard', color: '#f59e0b', go: () => router.push('/(tabs)/orders') },
    // Shifts & Cash / Register — only where the restaurant uses them
    posSettings.enableShiftsCash && canOpenPage(user, 'shifts') && { key: 'shifts', label: 'Shifts & Cash', icon: 'cash', color: '#6366f1', go: () => openWeb(router, '/shifts-cash', 'Shifts & Cash') },
    posSettings.requireRegisterOpen && canOpenPage(user, 'completeBill') && { key: 'register', label: 'Register', icon: 'albums', color: '#16a34a', go: () => openWeb(router, '/register', 'Register') },
  ].filter(Boolean);

  const card = { marginHorizontal: Spacing.md, marginTop: 12 };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {effectivelyOffline && (
          <View style={[s.offline, card]}>
            <Ionicons name="cloud-offline-outline" size={14} color="#b91c1c" />
            <Text style={s.offlineText}>You're offline — showing saved data</Text>
          </View>
        )}

        <View key={`cards-${refreshKey}`}>
          {business && <YesterdayRecap restaurantId={rid} style={card} />}
          {!business && !orderHistoryOff(user.pageAccess) && <MySalesCard mySales={mySales} style={card} />}
          {business && <OpenOrdersCard restaurantId={rid} style={card} />}
          {['owner', 'admin', 'co-owner', 'manager'].includes(role) && (
            <StaffAlertsCard restaurantId={rid} canEditSettings={['owner', 'admin', 'co-owner'].includes(role)} style={card} />
          )}
          <MeetingsHomeCard restaurantId={rid} style={card} />
          <UpcomingEventsStrip restaurantId={rid} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.greeting}>{getGreeting()}, {firstName}</Text>
          <Text style={s.dateLine}>{todayText()}{restaurant.name ? ` · ${restaurant.name}` : ''}</Text>
          <Text style={s.roleMsg}>{ROLE_MESSAGE[role] || DEFAULT_MESSAGE}</Text>
        </View>

        {/* Quick actions */}
        {actions.length > 0 && (
          <View style={s.actions}>
            {actions.map(a => (
              <TouchableOpacity key={a.key} style={[s.action, { backgroundColor: a.color }]} activeOpacity={0.8} onPress={a.go}>
                <Ionicons name={a.icon} size={18} color="#fff" />
                <Text style={s.actionText} numberOfLines={2}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Recent orders */}
        {canAccess(user, 'history') && (
          <View style={[s.panel, card]}>
            <View style={s.panelHead}>
              <View style={s.panelTitleRow}>
                <View style={s.panelIcon}><Ionicons name="time-outline" size={14} color="#6b7280" /></View>
                <Text style={s.panelTitle}>Recent Orders</Text>
              </View>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}><Text style={s.viewAll}>View all</Text></TouchableOpacity>
            </View>
            {recentOrders.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="clipboard-outline" size={24} color="#e2e8f0" />
                <Text style={s.emptyText}>No orders yet today</Text>
              </View>
            ) : recentOrders.map((o, i) => {
              const st = STATUS[o.status] || STATUS.pending;
              const rawType = (o.orderType ? String(o.orderType).replace('-', ' ') : 'dine in').toLowerCase();
              const ty = TYPE[rawType] || TYPE['dine in'];
              const num = billNumberLabel(o) || o.orderNumber || String(o.id || '').slice(-6).toUpperCase();
              const total = o.grandTotal || o.totalAmount || o.total || 0;
              return (
                <TouchableOpacity key={o.id || i} style={s.orderRow} activeOpacity={0.7} onPress={() => router.push('/(tabs)/orders')}>
                  <View style={[s.typeIcon, { backgroundColor: ty.bg }]}><Ionicons name={ty.icon} size={14} color={ty.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.orderNum}>#{num} <Text style={s.orderType}>{rawType}</Text></Text>
                    {!!o.createdAt && <Text style={s.orderTime}>{fmtTime(o.createdAt)} · {timeAgo(o.createdAt)}</Text>}
                  </View>
                  <View style={[s.statusPill, { backgroundColor: st.bg }]}><Text style={[s.statusText, { color: st.color }]}>{st.label}</Text></View>
                  <Text style={s.orderAmt}>{formatCurrency(total)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Table status */}
        {canAccess(user, 'tables') && (
          <TouchableOpacity style={[s.panel, card, { padding: 16 }]} activeOpacity={0.8} onPress={() => router.push('/(tabs)/tables')}>
            <View style={[s.panelHead, { padding: 0, borderBottomWidth: 0, marginBottom: 12 }]}>
              <View style={s.panelTitleRow}>
                <View style={s.panelIcon}><Ionicons name="restaurant-outline" size={14} color="#6b7280" /></View>
                <Text style={s.panelTitle}>Table Status</Text>
              </View>
              {tables && tables.total > 0 && (() => {
                const pct = Math.round((tables.occupied / tables.total) * 100);
                return <View style={[s.statusPill, { backgroundColor: pct >= 80 ? '#fef2f2' : '#ecfdf5' }]}><Text style={[s.statusText, { color: pct >= 80 ? '#dc2626' : '#059669' }]}>{pct}% full</Text></View>;
              })()}
            </View>
            {!tables || tables.total === 0 ? (
              <View style={s.empty}>
                <Ionicons name="restaurant-outline" size={24} color="#e2e8f0" />
                <Text style={s.emptyText}>Add tables to see status here</Text>
              </View>
            ) : (() => {
              const pct = Math.round((tables.occupied / tables.total) * 100);
              return (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                    <View style={[s.tableBox, { backgroundColor: '#ecfdf5' }]}>
                      <Text style={[s.tableNum, { color: '#059669' }]}>{tables.available}</Text>
                      <Text style={[s.tableLabel, { color: '#10b981' }]}>Available</Text>
                    </View>
                    <View style={[s.tableBox, { backgroundColor: '#fef2f2' }]}>
                      <Text style={[s.tableNum, { color: '#dc2626' }]}>{tables.occupied}</Text>
                      <Text style={[s.tableLabel, { color: '#ef4444' }]}>Occupied</Text>
                    </View>
                  </View>
                  <View style={s.bar}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: pct >= 80 ? '#ef4444' : '#f59e0b' }]} /></View>
                  <Text style={s.tablesInUse}>{tables.occupied} of {tables.total} tables in use</Text>
                </>
              );
            })()}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  offlineText: { fontSize: 12, fontWeight: '600', color: '#b91c1c' },
  header: { paddingHorizontal: Spacing.md, paddingTop: 20 },
  greeting: { fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  dateLine: { fontSize: 14, color: '#94a3b8', marginTop: 6 },
  roleMsg: { fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: '500' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: Spacing.md, marginTop: 16 },
  action: { width: 72, height: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 4 },
  actionText: { fontSize: 10, fontWeight: '700', color: '#fff', textAlign: 'center' },
  panel: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden', ...Shadows.small },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  panelTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  viewAll: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { fontSize: 13, color: '#9ca3af' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  typeIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  orderNum: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  orderType: { fontSize: 12, fontWeight: '500', color: '#9ca3af', textTransform: 'capitalize' },
  orderTime: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  orderAmt: { fontSize: 14, fontWeight: '700', color: '#1f2937', minWidth: 56, textAlign: 'right' },
  tableBox: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  tableNum: { fontSize: 24, fontWeight: '800' },
  tableLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  tablesInUse: { fontSize: 12, color: '#9ca3af', marginTop: 8, textAlign: 'center' },
});
