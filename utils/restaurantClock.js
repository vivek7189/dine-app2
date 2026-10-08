// The restaurant's clock — same maths as the web (dine-frontend lib/api.js _computeIanaOffset +
// orderhistory getDateRange): order dates/times and date filters follow the RESTAURANT's timezone
// (posSettings.timezone) and business-day start hour, not the phone's. A phone set to another
// timezone (or an owner abroad) sees the restaurant's day. No timezone set → the phone's (unchanged).

// getTimezoneOffset() convention: minutes to ADD to local time to get UTC (IST → -330).
// Returns null when the zone can't be resolved or the result looks wrong (caller falls back to the
// phone's offset).
export function ianaOffset(iana, now = new Date()) {
  if (!iana) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (t) => parseInt(parts.find((p) => p.type === t)?.value, 10);
    const h = get('hour');
    const local = Date.UTC(get('year'), get('month') - 1, get('day'), h === 24 ? 0 : h, get('minute'), get('second'));
    const off = Math.round((now.getTime() - local) / 60000);
    // sanity: real offsets are within UTC-12..UTC+14 and on a 15-minute grid
    if (!Number.isFinite(off) || off < -840 || off > 720 || off % 15 !== 0) return null;
    return off;
  } catch (_) {
    return null;
  }
}

// The offset to use: the restaurant's when known, else the phone's.
export function clockOffset(iana, now = new Date()) {
  const off = ianaOffset(iana, now);
  return off == null ? now.getTimezoneOffset() : off;
}

// A Date whose UTC fields read the restaurant's wall clock.
function wall(date, off) {
  return new Date(date.getTime() - off * 60000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "8 Oct"
export function fmtDay(date, off) {
  if (!date) return '';
  const w = wall(date, off);
  return `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
}

// "07:45 pm"
export function fmtClock(date, off) {
  if (!date) return '';
  const w = wall(date, off);
  const h = w.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(w.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// "8 Oct 2026, 07:45 pm"
export function fmtDayTime(date, off) {
  if (!date) return '';
  const w = wall(date, off);
  return `${fmtDay(date, off)} ${w.getUTCFullYear()}, ${fmtClock(date, off)}`;
}

// Start/end instants (ISO) of a date filter, on the restaurant's business day (the day starts at
// dayStartHour, e.g. 4 AM, so after-midnight orders stay on the right day — web parity).
//   mode: 'today' | 'yesterday' | 'week' (last 7 days incl. today) | 'month' (last 30 days) | 'custom'
//   customStart / customEnd: Dates picked on the phone — their calendar date is used (whole
//   calendar days, like the web).
export function businessRange(mode, { off, dayStartHour = 0, customStart, customEnd, now = new Date() } = {}) {
  const bdh = Number.isInteger(dayStartHour) && dayStartHour > 0 && dayStartHour < 24 ? dayStartHour : 0;
  const w = wall(now, off);
  const wallHour = w.getUTCHours();
  w.setUTCHours(bdh, 0, 0, 0);
  if (wallHour < bdh) w.setUTCDate(w.getUTCDate() - 1);
  const todayStart = new Date(w.getTime() + off * 60000);
  const DAY = 24 * 60 * 60 * 1000;
  const todayEnd = new Date(todayStart.getTime() + DAY - 1);
  const iso = (s, e) => ({ startDate: s.toISOString(), endDate: e.toISOString() });
  switch (mode) {
    case 'today': return iso(todayStart, todayEnd);
    case 'yesterday': return iso(new Date(todayStart.getTime() - DAY), new Date(todayStart.getTime() - 1));
    case 'week': return iso(new Date(todayStart.getTime() - 6 * DAY), todayEnd);
    case 'month': return iso(new Date(todayStart.getTime() - 29 * DAY), todayEnd);
    case 'custom': {
      if (!customStart || !customEnd) return iso(todayStart, todayEnd);
      const day = (d) => [d.getFullYear(), d.getMonth(), d.getDate()];
      const [sy, sm, sd] = day(customStart);
      const [ey, em, ed] = day(customEnd);
      // picked calendar dates → 00:00–23:59:59.999 of those days in the restaurant's timezone
      // (web parity: custom ranges are calendar days)
      const s = new Date(Date.UTC(sy, sm, sd, 0, 0, 0, 0) + off * 60000);
      const e = new Date(Date.UTC(ey, em, ed, 23, 59, 59, 999) + off * 60000);
      return iso(s, e);
    }
    default: return {};
  }
}
