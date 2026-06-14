import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../services/api';
import { Colors, Spacing } from '../constants/Theme';

let Location = null;
try {
  Location = require('expo-location');
} catch (e) {
  // expo-location not available
}

export default function GeoFenceSettings({ restaurantId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState('150');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [address, setAddress] = useState('');

  // Track original values to detect changes
  const [original, setOriginal] = useState(null);

  useEffect(() => {
    loadConfig();
  }, [restaurantId]);

  const loadConfig = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const res = await apiClient.getLeaveConfig(restaurantId);
      const config = res?.config || res || {};
      const geoEnabled = config.geoFenceEnabled || false;
      const geoRadius = String(config.geoFenceRadius || 150);
      const geoLat = config.geoFenceLocation?.lat ? String(config.geoFenceLocation.lat) : '';
      const geoLng = config.geoFenceLocation?.lng ? String(config.geoFenceLocation.lng) : '';
      const geoAddr = config.geoFenceLocation?.address || '';

      setEnabled(geoEnabled);
      setRadius(geoRadius);
      setLat(geoLat);
      setLng(geoLng);
      setAddress(geoAddr);
      setOriginal({ enabled: geoEnabled, radius: geoRadius, lat: geoLat, lng: geoLng, address: geoAddr });
    } catch (err) {
      console.error('Failed to load geo-fence config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!Location) {
      Alert.alert('Not Available', 'Location services are not available on this device.');
      return;
    }
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to set the geo-fence center.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeout: 15000,
      });
      const newLat = loc.coords.latitude.toFixed(6);
      const newLng = loc.coords.longitude.toFixed(6);
      setLat(newLat);
      setLng(newLng);

      // Reverse geocode for address
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (results && results.length > 0) {
          const r = results[0];
          const parts = [r.name, r.street, r.district, r.city, r.region].filter(Boolean);
          const fullAddr = parts.join(', ');
          if (fullAddr) setAddress(fullAddr);
        }
      } catch (geoErr) {
        // Reverse geocode failed — lat/lng still set, address remains manual
        console.warn('Reverse geocode failed:', geoErr);
      }
    } catch (err) {
      console.error('Location error:', err);
      Alert.alert('Location Error', 'Could not get your current location. Please try again.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const hasChanges = () => {
    if (!original) return false;
    return enabled !== original.enabled
      || radius !== original.radius
      || lat !== original.lat
      || lng !== original.lng
      || address !== original.address;
  };

  const handleSave = async () => {
    if (!restaurantId) return;

    if (enabled) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      const parsedRadius = parseInt(radius, 10);

      if (!lat || !lng || isNaN(parsedLat) || isNaN(parsedLng)) {
        Alert.alert('Missing Location', 'Please set the geo-fence location using "Use Current Location" or enter coordinates manually.');
        return;
      }
      if (parsedLat < -90 || parsedLat > 90) {
        Alert.alert('Invalid Latitude', 'Latitude must be between -90 and 90.');
        return;
      }
      if (parsedLng < -180 || parsedLng > 180) {
        Alert.alert('Invalid Longitude', 'Longitude must be between -180 and 180.');
        return;
      }
      if (!parsedRadius || parsedRadius < 10) {
        Alert.alert('Invalid Radius', 'Radius must be at least 10 meters.');
        return;
      }
    }

    setSaving(true);
    try {
      const config = {
        geoFenceEnabled: enabled,
        geoFenceRadius: parseInt(radius, 10) || 150,
        geoFenceLocation: enabled ? {
          lat: parseFloat(lat) || 0,
          lng: parseFloat(lng) || 0,
          address: address.trim(),
        } : null,
      };
      await apiClient.saveLeaveConfig(restaurantId, config);
      setOriginal({ enabled, radius, lat, lng, address });
      Alert.alert('Saved', 'Geo-fence settings updated successfully.');
    } catch (err) {
      console.error('Failed to save geo-fence config:', err);
      Alert.alert('Error', err.message || 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading geo-fence settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Enable Toggle */}
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Ionicons name="shield-checkmark-outline" size={22} color={enabled ? Colors.primary : '#9ca3af'} />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.toggleLabel}>Enable Geo-Fence</Text>
              <Text style={styles.toggleDesc}>
                Staff can only clock in within the set radius of your restaurant
              </Text>
            </View>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: '#e5e7eb', true: Colors.primary + '60' }}
            thumbColor={enabled ? Colors.primary : '#f4f3f4'}
          />
        </View>
      </View>

      {enabled && (
        <>
          {/* Use Current Location */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Restaurant Location</Text>
            <Text style={styles.sectionDesc}>
              Set the center point of the geo-fence. Staff must be within the radius to clock in.
            </Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={handleUseCurrentLocation}
              disabled={fetchingLocation}
              activeOpacity={0.7}
            >
              {fetchingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="navigate" size={18} color="#fff" />
              )}
              <Text style={styles.locationButtonText}>
                {fetchingLocation ? 'Getting Location...' : 'Use Current Location'}
              </Text>
            </TouchableOpacity>

            {lat && lng ? (
              <View style={styles.coordsDisplay}>
                <Ionicons name="location" size={16} color="#10b981" />
                <Text style={styles.coordsText}>
                  {parseFloat(lat).toFixed(4)}, {parseFloat(lng).toFixed(4)}
                </Text>
              </View>
            ) : (
              <View style={styles.coordsDisplay}>
                <Ionicons name="location-outline" size={16} color="#9ca3af" />
                <Text style={[styles.coordsText, { color: '#9ca3af' }]}>No location set</Text>
              </View>
            )}

            {/* Manual coordinate inputs */}
            <View style={styles.coordRow}>
              <View style={styles.coordInput}>
                <Text style={styles.inputLabel}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={lat}
                  onChangeText={setLat}
                  placeholder="19.0760"
                  placeholderTextColor="#d1d5db"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.coordInput}>
                <Text style={styles.inputLabel}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={lng}
                  onChangeText={setLng}
                  placeholder="72.8777"
                  placeholderTextColor="#d1d5db"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          {/* Radius & Address */}
          <View style={styles.card}>
            <Text style={styles.inputLabel}>Radius (meters)</Text>
            <TextInput
              style={styles.input}
              value={radius}
              onChangeText={setRadius}
              placeholder="150"
              placeholderTextColor="#d1d5db"
              keyboardType="number-pad"
            />
            <Text style={styles.radiusHint}>
              Staff must be within {radius || '150'}m of the location to clock in
            </Text>

            <View style={{ height: 16 }} />

            <Text style={styles.inputLabel}>Address (optional)</Text>
            <TextInput
              style={[styles.input, styles.addressInput]}
              value={address}
              onChangeText={setAddress}
              placeholder="Restaurant address for reference"
              placeholderTextColor="#d1d5db"
              multiline
              numberOfLines={2}
            />
          </View>
        </>
      )}

      {/* Save Button */}
      {hasChanges() && (
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          )}
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Info Note */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle-outline" size={18} color="#6b7280" />
        <Text style={styles.infoText}>
          When enabled, staff must be within the set radius of this location to clock in for attendance.
          The setting applies to all staff members using the app.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#9ca3af',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  toggleDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 14,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  locationButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  coordsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  coordsText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  coordRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  coordInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
  addressInput: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  radiusHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 6,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
});
