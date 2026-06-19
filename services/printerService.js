// Printer Service - Silent printing for ALL printer types on ALL platforms
//
// Supported printer types:
//   Bluetooth (BLE)  → Android + iOS
//   WiFi / Network   → Android + iOS
//   USB (cable)      → Android tablets
//   AirPrint         → iOS (WiFi printers, Mac shared printers)
//
// All types support silent printing (no dialog) once configured.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, PermissionsAndroid } from 'react-native';
import * as Print from 'expo-print';
import { NativeModules } from 'react-native';

// Lazy-load native modules that may not be linked in all builds (e.g. Expo Go)
let BLEPrinter = null;
let NetPrinter = null;
let USBPrinter = null;
let Zeroconf = null;

try {
  const thermalPrinter = require('react-native-thermal-receipt-printer');
  BLEPrinter = thermalPrinter.BLEPrinter;
  NetPrinter = thermalPrinter.NetPrinter;
  USBPrinter = thermalPrinter.USBPrinter;
} catch (e) {
  console.warn('react-native-thermal-receipt-printer not available:', e.message);
}

try {
  Zeroconf = require('react-native-zeroconf').default;
} catch (e) {
  console.warn('react-native-zeroconf not available:', e.message);
}
import NetInfo from '@react-native-community/netinfo';
import { getItemSubline } from '../utils/itemSubline';
import { renderKOT } from '../utils/printTemplates/index';

const SAVED_PRINTER_KEY = 'dine_saved_printer';
const PRINTER_MODE_KEY = 'dine_printer_mode'; // 'silent' | 'dialog'
const PRINT_NOTIF_KEY = 'dine_print_notifications'; // 'true' | 'false'
const REMOTE_PRINT_KEY = 'dine_remote_print'; // 'true' | 'false' — print from desktop app
const DISCONNECT_ALERT_KEY = 'dine_printer_disconnect_alert'; // 'true' | 'false' — show disconnect alert when no remote print

// ==================== PRINTER STATE ====================

let connectedPrinter = null;
let connectionType = null; // 'bluetooth' | 'network' | 'usb' | 'airprint'
let printerInitialized = { bluetooth: false, network: false, usb: false };
let activeScanCancelled = false;
let activeZeroconf = null;
let _reconnectPromise = null; // shared Promise so concurrent callers wait for reconnect
let printerEventListeners = [];
let _heartbeatTimer = null; // WiFi heartbeat interval ID

// ==================== PRINT QUEUE ====================
// Serializes all print jobs so only one runs at a time.
// Prevents concurrent access to the global printer connection.

let _printQueueChain = Promise.resolve();

const enqueuePrint = (fn) => {
  return new Promise((resolve, reject) => {
    // Use .catch(() => {}) on the chain so a failed print doesn't break the queue.
    // The actual error is forwarded to the caller via reject().
    _printQueueChain = _printQueueChain
      .catch(() => {}) // recover from previous failure so chain continues
      .then(() => fn())
      .then(resolve, reject);
  });
};

// ==================== PRINT TIMEOUT & RETRY CONFIG ====================

const PRINT_TIMEOUT_MS = 10000; // 10 seconds
const MAX_PRINT_RETRIES = 3; // Total attempts (1 original + 2 retries)
const RETRY_DELAYS = [800, 1500]; // ms delay before 2nd and 3rd attempt

