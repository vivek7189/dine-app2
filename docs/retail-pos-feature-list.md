# Retail POS / Billing System - Comprehensive Feature List

**Target:** Indian small-to-medium clothing stores, general retail, and small chains (2-15 stores)

**Competitive landscape researched:** GoFrugal, Vyapar, myBillBook, Petpooja Invoice, Lightspeed Retail, Square for Retail, Ginesys, Khata Billing, VasyERP, Zoho POS

---

## Priority Legend

| Tag | Meaning |
|-----|---------|
| **MVP** | Must have for launch. Without this, the product is not usable by target users. |
| **P2** | Phase 2. Important for retention and growth. Ship within 2-3 months post-launch. |
| **P3** | Phase 3. Differentiator / nice-to-have. Ship based on user demand. |

---

## 1. BILLING / CHECKOUT

This is the most-used screen. Speed is everything. Indian shopkeepers bill 50-200 transactions/day and expect sub-3-second item addition.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1.1 | **Barcode scan to add item** | MVP | Must support USB barcode scanners and camera-based scanning on mobile. GoFrugal, Petpooja, Square all treat this as table-stakes. |
| 1.2 | **Manual product search** (by name, SKU, or code) | MVP | Fuzzy search with keyboard shortcuts. MyBillBook emphasizes "keyboard-only billing" where cashier never touches the mouse. |
| 1.3 | **Quick-add / favorite items** | MVP | Configurable grid of frequently sold items for fast tap-to-add. Critical for stores without barcode on every item. |
| 1.4 | **Quantity adjustment** (+/-, manual entry) | MVP | Per line item. Support decimal quantities for fabric/kg items. |
| 1.5 | **Item-level discount** (flat Rs or %) | MVP | Cashier applies discount per item. Optional: manager approval if discount exceeds a threshold (GoFrugal does this). |
| 1.6 | **Bill-level discount** (flat Rs or %) | MVP | Applied after subtotal. Common in Indian retail for "round figure" haggling. |
| 1.7 | **GST calculation: CGST/SGST** (intra-state) | MVP | Auto-calculated based on product's HSN code and tax slab. Slabs: 0%, 5%, 12%, 18%, 28%. Clothing under Rs 1000 is 5% GST; above Rs 1000 is 12% GST. |
| 1.8 | **GST calculation: IGST** (inter-state) | MVP | Triggered when customer's state differs from business state. Must show on invoice. |
| 1.9 | **Payment: Cash** | MVP | With cash tendering (amount received, change to return). |
| 1.10 | **Payment: UPI** | MVP | India-specific. Record UPI reference number. Optional: QR code display for customer to scan. |
| 1.11 | **Payment: Card** (credit/debit) | MVP | Record last 4 digits or approval code. |
| 1.12 | **Split payment** (multiple methods on one bill) | MVP | Very common in India: partial cash + partial UPI. Every competitor supports this. |
| 1.13 | **Customer lookup during billing** (phone number) | MVP | Quick search by mobile number. Auto-fill name, apply loyalty, show credit balance. |
| 1.14 | **Print receipt** (thermal printer 58mm/80mm) | MVP | Must support standard ESC/POS thermal printers. Receipt should show business name, GSTIN, HSN-wise tax breakup, and payment method. |
| 1.15 | **Receipt round-off** (to nearest Rs 1) | MVP | Standard in India. Auto round-off with configurable rules. Show round-off amount on receipt. |
| 1.16 | **Salesperson tagging per bill** | MVP | Assign which salesperson assisted. Critical for commission tracking in clothing stores. GoFrugal auto-calculates commissions based on this. |
| 1.17 | **Hold bill / Park sale** | MVP | Save current bill, serve another customer, resume later. Essential in clothing stores where customers try items. Multiple held bills simultaneously. |
| 1.18 | **Share receipt on WhatsApp** | P2 | Very high demand in India. Vyapar and myBillBook both offer this. Note: Vyapar users complain about blank PDF issues -- must be reliable. |
| 1.19 | **Share receipt via SMS/Email** | P2 | Less used than WhatsApp but needed for compliance and B2B customers. |
| 1.20 | **Discount approval workflow** | P2 | Cashier requests discount above threshold, manager approves via PIN or notification. GoFrugal and Ginesys both do this. |
| 1.21 | **Bill narration / notes** | P2 | Free-text note on the bill (e.g., "alteration pending", "delivery on Monday"). |
| 1.22 | **Multiple price lists on billing screen** | P2 | Switch between MRP/wholesale/staff price during billing. GoFrugal supports this. |
| 1.23 | **E-invoice generation** (for B2B over Rs 5 Cr turnover) | P2 | Generate IRN via GST portal API. Petpooja Invoice supports this. Required by law above threshold. |
| 1.24 | **Keyboard shortcuts for all billing actions** | MVP | Number keys for quantity, F-keys for payment modes, Enter to complete. myBillBook emphasizes this for speed. |
| 1.25 | **Offline billing with sync** | P2 | Vyapar's biggest advantage. Indian shops have unreliable internet. Queue bills offline and sync when online. |
| 1.26 | **Customer display (pole display / second screen)** | P3 | Show itemized bill to customer on a secondary display. |
| 1.27 | **Touch-screen optimized layout** | P2 | For tablet-based POS. Larger buttons, swipe gestures. |
| 1.28 | **Weighing scale integration** | P3 | For stores selling by weight (fabric by meter, dry fruits by kg). |

