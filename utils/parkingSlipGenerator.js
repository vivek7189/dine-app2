// Parking slip HTML generator for thermal printer (80mm)
// Dual language support: English / Arabic

const esc = (str) => (str || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const VEHICLE_TYPE_AR = {
  car: 'سيارة', suv: 'دفع رباعي', bike: 'دراجة نارية',
  motorcycle: 'دراجة نارية', truck: 'شاحنة', bus: 'حافلة'
};

const PAYMENT_AR = { cash: 'نقداً', card: 'بطاقة', digital: 'رقمي' };

function parkingSlipCSS() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; max-width: 80mm; padding: 4mm; }
    .center { text-align: center; }
    .rtl { direction: rtl; text-align: right; }
    .bold { font-weight: bold; }
    .divider { text-align: center; color: #333; margin: 4px 0; font-size: 11px; letter-spacing: 1px; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px; }
    .row .label { color: #555; }
    .row .value { font-weight: bold; text-align: right; }
    .dual { display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px; }
    .dual .en { text-align: left; }
    .dual .ar { text-align: right; direction: rtl; font-family: 'Arial', sans-serif; }
    .big { font-size: 18px; font-weight: bold; text-align: center; margin: 6px 0; }
    .qr { text-align: center; margin: 8px 0; }
    .qr img { width: 140px; height: 140px; }
    .header-name { font-size: 16px; font-weight: bold; text-align: center; margin: 2px 0; }
    .amount { font-size: 22px; font-weight: bold; text-align: center; margin: 8px 0; }
    @media print { body { width: 80mm; } }
  `;
}

function dualRow(labelEn, labelAr, value, showAr = true) {
  if (!showAr) return `<div class="row"><span class="label">${esc(labelEn)}:</span><span class="value">${esc(value)}</span></div>`;
  return `<div class="row"><span class="label">${esc(labelEn)} | ${esc(labelAr || '')}:</span><span class="value">${esc(value)}</span></div>`;
}

/**
 * Generate parking entry slip HTML for thermal printing.
 * @param {object} ticket - Ticket data (merged with printData)
 * @param {object} config - Parking config
 * @returns {string} Full HTML document string
 */
export function generateParkingEntrySlip(ticket, config = {}) {
  const lang = config.printLanguage || 'dual';
  const showAr = lang === 'dual' || lang === 'ar';
  const showEn = lang === 'dual' || lang === 'en';

  const entryDate = ticket.entryTime ? new Date(ticket.entryTime) : new Date();
  const dateStr = entryDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = entryDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  const vtAr = VEHICLE_TYPE_AR[ticket.vehicleType] || ticket.vehicleType;

  let logoHtml = '';
  if (config.logo) {
    logoHtml = `<div class="center"><img src="${config.logo}" style="max-height:40px;max-width:60mm;margin-bottom:4px;" /></div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Parking - ${ticket.ticketNumber}</title>
<style>${parkingSlipCSS()}</style></head><body>
<div class="divider">================================</div>
${logoHtml}
<div class="header-name">${showEn ? esc(config.lotName || 'Parking') : ''}${showAr && showEn ? ' | ' : ''}${showAr ? esc(config.lotNameAr || '') : ''}</div>
${config.address ? `<div class="center" style="font-size:10px;">${showEn ? esc(config.address) : ''}${showAr ? '<br/>' + esc(config.addressAr || '') : ''}</div>` : ''}
${config.receiptHeader ? `<div class="center" style="font-size:10px;">${esc(config.receiptHeader)}${showAr && config.receiptHeaderAr ? '<br/>' + esc(config.receiptHeaderAr) : ''}</div>` : ''}
<div class="divider">================================</div>
<div class="big">${showEn ? 'PARKING TICKET' : ''}${showAr ? (showEn ? ' | ' : '') + 'تذكرة موقف' : ''}</div>
<div class="divider">--------------------------------</div>
${dualRow('Ticket', 'رقم التذكرة', ticket.ticketNumber || '', showAr)}
${dualRow('Date', 'التاريخ', dateStr, showAr)}
${dualRow('Entry', 'الدخول', timeStr, showAr)}
${dualRow('Zone', 'المنطقة', `${ticket.zoneName || ''} (${ticket.zoneCode || ''})`, showAr)}
${ticket.slotNumber ? dualRow('Slot', 'الموقع', ticket.slotNumber, showAr) : ''}
<div class="divider">--------------------------------</div>
${dualRow('Vehicle', 'المركبة', `${showEn ? (ticket.vehicleType || 'Car') : ''}${showAr ? (showEn ? ' | ' : '') + vtAr : ''}`, false)}
${dualRow('Plate', 'اللوحة', ticket.vehicleNumber || '', showAr)}
${ticket.vehicleColor ? dualRow('Color', 'اللون', ticket.vehicleColor, showAr) : ''}
<div class="divider">--------------------------------</div>
${ticket.rateName ? dualRow('Rate', 'التعرفة', ticket.rateName, showAr) : ''}
<div class="divider">================================</div>
${ticket.qrCodeDataUrl ? `<div class="qr"><img src="${ticket.qrCodeDataUrl}" /><div style="font-size:10px;">${showEn ? 'Scan to verify' : ''}${showAr ? (showEn ? ' | ' : '') + 'امسح للتحقق' : ''}</div></div>` : ''}
<div class="divider">================================</div>
<div class="center" style="font-size:10px;">${showEn ? 'Keep this ticket safe' : ''}${showAr ? '<br/>يرجى الاحتفاظ بالتذكرة' : ''}</div>
${config.receiptFooter ? `<div class="center" style="font-size:10px;margin-top:4px;">${esc(config.receiptFooter)}${showAr && config.receiptFooterAr ? '<br/>' + esc(config.receiptFooterAr) : ''}</div>` : ''}
<div class="divider">================================</div>
</body></html>`;
}

/**
 * Generate parking exit receipt HTML for thermal printing.
 * @param {object} ticket - Ticket data with exit info
 * @param {object} config - Parking config
 * @returns {string} Full HTML document string
 */
export function generateParkingExitSlip(ticket, config = {}) {
  const lang = config.printLanguage || 'dual';
  const showAr = lang === 'dual' || lang === 'ar';
  const showEn = lang === 'dual' || lang === 'en';

  const entryDate = ticket.entryTime ? new Date(ticket.entryTime) : new Date();
  const exitDate = ticket.exitTime ? new Date(ticket.exitTime) : new Date();
  const entryTimeStr = entryDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  const exitTimeStr = exitDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = exitDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const vtAr = VEHICLE_TYPE_AR[ticket.vehicleType] || ticket.vehicleType;
  const payAr = PAYMENT_AR[ticket.paymentMethod] || ticket.paymentMethod || '';
  const currency = ticket.currency || config.currency || 'AED';

  const durationMin = ticket.duration || ticket.durationMinutes || 0;
  const durationStr = ticket.durationFormatted || `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

  let logoHtml = '';
  if (config.logo) {
    logoHtml = `<div class="center"><img src="${config.logo}" style="max-height:40px;max-width:60mm;margin-bottom:4px;" /></div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Exit - ${ticket.ticketNumber}</title>
<style>${parkingSlipCSS()}</style></head><body>
<div class="divider">================================</div>
${logoHtml}
<div class="header-name">${showEn ? esc(config.lotName || 'Parking') : ''}${showAr && showEn ? ' | ' : ''}${showAr ? esc(config.lotNameAr || '') : ''}</div>
${config.address ? `<div class="center" style="font-size:10px;">${showEn ? esc(config.address) : ''}${showAr ? '<br/>' + esc(config.addressAr || '') : ''}</div>` : ''}
<div class="divider">================================</div>
<div class="big">${showEn ? 'EXIT RECEIPT' : ''}${showAr ? (showEn ? ' | ' : '') + 'إيصال خروج' : ''}</div>
<div class="divider">--------------------------------</div>
${dualRow('Ticket', 'رقم التذكرة', ticket.ticketNumber || '', showAr)}
${dualRow('Date', 'التاريخ', dateStr, showAr)}
<div class="divider">--------------------------------</div>
${dualRow('Vehicle', 'المركبة', `${showEn ? (ticket.vehicleType || 'Car') : ''}${showAr ? (showEn ? ' | ' : '') + vtAr : ''}`, false)}
${dualRow('Plate', 'اللوحة', ticket.vehicleNumber || '', showAr)}
${ticket.zoneName ? dualRow('Zone', 'المنطقة', ticket.zoneName, showAr) : ''}
${ticket.slotNumber ? dualRow('Slot', 'الموقع', ticket.slotNumber, showAr) : ''}
<div class="divider">--------------------------------</div>
${dualRow('Entry', 'الدخول', entryTimeStr, showAr)}
${dualRow('Exit', 'الخروج', exitTimeStr, showAr)}
${dualRow('Duration', 'المدة', durationStr, showAr)}
<div class="divider">================================</div>
<div class="amount">${currency} ${ticket.finalAmount ?? ticket.calculatedAmount ?? 0}</div>
${ticket.discountAmount ? `<div class="center" style="font-size:11px;">Discount: ${currency} ${ticket.discountAmount}</div>` : ''}
${dualRow('Payment', 'الدفع', `${showEn ? (ticket.paymentMethod || 'Cash') : ''}${showAr ? (showEn ? ' | ' : '') + payAr : ''}`, false)}
<div class="divider">================================</div>
<div class="center" style="font-size:12px;font-weight:bold;">${showEn ? 'Thank you' : ''}${showAr ? (showEn ? ' | ' : '') + 'شكراً لكم' : ''}</div>
${config.receiptFooter ? `<div class="center" style="font-size:10px;margin-top:4px;">${esc(config.receiptFooter)}${showAr && config.receiptFooterAr ? '<br/>' + esc(config.receiptFooterAr) : ''}</div>` : ''}
<div class="divider">================================</div>
</body></html>`;
}
