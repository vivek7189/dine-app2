#!/usr/bin/env node
// Virtual Thermal Printer — receives ESC/POS print data from dine-app over WiFi
// Usage: node virtual-printer.js
//
// The dine-app (iPhone) discovers this via Bonjour or subnet scan on port 9100.
// Connect from dine-app's Print Settings → Scan Network Printers → select this Mac.

const net = require('net');
const os = require('os');

// Support --port=XXXX or --port XXXX CLI arg (default 9100)
const portArg = process.argv.find(a => a.startsWith('--port='))?.split('=')[1]
  || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : null);
const PORT = parseInt(portArg || '9100', 10);

// --- Get local IP address ---
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

// --- Strip ESC/POS control codes for readable terminal output ---
function stripESCPOS(buffer) {
  const bytes = Buffer.from(buffer);
  let text = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x1B) {
      // ESC sequence — skip ESC + next byte (+ possible params)
      i++;
      if (i < bytes.length) {
        const cmd = bytes[i];
        // Some ESC commands have additional data bytes
        if (cmd === 0x40) { i++; continue; } // ESC @ (init)
        if (cmd === 0x61) { i += 2; continue; } // ESC a n (alignment)
        if (cmd === 0x45) { i += 2; continue; } // ESC E n (bold)
        if (cmd === 0x21) { i += 2; continue; } // ESC ! n (font mode)
        if (cmd === 0x4D) { i += 2; continue; } // ESC M n (font)
        if (cmd === 0x64) { i += 2; continue; } // ESC d n (feed lines)
        if (cmd === 0x4A) { i += 2; continue; } // ESC J n (feed dots)
        if (cmd === 0x33) { i += 2; continue; } // ESC 3 n (line spacing)
        if (cmd === 0x32) { i++; continue; } // ESC 2 (default spacing)
        if (cmd === 0x70) { i += 4; continue; } // ESC p (cash drawer)
        i++; continue;
      }
      continue;
    }
    if (b === 0x1D) {
      // GS sequence
      i++;
      if (i < bytes.length) {
        const cmd = bytes[i];
        if (cmd === 0x21) { i += 2; continue; } // GS ! (char size)
        if (cmd === 0x42) { i += 2; continue; } // GS B (reverse)
        if (cmd === 0x56) { i += 2; continue; } // GS V (cut)
        if (cmd === 0x48) { i += 2; continue; } // GS H (HRI position)
        if (cmd === 0x66) { i += 2; continue; } // GS f (HRI font)
        if (cmd === 0x68) { i += 2; continue; } // GS h (barcode height)
        if (cmd === 0x77) { i += 2; continue; } // GS w (barcode width)
        i++; continue;
      }
      continue;
    }
    // Normal printable character or newline
    if (b === 0x0A) {
      text += '\n';
    } else if (b === 0x0D) {
      // carriage return — skip
    } else if (b >= 0x20 && b < 0x7F) {
      text += String.fromCharCode(b);
    }
    i++;
  }
  return text;
}

// --- TCP Server (RAW printer protocol on port 9100) ---
const server = net.createServer((socket) => {
  // Keep connection alive like a real thermal printer
  socket.setKeepAlive(true, 10000); // send keepalive every 10s
  socket.setTimeout(0); // no timeout — stay connected indefinitely

  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[Connected] ${remote}`);

  let totalBytes = 0;
  let printTimeout = null;
  let jobCount = 0;

  let jobBytes = 0;
  let isNewJob = true;

  socket.on('data', (data) => {
    totalBytes += data.length;
    jobBytes += data.length;
    const text = stripESCPOS(data);
    if (text.trim()) {
      if (isNewJob) {
        jobCount++;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`PRINT JOB #${jobCount} from ${remote}`);
        console.log(`Time: ${new Date().toLocaleString()}`);
        console.log('='.repeat(60));
        isNewJob = false;
      }
      process.stdout.write(text);
    }
    // Reset idle timer — print job is "done" after 500ms of no data
    if (printTimeout) clearTimeout(printTimeout);
    printTimeout = setTimeout(() => {
      console.log('\n' + '='.repeat(60));
      console.log(`Print job complete (${jobBytes} bytes)`);
      console.log('='.repeat(60) + '\n');
      jobBytes = 0;
      isNewJob = true;
    }, 500);
  });

  socket.on('end', () => {
    if (printTimeout) clearTimeout(printTimeout);
    console.log(`[Disconnected] ${remote} (total: ${totalBytes} bytes)`);
  });

  socket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error('Socket error:', err.message);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('='.repeat(60));
  console.log('  VIRTUAL THERMAL PRINTER');
  console.log('='.repeat(60));
  console.log(`  Listening on: ${ip}:${PORT}`);
  console.log('');
  console.log('  How to connect from dine-app:');
  console.log('  1. Go to Print Settings');
  console.log('  2. Tap "Scan Network Printers"');
  console.log(`  3. Select this Mac (${ip})`);
  console.log('  4. Or manually enter the IP above');
  console.log('');
  console.log('  Waiting for print jobs...');
  console.log('='.repeat(60));
  console.log('');

  // --- Bonjour/mDNS advertisement ---
  // The dine-app scans for '_pdl-datastream._tcp' via Zeroconf
  try {
    const { execSync } = require('child_process');
    // Use dns-sd to register (built into macOS)
    const { spawn } = require('child_process');
    const serviceName = PORT === 9100 ? 'DineOpen Virtual Printer' : `DineOpen Virtual Printer (${PORT})`;
    const mdns = spawn('dns-sd', [
      '-R', serviceName, '_pdl-datastream._tcp', 'local', String(PORT)
    ], { stdio: 'ignore', detached: true });
    mdns.unref();
    console.log(`Bonjour: Advertising as "${serviceName}" (_pdl-datastream._tcp)`);
    console.log('         dine-app should auto-discover this printer on WiFi scan.\n');

    // Clean up on exit
    process.on('SIGINT', () => {
      try { mdns.kill(); } catch {}
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      try { mdns.kill(); } catch {}
      process.exit(0);
    });
  } catch (err) {
    console.log('Bonjour: Could not advertise (dns-sd not available).');
    console.log('         Use manual IP connection instead.\n');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or use a different port.`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