### What users complain about (billing):
- **Vyapar**: Barcode printing issues, app hangs during peak billing hours, blank WhatsApp invoices
- **GoFrugal**: Steep learning curve, support issues after purchase
- **General**: Slow search, inability to handle variants quickly, no offline mode

---

## 2. PRODUCT / CATALOG MANAGEMENT

Indian clothing stores have high SKU complexity: one shirt design comes in 5 sizes x 4 colors = 20 SKUs. The system must handle this without making the shopkeeper create 20 separate products.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 2.1 | **Product with variants** (size, color, material, style) | MVP | Matrix-style entry: define one product, select sizes (S/M/L/XL/XXL or 28-42) and colors, system auto-generates all variant combinations. Lightspeed and GoFrugal excel at this. |
| 2.2 | **Category / subcategory hierarchy** | MVP | E.g., Men > Shirts > Formal. At least 3 levels. |
| 2.3 | **HSN code mapping per product** | MVP | Link HSN code to product or category level. Auto-populates GST rate. Built-in HSN code database for common retail items. |
| 2.4 | **Barcode generation** | MVP | Auto-generate unique barcodes (EAN-13 or Code 128) for each variant. Or accept manufacturer barcodes. |
| 2.5 | **Barcode assignment** (manufacturer barcode) | MVP | Scan and assign existing barcodes from branded products. |
| 2.6 | **Multiple prices per product** (MRP, selling price, wholesale, staff) | MVP | MRP is the legal maximum. Selling price can be lower. Wholesale price for B2B customers. |
| 2.7 | **Unit of measurement** | MVP | Pieces (default for clothing), meters (fabric), kg, pairs (shoes), sets, dozens. |
| 2.8 | **Bulk import from Excel/CSV** | MVP | Upload product catalog via spreadsheet. Must handle variants. Template download provided. |
| 2.9 | **Product images** | P2 | Upload product photos. Useful for staff reference and future e-commerce sync. |
| 2.10 | **Brand field** | P2 | Track which brand a product belongs to. Filter and report by brand. |
| 2.11 | **Season / collection tagging** | P2 | Tag products as Summer 2026, Winter 2026, etc. Helps identify dead stock by season. |
| 2.12 | **Composite / bundled products** | P2 | Create a "set" (e.g., shirt + tie combo) priced differently from individual items. Lightspeed supports this. |
| 2.13 | **Product duplication** | P2 | Clone a product and modify. Saves time when adding similar items. |
| 2.14 | **Bulk price update** | P2 | Update prices for entire category or brand in one action. |
| 2.15 | **Custom fields** | P3 | User-defined attributes (e.g., fabric type, wash care, origin country). Lightspeed has this. |
| 2.16 | **Product-level notes** (internal) | P3 | Notes visible only to staff (e.g., "runs small, suggest size up"). |
| 2.17 | **Auto-SKU generation** | MVP | System generates SKU codes based on configurable rules (category+brand+size+color). |

### Indian-specific needs:
- GST rate changes by price point: clothing below Rs 1000 = 5% GST, above Rs 1000 = 12% GST. System must handle this automatically.
- MRP is legally required on invoice. Many POS systems don't distinguish MRP from selling price.
- Multi-lingual product names (Hindi/regional language support) is a differentiator.

