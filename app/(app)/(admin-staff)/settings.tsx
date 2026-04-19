import { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store/useAuthStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  UserPlus,
  Trash2,
  Bike,
  ClipboardList,
  X,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react-native';
import type { UserRole } from '@/src/shared/types/user';

interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
}

const fetchProfiles = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['staff', 'delivery'])
    .order('role');
  if (error) throw new Error(error.message);
  return data || [];
};

const EMPTY_FORM = {
  full_name: '',
  email: '',
  password: '',
  role: 'staff' as 'staff' | 'delivery',
};

export default function SettingsScreen() {
  const { profile: currentProfile } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const insertAuditLog = async (action: string, entityType: 'product' | 'category' | 'user') => {
    if (!currentProfile) return;
    try {
      await supabase.from('audit_logs').insert({
        user_id: currentProfile.id,
        user_name: currentProfile.full_name,
        action,
        entity_type: entityType,
      });
    } catch {
      // Non-critical
    }
  };

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowPassword(false);
    setShowForm(false);
  };

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['settingsProfiles'],
    queryFn: fetchProfiles,
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { session: adminSession },
      } = await supabase.auth.getSession();
      if (!adminSession) throw new Error('No hay sesión activa de administrador');

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('No se pudo crear el usuario');

      const newUserId = data.user.id;

      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      });

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: newUserId,
        full_name: form.full_name,
        role: form.role,
      });

      if (profileError) throw profileError;
    },
    onSuccess: () => {
      insertAuditLog(`Creó usuario "${form.full_name}" con rol "${form.role}"`, 'user');
      queryClient.invalidateQueries({ queryKey: ['settingsProfiles'] });
      resetAndClose();
    },
    onError: (err: Error) => {
      setFormError(err.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from('orders').update({ delivery_id: null }).eq('delivery_id', userId);
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
    },
    onSuccess: (_data, userId) => {
      const deleted = profiles.find((p) => p.id === userId);
      if (deleted)
        insertAuditLog(`Eliminó usuario "${deleted.full_name}" (${deleted.role})`, 'user');
      queryClient.invalidateQueries({ queryKey: ['settingsProfiles'] });
    },
  });

  const handleCreate = () => {
    setFormError(null);
    if (!form.full_name.trim() || !form.email.trim() || !form.password) {
      setFormError('Todos los campos son obligatorios.');
      return;
    }
    if (form.password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    createUserMutation.mutate();
  };

  const staffUsers = profiles.filter((p) => p.role === 'staff');
  const deliveryUsers = profiles.filter((p) => p.role === 'delivery');

  return (
    <View className="flex-1 bg-background-dark">
      {/* Header */}
      <View className="bg-background-dark px-4 pt-4 pb-3 flex-row items-center justify-between border-b border-border-dark">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full items-center justify-center"
          >
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
              <Settings size={20} color="#f97316" />
            </View>
            <View>
              <Text className="text-xl font-black text-white tracking-tight">Configuración</Text>
              <Text className="text-xs text-text-muted mt-0.5">Gestión de usuarios</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => {
            setForm(EMPTY_FORM);
            setFormError(null);
            setShowForm(true);
          }}
          activeOpacity={0.8}
          className="bg-primary w-10 h-10 rounded-xl items-center justify-center"
        >
          <UserPlus size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pt-5 gap-6 pb-8">
        {/* Staff Section */}
        <View>
          <View className="flex-row items-center gap-2 mb-3">
            <ClipboardList size={16} color="#f97316" />
            <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Staff ({staffUsers.length})
            </Text>
          </View>
          {isLoading ? (
            <View className="items-center py-6">
              <ActivityIndicator size="small" color="#f97316" />
            </View>
          ) : staffUsers.length === 0 ? (
            <View className="items-center py-8 bg-surface-dark/50 rounded-2xl border border-dashed border-border-dark">
              <Text className="text-text-muted text-sm">No hay usuarios staff</Text>
            </View>
          ) : (
            <View className="gap-2">
              {staffUsers.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onDelete={() => {
                    Alert.alert(
                      'Eliminar usuario',
                      `¿Seguro que deseas eliminar a "${u.full_name}"?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar',
                          style: 'destructive',
                          onPress: () => deleteUserMutation.mutate(u.id),
                        },
                      ],
                    );
                  }}
                />
              ))}
            </View>
          )}
        </View>

        {/* Delivery Section */}
        <View>
          <View className="flex-row items-center gap-2 mb-3">
            <Bike size={16} color="#4ade80" />
            <Text className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Delivery ({deliveryUsers.length})
            </Text>
          </View>
          {deliveryUsers.length === 0 ? (
            <View className="items-center py-8 bg-surface-dark/50 rounded-2xl border border-dashed border-border-dark">
              <Text className="text-text-muted text-sm">No hay repartidores</Text>
            </View>
          ) : (
            <View className="gap-2">
              {deliveryUsers.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onDelete={() => {
                    Alert.alert(
                      'Eliminar usuario',
                      `¿Seguro que deseas eliminar a "${u.full_name}"?`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Eliminar',
                          style: 'destructive',
                          onPress: () => deleteUserMutation.mutate(u.id),
                        },
                      ],
                    );
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Create User Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={resetAndClose}>
        <Pressable className="flex-1 bg-black/80 justify-end" onPress={resetAndClose}>
          <Pressable className="bg-surface-dark rounded-t-3xl border-t border-border-dark">
            <View className="p-6 gap-4">
              <View className="flex-row justify-between items-center">
                <Text className="text-xl font-black text-white">Nuevo Usuario</Text>
                <TouchableOpacity
                  onPress={resetAndClose}
                  className="w-8 h-8 rounded-full bg-background-dark items-center justify-center"
                >
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {formError && (
                <View className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <Text className="text-red-400 text-sm">{formError}</Text>
                </View>
              )}

              {/* Role selector */}
              <View className="flex-row gap-2">
                {(['staff', 'delivery'] as const).map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setForm((f) => ({ ...f, role: r }))}
                    activeOpacity={0.7}
                    className={`flex-1 py-2.5 rounded-xl border items-center ${
                      form.role === r
                        ? 'bg-primary border-primary'
                        : 'bg-background-dark border-border-dark'
                    }`}
                  >
                    <Text
                      className={`text-sm font-bold ${
                        form.role === r ? 'text-white' : 'text-text-secondary'
                      }`}
                    >
                      {r === 'staff' ? '🍳 Staff' : '🚴 Delivery'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Form fields */}
              <TextInput
                placeholder="Nombre completo"
                placeholderTextColor="#475569"
                value={form.full_name}
                onChangeText={(text) => setForm((f) => ({ ...f, full_name: text }))}
                className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                autoCapitalize="words"
              />
              <TextInput
                placeholder="Email"
                placeholderTextColor="#475569"
                value={form.email}
                onChangeText={(text) => setForm((f) => ({ ...f, email: text }))}
                className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 text-sm"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <View>
                <TextInput
                  placeholder="Contraseña (mín. 6 caracteres)"
                  placeholderTextColor="#475569"
                  value={form.password}
                  onChangeText={(text) => setForm((f) => ({ ...f, password: text }))}
                  secureTextEntry={!showPassword}
                  className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 pr-11 text-sm"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-3"
                >
                  {showPassword ? (
                    <EyeOff size={16} color="#94a3b8" />
                  ) : (
                    <Eye size={16} color="#94a3b8" />
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleCreate}
                disabled={createUserMutation.isPending}
                activeOpacity={0.8}
                className={`w-full py-3.5 bg-primary rounded-2xl flex-row items-center justify-center gap-2 mt-2 ${
                  createUserMutation.isPending ? 'opacity-50' : ''
                }`}
              >
                {createUserMutation.isPending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <UserPlus size={16} color="white" />
                    <Text className="text-white font-bold">Crear Usuario</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── User Row ──────────────────────────────────────────────────────

function UserRow({ user, onDelete }: { user: Profile; onDelete: () => void }) {
  return (
    <View className="flex-row items-center gap-3 p-4 bg-surface-dark rounded-2xl border border-border-dark">
      <View className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 items-center justify-center">
        <Text className="text-sm font-black text-primary">
          {user.full_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="font-bold text-white text-sm" numberOfLines={1}>
          {user.full_name}
        </Text>
        <View
          className={`self-start mt-0.5 px-1.5 py-0.5 rounded-full ${
            user.role === 'delivery' ? 'bg-green-400/10' : 'bg-primary/10'
          }`}
        >
          <Text
            className={`text-[10px] font-bold uppercase tracking-wider ${
              user.role === 'delivery' ? 'text-green-400' : 'text-primary'
            }`}
          >
            {user.role}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        activeOpacity={0.7}
        className="w-8 h-8 rounded-lg items-center justify-center"
      >
        <Trash2 size={16} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );
}
