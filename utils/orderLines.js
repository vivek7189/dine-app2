// Convert saved order lines (as returned by the API) into cart lines, keeping everything the next
// update needs: variant, add-ons, seat, notes, tax flag, edited price. The saved `price` is
// base + add-ons; cart totals add the add-ons back on top of `basePrice`, so the base is carried
// separately (cartId marks a customised line so the cart uses basePrice — see MenuNative
// getEffectiveItemPrice).
export function orderLinesToCart(items) {
  return (Array.isArray(items) ? items : []).map((item, idx) => {
    const custs = Array.isArray(item.selectedCustomizations) ? item.selectedCustomizations : [];
    const custSum = custs.reduce((t, c) => t + (Number(c?.price) || 0), 0);
    const unit = Number(item.price) || 0;
    const base = item.selectedVariant && item.selectedVariant.price != null
      ? Number(item.selectedVariant.price) || 0
      : Math.max(0, Math.round((unit - custSum) * 100) / 100);
    const edited = item.priceEdited === true;
    return {
      id: item.menuItemId || item.id,
      menuItemId: item.menuItemId || item.id,
      ...(custs.length ? { cartId: `existing_${idx}_${item.menuItemId || item.id}` } : {}),
      name: item.name,
      // price-edited line: the edited base (add-ons are added back on top, like a local edit)
      price: edited ? Math.max(0, Math.round((unit - custSum) * 100) / 100) : unit,
      basePrice: base,
      // no originalPrice: the saved price already has the zone/tier price in it — re-pricing must
      // start from the MENU base (else a +10% markup was applied twice: 110 → 121)
      fromOrder: true,
      quantity: item.quantity || 1,
      description: item.description,
      notes: item.notes || '',
      category: item.category || null,
      categoryId: item.categoryId || null,
      selectedVariant: item.selectedVariant || null,
      selectedCustomizations: custs,
      ...(item.seat != null && item.seat !== '' ? { seat: item.seat } : {}),
      ...(item.taxInclusive != null ? { taxInclusive: item.taxInclusive } : {}),
      ...(item.priceEdited === true ? { priceEdited: true } : {}),
      ...(item.isCustomItem ? { isCustomItem: true } : {}),
    };
  });
}
