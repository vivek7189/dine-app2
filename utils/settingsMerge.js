// Settings saves that work on BOTH backends:
//  • new backend — PUT merges a partial body into the saved settings (deep, key by key);
//  • old backend — PUT REPLACES the whole settings object with the body.
// So a screen fetches a FRESH copy right before saving, merges only the keys it changed onto it
// and sends the full result: the new backend sees no difference, the old one keeps everything
// this screen doesn't manage (and what other devices changed meanwhile).

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);

// Same rule as the backend's deepMergeSettings: plain objects merge key by key, everything else
// (arrays, null, primitives) replaces.
export function deepMergeSettings(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? deepMergeSettings(base[k], v) : v;
  }
  return out;
}

// Keys of `next` whose value differs from `prev` (compared by JSON value).
export function changedKeys(prev = {}, next = {}) {
  const out = {};
  for (const k of Object.keys(next || {})) {
    if (JSON.stringify((prev || {})[k]) !== JSON.stringify(next[k])) out[k] = next[k];
  }
  return out;
}

export { isPlainObject };
