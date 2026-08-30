import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AuthResponse } from '@/types';
import Constants from 'expo-constants';

// Expo requiere el prefijo EXPO_PUBLIC_ para las variables de entorno en el bundle
// Para desarrollo en Android, 'localhost' no funciona, se debe usar la IP de la máquina o 10.0.2.2
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/api';

class ApiClient {
  private client: AxiosInstance;

  private normalizeCategory(category: any) {
    return {
      ...category,
      icon: category.icon ?? category.iconUrl,
    };
  }

  private normalizeProfessional(professional: any) {
    return {
      ...professional,
      hourlyRate:
        professional.hourlyRate == null
          ? undefined
          : Number(professional.hourlyRate),
      rating: professional.rating ?? professional.averageRating ?? 0,
      totalJobs: professional.totalJobs ?? professional.totalBookings ?? 0,
      isVerified: professional.isVerified ?? Boolean(professional.verifiedAt),
      isApproved:
        professional.isApproved ?? professional.status === 'APPROVED',
      user: {
        ...professional.user,
        name:
          professional.user?.name ??
          [professional.user?.firstName, professional.user?.lastName]
            .filter(Boolean)
            .join(' '),
        avatar: professional.user?.avatar ?? professional.user?.avatarUrl,
      },
      categories: (professional.categories ?? []).map((item: any) =>
        this.normalizeCategory(item.category ?? item)
      ),
    };
  }

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor - Add auth token
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await SecureStore.getItemAsync('auth_token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: AxiosError) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          await SecureStore.deleteItemAsync('auth_token');
          await SecureStore.deleteItemAsync('user_data');
          // Navigate to login screen (this should be handled by the app)
          console.log('Session expired, please login again');
        }
        return Promise.reject(this.handleError(error));
      }
    );
  }

  private handleError(error: AxiosError): Error {
    if (error.response) {
      const data = error.response.data as { message?: string };
      return new Error(data.message || 'An error occurred');
    } else if (error.request) {
      return new Error('No response from server. Please check your connection.');
    } else {
      return new Error(error.message || 'An unexpected error occurred');
    }
  }

  // Public methods (no auth required)
  async login(email: string, password: string) {
    const response = await this.client.post<AuthResponse>('/auth/login', {
      email,
      password,
    });
    await SecureStore.setItemAsync('auth_token', response.data.token);
    await SecureStore.setItemAsync('user_data', JSON.stringify(response.data));
    return response.data;
  }

  async register(data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    role: 'CLIENT' | 'PROFESSIONAL';
  }) {
    const [firstName, ...lastNameParts] = data.name.trim().split(/\s+/);
    const response = await this.client.post<AuthResponse>('/auth/register', {
      email: data.email,
      password: data.password,
      phone: data.phone,
      role: data.role,
      firstName,
      lastName: lastNameParts.join(' ') || '-',
    });
    await SecureStore.setItemAsync('auth_token', response.data.token);
    await SecureStore.setItemAsync('user_data', JSON.stringify(response.data));
    return response.data;
  }

  // Authenticated methods
  async getProfile() {
    const response = await this.client.get<AuthResponse>('/auth/profile');
    return response.data;
  }

  async updateProfile(data: Record<string, unknown>) {
    const response = await this.client.put<AuthResponse>('/auth/profile', data);
    await SecureStore.setItemAsync('user_data', JSON.stringify(response.data));
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  async logout() {
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('user_data');
  }

  // Categories
  async getCategories() {
    const response = await this.client.get('/categories');
    return response.data.categories.map((category: any) =>
      this.normalizeCategory(category)
    );
  }

  async getCategoryById(id: string) {
    const response = await this.client.get(`/categories/${id}`);
    return this.normalizeCategory(response.data.category);
  }

  // Professionals
  async getProfessionals(params?: {
    categoryId?: string;
    subcategoryId?: string;
    city?: string;
    minRating?: number;
    page?: number;
    limit?: number;
  }) {
    const response = await this.client.get('/professionals', { params });
    return response.data.professionals.map((professional: any) =>
      this.normalizeProfessional(professional)
    );
  }

  async getProfessionalById(id: string) {
    const response = await this.client.get(`/professionals/${id}`);
    return this.normalizeProfessional(response.data.professional);
  }

  // Bookings
  async createBooking(data: {
    professionalId: string;
    services: { serviceId: string; quantity: number }[];
    scheduledDate: string;
    scheduledTime: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    notes?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const scheduledDate = new Date(data.scheduledDate);
    const [hours, minutes] = data.scheduledTime.split(':').map(Number);
    if (!Number.isNaN(scheduledDate.getTime()) && Number.isInteger(hours) && Number.isInteger(minutes)) {
      scheduledDate.setHours(hours, minutes, 0, 0);
    }
    const response = await this.client.post('/bookings', {
      professionalId: data.professionalId,
      services: data.services,
      scheduledDate: scheduledDate.toISOString(),
      address: data.address,
      city: data.city,
      state: data.state,
      postalCode: data.zipCode,
      notes: data.notes,
      latitude: data.latitude,
      longitude: data.longitude,
    });
    return response.data.booking;
  }

  async getMyBookings() {
    const response = await this.client.get('/bookings/client/my-bookings');
    return response.data.bookings;
  }

  async getBookingById(id: string) {
    const response = await this.client.get(`/bookings/${id}`);
    return response.data.booking;
  }

  async cancelBooking(id: string) {
    const response = await this.client.post(`/bookings/${id}/cancel`);
    return response.data;
  }

  async confirmBooking(id: string) {
    const response = await this.client.post(`/bookings/${id}/confirm`);
    return response.data;
  }

  async completeBooking(id: string, rating?: number, comment?: string) {
    const response = await this.client.post(`/bookings/${id}/complete`, {
      rating,
      comment,
    });
    return response.data;
  }

  // Payments
  async createPaymentIntent(bookingId: string) {
    const response = await this.client.post('/payments/create-intent', {
      bookingId,
    });
    return response.data;
  }

  async confirmPayment(bookingId: string, paymentIntentId: string) {
    const response = await this.client.post('/payments/confirm', {
      bookingId,
      paymentIntentId,
    });
    return response.data;
  }

  async confirmCashPayment(bookingId: string) {
    const response = await this.client.post('/payments/cash', { bookingId });
    return response.data;
  }

  // Notifications
  async getNotifications() {
    const response = await this.client.get('/notifications');
    return response.data;
  }

  async markNotificationAsRead(id: string) {
    const response = await this.client.patch(`/notifications/${id}/read`);
    return response.data;
  }

  async markAllNotificationsAsRead() {
    const response = await this.client.patch('/notifications/read-all');
    return response.data;
  }

  // Favorites
  async toggleFavorite(professionalId: string) {
    const response = await this.client.post('/favorites/toggle', { professionalId });
    return response.data;
  }

  async getFavorites() {
    const response = await this.client.get('/favorites');
    return response.data;
  }

  // Get axios instance for custom requests
  getClient() {
    return this.client;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
