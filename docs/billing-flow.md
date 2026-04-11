# Billing & Discount Data Flow

## Overview

This document traces how billing data (offers, discounts, taxes, tips) flows from the POS UI through to the backend order creation and invoice display.

## Key Files

| File | Role |
|------|------|
| `components/OfferSelector.js` | UI for selecting offers. Uses `useOfferEngine` hook |
| `hooks/useOfferEngine.js` | Core offer logic: loads offers, filters applicable, calculates discounts, manages selection state |
| `services/offerEngine.js` | Pure functions: `calculateOfferResult`, `filterApplicableOffers`, `matchesAudience`, `pickBestOffer` |
| `components/CashierCartModal.js` | Cart + billing UI. Builds `discountData` object via `buildDiscountData()` |
| `hooks/useBillingCalculation.js` | Calculates billing totals: subtotal, discounts, tax, service charge, tip, round-off, grand total |
| `components/billing/BillingSummaryBar.js` | Compact chip-based billing summary display |
| `app/(tabs)/menu.js` | Order placement. Two paths: `handleCashierPlaceOrder` (new order) and `handleCompleteBilling` (existing order) |
| `components/CashierInvoiceModal.js` | Invoice/receipt display (HTML, plain text, mobile views) |
| Backend: `index.js` | Order creation endpoints (public + POS) |

## Data Flow

### 1. Offer Selection (OfferSelector → CashierCartModal)

```
useOfferEngine returns:
  - applicableOffers[]       — filtered offers valid for this cart
  - selectedOfferId          — single selected offer ID (legacy)
  - selectedOfferIds[]       — array of selected offer IDs (multi-offer)
  - offerDiscount            — TOTAL discount across all selected offers
  - selectedOfferName        — comma-joined names
  - calculateDiscountForOffer(offer, subtotal, cart) — per-offer discount calc

OfferSelector notifies parent via callbacks:
  - onOfferSelected(id, discount, offer)           — legacy single-offer
  - onOffersChanged(ids[], totalDiscount, offers[]) — multi-offer
```

### 2. CashierCartModal State

```
selectedOfferId     — string (first/single offer ID)
selectedOfferIds[]  — array of offer IDs
offerDiscount       — total offer discount amount
selectedOffer       — first offer object
selectedOffers[]    — array of all selected offer objects
```

### 3. buildDiscountData() Output

Key offer-related fields:
```js
{
  offerDiscount,                    // Total offer discount (number)
  selectedOfferId,                  // Single offer ID (string)
  selectedOfferIds[],               // Array of offer IDs
  selectedOfferName,                // First offer name (string)
  selectedOfferNames[],             // Array of offer names
  appliedOffers[],                  // Array of { id, name, discountApplied } per offer
  // ... other billing fields
}
```

### 4. Order Payload (menu.js → Backend API)

```js
{
  offerIds[],                       // Array of offer IDs
  selectedOfferName,                // Joined offer names (string)
  discountAmount,                   // Total discount (offers + manual + loyalty)
  loyaltyDiscount,                  // Loyalty discount separately
  manualDiscount,                   // Manual discount separately
}
```

### 5. Backend Processing

The backend:
1. Receives `offerIds[]` from payload
2. Validates each offer against DB (checks active, schedule, audience)
3. Calculates individual discount per offer → builds `appliedOffers[]` array
4. Each entry: `{ id, name, discountType, discountValue, discountApplied, scope, promotionType }`
5. Sets `appliedOffer` = first item (backward compat)
6. Caps total discount at subtotal

Saved to Firestore order doc:
```js
{
  appliedOffer: { ... },            // First offer object (full)
  appliedOffers: [ ... ],           // Array of all applied offers
  discountAmount,                   // Total offer discount
  manualDiscount,                   // Manual discount
  loyaltyDiscount,                  // Loyalty discount
}
```

Saved to orderHistoryEntry (customer record):
```js
{
  appliedOffer: "offer name",       // First offer name (string)
  appliedOffers: [{ name, discountApplied }],  // Array with per-offer breakdown
  selectedOfferName: "all names",   // Joined names
  discountAmount,
  manualDiscount,
  loyaltyDiscount,
}
```

### 6. Invoice Data (menu.js → CashierInvoiceModal)

```js
{
  offerDiscount,                    // Total offer discount
  offerName,                        // Joined offer names
  appliedOffers[],                  // Array of { id, name, discountApplied }
  manualDiscount,
  loyaltyDiscount,
  // ... other fields
}
```

### 7. Invoice Display

- **Multiple offers (appliedOffers.length > 1)**: Each offer shown as separate line
- **Single offer**: Shows one "Offer Discount" line with total
- **No offers**: No offer line shown

## Offer Settings

Stored in `customerAppSettings.offerSettings`:
```js
{
  autoApplyBestOffer: boolean,      // Auto-select best offer(s)
  allowMultipleOffers: boolean,     // Allow >1 offer simultaneously
  maxOffersAllowed: number,         // Max offers when multiple allowed
}
```

## Multi-Offer vs Single-Offer Mode

- `allowMultipleOffers: false` → Only 1 offer can be selected. Uses `selectedOfferId`.
- `allowMultipleOffers: true` → Up to `maxOffersAllowed` offers. Uses `selectedOfferIds[]`.
- Backend enforces the limit: `limitedOfferIds = allOfferIds.slice(0, maxOffersAllowed)`.

## Tax Calculation Order

1. Start with subtotal (sum of item prices * quantities)
2. Subtract offer discount
3. Subtract manual discount
4. Subtract loyalty discount
5. = discountedSubtotal
6. Add service charge (% of discountedSubtotal)
7. Calculate tax on (discountedSubtotal + service charge)
8. Add tip
9. Apply round-off
10. = grandTotal
