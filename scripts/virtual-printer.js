#!/usr/bin/env node
// Virtual thermal printer for testing printing without hardware.
//
// Listens on TCP 9100 like a WiFi / LAN receipt printer. In the app: Printer Settings → add a
// network printer → this computer's IP (printed on start) → port 9100. Every print is saved as an
// HTML "receipt" (text with its real alignment / bold / size + raster images such as the logo or a
// full image receipt) in ~/Downloads/virtual-printer/ and opened in the browser.
//
// Understands the ESC/POS subset the app sends: text, ESC a (align), ESC E / ESC ! / GS ! (bold &
// size), feeds, cut, GS v 0 raster images (iOS SDK) and ESC * bit-image stripes (Android).
// Usage: node scripts/virtual-printer.js [--port 9100] [--width 58|80] [--no-open]
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { exec } = require('child_process');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const PORT = Number(argVal('--port', 9100));
const PAPER_MM = Number(argVal('--width', 58));
const OPEN = !args.includes('--no-open');
const OUT_DIR = path.join(os.homedir(), 'Downloads', 'virtual-printer');
fs.mkdirSync(OUT_DIR, { recursive: true });
const CHARS = PAPER_MM === 58 ? 32 : 48; // characters per line the paper really fits
const DOTS = PAPER_MM === 58 ? 384 : 576; // printable dots

// ── tiny PNG encoder (8-bit grayscale) ──
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function pngFromBits(width, height, isBlack) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width + 1)] = 0; for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = isBlack(x, y) ? 0 : 255; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ── ESC/POS → blocks ──
function parse(buf) {
  const blocks = []; // {kind:'text', text, align, bold, big} | {kind:'image', png, width, height, align}
  const notes = [];
  let align = 0, bold = false, big = false, line = '', lineAlign = 0, lineBold = false, lineBig = false;
  let stripes = []; // ESC * stripes being collected into one image
  const flushLine = (force) => {
    if (line.length || force) blocks.push({ kind: 'text', text: line, align: lineAlign, bold: lineBold, big: lineBig });
    line = '';
  };
  const flushStripes = () => {
    if (!stripes.length) return;
    const width = Math.max(...stripes.map(s => s.cols));
    const height = stripes.reduce((h, s) => h + s.dots, 0);
    const png = pngFromBits(width, height, (x, y) => {
      let off = 0;
      for (const s of stripes) {
        if (y < off + s.dots) {
          if (x >= s.cols) return false;
          const yy = y - off;
          const byteIdx = s.dots === 24 ? x * 3 + Math.floor(yy / 8) : x;
          return (s.data[byteIdx] >> (7 - (yy % 8))) & 1;
        }
        off += s.dots;
      }
      return false;
    });
    blocks.push({ kind: 'image', png, width, height, align: stripes[0].align, how: 'ESC * (Android)' });
    stripes = [];
  };
  const textByte = (b) => {
    flushStripes();
    if (!line.length) { lineAlign = align; lineBold = bold; lineBig = big; }
    line += String.fromCharCode(b);
  };
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b === 0x1b) {
      const c = buf[i + 1];
      if (c === 0x40) { align = 0; bold = false; big = false; i += 2; continue; } // init
      if (c === 0x61) { const n = buf[i + 2]; align = n === 1 || n === 49 ? 1 : n === 2 || n === 50 ? 2 : 0; i += 3; continue; }
      if (c === 0x45 || c === 0x47) { bold = !!(buf[i + 2] & 1); i += 3; continue; }
      if (c === 0x21) { const n = buf[i + 2]; bold = !!(n & 0x08); big = !!(n & 0x30); i += 3; continue; }
      if (c === 0x64 || c === 0x4a) { flushStripes(); flushLine(); const n = c === 0x64 ? buf[i + 2] : Math.round(buf[i + 2] / 24); for (let k = 0; k < Math.min(n, 10); k++) blocks.push({ kind: 'text', text: '', align: 0 }); i += 3; continue; }
      if (c === 0x2a) { // ESC * m nL nH data
        const m = buf[i + 2], cols = buf[i + 3] + buf[i + 4] * 256; const dots = m >= 32 ? 24 : 8; const n = cols * (dots / 8);
        stripes.push({ cols, dots, data: buf.slice(i + 5, i + 5 + n), align }); i += 5 + n; continue;
      }
      if (c === 0x70) { notes.push('cash drawer kick'); i += 5; continue; }
      if (c === 0x42) { notes.push('beep'); i += 4; continue; }
      if (c === 0x32) { i += 2; continue; }
      if ([0x33, 0x74, 0x2d, 0x4d, 0x7b, 0x56, 0x52, 0x20, 0x63].includes(c)) { i += 3; continue; }
      i += 2; continue;
    }
    if (b === 0x1d) {
      const c = buf[i + 1];
      if (c === 0x21) { big = buf[i + 2] !== 0; i += 3; continue; }
      if (c === 0x56) { const m = buf[i + 2]; flushStripes(); flushLine(); blocks.push({ kind: 'cut' }); i += m === 65 || m === 66 || m === 0x41 || m === 0x42 ? 4 : 3; continue; }
      if (c === 0x76 && buf[i + 2] === 0x30) { // GS v 0 m xL xH yL yH data
        flushStripes(); flushLine();
        const xBytes = buf[i + 4] + buf[i + 5] * 256, rows = buf[i + 6] + buf[i + 7] * 256; const data = buf.slice(i + 8, i + 8 + xBytes * rows);
        const png = pngFromBits(xBytes * 8, rows, (x, y) => (data[y * xBytes + (x >> 3)] >> (7 - (x & 7))) & 1);
        blocks.push({ kind: 'image', png, width: xBytes * 8, height: rows, align, how: 'GS v 0' });
        i += 8 + xBytes * rows; continue;
      }
      if ([0x48, 0x66, 0x68, 0x77, 0x4c, 0x42].includes(c)) { i += 3; continue; }
      if (c === 0x57) { i += 4; continue; }
      i += 2; continue;
    }
    if (b === 0x1c) { i += buf[i + 1] === 0x70 ? 4 : 2; continue; }
    if (b === 0x10 && buf[i + 1] === 0x04) { i += 3; continue; } // status request
    if (b === 0x0a) {
      if (stripes.length && !line.length) { i++; continue; } // newline after an image stripe
      flushStripes(); flushLine(true); i++; continue;
    }
    if (b === 0x0d) { i++; continue; }
    if (b >= 0x20) { textByte(b); i++; continue; }
    i++;
  }
  flushStripes(); flushLine();
  return { blocks, notes };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function render(blocks, notes, meta) {
  const alignCss = ['left', 'center', 'right'];
  const wide = blocks.filter(b => b.kind === 'text' && b.text.length > CHARS);
  const body = blocks.map(b => {
    if (b.kind === 'cut') return '<div class="cut">✂ cut</div>';
    if (b.kind === 'image') {
      const shown = Math.min(b.width, DOTS);
      return `<div style="text-align:${alignCss[b.align]}"><img src="data:image/png;base64,${b.png.toString('base64')}" style="width:${(shown / DOTS) * 100}%" title="${b.how} ${b.width}×${b.height}"></div>`;
    }
    const over = b.text.length > CHARS;
    return `<div class="ln${over ? ' over' : ''}" style="text-align:${alignCss[b.align]};${b.bold ? 'font-weight:bold;' : ''}${b.big ? 'font-size:1.6em;' : ''}">${esc(b.text) || '&nbsp;'}</div>`;
  }).join('\n');
  const aligns = blocks.filter(b => b.kind === 'text' && b.text.trim()).reduce((a, b) => { a[alignCss[b.align]] = (a[alignCss[b.align]] || 0) + 1; return a; }, {});
  const images = blocks.filter(b => b.kind === 'image');
  return `<!doctype html><meta charset="utf-8"><title>Virtual print ${meta.time}</title>
<style>body{background:#e5e7eb;font-family:system-ui;padding:20px}.paper{background:#fff;width:${PAPER_MM === 58 ? 300 : 440}px;margin:0 auto;padding:14px 10px;box-shadow:0 2px 8px #0003;font-family:Menlo,monospace;font-size:${PAPER_MM === 58 ? 14 : 13}px;white-space:pre;overflow:hidden}
.ln.over{background:#fee2e2}.cut{border-top:2px dashed #999;color:#999;font-size:11px;text-align:center;margin:8px 0}.info{max-width:600px;margin:14px auto;font-size:13px;color:#374151;white-space:normal}</style>
<div class="info"><b>${meta.from}</b> · ${meta.time} · ${meta.bytes} bytes · paper ${PAPER_MM} mm (${CHARS} chars)<br>
Text lines by alignment: ${JSON.stringify(aligns)} · images: ${images.length ? images.map(x => `${x.how} ${x.width}×${x.height}`).join(', ') : 'none'}${notes.length ? ' · ' + notes.join(', ') : ''}<br>
${wide.length ? `<span style="color:#b91c1c">⚠ ${wide.length} line(s) longer than ${CHARS} chars — a real ${PAPER_MM} mm printer wraps these (highlighted red)</span>` : '✓ no line is wider than the paper'}</div>
<div class="paper">${body}</div>`;
}

