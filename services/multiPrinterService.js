import AsyncStorage from '@react-native-async-storage/async-storage';
import * as printerService from './printerService';
import apiClient from './api';
import { logPrintDiag } from './printDiagnostics';

const STATION_PRINTERS_KEY = 'dine_station_printers';
const LOCAL_KOT_KEY = 'dine_local_kot_printing';

/**
 * Multi-Printer Service for Station-based KOT Routing
 *
 * Manages per-station printer configs and orchestrates printing
 * KOTs to the correct printer based on print station assignments.
 */

// ── Local KOT Printing Preference ──
// When true, this device prints KOTs directly to station printers.
// When false (default), desktop terminal handles station routing.

export const getLocalKotPrintingEnabled = async () => {
  try {
    const val = await AsyncStorage.getItem(LOCAL_KOT_KEY);
    return val === 'true';
  } catch {
    return false;
  }
};

export const setLocalKotPrintingEnabled = async (enabled) => {
  await AsyncStorage.setItem(LOCAL_KOT_KEY, enabled ? 'true' : 'false');
};

// ── Station Printer Config Storage ──

export const getStationPrinters = async () => {
  try {
    const json = await AsyncStorage.getItem(STATION_PRINTERS_KEY);
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};

export const saveStationPrinter = async (stationId, printerConfig) => {
  const all = await getStationPrinters();
  all[stationId] = printerConfig;
  await AsyncStorage.setItem(STATION_PRINTERS_KEY, JSON.stringify(all));
};

export const removeStationPrinter = async (stationId) => {
  const all = await getStationPrinters();
  delete all[stationId];
  await AsyncStorage.setItem(STATION_PRINTERS_KEY, JSON.stringify(all));
};

export const getStationPrinter = async (stationId) => {
  const all = await getStationPrinters();
  return all[stationId] || null;
};

// A network printer identifier is "IP" or "IP:port". Parse → {host, port}. null for OS/BT names.
const parseNetworkAddr = (id) => {
  if (typeof id !== 'string') return null;
  const m = id.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/);
  return m ? { host: m[1], port: m[2] ? parseInt(m[2], 10) : 9100 } : null;
};

// Pull the printer config another device (e.g. the Electron desktop) saved on the server, so the
// waiter doesn't have to set up printers here. SAFE by design:
//   • only NETWORK printers (host/port) are hydrated — device-neutral, reachable over LAN.
//   • a slot is filled ONLY if empty or previously server-filled (`_fromServer`). A printer the
//     waiter picked locally (no `_fromServer`) is NEVER overwritten — local always wins.
// Best-effort; failures never affect printing. Returns { stationsSet, singleSet } for logging.
export async function hydrateFromServer(restaurantId) {
  const out = { stationsSet: 0, singleSet: false };
  try {
    if (!restaurantId) return out;
    const res = await apiClient.getPrintStations(restaurantId);
    if (!res?.success) return out;

    // MULTI: fill each station's local printer from the server binding.
    const stations = Array.isArray(res.printStations) ? res.printStations : [];
    const localMap = await getStationPrinters();
    let changed = false;
    for (const s of stations) {
      const pc = s.printerConfig || {};
      const host = pc.host || parseNetworkAddr(pc.name)?.host;
      const port = pc.port || parseNetworkAddr(pc.name)?.port || 9100;
      if (!host) continue;                                   // only shareable network printers
      const existing = localMap[s.id];
      if (existing && !existing._fromServer) continue;       // waiter set this locally — keep it
      if (existing && existing.host === host && existing.port === port) continue; // already same
      localMap[s.id] = { type: 'network', host, port, _fromServer: true };
      changed = true;
      out.stationsSet += 1;
    }
    if (changed) await AsyncStorage.setItem(STATION_PRINTERS_KEY, JSON.stringify(localMap));

    // SINGLE: fill the single KOT printer from defaultPrinterConfig.
    const dp = res.defaultPrinterConfig;
    const dpHost = dp?.host || parseNetworkAddr(dp?.name)?.host;
    if (dpHost) {
      const saved = await printerService.getSavedPrinter();
      if (!saved || saved._fromServer) {                     // empty or previously server-filled
        const dpPort = dp?.port || parseNetworkAddr(dp?.name)?.port || 9100;
        if (!saved || saved.host !== dpHost || saved.port !== dpPort) {
          await printerService.savePrinter({ type: 'network', host: dpHost, port: dpPort, address: `${dpHost}:${dpPort}`, _fromServer: true });
          out.singleSet = true;
        }
      }
    }
  } catch (_) { /* best-effort — never affects printing */ }
  return out;
}

