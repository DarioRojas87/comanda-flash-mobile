import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  ChefHat,
  CheckCircle2,
  RotateCcw,
  Package,
  Clock,
  Plus,
  MapPin,
  Undo2,
  Bike,
  X,
  Store,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Order, OrderItem, OrderStatus, DeliveryProfile } from '@/src/shared/types/order';

const HISTORY_RESET_KEY = 'cf_last_closed_at';

// ── Data fetching ─────────────────────────────────────────────────

const fetchOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name))')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
};

const fetchDeliveryProfiles = async (): Promise<DeliveryProfile[]> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'delivery');
  if (error) throw new Error(error.message);
  return data || [];
};

// ── Helpers ───────────────────────────────────────────────────────

function buildItemTree(items: OrderItem[]): (OrderItem & { extras: OrderItem[] })[] {
  const parents = items.filter((i) => !i.parent_item_id);
  return parents.map((parent) => ({
    ...parent,
    extras: items.filter((i) => i.parent_item_id === parent.id),
  }));
}

function formatAddress(order: Order): string {
  const hasGps = order.lat !== null && order.lng !== null;
  const hasText = !!order.address_text;
  if (hasText && hasGps) return `Ubicación por WhatsApp · ${order.address_text}`;
  if (hasText) return order.address_text!;
  if (hasGps) return 'Ubicación por GPS';
  return 'Sin ubicación';
}

function getStatusColor(status: OrderStatus): string {
  switch (status) {
    case 'pending':
      return '#ef4444';
    case 'preparing':
      return '#fb923c';
    case 'ready':
      return '#22c55e';
    case 'picked_up':
      return '#3b82f6';
    default:
      return '#475569';
  }
}

// ── Components ────────────────────────────────────────────────────

type TabId = 'pending' | 'ready' | 'history';

