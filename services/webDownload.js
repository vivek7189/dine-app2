// Files generated inside our web pages (Excel / CSV / PDF exports) use browser downloads
// (<a download href="blob:…">), which do nothing inside a React Native WebView. The injected
// downloadBridgeJS() (utils/trustedWebUrl.js) turns them into a DINE_DOWNLOAD message; this saves the
// file to the app cache and opens the system share sheet (save to Files, WhatsApp, email…).
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

const safeName = (n) => String(n || 'download').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'download';

export async function handleWebDownloadMessage(msg) {
  if (!msg || msg.type !== 'DINE_DOWNLOAD' || !msg.base64) return false;
  try {
    const uri = `${FileSystem.cacheDirectory}${Date.now()}-${safeName(msg.filename)}`;
    await FileSystem.writeAsStringAsync(uri, msg.base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: msg.mime || undefined, dialogTitle: safeName(msg.filename) });
    } else {
      Alert.alert('Saved', 'The file was saved on this device.');
    }
  } catch (e) {
    console.warn('web download failed:', e?.message);
    Alert.alert('Download failed', 'Could not save the file. Please try again.');
  }
  return true;
}
