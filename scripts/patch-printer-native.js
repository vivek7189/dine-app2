// Patches react-native-thermal-receipt-printer native code for Android/iOS compatibility and
// reliable Bluetooth connection/write acknowledgement. Keep all fixes here (rather than editing
// node_modules by hand) because EAS/local clean builds reinstall the dependency.
// USBPrinterAdapter.java: registerReceiver() needs RECEIVER_NOT_EXPORTED flag on API 33+
// BLEPrinterAdapter.java: Bluetooth API calls need try-catch for SecurityException

const fs = require('fs');
const path = require('path');

const USB_FILE = path.join(
  __dirname,
  '../node_modules/react-native-thermal-receipt-printer/android/src/main/java/com/pinmi/react/printer/adapter/USBPrinterAdapter.java'
);

const BLE_FILE = path.join(
  __dirname,
  '../node_modules/react-native-thermal-receipt-printer/android/src/main/java/com/pinmi/react/printer/adapter/BLEPrinterAdapter.java'
);

const DIST_FILE = path.join(
  __dirname,
  '../node_modules/react-native-thermal-receipt-printer/dist/index.js'
);

const IOS_BLE_FILE = path.join(
  __dirname,
  '../node_modules/react-native-thermal-receipt-printer/ios/RNBLEPrinter.m'
);

// --- Patch USBPrinterAdapter ---
if (fs.existsSync(USB_FILE)) {
  let usb = fs.readFileSync(USB_FILE, 'utf8');

  // Add Build import if missing
  if (!usb.includes('import android.os.Build;')) {
    usb = usb.replace(
      'import android.hardware.usb.UsbConstants;',
      'import android.hardware.usb.UsbConstants;\nimport android.os.Build;'
    );
  }

  // Fix registerReceiver for Android 14+
  if (usb.includes('mContext.registerReceiver(mUsbDeviceReceiver, filter);') && !usb.includes('RECEIVER_NOT_EXPORTED')) {
    usb = usb.replace(
      'mContext.registerReceiver(mUsbDeviceReceiver, filter);',
      `// Android 14+ (API 34) requires RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED flag
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            mContext.registerReceiver(mUsbDeviceReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            mContext.registerReceiver(mUsbDeviceReceiver, filter);
        }`
    );
    fs.writeFileSync(USB_FILE, usb, 'utf8');
    console.log('✅ Patched USBPrinterAdapter.java (registerReceiver fix)');
  } else {
    console.log('✅ USBPrinterAdapter.java already patched or not needed');
  }
} else {
  console.log('⚠️  USBPrinterAdapter.java not found (skipping)');
}

