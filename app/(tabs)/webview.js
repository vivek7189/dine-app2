import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { useResponsive } from '../../hooks/useResponsive';

export default function WebViewScreen() {
  const { url, title } = useLocalSearchParams();
  const router = useRouter();
  const { isTablet, isLandscape } = useResponsive();
  const useDesktopLayout = isTablet || isLandscape;
  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    buildAuthUrl();
  }, [url]);

  const buildAuthUrl = async () => {
    try {
      const token = await apiClient.getToken();
      const ud = await apiClient.getUser();
      setUserData(ud);
      if (token && url) {
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
      console.error('WebView buildAuthUrl error:', e);
      setAuthUrl(url);
    }
  };

  // Inject auth data into localStorage before page loads
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
      return parts.join('\n') + '\ntrue;';
    } catch { return 'true;'; }
  }, [authUrl, userData, useDesktopLayout]);

  const handleRetry = () => {
    setLoadFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  const handleBack = () => {
    if (canGoBack) {
      webViewRef.current?.goBack();
    } else {
      router.replace('/(tabs)/more');
    }
  };

  if (!authUrl) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.loadingDot} />
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
          onNavigationStateChange={(navState) => {
            setCanGoBack(navState.canGoBack);
          }}
          onError={(e) => {
            const desc = e.nativeEvent?.description || '';
            console.warn('WebView onError:', desc);
            setLoading(false);
            if (desc.includes('ERR_ABORTED') || desc.includes('cancelled') || e.nativeEvent?.code === -999) {
              return;
            }
            setLoadFailed(true);
          }}
          onHttpError={(e) => {
            console.warn('WebView HTTP error:', e.nativeEvent?.statusCode, e.nativeEvent?.url);
            if (e.nativeEvent?.statusCode >= 500) setLoadFailed(true);
          }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
          originWhitelist={['https://*', 'http://*']}
          mixedContentMode="compatibility"
          allowsInlineMediaPlayback
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          pullToRefreshEnabled
          onShouldStartLoadWithRequest={(request) => {
            if (request.url && request.url.includes('/login')) {
              return false;
            }
            return true;
          }}
          injectedJavaScript={`
            window.__DINEOPEN_MOBILE_EMBED__ = true;
            ${useDesktopLayout ? 'window.__DINEOPEN_FORCE_DESKTOP__ = true;' : ''}
            true;
          `}
        />

        {/* Thin progress bar at top */}
        {loading && (
          <View style={styles.progressBar} />
        )}

        {/* Floating back button */}
        <TouchableOpacity onPress={handleBack} style={styles.floatingBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={18} color="#374151" />
        </TouchableOpacity>

        {/* Error overlay — shown ON TOP of WebView, not replacing it */}
        {loadFailed && (
          <View style={styles.errorOverlay}>
            <Ionicons name="cloud-offline" size={48} color="#9ca3af" />
            <Text style={styles.errorTitle}>Failed to load page</Text>
            <Text style={styles.errorSubtitle}>Check your internet connection and try again</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
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
  floatingBack: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
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
  webview: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#ef4444',
    borderTopColor: 'transparent',
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
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