const withPrintTimeout = (promise, label = 'Print') => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${PRINT_TIMEOUT_MS}ms`)),
      PRINT_TIMEOUT_MS,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
};

// Simple event system for printer status notifications
export const onPrinterEvent = (callback) => {
  printerEventListeners.push(callback);
  return () => {
    printerEventListeners = printerEventListeners.filter(cb => cb !== callback);
  };
};

const emitPrinterEvent = (event) => {
  printerEventListeners.forEach(cb => {
    try { cb(event); } catch {}
  });
};

// ==================== SETTINGS ====================

export const getPrinterMode = async () => {
  try {
    return (await AsyncStorage.getItem(PRINTER_MODE_KEY)) || 'dialog';
  } catch {
    return 'dialog';
  }
};

export const setPrinterMode = async (mode) => {
  await AsyncStorage.setItem(PRINTER_MODE_KEY, mode);
};

// Print notification preference (toast on print failure)
export const getPrintNotificationsEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(PRINT_NOTIF_KEY);
    return val !== 'false'; // enabled by default
  } catch {
    return true;
  }
};

export const setPrintNotificationsEnabled = async (enabled) => {
  await AsyncStorage.setItem(PRINT_NOTIF_KEY, enabled ? 'true' : 'false');
};

// Remote print preference — delegate printing to desktop (Electron) app
export const getRemotePrintEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(REMOTE_PRINT_KEY);
    return val === 'true'; // disabled by default
  } catch {
    return false;
  }
};

export const setRemotePrintEnabled = async (enabled) => {
  await AsyncStorage.setItem(REMOTE_PRINT_KEY, enabled ? 'true' : 'false');
};

// Printer disconnect alert preference — shown when no local printer connected & remote print off
// Enabled by default. User can dismiss from the alert itself or toggle in printer settings.
export const getDisconnectAlertEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(DISCONNECT_ALERT_KEY);
    return val !== 'false'; // enabled by default
  } catch {
    return true;
  }
};

export const setDisconnectAlertEnabled = async (enabled) => {
  await AsyncStorage.setItem(DISCONNECT_ALERT_KEY, enabled ? 'true' : 'false');
};

export const getSavedPrinter = async () => {
  try {
    const data = await AsyncStorage.getItem(SAVED_PRINTER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

export const savePrinter = async (printer) => {
  await AsyncStorage.setItem(SAVED_PRINTER_KEY, JSON.stringify(printer));
};

export const clearSavedPrinter = async () => {
  await AsyncStorage.removeItem(SAVED_PRINTER_KEY);
  connectedPrinter = null;
  connectionType = null;
};

// ==================== BLUETOOTH PERMISSIONS ====================

// On Android 12+ (API 31+), BLUETOOTH_CONNECT and BLUETOOTH_SCAN are runtime permissions.
// Calling BLE APIs without them causes a native SecurityException crash.
const ensureBluetoothPermissions = async () => {
  if (Platform.OS !== 'android') return true;
  try {
    // Android 12+ (API 31) requires runtime BT permissions
    // On older Android, these permissions don't exist and are auto-granted
    if (Platform.Version >= 31) {
      const statuses = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
      const connectGranted = statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const scanGranted = statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      if (!connectGranted || !scanGranted) {
        console.log('Bluetooth permissions not granted');
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('Error requesting Bluetooth permissions:', err);
    return false;
  }
};

// ==================== DISCOVERY ====================

// Bluetooth printers (Android + iOS)
export const discoverBluetoothPrinters = async () => {
  if (!BLEPrinter) return [];
  try {
    // Request runtime Bluetooth permissions on Android 12+ before touching BLE APIs
    const hasPerms = await ensureBluetoothPermissions();
    if (!hasPerms) return [];

    if (!printerInitialized.bluetooth) {
      await BLEPrinter.init();
      printerInitialized.bluetooth = true;
    }
    const devices = await BLEPrinter.getDeviceList();
    return (devices || []).map(d => ({
      id: d.inner_mac_address || d.device_name,
      name: d.device_name || 'Unknown Printer',
      macAddress: d.inner_mac_address,
      type: 'bluetooth',
    }));
  } catch (err) {
    console.error('Bluetooth discovery error:', err);
    printerInitialized.bluetooth = false;
    return [];
  }
};

// USB printers (Android only - tablets with USB cable)
// USBPrinter.init() can cause native crashes on phones without USB host hardware.
// We guard by checking if the native module exists before calling it.
export const discoverUSBPrinters = async () => {
  if (Platform.OS !== 'android') return [];
  // Skip USB discovery on Android 13+ (API 33) — the native module calls
  // registerReceiver() without RECEIVER_NOT_EXPORTED flag, which crashes on Android 14+.
  // USB printers are extremely rare on phones; this is a tablet-only feature.
  if (Platform.Version >= 33) return [];
  try {
    // Check if the native USB module is actually available
    // This prevents native crashes on devices without USB host support
    const nativeUSB = NativeModules.RNUSBPrinter;
    if (!nativeUSB || !USBPrinter || typeof USBPrinter.init !== 'function') {
      console.log('USB printer module not available on this device');
      return [];
    }
    if (!printerInitialized.usb) {
      await Promise.race([
        USBPrinter.init(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('USB init timeout')), 5000)),
      ]);
      printerInitialized.usb = true;
    }
    const devices = await USBPrinter.getDeviceList();
    return (devices || []).map(d => ({
      id: d.device_id || d.device_name || `usb-${d.vendor_id}`,
      name: d.device_name || `USB Printer (${d.vendor_id || 'unknown'})`,
      vendorId: d.vendor_id,
      productId: d.product_id,
      deviceId: d.device_id,
      type: 'usb',
    }));
  } catch (err) {
    console.error('USB discovery error:', err);
    printerInitialized.usb = false;
    return [];
  }
};

// WiFi/Network printers via mDNS/Bonjour discovery
export const discoverNetworkPrinters = async (timeoutMs = 5000) => {
  if (!Zeroconf) return [];
  try {
    // Stop any previous zeroconf scan
    if (activeZeroconf) {
      try { activeZeroconf.stop(); activeZeroconf.removeAllListeners(); } catch {}
    }
    // Zeroconf constructor can crash on devices where NSD is unavailable
    let zeroconf;
    try {
      zeroconf = new Zeroconf();
    } catch (constructErr) {
      console.warn('Zeroconf not available on this device:', constructErr);
      return [];
    }
    activeZeroconf = zeroconf;
    const found = new Map();

    return new Promise((resolve) => {
      const finish = () => {
        try { zeroconf.stop(); zeroconf.removeAllListeners(); } catch {}
        if (activeZeroconf === zeroconf) activeZeroconf = null;
        resolve(Array.from(found.values()));
      };

      const timer = setTimeout(finish, timeoutMs);

      zeroconf.on('resolved', (service) => {
        if (activeScanCancelled) { clearTimeout(timer); finish(); return; }
        if (!service?.host || found.has(service.host)) return;
        const port = service.port || 9100;
        found.set(service.host, {
          id: `${service.host}:${port}`,
          name: service.name || `Network Printer (${service.host})`,
          host: service.host,
          port,
          type: 'network',
        });
      });

      zeroconf.on('error', (err) => {
        console.warn('Zeroconf error:', err);
        clearTimeout(timer);
        finish();
      });

      // Scan for raw printing (port 9100) and IPP printers
      zeroconf.scan('pdl-datastream', 'tcp', 'local.');
      // Also scan for IPP printers after a short delay
      setTimeout(() => {
        if (!activeScanCancelled) {
          try { zeroconf.scan('ipp', 'tcp', 'local.'); } catch {}
        }
      }, 500);
    });
  } catch (err) {
    console.error('Network printer discovery error:', err);
    return [];
  }
};

// Scan local subnet for devices listening on port 9100 (thermal printers)
// This catches printers that don't advertise via mDNS/Bonjour
export const scanSubnetForPrinters = async (onFound, timeoutMs = 8000) => {
  try {
    const info = await NetInfo.fetch();
    const localIP = info?.details?.ipAddress;
    if (!localIP) return [];

    // Derive subnet base (e.g., 192.168.1.xxx)
    const parts = localIP.split('.');
    if (parts.length !== 4) return [];
    const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const myLastOctet = parseInt(parts[3]);

    const found = [];
    const PORT = 9100;
    const BATCH = 20; // probe 20 IPs at a time
    const PROBE_TIMEOUT = 1500; // 1.5s per probe

    const probeIP = (ip) => {
      return new Promise((resolve) => {
        if (activeScanCancelled) { resolve(null); return; }
        const timer = setTimeout(() => resolve(null), PROBE_TIMEOUT);
        // Use AbortController (widely supported) instead of AbortSignal.timeout (not on all Hermes versions)
        let controller;
        let fetchOpts = { method: 'HEAD' };
        try {
          controller = new AbortController();
          fetchOpts.signal = controller.signal;
          setTimeout(() => { try { controller.abort(); } catch {} }, PROBE_TIMEOUT);
        } catch { /* AbortController not available — rely on outer timer */ }
        // Use fetch to probe — port 9100 will reject HTTP but the TCP connect succeeds
        fetch(`http://${ip}:${PORT}/`, fetchOpts)
          .then(() => {
            clearTimeout(timer);
            resolve(ip); // unlikely HTTP response, but port is open
          })
          .catch((err) => {
            clearTimeout(timer);
            // "Network request failed" = port closed / host unreachable
            // "JSON Parse error" or other = got a TCP response = port is open
            const msg = err?.message || '';
            if (msg.includes('Network request failed') || msg.includes('Could not connect') || msg.includes('abort')) {
              resolve(null);
            } else {
              // Got some TCP response — printer is there
              resolve(ip);
            }
          });
      });
    };

    // Scan in batches to avoid overwhelming the network
    const allIPs = [];
    // Prioritize common printer IPs first (x.x.x.100-200 range, then rest)
    for (let i = 100; i <= 200; i++) if (i !== myLastOctet) allIPs.push(`${subnet}.${i}`);
    for (let i = 1; i < 100; i++) if (i !== myLastOctet) allIPs.push(`${subnet}.${i}`);
    for (let i = 201; i <= 254; i++) if (i !== myLastOctet) allIPs.push(`${subnet}.${i}`);

    const deadline = Date.now() + timeoutMs;

    for (let b = 0; b < allIPs.length; b += BATCH) {
      if (activeScanCancelled || Date.now() > deadline) break;
      const batch = allIPs.slice(b, b + BATCH);
      const results = await Promise.all(batch.map(probeIP));
      for (const ip of results) {
        if (ip && !activeScanCancelled) {
          const printer = {
            id: `${ip}:${PORT}`,
            name: `Network Printer (${ip})`,
            host: ip,
            port: PORT,
            type: 'network',
          };
          found.push(printer);
          if (onFound) onFound(printer);
        }
      }
    }
    return found;
  } catch (err) {
    console.error('Subnet scan error:', err);
    return [];
  }
};

