import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 bg-background-dark items-center justify-center px-6">
        <Text className="text-white text-2xl font-bold mb-4">
          Pantalla no encontrada
        </Text>
        <Link href="/" className="mt-4">
          <Text className="text-primary text-base font-semibold">
            Volver al inicio
          </Text>
        </Link>
      </View>
    </>
  );
}
