// Bill Template: Compact
// Condensed layout, minimal spacing, saves paper.

import {
  esc, getBillLabels, buildIdentityHtml, getSublineHtml,
  buildBillItemRows, buildTaxHtml, buildDiscountHtml, buildChargesHtml,
  buildPaymentHtml, buildDeliveryAddressHtml, calcGrandTotal, formatDateTime,
  getPrintFontSizes, getPrintFontFamily, wrapInDocument,
  BILL_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
} from '../helpers';
import { getCurrencySymbol } from '../../formatCurrency';

export const id = 'compact';
export const name = 'Compact';
export const description = 'Condensed layout, minimal spacing. Saves paper.';

function getCompactBillCSS(scaleOrPreset, fontId) {
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') {
    const presetMap = { small: 80, medium: 100, large: 120, xlarge: 140 };
    scale = presetMap[scaleOrPreset] || 100;
  }
  const compactScale = Math.round(scale * 0.85);
  const f = getPrintFontSizes(compactScale);
  const ff = getPrintFontFamily(fontId);
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:1mm 2mm;font-size:${f.body};line-height:1.3;width:72mm;max-width:72mm;overflow:hidden;} .bill-header{text-align:center;margin-bottom:4px;} .restaurant-name{font-size:${f.restaurantName};font-weight:bold;text-transform:uppercase;} .bill-title{font-size:${f.billTitle};font-weight:bold;margin-top:2px;} .divider{text-align:center;margin:2px 0;overflow:hidden;font-size:10px;} .bill-info{margin:2px 0;font-size:${f.info};} .bill-info div{display:flex;justify-content:space-between;margin:1px 0;gap:4px;} .bill-info div span:first-child{flex-shrink:0;} .bill-info div span:last-child{text-align:right;} table{width:100%;border-collapse:collapse;margin:2px 0;table-layout:fixed;} th{text-align:left;border-bottom:1px dashed #000;padding:1px;font-size:${f.th};} td{font-size:${f.td};padding:1px 2px;word-wrap:break-word;} td:last-child{text-align:right;} .total-section{border-top:1px dashed #000;margin-top:2px;padding-top:2px;font-size:${f.totalSection};} .total-row{display:flex;justify-content:space-between;font-weight:bold;font-size:${f.totalRow};margin-top:2px;} .bill-footer{margin-top:4px;text-align:center;font-size:${f.footer};}`;
}

