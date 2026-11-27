// Customers → CSV (opens in Excel) for the Customers screen "Download" button (owner / admin only;
// the server checks too: GET /api/customers-export/:restaurantId). Same columns as the web Download.

// A cell starting with = + - @ could run as a formula in Excel — keep it as text (phone numbers stay as they are).
const safe = (v) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) && !/^\+?[\d\s()-]+$/.test(v) ? `'${v}` : v);
const cell = (v) => {
  const s = String(safe(v ?? ''));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const day = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function customersToCsv(list) {
  const cols = [
    ['Name', c => c.name, true], ['Phone', c => c.phone, true], ['Email', c => c.email, true],
    ['City', c => c.city], ['Address', c => c.address], ['Birthday', c => c.dob], ['Anniversary', c => c.anniversary],
    ['GST number', c => c.gstNumber], ['Orders', c => c.totalOrders, true], ['Total spent', c => c.totalSpent, true],
    ['Last order', c => day(c.lastOrderDate), true], ['Customer since', c => day(c.createdAt), true],
    ['Loyalty points', c => c.loyaltyPoints], ['Due', c => c.due], ['Wallet', c => c.wallet],
    ['Source', c => c.source], ['Do not contact', c => (c.doNotContact ? 'Yes' : '')],
  ].filter(([, get, always]) => always || list.some(c => { const v = get(c); return v !== '' && v !== 0 && v != null; }));
  const lines = [cols.map(([label]) => cell(label)).join(',')];
  list.forEach(c => lines.push(cols.map(([, get]) => cell(get(c))).join(',')));
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads names in any language
}
