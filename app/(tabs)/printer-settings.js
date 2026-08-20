import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import apiClient from '../../services/api';
import PrinterSetup from '../../components/PrinterSetup';
import PrintSettings from '../../components/PrintSettings';
import { useResponsive } from '../../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import usePrinterStatus from '../../hooks/usePrinterStatus';
import { getPrintNotificationsEnabled, setPrintNotificationsEnabled, getRemotePrintEnabled, setRemotePrintEnabled, getDisconnectAlertEnabled, setDisconnectAlertEnabled, discoverNetworkPrinters, scanSubnetForPrinters, printToStationPrinter } from '../../services/printerService';
import { getLocalKotPrintingEnabled, setLocalKotPrintingEnabled, getStationPrinters, saveStationPrinter, removeStationPrinter, hydrateFromServer } from '../../services/multiPrinterService';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || 'unknown';

// Station type display config
const STATION_TYPE_CONFIG = {
  kitchen: { icon: 'flame-outline', color: '#ef4444', bg: '#fef2f2', label: 'Kitchen' },
  bar: { icon: 'beer-outline', color: '#8b5cf6', bg: '#f5f3ff', label: 'Bar' },
  expo: { icon: 'layers-outline', color: '#f59e0b', bg: '#fffbeb', label: 'Expo' },
  pastry: { icon: 'cafe-outline', color: '#ec4899', bg: '#fdf2f8', label: 'Pastry' },
  grill: { icon: 'bonfire-outline', color: '#f97316', bg: '#fff7ed', label: 'Grill' },
  drinks: { icon: 'wine-outline', color: '#06b6d4', bg: '#ecfeff', label: 'Drinks' },
  packing: { icon: 'cube-outline', color: '#6366f1', bg: '#eef2ff', label: 'Packing' },
};

