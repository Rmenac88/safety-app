import type { Geometry } from 'geojson';
import { api, coarseCoord, getIncidentOwnerToken, saveIncidentOwnerToken } from './client';

export interface IncidentDTO {
  id: string;
  category: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  address?: string;
  neighborhood?: string;
  city?: string;
  severity: string;
  status: string;
  confirmations_count: number;
  disputes_count: number;
  is_anonymous: boolean;
  author_pseudonym: string;
  time_slot_relevance?: string;
  estimated_duration: string;
  geometry_type: string;
  geojson_geometry?: string | Geometry;
  created_at: string;
  expires_at: string;
  trust_score?: number;
  moderation_status?: string;
}

export interface CreateIncidentResponseDTO extends IncidentDTO {
  owner_token?: string;
}

export interface IncidentListDTO {
  total: number;
  incidents: IncidentDTO[];
}

export interface CreateIncidentPayload {
  category: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  address?: string;
  neighborhood?: string;
  city?: string;
  severity: string;
  is_anonymous?: boolean;
  author_pseudonym?: string;
  time_slot_relevance?: string;
  estimated_duration?: string;
  geometry_type?: string;
  geojson_geometry?: string;
}

export function fetchIncidents(params?: {
  lat?: number;
  lon?: number;
  radius_m?: number;
  min_lon?: number;
  min_lat?: number;
  max_lon?: number;
  max_lat?: number;
  bbox?: string;
  category?: string;
  severity?: string;
  status?: string;
  limit?: number;
}): Promise<IncidentListDTO> {
  const qs = new URLSearchParams();
  if (params?.lat !== undefined) qs.set('lat', String(coarseCoord(params.lat)));
  if (params?.lon !== undefined) qs.set('lon', String(coarseCoord(params.lon)));
  if (params?.radius_m !== undefined) qs.set('radius_m', String(params.radius_m));
  if (params?.min_lon !== undefined) qs.set('min_lon', String(params.min_lon));
  if (params?.min_lat !== undefined) qs.set('min_lat', String(params.min_lat));
  if (params?.max_lon !== undefined) qs.set('max_lon', String(params.max_lon));
  if (params?.max_lat !== undefined) qs.set('max_lat', String(params.max_lat));
  if (params?.bbox) qs.set('bbox', params.bbox);
  if (params?.category) qs.set('category', params.category);
  if (params?.severity) qs.set('severity', params.severity);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return api.get<IncidentListDTO>(`/incidents${q ? '?' + q : ''}`);
}

export const createIncident = async (payload: CreateIncidentPayload): Promise<CreateIncidentResponseDTO> => {
  const res = await api.post<CreateIncidentResponseDTO>('/incidents', payload);
  if (res && res.id && res.owner_token) {
    saveIncidentOwnerToken(res.id, res.owner_token);
  }
  return res;
};

export const voteIncidentApi = (id: string, payload: { vote_type: string; previous_vote?: string; session_id?: string }) =>
  api.post<IncidentDTO>(`/incidents/${id}/vote`, payload);

export const resolveIncident = (id: string) => {
  const token = getIncidentOwnerToken(id);
  const headers: Record<string, string> = {};
  if (token) headers['X-Incident-Owner-Token'] = token;
  return api.patch<IncidentDTO>(`/incidents/${id}/resolve`, undefined, { headers });
};

export const deleteIncident = (id: string) => {
  const token = getIncidentOwnerToken(id);
  const headers: Record<string, string> = {};
  if (token) headers['X-Incident-Owner-Token'] = token;
  return api.delete<void>(`/incidents/${id}`, { headers });
};

export interface ClassifiedIncidentDTO {
  category: string;
  title: string;
  severity: string;
  geometry_type: string;
  estimated_duration: string;
  confidence: number;
  detected_keywords: string[];
}