---

## 3. INVENTORY MANAGEMENT

Indian clothing stores lose 2-5% revenue to inventory mismanagement. Stock visibility across variants is the number one pain point.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 3.1 | **Real-time stock tracking per variant/SKU** | MVP | Every sale, purchase, return, adjustment updates stock immediately. Stock shown as color-size matrix view. |
| 3.2 | **Low stock alerts** | MVP | Configurable minimum stock level per product or category. Push notification + dashboard alert. |
| 3.3 | **Stock adjustment** (damage, theft, personal use, samples) | MVP | Record stock decreases with reason codes. Audit trail of who adjusted what. |
| 3.4 | **Stock count / Physical inventory audit** | MVP | Generate count sheet (print or mobile), staff counts physical stock, system compares with recorded stock, shows discrepancies. Square's "Quick Inventory Counting" via barcode scan is the gold standard. |
| 3.5 | **Barcode label printing** | MVP | Print barcode stickers for products. Support common label sizes (38x25mm, 50x25mm). Must work with TSC, Zebra, and generic thermal label printers popular in India. Include: product name, size, color, price, barcode. |
| 3.6 | **Stock transfer between locations** | P2 | For multi-store. Create transfer request, dispatch from source, receive at destination. Track in-transit stock. GoFrugal and Ginesys handle this well. |
| 3.7 | **Batch/lot tracking** | P3 | Less critical for clothing. Important for cosmetics, food retail. Track batch number and expiry date. |
| 3.8 | **Opening stock entry** | MVP | Bulk entry of initial stock when setting up the system. Via Excel upload or manual entry. |
| 3.9 | **Stock valuation** (FIFO, weighted average) | P2 | Calculate stock value for accounting. Weighted average is most common in Indian retail. |
| 3.10 | **Dead stock identification** | P2 | Flag items not sold in X days. Critical for fashion retail where unsold seasonal stock loses value rapidly. Square added aging inventory alerts in 2025. |
| 3.11 | **Negative stock prevention** (or allowance) | MVP | Configurable: prevent billing if stock is zero, or allow negative stock with warning. |
| 3.12 | **Stock movement history per SKU** | P2 | Full timeline: when stock came in (purchase), went out (sale/return/adjustment), and current balance. |
| 3.13 | **Reorder quantity suggestions** | P3 | Based on sales velocity, suggest how much to reorder. Square uses ML for this ("Smart Stock Alerts"). |

### What users need most:
- **Variant-level stock visibility**: "Show me how many blue shirts in size L I have" -- this is table stakes but many apps (especially Vyapar) handle variants poorly.
- **Fast stock count**: Clothing stores do quarterly counts of 2000+ SKUs. Barcode scanning for physical count is essential.

---

## 4. PURCHASE & SUPPLIER MANAGEMENT

Indian retail runs on supplier relationships. Most clothing stores buy from 10-50 suppliers with varying payment terms (advance, credit 30/60/90 days, postdated cheques).

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 4.1 | **Supplier master** (name, contact, GSTIN, payment terms) | MVP | Basic supplier database. |
| 4.2 | **Purchase entry / GRN** (Goods Receipt Note) | MVP | Record purchases. Auto-update stock. Support barcode scanning during receiving. |
| 4.3 | **Purchase with variant matrix** | MVP | When buying clothing, enter quantities in a size-color grid (e.g., 10 units of M-Blue, 5 of L-Red). |
| 4.4 | **Supplier-wise purchase history** | MVP | View all past purchases from a supplier. |
| 4.5 | **Purchase return / Debit note** | P2 | Return defective goods to supplier. Generate debit note. Adjust stock. |
| 4.6 | **Create purchase order** | P2 | Formal PO before receiving goods. Convert PO to GRN on receipt. |
| 4.7 | **Purchase payment tracking** | MVP | Track how much is owed to each supplier. Partial payments. Due date alerts. This is critical -- Indian shops run on supplier credit. |
| 4.8 | **Auto-reorder suggestions** | P3 | System suggests purchase orders based on low stock and sales velocity. Lightspeed does this well. |
| 4.9 | **Purchase price history** | P2 | Track how a supplier's pricing has changed over time. |
| 4.10 | **Supplier ledger / statement** | P2 | Full financial statement for each supplier showing purchases, payments, returns, and balance. |
| 4.11 | **Bulk purchase import** | P2 | Import purchase data from Excel. Useful for large orders. |