export function render(invoice, printSettings = {}, labels = {}) {
  const L = getBillLabels(labels);
  const AR = BILL_LABELS_AR;
  const lang = printSettings.printLanguage || 'en';
  const showAr = lang === 'dual' || lang === 'ar';
  const bl = printSettings?.billLayout || {};
  const cs = invoice.currencySymbol || getCurrencySymbol();
  const items = invoice.items || [];

  const itemsHtml = buildBillItemRows(items, cs, showAr);
  const taxBreakdown = invoice.taxBreakdown || [];
  // Compact: single-line tax summary if only one tax type
  const showIncl = invoice.showInclusiveTaxOnBill !== false;
  const visibleTaxes = (taxBreakdown || []).filter(tax => !tax.inclusive || showIncl);
  let taxHtml;
  if (bl.showTaxBreakdown === false) {
    taxHtml = '';
  } else if (visibleTaxes.length === 1) {
    const tax = visibleTaxes[0];
    const inclSuffix = tax.inclusive ? ' (incl.)' : '';
    taxHtml = `<div style="display:flex;justify-content:space-between;margin:1px 0;"><span>${tax.name} (${tax.rate}%)${inclSuffix}:</span><span>${cs}${(tax.amount || 0).toFixed(2)}</span></div>`;
  } else {
    taxHtml = visibleTaxes.length > 0 ? `<table style="margin:2px 0;"><tbody>${buildTaxHtml(taxBreakdown, cs, printSettings, { showInclusiveTax: showIncl })}</tbody></table>` : '';
  }
  const discountHtml = buildDiscountHtml(invoice, L, cs);
  const chargesHtml = buildChargesHtml(invoice, L, cs);
  const paymentHtml = buildPaymentHtml(invoice, L, cs);
  const deliveryHtml = buildDeliveryAddressHtml(invoice);
  const grandTotal = calcGrandTotal(invoice);
  const { combined: dateStr } = formatDateTime();

  const baseCss = getCompactBillCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);
  const css = showAr ? baseCss + getBillDualCSS() : baseCss;

  // Compact: skip logo, minimal header
  const bodyHtml =
    `<div class="bill-header"><div class="restaurant-name">${esc(invoice.restaurantName || 'Restaurant')}</div><div class="bill-title">${showAr ? dualTitle('--- ' + L.billTitle + ' ---', '--- ' + AR.billTitle + ' ---', showAr) : '--- ' + L.billTitle + ' ---'}</div></div>` +
    `<div class="divider">- - - - - - - - - - - - - - - -</div>` +
    `<div class="bill-info">` +
      `<div><span>#${invoice.dailyOrderId || invoice.id || 'N/A'}</span><span>${dateStr}</span></div>` +
      (bl.showTable !== false && invoice.tableNumber ? `<div><span>${dualLabel(L.table, AR.table, showAr)}: ${invoice.tableNumber}</span>${bl.showPayment !== false ? `<span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span>` : ''}</div>` : (bl.showPayment !== false ? `<div><span>${dualLabel(L.payment, AR.payment, showAr)}:</span><span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>` : '')) +
      (bl.showWaiter !== false && invoice.waiterName ? `<div><span>Waiter:</span><span>${esc(invoice.waiterName)}</span></div>` : '') +
      (bl.showCustomer !== false && invoice.customerName ? `<div><span>${dualLabel(L.customer, AR.customer, showAr)}:</span><span>${esc(invoice.customerName)}</span></div>` : '') +
      (bl.showOrderType !== false && invoice.orderType ? `<div><span>Order Type:</span><span>${esc(invoice.orderType)}</span></div>` : '') +
    `</div>` +
    deliveryHtml +
    `<div class="divider">- - - - - - - - - - - - - - - -</div>` +
    `<table><thead><tr><th style="text-align:left;width:52%;">${dualLabel(L.itemCol, AR.itemCol, showAr)}</th><th style="text-align:center;width:10%;">${dualLabel(L.qtyCol, AR.qtyCol, showAr)}</th><th style="text-align:right;width:38%;">${dualLabel(L.amt, AR.amt, showAr)}</th></tr></thead><tbody>${itemsHtml}</tbody></table>` +
    `<div class="total-section">` +
      (bl.showSubtotal !== false ? `<div class="bill-info"><div><span>${dualLabel(L.subtotal, AR.subtotal, showAr)}:</span><span>${cs}${(invoice.subtotal || 0).toFixed(2)}</span></div>${discountHtml}</div>` : '') +
      (typeof taxHtml === 'string' && taxHtml.startsWith('<div') ? taxHtml : (taxHtml || '')) +
      chargesHtml +
      `<div class="total-row"><span>${dualLabel(L.total, AR.total, showAr)}:</span><span>${cs}${grandTotal.toFixed(2)}</span></div>` +
      (bl.showPayment !== false ? paymentHtml : '') +
    `</div>` +
    `<div class="divider">================================</div>` +
    (invoice.isPreBill ? `<div style="text-align:center;margin:8px 0;"><div style="font-size:16px;font-weight:900;letter-spacing:2px;">*** PRE-BILL ***</div><div style="font-size:11px;color:#666;">This is not a final bill</div></div><div class="divider">================================</div>` : '') +
    (bl.showFooter !== false || bl.showPoweredBy !== false ? `<div class="bill-footer">${bl.showFooter !== false ? `<p>${showAr ? dualLabel(L.footer, AR.footer, showAr) : L.footer}</p>` : ''}${bl.showPoweredBy !== false ? `<p style="font-size:10px;margin-top:4px;">${showAr ? dualLabel(L.poweredBy, AR.poweredBy, showAr) : L.poweredBy}</p>` : ''}</div>` : '');

  return wrapInDocument(`${dualLabel(L.billLabel, AR.billLabel, showAr)} #${invoice.dailyOrderId || invoice.id || 'N/A'}`, css, bodyHtml);
}
