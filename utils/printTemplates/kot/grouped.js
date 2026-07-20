// KOT Template: Grouped
// Items grouped by category with bold category headers.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  renderKOTItemRow, formatDateTime,
  getKOTPrintCSS, wrapInDocument,
  KOT_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
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
  const AR = KOT_LABELS_AR;
  const lang = printSettings.printLanguage || 'en';
  const showAr = lang === 'dual' || lang === 'ar';
  const kl = printSettings?.kotLayout || {};
  const k = kotData;
  const showPrice = !!printSettings.showPriceOnKot;
  const cs = k.currencySymbol || printSettings.currencySymbol || '';
  const specialInstructionsHtml = buildSpecialInstructionsHtml(k, L);
  const { dateStr, timeStr } = formatDateTime();
  const removedItems = k.removedItems || [];
  const hasChanges = k.isIncremental && ((k.items || []).length > 0 || removedItems.length > 0);

  const renderRow = (item, opts = {}) => renderKOTItemRow(item, { ...opts, showPrice, currencySymbol: cs }, L);

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
    footerText = `${dualLabel(L.totalItems, AR.totalItems, showAr)}: ${totalItems}`;
  }

  const titleEn = hasChanges ? L.kotUpdate : L.kitchenOrder;
  const title = showAr ? dualTitle(titleEn, hasChanges ? AR.kotUpdate : AR.kitchenOrder, showAr) : titleEn;
  const css = getKOTPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);
  const finalCss = showAr ? css + getBillDualCSS() : css;

  const tableStr = k.roomNumber
    ? `<span><strong>${dualLabel(L.room, AR.room, showAr)}:</strong> ${k.roomNumber}</span>`
    : (k.tableNumber ? `<span><strong>${dualLabel(L.table, AR.table, showAr)}:</strong> ${k.tableNumber}${k.floorName ? ` - ${k.floorName}` : ''}</span>` : '');

  const bodyHtml =
    (kl.showRestaurantName !== false ? `<div class="kot-header"><div class="restaurant-name">${esc(k.restaurantName || 'Restaurant')}</div>${kl.showKotTitle !== false ? `<div class="kot-title">--- ${title} ---</div>` : ''}</div>` : (kl.showKotTitle !== false ? `<div class="kot-header"><div class="kot-title">--- ${title} ---</div></div>` : '')) +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-info">` +
      (kl.showOrderNumber !== false || kl.showTable !== false ? `<div class="kot-info-row">${kl.showOrderNumber !== false ? `<span><strong>${dualLabel(L.orderHash, AR.orderHash, showAr)}:</strong> ${k.dailyOrderId || k.orderId}</span>` : ''}${kl.showTable !== false ? tableStr : ''}</div>` : '') +
      `<div class="kot-info-row">${kl.showDate !== false ? `<span><strong>${dualLabel(L.date, AR.date, showAr)}:</strong> ${dateStr}</span>` : ''}<span><strong>${dualLabel(L.time, AR.time, showAr)}:</strong> ${timeStr}</span></div>` +
      ((kl.showOrderType !== false && k.orderType) || (kl.showWaiter !== false && k.waiterName) ? `<div class="kot-info-row">${kl.showOrderType !== false && k.orderType ? `<span><strong>${dualLabel(L.type, AR.type, showAr)}:</strong> ${k.orderType}</span>` : '<span></span>'}${kl.showWaiter !== false && k.waiterName ? `<span><strong>${dualLabel(L.waiter, AR.waiter, showAr)}:</strong> ${esc(k.waiterName)}</span>` : ''}</div>` : '') +
      (kl.showCustomer !== false && k.customerName ? `<div><strong>${dualLabel(L.customer, AR.customer, showAr)}:</strong> ${esc(k.customerName)}</div>` : '') +
      (kl.showCovers !== false && k.covers && k.covers > 1 ? `<div><strong>${showAr ? dualLabel('Covers', 'أغطية', showAr) : 'Covers'}:</strong> ${k.covers}</div>` : '') +
    `</div>` +
    `<div class="divider">--------------------------------</div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, finalCss, bodyHtml);
}
