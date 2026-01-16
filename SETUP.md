# DineOpen Waiter App - Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   cd dine-app
   npm install
   ```

2. **Configure Environment**
   - The app uses the deployed backend by default: `https://dine-backend-lake.vercel.app`
   - To use a different URL, create a `.env` file with `EXPO_PUBLIC_API_URL=your-url`
   - For local development: Set `EXPO_PUBLIC_API_URL=http://localhost:3003`

3. **Run the App**
   ```bash
   # Start Expo development server
   npm start

   # Run on iOS simulator
   npm run ios

   # Run on Android emulator
   npm run android
   ```

## Project Structure

```
dine-app/
├── app/
│   ├── (auth)/
│   │   └── login.js          # Staff login screen
│   ├── (tabs)/
│   │   ├── tables.js         # Tables view - see all tables and their status
│   │   ├── menu.js           # Menu view - browse menu and take orders
│   │   ├── orders.js         # Order history
│   │   └── profile.js        # User profile and logout
│   ├── _layout.js            # Root layout with navigation
│   └── index.js              # Entry point - redirects based on auth
├── components/
│   ├── VoiceOrderModal.js    # Voice order taking modal
│   └── CartModal.js          # Shopping cart modal
├── constants/
│   └── Theme.js              # Colors, typography, spacing matching web FE
├── services/
│   └── api.js                # API client for backend communication
└── package.json
```

## Key Features Implemented

### ✅ Authentication
- Staff login using loginId and password
- Token-based authentication
- Auto-redirect based on auth status

### ✅ Tables View
- Display all floors and tables
- Real-time table status (available, occupied, cleaning, etc.)
- Color-coded status indicators
- Tap table to start order or view existing order

### ✅ Menu View
- Browse menu items by category
- Search functionality
- Add items to cart with quantity controls
- Voice order integration
- Cart floating action button

### ✅ Order Management
- Place orders for tables
- View order history
- Order status tracking
- Order details display

### ✅ Voice Orders
- Voice command processing
- AI-powered menu item matching
- Add multiple items at once via voice

### ✅ Profile
- User information display
- Restaurant information
- Logout functionality

## API Endpoints Used

- `POST /api/auth/staff/login` - Staff authentication
- `GET /api/floors/:restaurantId` - Get floors and tables
- `GET /api/menus/:restaurantId` - Get menu items
- `POST /api/orders` - Create new order
- `GET /api/orders/:restaurantId` - Get orders
- `POST /api/voice/process-order` - Process voice order

## Theme

The app uses the exact same color scheme as the web frontend:
- Primary Red: `#ef4444`
- Secondary Orange: `#fd9745`
- Accent Green: `#10b981`
- Background Cream: `#fef7f0`

## Navigation Flow

1. **App Launch** → Check auth → Login or Tables
2. **Tables Tab** → Select table → Menu tab (with table selected)
3. **Menu Tab** → Add items → Cart → Place order → Orders tab
4. **Orders Tab** → View order → Edit (goes to Menu with order loaded)

## Testing

### Prerequisites
- Backend server running (`dine-backend`)
- Staff user created in backend
- Restaurant with menu items and tables configured

### Test Flow
1. Login with staff credentials
2. View tables - should see all tables with status
3. Select available table
4. Browse menu and add items
5. Use voice order to add items
6. Place order
7. View order in orders tab

## Known Limitations / Future Enhancements

1. **Voice Recognition**: Currently uses text input fallback. For production, integrate proper speech recognition (expo-speech or native modules)

2. **Real-time Updates**: Table status and orders are not updated in real-time. Would need WebSocket or polling.

3. **Offline Support**: No offline mode yet. Would need local caching and sync.

4. **Push Notifications**: No push notifications for order status changes.

5. **Order Editing**: Order editing flow needs to be fully implemented (currently navigates to menu but doesn't load order items).

## Troubleshooting

### API Connection Issues
- Check `EXPO_PUBLIC_API_URL` is set correctly
- Verify backend server is running
- Check network connectivity

### Authentication Issues
- Verify staff credentials in backend
- Check token storage in AsyncStorage
- Clear app data and re-login

### Menu Not Loading
- Verify restaurant has menu items
- Check API response format
- Verify restaurantId is correct

### Tables Not Showing
- Verify restaurant has floors and tables configured
- Check API endpoint response
- Verify restaurantId is correct

## Development Notes

- The app is designed to work seamlessly with the existing backend
- No backend changes required - uses existing APIs
- All authentication and data flows match the web frontend
- Mobile-optimized UI for fast order taking
