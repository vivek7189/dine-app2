import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import apiClient from '../services/api';
import { Colors } from '../constants/Theme';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const isAuth = await apiClient.isAuthenticated();
    if (isAuth) {
      // Honor role landing on relaunch too (e.g. waiter → Tables), matching every login path.
      // getRoleLandingRoute reads the stored user's posSettings.roleLandingPages and falls back
      // to /(tabs)/home when role-landing is off or unset — so this never mis-routes.
      router.replace(await apiClient.getRoleLandingRoute());
    } else {
      router.replace('/(auth)/login');
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.backgroundCream }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}
