# Fix: Cannot find native module 'ExpoLinking'

## Quick Fix

Run these commands in order:

```bash
cd dine-app

# 1. Install expo-linking explicitly
npx expo install expo-linking

# 2. Clear cache and restart
npx expo start --clear
```

## If that doesn't work, try:

```bash
cd dine-app

# 1. Delete node_modules and reinstall
rm -rf node_modules
npm install

# 2. Install expo-linking
npx expo install expo-linking

# 3. Clear all caches
rm -rf .expo
npx expo start --clear
```

## For Physical Devices (Expo Go)

If using Expo Go app:
1. Close the Expo Go app completely
2. Clear Expo Go app cache (iOS: Settings > Expo Go > Clear Cache)
3. Restart the development server: `npx expo start --clear`
4. Scan QR code again

## For Development Builds

If you're using a development build (not Expo Go):
1. Rebuild the app:
   ```bash
   npx expo prebuild --clean
   npx expo run:ios    # for iOS
   # or
   npx expo run:android  # for Android
   ```

## Why This Happens

- `expo-router` requires `expo-linking` as a peer dependency
- The native module needs to be properly linked
- Sometimes cache issues prevent proper module loading

## Verification

After fixing, the app should start without the ExpoLinking error. You should see the login screen or be redirected based on your auth status.
