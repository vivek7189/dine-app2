/**
 * Delivery Notifications Service
 *
 * Handles FCM token registration and incoming delivery push notifications
 * for delivery partner staff. Uses @react-native-firebase/messaging.
 */

import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import apiClient from './api';

const DELIVERY_TOKEN_KEY = 'delivery_fcm_token';

/**
 * Request notification permission and register FCM token for delivery partner.
 * Call this on login if user.isDeliveryPartner is true.
 */
export async function registerDeliveryFcmToken(restaurantId) {
  try {
    // Request permission (required on iOS, auto-granted on Android 12-)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn('FCM permission not granted');
      return null;
    }

    // Get FCM token
    const token = await messaging().getToken();
    if (!token) {
      console.warn('Failed to get FCM token');
      return null;
    }

    // Check if token changed
    const storedToken = await AsyncStorage.getItem(DELIVERY_TOKEN_KEY);
    if (storedToken === token) {
      return token; // Already registered
    }

    // Register with backend
    await apiClient.registerDeliveryToken(restaurantId, token, Platform.OS);

    // Store locally
    await AsyncStorage.setItem(DELIVERY_TOKEN_KEY, token);
    console.log('✅ Delivery FCM token registered');
    return token;
  } catch (err) {
    console.error('Delivery FCM registration error:', err.message);
    return null;
  }
}

/**
 * Listen for token refresh and re-register.
 */
export function setupTokenRefreshListener(restaurantId) {
  return messaging().onTokenRefresh(async (newToken) => {
    try {
      await apiClient.registerDeliveryToken(restaurantId, newToken, Platform.OS);
      await AsyncStorage.setItem(DELIVERY_TOKEN_KEY, newToken);
      console.log('✅ Delivery FCM token refreshed');
    } catch (err) {
      console.error('Token refresh registration error:', err.message);
    }
  });
}

/**
 * Set up foreground message handler for delivery notifications.
 * Returns the unsubscribe function.
 */
export function setupDeliveryMessageHandler(onDeliveryAssignment) {
  return messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage.data;
    if (!data) return;

    if (data.type === 'delivery-assignment') {
      console.log('📦 New delivery assignment received');
      if (onDeliveryAssignment) {
        onDeliveryAssignment({
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          restaurantId: data.restaurantId,
          deliveryAddress: data.deliveryAddress,
          totalAmount: data.totalAmount,
          title: data.title,
          body: data.body,
        });
      }
    }
  });
}

/**
 * Set up background message handler. Must be called at app entry.
 */
export function setupBackgroundHandler() {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage.data;
    if (!data) return;

    if (data.type === 'delivery-assignment') {
      // Background handling — the notification tray will show the push
      // When user taps, the app opens and foreground handler picks up
      console.log('📦 Background delivery assignment:', data.orderId);
    }
  });
}

/**
 * Check if app was opened from a delivery notification.
 */
export async function getInitialDeliveryNotification() {
  const remoteMessage = await messaging().getInitialNotification();
  if (remoteMessage?.data?.type === 'delivery-assignment') {
    return remoteMessage.data;
  }
  return null;
}

/**
 * Clear stored token on logout.
 */
export async function clearDeliveryToken() {
  await AsyncStorage.removeItem(DELIVERY_TOKEN_KEY);
}
