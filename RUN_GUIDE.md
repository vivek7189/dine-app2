# How to Run DineOpen Waiter App

## Prerequisites

Before running the app, make sure you have:

1. **Node.js** (v16 or higher)
   - Check: `node --version`
   - Download: https://nodejs.org/

2. **npm** or **yarn**
   - Usually comes with Node.js
   - Check: `npm --version`

3. **Expo CLI** (optional, but recommended)
   ```bash
   npm install -g expo-cli
   ```

4. **For iOS Development:**
   - macOS with Xcode installed
   - iOS Simulator (comes with Xcode)
   - Or a physical iPhone

5. **For Android Development:**
   - Android Studio installed
   - Android SDK configured
   - Android Emulator set up
   - Or a physical Android device

6. **Expo Go App** (for testing on physical devices)
   - iOS: Download from App Store
   - Android: Download from Google Play Store

## Step-by-Step Instructions

### 1. Navigate to the App Directory

```bash
cd dine-app
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- React Native
- Expo
- Navigation libraries
- API client dependencies

### 3. Start the Expo Development Server

```bash
npm start
```

Or:

```bash
npx expo start
```

This will:
- Start the Metro bundler
- Open Expo DevTools in your browser
- Show a QR code for testing on physical devices

### 4. Run on Different Platforms

#### Option A: Run on iOS Simulator (macOS only)

```bash
npm run ios
```

Or press `i` in the terminal after running `npm start`

**Requirements:**
- macOS
- Xcode installed
- iOS Simulator available

#### Option B: Run on Android Emulator

```bash
npm run android
```

Or press `a` in the terminal after running `npm start`

**Requirements:**
- Android Studio installed
- Android Emulator running
- OR Android device connected via USB with USB debugging enabled

#### Option C: Run on Physical Device

1. **Install Expo Go** on your phone:
   - iOS: [App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Scan the QR Code:**
   - iOS: Open Camera app and scan the QR code
   - Android: Open Expo Go app and scan the QR code

3. **Make sure your phone and computer are on the same WiFi network**

#### Option D: Run in Web Browser (Limited)

```bash
npm run web
```

Or press `w` in the terminal after running `npm start`

**Note:** Some features may not work in web mode (like voice recognition)

## Quick Start Commands

```bash
# 1. Install dependencies (first time only)
cd dine-app
npm install

# 2. Start the app
npm start

# Then choose:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Scan QR code with Expo Go app on your phone
```

## Troubleshooting

### Issue: "Command not found: expo"

**Solution:**
```bash
npm install -g expo-cli
# OR use npx
npx expo start
```

### Issue: "Metro bundler failed to start"

**Solution:**
```bash
# Clear cache and restart
npx expo start --clear
```

### Issue: "Cannot connect to backend API"

**Solution:**
1. Check if backend is deployed and accessible: `https://dine-backend-lake.vercel.app`
2. Check your internet connection
3. For local backend, create `.env` file:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3003
   ```

### Issue: "iOS Simulator not found"

**Solution:**
```bash
# Open Xcode and start a simulator manually
open -a Simulator

# Or install Xcode Command Line Tools
xcode-select --install
```

### Issue: "Android emulator not found"

**Solution:**
1. Open Android Studio
2. Go to Tools > Device Manager
3. Start an emulator
4. Then run `npm run android`

### Issue: "Cannot connect to Expo Go on phone"

**Solution:**
1. Ensure phone and computer are on the same WiFi network
2. Try using tunnel mode:
   ```bash
   npx expo start --tunnel
   ```
3. Check firewall settings on your computer

### Issue: "Module not found" errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

### Issue: "Port already in use"

**Solution:**
```bash
# Kill the process using the port (usually 8081)
# On macOS/Linux:
lsof -ti:8081 | xargs kill -9

# Then restart
npm start
```

## Development Tips

### Hot Reloading
- The app automatically reloads when you save changes
- Shake your device or press `Cmd+D` (iOS) / `Cmd+M` (Android) to open developer menu

### Debugging
- Press `j` to open debugger in browser
- Use React Native Debugger for advanced debugging
- Check console logs in terminal

### Viewing Logs
```bash
# View all logs
npx expo start --verbose

# View logs for specific platform
npx expo start --ios
npx expo start --android
```

### Clearing Cache
```bash
# Clear Metro bundler cache
npx expo start --clear

# Clear all caches
rm -rf node_modules
rm -rf .expo
npm install
```

## Testing the App

### 1. Login
- Use staff credentials (loginId and password)
- These should be created in your backend/admin panel

### 2. Test Features
- **Tables View**: Should show all tables with status
- **Menu View**: Browse menu items, add to cart
- **Voice Orders**: Test voice order functionality
- **Order Management**: View and manage orders
- **Menu Management**: Add/edit/delete menu items (owner/manager only)

## Building for Production

### iOS Build
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for iOS
eas build --platform ios
```

### Android Build
```bash
# Build for Android
eas build --platform android
```

## Environment Variables

Create a `.env` file in `dine-app` folder (optional):

```env
# Backend API URL
EXPO_PUBLIC_API_URL=https://dine-backend-lake.vercel.app

# For local development:
# EXPO_PUBLIC_API_URL=http://localhost:3003
```

## Common Commands Reference

```bash
# Start development server
npm start

# Start with cleared cache
npx expo start --clear

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web

# Install dependencies
npm install

# Check for updates
npx expo-doctor
```

## Need Help?

- Check Expo documentation: https://docs.expo.dev/
- React Native docs: https://reactnative.dev/
- Expo forums: https://forums.expo.dev/

## Next Steps

After running the app:
1. Test login with staff credentials
2. Verify tables are loading
3. Test menu browsing and order placement
4. Test voice orders
5. Test menu management (if owner/manager role)
