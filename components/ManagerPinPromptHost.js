// Manager PIN box for Roles "Needs manager PIN". The API client asks via services/managerPinPrompt when
// the server needs a PIN, then retries the request with it. Mounted once in app/_layout.js.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { setManagerPinHandler } from '../services/managerPinPrompt';

export default function ManagerPinPromptHost() {
  const [ask, setAsk] = useState(null); // { message, wrong, resolve }
  const [pin, setPin] = useState('');
  const resolveRef = useRef(null);

  useEffect(() => {
    setManagerPinHandler(({ message, wrong } = {}) => new Promise((resolve) => {
      if (resolveRef.current) resolveRef.current(null); // a newer request replaces an open box
      resolveRef.current = resolve;
      setPin('');
      setAsk({ message: message || 'A manager PIN is needed for this.', wrong: !!wrong });
    }));
    return () => setManagerPinHandler(null);
  }, []);

  const done = (value) => {
    const r = resolveRef.current;
    resolveRef.current = null;
    setAsk(null);
    setPin('');
    if (r) r(value);
  };

  return (
    <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => done(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <View style={s.card} accessibilityViewIsModal>
          <Text style={s.title}>Manager PIN</Text>
          <Text style={s.msg}>{ask?.message}</Text>
          {ask?.wrong ? <Text style={s.wrong} accessibilityLiveRegion="polite">Wrong PIN — try again.</Text> : null}
          <TextInput
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\s/g, '').slice(0, 12))}
            secureTextEntry
            keyboardType="number-pad"
            autoFocus
            placeholder="PIN"
            accessibilityLabel="Manager PIN"
            style={s.input}
            onSubmitEditing={() => { if (pin.trim()) done(pin.trim()); }}
          />
          <View style={s.row}>
            <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => done(null)} accessibilityRole="button">
              <Text style={s.btnGhostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary, !pin.trim() && { opacity: 0.5 }]} disabled={!pin.trim()} onPress={() => done(pin.trim())} accessibilityRole="button">
              <Text style={s.btnPrimaryText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 14, padding: 20 },
  title: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 6 },
  msg: { fontSize: 14, color: '#4b5563', marginBottom: 10 },
  wrong: { fontSize: 13, color: '#b91c1c', fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 20, letterSpacing: 4 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, marginLeft: 8 },
  btnGhost: { borderWidth: 1, borderColor: '#e5e7eb' },
  btnGhostText: { fontWeight: '600', color: '#374151' },
  btnPrimary: { backgroundColor: '#4f46e5' },
  btnPrimaryText: { fontWeight: '700', color: '#fff' },
});