// Discover ALL printer types in parallel (Bluetooth + USB + WiFi mDNS + subnet scan)
export const discoverAllPrinters = async (onPrinterFound) => {
  activeScanCancelled = false;
  const seenIds = new Set();

  // Request Bluetooth permissions FIRST (before any parallel discovery)
  // so the permission dialog isn't killed by a parallel native crash
  if (Platform.OS === 'android') {
    await ensureBluetoothPermissions();
  }

  if (activeScanCancelled) return [];

  const tasks = [
    discoverBluetoothPrinters(),
    discoverNetworkPrinters(),
  ];
  if (Platform.OS === 'android') {
    tasks.push(discoverUSBPrinters());
  }

  const results = await Promise.allSettled(tasks);
  if (activeScanCancelled) return [];

  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const p of r.value) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          all.push(p);
        }
      }
    }
  }

  // Notify caller of mDNS/BT/USB results first
  if (onPrinterFound && all.length > 0) {
    onPrinterFound(all);
  }

  // Then run subnet scan in background for printers that don't advertise via mDNS
  if (!activeScanCancelled) {
    await scanSubnetForPrinters((printer) => {
      if (!seenIds.has(printer.id)) {
        seenIds.add(printer.id);
        all.push(printer);
        if (onPrinterFound) onPrinterFound([...all]);
      }
    });
  }

  return all;
};

// Cancel any active scan
export const cancelScan = () => {
  activeScanCancelled = true;
  if (activeZeroconf) {
    try { activeZeroconf.stop(); activeZeroconf.removeAllListeners(); } catch {}
    activeZeroconf = null;
  }
};

// iOS AirPrint - select printer from system picker (one-time)
export const selectAirPrintPrinter = async () => {
  if (Platform.OS !== 'ios') {
    throw new Error('AirPrint is only available on iOS');
  }
  const printer = await Print.selectPrinterAsync();
  const saved = {
    id: printer.url,
    name: printer.name,
    url: printer.url,
    type: 'airprint',
  };
  await savePrinter(saved);
  connectedPrinter = printer.url;
  connectionType = 'airprint';
  return saved;
};

// ==================== CONNECTION ====================

export const connectBluetoothPrinter = async (macAddress) => {
  if (!BLEPrinter) throw new Error('Bluetooth printing not available in this build');
  const hasPerms = await ensureBluetoothPermissions();
  if (!hasPerms) throw new Error('Bluetooth permissions not granted. Please enable Bluetooth permissions in Settings.');
  if (!printerInitialized.bluetooth) {
    await BLEPrinter.init();
    printerInitialized.bluetooth = true;
  }
  await BLEPrinter.connectPrinter(macAddress);
  connectedPrinter = macAddress;
  connectionType = 'bluetooth';
  return true;
};

export const connectNetworkPrinter = async (host, port = 9100) => {
  if (!NetPrinter) throw new Error('Network printing not available in this build');
  if (!printerInitialized.network) {
    await NetPrinter.init();
    printerInitialized.network = true;
  }
  await NetPrinter.connectPrinter(host, port);
  connectedPrinter = `${host}:${port}`;
  connectionType = 'network';
  // Start heartbeat to keep WiFi connection alive and detect stale sockets
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  // Delay first heartbeat so the connection has time to stabilize
  setTimeout(() => {
    if (connectionType === 'network' && connectedPrinter) {
      _heartbeatTimer = setInterval(heartbeatCheck, HEARTBEAT_INTERVAL_MS);
    }
  }, 5000);
  return true;
};

export const connectUSBPrinter = async (vendorId, productId) => {
  if (Platform.OS !== 'android') throw new Error('USB printing only available on Android');
  if (Platform.Version >= 33) throw new Error('USB printing not supported on this Android version');
  const nativeUSB = NativeModules.RNUSBPrinter;
  if (!nativeUSB || !USBPrinter || typeof USBPrinter.init !== 'function') {
    throw new Error('USB printing not supported on this device');
  }
  if (!printerInitialized.usb) {
    await USBPrinter.init();
    printerInitialized.usb = true;
  }
  await USBPrinter.connectPrinter(vendorId, productId);
  connectedPrinter = `${vendorId}:${productId}`;
  connectionType = 'usb';
  return true;
};

export const disconnectPrinter = async () => {
  // Stop heartbeat (defined below — safe because disconnect is called at runtime, not import time)
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  try {
    if (connectionType === 'bluetooth' && BLEPrinter) {
      const hasPerms = await ensureBluetoothPermissions();
      if (hasPerms) await BLEPrinter.closeConn();
    } else if (connectionType === 'network' && NetPrinter) {
      await NetPrinter.closeConn();
    } else if (connectionType === 'usb' && USBPrinter) {
      await USBPrinter.closeConn();
    }
    // airprint doesn't need disconnect
  } catch { /* ignore */ }
  connectedPrinter = null;
  connectionType = null;
};

export const isConnected = () => !!connectedPrinter;
export const getConnectionType = () => connectionType;
export const hasNativeSupport = () => {
  try {
    return !!(BLEPrinter && NetPrinter);
  } catch {
    return false;
  }
};

