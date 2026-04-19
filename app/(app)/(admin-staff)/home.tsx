import { useState, useEffect, useCallback } from 'react';
import MapView, { Marker } from 'react-native-maps';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Switch,
} from 'react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCashClosePDF, generate7DayPDF } from '@/src/utils/pdfGenerator';
import {
  ReceiptText,
  MonitorPlay,
  Map as MapIcon,
  Menu as MenuIcon,
  Tags,
  Coffee,
  Plus,
  Trash2,
  Pencil,
  ScrollText,
  ChevronUp,
  ChevronDown,
  X,
  Download,
} from 'lucide-react-native';

// ── Types (admin-specific) ─────────────────────────────────────────

interface AdminOrder {
  id: string;
  customer_name: string;
  lat: number | null;
  lng: number | null;
  status: string;
  total_amount: number | null;
  is_paid: boolean;
  delivery_id: string | null;
  address_text: string | null;
  created_at: string | null;
}

interface AdminProfile {
  id: string;
  full_name: string;
  role: string;
  current_lat: number | null;
  current_lng: number | null;
}

interface ProductCategory {
  id: string;
  name: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  active: boolean;
  category_id: string | null;
  ingredients: string | null;
  stock: number | null;
}

interface AuditLog {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  created_at: string;
}

// ── Data fetching ────────────────────────────────────────────────

