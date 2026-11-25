// Screen label for a table: the optional display number before the name ("1 · BAR").
// Display only — orders, QR codes and table matching always use table.name.
export const tableLabel = (table) => {
  const name = table?.name || table?.number || '';
  const no = table?.displayNo != null ? String(table.displayNo).trim() : '';
  return no ? `${no} · ${name}` : name;
};
