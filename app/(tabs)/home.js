import React, { useState, useEffect } from 'react';
import WebViewScreen from '../../components/WebViewScreen';
import WaiterHomeNative from '../../screens/WaiterHomeNative';
import CaptainHomeNative from '../../screens/CaptainHomeNative';
import apiClient from '../../services/api';

export default function HomeTab() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        if (userData?.role) setRole(userData.role.toLowerCase());
      } catch {}
    })();
  }, []);

  // Captain gets dedicated captain home
  if (role === 'captain') return <CaptainHomeNative />;
  // Waiter gets native home, other roles keep WebView dashboard
  if (role === 'waiter') return <WaiterHomeNative />;
  return <WebViewScreen route="/mobile/home" screenName="Home" />;
}
