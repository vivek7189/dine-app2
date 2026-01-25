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
      // Check user role to determine default page
      const userData = await apiClient.getUser();
      const userRole = userData?.role?.toLowerCase();

      // Cashier/sales roles go directly to menu (counter sales mode)
      if (userRole && ['cashier', 'sales'].includes(userRole)) {
        router.replace('/(tabs)/menu');
      } else {
        router.replace('/(tabs)/tables');
      }
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
