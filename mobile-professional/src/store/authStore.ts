import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { api, getApiError } from '@/services/api';
import type { ProfessionalProfile, User } from '@/types';

interface AuthState {
  user: User | null;
  profile: ProfessionalProfile | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  initialized: false,
  loading: false,
  error: null,
  restore: async () => {
    try {
      const token = await SecureStore.getItemAsync(api.tokenKey);
      if (!token) return set({ initialized: true });
      const { user, profile } = await api.profile();
      if (user.role !== 'PROFESSIONAL') throw new Error('Invalid role');
      set({ user, profile, initialized: true });
    } catch {
      await SecureStore.deleteItemAsync(api.tokenKey);
      set({ user: null, profile: null, initialized: true });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login(email.trim().toLowerCase(), password);
      const profileResponse = await api.profile();
      set({ user, profile: profileResponse.profile, loading: false });
    } catch (error) {
      await SecureStore.deleteItemAsync(api.tokenKey);
      const message = error instanceof Error && !('response' in error) ? error.message : getApiError(error);
      set({ loading: false, error: message });
      throw error;
    }
  },
  logout: async () => {
    await SecureStore.deleteItemAsync(api.tokenKey);
    set({ user: null, profile: null, error: null });
  },
}));

