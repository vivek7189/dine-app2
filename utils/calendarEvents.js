// Event calendar helpers shared by the Events screen, the home strip and the More menu.
// API: GET /api/calendar/:rid(/upcoming) — 403 when the owner turned staff viewing off.
import apiClient from '../services/api';
import { getLocale } from './formatCurrency';

export const MANAGE_ROLES = ['owner', 'admin', 'co-owner', 'manager'];

export const CATEGORY_STYLE = {
  festival: { label: 'Festival', color: '#d97706', bg: '#fffbeb' },
  religious: { label: 'Religious', color: '#7c3aed', bg: '#f5f3ff' },
  national: { label: 'National', color: '#2563eb', bg: '#eff6ff' },
  cultural: { label: 'Cultural', color: '#db2777', bg: '#fdf2f8' },
  sports: { label: 'Sports', color: '#059669', bg: '#ecfdf5' },
  commercial: { label: 'Special day', color: '#dc2626', bg: '#fef2f2' },
  custom: { label: 'Our event', color: '#0891b2', bg: '#ecfeff' },
};
export const categoryStyle = (c) => CATEGORY_STYLE[c] || { label: c ? String(c).replace(/\b\w/g, x => x.toUpperCase()) : 'Event', color: '#475569', bg: '#f1f5f9' };

export const CROWD = [
  { key: 'normal', label: 'Normal', color: '#475569', bg: '#f1f5f9' },
  { key: 'busy', label: 'Busy', color: '#b45309', bg: '#fef3c7' },
  { key: 'very_busy', label: 'Very busy', color: '#b91c1c', bg: '#fee2e2' },
];
export const crowdStyle = (k) => CROWD.find(c => c.key === k) || null;

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseYmd = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const fmt = (date, opts) => {
  try { return date.toLocaleDateString(getLocale(), opts); } catch { return date.toDateString(); }
};
export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => fmt(parseYmd(s), opts);
export const fmtMonth = (date) => fmt(date, { month: 'long', year: 'numeric' });
export const fmtRange = (ev) => (ev.endDate && ev.endDate !== ev.date
  ? `${fmtDate(ev.date)} – ${fmtDate(ev.endDate)}`
  : fmtDate(ev.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

// Whole days from today (restaurant phone's local date) to the event; negative once started.
export const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(ymd(new Date()))) / 86400000);
export const countdown = (ev) => {
  const n = daysUntil(ev.date);
  if (n > 1) return `in ${n} days`;
  if (n === 1) return 'Tomorrow';
  if (n === 0) return 'Today';
  if (ev.endDate && daysUntil(ev.endDate) >= 0) return 'On now';
  return n === -1 ? 'Yesterday' : `${-n} days ago`;
};

export const isManagerRole = (role) => MANAGE_ROLES.includes(String(role || '').toLowerCase());

export const eventsOf = (res) => (Array.isArray(res) ? res : (res?.events || res?.upcoming || []));

// ── Access probe (shared, cached): does this person get the calendar at all? ──
// allowed=false on 403 (staff view off) and 404 (backend without the calendar yet) → hide.
const TTL = 60 * 1000;
let _cache = { rid: null, at: 0, value: null };
let _inflight = null;

export async function loadUpcoming(rid, { force = false, days = 45 } = {}) {
  if (!rid) return { allowed: false, events: [], canManage: false };
  if (!force && _cache.rid === rid && _cache.value && Date.now() - _cache.at < TTL) return _cache.value;
  if (_inflight && _inflight.rid === rid && !force) return _inflight.p;
  const p = (async () => {
    try {
      const res = await apiClient.getUpcomingEvents(rid, days);
      const value = {
        allowed: res?.success !== false,
        events: eventsOf(res).filter(e => !e.hidden),
        canManage: res?.canManage === true,
      };
      _cache = { rid, at: Date.now(), value };
      return value;
    } catch (e) {
      if (e?.status === 403 || e?.status === 404) {
        const value = { allowed: false, events: [], canManage: false, status: e.status };
        _cache = { rid, at: Date.now(), value };
        return value;
      }
      // Network / server hiccup: keep what we last knew for this outlet, else hide quietly.
      if (_cache.rid === rid && _cache.value) return _cache.value;
      return { allowed: false, events: [], canManage: false, error: e?.message };
    } finally {
      _inflight = null;
    }
  })();
  _inflight = { rid, p };
  return p;
}

export function clearCalendarCache() { _cache = { rid: null, at: 0, value: null }; }
