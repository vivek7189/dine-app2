# dine-app

## What This Is

Mobile POS application for DineOpen. Used by restaurant staff (waiters, cashiers, managers, owners) on phones and tablets. Full offline support with sync.

## Tech Stack

- **Framework**: React Native 0.81.5 with Expo 54
- **Routing**: Expo Router 6 (file-based)
- **Language**: TypeScript
- **Auth**: Firebase Auth (phone OTP, Google, Apple) + JWT for staff login
- **Database**: SQLite (expo-sqlite) for offline, Firebase RTDB for real-time
- **State**: React Context + AsyncStorage
- **Real-time**: Pusher.js + Firebase RTDB
- **Printing**: react-native-thermal-receipt-printer (BLE, WiFi, USB, AirPrint)
- **Maps**: Leaflet (via WebView)
- **Animations**: React Native Reanimated 4

## Project Structure

```
app/                        # Expo Router file-based routing
  (auth)/
    login.js                # Multi-method login (staff, Google, Apple, Phone)
    offline-pin.js          # PIN lock for offline mode
  (tabs)/
    _layout.js              # Tab navigator (role-based tab visibility)
    home.js                 # Dashboard with KPIs
    tables.js               # Table management + order taking
    menu.js                 # Menu browsing
    menu-management.js      # Edit menu items
    orders.js               # Active orders
    order-history.js        # Past orders
    kitchen.js              # KOT display
    customers.js            # Customer management
    inventory.js            # Stock tracking
    attendance.js           # Clock in/out with geolocation
    deliveries.js           # Delivery tracking
    parking.js              # Parking management
    hotel.js                # Hotel features
    bar-billing.js          # Bar management
    offers.js               # Discounts
    headquarters.js         # Multi-restaurant admin
    printer-settings.js     # Printer setup
    profile.js              # Settings
    more.js                 # Extra features

components/                 # 52 components
  CartModal.js              # Main order cart
  WaiterCartModal.js        # Waiter-specific cart
  CashierCartModal.js       # Cashier cart
  KOTModal.js               # Kitchen order ticket
  VoiceOrderModal.js        # Voice ordering
  PrinterSetup.js           # Printer pairing
  OfflineStatusBar.js       # Offline indicator
  SyncIndicator.js          # Sync status
  ...

services/
  api.js                    # API client (~2000 lines, caching, dedup, offline fallback)
  db.js                     # SQLite schema + migrations (v2)
  syncEngineV2.js           # Offline sync orchestrator
  syncQueueV2.js            # Mutation queue with retry
  printerService.js         # Multi-type printer integration (~1000 lines)
  offlineStore.js           # Offline data persistence
  locationTracking.js       # Background geolocation
  lanClient.js              # LAN hub communication
  offerEngine.js            # Discount calculation
  pinLock.js                # Offline PIN protection
  cacheManager.js           # AsyncStorage cache

hooks/
  useOffline.js             # Offline context (~400 lines)
  useOfferEngine.js         # Offer calculation
  useBillingCalculation.js  # Tax + total calculation
  useResponsive.js          # Responsive layout

constants/
  Theme.js                  # Colors, spacing, typography
```

## Key Patterns

- **Offline-first**: All mutations queued in SQLite, synced when online
- **Sync engine V2**: Queue with status (pending -> syncing -> synced/failed), exponential backoff
- **SQLite local DB**: Stores menus, tables, orders, customers, offers for offline use
- **PIN lock**: Offline sessions protected by PIN
- **Role-based tabs**: Tab navigator shows/hides based on user role (owner/manager/waiter/cashier/kitchen)
- **LAN fallback**: Can route through local LAN hub if internet down
- **Multi-printer**: BLE, WiFi (Zeroconf discovery), USB, AirPrint — with auto-reconnect

## Auth Flow

1. Staff login (ID + password) → JWT token
2. Google Sign-In → Firebase credential
3. Apple Auth → Firebase credential
4. Phone OTP → Firebase phone auth
5. Token in AsyncStorage, Bearer header on all requests
6. Auto-refresh on 401 with request queuing

## API Connection

- Production: `https://dine-be2-phi.vercel.app`
- Configured via `EXPO_PUBLIC_API_URL`

## Build & Deploy

- Dev: `npm start` → Expo dev server
- Android: EAS Build → Play Store (package: com.dineopen.waiter)
- iOS: EAS Build → App Store (bundle: com.dineopen.pos)
- OTA updates via expo-updates

## Important Notes

- Version: 2.43.0
- SQLite uses WAL mode for performance
- Printer service is complex (~1000 lines) — handles 4 printer types
- API client has LAN routing for hub-connected setups
- Background location tracking for delivery partners

## Session Log

### 2026-05-28: Initial CLAUDE.md created
- Documented offline architecture, printing system, navigation, auth
