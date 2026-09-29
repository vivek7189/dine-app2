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

// JS for injectedJavaScriptBeforeContentLoaded: on a shared phone, when a DIFFERENT user is now
// logged into the app, wipe the web page's stored session (selected restaurant, cached user, …)
// before the new token is written — otherwise the next user saw the previous user's web state.
// Must run AFTER tokenGuardJS() (uses window.__DINEOPEN_TRUSTED__).
export function sessionResetJS(userId) {
  const uid = JSON.stringify(String(userId || ''));
  return `if (window.__DINEOPEN_TRUSTED__) { try {
    var __uid = ${uid};
    if (__uid && localStorage.getItem('__dineAppUid') !== __uid) {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('__dineAppUid', __uid);
    }
  } catch (e) {} }`;
}

// JS for injectedJavaScriptBeforeContentLoaded: make browser downloads work inside the app. Clicks on
// <a download> / blob: / data: links, and window.open(blob:/data:), are converted to a
// DINE_DOWNLOAD message (base64) that services/webDownload.js saves and shares. Trusted pages only.
export function downloadBridgeJS() {
  return `if (window.__DINEOPEN_TRUSTED__ && window.ReactNativeWebView && !window.__dineDlBridge) { window.__dineDlBridge = true;
  (function(){
    function send(name, mime, b64){ window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'DINE_DOWNLOAD', filename: name, mime: mime, base64: b64 })); }
    function fromBlob(blob, name){ var r = new FileReader(); r.onload = function(){ var s = String(r.result || ''); send(name, blob.type || '', s.slice(s.indexOf(',') + 1)); }; r.readAsDataURL(blob); }
    function handle(href, name){
      try {
        if (/^data:/i.test(href)) { var i = href.indexOf(','); var mime = href.slice(5, href.indexOf(';')); send(name, mime, href.slice(i + 1)); return true; }
        if (/^blob:/i.test(href)) { fetch(href).then(function(r){ return r.blob(); }).then(function(b){ fromBlob(b, name); }); return true; }
      } catch (e) {}
      return false;
    }
    document.addEventListener('click', function(ev){
      var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (a.hasAttribute('download') || /^(blob|data):/i.test(href)) {
        if (handle(a.href || href, a.getAttribute('download') || 'download')) { ev.preventDefault(); ev.stopPropagation(); }
      }
    }, true);
    var _click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){
      var href = this.href || this.getAttribute('href') || '';
      if ((this.hasAttribute('download') || /^(blob|data):/i.test(href)) && handle(href, this.getAttribute('download') || 'download')) return;
      return _click.apply(this, arguments);
    };
    var _open = window.open;
    window.open = function(u){ if (typeof u === 'string' && handle(u, 'download')) return null; return _open ? _open.apply(window, arguments) : null; };
  })(); }`;
}
