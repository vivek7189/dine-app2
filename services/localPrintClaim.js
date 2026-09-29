// "This phone's prints replace the desktop's" (opt-in, per phone — Printer Settings).
//
// Without it, an order placed from the app prints on the phone's printer AND the desktop POS
// auto-prints it again. When the user turns this on, the app tells the backend — only for a
// ticket it is really about to print itself — via `kotPrintedBy` / `billPrintedBy` in the save
// request; the backend puts that on the realtime print event and the desktop skips it.
// If the phone's print then FAILS, handBackToDesktop() asks the desktop for a forced print, so
// a ticket is never lost (worst case: a duplicate, as before).
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient from './api';
import * as printerService from './printerService';
import { getStationPrinters } from './multiPrinterService';

const TOGGLE_KEY = 'dineLocalPrintReplacesDesktop';
const INSTALL_ID_KEY = 'dineInstallId';

export const getLocalPrintReplacesDesktop = async () => {
  try { return (await AsyncStorage.getItem(TOGGLE_KEY)) === 'true'; } catch { return false; }
};

export const setLocalPrintReplacesDesktop = async (enabled) => {
  await AsyncStorage.setItem(TOGGLE_KEY, enabled ? 'true' : 'false');
};

async function deviceTag() {
  let id = null;
  try { id = await AsyncStorage.getItem(INSTALL_ID_KEY); } catch { /* ignore */ }
  if (!id) {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    try { await AsyncStorage.setItem(INSTALL_ID_KEY, id); } catch { /* ignore */ }
  }
  return `app:${id}`;
}

/**
 * Claim fields to merge into an order save request.
 * @param {object} o
 *   kot: true when this request's KOT will be printed by the caller right after the save
 *   bill: true when this request's bill will be printed by the caller right after the save
 *   printSettings, printStationCount, localKotPrintingOn: the same values the caller's print
 *   branch uses (station routing from this phone only when >= 2 stations AND local routing on)
 * @returns {Promise<{kotPrintedBy?: string, billPrintedBy?: string}>}
 */
export async function getPrintClaims({ kot = false, bill = false, printSettings = {}, printStationCount = 0, localKotPrintingOn = false } = {}) {
  try {
    if (!kot && !bill) return {};
    if (!(await getLocalPrintReplacesDesktop())) return {};
    if (await printerService.getRemotePrintEnabled()) return {}; // desktop prints everything
    const saved = await printerService.getSavedPrinter();
    const out = {};
    if (kot && printSettings?.autoPrintOnKOT !== false) {
      let canPrint;
      if (printStationCount >= 2) {
        // multi-station tickets only replace the desktop's when THIS phone does station routing
        const stationPrinters = localKotPrintingOn ? await getStationPrinters() : {};
        canPrint = localKotPrintingOn && (!!saved || Object.keys(stationPrinters || {}).length > 0);
      } else {
        canPrint = !!saved;
      }
      if (canPrint) out.kotPrintedBy = await deviceTag();
    }
    if (bill && printSettings?.autoPrintOnBilling !== false && saved) out.billPrintedBy = await deviceTag();
    return out;
  } catch {
    return {}; // any doubt → no claim → desktop prints as before
  }
}

// The phone claimed a ticket but could not print it → have the desktop print it (forced).
export function handBackToDesktop(orderId, kind = 'kot') {
  if (!orderId) return;
  apiClient.triggerPrint(orderId, kind === 'bill' ? 'bill' : 'kot').catch(() => { /* best effort */ });
}
