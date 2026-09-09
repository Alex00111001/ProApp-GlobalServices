import axios, { AxiosError } from 'axios';
import * as SecureStore from 'expo-secure-store';
import type { AuthResponse, BookingsResponse, ProfileResponse } from '@/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? 'http://10.0.2.2:3000/api' : '');
if (!API_URL) throw new Error('EXPO_PUBLIC_API_URL debe configurarse para compilaciones de producción');
const TOKEN_KEY = 'professional_auth_token';

export type MarketSummary = { code: string; countryCode: string; status: 'ACTIVE'; currencyCode: string; defaultLocale: string; supportedLocales: string[]; capabilities: Record<string, boolean> };
export type RegistrationSchema = { market: MarketSummary; schemaVersion: string; locale: string; identityDocuments: Array<{ type: string; labelKey: string }>; geography: { levels: Array<{ type: string; level: number }> }; address: { fields: Array<{ key: string; required: boolean; maxLength: number }> } };
export type DivisionOption = { id: string; parentId: string | null; level: number; typeKey: string; canonicalCode: string; canonicalName: string };

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
  async consentPolicies(countryCode: string, locale: string) {
    return (await client.get('/v1/privacy/policies', { params: { countryCode, locale, purposes: 'marketing_attribution' } })).data as { policies: Array<{ id: string; key: string; purpose: string; version: number; documentReference: string }> };
  },
  async markets() { return (await client.get<{ items: MarketSummary[] }>('/v1/markets')).data; },
  async registrationSchema(marketCode: string) { return (await client.get<RegistrationSchema>(`/v1/markets/${marketCode}/registration-schema`, { params: { actorType: 'PROFESSIONAL' } })).data; },
  async divisions(marketCode: string, parentId?: string) { return (await client.get<{ items: DivisionOption[] }>(`/v1/markets/${marketCode}/divisions`, { params: { parentId, page: 1, limit: 100 } })).data; },
  async register(input: Record<string, unknown>) {
    const { data } = await client.post<AuthResponse>('/auth/register', input);
    if (data.user.role !== 'PROFESSIONAL') throw new Error('El registro no creó una cuenta profesional');
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    return data;
  },
  async consentHistory() { return (await client.get('/v1/privacy/consents/history', { params: { purpose: 'marketing_attribution', page: 1, limit: 100 } })).data; },
  async withdrawConsent() { return (await client.post('/v1/privacy/consents/withdrawals', {
    idempotencyKey: `professional-withdrawal:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    purpose: 'marketing_attribution', source: 'PROFESSIONAL_SETTINGS', evidence: { interaction: 'explicit_withdrawal_button' },
  })).data; },
  async referralPrograms() { return (await client.get('/v1/referrals/programs')).data; },
  async referralCodes() { return (await client.get('/v1/referrals/codes')).data; },
  async referrals(page = 1) { return (await client.get('/v1/referrals/me', { params: { page, limit: 50 } })).data; },
  async createReferralCode(programKey: string) { return (await client.post('/v1/referrals/codes', { programKey, idempotencyKey: `professional-code:${programKey}:${Date.now()}` })).data; },
  async claimReferral(code: string) { return (await client.post('/v1/referrals/claims', { code: code.trim().toUpperCase(), idempotencyKey: `professional-claim:${Date.now()}` })).data; },
  async serviceAreas() { return (await client.get('/v1/markets/me/professional-service-areas')).data; },
  async addServiceArea(input: { marketCode: string; schemaVersion: string; divisionId: string }) { return (await client.post('/v1/markets/me/professional-service-areas', input)).data; },
};
