import React from 'react';
import { useTabMode } from '../../contexts/TabModeContext';
import WebViewScreen from '../../components/WebViewScreen';

export default function BillingTab() {
  const mode = useTabMode('billing');
  // No native billing screen yet — always renders WebView for now
  // When BillingNative is built, add: if (mode === 'native') return <BillingNative />;
  return <WebViewScreen route="/mobile/dashboard" screenName="Billing" />;
}
