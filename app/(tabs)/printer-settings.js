import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import apiClient from '../../services/api';
import PrinterSetup from '../../components/PrinterSetup';
import PrintSettings from '../../components/PrintSettings';
import { useResponsive } from '../../hooks/useResponsive';

const APP_VERSION = Constants.expoConfig?.version || Constants.manifest?.version || 'unknown';

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { isTablet } = useResponsive();
  const [restaurantId, setRestaurantId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [multiStationCount, setMultiStationCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const userData = await apiClient.getUser();
        const rid = userData?.restaurantId || userData?.restaurant?.id;
        if (rid) setRestaurantId(rid);
      } catch (e) {
        console.error('Error loading user for printer settings:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fetch print station config to show multi-station info banner
  useEffect(() => {
    if (!restaurantId) return;
    apiClient.getPrintStations(restaurantId).then(res => {
      if (res?.success) {
        const enabled = (res.printStations || []).filter(s => s.enabled);
        setMultiStationCount(enabled.length);
      }
    }).catch(() => {});
  }, [restaurantId]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#374151" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Printer Settings</Text>
          <Text style={styles.versionText}>v{APP_VERSION}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ef4444" />
          <Text style={styles.loadingText}>Loading printer settings...</Text>
        </View>
      ) : !restaurantId ? (
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={40} color="#d1d5db" />
          <Text style={styles.loadingText}>Could not load restaurant info</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: 600, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Multi-station info banner */}
          {multiStationCount >= 2 && (
            <View style={styles.multiStationBanner}>
              <Ionicons name="information-circle" size={20} color="#2563eb" />
              <View style={{ flex: 1 }}>
                <Text style={styles.multiStationTitle}>Multi-Station KOT Routing Active</Text>
                <Text style={styles.multiStationText}>
                  KOT prints will be handled by the main POS machine. Your connected printer will be used for bill printing only.
                </Text>
                <Text style={styles.multiStationHint}>Contact admin to change station settings.</Text>
              </View>
            </View>
          )}

          {/* Printer Connection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="print-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Printer Connection</Text>
            </View>
            <PrinterSetup restaurantId={restaurantId} />
          </View>

          {/* Print Behavior Settings — always visible */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: '#8b5cf6' }]}>
                <Ionicons name="options-outline" size={16} color="#fff" />
              </View>
              <Text style={styles.sectionTitle}>Print Behavior</Text>
            </View>
            <PrintSettings restaurantId={restaurantId} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={14} color="#9ca3af" />
            <Text style={styles.footerText}>
              Print settings are synced across all devices for this restaurant.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 44 : 56,
    paddingBottom: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ece8e1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },
  versionText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    marginLeft: 2,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    letterSpacing: 0.3,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  loadingText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  multiStationBanner: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  multiStationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 4,
  },
  multiStationText: {
    fontSize: 12,
    color: '#1e3a5f',
    lineHeight: 18,
  },
  multiStationHint: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
});
