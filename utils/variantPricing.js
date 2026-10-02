// Variant-level multi-tier pricing resolver (shared by billing + variant modal).
// Mirrors dine-frontend/src/utils/variantPricing.js and the backend
// resolveItemPriceForRule() variant branch so app, web and server agree.

const TAKEAWAY_NAMES = ['takeaway', 'take away', 'take-away'];
const DELIVERY_NAMES = ['delivery'];
const DINEIN_NAMES = ['dine-in', 'dine in', 'dinein'];
const CHANNEL_NAMES = [...DINEIN_NAMES, ...TAKEAWAY_NAMES, ...DELIVERY_NAMES];

const isZoneRule = (rule) => !CHANNEL_NAMES.includes((rule?.name || '').toLowerCase().trim());
const findDineInRule = (rules) => (rules || []).find(r => r.isActive && DINEIN_NAMES.includes((r.name || '').toLowerCase().trim()));

// Resolve a variant's unit price for the active pricing rule:
//   per-variant tier price → (zone rule) inherit variant Dine-In price → rule default markup →
//   variant base price.
// Returns null only when `variant` is falsy; otherwise always a number (falls back to base).
export function resolveVariantTierPrice(variant, activeRuleId, rules) {
  if (!variant) return null;
  const base = typeof variant.price === 'number' ? variant.price : (parseFloat(variant.price) || 0);
  if (!activeRuleId) return base;
  const per = variant.pricingRules?.[activeRuleId];
  if (typeof per === 'number') return per;
  const rule = (rules || []).find(r => r.id === activeRuleId);
  if (rule && isZoneRule(rule)) {
    const di = findDineInRule(rules);
    if (di && typeof variant.pricingRules?.[di.id] === 'number') return variant.pricingRules[di.id];
  }
  // Rule default markup off the variant's base price (backend resolveItemPriceForRule, variant branch)
  if (rule?.defaultMarkupType === 'percentage' && rule.defaultMarkupValue) {
    return Math.round(base * (1 + rule.defaultMarkupValue / 100) * 100) / 100;
  }
  if (rule?.defaultMarkupType === 'flat' && rule.defaultMarkupValue) {
    return Math.round((base + rule.defaultMarkupValue) * 100) / 100;
  }
  return base;
}
