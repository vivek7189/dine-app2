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
      router.replace('/(tabs)/tables');
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
