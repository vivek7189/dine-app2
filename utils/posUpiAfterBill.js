// POS "Scan to pay" screen after a bill is completed (customerAppSettings.upiView.posAfterBill,
// backend utils/qrUpiView.js; same rules as the web utils/posUpiAfterBill.js). Off unless set. TSMC 27 Nov.
// View only: the bill is already completed — the restaurant's UPI QR + ID for the guest, staff close it.
const POS = ['upi', 'all'];
const UPI_ID = /^[\w.-]{1,}@[a-zA-Z][\w.-]{1,}$/;

export function posUpiFor(upiView, paymentMethod) {
  const u = upiView && typeof upiView === 'object' ? upiView : null;
  if (!u || !POS.includes(u.posAfterBill)) return null;
  const upiId = UPI_ID.test(String(u.upiId || '').trim()) ? String(u.upiId).trim() : '';
  const qrUrl = /^https:\/\/\S+$/i.test(String(u.qrUrl || '')) ? u.qrUrl : '';
  if (!upiId && !qrUrl) return null;
  if (u.posAfterBill === 'upi' && String(paymentMethod || '').toLowerCase() !== 'upi') return null;
  return { upiId, qrUrl, name: String(u.name || '').slice(0, 60) };
}
