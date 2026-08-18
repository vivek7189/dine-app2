# dine-app Print Flow (auto / silent) — reference

> Captured before the billing-parity changes (delivery assignment, SC override, split bill)
> so the auto/silent + remote print behavior can be revisited if a change regresses it.
> **Golden rule: never change the data contract below — only add to it.**

## 1. Central print entry
`services/printerService.js` → **`printWithFeedback({ html, text, silentOnly, label })`**.
- **Remote print enabled** (`getRemotePrintEnabled()`): returns success **without local printing** — the desktop/KOT-printer app prints from **Firebase RTDB** using the **order record**. ⇒ For remote customers, the `createOrder`/`verifyPayment` payload totals MUST be correct; the local `text` is unused.
- **Local print**: silent print to the configured printer (BLE / WiFi / USB / AirPrint). `silentOnly:true` = no dialog.
- Every manual Bill/KOT reprint must check `getRemotePrintEnabled()` first. Desktop Print ON uses
  `apiClient.triggerPrint(orderId, type)`; Desktop Print OFF uses `printWithFeedback`. Never show a
  generic “queued” success before choosing that route and receiving its result.
- Debug: if `~/Desktop/DineOpen-Prints/` exists (or `DINEOPEN_DEBUG_PRINT=1`), every job is also saved as a PDF (per station for KOT) — used for verification without a real printer.

## 2. Bill print
- **Triggers** (in `screens/MenuNative.js`): the place-order→invoice path and `handleCompleteBill`, both guarded by `printSettings?.autoPrintOnBilling !== false`:
  `printerService.generateBillText(invoiceData)` → `printWithFeedback({ text, silentOnly:true, label:'Bill' })`.
- **`invoiceData`** is assembled in `MenuNative.js` (the bill-print object). It is fed by `discountData` (from `CartModal.buildDiscountData()`) + local fallbacks.
- **Load-bearing fields the bill printer reads** (`generateBillText`, totals section): `subtotal`, `offerDiscount`, `manualDiscount`, `loyaltyDiscount`, `serviceChargeAmount`, `taxBreakdown` (array of `{name,rate,amount,inclusive}`; fallback `taxEnabled/tax/taxLabel/taxRate`), `tipAmount`, `roundOffAmount`, `grandTotal`; per-item `item.quantity/price/total`; payment `cashReceived/changeReturned`. Units = rupees, 2-dp; `item.total = price*quantity`.

## 3. KOT print
- **Triggers** (`MenuNative.js`), guarded by `printSettings?.autoPrintOnKOT !== false`.
- **Routing**: multi-station (`printStationCount >= 2 && localKotPrintingOn`) → `services/multiPrinterService.js` `printKOTsByStation`; single station → `generateKOTText` + `printWithFeedback`.
- KOT consumes **item name/qty/notes/variant/customizations only** — **NOT totals/tax**. So billing-total changes never affect KOT.

## 4. The data contract to preserve
```
useBillingCalculation(...) → returns { totalDiscount, discountedSubtotal, serviceChargeAmount,
  serviceChargeRate, taxableAmount, taxBreakdown[{name,rate,amount,inclusive}], totalTax,
  roundOffAmount, grandTotal }
     ↓ (CartModal.buildDiscountData forwards these, unchanged keys)
   discountData
     ↓
   (a) invoiceData → generateBillText  → LOCAL bill print
   (b) createOrder / verifyPayment payload (finalAmount, taxBreakdown, …) → REMOTE bill print (RTDB)
```
Change the internal math / add features freely, but **keep these field names + numeric units intact** and both local + remote printing keep working.

## 5. Rules when adding print (e.g. Split Bill per-guest receipts)
- Build each receipt's text via the SAME `generateBillText(invoiceLike)` with the same field names, per split share.
- Print each with `printWithFeedback({ text, silentOnly:true, label:'Bill (split N/M)' })`.
- Respect `autoPrintOnBilling`.
- For remote customers, per-guest *local* receipts won't fire (remote path) — the single order record still drives the remote print; split receipts are a local convenience. Document any divergence.

## 6. Bluetooth reliability contract
- A saved Bluetooth printer is paired configuration, **not** proof of a live connection.
- Every local Bluetooth job must go through `printContent`, which opens a fresh RFCOMM socket before
  dispatch. Do not call the native module directly from screens.
- Android native write acknowledgement is installed by `scripts/patch-printer-native.js`; keep that
  script in `postinstall` and native build commands. It reports success after `OutputStream.flush()`
  and reports write exceptions back to JavaScript. Older APKs retain a timed compatibility fallback
  so an OTA update cannot stop their printing.
- iOS BLE scans always finish after a bounded window, including the zero-device case, and native
  connection success is reported only after `PrinterConnectedNotification`. On a cold app start,
  the saved CoreBluetooth UUID is rediscovered once so the vendor SDK can recreate its opaque
  `Printer` object before reconnecting. New iOS builds also return synchronous SDK-dispatch errors
  to JavaScript; older installed builds retain the same OTA-compatible grace period.
- iOS discovers nearby BLE peripherals in-app. It does not use Android's paired-device list, and a
  Bluetooth Classic-only thermal printer may work on Android while being unavailable on iPhone.
- `printWithFeedback` persists an unfinished job before dispatch and removes it on success. Failed or
  interrupted jobs are retried only by explicit staff action, never automatically after app restart,
  because printers without paper-status acknowledgement cannot rule out duplicate output.
- “Connection verified” means socket/write transport is working. Low-cost printers may not expose
  paper-out, open-cover, cutter or battery status; the UI must not claim those physical states.
