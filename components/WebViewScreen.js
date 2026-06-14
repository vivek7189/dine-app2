import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { WEB_BASE_URL } from '../services/api';
import * as printerService from '../services/printerService';
import { useResponsive } from '../hooks/useResponsive';

/**
 * Shared WebView screen for tab navigation.
 * Handles auth injection, iOS zoom fixes, print bridge, error overlay.
 *
 * @param {string} route - The mobile route path (e.g. "/mobile/dashboard")
 * @param {string} screenName - Display name for logs and error messages (e.g. "Billing")
 */
export default function WebViewScreen({ route, screenName = 'Page' }) {
  const webViewRef = useRef(null);
  const router = useRouter();
  const { isTablet, isLandscape } = useResponsive();
  const useDesktopLayout = isTablet || isLandscape;
  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [bustCache, setBustCache] = useState(false); // true = new build detected, skip cache

  useEffect(() => {
    buildAuthUrl();
    printerService.autoReconnect().catch(() => {});
    // Check if frontend has a new build — if so, bust WebView cache for this session
    (async () => {
      try {
        const res = await fetch(`${WEB_BASE_URL}/api/build-version`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const remote = data.version;
          const stored = await AsyncStorage.getItem('webview_build_version');
          if (stored && stored !== remote) {
            setBustCache(true);
          }
          if (remote && remote !== 'unknown') {
            await AsyncStorage.setItem('webview_build_version', remote);
          }
        }
      } catch (_) { /* ignore — use cache as fallback */ }
    })();
  }, []);

  const buildAuthUrl = async () => {
    try {
      const token = await apiClient.getToken();
      const ud = await apiClient.getUser();
      setUserData(ud);
      const url = `${WEB_BASE_URL}${route}`;
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
      console.error(`[${screenName}] WebView buildAuthUrl error:`, e);
      setAuthUrl(`${WEB_BASE_URL}${route}`);
    }
  };

  // Inject auth data + mobile embed flag into localStorage before page loads
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
      if (useDesktopLayout) {
        parts.push(`window.__DINEOPEN_FORCE_DESKTOP__ = true;`);
      }
      // Prevent zoom on iOS + suppress alert/confirm dialogs
      parts.push(`
        (function() {
          var meta = document.querySelector('meta[name="viewport"]');
          if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
          window.alert = function() {};
          window.confirm = function() { return true; };
          var style = document.createElement('style');
          style.textContent = 'input,select,textarea{font-size:16px;max-width:100%;box-sizing:border-box;}input:focus,select:focus,textarea:focus{font-size:16px!important;}html{touch-action:manipulation;}#sidebar-hamburger{display:none!important;}' +
            '@media (max-width:768px){.billing-modal-panel{height:var(--app-height,100vh)!important;max-height:var(--app-height,100vh)!important;}.max-h-\\[92vh\\]{max-height:calc(var(--app-height,92vh) - 8px)!important;}.max-h-\\[90vh\\]{max-height:calc(var(--app-height,90vh) - 8px)!important;}}';
          document.head.appendChild(style);
          // Set CSS variable for actual viewport height (100vh is unreliable in iOS WebView)
          function setAppHeight() {
            document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
          }
          setAppHeight();
          window.addEventListener('resize', setAppHeight);
          window.addEventListener('orientationchange', function() { setTimeout(setAppHeight, 100); });
          document.addEventListener('blur', function(e) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
              setTimeout(function() {
                var vp = document.querySelector('meta[name="viewport"]');
                if (vp) { vp.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'; }
                window.scrollTo(0, window.scrollY);
              }, 100);
            }
          }, true);
        })();
      `);
      return parts.join('\n') + '\ntrue;';
    } catch { return 'true;'; }
  }, [authUrl, userData, useDesktopLayout]);

  // Handle messages from WebView (print bridge + navigation signals)
  const handleWebViewMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      // Navigation signal from WebView (e.g. "go back to tables tab after order")
      if (data.type === 'navigate') {
        const tabMap = { tables: '/(tabs)/tables', home: '/(tabs)/home', orders: '/(tabs)/orders', menu: '/(tabs)/menu', billing: '/(tabs)/billing-tab' };
        const target = tabMap[data.target];
        if (target) {
          console.log(`[${screenName}] Navigate to:`, data.target);
          router.replace(target);
        }
        return;
      }

      if (data.type !== 'PRINT_KOT' && data.type !== 'PRINT_BILL') return;

      console.log(`[${screenName}] Print request:`, data.type, data.orderId);

      let text = null;
      const html = data.html || null;
      const restaurantId = data.restaurantId || userData?.restaurantId || userData?.restaurant?.id;

      // Fetch order data to generate ESC/POS text for thermal printers
      if (data.orderId && restaurantId) {
        try {
          const order = await apiClient.getOrderById(restaurantId, data.orderId);
          if (order) {
            if (data.type === 'PRINT_KOT') {
              text = printerService.generateKOTText({
                restaurantName: order.restaurantName || userData?.restaurant?.name || '',
                tableNumber: order.tableNumber || order.tableName || '',
                orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
                orderId: order.id,
                orderType: order.orderType || 'dine-in',
                waiterName: order.waiterName || '',
                customerName: order.customerInfo?.name || '',
                timestamp: order.createdAt || new Date(),
                items: order.items || [],
                printSettings: data.printSettings || {},
              });
            } else {
              const subtotal = (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
              text = printerService.generateBillText({
                orderId: order.id,
                orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
                restaurantName: order.restaurantName || userData?.restaurant?.name || '',
                restaurantInfo: order.restaurantInfo || {},
                items: (order.items || []).map(i => ({
                  name: i.name,
                  quantity: i.quantity || 1,
                  price: i.price || 0,
                  total: (i.price || 0) * (i.quantity || 1),
                  selectedVariant: i.selectedVariant || null,
                  selectedCustomizations: i.selectedCustomizations || [],
                })),
                subtotal,
                tax: order.taxAmount || 0,
                taxRate: order.taxRate || 0,
                taxEnabled: !!(order.taxAmount > 0 || order.taxBreakdown?.length),
                taxBreakdown: order.taxBreakdown || null,
                grandTotal: order.finalAmount || order.totalAmount || subtotal,
                customerName: order.customerInfo?.name || 'Walk-in Customer',
                orderType: order.orderType || 'dine-in',
                paymentMethod: order.paymentMethod || 'cash',
                timestamp: order.completedAt || order.createdAt || new Date(),
                offerDiscount: order.discountAmount || 0,
                manualDiscount: order.manualDiscount || 0,
                serviceChargeAmount: order.serviceChargeAmount || 0,
                tipAmount: order.tipAmount || 0,
                roundOffAmount: order.roundOffAmount || 0,
                cashReceived: order.cashReceived || null,
                changeReturned: order.changeReturned || null,
                splitPayments: order.splitPayments || null,
                printSettings: data.printSettings || {},
              });
            }
          }
        } catch (fetchErr) {
          console.warn(`[${screenName}] Could not fetch order for ESC/POS text:`, fetchErr.message);
        }
      }

      // Split Bill: generate and print per-guest receipts for thermal
      if (data.orderId && restaurantId && !text) {
        try {
          const order = data._order || (data.orderId ? await apiClient.getOrderById(restaurantId, data.orderId).catch(() => null) : null);
          if (order?.splitBill?.splits?.length >= 2 && data.type === 'PRINT_BILL') {
            const sb = order.splitBill;
            const subtotal = (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.quantity || 1)), 0);
            const baseBillData = {
              orderId: order.id,
              orderNumber: order.dailyOrderId || order.orderNumber || order.id?.slice(-6),
              restaurantName: order.restaurantName || userData?.restaurant?.name || '',
              restaurantInfo: order.restaurantInfo || {},
              timestamp: order.completedAt || order.createdAt || new Date(),
              printSettings: data.printSettings || {},
            };
            for (let si = 0; si < sb.splits.length; si++) {
              const split = sb.splits[si];
              const guestText = printerService.generateBillText({
                ...baseBillData,
                items: (sb.method === 'by-item' && split.items) ? split.items.map(i => ({
                  name: i.name, quantity: i.quantity || 1, price: i.price || 0,
                  total: (i.price || 0) * (i.quantity || 1),
                  selectedVariant: i.selectedVariant || null,
                  selectedCustomizations: i.selectedCustomizations || [],
                })) : (order.items || []).map(i => ({
                  name: i.name, quantity: i.quantity || 1, price: i.price || 0,
                  total: (i.price || 0) * (i.quantity || 1),
                  selectedVariant: i.selectedVariant || null,
                  selectedCustomizations: i.selectedCustomizations || [],
                })),
                subtotal: split.subtotal,
                taxBreakdown: split.taxBreakdown || null,
                grandTotal: split.totalAmount,
                customerName: order.customerInfo?.name || 'Walk-in Customer',
                orderType: order.orderType || 'dine-in',
                paymentMethod: split.paymentMethod || 'cash',
                offerDiscount: 0,
                manualDiscount: split.discountAmount || 0,
                serviceChargeAmount: split.serviceChargeAmount || 0,
                tipAmount: split.tipAmount || 0,
                roundOffAmount: 0,
                cashReceived: split.cashReceived || null,
                changeReturned: split.changeReturned || null,
                splitInfo: {
                  guestLabel: split.guestLabel || `Guest ${si + 1}`,
                  guestCount: sb.guestCount || sb.splits.length,
                  method: sb.method,
                },
              });
              await printerService.printContent({ text: guestText, silentOnly: true });
            }
            return; // Already printed all guest receipts
          }
        } catch (splitErr) {
          console.warn(`[${screenName}] Split bill thermal print error:`, splitErr.message);
        }
      }

      // Print: text for thermal printers, html for AirPrint/dialog
      await printerService.printContent({ html, text, silentOnly: true });
    } catch (err) {
      console.error(`[${screenName}] WebView message error:`, err);
    }
  }, [userData, screenName, router]);

  const handleRetry = () => {
    setLoadFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  if (!authUrl) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1 }}>
        <WebView
          ref={webViewRef}
          source={{ uri: authUrl }}
          style={styles.webview}
          injectedJavaScriptBeforeContentLoaded={injectedJS}
          onLoadStart={() => { setLoading(true); setLoadFailed(false); }}
          onLoadEnd={() => setLoading(false)}
          onError={(e) => {
            const desc = e.nativeEvent?.description || '';
            console.warn(`[${screenName}] WebView onError:`, desc);
            setLoading(false);
            if (desc.includes('ERR_ABORTED') || desc.includes('cancelled') || e.nativeEvent?.code === -999) {
              return;
            }
            setLoadFailed(true);
          }}
          onHttpError={(e) => {
            console.warn(`[${screenName}] WebView HTTP error:`, e.nativeEvent?.statusCode);
            if (e.nativeEvent?.statusCode >= 500) setLoadFailed(true);
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (request.url && request.url.includes('/login')) {
              return false;
            }
            return true;
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
          originWhitelist={['https://*', 'http://*']}
          mixedContentMode="compatibility"
          allowsInlineMediaPlayback
          cacheEnabled={!bustCache}
          cacheMode={bustCache ? 'LOAD_NO_CACHE' : 'LOAD_DEFAULT'}
          pullToRefreshEnabled
          onMessage={handleWebViewMessage}
          injectedJavaScript={`
            window.__DINEOPEN_MOBILE_EMBED__ = true;
            ${useDesktopLayout ? 'window.__DINEOPEN_FORCE_DESKTOP__ = true;' : ''}
            true;
          `}
        />

        {loading && (
          <View style={styles.progressBar} />
        )}

        {loadFailed && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorIcon}>📡</Text>
            <Text style={styles.errorTitle}>Failed to load {screenName.toLowerCase()}</Text>
            <Text style={styles.errorSubtitle}>Check your internet connection and try again</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.7}>
              <Text style={styles.retryText}>Retry</Text>
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
  webview: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#ef4444',
    zIndex: 5,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 48,
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
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
