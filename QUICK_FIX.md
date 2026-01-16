# Quick Fix for Font Error

## The Problem
Version mismatch: `expo-font` version 14 is installed but Expo SDK 51 needs version 12.

## Solution - Run These Commands:

```bash
cd dine-app

# 1. Remove node_modules and package-lock
rm -rf node_modules package-lock.json

# 2. Install correct version
npx expo install expo-font@~12.0.10

# 3. Reinstall all dependencies
npm install

# 4. Clear all caches
rm -rf .expo

# 5. Restart with cleared cache
npx expo start --clear
```

## If Still Not Working:

The issue might be that we're trying to use `useFonts` when we don't need custom fonts. I've simplified the `_layout.js` to not require font loading. The icons should work without explicitly loading fonts.

Try the above steps first, and if it still fails, the simplified layout should work.
