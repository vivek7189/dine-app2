import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { runMigrations, getMeta, setMeta } from '../services/db';
import { initSyncEngine, syncAll, onSyncStatusChange, getSyncStats } from '../services/syncEngineV2';
import { revertSyncing, getQueueStats, retryAllFailed as retryAllFailedQueue, cleanupSynced } from '../services/syncQueueV2';
import apiClient from '../services/api';

const OFFLINE_ENABLED_KEY = 'dineopen_offline_enabled'; // master switch — off by default
const OFFLINE_MODE_KEY = 'dineopen_offline_mode'; // force-offline toggle (only when enabled)
const SYNC_DEBOUNCE_MS = 2000;
const STATS_POLL_INTERVAL_MS = 15000;

const OfflineContext = createContext({
  isOnline: true,
  offlineEnabled: false,
  isOfflineMode: false,
  effectivelyOffline: false,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'error' | 'complete'
  pendingCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  dbReady: false,
  dataSeeded: false,
  toggleOfflineEnabled: () => {},
  toggleOfflineMode: () => {},
  triggerSync: () => {},
  retryFailed: () => {},
  getStats: () => ({ pending: 0, syncing: 0, failed: 0, total: 0 }),
});

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [offlineEnabled, setOfflineEnabledState] = useState(false); // master switch — off by default
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [dataSeeded, setDataSeeded] = useState(false);

  const syncTimeoutRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const prevIsOnlineRef = useRef(true);

  // Only consider offline when offline support is explicitly enabled
  const effectivelyOffline = offlineEnabled && (isOfflineMode || !isOnline);

  // Initialize database and sync engine on mount
  useEffect(() => {
    (async () => {
      try {
        runMigrations();
        initSyncEngine();
        setDbReady(true);

        // Check if data was previously seeded
        const seeded = getMeta('data_seeded');
        setDataSeeded(seeded === 'true');

        // Check last sync time
        const lastSync = getMeta('last_sync_at');
        if (lastSync) setLastSyncAt(parseInt(lastSync, 10));

        // Restore offline-enabled master switch (default: off)
        const savedEnabled = await AsyncStorage.getItem(OFFLINE_ENABLED_KEY);
        if (savedEnabled === 'true') setOfflineEnabledState(true);

        // Restore manual offline mode toggle (only relevant when offlineEnabled)
        const savedMode = await AsyncStorage.getItem(OFFLINE_MODE_KEY);
        if (savedMode === 'true') setIsOfflineMode(true);

        // Update queue stats
        updateStats();
      } catch (e) {
        console.error('Offline provider init error:', e);
        setDbReady(true); // Still allow app to work
      }
    })();

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    };
  }, []);

  // Subscribe to network changes
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected;
      const wasOffline = !prevIsOnlineRef.current;
      prevIsOnlineRef.current = online;
      setIsOnline(online);

      if (!online) {
        // Network just dropped — if we were syncing, reset status so banner doesn't stick
        setSyncStatus(prev => prev === 'syncing' ? 'error' : prev);
        stopStatsPoll();
      } else if (online && offlineEnabled && !isOfflineMode && dbReady) {
        // Came back online — reset any error state and trigger sync (only if offline support enabled)
        setSyncStatus(prev => prev === 'error' || prev === 'syncing' ? 'idle' : prev);
        scheduleSyncDebounced();
      }
    });

    return () => unsubscribe();
  }, [offlineEnabled, isOfflineMode, dbReady]);

  // Subscribe to sync engine events
  useEffect(() => {
    const unsubscribe = onSyncStatusChange(event => {
      switch (event.type) {
        case 'sync_started':
          setSyncStatus('syncing');
          startStatsPoll();
          break;
        case 'sync_complete':
          setSyncStatus(event.failedCount > 0 ? 'error' : 'complete');
          setPendingCount(event.pendingCount || 0);
          setLastSyncAt(Date.now());
          setMeta('last_sync_at', String(Date.now()));
          stopStatsPoll();
          updateStats();
          // Auto-hide 'complete' status after 3 seconds
          if (event.failedCount === 0) {
            setTimeout(() => setSyncStatus('idle'), 3000);
          }
          break;
        case 'sync_error':
          setSyncStatus('error');
          stopStatsPoll();
          updateStats();
          break;
        case 'auth_required':
          setSyncStatus('error');
          stopStatsPoll();
          break;
        case 'item_synced':
        case 'item_failed':
          updateStats();
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  // Pass offline state to apiClient
  useEffect(() => {
    if (dbReady) {
      apiClient.setOfflineState({
        isEffectivelyOffline: () => effectivelyOffline,
        isOfflineEnabled: () => offlineEnabled,
        isDbReady: () => dbReady,
      });
    }
  }, [effectivelyOffline, offlineEnabled, dbReady]);

  const updateStats = useCallback(() => {
    try {
      const stats = getQueueStats();
      setPendingCount(stats.pending);
      setFailedCount(stats.failed);
    } catch (e) {
      // Ignore if DB not ready
    }
  }, []);

  const startStatsPoll = useCallback(() => {
    stopStatsPoll();
    statsIntervalRef.current = setInterval(updateStats, STATS_POLL_INTERVAL_MS);
  }, [updateStats]);

  const stopStatsPoll = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
  }, []);

  const triggerSyncRef = useRef(null);

  const triggerSync = useCallback(async () => {
    if (effectivelyOffline) return;
    try {
      // Also clean up old synced items
      cleanupSynced();
      await syncAll(apiClient);
    } catch (e) {
      console.error('Manual sync trigger error:', e);
    }
  }, [effectivelyOffline]);

  useEffect(() => { triggerSyncRef.current = triggerSync; }, [triggerSync]);

  const scheduleSyncDebounced = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      if (triggerSyncRef.current) triggerSyncRef.current();
    }, SYNC_DEBOUNCE_MS);
  }, []);

  // Kick off an initial sync once DB is ready and we're online (only if offline support enabled)
  useEffect(() => {
    if (dbReady && isOnline && offlineEnabled && !isOfflineMode) {
      scheduleSyncDebounced();
    }
  }, [dbReady, isOnline, offlineEnabled, isOfflineMode, scheduleSyncDebounced]);

  // Start background pull to keep local data fresh (only when offline support is enabled)
  useEffect(() => {
    if (dbReady && offlineEnabled && !isOfflineMode) {
      (async () => {
        try {
          const user = await apiClient.getUser();
          const restaurantId = user?.restaurantId || user?.restaurant?.id || getMeta('seeded_restaurant_id');
          if (restaurantId) {
            apiClient.startBackgroundPull(restaurantId);
          }
        } catch {
          // ignore
        }
      })();
    }

    return () => {
      apiClient.stopBackgroundPull();
    };
  }, [dbReady, offlineEnabled, isOfflineMode]);

  const toggleOfflineEnabled = useCallback(async (value) => {
    const newValue = value !== undefined ? value : !offlineEnabled;
    setOfflineEnabledState(newValue);
    await AsyncStorage.setItem(OFFLINE_ENABLED_KEY, String(newValue));

    if (!newValue) {
      // Turning off offline support — stop background pull, clear force-offline
      apiClient.stopBackgroundPull();
      setIsOfflineMode(false);
      await AsyncStorage.setItem(OFFLINE_MODE_KEY, 'false');
    } else if (newValue && isOnline) {
      // Turning on offline support — start syncing
      scheduleSyncDebounced();
    }
  }, [offlineEnabled, isOnline]);

  const toggleOfflineMode = useCallback(async (value) => {
    if (!offlineEnabled) return; // force-offline only available when offline support is enabled
    const newValue = value !== undefined ? value : !isOfflineMode;
    setIsOfflineMode(newValue);
    await AsyncStorage.setItem(OFFLINE_MODE_KEY, String(newValue));

    // If turning off offline mode and we're online, trigger sync
    if (!newValue && isOnline) {
      scheduleSyncDebounced();
    }
  }, [offlineEnabled, isOfflineMode, isOnline]);

  const retryFailed = useCallback(async () => {
    retryAllFailedQueue();
    updateStats();
    if (!effectivelyOffline) {
      triggerSync();
    }
  }, [effectivelyOffline, triggerSync, updateStats]);

  const getStats = useCallback(() => {
    try {
      return getQueueStats();
    } catch {
      return { pending: 0, syncing: 0, failed: 0, total: 0 };
    }
  }, []);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        offlineEnabled,
        isOfflineMode,
        effectivelyOffline,
        syncStatus,
        pendingCount,
        failedCount,
        lastSyncAt,
        dbReady,
        dataSeeded,
        toggleOfflineEnabled,
        toggleOfflineMode,
        triggerSync,
        retryFailed,
        getStats,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

/**
 * Hook to access offline state from any component.
 */
export function useOffline() {
  return useContext(OfflineContext);
}
