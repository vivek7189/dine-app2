import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { OfflineProvider, useOffline } from '../hooks/useOffline';
import ImagePrintHost from '../components/ImagePrintHost';
import { hasPin, isUnlocked, lockSession } from '../services/pinLock';
import { loadCurrencyConfig } from '../utils/formatCurrency';
import apiClient from '../services/api';
import lanClient from '../services/lanClient';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

function PinGate({ children }) {
  const { effectivelyOffline } = useOffline();
  const router = useRouter();
  const segments = useSegments();
  const appState = useRef(AppState.currentState);
  const [checked, setChecked] = useState(false);

  // Check PIN on mount and when offline state changes
  // Local-server (offline LAN) bootstrap — runs once at launch, before any API call.
  // Loads the persisted local server URL (routes API there) and registers the LAN
  // client so real-time connects once the restaurant is known (setRestaurantBaseURL).
  useEffect(() => {
    (async () => {
      try {
        apiClient.setLanClient(lanClient);
        await lanClient.init();
        await apiClient.initLocalServerRouting();
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    checkPinLock();
  }, [effectivelyOffline]);

  // Lock when app goes to background while offline
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current === 'active' && nextState.match(/inactive|background/)) {
        // App going to background — lock if offline
        if (effectivelyOffline) {
          await lockSession();
        }
      }
      if (nextState === 'active' && appState.current.match(/inactive|background/)) {
        // App coming to foreground — re-check
        checkPinLock();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [effectivelyOffline]);

  const checkPinLock = async () => {
    // Only gate when offline
    if (!effectivelyOffline) {
      setChecked(true);
      return;
    }

    const pinSet = await hasPin();
    if (!pinSet) {
      setChecked(true);
      return;
    }

    const unlocked = await isUnlocked();
    if (unlocked) {
      setChecked(true);
      return;
    }

    // Need PIN — redirect to pin screen (only if not already there)
    const currentSegment = segments[0];
    if (currentSegment !== '(auth)' || segments[1] !== 'offline-pin') {
      router.replace('/(auth)/offline-pin');
    }
    setChecked(true);
  };

  if (!checked) return null;
  return children;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  // Background OTA update — download silently, apply on next app launch
  useEffect(() => {
    if (__DEV__) return; // skip in development
    async function checkForUpdate() {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          // Apply on next cold start — no disruptive reload
        }
      } catch (e) {
        // Silent fail — don't disrupt the user
      }
    }
    checkForUpdate();

    // Also check when app comes back to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate();
    });
    return () => sub.remove();
  }, []);

  // Load cached currency settings from AsyncStorage on startup
  useEffect(() => {
    loadCurrencyConfig();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <OfflineProvider>
          <PinGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#fef7f0' },
              }}
            >
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </PinGate>
        </OfflineProvider>
        {/* Hidden host for opt-in image (HTML) receipt printing. Passive until used. */}
        <ImagePrintHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