### Indian-specific needs:
- **Supplier credit tracking is as important as customer credit (khata)**. Most POS apps focus on sales but neglect purchase payment tracking.
- GST Input Tax Credit (ITC) reconciliation: match purchase invoices with GSTR-2A data from GST portal.

---

## 5. RETURNS & EXCHANGES

Indian clothing retail has high return/exchange rates (10-20%). Exchanges are far more common than refunds. Store credit is the preferred resolution.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 5.1 | **Return with receipt/bill lookup** | MVP | Search by bill number, date, or customer phone. Pull up original sale. |
| 5.2 | **Exchange for different variant** (size/color swap) | MVP | Most common scenario. Customer exchanges M for L. System should handle the price difference (if any) seamlessly. |
| 5.3 | **Exchange for different product** | MVP | Customer returns a shirt, picks a trouser instead. Show net amount to pay or refund. |
| 5.4 | **Refund to original payment method** | MVP | Cash refund for cash sales. UPI refund records. |
| 5.5 | **Store credit / Credit note** | MVP | Issue credit note instead of cash refund. Redeemable on future purchase. Very common in Indian retail -- shopkeepers strongly prefer this over cash refunds. |
| 5.6 | **Return reason tracking** | P2 | Dropdown: wrong size, defective, didn't like, wrong item delivered. Helps identify quality issues. |
| 5.7 | **Return window enforcement** | P2 | Configurable: allow returns within 7/15/30 days. Warn or block if outside window. |
| 5.8 | **Defective vs non-defective flag** | P2 | Defective items don't go back to sellable stock. Non-defective items are restocked. |
| 5.9 | **Partial return** (return some items from a multi-item bill) | MVP | Common scenario. Customer bought 3 shirts, returns 1. |
| 5.10 | **Return without receipt** | P3 | Manager-approved return without original bill. Higher risk, but some stores allow it. |
| 5.11 | **Exchange report** | P2 | Track exchange rate by product, category, supplier. High exchange rates signal quality or sizing issues. |

### Key insight:
Most Indian shopkeepers handle exchanges informally today -- they mentally track credit or write it in a notebook. Digitizing this with store credit notes is a huge value proposition. myBillBook and Vyapar handle returns poorly according to user reviews.

---

## 6. CUSTOMER MANAGEMENT (CRM)

The phone number is the universal customer identifier in India. Every billing interaction should optionally capture it.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 6.1 | **Customer database** (phone, name, email, address) | MVP | Phone number is primary key. Name is optional but encouraged. |
| 6.2 | **Customer purchase history** | MVP | View all past bills for a customer. "What did Mr. Sharma buy last time?" |
| 6.3 | **Khata / Credit management** | MVP | **India's killer feature.** Track credit given to customers. Show outstanding balance. Record partial payments. Send payment reminders. This alone drives adoption -- Khatabook and OkCredit built entire businesses on this. |
| 6.4 | **Customer credit limit** | P2 | Set maximum credit allowed per customer. Warn when exceeded. |
| 6.5 | **Payment reminder via WhatsApp/SMS** | P2 | Send "You have Rs X outstanding" reminders. Automated or manual trigger. |
| 6.6 | **Customer groups / segments** | P2 | Tag customers: Regular, Wholesale, VIP, Staff. Different pricing/discount rules per group. |
| 6.7 | **Loyalty points program** | P2 | Earn points on purchase, redeem on future bills. GoFrugal offers "tender-based rewards" and personalized promotions. |
| 6.8 | **Birthday / anniversary capture** | P3 | Send greeting + offer on special dates via WhatsApp. |
| 6.9 | **Customer-wise pricing** | P3 | Assign specific price lists to specific customers (e.g., wholesale customers get wholesale prices automatically). |
| 6.10 | **Bulk SMS / WhatsApp campaigns** | P3 | Send promotional messages to customer segments. "Diwali sale: 30% off on all kurtas." |
| 6.11 | **Customer feedback capture** | P3 | Post-purchase feedback via WhatsApp or SMS link. |
| 6.12 | **Referral tracking** | P3 | Track which customer referred whom. Reward referrals. |

