// Theme colors matching the frontend
export const Colors = {
  // Primary colors
  primary: '#ef4444',
  primaryDark: '#dc2626',
  primaryLight: '#feb2b2',
  
  // Secondary colors
  secondary: '#fd9745',
  secondaryDark: '#ea580c',
  secondaryLight: '#fed7aa',
  
  // Accent colors
  accentYellow: '#fbbf24',
  accentGreen: '#10b981',
  
  // Text colors
  textDark: '#1a202c',
  textMedium: '#4a5568',
  textLight: '#718096',
  
  // Background colors
  backgroundWhite: '#ffffff',
  backgroundLight: '#f7fafc',
  backgroundGray: '#edf2f7',
  backgroundCream: '#fef7f0',
  
  // Border colors
  borderLight: '#e2e8f0',
  borderMedium: '#cbd5e0',
  
  // Status colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  
  // Table status colors
  tableAvailable: '#10b981',
  tableOccupied: '#ef4444',
  tableCleaning: '#f59e0b',
  tableReserved: '#8b5cf6',
  tableOutOfService: '#6b7280',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  small: 4,
  medium: 8,
  large: 12,
  xl: 16,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyBold: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  small: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
};

// Responsive variants - pass fs/sp from useResponsive hook
export const ResponsiveTypography = (fs) => ({
  h1: { fontSize: fs(32), fontWeight: '800', lineHeight: fs(40) },
  h2: { fontSize: fs(24), fontWeight: '700', lineHeight: fs(32) },
  h3: { fontSize: fs(20), fontWeight: '600', lineHeight: fs(28) },
  body: { fontSize: fs(16), fontWeight: '400', lineHeight: fs(24) },
  bodyBold: { fontSize: fs(16), fontWeight: '600', lineHeight: fs(24) },
  caption: { fontSize: fs(14), fontWeight: '400', lineHeight: fs(20) },
  small: { fontSize: fs(12), fontWeight: '400', lineHeight: fs(16) },
});

export const ResponsiveSpacing = (sp) => ({
  xs: sp(4), sm: sp(8), md: sp(16), lg: sp(24), xl: sp(32), xxl: sp(48),
});

export const Shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};
