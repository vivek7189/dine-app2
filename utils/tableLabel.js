// Screen label for a table: the optional display number before the name ("1 · BAR").
// Display only — orders, QR codes and table matching always use table.name.
export const tableLabel = (table) => {
  const name = table?.name || table?.number || '';
  const no = table?.displayNo != null ? String(table.displayNo).trim() : '';
  return no ? `${no} · ${name}` : name;
};

// Orders keep the table NAME ("BAR", "BIG TABLE-C"). Screens that only have that name (Kitchen Display,
// Orders, Order History) show the same label as the Tables page: "1 · BAR", and a second guest's bill on a
// busy table "3-C · BIG TABLE". Display only. A table without a number (or no tables loaded) → the name as is.
const tKey = (s) => String(s == null ? '' : s).trim().toLowerCase();
const tNo = (t) => (t && t.displayNo != null ? String(t.displayNo).trim() : '');
export const tableLabelMap = (tables) => {
  const list = Array.isArray(tables) ? tables : [];
  if (!list.some(t => tNo(t))) return null; // nobody uses table numbers → nothing changes
  const m = new Map();
  list.forEach(t => { if (t && t.name) m.set(tKey(t.name), t); });
  return m;
};
export const labelForTableName = (name, map) => {
  if (name == null || name === '' || !map) return name;
  const raw = String(name).trim();
  const t = map.get(tKey(raw));
  if (t && tNo(t)) return `${tNo(t)} · ${t.name}`;
  // "BIG TABLE-C": its own record when the party table still exists, else read the name (party table gone after billing)
  const m = /^(.+)-([A-Z])$/.exec(raw);
  const parentName = (t && t.partyOfTableName) || (m && m[1]);
  const letter = (t && t.partyLabel) || (m && m[2]);
  const parent = parentName ? map.get(tKey(parentName)) : null;
  if (parent && tNo(parent) && letter) return `${tNo(parent)}-${letter} · ${parent.name}`;
  return name;
};
