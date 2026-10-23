// Order types (Admin → Order Types) and price rules (Admin → Pricing Rules) are linked by NAME:
// a rule named like a custom order type ("GLOVO", "Uber Eats") prices that order type. This is the
// same match the POS, QR page and server already use (lowercase, spaces / - / _ ignored), so every
// app version — old desktop builds included — understands a rule created here. Display + setup
// only: nothing in here changes how a price is worked out.

export const normOT = (v) => String(v || '').toLowerCase().replace(/[\s_-]+/g, '');

const BUILT_IN = ['dinein', 'takeaway', 'delivery'];

// The restaurant's own (non built-in) order types, e.g. GLOVO / BOLT / UBER.
export function customOrderTypes(posSettings) {
  const list = Array.isArray(posSettings?.orderTypes) ? posSettings.orderTypes : [];
  return list.filter((t) => t && t.id && !t.builtIn && !BUILT_IN.includes(normOT(t.id)));
}

// The price rule that belongs to this order type (by id or label), if any.
export function ruleForOrderType(rules, type) {
  const keys = [normOT(type?.id), normOT(type?.label)].filter(Boolean);
  return (Array.isArray(rules) ? rules : []).find((r) => keys.includes(normOT(r?.name))) || null;
}

// Is this rule an order-type price (not a dine-in area)?
export function isOrderTypeRule(rule, posSettings) {
  const n = normOT(rule?.name);
  if (!n) return false;
  return customOrderTypes(posSettings).some((t) => normOT(t.id) === n || normOT(t.label) === n);
}

// A new rule for an order type — the same shape the menu editor creates for Dine-In / Takeaway.
export function newOrderTypeRule(type, rules) {
  const base = `rule_ot_${normOT(type.id) || 'type'}`;
  let id = base;
  let n = 2;
  while ((rules || []).some((r) => r.id === id)) id = `${base}_${n++}`;
  const order = Math.max(0, ...(rules || []).map((r) => Number(r.order) || 0)) + 1;
  return { id, name: type.label || type.id, type: 'fixed', defaultMarkupType: 'none', defaultMarkupValue: 0, tableMappings: [], isActive: true, order };
}
