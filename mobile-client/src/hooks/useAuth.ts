import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';

export const useAuth = () => {
  const { 
    isAuthenticated, 
    user, 
    profile, 
    isLoading, 
    error,
    login, 
    register, 
    logout, 
    loadUser,
    updateProfile,
    clearError 
  } = useAuthStore();

  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      if (!isAuthenticated) {
        await loadUser();
      }
      setIsInitialized(true);
    };

    initializeAuth();
  }, []);

  return {
    isAuthenticated,
    isInitialized,
    user,
    profile,
    isLoading,
    error,
    login: useCallback(async (email: string, password: string) => {
      try {
        await login(email, password);
        return true;
      } catch (error) {
        return false;
      }
    }, [login]),
    register: useCallback(async (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone: string;
      role: 'CLIENT' | 'PROFESSIONAL';
      countryCode: 'ES' | 'BR' | 'CL';
      locale: 'es' | 'en' | 'pt';
      acceptTerms: true;
      acceptPrivacy: true;
      marketingConsent: boolean;
      termsVersion: '2026-08-30';
      privacyVersion: '2026-08-30';
    }) => {
      try {
        await register(data);
        return true;
      } catch (error) {
        return false;
      }
    }, [register]),
    logout: useCallback(async () => {
      await logout();
    }, [logout]),
    updateProfile: useCallback(async (data: any) => {
      try {
        await updateProfile(data);
        return true;
      } catch (error) {
        return false;
      }
    }, [updateProfile]),
    clearError: useCallback(() => {
      clearError();
    }, [clearError]),
  };
};
