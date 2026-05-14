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
import {
  BLEPrinter,
  NetPrinter,
  USBPrinter,
} from 'react-native-thermal-receipt-printer';
import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import NetInfo from '@react-native-community/netinfo';
import { getItemSubline } from '../utils/itemSubline';

const SAVED_PRINTER_KEY = 'dine_saved_printer';
const PRINTER_MODE_KEY = 'dine_printer_mode'; // 'silent' | 'dialog'

// ==================== PRINTER STATE ====================

let connectedPrinter = null;
let connectionType = null; // 'bluetooth' | 'network' | 'usb' | 'airprint'
let printerInitialized = { bluetooth: false, network: false, usb: false };
let activeScanCancelled = false;
let activeZeroconf = null;
let reconnectInProgress = false;
let printerEventListeners = [];

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
  if (!printerInitialized.network) {
    await NetPrinter.init();
    printerInitialized.network = true;
  }
  await NetPrinter.connectPrinter(host, port);
  connectedPrinter = `${host}:${port}`;
  connectionType = 'network';
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
  try {
    if (connectionType === 'bluetooth') {
      const hasPerms = await ensureBluetoothPermissions();
      if (hasPerms) await BLEPrinter.closeConn();
    } else if (connectionType === 'network') {
      await NetPrinter.closeConn();
    } else if (connectionType === 'usb') {
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
// Returns true if connected (or successfully reconnected), false otherwise.
export const ensureConnected = async () => {
  if (!connectedPrinter) {
    return await tryReconnect();
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
      if (connectionType === 'bluetooth') {
        const hasPerms = await ensureBluetoothPermissions();
        if (hasPerms) await BLEPrinter.closeConn();
      } else if (connectionType === 'network') {
        await NetPrinter.closeConn();
      } else if (connectionType === 'usb') {
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
  }
  return false;
};

// ==================== TEXT GENERATION (ESC/POS for thermal printers) ====================

const CHARS = 48; // 80mm paper = 48 chars
const LINE = '='.repeat(CHARS);
const THIN_LINE = '-'.repeat(CHARS);

const center = (text, width = CHARS) => {
  const t = String(text || '');
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return ' '.repeat(pad) + t;
};

const leftRight = (left, right, width = CHARS) => {
  const l = String(left || '');
  const r = String(right || '');
  const gap = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(gap) + r;
};

export const generateBillText = (invoiceData) => {
  if (!invoiceData) return '';
  const lines = [];

  lines.push(LINE);
  lines.push(center(invoiceData.restaurantName || ''));
  if (invoiceData.restaurantInfo?.legalBusinessName && invoiceData.restaurantInfo?.showGstOnInvoice) {
    lines.push(center(invoiceData.restaurantInfo.legalBusinessName));
  }
  if (invoiceData.restaurantInfo?.gstin && invoiceData.restaurantInfo?.showGstOnInvoice) {
    lines.push(`GSTIN: ${invoiceData.restaurantInfo.gstin}`);
  }
  if (invoiceData.restaurantInfo?.fssai && invoiceData.restaurantInfo?.showFssaiOnInvoice) {
    lines.push(`FSSAI: ${invoiceData.restaurantInfo.fssai}`);
  }
  if (invoiceData.restaurantInfo?.address) {
    lines.push(center(invoiceData.restaurantInfo.address));
  }
  lines.push(LINE);
  lines.push(`Invoice #: ${invoiceData.orderNumber || invoiceData.dailyOrderId || invoiceData.orderId?.slice(-6) || '-'}`);
  const dateStr = invoiceData.timestamp
    ? new Date(invoiceData.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    : new Date().toLocaleString('en-IN');
  lines.push(`Date: ${dateStr}`);
  lines.push(LINE);
  lines.push('ITEMS:');
  lines.push(THIN_LINE);

  (invoiceData.items || []).forEach(item => {
    lines.push(`${item.quantity} x ${item.name}`);
    lines.push(leftRight('', `₹${item.total.toFixed(2)}`));
  });

  lines.push(THIN_LINE);
  lines.push(leftRight('Subtotal:', `₹${invoiceData.subtotal.toFixed(2)}`));
  if (invoiceData.offerDiscount > 0) lines.push(leftRight('Offer Discount:', `-₹${invoiceData.offerDiscount.toFixed(2)}`));
  if (invoiceData.manualDiscount > 0) lines.push(leftRight('Manual Discount:', `-₹${invoiceData.manualDiscount.toFixed(2)}`));
  if (invoiceData.loyaltyDiscount > 0) lines.push(leftRight('Loyalty Points:', `-₹${invoiceData.loyaltyDiscount.toFixed(2)}`));
  if (invoiceData.serviceChargeAmount > 0) lines.push(leftRight('Service Charge:', `₹${invoiceData.serviceChargeAmount.toFixed(2)}`));
  if (invoiceData.taxBreakdown?.length > 0) {
    invoiceData.taxBreakdown.forEach(tax => {
      lines.push(leftRight(`${tax.name}${tax.rate ? ` (${tax.rate}%)` : ''}:`, `₹${tax.amount.toFixed(2)}`));
    });
  } else if (invoiceData.taxEnabled && invoiceData.tax > 0) {
    lines.push(leftRight(invoiceData.taxLabel || `Tax (${invoiceData.taxRate}%):`, `₹${invoiceData.tax.toFixed(2)}`));
  }
  if (invoiceData.tipAmount > 0) lines.push(leftRight('Tip:', `₹${invoiceData.tipAmount.toFixed(2)}`));
  if (invoiceData.roundOffAmount != null && invoiceData.roundOffAmount !== 0) {
    lines.push(leftRight('Round-off:', `${invoiceData.roundOffAmount > 0 ? '+' : '-'}₹${Math.abs(invoiceData.roundOffAmount).toFixed(2)}`));
  }
  lines.push(LINE);
  lines.push(leftRight('GRAND TOTAL:', `₹${invoiceData.grandTotal.toFixed(2)}`));
  lines.push(LINE);
  if (invoiceData.cashReceived > 0) {
    lines.push(leftRight('Cash Received:', `₹${invoiceData.cashReceived.toFixed(2)}`));
    if (invoiceData.changeReturned > 0) lines.push(leftRight('Change:', `₹${invoiceData.changeReturned.toFixed(2)}`));
  }
  lines.push(`Payment: ${(invoiceData.paymentMethod || 'cash').toUpperCase()}`);
  lines.push('');
  lines.push(center('Thank you for your order!'));
  lines.push(LINE);

  return lines.join('\n');
};

export const generateTokenText = (token) => {
  if (!token) return '';
  const lines = [];

  lines.push(LINE);
  lines.push('');
  lines.push(center(token.tokenLabel || ''));
  lines.push('');
  lines.push(LINE);
  lines.push(center(`Order #${token.orderNumber || ''}`));
  lines.push(THIN_LINE);

  (token.items || []).forEach(i => {
    const qty = i.quantity || 1;
    const price = i.price || 0;
    const itemTotal = i.total || (qty * price);
    const itemLeft = `${qty} x ${i.name || 'Item'}${price ? ` @${price}` : ''}`;
    const itemRight = itemTotal ? `₹${itemTotal.toFixed(2)}` : '';
    lines.push(leftRight(itemLeft, itemRight));
    if (i.variant) lines.push(`  ${i.variant}`);
    if (i.customizations?.length > 0) {
      const custs = Array.isArray(i.customizations) ? i.customizations.map(c => c.name || c).join(', ') : '';
      if (custs) lines.push(`  ${custs}`);
    }
  });

  if (token.tokenTotal) {
    lines.push(LINE);
    lines.push(leftRight('TOTAL', `₹${token.tokenTotal.toFixed(2)}`));
  }
  lines.push(THIN_LINE);
  lines.push(center(`Items: ${token.itemCount || 0}`));
  const counterName = token.printStationName || token.categoryName || '';
  if (counterName) {
    lines.push(LINE);
    lines.push(center(counterName.toUpperCase()));
    lines.push(LINE);
  }
  lines.push(center(token.time || ''));
  lines.push(THIN_LINE);
  lines.push(center('Present this token at counter'));
  lines.push(center(token.restaurantName || ''));
  lines.push(LINE);

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
  const location = data.roomNumber ? `Room: ${data.roomNumber}` : `Table: ${data.tableNumber || 'N/A'}`;
  const itemsText = data.items.map(item => {
    const subline = getItemSubline(item);
    const itemLine = `${item.quantity}x ${item.name}`;
    const sublineLine = subline ? `  (${subline})` : '';
    const notesLine = item.notes ? `  Note: ${item.notes}` : '';
    return [itemLine, sublineLine, notesLine].filter(Boolean).join('\n');
  }).join('\n');

  const width = 48;
  const centerKOT = (text, w = width) => {
    const padding = Math.max(0, Math.floor((w - text.length) / 2));
    return ' '.repeat(padding) + text;
  };

  const incrementalHeader = data.isIncremental
    ? `${centerKOT('*** NEW ITEMS ONLY ***')}\n`
    : '';

  return `
${'='.repeat(width)}
${centerKOT((data.restaurantName || 'RESTAURANT').toUpperCase())}
${centerKOT('KITCHEN ORDER TICKET')}
${'='.repeat(width)}
${incrementalHeader}Order #: ${data.orderNumber || data.orderId?.slice(-6) || 'N/A'}
${location}
Time: ${formatKOTTime(data.timestamp)}
Date: ${formatKOTDate(data.timestamp)}
${data.waiterName ? `Staff: ${data.waiterName}` : ''}
${'-'.repeat(width)}
${itemsText}
${'-'.repeat(width)}
Total Items: ${data.items.reduce((sum, item) => sum + (item.quantity || 1), 0)}
${'='.repeat(width)}
${centerKOT('Thank you!')}
${centerKOT(new Date().toLocaleString('en-IN'))}
${'='.repeat(width)}
    `.trim();
};

export const wrapKOTTextInHTML = (text) => {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>body{font-family:'Courier New',monospace;max-width:80mm;margin:0 auto;padding:20px;font-size:14px;}pre{white-space:pre-wrap;word-wrap:break-word;}</style>
</head><body><pre>${text}</pre></body></html>`;
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
const tryReconnect = async () => {
  if (reconnectInProgress) return false;
  reconnectInProgress = true;
  try {
    const saved = await getSavedPrinter();
    if (!saved) return false;
    // Close stale connection first (BT needs runtime permissions on Android 12+)
    try {
      if (connectionType === 'bluetooth') {
        const hasPerms = await ensureBluetoothPermissions();
        if (hasPerms) await BLEPrinter.closeConn();
      } else if (connectionType === 'network') {
        await NetPrinter.closeConn();
      } else if (connectionType === 'usb') {
        await USBPrinter.closeConn();
      }
    } catch { /* ignore close errors on dead socket */ }
    connectedPrinter = null;
    connectionType = null;
    // Re-establish connection
    if (saved.type === 'network' && saved.host) {
      await connectNetworkPrinter(saved.host, saved.port || 9100);
      return true;
    } else if (saved.type === 'bluetooth' && saved.macAddress) {
      const hasPerms = await ensureBluetoothPermissions();
      if (!hasPerms) return false;
      await connectBluetoothPrinter(saved.macAddress);
      return true;
    } else if (saved.type === 'usb' && saved.vendorId) {
      await connectUSBPrinter(saved.vendorId, saved.productId);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Reconnect failed:', err);
    return false;
  } finally {
    reconnectInProgress = false;
  }
};

// Silent print via thermal printer (Bluetooth / WiFi / USB)
// On failure, attempts one reconnect before giving up
const printViaThermal = async (text) => {
  const mod = getThermalModule();
  if (!mod) throw new Error('No thermal printer connected');
  try {
    await mod.printText(text + '\n\n\n');
  } catch (firstErr) {
    console.warn('Print failed, attempting reconnect...', firstErr.message);
    emitPrinterEvent({ type: 'reconnecting' });
    const reconnected = await tryReconnect();
    if (!reconnected) {
      emitPrinterEvent({ type: 'disconnected', message: 'Printer disconnected. Please check the printer and reconnect.' });
      throw firstErr;
    }
    // Retry with fresh connection
    const newMod = getThermalModule();
    if (!newMod) {
      emitPrinterEvent({ type: 'disconnected', message: 'Printer disconnected. Please check the printer and reconnect.' });
      throw firstErr;
    }
    try {
      await newMod.printText(text + '\n\n\n');
      emitPrinterEvent({ type: 'reconnected' });
    } catch (retryErr) {
      emitPrinterEvent({ type: 'disconnected', message: 'Printer disconnected. Please check the printer and reconnect.' });
      throw retryErr;
    }
  }
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

  // silentOnly mode: never open dialog
  if (silentOnly) return { method: 'skipped', reason: 'no-connected-printer' };

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
    THIN_LINE,
    `Date: ${new Date().toLocaleString('en-IN')}`,
    `Type: ${connectionType || 'system dialog'}`,
    `Printer: ${connectedPrinter ? String(connectedPrinter).substring(0, 30) : 'System default'}`,
    `Platform: ${Platform.OS}`,
    THIN_LINE,
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
