import React, { useState, useEffect } from 'react';
import WebViewScreen from '../../components/WebViewScreen';
import WaiterHomeNative from '../../screens/WaiterHomeNative';
import CaptainHomeNative from '../../screens/CaptainHomeNative';
import StaffHomeNative from '../../screens/StaffHomeNative';
import OwnerHomeNative from '../../screens/OwnerHomeNative';
import { useTabMode } from '../../contexts/TabModeContext';
import apiClient from '../../services/api';

export default function HomeTab() {
  const [role, setRole] = useState(null);
  const mode = useTabMode('home'); // 'native' (default) | 'webview' (More → Display)

  useEffect(() => {
    (async () => {
      try {
        const userData = await apiClient.getUser();
        setRole(userData?.role ? userData.role.toLowerCase() : '');
      } catch { setRole(''); }
    })();
  }, []);

  if (role === null) return null;
  // Captain and waiter keep their own floor homes
  if (role === 'captain') return <CaptainHomeNative />;
  if (role === 'waiter') return <WaiterHomeNative />;
  // Kitchen-display logins: the web sends them straight to the KOT screen — kept as before
  if (mode === 'webview' || role === 'kitchen_display') return <WebViewScreen route="/mobile/home" screenName="Home" />;
  // Same Home as the web, built natively (doesn't depend on the phone's WebView)
  if (role === 'owner' || role === 'admin') return <OwnerHomeNative />;
  return <StaffHomeNative />;
}
