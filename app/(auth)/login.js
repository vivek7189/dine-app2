import React, { useState, useEffect, useRef } from 'react';
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
  ScrollView,
  Animated,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import apiClient from '../../services/api';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Theme';
import { useResponsive } from '../../hooks/useResponsive';

// Lazy-load native modules that crash in Expo Go
let GoogleSignin = null;
let firebaseAuth = null;
let GoogleAuthProvider = null;
let signInWithCredential = null;
let googleSignInAvailable = false;

try {
  const gsi = require('@react-native-google-signin/google-signin');
  GoogleSignin = gsi.GoogleSignin;
  const fb = require('../../config/firebase');
  firebaseAuth = fb.auth;
  GoogleAuthProvider = fb.GoogleAuthProvider;
  signInWithCredential = fb.signInWithCredential;

  GoogleSignin.configure({
    webClientId: '1087929121342-22v55s7oqhgnt93q8118t4ltdlo53lcq.apps.googleusercontent.com',
  });
  googleSignInAvailable = true;
} catch (e) {
  console.log('Google Sign-In not available (Expo Go). Use a development build for Google login.');
}

// Lazy-load @react-native-firebase/auth for phone OTP
let rnFirebaseAuth = null;
let phoneAuthAvailable = false;

try {
  rnFirebaseAuth = require('@react-native-firebase/auth').default;
  phoneAuthAvailable = true;
} catch (e) {
  console.log('Firebase Phone Auth not available (Expo Go). Use a development build for phone login.');
}

