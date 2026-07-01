// Token slip HTML generation for Food Court Token Billing
// Ported from dine-frontend/src/utils/printFontSizes.js
// Generates printable HTML for category-wise token slips (80mm thermal paper)

import { getCurrencySymbol } from './formatCurrency';

const escapePrintHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getTokenSlipCSS = ({ combined = false } = {}) => {
  return `
@page{size:80mm auto;margin:0;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Courier New',Courier,monospace;font-size:15px;line-height:1.5;${combined ? 'background:#f3f4f6;padding:16px;' : 'width:80mm;padding:6px 10px;'}}
.token-slip{width:${combined ? '80mm' : '100%'};background:white;color:black;${combined ? 'padding:8px 12px;margin:0 auto 16px;box-shadow:0 8px 24px rgba(15,23,42,0.12);page-break-after:always;break-after:page;' : ''}}
.token-slip:last-child{page-break-after:auto;break-after:auto;}
.token-label{text-align:center;font-size:48px;font-weight:900;padding:12px 4px;border:3px dashed #000;margin:4px 0;letter-spacing:3px;line-height:1.1;}
.order-num{text-align:center;font-size:16px;font-weight:bold;margin:6px 0 2px;}
.divider{text-align:center;letter-spacing:2px;margin:3px 0;font-size:14px;}
.divider-thick{text-align:center;letter-spacing:1px;margin:2px 0;font-size:15px;font-weight:bold;}
.items{margin:6px 0;font-size:16px;}
.item-line{display:flex;justify-content:space-between;padding:3px 0;font-weight:600;}
.item-price{text-align:right;font-size:14px;white-space:nowrap;}
.item-detail{margin-left:20px;font-size:13px;color:#333;font-weight:normal;}
.token-total{display:flex;justify-content:space-between;padding:6px 0;font-weight:900;font-size:18px;border-top:2px solid #000;margin-top:4px;}
.meta{text-align:center;font-size:14px;margin:2px 0;}
.meta b{font-weight:bold;}
.counter{text-align:center;font-weight:900;font-size:22px;margin:8px 0 4px;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;}
.time{text-align:center;font-size:14px;margin:4px 0;}
.footer{text-align:center;font-size:13px;margin-top:6px;font-style:italic;}
.restaurant{text-align:center;font-size:14px;font-weight:bold;margin-top:2px;}
@media print{body{background:white;padding:0;}.token-slip{margin:0;box-shadow:none;}}
`;
};

const buildTokenSlipBody = (token, cs) => {
  const thickDiv = '================================';
  const thinDiv = '--------------------------------';

  const itemLines = (token.items || []).map(i => {
    const qty = i.quantity || 1;
    const price = i.price || 0;
    const itemTotal = i.total || (qty * price);
    let line = `<div class="item-line"><span>${escapePrintHtml(qty)} x ${escapePrintHtml(i.name || 'Item')}${price ? ` @ ${cs}${price}` : ''}</span>${itemTotal ? `<span class="item-price">${cs}${itemTotal.toFixed(2)}</span>` : ''}</div>`;
    if (i.variant) line += `<div class="item-detail">${escapePrintHtml(i.variant)}</div>`;
    if (i.customizations && i.customizations.length > 0) {
      const custs = Array.isArray(i.customizations) ? i.customizations.map(c => c.name || c).join(', ') : '';
      if (custs) line += `<div class="item-detail">${escapePrintHtml(custs)}</div>`;
    }
    return line;
  }).join('');

  const counterName = token.printStationName || token.categoryName || '';

  return `<section class="token-slip">
<div class="divider-thick">${thickDiv}</div>
<div class="token-label">${escapePrintHtml(token.tokenLabel)}</div>
<div class="divider-thick">${thickDiv}</div>
<div class="order-num">Order #${escapePrintHtml(token.orderNumber)}</div>
<div class="divider">${thinDiv}</div>
<div class="items">${itemLines}${token.tokenTotal ? `<div class="token-total"><span>Total</span><span>${cs}${token.tokenTotal.toFixed(2)}</span></div>` : ''}</div>
<div class="divider">${thinDiv}</div>
<div class="meta">Items: <b>${escapePrintHtml(token.itemCount || 0)}</b></div>
${counterName ? `<div class="counter">${escapePrintHtml(counterName)}</div>` : ''}
<div class="time">${escapePrintHtml(token.time)}</div>
<div class="divider">${thinDiv}</div>
<div class="footer">Present this token at counter</div>
<div class="restaurant">${escapePrintHtml(token.restaurantName)}</div>
<div class="divider-thick">${thickDiv}</div>
</section>`;
};

export const buildTokenSlipHTML = (token) => {
  const cs = token.currencySymbol || getCurrencySymbol();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Token ${escapePrintHtml(token.tokenLabel)}</title>
<style>${getTokenSlipCSS()}</style></head><body>${buildTokenSlipBody(token, cs)}</body></html>`;
};

export const buildTokenSlipsDocumentHTML = (tokens = []) => {
  const firstToken = tokens[0] || {};
  const orderNumber = firstToken.orderNumber || '';
  const title = `Food Court Tokens${orderNumber ? ` - Order #${orderNumber}` : ''}`;
  const cs = firstToken.currencySymbol || getCurrencySymbol();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapePrintHtml(title)}</title>
<style>${getTokenSlipCSS({ combined: true })}</style></head><body>${tokens.map(t => buildTokenSlipBody(t, cs)).join('')}</body></html>`;
};
