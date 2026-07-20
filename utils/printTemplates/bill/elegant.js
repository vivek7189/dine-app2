// Bill Template: Elegant
// Serif font (Georgia), decorative ═══ dividers, letter-spaced header, italic footer.

import {
  esc, getBillLabels, buildIdentityHtml, getSublineHtml,
  buildBillItemRows, buildTaxHtml, buildDiscountHtml, buildChargesHtml,
  buildPaymentHtml, buildDeliveryAddressHtml, calcGrandTotal, formatDateTime,
  getPrintFontSizes, getBillHeaderHTML, wrapInDocument,
  BILL_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
} from '../helpers';
import { getCurrencySymbol } from '../../formatCurrency';

export const id = 'elegant';
export const name = 'Elegant';
export const description = 'Serif font, decorative dividers. Premium restaurant feel.';

function getElegantBillCSS(scaleOrPreset) {
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') {
    const presetMap = { small: 80, medium: 100, large: 120, xlarge: 140 };
    scale = presetMap[scaleOrPreset] || 100;
  }
  const f = getPrintFontSizes(scale);
  // Force Georgia serif for elegant feel
  const ff = "Georgia, 'Times New Roman', serif";
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:3mm 3mm;font-size:${f.body};line-height:${f.lineHeight};width:72mm;max-width:72mm;overflow:hidden;} .bill-header{text-align:center;margin-bottom:10px;} .restaurant-name{font-size:${f.restaurantName};font-weight:bold;text-transform:uppercase;letter-spacing:3px;word-wrap:break-word;overflow-wrap:break-word;} .bill-title{font-size:${f.billTitle};font-weight:bold;margin-top:6px;font-style:italic;} .bill-logo{max-width:100%;height:auto;display:block;} .divider{text-align:center;margin:8px 0;overflow:hidden;letter-spacing:0;} .bill-info{margin:8px 0;font-size:${f.info};} .bill-info div{display:flex;justify-content:space-between;margin:3px 0;gap:4px;} .bill-info div span:first-child{flex-shrink:0;} .bill-info div span:last-child{text-align:right;flex-shrink:1;min-width:0;} table{width:100%;border-collapse:collapse;margin:8px 0;table-layout:fixed;} th{text-align:left;border-bottom:2px solid #000;padding:3px 2px;font-size:${f.th};font-style:italic;} td{font-size:${f.td};padding:3px 2px;word-wrap:break-word;} td:last-child{text-align:right;} .total-section{border-top:2px solid #000;margin-top:8px;padding-top:6px;font-size:${f.totalSection};} .total-section div[style*="flex"]{flex-wrap:nowrap;} .total-row{display:flex;justify-content:space-between;font-weight:bold;font-size:${f.totalRow};margin-top:6px;letter-spacing:1px;} .bill-footer{margin-top:14px;text-align:center;font-size:${f.footer};font-style:italic;}`;
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
  const taxHtml = buildTaxHtml(invoice.taxBreakdown, cs, printSettings, { showInclusiveTax: invoice.showInclusiveTaxOnBill !== false });
  const discountHtml = buildDiscountHtml(invoice, L, cs);
  const chargesHtml = buildChargesHtml(invoice, L, cs);
  const paymentHtml = buildPaymentHtml(invoice, L, cs);
  const deliveryHtml = buildDeliveryAddressHtml(invoice);
  const grandTotal = calcGrandTotal(invoice);

  const identityHtml = buildIdentityHtml(invoice, printSettings);
  const receiptLogo = printSettings.receiptLogo || null;
  const billTitleText = showAr ? dualTitle('~ ' + L.billTitle + ' ~', '~ ' + AR.billTitle + ' ~', showAr) : '~ ' + L.billTitle + ' ~';
  const headerHtml = getBillHeaderHTML(esc(invoice.restaurantName || 'Restaurant'), identityHtml, receiptLogo, billTitleText);
  const { combined: dateStr } = formatDateTime();

  const baseCss = getElegantBillCSS(printSettings.billFontScale || printSettings.billFontSize);
  const finalCss = showAr ? baseCss + getBillDualCSS() : baseCss;

  const bodyHtml =
    headerHtml +
    `<div class="divider">════════════════════════════</div>` +
    `<div class="bill-info">` +
      `<div><span>${dualLabel(L.billLabel, AR.billLabel, showAr)}#:</span><span><strong>${invoice.dailyOrderId || invoice.id || 'N/A'}</strong></span></div>` +
      `<div><span>${dualLabel(L.date, AR.date, showAr)}:</span><span>${dateStr}</span></div>` +
      (bl.showTable !== false && invoice.tableNumber ? `<div><span>${dualLabel(L.table, AR.table, showAr)}:</span><span>${invoice.tableNumber}${invoice.floorName ? ` - ${invoice.floorName}` : ''}</span></div>` : '') +
      (bl.showCovers !== false && invoice.covers && invoice.covers > 1 ? `<div><span>${showAr ? dualLabel('Covers', 'أغطية', showAr) : 'Covers'}:</span><span>${invoice.covers}</span></div>` : '') +
      (bl.showWaiter !== false && invoice.waiterName ? `<div><span>Waiter:</span><span>${esc(invoice.waiterName)}</span></div>` : '') +
      (bl.showCustomer !== false && invoice.customerName ? `<div><span>${dualLabel(L.customer, AR.customer, showAr)}:</span><span>${esc(invoice.customerName)}</span></div>` : '') +
      (bl.showCustomerPhone && invoice.customerPhone ? `<div><span>${dualLabel('Phone', 'هاتف', showAr)}:</span><span>${esc(invoice.customerPhone)}</span></div>` : '') +
      (bl.showOrderType !== false && invoice.orderType ? `<div><span>Order Type:</span><span>${esc(invoice.orderType)}</span></div>` : '') +
      (bl.showPayment !== false ? `<div><span>${dualLabel(L.payment, AR.payment, showAr)}:</span><span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>` : '') +
    `</div>` +
    deliveryHtml +
    `<div class="divider">════════════════════════════</div>` +
    `<table><thead><tr><th style="text-align:left;width:52%;">${dualLabel(L.itemCol, AR.itemCol, showAr)}</th><th style="text-align:center;width:10%;">${dualLabel(L.qtyCol, AR.qtyCol, showAr)}</th><th style="text-align:right;width:38%;">${dualLabel(L.amt, AR.amt, showAr)}</th></tr></thead><tbody>${itemsHtml}</tbody></table>` +
    `<div class="total-section">` +
      (bl.showSubtotal !== false ? `<div class="bill-info"><div><span>${dualLabel(L.subtotal, AR.subtotal, showAr)}:</span><span>${cs}${(invoice.subtotal || 0).toFixed(2)}</span></div>${discountHtml}</div>` : '') +
      (taxHtml ? `<table style="margin:4px 0;"><tbody>${taxHtml}</tbody></table>` : '') +
      chargesHtml +
      `<div class="total-row"><span>${dualLabel(L.total, AR.total, showAr)}:</span><span>${cs}${grandTotal.toFixed(2)}</span></div>` +
      (bl.showPayment !== false ? paymentHtml : '') +
    `</div>` +
    `<div class="divider">════════════════════════════</div>` +
    (invoice.isPreBill ? `<div style="text-align:center;margin:8px 0;"><div style="font-size:16px;font-weight:900;letter-spacing:2px;font-style:italic;">*** PRE-BILL ***</div><div style="font-size:11px;color:#666;">This is not a final bill</div></div><div class="divider">════════════════════════════</div>` : '') +
    `<div class="bill-footer">${bl.showFooter !== false ? `<p>${showAr ? dualLabel(L.footer, AR.footer, showAr) : L.footer}</p>` : ''}${bl.showPoweredBy !== false ? `<p style="font-size:10px;margin-top:6px;">${showAr ? dualLabel(L.poweredBy, AR.poweredBy, showAr) : L.poweredBy}</p>` : ''}</div>`;

  return wrapInDocument(`${L.billLabel} #${invoice.dailyOrderId || invoice.id || 'N/A'}`, finalCss, bodyHtml);
}
