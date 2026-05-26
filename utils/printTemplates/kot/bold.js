// KOT Template: Bold
// Based on reference photo: extra large bold item names, prices shown,
// variant below name, "New Order" / "KOT Update" marker at bottom.

import {
  esc, getKOTLabels, formatDateTime,
  getPrintFontSizes, getPrintFontFamily, wrapInDocument,
} from '../helpers';

export const id = 'bold';
export const name = 'Bold';
export const description = 'Extra large item names with prices. Easy to read from a distance.';

function getBoldKOTCSS(scaleOrPreset, fontId) {
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') {
    const presetMap = { small: 80, medium: 100, large: 120, xlarge: 140 };
    scale = presetMap[scaleOrPreset] || 100;
  }
  const f = getPrintFontSizes(scale);
  const ff = getPrintFontFamily(fontId);
  const s = (base) => Math.max(8, Math.round(base * scale / 100));
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:2mm 2mm;font-size:${f.body};line-height:1.4;width:72mm;max-width:72mm;overflow:hidden;} .header{text-align:center;margin-bottom:4px;} .restaurant-name{font-size:${s(22)}px;font-weight:bold;text-transform:uppercase;} .phone{font-size:${f.info};} .order-type{font-size:${s(18)}px;font-weight:bold;text-transform:uppercase;margin:4px 0;} .divider{text-align:center;margin:4px 0;letter-spacing:1px;} .info{font-size:${f.info};margin:4px 0;} .info div{margin:2px 0;} .item{margin:8px 0;} .item-name{font-size:${s(24)}px;font-weight:900;text-transform:uppercase;word-wrap:break-word;overflow-wrap:break-word;} .item-qty{font-size:${s(22)}px;font-weight:900;} .item-variant{font-size:${s(18)}px;font-weight:bold;text-transform:uppercase;margin-top:2px;} .item-detail{font-size:${f.info};color:#333;margin-left:4px;} .item-note{font-size:${f.info};font-style:italic;color:#555;margin-left:4px;} .item-price{font-size:${s(18)}px;font-weight:bold;text-align:right;} .footer{text-align:center;font-weight:bold;font-size:${s(16)}px;margin:6px 0;} .total{text-align:center;font-size:${f.info};margin:2px 0;}`;
}

export function render(kotData, printSettings = {}, labels = {}) {
  const L = getKOTLabels(labels);
  const k = kotData;
  const { dateStr, timeStr } = formatDateTime();
  const removedItems = k.removedItems || [];
  const hasChanges = k.isIncremental && ((k.items || []).length > 0 || removedItems.length > 0);
  const cs = k.currencySymbol || printSettings.currencySymbol || '';

  const renderBoldItem = (item, opts = {}) => {
    const qty = item.quantity || 1;
    const variant = item.selectedVariant?.name || item.variant || '';
    const custs = item.selectedCustomizations || item.customizations || [];
    const strikeStyle = opts.isRemoved ? 'text-decoration:line-through;color:#999;' : '';
    const cancelLabel = opts.isRemoved ? ' [CANCEL]' : '';
    const newLabel = opts.showDelta && item.quantityDelta > 0 ? ' [+NEW]' : '';
    const price = item.price || (item.total ? item.total / (item.quantity || 1) : 0);
    const itemTotal = price * qty;

    return `<div class="item" style="${strikeStyle}">` +
      `<div style="display:flex;justify-content:space-between;align-items:flex-start;">` +
        `<div><span class="item-qty">${qty} x</span> <span class="item-name">${esc(item.name)}${cancelLabel}${newLabel}</span></div>` +
        (itemTotal > 0 && cs ? `<div class="item-price">${cs}${itemTotal.toFixed(2)}</div>` : '') +
      `</div>` +
      (variant ? `<div class="item-variant">${esc(variant)}</div>` : '') +
      (custs.length > 0 ? custs.map(c => `<div class="item-detail">+ ${esc(c.name || c)}</div>`).join('') : '') +
      (item.notes ? `<div class="item-note">Note: ${esc(item.notes)}</div>` : '') +
      `</div>`;
  };

  // Build items section
  let itemsHtml = '';
  let totalItems = 0;

  if (hasChanges) {
    if (removedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;font-size:14px;">*** CANCELLED ***</div>';
      removedItems.forEach(i => { itemsHtml += renderBoldItem(i, { isRemoved: true }); });
    }
    const reducedItems = (k.items || []).filter(i => i.isUpdated && i.quantityDelta < 0);
    if (reducedItems.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;font-size:14px;">*** REDUCED ***</div>';
      reducedItems.forEach(i => { itemsHtml += renderBoldItem({ ...i, quantity: Math.abs(i.quantityDelta) }, { isRemoved: true }); });
    }
    const newAndInc = (k.items || []).filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0));
    if (newAndInc.length > 0) {
      itemsHtml += '<div style="text-align:center;font-weight:bold;margin:3px 0 1px;font-size:14px;">*** NEW ITEMS ***</div>';
      newAndInc.forEach(i => { itemsHtml += renderBoldItem(i, { showDelta: i.isUpdated }); });
    }
    const unmarked = (k.items || []).filter(i => !i.isNew && !i.isUpdated);
    unmarked.forEach(i => { itemsHtml += renderBoldItem(i); });
    totalItems = (k.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
  } else {
    (k.items || []).forEach(i => { itemsHtml += renderBoldItem(i); });
    totalItems = (k.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
  }

  const css = getBoldKOTCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);

  const bodyHtml =
    `<div class="header">` +
      `<div class="restaurant-name">${esc(k.restaurantName || 'Restaurant')}</div>` +
      (k.restaurantPhone ? `<div class="phone">Tel: ${k.restaurantPhone}</div>` : '') +
      (k.orderType ? `<div class="order-type">${esc(k.orderType)}</div>` : '') +
    `</div>` +
    `<div class="divider">................................</div>` +
    `<div class="info">` +
      `<div>Table/Ref.No: ${k.tableNumber || k.roomNumber || k.dailyOrderId || k.orderId}</div>` +
      `<div style="display:flex;justify-content:space-between;"><span>KOT No: <strong>${k.dailyOrderId || k.orderId}</strong></span><span>${L.totalItems}: ${totalItems}</span></div>` +
    `</div>` +
    `<div class="divider">................................</div>` +
    `<div class="info">` +
      (k.billNo ? `<div>Bill No: ${k.billNo}</div>` : '') +
      (k.waiterName ? `<div>Order by: ${esc(k.waiterName)}</div>` : '') +
      `<div>Date: ${dateStr}</div>` +
      `<div>Time: ${timeStr}</div>` +
    `</div>` +
    `<div class="divider">................................</div>` +
    itemsHtml +
    `<div class="divider">................................</div>` +
    `<div class="footer">** ${hasChanges ? 'KOT Update' : 'New Order'} **</div>` +
    (k.specialInstructions ? `<div class="divider">................................</div><div style="text-align:center;font-size:12px;padding:4px;border:1px dashed #000;"><strong>*** ${L.specialInstructions} ***</strong><div style="text-align:left;">${esc(k.specialInstructions)}</div></div>` : '') +
    `<div class="divider">================================</div>`;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, css, bodyHtml);
}
