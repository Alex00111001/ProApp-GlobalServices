import { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS } from './theme';

export { COLORS, SPACING, FONTS, SHADOWS, BORDER_RADIUS };

export const SCREENS = {
  AUTH: {
    LOGIN: 'Login',
    REGISTER: 'Register',
    FORGOT_PASSWORD: 'ForgotPassword',
  },
  HOME: {
    HOME: 'Home',
    CATEGORIES: 'Categories',
    PROFESSIONALS: 'Professionals',
    PROFESSIONAL_DETAIL: 'ProfessionalDetail',
    SEARCH: 'Search',
  },
  BOOKING: {
    CREATE_BOOKING: 'CreateBooking',
    BOOKING_DETAILS: 'BookingDetails',
    MY_BOOKINGS: 'MyBookings',
    BOOKING_CONFIRMATION: 'BookingConfirmation',
  },
  PROFILE: {
    PROFILE: 'Profile',
    EDIT_PROFILE: 'EditProfile',
    SETTINGS: 'Settings',
    NOTIFICATIONS: 'Notifications',
    FAVORITES: 'Favorites',
  },
  PAYMENT: {
    PAYMENT_METHODS: 'PaymentMethods',
    PAYMENT_SUCCESS: 'PaymentSuccess',
    PAYMENT_HISTORY: 'PaymentHistory',
  },
} as const;

export const API_ENDPOINTS = {
  CATEGORIES: '/categories',
  PROFESSIONALS: '/professionals',
  BOOKINGS: '/bookings',
  PAYMENTS: '/payments',
  NOTIFICATIONS: '/notifications',
  FAVORITES: '/favorites',
} as const;

export const BOOKING_STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    color: COLORS.warning,
    icon: 'clock-outline',
  },
  CONFIRMED: {
    label: 'Confirmed',
    color: COLORS.primary,
    icon: 'check-circle-outline',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    color: COLORS.info,
    icon: 'play-circle-outline',
  },
  COMPLETED: {
    label: 'Completed',
    color: COLORS.success,
    icon: 'checkmark-done-circle-outline',
  },
  CANCELLED: {
    label: 'Cancelled',
    color: COLORS.error,
    icon: 'close-circle-outline',
  },
  REJECTED: {
    label: 'Rejected',
    color: COLORS.error,
    icon: 'close-circle-outline',
  },
} as const;

export const NOTIFICATION_TYPES = {
  BOOKING: 'BOOKING',
  PAYMENT: 'PAYMENT',
  REVIEW: 'REVIEW',
  SYSTEM: 'SYSTEM',
} as const;

export const DATE_FORMATS = {
  DISPLAY_DATE: 'MMM dd, yyyy',
  DISPLAY_TIME: 'hh:mm a',
  DISPLAY_DATETIME: 'MMM dd, yyyy hh:mm a',
  API_DATE: 'yyyy-MM-dd',
  API_TIME: 'HH:mm:ss',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 50,
} as const;

export const VALIDATION_RULES = {
  EMAIL: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Please enter a valid email address',
  },
  PHONE: {
    pattern: /^\+?[\d\s-]{8,}$/,
    message: 'Please enter a valid phone number',
  },
  PASSWORD: {
    minLength: 6,
    message: 'Password must be at least 6 characters',
  },
  NAME: {
    minLength: 2,
    maxLength: 50,
    message: 'Name must be between 2 and 50 characters',
  },
} as const;
