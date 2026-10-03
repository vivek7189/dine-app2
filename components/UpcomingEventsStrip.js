// "Coming up" strip on the staff home: next 2 calendar events (festivals, holidays, own events).
// Renders nothing when the calendar is off for this person (API 403) or there is nothing coming up.
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { loadUpcoming, categoryStyle, crowdStyle, countdown, fmtDate } from '../utils/calendarEvents';

export default function UpcomingEventsStrip({ restaurantId, style }) {
  const router = useRouter();
  const [events, setEvents] = useState([]);

  const load = useCallback(async (force = false) => {
    if (!restaurantId) return;
    const r = await loadUpcoming(restaurantId, { force });
    setEvents(r.allowed ? r.events.slice(0, 2) : []);
  }, [restaurantId]);

  // Runs on mount and every time the home screen comes back into view (cached for a minute).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!events.length) return null;

  return (
    <View style={[st.wrap, style]}>
      <View style={st.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles-outline" size={16} color="#6b7280" />
          <Text style={st.title}>Coming up</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/calendar')}>
          <Text style={st.viewAll}>All events</Text>
        </TouchableOpacity>
      </View>
      {events.map(ev => {
        const cat = categoryStyle(ev.source === 'custom' ? (ev.category || 'custom') : ev.category);
        const crowd = crowdStyle(ev.expectedCrowd);
        return (
          <TouchableOpacity key={ev.key || `${ev.id}:${ev.date}`} style={st.card} activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/(tabs)/calendar', params: { open: ev.key || '' } })}>
            <View style={[st.bar, { backgroundColor: cat.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={st.name} numberOfLines={1}>{ev.name}</Text>
              <Text style={st.sub} numberOfLines={1}>
                {fmtDate(ev.date)}{ev.tentative ? ' · expected' : ''} · {cat.label}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={st.count}>{countdown(ev)}</Text>
              {crowd && crowd.key !== 'normal' && (
                <View style={[st.pill, { backgroundColor: crowd.bg }]}><Text style={[st.pillText, { color: crowd.color }]}>{crowd.label}</Text></View>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 20 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  viewAll: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#f3f4f6' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  name: { fontSize: 14, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  count: { fontSize: 12, fontWeight: '700', color: '#111827' },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  pillText: { fontSize: 10, fontWeight: '700' },
});
