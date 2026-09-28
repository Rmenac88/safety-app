import {
  AlertOctagon,
  AlertTriangle,
  Swords,
  ShieldAlert,
  Car,
  Construction,
  Lightbulb,
  Eye,
  Lock,
  Flame,
  Waves,
  Shield,
  HeartPulse,
  MapPin,
  type LucideIcon,
} from 'lucide-react';

/**
 * Safety Official Design System — Apple Maps & iOS Glass Standards
 */

export const colors = {
  // Brand Official
  primary: '#2563EB',         // Safety Blue (#2563EB)
  primaryGlow: 'rgba(37, 99, 235, 0.25)',
  primaryDim: '#1D4ED8',
  secondary: '#38BDF8',       // Sky (#38BDF8)
  positive: '#22C55E',        // Safety Green (#22C55E)

  // Alert Scale Official
  critical: '#DC2626',        // Critical Red (#DC2626)
  danger: '#EF4444',          // Safety Red (#EF4444)
  dangerGlow: 'rgba(239, 68, 68, 0.25)',
  amber: '#F59E0B',           // Safety Amber (#F59E0B)
  amberGlow: 'rgba(245, 158, 11, 0.25)',
  green: '#22C55E',           // Safety Green (#22C55E)
  greenGlow: 'rgba(34, 197, 94, 0.25)',

  // Surfaces
  surfaceLight: '#FFFFFF',
  surfaceSec: '#F8FAFC',
  bgBase: '#080D1A',          // Deep obsidian for dark mode
  bgSurface: '#0F172A',
  bgSurface2: '#1E293B',
  border: '#E2E8F0',
  borderDark: 'rgba(255, 255, 255, 0.12)',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textLight: '#F8FAFC',
  textMutedLight: '#94A3B8',
} as const;

export const radius = {
  island: '32px',
  sheet: '28px',
  pill: '9999px',
  xl: '20px',
  lg: '16px',
  md: '12px',
  sm: '8px',
} as const;

export const shadow = {
  sheet: '0 -8px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(226,232,240,0.8)',
  card: '0 4px 20px rgba(15,23,42,0.08), 0 0 0 1px rgba(226,232,240,0.8)',
  island: '0 12px 36px rgba(15,23,42,0.15), 0 0 0 1px rgba(226,232,240,0.9)',
  glow: (color: string) => `0 0 24px ${color}50, 0 4px 14px ${color}30`,
} as const;

// ── Category Semantic Colors (Aligned with Official Safety Palette) ───────────
export const categoryColors: Record<string, string> = {
  danger:     '#EF4444',      // Safety Red
  avoid:      '#F59E0B',      // Safety Amber
  altercation:'#EF4444',      // Safety Red
  violence:   '#DC2626',      // Critical Red
  accident:   '#38BDF8',      // Sky
  hazard:     '#F59E0B',      // Safety Amber
  lighting:   '#64748B',      // Slate / Muted
  harassment: '#EF4444',      // Safety Red
  burglary:   '#8B5CF6',      // Purple
  fire:       '#DC2626',      // Critical Red
  disaster:   '#0284C7',      // Deep Sky
  police:     '#2563EB',      // Safety Blue
  medical:    '#22C55E',      // Safety Green
  other:      '#64748B',      // Neutral Slate
};

// ── Category Vector Icons (Lucide) ────────────────────────────────────────────
export const categoryIcons: Record<string, LucideIcon> = {
  danger:     AlertOctagon,
  avoid:      AlertTriangle,
  altercation:Swords,
  violence:   ShieldAlert,
  accident:   Car,
  hazard:     Construction,
  lighting:   Lightbulb,
  harassment: Eye,
  burglary:   Lock,
  fire:       Flame,
  disaster:   Waves,
  police:     Shield,
  medical:    HeartPulse,
  other:      MapPin,
};

// ── SVG Inner Paths for MapLibre Marker rendering (Vector, Apple style) ───────
export const categorySvgPaths: Record<string, string> = {
  danger: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  avoid: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  altercation: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>`,
  violence: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  accident: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
  hazard: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/></svg>`,
  lighting: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  harassment: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  burglary: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  fire: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  disaster: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></svg>`,
  police: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  medical: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
  other: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
};

export const categoryLabels: Record<string, string> = {
  danger:     'Dangers',
  altercation:'Altercations',
  violence:   'Violences',
  avoid:      'Zones à éviter',
  hazard:     'Obstacles sur la voie',
  accident:   'Accident routier',
  lighting:   'Éclairage défaillant',
  harassment: 'Harcèlement',
  burglary:   'Vol',
  fire:       'Incendie',
  disaster:   'Catastrophe naturelle',
  police:     'Force de l\'ordre',
  medical:    'Urgence médicale',
  other:      'Autres situations',
};

export const categoryEmoji: Record<string, string> = {
  danger:     '🚨',
  altercation:'👥',
  violence:   '🔪',
  avoid:      '⚠️',
  hazard:     '🚧',
  accident:   '🚗',
  lighting:   '💡',
  harassment: '🏃',
  burglary:   '🏠',
  fire:       '🔥',
  disaster:   '🌊',
  police:     '👮',
  medical:    '🚑',
  other:      '📍',
};

export const categoryRecommendedGeometry: Record<string, { recommended: 'Point' | 'LineString' | 'Polygon'; alternatives: ('Point' | 'LineString' | 'Polygon')[] }> = {
  danger:     { recommended: 'Point', alternatives: ['Polygon'] },
  altercation:{ recommended: 'Point', alternatives: [] },
  violence:   { recommended: 'Point', alternatives: ['Polygon'] },
  avoid:      { recommended: 'Polygon', alternatives: [] },
  hazard:     { recommended: 'LineString', alternatives: ['Point'] },
  accident:   { recommended: 'Point', alternatives: [] },
  lighting:   { recommended: 'Point', alternatives: ['LineString'] },
  harassment: { recommended: 'Point', alternatives: [] },
  burglary:   { recommended: 'Point', alternatives: [] },
  fire:       { recommended: 'Polygon', alternatives: ['Point'] },
  disaster:   { recommended: 'Polygon', alternatives: [] },
  police:     { recommended: 'Point', alternatives: [] },
  medical:    { recommended: 'Point', alternatives: [] },
  other:      { recommended: 'Point', alternatives: ['LineString', 'Polygon'] },
};

export const defaultSeverity: Record<string, string> = {
  danger:     'critical',
  avoid:      'medium',
  altercation:'medium',
  violence:   'critical',
  accident:   'high',
  hazard:     'medium',
  lighting:   'low',
  harassment: 'high',
  burglary:   'medium',
  fire:       'critical',
  disaster:   'critical',
  police:     'low',
  medical:    'high',
  other:      'low',
};
