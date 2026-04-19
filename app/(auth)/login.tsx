import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Zap, ArrowRight } from 'lucide-react-native';
import { useAuthStore } from '@/src/store/useAuthStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Por favor, completa todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    const { error: signInError } = await signIn(email.trim(), password);

    if (signInError) {
      setError(signInError);
    }
    // Navigation is handled by AuthNavigationGuard in _layout.tsx

    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-background-dark"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-6"
      >
        <View className="w-full max-w-sm self-center bg-surface-dark border border-border-dark rounded-2xl p-8 overflow-hidden">
          {/* Decorative icon */}
          <View className="absolute top-4 right-4 opacity-10">
            <Zap size={64} color="white" />
          </View>

          {/* Title */}
          <Text className="text-3xl font-black text-white mb-2 text-center tracking-tight">
            Comanda<Text className="text-primary">Flash</Text>
          </Text>
          <Text className="text-text-secondary text-sm text-center mb-8">
            Ingresa tus credenciales para continuar
          </Text>

          {/* Error message */}
          {error ? (
            <View className="mb-4 bg-red-500/10 border border-red-500/50 rounded-xl p-3">
              <Text className="text-red-500 text-sm font-medium text-center">{error}</Text>
            </View>
          ) : null}

          {/* Email */}
          <View className="mb-4">
            <Text className="text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
              Correo Electrónico
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              placeholder="tu@correo.com"
              placeholderTextColor="#475569"
              className="w-full bg-background-dark border border-border-dark text-white rounded-xl p-3 text-base"
            />
          </View>

          {/* Password */}
          <View className="mb-4">
            <Text className="text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
              Contraseña
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor="#475569"
              className="w-full bg-background-dark border border-border-dark text-white rounded-xl p-3 text-base"
            />
          </View>

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            className={`w-full bg-primary rounded-xl py-4 mt-2 flex-row items-center justify-center gap-2 ${
              loading ? 'opacity-70' : ''
            }`}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Text className="text-white font-bold text-base">Ingresar</Text>
                <ArrowRight size={20} color="white" />
              </>
            )}
          </TouchableOpacity>

          {/* Footer hint */}
          <View className="mt-8 pt-6 border-t border-border-dark/50">
            <Text className="text-xs text-text-muted text-center">
              Usa las cuentas definidas en el panel de Supabase.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
