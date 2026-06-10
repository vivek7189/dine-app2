import React from 'react';
import { useTabMode } from '../../contexts/TabModeContext';
import WebViewScreen from '../../components/WebViewScreen';
import MenuNative from '../../screens/MenuNative';

export default function MenuTab() {
  const mode = useTabMode('menu');
  if (mode === 'native') return <MenuNative />;
  return <WebViewScreen route="/mobile/menu" screenName="Menu" />;
}
