import { type ViewStyle } from 'react-native';

export const colors = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#DCE4F2',
  borderStrong: '#B8C6E0',
  text: '#0F172A',
  subtext: '#475569',
  muted: '#64748B',
  primary: '#2563EB',
  primaryStrong: '#1D4ED8',
  primarySoft: '#DBEAFE',
  primaryBorder: '#93C5FD',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  dangerBorder: '#FCA5A5',
  overlay: 'rgba(15, 23, 42, 0.45)',
  skeleton: '#E2E8F0',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  round: 999,
} as const;

export const typography = {
  heading: 26,
  section: 18,
  body: 15,
  caption: 13,
} as const;

export const shadow = {
  card: {
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  } satisfies ViewStyle,
  floating: {
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  } satisfies ViewStyle,
} as const;