// ── Client-side Order Splitting ──

/**
 * Split order items by print station (matches backend splitOrderByPrintStation logic)
 */
function filterKotExcludedItems(items, printSettings) {
  if (!printSettings?.kotExclusionEnabled) return items;
  const excludedCats = new Set(printSettings.kotExcludedCategories || []);
  const excludedIds = new Set(printSettings.kotExcludedItemIds || []);
  if (excludedCats.size === 0 && excludedIds.size === 0) return items;
  return items.filter(item => {
    if (excludedIds.has(item.id || item.menuItemId)) return false;
    if (excludedCats.has(item.categoryId)) return false;
    return true;
  });
}

export function splitOrderByStation(orderItems, printStations, categories, printSettings) {
  // KOT Exclusion: filter out excluded items before station routing
  orderItems = filterKotExcludedItems(orderItems || [], printSettings);
  if (!printStations || printStations.length === 0) {
    return [{ stationId: 'all', stationName: 'All', items: orderItems }];
  }

  const enabledStations = printStations.filter(s => s.enabled !== false);
  if (enabledStations.length === 0) {
    return [{ stationId: 'all', stationName: 'All', items: orderItems }];
  }

  // Build category name → id lookup
  const nameToId = {};
  for (const cat of (categories || [])) {
    if (cat.name) nameToId[cat.name.toLowerCase().trim()] = cat.id;
  }

  // Build categoryId → station mapping
  const catToStation = {};
  const defaultStation = enabledStations.find(s => s.isDefault) || enabledStations[0];
  for (const station of enabledStations) {
    for (const catId of (station.categoryIds || [])) {
      catToStation[catId] = station;
    }
  }

  // Group items by station
  const groups = {};
  for (const item of orderItems) {
    const catId = item.categoryId
      || nameToId[(item.category || '').toLowerCase().trim()]
      || item.category;
    const station = catToStation[catId] || defaultStation;
    if (!groups[station.id]) {
      groups[station.id] = { stationId: station.id, stationName: station.name, items: [] };
    }
    groups[station.id].items.push(item);
  }

  return Object.values(groups);
}

// ── Station-aware KOT Text Generation ──

/**
 * Generate KOT text with a prominent station header
 */
export function generateStationKOTText(orderData, stationName) {
  // Add station header to the standard KOT text
  const baseText = printerService.generateKOTText(orderData);

  // Insert station name after the first separator line
  const lines = baseText.split('\n');
  const headerLine = `<CM>--- ${stationName.toUpperCase()} ---</CM>`;

  // Insert after the restaurant name / order header (typically line 2-3)
  let insertIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes('---') || lines[i].includes('===')) {
      insertIdx = i + 1;
      break;
    }
  }
  if (insertIdx === 0) insertIdx = 1;
  lines.splice(insertIdx, 0, headerLine, '');

  return lines.join('\n');
}

// ── KOT Data Builder (shared by single and multi modes) ──

