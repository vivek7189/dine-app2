// Sum a cart line's add-on / customization prices, re-validating each against the FRESH
// menu item so a modifier whose price changed after the item was added is corrected.
// Mirrors dine-frontend OrderSummary.getItemUnitPrice (customization validation block).
// Falls back to the stored price when no match is found — so it never over/under-charges
// on unknown modifiers.
export function resolveCustomizationExtras(selectedCustomizations, menuItem) {
  if (!Array.isArray(selectedCustomizations) || selectedCustomizations.length === 0) return 0;
  const menuCustomizations = menuItem?.customizations || [];
  const modifierGroups = menuItem?.modifierGroups || null;
  return selectedCustomizations.reduce((sum, c) => {
    if (menuCustomizations.length > 0) {
      const mc = menuCustomizations.find(m => m.id === c.id || m.name === c.name);
      if (mc && typeof mc.price === 'number') return sum + mc.price;
    }
    if (modifierGroups) {
      for (const group of modifierGroups) {
        const match = (group.items || []).find(gi => gi.id === c.id || gi.name === c.name);
        if (match && typeof match.price === 'number') return sum + match.price;
      }
    }
    return sum + (c?.price || 0);
  }, 0);
}