### What competitors get wrong:
- **Vyapar**: No multi-user access, so only one person can see customer data at a time.
- **Most apps**: Khata is treated as a separate feature rather than integrated into the billing flow. The credit balance should be visible during billing, and partial payment should be seamless.
- **GoFrugal**: Good CRM but complex to set up. Indian shopkeepers want it to "just work" with minimal configuration.

---

## 7. REPORTS & ANALYTICS

Indian shopkeepers need two things: (1) simple daily summary they can glance at, and (2) GST-ready reports for their CA (chartered accountant).

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 7.1 | **Daily sales summary** | MVP | Total sales, total bills, payment method breakdown, returns, net revenue. One-screen dashboard. |
| 7.2 | **Product-wise sales report** | MVP | Which products sold how many units and revenue. Filter by date range. |
| 7.3 | **Category-wise sales** | MVP | Sales by category/subcategory. |
| 7.4 | **Stock report** (current stock with value) | MVP | All products with current stock quantity and value. Filter by category, brand, low stock. |
| 7.5 | **Payment method breakdown** | MVP | How much collected via cash vs UPI vs card vs credit. |
| 7.6 | **GST report: GSTR-1 ready** | MVP | Outward supply data formatted for GSTR-1 filing. HSN-wise summary. B2B vs B2C breakdown. Invoice-wise detail. Export as JSON/Excel for upload to GST portal. Petpooja and GoFrugal auto-generate this. |
| 7.7 | **GST report: GSTR-3B summary** | MVP | Monthly summary of output tax, input tax, and net payable. |
| 7.8 | **Customer-wise sales report** | P2 | Top customers by revenue. Customer purchase frequency. |
| 7.9 | **Salesperson performance report** | P2 | Sales per salesperson. Commission calculation. |
| 7.10 | **Profit & loss by product** | P2 | Revenue minus cost for each product. Requires purchase price tracking. |
| 7.11 | **Purchase report** | P2 | Supplier-wise, product-wise, date-wise purchase data. |
| 7.12 | **Outstanding receivables** (khata report) | MVP | All customers with pending credit. Aging analysis (0-30 days, 30-60, 60-90, 90+). |
| 7.13 | **Outstanding payables** (supplier dues) | P2 | All suppliers with pending payments. |
| 7.14 | **Dead stock / Slow-moving report** | P2 | Products not sold in X days. Stock aging report. Critical for fashion retail. |
| 7.15 | **Returns & exchanges report** | P2 | Return rate by product, reason analysis. |
| 7.16 | **Cash register / Shift report** | P2 | Opening balance, sales, returns, cash in/out, closing balance. Useful for accountability when multiple cashiers work shifts. |
| 7.17 | **Hourly / Day-of-week sales trends** | P3 | When is the store busiest? Helps with staffing. |
| 7.18 | **Stock transfer report** (for multi-store) | P2 | Track all transfers between locations. |
| 7.19 | **Tally-format export** | P2 | Export data in Tally XML/JSON format. Indian CAs overwhelmingly use Tally. This is a huge pain point -- most POS apps export generic data that CAs have to reformat manually. |
| 7.20 | **Dashboard with key metrics** | MVP | Today's sales, this week vs last week, top products, low stock alerts, pending receivables. Visual charts. |
| 7.21 | **Export to Excel/PDF** | MVP | Every report should be exportable. |
| 7.22 | **WhatsApp daily summary** | P3 | Auto-send EOD summary to owner's WhatsApp. Petpooja offers this. |

### Key insight:
**Tally export is a massive differentiator.** Most small retailers share data with their CA monthly. If the POS can export Tally-compatible data, it eliminates hours of manual data entry. GoFrugal integrates with Tally, but setup is complex. Petpooja Invoice does real-time or batch sync with Tally.

---

## 8. MULTI-STORE / CHAIN MANAGEMENT

