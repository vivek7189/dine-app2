import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence, GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDwXuuSzd0PToBZhl4sw4xiNPos2fMyHMM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ascendant-idea-443107-f8.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'ascendant-idea-443107-f8',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ascendant-idea-443107-f8.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1087929121342',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:1087929121342:web:ba7a6b16adf0ff32a42f6f',
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with AsyncStorage persistence for React Native
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (error) {
  if (error.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw error;
  }
}

export { auth, GoogleAuthProvider, OAuthProvider, signInWithCredential };
