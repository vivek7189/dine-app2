// Shared helpers for all print templates (mobile app version).
// Self-contained - includes printFontSizes functions inline since the mobile app
// doesn't have a separate printFontSizes module.

import { seatLetter } from '../seatOrdering';

// ── Print Font System ──────────────────────────────────────────────────────────

const PRINT_FONTS = [
  { id: 'default', label: 'Default (Courier)', family: "'Courier New', Courier, monospace" },
  { id: 'arial', label: 'Arial', family: "Arial, Helvetica, sans-serif" },
  { id: 'verdana', label: 'Verdana', family: "Verdana, Geneva, sans-serif" },
  { id: 'tahoma', label: 'Tahoma', family: "Tahoma, Geneva, sans-serif" },
  { id: 'georgia', label: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
  { id: 'times', label: 'Times New Roman', family: "'Times New Roman', Times, serif" },
];

const BASE = { body: 15, restaurantName: 20, billTitle: 16, info: 14, th: 14, td: 14, tdPaddingV: 3, tdPaddingH: 4, totalSection: 14, totalRow: 20, footer: 13, itemDetail: 13, poweredBy: 10 };
const s = (base, scale) => Math.max(8, Math.round(base * scale / 100));
const sp = (base, scale) => Math.max(1, Math.round(base * scale / 100));

export const getPrintFontSizes = (scaleOrPreset) => {
  let scale = 100;
  if (typeof scaleOrPreset === 'number' && scaleOrPreset >= 50 && scaleOrPreset <= 150) scale = scaleOrPreset;
  else if (typeof scaleOrPreset === 'string') { const m = { small: 80, medium: 100, large: 120, xlarge: 140 }; scale = m[scaleOrPreset] || 100; }
  const lineHeight = scale <= 80 ? '1.4' : scale >= 130 ? '1.6' : '1.5';
  return { scale, body: `${s(BASE.body, scale)}px`, lineHeight, restaurantName: `${s(BASE.restaurantName, scale)}px`, billTitle: `${s(BASE.billTitle, scale)}px`, info: `${s(BASE.info, scale)}px`, th: `${s(BASE.th, scale)}px`, td: `${s(BASE.td, scale)}px`, tdPadding: `${sp(BASE.tdPaddingV, scale)}px ${sp(BASE.tdPaddingH, scale)}px`, totalSection: `${s(BASE.totalSection, scale)}px`, totalRow: `${s(BASE.totalRow, scale)}px`, footer: `${s(BASE.footer, scale)}px`, itemDetail: `${s(BASE.itemDetail, scale)}px`, poweredBy: `${s(BASE.poweredBy, scale)}px` };
};

export const getPrintFontFamily = (fontId) => {
  if (!fontId || fontId === 'default') return "'Courier New', Courier, monospace";
  const found = PRINT_FONTS.find(f => f.id === fontId);
  return found ? found.family : "'Courier New', Courier, monospace";
};

export const getBillPrintCSS = (scaleOrPreset, fontId) => {
  const f = getPrintFontSizes(scaleOrPreset); const ff = getPrintFontFamily(fontId);
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:2mm 2mm;font-size:${f.body};line-height:${f.lineHeight};width:72mm;max-width:72mm;overflow:hidden;} .bill-header{text-align:center;margin-bottom:8px;} .restaurant-name{font-size:${f.restaurantName};font-weight:bold;text-transform:uppercase;word-wrap:break-word;overflow-wrap:break-word;} .bill-title{font-size:${f.billTitle};font-weight:bold;margin-top:4px;} .bill-logo{max-width:100%;height:auto;display:block;} .divider{text-align:center;margin:6px 0;overflow:hidden;} .bill-info{margin:8px 0;font-size:${f.info};} .bill-info div{display:flex;justify-content:space-between;margin:3px 0;gap:4px;} .bill-info div span:first-child{flex-shrink:0;} .bill-info div span:last-child{text-align:right;flex-shrink:1;min-width:0;word-wrap:break-word;overflow-wrap:break-word;} .info-row{display:flex;justify-content:space-between;margin:2px 0;} table{width:100%;border-collapse:collapse;margin:8px 0;table-layout:fixed;} th{text-align:left;border-bottom:1px dashed #000;padding:2px;font-size:${f.th};} td{font-size:${f.td};padding:${f.tdPadding};word-wrap:break-word;overflow-wrap:break-word;} td:last-child{text-align:right;overflow:hidden;text-overflow:clip;white-space:nowrap;} .total-section{border-top:1px dashed #000;margin-top:8px;padding-top:4px;font-size:${f.totalSection};} .total-row{display:flex;justify-content:space-between;font-weight:bold;font-size:${f.totalRow};margin-top:4px;} .total-row span:last-child{flex-shrink:0;white-space:nowrap;} .bill-footer{margin-top:12px;text-align:center;font-size:${f.footer};}`;
};

export const getKOTPrintCSS = (scaleOrPreset, fontId) => {
  const f = getPrintFontSizes(scaleOrPreset); const ff = getPrintFontFamily(fontId);
  return `@page{size:72mm auto;margin:0;}*{box-sizing:border-box;}body{font-family:${ff};margin:0;padding:2mm 2mm;font-size:${f.body};line-height:${f.lineHeight};width:72mm;max-width:72mm;overflow:hidden;} .kot-header{text-align:center;margin-bottom:4px;} .restaurant-name{font-size:${f.restaurantName};font-weight:bold;text-transform:uppercase;word-wrap:break-word;overflow-wrap:break-word;} .kot-title{font-size:${f.billTitle};font-weight:bold;margin-top:2px;} .divider{text-align:center;margin:3px 0;overflow:hidden;} .kot-info{margin:4px 0;font-size:${f.info};} .kot-info div{margin:1px 0;} .kot-info-row{display:flex;justify-content:space-between;margin:1px 0;} .kot-info-row span{flex:0 0 auto;} .item{margin:3px 0;} .item-main{display:flex;font-size:${f.body};} .item-qty{width:30px;flex-shrink:0;font-weight:bold;} .item-name{font-weight:bold;word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;} .item-detail{margin-left:30px;font-size:${f.itemDetail};word-wrap:break-word;overflow-wrap:break-word;} .item-note{margin-left:30px;font-size:${f.itemDetail};font-style:italic;word-wrap:break-word;overflow-wrap:break-word;} .kot-footer{text-align:center;margin-top:4px;font-weight:bold;font-size:${f.body};} .special-instructions{margin:4px 0;padding:4px;border:1px dashed #000;text-align:center;font-size:${f.info};} .special-instructions strong{display:block;margin-bottom:2px;} .special-instructions div{text-align:left;}`;
};

export const getBillHeaderHTML = (restaurantName, identityHtml, receiptLogo, billTitle = '--- BILL ---') => {
  const logo = receiptLogo?.enabled ? receiptLogo : null;
  const nameAlign = logo?.nameAlignment || receiptLogo?.nameAlignment || 'center';
  const logoSize = logo?.size || 80; const logoPos = logo?.position || 'center';
  const logoImg = logo?.url ? `<img src="${logo.url}" class="bill-logo" style="width:${logoSize}px;height:auto;object-fit:contain;${logoPos === 'center' ? 'margin:0 auto 4px;' : ''}" />` : '';
  const nameBlock = `<div class="restaurant-name" style="text-align:${nameAlign};">${restaurantName}</div>${identityHtml ? `<div style="text-align:${nameAlign};">${identityHtml}</div>` : ''}<div class="bill-title" style="text-align:${nameAlign};">${billTitle}</div>`;
  if (!logoImg) return `<div class="bill-header" style="text-align:${nameAlign};margin-bottom:8px;">${nameBlock}</div>`;
  if (logoPos === 'center') return `<div class="bill-header" style="text-align:center;margin-bottom:8px;">${logoImg}${nameBlock}</div>`;
  const dir = logoPos === 'right' ? 'row-reverse' : 'row';
  return `<div class="bill-header" style="display:flex;align-items:center;gap:8px;flex-direction:${dir};margin-bottom:8px;">${logoImg}<div style="flex:1;text-align:${nameAlign};">${nameBlock}</div></div>`;
};

// ── End Print Font System ──────────────────────────────────────────────────────

// HTML-escape a string
export const esc = (str) => String(str ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Bold seat tag (e.g. " [A]") appended after item names on KOTs/bills. Empty when no seat.
export function getSeatTagHtml(item) {
  const letter = seatLetter(item?.seat);
  return letter ? ` <strong>[${letter}]</strong>` : '';
}

// Build identity lines (GSTIN, FSSAI, VAT, address, phone) for bill header.
export function buildIdentityHtml(info, printSettings) {
  const bl = printSettings?.billLayout || {};
  const lines = [];
  if (info.restaurantLegalName && info.restaurantLegalName !== info.restaurantName)
    lines.push(esc(info.restaurantLegalName));
  if (bl.showAddress !== false && info.restaurantAddress) lines.push(esc(info.restaurantAddress));
  if (bl.showPhone !== false && info.restaurantPhone) lines.push('Tel: ' + info.restaurantPhone);
  if (info.showGstOnInvoice && info.gstin) lines.push('GSTIN: ' + info.gstin);
  if (info.showFssaiOnInvoice && info.fssai) lines.push('FSSAI: ' + info.fssai);
  if (info.showTaxIdOnInvoice && info.vatNumber) {
    const tl = info.identityTaxLabel || info.taxLabel;
    const prefix = info.countryCode === 'AE' || info.countryCode === 'SA' ? 'TRN: '
      : tl ? tl + ': '
      : 'Tax ID: ';
    lines.push(prefix + info.vatNumber);
  }
  if (info.showTaxIdOnInvoice && info.taxId) {
    const tl = info.identityTaxLabel || info.taxLabel;
    lines.push((info.countryCode === 'AU' ? 'ABN: ' : tl ? tl + ': ' : 'Tax ID: ') + info.taxId);
  }
  if (info.showTaxIdOnInvoice && info.businessRegistrationNumber)
    lines.push('Reg#: ' + info.businessRegistrationNumber);
  return lines.map(l => `<div style="font-size:11px;">${l}</div>`).join('');
}

// Get item subline HTML (variant + customizations + notes) for bill item rows.
export function getSublineHtml(item) {
  let sub = '';
  const variant = item.selectedVariant?.name || item.variant;
  if (variant) sub += `<br/><small style="color:#666;">[${esc(variant)}]</small>`;
  const custs = item.selectedCustomizations || item.customizations || [];
  if (custs.length > 0) {
    sub += '<br/><small style="color:#666;">+ ' + custs.map(c => esc(c.name || c)).join(', ') + '</small>';
  }
  if (item.notes) sub += `<br/><small style="font-style:italic;color:#888;">Note: ${esc(item.notes)}</small>`;
  return sub;
}

// Render a single KOT item row with qty, name, variant, customizations, notes.
// opts: { isRemoved, showDelta, showPrice, currencySymbol }
export function renderKOTItemRow(item, opts = {}, labels = {}) {
  const qty = item.quantity || 1;
  const noteLabel = labels.note || 'Note';
  const label = opts.isRemoved ? ' <span style="color:#666;">[CANCEL]</span>' : (opts.showDelta && item.quantityDelta > 0 ? ' <span>[+NEW]</span>' : '');
  const strikeStyle = opts.isRemoved ? 'text-decoration:line-through;color:#999;' : '';
  const price = item.price || (item.total ? item.total / (item.quantity || 1) : 0);
  const itemTotal = price * qty;
  const priceHtml = (opts.showPrice && itemTotal > 0 && !opts.isRemoved) ? `<span style="float:right;font-weight:bold;">${opts.currencySymbol || ''}${itemTotal.toFixed(2)}</span>` : '';
  return `<div class="item" style="${strikeStyle}"><div class="item-main"><span class="item-qty">${qty}x</span><span class="item-name">${esc(item.name)}${getSeatTagHtml(item)}${label}</span>${priceHtml}</div>` +
    (item.selectedVariant?.name ? `<div class="item-detail">[${esc(item.selectedVariant.name)}]</div>` : '') +
    ((item.selectedCustomizations || []).map(c => `<div class="item-detail">+ ${esc(c.name || c)}</div>`).join('')) +
    (item.notes ? `<div class="item-note">${noteLabel}: ${esc(item.notes)}</div>` : '') +
    `</div>`;
}

// Build KOT items sections handling incremental/delta logic.
// Returns { html, footerText, hasChanges }
export function buildKOTItemsSections(kotData, renderRowFn, labels = {}) {
  const k = kotData;
  const removedItems = k.removedItems || [];
  const hasChanges = k.isIncremental && ((k.items || []).length > 0 || removedItems.length > 0);
  const totalItemsLabel = labels.totalItems || 'Total Items';

  let itemsHtml;
  let footerText;

  if (hasChanges) {
    const sections = [];
    if (removedItems.length > 0) {
      sections.push('<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** CANCELLED ***</div>');
      removedItems.forEach(i => sections.push(renderRowFn(i, { isRemoved: true })));
    }
    const reducedItems = (k.items || []).filter(i => i.isUpdated && i.quantityDelta < 0);
    if (reducedItems.length > 0) {
      sections.push('<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** REDUCED ***</div>');
      reducedItems.forEach(i => sections.push(renderRowFn({ ...i, quantity: Math.abs(i.quantityDelta) }, { isRemoved: true })));
    }
    const newAndInc = (k.items || []).filter(i => i.isNew || (i.isUpdated && i.quantityDelta > 0));
    if (newAndInc.length > 0) {
      sections.push('<div style="text-align:center;font-weight:bold;margin:3px 0 1px;">*** NEW ITEMS ***</div>');
      newAndInc.forEach(i => sections.push(renderRowFn(i, { showDelta: i.isUpdated })));
    }
    const unmarked = (k.items || []).filter(i => !i.isNew && !i.isUpdated);
    if (unmarked.length > 0) {
      unmarked.forEach(i => sections.push(renderRowFn(i)));
    }
    itemsHtml = sections.join('');
    const newCount = newAndInc.length;
    const removedCount = removedItems.length + reducedItems.length;
    footerText = `Changes: +${newCount} new, ${removedCount} removed`;
  } else {
    itemsHtml = (k.items || []).map(i => renderRowFn(i)).join('');
    const totalItems = (k.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);
    footerText = `${totalItemsLabel}: ${totalItems}`;
  }

  return { html: itemsHtml, footerText, hasChanges };
}

// Build bill items table rows HTML
export function buildBillItemRows(items, cs, showAr) {
  return items.map(item =>
    `<tr><td style="text-align:left;">${showAr ? dualItemName(item, showAr) : esc(item.name)}${getSeatTagHtml(item)}${getSublineHtml(item)}</td>` +
    `<td style="text-align:center;">${item.quantity || 1}</td>` +
    `<td style="text-align:right;">${cs}${((item.price || item.total / (item.quantity || 1) || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`
  ).join('');
}

// Build tax breakdown rows HTML
// options.showInclusiveTax: when false, hides inclusive tax lines from the bill
export function buildTaxHtml(taxBreakdown, cs, printSettings, options) {
  const bl = printSettings?.billLayout || {};
  if (bl.showTaxBreakdown === false) return '';
  const showIncl = !options || options.showInclusiveTax !== false;
  return (taxBreakdown || [])
    .filter(tax => !tax.inclusive || showIncl)
    .map(tax => {
      const inclSuffix = tax.inclusive ? ' (incl.)' : '';
      return `<tr><td colspan="2" style="text-align:left;">${tax.name} (${tax.rate}%)${inclSuffix}</td>` +
      `<td style="text-align:right;">${cs}${(tax.amount || 0).toFixed(2)}</td></tr>`;
    }).join('');
}

// Build discount HTML (offer, manual, loyalty)
export function buildDiscountHtml(invoice, L, cs) {
  const offerName = typeof invoice.appliedOffer === 'string' ? invoice.appliedOffer : (invoice.appliedOffer?.name || '');
  const offerDiscHtml = (invoice.discountAmount || 0) > 0
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;color:#16a34a;"><span>${L.offer}${offerName ? ` (${offerName})` : ''}:</span><span>-${cs}${invoice.discountAmount.toFixed(2)}</span></div>` : '';
  const manualDiscHtml = (invoice.manualDiscount || 0) > 0
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;color:#16a34a;"><span>${L.manualDiscount}:</span><span>-${cs}${invoice.manualDiscount.toFixed(2)}</span></div>` : '';
  const loyaltyDiscHtml = (invoice.loyaltyDiscount || 0) > 0
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;color:#b45309;"><span>${L.loyaltyRedeem}:</span><span>-${cs}${invoice.loyaltyDiscount.toFixed(2)}</span></div>` : '';
  return offerDiscHtml + manualDiscHtml + loyaltyDiscHtml;
}

// Build service charge, tip, round-off HTML
export function buildChargesHtml(invoice, L, cs) {
  const serviceChargeHtml = (invoice.serviceChargeAmount > 0)
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.serviceCharge}${invoice.serviceChargeRate ? ` (${invoice.serviceChargeRate}%)` : ''}:</span><span>${cs}${invoice.serviceChargeAmount.toFixed(2)}</span></div>` : '';
  const tipHtml = (invoice.tipAmount > 0)
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.tip}${invoice.tipPercentage ? ` (${invoice.tipPercentage}%)` : ''}:</span><span>${cs}${invoice.tipAmount.toFixed(2)}</span></div>` : '';
  const roundOffHtml = (invoice.roundOffAmount != null && invoice.roundOffAmount !== 0)
    ? `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.roundOff}:</span><span>${invoice.roundOffAmount > 0 ? '+' : ''}${cs}${invoice.roundOffAmount.toFixed(2)}</span></div>` : '';
  return serviceChargeHtml + tipHtml + roundOffHtml;
}

// Build payment details HTML (split, cash, partial, wallet)
export function buildPaymentHtml(invoice, L, cs) {
  const splitPaymentHtml = (invoice.splitPayments?.length >= 2)
    ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;"><div style="font-weight:bold;margin-bottom:2px;">${L.splitPayment}:</div>${invoice.splitPayments.map(sp => `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${(sp.method || 'Cash').toUpperCase()}:</span><span>${cs}${(sp.amount || 0).toFixed(2)}</span></div>`).join('')}</div>` : '';
  const cashReceivedHtml = (invoice.cashReceived > 0)
    ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;"><div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.cashReceived}:</span><span>${cs}${invoice.cashReceived.toFixed(2)}</span></div>${(invoice.changeReturned > 0) ? `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.change}:</span><span>${cs}${invoice.changeReturned.toFixed(2)}</span></div>` : ''}</div>` : '';
  const partialPayHtml = (invoice.paidAmount > 0 && invoice.outstandingAmount > 0)
    ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;"><div style="font-weight:bold;margin-bottom:2px;">${L.partialPayment}:</div><div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.paid}:</span><span>${cs}${invoice.paidAmount.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;margin:2px 0;color:#dc2626;"><span>${L.outstanding}:</span><span>${cs}${invoice.outstandingAmount.toFixed(2)}</span></div></div>` : '';
  const walletPayHtml = (invoice.walletRedeemAmount || 0) > 0
    ? `<div style="border-top:1px dashed #000;padding-top:4px;margin-top:4px;"><div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${L.walletApplied}:</span><span>-${cs}${invoice.walletRedeemAmount.toFixed(2)}</span></div><div style="display:flex;justify-content:space-between;margin:2px 0;font-weight:bold;"><span>${L.amountToPay}:</span><span>${cs}${Math.max(0, (invoice.grandTotal || 0) - invoice.walletRedeemAmount).toFixed(2)}</span></div></div>` : '';
  return splitPaymentHtml + cashReceivedHtml + partialPayHtml + walletPayHtml;
}

// Build delivery address + driver info HTML for receipt (flag-based: only shows for delivery orders)
export function buildDeliveryAddressHtml(invoice) {
  if (invoice.orderType !== 'delivery') return '';
  const parts = [];
  if (invoice.deliveryAddress) parts.push(esc(invoice.deliveryAddress));
  if (invoice.deliveryInfo?.personName) parts.push(`Driver: ${esc(invoice.deliveryInfo.personName)}${invoice.deliveryInfo.personPhone ? ` (${esc(invoice.deliveryInfo.personPhone)})` : ''}`);
  if (parts.length === 0) return '';
  return `<div class="bill-info" style="margin:4px 0;"><div style="text-align:center;font-weight:bold;font-size:11px;text-transform:uppercase;">Delivery</div>${parts.map(p => `<div style="text-align:center;font-size:10px;">${p}</div>`).join('')}</div>`;
}

// Calculate grand total from invoice data
// Only adds exclusive tax to the total — inclusive tax is already in the subtotal
export function calcGrandTotal(invoice) {
  const totalDiscount = (invoice.discountAmount || 0) + (invoice.manualDiscount || 0) + (invoice.loyaltyDiscount || 0);
  const exclusiveTax = (invoice.taxBreakdown || [])
    .filter(tax => !tax.inclusive)
    .reduce((sum, tax) => sum + (tax.amount || 0), 0);
  return invoice.grandTotal || (
    (invoice.subtotal || 0) - totalDiscount +
    exclusiveTax +
    (invoice.serviceChargeAmount || 0) + (invoice.tipAmount || 0) + (invoice.roundOffAmount || 0)
  );
}

// Standard HTML document wrapper
export function wrapInDocument(title, cssString, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${cssString}</style></head><body>${bodyHtml}</body></html>`;
}

// ── Dual-language (Arabic) support ──────────────────────────────────────
// Arabic translations for bill labels
export const BILL_LABELS_AR = {
  billTitle: 'فاتورة',
  revisedBill: 'فاتورة معدلة',
  billLabel: 'فاتورة',
  itemCol: 'الصنف',
  qtyCol: 'الكمية',
  amt: 'المبلغ',
  date: 'التاريخ',
  table: 'طاولة',
  room: 'غرفة',
  customer: 'العميل',
  payment: 'الدفع',
  subtotal: 'المجموع الفرعي',
  offer: 'عرض',
  manualDiscount: 'خصم',
  loyaltyRedeem: 'ولاء',
  serviceCharge: 'رسوم الخدمة',
  tip: 'بقشيش',
  roundOff: 'تقريب',
  total: 'الإجمالي',
  splitPayment: 'دفع مقسم',
  cashReceived: 'المبلغ المستلم',
  change: 'الباقي',
  partialPayment: 'دفع جزئي',
  paid: 'مدفوع',
  outstanding: 'المتبقي',
  walletApplied: 'المحفظة',
  amountToPay: 'المبلغ المستحق',
  footer: 'شكرا لزيارتكم!',
  poweredBy: 'مدعوم من DineOpen',
};

// Arabic translations for KOT labels
export const KOT_LABELS_AR = {
  kitchenOrder: 'طلب مطبخ',
  kotUpdate: 'تحديث الطلب',
  orderHash: 'طلب#',
  table: 'طاولة',
  room: 'غرفة',
  time: 'الوقت',
  date: 'التاريخ',
  customer: 'العميل',
  type: 'النوع',
  waiter: 'النادل',
  qty: 'الكمية',
  item: 'الصنف',
  totalItems: 'إجمالي الأصناف',
  specialInstructions: 'تعليمات خاصة',
  note: 'ملاحظة',
  newItemsOnly: '*** أصناف جديدة فقط ***',
};

// CSS for dual-language bill/KOT rendering
export function getBillDualCSS() {
  return `
    .dual-label { display: flex; justify-content: space-between; }
    .dual-label .lbl-en { text-align: left; }
    .dual-label .lbl-ar { text-align: right; direction: rtl; font-family: 'Arial', sans-serif; }
    .ar-name { direction: rtl; text-align: right; font-family: 'Arial', sans-serif; font-size: 10px; color: #444; }
    .dual-title { text-align: center; }
    .dual-title .title-ar { direction: rtl; font-family: 'Arial', sans-serif; }
  `;
}

// Render a dual-language label: "English | العربية"
export function dualLabel(en, ar, showAr) {
  if (!showAr) return esc(en);
  return `<span class="lbl-en">${esc(en)}</span> | <span class="lbl-ar">${esc(ar || '')}</span>`;
}

// Render a dual-language row with label and value
export function dualRow(labelEn, labelAr, value, showAr) {
  if (!showAr) return `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${esc(labelEn)}:</span><span>${esc(value)}</span></div>`;
  return `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>${esc(labelEn)} | ${esc(labelAr || '')}:</span><span>${esc(value)}</span></div>`;
}

// Render dual-language title (centered, two lines)
export function dualTitle(en, ar, showAr) {
  if (!showAr) return en;
  return `<div class="dual-title">${en}<br/><span class="title-ar">${esc(ar || '')}</span></div>`;
}

// Render item name with optional Arabic name below
export function dualItemName(item, showAr) {
  const name = esc(item.name);
  if (!showAr || !item.nameAr) return name;
  return `${name}<div class="ar-name">${esc(item.nameAr)}</div>`;
}

// Default bill labels with English fallbacks
export function getBillLabels(labels = {}) {
  return {
    billTitle: labels.billTitle || 'BILL',
    billLabel: labels.billLabel || 'Bill',
    itemCol: labels.itemCol || 'Item',
    qtyCol: labels.qtyCol || 'Qty',
    amt: labels.amt || 'Amt',
    date: labels.date || 'Date',
    table: labels.table || 'Table',
    room: labels.room || 'Room',
    customer: labels.customer || 'Customer',
    payment: labels.payment || 'Payment',
    subtotal: labels.subtotal || 'Subtotal',
    offer: labels.offer || 'Offer',
    manualDiscount: labels.manualDiscount || 'Discount',
    loyaltyRedeem: labels.loyaltyRedeem || 'Loyalty',
    serviceCharge: labels.serviceCharge || 'Service Charge',
    tip: labels.tip || 'Tip',
    roundOff: labels.roundOff || 'Round Off',
    total: labels.total || 'TOTAL',
    splitPayment: labels.splitPayment || 'Split Payment',
    cashReceived: labels.cashReceived || 'Cash Received',
    change: labels.change || 'Change',
    partialPayment: labels.partialPayment || 'Partial Payment',
    paid: labels.paid || 'Paid',
    outstanding: labels.outstanding || 'Outstanding',
    walletApplied: labels.walletApplied || 'Wallet Applied',
    amountToPay: labels.amountToPay || 'Amount to Pay',
    footer: labels.footer || 'Thank you for dining with us!',
    poweredBy: labels.poweredBy || 'Powered by DineOpen',
    ...labels,
  };
}

// Default KOT labels with English fallbacks
export function getKOTLabels(labels = {}) {
  return {
    kitchenOrder: labels.kitchenOrder || 'KITCHEN ORDER',
    kotUpdate: labels.kotUpdate || 'KOT UPDATE',
    orderHash: labels.orderHash || 'Order#',
    table: labels.table || 'Table',
    room: labels.room || 'Room',
    time: labels.time || 'Time',
    date: labels.date || 'Date',
    customer: labels.customer || 'Customer',
    type: labels.type || 'Type',
    waiter: labels.waiter || 'Waiter',
    qty: labels.qty || 'QTY',
    item: labels.item || 'ITEM',
    totalItems: labels.totalItems || 'Total Items',
    specialInstructions: labels.specialInstructions || 'SPECIAL INSTRUCTIONS',
    note: labels.note || 'Note',
    newItemsOnly: labels.newItemsOnly || '*** NEW ITEMS ONLY ***',
    ...labels,
  };
}

// Build table-or-room HTML for KOT info section
export function buildTableOrRoomHtml(kotData, L) {
  return kotData.roomNumber
    ? `<div><strong>${L.room}:</strong> ${kotData.roomNumber}</div>`
    : (kotData.tableNumber ? `<div><strong>${L.table}:</strong> ${kotData.tableNumber}${kotData.floorName ? ` - ${kotData.floorName}` : ''}</div>` : '');
}

// Build special instructions HTML for KOT
export function buildSpecialInstructionsHtml(kotData, L) {
  return kotData.specialInstructions
    ? `<div class="special-instructions"><strong>*** ${L.specialInstructions} ***</strong><div>${esc(kotData.specialInstructions)}</div></div>`
    : '';
}

// Format current date/time for receipts
export function formatDateTime() {
  const now = new Date();
  return {
    dateStr: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    timeStr: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    combined: now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}
