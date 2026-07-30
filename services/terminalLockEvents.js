// Tiny decoupled event bridge between the API layer (which knows when an order is
// settled) and the TerminalLockProvider (which owns the lock UI). Kept in its own
// module to avoid a circular import between services/api.js and the context.

let listener = null;

// Registered by TerminalLockProvider; called after a payment is verified.
export function onTerminalOrderComplete(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

// Fired by api.verifyPayment on a successful settlement.
export function emitTerminalOrderComplete() {
  try { if (listener) listener(); } catch {}
}
