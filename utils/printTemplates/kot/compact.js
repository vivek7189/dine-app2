// KOT Template: Compact
// Minimal spacing, smaller fonts, more items per page. Good for high-volume kitchens.

import {
  esc, getKOTLabels, buildTableOrRoomHtml, buildSpecialInstructionsHtml,
  buildKOTItemsSections, formatDateTime,
  getPrintFontSizes, getPrintFontFamily, wrapInDocument,
} from '../helpers';

export const id = 'compact';
export const name = 'Compact';
export const description = 'Minimal spacing, smaller fonts. Saves paper for high-volume kitchens.';

function getCompactCSS(scaleOrPreset, fontId) {
  // Use 80% of the requested scale for compact
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') {
    const presetMap = { small: 80, medium: 100, large: 120, xlarge: 140 };
    scale = presetMap[scaleOrPreset] || 100;
  }
  const compactScale = Math.round(scale * 0.8);
  const f = getPrintFontSizes(compactScale);
  const ff = getPrintFontFamily(fontId);
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:1mm 2mm;font-size:${f.body};line-height:1.3;width:72mm;max-width:72mm;overflow:hidden;} .kot-header{text-align:center;margin-bottom:2px;} .kot-title{font-size:${f.billTitle};font-weight:bold;margin-top:2px;} .divider{text-align:center;margin:2px 0;overflow:hidden;font-size:10px;} .kot-info{margin:2px 0;font-size:${f.info};} .kot-info div{margin:1px 0;} .item{margin:2px 0;} .item-main{display:flex;font-size:${f.body};} .item-qty{width:24px;flex-shrink:0;font-weight:bold;} .item-name{font-weight:bold;word-wrap:break-word;overflow-wrap:break-word;} .item-detail{margin-left:24px;font-size:${f.itemDetail};} .item-note{margin-left:24px;font-size:${f.itemDetail};font-style:italic;} .kot-footer{text-align:center;margin-top:2px;font-weight:bold;font-size:${f.body};} .special-instructions{margin:2px 0;padding:3px;border:1px dashed #000;text-align:center;font-size:${f.info};} .special-instructions strong{display:block;margin-bottom:2px;} .special-instructions div{text-align:left;}`;
}

export function render(kotData, printSettings = {}, labels = {}) {
  const L = getKOTLabels(labels);
  const k = kotData;
  const tableOrRoom = buildTableOrRoomHtml(k, L);
  const specialInstructionsHtml = buildSpecialInstructionsHtml(k, L);
  const { dateStr, timeStr } = formatDateTime();

  const renderRow = (item, opts = {}) => {
    const qty = item.quantity || 1;
    const noteLabel = L.note || 'Note';
    const label = opts.isRemoved ? ' <span style="color:#666;">[X]</span>' : (opts.showDelta && item.quantityDelta > 0 ? ' <span>[+]</span>' : '');
    const strikeStyle = opts.isRemoved ? 'text-decoration:line-through;color:#999;' : '';
    return `<div class="item" style="${strikeStyle}"><div class="item-main"><span class="item-qty">${qty}x</span><span class="item-name">${esc(item.name)}${label}</span></div>` +
      (item.selectedVariant?.name ? `<div class="item-detail">[${esc(item.selectedVariant.name)}]</div>` : '') +
      ((item.selectedCustomizations || []).map(c => `<div class="item-detail">+ ${esc(c.name || c)}</div>`).join('')) +
      (item.notes ? `<div class="item-note">${noteLabel}: ${esc(item.notes)}</div>` : '') +
      `</div>`;
  };

  const { html: itemsHtml, footerText, hasChanges } = buildKOTItemsSections(k, renderRow, L);
  const title = hasChanges ? L.kotUpdate : L.kitchenOrder;
  const css = getCompactCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);

  // Compact: skip restaurant name, minimal header
  const bodyHtml =
    `<div class="kot-header"><div class="kot-title">--- ${title} ---</div></div>` +
    `<div class="divider">- - - - - - - - - - - - - - - -</div>` +
    `<div class="kot-info">` +
      `<div><strong>#${k.dailyOrderId || k.orderId}</strong>` +
      (k.tableNumber ? ` | ${L.table}: ${k.tableNumber}` : '') +
      (k.roomNumber ? ` | ${L.room}: ${k.roomNumber}` : '') +
      ` | ${timeStr}</div>` +
      (k.waiterName ? `<div>${L.waiter}: ${esc(k.waiterName)}</div>` : '') +
      (k.orderType ? `<div>${L.type}: ${k.orderType}</div>` : '') +
    `</div>` +
    `<div class="divider">- - - - - - - - - - - - - - - -</div>` +
    itemsHtml +
    `<div class="divider">- - - - - - - - - - - - - - - -</div>` +
    `<div class="kot-footer">${footerText}</div>` +
    specialInstructionsHtml +
    `<div class="divider">================================</div>`;

  return wrapInDocument(`KOT - ${k.dailyOrderId || k.orderId}`, css, bodyHtml);
}
