import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { verifyPin, markUnlocked } from '../../services/pinLock';

const PIN_LENGTH = 4;

export default function OfflinePinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [shakeAnim] = useState(new Animated.Value(0));

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleDigit = useCallback(async (digit) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');

    if (newPin.length === PIN_LENGTH) {
      const ok = await verifyPin(newPin);
      if (ok) {
        await markUnlocked();
        router.replace('/(tabs)/home');
      } else {
        Vibration.vibrate(200);
        shake();
        setError('Wrong PIN');
        setTimeout(() => setPin(''), 300);
      }
    }
  }, [pin, router, shake]);

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  }, []);

  const dots = [];
  for (let i = 0; i < PIN_LENGTH; i++) {
    dots.push(
      <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
    );
  }

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Lock Icon */}
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={40} color="#f59e0b" />
        </View>

        <Text style={styles.title}>Offline Mode Locked</Text>
        <Text style={styles.subtitle}>Enter your 4-digit PIN to continue</Text>

        {/* PIN Dots */}
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
          {dots}
        </Animated.View>

        {error ? <Text style={styles.errorText}>{error}</Text> : <View style={styles.errorPlaceholder} />}

        {/* Keypad */}
        <View style={styles.keypad}>
          {keys.map((row, ri) => (
            <View key={ri} style={styles.keyRow}>
              {row.map((key, ki) => {
                if (key === '') {
                  return <View key={ki} style={styles.keyBlank} />;
                }
                if (key === 'back') {
                  return (
                    <TouchableOpacity
                      key={ki}
                      style={styles.key}
                      onPress={handleBackspace}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="backspace-outline" size={26} color="#374151" />
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={ki}
                    style={styles.key}
                    onPress={() => handleDigit(key)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.keyText}>{key}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef7f0',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  lockIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 30,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  errorText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '600',
    height: 20,
  },
  errorPlaceholder: {
    height: 20,
  },
  keypad: {
    marginTop: 20,
    gap: 12,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 20,
  },
  key: {
    width: 72,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  keyBlank: {
    width: 72,
    height: 56,
  },
  keyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#374151',
  },
});