function buildKotRenderData(orderData, group) {
  return {
    restaurantName: orderData.restaurantName || '',
    restaurantPhone: orderData.restaurantPhone || '',
    orderId: orderData.orderId,
    dailyOrderId: orderData.orderNumber || orderData.dailyOrderId,
    tableNumber: orderData.tableNumber || '',
    roomNumber: orderData.roomNumber || '',
    floorName: orderData.floorName || '',
    customerName: orderData.customerName || '',
    orderType: orderData.orderType || '',
    waiterName: orderData.waiterName || '',
    specialInstructions: orderData.specialInstructions || '',
    items: group.items,
    removedItems: orderData.removedItems || [],
    isIncremental: orderData.isIncremental || false,
    currencySymbol: orderData.currencySymbol || '',
    stationName: group.stationName,
  };
}

// ── Main Orchestrator ──

/**
 * Print KOTs split by station
 *
 * @param {Object} orderData - Full order data with all items
 * @param {Array} printStations - Print station configs from restaurant
 * @param {Array} categories - Menu categories for name→id resolution
 * @param {string} kotPrintingMode - 'single' or 'multi'
 * @param {Object} printSettings - Print settings for template rendering
 */
export async function printKOTsByStation(orderData, printStations, categories, kotPrintingMode, printSettings = {}) {
  const rid = orderData?.restaurantId || null;
  const orderId = orderData?.orderId || orderData?.id || null;
  const verbose = printSettings?.printDiagnostics === true; // failures always log; rest only when on

  // Skip local station printing when remote print is enabled — desktop handles station routing
  const remotePrint = await printerService.getRemotePrintEnabled();
  if (remotePrint) {
    logPrintDiag(rid, { phase: 'skipped', kind: 'kot', via: 'remote', orderId, reason: 'remote-print-mode' }, verbose);
    return { printed: 0, total: 0 };
  }

  // For multi-printer mode, check if local KOT printing is enabled on this device
  if (kotPrintingMode === 'multi') {
    const localKot = await getLocalKotPrintingEnabled();
    if (!localKot) {
      logPrintDiag(rid, { phase: 'skipped', kind: 'kot', via: 'local-station', orderId, reason: 'local-kot-disabled' }, verbose);
      return { printed: 0, total: 0 };
    }
  }

  const stationGroups = splitOrderByStation(orderData.items || [], printStations, categories, printSettings);

  // Filter out empty groups
  const nonEmpty = stationGroups.filter(g => g.items.length > 0);
  if (nonEmpty.length === 0) return { printed: 0, total: 0 };

  logPrintDiag(rid, { phase: 'attempt', kind: 'kot', via: kotPrintingMode === 'multi' ? 'local-station' : 'local-single', orderId, multiStation: kotPrintingMode === 'multi', stationCount: nonEmpty.length }, verbose);

  let printed = 0;

  if (kotPrintingMode === 'single') {
    // Single printer mode: print each station's KOT to the default printer sequentially
    for (const group of nonEmpty) {
      const stationOrderData = {
        ...orderData,
        items: group.items,
      };

      const text = generateStationKOTText(stationOrderData, group.stationName);

      // Generate HTML via template system
      let html = null;
      try {
        const { renderKOT } = require('../utils/printTemplates/index');
        const kotData = buildKotRenderData(orderData, group);
        html = renderKOT(kotData, printSettings, {});
      } catch (err) {
        console.warn('Failed to render KOT HTML for single mode:', err.message);
      }

      try {
        const result = await printerService.printContent({ html, text, silentOnly: true });
        if (result?.method === 'skipped') throw new Error(result.reason || 'Print skipped');
        printed++;
        logPrintDiag(rid, { phase: 'printed', kind: 'kot', via: 'local-single', orderId, stationName: group.stationName, success: true }, verbose);
      } catch (err) {
        console.error(`Failed to print KOT for station ${group.stationName}:`, err);
        logPrintDiag(rid, { phase: 'failed', kind: 'kot', via: 'local-single', orderId, stationName: group.stationName, success: false, reason: 'no-printer-connected', error: err?.message || String(err) }, verbose);
      }

      // Small delay between prints
      if (nonEmpty.indexOf(group) < nonEmpty.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  } else if (kotPrintingMode === 'multi') {
    // Multi-printer mode: each station has its own printer
    // Uses queue-safe printToStationPrinter for thread-safe connect→print→restore
    const stationPrinters = await getStationPrinters();

    for (const group of nonEmpty) {
      const stationOrderData = {
        ...orderData,
        items: group.items,
      };

      const text = generateStationKOTText(stationOrderData, group.stationName);

      const printerConfig = stationPrinters[group.stationId];

      if (!printerConfig || printerConfig.type !== 'network' || !printerConfig.host) {
        // No station printer configured — fall back to default printer
        console.warn(`No network printer for station "${group.stationName}" — printing to default`);
        try {
          const result = await printerService.printContent({ html: null, text, silentOnly: true });
          if (result?.method === 'skipped') throw new Error(result.reason || 'Print skipped');
          printed++;
          logPrintDiag(rid, { phase: 'printed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, success: true, reason: 'no-station-printer-used-default' }, verbose);
        } catch (err) {
          console.error(`Default fallback print for station "${group.stationName}" failed:`, err);
          logPrintDiag(rid, { phase: 'failed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, success: false, reason: 'no-station-printer', error: err?.message || String(err) }, verbose);
        }
      } else {
        const printerAddr = `${printerConfig.host}:${printerConfig.port || 9100}`;
        // Print to station-specific printer via queue-safe function
        const result = await printerService.printToStationPrinter(printerConfig, text);
        if (result.success) {
          printed++;
          logPrintDiag(rid, { phase: 'printed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, method: 'tcp', configuredDeviceName: printerAddr, success: true }, verbose);
        } else {
          console.error(`Station "${group.stationName}" print failed: ${result.error}`);
          logPrintDiag(rid, { phase: 'failed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, method: 'tcp', configuredDeviceName: printerAddr, success: false, reason: 'printer-unreachable', error: result.error || 'station printer print failed' }, verbose);
          // Fallback: try default printer
          try {
            const fallbackResult = await printerService.printContent({ html: null, text, silentOnly: true });
            if (fallbackResult?.method === 'skipped') throw new Error(fallbackResult.reason || 'Print skipped');
            printed++;
            console.log(`Fallback to default printer succeeded for station "${group.stationName}"`);
            logPrintDiag(rid, { phase: 'printed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, success: true, reason: 'fell-back-to-default' }, verbose);
          } catch (fallbackErr) {
            console.error(`Default fallback also failed for "${group.stationName}":`, fallbackErr);
            logPrintDiag(rid, { phase: 'failed', kind: 'kot', via: 'local-station', orderId, stationId: group.stationId, stationName: group.stationName, success: false, reason: 'printer-unreachable-and-no-default', error: fallbackErr?.message || String(fallbackErr) }, verbose);
          }
        }
      }

      if (nonEmpty.indexOf(group) < nonEmpty.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  return { printed, total: nonEmpty.length };
}

// ── Load Print Station Config ──

let _cachedStations = null;
let _cachedMode = 'single';
let _cachedCategories = [];
let _cacheTs = 0;

/**
 * Get print stations config (cached for 5 minutes)
 */
export async function getPrintStationConfig(restaurantId) {
  const now = Date.now();
  if (_cachedStations && now - _cacheTs < 5 * 60 * 1000) {
    return { stations: _cachedStations, mode: _cachedMode, categories: _cachedCategories };
  }

  try {
    const res = await apiClient.getPrintStations(restaurantId);
    if (res?.success) {
      _cachedStations = (res.printStations || []).filter(s => s.enabled);
      _cachedMode = res.kotPrintingMode || 'single';
      _cachedCategories = res.categories || [];
      _cacheTs = now;
    }
  } catch (err) {
    console.warn('Failed to load print stations:', err.message);
  }

  return {
    stations: _cachedStations || [],
    mode: _cachedMode,
    categories: _cachedCategories
  };
}

/**
 * Invalidate the cached print station config
 */
export function invalidateStationCache() {
  _cachedStations = null;
  _cacheTs = 0;
}
