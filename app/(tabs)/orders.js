import React, { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import WebViewScreen from '../../components/WebViewScreen';
import ActiveOrdersNative from '../../screens/ActiveOrdersNative';
import OrderHistoryScreen from './order-history';
import { useTabMode } from '../../contexts/TabModeContext';
import apiClient from '../../services/api';

export default function OrdersTab() {
  const [role, setRole] = useState(null);
  const mode = useTabMode('orders'); // 'native' (default) | 'webview'
  // From a WhatsApp-order banner / notification tap: open this order (t = new value per tap).
  const { openOrderId, t: openTick } = useLocalSearchParams();

  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        if (userData?.role) setRole(userData.role.toLowerCase());
      } catch {}
    })();
  }, []);

  // Waiter keeps the native active-order taking view.
  if (role === 'waiter') return <ActiveOrdersNative />;
  // Everyone else: native Order History by default, or the web view if the
  // user switched this tab to Web View in More → Display.
  if (mode === 'native') return <OrderHistoryScreen openOrderId={openOrderId} openTick={openTick} />;
  return <WebViewScreen route="/mobile/orderhistory" screenName="Orders" />;
}
