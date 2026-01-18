import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';

export default function LoginScreen() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if already authenticated
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const isAuth = await apiClient.isAuthenticated();
    if (isAuth) {
      router.replace('/(tabs)/tables');
    }
  };

  const handleLogin = async () => {
    if (!loginId || !password) {
      setError('Please enter both User ID and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await apiClient.staffLogin(loginId, password);

      if (response.token) {
        // Navigate to main app
        router.replace('/(tabs)/tables');
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>DO</Text>
          </View>
          <Text style={styles.appName}>DineOpen</Text>
          <Text style={styles.subtitle}>Staff App</Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Staff Login</Text>
          <Text style={styles.description}>Enter your credentials to continue</Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>User ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your User ID"
              placeholderTextColor={Colors.textLight}
              value={loginId}
              onChangeText={setLoginId}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              onSubmitEditing={handleLogin}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.large,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  appName: {
    fontSize: Typography.h1.fontSize,
    fontWeight: Typography.h1.fontWeight,
    color: Colors.textDark,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.body.fontSize,
    color: Colors.textMedium,
    fontWeight: '500',
  },
  form: {
    width: '100%',
  },
  title: {
    fontSize: Typography.h2.fontSize,
    fontWeight: Typography.h2.fontWeight,
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  description: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textMedium,
    marginBottom: Spacing.lg,
  },
  errorContainer: {
    backgroundColor: '#fee2e2',
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.error,
    fontSize: Typography.caption.fontSize,
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.backgroundWhite,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.textDark,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    minHeight: 50,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: Typography.bodyBold.fontSize,
    fontWeight: Typography.bodyBold.fontWeight,
  },
});
