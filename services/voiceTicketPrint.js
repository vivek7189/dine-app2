// Voice Ticket → kitchen printing on the phone / tablet.
// Same rules as the order screen (screens/MenuNative.js "Auto-print KOT"): print claims (this phone
// tells the server it will print, so the desktop does not print it again), station routing from this
// phone only when there are 2+ stations AND local station printing is on, otherwise the saved default
// printer; a failed phone print hands the ticket back to the desktop.
import apiClient from './api';
import * as printerService from './printerService';
import { getPrintStationConfig, printKOTsByStation, getLocalKotPrintingEnabled } from './multiPrinterService';
import { getPrintClaims, handBackToDesktop } from './localPrintClaim';

function filterKotExcludedItems(items, printSettings) {
  if (!printSettings?.kotExclusionEnabled) return items;
  const excludedCats = new Set(printSettings.kotExcludedCategories || []);
  const excludedIds = new Set(printSettings.kotExcludedItemIds || []);
  if (excludedCats.size === 0 && excludedIds.size === 0) return items;
  return items.filter((item) => !(excludedIds.has(item.id || item.menuItemId) || excludedCats.has(item.categoryId)));
}

// Load once per screen: print settings, enabled station count, this phone's local station printing.
export async function loadVoicePrintConfig(restaurantId) {
  const [settingsRes, stationsRes, localKot] = await Promise.all([
    apiClient.getPrintSettings(restaurantId).catch(() => null),
    apiClient.getPrintStations(restaurantId).catch(() => null),
    getLocalKotPrintingEnabled().catch(() => false),
  ]);
  const printSettings = settingsRes?.printSettings || settingsRes || {};
  try { printerService.setImagePrintConfig({ enabled: printSettings.imagePrintEnabled, printerWidth: printSettings.printerWidth, autoImageForCurrency: printSettings.autoImageForCurrency }); } catch (_) { /* optional */ }
  return {
    printSettings,
    printStationCount: stationsRes?.success ? (stationsRes.printStations || []).filter((s) => s.enabled).length : 0,
    localKotPrintingOn: !!localKot,
  };
}

// Claim fields to merge into the create-order request (kot = this phone prints the new order's KOT).
export async function voicePrintClaims(cfg, restaurantId, { kot = true } = {}) {
  try {
    return await getPrintClaims({ kot, printSettings: cfg.printSettings, printStationCount: cfg.printStationCount, localKotPrintingOn: cfg.localKotPrintingOn, restaurantId });
  } catch (_) { return {}; }
}

/**
 * Print a voice ticket's KOT. lines: [{name, quantity, notes, categoryId, selectedVariant}]
 * @returns {Promise<'printed'|'off'|'failed'>}
 */
export async function printVoiceKOT({ cfg, restaurantId, restaurantName, orderId, order, lines, header, waiter, claims = {}, isIncremental = false }) {
  const printSettings = cfg.printSettings || {};
  if (printSettings.autoPrintOnKOT === false) return 'off';
  const orderNumber = order?.dailyOrderId || order?.orderNumber || String(orderId || '').slice(-6);
  const kotData = {
    orderNumber,
    orderId,
    tableNumber: header.tableNumber || '',
    isIncremental,
    items: filterKotExcludedItems(lines, printSettings).map((l) => ({
      name: l.name,
      category: l.category || null,
      categoryId: l.categoryId || null,
      quantity: l.quantity,
      notes: l.notes || '',
      selectedVariant: l.selectedVariant || null,
      selectedCustomizations: [],
      isNew: isIncremental,
      isUpdated: false,
      quantityDelta: 0,
      previousQuantity: 0,
    })),
    removedItems: [],
    waiterName: waiter?.name || 'Waiter',
    waiterId: waiter?.id,
    timestamp: new Date(),
    restaurantName: restaurantName || '',
    orderType: header.dineIn ? 'Dine-in' : (header.typeLabel || 'Takeaway'),
    customerName: header.customerName || '',
    specialInstructions: header.specialInstructions || '',
    dailyOrderId: orderNumber,
    printSettings,
    covers: 1,
  };
  try {
    if (cfg.printStationCount >= 2 && cfg.localKotPrintingOn) {
      const { stations, mode, categories } = await getPrintStationConfig(restaurantId);
      const r = await printKOTsByStation(kotData, stations, categories, mode, printSettings);
      if (claims.kotPrintedBy && r.printed < r.total) handBackToDesktop(orderId, 'kot');
      return r.printed === 0 && r.total > 0 ? 'failed' : 'printed';
    }
    const kotText = printerService.generateKOTText(kotData);
    const kotHtml = printerService.wrapKOTTextInHTML(kotText);
    const kotImageHtml = printerService.generateKOTHTML(kotData, printSettings);
    const r = await printerService.printWithFeedback({ html: kotHtml, text: kotText, imageHtml: kotImageHtml, silentOnly: true, label: 'KOT' });
    if (claims.kotPrintedBy && !r.success) handBackToDesktop(orderId, 'kot');
    return r.success ? 'printed' : 'failed';
  } catch (_) {
    if (claims.kotPrintedBy) handBackToDesktop(orderId, 'kot');
    return 'failed';
  }
}
