import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse, BookingsResponse, ProfileResponse } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.0.2.2:3000/api' : '');
if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL debe configurarse para compilaciones de producción');
const TOKEN_KEY = 'professional_auth_token';

const client = axios.create({ baseURL: API_URL, timeout: 15000 });

client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const getApiError = (error: unknown) => {
  if (error instanceof AxiosError) {
    return error.response?.data?.error || error.response?.data?.message || 'No se pudo conectar con el servidor';
  }
  return 'Ha ocurrido un error inesperado';
};

export const api = {
  tokenKey: TOKEN_KEY,
  async login(email: string, password: string) {
    const { data } = await client.post<AuthResponse>('/auth/login', { email, password });
    if (data.user.role !== 'PROFESSIONAL') throw new Error('Esta cuenta no pertenece a un profesional');
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    return data;
  },
  async profile() {
    const { data } = await client.get<ProfileResponse>('/auth/profile');
    return data;
  },
  async bookings(limit = 50) {
    const { data } = await client.get<BookingsResponse>('/bookings/professional/my-bookings', { params: { limit } });
    return data;
  },
  async confirmBooking(id: string) { return (await client.post(`/bookings/${id}/confirm`)).data; },
  async completeBooking(id: string) { return (await client.post(`/bookings/${id}/complete`)).data; },
  async cancelBooking(id: string) { return (await client.post(`/bookings/${id}/cancel`)).data; },
};
