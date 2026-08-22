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
import { Platform, PermissionsAndroid, AppState } from 'react-native';
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
import { seatLetter } from '../utils/seatOrdering';
import { renderKOT, renderBill } from '../utils/printTemplates/index';
import { splitIndiaGst, attachInclusiveSplits } from '../utils/printTemplates/helpers';

const SAVED_PRINTER_KEY = 'dine_saved_printer';
const PRINTER_MODE_KEY = 'dine_printer_mode'; // 'silent' | 'dialog'
const PRINT_NOTIF_KEY = 'dine_print_notifications'; // 'true' | 'false'
const REMOTE_PRINT_KEY = 'dine_remote_print'; // 'true' | 'false' — print from desktop app
const DISCONNECT_ALERT_KEY = 'dine_printer_disconnect_alert'; // 'true' | 'false' — show disconnect alert when no remote print
const PENDING_PRINT_JOBS_KEY = 'dine_pending_print_jobs_v1';
const MAX_PENDING_PRINT_JOBS = 10;

// ==================== PRINTER STATE ====================

let connectedPrinter = null;
let connectionType = null; // 'bluetooth' | 'network' | 'usb' | 'airprint'
let printerInitialized = { bluetooth: false, network: false, usb: false };

// ── Image (HTML) receipt printing — OPT-IN, default OFF ──
// When enabled (printSettings.imagePrintEnabled), the thermal path renders the web bill/KOT HTML
// to an image and prints it (same layout as desktop). Falls back to ESC/POS text on any failure.
let _imagePrintEnabled = false;
let _imagePrintWidth = 576; // px; 58mm ≈ 384, 80mm ≈ 576
// Auto-use the image path for receipts whose currency symbol can't render on a thermal
// code page (₹, ر.ق, GH₵, …) so the REAL glyph prints instead of the ASCII fallback ("Rs").
// On by default; falls back to sanitized text if the printer can't do images. Set
// autoImageForCurrency:false to force plain text even for those currencies.
let _autoImageForCurrency = true;
export const setImagePrintConfig = ({ enabled, printerWidth, autoImageForCurrency } = {}) => {
  _imagePrintEnabled = !!enabled;
  if (autoImageForCurrency !== undefined) _autoImageForCurrency = !!autoImageForCurrency;
  const w = String(printerWidth ?? '');
  if (w.includes('58') || w === '384') _imagePrintWidth = 384;
  else if (w.includes('80') || w === '576') _imagePrintWidth = 576;
  else if (Number(printerWidth) >= 200 && Number(printerWidth) <= 1200) _imagePrintWidth = Number(printerWidth);
  // else keep default 576
};
export const isImagePrintOn = () => _imagePrintEnabled;
let activeScanCancelled = false;
let activeZeroconf = null;
let _reconnectPromise = null; // shared Promise so concurrent callers wait for reconnect
let printerEventListeners = [];
let _heartbeatTimer = null; // WiFi heartbeat interval ID
let _activePrintJobs = 0;
let _lastBluetoothError = null;
// iOS PrinterSDK connects using an opaque CoreBluetooth Printer object, not just the persisted
// UUID. Remember UUIDs found in this JS process so a cold-start reconnect can rescan only when the
// native object needs to be recreated, rather than delaying every print with a scan.
const _knownBluetoothDeviceIds = new Set();
let _jobStoreChain = Promise.resolve();

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
      .then(async () => {
        _activePrintJobs += 1;
        try { return await fn(); }
        finally { _activePrintJobs = Math.max(0, _activePrintJobs - 1); }
      })
      .then(resolve, reject);
  });
};

// ==================== PRINT TIMEOUT & RETRY CONFIG ====================

const PRINT_TIMEOUT_MS = 15000; // 15 seconds — WiFi printers can be slow to ACK
const RETRY_DELAYS = [800, 1500];

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

// ==================== FAILED-JOB RECOVERY ====================
// Persist before dispatch and remove only after a confirmed/accepted send. Jobs are NEVER retried
// automatically because a cheap thermal printer cannot prove paper output; automatic retry could
// duplicate a KOT. Staff can explicitly retry after checking the printer.

const readPendingPrintJobs = async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_PRINT_JOBS_KEY);
    const jobs = raw ? JSON.parse(raw) : [];
    return Array.isArray(jobs) ? jobs : [];
  } catch { return []; }
};

const mutatePendingPrintJobs = (mutator) => {
  const run = async () => {
    const current = await readPendingPrintJobs();
    const next = await mutator(current);
    await AsyncStorage.setItem(PENDING_PRINT_JOBS_KEY, JSON.stringify((next || []).slice(-MAX_PENDING_PRINT_JOBS)));
    return next;
  };
  const result = _jobStoreChain.then(run, run);
  _jobStoreChain = result.catch(() => {});
  return result;
};

const createPendingPrintJob = async ({ html, text, imageHtml, silentOnly, label }) => {
  const id = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id, label: label || 'Print', createdAt: Date.now(), updatedAt: Date.now(), status: 'queued',
    payload: { html: html || null, text: text || null, imageHtml: imageHtml || null, silentOnly: silentOnly !== false },
  };
  await mutatePendingPrintJobs(jobs => [...jobs, job]);
  return id;
};

const updatePendingPrintJob = (id, patch) => mutatePendingPrintJobs(jobs => jobs.map(job => (
  job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job
)));

const removePendingPrintJob = (id) => mutatePendingPrintJobs(jobs => jobs.filter(job => job.id !== id));

export const getPendingPrintJobs = async () => {
  await _jobStoreChain.catch(() => {});
  return readPendingPrintJobs();
};

export const dismissPendingPrintJob = async (id) => removePendingPrintJob(id);

export const retryPendingPrintJob = async (id) => {
  const jobs = await getPendingPrintJobs();
  const job = jobs.find(j => j.id === id);
  if (!job) return { success: false, method: 'missing', error: 'Print job no longer exists' };
  await updatePendingPrintJob(id, { status: 'retrying', error: null });
  return printWithFeedback({ ...job.payload, label: job.label, _existingJobId: id });
};

// ==================== BLUETOOTH PERMISSIONS ====================

