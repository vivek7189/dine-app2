# How to Build APK for Android

This guide will help you generate an APK file that you can install directly on your Android phone.

## Prerequisites

1. **Expo Account** (free): Sign up at https://expo.dev
2. **Node.js** installed (you already have this)
3. **Android Phone** for testing

## Method 1: EAS Build (Recommended - Modern Way)

### Step 1: Install EAS CLI

```bash
npm install -g eas-cli
```

### Step 2: Login to Expo

```bash
eas login
```

Enter your Expo account credentials (create one at https://expo.dev if you don't have one).

### Step 3: Configure EAS Build

Create `eas.json` file in the `dine-app` folder:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "android": {
        "buildType": "apk"
      },
      "distribution": "internal"
    },
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### Step 4: Build APK

For testing on your phone, use the **preview** build:

```bash
cd dine-app
eas build --platform android --profile preview
```

This will:
- Upload your code to Expo's servers
- Build the APK in the cloud
- Give you a download link

### Step 5: Download and Install

1. After the build completes, you'll get a URL
2. Open the URL on your phone's browser
3. Download the APK file
4. Enable "Install from Unknown Sources" on your Android phone:
   - Go to Settings → Security → Enable "Unknown Sources" or "Install Unknown Apps"
5. Install the APK

---

## Method 2: Local Development Build (Faster for Testing)

If you want to build locally without uploading to Expo servers:

### Step 1: Install Android Studio

1. Download from https://developer.android.com/studio
2. Install Android SDK and build tools
3. Set up Android emulator (optional, for testing)

### Step 2: Install Java Development Kit (JDK)

```bash
# On macOS (using Homebrew)
brew install openjdk@17

# Set JAVA_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

### Step 3: Build APK Locally

```bash
cd dine-app

# Install dependencies
npm install

# Build APK (this requires Android SDK to be installed)
npx expo prebuild --platform android
cd android
./gradlew assembleRelease

# The APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Method 3: Quick Test Build (Simplest)

For the fastest way to test on your phone:

### Step 1: Install Expo Go App

1. Install "Expo Go" from Google Play Store on your Android phone
2. Make sure your phone and computer are on the same WiFi network

### Step 2: Start Development Server

```bash
cd dine-app
npm start
```

### Step 3: Scan QR Code

1. Open Expo Go app on your phone
2. Scan the QR code shown in the terminal
3. The app will load on your phone

**Note:** This method doesn't create an APK, but lets you test the app quickly. For a standalone APK, use Method 1 or 2.

---

## Recommended Approach

For your use case (testing on your Android phone), I recommend:

1. **Quick Testing**: Use Method 3 (Expo Go) to test quickly
2. **Standalone APK**: Use Method 1 (EAS Build) for a proper APK file

## Troubleshooting

### If EAS Build fails:
- Make sure you're logged in: `eas whoami`
- Check your `app.json` configuration
- Ensure your Expo account is verified

### If local build fails:
- Make sure Android SDK is properly installed
- Check JAVA_HOME is set correctly
- Verify `ANDROID_HOME` environment variable

### APK Installation Issues:
- Enable "Install from Unknown Sources" in Android Settings
- Some phones require you to allow installation per app (like Chrome or File Manager)

---

## Next Steps After Building

Once you have the APK:
1. Transfer it to your Android phone (via USB, email, or cloud storage)
2. Open the APK file on your phone
3. Allow installation from unknown sources if prompted
4. Install and test!

## Production Build

When you're ready for production:
```bash
eas build --platform android --profile production
```

This creates a signed APK ready for Google Play Store (if you configure signing keys).
