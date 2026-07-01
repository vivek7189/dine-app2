import React, { useState, useEffect } from 'react';
import WebViewScreen from '../../components/WebViewScreen';
import ActiveOrdersNative from '../../screens/ActiveOrdersNative';
import apiClient from '../../services/api';

export default function OrdersTab() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        if (userData?.role) setRole(userData.role.toLowerCase());
      } catch {}
    })();
  }, []);

  // Waiter gets native active orders, other roles keep WebView
  if (role === 'waiter') return <ActiveOrdersNative />;
  return <WebViewScreen route="/mobile/orderhistory" screenName="Orders" />;
}
