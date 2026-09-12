export const COLORS = {
  // Brand colors. The darker action color keeps white labels above WCAG AA.
  primary: '#1E56D9',
  primaryDark: '#153A99',
  primaryLight: '#5C85EA',
  primarySoft: '#EAF0FF',
  ink: '#123247',
  inkSoft: '#E8F1F5',
  accent: '#0F8A78',
  accentSoft: '#E2F5F1',
  
  // Secondary colors
  secondary: '#7C3AED',
  secondaryDark: '#6D28D9',
  secondaryLight: '#8B5CF6',
  
  // Status colors
  success: '#087B66',
  successDark: '#065F50',
  successSoft: '#E2F5F1',
  warning: '#B56208',
  warningDark: '#8A4805',
  warningSoft: '#FFF2D8',
  error: '#C63C3C',
  errorDark: '#A62F2F',
  errorSoft: '#FCE9E7',
  info: '#1E56D9',
  infoDark: '#153A99',
  
  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#F8FAFB',
  gray100: '#F0F3F5',
  gray200: '#E0E6EA',
  gray300: '#C7D0D7',
  gray400: '#8A98A3',
  gray500: '#62717D',
  gray600: '#485864',
  gray700: '#344651',
  gray800: '#213742',
  gray900: '#102630',
  
  // Background colors
  background: '#F5F8F7',
  backgroundDark: '#102630',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F5F4',
  surfaceDark: '#213742',
  
  // Text colors
  textPrimary: '#102A38',
  textSecondary: '#52636E',
  textTertiary: '#778690',
  textInverse: '#FFFFFF',
  
  // Border colors
  border: '#DDE5E8',
  borderStrong: '#C7D2D8',
  borderDark: '#344651',
  
  // Transparent colors
  transparent: 'transparent',
  primaryTransparent: 'rgba(30, 86, 217, 0.10)',
  successTransparent: 'rgba(8, 123, 102, 0.11)',
  errorTransparent: 'rgba(198, 60, 60, 0.10)',
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxx: 40,
  xxxxx: 48,
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
  light: 'System',
  
  sizes: {
    xxs: 10,
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    xxxx: 40,
  },
  
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#102A38',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#102A38',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#102A38',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5,
  },
  xl: {
    shadowColor: '#102A38',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const LAYOUT = {
  screenPadding: SPACING.xl,
  contentMaxWidth: 720,
  touchTarget: 44,
  tabBarHeight: 72,
} as const;

export const BORDER_RADIUS = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

// Dark mode colors
export const DARK_COLORS = {
  background: COLORS.gray900,
  surface: COLORS.gray800,
  textPrimary: COLORS.gray50,
  textSecondary: COLORS.gray300,
  textTertiary: COLORS.gray400,
  border: COLORS.gray700,
};
