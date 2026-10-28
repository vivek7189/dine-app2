// Receipt images (the receipt logo) kept on the device, so an image print never waits on the network.
//
// Image receipts are drawn in a hidden WebView and snapshotted (components/ImagePrintHost.js) within a
// few seconds. A remote logo had to download inside that window on every print — a big logo on shop
// Wi-Fi (Dessertz 1600², Whisky Business 2084²) ran past it and the bill fell back to plain text with
// no logo. Here each remote <img> is fetched once, stored as a data: URI (memory + AsyncStorage) and
// swapped into the receipt HTML before the snapshot. Any failure leaves the HTML exactly as it was.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dine_receipt_img_v1:';
const MAX_DATA_URI = 700 * 1024; // don't keep anything bigger (a receipt logo is far smaller)
const _mem = new Map();          // src attribute value → data: URI
const _inflight = new Map();     // src → Promise<data URI | null>

const fetchUrl = (src) => {
  let u = String(src).replace(/&amp;/g, '&');
  try { u = encodeURI(decodeURI(u)); } catch (_) { u = encodeURI(u); } // spaces, ( ) …
  return u;
};

const toDataUri = (blob) => new Promise((resolve, reject) => {
  try {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => reject(r.error || new Error('read failed'));
    r.readAsDataURL(blob);
  } catch (e) { reject(e); }
});

// Fetch + store one image. Resolves the data URI, or null (never rejects).
const load = (src) => {
  if (_mem.has(src)) return Promise.resolve(_mem.get(src));
  if (_inflight.has(src)) return _inflight.get(src);
  const p = (async () => {
    try {
      const stored = await AsyncStorage.getItem(KEY + src);
      if (stored && stored.startsWith('data:image/')) { _mem.set(src, stored); return stored; }
    } catch (_) { /* storage unavailable → fetch */ }
    try {
      const res = await fetch(fetchUrl(src));
      if (!res.ok) return null;
      const uri = await toDataUri(await res.blob());
      if (!uri || !uri.startsWith('data:image/') || uri.length > MAX_DATA_URI) return null;
      _mem.set(src, uri);
      try { AsyncStorage.setItem(KEY + src, uri).catch(() => {}); } catch (_) { /* memory copy still works */ }
      return uri;
    } catch (_) {
      return null;
    }
  })().finally(() => _inflight.delete(src));
  _inflight.set(src, p);
  return p;
};

// Warm the cache (e.g. when print settings load) — fire and forget.
export const prefetchReceiptImage = (url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) load(url).catch(() => {});
};

const IMG_SRC_RE = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(https?:\/\/[^"']+)\2/gi;

// Swap remote <img src> for stored copies. Waits at most `waitMs` for images not stored yet;
// anything not ready stays as it was (the snapshot then loads it itself, as before).
export const inlineReceiptImages = async (html, { waitMs = 2500 } = {}) => {
  if (typeof html !== 'string' || !/<img\b/i.test(html)) return html;
  const srcs = [...new Set([...html.matchAll(IMG_SRC_RE)].map((m) => m[3]))];
  if (!srcs.length) return html;
  const got = await Promise.race([
    Promise.all(srcs.map((s) => load(s))),
    new Promise((r) => setTimeout(() => r(null), waitMs)),
  ]);
  const map = new Map();
  srcs.forEach((s, i) => { const u = (got && got[i]) || _mem.get(s); if (u) map.set(s, u); });
  if (!map.size) return html;
  return html.replace(IMG_SRC_RE, (all, pre, q, src) => (map.has(src) ? `${pre}${q}${map.get(src)}${q}` : all));
};
