// Add-on (modifier) groups can be limited to some sizes: group.forSizes = ['Large'] shows the group
// only after the 'Large' variant is chosen. No forSizes (or empty) = every size — today's behaviour.
// Same rule as the server (dine-backend utils/modifierSizes.js) and the web copy.

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

// The group's sizes that the item still has. When the item's sizes are known, a size that was
// renamed / removed elsewhere (Excel upload, central menu, AI edit) is ignored, so a group can
// never end up hidden for good — no valid size left = shown for every size.
function liveSizes(group, variants) {
  const sizes = Array.isArray(group && group.forSizes) ? group.forSizes.map(norm).filter(Boolean) : [];
  if (!sizes.length || !Array.isArray(variants)) return sizes;
  const names = variants.map((v) => norm(v && v.name)).filter(Boolean);
  return sizes.filter((s) => names.includes(s));
}

export function groupShowsForVariant(group, variant, variants) {
  const sizes = liveSizes(group, variants);
  if (!sizes.length) return true;
  const v = norm(variant && variant.name);
  return !!v && sizes.includes(v);
}

export function visibleModifierGroups(groups, variant, variants) {
  return (Array.isArray(groups) ? groups : []).filter((g) => g && groupShowsForVariant(g, variant, variants));
}

// Does any group on this item depend on the size?
export function hasSizeLinkedGroups(groups, variants) {
  return (Array.isArray(groups) ? groups : []).some((g) => liveSizes(g, variants).length > 0);
}