// Country codes — same list as web
const countries = [
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}', dialCode: '+91' },
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}', dialCode: '+44' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}', dialCode: '+1' },
  { code: 'AU', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}', dialCode: '+61' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}', dialCode: '+49' },
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}', dialCode: '+33' },
  { code: 'IT', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}', dialCode: '+39' },
  { code: 'ES', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}', dialCode: '+34' },
  { code: 'NL', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}', dialCode: '+31' },
  { code: 'BE', name: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}', dialCode: '+32' },
  { code: 'CH', name: 'Switzerland', flag: '\u{1F1E8}\u{1F1ED}', dialCode: '+41' },
  { code: 'AT', name: 'Austria', flag: '\u{1F1E6}\u{1F1F9}', dialCode: '+43' },
  { code: 'SE', name: 'Sweden', flag: '\u{1F1F8}\u{1F1EA}', dialCode: '+46' },
  { code: 'NO', name: 'Norway', flag: '\u{1F1F3}\u{1F1F4}', dialCode: '+47' },
  { code: 'DK', name: 'Denmark', flag: '\u{1F1E9}\u{1F1F0}', dialCode: '+45' },
  { code: 'FI', name: 'Finland', flag: '\u{1F1EB}\u{1F1EE}', dialCode: '+358' },
  { code: 'PL', name: 'Poland', flag: '\u{1F1F5}\u{1F1F1}', dialCode: '+48' },
  { code: 'CZ', name: 'Czech Republic', flag: '\u{1F1E8}\u{1F1FF}', dialCode: '+420' },
  { code: 'IE', name: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}', dialCode: '+353' },
  { code: 'PT', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}', dialCode: '+351' },
  { code: 'GR', name: 'Greece', flag: '\u{1F1EC}\u{1F1F7}', dialCode: '+30' },
  { code: 'RO', name: 'Romania', flag: '\u{1F1F7}\u{1F1F4}', dialCode: '+40' },
  { code: 'HU', name: 'Hungary', flag: '\u{1F1ED}\u{1F1FA}', dialCode: '+36' },
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}', dialCode: '+55' },
  { code: 'AR', name: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}', dialCode: '+54' },
  { code: 'MX', name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}', dialCode: '+52' },
  { code: 'CL', name: 'Chile', flag: '\u{1F1E8}\u{1F1F1}', dialCode: '+56' },
  { code: 'CO', name: 'Colombia', flag: '\u{1F1E8}\u{1F1F4}', dialCode: '+57' },
  { code: 'PE', name: 'Peru', flag: '\u{1F1F5}\u{1F1EA}', dialCode: '+51' },
  { code: 'CN', name: 'China', flag: '\u{1F1E8}\u{1F1F3}', dialCode: '+86' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}', dialCode: '+81' },
  { code: 'KR', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}', dialCode: '+82' },
  { code: 'SG', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}', dialCode: '+65' },
  { code: 'MY', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}', dialCode: '+60' },
  { code: 'TH', name: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}', dialCode: '+66' },
  { code: 'VN', name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}', dialCode: '+84' },
  { code: 'PH', name: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}', dialCode: '+63' },
  { code: 'ID', name: 'Indonesia', flag: '\u{1F1EE}\u{1F1E9}', dialCode: '+62' },
  { code: 'BD', name: 'Bangladesh', flag: '\u{1F1E7}\u{1F1E9}', dialCode: '+880' },
  { code: 'PK', name: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}', dialCode: '+92' },
  { code: 'LK', name: 'Sri Lanka', flag: '\u{1F1F1}\u{1F1F0}', dialCode: '+94' },
  { code: 'NP', name: 'Nepal', flag: '\u{1F1F3}\u{1F1F5}', dialCode: '+977' },
  { code: 'SA', name: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}', dialCode: '+966' },
  { code: 'AE', name: 'United Arab Emirates', flag: '\u{1F1E6}\u{1F1EA}', dialCode: '+971' },
  { code: 'QA', name: 'Qatar', flag: '\u{1F1F6}\u{1F1E6}', dialCode: '+974' },
  { code: 'KW', name: 'Kuwait', flag: '\u{1F1F0}\u{1F1FC}', dialCode: '+965' },
  { code: 'BH', name: 'Bahrain', flag: '\u{1F1E7}\u{1F1ED}', dialCode: '+973' },
  { code: 'OM', name: 'Oman', flag: '\u{1F1F4}\u{1F1F2}', dialCode: '+968' },
  { code: 'JO', name: 'Jordan', flag: '\u{1F1EF}\u{1F1F4}', dialCode: '+962' },
  { code: 'IL', name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}', dialCode: '+972' },
  { code: 'TR', name: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}', dialCode: '+90' },
  { code: 'RU', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}', dialCode: '+7' },
  { code: 'ZA', name: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}', dialCode: '+27' },
  { code: 'EG', name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}', dialCode: '+20' },
  { code: 'NG', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}', dialCode: '+234' },
  { code: 'KE', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}', dialCode: '+254' },
  { code: 'GH', name: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}', dialCode: '+233' },
  { code: 'MA', name: 'Morocco', flag: '\u{1F1F2}\u{1F1E6}', dialCode: '+212' },
  { code: 'ET', name: 'Ethiopia', flag: '\u{1F1EA}\u{1F1F9}', dialCode: '+251' },
  { code: 'TZ', name: 'Tanzania', flag: '\u{1F1F9}\u{1F1FF}', dialCode: '+255' },
  { code: 'UG', name: 'Uganda', flag: '\u{1F1FA}\u{1F1EC}', dialCode: '+256' },
  { code: 'HK', name: 'Hong Kong', flag: '\u{1F1ED}\u{1F1F0}', dialCode: '+852' },
  { code: 'TW', name: 'Taiwan', flag: '\u{1F1F9}\u{1F1FC}', dialCode: '+886' },
  { code: 'NZ', name: 'New Zealand', flag: '\u{1F1F3}\u{1F1FF}', dialCode: '+64' },
  { code: 'IR', name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}', dialCode: '+98' },
  { code: 'IQ', name: 'Iraq', flag: '\u{1F1EE}\u{1F1F6}', dialCode: '+964' },
  { code: 'MM', name: 'Myanmar', flag: '\u{1F1F2}\u{1F1F2}', dialCode: '+95' },
  { code: 'KH', name: 'Cambodia', flag: '\u{1F1F0}\u{1F1ED}', dialCode: '+855' },
  { code: 'GE', name: 'Georgia', flag: '\u{1F1EC}\u{1F1EA}', dialCode: '+995' },
  { code: 'MV', name: 'Maldives', flag: '\u{1F1F2}\u{1F1FB}', dialCode: '+960' },
  { code: 'BT', name: 'Bhutan', flag: '\u{1F1E7}\u{1F1F9}', dialCode: '+975' },
  { code: 'AF', name: 'Afghanistan', flag: '\u{1F1E6}\u{1F1EB}', dialCode: '+93' },
];

