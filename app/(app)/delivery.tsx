import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '@/src/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/src/store/useAuthStore';
import {
  CheckCircle2,
  MapPin,
  XCircle,
  LocateFixed,
  LogOut,
} from 'lucide-react-native';

// ── Types ─────────────────────────────────────────────────────────

interface DeliveryOrder {
  id: string;
  customer_name: string;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  is_paid: boolean;
  total_amount: number | null;
  indicaciones: string | null;
}

// ── Data fetching ─────────────────────────────────────────────────

const fetchDeliveryOrders = async (): Promise<DeliveryOrder[]> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, customer_name, address_text, lat, lng, status, is_paid, total_amount, indicaciones',
    )
    .eq('status', 'shipping')
    .eq('delivery_id', userId);

  if (error) throw new Error(error.message);
  return data || [];
};

// ── Main Screen ───────────────────────────────────────────────────

export default function DeliveryScreen() {
  const { signOut } = useAuthStore();
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [failReason, setFailReason] = useState('');
  const [showFailDialog, setShowFailDialog] = useState(false);
  const disableAutoSelect = useRef(false);
  const mapRef = useRef<MapView>(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['deliveryOrders'],
    queryFn: fetchDeliveryOrders,
    refetchInterval: 8000,
  });

  // Auto-select first order if none active
  useEffect(() => {
    if (disableAutoSelect.current) {
      disableAutoSelect.current = false;
      return;
    }
    if (orders.length > 0 && !activeOrder) {
      setActiveOrder(orders[0]);
    }
  }, [orders, activeOrder]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('delivery_orders_native')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // GPS Tracking: send current position to Supabase continuously
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos de ubicación',
          'ComandaFlash necesita tu ubicación para rastrear entregas en tiempo real.',
        );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (location) => {
          await supabase
            .from('profiles')
            .update({
              current_lat: location.coords.latitude,
              current_lng: location.coords.longitude,
            })
            .eq('id', userId);
        },
      );
    };

    startTracking();

    return () => {
      subscription?.remove();
    };
  }, []);

  // Animate map to active order
  const handleRecenter = useCallback(() => {
    if (!activeOrder?.lat || !activeOrder?.lng || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: activeOrder.lat,
        longitude: activeOrder.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      800,
    );
  }, [activeOrder]);

  // Animate when order changes
  useEffect(() => {
    if (activeOrder?.lat && activeOrder?.lng) {
      handleRecenter();
    }
  }, [activeOrder, handleRecenter]);

  // Mutations
  const mutation = useMutation({
    mutationFn: async ({
      id,
      status,
      fail_reason,
    }: {
      id: string;
      status: string;
      fail_reason?: string;
    }) => {
      const updateData: { status: string; fail_reason?: string } = { status };
      if (fail_reason) updateData.fail_reason = fail_reason;

      const { error } = await supabase.from('orders').update(updateData).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      disableAutoSelect.current = true;
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] });
      setActiveOrder(null);
      setShowFailDialog(false);
      setFailReason('');
    },
  });

  const handleDeliver = () => {
    if (!activeOrder) return;
    mutation.mutate({ id: activeOrder.id, status: 'delivered' });
  };

  const handleFailed = () => {
    if (!failReason) {
      Alert.alert('Falta motivo', 'Por favor ingresa un motivo del fallo.');
      return;
    }
    if (!activeOrder) return;
    mutation.mutate({ id: activeOrder.id, status: 'failed', fail_reason: failReason });
  };

  // Default map region
  const defaultRegion: Region = {
    latitude: -27.0551,
    longitude: -65.3983,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  const initialRegion =
    activeOrder?.lat && activeOrder?.lng
      ? { ...defaultRegion, latitude: activeOrder.lat, longitude: activeOrder.lng, latitudeDelta: 0.015, longitudeDelta: 0.015 }
      : defaultRegion;

  return (
    <View className="flex-1 bg-background-dark">
      {/* Full-screen Map */}
      <View className="absolute inset-0">
        {isLoading && (
          <View className="absolute inset-0 z-50 bg-background-dark/80 items-center justify-center">
            <ActivityIndicator size="large" color="#f97316" />
            <Text className="text-primary font-bold text-xs uppercase tracking-widest mt-3">
              Ubicando pedidos...
            </Text>
          </View>
        )}

        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          mapType="standard"
          showsUserLocation
          showsMyLocationButton={false}
        >
          {orders.map((o) =>
            o.lat && o.lng ? (
              <Marker
                key={o.id}
                coordinate={{ latitude: o.lat, longitude: o.lng }}
                title={o.customer_name}
                description={o.address_text || 'Ubicación por GPS'}
                pinColor={activeOrder?.id === o.id ? '#f97316' : '#94a3b8'}
                onPress={() => setActiveOrder(o)}
              />
            ) : null,
          )}
        </MapView>
      </View>

      {/* Floating Top UI */}
      <View className="absolute top-0 left-0 right-0 z-10 pt-14 px-4 gap-2">
        {/* Top status pill + sign out */}
        <View className="flex-row items-center justify-between">
          <View
            className="bg-primary px-5 py-2 rounded-full flex-row items-center gap-2"
            style={{
              shadowColor: '#f97316',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 15,
              elevation: 8,
            }}
          >
            <MapPin size={14} color="white" />
            <Text className="text-white text-xs font-black uppercase tracking-widest">
              Tu Ruta Activa
            </Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              Alert.alert('Cerrar sesión', '¿Seguro que deseas salir?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Salir', style: 'destructive', onPress: signOut },
              ])
            }
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-surface-dark/90 border border-border-dark items-center justify-center"
          >
            <LogOut size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Horizontal order selector */}
        <View
          className="bg-surface-dark/90 rounded-2xl p-2 border border-white/5"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          {orders.length === 0 && !isLoading ? (
            <View className="py-3 items-center">
              <Text className="text-sm text-text-muted font-medium">
                No tienes pedidos asignados actualmente.
              </Text>
            </View>
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={orders}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item: o }) => (
                <TouchableOpacity
                  onPress={() => setActiveOrder(o)}
                  activeOpacity={0.7}
                  className={`px-5 py-3 rounded-xl flex-row items-center gap-2 ${
                    activeOrder?.id === o.id
                      ? 'bg-primary'
                      : 'bg-background-dark/50 border border-border-dark'
                  }`}
                  style={
                    activeOrder?.id === o.id
                      ? {
                          shadowColor: '#f97316',
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.4,
                          shadowRadius: 20,
                          elevation: 8,
                        }
                      : undefined
                  }
                >
                  <View
                    className={`w-2 h-2 rounded-full ${o.is_paid ? 'bg-green-400' : 'bg-red-400'}`}
                  />
                  <Text
                    className={`text-sm font-bold ${
                      activeOrder?.id === o.id ? 'text-white' : 'text-slate-300'
                    }`}
                    numberOfLines={1}
                  >
                    {o.customer_name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>

      {/* Active Order Card (Bottom Sheet) */}
      {activeOrder && (
        <View className="absolute bottom-6 left-4 right-4 z-20">
          <View
            className="bg-surface-dark/95 border border-white/10 rounded-3xl p-6"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.6,
              shadowRadius: 25,
              elevation: 15,
            }}
          >
            {/* Drag indicator */}
            <View className="w-16 h-1 bg-border-dark rounded-full mx-auto mb-5 opacity-30" />

            <View className="flex-row justify-between items-start mb-5">
              {/* Order details */}
              <View className="flex-1 mr-4 border-r border-border-dark/50 pr-4">
                <Text className="text-white font-black text-2xl tracking-tight leading-none mb-3">
                  {activeOrder.customer_name}
                </Text>
                <View className="flex-row items-start gap-2">
                  <MapPin size={18} color="#f97316" style={{ marginTop: 2 }} />
                  <Text className="text-slate-200 text-base font-medium flex-1 leading-tight">
                    {activeOrder.address_text ||
                      (activeOrder.lat ? 'Ubicación por GPS' : 'Sin ubicación registrada')}
                  </Text>
                </View>
                {activeOrder.indicaciones && (
                  <Text className="text-sm text-text-muted italic mt-1 ml-7">
                    &ldquo;{activeOrder.indicaciones}&rdquo;
                  </Text>
                )}
                {/* Amount to collect */}
                {!activeOrder.is_paid && activeOrder.total_amount != null && (
                  <View className="mt-3 flex-row items-center gap-2">
                    <Text className="text-xs font-bold text-red-400 uppercase tracking-wider">
                      A cobrar
                    </Text>
                    <Text className="text-3xl font-black text-red-300 tracking-tighter">
                      ${activeOrder.total_amount}
                    </Text>
                  </View>
                )}
              </View>

              {/* Status badge + recenter */}
              <View className="items-end gap-3">
                <View
                  className={`px-3 py-1 rounded-full border ${
                    activeOrder.is_paid
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-black tracking-widest ${
                      activeOrder.is_paid ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {activeOrder.is_paid ? 'PAGADO' : 'A COBRAR'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={handleRecenter}
                  activeOpacity={0.7}
                  className="w-10 h-10 rounded-full bg-primary/10 border-2 border-primary/50 items-center justify-center"
                  style={{
                    shadowColor: '#f97316',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.3,
                    shadowRadius: 15,
                    elevation: 5,
                  }}
                >
                  <LocateFixed size={20} color="#f97316" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Action Buttons */}
            {showFailDialog ? (
              <View className="gap-3">
                <View className="bg-red-500/5 border border-red-500/10 p-3 rounded-2xl">
                  <Text className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 ml-1">
                    Motivo del Fallo
                  </Text>
                  <TextInput
                    value={failReason}
                    onChangeText={setFailReason}
                    placeholder="Ej: No atiende, dirección incorrecta"
                    placeholderTextColor="rgba(239,68,68,0.3)"
                    className="w-full bg-background-dark border border-red-500/30 text-white text-sm rounded-xl p-3.5"
                    autoFocus
                  />
                </View>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowFailDialog(false)}
                    disabled={mutation.isPending}
                    activeOpacity={0.7}
                    className="flex-[0.8] py-4 bg-background-dark border border-border-dark rounded-2xl items-center justify-center"
                  >
                    <Text className="text-text-secondary font-bold text-sm">Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleFailed}
                    disabled={mutation.isPending}
                    activeOpacity={0.8}
                    className="flex-1 py-4 bg-red-500 rounded-2xl flex-row items-center justify-center gap-2"
                    style={{
                      shadowColor: '#ef4444',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    {mutation.isPending ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white font-bold text-sm">Confirmar Fallo</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="flex-row gap-3 mt-1">
                <TouchableOpacity
                  onPress={() => setShowFailDialog(true)}
                  disabled={mutation.isPending}
                  activeOpacity={0.7}
                  className="flex-[0.8] py-4 bg-surface-dark border border-red-500/30 rounded-2xl flex-row items-center justify-center gap-2"
                >
                  <XCircle size={16} color="#f87171" />
                  <Text className="text-red-400 font-bold text-sm">No Entregado</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeliver}
                  disabled={mutation.isPending}
                  activeOpacity={0.8}
                  className="flex-1 py-4 bg-primary rounded-2xl flex-row items-center justify-center gap-2"
                  style={{
                    shadowColor: '#f97316',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 15,
                    elevation: 10,
                  }}
                >
                  {mutation.isPending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <CheckCircle2 size={20} color="white" />
                      <Text className="text-white font-bold text-sm">Entregado</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
