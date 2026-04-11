import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../hooks/useOffline';
import SyncDetailsSheet from './SyncDetailsSheet';

export default function OfflineStatusBar() {
  const [showDetails, setShowDetails] = useState(false);
  const {
    isOnline,
    isOfflineMode,
    effectivelyOffline,
    syncStatus,
    pendingCount,
    failedCount,
    toggleOfflineMode,
    retryFailed,
    triggerSync,
  } = useOffline();

  // Compact mode: just show a small online/offline icon chip
  // Expanded mode: show full bar when there's something to report
  const hasActivity =
    syncStatus === 'syncing' ||
    syncStatus === 'error' ||
    syncStatus === 'complete' ||
    failedCount > 0 ||
    pendingCount > 0 ||
    effectivelyOffline;

  if (!hasActivity) {
    // Online + idle: tiny green chip so user always sees net is fine
    return (
      <>
        <View style={styles.compactWrap}>
          <TouchableOpacity
            style={[styles.compactChip, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}
            onPress={() => setShowDetails(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
            <Ionicons name="wifi" size={11} color="#15803d" style={{ marginLeft: 4 }} />
            <Text style={[styles.compactText, { color: '#15803d' }]}>Online</Text>
          </TouchableOpacity>
        </View>
        <SyncDetailsSheet visible={showDetails} onClose={() => setShowDetails(false)} />
      </>
    );
  }

  // Determine expanded bar state
  let backgroundColor, icon, message, onPress;

  if (syncStatus === 'syncing') {
    backgroundColor = '#3b82f6';
    icon = null; // use spinner
    message = `Syncing ${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}... Tap for details`;
    onPress = () => setShowDetails(true);
  } else if (syncStatus === 'error' || failedCount > 0) {
    backgroundColor = '#ef4444';
    icon = 'alert-circle';
    message = `${failedCount} change${failedCount !== 1 ? 's' : ''} failed to sync. Tap to retry.`;
    onPress = retryFailed;
  } else if (syncStatus === 'complete') {
    backgroundColor = '#22c55e';
    icon = 'checkmark-circle';
    message = 'All changes synced.';
    onPress = null;
  } else if (isOfflineMode) {
    backgroundColor = '#f59e0b';
    icon = 'cloud-offline';
    message = 'Offline mode enabled. Tap to reconnect.';
    onPress = () => toggleOfflineMode(false);
  } else if (!isOnline) {
    backgroundColor = '#ef4444';
    icon = 'cloud-offline';
    message = 'No internet connection. Working offline.';
    onPress = null;
  } else if (pendingCount > 0) {
    backgroundColor = '#3b82f6';
    icon = 'cloud-upload';
    message = `${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}. Tap to sync.`;
    onPress = triggerSync;
  } else {
    return null;
  }

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <>
      <Wrapper
        style={[styles.container, { backgroundColor }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {syncStatus === 'syncing' ? (
          <ActivityIndicator size="small" color="#fff" style={styles.icon} />
        ) : icon ? (
          <Ionicons name={icon} size={16} color="#fff" style={styles.icon} />
        ) : null}
        <Text style={styles.text} numberOfLines={1}>{message}</Text>
      </Wrapper>
      <SyncDetailsSheet visible={showDetails} onClose={() => setShowDetails(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  compactWrap: {
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 0,
  },
  compactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.3,
  },
});