Target: chains of 2-15 stores. Ginesys dominates the 50+ store segment; the opportunity is in the underserved 2-15 store range where GoFrugal is too complex and Vyapar cannot scale.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 8.1 | **Centralized product catalog** | P2 | Add products once, available across all stores. |
| 8.2 | **Store-wise stock visibility** | P2 | See stock levels at each store from a central dashboard. |
| 8.3 | **Inter-store stock transfer** | P2 | Transfer stock between stores with full tracking. GoFrugal and Ginesys both support this. |
| 8.4 | **Consolidated reports across stores** | P2 | View sales, stock, and P&L aggregated across all stores or filtered by store. |
| 8.5 | **Store-wise pricing** (optional) | P3 | Different selling prices at different stores (e.g., mall store vs standalone). |
| 8.6 | **Role-based access per store** | P2 | Store manager sees only their store's data. Owner sees everything. |
| 8.7 | **Central promotion/discount management** | P3 | Define sales/offers from HQ, auto-apply at all stores. Ginesys does this with "E-Gift vouchers" and flexible promotions. |
| 8.8 | **Store-wise cash/register management** | P2 | Each store has independent cash register reconciliation. |

### Competitive gap:
- **Vyapar / myBillBook**: Single-store only. No multi-store capability.
- **GoFrugal**: Supports multi-store but pricing jumps significantly. Complex setup.
- **Ginesys**: Excellent multi-store but designed for 50+ stores. Expensive and heavy.
- **Opportunity**: Simple, affordable multi-store for 2-15 store chains.

---

## 9. SETTINGS & CONFIGURATION

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 9.1 | **Business profile** (name, address, GSTIN, logo, phone) | MVP | Appears on all receipts and invoices. |
| 9.2 | **Receipt template customization** | MVP | Choose layout, add/remove fields, upload logo. Support 58mm and 80mm thermal formats. At minimum: business name, address, GSTIN, bill number, date, items with HSN, tax breakup, payment method, footer message. |
| 9.3 | **Tax configuration** | MVP | Set up GST rates (0%, 5%, 12%, 18%, 28%). Cess if applicable. Map to HSN codes. CGST/SGST vs IGST based on state. |
| 9.4 | **Payment methods setup** | MVP | Enable/disable payment methods. Configure UPI ID for QR generation. |
| 9.5 | **User roles and permissions** | MVP | Roles: Owner, Manager, Cashier, Salesperson. Permissions: who can give discounts, void bills, view reports, edit products, access settings. Vyapar users specifically complain about lack of customizable roles. |
| 9.6 | **Printer setup** (receipt + barcode label) | MVP | Configure thermal receipt printer and barcode label printer. Support common Indian brands (TVS, Epson TM series, TSC, Zebra). USB and Bluetooth. |
| 9.7 | **Invoice number series** | MVP | Auto-incrementing with configurable prefix (e.g., INV-2026-001). Support financial year reset. |
| 9.8 | **Round-off rules** | MVP | Round to nearest Rs 1 (up/down/nearest). |
| 9.9 | **Backup and data export** | MVP | Cloud backup (automatic) + local backup download. Full data export for portability. |
| 9.10 | **Multi-language support** | P3 | Hindi and regional language UI. At minimum, receipt printing in Hindi/regional script. |
| 9.11 | **Theme / display settings** | P3 | Dark mode, font size adjustment. Practical for different lighting conditions in stores. |
| 9.12 | **Terms and conditions on invoice** | P2 | Configurable return policy, warranty text on receipt footer. |
| 9.13 | **Financial year configuration** | MVP | Indian financial year April-March. Reports and serial numbers should respect this. |
| 9.14 | **State configuration** (for IGST logic) | MVP | Set business state. Compare with customer state to determine CGST/SGST vs IGST. |

---

## 10. INTEGRATIONS

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 10.1 | **Tally export** | P2 | Export sales, purchases, and accounting data in Tally-compatible format. This is the most requested integration by Indian retailers. GoFrugal and Petpooja both offer this. |
| 10.2 | **WhatsApp Business API** (for receipts and reminders) | P2 | Send bills, payment reminders, and promotional messages via WhatsApp. India's primary messaging channel. |
| 10.3 | **UPI QR code generation** | P2 | Generate dynamic QR code on billing screen for customer to pay. Reduces cash handling errors. |
| 10.4 | **SMS gateway** | P2 | For OTP, payment reminders, and bill sharing where WhatsApp is not available. |
| 10.5 | **E-commerce sync** (Shopify / WooCommerce) | P3 | Sync products and inventory with online store. Ginesys and Lightspeed excel here. |
| 10.6 | **Payment gateway integration** (Razorpay / Paytm) | P3 | For online payments, EMI options, and advanced payment features. |
| 10.7 | **Google Sheets export** | P3 | For shopkeepers who analyze data in spreadsheets. |
| 10.8 | **Accounting software sync** (Zoho Books, QuickBooks) | P3 | For businesses that use cloud accounting beyond Tally. |
| 10.9 | **GST portal integration** | P3 | Direct filing or data push to GST portal. Eliminates manual upload. |
| 10.10 | **E-way bill generation** | P3 | For goods movement above Rs 50,000. Generate e-way bill from within the POS. |

