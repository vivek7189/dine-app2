// KOT Template: Numbered
// Each item gets a sequential number for tracking preparation order.

import {
  esc, getKOTLabels, buildSpecialInstructionsHtml,
  formatDateTime, getKOTPrintCSS, wrapInDocument,
  KOT_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
} from '../helpers';

export const id = 'numbered';
export const name = 'Numbered';
export const description = 'Sequential item numbering. Useful for tracking preparation order.';

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

  let itemNumber = 0;
  const renderNumberedRow = (item, opts = {}) => {
    itemNumber++;
    const qty = item.quantity || 1;
    const noteLabel = L.note || 'Note';
    const label = opts.isRemoved ? ' <span style="color:#666;">[CANCEL]</span>' : (opts.showDelta && item.quantityDelta > 0 ? ' <span>[+NEW]</span>' : '');
    const strikeStyle = opts.isRemoved ? 'text-decoration:line-through;color:#999;' : '';
    const price = item.price || (item.total ? item.total / (item.quantity || 1) : 0);
    const itemTotal = price * qty;
    const priceHtml = (showPrice && itemTotal > 0 && !opts.isRemoved) ? `<span style="float:right;font-weight:bold;">${cs}${itemTotal.toFixed(2)}</span>` : '';
    return `<div class="item" style="${strikeStyle}"><div class="item-main"><span class="item-qty" style="width:auto;margin-right:4px;">${itemNumber}.</span><span class="item-qty">${qty}x</span><span class="item-name">${esc(item.name)}${label}</span>${priceHtml}</div>` +
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
    footerText = `${dualLabel(L.totalItems, AR.totalItems, showAr)}: ${totalItems} (${itemNumber} line items)`;
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
    `<div style="font-weight:bold;margin-bottom:2px;display:flex;"><span style="width:auto;margin-right:4px;">#</span><span style="width:30px;">${dualLabel(L.qty, AR.qty, showAr)}</span><span style="flex:1;">${dualLabel(L.item, AR.item, showAr)}</span>${showPrice ? '<span>Price</span>' : ''}</div>` +
    itemsHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, finalCss, bodyHtml);
}
