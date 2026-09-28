import type { GeocodedPlace } from '../api/geocodingApi';

export type GeometryType = 'Point' | 'LineString' | 'Polygon';

export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // Array of [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: [number, number][][]; // Outer ring + optional holes
}

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon;

export type DrawingMode = 'idle' | 'point' | 'linestring' | 'polygon';

export interface DrawingState {
  mode: DrawingMode;
  category: IncidentCategory;
  coordinates: [number, number][]; // Current vertices in progress
  isComplete: boolean;
  history: [number, number][][]; // For undo/redo
}

export type IncidentCategory =
  | 'danger'        // 🚨 Dangers
  | 'altercation'   // 👥 Altercations
  | 'violence'      // 🔪 Violences
  | 'avoid'         // ⚠️ Zones à éviter
  | 'hazard'        // 🚧 Obstacles sur la voie
  | 'accident'      // 🚗 Accident routier
  | 'lighting'      // 💡 Éclairage défaillant
  | 'harassment'    // 🏃 Harcèlement
  | 'burglary'      // 🏠 Vol
  | 'fire'          // 🔥 Incendie
  | 'disaster'      // 🌊 Catastrophe naturelle
  | 'police'        // 👮 Force de l'ordre
  | 'medical'       // 🚑 Urgence médicale
  | 'other';        // ❓ Autres situations (Description obligatoire)

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export type ReliabilityStatus = 'confirmed' | 'probable' | 'community' | 'outdated' | 'disputed';

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface IncidentAuthor {
  id: string;
  pseudonym: string;
  trustTier: 'new' | 'contributor' | 'trusted' | 'verified';
  isAnonymous: boolean;
}

export interface Incident {
  id: string;
  category: IncidentCategory;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string;
  neighborhood?: string;
  city?: string;
  severity: SeverityLevel;
  status: 'active' | 'resolved' | 'expired';
  reliability: ReliabilityStatus;
  confirmationsCount: number;
  disputesCount: number;
  createdAt: string; // ISO string
  updatedAt?: string;
  expiresAt: string; // ISO string
  estimatedDuration: string; // "30 min", "2 h", "12 h", "24 h", "permanent"
  timeSlotRelevance: 'all' | 'day' | 'evening' | 'night';
  geometryType: GeometryType;
  geojsonGeometry?: GeoJSONGeometry | string;
  author: IncidentAuthor;
  isOfficial?: boolean;
  source?: string;
  mediaUrl?: string;
  hasUserConfirmed?: boolean;
  hasUserDisputed?: boolean;
}

export interface FavoritePlace {
  id: string;
  name: string;
  type: 'home' | 'work' | 'school' | 'other';
  address: string;
  latitude: number;
  longitude: number;
  notifyPerimeterMeters: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  trustTier: 'new' | 'contributor' | 'trusted' | 'verified';
  reputationPoints: number;
  reportsSubmitted: number;
  confirmationsGiven: number;
  isAnonymousDefault: boolean;
  notificationsEnabled: boolean;
  proximityRadiusKm: number;
  theme: 'dark' | 'light' | 'system';
}

export interface FilterState {
  searchQuery: string;
  selectedCategories: IncidentCategory[];
  minSeverity: SeverityLevel | 'all';
  onlyLive: boolean; // < 1 hour
  simulatedHour: number; // 0 - 23
  selectedDay: DayOfWeek | 'all';
  mapTileStyle: 'dark' | 'light';
}

export type SelectedLocation = {
  latitude: number;
  longitude: number;
  name: string;
  streetName?: string;
  neighborhood?: string;
  city?: string;
  placeData?: GeocodedPlace;
};
