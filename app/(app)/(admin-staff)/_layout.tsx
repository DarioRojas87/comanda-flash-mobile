import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, View, Text } from 'react-native';
import { House, ClipboardList, SlidersHorizontal, LogOut } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function AdminStaffTabLayout() {
  const { profile, signOut } = useAuthStore();
  const router = useRouter();
  const isAdmin = profile?.role === 'admin';

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <Tabs
      screenOptions={{
        // Header styling matching PWA
        headerStyle: {
          backgroundColor: '#1a1d23',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          fontWeight: '900',
          fontSize: 18,
          color: '#fff',
        },
        headerTintColor: '#fff',
        headerRight: () => (
          <View className="flex-row items-center gap-1 mr-2">
            <TouchableOpacity
              onPress={handleSignOut}
              className="w-10 h-10 items-center justify-center rounded-full"
              activeOpacity={0.7}
            >
              <LogOut size={20} color="#94a3b8" />
            </TouchableOpacity>
            {isAdmin && (
              <TouchableOpacity
                onPress={() => router.push('/(app)/(admin-staff)/settings')}
                className="w-10 h-10 items-center justify-center rounded-full"
                activeOpacity={0.7}
              >
                <SlidersHorizontal size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        ),
        headerTitle: () => (
          <Text className="text-white text-lg font-black tracking-tight">
            Comanda<Text className="text-primary">Flash</Text>
          </Text>
        ),
        // Tab bar styling matching PWA bottom nav
        tabBarStyle: {
          backgroundColor: '#1a1d23',
          borderTopColor: '#2a2d35',
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.5,
          shadowRadius: 40,
          elevation: 20,
        },
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.5,
        },
      }}
    >
      {/* Home / Admin Dashboard */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <House size={size} color={color} />,
        }}
      />

      {/* Comanda Stack (list + create) */}
      <Tabs.Screen
        name="comanda"
        options={{
          title: 'Comanda',
          headerShown: false, // Comanda has its own stack with headers
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} />,
        }}
      />

      {/* Settings — admin only, hidden from tab bar */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          href: isAdmin ? '/(app)/(admin-staff)/settings' : null,
          tabBarItemStyle: { display: 'none' }, // Not shown in tab bar, accessed via header icon
          tabBarIcon: ({ color, size }) => <SlidersHorizontal size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
