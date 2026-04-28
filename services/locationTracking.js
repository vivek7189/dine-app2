/**
 * Delivery Driver Location Tracking Service
 *
 * Uses expo-location foreground service to track driver location during active deliveries.
 * Shows a persistent notification while tracking — works when app is minimized.
 * Does NOT require Google Play background location approval (foreground service is compliant).
 *
 * Usage:
 *   import { startDeliveryTracking, stopDeliveryTracking, isTrackingActive } from '../services/locationTracking';
 *
 *   // When driver accepts a delivery:
 *   await startDeliveryTracking(restaurantId, driverId, orderId);
 *
 *   // When delivery is completed:
 *   await stopDeliveryTracking();
 */

let TaskManager = null;
let Location = null;

try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  console.log('expo-task-manager not available');
}

try {
  Location = require('expo-location');
} catch (e) {
  console.log('expo-location not available');
}

const DELIVERY_LOCATION_TASK = 'DELIVERY_LOCATION_TRACKING';

// Store tracking context (restaurantId, driverId, orderId) for the background task
let trackingContext = null;

// ── Define the background task ──────────────────────────────

if (TaskManager) {
  TaskManager.defineTask(DELIVERY_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Location tracking error:', error.message);
      return;
    }
    if (!data || !data.locations || !trackingContext) return;

    const { locations } = data;
    const latest = locations[locations.length - 1];
    if (!latest) return;

    const { restaurantId, driverId, orderId } = trackingContext;

    try {
      // Import api dynamically to avoid circular deps
      const apiClient = require('./api').default;

      await apiClient.request(
        `/api/delivery/${restaurantId}/location-update`,
        'POST',
        {
          driverId,
          orderId,
          lat: latest.coords.latitude,
          lng: latest.coords.longitude,
          accuracy: latest.coords.accuracy,
          speed: latest.coords.speed,
          heading: latest.coords.heading,
          timestamp: new Date(latest.timestamp).toISOString(),
        }
      );
    } catch (err) {
      // Silently fail — don't crash the background task
      console.warn('Failed to send location update:', err.message);
    }
  });
}

// ── Public API ──────────────────────────────────────────────

/**
 * Request background location permission.
 * Must be called after foreground permission is already granted.
 * Shows a custom rationale before the system dialog.
 *
 * @returns {boolean} true if permission granted
 */
export async function requestBackgroundLocationPermission() {
  if (!Location) return false;

  // First ensure foreground is granted
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  // Then request background
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

/**
 * Start tracking driver location for a delivery.
 * Shows a persistent notification and continues tracking when app is minimized.
 *
 * @param {string} restaurantId
 * @param {string} driverId
 * @param {string} orderId
 * @returns {boolean} true if tracking started successfully
 */
export async function startDeliveryTracking(restaurantId, driverId, orderId) {
  if (!Location || !TaskManager) {
    console.warn('Location tracking not available — missing expo-location or expo-task-manager');
    return false;
  }

  // Check if already tracking
  const isStarted = await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK).catch(() => false);
  if (isStarted) {
    // Update context for the new delivery
    trackingContext = { restaurantId, driverId, orderId };
    return true;
  }

  // Request background permission
  const hasPermission = await requestBackgroundLocationPermission();
  if (!hasPermission) {
    console.warn('Background location permission not granted');
    return false;
  }

  // Store context for the background task
  trackingContext = { restaurantId, driverId, orderId };

  try {
    await Location.startLocationUpdatesAsync(DELIVERY_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 50, // update every 50 meters moved
      timeInterval: 30000, // or every 30 seconds
      deferredUpdatesInterval: 30000,
      showsBackgroundLocationIndicator: true, // iOS blue bar
      foregroundService: {
        notificationTitle: 'Delivery in Progress',
        notificationBody: 'DineOpen is tracking your location for this delivery',
        notificationColor: '#ef4444',
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
    });
    return true;
  } catch (err) {
    console.error('Failed to start location tracking:', err);
    trackingContext = null;
    return false;
  }
}

/**
 * Stop tracking driver location.
 * Removes the persistent notification and stops background updates.
 *
 * @returns {boolean} true if tracking stopped successfully
 */
export async function stopDeliveryTracking() {
  if (!Location || !TaskManager) return false;

  trackingContext = null;

  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK).catch(() => false);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
    }
    return true;
  } catch (err) {
    console.error('Failed to stop location tracking:', err);
    return false;
  }
}

/**
 * Check if delivery tracking is currently active.
 *
 * @returns {boolean}
 */
export async function isTrackingActive() {
  if (!Location) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(DELIVERY_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Get the current tracking context (restaurantId, driverId, orderId).
 *
 * @returns {object|null}
 */
export function getTrackingContext() {
  return trackingContext;
}