// Verify the connection is actually alive by attempting a reconnect if needed.
// For network printers, also verifies the TCP socket is still open.
// Returns true if connected (or successfully reconnected), false otherwise.
export const ensureConnected = async () => {
  if (!connectedPrinter) {
    return await tryReconnect();
  }
  // For network printers, verify socket with a quick no-op write
  if (connectionType === 'network') {
    const mod = getThermalModule();
    if (mod) {
      try {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('verify timeout')), 3000);
          mod.printBill('', { beep: false, cut: false, tailingLine: false })
            .then(() => { clearTimeout(timer); resolve(); })
            .catch((e) => { clearTimeout(timer); reject(e); });
        });
      } catch {
        // Socket dead — reconnect
        console.warn('ensureConnected: network socket dead, reconnecting...');
        return await tryReconnect();
      }
    }
  }
  return true;
};

// ==================== AUTO-RECONNECT ====================

export const autoReconnect = async () => {
  const saved = await getSavedPrinter();
  if (!saved) return false;
  try {
    // Close any stale connection first (BT needs runtime permissions on Android 12+)
    try {
      if (connectionType === 'bluetooth' && BLEPrinter) {
        const hasPerms = await ensureBluetoothPermissions();
        if (hasPerms) await BLEPrinter.closeConn();
      } else if (connectionType === 'network' && NetPrinter) {
        await NetPrinter.closeConn();
      } else if (connectionType === 'usb' && USBPrinter) {
        await USBPrinter.closeConn();
      }
    } catch { /* ignore close errors */ }
    connectedPrinter = null;
    connectionType = null;

    if (saved.type === 'airprint' && saved.url) {
      connectedPrinter = saved.url;
      connectionType = 'airprint';
      return true;
    } else if (saved.type === 'bluetooth' && saved.macAddress) {
      // Don't crash if BT permissions not granted — just return false
      const hasPerms = await ensureBluetoothPermissions();
      if (!hasPerms) return false;
      await connectBluetoothPrinter(saved.macAddress);
      return true;
    } else if (saved.type === 'network' && saved.host) {
      await connectNetworkPrinter(saved.host, saved.port || 9100);
      return true;
    } else if (saved.type === 'usb' && saved.vendorId) {
      await connectUSBPrinter(saved.vendorId, saved.productId);
      return true;
    }
  } catch (err) {
    console.error('Auto-reconnect failed:', err);
    // Don't emit printer event here — callers (PrinterSetup, etc.) handle
    // failure with their own UI (Alert dialog, status indicator).
  }
  return false;
};

// ==================== TEXT GENERATION (ESC/POS for thermal printers) ====================

const CHARS_80 = 48; // 80mm paper = 48 chars
const CHARS_58 = 32; // 58mm paper = 32 chars
const CHARS = CHARS_80; // default
const getChars = (ps) => (ps?.printerWidth === 58 ? CHARS_58 : CHARS_80);
const LINE = '-'.repeat(CHARS);
const DOUBLE_LINE = '='.repeat(CHARS);
const getLine = (w) => '-'.repeat(w);
const getDoubleLine = (w) => '='.repeat(w);

const center = (text, width = CHARS) => {
  const t = String(text || '');
  if (t.length >= width) return t;
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
};

const leftRight = (left, right, width = CHARS) => {
  const l = String(left || '');
  const r = String(right || '');
  const gap = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(gap) + r;
};

// Thermal-safe currency: ₹ is not supported by most thermal printers (Code Page 437/850)
const RS = 'Rs.';

