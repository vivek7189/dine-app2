import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  Animated,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../constants/Theme';
import * as printerService from '../services/printerService';

const ICON_MAP = { bluetooth: 'bluetooth', usb: 'cable-outline', network: 'wifi', airprint: 'print' };
const COLOR_MAP = { bluetooth: '#2563eb', usb: '#7c3aed', network: '#16a34a', airprint: '#d97706' };
const BG_MAP = { bluetooth: '#eff6ff', usb: '#faf5ff', network: '#f0fdf4', airprint: '#fef3c7' };
const LABEL_MAP = { bluetooth: 'Bluetooth', usb: 'USB', network: 'WiFi', airprint: 'AirPrint' };

export default function PrinterSetup({ restaurantId }) {
  const [savedPrinter, setSavedPrinter] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(null);
  const [discoveredPrinters, setDiscoveredPrinters] = useState([]);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showChangeFlow, setShowChangeFlow] = useState(false);
  const [networkIP, setNetworkIP] = useState('');
  const [networkPort, setNetworkPort] = useState('9100');
  const [connectingIP, setConnectingIP] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastError, setLastError] = useState(null); // live printer health — last print/connection error

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mountedRef = useRef(true);
  const isIOS = Platform.OS === 'ios';

  useEffect(() => {
    mountedRef.current = true;
    loadState();
    return () => {
      mountedRef.current = false;
      printerService.cancelScan();
    };
  }, []);

  // Re-verify connection when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active' && mountedRef.current && savedPrinter && !reconnecting) {
        const stillConnected = printerService.isConnected();
        if (!stillConnected) {
          setReconnecting(true);
          const ok = await printerService.autoReconnect();
          if (mountedRef.current) {
            setConnected(ok);
            setReconnecting(false);
            if (!ok) {
              Alert.alert(
                'Printer Disconnected',
                'Could not reconnect to the printer. Please check the printer is on and connected to the same WiFi network, then tap Reconnect.',
              );
            }
          }
        }
      }
    });
    return () => sub.remove();
  }, [savedPrinter, reconnecting]);

  // Live printer health — reflect the ACTUAL last print/connection outcome in the status chip,
  // instead of the stale "we have a saved printer" flag. This is how good POS apps show a real,
  // trustworthy status: green only when it's actually working; a clear error the moment it isn't.
  useEffect(() => {
    const unsub = printerService.onPrinterEvent((event) => {
      if (!mountedRef.current || !event) return;
      switch (event.type) {
        case 'reconnecting':
          setReconnecting(true);
          break;
        case 'reconnected':
        case 'print_recovered':
          setReconnecting(false);
          setConnected(true);
          setLastError(null);
          break;
        case 'print_failed':
        case 'disconnected':
          setReconnecting(false);
          setLastError(event.message || 'Printer not responding. Reconnect and try again.');
          break;
        default:
          break;
      }
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  // Pulse animation for scanning
  useEffect(() => {
    if (scanning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    pulseAnim.setValue(1);
  }, [scanning]);

  const loadState = async () => {
    try {
      const printer = await printerService.getSavedPrinter();
      if (!mountedRef.current) return;
      setSavedPrinter(printer);
      setConnected(printerService.isConnected());

      if (printer && printerService.hasNativeSupport()) {
        setReconnecting(true);
        setLoading(false); // Show UI immediately while reconnecting
        const ok = await printerService.autoReconnect();
        if (!mountedRef.current) return;
        setConnected(ok);
        setReconnecting(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Printer setup load error:', err);
      if (mountedRef.current) setLoading(false);
    }
  };

  const startScan = useCallback(async () => {
    printerService.cancelScan(); // cancel any previous
    setScanning(true);
    setScanComplete(false);
    setDiscoveredPrinters([]);
    try {
      if (isIOS) {
        const btDevices = await printerService.discoverBluetoothPrinters();
        if (mountedRef.current) setDiscoveredPrinters(btDevices);
      } else {
        // Printers appear progressively as they're found (mDNS first, then subnet scan)
        await printerService.discoverAllPrinters((printersFound) => {
          if (mountedRef.current) setDiscoveredPrinters([...printersFound]);
        });
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      if (mountedRef.current) {
        setScanning(false);
        setScanComplete(true);
      }
    }
  }, [isIOS]);

  const handleStopScan = useCallback(() => {
    printerService.cancelScan();
    setScanning(false);
    setScanComplete(true);
  }, []);

  const handleConnectPrinter = async (printer) => {
    setConnecting(printer.id);
    try {
      if (printer.type === 'bluetooth') {
        await printerService.connectBluetoothPrinter(printer.macAddress);
      } else if (printer.type === 'network') {
        await printerService.connectNetworkPrinter(printer.host, printer.port || 9100);
      } else if (printer.type === 'usb') {
        await printerService.connectUSBPrinter(printer.vendorId, printer.productId);
      }

      await printerService.savePrinter(printer);
      await printerService.setPrinterMode('silent');
      if (!mountedRef.current) return;
      setSavedPrinter(printer);
      setConnected(true);
      setShowChangeFlow(false);
      setDiscoveredPrinters([]);
      setScanComplete(false);
      Alert.alert('Printer Connected', `${printer.name} is ready.\nAll bills and tokens will print automatically.`);
    } catch (err) {
      if (!mountedRef.current) return;
      Alert.alert('Connection Failed', err.message || `Could not connect to ${printer.name}. Make sure it is on and in range.`);
      setConnected(false);
    } finally {
      if (mountedRef.current) setConnecting(null);
    }
  };

  const handleCancelConnect = useCallback(() => {
    // We can't truly cancel a native connection attempt, but we reset UI
    setConnecting(null);
    setConnectingIP(false);
  }, []);

  // iOS: AirPrint system picker
  const handleSelectAirPrint = async () => {
    try {
      const printer = await printerService.selectAirPrintPrinter();
      await printerService.setPrinterMode('silent');
      if (!mountedRef.current) return;
      setSavedPrinter(printer);
      setConnected(true);
      setShowChangeFlow(false);
      Alert.alert('Printer Connected', `${printer.name} is ready.\nAll bills and tokens will print automatically.`);
    } catch (err) {
      if (err.message?.includes('cancelled') || err.code === 'ERR_CANCELLED') return;
      Alert.alert('Error', err.message || 'Failed to select printer');
    }
  };

  const handleConnectByIP = async () => {
    const ip = networkIP.trim();
    if (!ip) {
      Alert.alert('Enter IP', 'Please enter the printer IP address');
      return;
    }
    const printer = {
      id: `${ip}:${networkPort}`,
      name: `WiFi Printer (${ip})`,
      host: ip,
      port: parseInt(networkPort) || 9100,
      type: 'network',
    };
    setConnectingIP(true);
    await handleConnectPrinter(printer);
    if (mountedRef.current) {
      setConnectingIP(false);
      setNetworkIP('');
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Remove Printer', 'Are you sure? You will need to set up the printer again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await printerService.disconnectPrinter();
          await printerService.clearSavedPrinter();
          await printerService.setPrinterMode('dialog');
          if (!mountedRef.current) return;
          setSavedPrinter(null);
          setConnected(false);
          setShowChangeFlow(false);
          startScan();
        },
      },
    ]);
  };

  const handleChangePrinter = () => {
    setShowChangeFlow(true);
    startScan();
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      await printerService.printTestPage();
      // A successful test proves the link is truly alive — clear any stale error + mark healthy.
      if (mountedRef.current) { setLastError(null); setConnected(true); }
      Alert.alert('Test Successful', 'Test page sent to printer.');
    } catch (err) {
      const msg = err.message || 'Could not print test page';
      if (mountedRef.current) setLastError(msg);
      Alert.alert('Test Failed', msg);
    } finally {
      if (mountedRef.current) setTesting(false);
    }
  };

  const handleStopTest = useCallback(() => {
    setTesting(false);
  }, []);

  const getAddrText = (printer) => {
    if (printer.type === 'bluetooth') return printer.macAddress || 'Paired device';
    if (printer.type === 'usb') return `Vendor: ${printer.vendorId || 'unknown'}`;
    if (printer.type === 'network') return `${printer.host}:${printer.port || 9100}`;
    if (printer.type === 'airprint') return printer.url || '';
    return '';
  };

  // ==================== RENDER ====================

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading printer settings...</Text>
      </View>
    );
  }

  // Show connected printer (not in change flow)
  if (savedPrinter && !showChangeFlow) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Status banner — reflects the ACTUAL last outcome: reconnecting / working / not responding */}
          {(() => {
            const isError = !!lastError && !reconnecting;
            const bg = reconnecting ? '#eff6ff' : isError ? '#fef2f2' : connected ? '#f0fdf4' : '#fef3c7';
            const fg = reconnecting ? '#2563eb' : isError ? '#dc2626' : connected ? '#16a34a' : '#d97706';
            const icon = isError ? 'close-circle' : connected ? 'checkmark-circle' : 'alert-circle-outline';
            const title = reconnecting ? 'Reconnecting to printer…'
              : isError ? 'Printer not responding'
              : connected ? 'Printer connected and ready'
              : 'Printer disconnected';
            return (
              <View style={[styles.statusBanner, { backgroundColor: bg }]}>
                {reconnecting ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Ionicons name={icon} size={20} color={fg} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.statusBannerText, { color: fg }]}>{title}</Text>
                  {isError && lastError ? (
                    <Text style={{ fontSize: 12, color: '#b91c1c', marginTop: 2 }}>{lastError}</Text>
                  ) : null}
                </View>
              </View>
            );
          })()}

          {/* Printer info */}
          <View style={styles.connectedInfo}>
            <View style={[styles.printerIconLg, { backgroundColor: BG_MAP[savedPrinter.type] || '#eff6ff' }]}>
              <Ionicons
                name={ICON_MAP[savedPrinter.type] || 'print'}
                size={28}
                color={COLOR_MAP[savedPrinter.type] || '#2563eb'}
              />
            </View>
            <View style={styles.printerDetails}>
              <Text style={styles.printerName}>{savedPrinter.name}</Text>
              <Text style={styles.printerAddr}>{getAddrText(savedPrinter)}</Text>
              <View style={[styles.typeBadge, { backgroundColor: BG_MAP[savedPrinter.type] || '#eff6ff' }]}>
                <Text style={[styles.typeBadgeText, { color: COLOR_MAP[savedPrinter.type] || '#2563eb' }]}>
                  {LABEL_MAP[savedPrinter.type] || savedPrinter.type}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!connected && !reconnecting && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#dbeafe' }]}
                onPress={() => handleConnectPrinter(savedPrinter)}
                disabled={connecting === savedPrinter.id}
              >
                {connecting === savedPrinter.id ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Ionicons name="refresh" size={16} color="#2563eb" />
                )}
                <Text style={[styles.actionBtnText, { color: '#2563eb' }]}>Reconnect</Text>
              </TouchableOpacity>
            )}

            {/* Test Print with stop */}
            {testing ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#fef3c7' }]}
                onPress={handleStopTest}
              >
                <Ionicons name="stop-circle" size={16} color="#d97706" />
                <Text style={[styles.actionBtnText, { color: '#d97706' }]}>Stop</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#f0fdf4' }]}
                onPress={handleTestPrint}
                disabled={reconnecting}
              >
                <Ionicons name="document-text-outline" size={16} color="#16a34a" />
                <Text style={[styles.actionBtnText, { color: '#16a34a' }]}>Test Print</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#eff6ff' }]}
              onPress={handleChangePrinter}
            >
              <Ionicons name="swap-horizontal" size={16} color="#2563eb" />
              <Text style={[styles.actionBtnText, { color: '#2563eb' }]}>Change</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]}
              onPress={handleDisconnect}
            >
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text style={[styles.actionBtnText, { color: '#dc2626' }]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ==================== DISCOVERY FLOW ====================
  return (
    <View style={styles.container}>
      {/* Cancel button if changing */}
      {showChangeFlow && (
        <TouchableOpacity
          style={styles.cancelChangeBtn}
          onPress={() => {
            printerService.cancelScan();
            setShowChangeFlow(false);
            setScanning(false);
            setDiscoveredPrinters([]);
            setScanComplete(false);
          }}
        >
          <Ionicons name="arrow-back" size={18} color={Colors.primary} />
          <Text style={styles.cancelChangeText}>Back to current printer</Text>
        </TouchableOpacity>
      )}

      {/* Scan card */}
      <View style={styles.card}>
        {scanning ? (
          <View style={styles.scanningCard}>
            <View style={styles.scanningLeft}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Ionicons name="search" size={28} color={Colors.primary} />
              </Animated.View>
              <View>
                <Text style={styles.scanningTitle}>Finding printers...</Text>
                <Text style={styles.scanningHint}>Bluetooth, WiFi{Platform.OS === 'android' ? ' & USB' : ''}</Text>
              </View>
            </View>
            {/* STOP SCAN BUTTON */}
            <TouchableOpacity style={styles.stopBtn} onPress={handleStopScan}>
              <Ionicons name="stop-circle" size={18} color="#dc2626" />
              <Text style={styles.stopBtnText}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.scanHeaderRow}>
            <View style={styles.scanHeaderInfo}>
              <Text style={styles.scanHeaderTitle}>
                {scanComplete && discoveredPrinters.length === 0
                  ? 'No printers found'
                  : scanComplete
                  ? `Found ${discoveredPrinters.length} printer${discoveredPrinters.length !== 1 ? 's' : ''}`
                  : 'Find your printer'}
              </Text>
              <Text style={styles.scanHeaderHint}>
                {scanComplete && discoveredPrinters.length === 0
                  ? 'Make sure printer is on and nearby'
                  : scanComplete
                  ? 'Tap a printer to connect'
                  : 'Scan to discover nearby printers'}
              </Text>
            </View>
            <TouchableOpacity style={styles.rescanBtn} onPress={startScan}>
              <Ionicons name="refresh" size={18} color={Colors.primary} />
              <Text style={styles.rescanBtnText}>Scan</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* iOS AirPrint option */}
        {isIOS && !scanning && (
          <TouchableOpacity style={styles.airprintBtn} onPress={handleSelectAirPrint}>
            <View style={[styles.printerItemIcon, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="print" size={20} color="#d97706" />
            </View>
            <View style={styles.printerItemInfo}>
              <Text style={styles.printerItemName}>Select AirPrint Printer</Text>
              <Text style={styles.printerItemAddr}>Choose from system printer list</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#d97706" />
          </TouchableOpacity>
        )}

        {/* Discovered printers list */}
        {discoveredPrinters.length > 0 && (
          <View style={styles.printerList}>
            {discoveredPrinters.map((printer) => (
              <TouchableOpacity
                key={printer.id}
                style={styles.printerItem}
                onPress={() => handleConnectPrinter(printer)}
                disabled={!!connecting}
                activeOpacity={0.6}
              >
                <View style={[styles.printerItemIcon, { backgroundColor: BG_MAP[printer.type] || '#eff6ff' }]}>
                  <Ionicons
                    name={ICON_MAP[printer.type] || 'print'}
                    size={20}
                    color={COLOR_MAP[printer.type] || '#2563eb'}
                  />
                </View>
                <View style={styles.printerItemInfo}>
                  <Text style={styles.printerItemName}>{printer.name}</Text>
                  <Text style={styles.printerItemAddr}>{getAddrText(printer)}</Text>
                </View>
                <View style={[styles.printerItemBadge, { backgroundColor: BG_MAP[printer.type] || '#eff6ff' }]}>
                  <Text style={[styles.printerItemBadgeText, { color: COLOR_MAP[printer.type] || '#2563eb' }]}>
                    {LABEL_MAP[printer.type] || printer.type}
                  </Text>
                </View>
                {connecting === printer.id ? (
                  <TouchableOpacity onPress={handleCancelConnect} style={styles.connectingWrap}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                    <Text style={styles.connectingStopText}>Stop</Text>
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="add-circle" size={24} color={Colors.primary} style={{ marginLeft: 8 }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty state with tips */}
        {scanComplete && discoveredPrinters.length === 0 && !scanning && (
          <View style={styles.emptyTips}>
            <View style={styles.tipRow}>
              <Ionicons name="bluetooth" size={16} color="#2563eb" />
              <Text style={styles.tipText}>Bluetooth: Pair printer in phone Settings first</Text>
            </View>
            {Platform.OS === 'android' && (
              <View style={styles.tipRow}>
                <Ionicons name="cable-outline" size={16} color="#7c3aed" />
                <Text style={styles.tipText}>USB: Connect via OTG cable and turn on</Text>
              </View>
            )}
            <View style={styles.tipRow}>
              <Ionicons name="wifi" size={16} color="#16a34a" />
              <Text style={styles.tipText}>WiFi: Ensure same network, or add by IP below</Text>
            </View>
          </View>
        )}
      </View>

      {/* Manual IP fallback */}
      <View style={styles.card}>
        <View style={styles.ipHeader}>
          <Ionicons name="wifi" size={16} color="#16a34a" />
          <Text style={styles.ipHeaderText}>Add WiFi printer by IP</Text>
        </View>
        <Text style={styles.ipHint}>
          If your WiFi printer didn't appear above, enter its IP address manually.
        </Text>
        <View style={styles.ipInputRow}>
          <TextInput
            style={[styles.ipInput, { flex: 3 }]}
            placeholder="192.168.1.100"
            placeholderTextColor="#9ca3af"
            value={networkIP}
            onChangeText={setNetworkIP}
            keyboardType="numeric"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.ipInput, { flex: 1, marginLeft: 8 }]}
            placeholder="9100"
            placeholderTextColor="#9ca3af"
            value={networkPort}
            onChangeText={setNetworkPort}
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={handleConnectByIP}
          />
        </View>
        {connectingIP ? (
          <View style={styles.ipBtnRow}>
            <View style={[styles.ipConnectBtn, styles.ipConnectingBtn, { flex: 1 }]}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.ipConnectBtnText}>Connecting...</Text>
            </View>
            <TouchableOpacity
              style={styles.ipStopBtn}
              onPress={() => { setConnectingIP(false); setConnecting(null); }}
            >
              <Ionicons name="stop-circle" size={18} color="#dc2626" />
              <Text style={styles.ipStopBtnText}>Stop</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.ipConnectBtn, !networkIP.trim() && styles.ipConnectBtnDisabled]}
            onPress={handleConnectByIP}
            disabled={!networkIP.trim()}
          >
            <Ionicons name="link" size={16} color="#fff" />
            <Text style={styles.ipConnectBtnText}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Help */}
      <View style={styles.card}>
        <View style={styles.helpHeader}>
          <Ionicons name="help-circle-outline" size={16} color={Colors.textMedium} />
          <Text style={styles.helpHeaderText}>Setup tips</Text>
        </View>
        <View style={styles.helpContent}>
          <Text style={styles.helpText}>
            <Text style={styles.helpBold}>Bluetooth:</Text> Turn on printer, pair it in your phone's Bluetooth settings, then come back and tap Scan.{'\n\n'}
            <Text style={styles.helpBold}>WiFi:</Text> Connect printer and phone to the same WiFi. It should appear automatically. If not, find the IP on the printer's config page (hold feed button 5 sec) and enter it above.
            {Platform.OS === 'android' ? '\n\n' : ''}
            {Platform.OS === 'android' ? <Text style={styles.helpBold}>USB:</Text> : null}
            {Platform.OS === 'android' ? ' Connect the printer with a USB OTG cable. It will appear in the scan results.' : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },

  // ===== Connected printer view =====
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  connectedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  printerIconLg: {
    width: 56,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  printerDetails: {
    flex: 1,
  },
  printerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textDark,
  },
  printerAddr: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ===== Cancel change =====
  cancelChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  cancelChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },

  // ===== Scanning =====
  scanningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  scanningLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  scanningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  scanningHint: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  stopBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  scanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  scanHeaderInfo: {
    flex: 1,
    marginRight: 12,
  },
  scanHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textDark,
  },
  scanHeaderHint: {
    fontSize: 12,
    color: Colors.textMedium,
    marginTop: 2,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rescanBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },

  // ===== AirPrint =====
  airprintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },

  // ===== Printer list =====
  printerList: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  printerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  printerItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  printerItemInfo: {
    flex: 1,
  },
  printerItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textDark,
  },
  printerItemAddr: {
    fontSize: 11,
    color: Colors.textMedium,
    marginTop: 1,
  },
  printerItemBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  printerItemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  connectingWrap: {
    alignItems: 'center',
    marginLeft: 8,
    gap: 2,
  },
  connectingStopText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#dc2626',
  },

  // ===== Empty state tips =====
  emptyTips: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMedium,
    lineHeight: 16,
  },

  // ===== IP fallback =====
  ipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    paddingBottom: 4,
  },
  ipHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textDark,
  },
  ipHint: {
    fontSize: 12,
    color: Colors.textMedium,
    paddingHorizontal: Spacing.md,
    marginBottom: 12,
    lineHeight: 16,
  },
  ipInputRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    marginBottom: 12,
  },
  ipInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textDark,
  },
  ipBtnRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  ipConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: 12,
    borderRadius: 10,
  },
  ipConnectingBtn: {
    marginHorizontal: 0,
    marginBottom: 0,
    opacity: 0.8,
  },
  ipConnectBtnDisabled: {
    opacity: 0.5,
  },
  ipConnectBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  ipStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  ipStopBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },

  // ===== Help =====
  helpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.md,
    paddingBottom: 0,
  },
  helpHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  helpContent: {
    padding: Spacing.md,
    paddingTop: 8,
  },
  helpText: {
    fontSize: 12,
    color: Colors.textMedium,
    lineHeight: 18,
  },
  helpBold: {
    fontWeight: '700',
    color: Colors.textDark,
  },
});
