// (name) => screen label for a table name, e.g. "BAR" → "1 · BAR" (utils/tableLabel.js). Loads the
// restaurant's tables once and every 5 minutes. Until loaded, or when no table has a number, returns the name.
import { useCallback, useEffect, useState } from 'react';
import apiClient from '../services/api';
import { tableLabelMap, labelForTableName } from '../utils/tableLabel';

export default function useTableLabels(restaurantId) {
  const [map, setMap] = useState(null);
  useEffect(() => {
    if (!restaurantId) return undefined;
    let alive = true;
    const load = () => Promise.resolve(apiClient.getTables(restaurantId))
      .then((r) => { if (alive) setMap(tableLabelMap(r?.tables || (Array.isArray(r) ? r : []))); })
      .catch(() => {}); // labels are a nicety — the name still shows
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [restaurantId]);
  return useCallback((name) => labelForTableName(name, map), [map]);
}
