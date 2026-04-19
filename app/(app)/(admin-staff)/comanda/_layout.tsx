import { Stack } from 'expo-router';

/**
 * Comanda stack navigator — contains the orders list and create order form.
 * Nested inside the admin-staff tabs.
 */
export default function ComandaLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1a1d23',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 16,
        },
        contentStyle: { backgroundColor: '#111418' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => (
            <></>
          ),
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="crear"
        options={{
          title: 'Nuevo Pedido',
          headerBackTitle: 'Volver',
        }}
      />
    </Stack>
  );
}
