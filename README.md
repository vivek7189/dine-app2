# DineOpen Waiter App

React Native Expo mobile app for restaurant waiters to take orders from customer seats.

## Features

- **Staff Login**: Secure authentication using staff login ID and password
- **Tables View**: View all restaurant tables with real-time status (available, occupied, cleaning, etc.)
- **Menu View**: Browse menu items by category with search functionality
- **Order Taking**: Add items to cart and place orders for specific tables
- **Voice Orders**: Use voice commands to add items to cart (AI-powered)
- **Order History**: View and manage past orders
- **Role-Based Access**: Supports Owner, Captain (Manager), and Waiter roles

## Tech Stack

- **React Native** with **Expo** (~51.0.0)
- **Expo Router** for navigation
- **AsyncStorage** for local data persistence
- **Axios** for API calls
- **Expo Speech** for voice functionality

## Setup

1. Install dependencies:
```bash
cd dine-app
npm install
```

2. Configure API URL:
   - The app uses the deployed backend by default: `https://dine-backend-lake.vercel.app`
   - To use a different URL, create a `.env` file with `EXPO_PUBLIC_API_URL=your-url`
   - For local development: Set `EXPO_PUBLIC_API_URL=http://localhost:3003`

3. Run the app:
```bash
# Start Expo development server
npm start

# Then choose an option:
# - Press 'i' for iOS simulator (macOS only)
# - Press 'a' for Android emulator
# - Scan QR code with Expo Go app on your phone
# - Press 'w' for web browser

# Or run directly:
npm run ios      # iOS simulator
npm run android  # Android emulator
npm run web      # Web browser
```

**For detailed instructions, see [RUN_GUIDE.md](./RUN_GUIDE.md)**

## Project Structure

```
dine-app/
├── app/
│   ├── (auth)/          # Authentication screens
│   │   └── login.js
│   ├── (tabs)/          # Main app screens
│   │   ├── tables.js     # Tables view
│   │   ├── menu.js       # Menu and order taking
│   │   ├── orders.js     # Order history
│   │   └── profile.js    # User profile
│   └── _layout.js        # Root layout
├── components/
│   ├── VoiceOrderModal.js
│   └── CartModal.js
├── constants/
│   └── Theme.js          # Theme colors and styles
├── services/
│   └── api.js           # API client
└── package.json
```

## API Integration

The app connects to the same backend as the web frontend (`dine-backend`):

- **Staff Login**: `POST /api/auth/staff/login`
- **Menu**: `GET /api/menus/:restaurantId`
- **Tables/Floors**: `GET /api/floors/:restaurantId` or `GET /api/tables/:restaurantId`
- **Orders**: `GET /api/orders/:restaurantId`, `POST /api/orders`
- **Voice Orders**: `POST /api/voice/process-order`

## Theme

The app uses the same color scheme as the web frontend:
- Primary Red: `#ef4444`
- Secondary Orange: `#fd9745`
- Accent Green: `#10b981`
- Background Cream: `#fef7f0`

## Permissions

### iOS
- Microphone (for voice orders)
- Speech Recognition (for voice orders)

### Android
- RECORD_AUDIO (for voice orders)
- INTERNET

## Development Notes

- The app uses the same authentication system as the web app
- All data is synced with the backend in real-time
- Voice order functionality requires proper speech recognition setup (currently uses text input as fallback)
- The app is optimized for mobile order-taking with fast, intuitive UI

## Future Enhancements

- Real-time order updates via WebSocket
- Push notifications for order status changes
- Offline mode with sync
- Enhanced voice recognition
- Barcode/QR code scanning
- Table status updates in real-time
