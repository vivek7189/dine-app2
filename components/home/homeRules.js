// Rules shared by the native Home screens — the same rules as the web Home
// (dine-frontend src/app/(dashboard)/home/page.js), so a person sees the same cards in the app.
import { WEB_BASE_URL } from '../../services/api';
import { roleCan } from '../../utils/permissions';

export const OWNER_ROLES = ['owner', 'admin'];
export const roleOf = (user) => String(user?.role || '').toLowerCase();
export const ridOf = (user) => user?.restaurantId || user?.restaurant?.id || null;

// Restaurant-wide money (yesterday's sales, unsettled orders) is for the people who run the
// business: owner / admin / co-owner / manager, or a staff member given Analytics access.
export function canSeeBusinessTotals(user) {
  if (['owner', 'admin', 'co-owner', 'manager', 'super-admin', 'super_admin'].includes(roleOf(user))) return true;
  const a = user?.pageAccess && user.pageAccess.analytics;
  return a === true || !!(a && typeof a === 'object' && Object.values(a).some(Boolean));
}

// Order History switched OFF for this person by the owner → "Your sales today" is hidden too.
export function orderHistoryOff(pageAccess) {
  const v = pageAccess ? pageAccess.history : undefined;
  if (v === undefined || v === null) return false;
  if (typeof v === 'object') return !Object.values(v).some(Boolean);
  return v === false;
}

const anyOn = (v) => v === true || !!(v && typeof v === 'object' && Object.values(v).some(Boolean));

// Quick-action access, web canAccess(): owner/admin always; roles on → the role decides;
// no page access saved → the usual staff tiles; else the person's page access.
const ROLE_KEY = { dashboard: 'page.dashboard', tables: 'tables.view', kot: 'page.kot', menu: 'menu.view', history: 'page.history' };
export function canAccess(user, key) {
  if (!user) return false;
  const role = roleOf(user);
  if (OWNER_ROLES.includes(role)) return true;
  const byRole = roleCan(user, ROLE_KEY[key]);
  if (byRole !== null) return byRole;
  const pa = user.pageAccess;
  if (!pa) return ['employee', 'manager', 'cashier', 'sales'].includes(role) && ['dashboard', 'tables', 'history', 'menu'].includes(key);
  return anyOn(pa[key]);
}

// Shifts & Cash / Register shortcuts (web canOpenPage): only by page access for staff.
export function canOpenPage(user, key) {
  if (!user) return false;
  if (OWNER_ROLES.includes(roleOf(user))) return true;
  return anyOn(user.pageAccess ? user.pageAccess[key] : undefined);
}

// Open a web page in the app's in-app browser (same as More → web items).
export function openWeb(router, path, title) {
  router.push({ pathname: '/(tabs)/webview', params: { url: `${WEB_BASE_URL}/mobile${path}`, title } });
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function parseDate(d) {
  if (!d) return null;
  if (d._seconds) return new Date(d._seconds * 1000);
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

export function timeAgo(d) {
  const t = parseDate(d);
  if (!t) return '';
  const mins = Math.floor((Date.now() - t.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
