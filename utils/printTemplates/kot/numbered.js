// KOT Template: Numbered
// Each item gets a sequential number for tracking preparation order.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  formatDateTime, getKOTPrintCSS, wrapInDocument,
} from '../helpers';

export const id = 'numbered';
export const name = 'Numbered';
export const description = 'Sequential item numbering. Useful for tracking preparation order.';

export function render(kotData, printSettings = {}, labels = {}) {
  const L = getKOTLabels(labels);
  const k = kotData;
  const specialInstructionsHtml = buildSpecialInstructionsHtml(k, L);
  const { dateStr, timeStr } = formatDateTime();
  const removedItems = k.removedItems || [];
  const hasChanges = k.isIncremental && ((k.items || []).length > 0 || removedItems.length > 0);

  let itemNumber = 0;
  const renderNumberedRow = (item, opts = {}) => {
    itemNumber++;
    const qty = item.quantity || 1;
    const noteLabel = L.note || 'Note';
    const label = opts.isRemoved ? ' <span style="color:#666;">[CANCEL]</span>' : (opts.showDelta && item.quantityDelta > 0 ? ' <span>[+NEW]</span>' : '');
    const strikeStyle = opts.isRemoved ? 'text-decoration:line-through;color:#999;' : '';
    return `<div class="item" style="${strikeStyle}"><div class="item-main"><span class="item-qty" style="width:auto;margin-right:4px;">${itemNumber}.</span><span class="item-qty">${qty}x</span><span class="item-name">${esc(item.name)}${label}</span></div>` +
      (item.selectedVariant?.name ? `<div class="item-detail" style="margin-left:50px;">[${esc(item.selectedVariant.name)}]</div>` : '') +
      ((item.selectedCustomizations || []).map(c => `<div class="item-detail" style="margin-left:50px;">+ ${esc(c.name || c)}</div>`).join('')) +
      (item.notes ? `<div class="item-note" style="margin-left:50px;">${noteLabel}: ${esc(item.notes)}</div>` : '') +
      `</div>`;
  };

  let itemsHtml = '';
  let footerText;

  if (hasChanges) {
    if (removedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** CANCELLED ***</div>';
      removedItems.forEach(i => { itemsHtml += renderNumberedRow(i, { isRemoved: true }); });
    }
    const reducedItems = (k.items || []).filter(i => i.isUpdated && i.quantityDelta < 0);
    if (reducedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** REDUCED ***</div>';
      reducedItems.forEach(i => { itemsHtml += renderNumberedRow({ ...i, quantity: Math.abs(i.quantityDelta) }, { isRemoved: true }); });
    }
    const newAndInc = (k.items || []).filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0));
    if (newAndInc.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** NEW ITEMS ***</div>';
      newAndInc.forEach(i => { itemsHtml += renderNumberedRow(i, { showDelta: i.isUpdated }); });
    }
    const unmarked = (k.items || []).filter(i => !i.isNew && !i.isUpdated);
    unmarked.forEach(i => { itemsHtml += renderNumberedRow(i); });
    const newCount = newAndInc.length;
    const removedCount = removedItems.length + reducedItems.length;
    footerText = `Changes: +${newCount} new, ${removedCount} removed (${itemNumber} line items)`;
  } else {
    (k.items || []).forEach(i => { itemsHtml += renderNumberedRow(i); });
    const totalItems = (k.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
    footerText = `${L.totalItems}: ${totalItems} (${itemNumber} line items)`;
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
    `<div style="font-weight:bold;margin-bottom:2px;display:flex;"><span style="width:auto;margin-right:4px;">#</span><span style="width:30px;">${L.qty}</span><span>${L.item}</span></div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, css, bodyHtml);
}
