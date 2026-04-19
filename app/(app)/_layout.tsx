import { Stack } from 'expo-router';

/**
 * App group layout — wraps all authenticated screens.
 * Auth checking is handled by AuthNavigationGuard in the root _layout.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#111418' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(admin-staff)" />
      <Stack.Screen name="delivery" />
    </Stack>
  );
}
