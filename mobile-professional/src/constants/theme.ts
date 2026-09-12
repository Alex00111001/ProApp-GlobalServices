export const COLORS = {
  primary: '#1E56D9',
  primaryDark: '#153A99',
  primaryLight: '#5C85EA',
  primarySoft: '#EAF0FF',
  ink: '#123247',
  inkSoft: '#E8F1F5',
  success: '#087B66',
  successSoft: '#E2F5F1',
  warning: '#B56208',
  warningSoft: '#FFF2D8',
  danger: '#C63C3C',
  dangerSoft: '#FCE9E7',
  background: '#F5F8F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F5F4',
  text: '#102A38',
  muted: '#52636E',
  subtle: '#778690',
  border: '#DDE5E8',
  borderStrong: '#C7D2D8',
  white: '#FFFFFF',
};

export const SPACING = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40 };
export const RADIUS = { xs: 6, sm: 10, md: 14, lg: 20, xl: 24, full: 999 };

export const LAYOUT = {
  screenPadding: SPACING.xl,
  contentMaxWidth: 720,
  touchTarget: 44,
  tabBarHeight: 72,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
};

