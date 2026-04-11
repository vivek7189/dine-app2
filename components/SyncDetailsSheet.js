import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../hooks/useOffline';
import { getFailedItems, deleteItem, getSyncLogs, getPendingItems } from '../services/syncQueueV2';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/Theme';

export default function SyncDetailsSheet({ visible, onClose }) {
  const { pendingCount, failedCount, lastSyncAt, retryFailed, triggerSync, isOnline } = useOffline();

  const failedItems = visible ? getFailedItems() : [];
  const pendingItems = visible ? getPendingItems() : [];
  const logs = visible ? getSyncLogs(20) : [];

  const formatTime = (ts) => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const handleDiscard = (idempotencyKey) => {
    Alert.alert(
      'Discard Change',
      'This change will be permanently lost. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => deleteItem(idempotencyKey),
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Sync Status</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textDark} />
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={styles.summary}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{pendingCount}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, failedCount > 0 && { color: '#ef4444' }]}>{failedCount}</Text>
              <Text style={styles.statLabel}>Failed</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statTime}>{formatTime(lastSyncAt)}</Text>
              <Text style={styles.statLabel}>Last Sync</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {isOnline && pendingCount > 0 && (
              <TouchableOpacity style={styles.syncButton} onPress={triggerSync}>
                <Ionicons name="cloud-upload" size={16} color="#fff" />
                <Text style={styles.syncButtonText}>Sync Now</Text>
              </TouchableOpacity>
            )}
            {failedCount > 0 && (
              <TouchableOpacity style={styles.retryButton} onPress={retryFailed}>
                <Ionicons name="refresh" size={16} color="#3b82f6" />
                <Text style={styles.retryButtonText}>Retry All Failed</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.scrollArea}>
            {/* Pending Items */}
            {pendingItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Pending Changes</Text>
                {pendingItems.map((item) => (
                  <View key={item.idempotency_key} style={[styles.failedItem, { backgroundColor: '#eff6ff' }]}>
                    <View style={styles.failedInfo}>
                      <Text style={styles.failedType}>
                        {item.entity_type} ({item.operation})
                      </Text>
                      <Text style={[styles.failedError, { color: '#3b82f6' }]} numberOfLines={2}>
                        {item.endpoint}
                      </Text>
                      <Text style={styles.failedMeta}>
                        Retries: {item.retry_count} | {formatTime(item.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDiscard(item.idempotency_key)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Failed Items */}
            {failedItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Failed Changes</Text>
                {failedItems.map((item) => (
                  <View key={item.idempotency_key} style={styles.failedItem}>
                    <View style={styles.failedInfo}>
                      <Text style={styles.failedType}>
                        {item.entity_type} ({item.operation})
                      </Text>
                      <Text style={styles.failedError} numberOfLines={2}>
                        {item.last_error || 'Unknown error'}
                      </Text>
                      <Text style={styles.failedMeta}>
                        Retries: {item.retry_count} | {formatTime(item.created_at)}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDiscard(item.idempotency_key)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Recent Sync Log */}
            {logs.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                {logs.map((log, i) => (
                  <View key={log.id || i} style={styles.logItem}>
                    <Ionicons
                      name={log.action === 'synced' ? 'checkmark-circle' : log.action === 'failed' ? 'alert-circle' : 'time'}
                      size={14}
                      color={log.action === 'synced' ? '#22c55e' : log.action === 'failed' ? '#ef4444' : '#6b7280'}
                    />
                    <Text style={styles.logText}>
                      {log.entity_type || 'item'} {log.action}
                    </Text>
                    <Text style={styles.logTime}>{formatTime(log.created_at)}</Text>
                  </View>
                ))}
              </View>
            )}

            {failedItems.length === 0 && logs.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                <Text style={styles.emptyText}>All synced! No pending changes.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    ...Typography.h3,
    color: Colors.textDark,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  statBox: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textDark,
  },
  statTime: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textLight,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.medium,
  },
  syncButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.medium,
  },
  retryButtonText: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 14,
  },
  scrollArea: {
    maxHeight: 400,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textLight,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  failedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: BorderRadius.medium,
    padding: 12,
    marginBottom: 8,
  },
  failedInfo: {
    flex: 1,
    marginRight: 10,
  },
  failedType: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
    textTransform: 'capitalize',
  },
  failedError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2,
  },
  failedMeta: {
    fontSize: 11,
    color: Colors.textLight,
    marginTop: 4,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  logText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMedium,
    textTransform: 'capitalize',
  },
  logTime: {
    fontSize: 11,
    color: Colors.textLight,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textMedium,
    marginTop: 12,
  },
});
