// Menu items as waiters should see them right now: items outside their timings (item or category)
// are marked unavailable with the hours (utils/menuSchedule.applyMenuTimings). Re-checked every 30 s,
// only when this menu uses timings. The backend refuses orders outside the hours anyway.
import { useEffect, useMemo, useState } from 'react';
import apiClient from '../services/api';
import { applyMenuTimings, hasAnyTimings } from '../utils/menuSchedule';

export default function useTimedMenu(items, restaurantId, timezone) {
  const [categories, setCategories] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!restaurantId) return undefined;
    let alive = true;
    apiClient.getCategories(restaurantId)
      .then(r => { if (alive) setCategories(Array.isArray(r) ? r : (r?.categories || [])); })
      .catch(() => {});
    return () => { alive = false; };
  }, [restaurantId]);

  const timed = hasAnyTimings(items, categories);
  useEffect(() => {
    if (!timed) return undefined;
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [timed]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => applyMenuTimings(items, categories, timezone || undefined), [items, categories, timezone, tick]);
}
