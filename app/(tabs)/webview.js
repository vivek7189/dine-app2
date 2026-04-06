import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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
  const [error, setError] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);

  useEffect(() => {
    buildAuthUrl();
  }, [url]);

  const buildAuthUrl = async () => {
    try {
      const token = await apiClient.getToken();
      if (token && url) {
        const separator = url.includes('?') ? '&' : '?';
        setAuthUrl(`${url}${separator}token=${token}`);
      } else {
        setAuthUrl(url);
      }
    } catch (e) {
      setAuthUrl(url);
    }
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || 'DineOpen'}</Text>
        <TouchableOpacity onPress={() => webViewRef.current?.reload()} style={styles.headerBtn}>
          <Ionicons name="refresh" size={22} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Loading bar */}
      {loading && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#ef4444" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* Error state */}
      {error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline" size={48} color="#9ca3af" />
          <Text style={styles.errorTitle}>Failed to load page</Text>
          <Text style={styles.errorSubtitle}>Check your internet connection and try again</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setError(false); webViewRef.current?.reload(); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ uri: authUrl }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) setError(true); }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          sharedCookiesEnabled
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef7f0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  headerBtn: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginHorizontal: 8,
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
