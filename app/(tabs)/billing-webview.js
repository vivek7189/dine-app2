import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { WEB_BASE_URL } from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';

export default function BillingWebViewScreen() {
  const { billingData, returnTo, tableId, tableNumber } = useLocalSearchParams();
  const router = useRouter();
  const { isTablet, isLandscape } = useResponsive();
  const useDesktopLayout = isTablet || isLandscape;
  const webViewRef = useRef(null);
  const completedRef = useRef(false);
  const shellReadyRef = useRef(false);
  const pendingDataRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [billingReady, setBillingReady] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null); // { status, message }

  useEffect(() => {
    buildAuthUrl();
  }, []);

  // Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => handler.remove();
  }, [returnTo, tableId, tableNumber]);

  const buildAuthUrl = async () => {
    try {
      const token = await apiClient.getToken();
      const ud = await apiClient.getUser();
      setUserData(ud);
      // Load in preload mode — page will wait for data via postMessage
      const url = `${WEB_BASE_URL}/mobile/billing?mode=preload`;
      if (token) {
        const u = new URL(url);
        u.searchParams.set('token', token);
        if (ud) {
          const rid = ud.restaurantId || ud.restaurant?.id;
          if (rid) u.searchParams.set('restaurantId', rid);
        }
        setAuthUrl(u.toString());
      } else {
        setAuthUrl(url);
      }
    } catch (e) {
      console.error('BillingWebView buildAuthUrl error:', e);
      setAuthUrl(`${WEB_BASE_URL}/mobile/billing?mode=preload`);
    }
  };

  // Inject auth + billing mode flags
  const injectedJS = React.useMemo(() => {
    if (!authUrl) return '';
    try {
      const u = new URL(authUrl);
      const token = u.searchParams.get('token');
      const rid = u.searchParams.get('restaurantId');
      const parts = [];
      if (token) parts.push(`localStorage.setItem('authToken','${token.replace(/'/g, "\\'")}');`);
      if (userData) parts.push(`localStorage.setItem('user',${JSON.stringify(JSON.stringify(userData))});`);
      if (rid) parts.push(`localStorage.setItem('selectedRestaurantId','${rid}');`);
      parts.push(`window.__DINEOPEN_MOBILE_EMBED__ = true;`);
      parts.push(`window.__DINEOPEN_BILLING_MODE__ = true;`);
      if (useDesktopLayout) {
        parts.push(`window.__DINEOPEN_FORCE_DESKTOP__ = true;`);
      }
      // Prevent zoom on iOS + suppress alert() dialogs
      parts.push(`
        (function() {
          var meta = document.querySelector('meta[name="viewport"]');
          if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
          window.alert = function() {};
          window.confirm = function() { return true; };
        })();
      `);
      return parts.join('\n') + '\ntrue;';
    } catch { return 'true;'; }
  }, [authUrl, userData, useDesktopLayout]);

  // Send billing data to the WebView once the shell is ready
  const sendBillingData = useCallback(() => {
    if (!webViewRef.current || !billingData) return;
    try {
      const data = typeof billingData === 'string' ? billingData : JSON.stringify(billingData);
      const js = `
        window.postMessage(${JSON.stringify(data)}, '*');
        true;
      `;
      webViewRef.current.injectJavaScript(js);
    } catch (e) {
      console.error('Failed to send billing data:', e);
    }
  }, [billingData]);

  // Extract orderId from billingData for cleanup on back
  const orderIdRef = useRef(null);
  useEffect(() => {
    if (billingData) {
      try {
        const parsed = typeof billingData === 'string' ? JSON.parse(billingData) : billingData;
        orderIdRef.current = parsed?.payload?.orderId || null;
      } catch {}
    }
  }, [billingData]);

  const handleBack = async () => {
    // If billing wasn't completed, cancel the pending order in the background
    if (!completedRef.current && orderIdRef.current) {
      apiClient.cancelKotOrder(orderIdRef.current, 'Billing cancelled').catch(() => {});
    }
    // Signal menu screen to clear stale existingOrderId on next focus
    await AsyncStorage.setItem('billingWebViewResult', JSON.stringify({ action: 'cancelled' })).catch(() => {});
    if (returnTo === 'tables') {
      router.replace('/(tabs)/tables');
    } else if (returnTo === 'orders') {
      router.replace('/(tabs)/orders');
    } else {
      router.replace('/(tabs)/menu');
    }
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'BILLING_SHELL_READY') {
        // Page shell is loaded and ready — send the billing data
        shellReadyRef.current = true;
        sendBillingData();
      } else if (data.type === 'BILLING_READY') {
        // Page has received data and rendered OrderSummary
        setBillingReady(true);
        setLoading(false);
      } else if (data.type === 'BILLING_COMPLETE' && !completedRef.current) {
        completedRef.current = true;
        // Signal menu screen to clear cart and existingOrderId
        AsyncStorage.setItem('billingWebViewResult', JSON.stringify({ action: 'completed', orderId: data.orderId })).catch(() => {});

        // Show native success overlay, then navigate after 1.5s
        const statusLabel = data.status === 'completed' ? 'Billing Completed!'
          : data.status === 'confirmed' ? 'Order Placed!'
          : data.status === 'saved' ? 'Order Saved!'
          : 'Success!';
        setSuccessInfo({ status: data.status, message: statusLabel });

        setTimeout(() => {
          if (returnTo === 'tables') {
            router.replace('/(tabs)/tables');
          } else {
            router.replace('/(tabs)/orders');
          }
        }, 1500);
      } else if (data.type === 'BILLING_CLOSE') {
        handleBack();
      }
    } catch (e) {
      // Non-JSON messages ignored
    }
  };

  const handleRetry = () => {
    setLoadFailed(false);
    setLoading(true);
    completedRef.current = false;
    shellReadyRef.current = false;
    setBillingReady(false);
    webViewRef.current?.reload();
  };

  if (!authUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* WebView — always mounted */}
      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: authUrl }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          onMessage={handleMessage}
          onLoadStart={() => { setLoading(true); setLoadFailed(false); }}
          onLoadEnd={() => {
            // Page loaded but we wait for BILLING_READY message to hide loading
            if (!billingData) setLoading(false);
          }}
          onError={(e) => {
            const desc = e.nativeEvent?.description || '';
            setLoading(false);
            if (desc.includes('ERR_ABORTED') || desc.includes('cancelled') || e.nativeEvent?.code === -999) return;
            setLoadFailed(true);
          }}
          onHttpError={(e) => {
            if (e.nativeEvent?.statusCode >= 500) setLoadFailed(true);
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          sharedCookiesEnabled
          originWhitelist={['https://*', 'http://*']}
          mixedContentMode="compatibility"
          allowsInlineMediaPlayback
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          scalesPageToFit={false}
          keyboardDisplayRequiresUserAction={false}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url && request.url.includes('/login')) return false;
            return true;
          }}
          injectedJavaScript={`
            window.__DINEOPEN_MOBILE_EMBED__ = true;
            window.__DINEOPEN_BILLING_MODE__ = true;
            ${useDesktopLayout ? 'window.__DINEOPEN_FORCE_DESKTOP__ = true;' : ''}
            true;
          `}
        />

        {/* Loading overlay — shown until billing page sends BILLING_READY */}
        {loading && !loadFailed && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#ef4444" />
            <Text style={styles.loadingOverlayText}>Loading billing...</Text>
          </View>
        )}

        {/* Success overlay — shown after BILLING_COMPLETE from WebView */}
        {successInfo && (
          <View style={styles.successOverlay}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={72} color="#16a34a" />
            </View>
            <Text style={styles.successTitle}>{successInfo.message}</Text>
            <Text style={styles.successSubtitle}>Redirecting...</Text>
          </View>
        )}

        {/* Error overlay */}
        {loadFailed && (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline" size={48} color="#9ca3af" />
            <Text style={styles.errorTitle}>Failed to load billing</Text>
            <Text style={styles.errorSubtitle}>Check your internet connection and try again</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.retryBtn, styles.backBtn]} onPress={handleBack}>
              <Text style={styles.retryText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  loadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: '#fffbeb',
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  loadingText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '500',
  },
  webview: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    zIndex: 10,
  },
  loadingOverlayText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
    fontWeight: '500',
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    zIndex: 20,
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#16a34a',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 6,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  backBtn: {
    backgroundColor: '#6b7280',
    marginTop: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
