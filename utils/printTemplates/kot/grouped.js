// KOT Template: Grouped
// Items grouped by category with bold category headers.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  renderKOTItemRow, formatDateTime,
  getKOTPrintCSS, wrapInDocument,
} from '../helpers';

export const id = 'grouped';
export const name = 'Grouped';
export const description = 'Items grouped by category with headers. Visual separation between groups.';

function groupByCategory(items) {
  const groups = {};
  (items || []).forEach(item => {
    const cat = item.categoryName || item.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  return groups;
}

function renderCategoryHeader(categoryName) {
  return `<div style="font-weight:bold;text-transform:uppercase;margin:4px 0 1px;padding:1px 0;border-bottom:1px solid #000;font-size:inherit;">${esc(categoryName)}</div>`;
}

export function render(kotData, printSettings = {}, labels = {}) {
  const L = getKOTLabels(labels);
  const k = kotData;
  const specialInstructionsHtml = buildSpecialInstructionsHtml(k, L);
  const { dateStr, timeStr } = formatDateTime();
  const removedItems = k.removedItems || [];
  const hasChanges = k.isIncremental && ((k.items || []).length > 0 || removedItems.length > 0);

  const renderRow = (item, opts = {}) => renderKOTItemRow(item, opts, L);

  let itemsHtml = '';
  let footerText;

  if (hasChanges) {
    // Cancelled items (grouped)
    if (removedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** CANCELLED ***</div>';
      const groups = groupByCategory(removedItems);
      Object.entries(groups).forEach(([cat, items]) => {
        itemsHtml += renderCategoryHeader(cat);
        items.forEach(i => { itemsHtml += renderRow(i, { isRemoved: true }); });
      });
    }
    // Reduced items (grouped)
    const reducedItems = (k.items || []).filter(i => i.isUpdated && i.quantityDelta < 0);
    if (reducedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** REDUCED ***</div>';
      const groups = groupByCategory(reducedItems);
      Object.entries(groups).forEach(([cat, items]) => {
        itemsHtml += renderCategoryHeader(cat);
        items.forEach(i => { itemsHtml += renderRow({ ...i, quantity: Math.abs(i.quantityDelta) }, { isRemoved: true }); });
      });
    }
    // New items (grouped)
    const newAndInc = (k.items || []).filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0));
    if (newAndInc.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** NEW ITEMS ***</div>';
      const groups = groupByCategory(newAndInc);
      Object.entries(groups).forEach(([cat, items]) => {
        itemsHtml += renderCategoryHeader(cat);
        items.forEach(i => { itemsHtml += renderRow(i, { showDelta: i.isUpdated }); });
      });
    }
    // Unmarked items (grouped)
    const unmarked = (k.items || []).filter(i => !i.isNew && !i.isUpdated);
    if (unmarked.length > 0) {
      const groups = groupByCategory(unmarked);
      Object.entries(groups).forEach(([cat, items]) => {
        itemsHtml += renderCategoryHeader(cat);
        items.forEach(i => { itemsHtml += renderRow(i); });
      });
    }
    const newCount = newAndInc.length;
    const removedCount = removedItems.length + reducedItems.length;
    footerText = `Changes: +${newCount} new, ${removedCount} removed`;
  } else {
    // Group all items by category
    const groups = groupByCategory(k.items);
    Object.entries(groups).forEach(([cat, items]) => {
      itemsHtml += renderCategoryHeader(cat);
      items.forEach(i => { itemsHtml += renderRow(i); });
    });
    const totalItems = (k.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
    footerText = `${L.totalItems}: ${totalItems}`;
  }

  const title = hasChanges ? L.kotUpdate : L.kitchenOrder;
  const css = getKOTPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);

  const tableStr = k.roomNumber
    ? `<span><strong>${L.room}:</strong> ${k.roomNumber}</span>`
    : (k.tableNumber ? `<span><strong>${L.table}:</strong> ${k.tableNumber}${k.floorName ? ` · ${k.floorName}` : ''}</span>` : '');

  const bodyHtml =
    `<div class="kot-header"><div class="restaurant-name">${esc(k.restaurantName || 'Restaurant')}</div><div class="kot-title">--- ${title} ---</div></div>` +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-info">` +
      `<div class="kot-info-row"><span><strong>${L.orderHash}:</strong> ${k.dailyOrderId || k.orderId}</span>${tableStr}</div>` +
      `<div class="kot-info-row"><span><strong>${L.date}:</strong> ${dateStr}</span><span><strong>${L.time}:</strong> ${timeStr}</span></div>` +
      (k.orderType || k.waiterName ? `<div class="kot-info-row">${k.orderType ? `<span><strong>${L.type}:</strong> ${k.orderType}</span>` : '<span></span>'}${k.waiterName ? `<span><strong>${L.waiter}:</strong> ${esc(k.waiterName)}</span>` : ''}</div>` : '') +
      (k.customerName ? `<div><strong>${L.customer}:</strong> ${esc(k.customerName)}</div>` : '') +
    `</div>` +
    `<div class="divider">--------------------------------</div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, css, bodyHtml);
}
