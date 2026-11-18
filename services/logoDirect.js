// Receipt logo on an iPhone / iPad whose hidden-WebView snapshot is too slow.
//
// The text bill prints its logo as a small image: the logo is drawn in a hidden WebView and
// snapshotted (components/ImagePrintHost.js). On some iPads that snapshot never finishes (Whisky
// Business, 28 Oct–18 Nov: "image capture timeout" on every bill), so each bill waited 10 s, the
// Bluetooth link could drop, and the logo was never printed.
//
// Once the snapshot has timed out on THIS device, later bills either:
//   • 'direct'   — send the stored logo image straight to the printer's raster command
//                  (no WebView; only where the native command exists and the logo is paper-wide,
//                  because that command prints from the left edge), or
//   • 'skip'     — print the bill without the logo right away; the snapshot is tried again once a day.
// Every other device ('snapshot') keeps exactly the old behaviour. Pure logic (no React Native
// imports) so it can be tested on its own; printerService passes in AsyncStorage.

export const LOGO_SLOW_KEY = 'dine_logo_snapshot_slow_v1';
export const LOGO_RETRY_MS = 24 * 60 * 60 * 1000;

export const isSnapshotTimeout = (err) => /image capture timeout/i.test(String((err && err.message) || err || ''));

export function createLogoDirect({ storage, now = () => Date.now() } = {}) {
  let loaded = false;
  let slowAt = 0; // when the snapshot last timed out on this device (0 = never)

  const load = async () => {
    if (loaded) return slowAt;
    loaded = true;
    try { slowAt = Number(await storage.getItem(LOGO_SLOW_KEY)) || 0; } catch (_) { slowAt = 0; }
    return slowAt;
  };

  // How to print the logo on this bill: 'snapshot' (unchanged) | 'direct' | 'skip'.
  const plan = async ({ isIos, canDirect }) => {
    if (!isIos) return 'snapshot';
    const at = await load();
    if (!at) return 'snapshot';
    if (canDirect) return 'direct';
    return now() - at < LOGO_RETRY_MS ? 'skip' : 'snapshot';
  };

  const markSlow = async () => {
    loaded = true;
    slowAt = now();
    try { await storage.setItem(LOGO_SLOW_KEY, String(slowAt)); } catch (_) { /* memory copy still works */ }
  };

  // The daily retry worked → this device is back to the normal path.
  const clearSlow = async () => {
    if (!slowAt) return;
    slowAt = 0;
    try { await storage.removeItem(LOGO_SLOW_KEY); } catch (_) { /* ignore */ }
  };

  return { plan, markSlow, clearSlow, load };
}
