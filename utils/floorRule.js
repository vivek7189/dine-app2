// The active area price rule for a floor: the EXACT floor name first, else a mapping the floor name
// contains (older partial mappings). Exact first so an "AC dining" area never takes a "Non-AC dining"
// floor. The same rule as the server (floorPricingRule) and the app.
export function floorRuleFor(rules, floorName, { activeOnly = false } = {}) {
  const fl = String(floorName || '').toLowerCase().trim();
  if (!fl) return null;
  const list = (Array.isArray(rules) ? rules : []).filter(r => r && (!activeOnly || r.isActive));
  const n = (m) => String(m || '').toLowerCase().trim();
  return list.find(r => (r.tableMappings || []).some(m => n(m) && n(m) === fl))
    || list.find(r => (r.tableMappings || []).some(m => n(m) && fl.includes(n(m))))
    || null;
}