export default function LoginScreen() {
  const { isTablet } = useResponsive();
  const router = useRouter();
  const [loginMode, setLoginMode] = useState('owner'); // 'owner' | 'staff'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Staff fields
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');

  // Owner auth method: 'main' (shows google + method picks), 'email', 'phone', 'register', 'emailOtp', 'phoneOtp'
  const [ownerStep, setOwnerStep] = useState('main');

  // Owner email fields
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);

  // Phone fields
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(countries[0]); // India default
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [isTestAccount, setIsTestAccount] = useState(false);

  // Whitelisted test numbers that bypass Firebase OTP
  const isDemoPhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned === '9000000000' || cleaned === '919000000000';
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // Countdown timer for phone OTP resend
  useEffect(() => {
    if (phoneCountdown > 0) {
      const timer = setTimeout(() => setPhoneCountdown(phoneCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [phoneCountdown]);

  const checkAuth = async () => {
    const isAuth = await apiClient.isAuthenticated();
    if (isAuth) {
      router.replace('/(tabs)/home');
    }
  };

  const switchMode = (mode) => {
    setError('');
    setLoginMode(mode);
    setOwnerStep('main');
    Animated.spring(slideAnim, {
      toValue: mode === 'owner' ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
    }).start();
  };

  // ==================== OWNER: Google Sign-In ====================
  const handleGoogleSignIn = async () => {
    if (!googleSignInAvailable) {
      Alert.alert(
        'Not Available',
        'Google Sign-In requires a development build. It is not supported in Expo Go.\n\nPlease use Email or Phone login instead, or build with EAS.',
      );
      return;
    }

    setLoading(true);
    setError('');
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      const idToken = response?.data?.idToken || response?.idToken;
      if (!idToken) {
        throw new Error('Could not get Google credentials');
      }

      // Create Firebase credential and sign in
      const googleCredential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(firebaseAuth, googleCredential);
      const user = result.user;

      // Exchange with DineOpen backend
      const backendResponse = await apiClient.googleLogin(
        user.uid,
        user.email,
        user.displayName || user.email?.split('@')[0],
        user.photoURL
      );

      if (backendResponse.token) {
        router.replace('/(tabs)/home');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      if (err.code !== 'SIGN_IN_CANCELLED' && err.code !== 'sign_in_cancelled') {
        console.error('Google sign-in error:', err);
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ==================== OWNER: Email Login ====================
  const handleEmailLogin = async () => {
    if (!email || !emailPassword) {
      setError('Please enter email and password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await apiClient.emailLogin(email, emailPassword);

      if (response.token) {
        router.replace('/(tabs)/home');
      } else if (response.verificationRequired) {
        setError('Email not verified. Please check your inbox.');
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ==================== OWNER: Email Registration ====================
  const handleSendOtp = async () => {
    if (!email || !registerName || !emailPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (emailPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (emailPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setOtpSending(true);
    setError('');
    try {
      await apiClient.emailSendOtp(email, 'registration');
      setOwnerStep('emailOtp');
    } catch (err) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!otp || otp.length < 4) {
      setError('Please enter the OTP sent to your email');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await apiClient.emailRegister(
        email,
        emailPassword,
        confirmPassword,
        registerName,
        otp
      );

      if (response.token) {
        router.replace('/(tabs)/home');
      } else {
        setError(response.message || 'Registration failed');
      }
    } catch (err) {
      setError(err.message || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==================== OWNER: Phone OTP ====================
  const handleSendPhoneOtp = async () => {
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (cleaned.length < 7 || cleaned.length > 15) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const fullNumber = `${selectedCountry.dialCode}${cleaned}`;

      // Bypass Firebase for test/whitelisted numbers — use backend OTP
      if (isDemoPhone(cleaned)) {
        console.log('🎭 Test account detected, using backend OTP');
        const response = await apiClient.phoneSendOtp(fullNumber);
        if (response.error) {
          setError(response.error);
        } else {
          setIsTestAccount(true);
          setPhoneConfirmation(null); // No Firebase confirmation needed
          setOwnerStep('phoneOtp');
          setPhoneCountdown(60);
        }
        return;
      }

      // Regular Firebase phone auth
      if (!phoneAuthAvailable) {
        Alert.alert(
          'Not Available',
          'Phone login requires a development build with Firebase. It is not supported in Expo Go.\n\nPlease use Email login instead, or build with EAS.',
        );
        return;
      }

      setIsTestAccount(false);
      const confirmation = await rnFirebaseAuth().signInWithPhoneNumber(fullNumber);
      setPhoneConfirmation(confirmation);
      setOwnerStep('phoneOtp');
      setPhoneCountdown(60);
    } catch (err) {
      console.error('Phone auth error:', err);
      let msg = 'Failed to send verification code. Please try again.';
      if (err.code === 'auth/invalid-phone-number') {
        msg = 'Please enter a valid phone number.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many attempts. Please try again later.';
      } else if (err.code === 'auth/quota-exceeded') {
        msg = 'SMS quota exceeded. Please try again later.';
      } else if (err.code === 'auth/app-not-authorized') {
        msg = 'Phone auth is not enabled. Please contact support.';
      } else if (err.code === 'auth/missing-client-identifier') {
        msg = 'Phone verification setup issue. Please try again or use Email login.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async () => {
    setLoading(true);
    setError('');
    try {
      // Test account — verify via backend (accepts 4-digit code "1234")
      if (isTestAccount) {
        if (phoneOtp.length < 4) {
          setError('Please enter the OTP code');
          return;
        }
        const cleaned = phoneNumber.replace(/\D/g, '');
        const fullNumber = `${selectedCountry.dialCode}${cleaned}`;
        const response = await apiClient.phoneVerifyOtp(fullNumber, phoneOtp);

        if (response.token) {
          router.replace('/(tabs)/home');
        } else {
          setError(response.error || 'Verification failed. Please try again.');
        }
        return;
      }

      // Regular Firebase verification (6-digit code)
      if (phoneOtp.length !== 6) {
        setError('Please enter the 6-digit code');
        return;
      }

      if (!phoneConfirmation) {
        setError('Please request a new verification code.');
        return;
      }

      const credential = await phoneConfirmation.confirm(phoneOtp);
      const firebaseUser = credential.user;

      // Exchange with DineOpen backend
      const backendResponse = await apiClient.firebaseVerify(
        firebaseUser.uid,
        firebaseUser.phoneNumber,
        firebaseUser.email,
        firebaseUser.displayName
      );

      if (backendResponse.token) {
        router.replace('/(tabs)/home');
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Phone OTP verify error:', err);
      let msg = 'Verification failed. Please try again.';
      if (err.code === 'auth/invalid-verification-code') {
        msg = 'Invalid code. Please check and try again.';
      } else if (err.code === 'auth/code-expired') {
        msg = 'Code has expired. Please request a new one.';
      } else if (err.code === 'auth/session-expired') {
        msg = 'Session expired. Please request a new code.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendPhoneOtp = async () => {
    if (phoneCountdown > 0) return;
    setPhoneOtp('');
    setPhoneConfirmation(null);
    setOwnerStep('phone');
    handleSendPhoneOtp();
  };

  // ==================== STAFF: Login ====================
  const handleStaffLogin = async () => {
    if (!loginId || !password) {
      setError('Please enter User ID and password');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await apiClient.staffLogin(loginId, password);
      if (response.token) {
        router.replace('/(tabs)/home');
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==================== COUNTRY PICKER ====================
  const filteredCountries = countrySearch
    ? countries.filter(
        (c) =>
          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
          c.dialCode.includes(countrySearch) ||
          c.code.toLowerCase().includes(countrySearch.toLowerCase())
      )
    : countries;

  const renderCountryItem = ({ item }) => (
    <TouchableOpacity
      style={styles.countryItem}
      onPress={() => {
        setSelectedCountry(item);
        setShowCountryPicker(false);
        setCountrySearch('');
      }}
    >
      <Text style={styles.countryFlag}>{item.flag}</Text>
      <Text style={styles.countryName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.countryDial}>{item.dialCode}</Text>
    </TouchableOpacity>
  );

  // ==================== RENDER ====================

  const indicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  const getOwnerTitle = () => {
    switch (ownerStep) {
      case 'email': return 'Email Login';
      case 'phone': return 'Phone Login';
      case 'register': return 'Create Account';
      case 'emailOtp': return 'Verify Email';
      case 'phoneOtp': return 'Verify Phone';
      default: return 'Owner Login';
    }
  };

  const getOwnerDescription = () => {
    switch (ownerStep) {
      case 'email': return 'Sign in with your email and password';
      case 'phone': return 'We\'ll send a verification code to your phone';
      case 'register': return 'Set up your restaurant account';
      case 'emailOtp': return 'Enter the code we sent you';
      case 'phoneOtp': return 'Enter the 6-digit code sent to your phone';
      default: return 'Sign in to manage your restaurant';
    }
  };

  const renderOwnerMain = () => (
    <View style={styles.formContent}>
      {/* Google Sign-In */}
      <TouchableOpacity
        style={[styles.socialButton, styles.googleButton, !googleSignInAvailable && styles.buttonDisabledLight]}
        onPress={handleGoogleSignIn}
        disabled={loading}
      >
        <Ionicons name="logo-google" size={20} color="#fff" />
        <Text style={styles.socialButtonText}>Continue with Google</Text>
      </TouchableOpacity>
      {!googleSignInAvailable && (
        <Text style={styles.nativeHint}>Requires development build</Text>
      )}

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Phone login button */}
      <TouchableOpacity
        style={[styles.methodButton]}
        onPress={() => { setError(''); setOwnerStep('phone'); }}
      >
        <Ionicons name="call-outline" size={20} color={Colors.primary} />
        <Text style={styles.methodButtonText}>Login with Phone</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
      </TouchableOpacity>

      {/* Email login button */}
      <TouchableOpacity
        style={[styles.methodButton]}
        onPress={() => { setError(''); setOwnerStep('email'); }}
      >
        <Ionicons name="mail-outline" size={20} color={Colors.primary} />
        <Text style={styles.methodButtonText}>Login with Email</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => { setError(''); setOwnerStep('register'); }}
      >
        <Text style={styles.linkText}>
          New here? <Text style={styles.linkTextBold}>Create an account</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderPhoneInput = () => (
    <View style={styles.formContent}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <TouchableOpacity
            style={styles.countryCodeButton}
            onPress={() => setShowCountryPicker(true)}
          >
            <Text style={styles.countryCodeFlag}>{selectedCountry.flag}</Text>
            <Text style={styles.countryCodeText}>{selectedCountry.dialCode}</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.textMedium} />
          </TouchableOpacity>
          <TextInput
            style={styles.phoneInput}
            placeholder="Enter phone number"
            placeholderTextColor={Colors.textLight}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            editable={!loading}
            autoFocus
          />
        </View>
      </View>

      {!phoneAuthAvailable && (
        <View style={styles.hintBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
          <Text style={styles.hintBoxText}>
            Phone login requires a development build (not Expo Go)
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleSendPhoneOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Send Verification Code</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => { setError(''); setOwnerStep('main'); }}
      >
        <Text style={styles.linkText}>
          <Ionicons name="arrow-back" size={13} color={Colors.textMedium} />{' '}
          <Text style={styles.linkTextBold}>Back to login options</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderPhoneOtp = () => (
    <View style={styles.formContent}>
      <View style={styles.otpInfo}>
        <Ionicons name="call-outline" size={24} color={Colors.primary} />
        <Text style={styles.otpInfoText}>
          Code sent to{'\n'}
          <Text style={{ fontWeight: '700' }}>
            {selectedCountry.dialCode} {phoneNumber}
          </Text>
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>{isTestAccount ? 'Enter OTP Code' : 'Enter 6-digit Code'}</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder={isTestAccount ? '1234' : '000000'}
          placeholderTextColor={Colors.textLight}
          value={phoneOtp}
          onChangeText={setPhoneOtp}
          keyboardType="number-pad"
          maxLength={isTestAccount ? 4 : 6}
          editable={!loading}
          autoFocus
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
        />
        {isTestAccount && (
          <Text style={{ fontSize: 13, color: Colors.primary, marginTop: 6, fontWeight: '600' }}>
            For testing use: 1234
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyPhoneOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Verify & Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.linkButton, phoneCountdown > 0 && { opacity: 0.5 }]}
        onPress={handleResendPhoneOtp}
        disabled={phoneCountdown > 0}
      >
        <Text style={styles.linkText}>
          {phoneCountdown > 0 ? (
            `Resend code in ${phoneCountdown}s`
          ) : (
            <Text style={styles.linkTextBold}>Resend code</Text>
          )}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          setError('');
          setPhoneOtp('');
          setPhoneConfirmation(null);
          setOwnerStep('phone');
        }}
      >
        <Text style={styles.linkText}>
          <Text style={styles.linkTextBold}>Change phone number</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmailLogin = () => (
    <View style={styles.formContent}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor={Colors.textLight}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
          autoFocus
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your password"
          placeholderTextColor={Colors.textLight}
          value={emailPassword}
          onChangeText={setEmailPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
          onSubmitEditing={handleEmailLogin}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleEmailLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => { setError(''); setOwnerStep('main'); }}
      >
        <Text style={styles.linkText}>
          <Ionicons name="arrow-back" size={13} color={Colors.textMedium} />{' '}
          <Text style={styles.linkTextBold}>Back to login options</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderRegister = () => (
    <View style={styles.formContent}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Your name"
          placeholderTextColor={Colors.textLight}
          value={registerName}
          onChangeText={setRegisterName}
          editable={!otpSending}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your email"
          placeholderTextColor={Colors.textLight}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!otpSending}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Min 6 characters"
          placeholderTextColor={Colors.textLight}
          value={emailPassword}
          onChangeText={setEmailPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!otpSending}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Re-enter password"
          placeholderTextColor={Colors.textLight}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!otpSending}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, otpSending && styles.buttonDisabled]}
        onPress={handleSendOtp}
        disabled={otpSending}
      >
        {otpSending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Send OTP & Register</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => { setError(''); setOwnerStep('main'); }}
      >
        <Text style={styles.linkText}>
          Already have an account? <Text style={styles.linkTextBold}>Login</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmailOtp = () => (
    <View style={styles.formContent}>
      <View style={styles.otpInfo}>
        <Ionicons name="mail-outline" size={24} color={Colors.primary} />
        <Text style={styles.otpInfoText}>
          We sent a verification code to{'\n'}
          <Text style={{ fontWeight: '700' }}>{email}</Text>
        </Text>
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Enter OTP</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          placeholder="Enter 6-digit code"
          placeholderTextColor={Colors.textLight}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          editable={!loading}
          autoFocus
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleVerifyEmailOtp}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Verify & Create Account</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => { setError(''); setOtp(''); setOwnerStep('register'); }}
      >
        <Text style={styles.linkText}>
          <Text style={styles.linkTextBold}>Change email or resend</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderOwnerLogin = () => {
    switch (ownerStep) {
      case 'email': return renderEmailLogin();
      case 'phone': return renderPhoneInput();
      case 'register': return renderRegister();
      case 'emailOtp': return renderEmailOtp();
      case 'phoneOtp': return renderPhoneOtp();
      default: return renderOwnerMain();
    }
  };

  const renderStaffLogin = () => (
    <View style={styles.formContent}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>User ID or Username</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter User ID or username"
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
          onSubmitEditing={handleStaffLogin}
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, loading && styles.buttonDisabled]}
        onPress={handleStaffLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      <View style={styles.staffHint}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
        <Text style={styles.staffHintText}>
          Use the credentials provided by your restaurant owner
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: 450, alignSelf: 'center', width: '100%' }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>DO</Text>
          </View>
          <Text style={styles.appName}>DineOpen</Text>
        </View>

        {/* Mode Toggle */}
        <View style={styles.toggleContainer}>
          <Animated.View
            style={[
              styles.toggleIndicator,
              { left: indicatorLeft },
            ]}
          />
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => switchMode('owner')}
          >
            <Ionicons
              name="business-outline"
              size={16}
              color={loginMode === 'owner' ? '#fff' : Colors.textMedium}
            />
            <Text style={[
              styles.toggleText,
              loginMode === 'owner' && styles.toggleTextActive,
            ]}>
              Owner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => switchMode('staff')}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={loginMode === 'staff' ? '#fff' : Colors.textMedium}
            />
            <Text style={[
              styles.toggleText,
              loginMode === 'staff' && styles.toggleTextActive,
            ]}>
              Staff
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>
            {loginMode === 'owner' ? getOwnerTitle() : 'Staff Login'}
          </Text>
          <Text style={styles.description}>
            {loginMode === 'owner' ? getOwnerDescription() : 'Enter your credentials to continue'}
          </Text>

          {error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {loginMode === 'owner' ? renderOwnerLogin() : renderStaffLogin()}
        </View>
      </ScrollView>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }}>
                <Ionicons name="close" size={24} color={Colors.textDark} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={18} color={Colors.textLight} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search country or code..."
                placeholderTextColor={Colors.textLight}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredCountries}
              renderItem={renderCountryItem}
              keyExtractor={(item) => `${item.code}-${item.dialCode}`}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundCream,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 40,
  },
  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.textDark,
    letterSpacing: -0.5,
  },
  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    position: 'relative',
  },
  toggleIndicator: {
    position: 'absolute',
    top: 4,
    width: '50%',
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 10,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
    zIndex: 1,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textMedium,
  },
  toggleTextActive: {
    color: '#fff',
  },
  // Form
  form: {
    width: '100%',
  },
  formContent: {
    marginTop: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: Colors.textMedium,
    marginBottom: 20,
  },
  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: BorderRadius.medium,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
  },
  // Inputs
  inputContainer: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textDark,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
  },
  // Phone input
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 13,
  },
  countryCodeFlag: {
    fontSize: 18,
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.textDark,
  },
  // Buttons
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonDisabledLight: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  googleButton: {
    backgroundColor: '#4285F4',
    shadowColor: '#4285F4',
  },
  socialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nativeHint: {
    fontSize: 11,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 6,
  },
  // Method buttons
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  methodButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textDark,
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '500',
  },
  // Links
  linkButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    color: Colors.textMedium,
  },
  linkTextBold: {
    color: Colors.primary,
    fontWeight: '600',
  },
  // OTP info
  otpInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary + '10',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
  },
  otpInfoText: {
    fontSize: 13,
    color: Colors.textMedium,
    flex: 1,
    lineHeight: 20,
  },
  // Hint box
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  hintBoxText: {
    fontSize: 12,
    color: '#92400e',
    flex: 1,
  },
  // Staff hint
  staffHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 4,
  },
  staffHintText: {
    fontSize: 12,
    color: Colors.textLight,
    flex: 1,
  },
  // Country picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textDark,
  },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textDark,
    padding: 0,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  countryFlag: {
    fontSize: 22,
  },
  countryName: {
    flex: 1,
    fontSize: 15,
    color: Colors.textDark,
  },
  countryDial: {
    fontSize: 15,
    color: Colors.textMedium,
    fontWeight: '600',
  },
});