// On Android 12+ (API 31+), BLUETOOTH_CONNECT and BLUETOOTH_SCAN are runtime permissions.
// Calling BLE APIs without them causes a native SecurityException crash.
const ensureBluetoothPermissions = async ({ forScan = false, request = true } = {}) => {
  if (Platform.OS !== 'android') return true;
  try {
    // Android 12+ (API 31) requires runtime BT permissions
    // On older Android, these permissions don't exist and are auto-granted
    if (Platform.Version >= 31) {
      const wanted = [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
      if (forScan) wanted.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
      const alreadyGranted = await Promise.all(wanted.map(p => PermissionsAndroid.check(p)));
      if (alreadyGranted.every(Boolean)) return true;
      if (!request) return false;
      const statuses = await PermissionsAndroid.requestMultiple(wanted);
      const connectGranted = statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const scanGranted = !forScan || statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      if (!connectGranted || !scanGranted) {
        const permanentlyDenied = wanted.some(p => statuses[p] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
        _lastBluetoothError = permanentlyDenied
          ? 'Bluetooth permission is permanently denied. Open phone Settings and allow Nearby devices.'
          : 'Bluetooth permission was not granted.';
        return false;
      }
    } else if (forScan) {
      // Android 6-11 gate Bluetooth discovery/device visibility behind location permission.
      const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      const granted = await PermissionsAndroid.check(fine);
      if (!granted) {
        if (!request) return false;
        const status = await PermissionsAndroid.request(fine);
        if (status !== PermissionsAndroid.RESULTS.GRANTED) {
          _lastBluetoothError = status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
            ? 'Location permission is permanently denied. Open phone Settings to discover Bluetooth printers.'
            : 'Location permission is required to find paired Bluetooth printers on this Android version.';
          return false;
        }
      }
    }
    _lastBluetoothError = null;
    return true;
  } catch (err) {
    console.error('Error requesting Bluetooth permissions:', err);
    _lastBluetoothError = err?.message || 'Could not check Bluetooth permissions.';
    return false;
  }
};

export const getLastBluetoothError = () => _lastBluetoothError;

// ==================== DISCOVERY ====================

// Bluetooth printers (Android + iOS)
export const discoverBluetoothPrinters = async () => {
  if (!BLEPrinter) return [];
  try {
    // Request runtime Bluetooth permissions on Android 12+ before touching BLE APIs
    const hasPerms = await ensureBluetoothPermissions({ forScan: true });
    if (!hasPerms) return [];

    if (!printerInitialized.bluetooth) {
      await BLEPrinter.init();
      printerInitialized.bluetooth = true;
    }
    const devices = await BLEPrinter.getDeviceList();
    const mapped = (devices || []).map(d => ({
      id: d.inner_mac_address || d.device_name,
      name: d.device_name || 'Unknown Printer',
      macAddress: d.inner_mac_address,
      type: 'bluetooth',
    }));
    mapped.forEach(device => {
      if (device.macAddress) _knownBluetoothDeviceIds.add(device.macAddress);
    });
    _lastBluetoothError = mapped.length === 0
      ? Platform.OS === 'ios'
        ? 'No compatible BLE printer found. Keep it switched on and nearby. Some Bluetooth Classic printers support Android only.'
        : 'No paired Bluetooth printer found. Pair the printer in phone Bluetooth Settings, then scan again.'
      : null;
    return mapped;
  } catch (err) {
    const message = err?.message || String(err);
    _lastBluetoothError = /no device found/i.test(message)
      ? Platform.OS === 'ios'
        ? 'No compatible BLE printer found. Keep it switched on and nearby, then scan again.'
        : 'No paired Bluetooth printer found. Pair the printer in phone Bluetooth Settings, then scan again.'
      : message;
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
    await ensureBluetoothPermissions({ forScan: true });
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
  // On iOS the saved UUID alone cannot recreate the vendor SDK's Printer object after the app is
  // killed. Perform one bounded BLE rediscovery on cold start, then reuse that object for normal
  // reconnects/prints. Android connects directly from its persisted MAC/bonded device record.
  if (Platform.OS === 'ios' && !_knownBluetoothDeviceIds.has(macAddress)) {
    const discovered = await discoverBluetoothPrinters();
    if (!discovered.some(device => device.macAddress === macAddress)) {
      const error = new Error('Saved Bluetooth printer was not found. Switch it on, keep it nearby, and try again.');
      _lastBluetoothError = error.message;
      throw error;
    }
  }
  try {
    await withPrintTimeout(BLEPrinter.connectPrinter(macAddress), 'Bluetooth connection');
  } catch (err) {
    _lastBluetoothError = err?.message || String(err);
    throw err;
  }
  connectedPrinter = macAddress;
  connectionType = 'bluetooth';
  _lastBluetoothError = null;
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
  // For network printers, trust the connection state rather than sending
  // empty printBill('') which some printers render as blank paper strips.
  // If the socket is dead, the next real printViaThermal call will fail
  // and trigger a reconnect at that point.
  return true;
};

// ==================== AUTO-RECONNECT ====================

export const autoReconnect = async () => {
  // Use the shared reconnect promise so app-start, foreground health, settings and an order
  // cannot close/re-open the same Bluetooth socket at the same time.
  if (_activePrintJobs > 0) return !!connectedPrinter;
  return tryReconnect();
};

// ==================== LIVE CONNECTION HEALTH ====================
// The old isConnected() just returned !!connectedPrinter — "connected once = connected forever",
// which is wrong (esp. Bluetooth, which drops silently when idle/backgrounded). This layer gives a
// REAL, live status by actively probing the printer, auto-heals (max 2 reconnects), and streams the
// status to the UI via the existing printer-event bus. It never fakes "connected".

let printerHealth = 'none';   // 'none' | 'checking' | 'connected' | 'disconnected'
let lastHealthCheck = 0;
let _healing = false;
let _checking = false;
let _fgHeartbeat = null;
let _monitorStarted = false;

export const getPrinterHealth = () => ({
  status: printerHealth,
  lastChecked: lastHealthCheck,
  connectionType,
  printer: connectedPrinter,
});

const setHealth = (status) => {
  lastHealthCheck = Date.now();
  const previous = printerHealth;
  const changed = status !== printerHealth;
  printerHealth = status;
  // Always emit so the UI's "last checked" updates; UI can debounce on `status`.
  emitPrinterEvent({ type: 'health', status, changed, connectionType, printer: connectedPrinter, ts: lastHealthCheck });
  if (changed && status === 'disconnected') {
    const message = connectionType === 'bluetooth' && _lastBluetoothError
      ? `Bluetooth printer disconnected: ${_lastBluetoothError}`
      : 'Printer is not reachable. Switch it on and tap Retry before the next order.';
    emitPrinterEvent({ type: 'disconnected', message, connectionType, printer: connectedPrinter, ts: lastHealthCheck });
  } else if (changed && status === 'connected' && previous === 'disconnected') {
    emitPrinterEvent({ type: 'reconnected', connectionType, printer: connectedPrinter, ts: lastHealthCheck });
  }
};

// Short-timeout TCP reachability test for a network printer (reuses the scan probe technique):
// any TCP response (even a rejected HTTP one) = port open = printer reachable.
const netProbe = (host, port = 9100, timeout = 2000) => new Promise((resolve) => {
  let done = false;
  const finish = (v) => { if (!done) { done = true; resolve(v); } };
  const timer = setTimeout(() => finish(false), timeout);
  let controller = null;
  try { controller = new AbortController(); setTimeout(() => { try { controller.abort(); } catch {} }, timeout); } catch {}
  fetch(`http://${host}:${port}/`, { method: 'HEAD', ...(controller ? { signal: controller.signal } : {}) })
    .then(() => { clearTimeout(timer); finish(true); })
    .catch((err) => {
      clearTimeout(timer);
      const msg = (err?.message || '').toLowerCase();
      // "Network request failed" / aborted / timed out = unreachable; any OTHER error = the socket
      // responded (e.g. JSON parse error on the raw ESC/POS reply) = port is open = reachable.
      if (msg.includes('network request failed') || msg.includes('abort') || msg.includes('timed out') || msg.includes('timeout')) finish(false);
      else finish(true);
    });
});

// Actively test whether the saved/connected printer is really reachable RIGHT NOW.
export const probePrinterAlive = async () => {
  const saved = await getSavedPrinter();
  const type = connectionType || saved?.type;
  if (!type) return false;
  if (type === 'network') {
    const host = saved?.host || (connectedPrinter ? String(connectedPrinter).split(':')[0] : null);
    const port = saved?.port || 9100;
    return host ? await netProbe(host, port) : false;
  }
  if (type === 'bluetooth') {
    // A bonded/paired device remains in getDeviceList() while powered off, so it is NOT a health
    // signal. Close and establish a fresh RFCOMM socket; this is the only dependable readiness
    // check exposed by this class of low-cost Bluetooth thermal printer.
    return await tryReconnect();
  }
  // USB rarely drops; AirPrint is resolved per-print — trust the flag.
  return !!connectedPrinter;
};

// Auto-heal: try to reconnect the saved printer, up to 2 attempts with a short backoff.
export const healConnection = async () => {
  if (_healing) return printerHealth === 'connected';
  _healing = true;
  // Do not flash a reconnect banner every heartbeat while a printer remains powered off.
  // Explicit print attempts still emit their own reconnecting event.
  if (printerHealth !== 'disconnected') emitPrinterEvent({ type: 'reconnecting' });
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ok = await autoReconnect();
      if (ok) { emitPrinterEvent({ type: 'reconnected' }); return true; }
      if (attempt < 2) await new Promise(r => setTimeout(r, attempt === 1 ? 800 : 1500));
    }
    return false;
  } catch {
    return false;
  } finally {
    _healing = false;
  }
};

// The one entry point the UI + triggers use: probe → if dead, heal (max 2) → set live status.
// Never shows 'connected' without a fresh probe/reconnect this call.
export const checkAndHeal = async () => {
  if (_checking) return printerHealth;
  // Never let the health monitor close a socket while a receipt is being written.
  if (_activePrintJobs > 0) return printerHealth;
  _checking = true;
  try {
    const saved = await getSavedPrinter();
    if (!saved) { setHealth('none'); return 'none'; }
    setHealth('checking');
    const alive = await probePrinterAlive();
    if (alive) { setHealth('connected'); return 'connected'; }
    const healed = await healConnection();
    setHealth(healed ? 'connected' : 'disconnected');
    return healed ? 'connected' : 'disconnected';
  } catch {
    setHealth('disconnected');
    return 'disconnected';
  } finally {
    _checking = false;
  }
};

// Start the health monitor once (called from app root). Re-verifies on every foreground (so a
// status that went stale while the app was idle/backgrounded all day is re-checked), plus a light
// heartbeat while foregrounded. Battery-safe: no polling in the background.
export const startPrinterHealthMonitor = () => {
  if (_monitorStarted) return;
  _monitorStarted = true;
  const startHeartbeat = () => { if (!_fgHeartbeat) _fgHeartbeat = setInterval(() => { checkAndHeal().catch(() => {}); }, 45000); };
  const stopHeartbeat = () => { if (_fgHeartbeat) { clearInterval(_fgHeartbeat); _fgHeartbeat = null; } };
  try {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') { checkAndHeal().catch(() => {}); startHeartbeat(); }
      else { stopHeartbeat(); }
    });
    if (AppState.currentState === 'active') { checkAndHeal().catch(() => {}); startHeartbeat(); }
  } catch { /* AppState unavailable — monitor is best-effort */ }
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

