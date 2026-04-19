import '../global.css';

import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';

// Single QueryClient instance for the app lifecycle
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false, // Not applicable on mobile, but explicit
    },
  },
});

/**
 * Handles authentication-based navigation redirect.
 * Redirects unauthenticated users to /login and authenticated users away from /login.
 */
function AuthNavigationGuard() {
  const { user, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const hasSession = !!user;
    const hasProfile = !!profile;

    if (!hasSession) {
      // Not signed in → go to login (if not already there)
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (hasProfile) {
      // Signed in with profile loaded → redirect away from auth screens
      if (inAuthGroup) {
        // Redirect to home based on role
        if (profile.role === 'delivery') {
          router.replace('/(app)/delivery');
        } else {
          router.replace('/(app)/(admin-staff)/home');
        }
      }
    }
  }, [user, profile, loading, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="text-text-secondary mt-4 text-sm">Cargando...</Text>
      </View>
    );
  }

  return <Slot />;
}

/**
 * Root layout wrapping the entire app with providers.
 */
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <AuthNavigationGuard />
      </AuthProvider>
    </QueryClientProvider>
  );
}