// --- Patch BLEPrinterAdapter ---
if (fs.existsSync(BLE_FILE)) {
  let ble = fs.readFileSync(BLE_FILE, 'utf8');

  // Check if init() already has try-catch wrapping
  if (ble.includes('if(!bluetoothAdapter.isEnabled())') && !ble.includes('DINEOPEN_BT_INIT_GUARD')) {
    // Wrap init method body in try-catch. Regex tolerates the dependency's CRLF line endings.
    ble = ble.replace(
      /this\.mContext = reactContext;\s*BluetoothAdapter bluetoothAdapter = getBTAdapter\(\);\s*if\(bluetoothAdapter == null\) \{\s*errorCallback\.invoke\("No bluetooth adapter available"\);\s*return;\s*}\s*if\(!bluetoothAdapter\.isEnabled\(\)\) \{\s*errorCallback\.invoke\("bluetooth adapter is not enabled"\);\s*return;\s*}else\{\s*successCallback\.invoke\(\);\s*}/,
      `this.mContext = reactContext;
        // DINEOPEN_BT_INIT_GUARD
        try {
            BluetoothAdapter bluetoothAdapter = getBTAdapter();
            if(bluetoothAdapter == null) {
                errorCallback.invoke("No bluetooth adapter available");
                return;
            }
            if(!bluetoothAdapter.isEnabled()) {
                errorCallback.invoke("bluetooth adapter is not enabled");
                return;
            }else{
                successCallback.invoke();
            }
        } catch (Exception e) {
            errorCallback.invoke("Bluetooth error: " + e.getMessage());
        }`
    );
    console.log('✅ Patched BLEPrinterAdapter.java (try-catch for SecurityException)');
  } else {
    console.log('✅ BLEPrinterAdapter.java already patched or not needed');
  }

  // The upstream adapter swallows IOException on its background write thread. JavaScript then
  // reports a successful KOT even though zero bytes reached the printer. Invoke the existing
  // callback with null after flush, or with the real error on failure.
  if (!ble.includes('DINEOPEN_BT_WRITE_ACK')) {
    ble = ble.replace(
      /(printerOutputStream\.write\(bytes, 0, bytes\.length\);\s*printerOutputStream\.flush\(\);)\s*}\s*catch \(IOException e\)\s*{\s*Log\.e\(LOG_TAG, "failed to print data" \+ rawData\);\s*e\.printStackTrace\(\);\s*}/,
      `$1
                    // DINEOPEN_BT_WRITE_ACK: null means the full payload reached flush().
                    errorCallback.invoke((Object) null);
                } catch (IOException e) {
                    Log.e(LOG_TAG, "failed to print data" + rawData);
                    e.printStackTrace();
                    errorCallback.invoke(e.getMessage() != null ? e.getMessage() : "Bluetooth write failed");
                    closeConnectionIfExists();
                }`
    );
  }

  // view-shot returns file:// URIs. The upstream code casts every URLConnection to
  // HttpURLConnection, which is invalid for local files and can crash image receipt printing.
  if (!ble.includes('DINEOPEN_LOCAL_IMAGE')) {
    ble = ble.replace(
      /public static Bitmap getBitmapFromURL\(String src\)\s*{\s*try\s*{\s*URL url = new URL\(src\);/,
      `public static Bitmap getBitmapFromURL(String src) {
        try {
            // DINEOPEN_LOCAL_IMAGE
            if (src != null && src.startsWith("file://")) {
                return BitmapFactory.decodeFile(src.substring("file://".length()));
            }
            URL url = new URL(src);`
    );
    // Catch ClassCastException and decoding errors too, so JS can safely fall back to text.
    const imageStart = ble.indexOf('// DINEOPEN_LOCAL_IMAGE');
    const imageEnd = imageStart >= 0 ? ble.indexOf('    @Override', imageStart) : -1;
    if (imageStart >= 0 && imageEnd > imageStart) {
      const before = ble.slice(0, imageStart);
      let imageBlock = ble.slice(imageStart, imageEnd);
      imageBlock = imageBlock.replace('} catch (IOException e) {', '} catch (Exception e) {');
      ble = before + imageBlock + ble.slice(imageEnd);
    }
  }

  // Propagate image write completion/failure too. Without this, image receipts (including the
  // automatic ₹ raster path) could fail while JavaScript still displayed success.
  if (!ble.includes('DINEOPEN_BT_IMAGE_ACK')) {
    const methodStart = ble.indexOf('public void printImageData');
    const methodEnd = methodStart >= 0 ? ble.indexOf('public void printQrCode', methodStart) : -1;
    if (methodStart >= 0 && methodEnd > methodStart) {
      const before = ble.slice(0, methodStart);
      let method = ble.slice(methodStart, methodEnd);
      method = method.replace(
        /printerOutputStream\.flush\(\);\s*}\s*catch \(IOException e\)\s*{\s*Log\.e\(LOG_TAG, "failed to print data"\);\s*e\.printStackTrace\(\);\s*}/,
        `printerOutputStream.flush();
            // DINEOPEN_BT_IMAGE_ACK
            errorCallback.invoke((Object) null);
        } catch (IOException e) {
            Log.e(LOG_TAG, "failed to print data");
            e.printStackTrace();
            errorCallback.invoke(e.getMessage() != null ? e.getMessage() : "Bluetooth image write failed");
            closeConnectionIfExists();
        }`
      );
      ble = before + method + ble.slice(methodEnd);
    }
  }

  fs.writeFileSync(BLE_FILE, ble, 'utf8');
} else {
  console.log('⚠️  BLEPrinterAdapter.java not found (skipping)');
}

