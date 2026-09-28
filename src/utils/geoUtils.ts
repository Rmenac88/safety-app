import type { IncidentCategory, SeverityLevel, ReliabilityStatus, TimeSlot } from '../types/safety';

/**
 * Calculates distance between two GPS coordinates using Haversine formula (in meters)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Formats distance in readable string (e.g. "350 m" or "2.4 km")
 */
export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

/**
 * Maps hour (0-23) to a TimeSlot
 */
export function getTimeSlotFromHour(hour: number): TimeSlot {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Get human-readable time elapsed from ISO string
 */
export function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  if (diffHour === 1) return "Il y a 1 heure";
  if (diffHour < 24) return `Il y a ${diffHour} h`;
  if (diffDay === 1) return "Hier";
  return `Il y a ${diffDay} jours`;
}

export interface CategoryDetails {
  label: string;
  emoji: string;
  color: string;
  bgLight: string;
  bgDark: string;
  borderColor: string;
  defaultSeverity: SeverityLevel;
}

export const CATEGORY_MAP: Record<IncidentCategory, CategoryDetails> = {
  danger: {
    label: 'Danger / Agression',
    emoji: '🚨',
    color: '#EF4444',
    bgLight: 'bg-red-50 text-red-700 border-red-200',
    bgDark: 'dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/60',
    borderColor: 'border-red-500',
    defaultSeverity: 'high',
  },
  avoid: {
    label: 'Zone à éviter',
    emoji: '⚠️',
    color: '#F97316',
    bgLight: 'bg-orange-50 text-orange-700 border-orange-200',
    bgDark: 'dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/60',
    borderColor: 'border-orange-500',
    defaultSeverity: 'medium',
  },
  altercation: {
    label: 'Altercation / Rixe',
    emoji: '👥',
    color: '#EA580C',
    bgLight: 'bg-amber-50 text-amber-800 border-amber-200',
    bgDark: 'dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/60',
    borderColor: 'border-amber-500',
    defaultSeverity: 'medium',
  },
  violence: {
    label: 'Violence / Menace',
    emoji: '🔪',
    color: '#DC2626',
    bgLight: 'bg-red-100 text-red-900 border-red-300',
    bgDark: 'dark:bg-red-950 dark:text-red-200 dark:border-red-700',
    borderColor: 'border-red-600',
    defaultSeverity: 'critical',
  },
  accident: {
    label: 'Accident routier',
    emoji: '🚗',
    color: '#3B82F6',
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    bgDark: 'dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60',
    borderColor: 'border-blue-500',
    defaultSeverity: 'medium',
  },
  hazard: {
    label: 'Infrastructure à risque',
    emoji: '🚧',
    color: '#EAB308',
    bgLight: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    bgDark: 'dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-800/60',
    borderColor: 'border-yellow-500',
    defaultSeverity: 'low',
  },
  lighting: {
    label: 'Éclairage défaillant',
    emoji: '💡',
    color: '#64748B',
    bgLight: 'bg-slate-100 text-slate-700 border-slate-200',
    bgDark: 'dark:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700',
    borderColor: 'border-slate-500',
    defaultSeverity: 'low',
  },
  harassment: {
    label: 'Harcèlement / Suspect',
    emoji: '🏃',
    color: '#EC4899',
    bgLight: 'bg-pink-50 text-pink-700 border-pink-200',
    bgDark: 'dark:bg-pink-950/60 dark:text-pink-300 dark:border-pink-800/60',
    borderColor: 'border-pink-500',
    defaultSeverity: 'high',
  },
  burglary: {
    label: 'Cambriolage / Vol',
    emoji: '🏠',
    color: '#8B5CF6',
    bgLight: 'bg-purple-50 text-purple-700 border-purple-200',
    bgDark: 'dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/60',
    borderColor: 'border-purple-500',
    defaultSeverity: 'medium',
  },
  fire: {
    label: 'Incendie / Fumée',
    emoji: '🔥',
    color: '#EF4444',
    bgLight: 'bg-red-50 text-red-700 border-red-200',
    bgDark: 'dark:bg-red-950/60 dark:text-red-300 dark:border-red-800/60',
    borderColor: 'border-red-500',
    defaultSeverity: 'critical',
  },
  disaster: {
    label: 'Catastrophe naturelle',
    emoji: '🌊',
    color: '#0284C7',
    bgLight: 'bg-sky-50 text-sky-700 border-sky-200',
    bgDark: 'dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/60',
    borderColor: 'border-sky-500',
    defaultSeverity: 'critical',
  },
  police: {
    label: 'Forces de l’ordre',
    emoji: '👮',
    color: '#2563EB',
    bgLight: 'bg-blue-50 text-blue-700 border-blue-200',
    bgDark: 'dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/60',
    borderColor: 'border-blue-500',
    defaultSeverity: 'low',
  },
  medical: {
    label: 'Intervention secours',
    emoji: '🚑',
    color: '#10B981',
    bgLight: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bgDark: 'dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/60',
    borderColor: 'border-emerald-500',
    defaultSeverity: 'low',
  },
  other: {
    label: 'Autre signalement',
    emoji: '❓',
    color: '#6B7280',
    bgLight: 'bg-gray-100 text-gray-700 border-gray-200',
    bgDark: 'dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    borderColor: 'border-gray-500',
    defaultSeverity: 'low',
  },
};

export function getSeverityDetails(severity: SeverityLevel) {
  switch (severity) {
    case 'critical':
      return {
        label: 'Critique',
        color: 'text-red-500 bg-red-500/10 border-red-500/30',
        badgeColor: '#EF4444',
      };
    case 'high':
      return {
        label: 'Élevé',
        color: 'text-orange-500 bg-orange-500/10 border-orange-500/30',
        badgeColor: '#F97316',
      };
    case 'medium':
      return {
        label: 'Modéré',
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
        badgeColor: '#F59E0B',
      };
    case 'low':
    default:
      return {
        label: 'Faible',
        color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
        badgeColor: '#10B981',
      };
  }
}

export function getReliabilityDetails(reliability: ReliabilityStatus) {
  switch (reliability) {
    case 'confirmed':
      return {
        label: 'Confirmé',
        dot: '🟢',
        class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      };
    case 'probable':
      return {
        label: 'Probable',
        dot: '🟡',
        class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      };
    case 'community':
      return {
        label: 'Signalement citoyen',
        dot: '🟠',
        class: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
      };
    case 'outdated':
      return {
        label: 'Ancien / Archivé',
        dot: '⚪',
        class: 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20',
      };
    case 'disputed':
      return {
        label: 'Contesté',
        dot: '🔴',
        class: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
      };
  }
}

export function getScoreGrade(score: number): {
  grade: string;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
} {
  if (score >= 80) {
    return {
      grade: 'A',
      label: 'Zone très paisible',
      colorClass: 'text-emerald-500',
      bgClass: 'bg-emerald-500/15',
      borderClass: 'border-emerald-500/40',
    };
  }
  if (score >= 65) {
    return {
      grade: 'B',
      label: 'Vigilance normale',
      colorClass: 'text-amber-500',
      bgClass: 'bg-amber-500/15',
      borderClass: 'border-amber-500/40',
    };
  }
  if (score >= 45) {
    return {
      grade: 'C',
      label: 'Vigilance accrue',
      colorClass: 'text-orange-500',
      bgClass: 'bg-orange-500/15',
      borderClass: 'border-orange-500/40',
    };
  }
  return {
    grade: 'D',
    label: 'Zone à éviter actuellement',
    colorClass: 'text-red-500',
    bgClass: 'bg-red-500/15',
    borderClass: 'border-red-500/40',
  };
}
