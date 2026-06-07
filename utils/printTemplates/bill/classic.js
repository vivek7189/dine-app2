// Bill Template: Classic
// The default bill/invoice layout - standard receipt format.
// Produces identical output to the original generateBillHTML.

import {
  esc, getBillLabels, buildIdentityHtml, getSublineHtml,
  buildBillItemRows, buildTaxHtml, buildDiscountHtml, buildChargesHtml,
  buildPaymentHtml, buildDeliveryAddressHtml, calcGrandTotal, formatDateTime,
  getBillPrintCSS, getBillHeaderHTML, wrapInDocument,
  BILL_LABELS_AR, getBillDualCSS, dualLabel, dualTitle,
} from '../helpers';

export const id = 'classic';
export const name = 'Classic';
export const description = 'Standard receipt format. The default bill layout.';

export function render(invoice, printSettings = {}, labels = {}) {
  const L = getBillLabels(labels);
  const AR = BILL_LABELS_AR;
  const lang = printSettings.printLanguage || 'en';
  const showAr = lang === 'dual' || lang === 'ar';
  const bl = printSettings?.billLayout || {};
  const cs = invoice.currencySymbol || '₹';
  const items = invoice.items || [];

  const itemsHtml = buildBillItemRows(items, cs, showAr);
  const taxHtml = buildTaxHtml(invoice.taxBreakdown, cs, printSettings);
  const discountHtml = buildDiscountHtml(invoice, L, cs);
  const chargesHtml = buildChargesHtml(invoice, L, cs);
  const paymentHtml = buildPaymentHtml(invoice, L, cs);
  const deliveryHtml = buildDeliveryAddressHtml(invoice);
  const grandTotal = calcGrandTotal(invoice);

  const identityHtml = buildIdentityHtml(invoice, printSettings);
  const receiptLogo = printSettings.receiptLogo || null;
  const titleText = showAr ? dualTitle('--- ' + L.billTitle + ' ---', '--- ' + AR.billTitle + ' ---', showAr) : '--- ' + L.billTitle + ' ---';
  const headerHtml = getBillHeaderHTML(esc(invoice.restaurantName || 'Restaurant'), identityHtml, receiptLogo, titleText);

  const { combined: dateStr } = formatDateTime();
  const baseCss = getBillPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);
  const css = showAr ? baseCss + getBillDualCSS() : baseCss;

  const bodyHtml =
    headerHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="bill-info">` +
      `<div><span>${dualLabel(L.billLabel, AR.billLabel, showAr)}#:</span><span><strong>${invoice.dailyOrderId || invoice.id || 'N/A'}</strong></span></div>` +
      `<div><span>${dualLabel(L.date, AR.date, showAr)}:</span><span>${dateStr}</span></div>` +
      (bl.showTable !== false && invoice.tableNumber ? `<div><span>${dualLabel(L.table, AR.table, showAr)}:</span><span>${invoice.tableNumber}${invoice.floorName ? ` · ${invoice.floorName}` : ''}</span></div>` : '') +
      (bl.showWaiter !== false && invoice.waiterName ? `<div><span>Waiter:</span><span>${esc(invoice.waiterName)}</span></div>` : '') +
      (bl.showCustomer !== false && invoice.customerName ? `<div><span>${dualLabel(L.customer, AR.customer, showAr)}:</span><span>${esc(invoice.customerName)}</span></div>` : '') +
      (bl.showOrderType !== false && invoice.orderType ? `<div><span>Order Type:</span><span>${esc(invoice.orderType)}</span></div>` : '') +
      (bl.showPayment !== false ? `<div><span>${dualLabel(L.payment, AR.payment, showAr)}:</span><span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>` : '') +
    `</div>` +
    deliveryHtml +
    `<div class="divider">--------------------------------</div>` +
    `<table><thead><tr><th style="text-align:left;width:52%;">${dualLabel(L.itemCol, AR.itemCol, showAr)}</th><th style="text-align:center;width:10%;">${dualLabel(L.qtyCol, AR.qtyCol, showAr)}</th><th style="text-align:right;width:38%;">${dualLabel(L.amt, AR.amt, showAr)}</th></tr></thead><tbody>${itemsHtml}</tbody></table>` +
    `<div class="total-section">` +
      (bl.showSubtotal !== false ? `<div class="bill-info"><div><span>${dualLabel(L.subtotal, AR.subtotal, showAr)}:</span><span>${cs}${(invoice.subtotal || 0).toFixed(2)}</span></div>${discountHtml}</div>` : '') +
      (taxHtml ? `<table style="margin:4px 0;"><tbody>${taxHtml}</tbody></table>` : '') +
      chargesHtml +
      `<div class="total-row"><span>${dualLabel(L.total, AR.total, showAr)}:</span><span>${cs}${grandTotal.toFixed(2)}</span></div>` +
      (bl.showPayment !== false ? paymentHtml : '') +
    `</div>` +
    `<div class="divider">================================</div>` +
    (bl.showFooter !== false || bl.showPoweredBy !== false ? `<div class="bill-footer">${bl.showFooter !== false ? `<p>${showAr ? dualLabel(L.footer, AR.footer, showAr) : L.footer}</p>` : ''}${bl.showPoweredBy !== false ? `<p style="font-size:10px;margin-top:4px;">${showAr ? dualLabel(L.poweredBy, AR.poweredBy, showAr) : L.poweredBy}</p>` : ''}</div>` : '');

  return wrapInDocument(`${dualLabel(L.billLabel, AR.billLabel, showAr)} #${invoice.dailyOrderId || invoice.id || 'N/A'}`, css, bodyHtml);
}
