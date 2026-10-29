import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';

// Per-login key: dine_tab_modes:<userId>. (The old phone-wide 'dine_tab_modes' is no longer read.)
const STORAGE_KEY = 'dine_tab_modes';

// Default all user-toggleable tabs (Home / Tables / Menu / Billing / Orders) to Native
// (classic) for every role. The Web View (modern) mode is opt-in — the user
// enables it per tab from More → Display.
const DEFAULT_MODES = {
  home: 'native',
  tables: 'native',
  menu: 'native',
  orders: 'native',
  billing: 'native',
};

const TabModeContext = createContext({
  modes: DEFAULT_MODES,
  forced: {},
  setMode: () => {},
  loading: true,
});

// The choice is kept PER LOGIN (owner / each staff member), not per phone — an owner switching to
// Web View no longer carries over to staff who log in on the same phone. Server sources (read on
// every login and when the app comes back to the front):
//   • this person's saved choice  — /api/user/page-access → tabModes
//   • forced for the whole restaurant from our side — → appTabModes (posSettings.appTabModes);
//     a forced tab can't be switched in More → Display.
const keyFor = (uid) => `${STORAGE_KEY}:${uid}`;
// Home had no native screen before, so every saved copy says home: 'webview' without anyone
// choosing it. A saved Home value counts only once the person picked it in More → Display
// (remembered per login on this phone); DineOpen's forced appTabModes always apply.
const homeChosenKey = (uid) => `dine_home_mode_chosen:${uid}`;
const onlyModes = (m) => {
  const out = {};
  if (m && typeof m === 'object') {
    for (const k of Object.keys(DEFAULT_MODES)) if (m[k] === 'native' || m[k] === 'webview') out[k] = m[k];
  }
  return out;
};

export function TabModeProvider({ children }) {
  const [own, setOwn] = useState(DEFAULT_MODES);   // this person's own choice
  const [forced, setForced] = useState({});        // set for the restaurant from our side
  const [loading, setLoading] = useState(true);
  const uidRef = React.useRef(null);

  const load = useCallback(async () => {
    try {
      const user = await apiClient.getUser();
      const uid = user?.id || user?._id || user?.userId || null;
      uidRef.current = uid;
      let local = null;
      if (uid) {
        try { const raw = await AsyncStorage.getItem(keyFor(uid)); if (raw) local = onlyModes(JSON.parse(raw)); } catch (_) {}
      }
      let homeChosen = false;
      if (uid) { try { homeChosen = (await AsyncStorage.getItem(homeChosenKey(uid))) === '1'; } catch (_) {} }
      // First paint: this person's last known choice (phone copy, else the copy from login).
      const first = { ...onlyModes(user?.tabModes), ...(local || {}) };
      if (!homeChosen) delete first.home;
      setOwn({ ...DEFAULT_MODES, ...first });
      try {
        const res = await apiClient.request('/api/user/page-access');
        const srv = onlyModes(res?.tabModes);
        const mine = { ...(Object.keys(srv).length ? srv : (local || onlyModes(user?.tabModes))) };
        if (!homeChosen) delete mine.home;
        setOwn({ ...DEFAULT_MODES, ...mine });
        setForced(onlyModes(res?.appTabModes));
        if (uid) AsyncStorage.setItem(keyFor(uid), JSON.stringify({ ...DEFAULT_MODES, ...mine })).catch(() => {});
      } catch (_) { /* offline: keep the phone copy for this person */ }
    } catch (e) {
      console.warn('[TabModeContext] Failed to load tab modes:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Pick up a change made from our side when the app comes back to the front.
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub?.remove?.();
  }, [load]);

  const setMode = useCallback((tabName, mode) => {
    if (forced[tabName]) return; // set for the restaurant — not switchable here
    if (tabName === 'home' && uidRef.current) AsyncStorage.setItem(homeChosenKey(uidRef.current), '1').catch(() => {});
    setOwn(prev => {
      const next = { ...prev, [tabName]: mode };
      if (uidRef.current) AsyncStorage.setItem(keyFor(uidRef.current), JSON.stringify(next)).catch(() => {});
      apiClient.updateUserPreferences({ tabModes: next }).catch((e) => {
        console.warn('[TabModeContext] Failed to sync to backend:', e.message);
      });
      return next;
    });
  }, [forced]);

  const modes = { ...own, ...forced };
  return (
    <TabModeContext.Provider value={{ modes, forced, setMode, loading }}>
      {children}
    </TabModeContext.Provider>
  );
}

/**
 * Get the current mode for a tab.
 * @param {string} tabName - One of: home, tables, menu, orders, billing
 * @returns {'native' | 'webview'}
 */
export function useTabMode(tabName) {
  const { modes } = useContext(TabModeContext);
  return modes[tabName] || 'webview';
}

/**
 * Get the setMode function to change a tab's mode.
 * @returns {(tabName: string, mode: 'native' | 'webview') => void}
 */
export function useSetTabMode() {
  const { setMode } = useContext(TabModeContext);
  return setMode;
}

/**
 * Get all tab modes (for the settings screen).
 * @returns {{ modes: object, setMode: function, loading: boolean }}
 */
export function useTabModes() {
  return useContext(TabModeContext);
}
