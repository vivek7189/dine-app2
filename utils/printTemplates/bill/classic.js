// Bill Template: Classic
// The default bill/invoice layout - standard receipt format.
// Produces identical output to the original generateBillHTML.

import {
  esc, getBillLabels, buildIdentityHtml, getSublineHtml,
  buildBillItemRows, buildTaxHtml, buildDiscountHtml, buildChargesHtml,
  buildPaymentHtml, buildDeliveryAddressHtml, calcGrandTotal, formatDateTime,
  getBillPrintCSS, getBillHeaderHTML, wrapInDocument,
} from '../helpers';

export const id = 'classic';
export const name = 'Classic';
export const description = 'Standard receipt format. The default bill layout.';

export function render(invoice, printSettings = {}, labels = {}) {
  const L = getBillLabels(labels);
  const cs = invoice.currencySymbol || '₹';
  const items = invoice.items || [];

  const itemsHtml = buildBillItemRows(items, cs);
  const taxHtml = buildTaxHtml(invoice.taxBreakdown, cs);
  const discountHtml = buildDiscountHtml(invoice, L, cs);
  const chargesHtml = buildChargesHtml(invoice, L, cs);
  const paymentHtml = buildPaymentHtml(invoice, L, cs);
  const deliveryHtml = buildDeliveryAddressHtml(invoice);
  const grandTotal = calcGrandTotal(invoice);

  const identityHtml = buildIdentityHtml(invoice);
  const receiptLogo = printSettings.receiptLogo || null;
  const headerHtml = getBillHeaderHTML(esc(invoice.restaurantName || 'Restaurant'), identityHtml, receiptLogo, `--- ${L.billTitle} ---`);

  const { combined: dateStr } = formatDateTime();
  const css = getBillPrintCSS(printSettings.billFontScale || printSettings.billFontSize, printSettings.billFontFamily);

  const bodyHtml =
    headerHtml +
    `<div class="divider">--------------------------------</div>` +
    `<div class="bill-info">` +
      `<div><span>${L.billLabel}#:</span><span><strong>${invoice.dailyOrderId || invoice.id || 'N/A'}</strong></span></div>` +
      `<div><span>${L.date}:</span><span>${dateStr}</span></div>` +
      (invoice.tableNumber ? `<div><span>${L.table}:</span><span>${invoice.tableNumber}${invoice.floorName ? ` · ${invoice.floorName}` : ''}</span></div>` : '') +
      (invoice.customerName ? `<div><span>${L.customer}:</span><span>${esc(invoice.customerName)}</span></div>` : '') +
      `<div><span>${L.payment}:</span><span>${(invoice.paymentMethod || 'CASH').toUpperCase()}</span></div>` +
    `</div>` +
    deliveryHtml +
    `<div class="divider">--------------------------------</div>` +
    `<table><thead><tr><th style="text-align:left;width:52%;">${L.itemCol}</th><th style="text-align:center;width:10%;">${L.qtyCol}</th><th style="text-align:right;width:38%;">${L.amt}</th></tr></thead><tbody>${itemsHtml}</tbody></table>` +
    `<div class="total-section">` +
      `<div class="bill-info"><div><span>${L.subtotal}:</span><span>${cs}${(invoice.subtotal || 0).toFixed(2)}</span></div>${discountHtml}</div>` +
      (taxHtml ? `<table style="margin:4px 0;"><tbody>${taxHtml}</tbody></table>` : '') +
      chargesHtml +
      `<div class="total-row"><span>${L.total}:</span><span>${cs}${grandTotal.toFixed(2)}</span></div>` +
      paymentHtml +
    `</div>` +
    `<div class="divider">================================</div>` +
    `<div class="bill-footer"><p>${L.footer}</p><p style="font-size:10px;margin-top:4px;">${L.poweredBy}</p></div>`;

  return wrapInDocument(`${L.billLabel} #${invoice.dailyOrderId || invoice.id || 'N/A'}`, css, bodyHtml);
}