function TabButton({
  id,
  label,
  icon: Icon,
  count,
  highlight,
  activeTab,
  onPress,
}: {
  id: TabId;
  label: string;
  icon: typeof Clock;
  count?: number;
  highlight?: boolean;
  activeTab: TabId;
  onPress: (tab: TabId) => void;
}) {
  const isActive = activeTab === id;
  return (
    <TouchableOpacity
      onPress={() => onPress(id)}
      activeOpacity={0.7}
      className="flex-1 items-center justify-center pb-3"
    >
      <View className="flex-row items-center gap-1.5">
        <Icon size={16} color={isActive ? '#f97316' : '#94a3b8'} />
        <Text
          className={`text-sm font-bold tracking-wide ${isActive ? 'text-primary' : 'text-text-secondary'}`}
        >
          {label}
        </Text>
        {count !== undefined && count > 0 && (
          <View
            className={`px-1.5 py-0.5 rounded-full ${
              highlight && count > 0
                ? 'bg-green-500'
                : isActive
                  ? 'bg-primary'
                  : 'bg-white/10'
            }`}
          >
            <Text
              className={`text-[10px] font-black leading-none ${
                highlight || isActive ? 'text-white' : 'text-text-secondary'
              }`}
            >
              {count}
            </Text>
          </View>
        )}
      </View>
      {isActive && (
        <View className="absolute bottom-0 w-full h-[3px] bg-primary rounded-t-full" />
      )}
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────

export default function DigitalComanda() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null);
  const [lastClosedAt, setLastClosedAt] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Load last closed timestamp
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_RESET_KEY).then(setLastClosedAt);
  }, []);

  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders,
  });

  const { data: deliveryProfiles = [] } = useQuery({
    queryKey: ['deliveryProfiles'],
    queryFn: fetchDeliveryProfiles,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      newStatus,
      delivery_id,
    }: {
      id: string;
      newStatus: OrderStatus;
      delivery_id?: string;
    }) => {
      const update: Record<string, unknown> = { status: newStatus };
      if (delivery_id !== undefined) update.delivery_id = delivery_id;
      const { error } = await supabase.from('orders').update(update).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setAssigningOrder(null);
    },
  });

  const handleUpdateStatus = (id: string, newStatus: OrderStatus) => {
    updateStatusMutation.mutate({ id, newStatus });
  };

  const handleAssignDelivery = (deliveryId: string) => {
    if (!assigningOrder) return;
    updateStatusMutation.mutate({
      id: assigningOrder.id,
      newStatus: 'shipping',
      delivery_id: deliveryId,
    });
  };

  // Filter orders by tab
  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');
  const historyOrders = orders.filter((o) => {
    if (!['shipping', 'delivered', 'cancelled', 'failed', 'picked_up'].includes(o.status))
      return false;
    if (lastClosedAt) return new Date(o.created_at) > new Date(lastClosedAt);
    return true;
  });

  const filteredOrders =
    activeTab === 'pending' ? pendingOrders : activeTab === 'ready' ? readyOrders : historyOrders;

  return (
    <View className="flex-1 bg-background-dark">
      {/* Header */}
      <View 
        className="bg-background-dark px-4 pb-3 flex-row items-center justify-between"
        style={{ paddingTop: Math.max(insets.top, 16) }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
            <ClipboardList size={20} color="#f97316" />
          </View>
          <View>
            <Text className="text-xl font-black text-white tracking-tight">Comandas</Text>
            <Text className="text-xs text-text-muted mt-0.5">Gestión en tiempo real</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(app)/(admin-staff)/comanda/crear')}
          activeOpacity={0.8}
          className="bg-primary w-10 h-10 rounded-xl items-center justify-center"
          style={{
            shadowColor: '#f97316',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-border-dark px-4">
        <TabButton
          id="pending"
          label="Pendientes"
          icon={Clock}
          count={pendingOrders.length}
          activeTab={activeTab}
          onPress={setActiveTab}
        />
        <TabButton
          id="ready"
          label="Listos"
          icon={CheckCircle2}
          count={readyOrders.length}
          highlight={readyOrders.length > 0}
          activeTab={activeTab}
          onPress={setActiveTab}
        />
        <TabButton
          id="history"
          label="Historial"
          icon={RotateCcw}
          activeTab={activeTab}
          onPress={setActiveTab}
        />
      </View>

      {/* Order Cards */}
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4 pb-8">
        {isLoading && (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        )}

        {isError && (
          <View className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl">
            <Text className="text-red-500 text-sm font-medium text-center">
              Error al cargar las órdenes. Inténtalo de nuevo.
            </Text>
          </View>
        )}

        {!isLoading && !isError && filteredOrders.length === 0 && (
          <View className="items-center justify-center py-16 px-4 bg-surface-dark/50 rounded-3xl border border-dashed border-border-dark">
            <Package size={48} color="#2a2d35" />
            <Text className="text-sm font-medium text-text-muted text-center mt-3">
              No hay pedidos en esta pestaña
            </Text>
          </View>
        )}

        {filteredOrders.map((order) => {
          const itemTree = buildItemTree(order.order_items || []);
          return (
            <OrderCard
              key={order.id}
              order={order}
              itemTree={itemTree}
              activeTab={activeTab}
              onUpdateStatus={handleUpdateStatus}
              onAssign={() => setAssigningOrder(order)}
              isPending={updateStatusMutation.isPending}
            />
          );
        })}
      </ScrollView>

      {/* Delivery Assignment Modal */}
      <Modal
        visible={!!assigningOrder}
        transparent
        animationType="slide"
        onRequestClose={() => setAssigningOrder(null)}
      >
        <Pressable
          className="flex-1 bg-black/80 justify-end"
          onPress={() => setAssigningOrder(null)}
        >
          <Pressable className="bg-surface-dark rounded-t-3xl border-t border-border-dark">
            <View className="p-6">
              <View className="flex-row justify-between items-start mb-4">
                <View>
                  <Text className="text-xl font-black text-white tracking-tight">
                    Asignar Repartidor
                  </Text>
                  <Text className="text-xs text-text-muted mt-0.5">
                    Pedido de {assigningOrder?.customer_name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAssigningOrder(null)}
                  className="w-8 h-8 rounded-full bg-background-dark items-center justify-center"
                >
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {deliveryProfiles.length === 0 ? (
                <View className="py-8 items-center">
                  <Bike size={40} color="#2a2d35" />
                  <Text className="text-text-muted text-sm mt-3">
                    No hay repartidores disponibles
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {deliveryProfiles.map((dp) => (
                    <TouchableOpacity
                      key={dp.id}
                      onPress={() => handleAssignDelivery(dp.id)}
                      disabled={updateStatusMutation.isPending}
                      activeOpacity={0.7}
                      className="flex-row items-center gap-4 p-4 rounded-2xl bg-background-dark border border-border-dark"
                    >
                      <View className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 items-center justify-center">
                        <Bike size={20} color="#f97316" />
                      </View>
                      <Text className="font-bold text-white text-sm">{dp.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Order Card ────────────────────────────────────────────────────

function OrderCard({
  order,
  itemTree,
  activeTab,
  onUpdateStatus,
  onAssign,
  isPending,
}: {
  order: Order;
  itemTree: (OrderItem & { extras: OrderItem[] })[];
  activeTab: TabId;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  onAssign: () => void;
  isPending: boolean;
}) {
  return (
    <View className="bg-surface-dark rounded-2xl overflow-hidden border border-border-dark">
      {/* Status color band */}
      <View style={{ height: 6, backgroundColor: getStatusColor(order.status) }} />

      <View className="p-4 gap-3">
        {/* Top: Name + Status + Time */}
        <View className="flex-row justify-between items-start">
          <View className="flex-1 mr-3">
            <Text className="text-lg font-black text-white tracking-tight">
              {order.customer_name}
            </Text>
            <View className="bg-background-dark/50 self-start px-2 py-0.5 rounded-md mt-1">
              <Text className="text-xs text-text-muted font-mono">
                {new Date(order.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
          <View className="bg-primary/10 border border-primary/20 px-2 py-1 rounded-full">
            <Text className="text-primary text-[10px] font-black uppercase tracking-wider">
              {order.status === 'picked_up' ? 'Retirado' : order.status}
            </Text>
          </View>
        </View>

        {/* Products */}
        {itemTree.length > 0 ? (
          <View className="bg-primary/5 border border-primary/30 rounded-2xl p-4 gap-2">
            {itemTree.map((item) => (
              <View key={item.id}>
                <View className="flex-row items-baseline gap-3">
                  <Text className="text-2xl font-black text-primary">{item.quantity}×</Text>
                  <Text className="text-base font-bold text-white flex-1">
                    {item.products?.name ?? 'Producto'}
                  </Text>
                  {item.subtotal != null && (
                    <Text className="text-xs text-text-muted">${item.subtotal}</Text>
                  )}
                </View>
                {item.extras.map((extra) => (
                  <View key={extra.id} className="ml-8 mt-1 flex-row items-baseline gap-2">
                    <Text className="text-xs text-yellow-500">↳</Text>
                    <Text className="text-xs font-semibold text-yellow-300">
                      {extra.quantity}× {extra.products?.name ?? 'Extra'}
                    </Text>
                    {extra.subtotal != null && (
                      <Text className="text-[10px] text-yellow-500/70 ml-auto">
                        +${extra.subtotal}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-background-dark/40 border border-dashed border-border-dark/50 rounded-2xl p-3">
            <Text className="text-xs text-text-muted italic text-center">
              Sin detalle de productos
            </Text>
          </View>
        )}

        {/* Notes */}
        {order.notes ? (
          <View className="flex-row items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
            <Text className="text-base mt-0.5">📝</Text>
            <Text className="text-sm text-yellow-300 font-medium flex-1">{order.notes}</Text>
          </View>
        ) : null}

        {/* Address */}
        <View className="gap-1">
          <View className="flex-row items-start gap-2">
            <MapPin size={14} color="#64748b" style={{ marginTop: 2 }} />
            <Text className="text-xs text-text-muted flex-1">{formatAddress(order)}</Text>
          </View>
          {order.indicaciones ? (
            <Text className="ml-5 text-xs text-text-muted/80 italic">
              &ldquo;{order.indicaciones}&rdquo;
            </Text>
          ) : null}
        </View>

        {/* Total */}
        {order.total_amount != null && (
          <View className="border-t border-border-dark pt-3 flex-row items-center justify-between">
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Total
            </Text>
            <Text className="text-xl font-black text-green-400">${order.total_amount}</Text>
          </View>
        )}

        {/* Actions */}
        <View className="border-t border-border-dark pt-3 gap-2">
          {activeTab === 'pending' && (
            <View className="flex-row gap-3">
              {order.status === 'pending' ? (
                <TouchableOpacity
                  onPress={() => onUpdateStatus(order.id, 'preparing')}
                  disabled={isPending}
                  activeOpacity={0.7}
                  className="flex-1 h-11 rounded-xl border border-border-dark flex-row items-center justify-center gap-2"
                >
                  <ChefHat size={16} color="#94a3b8" />
                  <Text className="text-white font-bold text-sm">Preparando</Text>
                </TouchableOpacity>
              ) : (
                <View className="flex-1 h-11 rounded-xl bg-background-dark border border-border-dark flex-row items-center justify-center gap-2 opacity-50">
                  <View className="w-2 h-2 rounded-full bg-orange-400" />
                  <Text className="text-text-secondary font-bold text-sm">En preparación</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => onUpdateStatus(order.id, 'ready')}
                disabled={isPending}
                activeOpacity={0.8}
                className="flex-1 h-11 rounded-xl bg-primary flex-row items-center justify-center gap-2"
                style={{
                  shadowColor: '#f97316',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 4,
                }}
              >
                <CheckCircle2 size={16} color="white" />
                <Text className="text-white font-bold text-sm">¡Listo!</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'ready' && (
            <>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => onUpdateStatus(order.id, 'pending')}
                  disabled={isPending}
                  activeOpacity={0.7}
                  className="h-11 px-4 rounded-xl border border-border-dark items-center justify-center"
                >
                  <Undo2 size={16} color="#94a3b8" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onAssign}
                  disabled={isPending}
                  activeOpacity={0.8}
                  className="flex-1 h-11 rounded-xl bg-green-500 flex-row items-center justify-center gap-2"
                  style={{
                    shadowColor: '#22c55e',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 4,
                  }}
                >
                  <Bike size={16} color="white" />
                  <Text className="text-white font-bold text-sm">Asignar Delivery</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => onUpdateStatus(order.id, 'picked_up')}
                disabled={isPending}
                activeOpacity={0.7}
                className="w-full h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex-row items-center justify-center gap-2"
              >
                <Store size={16} color="#93c5fd" />
                <Text className="text-blue-300 font-bold text-sm">Retiró en Local</Text>
              </TouchableOpacity>
            </>
          )}

          {activeTab === 'history' && (
            <View className="flex-row gap-3">
              {order.status === 'picked_up' && (
                <TouchableOpacity
                  onPress={() => onUpdateStatus(order.id, 'ready')}
                  disabled={isPending}
                  activeOpacity={0.7}
                  className="h-11 px-4 rounded-xl border border-blue-500/30 flex-row items-center justify-center gap-2"
                >
                  <Undo2 size={16} color="#93c5fd" />
                  <Text className="text-blue-300 font-bold text-sm">Regresar</Text>
                </TouchableOpacity>
              )}
              <View className="flex-1 h-11 rounded-xl bg-background-dark border border-border-dark items-center justify-center">
                <Text className="text-text-muted font-bold text-sm">
                  {order.status === 'picked_up' ? 'Retirado en local' : 'Cerrado / Finalizado'}
                </Text>
              </View>
              {order.status === 'shipping' && (
                <TouchableOpacity
                  onPress={onAssign}
                  activeOpacity={0.7}
                  className="h-11 px-4 rounded-xl border border-primary/40 flex-row items-center justify-center gap-2"
                >
                  <RotateCcw size={16} color="#f97316" />
                  <Text className="text-primary font-bold text-sm">Reasignar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
