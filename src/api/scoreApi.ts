import { api, coarseCoord } from './client';

export interface SafetyScoreDTO {
  has_sufficient_data: boolean;
  score: number | null;
  status_text: string;
  confidence: string;
  incident_count: number;
  critical_count: number;
  recent_count: number;
  main_issues: string[];
  description: string;
}

export function fetchSafetyScore(
  lat: number,
  lon: number,
  radius_m = 600
): Promise<SafetyScoreDTO> {
  return api.get<SafetyScoreDTO>(
    `/score?lat=${coarseCoord(lat)}&lon=${coarseCoord(lon)}&radius_m=${radius_m}`
  );
}
