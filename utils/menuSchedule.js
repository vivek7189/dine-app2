// Menu item / category timings ("available only 12:00–15:00, Mon–Fri").
//
// schedule = { enabled: true, days: [0..6] (0 = Sunday; empty = every day),
//              windows: [{ from: 'HH:MM', to: 'HH:MM' }, ...] }
// A window whose `to` is not after `from` runs past midnight (22:00–02:00 belongs to the day it
// starts); from === to means the whole day. Evaluated on the restaurant's own clock (IANA timezone).
// dine-app copy of dine-backend/utils/menuSchedule.js (the backend enforces it as a hard stop) —
// the same file lives in dine-frontend src/lib/menuSchedule.js. Keep the three in sync.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toMin = (s) => { const m = HHMM.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

// Clean, validated copy of what a client sent (or null = no timing).
function normalizeSchedule(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const windows = (Array.isArray(raw.windows) ? raw.windows : [])
    .map(w => ({ from: String(w && w.from || '').trim(), to: String(w && w.to || '').trim() }))
    .filter(w => toMin(w.from) !== null && toMin(w.to) !== null)
    .slice(0, 6);
  const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const enabled = raw.enabled !== false && windows.length > 0;
  if (!enabled && windows.length === 0 && days.length === 0) return null;
  return { enabled, days, windows };
}

// { day 0–6, minutes since midnight } for `date` in timezone `tz` (falls back to the server clock).
function clockIn(date, tz) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
      const get = (t) => (parts.find(p => p.type === t) || {}).value;
      const day = DAY_NAMES.indexOf(get('weekday'));
      const h = Number(get('hour')) % 24, m = Number(get('minute'));
      if (day >= 0 && Number.isFinite(h) && Number.isFinite(m)) return { day, minutes: h * 60 + m };
    } catch (_) { /* unknown timezone → server clock */ }
  }
  return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
}

function isScheduleOpen(schedule, date, tz) {
  const s = normalizeSchedule(schedule);
  if (!s || !s.enabled) return true;
  const { day, minutes } = clockIn(date, tz);
  const onDay = (d) => s.days.length === 0 || s.days.includes(d);
  const yesterday = (day + 6) % 7;
  return s.windows.some(w => {
    const f = toMin(w.from), t = toMin(w.to);
    if (f < t) return onDay(day) && minutes >= f && minutes < t;
    if (f === t) return onDay(day);
    return (onDay(day) && minutes >= f) || (onDay(yesterday) && minutes < t); // past midnight
  });
}

const fmt12 = (hhmm) => {
  const m = toMin(hhmm); if (m === null) return hhmm;
  const h = Math.floor(m / 60), mm = m % 60, ap = h < 12 ? 'AM' : 'PM', h12 = h % 12 === 0 ? 12 : h % 12;
  return mm ? `${h12}:${String(mm).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
};

// "12 PM–3 PM, 7 PM–11 PM · Mon–Fri" (days omitted when every day).
function describeSchedule(schedule) {
  const s = normalizeSchedule(schedule);
  if (!s || !s.enabled) return '';
  const times = s.windows.map(w => (w.from === w.to ? 'All day' : `${fmt12(w.from)}–${fmt12(w.to)}`)).join(', ');
  if (!s.days.length || s.days.length === 7) return times;
  const run = s.days.join(',');
  const daysText = run === '1,2,3,4,5' ? 'Mon–Fri' : run === '0,6' ? 'Sat–Sun' : s.days.map(d => DAY_NAMES[d]).join(', ');
  return `${times} · ${daysText}`;
}

// Is this menu item orderable now? Item timing AND its category / sub-category timings must all allow it.
// categories: restaurant.categories ([{ name, availabilitySchedule }]).
function itemAvailability(item, categories, date, tz) {
  if (!item) return { available: true };
  const cats = Array.isArray(categories) ? categories : [];
  const checks = [{ schedule: item.availabilitySchedule, source: 'item' }];
  for (const nm of [item.category, item.subCategory]) {
    if (!nm) continue;
    const c = cats.find(x => x && x.name === nm);
    if (c && c.availabilitySchedule) checks.push({ schedule: c.availabilitySchedule, source: 'category', name: c.name });
  }
  for (const c of checks) {
    if (!isScheduleOpen(c.schedule, date, tz)) {
      const when = describeSchedule(c.schedule);
      return { available: false, source: c.source, when, message: `"${item.name}" is not available right now${when ? ` (available ${when})` : ''}` };
    }
  }
  return { available: true };
}

export { normalizeSchedule, isScheduleOpen, describeSchedule, itemAvailability, clockIn, DAY_NAMES };

// Does anything on this menu use timings? (lets screens skip all work when nothing is scheduled)
export function hasAnyTimings(items, categories) {
  const on = (s) => !!(s && s.enabled !== false && Array.isArray(s.windows) && s.windows.length);
  return (Array.isArray(items) && items.some(i => i && on(i.availabilitySchedule)))
    || (Array.isArray(categories) && categories.some(c => c && on(c.availabilitySchedule)));
}

// POS display copy of the menu: items outside their hours become isAvailable:false (so every existing
// "unavailable" path greys + blocks them) and carry timingClosed / timingText for the label.
// Never save these objects back as menu data.
export function applyMenuTimings(items, categories, tz, when) {
  if (!Array.isArray(items) || !hasAnyTimings(items, categories)) return items;
  const now = when || new Date();
  let changed = false;
  const out = items.map(item => {
    if (!item || item.isAvailable === false) return item;
    const a = itemAvailability(item, categories, now, tz);
    if (a.available) return item;
    changed = true;
    return { ...item, isAvailable: false, timingClosed: true, timingText: a.when || '' };
  });
  return changed ? out : items;
}
