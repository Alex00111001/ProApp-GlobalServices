export type UserRole = 'CLIENT' | 'PROFESSIONAL' | 'ADMIN';

export type BookingStatus = 
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientProfile {
  id: string;
  userId: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  user: User;
}

export interface ProfessionalProfile {
  id: string;
  userId: string;
  bio?: string;
  hourlyRate?: number;
  yearsOfExperience?: number;
  serviceRadius?: number;
  rating: number;
  totalReviews: number;
  totalJobs: number;
  isVerified: boolean;
  isApproved: boolean;
  user: User;
  categories: Category[];
  portfolio: Portfolio[];
  certifications: Certification[];
  availability: ProfessionalAvailability[];
}

export interface Category {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  subcategories: Subcategory[];
}

export interface Subcategory {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  basePrice?: number;
  isActive: boolean;
  services: Service[];
}

export interface Service {
  id: string;
  subcategoryId: string;
  name: string;
  description?: string;
  price?: number;
  duration?: number;
  isActive: boolean;
}

export interface Booking {
  id: string;
  clientId: string;
  professionalId: string;
  status: BookingStatus;
  scheduledDate: string;
  scheduledTime: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  totalPrice: number;
  services: BookingService[];
  client: ClientProfile;
  professional: ProfessionalProfile;
  payment?: Payment;
  review?: Review;
  createdAt: string;
  updatedAt: string;
}

export interface BookingService {
  id: string;
  bookingId: string;
  serviceId: string;
  quantity: number;
  price: number;
  service: Service;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: 'STRIPE' | 'PAYPAL' | 'CASH';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  transactionId?: string;
  paidAt?: string;
  booking: Booking;
}

export interface Review {
  id: string;
  bookingId: string;
  clientId: string;
  professionalId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface Portfolio {
  id: string;
  professionalId: string;
  imageUrl: string;
  caption?: string;
  createdAt: string;
}

export interface Certification {
  id: string;
  professionalId: string;
  name: string;
  issuingOrganization: string;
  issueDate: string;
  expiryDate?: string;
  certificateUrl: string;
}

export interface ProfessionalAvailability {
  id: string;
  professionalId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'BOOKING' | 'PAYMENT' | 'REVIEW' | 'SYSTEM';
  isRead: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  profile: ClientProfile | ProfessionalProfile;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: UserRole;
}