const fetchAdminData = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const [ordersRes, profilesRes, categoriesRes, productsRes, adminProfileRes] = await Promise.all([
    supabase.from('orders').select('*').gte('created_at', today.toISOString()),
    supabase.from('profiles').select('*').eq('role', 'delivery'),
    supabase.from('product_categories').select('*').order('name'),
    supabase.from('products').select('*').order('name'),
    userId
      ? supabase.from('profiles').select('*').eq('id', userId).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (profilesRes.error) throw new Error(profilesRes.error.message);
  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  return {
    orders: ordersRes.data as AdminOrder[],
    profiles: profilesRes.data as AdminProfile[],
    categories: categoriesRes.data as ProductCategory[],
    products: productsRes.data as Product[],
    adminProfile: adminProfileRes.data as AdminProfile | null,
  };
};

const insertAuditLog = async (
  action: string,
  entityType: 'product' | 'category' | 'user',
  profile: { id: string; full_name: string } | null,
) => {
  if (!profile) return;
  try {
    await supabase.from('audit_logs').insert({
      user_id: profile.id,
      user_name: profile.full_name,
      action,
      entity_type: entityType,
    });
  } catch {
    // Non-critical
  }
};

// ── Main Screen ─────────────────────────────────────────────────

export default function HomeScreen() {
  const { profile: currentProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'map' | 'menu'>('map');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adminData'],
    queryFn: fetchAdminData,
  });

  // Realtime subscriptions
  useEffect(() => {
    const channels = ['orders', 'profiles', 'products', 'product_categories'].map((table) =>
      supabase
        .channel(`admin_${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
          queryClient.invalidateQueries({ queryKey: ['adminData'] });
        })
        .subscribe(),
    );

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [queryClient]);

  const orders = data?.orders || [];
  const profiles = data?.profiles || [];
  const categories = data?.categories || [];
  const products = data?.products || [];

  const auditLog = useCallback(
    (action: string, entityType: 'product' | 'category' | 'user') =>
      insertAuditLog(action, entityType, currentProfile),
    [currentProfile],
  );

  const deliveredTotal = orders
    .filter((o) => o.status === 'delivered')
    .reduce((acc, curr) => acc + (curr.total_amount || 0), 0);

  const shippingCount = orders.filter((o) => o.status === 'shipping').length;

  return (
    <View className="flex-1 bg-background-dark">
      {/* Header Row */}
      <View className="px-4 pt-2 pb-3 gap-3">
        {/* Tab Bar */}
        <View className="flex-row p-1 bg-surface-dark border border-border-dark rounded-xl">
          <TouchableOpacity
            onPress={() => setActiveTab('map')}
            activeOpacity={0.7}
            className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg ${
              activeTab === 'map' ? 'bg-primary' : ''
            }`}
          >
            <MapIcon size={16} color={activeTab === 'map' ? 'white' : '#64748b'} />
            <Text
              className={`text-sm font-bold ${activeTab === 'map' ? 'text-white' : 'text-text-muted'}`}
            >
              Mapa en Vivo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('menu')}
            activeOpacity={0.7}
            className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg ${
              activeTab === 'menu' ? 'bg-primary' : ''
            }`}
          >
            <MenuIcon size={16} color={activeTab === 'menu' ? 'white' : '#64748b'} />
            <Text
              className={`text-sm font-bold ${activeTab === 'menu' ? 'text-white' : 'text-text-muted'}`}
            >
              Gestión Menú
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {activeTab === 'map' ? (
        <MapTab
          orders={orders}
          profiles={profiles}
          shippingCount={shippingCount}
          isLoading={isLoading}
        />
      ) : (
        <MenuTab
          orders={orders}
          profiles={profiles}
          categories={categories}
          products={products}
          auditLog={auditLog}
          refetch={refetch}
          deliveredTotal={deliveredTotal}
          currentProfile={currentProfile}
        />
      )}
    </View>
  );
}

// ── Map Tab (Live Map) ──────────────────────────────────────────

function MapTab({
  orders,
  profiles,
  shippingCount,
  isLoading,
}: {
  orders: AdminOrder[];
  profiles: AdminProfile[];
  shippingCount: number;
  isLoading: boolean;
}) {
  const DELIVERY_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#eab308'];
  const shippingOrders = orders.filter((o) => o.status === 'shipping' && o.lat && o.lng);

  // Default center: Tucumán, Argentina
  const defaultRegion = {
    latitude: -27.0551,
    longitude: -65.3983,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  };

  // Try to center on admin's location or first shipping order
  const adminWithLocation = profiles.length > 0 ? profiles.find((p) => p.current_lat && p.current_lng) : null;
  const firstOrderWithLocation = shippingOrders.length > 0 ? shippingOrders[0] : null;

  const initialRegion = adminWithLocation
    ? { ...defaultRegion, latitude: adminWithLocation.current_lat!, longitude: adminWithLocation.current_lng! }
    : firstOrderWithLocation
      ? { ...defaultRegion, latitude: firstOrderWithLocation.lat!, longitude: firstOrderWithLocation.lng! }
      : defaultRegion;

  return (
    <View className="flex-1 relative">
      {isLoading && (
        <View className="absolute inset-0 z-50 bg-background-dark/80 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="text-primary font-bold text-xs uppercase tracking-widest mt-3">
            Ubicando pedidos...
          </Text>
        </View>
      )}

      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        mapType="standard"
      >
        {/* Order destination markers */}
        {shippingOrders.map((o) => {
          if (o.lat === null || o.lng === null) return null;
          const driverIdx = profiles.findIndex((p) => p.id === o.delivery_id);
          const color =
            driverIdx >= 0 ? DELIVERY_COLORS[driverIdx % DELIVERY_COLORS.length] : '#ef4444';
          const driverName = driverIdx >= 0 ? profiles[driverIdx].full_name : null;
          return (
            <Marker
              key={`order-${o.id}`}
              coordinate={{ latitude: o.lat, longitude: o.lng }}
              pinColor={color}
              title={o.customer_name}
              description={driverName ? `🛵 ${driverName}` : o.address_text || 'Sin dirección'}
            />
          );
        })}

        {/* Delivery driver location markers */}
        {profiles
          .filter((p) => p.current_lat && p.current_lng)
          .map((p, idx) => (
            <Marker
              key={`driver-${p.id}`}
              coordinate={{ latitude: p.current_lat!, longitude: p.current_lng! }}
              title={`🛵 ${p.full_name}`}
              description="Repartidor en ruta"
            >
              <View
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{
                  backgroundColor: DELIVERY_COLORS[idx % DELIVERY_COLORS.length],
                  borderWidth: 3,
                  borderColor: 'white',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 4,
                  elevation: 5,
                }}
              >
                <Text className="text-white text-[10px] font-black">
                  {p.full_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            </Marker>
          ))}
      </MapView>

      {/* Floating delivery legend — top-right overlay */}
      <View
        className="absolute top-3 right-3 bg-surface-dark/95 rounded-2xl p-3 border border-border-dark gap-2"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.5,
          shadowRadius: 8,
          elevation: 10,
          minWidth: 160,
          maxWidth: 200,
        }}
      >
        <Text className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Repartidores
        </Text>
        {profiles.length === 0 ? (
          <Text className="text-xs text-text-muted italic">Sin repartidores</Text>
        ) : (
          profiles.map((p, idx) => {
            const color = DELIVERY_COLORS[idx % DELIVERY_COLORS.length];
            const orderCount = shippingOrders.filter((o) => o.delivery_id === p.id).length;
            const isOnline = !!(p.current_lat && p.current_lng);
            return (
              <View key={p.id} className="flex-row items-center gap-2">
                <View
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <Text className="text-[11px] font-bold text-white flex-1" numberOfLines={1}>
                  {p.full_name}
                </Text>
                {orderCount > 0 && (
                  <View
                    className="px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: color }}
                  >
                    <Text className="text-[9px] font-black text-white">{orderCount}</Text>
                  </View>
                )}
                <View
                  className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-600'}`}
                />
              </View>
            );
          })
        )}
        <View className="border-t border-border-dark pt-2 mt-1 flex-row items-center justify-between">
          <Text className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            En camino
          </Text>
          <View className="bg-primary/20 border border-primary/30 px-2 py-0.5 rounded-md">
            <Text className="text-primary text-xs font-black">{shippingCount}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Menu Tab ────────────────────────────────────────────────────

