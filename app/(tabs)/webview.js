import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';

export default function WebViewScreen() {
  const { url, title } = useLocalSearchParams();
  const router = useRouter();
  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [authUrl, setAuthUrl] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

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
      return parts.join('\n') + '\ntrue;';
    } catch { return 'true;'; }
  }, [authUrl, userData]);

  const handleRetry = () => {
    setLoadFailed(false);
    setLoading(true);
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
      {/* Minimal Header — back + refresh only */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={handleRetry} style={styles.headerBtn}>
          <Ionicons name="refresh" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Loading bar */}
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#ef4444" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* WebView is ALWAYS mounted — never removed on error */}
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
            console.warn('WebView onError:', desc);
            setLoading(false);
            // Ignore aborted/cancelled loads (caused by blocking /login nav)
            if (desc.includes('ERR_ABORTED') || desc.includes('cancelled') || e.nativeEvent?.code === -999) {
              return;
            }
            setLoadFailed(true);
          }}
          onHttpError={(e) => {
            console.warn('WebView HTTP error:', e.nativeEvent?.statusCode, e.nativeEvent?.url);
            // Only flag on actual server errors
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
          // On Android, block /login navigations at the native level
          onShouldStartLoadWithRequest={(request) => {
            // Block navigations to /login — the mobile embed should never redirect there
            if (request.url && request.url.includes('/login')) {
              return false;
            }
            return true;
          }}
          // Android: also inject on each new page load
          injectedJavaScript={`
            window.__DINEOPEN_MOBILE_EMBED__ = true;
            true;
          `}
        />

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
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
