import { calculateDistance } from '../utils/geoUtils';
import type { Incident } from '../types/safety';

export interface CalculatedSafetyScore {
  hasSufficientData: boolean;
  score: number | null;
  statusText: string;
  confidence: 'none' | 'low' | 'medium' | 'high';
  incidentCount: number;
  criticalCount: number;
  recentCount: number;
  mainIssues: string[];
  description: string;
}

/**
 * Honest, probabilistic Safety Score calculation strictly based on real reported data.
 * If no incidents exist within radius, returns hasSufficientData = false (never invents a score).
 */
export function calculateAreaSafetyScore(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  allIncidents: Incident[]
): CalculatedSafetyScore {
  // 1. Filter incidents within radius
  const nearby = allIncidents.filter((inc) => {
    if (inc.status !== 'active') return false;
    const dist = calculateDistance(latitude, longitude, inc.latitude, inc.longitude);
    return dist <= radiusMeters;
  });

  if (nearby.length === 0) {
    return {
      hasSufficientData: false,
      score: null,
      statusText: 'Zone calme • Aucun incident signalé',
      confidence: 'none',
      incidentCount: 0,
      criticalCount: 0,
      recentCount: 0,
      mainIssues: [],
      description: 'Aucune perturbation ou situation à risque signalée dans ce secteur.',
    };
  }

  // 2. Compute dynamic penalty
  let totalPenalty = 0;
  let criticalCount = 0;
  let recentCount = 0;
  const now = Date.now();
  const issueSet = new Set<string>();

  nearby.forEach((inc) => {
    // Severity weight
    let weight = 4;
    if (inc.severity === 'critical') {
      weight = 25;
      criticalCount++;
    } else if (inc.severity === 'high') {
      weight = 15;
    } else if (inc.severity === 'medium') {
      weight = 8;
    }

    // Confirmation boost (more confirmations = higher verified impact)
    const confirmationFactor = Math.min(2.0, 1 + inc.confirmationsCount * 0.1);
    
    // Time decay (newer incidents carry more weight)
    const ageMs = now - new Date(inc.createdAt).getTime();
    const ageMinutes = ageMs / (60 * 1000);
    let timeDecay = 1.0;
    if (ageMinutes < 30) {
      recentCount++;
      timeDecay = 1.25;
    } else if (ageMinutes > 240) {
      timeDecay = 0.6;
    }

    totalPenalty += weight * confirmationFactor * timeDecay;
    issueSet.add(inc.title);
  });

  const finalScore = Math.max(10, Math.min(95, Math.round(100 - totalPenalty)));
  const confidence = nearby.length >= 5 ? 'high' : nearby.length >= 2 ? 'medium' : 'low';

  let statusText = 'Vigilance normale';
  if (finalScore < 45) {
    statusText = 'Zone à éviter actuellement';
  } else if (finalScore < 65) {
    statusText = 'Vigilance accrue';
  } else if (finalScore >= 80) {
    statusText = 'Zone globalement calme';
  }

  return {
    hasSufficientData: true,
    score: finalScore,
    statusText,
    confidence,
    incidentCount: nearby.length,
    criticalCount,
    recentCount,
    mainIssues: Array.from(issueSet).slice(0, 4),
    description: `Indice basé sur ${nearby.length} signalement(s) actif(s) dans un rayon de ${Math.round(radiusMeters)} m.`,
  };
}
