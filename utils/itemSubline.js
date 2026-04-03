/**
 * Build a business-type subtitle string for an order/cart item.
 * Bar: "Whiskey · 42% ABV · 750ml · Peg"
 * Bakery: "250g · per piece"
 * Ice cream: "Scoop · 3 scoops"
 */
export const getItemSubline = (item) => {
  const parts = [];
  if (item.spiritCategory) parts.push(item.spiritCategory);
  if (item.abv) parts.push(`${item.abv}% ABV`);
  if (item.bottleSize) parts.push(item.bottleSize);
  if (item.servingUnit && item.servingUnit !== item.bottleSize) parts.push(item.servingUnit);
  if (item.weight) parts.push(item.weight);
  if (item.unit) parts.push(`per ${item.unit}`);
  if (item.servingSize) parts.push(item.servingSize);
  if (item.scoopOptions) parts.push(`${item.scoopOptions} scoop${item.scoopOptions > 1 ? 's' : ''}`);
  return parts.join(' · ');
};

/**
 * Plain text version for receipts/KOT (same logic, returns string or empty)
 */
export const getItemSublineText = (item) => {
  return getItemSubline(item);
};