function MenuTab({
  orders,
  profiles,
  categories,
  products,
  auditLog,
  refetch,
  deliveredTotal,
  currentProfile,
}: {
  orders: AdminOrder[];
  profiles: AdminProfile[];
  categories: ProductCategory[];
  products: Product[];
  auditLog: (action: string, entityType: 'product' | 'category' | 'user') => void;
  refetch: () => void;
  deliveredTotal: number;
  currentProfile: { id: string; full_name: string } | null;
}) {
  // Category state
  const [newCatName, setNewCatName] = useState('');
  const [isAddingCat, setIsAddingCat] = useState(false);

  // Product modal state
  const [showCreateProdModal, setShowCreateProdModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdStock, setNewProdStock] = useState('');
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdIngredients, setNewProdIngredients] = useState('');

  // Edit product state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProdName, setEditProdName] = useState('');
  const [editProdPrice, setEditProdPrice] = useState('');
  const [editProdStock, setEditProdStock] = useState('');
  const [editProdCategoryId, setEditProdCategoryId] = useState('');
  const [editProdIngredients, setEditProdIngredients] = useState('');
  const [editProdActive, setEditProdActive] = useState(true);

  // Audit logs modal
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Accordion state
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Cash close state
  const [showCashCloseModal, setShowCashCloseModal] = useState(false);
  const [cashSummary, setCashSummary] = useState({ totalSales: 0, totalLosses: 0 });
  const [pdfLoading, setPdfLoading] = useState(false);

  // ── Category handlers ──

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const { error } = await supabase
      .from('product_categories')
      .insert([{ name: newCatName.trim() }]);
    if (error) Alert.alert('Error', 'Error al crear categoría: ' + error.message);
    else {
      auditLog(`Creó la categoría "${newCatName.trim()}"`, 'category');
      setNewCatName('');
      setIsAddingCat(false);
      refetch();
    }
  };

  const handleDeleteCategory = (id: string, name: string) => {
    if (name === 'General') return;
    Alert.alert('Eliminar categoría', `¿Eliminar "${name}"? Los productos se moverán a General.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const generalCat = categories.find((c) => c.name === 'General');
          if (generalCat) {
            await supabase.from('products').update({ category_id: generalCat.id }).eq('category_id', id);
          }
          const { error } = await supabase.from('product_categories').delete().eq('id', id);
          if (error) Alert.alert('Error', error.message);
          else {
            auditLog(`Eliminó la categoría "${name}"`, 'category');
            refetch();
          }
        },
      },
    ]);
  };

  // ── Product handlers ──

  const handleAddProduct = async () => {
    if (!newProdName.trim() || !newProdPrice || !newProdCategoryId) return;
    const { error } = await supabase.from('products').insert([
      {
        name: newProdName.trim(),
        price: parseFloat(newProdPrice),
        category_id: newProdCategoryId,
        ingredients: newProdIngredients.trim() || null,
        active: true,
        stock: newProdStock.trim() === '' ? null : parseInt(newProdStock),
      },
    ]);
    if (error) Alert.alert('Error', error.message);
    else {
      auditLog(`Creó el producto "${newProdName.trim()}"`, 'product');
      setNewProdName('');
      setNewProdPrice('');
      setNewProdStock('');
      setNewProdCategoryId('');
      setNewProdIngredients('');
      setShowCreateProdModal(false);
      refetch();
    }
  };

  const openEditProduct = (prod: Product) => {
    setEditingProduct(prod);
    setEditProdName(prod.name);
    setEditProdPrice(String(prod.price));
    setEditProdStock(prod.stock !== null ? String(prod.stock) : '');
    setEditProdCategoryId(prod.category_id || '');
    setEditProdIngredients(prod.ingredients || '');
    setEditProdActive(prod.active);
  };

  const handleEditProduct = async () => {
    if (!editingProduct) return;
    const { error } = await supabase
      .from('products')
      .update({
        name: editProdName.trim(),
        price: parseFloat(editProdPrice),
        category_id: editProdCategoryId || null,
        ingredients: editProdIngredients.trim() || null,
        stock: editProdStock.trim() === '' ? null : parseInt(editProdStock),
        active: editProdActive,
      })
      .eq('id', editingProduct.id);
    if (error) Alert.alert('Error', error.message);
    else {
      auditLog(`Editó el producto "${editProdName.trim()}"`, 'product');
      setEditingProduct(null);
      refetch();
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    Alert.alert('Eliminar producto', `¿Eliminar "${name}" permanentemente?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('products').delete().eq('id', id);
          if (error) Alert.alert('Error', error.message);
          else {
            auditLog(`Eliminó el producto "${name}"`, 'product');
            setEditingProduct(null);
            refetch();
          }
        },
      },
    ]);
  };

  const handleToggleProductStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from('products').update({ active: !currentStatus }).eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else refetch();
  };

  const handleToggleStockTracking = async (id: string, currentStock: number | null) => {
    const newStock = currentStock === null ? 0 : null;
    const { error } = await supabase
      .from('products')
      .update({ stock: newStock, active: newStock === 0 ? false : true })
      .eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else refetch();
  };

  const handleSetStock = async (id: string, value: string) => {
    const parsed = parseInt(value);
    if (value.trim() === '' || isNaN(parsed) || parsed < 0) return;
    const { error } = await supabase
      .from('products')
      .update({ stock: parsed, active: parsed > 0 })
      .eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else refetch();
  };

  // ── Audit Logs ──

  const fetchLogs = async () => {
    setLogsLoading(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    await supabase.from('audit_logs').delete().lt('created_at', cutoff.toISOString());
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setLogs((logsData as AuditLog[]) || []);
    setLogsLoading(false);
  };

  // ── Cash Close ──

  const handleCashClose = () => {
    const delivered = orders.filter((o) => o.status === 'delivered');
    const failed = orders.filter((o) => o.status === 'failed' || o.status === 'cancelled');
    const totalSales = delivered.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
    const totalLosses = failed.reduce((acc, curr) => acc + (curr.total_amount || 0), 0);
    setCashSummary({ totalSales, totalLosses });
    setShowCashCloseModal(true);
  };

  const handleConfirmCashClose = async () => {
    setPdfLoading(true);
    try {
      await generateCashClosePDF(orders, profiles, cashSummary);
      await AsyncStorage.setItem('cf_last_closed_at', new Date().toISOString());
    } finally {
      setPdfLoading(false);
      setShowCashCloseModal(false);
    }
  };

  const handleDownload7DayPDF = async () => {
    setPdfLoading(true);
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: weekOrders } = await supabase
        .from('orders')
        .select('*')
        .gte('created_at', sevenDaysAgo.toISOString())
        .eq('status', 'delivered')
        .order('created_at', { ascending: true });
      if (!weekOrders || weekOrders.length === 0) {
        Alert.alert('Sin datos', 'No hay pedidos entregados en los últimos 7 días.');
        return;
      }
      await generate7DayPDF(weekOrders);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4 pb-8">
      {/* Stats row */}
      <View className="flex-row gap-3">
        <View className="flex-1 bg-background-dark border border-border-dark p-4 rounded-2xl flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Venta Bruta
            </Text>
            <Text className="text-2xl font-black text-white mt-1">${deliveredTotal.toFixed(0)}</Text>
          </View>
          <View className="w-10 h-10 bg-green-500/10 rounded-full items-center justify-center">
            <ReceiptText size={20} color="#4ade80" />
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => {
            setShowLogsModal(true);
            fetchLogs();
          }}
          activeOpacity={0.7}
          className="flex-1 bg-background-dark border border-border-dark rounded-2xl h-12 flex-row items-center justify-center gap-2"
        >
          <ScrollText size={18} color="#a855f7" />
          <Text className="text-white font-bold text-sm">Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleCashClose}
          activeOpacity={0.7}
          className="flex-1 bg-background-dark border border-border-dark rounded-2xl h-12 flex-row items-center justify-center gap-2"
        >
          <ReceiptText size={18} color="#4ade80" />
          <Text className="text-white font-bold text-sm">Cierre de Caja</Text>
        </TouchableOpacity>
      </View>

      {/* Categories Panel */}
      <View className="bg-background-dark rounded-2xl border border-border-dark overflow-hidden">
        <View className="p-4 border-b border-border-dark flex-row items-center justify-between bg-surface-dark/50">
          <View className="flex-row items-center gap-2">
            <Tags size={18} color="#f97316" />
            <Text className="text-base font-bold text-white">Categorías</Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsAddingCat(!isAddingCat)}
            activeOpacity={0.7}
            className={`p-2 rounded-lg border ${
              isAddingCat ? 'bg-primary border-primary' : 'border-primary/30'
            }`}
          >
            {isAddingCat ? (
              <ChevronUp size={16} color="white" />
            ) : (
              <Plus size={16} color="#f97316" />
            )}
          </TouchableOpacity>
        </View>

        {isAddingCat && (
          <View className="p-4 bg-primary/5 border-b border-border-dark flex-row gap-2">
            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="Nueva categoría..."
              placeholderTextColor="#475569"
              className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white"
              onSubmitEditing={handleAddCategory}
            />
            <TouchableOpacity
              onPress={handleAddCategory}
              disabled={!newCatName.trim()}
              activeOpacity={0.7}
              className={`bg-primary px-4 py-2 rounded-lg ${!newCatName.trim() ? 'opacity-50' : ''}`}
            >
              <Text className="text-white text-sm font-bold">Guardar</Text>
            </TouchableOpacity>
          </View>
        )}

        <View className="p-2">
          {categories.length === 0 ? (
            <Text className="text-sm text-text-muted text-center py-8">
              No hay categorías. Crea una.
            </Text>
          ) : (
            categories.map((cat) => (
              <View
                key={cat.id}
                className="flex-row items-center justify-between p-3 rounded-xl"
              >
                <Text className="text-slate-200 font-medium">{cat.name}</Text>
                {cat.name !== 'General' && cat.name !== 'Agregados' && (
                  <TouchableOpacity
                    onPress={() => handleDeleteCategory(cat.id, cat.name)}
                    className="p-1.5 bg-red-500/10 border border-red-500/30 rounded-lg"
                  >
                    <Trash2 size={16} color="#f87171" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      </View>

      {/* Products Panel */}
      <View className="bg-background-dark rounded-2xl border border-border-dark overflow-hidden">
        <View className="p-4 border-b border-border-dark flex-row items-center justify-between bg-surface-dark/50">
          <View className="flex-row items-center gap-2">
            <Coffee size={18} color="#f97316" />
            <Text className="text-base font-bold text-white">Productos del Menú</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowCreateProdModal(true)}
            activeOpacity={0.7}
            className="p-2 rounded-lg border border-primary/30"
          >
            <Plus size={16} color="#f97316" />
          </TouchableOpacity>
        </View>

        <View className="p-4 gap-4">
          {categories.map((cat) => {
            const catProducts = products.filter((p) => p.category_id === cat.id);
            if (catProducts.length === 0) return null;
            const isExpanded = expandedCats[cat.id] ?? catProducts.length <= 6;
            return (
              <View
                key={`prod-cat-${cat.id}`}
                className="bg-surface-dark/30 border border-border-dark rounded-xl overflow-hidden"
              >
                <TouchableOpacity
                  onPress={() => setExpandedCats((prev) => ({ ...prev, [cat.id]: !isExpanded }))}
                  activeOpacity={0.7}
                  className="flex-row items-center justify-between p-4"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-sm font-bold text-white uppercase tracking-wider">
                      {cat.name}
                    </Text>
                    <View className="bg-background-dark/50 border border-border-dark px-2 py-0.5 rounded-full">
                      <Text className="text-xs text-text-muted">{catProducts.length}</Text>
                    </View>
                  </View>
                  {isExpanded ? (
                    <ChevronUp size={20} color="#64748b" />
                  ) : (
                    <ChevronDown size={20} color="#64748b" />
                  )}
                </TouchableOpacity>

                {isExpanded && (
                  <View className="p-4 pt-0 gap-2 border-t border-border-dark/50">
                    {catProducts.map((prod) => (
                      <View
                        key={prod.id}
                        className="p-3 bg-surface-dark border border-border-dark rounded-xl gap-2"
                      >
                        <View className="flex-row items-start justify-between gap-2">
                          <View className="flex-1">
                            <Text className="text-white font-bold" numberOfLines={1}>
                              {prod.name}
                            </Text>
                            <Text className="text-primary text-sm">${prod.price}</Text>
                            {prod.stock !== null && (
                              <View className="bg-background-dark/50 border border-border-dark px-2 py-0.5 rounded-md self-start mt-1">
                                <Text className="text-xs text-text-muted">Stock: {prod.stock}</Text>
                              </View>
                            )}
                          </View>
                          <View className="flex-row items-center gap-1.5">
                            <TouchableOpacity
                              onPress={() => openEditProduct(prod)}
                              className="p-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
                            >
                              <Pencil size={14} color="#facc15" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteProduct(prod.id, prod.name)}
                              className="p-1.5 bg-red-500/10 border border-red-500/30 rounded-lg"
                            >
                              <Trash2 size={14} color="#f87171" />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View className="flex-row items-center gap-2">
                          {prod.stock !== null && (
                            <>
                              <TouchableOpacity
                                onPress={() => handleToggleStockTracking(prod.id, prod.stock)}
                                className="w-9 h-9 bg-background-dark/50 border border-border-dark/60 rounded-lg items-center justify-center"
                              >
                                <Text className="text-text-muted text-base">∞</Text>
                              </TouchableOpacity>
                              <TextInput
                                keyboardType="numeric"
                                value={String(prod.stock)}
                                onEndEditing={(e) => handleSetStock(prod.id, e.nativeEvent.text)}
                                className="w-16 h-9 text-center text-base font-bold text-white bg-background-dark/50 border border-border-dark/60 rounded-lg"
                              />
                            </>
                          )}
                          {prod.stock === null && (
                            <TouchableOpacity
                              onPress={() => handleToggleStockTracking(prod.id, prod.stock)}
                              className="px-4 h-9 bg-background-dark/50 border border-border-dark/60 rounded-lg items-center justify-center"
                            >
                              <Text className="text-text-muted text-xs font-medium">
                                Controlar Stock
                              </Text>
                            </TouchableOpacity>
                          )}
                          <View className="flex-1" />
                          <TouchableOpacity
                            onPress={() => handleToggleProductStatus(prod.id, prod.active)}
                            activeOpacity={0.7}
                            className={`px-3 py-1.5 rounded-md ${
                              prod.active ? 'bg-green-500/20' : 'bg-red-500/20'
                            }`}
                          >
                            <Text
                              className={`text-[10px] font-bold uppercase tracking-wide ${
                                prod.active ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {prod.active ? 'Disponible' : 'Agotado'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          {products.length === 0 && (
            <Text className="text-sm text-text-muted text-center py-4">
              No hay productos creados.
            </Text>
          )}
        </View>
      </View>

      {/* ── Create Product Modal ── */}
      <Modal
        visible={showCreateProdModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateProdModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/80 justify-end"
          onPress={() => setShowCreateProdModal(false)}
        >
          <Pressable className="bg-surface-dark rounded-t-3xl border-t border-border-dark">
            <ScrollView contentContainerClassName="p-6 gap-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-xl font-black text-white">Nuevo Producto</Text>
                <TouchableOpacity
                  onPress={() => setShowCreateProdModal(false)}
                  className="w-8 h-8 rounded-full bg-background-dark items-center justify-center"
                >
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <TextInput
                value={newProdName}
                onChangeText={setNewProdName}
                placeholder="Nombre del producto"
                placeholderTextColor="#475569"
                className="bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
              />
              <View className="flex-row gap-3">
                <TextInput
                  value={newProdPrice}
                  onChangeText={setNewProdPrice}
                  placeholder="Precio"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  className="flex-1 bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                />
                <TextInput
                  value={newProdStock}
                  onChangeText={setNewProdStock}
                  placeholder="Stock (opc.)"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  className="flex-1 bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                />
              </View>

              {/* Category selector */}
              <View className="gap-2">
                <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Categoría
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setNewProdCategoryId(cat.id)}
                      activeOpacity={0.7}
                      className={`px-3 py-2 rounded-xl border ${
                        newProdCategoryId === cat.id
                          ? 'bg-primary border-primary'
                          : 'bg-background-dark border-border-dark'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          newProdCategoryId === cat.id ? 'text-white' : 'text-text-secondary'
                        }`}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TextInput
                value={newProdIngredients}
                onChangeText={setNewProdIngredients}
                placeholder="Ingredientes (opcional)"
                placeholderTextColor="#475569"
                className="bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
              />

              <TouchableOpacity
                onPress={handleAddProduct}
                disabled={!newProdName.trim() || !newProdPrice || !newProdCategoryId}
                activeOpacity={0.8}
                className={`bg-primary rounded-2xl py-4 flex-row items-center justify-center gap-2 ${
                  !newProdName.trim() || !newProdPrice || !newProdCategoryId ? 'opacity-50' : ''
                }`}
              >
                <Plus size={18} color="white" />
                <Text className="text-white font-bold">Crear Producto</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Edit Product Modal ── */}
      <Modal
        visible={!!editingProduct}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingProduct(null)}
      >
        <Pressable
          className="flex-1 bg-black/80 justify-end"
          onPress={() => setEditingProduct(null)}
        >
          <Pressable className="bg-surface-dark rounded-t-3xl border-t border-border-dark">
            <ScrollView contentContainerClassName="p-6 gap-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-xl font-black text-white">Editar Producto</Text>
                <TouchableOpacity
                  onPress={() => setEditingProduct(null)}
                  className="w-8 h-8 rounded-full bg-background-dark items-center justify-center"
                >
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <TextInput
                value={editProdName}
                onChangeText={setEditProdName}
                placeholder="Nombre"
                placeholderTextColor="#475569"
                className="bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
              />
              <View className="flex-row gap-3">
                <TextInput
                  value={editProdPrice}
                  onChangeText={setEditProdPrice}
                  placeholder="Precio"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  className="flex-1 bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                />
                <TextInput
                  value={editProdStock}
                  onChangeText={setEditProdStock}
                  placeholder="Stock (opc.)"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                  className="flex-1 bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                />
              </View>

              <View className="gap-2">
                <Text className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Categoría
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      onPress={() => setEditProdCategoryId(cat.id)}
                      activeOpacity={0.7}
                      className={`px-3 py-2 rounded-xl border ${
                        editProdCategoryId === cat.id
                          ? 'bg-primary border-primary'
                          : 'bg-background-dark border-border-dark'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          editProdCategoryId === cat.id ? 'text-white' : 'text-text-secondary'
                        }`}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TextInput
                value={editProdIngredients}
                onChangeText={setEditProdIngredients}
                placeholder="Ingredientes"
                placeholderTextColor="#475569"
                className="bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
              />

              {/* Active toggle */}
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-bold">Disponible</Text>
                <Switch
                  value={editProdActive}
                  onValueChange={setEditProdActive}
                  trackColor={{ false: '#111418', true: '#22c55e' }}
                  thumbColor="white"
                />
              </View>

              <TouchableOpacity
                onPress={handleEditProduct}
                activeOpacity={0.8}
                className="bg-primary rounded-2xl py-4 flex-row items-center justify-center gap-2"
              >
                <Pencil size={18} color="white" />
                <Text className="text-white font-bold">Guardar Cambios</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => editingProduct && handleDeleteProduct(editingProduct.id, editingProduct.name)}
                activeOpacity={0.7}
                className="bg-red-500/10 border border-red-500/30 rounded-2xl py-3 flex-row items-center justify-center gap-2"
              >
                <Trash2 size={16} color="#f87171" />
                <Text className="text-red-400 font-bold text-sm">Eliminar Producto</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Audit Logs Modal ── */}
      <Modal
        visible={showLogsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLogsModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/80 justify-end"
          onPress={() => setShowLogsModal(false)}
        >
          <Pressable className="bg-surface-dark rounded-t-3xl border-t border-border-dark max-h-[70%]">
            <View className="p-6 pb-2 flex-row justify-between items-center">
              <Text className="text-xl font-black text-white">Registro de Actividad</Text>
              <TouchableOpacity
                onPress={() => setShowLogsModal(false)}
                className="w-8 h-8 rounded-full bg-background-dark items-center justify-center"
              >
                <X size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerClassName="px-6 pb-6 gap-2">
              {logsLoading ? (
                <ActivityIndicator size="small" color="#f97316" />
              ) : logs.length === 0 ? (
                <Text className="text-text-muted text-sm text-center py-8">
                  No hay registros recientes
                </Text>
              ) : (
                logs.map((log) => (
                  <View
                    key={log.id}
                    className="p-3 bg-background-dark border border-border-dark rounded-xl"
                  >
                    <View className="flex-row items-center justify-between mb-1">
                      <Text className="text-white text-xs font-bold">{log.user_name}</Text>
                      <Text className="text-text-muted text-[10px]">
                        {new Date(log.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text className="text-text-secondary text-xs">{log.action}</Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 7-Day PDF button ── */}
      <TouchableOpacity
        onPress={handleDownload7DayPDF}
        disabled={pdfLoading}
        activeOpacity={0.7}
        className={`bg-background-dark border border-border-dark rounded-2xl h-12 flex-row items-center justify-center gap-2 ${
          pdfLoading ? 'opacity-50' : ''
        }`}
      >
        <Download size={16} color="#60a5fa" />
        <Text className="text-white font-bold text-sm">Historial 7 días (PDF)</Text>
      </TouchableOpacity>

      {/* ── Cash Close Modal ── */}
      <Modal
        visible={showCashCloseModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCashCloseModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/80 items-center justify-center p-4"
          onPress={() => setShowCashCloseModal(false)}
        >
          <Pressable className="bg-surface-dark w-full max-w-sm rounded-3xl p-6 border border-border-dark">
            {/* Icon */}
            <View className="w-16 h-16 bg-primary/10 rounded-full items-center justify-center self-center mb-4 border border-primary/20">
              <ReceiptText size={32} color="#f97316" />
            </View>

            <Text className="text-2xl font-black text-center text-white mb-1 tracking-tight">
              Resumen de Caja
            </Text>
            <Text className="text-center text-xs text-text-muted mb-1">
              {new Date().toLocaleDateString('es-AR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text className="text-center text-[10px] text-text-muted/60 mb-6">
              Turno hasta las{' '}
              {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </Text>

            {/* Summary rows */}
            <View className="gap-3 mb-8">
              <View className="flex-row justify-between items-center p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                <View>
                  <Text className="text-green-400 font-bold text-xs uppercase tracking-wider">
                    Venta Bruta
                  </Text>
                  <Text className="text-green-500/60 text-[10px] font-medium">
                    Pedidos completados
                  </Text>
                </View>
                <Text className="text-green-400 font-black text-xl">
                  ${cashSummary.totalSales.toFixed(2)}
                </Text>
              </View>

              <View className="flex-row justify-between items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <View>
                  <Text className="text-red-400 font-bold text-xs uppercase tracking-wider">
                    Pérdidas
                  </Text>
                  <Text className="text-red-500/60 text-[10px] font-medium">
                    Pedidos cancelados
                  </Text>
                </View>
                <Text className="text-red-400 font-black text-xl">
                  -${cashSummary.totalLosses.toFixed(2)}
                </Text>
              </View>

              <View className="pt-4 mt-2 border-t-2 border-dashed border-border-dark flex-row justify-between items-end px-1">
                <Text className="text-text-secondary font-bold text-sm uppercase tracking-wide">
                  Balance Neto
                </Text>
                <Text className="text-white font-black text-3xl tracking-tighter">
                  ${(cashSummary.totalSales - cashSummary.totalLosses).toFixed(2)}
                </Text>
              </View>
            </View>

            {/* Actions */}
            <View className="gap-2">
              <TouchableOpacity
                onPress={handleConfirmCashClose}
                disabled={pdfLoading}
                activeOpacity={0.8}
                className={`w-full py-3.5 bg-primary rounded-2xl flex-row items-center justify-center gap-2 ${
                  pdfLoading ? 'opacity-50' : ''
                }`}
                style={{
                  shadowColor: '#f97316',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                {pdfLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Download size={16} color="white" />
                    <Text className="text-white font-bold">Cerrar Turno y Descargar PDF</Text>
                  </>
                )}
              </TouchableOpacity>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowCashCloseModal(false)}
                  activeOpacity={0.7}
                  className="flex-1 py-3 bg-background-dark border border-border-dark rounded-2xl items-center justify-center"
                >
                  <Text className="text-text-muted font-bold text-sm">Volver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowCashCloseModal(false);
                    handleDownload7DayPDF();
                  }}
                  disabled={pdfLoading}
                  activeOpacity={0.7}
                  className={`flex-1 py-3 bg-blue-600 rounded-2xl flex-row items-center justify-center gap-1.5 ${
                    pdfLoading ? 'opacity-50' : ''
                  }`}
                >
                  <Download size={14} color="white" />
                  <Text className="text-white font-bold text-sm">Últimos 7 días</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
