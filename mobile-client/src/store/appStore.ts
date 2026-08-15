import { create } from 'zustand';
import { apiClient } from '@/services/api';
import { Category, ProfessionalProfile, Booking, Notification } from '@/types';

interface AppState {
  // Categories
  categories: Category[];
  isLoadingCategories: boolean;
  
  // Professionals
  professionals: ProfessionalProfile[];
  selectedProfessional: ProfessionalProfile | null;
  isLoadingProfessionals: boolean;
  
  // Bookings
  bookings: Booking[];
  activeBooking: Booking | null;
  isLoadingBookings: boolean;
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  
  // Actions
  fetchCategories: () => Promise<void>;
  fetchProfessionals: (params?: any) => Promise<void>;
  fetchProfessionalById: (id: string) => Promise<void>;
  setSelectedProfessional: (professional: ProfessionalProfile | null) => void;
  fetchBookings: () => Promise<void>;
  setActiveBooking: (booking: Booking | null) => void;
  addBooking: (booking: Booking) => void;
  updateBooking: (booking: Booking) => void;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  clearUnreadCount: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  categories: [],
  isLoadingCategories: false,
  
  professionals: [],
  selectedProfessional: null,
  isLoadingProfessionals: false,
  
  bookings: [],
  activeBooking: null,
  isLoadingBookings: false,
  
  notifications: [],
  unreadCount: 0,

  // Categories actions
  fetchCategories: async () => {
    set({ isLoadingCategories: true });
    try {
      const data = await apiClient.getCategories();
      set({ categories: data, isLoadingCategories: false });
    } catch (error) {
      set({ isLoadingCategories: false });
      console.error('Error fetching categories:', error);
    }
  },

  // Professionals actions
  fetchProfessionals: async (params) => {
    set({ isLoadingProfessionals: true });
    try {
      const data = await apiClient.getProfessionals(params);
      set({ professionals: data, isLoadingProfessionals: false });
    } catch (error) {
      set({ isLoadingProfessionals: false });
      console.error('Error fetching professionals:', error);
    }
  },

  fetchProfessionalById: async (id: string) => {
    try {
      const data = await apiClient.getProfessionalById(id);
      set({ selectedProfessional: data });
    } catch (error) {
      console.error('Error fetching professional:', error);
    }
  },

  setSelectedProfessional: (professional) => {
    set({ selectedProfessional: professional });
  },

  // Bookings actions
  fetchBookings: async () => {
    set({ isLoadingBookings: true });
    try {
      const data = await apiClient.getMyBookings();
      set({ bookings: data, isLoadingBookings: false });
    } catch (error) {
      set({ isLoadingBookings: false });
      console.error('Error fetching bookings:', error);
    }
  },

  setActiveBooking: (booking) => {
    set({ activeBooking: booking });
  },

  addBooking: (booking) => {
    set((state) => ({
      bookings: [booking, ...state.bookings],
    }));
  },

  updateBooking: (updatedBooking) => {
    set((state) => ({
      bookings: state.bookings.map((b) =>
        b.id === updatedBooking.id ? updatedBooking : b
      ),
      activeBooking: state.activeBooking?.id === updatedBooking.id 
        ? updatedBooking 
        : state.activeBooking,
    }));
  },

  // Notifications actions
  fetchNotifications: async () => {
    try {
      const data = await apiClient.getNotifications();
      const unreadCount = data.filter((n: Notification) => !n.isRead).length;
      set({ notifications: data, unreadCount });
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  },

  markNotificationRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  clearUnreadCount: () => {
    set({ unreadCount: 0 });
  },

  // Reset store
  reset: () => {
    set({
      categories: [],
      isLoadingCategories: false,
      professionals: [],
      selectedProfessional: null,
      isLoadingProfessionals: false,
      bookings: [],
      activeBooking: null,
      isLoadingBookings: false,
      notifications: [],
      unreadCount: 0,
    });
  },
}));