let jobNo = 0;
const server = net.createServer((sock) => {
  const from = `${sock.remoteAddress}`.replace('::ffff:', '');
  let chunks = [], idle = null;
  const finish = () => {
    if (!chunks.length) return;
    const buf = Buffer.concat(chunks); chunks = [];
    // The app checks "is a printer there?" with a quick HTTP request — not a print job.
    if (/^(HEAD|GET|POST|OPTIONS) \S+ HTTP\//.test(buf.slice(0, 32).toString('latin1'))) { console.log(`   (connection check from ${from} — ignored)`); return; }
    const { blocks, notes } = parse(buf);
    const time = new Date().toLocaleTimeString();
    const file = path.join(OUT_DIR, `print-${Date.now()}-${++jobNo}.html`);
    fs.writeFileSync(file, render(blocks, notes, { from, time, bytes: buf.length }));
    fs.writeFileSync(file.replace(/\.html$/, '.bin'), buf);
    const imgs = blocks.filter(b => b.kind === 'image').length;
    console.log(`🧾 ${time} print from ${from}: ${buf.length} bytes, ${blocks.filter(b => b.kind === 'text').length} lines, ${imgs} image(s) → ${file}`);
    if (OPEN) exec(`open "${file}"`);
  };
  sock.on('data', (d) => { chunks.push(d); clearTimeout(idle); idle = setTimeout(finish, 1500); }); // one job = burst of data
  sock.on('end', () => { clearTimeout(idle); finish(); });
  sock.on('error', () => {});
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  console.log(`🖨  Virtual ${PAPER_MM} mm printer listening on port ${PORT}`);
  console.log(`   In the app add a WiFi/network printer → IP ${ips.join(' or ')} → port ${PORT}`);
  console.log(`   Prints are saved to ${OUT_DIR}`);
});
