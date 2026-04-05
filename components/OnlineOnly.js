import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../hooks/useOffline';

/**
 * Wrapper component that disables children when offline.
 * Shows a "Requires Internet" badge instead.
 *
 * Usage:
 *   <OnlineOnly>
 *     <VoiceOrderButton />
 *   </OnlineOnly>
 *
 *   <OnlineOnly fallback={<CustomOfflineMessage />}>
 *     <AIFeature />
 *   </OnlineOnly>
 *
 *   <OnlineOnly mode="disable">
 *     <PaymentButton />  // Rendered but dimmed + not pressable
 *   </OnlineOnly>
 */
export default function OnlineOnly({
  children,
  fallback,
  mode = 'badge', // 'badge' | 'hide' | 'disable'
  badgeText = 'Requires Internet',
}) {
  const { effectivelyOffline } = useOffline();

  if (!effectivelyOffline) return children;

  if (mode === 'hide') return null;

  if (mode === 'disable') {
    return (
      <View style={styles.disabledContainer} pointerEvents="none">
        <View style={styles.dimmed}>{children}</View>
        <View style={styles.badge}>
          <Ionicons name="cloud-offline-outline" size={10} color="#6b7280" />
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      </View>
    );
  }

  // mode === 'badge'
  if (fallback) return fallback;

  return (
    <View style={styles.badgeContainer}>
      <Ionicons name="cloud-offline-outline" size={14} color="#6b7280" />
      <Text style={styles.badgeLargeText}>{badgeText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledContainer: {
    position: 'relative',
  },
  dimmed: {
    opacity: 0.4,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  badgeText: {
    fontSize: 9,
    color: '#6b7280',
    fontWeight: '600',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  badgeLargeText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
});
