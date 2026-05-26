// Bill Template: Minimal
// No borders/dividers, clean whitespace-based layout, inline quantities, modern aesthetic.

import {
  esc, getBillLabels, buildIdentityHtml,
  buildChargesHtml, buildPaymentHtml, buildDeliveryAddressHtml, calcGrandTotal, formatDateTime,
  getPrintFontSizes, wrapInDocument,
} from '../helpers';

export const id = 'minimal';
export const name = 'Minimal';
export const description = 'No borders or dividers. Clean, modern whitespace layout.';

function getMinimalBillCSS(scaleOrPreset) {
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') {
    const presetMap = { small: 80, medium: 100, large: 120, xlarge: 140 };
    scale = presetMap[scaleOrPreset] || 100;
  }
  const f = getPrintFontSizes(scale);
  // Force sans-serif for modern feel
  const ff = "Arial, Helvetica, sans-serif";
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:3mm 3mm;font-size:${f.body};line-height:${f.lineHeight};width:72mm;max-width:72mm;overflow:hidden;} .header{text-align:center;margin-bottom:14px;} .restaurant-name{font-size:${f.restaurantName};font-weight:300;text-transform:uppercase;letter-spacing:2px;} .bill-title{font-size:${f.billTitle};font-weight:300;margin-top:4px;letter-spacing:1px;} .meta{margin:12px 0;font-size:${f.info};} .meta-row{display:flex;justify-content:space-between;margin:4px 0;color:#555;} .items{margin:14px 0;} .item-row{display:flex;justify-content:space-between;margin:6px 0;font-size:${f.td};} .item-name{flex:1;} .item-amount{text-align:right;flex-shrink:0;white-space:nowrap;margin-left:8px;} .item-sub{margin-left:0;font-size:${f.itemDetail};color:#888;margin:1px 0;} .spacer{height:10px;} .total-section{margin-top:12px;padding-top:8px;font-size:${f.totalSection};} .total-section .row{display:flex;justify-content:space-between;margin:3px 0;} .grand-total{display:flex;justify-content:space-between;font-weight:bold;font-size:${f.totalRow};margin:10px 0 6px;} .footer{margin-top:16px;text-align:center;font-size:${f.footer};color:#888;} .bill-info{font-size:${f.info};} .bill-info div{display:flex;justify-content:space-between;margin:3px 0;gap:4px;} .bill-info div span:first-child{flex-shrink:0;} .bill-info div span:last-child{text-align:right;}`;
}

export function render(invoice, printSettings = {}, labels = {}) {
  const L = getBillLabels(labels);
  const cs = invoice.currencySymbol || '₹';
  const items = invoice.items || [];
  const { combined: dateStr } = formatDateTime();

  // Minimal items: inline qty with name (2x Butter Chicken)
  const itemsHtml = items.map(item => {
    const qty = item.quantity || 1;
    const unitPrice = item.price || (item.total ? item.total / qty : 0);
    const lineTotal = unitPrice * qty;
    const variant = item.selectedVariant?.name || item.variant || '';
    const custs = item.selectedCustomizations || item.customizations || [];

    let html = `<div class="item-row"><span class="item-name">${qty > 1 ? qty + 'x ' : ''}${esc(item.name)}</span><span class="item-amount">${cs}${lineTotal.toFixed(2)}</span></div>`;
    if (variant) html += `<div class="item-sub">${esc(variant)}</div>`;
    if (custs.length > 0) html += `<div class="item-sub">${custs.map(c => esc(c.name || c)).join(', ')}</div>`;
    if (item.notes) html += `<div class="item-sub" style="font-style:italic;">${esc(item.notes)}</div>`;
    return html;
  }).join('');

  // Discounts
  const offerName = typeof invoice.appliedOffer === 'string' ? invoice.appliedOffer : (invoice.appliedOffer?.name || '');
  let discountRows = '';
  if ((invoice.discountAmount || 0) > 0)
    discountRows += `<div class="row" style="display:flex;justify-content:space-between;margin:3px 0;color:#16a34a;"><span>${L.offer}${offerName ? ` (${offerName})` : ''}:</span><span>-${cs}${invoice.discountAmount.toFixed(2)}</span></div>`;
  if ((invoice.manualDiscount || 0) > 0)
    discountRows += `<div class="row" style="display:flex;justify-content:space-between;margin:3px 0;color:#16a34a;"><span>${L.manualDiscount}:</span><span>-${cs}${invoice.manualDiscount.toFixed(2)}</span></div>`;
  if ((invoice.loyaltyDiscount || 0) > 0)
    discountRows += `<div class="row" style="display:flex;justify-content:space-between;margin:3px 0;color:#b45309;"><span>${L.loyaltyRedeem}:</span><span>-${cs}${invoice.loyaltyDiscount.toFixed(2)}</span></div>`;

  // Tax
  const taxRows = (invoice.taxBreakdown || []).map(tax => {
    const inclSuffix = tax.inclusive ? ' (incl.)' : '';
    return `<div class="row" style="display:flex;justify-content:space-between;margin:3px 0;"><span>${tax.name} (${tax.rate}%)${inclSuffix}:</span><span>${cs}${(tax.amount || 0).toFixed(2)}</span></div>`;
  }).join('');

  const chargesHtml = buildChargesHtml(invoice, L, cs);
  const paymentHtml = buildPaymentHtml(invoice, L, cs);
  const deliveryHtml = buildDeliveryAddressHtml(invoice);
  const grandTotal = calcGrandTotal(invoice);
  const identityHtml = buildIdentityHtml(invoice);

  const css = getMinimalBillCSS(printSettings.billFontScale || printSettings.billFontSize);

  const bodyHtml =
    // Clean header - no logo for minimal
    `<div class="header">` +
      `<div class="restaurant-name">${esc(invoice.restaurantName || 'Restaurant')}</div>` +
      (identityHtml ? `<div style="margin-top:4px;">${identityHtml}</div>` : '') +
      `<div class="bill-title">${L.billTitle}</div>` +
    `</div>` +
    `<div class="spacer"></div>` +
    // Meta info
    `<div class="meta">` +
      `<div class="meta-row"><span>${L.billLabel}# ${invoice.dailyOrderId || invoice.id || 'N/A'}</span><span>${dateStr}</span></div>` +
      (invoice.tableNumber ? `<div class="meta-row"><span>${L.table} ${invoice.tableNumber}${invoice.floorName ? ` · ${invoice.floorName}` : ''}</span><span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>` : `<div class="meta-row"><span>${L.payment}: ${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>`) +
      (invoice.customerName ? `<div class="meta-row"><span>${esc(invoice.customerName)}</span></div>` : '') +
    `</div>` +
    deliveryHtml +
    `<div class="spacer"></div>` +
    // Items
    `<div class="items">${itemsHtml}</div>` +
    `<div class="spacer"></div>` +
    // Totals
    `<div class="total-section">` +
      `<div class="row" style="display:flex;justify-content:space-between;margin:3px 0;"><span>${L.subtotal}:</span><span>${cs}${(invoice.subtotal || 0).toFixed(2)}</span></div>` +
      discountRows +
      taxRows +
      chargesHtml +
      `<div class="grand-total"><span>${L.total}</span><span>${cs}${grandTotal.toFixed(2)}</span></div>` +
      paymentHtml +
    `</div>` +
    // Footer
    `<div class="footer"><p>${L.footer}</p><p style="margin-top:4px;">${L.poweredBy}</p></div>`;

  return wrapInDocument(`${L.billLabel} #${invoice.dailyOrderId || invoice.id || 'N/A'}`, css, bodyHtml);
}