// --- Patch iOS RNBLEPrinter ---
// Upstream has three reliability problems:
//   1. getDeviceList never resolves when zero printers are found;
//   2. connectPrinter reports success immediately, before CoreBluetooth confirms connection;
//   3. print callbacks fire only for exceptions, so JS cannot distinguish dispatch from failure.
// The SDK exposes connect/disconnect notifications but no hardware write acknowledgement. The
// callback below therefore confirms synchronous dispatch into the SDK (not paper/cutter status).
if (fs.existsSync(IOS_BLE_FILE)) {
  let iosBle = fs.readFileSync(IOS_BLE_FILE, 'utf8');

  if (!iosBle.includes('DINEOPEN_IOS_BT_STATE')) {
    iosBle = iosBle.replace(
      '#import "PrinterSDK.h"',
      `#import "PrinterSDK.h"

// DINEOPEN_IOS_BT_STATE
@interface RNBLEPrinter ()
@property (nonatomic, copy) RCTResponseSenderBlock pendingConnectSuccess;
@property (nonatomic, copy) RCTResponseSenderBlock pendingConnectFailure;
@property (nonatomic, copy) NSString *pendingConnectId;
@property (nonatomic, copy) RCTResponseSenderBlock pendingScanSuccess;
@property (nonatomic, copy) NSString *pendingScanId;
@property (nonatomic, strong) Printer *pendingPrinter;
@end`
    );

    iosBle = iosBle.replace(
      /RCT_EXPORT_METHOD\(init:\(RCTResponseSenderBlock\)successCallback\s+fail:\(RCTResponseSenderBlock\)errorCallback\) \{[\s\S]*?\n\}/,
      `RCT_EXPORT_METHOD(init:(RCTResponseSenderBlock)successCallback
                  fail:(RCTResponseSenderBlock)errorCallback) {
    @try {
        [[PrinterSDK defaultPrinterSDK] stopScanPrinters];
        _printerArray = [NSMutableArray new];
        m_printer = nil;
        NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
        [center removeObserver:self name:PrinterConnectedNotification object:nil];
        [center removeObserver:self name:PrinterDisconnectedNotification object:nil];
        [center removeObserver:self name:@"NetPrinterConnected" object:nil];
        [center addObserver:self selector:@selector(handlePrinterConnectedNotification:) name:PrinterConnectedNotification object:nil];
        [center addObserver:self selector:@selector(handlePrinterDisconnectedNotification:) name:PrinterDisconnectedNotification object:nil];
        [center addObserver:self selector:@selector(handleNetPrinterConnectedNotification:) name:@"NetPrinterConnected" object:nil];
        successCallback(@[@"Init successful"]);
    } @catch (NSException *exception) {
        errorCallback(@[exception.reason ?: @"Bluetooth initialization failed"]);
    }
}`
    );

    iosBle = iosBle.replace(
      /RCT_EXPORT_METHOD\(getDeviceList:\(RCTResponseSenderBlock\)successCallback\s+fail:\(RCTResponseSenderBlock\)errorCallback\) \{[\s\S]*?\n\}/,
      `RCT_EXPORT_METHOD(getDeviceList:(RCTResponseSenderBlock)successCallback
                  fail:(RCTResponseSenderBlock)errorCallback) {
    @try {
        if (!_printerArray) _printerArray = [NSMutableArray new];
        [[PrinterSDK defaultPrinterSDK] stopScanPrinters];
        [_printerArray removeAllObjects];
        NSString *scanId = [[NSUUID UUID] UUIDString];
        self.pendingScanId = scanId;
        self.pendingScanSuccess = successCallback;

        [[PrinterSDK defaultPrinterSDK] scanPrintersWithCompletion:^(Printer *printer) {
            if (![self.pendingScanId isEqualToString:scanId] || !printer.UUIDString) return;
            BOOL exists = NO;
            for (Printer *known in self->_printerArray) {
                if ([known.UUIDString isEqualToString:printer.UUIDString]) { exists = YES; break; }
            }
            if (!exists) [self->_printerArray addObject:printer];
        }];

        // The vendor SDK has no scan-complete callback. Resolve after a bounded window even when
        // no devices are found so the React Native UI can never remain on "Finding printers".
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(4.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (![self.pendingScanId isEqualToString:scanId] || !self.pendingScanSuccess) return;
            [[PrinterSDK defaultPrinterSDK] stopScanPrinters];
            NSMutableArray *mapped = [NSMutableArray arrayWithCapacity:self->_printerArray.count];
            for (Printer *printer in self->_printerArray) {
                [mapped addObject:@{
                    @"device_name": printer.name ?: @"Bluetooth Printer",
                    @"inner_mac_address": printer.UUIDString ?: @""
                }];
            }
            RCTResponseSenderBlock completion = self.pendingScanSuccess;
            self.pendingScanSuccess = nil;
            self.pendingScanId = nil;
            completion(@[mapped]);
        });
    } @catch (NSException *exception) {
        self.pendingScanSuccess = nil;
        self.pendingScanId = nil;
        errorCallback(@[exception.reason ?: @"Bluetooth scan failed"]);
    }
}`
    );

    iosBle = iosBle.replace(
      /RCT_EXPORT_METHOD\(connectPrinter:\(NSString \*\)inner_mac_address\s+success:\(RCTResponseSenderBlock\)successCallback\s+fail:\(RCTResponseSenderBlock\)errorCallback\) \{[\s\S]*?\n\}/,
      `RCT_EXPORT_METHOD(connectPrinter:(NSString *)inner_mac_address
                  success:(RCTResponseSenderBlock)successCallback
                  fail:(RCTResponseSenderBlock)errorCallback) {
    @try {
        __block Printer *selectedPrinter = nil;
        [_printerArray enumerateObjectsUsingBlock:^(Printer *printer, NSUInteger idx, BOOL *stop) {
            if ([inner_mac_address isEqualToString:printer.UUIDString]) {
                selectedPrinter = printer;
                *stop = YES;
            }
        }];
        if (!selectedPrinter) {
            [NSException raise:@"Invalid connection" format:@"Bluetooth printer must be discovered before connecting"];
        }

        NSString *connectId = [[NSUUID UUID] UUIDString];
        self.pendingConnectId = connectId;
        self.pendingConnectSuccess = successCallback;
        self.pendingConnectFailure = errorCallback;
        self.pendingPrinter = selectedPrinter;
        m_printer = nil;
        [[PrinterSDK defaultPrinterSDK] connectBT:selectedPrinter];

        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(10.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if (![self.pendingConnectId isEqualToString:connectId] || !self.pendingConnectFailure) return;
            RCTResponseSenderBlock failure = self.pendingConnectFailure;
            self.pendingConnectSuccess = nil;
            self.pendingConnectFailure = nil;
            self.pendingConnectId = nil;
            self.pendingPrinter = nil;
            // DINEOPEN_IOS_BT_TIMEOUT
            self->m_printer = nil;
            [[PrinterSDK defaultPrinterSDK] disconnect];
            failure(@[@"Bluetooth connection timed out. Keep the printer on and nearby, then try again."]);
        });
    } @catch (NSException *exception) {
        self.pendingConnectSuccess = nil;
        self.pendingConnectFailure = nil;
        self.pendingConnectId = nil;
        self.pendingPrinter = nil;
        errorCallback(@[exception.reason ?: @"Bluetooth connection failed"]);
    }
}`
    );

    iosBle = iosBle.replace(
      /RCT_EXPORT_METHOD\(closeConn\) \{\s*@try \{[\s\S]*?\n\}/,
      `RCT_EXPORT_METHOD(closeConn) {
    @try {
        self.pendingConnectSuccess = nil;
        self.pendingConnectFailure = nil;
        self.pendingConnectId = nil;
        self.pendingPrinter = nil;
        [[PrinterSDK defaultPrinterSDK] stopScanPrinters];
        [[PrinterSDK defaultPrinterSDK] disconnect];
        m_printer = nil;
    } @catch (NSException *exception) {
        NSLog(@"%@", exception.reason);
    }
}`
    );

    fs.writeFileSync(IOS_BLE_FILE, iosBle, 'utf8');
    console.log('✅ Patched iOS BLE discovery, connection confirmation and dispatch callback');
  } else {
    console.log('✅ iOS BLE bridge already patched');
  }

  // Keep these sub-patches independently idempotent. This also upgrades installations that ran
  // an earlier version of this patch script before every reliability fix was added.
  if (!iosBle.includes('- (void)handlePrinterConnectedNotification:')) {
    iosBle = iosBle.replace(
      /- \(void\)handleNetPrinterConnectedNotification:\(NSNotification\*\)notification\s*\{\s*m_printer = nil;\s*\}/,
      `- (void)handleNetPrinterConnectedNotification:(NSNotification*)notification
{
    m_printer = nil;
}

- (void)handlePrinterConnectedNotification:(NSNotification*)notification
{
    if (!self.pendingConnectSuccess || !self.pendingPrinter) return;
    m_printer = self.pendingPrinter;
    RCTResponseSenderBlock success = self.pendingConnectSuccess;
    self.pendingConnectSuccess = nil;
    self.pendingConnectFailure = nil;
    self.pendingConnectId = nil;
    self.pendingPrinter = nil;
    [[NSNotificationCenter defaultCenter] postNotificationName:@"BLEPrinterConnected" object:nil];
    success(@[@"Bluetooth printer connected"]);
}

- (void)handlePrinterDisconnectedNotification:(NSNotification*)notification
{
    m_printer = nil;
}

- (void)dealloc
{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
}`
    );
  }

  if (!iosBle.includes('DINEOPEN_IOS_BT_WRITE_ACK')) {
    iosBle = iosBle.replace(
      /(RCT_EXPORT_METHOD\(printRawData:[\s\S]*?cut \? \[\[PrinterSDK defaultPrinterSDK\] cutPaper\] : nil;)/,
      `$1
        // DINEOPEN_IOS_BT_WRITE_ACK: confirms dispatch into the vendor SDK.
        errorCallback(@[[NSNull null]]);`
    );
  }

  if (!iosBle.includes('DINEOPEN_IOS_BT_TIMEOUT')) {
    iosBle = iosBle.replace(
      /self\.pendingPrinter = nil;\s*m_printer = nil;\s*\[\[PrinterSDK defaultPrinterSDK\] disconnect\];\s*failure\(/,
      `self.pendingPrinter = nil;
            // DINEOPEN_IOS_BT_TIMEOUT
            self->m_printer = nil;
            [[PrinterSDK defaultPrinterSDK] disconnect];
            failure(`
    );
  }

  if (!iosBle.includes('DINEOPEN_IOS_BT_IMAGE_ACK')) {
    const imageStart = iosBle.indexOf('RCT_EXPORT_METHOD(printImageData:');
    const imageEnd = imageStart >= 0 ? iosBle.indexOf('-(UIImage *)getPrintImage:', imageStart) : -1;
    if (imageStart >= 0 && imageEnd > imageStart) {
      const before = iosBle.slice(0, imageStart);
      let imageMethod = iosBle.slice(imageStart, imageEnd);
      imageMethod = imageMethod.replace(
        /if\(imageData != nil\)\{([\s\S]*?)\n        \}/,
        `if(imageData != nil){$1
            // DINEOPEN_IOS_BT_IMAGE_ACK
            errorCallback(@[[NSNull null]]);
        } else {
            errorCallback(@[@"Could not load receipt image"]);
        }`
      );
      iosBle = before + imageMethod + iosBle.slice(imageEnd);
    }
  }

  fs.writeFileSync(IOS_BLE_FILE, iosBle, 'utf8');
} else {
  console.log('⚠️  iOS RNBLEPrinter.m not found (skipping)');
}

// Make Android BLE printText/printBill return a Promise. The native callback now fires only after
// flush (or on a real write error), allowing printerService to distinguish dispatched from written.
if (fs.existsSync(DIST_FILE)) {
  let dist = fs.readFileSync(DIST_FILE, 'utf8');
  if (!dist.includes('DINEOPEN_BT_WRITE_PROMISE')) {
    dist = dist.replace(
      /else \{\s*RNBLEPrinter\.printRawData\(textTo64Buffer\(text, opts\), function \(error\) \{\s*return console\.warn\(error\);\s*}\);\s*}/,
      `else {
            // DINEOPEN_BT_WRITE_PROMISE
            return new Promise(function (resolve, reject) {
                RNBLEPrinter.printRawData(textTo64Buffer(text, opts), function (error) {
                    return error ? reject(new Error(String(error))) : resolve();
                });
            });
        }`
    );
    dist = dist.replace(
      /else \{\s*RNBLEPrinter\.printRawData\(billTo64Buffer\(text, opts\), function \(error\) \{\s*return console\.warn\(error\);\s*}\);\s*}/,
      `else {
            return new Promise(function (resolve, reject) {
                RNBLEPrinter.printRawData(billTo64Buffer(text, opts), function (error) {
                    return error ? reject(new Error(String(error))) : resolve();
                });
            });
        }`
    );
    fs.writeFileSync(DIST_FILE, dist, 'utf8');
    console.log('✅ Patched BLE JS wrapper (write acknowledgement Promise)');
  } else {
    console.log('✅ BLE JS wrapper already patched');
  }

  // OTA compatibility: an older installed APK does not yet contain the native acknowledgement
  // callback. Resolve after a short grace period on those binaries; new APKs settle immediately
  // from the real flush callback. Without this guard, a JS-only OTA would time out every print.
  if (dist.includes('DINEOPEN_BT_WRITE_PROMISE') && !dist.includes('DINEOPEN_BT_OTA_FALLBACK')) {
    const addCompatFallback = (bufferCall, includeMarker = false) => {
      const escaped = bufferCall.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        `return new Promise\\(function \\(resolve, reject\\) \\{\\s*RNBLEPrinter\\.printRawData\\(${escaped}, function \\(error\\) \\{\\s*return error \\? reject\\(new Error\\(String\\(error\\)\\)\\) : resolve\\(\\);\\s*}\\);\\s*}\\);`
      );
      dist = dist.replace(re, `return new Promise(function (resolve, reject) {
                ${includeMarker ? '// DINEOPEN_BT_OTA_FALLBACK\n                ' : ''}var settled = false;
                var fallback = setTimeout(function () {
                    if (!settled) { settled = true; resolve(); }
                }, 1200);
                RNBLEPrinter.printRawData(${bufferCall}, function (error) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fallback);
                    return error ? reject(new Error(String(error))) : resolve();
                });
            });`);
    };
    addCompatFallback('textTo64Buffer(text, opts)', true);
    addCompatFallback('billTo64Buffer(text, opts)');
    fs.writeFileSync(DIST_FILE, dist, 'utf8');
    console.log('✅ Added BLE OTA compatibility fallback');
  }

  // iOS uses the same one-callback native signature. New builds invoke it with null after the
  // payload is dispatched to PrinterSDK; older installed builds remain OTA-compatible via the
  // grace-period resolve. Native exceptions reject immediately on both generations.
  if (!dist.includes('DINEOPEN_IOS_BT_WRITE_PROMISE')) {
    const iosPromise = (processedDecl) => `${processedDecl}
            // DINEOPEN_IOS_BT_WRITE_PROMISE
            return new Promise(function (resolve, reject) {
                var settled = false;
                var fallback = setTimeout(function () {
                    if (!settled) { settled = true; resolve(); }
                }, 1200);
                RNBLEPrinter.printRawData(processedText.text, processedText.opts, function (error) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(fallback);
                    return error ? reject(new Error(String(error))) : resolve();
                });
            });`;
    const oldIOSDispatch = /var processedText = textPreprocessingIOS\(text\);\s*RNBLEPrinter\.printRawData\(processedText\.text, processedText\.opts, function \(error\) \{ return console\.warn\(error\); \}\);/g;
    dist = dist.replace(oldIOSDispatch, () => iosPromise('var processedText = textPreprocessingIOS(text);'));
    fs.writeFileSync(DIST_FILE, dist, 'utf8');
    console.log('✅ Patched iOS BLE JS wrapper (dispatch Promise + OTA fallback)');
  } else {
    console.log('✅ iOS BLE JS wrapper already patched');
  }
}
