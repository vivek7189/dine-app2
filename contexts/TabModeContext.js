import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from '../services/api';

const STORAGE_KEY = 'dine_tab_modes';

const DEFAULT_MODES = {
  home: 'webview',
  tables: 'webview',
  menu: 'webview',
  orders: 'webview',
  billing: 'webview',
};

const TabModeContext = createContext({
  modes: DEFAULT_MODES,
  setMode: () => {},
  loading: true,
});

export function TabModeProvider({ children }) {
  const [modes, setModes] = useState(DEFAULT_MODES);
  const [loading, setLoading] = useState(true);

  // Load saved modes on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setModes(prev => ({ ...prev, ...parsed }));
        }

        // Also try to load from user preferences on backend
        const user = await apiClient.getUser();
        if (user?.tabModes && typeof user.tabModes === 'object') {
          const merged = { ...DEFAULT_MODES, ...(stored ? JSON.parse(stored) : {}), ...user.tabModes };
          setModes(merged);
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } catch (e) {
        console.warn('[TabModeContext] Failed to load tab modes:', e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setMode = useCallback(async (tabName, mode) => {
    setModes(prev => {
      const next = { ...prev, [tabName]: mode };
      // Persist to AsyncStorage
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      // Sync to backend in background
      apiClient.updateUserPreferences({ tabModes: next }).catch((e) => {
        console.warn('[TabModeContext] Failed to sync to backend:', e.message);
      });
      return next;
    });
  }, []);

  return (
    <TabModeContext.Provider value={{ modes, setMode, loading }}>
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
