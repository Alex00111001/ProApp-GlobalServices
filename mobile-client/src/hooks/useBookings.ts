import { useState, useCallback } from 'react';
import { apiClient } from '@/services/api';
import { Booking, BookingStatus } from '@/types';

interface UseBookingsResult {
  bookings: Booking[];
  activeBooking: Booking | null;
  isLoading: boolean;
  error: string | null;
  fetchBookings: () => Promise<void>;
  createBooking: (data: CreateBookingData) => Promise<Booking | null>;
  cancelBooking: (id: string) => Promise<boolean>;
  confirmBooking: (id: string) => Promise<boolean>;
  completeBooking: (id: string, rating?: number, comment?: string) => Promise<boolean>;
  setActiveBooking: (booking: Booking | null) => void;
}

interface CreateBookingData {
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
}

export const useBookings = (): UseBookingsResult => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMyBookings();
      setBookings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bookings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createBooking = useCallback(async (data: CreateBookingData): Promise<Booking | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const booking = await apiClient.createBooking(data);
      setBookings((prev) => [booking, ...prev]);
      setActiveBooking(booking);
      return booking;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cancelBooking = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.cancelBooking(id);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: 'CANCELLED' as BookingStatus } : b
        )
      );
      if (activeBooking?.id === id) {
        setActiveBooking({ ...activeBooking, status: 'CANCELLED' as BookingStatus });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel booking');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeBooking]);

  const confirmBooking = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.confirmBooking(id);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: 'CONFIRMED' as BookingStatus } : b
        )
      );
      if (activeBooking?.id === id) {
        setActiveBooking({ ...activeBooking, status: 'CONFIRMED' as BookingStatus });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm booking');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeBooking]);

  const completeBooking = useCallback(async (id: string, rating?: number, comment?: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.completeBooking(id, rating, comment);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: 'COMPLETED' as BookingStatus } : b
        )
      );
      if (activeBooking?.id === id) {
        setActiveBooking({ ...activeBooking, status: 'COMPLETED' as BookingStatus });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete booking');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [activeBooking]);

  return {
    bookings,
    activeBooking,
    isLoading,
    error,
    fetchBookings,
    createBooking,
    cancelBooking,
    confirmBooking,
    completeBooking,
    setActiveBooking,
  };
};
