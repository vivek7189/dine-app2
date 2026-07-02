// KOT Template: Classic
// The default KOT layout - clean and functional.
// Produces identical output to the original generateKOTHTML.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  renderKOTItemRow, buildKOTItemsSections, formatDateTime,
  getKOTPrintCSS, wrapInDocument,
  KOT_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
} from '../helpers';

export const id = 'classic';
export const name = 'Classic';
export const description = 'Clean, functional layout. The default KOT format.';

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

  const renderRow = (item, opts = {}) => renderKOTItemRow(item, { ...opts, showPrice, currencySymbol: cs }, L);
  const { html: itemsHtml, footerText, hasChanges } = buildKOTItemsSections(k, renderRow, L);
  const titleEn = hasChanges ? L.kotUpdate : L.kitchenOrder;
  const title = showAr ? dualTitle(titleEn, hasChanges ? AR.kotUpdate : AR.kitchenOrder, showAr) : titleEn;

  const css = getKOTPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);
  const finalCss = showAr ? css + getBillDualCSS() : css;

  // Build table/room inline text
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
    `</div>` +
    `<div class="divider">--------------------------------</div>` +
    `<div style="font-weight:bold;margin-bottom:2px;display:flex;"><span style="width:30px;">${dualLabel(L.qty, AR.qty, showAr)}</span><span style="flex:1;">${dualLabel(L.item, AR.item, showAr)}</span>${showPrice ? '<span>Price</span>' : ''}</div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, finalCss, bodyHtml);
}
