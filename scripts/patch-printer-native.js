// Patches react-native-thermal-receipt-printer native code for Android 14+ compatibility
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
  if (ble.includes('if(!bluetoothAdapter.isEnabled())') && !ble.includes('catch (Exception e)')) {
    // Wrap init method body in try-catch
    ble = ble.replace(
      `this.mContext = reactContext;
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
        }`,
      `this.mContext = reactContext;
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
    fs.writeFileSync(BLE_FILE, ble, 'utf8');
    console.log('✅ Patched BLEPrinterAdapter.java (try-catch for SecurityException)');
  } else {
    console.log('✅ BLEPrinterAdapter.java already patched or not needed');
  }
} else {
  console.log('⚠️  BLEPrinterAdapter.java not found (skipping)');
}
