import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFormik } from 'formik';
import { supabase } from '@/src/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useGoogleMaps } from '@/src/hooks/useGoogleMaps';
import { extractCoordsFromUrl } from '@/src/utils/googleMapsParser';
import {
  MapPin,
  ShoppingBag,
  Plus,
  Minus,
  Tag,
  CheckCircle2,
  StickyNote,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Trash2,
  Store,
  ShoppingCart,
} from 'lucide-react-native';

// ── Types ─────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  stock: number | null;
}

interface Category {
  id: string;
  name: string;
}

interface CartUnit {
  instanceId: string;
  product_id: string;
  name: string;
  price: number;
  extras: ExtraEntry[];
}

interface ExtraEntry {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

const uid = () => Math.random().toString(36).slice(2, 9);

// ── Data fetching ─────────────────────────────────────────────────

const fetchData = async (): Promise<{ products: Product[]; categories: Category[] }> => {
  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from('products').select('*').eq('active', true).order('name'),
    supabase.from('product_categories').select('*').order('name'),
  ]);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  return { products: productsRes.data || [], categories: categoriesRes.data || [] };
};

// ── Main Screen ───────────────────────────────────────────────────

export default function CreateOrderScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartUnit[]>([]);
  const [openExtraFor, setOpenExtraFor] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [pickupInStore, setPickupInStore] = useState(false);

  const { processShortUrl, loading: expandingCoords } = useGoogleMaps();

  const { data, isLoading: loadingData } = useQuery({
    queryKey: ['createOrderData'],
    queryFn: fetchData,
  });

  const products = data?.products || [];
  const categories = data?.categories || [];
  const agregadosCategory = categories.find((c) => c.name === 'Agregados');
  const agregadosProducts = products.filter((p) => p.category_id === agregadosCategory?.id);

  const toggleCategory = (categoryId: string) =>
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }));

  // ── Cart helpers ──

  const addUnit = (product: Product) => {
    const currentCount = cart.filter((u) => u.product_id === product.id).length;
    if (product.stock !== null && currentCount >= product.stock) return;
    setCart((prev) => [
      ...prev,
      { instanceId: uid(), product_id: product.id, name: product.name, price: product.price, extras: [] },
    ]);
  };

  const removeUnit = (instanceId: string) => {
    setCart((prev) => prev.filter((u) => u.instanceId !== instanceId));
    if (openExtraFor === instanceId) setOpenExtraFor(null);
  };

  const addExtra = (instanceId: string, extra: Product) => {
    setCart((prev) =>
      prev.map((u) => {
        if (u.instanceId !== instanceId) return u;
        const existing = u.extras.find((e) => e.product_id === extra.id);
        if (existing) {
          return {
            ...u,
            extras: u.extras.map((e) =>
              e.product_id === extra.id ? { ...e, quantity: e.quantity + 1 } : e,
            ),
          };
        }
        return {
          ...u,
          extras: [...u.extras, { product_id: extra.id, name: extra.name, price: extra.price, quantity: 1 }],
        };
      }),
    );
  };

  const removeExtra = (instanceId: string, extraProductId: string) => {
    setCart((prev) =>
      prev.map((u) => {
        if (u.instanceId !== instanceId) return u;
        const existing = u.extras.find((e) => e.product_id === extraProductId);
        if (!existing) return u;
        if (existing.quantity > 1) {
          return {
            ...u,
            extras: u.extras.map((e) =>
              e.product_id === extraProductId ? { ...e, quantity: e.quantity - 1 } : e,
            ),
          };
        }
        return { ...u, extras: u.extras.filter((e) => e.product_id !== extraProductId) };
      }),
    );
  };

  const getTotal = () =>
    cart.reduce((sum, u) => sum + u.price + u.extras.reduce((s, e) => s + e.price * e.quantity, 0), 0);

  const unitCountForProduct = (productId: string) =>
    cart.filter((u) => u.product_id === productId).length;

  // ── Formik ──

  const formik = useFormik({
    initialValues: {
      customer_name: '',
      address_text: '',
      location_url: '',
      indicaciones: '',
      notes: '',
      is_paid: false,
    },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!pickupInStore) {
        if (!values.address_text && !values.location_url) {
          errors.address_text = 'Debes ingresar una dirección o un link de ubicación.';
        }
        if (values.address_text) {
          const address = values.address_text.trim();
          const hasLetters = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(address);
          const hasNumbers = /[0-9]/.test(address);
          const isUrl = /^(http|https):\/\//.test(address) || address.includes('www.') || address.includes('.com');
          if (isUrl) errors.address_text = 'La dirección no puede ser un link. Usa el campo de abajo.';
          else if (!hasLetters || !hasNumbers) errors.address_text = 'La dirección debe incluir calle y número.';
        }
        if (values.location_url) {
          const url = values.location_url.trim();
          const startsWithHttp = /^https?:\/\//.test(url);
          const isShort = /^(https?:\/\/)(maps\.app\.goo\.gl|goo\.gl)\//.test(url);
          const hasCoords = extractCoordsFromUrl(url) !== null;
          if (!startsWithHttp || (!isShort && !hasCoords)) {
            errors.location_url = 'Asegúrate de que sea un link de Maps válido (https://...)';
          }
        }
      }
      return errors;
    },
    onSubmit: async (values) => {
      if (cart.length === 0) {
        setError('Debes agregar al menos un producto al pedido.');
        return;
      }
      setLoading(true);
      setError(null);

      try {
        let coords = extractCoordsFromUrl(values.location_url);
        if (!coords && values.location_url.includes('goo.gl')) {
          coords = await processShortUrl(values.location_url);
        }
        if (!coords && values.location_url.trim() !== '') {
          throw new Error('No se pudieron extraer las coordenadas del link proporcionado.');
        }

        const total_amount = getTotal();
        const rpcItems: object[] = [];
        for (const unit of cart) {
          rpcItems.push({
            instance_id: unit.instanceId,
            product_id: unit.product_id,
            quantity: 1,
            unit_price: unit.price,
          });
          for (const extra of unit.extras) {
            rpcItems.push({
              instance_id: uid(),
              product_id: extra.product_id,
              quantity: extra.quantity,
              unit_price: extra.price,
              parent_instance_id: unit.instanceId,
            });
          }
        }

        const orderPayload = {
          p_customer_name: values.customer_name,
          p_address_text: pickupInStore ? null : values.address_text || null,
          p_location_url: pickupInStore ? null : values.location_url || null,
          p_lat: pickupInStore ? null : (coords?.lat ?? null),
          p_lng: pickupInStore ? null : (coords?.lng ?? null),
          p_is_paid: values.is_paid,
          p_total_amount: total_amount,
          p_notes: values.notes || null,
          p_indicaciones: pickupInStore ? 'Retira en local' : values.indicaciones || null,
          p_items: rpcItems,
        };

        const { error: orderError } = await supabase.rpc('create_order_with_stock', orderPayload);
        if (orderError) throw new Error(orderError.message || JSON.stringify(orderError));

        router.back();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear el pedido');
      } finally {
        setLoading(false);
      }
    },
  });

  return (
    <View className="flex-1 bg-background-dark">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 gap-6 pb-32"
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl">
            <Text className="text-red-500 text-sm font-medium">{error}</Text>
          </View>
        )}

        {/* ── Pickup in store toggle ── */}
        <View className="bg-surface-dark p-4 rounded-3xl border border-border-dark">
          <TouchableOpacity
            onPress={() => setPickupInStore((v) => !v)}
            activeOpacity={0.7}
            className={`flex-row items-center justify-between px-4 py-3 rounded-2xl border ${
              pickupInStore
                ? 'bg-blue-500/20 border-blue-500/40'
                : 'bg-background-dark border-border-dark'
            }`}
          >
            <View className="flex-row items-center gap-2">
              <Store size={16} color={pickupInStore ? '#93c5fd' : '#64748b'} />
              <Text className={`font-bold text-sm ${pickupInStore ? 'text-blue-300' : 'text-text-muted'}`}>
                Retira del local
              </Text>
            </View>
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                pickupInStore ? 'bg-blue-500 border-blue-500' : 'border-border-dark'
              }`}
            >
              {pickupInStore && <CheckCircle2 size={12} color="white" />}
            </View>
          </TouchableOpacity>
          {pickupInStore && (
            <Text className="text-xs text-blue-400/70 mt-2 ml-1">
              No se requiere dirección ni ubicación GPS.
            </Text>
          )}
        </View>

        {/* ── Customer Details ── */}
        <View className="bg-surface-dark p-5 rounded-3xl border border-border-dark gap-4">
          <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
            Datos del Cliente
          </Text>

          <View>
            <Text className="text-xs font-medium text-text-muted mb-1.5 ml-1">
              Nombre Completo
            </Text>
            <TextInput
              onChangeText={formik.handleChange('customer_name')}
              onBlur={formik.handleBlur('customer_name')}
              value={formik.values.customer_name}
              className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3.5"
              placeholder="Ej. Juan Pérez"
              placeholderTextColor="#475569"
              autoCapitalize="words"
            />
          </View>

          {!pickupInStore && (
            <>
              <View>
                <Text className="text-xs font-medium text-text-muted mb-1.5 ml-1">
                  Dirección Física
                </Text>
                <TextInput
                  onChangeText={formik.handleChange('address_text')}
                  onBlur={formik.handleBlur('address_text')}
                  value={formik.values.address_text}
                  className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 ${
                    formik.errors.address_text && formik.touched.address_text
                      ? 'border-red-500/50'
                      : 'border-border-dark'
                  }`}
                  placeholder="Calle Falsa 123"
                  placeholderTextColor="#475569"
                />
                {formik.errors.address_text && formik.touched.address_text && (
                  <Text className="text-xs text-red-500 mt-1.5 ml-1">
                    {formik.errors.address_text}
                  </Text>
                )}
              </View>

              <View>
                <View className="flex-row items-center gap-1.5 mb-1.5 ml-1">
                  <MapPin size={14} color="#64748b" />
                  <Text className="text-xs font-medium text-text-muted">
                    Link de Google Maps / WhatsApp
                  </Text>
                </View>
                <TextInput
                  onChangeText={formik.handleChange('location_url')}
                  onBlur={formik.handleBlur('location_url')}
                  value={formik.values.location_url}
                  className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 text-sm ${
                    formik.errors.location_url && formik.touched.location_url
                      ? 'border-red-500/50'
                      : 'border-border-dark'
                  }`}
                  placeholder="https://maps.app.goo.gl/..."
                  placeholderTextColor="#475569"
                  autoCapitalize="none"
                  keyboardType="url"
                />
                {formik.errors.location_url && formik.touched.location_url ? (
                  <View className="flex-row items-center gap-1 mt-1.5 ml-1">
                    <XCircle size={12} color="#ef4444" />
                    <Text className="text-xs text-red-500">{formik.errors.location_url}</Text>
                  </View>
                ) : formik.values.location_url && !formik.errors.location_url ? (
                  <View className="flex-row items-center gap-1 mt-2 ml-1">
                    <CheckCircle2 size={12} color="#22c55e" />
                    <Text className="text-xs text-green-500">
                      Link válido{' '}
                      {formik.values.location_url.includes('goo.gl')
                        ? '(se expandirá)'
                        : '(coordenadas ok)'}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View>
                <View className="flex-row items-center gap-1.5 mb-1.5 ml-1">
                  <Info size={14} color="#64748b" />
                  <Text className="text-xs font-medium text-text-muted">
                    Indicaciones de entrega
                  </Text>
                </View>
                <TextInput
                  onChangeText={formik.handleChange('indicaciones')}
                  value={formik.values.indicaciones}
                  className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3.5"
                  placeholder="Ej: Casa rejas negras, frente al hospital"
                  placeholderTextColor="#475569"
                />
              </View>
            </>
          )}
        </View>

        {/* ── Product Selector ── */}
        <View className="bg-surface-dark p-5 rounded-3xl border border-border-dark gap-4">
          <View className="flex-row items-center gap-2">
            <Tag size={16} color="#94a3b8" />
            <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Agregar Productos
            </Text>
          </View>

          {loadingData ? (
            <View className="items-center py-4">
              <ActivityIndicator size="small" color="#f97316" />
              <Text className="text-sm text-text-muted mt-2">Cargando menú...</Text>
            </View>
          ) : products.length === 0 ? (
            <Text className="text-sm text-text-muted text-center py-4">
              No hay productos disponibles.
            </Text>
          ) : (
            <View className="gap-3">
              {categories.map((cat) => {
                const catProducts = products.filter((p) => p.category_id === cat.id);
                if (catProducts.length === 0) return null;
                const isExpanded = categories.length === 1 ? true : !!expandedCategories[cat.id];
                const isAgregados = cat.name === 'Agregados';

                return (
                  <View
                    key={`cat-${cat.id}`}
                    className={`border rounded-2xl overflow-hidden bg-background-dark ${
                      isAgregados ? 'border-yellow-500/25' : 'border-border-dark'
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => toggleCategory(cat.id)}
                      activeOpacity={0.7}
                      className={`flex-row items-center justify-between p-4 ${
                        isAgregados ? 'bg-yellow-500/5' : 'bg-surface-dark/50'
                      }`}
                    >
                      <Text
                        className={`font-bold text-base ${
                          isAgregados ? 'text-yellow-300' : 'text-white'
                        }`}
                      >
                        {cat.name}
                      </Text>
                      <View className="flex-row items-center gap-2">
                        <Text className="text-text-muted text-xs">{catProducts.length}</Text>
                        {isExpanded ? (
                          <ChevronUp size={16} color="#64748b" />
                        ) : (
                          <ChevronDown size={16} color="#64748b" />
                        )}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View className="p-3 gap-2">
                        {catProducts.map((prod) => {
                          const qty = unitCountForProduct(prod.id);
                          const stockLeft = prod.stock !== null ? prod.stock - qty : null;
                          return (
                            <View
                              key={prod.id}
                              className={`flex-row items-center justify-between p-3 rounded-xl border ${
                                qty > 0
                                  ? isAgregados
                                    ? 'bg-yellow-500/10 border-yellow-500/30'
                                    : 'bg-primary/10 border-primary/40'
                                  : 'bg-background-dark border-border-dark'
                              }`}
                            >
                              <View className="flex-1 mr-3">
                                <Text className="font-semibold text-white text-sm">{prod.name}</Text>
                                <View className="flex-row items-center gap-2 mt-0.5">
                                  <Text className="text-text-secondary text-xs">${prod.price}</Text>
                                  {stockLeft !== null && (
                                    <View className="bg-background-dark border border-border-dark px-1.5 rounded">
                                      <Text className="text-[10px] text-text-muted">
                                        Quedan: {stockLeft}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                              <View className="flex-row items-center gap-2">
                                {qty > 0 && (
                                  <Text
                                    className={`text-sm font-black ${
                                      isAgregados ? 'text-yellow-300' : 'text-primary'
                                    }`}
                                  >
                                    ×{qty}
                                  </Text>
                                )}
                                <TouchableOpacity
                                  onPress={() => addUnit(prod)}
                                  disabled={stockLeft !== null && stockLeft <= 0}
                                  activeOpacity={0.7}
                                  className={`w-8 h-8 rounded-full items-center justify-center ${
                                    qty > 0
                                      ? isAgregados
                                        ? 'bg-yellow-500'
                                        : 'bg-primary'
                                      : 'bg-surface-dark border border-border-dark'
                                  } ${stockLeft !== null && stockLeft <= 0 ? 'opacity-30' : ''}`}
                                >
                                  <Plus size={16} color={qty > 0 ? 'white' : '#94a3b8'} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Cart Summary ── */}
        {cart.length > 0 && (
          <View className="bg-surface-dark p-5 rounded-3xl border border-border-dark gap-3">
            <View className="flex-row items-center gap-2">
              <ShoppingCart size={16} color="#94a3b8" />
              <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                Pedido actual ({cart.length} unidades)
              </Text>
            </View>

            {cart.map((unit) => (
              <View
                key={unit.instanceId}
                className="bg-background-dark border border-border-dark rounded-2xl overflow-hidden"
              >
                {/* Unit header */}
                <View className="flex-row items-center justify-between px-4 py-3">
                  <View className="flex-1 mr-3">
                    <Text className="font-bold text-white text-sm">{unit.name}</Text>
                    <Text className="text-primary text-xs">${unit.price}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {agregadosProducts.length > 0 && (
                      <TouchableOpacity
                        onPress={() =>
                          setOpenExtraFor(openExtraFor === unit.instanceId ? null : unit.instanceId)
                        }
                        activeOpacity={0.7}
                        className={`flex-row items-center gap-1 px-2.5 py-1.5 rounded-lg border ${
                          openExtraFor === unit.instanceId
                            ? 'bg-yellow-500/20 border-yellow-500/40'
                            : 'bg-surface-dark border-border-dark'
                        }`}
                      >
                        <Plus
                          size={12}
                          color={openExtraFor === unit.instanceId ? '#facc15' : '#64748b'}
                        />
                        <Text
                          className={`text-xs font-bold ${
                            openExtraFor === unit.instanceId ? 'text-yellow-400' : 'text-text-muted'
                          }`}
                        >
                          Extra
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => removeUnit(unit.instanceId)}
                      activeOpacity={0.7}
                      className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/25 items-center justify-center"
                    >
                      <Trash2 size={14} color="#f87171" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Extras already attached */}
                {unit.extras.length > 0 && (
                  <View className="px-4 pb-2 gap-1">
                    {unit.extras.map((extra) => (
                      <View
                        key={extra.product_id}
                        className="flex-row items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-1.5"
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="text-yellow-400 text-xs">↳</Text>
                          <Text className="text-yellow-200 text-xs font-semibold">{extra.name}</Text>
                          <Text className="text-yellow-500/60 text-[10px]">+${extra.price}</Text>
                        </View>
                        <View className="flex-row items-center gap-1.5">
                          <TouchableOpacity
                            onPress={() => removeExtra(unit.instanceId, extra.product_id)}
                            className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 items-center justify-center"
                          >
                            <Minus size={10} color="#facc15" />
                          </TouchableOpacity>
                          <Text className="text-yellow-300 font-black text-xs w-3 text-center">
                            {extra.quantity}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              addExtra(
                                unit.instanceId,
                                products.find((p) => p.id === extra.product_id)!,
                              )
                            }
                            className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 items-center justify-center"
                          >
                            <Plus size={10} color="#facc15" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Extra selector */}
                {openExtraFor === unit.instanceId && (
                  <View className="border-t border-yellow-500/20 bg-yellow-500/5 px-4 py-3 gap-2">
                    <Text className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                      Extras para &ldquo;{unit.name}&rdquo;
                    </Text>
                    {agregadosProducts.map((extra) => {
                      const existingQty =
                        unit.extras.find((e) => e.product_id === extra.id)?.quantity || 0;
                      return (
                        <View key={extra.id} className="flex-row items-center justify-between">
                          <View>
                            <Text className="text-white text-xs font-semibold">{extra.name}</Text>
                            <Text className="text-text-muted text-[10px]">+${extra.price}</Text>
                          </View>
                          <View className="flex-row items-center gap-2">
                            {existingQty > 0 && (
                              <>
                                <TouchableOpacity
                                  onPress={() => removeExtra(unit.instanceId, extra.id)}
                                  className="w-6 h-6 rounded-full bg-background-dark border border-border-dark items-center justify-center"
                                >
                                  <Minus size={12} color="#94a3b8" />
                                </TouchableOpacity>
                                <Text className="font-black text-white text-sm w-4 text-center">
                                  {existingQty}
                                </Text>
                              </>
                            )}
                            <TouchableOpacity
                              onPress={() => addExtra(unit.instanceId, extra)}
                              className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 items-center justify-center"
                            >
                              <Plus size={12} color="#facc15" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Notes ── */}
        <View className="bg-surface-dark p-5 rounded-3xl border border-border-dark gap-3">
          <View className="flex-row items-center gap-2">
            <StickyNote size={16} color="#94a3b8" />
            <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Notas del Pedido
            </Text>
          </View>
          <TextInput
            onChangeText={formik.handleChange('notes')}
            value={formik.values.notes}
            numberOfLines={3}
            multiline
            textAlignVertical="top"
            className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
            placeholder="Ej: Sin aderezos, sin cebolla, extra queso..."
            placeholderTextColor="#475569"
            style={{ minHeight: 80 }}
          />
        </View>

        {/* ── Payment & Submit ── */}
        <View className="bg-surface-dark p-5 rounded-3xl border border-border-dark gap-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="font-bold text-white">Estado del Pago</Text>
              <Text className="text-xs text-text-muted">¿El cliente ya abonó el pedido?</Text>
            </View>
            <Switch
              value={formik.values.is_paid}
              onValueChange={(value) => { void formik.setFieldValue('is_paid', value); }}
              trackColor={{ false: '#111418', true: '#f97316' }}
              thumbColor="white"
            />
          </View>

          <View className="border-t border-border-dark pt-4 flex-row items-end justify-between">
            <Text className="text-text-secondary font-medium">Total</Text>
            <Text className="text-3xl font-black text-white tracking-tighter">${getTotal()}</Text>
          </View>

          <TouchableOpacity
            onPress={() => formik.handleSubmit()}
            disabled={loading || expandingCoords || cart.length === 0}
            activeOpacity={0.8}
            className={`w-full bg-primary rounded-2xl py-4 flex-row items-center justify-center gap-2 ${
              loading || expandingCoords || cart.length === 0 ? 'opacity-50' : ''
            }`}
            style={{
              shadowColor: '#f97316',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {loading || expandingCoords ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <CheckCircle2 size={20} color="white" />
                <Text className="text-white font-bold text-base">Confirmar Pedido</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
