import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { runMigrations, getMeta, setMeta } from '../services/db';
import { initSyncEngine, syncAll, onSyncStatusChange, getSyncStats } from '../services/syncEngineV2';
import { revertSyncing, getQueueStats, retryAllFailed as retryAllFailedQueue, cleanupSynced } from '../services/syncQueueV2';
import apiClient from '../services/api';

const OFFLINE_MODE_KEY = 'dineopen_offline_mode';
const SYNC_DEBOUNCE_MS = 2000;
const STATS_POLL_INTERVAL_MS = 15000;

const OfflineContext = createContext({
  isOnline: true,
  isOfflineMode: false,
  effectivelyOffline: false,
  syncStatus: 'idle', // 'idle' | 'syncing' | 'error' | 'complete'
  pendingCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  dbReady: false,
  dataSeeded: false,
  toggleOfflineMode: () => {},
  triggerSync: () => {},
  retryFailed: () => {},
  getStats: () => ({ pending: 0, syncing: 0, failed: 0, total: 0 }),
});

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
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

  const effectivelyOffline = isOfflineMode || !isOnline;

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

        // Restore manual offline mode toggle
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
      } else if (online && !isOfflineMode && dbReady) {
        // Came back online — reset any error state and trigger sync
        setSyncStatus(prev => prev === 'error' || prev === 'syncing' ? 'idle' : prev);
        scheduleSyncDebounced();
      }
    });

    return () => unsubscribe();
  }, [isOfflineMode, dbReady]);

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
        isDbReady: () => dbReady,
      });
    }
  }, [effectivelyOffline, dbReady]);

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

  // Kick off an initial sync once DB is ready and we're online
  useEffect(() => {
    if (dbReady && isOnline && !isOfflineMode) {
      scheduleSyncDebounced();
    }
  }, [dbReady, isOnline, isOfflineMode, scheduleSyncDebounced]);

  const toggleOfflineMode = useCallback(async (value) => {
    const newValue = value !== undefined ? value : !isOfflineMode;
    setIsOfflineMode(newValue);
    await AsyncStorage.setItem(OFFLINE_MODE_KEY, String(newValue));

    // If turning off offline mode and we're online, trigger sync
    if (!newValue && isOnline) {
      scheduleSyncDebounced();
    }
  }, [isOfflineMode, isOnline]);

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
        isOfflineMode,
        effectivelyOffline,
        syncStatus,
        pendingCount,
        failedCount,
        lastSyncAt,
        dbReady,
        dataSeeded,
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
