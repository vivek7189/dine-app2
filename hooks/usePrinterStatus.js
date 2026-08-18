// Live printer connection status for RN components.
//
// Subscribes to the printer-event bus and reflects the REAL, probed status from printerService
// (never the old "connected once = connected forever" flag). Triggers a fresh check on mount so a
// screen always shows a current reading. Use on the printer page and anywhere the waiter should see
// a red/green indicator before taking an order.
//
// Returns { status: 'none'|'checking'|'connected'|'disconnected', lastChecked, connectionType,
//           printer, recheck } — call recheck() to force a probe + auto-heal.
import { useEffect, useState, useCallback } from 'react';
import * as printerService from '../services/printerService';

export default function usePrinterStatus({ checkOnMount = true } = {}) {
  const [health, setHealth] = useState(() => printerService.getPrinterHealth());

  const recheck = useCallback(() => {
    printerService.checkAndHeal?.().catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const sync = () => { if (mounted) setHealth(printerService.getPrinterHealth()); };
    sync();
    const off = printerService.onPrinterEvent((ev) => {
      if (['health', 'reconnecting', 'reconnected', 'disconnected', 'connected'].includes(ev?.type)) sync();
    });
    if (checkOnMount) recheck();
    return () => { mounted = false; try { off?.(); } catch {} };
  }, [checkOnMount, recheck]);

  return { ...health, recheck };
}
