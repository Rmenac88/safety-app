/**
 * 🚶 Mathematical Pedestrian Journey & Walking Time Computation
 * 
 * Computes precise walking times using real physical constants:
 * - Average international pedestrian walking pace: 4.5 km/h (75 m/min)
 * - Urban grid detour coefficient: 1.22 (accounts for street curvature, pedestrian crossings, corners)
 * - Dynamic safety buffer: +2 min minimum for red pedestrian lights and intersections
 */

export interface WalkingEstimate {
  distanceMeters: number;
  walkingMinutes: number;
  safetyMarginMinutes: number;
  totalEstimatedMinutes: number;
  formattedDistance: string;
  speedKmh: number;
}

export function computeWalkingEstimate(
  distanceMeters: number,
  options?: {
    speedKmh?: number; // default: 4.5 km/h
    detourFactor?: number; // default: 1.22
    safetyMarginMinutes?: number; // default: 2
  }
): WalkingEstimate {
  const speedKmh = options?.speedKmh ?? 4.5;
  const detourFactor = options?.detourFactor ?? 1.22;
  const safetyMarginMinutes = options?.safetyMarginMinutes ?? 2;

  // Real ground pedestrian distance accounting for city blocks
  const effectiveDistance = Math.max(10, distanceMeters * detourFactor);
  // Speed in meters per minute (4.5 km/h = 4500 m / 60 min = 75 m/min)
  const speedMpm = (speedKmh * 1000) / 60;

  const rawMinutes = effectiveDistance / speedMpm;
  const walkingMinutes = Math.max(1, Math.round(rawMinutes));
  const totalEstimatedMinutes = Math.max(2, walkingMinutes + safetyMarginMinutes);

  const formattedDistance =
    distanceMeters < 1000
      ? `${Math.round(distanceMeters)} m`
      : `${(distanceMeters / 1000).toFixed(1)} km`;

  return {
    distanceMeters: Math.round(distanceMeters),
    walkingMinutes,
    safetyMarginMinutes,
    totalEstimatedMinutes,
    formattedDistance,
    speedKmh,
  };
}
