// Best-effort print diagnostics → server.
//
// dine-app used to log NOTHING server-side, so when a KOT didn't print on a waiter's phone there was
// no way to see why. This mirrors the Electron desktop's diagnostics so BOTH apps report to the SAME
// place (printDiagnostics/{restaurantId}) — and support can tell from the DB, per device:
//   • which PATH was taken   (via: local-station | local-single | remote)
//   • the outcome            (phase: attempt | printed | failed | skipped)
//   • the exact reason        (reason: remote-print-mode | local-kot-disabled | no-station-printer |
//                              printer-unreachable | render-failed | no-printer-connected | …)
//   • the target printer      (printer: "host:port")  and the error message.
//
// Every call is guarded: diagnostics must NEVER affect printing.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import apiClient from './api';

let _appVersion = null;
try {
  _appVersion = Constants?.expoConfig?.version || Constants?.manifest?.version || Constants?.manifest2?.extra?.expoClient?.version || null;
} catch (_) { /* ignore */ }

// verbose = restaurant's printSettings.printDiagnostics. Matches the Electron desktop's gate:
// FAILURES are always logged (that's the debugging gold); successes/skips/attempts only when
// verbose is on — so normal operation on a busy restaurant doesn't write a diagnostic per KOT.
export async function logPrintDiag(restaurantId, event, verbose = false) {
  try {
    if (!restaurantId || !event) return;
    const isFailure = event.success === false || event.phase === 'failed';
    if (!verbose && !isFailure) return;
    await apiClient.logPrintDiagnostic(restaurantId, {
      platform: 'dine-app',
      os: Platform.OS,
      appVersion: _appVersion,
      ...event,
    });
  } catch (_) { /* never affects printing */ }
}