// NB: durations must be one of the backend's allowed values
// ("30 min" | "2 h" | "12 h" | "24 h" | "permanent"), otherwise publishing fails with a 422.
const LOCAL_NLP_RULES: Record<string, { keywords: string[]; severity: string; geometry: string; duration: string; title: string }> = {
  altercation: {
    keywords: ['bagarre', 'battent', 'rixe', 'dispute', 'altercation', 'embrouille', 'frapper', 'frappe', 'insulte'],
    severity: 'high',
    geometry: 'Point',
    duration: '2 h',
    title: 'Altercation signalée',
  },
  violence: {
    keywords: ['agression', 'violence', 'attaque', 'couteau', 'arme', 'braquage', 'coups', 'sang', 'violent'],
    severity: 'critical',
    geometry: 'Point',
    duration: '2 h',
    title: 'Agression / Violence physique',
  },
  lighting: {
    keywords: ['eclairage', 'éclairage', 'lampadaire', 'noir', 'sombre', 'obscurite', 'obscurité', 'lumiere', 'lumière', 'éteint', 'eteint', 'ampoule'],
    severity: 'medium',
    geometry: 'LineString',
    duration: '12 h',
    title: 'Éclairage public défaillant',
  },
  accident: {
    keywords: ['accident', 'collision', 'crash', 'voiture', 'vehicule', 'véhicule', 'moto', 'scooter', 'pieton', 'piéton', 'renverse', 'renversé', 'carambolage', 'blessé'],
    severity: 'medium',
    geometry: 'Point',
    duration: '2 h',
    title: 'Accident de circulation',
  },
  hazard: {
    keywords: ['obstacle', 'trou', 'chaussee', 'chaussée', 'nid de poule', 'arbre', 'branche', 'travaux', 'barriere', 'barrière', 'verglas', 'glissant', 'debris', 'débris'],
    severity: 'medium',
    geometry: 'LineString',
    duration: '12 h',
    title: 'Obstacle / Voie entravée',
  },
  harassment: {
    keywords: ['harcelement', 'harcèlement', 'suivi', 'suivre', 'intrusif', 'siffle', 'sifflé', 'rode', 'rôde', 'menace', 'menacé'],
    severity: 'high',
    geometry: 'Point',
    duration: '2 h',
    title: 'Harcèlement / Intimidation',
  },
  burglary: {
    keywords: ['vol', 'voleur', 'arrache', 'arraché', 'pickpocket', 'cambriolage', 'effraction', 'pille', 'pillé'],
    severity: 'medium',
    geometry: 'Point',
    duration: '2 h',
    title: 'Vol / Pickpocket signalé',
  },
  fire: {
    keywords: ['feu', 'incendie', 'fumee', 'fumée', 'flammes', 'brule', 'brûle', 'explosion', 'pompier', 'pompiers'],
    severity: 'critical',
    geometry: 'Polygon',
    duration: '2 h',
    title: 'Incendie / Fumée suspecte',
  },
  police: {
    keywords: ['police', 'gendarmerie', 'crs', 'controle', 'contrôle', 'barrage', 'patrouille', 'radar', 'fouille'],
    severity: 'low',
    geometry: 'Point',
    duration: '2 h',
    title: "Contrôle des forces de l'ordre",
  },
  medical: {
    keywords: ['secours', 'samu', 'ambulance', 'malaise', 'inconscient', 'inconsciente', 'cardiaque', 'chute grave', 'urgence'],
    severity: 'high',
    geometry: 'Point',
    duration: '2 h',
    title: 'Secours / Urgence médicale',
  },
  avoid: {
    keywords: ['eviter', 'éviter', 'zone a eviter', 'zone à éviter', 'tension', 'danger', 'groupe hostile', 'périmètre'],
    severity: 'high',
    geometry: 'Polygon',
    duration: '12 h',
    title: 'Zone à éviter temporairement',
  },
};

export const classifyIncidentText = async (text: string): Promise<ClassifiedIncidentDTO> => {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let bestCat = 'danger';
  let bestScore = 0;
  const detectedKeywords: string[] = [];

  for (const [cat, rule] of Object.entries(LOCAL_NLP_RULES)) {
    let matches = 0;
    for (const kw of rule.keywords) {
      const normKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.includes(normKw)) {
        matches++;
        detectedKeywords.push(kw);
      }
    }
    if (matches > bestScore) {
      bestScore = matches;
      bestCat = cat;
    }
  }

  const rule = LOCAL_NLP_RULES[bestCat] || {
    severity: 'medium',
    geometry: 'Point',
    duration: '2 h',
    title: 'Signalement citoyen',
  };

  const localResult: ClassifiedIncidentDTO = {
    category: bestCat,
    title: bestScore > 0 ? rule.title : text.slice(0, 45),
    severity: rule.severity,
    geometry_type: rule.geometry,
    estimated_duration: rule.duration,
    confidence: bestScore > 0 ? 0.95 : 0.60,
    detected_keywords: detectedKeywords,
  };

  // Try background API enrichment without blocking
  try {
    const apiRes = await Promise.race([
      api.post<ClassifiedIncidentDTO>('/incidents/classify', { text }),
      new Promise<null>((r) => setTimeout(() => r(null), 300)),
    ]);
    if (apiRes) return apiRes;
  } catch { /* best effort: ignore */ }

  return localResult;
};
