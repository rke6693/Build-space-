/**
 * Keel design tokens — single source of truth for color, type, spacing, and
 * motion across the landing page, docs, and (future) dashboard. Keep values
 * in sync with `brand/tokens.css`; both are generated from the same palette.
 */

export const colors = {
  // Surfaces
  bg: '#0A0E1A',
  bgElevated: '#0F1629',
  bgElevated2: '#141C33',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  // Text
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Brand
  brandCyan: '#22D3EE',
  brandIndigo: '#7C5CFF',
  brandPurple: '#8B5CF6',

  // Semantic
  success: '#10B981',
  successSoft: '#34D399',
  warn: '#F59E0B',
  danger: '#F43F5E',

  // Gradients
  gradientBrand: 'linear-gradient(135deg, #22D3EE 0%, #7C5CFF 55%, #8B5CF6 100%)',
  gradientShadow:
    'linear-gradient(135deg, rgba(139, 92, 246, 0.22) 0%, rgba(124, 92, 255, 0.08) 100%)',
  gradientMoney: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
} as const;

export const typography = {
  fontFamilySans:
    "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMono:
    "'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace",
  // Fluid scale tuned for the dashboard/landing style shown in the reference mockup.
  size: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    display: '3.5rem',
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  leading: { tight: '1.15', snug: '1.3', normal: '1.5', relaxed: '1.65' },
  tracking: { tight: '-0.02em', normal: '0', wide: '0.04em' },
} as const;

export const radius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  pill: '999px',
} as const;

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export const shadow = {
  card: '0 1px 0 0 rgba(255, 255, 255, 0.04) inset, 0 8px 24px rgba(0, 0, 0, 0.35)',
  glow: '0 0 0 1px rgba(139, 92, 246, 0.25), 0 8px 40px rgba(139, 92, 246, 0.18)',
} as const;

export const motion = {
  easeStandard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  duration: { fast: '120ms', base: '200ms', slow: '320ms' },
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;
