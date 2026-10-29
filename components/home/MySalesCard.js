// "Your sales today" — a staff member's OWN billed sales (server checkout figures: only orders they
// took / served). Shared by the waiter and staff native Home screens; same card as the web Home.
import React from 'react';
import { View, Text } from 'react-native';
import { formatCurrency } from '../../utils/formatCurrency';

export default function MySalesCard({ mySales, style }) {
  if (!mySales) return null;
  return (
    <View style={style}>
      <View style={{ backgroundColor: '#eef2ff', borderColor: '#e0e7ff', borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338ca', letterSpacing: 0.5 }}>YOUR SALES TODAY</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1e1b4b', marginTop: 2 }}>{formatCurrency(mySales.sales || 0)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, color: '#4c1d95' }}><Text style={{ fontWeight: '800' }}>{mySales.orders || 0}</Text> billed</Text>
          {mySales.openOrders > 0 && <Text style={{ fontSize: 12, color: '#4c1d95' }}><Text style={{ fontWeight: '800' }}>{mySales.openOrders}</Text> open · {formatCurrency(mySales.openAmount || 0)}</Text>}
          {mySales.tips > 0 && <Text style={{ fontSize: 12, color: '#4c1d95' }}>Tips {formatCurrency(mySales.tips)}</Text>}
        </View>
      </View>
      {/* Served vs taken (incentives) + the tables I served */}
      {mySales.served && mySales.taken && (
        <View style={{ backgroundColor: '#f5f3ff', borderColor: '#e0e7ff', borderWidth: 1, borderRadius: 14, marginTop: 8, padding: 10 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[['TABLES I SERVED', mySales.served], ['ORDERS I TOOK', mySales.taken]].map(([label, v]) => (
              <View key={label} style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#6366f1', letterSpacing: 0.5 }}>{label}</Text>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e1b4b', marginTop: 2 }}>{formatCurrency(v.sales || 0)}</Text>
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{v.orders || 0} order{v.orders === 1 ? '' : 's'}</Text>
              </View>
            ))}
          </View>
          {Array.isArray(mySales.tables) && mySales.tables.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {mySales.tables.slice(0, 12).map((t) => (
                <View key={t.table} style={{ backgroundColor: '#fff', borderColor: '#e0e7ff', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 12, color: '#3730a3' }}>{t.isTable ? `Table ${t.table}` : t.table} · <Text style={{ fontWeight: '800' }}>{formatCurrency(t.sales || 0)}</Text>{t.orders > 1 ? ` (${t.orders})` : ''}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