// Thermal-safe currency: ₹ (and most non-ASCII currency glyphs) are NOT in a
// thermal printer's single-byte code page (CP437/CP1252). Sending the UTF-8 bytes
// prints garbage (e.g. "Ré‖") AND inflates the line width so trailing digits wrap.
// So map any non-ASCII symbol to a safe ASCII equivalent for the thermal TEXT path.
import { getCurrencySymbol as _getCS } from '../utils/formatCurrency';
// Covers every non-ASCII symbol in dine-frontend's currencyData.js + common extras.
// Longest/most-specific keys FIRST so multi-char glyphs (GH₵, ر.س) replace before their
// single-char components (₵, ر) when used as a global text sweep.
const CURRENCY_ASCII = {
  'GH₵': 'GHc',                         // Ghana Cedi (multi-char — before ₵)
  'ر.س': 'SR', '.د.ب': 'BD', 'د.ب': 'BD', 'د.إ': 'AED', 'ر.ق': 'QR', // Gulf (multi-char)
  '₹': 'Rs', '₨': 'Rs',                 // India / Pakistan / Nepal
  'лв': 'lev',                          // Bulgaria (BGN)
  '﷼': 'SR',                            // Saudi Riyal (single glyph)
  '₵': 'GHc',                           // Ghana Cedi
  'Kč': 'Kc',                           // Czech Koruna
  'zł': 'zl',                           // Polish Zloty
  '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₩': 'KRW', '₺': 'TRY',
  '₦': 'NGN', '₪': 'ILS', '฿': 'THB', '₫': 'VND', '₱': 'PHP',
  '₴': 'UAH', '₸': 'KZT', '৳': 'BDT', '₡': 'CRC', '₲': 'PYG',
};
const toThermalSymbol = (sym) => {
  const s = String(sym == null ? '' : sym).trim();
  if (/^[\x20-\x7E]*$/.test(s)) return s; // already printable ASCII (KSh, TSh, $, R$, CFA, Rs, RM, Rp, kr, etc.)
  if (CURRENCY_ASCII[s]) return CURRENCY_ASCII[s];
  // Fallback: keep ASCII letters/digits (e.g. "GH₵" -> "GH"), trim stray punctuation.
  const ascii = s.replace(/[^\x20-\x7E]/g, '').replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9$]+$/g, '').trim();
  return ascii || 'Rs';
};
// FINAL SAFETY NET for the raw thermal TEXT path: replace any non-ASCII currency glyph
// left ANYWHERE in the fully-assembled receipt with its ASCII equivalent, right before
// the bytes go to the printer. This guarantees no path (bill / KOT / token / a stale
// or future template, or a pre-formatted amount that embedded ₹) can send a symbol the
// printer's single-byte code page (CP437/CP1252) renders as garbage (e.g. "Γé¦139").
const sanitizeThermalText = (text) => {
  let out = String(text == null ? '' : text);
  for (const [glyph, ascii] of Object.entries(CURRENCY_ASCII)) {
    if (out.includes(glyph)) out = out.split(glyph).join(ascii);
  }
  return out;
};
// True when the receipt uses a currency symbol that a thermal code page CANNOT render
// (₹, ر.ق, GH₵, …). The ONLY way to show the REAL glyph (not "Rs") is the image/raster
// path, so we auto-prefer image printing for these — exactly what mature POS apps do.
const hasNonAsciiCurrency = (text) => {
  const s = String(text == null ? '' : text);
  for (const glyph of Object.keys(CURRENCY_ASCII)) {
    if (s.includes(glyph)) return true;
  }
  return false;
};

