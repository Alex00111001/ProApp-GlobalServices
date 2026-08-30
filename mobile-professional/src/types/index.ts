export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProfessionalProfile {
  id: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  bio?: string;
  rating?: number | string;
  totalEarnings?: number | string;
  verifiedAt?: string;
  documents?: Array<{ id: string; type: string; status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' }>;
  certifications?: Array<{ id: string; name: string; verified: boolean }>;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';
  professionalProfile?: ProfessionalProfile;
}

export interface AuthResponse { token: string; user: User }
export interface ProfileResponse { user: User; profile: ProfessionalProfile }

export interface Booking {
  id: string;
  status: BookingStatus;
  scheduledDate: string;
  address: string;
  city: string;
  totalPrice: number | string;
  professionalEarnings: number | string;
  client: { user: { firstName: string; lastName: string; phone?: string } };
  bookingServices: Array<{
    id: string;
    quantity: number;
    service: { id: string; name: string; description?: string };
  }>;
}

export interface BookingsResponse {
  bookings: Booking[];
  pagination: { currentPage: number; totalPages: number; totalItems: number };
}
