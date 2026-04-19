import { create } from 'zustand';
import { supabase } from '@/src/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '@/src/shared/types/user';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  
  // Actions
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: UserProfile | null) => void;
  setUserSession: (user: User | null, session: Session | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,

  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setUserSession: (user, session) => set({ user, session }),

  init: async () => {
    try {
      // Fetch initial session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', userId)
          .maybeSingle();

        if (!error && data) {
          get().setProfile(data as UserProfile);
        }
      };

      if (currentSession?.user) {
        get().setUserSession(currentSession.user, currentSession);
        await fetchProfile(currentSession.user.id);
      }

      // Setup auth listener
      supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (newSession?.user) {
          get().setUserSession(newSession.user, newSession);
          await fetchProfile(newSession.user.id);
        } else {
          get().setUserSession(null, null);
          get().setProfile(null);
        }
        get().setLoading(false);
      });

    } catch (err) {
      console.error('Error getting session:', err);
    } finally {
      get().setLoading(false);
    }
  },

  signIn: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Error al iniciar sesión' };
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    get().setUserSession(null, null);
    get().setProfile(null);
  },

  refreshProfile: async () => {
    const user = get().user;
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!error && data) {
        get().setProfile(data as UserProfile);
      }
    }
  }
}));

export const hasRole = (profile: UserProfile | null, allowedRoles: UserRole[]): boolean => {
  if (!profile) return false;
  return allowedRoles.includes(profile.role);
};
