// KOT Template: Classic
// The default KOT layout - clean and functional.
// Produces identical output to the original generateKOTHTML.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  renderKOTItemRow, buildKOTItemsSections, formatDateTime,
  getKOTPrintCSS, wrapInDocument,
} from '../helpers';

export const id = 'classic';
export const name = 'Classic';
export const description = 'Clean, functional layout. The default KOT format.';

export function render(kotData, printSettings = {}, labels = {}) {
  const L = getKOTLabels(labels);
  const k = kotData;
  const specialInstructionsHtml = buildSpecialInstructionsHtml(k, L);
  const { dateStr, timeStr } = formatDateTime();

  const renderRow = (item, opts = {}) => renderKOTItemRow(item, opts, L);
  const { html: itemsHtml, footerText, hasChanges } = buildKOTItemsSections(k, renderRow, L);
  const title = hasChanges ? L.kotUpdate : L.kitchenOrder;

  const css = getKOTPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);

  // Build table/room inline text
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
    `<div style="font-weight:bold;margin-bottom:2px;display:flex;"><span style="width:30px;">${L.qty}</span><span>${L.item}</span></div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, css, bodyHtml);
}