---

## 11. USER EXPERIENCE & PLATFORM

These are not features per se, but architectural/UX decisions that determine adoption.

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 11.1 | **Web app (browser-based)** | MVP | Works on any device with a browser. No installation needed. Primary interface. |
| 11.2 | **Mobile app** (Android) | P2 | For on-the-go stock checks, sales viewing, and basic billing. Android is 95%+ of Indian retail device market. |
| 11.3 | **Offline capability** | P2 | Queue transactions offline, sync when online. Vyapar's biggest competitive advantage. Indian tier-2/3 cities have unreliable internet. |
| 11.4 | **Fast onboarding** (under 10 minutes to first bill) | MVP | Minimal required setup: business name, one product, and bill. No lengthy mandatory configurations. |
| 11.5 | **In-app guided tutorial** | MVP | First-time walkthrough of billing, adding products, and key features. GoFrugal users complain about lack of documentation. |
| 11.6 | **Data migration assistance** | P2 | Import from Vyapar, myBillBook, or Excel. Lower switching costs. |
| 11.7 | **Hindi / regional language UI** | P3 | Significant differentiator for tier-2/3 towns. |
| 11.8 | **WhatsApp-based support** | MVP | Indian SMBs expect WhatsApp support, not email or tickets. |

---

## COMPETITIVE COMPARISON MATRIX

| Feature Area | Vyapar | myBillBook | GoFrugal | Petpooja Invoice | Lightspeed | Square |
|---|---|---|---|---|---|---|
| Variant management | Weak | Basic | Strong | Basic | Excellent | Good |
| Barcode scan billing | Yes | Yes | Yes | Yes (AI) | Yes | Yes |
| Offline billing | Yes (key USP) | No (complaint) | Limited | No | No | Limited |
| Khata / Credit | Basic | Basic | Good | No | No | No |
| Multi-store | No | No | Yes | Limited | Yes | Yes |
| GST compliance | Good | Good | Excellent | Excellent | N/A (not India) | N/A |
| Tally integration | No | No | Yes | Yes | N/A | N/A |
| WhatsApp integration | Yes (buggy) | Yes | Yes | Yes | No | No |
| Multi-user / roles | No (major complaint) | Limited | Yes | Yes | Yes | Yes |
| Salesperson tracking | No | No | Yes | No | Yes | Yes |
| Barcode label printing | Yes (buggy) | Basic | Yes | Yes | Yes | Yes (Plus plan) |
| Hold/Park bill | No | No | Yes | Yes | Yes | Yes |
| Loyalty program | No | Yes | Yes | No | Yes | Yes |
| Returns & exchanges | Basic | Basic | Good | Basic | Good | Good |
| Price | Rs 4K-9K/yr | Rs 2K-6K/yr | Rs 12K-30K/yr | Rs 8.5K/yr | $89-289/mo | Free-$60/mo |

---

## TOP USER PAIN POINTS (from reviews and complaints)

1. **"My POS doesn't handle variants well"** -- Vyapar and myBillBook users struggle with size-color management. This is the #1 gap for clothing stores.

2. **"It stops working when internet goes down"** -- Cloud-only POS systems lose sales during connectivity issues. Critical in tier-2/3 India.

3. **"I can't track who owes me money properly"** -- Khata/credit management is either missing or not integrated into billing flow.

4. **"My CA asks for Tally data and I have to re-enter everything"** -- No Tally export means double data entry for 90% of Indian businesses.

5. **"Only one person can use it at a time"** -- Vyapar's single-user limitation is a dealbreaker for stores with 2+ staff.

6. **"I can't see stock across my 3 stores"** -- Vyapar/myBillBook don't support multi-store. GoFrugal is too expensive for small chains.

7. **"WhatsApp bill sharing doesn't work properly"** -- Vyapar users report blank PDFs. This is a feature everyone wants but few execute well.

8. **"I can't set different discount limits for different cashiers"** -- Discount abuse is a real problem. Role-based discount limits are rarely implemented.

