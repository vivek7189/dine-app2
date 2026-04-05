import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../hooks/useOffline';

export default function OfflineStatusBar() {
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

  // Hidden when online and idle
  if (!effectivelyOffline && syncStatus === 'idle') return null;

  // Determine bar state
  let backgroundColor, icon, message, onPress;

  if (syncStatus === 'syncing') {
    backgroundColor = '#3b82f6';
    icon = null; // use spinner
    message = `Syncing ${pendingCount} pending change${pendingCount !== 1 ? 's' : ''}...`;
    onPress = null;
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
});
