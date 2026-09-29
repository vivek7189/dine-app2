// Which web pages may receive the user's login token inside an in-app WebView.
// Only DineOpen's own site (WEB_BASE_URL's host and *.dineopen.com) over https. Anything else —
// e.g. a crafted `dineopen://webview?url=https://evil.tld` deep link, or an external link tapped
// inside one of our pages — must never get the token (it is a 30-day login).
import { WEB_BASE_URL } from '../services/api';

const baseHost = (() => {
  try { return new URL(WEB_BASE_URL).hostname.toLowerCase(); } catch (_) { return 'www.dineopen.com'; }
})();

export function isTrustedWebUrl(raw) {
  if (!raw || typeof raw !== 'string') return false;
  let u;
  try { u = new URL(raw); } catch (_) { return false; }
  const host = u.hostname.toLowerCase();
  if (host === baseHost) return u.protocol === 'https:' || baseHost === 'localhost';
  if (u.protocol !== 'https:') return false;
  return host === 'dineopen.com' || host.endsWith('.dineopen.com');
}

// Non-http(s) schemes a page may legitimately hand off to the OS (dial, mail, UPI apps, maps…).
export function isExternalScheme(raw) {
  return /^(tel|mailto|sms|upi|whatsapp|geo|maps|intent|market):/i.test(String(raw || ''));
}

// JS snippet for injectedJavaScriptBeforeContentLoaded: sets window.__DINEOPEN_TRUSTED__ only on
// DineOpen pages. That script runs on every page the WebView navigates to (payment checkouts,
// external links…), so every token/user write it does must be guarded by this flag.
export function tokenGuardJS() {
  const hosts = JSON.stringify([baseHost, 'dineopen.com']);
  return `window.__DINEOPEN_TRUSTED__ = (function(){ try {
    var h = (location.hostname || '').toLowerCase();
    var ok = ${hosts}.indexOf(h) !== -1 || /\\.dineopen\\.com$/.test(h);
    return ok && (location.protocol === 'https:' || h === 'localhost');
  } catch (e) { return false; } })();`;
}
