// Native Home for the owner / admin — the same Home as the web (dine-frontend home/page.js, owner
// view): the "first customer" card, open orders carried over from earlier days and coming-up
// festivals, above the Headquarters dashboard (the app's native HQ screen, embedded).
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import apiClient from '../services/api';
import { HeadquartersContent } from '../app/(tabs)/headquarters';
import GetStartedCard from '../components/home/GetStartedCard';
import UpcomingEventsStrip from '../components/UpcomingEventsStrip';
import { OpenOrdersChip } from '../components/home/HomeCards';
import { ridOf } from '../components/home/homeRules';

export default function OwnerHomeNative() {
  const [user, setUser] = useState(null);
  useEffect(() => { apiClient.getUser().then(setUser).catch(() => {}); }, []);
  const rid = ridOf(user);

  const top = () => (
    <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 4 }}>
      <GetStartedCard restaurantId={rid} />
      <OpenOrdersChip restaurantId={rid} />
      <UpcomingEventsStrip restaurantId={rid} style={{ marginHorizontal: -16, marginTop: 0 }} />
    </View>
  );

  return <HeadquartersContent embedded topContent={rid ? top : null} />;
}