9. **"Hold bill feature is missing"** -- Vyapar and myBillBook lack this. In clothing stores, customers try 5 items, you start a bill, they leave to browse more. You need to serve the next customer.

10. **"Reports are too complex / too simple"** -- GoFrugal's reports are overwhelming; Vyapar's are too basic. The sweet spot is 10-15 well-designed reports with drill-down capability.

---

## RECOMMENDED MVP SCOPE (Launch Checklist)

The MVP should cover what a single clothing store needs to operate daily:

1. **Billing/Checkout**: Barcode scan, search, quick-add, item/bill discount, GST auto-calc, cash/UPI/card/split payment, customer lookup, hold bill, receipt print, round-off, salesperson tag, keyboard shortcuts
2. **Products**: Variants (size-color matrix), categories, HSN codes, barcodes, MRP + selling price, units, Excel import, auto-SKU
3. **Inventory**: Stock per variant, low stock alerts, stock adjustment, physical count, barcode label printing, opening stock, negative stock handling
4. **Purchase**: Supplier master, purchase entry/GRN with variant matrix, payment tracking, purchase history
5. **Returns**: Receipt lookup, exchange (variant/product), store credit, cash refund, partial return
6. **Customers**: Phone-based lookup, purchase history, khata/credit management, outstanding report
7. **Reports**: Daily summary, product/category sales, stock report, GST (GSTR-1, GSTR-3B), payment breakdown, outstanding receivables, dashboard, Excel/PDF export
8. **Settings**: Business profile, receipt template, tax config, roles/permissions, printer setup, invoice numbering, financial year
9. **UX**: Web app, fast onboarding, guided tutorial, WhatsApp support

**Estimated MVP feature count: ~80 features**
**Phase 2 adds: ~40 features** (multi-store, loyalty, Tally, WhatsApp bills, offline, advanced reports)
**Phase 3 adds: ~25 features** (e-commerce sync, campaigns, advanced analytics, AI suggestions)

---

## Sources

- [GoFrugal Garments POS](https://www.gofrugal.com/retail/apparel-pos/garments-software.html)
- [GoFrugal Retail Features](https://www.gofrugal.com/retail/features/)
- [GoFrugal Retail Chain Features](https://www.gofrugal.com/retail-chain-features.html)
- [Vyapar App Features](https://vyaparapp.in/blog/vyapar-app-features/)
- [Vyapar Techjockey Reviews](https://www.techjockey.com/reviews/vyapar)
- [myBillBook POS](https://mybillbook.in/pos)
- [myBillBook vs Vyapar Comparison](https://knowledge.mybillbook.in/en/articles/9471315-why-mybillbook-is-a-better-alternative-to-vyapar-app)
- [Petpooja Invoice Features](https://blog.petpooja.com/finance-compliance/petpooja-invoice-features/)
- [Petpooja Retail POS](https://www.petpooja.com/retail-pos)
- [Lightspeed Clothing Store POS](https://www.lightspeedhq.com/pos/retail/apparel/)
- [Square Retail POS Capabilities](https://squareup.com/us/en/retail/capabilities)
- [Square Spring 2025 Retail Release](https://squareup.com/us/en/releases/retail/spring-2025)
- [Ginesys Retail Chain Billing](https://www.ginesys.in/retail-shop-billing-software)
- [Ginesys Apparel & Lifestyle](https://www.ginesys.in/solutions/apparel-and-lifestyle-brands)
- [Common Billing & Inventory Problems in Indian Retail](https://retailpos.co.in/common-billing-and-inventory-problems-retail-stores-face-in-india)
- [Why Indian SMEs Need All-in-One POS](https://shopaver.com/Blogs/why-indian-smes-need-an-all-in-one-pos-khata-online-store-whatsapp-commerce-platform)
- [GST Billing Software Guide 2026](https://www.retailcore.in/gst/gst-billing-software-for-retailers-in-india-2026-what-you-need-and-how-to-choose)
- [Top 7 Retail POS for Indian SMEs 2025](https://www.ginesys.in/blog/top-7-retail-pos-software-tools-for-smes-in-india-2025)
- [GoFrugal Capterra Reviews](https://www.capterra.com/p/71693/GoFrugal-POS-Software/reviews/)
- [GoFrugal Trustpilot Reviews](https://www.trustpilot.com/review/www.gofrugal.com)