// Wrap long text into multiple centered lines
const wrapText = (text, width = CHARS) => {
  const t = String(text || '');
  if (t.length <= width) return [t];
  const words = t.split(' ');
  const lines = [];
  let current = '';
  words.forEach(w => {
    if (current.length + w.length + 1 <= width) {
      current = current ? current + ' ' + w : w;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  });
  if (current) lines.push(current);
  return lines;
};

// Format item row: "Name           Qty  Amt"
const itemRow = (name, qty, amount, width = CHARS) => {
  const qStr = `x${qty}`;
  const aStr = `${RS}${amount}`;
  const fixedRight = qStr.length + 1 + aStr.length; // "x1 Rs.110.00"
  const nameWidth = Math.max(6, width - fixedRight - 2);
  const n = name.length > nameWidth ? name.substring(0, nameWidth - 1) + '.' : name;
  const gap1 = Math.max(1, nameWidth - n.length + 1);
  const gap2 = Math.max(1, aStr.length <= 10 ? 1 : 1);
  return n + ' '.repeat(gap1) + qStr + ' '.repeat(gap2) + aStr;
};

export const generateBillText = (invoiceData) => {
  if (!invoiceData) return '';
  const ps = invoiceData.printSettings || invoiceData || {};
  const bl = ps.billLayout || {};
  const W = getChars(ps);
  const _LINE = getLine(W);
  const _DLINE = getDoubleLine(W);
  const lines = [];
  const r = invoiceData.restaurantInfo || {};
  const fmt = (n) => (n || 0).toFixed(2);

  // ── Logo (for receipt logo — only works on AirPrint/HTML path, thermal ignores it) ──
  const rLogo = ps.receiptLogo;
  if (rLogo?.enabled && rLogo?.url) {
    lines.push(`<LOGO:${rLogo.url}>`);
  }

  // ── Header ──
  wrapText(invoiceData.restaurantName || '', W).forEach(l => lines.push(`<CM>${l}</CM>`));
  if (bl.showAddress !== false && r.address) wrapText(r.address, W).forEach(l => lines.push(`<C>${l}</C>`));
  if (bl.showPhone !== false && r.phone) lines.push(`<C>Phone: ${r.phone}</C>`);
  if (r.gstin && r.showGstOnInvoice) lines.push(`GSTIN: ${r.gstin}`);
  if (r.fssai && r.showFssaiOnInvoice) lines.push(`FSSAI: ${r.fssai}`);
  lines.push(_LINE);

  // ── Invoice info ──
  if (r.showGstOnInvoice) lines.push(`<CM>Bill of Supply</CM>`);
  const payMethod = (invoiceData.paymentMethod || 'cash').charAt(0).toUpperCase() + (invoiceData.paymentMethod || 'cash').slice(1);
  lines.push(leftRight(payMethod + ' Sale', '', W));
  const invoiceNum = invoiceData.orderNumber || invoiceData.dailyOrderId || invoiceData.orderId?.slice(-6) || '-';
  const now = invoiceData.timestamp ? new Date(invoiceData.timestamp) : new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  lines.push(leftRight('', `Date: ${dateStr}`, W));
  lines.push(leftRight('', `Time: ${timeStr}`, W));
  lines.push(leftRight('', `Invoice no: ${invoiceNum}`, W));
  if (bl.showTable !== false && invoiceData.tableNumber) lines.push(leftRight('Table', invoiceData.tableNumber, W));
  if (bl.showWaiter !== false && invoiceData.waiterName) lines.push(leftRight('Waiter', invoiceData.waiterName, W));
  if (bl.showCustomer !== false && invoiceData.customerName) lines.push(leftRight('Customer', invoiceData.customerName, W));
  if (bl.showOrderType !== false && invoiceData.orderType) lines.push(leftRight('Order Type', invoiceData.orderType, W));
  // Split Bill banner
  if (invoiceData.splitInfo) {
    const si = invoiceData.splitInfo;
    const methodLabel = si.method === 'equal' ? 'Equal Split' : si.method === 'by-item' ? 'Split by Item' : 'Split by Amount';
    lines.push(_DLINE);
    lines.push(`<CM>SPLIT BILL</CM>`);
    const nameDisplay = si.guestName ? `${si.guestName} (${si.guestLabel})` : si.guestLabel;
    lines.push(`<CM>${nameDisplay} of ${si.guestCount}</CM>`);
    lines.push(`<C>(${methodLabel})</C>`);
    lines.push(_DLINE);
  } else {
    lines.push(_LINE);
  }

  // ── Item table header ──
  lines.push(`<M>${leftRight('Item Name', 'Price  Amount', W)}</M>`);
  lines.push(`<M>${leftRight('  Qty', '', W)}</M>`);
  lines.push(_LINE);

  // ── Items ──
  (invoiceData.items || []).forEach(item => {
    const qty = item.quantity || 1;
    const price = item.price || item.total / qty;
    const total = item.total || 0;
    const name = item.name || 'Item';
    // Item name line
    lines.push(name.length > W ? name.substring(0, W - 1) + '.' : name);
    // Variant (e.g., Half, Full)
    if (item.selectedVariant?.name) {
      lines.push(`  [${item.selectedVariant.name}]`);
    }
    // Customizations/toppings
    if (item.selectedCustomizations?.length > 0) {
      item.selectedCustomizations.forEach(c => lines.push(`  + ${c.name || c}`));
    }
    // Qty, Price, Amount line — weight-based items show weight instead of qty
    const qtyStr = item.soldByWeight && item.itemWeight
      ? `  ${item.itemWeight}${item.weightUnit || 'kg'}`
      : `  x${qty}`;
    const priceStr = fmt(price);
    const totalStr = fmt(total);
    const rightPart = `${priceStr}  ${totalStr}`;
    lines.push(leftRight(qtyStr, rightPart, W));
  });

  lines.push(_LINE);

  // ── Totals ──
  if (bl.showSubtotal !== false) lines.push(leftRight('Subtotal', `${RS}${fmt(invoiceData.subtotal)}`, W));
  if (invoiceData.offerDiscount > 0) lines.push(leftRight('Offer Discount', `-${RS}${fmt(invoiceData.offerDiscount)}`, W));
  if (invoiceData.manualDiscount > 0) lines.push(leftRight('Manual Discount', `-${RS}${fmt(invoiceData.manualDiscount)}`, W));
  if (invoiceData.loyaltyDiscount > 0) lines.push(leftRight('Loyalty Discount', `-${RS}${fmt(invoiceData.loyaltyDiscount)}`, W));
  if (invoiceData.serviceChargeAmount > 0) lines.push(leftRight('Service Charge', `${RS}${fmt(invoiceData.serviceChargeAmount)}`, W));
  if (bl.showTaxBreakdown !== false) {
    if (invoiceData.taxBreakdown?.length > 0) {
      invoiceData.taxBreakdown.forEach(tax => {
        const inclSuffix = tax.inclusive ? ' (incl.)' : '';
        const label = `${tax.name}${tax.rate ? ` (${tax.rate}%)` : ''}${inclSuffix}`;
        lines.push(leftRight(label, `${RS}${fmt(tax.amount)}`, W));
      });
    } else if (invoiceData.taxEnabled && invoiceData.tax > 0) {
      lines.push(leftRight(invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%)`, `${RS}${fmt(invoiceData.tax)}`, W));
    }
  }
  if (invoiceData.tipAmount > 0) lines.push(leftRight('Tip', `${RS}${fmt(invoiceData.tipAmount)}`, W));
  if (invoiceData.roundOffAmount != null && invoiceData.roundOffAmount !== 0) {
    const sign = invoiceData.roundOffAmount > 0 ? '+' : '-';
    lines.push(leftRight('Round-off', `${sign}${RS}${fmt(Math.abs(invoiceData.roundOffAmount))}`, W));
  }
  lines.push(_LINE);
  lines.push(`<M>${leftRight('Total', `${RS}${fmt(invoiceData.grandTotal)}`, W)}</M>`);
  lines.push(_DLINE);

  // ── Payment ──
  if (bl.showPayment !== false && invoiceData.cashReceived > 0) {
    lines.push(leftRight('Cash Received', `${RS}${fmt(invoiceData.cashReceived)}`, W));
    if (invoiceData.changeReturned > 0) lines.push(leftRight('Change', `${RS}${fmt(invoiceData.changeReturned)}`, W));
  }

  // ── Footer ──
  // ── Pre-bill banner (shown before footer when isPreBill is set) ──
  if (invoiceData.isPreBill) {
    lines.push(_DLINE);
    lines.push(`<CB>*** PRE-BILL ***</CB>`);
    lines.push(`<C>This is not a final bill</C>`);
    lines.push(_DLINE);
  }

  if (bl.showFooter !== false) {
    lines.push('');
    wrapText('Thank you for your visit!', W).forEach(l => lines.push(`<CM>${l}</CM>`));
  }
  if (bl.showPoweredBy !== false) {
    lines.push('');
    wrapText('Powered by DineOpen', W).forEach(l => lines.push(`<CM>${l}</CM>`));
  }
  if (bl.showFooter !== false || bl.showPoweredBy !== false) {
    lines.push('');
  }

  return lines.join('\n');
};

export const generateTokenText = (token) => {
  if (!token) return '';
  const lines = [];
  const label = token.tokenLabel || 'TOKEN';
  const counterName = (token.printStationName || token.categoryName || '').toUpperCase();

  // ── Token number (prominent) ──
  lines.push(DOUBLE_LINE);
  lines.push(`<CB>** ${label} **</CB>`);
  lines.push(DOUBLE_LINE);

  // ── Order & counter info ──
  lines.push(`<CM>Order #${token.orderNumber || ''}</CM>`);
  if (counterName) lines.push(`<CM>[ ${counterName} ]</CM>`);
  lines.push(LINE);

  // ── Items ──
  (token.items || []).forEach(i => {
    const qty = i.quantity || 1;
    const price = i.price || 0;
    const itemTotal = i.total || (qty * price);
    const name = i.name || 'Item';
    lines.push(leftRight(`${qty}x ${name}`, itemTotal ? `${RS}${itemTotal.toFixed(2)}` : ''));
    if (i.variant) lines.push(`   ${i.variant}`);
    if (i.customizations?.length > 0) {
      const custs = Array.isArray(i.customizations) ? i.customizations.map(c => c.name || c).join(', ') : '';
      if (custs) lines.push(`   ${custs}`);
    }
  });

  // ── Total ──
  if (token.tokenTotal) {
    lines.push(LINE);
    lines.push(leftRight('Total', `${RS}${token.tokenTotal.toFixed(2)}`));
  }
  lines.push(LINE);

  // ── Footer ──
  lines.push(center(`Items: ${token.itemCount || 0}`));
  if (token.time) lines.push(center(token.time));
  lines.push('');
  lines.push(center('Present token at counter'));
  if (token.restaurantName) {
    wrapText(token.restaurantName, CHARS).forEach(l => lines.push(center(l)));
  }
  lines.push('');

  return lines.join('\n');
};

// ==================== KOT TEXT GENERATION ====================

const formatKOTTime = (date) => {
  if (!date) return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

const formatKOTDate = (date) => {
  if (!date) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const generateKOTText = (data) => {
  const ps = data.printSettings || data || {};
  const kl = ps.kotLayout || {};
  const W = getChars(ps);
  const _LINE = getLine(W);
  const location = kl.showTable !== false ? (data.roomNumber ? `Room: ${data.roomNumber}` : (data.tableNumber ? `Table: ${data.tableNumber}` : '')) : '';

  const formatItemLine = (item, opts = {}) => {
    const subline = getItemSubline(item);
    const qty = item.quantity || 1;
    const tag = opts.isRemoved ? ' [CANCEL]' : (opts.showDelta && item.quantityDelta > 0 ? ' [+NEW]' : '');
    const name = item.name || 'Item';
    // Qty column (4 chars) + Item name
    const qtyCol = `${qty}x`.padEnd(4);
    const itemLine = `${qtyCol}${name}${tag}`;
    const lines = [itemLine];
    if (item.selectedVariant?.name) lines.push(`    [${item.selectedVariant.name}]`);
    if (item.selectedCustomizations?.length > 0) {
      item.selectedCustomizations.forEach(c => lines.push(`    + ${c.name || c}`));
    }
    if (subline) lines.push(`    (${subline})`);
    if (item.notes) lines.push(`    Note: ${item.notes}`);
    return lines.join('\n');
  };

  const removedItems = data.removedItems || [];
  const hasChanges = data.isIncremental && (data.items.length > 0 || removedItems.length > 0);

  // Build items section
  const itemLines = [];
  if (hasChanges) {
    if (removedItems.length > 0) {
      itemLines.push(center('*** CANCELLED ***', W));
      removedItems.forEach(item => itemLines.push(formatItemLine(item, { isRemoved: true })));
    }
    const reducedItems = data.items.filter(i => i.isUpdated && i.quantityDelta < 0);
    if (reducedItems.length > 0) {
      itemLines.push(center('*** REDUCED ***', W));
      reducedItems.forEach(item => itemLines.push(formatItemLine({ ...item, quantity: Math.abs(item.quantityDelta) }, { isRemoved: true })));
    }
    const newAndIncreased = data.items.filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0));
    if (newAndIncreased.length > 0) {
      itemLines.push(center('*** NEW ITEMS ***', W));
      newAndIncreased.forEach(item => itemLines.push(formatItemLine(item, { showDelta: item.isUpdated })));
    }
    const unmarked = data.items.filter(i => !i.isNew && !i.isUpdated);
    unmarked.forEach(item => itemLines.push(formatItemLine(item)));
  } else {
    data.items.forEach(item => itemLines.push(formatItemLine(item)));
  }

  const title = hasChanges ? 'KOT UPDATE' : 'KITCHEN ORDER';
  const totalQty = data.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const footerText = hasChanges
    ? `+${data.items.filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0)).length} new, ${removedItems.length + data.items.filter(i => i.isUpdated && i.quantityDelta < 0).length} removed`
    : `Total: ${totalQty} items`;

  // ── Assemble ──
  const lines = [];
  if (kl.showRestaurantName !== false) {
    wrapText(data.restaurantName || '', W).forEach(l => lines.push(`<CM>${l}</CM>`));
  }
  if (kl.showKotTitle !== false) lines.push(`<CM>--- ${title} ---</CM>`);
  lines.push(_LINE);

  // Order info — side by side where possible
  const ordNum = `#${data.orderNumber || data.dailyOrderId || data.orderId?.slice(-6) || ''}`;
  const showOrdNum = kl.showOrderNumber !== false;
  const showLoc = kl.showTable !== false;
  if (showOrdNum && showLoc && location) {
    lines.push(leftRight(`Order ${ordNum}`, location, W));
  } else if (showOrdNum) {
    lines.push(`Order ${ordNum}`);
  } else if (showLoc && location) {
    lines.push(location);
  }
  if (kl.showDate !== false) {
    lines.push(leftRight(formatKOTDate(data.timestamp), formatKOTTime(data.timestamp), W));
  } else {
    lines.push(leftRight('', formatKOTTime(data.timestamp), W));
  }
  if (kl.showOrderType !== false && data.orderType) lines.push(`Type: ${data.orderType}`);
  if (kl.showWaiter !== false && data.waiterName) lines.push(`Waiter: ${data.waiterName}`);
  if (kl.showCustomer !== false && data.customerName) lines.push(`Customer: ${data.customerName}`);
  lines.push(_LINE);

  // Item header — M = double-height bold
  lines.push(`<M>${leftRight('Qty Item', '', W)}</M>`);
  lines.push(_LINE);

  // Items
  lines.push(itemLines.join('\n'));
  lines.push(_LINE);

  // Footer
  lines.push(footerText);

  // Special instructions (matches frontend KOT template label)
  if (data.specialInstructions) {
    lines.push(_LINE);
    lines.push(center('*** SPECIAL INSTRUCTIONS ***', W));
    lines.push(data.specialInstructions);
  }
  lines.push('');

  return lines.join('\n');
};

export const wrapKOTTextInHTML = (text) => {
  // Extract and render logo tag if present
  let logoHtml = '';
  let cleanText = text;
  const logoMatch = text.match(/^<LOGO:(.+?)>\n?/);
  if (logoMatch) {
    logoHtml = `<div style="text-align:center;margin-bottom:8px;"><img src="${logoMatch[1]}" style="max-width:80px;height:auto;" /></div>`;
    cleanText = text.replace(logoMatch[0], '');
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{font-family:'Courier New',monospace;max-width:80mm;margin:0 auto;padding:20px;font-size:14px;}pre{white-space:pre-wrap;word-wrap:break-word;}</style>
</head><body>${logoHtml}<pre>${cleanText}</pre></body></html>`;
};

// Generate KOT HTML using the template system (for AirPrint / WebView)
export const generateKOTHTML = (orderData, printSettings = {}) => {
  const kotData = {
    restaurantName: orderData.restaurantName || '',
    restaurantPhone: orderData.restaurantPhone || '',
    orderId: orderData.orderId,
    dailyOrderId: orderData.orderNumber || orderData.dailyOrderId || orderData.orderId,
    tableNumber: orderData.tableNumber || '',
    roomNumber: orderData.roomNumber || '',
    floorName: orderData.floorName || '',
    customerName: orderData.customerName || '',
    orderType: orderData.orderType || '',
    waiterName: orderData.waiterName || '',
    specialInstructions: orderData.specialInstructions || orderData.notes || '',
    items: orderData.items || [],
    removedItems: orderData.removedItems || [],
    isIncremental: orderData.isIncremental || false,
    currencySymbol: orderData.currencySymbol || '',
  };
  return renderKOT(kotData, printSettings, {});
};

// ==================== SILENT PRINT DISPATCH ====================

// Get the right printer module for the current connection type
const getThermalModule = () => {
  switch (connectionType) {
    case 'bluetooth': return BLEPrinter;
    case 'network': return NetPrinter;
    case 'usb': return USBPrinter;
    default: return null;
  }
};

// Try to reconnect to the saved printer (used when print fails due to dead connection)
// If a reconnect is already in progress, concurrent callers wait for it instead of failing.
const tryReconnect = async () => {
  // If a reconnect is already in progress, wait for it
  if (_reconnectPromise) {
    try {
      return await _reconnectPromise;
    } catch {
      return false;
    }
  }

  _reconnectPromise = (async () => {
    try {
      const saved = await getSavedPrinter();
      if (!saved) return false;
      // Close stale connection first (BT needs runtime permissions on Android 12+)
      try {
        if (connectionType === 'bluetooth' && BLEPrinter) {
          const hasPerms = await ensureBluetoothPermissions();
          if (hasPerms) await BLEPrinter.closeConn();
        } else if (connectionType === 'network' && NetPrinter) {
          await NetPrinter.closeConn();
        } else if (connectionType === 'usb' && USBPrinter) {
          await USBPrinter.closeConn();
        }
      } catch { /* ignore close errors on dead socket */ }
      connectedPrinter = null;
      connectionType = null;
      // Re-establish connection (with timeout to avoid blocking queue on unreachable printer)
      if (saved.type === 'network' && saved.host) {
        await withPrintTimeout(connectNetworkPrinter(saved.host, saved.port || 9100), 'reconnect-network');
        return true;
      } else if (saved.type === 'bluetooth' && saved.macAddress) {
        const hasPerms = await ensureBluetoothPermissions();
        if (!hasPerms) return false;
        await withPrintTimeout(connectBluetoothPrinter(saved.macAddress), 'reconnect-bluetooth');
        return true;
      } else if (saved.type === 'usb' && saved.vendorId) {
        await withPrintTimeout(connectUSBPrinter(saved.vendorId, saved.productId), 'reconnect-usb');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Reconnect failed:', err);
      return false;
    } finally {
      _reconnectPromise = null;
    }
  })();

  return _reconnectPromise;
};

// Delay helper for retry backoff
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Silent print via thermal printer (Bluetooth / WiFi / USB)
// On failure, reconnects and retries up to MAX_PRINT_RETRIES times with backoff
const printViaThermal = async (text) => {
  const mod = getThermalModule();
  if (!mod) throw new Error('No thermal printer connected');
  // Strip logo tag — thermal printers don't support images via ESC/POS text
  const cleanText = text.replace(/^<LOGO:.+?>\n?/, '');
  const printOpts = { beep: false, cut: true, tailingLine: true };
  const payload = cleanText + '\n\n\n';

  let lastErr = null;

  for (let attempt = 0; attempt < MAX_PRINT_RETRIES; attempt++) {
    // Wait before retries (not before first attempt)
    if (attempt > 0) {
      const backoffMs = RETRY_DELAYS[attempt - 1] || 1500;
      console.log(`Print retry ${attempt}/${MAX_PRINT_RETRIES - 1} in ${backoffMs}ms...`);
      emitPrinterEvent({ type: 'retrying', attempt, maxRetries: MAX_PRINT_RETRIES });
      await delay(backoffMs);

      // Reconnect before retry
      emitPrinterEvent({ type: 'reconnecting' });
      const reconnected = await tryReconnect();
      if (!reconnected) {
        continue; // try next attempt — tryReconnect may succeed on next try
      }
      emitPrinterEvent({ type: 'reconnected' });
    }

    try {
      const currentMod = getThermalModule();
      if (!currentMod) {
        lastErr = new Error('No thermal printer module available');
        continue;
      }
      await withPrintTimeout(
        currentMod.printBill(payload, printOpts),
        `printBill attempt ${attempt + 1}`,
      );
      // Success — emit event and return
      if (attempt > 0) {
        emitPrinterEvent({ type: 'print_recovered', attempt: attempt + 1 });
      }
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`Print attempt ${attempt + 1}/${MAX_PRINT_RETRIES} failed:`, err.message);
    }
  }

  // All attempts exhausted
  emitPrinterEvent({
    type: 'print_failed',
    message: 'Print failed after multiple retries. Check printer connection.',
  });
  throw lastErr;
};

// Silent print via AirPrint (iOS - no dialog when printer URL is saved)
const printViaAirPrint = async (html, printerUrl) => {
  await Print.printAsync({ html, printer: printerUrl });
};

// ==================== PUBLIC API ====================

/**
 * Print content silently. Auto-selects the best method:
 *
 *   Bluetooth/WiFi/USB thermal → sends ESC/POS text directly (silent)
 *   iOS AirPrint               → sends HTML to saved printer (silent)
 *   Fallback                   → system print dialog (not silent)
 *
 * @param {object} options
 * @param {string} options.html - HTML content (for AirPrint & dialog fallback)
 * @param {string} options.text - Plain text (for thermal printers)
 * @returns {Promise<{method: string}>}
 */
export const printContent = async ({ html, text, silentOnly = false }) => {
  return enqueuePrint(async () => {
    const mode = await getPrinterMode();

    if ((mode === 'silent' || silentOnly) && connectedPrinter) {
      // iOS AirPrint - silent with saved printer URL
      if (connectionType === 'airprint' && html) {
        try {
          await printViaAirPrint(html, connectedPrinter);
          return { method: 'silent-airprint' };
        } catch (err) {
          console.error('AirPrint silent failed:', err);
          if (silentOnly) return { method: 'skipped', reason: 'airprint-failed' };
          // fall through to dialog
        }
      }

      // Thermal printers (Bluetooth / WiFi / USB) - silent with ESC/POS text
      if (connectionType !== 'airprint' && text) {
        try {
          await printViaThermal(text);
          return { method: `silent-${connectionType}` };
        } catch (err) {
          console.error(`${connectionType} silent print failed:`, err);
          if (silentOnly) return { method: 'skipped', reason: `${connectionType}-failed` };
          // fall through to dialog
        }
      }

      // silentOnly but no matching print path — skip
      if (silentOnly) return { method: 'skipped', reason: 'no-printer-match' };
    }

    // silentOnly mode: never open dialog — notify user that printer is not connected
    if (silentOnly) {
      emitPrinterEvent({ type: 'disconnected', message: 'Printer not connected. Please connect a printer in Settings.' });
      return { method: 'skipped', reason: 'no-connected-printer' };
    }

    // Fallback: system print dialog
    if (html) {
      if (mode === 'silent') {
        // We were supposed to print silently but couldn't — notify user
        emitPrinterEvent({
          type: 'fallback',
          message: 'Silent print failed. Printer may be disconnected. Opening print dialog as fallback.',
        });
      }
      await Print.printAsync({ html });
      return { method: 'dialog' };
    }

    throw new Error('No printable content provided');
  });
};

/**
 * Print a test page
 */
export const printTestPage = async () => {
  const testText = [
    LINE,
    center('PRINTER TEST'),
    LINE,
    '',
    center('DineOpen POS'),
    center('Printer Connection OK!'),
    '',
    LINE,
    `Date: ${new Date().toLocaleString('en-IN')}`,
    `Type: ${connectionType || 'system dialog'}`,
    `Printer: ${connectedPrinter ? String(connectedPrinter).substring(0, 30) : 'System default'}`,
    `Platform: ${Platform.OS}`,
    LINE,
    '',
    center('If you can read this,'),
    center('your printer is working!'),
    '',
    LINE,
  ].join('\n');

  const testHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{font-family:'Courier New',monospace;max-width:80mm;margin:0 auto;padding:20px;font-size:14px;}pre{white-space:pre-wrap;word-wrap:break-word;}</style>
</head><body><pre>${testText}</pre></body></html>`;

  return printContent({ html: testHtml, text: testText });
};

// ==================== HEARTBEAT (WiFi keep-alive) ====================
// Periodically checks if the WiFi printer connection is alive.
// If it detects a stale connection, proactively reconnects so the next
// print job doesn't fail due to a dead socket.

const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds

const heartbeatCheck = async () => {
  // Only heartbeat for WiFi/network printers — BLE and USB have their own keep-alive
  if (connectionType !== 'network' || !connectedPrinter) return;

  const mod = getThermalModule();
  if (!mod) return;

  try {
    // Send a no-op print (empty data) to verify socket is alive.
    // Most thermal printers ignore empty payloads. We use a short timeout
    // so this doesn't block anything if the printer is slow.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('heartbeat timeout')), 5000);
      // printBill with empty string — printer ignores it but TCP write confirms socket
      mod.printBill('', { beep: false, cut: false, tailingLine: false })
        .then(() => { clearTimeout(timer); resolve(); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  } catch (err) {
    console.warn('Heartbeat failed, WiFi printer may be disconnected:', err.message);
    emitPrinterEvent({ type: 'connection_stale' });
    // Proactively reconnect
    try {
      const reconnected = await tryReconnect();
      if (reconnected) {
        emitPrinterEvent({ type: 'reconnected', source: 'heartbeat' });
        console.log('Heartbeat: reconnected to WiFi printer');
      } else {
        emitPrinterEvent({ type: 'disconnected', message: 'Printer connection lost. Will retry on next print.', source: 'heartbeat' });
      }
    } catch {
      // Reconnect failed — will retry on next heartbeat or next print
    }
  }
};

export const startHeartbeat = () => {
  stopHeartbeat(); // clear any existing timer
  if (connectionType === 'network' && connectedPrinter) {
    _heartbeatTimer = setInterval(heartbeatCheck, HEARTBEAT_INTERVAL_MS);
  }
};

export const stopHeartbeat = () => {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
};

// Note: heartbeat auto-starts from connectNetworkPrinter via setTimeout.
// External callers can also use startHeartbeat() / stopHeartbeat() directly.

// ==================== PRINT WITH FEEDBACK ====================
// Convenience wrapper around printContent that returns a structured result
// indicating success/failure — callers use this to show toast/alerts.
// Works for both native screens and WebView bridge.

/**
 * Print content and return a detailed result object.
 * Never throws — always returns { success, method, error }.
 *
 * @param {object} options - Same as printContent options
 * @param {string} options.html - HTML content
 * @param {string} options.text - ESC/POS text content
 * @param {boolean} options.silentOnly - If true, skip dialog fallback
 * @param {string} options.label - Label for logs/events (e.g. 'KOT', 'Bill')
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
export const printWithFeedback = async ({ html, text, silentOnly = true, label = 'Print' }) => {
  // If remote print is enabled, skip local printing — desktop app handles it via Firebase RTDB
  const remotePrint = await getRemotePrintEnabled();
  if (remotePrint) {
    return { success: true, method: 'remote', notify: false };
  }

  const notifEnabled = await getPrintNotificationsEnabled();
  try {
    const result = await printContent({ html, text, silentOnly });

    if (result?.method?.startsWith('silent-') || result?.method === 'dialog') {
      return { success: true, method: result.method, notify: false };
    }

    if (result?.method === 'skipped') {
      const reason = result.reason || 'unknown';
      // Distinguish between "no printer" vs "print attempt failed"
      const isPrinterMissing = reason === 'no-connected-printer' || reason === 'no-printer-match';
      return {
        success: false,
        method: 'skipped',
        notify: notifEnabled,
        error: isPrinterMissing
          ? `${label} not printed — no printer connected`
          : `${label} print failed — ${reason}`,
      };
    }

    return { success: true, method: result?.method || 'unknown', notify: false };
  } catch (err) {
    return {
      success: false,
      method: 'error',
      notify: notifEnabled,
      error: `${label} print failed — ${err.message || 'unknown error'}`,
    };
  }
};
