import React from 'react';
import { useTabMode } from '../../contexts/TabModeContext';
import WebViewScreen from '../../components/WebViewScreen';
import TablesNative from '../../screens/TablesNative';

export default function TablesTab() {
  const mode = useTabMode('tables');
  if (mode === 'native') return <TablesNative />;
  return <WebViewScreen route="/mobile/tables" screenName="Tables" />;
}
