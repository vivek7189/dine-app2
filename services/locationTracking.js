/**
 * Location Tracking Service
 *
 * Supports two modes:
 * 1. Staff shift tracking — periodic GPS pings (every 5 min) during clock-in to clock-out
 * 2. Delivery tracking — frequent GPS pings (every 30 sec) during active delivery
 *
 * Both use foreground service with persistent notification.
 * Play Store compliant — no background location approval needed.
 *
 * Usage:
 *   import { startStaffTracking, stopStaffTracking, startDeliveryTracking, stopDeliveryTracking } from '../services/locationTracking';
 *
 *   // Staff shift tracking:
 *   await startStaffTracking(restaurantId, staffId, staffName);
 *   await stopStaffTracking();
 *
 *   // Delivery tracking:
 *   await startDeliveryTracking(restaurantId, driverId, orderId);
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

const LOCATION_TASK = 'DINEOPEN_LOCATION_TRACKING';

// Store tracking context for the background task
// mode: 'staff' | 'delivery'
let trackingContext = null;

// ── Define the background task ──────────────────────────────

if (TaskManager) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error('Location tracking error:', error.message);
      return;
    }
    if (!data || !data.locations || !trackingContext) return;

    const { locations } = data;
    const latest = locations[locations.length - 1];
    if (!latest) return;

    const { restaurantId, staffId, staffName, orderId, mode } = trackingContext;

    try {
      const apiClient = require('./api').default;

      if (mode === 'staff') {
        // Staff shift tracking → attendance location-ping endpoint
        await apiClient.request(
          `/api/attendance/${restaurantId}/location-ping`,
          'POST',
          {
            staffId,
            staffName: staffName || '',
            lat: latest.coords.latitude,
            lng: latest.coords.longitude,
            accuracy: latest.coords.accuracy,
            speed: latest.coords.speed,
            heading: latest.coords.heading,
            timestamp: new Date(latest.timestamp).toISOString(),
          }
        );
      } else {
        // Delivery tracking → delivery location-update endpoint
        await apiClient.request(
          `/api/delivery/${restaurantId}/location-update`,
          'POST',
          {
            driverId: staffId,
            orderId,
            lat: latest.coords.latitude,
            lng: latest.coords.longitude,
            accuracy: latest.coords.accuracy,
            speed: latest.coords.speed,
            heading: latest.coords.heading,
            timestamp: new Date(latest.timestamp).toISOString(),
          }
        );
      }
    } catch (err) {
      console.warn('Failed to send location update:', err.message);
    }
  });
}

// ── Permission Helper ──────────────────────────────────────────

export async function requestBackgroundLocationPermission() {
  if (!Location) return false;

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  return bgStatus === 'granted';
}

// ── Internal start/stop ────────────────────────────────────────

async function startTracking(context, options) {
  if (!Location || !TaskManager) {
    console.warn('Location tracking not available — missing expo-location or expo-task-manager');
    return false;
  }

  // Check if already tracking
  const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (isStarted) {
    // Update context (e.g., switching from one delivery to another)
    trackingContext = context;
    return true;
  }

  const hasPermission = await requestBackgroundLocationPermission();
  if (!hasPermission) {
    console.warn('Background location permission not granted');
    return false;
  }

  trackingContext = context;

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: options.accuracy || Location.Accuracy.Balanced,
      distanceInterval: options.distanceInterval || 100,
      timeInterval: options.timeInterval || 300000,
      deferredUpdatesInterval: options.deferredUpdatesInterval || 300000,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: options.notificationTitle || 'DineOpen',
        notificationBody: options.notificationBody || 'Location is being tracked',
        notificationColor: options.notificationColor || '#ef4444',
      },
      pausesUpdatesAutomatically: false,
      activityType: options.activityType || Location.ActivityType.Other,
    });
    return true;
  } catch (err) {
    console.error('Failed to start location tracking:', err);
    trackingContext = null;
    return false;
  }
}

async function stopTracking() {
  if (!Location || !TaskManager) return false;

  trackingContext = null;

  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    return true;
  } catch (err) {
    console.error('Failed to stop location tracking:', err);
    return false;
  }
}

// ── Staff Shift Tracking ───────────────────────────────────────

/**
 * Start tracking staff location during their shift.
 * GPS ping every 5 minutes or 100m movement.
 * Shows notification: "Shift active - location tracked"
 */
export async function startStaffTracking(restaurantId, staffId, staffName) {
  return startTracking(
    { restaurantId, staffId, staffName, mode: 'staff' },
    {
      distanceInterval: 100,       // every 100m
      timeInterval: 300000,        // every 5 minutes
      deferredUpdatesInterval: 300000,
      notificationTitle: 'Shift Active',
      notificationBody: 'DineOpen is tracking your location during your shift',
      notificationColor: '#10b981',
      activityType: Location?.ActivityType?.Other,
    }
  );
}

/**
 * Stop staff shift tracking.
 */
export async function stopStaffTracking() {
  return stopTracking();
}

// ── Delivery Tracking ──────────────────────────────────────────

/**
 * Start tracking delivery driver location.
 * GPS ping every 30 seconds or 50m movement.
 * Shows notification: "Delivery in Progress"
 */
export async function startDeliveryTracking(restaurantId, driverId, orderId) {
  return startTracking(
    { restaurantId, staffId: driverId, orderId, mode: 'delivery' },
    {
      accuracy: Location?.Accuracy?.High,
      distanceInterval: 50,        // every 50m
      timeInterval: 30000,         // every 30 seconds
      deferredUpdatesInterval: 30000,
      notificationTitle: 'Delivery in Progress',
      notificationBody: 'DineOpen is tracking your location for this delivery',
      notificationColor: '#ef4444',
      activityType: Location?.ActivityType?.AutomotiveNavigation,
    }
  );
}

/**
 * Stop delivery tracking.
 */
export async function stopDeliveryTracking() {
  return stopTracking();
}

// ── Status Helpers ─────────────────────────────────────────────

/**
 * Check if any tracking is currently active.
 */
export async function isTrackingActive() {
  if (!Location) return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Get the current tracking context.
 * @returns {{ restaurantId, staffId, staffName?, orderId?, mode } | null}
 */
export function getTrackingContext() {
  return trackingContext;
}
