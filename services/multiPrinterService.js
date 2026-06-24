import AsyncStorage from '@react-native-async-storage/async-storage';
import * as printerService from './printerService';
import apiClient from './api';

const STATION_PRINTERS_KEY = 'dine_station_printers';

/**
 * Multi-Printer Service for Station-based KOT Routing
 *
 * Manages per-station printer configs and orchestrates printing
 * KOTs to the correct printer based on print station assignments.
 */

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
  // Skip local station printing when remote print is enabled — desktop handles station routing
  const remotePrint = await printerService.getRemotePrintEnabled();
  if (remotePrint) return { printed: 0, total: 0 };

  const stationGroups = splitOrderByStation(orderData.items || [], printStations, categories, printSettings);

  // Filter out empty groups
  const nonEmpty = stationGroups.filter(g => g.items.length > 0);
  if (nonEmpty.length === 0) return { printed: 0 };

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
      const { renderKOT } = require('../utils/printTemplates/index');
      const kotData = {
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
      const html = renderKOT(kotData, printSettings, {});

      try {
        await printerService.printContent({ html, text, silentOnly: false });
        printed++;
      } catch (err) {
        console.error(`Failed to print KOT for station ${group.stationName}:`, err);
      }

      // Small delay between prints
      if (nonEmpty.indexOf(group) < nonEmpty.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  } else if (kotPrintingMode === 'multi') {
    // Multi-printer mode: each station has its own printer
    const stationPrinters = await getStationPrinters();

    for (const group of nonEmpty) {
      const printerConfig = stationPrinters[group.stationId];
      if (!printerConfig) {
        console.warn(`No printer configured for station "${group.stationName}" — skipping`);
        continue;
      }

      const stationOrderData = {
        ...orderData,
        items: group.items,
      };

      const text = generateStationKOTText(stationOrderData, group.stationName);

      try {
        // Connect to station-specific printer, print, then restore default
        const savedPrinter = await printerService.getSavedPrinter();

        // Temporarily connect to station printer
        if (printerConfig.type === 'bluetooth' && printerConfig.macAddress) {
          await printerService.connectBluetoothPrinter(printerConfig.macAddress);
        } else if (printerConfig.type === 'network' && printerConfig.host) {
          await printerService.connectNetworkPrinter(printerConfig.host, printerConfig.port || 9100);
        } else if (printerConfig.type === 'usb' && printerConfig.vendorId) {
          await printerService.connectUSBPrinter(printerConfig.vendorId, printerConfig.productId);
        }

        await printerService.printContent({ html: null, text, silentOnly: true });
        printed++;

        // Restore default printer connection
        if (savedPrinter) {
          if (savedPrinter.type === 'bluetooth' && savedPrinter.macAddress) {
            await printerService.connectBluetoothPrinter(savedPrinter.macAddress);
          } else if (savedPrinter.type === 'network' && savedPrinter.host) {
            await printerService.connectNetworkPrinter(savedPrinter.host, savedPrinter.port || 9100);
          }
        }
      } catch (err) {
        console.error(`Failed to print to station "${group.stationName}" printer:`, err);
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