const getStationTypeConfig = (type) => STATION_TYPE_CONFIG[type] || { icon: 'grid-outline', color: '#6b7280', bg: '#f9fafb', label: type || 'Station' };

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets(); // real top inset → header clears the notch/Dynamic Island
  const [restaurantId, setRestaurantId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [multiStationCount, setMultiStationCount] = useState(0);
  const [printStations, setPrintStations] = useState([]);
  const [printNotifEnabled, setPrintNotifEnabled] = useState(true);
  const [remotePrintOn, setRemotePrintOn] = useState(false);
  const [remotePrintSaving, setRemotePrintSaving] = useState(false);
  const [disconnectAlertOn, setDisconnectAlertOn] = useState(true);

  // Multi-station local printing
  const [localKotPrinting, setLocalKotPrinting] = useState(false);
  const [stationPrinterMap, setStationPrinterMap] = useState({}); // { stationId: { type, host, port } }
  const [syncing, setSyncing] = useState(false); // fetching shared printer config from server
  const printerHealth = usePrinterStatus(); // live connection status (probed, auto-heals)
  const [scanningStationId, setScanningStationId] = useState(null);
  const [discoveredPrinters, setDiscoveredPrinters] = useState([]);
  const [manualIpStation, setManualIpStation] = useState(null); // stationId showing manual IP input
  const [manualIpValue, setManualIpValue] = useState('');
  const [manualPortValue, setManualPortValue] = useState('9100');
  const [testingStationId, setTestingStationId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const userData = await apiClient.getUser();
        let rid = userData?.restaurantId || userData?.restaurant?.id;
        // Owner accounts don't carry a single restaurantId until they pick one
        // (in the "More" tab). Fall back to the owner's restaurant list so this
        // screen still works without first visiting More. (Mirrors more.js.)
        if (!rid) {
          try {
            const restResponse = await apiClient.getRestaurants();
            const restList = restResponse?.restaurants || [];
            if (restList.length === 1) {
              rid = restList[0].id;
            } else if (restList.length > 1) {
              rid = userData?.defaultRestaurantId || restList[0].id;
            }
          } catch (e) {
            console.warn('Could not fetch owner restaurants for printer settings:', e.message);
          }
        }
        if (rid) setRestaurantId(rid);
        setUserRole(userData?.role || null);
        const notifPref = await getPrintNotificationsEnabled();
        setPrintNotifEnabled(notifPref);
        const remotePref = await getRemotePrintEnabled();
        setRemotePrintOn(remotePref);
        const disconnectAlertPref = await getDisconnectAlertEnabled();
        setDisconnectAlertOn(disconnectAlertPref);
        const localKotPref = await getLocalKotPrintingEnabled();
        setLocalKotPrinting(localKotPref);
        const savedStationPrinters = await getStationPrinters();
        setStationPrinterMap(savedStationPrinters);
      } catch (e) {
        console.error('Error loading user for printer settings:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch print station config to show multi-station info banner.
  // Also auto-hydrate printers saved on other devices (desktop) into any EMPTY local slot —
  // fill-only, so a printer this device already has is never touched.
  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      try { await hydrateFromServer(restaurantId); } catch (_) { /* best-effort */ }
      try {
        const res = await apiClient.getPrintStations(restaurantId);
        if (res?.success) {
          const enabled = (res.printStations || []).filter(s => s.enabled);
          setMultiStationCount(enabled.length);
          setPrintStations(enabled);
        }
      } catch (_) { /* ignore */ }
      try { setStationPrinterMap(await getStationPrinters()); } catch (_) { /* ignore */ }
    })();
  }, [restaurantId]);

  // Manual: pull the printer setup (single + per-station) the desktop saved on the server.
  const handleSyncFromServer = useCallback(async () => {
    if (!restaurantId || syncing) return;
    setSyncing(true);
    try {
      const r = await hydrateFromServer(restaurantId);
      try { setStationPrinterMap(await getStationPrinters()); } catch (_) {}
      const got = (r?.stationsSet || 0) + (r?.singleSet ? 1 : 0);
      Alert.alert(
        'Fetched from server',
        got > 0
          ? `${r.stationsSet} station printer${r.stationsSet === 1 ? '' : 's'}${r.singleSet ? ' + single printer' : ''} fetched. You can still change any printer below.`
          : 'Nothing new to fetch — this device is already up to date, or the desktop hasn’t saved any network printers yet.'
      );
    } catch (e) {
      Alert.alert('Fetch failed', e?.message || 'Could not fetch printer setup from the server.');
    } finally {
      setSyncing(false);
    }
  }, [restaurantId, syncing]);

  // Scan for WiFi printers for a station
  const handleScanForStation = useCallback(async (stationId) => {
    setScanningStationId(stationId);
    setDiscoveredPrinters([]);
    setManualIpStation(null);

    try {
      // First try mDNS/Bonjour discovery
      const mdnsPrinters = await discoverNetworkPrinters(5000);
      const networkOnly = (mdnsPrinters || []).filter(p => p.type === 'network' || p.host);
      setDiscoveredPrinters(networkOnly);

      // Then do subnet scan in background for printers not advertising via mDNS
      scanSubnetForPrinters((printer) => {
        setDiscoveredPrinters(prev => {
          const exists = prev.some(p => p.host === printer.host || p.id === printer.id);
          if (exists) return prev;
          return [...prev, { ...printer, type: 'network' }];
        });
      }, 8000).catch(() => {});
    } catch (err) {
      console.warn('Network printer scan failed:', err.message);
    }
  }, []);

  // Assign a discovered printer to a station
  const handleAssignPrinter = useCallback(async (stationId, printer) => {
    const config = {
      type: 'network',
      host: printer.host || printer.address,
      port: printer.port || 9100,
      name: printer.name || printer.host || 'Network Printer',
    };
    await saveStationPrinter(stationId, config);
    setStationPrinterMap(prev => ({ ...prev, [stationId]: config }));
    setScanningStationId(null);
    setDiscoveredPrinters([]);
  }, []);

  // Assign manual IP to a station
  const handleAssignManualIp = useCallback(async (stationId) => {
    const host = manualIpValue.trim();
    if (!host) return;
    const port = parseInt(manualPortValue, 10) || 9100;
    const config = {
      type: 'network',
      host,
      port,
      name: `${host}:${port}`,
    };
    await saveStationPrinter(stationId, config);
    setStationPrinterMap(prev => ({ ...prev, [stationId]: config }));
    setManualIpStation(null);
    setManualIpValue('');
    setManualPortValue('9100');
    setScanningStationId(null);
    setDiscoveredPrinters([]);
  }, [manualIpValue, manualPortValue]);

  // Remove station printer assignment
  const handleRemoveStationPrinter = useCallback(async (stationId) => {
    await removeStationPrinter(stationId);
    setStationPrinterMap(prev => {
      const next = { ...prev };
      delete next[stationId];
      return next;
    });
  }, []);

  // Test print to a specific station printer
  const handleTestStationPrint = useCallback(async (stationId, stationName) => {
    const config = stationPrinterMap[stationId];
    if (!config) {
      Alert.alert('No Printer', 'Assign a printer to this station first.');
      return;
    }
    setTestingStationId(stationId);
    try {
      const testText = [
        '--------------------------------',
        '       STATION PRINTER TEST',
        '--------------------------------',
        '',
        `  Station: ${stationName}`,
        `  Printer: ${config.host}:${config.port}`,
        `  Date: ${new Date().toLocaleString('en-IN')}`,
        `  Platform: ${Platform.OS}`,
        '',
        '--------------------------------',
        '    If you can read this,',
        '    the station printer is',
        '    working correctly!',
        '',
        '--------------------------------',
      ].join('\n');

      const result = await printToStationPrinter(config, testText);
      if (result.success) {
        Alert.alert('Success', `Test page printed to ${stationName} printer.`);
      } else {
        Alert.alert('Print Failed', result.error || `Could not reach printer at ${config.host}:${config.port}. Check the printer is on and connected to the same WiFi network.`);
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Test print failed.');
    } finally {
      setTestingStationId(null);
    }
  }, [stationPrinterMap]);

  return (
    <View style={styles.container}>
      {/* Header — paddingTop from the real safe-area inset so the back button never hides under
          the status bar / notch / Dynamic Island (the fixed 56px wasn't enough on newer iPhones). */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
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
          {/* Live printer connection status — probed, not assumed. Green/amber/red + tap to recheck. */}
          {(() => {
            const st = printerHealth?.status || 'none';
            const map = {
              connected:    { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'checkmark-circle', label: 'Printer connection verified' },
              checking:     { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'sync',              label: 'Checking printer…' },
              disconnected: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: 'close-circle',      label: 'Printer disconnected' },
              none:         { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', icon: 'print-outline',      label: 'No printer set up' },
            };
            const s = map[st] || map.none;
            const secs = printerHealth?.lastChecked ? Math.max(0, Math.round((Date.now() - printerHealth.lastChecked) / 1000)) : null;
            return (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => printerHealth?.recheck?.()}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
                  padding: 14, borderRadius: 12, borderWidth: 1, borderColor: s.border, backgroundColor: s.bg,
                }}
              >
                <Ionicons name={s.icon} size={22} color={s.color} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: s.color, fontWeight: '800', fontSize: 14 }}>{s.label}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 11.5, marginTop: 2 }}>
                    {st === 'disconnected'
                      ? 'Tap to reconnect — reconnect before taking orders.'
                      : st === 'connected'
                        ? `Live check${secs != null ? ` · ${secs < 5 ? 'just now' : secs + 's ago'}` : ''} · tap to re-check`
                        : st === 'checking'
                          ? 'Verifying the connection…'
                          : 'Connect a printer below.'}
                  </Text>
                </View>
                {st !== 'checking' && <Ionicons name="refresh" size={18} color={s.color} />}
              </TouchableOpacity>
            );
          })()}

          {/* Fetch the printer setup (single printer + stations) saved on the desktop / other devices,
              so this device doesn't have to be set up again. ALWAYS visible (single or multi). */}
          <TouchableOpacity
            onPress={handleSyncFromServer}
            disabled={syncing}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14,
              padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff', opacity: syncing ? 0.6 : 1,
            }}
          >
            <Ionicons name={syncing ? 'sync' : 'cloud-download-outline'} size={20} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#1e40af', fontWeight: '800', fontSize: 14 }}>
                {syncing ? 'Fetching…' : 'Fetch printer setup from server'}
              </Text>
              <Text style={{ color: '#3b82f6', fontSize: 11.5, marginTop: 2 }}>
                Pull the printer(s) saved on the desktop / other devices. You can still change them here.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#2563eb" />
          </TouchableOpacity>

          {/* Multi-station: Local KOT printing toggle + station printer assignment */}
          {multiStationCount >= 2 && !remotePrintOn && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIconWrap, { backgroundColor: '#2563eb' }]}>
                  <Ionicons name="git-branch-outline" size={16} color="#fff" />
                </View>
                <Text style={styles.sectionTitle}>Multi-Station KOT Printing</Text>
              </View>

              {/* Toggle: Print KOTs from this device */}
              <View style={styles.notifCard}>
                <View style={styles.notifRow}>
                  <View style={[styles.notifIconWrap, { backgroundColor: '#dbeafe' }]}>
                    <Ionicons name="print-outline" size={18} color="#2563eb" />
                  </View>
                  <View style={styles.notifInfo}>
                    <Text style={styles.notifLabel}>Print KOTs from this device</Text>
                    <Text style={styles.notifHint}>
                      {localKotPrinting
                        ? 'KOTs will print directly to station printers from this device'
                        : 'KOTs are handled by the desktop terminal'}
                    </Text>
                  </View>
                  <Switch
                    value={localKotPrinting}
                    onValueChange={(val) => {
                      setLocalKotPrinting(val);
                      setLocalKotPrintingEnabled(val);
                    }}
                    trackColor={{ false: '#e5e7eb', true: '#2563eb40' }}
                    thumbColor={localKotPrinting ? '#2563eb' : '#d1d5db'}
                  />
                </View>
              </View>

              {/* Station Printer Cards — visible when local KOT printing is ON */}
              {localKotPrinting && printStations.length > 0 && (
                <View style={styles.stationCardsContainer}>
                  <Text style={styles.stationCardsTitle}>Assign Printers to Stations</Text>
                  <Text style={styles.stationCardsHint}>
                    Each station can have its own WiFi printer. Stations without a printer will use the default printer.
                  </Text>

                  {printStations.map((station) => {
                    const typeConfig = getStationTypeConfig(station.type);
                    const assignedPrinter = stationPrinterMap[station.id];
                    const isScanning = scanningStationId === station.id;
                    const isTesting = testingStationId === station.id;
                    const showManualIp = manualIpStation === station.id;

                    return (
                      <View key={station.id} style={styles.stationCard}>
                        {/* Station Header */}
                        <View style={styles.stationCardHeader}>
                          <View style={[styles.stationTypeIcon, { backgroundColor: typeConfig.bg }]}>
                            <Ionicons name={typeConfig.icon} size={16} color={typeConfig.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.stationCardName}>{station.name}</Text>
                            <Text style={styles.stationCardMeta}>
                              {typeConfig.label} {station.isDefault ? '(Default)' : ''} · {(station.categoryIds || []).length} categories
                            </Text>
                          </View>
                        </View>

                        {/* Assigned Printer */}
                        {assignedPrinter ? (
                          <View style={styles.assignedPrinterRow}>
                            <View style={styles.assignedPrinterInfo}>
                              <Ionicons name="wifi" size={14} color="#16a34a" />
                              <Text style={styles.assignedPrinterText}>
                                {assignedPrinter.name || `${assignedPrinter.host}:${assignedPrinter.port}`}
                              </Text>
                            </View>
                            <View style={styles.assignedPrinterActions}>
                              <TouchableOpacity
                                style={styles.stationActionBtn}
                                onPress={() => handleTestStationPrint(station.id, station.name)}
                                disabled={isTesting}
                              >
                                {isTesting ? (
                                  <ActivityIndicator size="small" color="#2563eb" />
                                ) : (
                                  <Text style={styles.stationActionText}>Test</Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.stationActionBtn, styles.stationRemoveBtn]}
                                onPress={() => handleRemoveStationPrinter(station.id)}
                              >
                                <Ionicons name="close" size={14} color="#ef4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.noPrinterRow}>
                            <Ionicons name="alert-circle-outline" size={14} color="#9ca3af" />
                            <Text style={styles.noPrinterText}>No printer assigned (will use default)</Text>
                          </View>
                        )}

                        {/* Scan / Assign Actions */}
                        {!isScanning && !showManualIp && (
                          <View style={styles.stationActions}>
                            <TouchableOpacity
                              style={styles.scanBtn}
                              onPress={() => handleScanForStation(station.id)}
                            >
                              <Ionicons name="search-outline" size={14} color="#2563eb" />
                              <Text style={styles.scanBtnText}>Scan WiFi Printers</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.manualIpBtn}
                              onPress={() => {
                                setManualIpStation(station.id);
                                setScanningStationId(null);
                              }}
                            >
                              <Text style={styles.manualIpBtnText}>Manual IP</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Scan Results */}
                        {isScanning && (
                          <View style={styles.scanResultsContainer}>
                            <View style={styles.scanHeader}>
                              <ActivityIndicator size="small" color="#2563eb" />
                              <Text style={styles.scanHeaderText}>Scanning network...</Text>
                              <TouchableOpacity onPress={() => { setScanningStationId(null); setDiscoveredPrinters([]); }}>
                                <Text style={styles.scanCancelText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                            {discoveredPrinters.length === 0 ? (
                              <Text style={styles.scanEmptyText}>Searching for WiFi printers on your network...</Text>
                            ) : (
                              discoveredPrinters.map((printer, idx) => (
                                <TouchableOpacity
                                  key={printer.id || printer.host || idx}
                                  style={styles.discoveredPrinterRow}
                                  onPress={() => handleAssignPrinter(station.id, printer)}
                                >
                                  <Ionicons name="wifi" size={16} color="#2563eb" />
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.discoveredPrinterName}>{printer.name || 'Network Printer'}</Text>
                                    <Text style={styles.discoveredPrinterAddr}>{printer.host}:{printer.port || 9100}</Text>
                                  </View>
                                  <Ionicons name="add-circle-outline" size={20} color="#2563eb" />
                                </TouchableOpacity>
                              ))
                            )}
                            {/* Manual IP fallback inside scan */}
                            <TouchableOpacity
                              style={styles.scanManualFallback}
                              onPress={() => {
                                setManualIpStation(station.id);
                                setScanningStationId(null);
                                setDiscoveredPrinters([]);
                              }}
                            >
                              <Ionicons name="keypad-outline" size={14} color="#6b7280" />
                              <Text style={styles.scanManualFallbackText}>Enter IP address manually</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Manual IP Input */}
                        {showManualIp && (
                          <View style={styles.manualIpContainer}>
                            <Text style={styles.manualIpLabel}>Enter printer IP address</Text>
                            <View style={styles.manualIpInputRow}>
                              <TextInput
                                style={styles.manualIpInput}
                                placeholder="192.168.1.100"
                                placeholderTextColor="#9ca3af"
                                value={manualIpValue}
                                onChangeText={setManualIpValue}
                                keyboardType="decimal-pad"
                                autoCorrect={false}
                                autoCapitalize="none"
                              />
                              <Text style={styles.manualIpColon}>:</Text>
                              <TextInput
                                style={styles.manualPortInput}
                                placeholder="9100"
                                placeholderTextColor="#9ca3af"
                                value={manualPortValue}
                                onChangeText={setManualPortValue}
                                keyboardType="number-pad"
                              />
                            </View>
                            <View style={styles.manualIpActions}>
                              <TouchableOpacity
                                style={styles.manualIpConnectBtn}
                                onPress={() => handleAssignManualIp(station.id)}
                                disabled={!manualIpValue.trim()}
                              >
                                <Text style={[styles.manualIpConnectText, !manualIpValue.trim() && { opacity: 0.4 }]}>Assign</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.manualIpCancelBtn}
                                onPress={() => { setManualIpStation(null); setManualIpValue(''); setManualPortValue('9100'); }}
                              >
                                <Text style={styles.manualIpCancelText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Multi-station info banner (when remote print is ON) */}
          {multiStationCount >= 2 && remotePrintOn && (
            <View style={styles.multiStationBanner}>
              <Ionicons name="information-circle" size={20} color="#2563eb" />
              <View style={{ flex: 1 }}>
                <Text style={styles.multiStationTitle}>Multi-Station KOT Routing Active</Text>
                <Text style={styles.multiStationText}>
                  KOT prints are handled by the desktop terminal. Disable "Print from Desktop" to print KOTs directly from this device.
                </Text>
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
                      // Disable local KOT printing when switching to remote
                      if (val && localKotPrinting) {
                        setLocalKotPrinting(false);
                        setLocalKotPrintingEnabled(false);
                      }
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

  // ── Station Printer Assignment Styles ──
  stationCardsContainer: {
    marginTop: 14,
  },
  stationCardsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    marginLeft: 2,
  },
  stationCardsHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 12,
    marginLeft: 2,
    lineHeight: 16,
  },
  stationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 14,
    marginBottom: 10,
  },
  stationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  stationTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  stationCardMeta: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  assignedPrinterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  assignedPrinterInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  assignedPrinterText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '500',
  },
  assignedPrinterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stationActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  stationActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  stationRemoveBtn: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 6,
  },
  noPrinterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  noPrinterText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  stationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  scanBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  manualIpBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  manualIpBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  scanResultsContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scanHeaderText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
  },
  scanCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  scanEmptyText: {
    fontSize: 11,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 12,
  },
  discoveredPrinterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 4,
  },
  discoveredPrinterName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
  },
  discoveredPrinterAddr: {
    fontSize: 11,
    color: '#9ca3af',
  },
  scanManualFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  scanManualFallbackText: {
    fontSize: 12,
    color: '#6b7280',
  },
  manualIpContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  manualIpLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  manualIpInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 10,
  },
  manualIpInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1f2937',
  },
  manualIpColon: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
  manualPortInput: {
    width: 70,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#1f2937',
    textAlign: 'center',
  },
  manualIpActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualIpConnectBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
  },
  manualIpConnectText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  manualIpCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  manualIpCancelText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
});
