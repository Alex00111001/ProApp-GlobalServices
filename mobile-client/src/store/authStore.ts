import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/services/api';
import { User, ClientProfile, AuthResponse } from '@/types';

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  profile: ClientProfile | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    role: 'CLIENT' | 'PROFESSIONAL';
  }) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  updateProfile: (data: Partial<ClientProfile>) => Promise<void>;
  clearError: () => void;
}

const secureStorage = {
  setItem: async (key: string, value: string) => {
    await SecureStore.setItemAsync(key, value);
  },
  getItem: async (key: string) => {
    return await SecureStore.getItemAsync(key);
  },
  removeItem: async (key: string) => {
    await SecureStore.deleteItemAsync(key);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      profile: null,
      token: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.login(email, password);
          set({
            isAuthenticated: true,
            user: response.user,
            profile: response.profile as ClientProfile,
            token: response.token,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Login failed',
          });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.register(data);
          set({
            isAuthenticated: true,
            user: response.user,
            profile: response.profile as ClientProfile,
            token: response.token,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Registration failed',
          });
          throw error;
        }
      },

      logout: async () => {
        await apiClient.logout();
        set({
          isAuthenticated: false,
          user: null,
          profile: null,
          token: null,
          error: null,
        });
      },

      loadUser: async () => {
        const token = await SecureStore.getItemAsync('auth_token');
        if (!token) {
          set({ isAuthenticated: false, isLoading: false });
          return;
        }

        set({ isLoading: true });
        try {
          const response = await apiClient.getProfile();
          set({
            isAuthenticated: true,
            user: response.user,
            profile: response.profile as ClientProfile,
            token: response.token,
            isLoading: false,
          });
        } catch (error) {
          set({
            isAuthenticated: false,
            user: null,
            profile: null,
            token: null,
            isLoading: false,
          });
          await apiClient.logout();
        }
      },

      updateProfile: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiClient.updateProfile(data);
          set({
            profile: response.profile as ClientProfile,
            user: response.user,
            isLoading: false,
          });
        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Update failed',
          });
          throw error;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        token: state.token,
      }),
    }
  )
);
