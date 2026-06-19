import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import apiClient from '../../services/api';
import PrinterSetup from '../../components/PrinterSetup';
import PrintSettings from '../../components/PrintSettings';
import { useResponsive } from '../../hooks/useResponsive';
import { getPrintNotificationsEnabled, setPrintNotificationsEnabled, getRemotePrintEnabled, setRemotePrintEnabled, getDisconnectAlertEnabled, setDisconnectAlertEnabled } from '../../services/printerService';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || 'unknown';

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [restaurantId, setRestaurantId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [multiStationCount, setMultiStationCount] = useState(0);
  const [printNotifEnabled, setPrintNotifEnabled] = useState(true);
  const [remotePrintOn, setRemotePrintOn] = useState(false);
  const [remotePrintSaving, setRemotePrintSaving] = useState(false);
  const [disconnectAlertOn, setDisconnectAlertOn] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const userData = await apiClient.getUser();
        const rid = userData?.restaurantId || userData?.restaurant?.id;
        if (rid) setRestaurantId(rid);
        setUserRole(userData?.role || null);
        const notifPref = await getPrintNotificationsEnabled();
        setPrintNotifEnabled(notifPref);
        const remotePref = await getRemotePrintEnabled();
        setRemotePrintOn(remotePref);
        const disconnectAlertPref = await getDisconnectAlertEnabled();
        setDisconnectAlertOn(disconnectAlertPref);
      } catch (e) {
        console.error('Error loading user for printer settings:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch print station config to show multi-station info banner
  useEffect(() => {
    if (!restaurantId) return;
    apiClient.getPrintStations(restaurantId).then(res => {
      if (res?.success) {
        const enabled = (res.printStations || []).filter(s => s.enabled);
        setMultiStationCount(enabled.length);
      }
    }).catch(() => {});
  }, [restaurantId]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Printer Settings</Text>
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Loading printer settings...</Text>
        </View>
      ) : !restaurantId ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#d1d5db" />
          <Text style={styles.loadingText}>Could not load restaurant info</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: 600, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Multi-station info banner */}
          {multiStationCount >= 2 && (
            <View style={styles.multiStationBanner}>
              <Ionicons name="information-circle" size={20} color="#2563eb" />
              <View style={{ flex: 1 }}>
                <Text style={styles.multiStationTitle}>Multi-Station KOT Routing Active</Text>
                <Text style={styles.multiStationText}>
                  KOT prints will be handled by the main POS machine. Your connected printer will be used for bill printing only.
                </Text>
                <Text style={styles.multiStationHint}>Contact admin to change station settings.</Text>
              </View>
            </View>
          )}

          {/* Print from Desktop App */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: '#2563eb' }]}>
                <Ionicons name="desktop-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Print from Desktop</Text>
            </View>
            <View style={styles.notifCard}>
              <View style={styles.notifRow}>
                <View style={[styles.notifIconWrap, { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name="laptop-outline" size={18} color="#2563eb" />
                </View>
                <View style={styles.notifInfo}>
                  <Text style={styles.notifLabel}>Print from Desktop App</Text>
                  <Text style={styles.notifHint}>
                    KOT and bills will print from your Electron desktop terminal instead of this device
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {remotePrintSaving && <ActivityIndicator size="small" color="#2563eb" />}
                  <Switch
                    value={remotePrintOn}
                    onValueChange={async (val) => {
                      if (val && restaurantId) {
                        // First check if server-side RTDB settings are already enabled
                        setRemotePrintSaving(true);
                        try {
                          const res = await apiClient.getPrintSettings(restaurantId);
                          const ps = res?.printSettings || res || {};
                          if (!ps.usePusherForKOT) {
                            // Try to enable server settings (only works for owner/admin)
                            try {
                              await apiClient.updatePrintSettings(restaurantId, {
                                usePusherForKOT: true,
                                autoPrintOnKOT: true,
                                autoPrintOnBilling: true,
                              });
                            } catch (e) {
                              // Non-admin role — can't update server settings
                              setRemotePrintSaving(false);
                              Alert.alert(
                                'Setup Required',
                                'Ask your admin/owner to enable "Real-time Print Events" from Admin Settings → Print tab first. Then you can enable this toggle.',
                              );
                              return; // Don't enable the toggle
                            }
                          }
                        } catch (e) {
                          console.warn('Failed to check print settings:', e.message);
                        } finally {
                          setRemotePrintSaving(false);
                        }
                      }
                      setRemotePrintOn(val);
                      setRemotePrintEnabled(val);
                    }}
                    trackColor={{ false: '#e5e7eb', true: '#2563eb40' }}
                    thumbColor={remotePrintOn ? '#2563eb' : '#d1d5db'}
                  />
                </View>
              </View>
              {remotePrintOn && (
                <View style={styles.remotePrintInfo}>
                  <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                  <Text style={styles.remotePrintInfoText}>
                    Printing is handled by your desktop terminal. Make sure the Electron app is running with a printer connected. If the desktop app was already open, refresh the page to pick up the new settings.
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Printer Connection — hidden when printing from desktop */}
          {!remotePrintOn && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="print-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Printer Connection</Text>
            </View>
            <PrinterSetup restaurantId={restaurantId} />
          </View>
          )}

          {/* Print Behavior Settings — always visible */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: '#8b5cf6' }]}>
                <Ionicons name="options-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Print Behavior</Text>
            </View>
            <PrintSettings restaurantId={restaurantId} />
          </View>

          {/* Device Notifications */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: '#f59e0b' }]}>
                <Ionicons name="notifications-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Notifications</Text>
            </View>
            <View style={styles.notifCard}>
              <View style={styles.notifRow}>
                <View style={[styles.notifIconWrap, { backgroundColor: '#fef3c7' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#f59e0b" />
                </View>
                <View style={styles.notifInfo}>
                  <Text style={styles.notifLabel}>Print Failure Notifications</Text>
                  <Text style={styles.notifHint}>Show toast notification when a print job fails (e.g. printer disconnected)</Text>
                </View>
                <Switch
                  value={printNotifEnabled}
                  onValueChange={(val) => {
                    setPrintNotifEnabled(val);
                    setPrintNotificationsEnabled(val);
                  }}
                  trackColor={{ false: '#e5e7eb', true: '#fbbf2440' }}
                  thumbColor={printNotifEnabled ? '#f59e0b' : '#d1d5db'}
                />
              </View>
            </View>
            {/* Disconnect alert toggle — only relevant when remote print is OFF */}
            {!remotePrintOn && (
              <>
                <View style={{ height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 14 }} />
                <View style={styles.notifRow}>
                  <View style={[styles.notifIconWrap, { backgroundColor: '#fef2f2' }]}>
                    <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
                  </View>
                  <View style={styles.notifInfo}>
                    <Text style={styles.notifLabel}>Printer Disconnect Alert</Text>
                    <Text style={styles.notifHint}>Show alert when printer connection is lost (local printing mode)</Text>
                  </View>
                  <Switch
                    value={disconnectAlertOn}
                    onValueChange={(val) => {
                      setDisconnectAlertOn(val);
                      setDisconnectAlertEnabled(val);
                    }}
                    trackColor={{ false: '#e5e7eb', true: '#ef444440' }}
                    thumbColor={disconnectAlertOn ? '#ef4444' : '#d1d5db'}
                  />
                </View>
              </>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={14} color="#9ca3af" />
            <Text style={styles.footerText}>
              Print settings are synced across all devices for this restaurant.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ece8e1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },
  versionText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginLeft: 2,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  notifCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifInfo: {
    flex: 1,
  },
  notifLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  notifHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
    lineHeight: 16,
  },
  remotePrintInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  remotePrintInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#16a34a',
    lineHeight: 17,
  },
  multiStationBanner: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  multiStationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 4,
  },
  multiStationText: {
    fontSize: 12,
    color: '#1e3a5f',
    lineHeight: 18,
  },
  multiStationHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
});
