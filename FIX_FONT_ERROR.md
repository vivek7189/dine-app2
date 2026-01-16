# Fix: ExpoFontLoader.default.getLoadedFonts is not a function

## Quick Fix

Run these commands:

```bash
cd dine-app

# 1. Install required font packages
npx expo install expo-font expo-splash-screen

# 2. Clear cache and restart
npx expo start --clear
```

## If that doesn't work:

```bash
cd dine-app

# 1. Delete node_modules and reinstall
rm -rf node_modules
npm install

# 2. Install font packages
npx expo install expo-font expo-splash-screen

# 3. Clear all caches
rm -rf .expo
npx expo start --clear
```

## What I Changed

1. **Added `expo-font`** to package.json - Required for font loading
2. **Added `expo-splash-screen`** to package.json - For proper splash screen handling
3. **Updated `app/_layout.js`** - Added proper font loading initialization

## Why This Happens

- `@expo/vector-icons` requires fonts to be loaded
- `expo-font` needs to be explicitly installed and initialized
- The font loader needs to be set up before icons can be used

## After Fixing

The app should:
1. Load fonts properly
2. Display icons correctly
3. Show the login screen without errors

## Verification

After running the install commands, restart the app. You should see:
- No font loader errors
- Icons displaying correctly
- App functioning normally