// Complex scripts (Tamil/Hindi/Arabic/CJK/Thai…) can't be rendered as ESC/POS text — a thermal
// printer's single-byte code page prints the UTF-8 bytes as garbage (Tamil "இட்லி" → "a«ça«fa»i…").
// When present, print the receipt as an IMAGE (printViaThermalImage) so the real glyphs render.
const hasComplexScript = (text) => {
  const s = String(text == null ? '' : text).replace(/<[^>]+>/g, '');
  // Devanagari→Malayalam (incl. Tamil), Arabic/Syriac, Thai/Lao, Hangul, Kana, CJK, fullwidth.
  return /[ऀ-෿؀-߿฀-໿ᄀ-ᇿ぀-ヿ㐀-鿿가-힯＀-￯]/.test(s);
};
const RS = toThermalSymbol(_getCS());

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
  try { splitIndiaGst(invoiceData); } catch (_) { /* never block printing */ } // India: GST -> CGST + SGST
  const RS = toThermalSymbol(invoiceData.currencySymbol || _getCS());
  try { attachInclusiveSplits(invoiceData, RS); } catch (_) {} // per-item MRP + tax (thermal-safe symbol)
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
  const invoiceNum = invoiceData.orderNumber || invoiceData.dailyOrderId || '-';
  const now = invoiceData.timestamp ? new Date(invoiceData.timestamp) : new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;
  let _h = now.getHours(); const _ampm = _h >= 12 ? 'pm' : 'am'; _h = _h % 12 || 12;
  const timeStr = `${_h}:${String(now.getMinutes()).padStart(2,'0')} ${_ampm}`;
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
    const seatTag = seatLetter(item.seat) ? ` [${seatLetter(item.seat)}]` : '';
    const name = (item.name || 'Item') + seatTag;
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
    const priceStr = `${RS}${fmt(price)}`;
    const totalStr = `${RS}${fmt(total)}`;
    const rightPart = `${priceStr}  ${totalStr}`;
    lines.push(leftRight(qtyStr, rightPart, W));
    // Tax-inclusive per-item split (MRP + tax) — thermal-safe symbol already baked in.
    if (item.taxSplitLabel) lines.push(`  ${item.taxSplitLabel}`);
  });

  lines.push(_LINE);

  // ── Totals ──
  if (bl.showSubtotal !== false) lines.push(leftRight('Subtotal', `${RS}${fmt(invoiceData.subtotal)}`, W));
  if (invoiceData.offerDiscount > 0) lines.push(leftRight('Offer Discount', `-${RS}${fmt(invoiceData.offerDiscount)}`, W));
  if (invoiceData.manualDiscount > 0) lines.push(leftRight('Manual Discount', `-${RS}${fmt(invoiceData.manualDiscount)}`, W));
  if (invoiceData.loyaltyDiscount > 0) lines.push(leftRight('Loyalty Discount', `-${RS}${fmt(invoiceData.loyaltyDiscount)}`, W));
  if (invoiceData.serviceChargeAmount > 0) lines.push(leftRight('Service Charge', `${RS}${fmt(invoiceData.serviceChargeAmount)}`, W));
  if (bl.showTaxBreakdown !== false) {
    const showIncl = invoiceData.showInclusiveTaxOnBill !== false;
    if (invoiceData.taxBreakdown?.length > 0) {
      invoiceData.taxBreakdown.filter(tax => !tax.inclusive || showIncl).forEach(tax => {
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

// ASCII-safe time/date formatters — toLocaleTimeString('en-IN') produces Unicode
// narrow no-break space (U+202F) before am/pm which thermal printers render as garbled chars.
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatKOTTime = (date) => {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
};

const formatKOTDate = (date) => {
  const d = date ? (date instanceof Date ? date : new Date(date)) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${mon} ${year}`;
};

export const generateKOTText = (data) => {
  const ps = data.printSettings || data || {};
  const kl = ps.kotLayout || {};
  const W = getChars(ps);
  const _LINE = getLine(W);
  const location = kl.showTable !== false ? (data.roomNumber ? `Room: ${data.roomNumber}` : (data.tableNumber ? `Table: ${data.tableNumber}${data.floorName ? ' \u00b7 ' + data.floorName : ''}` : '')) : '';

  const formatItemLine = (item, opts = {}) => {
    const subline = getItemSubline(item);
    const qty = item.quantity || 1;
    const tag = opts.isRemoved ? ' [CANCEL]' : (opts.showDelta && item.quantityDelta > 0 ? ' [+NEW]' : '');
    const name = item.name || 'Item';
    const seatTag = seatLetter(item.seat) ? ` [${seatLetter(item.seat)}]` : '';
    // Qty column (4 chars) + Item name
    const qtyCol = `${qty}x`.padEnd(4);
    const itemLine = `${qtyCol}${name}${seatTag}${tag}`;
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
  const ordNum = `#${data.orderNumber || data.dailyOrderId || ''}`;
  const showOrdNum = kl.showOrderNumber !== false;
  const showLoc = kl.showTable !== false;
  if (showOrdNum && showLoc && location) {
    lines.push(leftRight(`Order ${ordNum}`, location, W));
  } else if (showOrdNum) {
    lines.push(`Order ${ordNum}`);
  } else if (showLoc && location) {
    lines.push(location);
  }
  const dateTimeStr = kl.showDate !== false
    ? `${formatKOTDate(data.timestamp)}, ${formatKOTTime(data.timestamp)}`
    : formatKOTTime(data.timestamp);
  const typeStr = (kl.showOrderType !== false && data.orderType) ? `Type: ${data.orderType}` : '';
  if (dateTimeStr && typeStr) {
    lines.push(leftRight(dateTimeStr, typeStr, W));
  } else if (dateTimeStr) {
    lines.push(dateTimeStr);
  } else if (typeStr) {
    lines.push(typeStr);
  }
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

// Paper-width-aware CSS for the AirPrint / system print-dialog HTML fallback. Without this
// the receipt was hardcoded to max-width:80mm, and iOS scaled that 80mm page DOWN to fit a
// 58mm printer → tiny print in the corner. Derive width from the configured printer width.
const _htmlReceiptCss = () => {
  const is58 = _imagePrintWidth <= 384;
  const paper = is58 ? 58 : 80;   // physical paper size for @page
  const bodyMm = is58 ? 56 : 78;  // content width (paper minus a hair)
  const fs = is58 ? 11 : 13;      // font size that fits 32 (58mm) / 48 (80mm) monospace chars
  const pad = is58 ? 2 : 3;
  return `@page{size:${paper}mm auto;margin:0}`
    + `body{font-family:'Courier New',monospace;width:${bodyMm}mm;max-width:${bodyMm}mm;margin:0 auto;padding:${pad}mm;font-size:${fs}px;box-sizing:border-box;}`
    + `pre{white-space:pre-wrap;word-wrap:break-word;margin:0;}`;
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
<style>${_htmlReceiptCss()}</style>
</head><body>${logoHtml}<pre>${cleanText}</pre></body></html>`;
};

// Generate BILL HTML using the template system (for image-print / AirPrint / WebView).
// Rich, designed receipt (same template family as the dashboard bill). Returns null on failure
// so callers can fall back to text.
export const generateBillHTML = (invoiceData = {}, printSettings = {}) => {
  try {
    try { attachInclusiveSplits(invoiceData, invoiceData.currencySymbol || '₹'); } catch (_) {} // per-item MRP + tax
    try { splitIndiaGst(invoiceData); } catch (_) { /* never block */ } // India: GST -> CGST + SGST
    return renderBill(invoiceData, printSettings || invoiceData.printSettings || {}, {});
  } catch (e) {
    console.warn('generateBillHTML failed:', e?.message);
    return null;
  }
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
    covers: orderData.covers || 1,
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
        if ((connectionType === 'bluetooth' || saved.type === 'bluetooth') && BLEPrinter) {
          const hasPerms = await ensureBluetoothPermissions();
          if (hasPerms) await BLEPrinter.closeConn();
        } else if ((connectionType === 'network' || saved.type === 'network') && NetPrinter) {
          await NetPrinter.closeConn();
        } else if ((connectionType === 'usb' || saved.type === 'usb') && USBPrinter) {
          await USBPrinter.closeConn();
        }
      } catch { /* ignore close errors on dead socket */ }
      connectedPrinter = null;
      connectionType = null;
      // Re-establish connection (with timeout to avoid blocking queue on unreachable printer)
      if (saved.type === 'airprint' && saved.url) {
        connectedPrinter = saved.url;
        connectionType = 'airprint';
        return true;
      } else if (saved.type === 'network' && saved.host) {
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
      if ((await getSavedPrinter())?.type === 'bluetooth') {
        _lastBluetoothError = err?.message || String(err);
      }
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
// On failure, Bluetooth/USB reconnect with bounded backoff; WiFi never redispatches automatically.
const printViaThermal = async (text) => {
  const mod = getThermalModule();
  if (!mod) throw new Error('No thermal printer connected');
  // Strip logo tag — thermal printers don't support images via ESC/POS text
  let cleanText = text.replace(/^<LOGO:.+?>\n?/, '');
  // Final safety net: force any non-ASCII currency glyph (₹, ر.س, GH₵, …) to ASCII so
  // the printer's code page can't turn it into garbage. Covers every text path at once.
  cleanText = sanitizeThermalText(cleanText);
  // Guard against empty payloads — sending just newlines causes blank paper + cut
  if (!cleanText || !cleanText.trim()) {
    console.warn('printViaThermal: skipping empty payload');
    return;
  }
  const printOpts = { beep: false, cut: true, tailingLine: true };
  const payload = cleanText + '\n\n\n';

  // (printContent already reconnected the BLE/USB link on demand before calling us.)
  // Retry is transport-aware: BLE/USB recover a dropped link by reconnect+re-dispatch (safe — a failed
  // BLE write printed nothing), so allow a few attempts. WiFi stays at ONE attempt because re-dispatch
  // to a working socket physically double-prints. This reverses the 3→1 cut that killed BLE recovery.
  const maxAttempts = connectionType === 'network' ? 1 : 3;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Wait before retries (not before first attempt)
    if (attempt > 0) {
      const backoffMs = RETRY_DELAYS[attempt - 1] || 1200;
      console.log(`Print retry ${attempt}/${maxAttempts - 1} in ${backoffMs}ms...`);
      emitPrinterEvent({ type: 'retrying', attempt, maxRetries: maxAttempts });
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
      // New Android Bluetooth builds return a Promise after native OutputStream.flush(). Older
      // binaries and the other transports remain fire-and-forget, so this accepts both contracts.
      await withPrintTimeout(new Promise((resolve, reject) => {
        try {
          const dispatched = currentMod.printBill(payload, printOpts);
          // Patched Android BLE returns a Promise that settles after OutputStream.flush().
          // Other transports/library builds remain fire-and-forget, so retain the compatible
          // short dispatch grace period for them.
          if (dispatched && typeof dispatched.then === 'function') {
            dispatched.then(resolve, reject);
            return;
          }
        } catch (e) { reject(e); return; }
        setTimeout(resolve, 350);
      }), `printBill attempt ${attempt + 1}`);
      // Success — emit event and return
      if (attempt > 0) {
        emitPrinterEvent({ type: 'print_recovered', attempt: attempt + 1 });
      }
      setHealth('connected');
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`Print attempt ${attempt + 1}/${maxAttempts} failed:`, err.message);
    }
  }

  // All attempts exhausted
  emitPrinterEvent({
    type: 'print_failed',
    message: 'Print failed after multiple retries. Check printer connection.',
  });
  setHealth('disconnected');
  throw lastErr;
};

// Flag-gated IMAGE print: render the receipt HTML → image file → printImageData on the same
// connected thermal printer. Throws on any failure so the caller falls back to the ESC/POS text
// path. Requires <ImagePrintHost> mounted. Reuses the native printImageData bridge (BLE/Net/USB).
const printViaThermalImage = async (html) => {
  const { htmlToImageFile, hasImagePrintHost } = require('./imagePrintService');
  if (!hasImagePrintHost()) throw new Error('image-print host not mounted');
  const nativeMod =
    connectionType === 'bluetooth' ? NativeModules.RNBLEPrinter :
    connectionType === 'network' ? NativeModules.RNNetPrinter :
    connectionType === 'usb' ? NativeModules.RNUSBPrinter : null;
  if (!nativeMod || typeof nativeMod.printImageData !== 'function') {
    throw new Error(`printImageData not available for ${connectionType}`);
  }
  const cleanHtml = String(html || '').replace(/^<LOGO:.+?>\n?/, '');
  if (!cleanHtml.trim()) throw new Error('empty html');
  const fileUri = await htmlToImageFile(cleanHtml, { width: _imagePrintWidth });
  // printImageData is fire-and-forget: its callback fires ONLY on error (same pattern as
  // printRawData/printBill in this lib). So reject if the error callback fires, else resolve
  // shortly after dispatch. Wrapped in the shared print timeout as a backstop.
  await withPrintTimeout(new Promise((resolve, reject) => {
    let settled = false;
    const onErr = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(new Error(String(err))); else resolve();
    };
    try {
      // The native printImageData signature differs by platform:
      //  • iOS  → printImageData(imgUrl, {imageWidth, printerWidthType, paddingX}, fail)
      //           WITHOUT the options dict, iOS silently downscales the receipt to 150px wide
      //           (tiny print in the top-left corner). Pass the real width so it prints full width.
      //  • Android → printImageData(imgUrl, callback); it prints the bitmap 1:1 at its pixel width,
      //           so the render width (_imagePrintWidth) already controls it — keep the 2-arg call.
      if (Platform.OS === 'ios') {
        nativeMod.printImageData(
          fileUri,
          { imageWidth: _imagePrintWidth, printerWidthType: _imagePrintWidth <= 384 ? '58' : '80', paddingX: 0 },
          onErr
        );
      } else {
        nativeMod.printImageData(fileUri, onErr);
      }
    } catch (e) { if (!settled) { settled = true; reject(e); } return; }
    setTimeout(() => { if (!settled) { settled = true; resolve(); } }, 1500);
  }), 'printImageData');
};

// Ensure the HTML declares the thermal paper size so iOS AirPrint / the print dialog lays it
// out at the printer's width instead of A4/Letter (which scales the receipt down → tiny print).
// Idempotent: leaves HTML untouched if it already sets @page. Works for both the rich renderBill
// HTML and the monospace text wrapper.
const _ensureThermalPageSize = (html) => {
  if (typeof html !== 'string' || !html) return html;
  if (/@page\b/i.test(html)) return html;
  const paper = _imagePrintWidth <= 384 ? 58 : 80;
  const rule = `<style>@page{size:${paper}mm auto;margin:0}</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${rule}</head>`);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${rule}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${rule}</head>`);
  return `<head>${rule}</head>${html}`;
};

// Silent print via AirPrint (iOS - no dialog when printer URL is saved)
const printViaAirPrint = async (html, printerUrl) => {
  await Print.printAsync({ html: _ensureThermalPageSize(html), printer: printerUrl });
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
export const printContent = async ({ html, text, imageHtml, silentOnly = false }) => {
  return enqueuePrint(async () => {
    const mode = await getPrinterMode();
    const wantsSilent = mode === 'silent' || silentOnly;
    const savedPrinter = wantsSilent ? await getSavedPrinter() : null;

    // Establish a real connection at job time. This deliberately runs even when the in-memory
    // connection is empty (e.g. app started before the printer was switched on). Bluetooth/USB
    // are refreshed before every job because their stale sockets otherwise accept a dispatch and
    // print nothing. Network is reconnected only when missing to avoid duplicate TCP dispatches.
    if (wantsSilent && savedPrinter) {
      const refreshLink = savedPrinter.type === 'bluetooth'
        || savedPrinter.type === 'usb'
        || !connectedPrinter
        || connectionType !== savedPrinter.type;
      if (refreshLink) {
        emitPrinterEvent({ type: 'reconnecting', connectionType: savedPrinter.type });
        const reconnected = await tryReconnect();
        if (reconnected) {
          setHealth('connected');
          emitPrinterEvent({ type: 'reconnected', connectionType: savedPrinter.type });
        } else {
          setHealth('disconnected');
        }
      }
    }

    if (wantsSilent && connectedPrinter) {
      // iOS AirPrint - silent with saved printer URL
      if (connectionType === 'airprint' && (html || imageHtml)) {
        try {
          await printViaAirPrint(html || imageHtml, connectedPrinter);
          return { method: 'silent-airprint' };
        } catch (err) {
          console.error('AirPrint silent failed:', err);
          if (silentOnly) return { method: 'skipped', reason: 'airprint-failed' };
          // fall through to dialog
        }
      }

      // Image print — used when EITHER the store opted in (imagePrintEnabled) OR the receipt
      // uses a currency symbol no thermal code page can render (₹, ر.ق, …), so the REAL glyph
      // prints instead of the "Rs" ASCII fallback — the standard approach when a symbol isn't
      // in any printer code page. Requires HTML to render from. On ANY failure we fall through
      // to the ESC/POS text path below (which sanitizes ₹→Rs), so this can never break printing.
      // Image path is needed when the receipt has a non-ASCII currency glyph OR a complex script
      // (Tamil/Hindi/Arabic/CJK…) — neither can be printed as ESC/POS text. Currency is gated on
      // the opt-in flag; complex scripts ALWAYS force the image path (there is no ASCII fallback
      // for them — text would print garbage). Falls through to text if the image render fails.
      const src = imageHtml || html || text;
      const wantImageForCurrency = _autoImageForCurrency && hasNonAsciiCurrency(src);
      const wantImageForScript = hasComplexScript(src);
      if ((_imagePrintEnabled || wantImageForCurrency || wantImageForScript) && (imageHtml || html) && connectionType !== 'airprint') {
        try {
          await printViaThermalImage(imageHtml || html);
          return { method: `silent-${connectionType}-image` };
        } catch (imgErr) {
          console.warn('[imagePrint] failed, falling back to text:', imgErr?.message);
          // fall through to the text path (unchanged)
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
      const message = savedPrinter?.type === 'bluetooth' && _lastBluetoothError
        ? `Bluetooth printer not ready: ${_lastBluetoothError}`
        : 'Printer not connected. Please connect a printer in Settings.';
      emitPrinterEvent({ type: 'disconnected', message, connectionType: savedPrinter?.type || null });
      return { method: 'skipped', reason: 'no-connected-printer', error: message };
    }

    // A THERMAL printer (Bluetooth / WiFi / USB) is configured but the silent print failed — do NOT
    // open the iOS system print dialog. That dialog can only reach an AirPrint printer, never a
    // Bluetooth/serial thermal printer, so it just shows "No Printer Selected / Printing did not
    // complete" and confuses the owner. Surface a clear, actionable failure instead so they can turn
    // the printer on / reconnect and retry — the way a real POS reports a printer problem.
    if ((connectedPrinter && connectionType && connectionType !== 'airprint')
      || (savedPrinter && savedPrinter.type !== 'airprint')) {
      emitPrinterEvent({
        type: 'print_failed',
        message: 'Could not reach the printer. Make sure it is switched on and in range, then reconnect it in Printer Settings and try again.',
      });
      throw new Error('Printer not responding. Turn it on / reconnect and try again.');
    }

    // Fallback: system print dialog — only when there is NO thermal printer (AirPrint or none),
    // where the OS picker is the right way to choose a printer.
    if (html) {
      if (mode === 'silent') {
        // We were supposed to print silently but couldn't — notify user
        emitPrinterEvent({
          type: 'fallback',
          message: 'Silent print failed. Printer may be disconnected. Opening print dialog as fallback.',
        });
      }
      await Print.printAsync({ html: _ensureThermalPageSize(html) });
      return { method: 'dialog' };
    }

    throw new Error('No printable content provided');
  });
};

/**
 * Open cash drawer via ESC/POS pulse command
 */
export const openCashDrawer = async () => {
  const mod = getThermalModule();
  if (!mod) return;
  // ESC p 0 25 120 — standard cash drawer kick pulse
  const kickCmd = '\x1B\x70\x00\x19\x78';
  try {
    await mod.printBill(kickCmd, { beep: false, cut: false, tailingLine: false });
  } catch (err) {
    console.warn('Cash drawer open failed:', err.message);
  }
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
<style>${_htmlReceiptCss()}</style>
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
    // Verify socket is alive by checking the connection state.
    // We no longer send printBill('') because some thermal printers
    // print a blank strip or feed paper even with empty payloads,
    // causing mysterious small blank receipts.
    // Instead, just check if the printer module reports connected.
    const isStillConnected = mod.getStatus ? await mod.getStatus() : true;
    if (!isStillConnected) throw new Error('printer reports disconnected');
    // If getStatus isn't available, we trust the connection until the next
    // real print fails — printViaThermal will handle reconnect then.
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
// ==================== STATION PRINTER (MULTI-STATION) ====================
// Queue-safe connect→print→restore for printing to a specific station printer.
// Used by multiPrinterService for multi-printer KOT routing.
// Only network (WiFi) printers are supported for station assignment.

/**
 * Print to a specific station printer, then restore the default printer connection.
 * Runs inside the print queue to prevent concurrent printer access.
 *
 * @param {{ type: string, host: string, port?: number }} stationConfig - Station printer config
 * @param {string} text - ESC/POS text content
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const printToStationPrinter = async (stationConfig, text, html = null) => {
  if (!stationConfig?.host || stationConfig.type !== 'network') {
    return { success: false, error: 'Only network printers supported for station assignment' };
  }

  // Strip logo tag and validate payload
  // Same currency safety net as printViaThermal (this per-station path bypasses it).
  const cleanText = sanitizeThermalText((text || '').replace(/^<LOGO:.+?>\n?/, ''));
  if (!cleanText || !cleanText.trim()) {
    return { success: false, error: 'Empty print payload' };
  }

  return enqueuePrint(async () => {
    const savedPrinter = await getSavedPrinter();
    const stationHost = stationConfig.host;
    const stationPort = stationConfig.port || 9100;

    // Pause heartbeat during station switch to avoid interference
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }

    try {
      // 1. Close current connection cleanly
      try {
        if (connectionType === 'network' && NetPrinter) await NetPrinter.closeConn();
        else if (connectionType === 'bluetooth' && BLEPrinter) await BLEPrinter.closeConn();
        else if (connectionType === 'usb' && USBPrinter) await USBPrinter.closeConn();
      } catch { /* ignore close errors */ }
      connectedPrinter = null;
      connectionType = null;

      // 2. Connect to station printer
      if (!NetPrinter) throw new Error('Network printing not available');
      if (!printerInitialized.network) {
        await NetPrinter.init();
        printerInitialized.network = true;
      }
      await withPrintTimeout(
        NetPrinter.connectPrinter(stationHost, stationPort),
        `connect-station-${stationHost}`,
      );
      connectedPrinter = `${stationHost}:${stationPort}`;
      connectionType = 'network';

      // 3. Print — complex scripts (Tamil/Hindi/Arabic/CJK…) can't be sent as ESC/POS text, so
      // render them as an image to the now-connected station printer; else send fast ESC/POS text.
      const printStationText = async () => {
        const payload = cleanText + '\n\n\n';
        const stationDispatch = NetPrinter.printBill(payload, { beep: false, cut: true, tailingLine: true });
        if (stationDispatch && typeof stationDispatch.then === 'function') {
          await withPrintTimeout(stationDispatch, `print-station-${stationHost}`);
        } else {
          // Upstream NetPrinter is fire-and-forget. Do not pass undefined to withPrintTimeout
          // (which previously made every station job report failure and trigger a duplicate fallback).
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      };
      if (html && hasComplexScript(html)) {
        try {
          await printViaThermalImage(html); // prints image to the station printer we just connected
        } catch (imgErr) {
          console.warn('[station] image render failed, falling back to text (may garble non-Latin):', imgErr?.message);
          await printStationText();
        }
      } else {
        await printStationText();
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Station print failed' };
    } finally {
      // 4. Always restore default printer connection
      try {
        if (NetPrinter) await NetPrinter.closeConn();
      } catch { /* ignore */ }
      connectedPrinter = null;
      connectionType = null;

      if (savedPrinter) {
        try {
          if (savedPrinter.type === 'network' && savedPrinter.host) {
            await connectNetworkPrinter(savedPrinter.host, savedPrinter.port || 9100);
          } else if (savedPrinter.type === 'bluetooth' && savedPrinter.macAddress) {
            const hasPerms = await ensureBluetoothPermissions();
            if (hasPerms) await connectBluetoothPrinter(savedPrinter.macAddress);
          } else if (savedPrinter.type === 'usb' && savedPrinter.vendorId) {
            await connectUSBPrinter(savedPrinter.vendorId, savedPrinter.productId);
          }
        } catch (restoreErr) {
          console.warn('Failed to restore default printer after station print:', restoreErr.message);
        }
      }
    }
  });
};

export const printWithFeedback = async ({ html, text, imageHtml, silentOnly = true, label = 'Print', _existingJobId = null }) => {
  // If remote print is enabled, skip local printing — desktop app handles it via Firebase RTDB
  const remotePrint = await getRemotePrintEnabled();
  if (remotePrint) {
    return { success: true, method: 'remote', notify: false };
  }

  const notifEnabled = await getPrintNotificationsEnabled();
  let jobId = _existingJobId;
  try {
    if (!jobId) jobId = await createPendingPrintJob({ html, text, imageHtml, silentOnly, label });
    else await updatePendingPrintJob(jobId, { status: 'queued', error: null });
  } catch (_) { /* persistence must never prevent the actual print */ }

  const fail = async (error, method = 'error') => {
    if (jobId) {
      try { await updatePendingPrintJob(jobId, { status: 'failed', error }); } catch (_) {}
    }
    emitPrinterEvent({
      type: 'print_failed', message: error, jobId, canRetry: !!jobId,
    });
    return { success: false, method, notify: notifEnabled, error, jobId };
  };

  try {
    const result = await printContent({ html, text, imageHtml, silentOnly });

    if (result?.method?.startsWith('silent-') || result?.method === 'dialog') {
      if (jobId) { try { await removePendingPrintJob(jobId); } catch (_) {} }
      return { success: true, method: result.method, notify: false, jobId };
    }

    if (result?.method === 'skipped') {
      const reason = result.reason || 'unknown';
      // Distinguish between "no printer" vs "print attempt failed"
      const isPrinterMissing = reason === 'no-connected-printer' || reason === 'no-printer-match';
      return fail(isPrinterMissing
        ? (result.error ? `${label} not printed — ${result.error}` : `${label} not printed — no printer connected`)
        : `${label} print failed — ${reason}`, 'skipped');
    }

    if (jobId) { try { await removePendingPrintJob(jobId); } catch (_) {} }
    return { success: true, method: result?.method || 'unknown', notify: false, jobId };
  } catch (err) {
    return fail(`${label} print failed — ${err.message || 'unknown error'}`);
  }
};
