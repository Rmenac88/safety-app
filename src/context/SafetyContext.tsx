import React, {
  createContext, useContext, useState, useEffect, useMemo,
  useCallback, useRef,
} from 'react';
import { fetchIncidents, voteIncidentApi, resolveIncident, deleteIncident, createIncident } from '../api/incidentApi';
import type { IncidentDTO, CreateIncidentPayload } from '../api/incidentApi';
import { fetchFavorites, createFavorite, deleteFavorite } from '../api/favoritesApi';
import type { FavoriteDTO } from '../api/favoritesApi';
import { fetchNotifications, markNotificationRead, deleteNotificationApi, clearAllNotificationsApi } from '../api/notificationsApi';
import type { NotificationDTO } from '../api/notificationsApi';
import { getDeviceId } from '../api/client';
import type { DrawingMode, GeoJSONGeometry, IncidentCategory, WalkSession } from '../types/safety';
import { playEmergencySiren, stopEmergencySiren, playWarningBeep } from '../utils/sirenAudio';
import { calculateDistance } from '../utils/geoUtils';

// ── Types ─────────────────────────────────────────────────────────────────────
export type GpsState = 'prompt' | 'granted' | 'denied' | 'locating' | 'unavailable';
export type ScaleLevel = 'globe' | 'continent' | 'country' | 'city' | 'neighborhood' | 'street' | 'point';

export interface SelectedLocation {
  latitude: number;
  longitude: number;
  name: string;
  streetName?: string;
  neighborhood?: string;
  city?: string;
  streetGeometry?: any | null;
}

export interface FilterState {
  selectedCategories: string[];
  hiddenCategories?: string[];
  minSeverity: string;
  onlyLive: boolean;
  simulatedHour: number;
  mapTileStyle: 'dark' | 'light';
}

export interface CameraOptions {
  center?: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
}

// Stable persistent anonymous Device ID (like GPS / Waze, no account required)
function getSessionId(): string {
  return getDeviceId();
}

// ── Context Shape ─────────────────────────────────────────────────────────────
interface SafetyContextType {
  // Data from API
  incidents: IncidentDTO[];
  filteredIncidents: IncidentDTO[];
  favorites: FavoriteDTO[];
  notifications: NotificationDTO[];
  unreadNotificationsCount: number;
  notificationRadiusKm: number;
  isLoadingIncidents: boolean;

  // Map state
  userLocation: [number, number] | null;
  gpsAccuracyMeters: number | null;
  gpsState: GpsState;
  mapCenter: [number, number];
  mapZoom: number;
  mapPitch: number;
  mapBearing: number;
  isGlobeMode: boolean;
  scaleLevel: ScaleLevel;
  cameraNonce: number;

  // UI state
  selectedIncident: IncidentDTO | null;
  selectedLocation: SelectedLocation | null;
  activeModal: string | null;
  filters: FilterState;
  sessionId: string;
  myIncidentIds: string[];
  isHeatmapMode: boolean;
  setIsHeatmapMode: (val: boolean) => void;
  toggleHeatmapMode: () => void;

  // Drawing State & Native Geospatial Engine
  drawingMode: DrawingMode;
  drawingCategory: IncidentCategory;
  drawingOrigin: 'map' | 'report';
  drawingCoordinates: [number, number][];
  completedGeometry: GeoJSONGeometry | null;
  startDrawing: (mode: DrawingMode, category?: IncidentCategory, origin?: 'map' | 'report') => void;
  addDrawingVertex: (coord: [number, number]) => void;
  setDrawingCoordinates: (coords: [number, number][]) => void;
  undoDrawingVertex: () => void;
  clearDrawing: () => void;
  finishDrawing: () => GeoJSONGeometry | null;
  cancelDrawing: () => void;
  setCompletedGeometry: (geom: GeoJSONGeometry | null) => void;

  // Actions
  setMapCenter: (coords: [number, number], zoom?: number) => void;
  setMapZoom: (zoom: number) => void;
  setMapCamera: (opts: CameraOptions) => void;
  toggleGlobeMode: () => void;
  togglePitch: () => void;
  requestUserLocation: (opts?: { silent?: boolean; forceRecenter?: boolean }) => void;
  setSelectedIncident: (inc: IncidentDTO | null) => void;
  setSelectedLocation: (loc: SelectedLocation | null) => void;
  setActiveModal: (modal: string | null) => void;
  updateFilters: (partial: Partial<FilterState>) => void;
  resetFilters: () => void;
  hapticFeedback: (type?: 'light' | 'medium' | 'heavy' | 'success') => void;
  refreshIncidents: () => void;
  refreshNotifications: () => void;
  setNotificationRadiusKm: (radius: number) => void;
  markAsRead: (id: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;

  // Incident mutations
  userVotes: Record<string, 'confirm' | 'dispute'>;
  submitIncident: (payload: CreateIncidentPayload) => Promise<void>;
  handleConfirm: (id: string) => Promise<void>;
  handleDispute: (id: string) => Promise<void>;
  handleResolve: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;

  // Favorites mutations
  addFavorite: (params: { name: string; placeType?: string; address?: string; latitude: number; longitude: number; notifyRadiusM?: number }) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;

  // Walk With Me (Mode Trajet Sécurisé)
  walkSession: WalkSession | null;
  startWalkSession: (params: {
    destinationName: string;
    destinationCoords: [number, number];
    estimatedMinutes: number;
    contactName?: string;
    contactPhone?: string;
  }) => void;
  confirmSafetyCheck: () => void;
  triggerWalkAlert: () => void;
  toggleWalkSiren: () => void;
  endWalkSession: (status?: 'arrived' | 'idle') => void;
}

// ── Default Filter State ───────────────────────────────────────────────────────
const DEFAULT_FILTERS: FilterState = {
  selectedCategories: [],
  hiddenCategories: [],
  minSeverity: 'all',
  onlyLive: false,
  simulatedHour: new Date().getHours(),
  mapTileStyle: 'light',
};

// ── Context ────────────────────────────────────────────────────────────────────
export const SafetyContext = createContext<SafetyContextType | null>(null);
const LOCAL_INCIDENTS_KEY = 'safety_incidents_active_v1';

function normalizeCoords(lat: number, lon: number): [number, number] {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return [lat, lon];
  }
  // France coordinates: Lat ~41-51, Lon ~-5 to 10
  // Si latitude < longitude (ex: lat: 2.35, lon: 48.85), inverse-les automatiquement :
  if (lat < lon && lat < 30 && lon > 30) {
    return [lon, lat];
  }
  return [lat, lon];
}

const SEED_TITLES = new Set([
  "Chantier non sécurisé et trou béant",
  "Rixe entre deux groupes",
  "Agression physique signalée",
  "Périmètre de tension nocturne",
  "Arbre couché et câbles au sol",
  "Collision véhicule - deux-roues",
  "Éclairage public totalement défaillant",
  "Harcèlement de rue répété",
  "Tentative d'effraction en cours",
  "Incendie de local à poubelles et fumées",
  "Inondation et refoulement d'égout",
  "Contrôle et sécurisation de secteur",
  "Malaise d'un passant sur la voie publique",
  "Nid-de-poule dangereux non signalé",
  "Chantier & voie cyclable obstruée",
  "Secours en intervention",
]);

export function isFakeSeedIncident(i: any): boolean {
  if (!i || !i.title) return true;
  if (SEED_TITLES.has(i.title.trim())) return true;
  if (i.id === 'ln-1' || i.id === 'ln-2' || i.id === 'poly-1') return true;
  return false;
}

function loadStoredIncidents(): IncidentDTO[] {
  try {
    // Clear all old legacy versions
    for (let i = 1; i <= 10; i++) {
      try { localStorage.removeItem(`safety_local_incidents_v${i}`); } catch {}
    }

    const raw = localStorage.getItem(LOCAL_INCIDENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((i) => i && typeof i.id === 'string' && i.status === 'active' && !isFakeSeedIncident(i))
        .map((i) => {
          const [safeLat, safeLon] = normalizeCoords(i.latitude, i.longitude);
          return { ...i, latitude: safeLat, longitude: safeLon };
        });
    }
    return [];
  } catch {
    return [];
  }
}

function saveStoredIncidents(list: IncidentDTO[]) {
  try {
    localStorage.setItem(LOCAL_INCIDENTS_KEY, JSON.stringify(list));
  } catch {}
}

export const SafetyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const sessionId = useMemo(() => getSessionId(), []);

  // ── API Data with Local Fallback ───────────────────────────────────────────
  const [incidents, setIncidents] = useState<IncidentDTO[]>(loadStoredIncidents);
  const [favorites, setFavorites] = useState<FavoriteDTO[]>([]);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(false);
  const [myIncidentIds, setMyIncidentIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('safety_my_incident_ids_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveMyIncidentIds = (ids: string[]) => {
    try {
      localStorage.setItem('safety_my_incident_ids_v1', JSON.stringify(ids));
    } catch {}
  };

  // ── Map State ────────────────────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>('prompt');
  const [mapCenter, setMapCenterState] = useState<[number, number]>([48.8566, 2.3522]);
  const [mapZoom, setMapZoomState] = useState<number>(14.5);
  const [mapPitch, setMapPitchState] = useState<number>(0);
  const [mapBearing, setMapBearingState] = useState<number>(0);
  const [isGlobeMode, setIsGlobeMode] = useState<boolean>(false);
  const [isHeatmapMode, setIsHeatmapMode] = useState<boolean>(false);
  const [cameraNonce, setCameraNonce] = useState<number>(0);

  const toggleHeatmapMode = useCallback(() => {
    setIsHeatmapMode((prev) => !prev);
  }, []);

  // ── UI State ─────────────────────────────────────────────────────────────
  const [selectedIncident, setSelectedIncident] = useState<IncidentDTO | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const [notificationRadiusKm, setNotificationRadiusKmState] = useState<number>(5);

  // ── Native Geospatial Vector Drawing Engine State ──────────────────────────
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('idle');
  const [drawingCategory, setDrawingCategory] = useState<IncidentCategory>('danger');
  const [drawingOrigin, setDrawingOrigin] = useState<'map' | 'report'>('map');
  const [drawingCoordinates, setDrawingCoordinates] = useState<[number, number][]>([]);
  const [completedGeometry, setCompletedGeometry] = useState<GeoJSONGeometry | null>(null);

  const startDrawing = useCallback((mode: DrawingMode, category: IncidentCategory = 'danger', origin: 'map' | 'report' = 'map') => {
    setDrawingMode(mode);
    setDrawingCategory(category);
    setDrawingOrigin(origin);
    setDrawingCoordinates([]);
    setCompletedGeometry(null);
  }, []);

  const addDrawingVertex = useCallback((coord: [number, number]) => {
    setDrawingCoordinates((prev) => [...prev, coord]);
  }, []);

  const undoDrawingVertex = useCallback(() => {
    setDrawingCoordinates((prev) => prev.slice(0, -1));
  }, []);

  const clearDrawing = useCallback(() => {
    setDrawingCoordinates([]);
  }, []);

  const finishDrawing = useCallback((): GeoJSONGeometry | null => {
    if (drawingCoordinates.length === 0) return null;
    let geom: GeoJSONGeometry | null = null;
    if (drawingMode === 'point') {
      geom = {
        type: 'Point',
        coordinates: drawingCoordinates[0],
      };
    } else if (drawingMode === 'linestring') {
      if (drawingCoordinates.length < 2) return null;
      geom = {
        type: 'LineString',
        coordinates: drawingCoordinates,
      };
    } else if (drawingMode === 'polygon') {
      if (drawingCoordinates.length < 3) return null;
      const ring = [...drawingCoordinates];
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0]);
      }
      geom = {
        type: 'Polygon',
        coordinates: [ring],
      };
    }
    setCompletedGeometry(geom);
    setDrawingMode('idle');
    return geom;
  }, [drawingMode, drawingCoordinates]);

  const cancelDrawing = useCallback(() => {
    setDrawingMode('idle');
    setDrawingCoordinates([]);
  }, []);

  const setNotificationRadiusKm = useCallback((radius: number) => {
    const capped = Math.min(Math.max(1, radius), 30);
    setNotificationRadiusKmState(capped);
  }, []);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const mapCenterRef = useRef(mapCenter);
  mapCenterRef.current = mapCenter;
  const notificationRadiusKmRef = useRef(notificationRadiusKm);
  notificationRadiusKmRef.current = notificationRadiusKm;

  // ── Fetch Notifications (stable reference, reads latest via refs) ───────────
  const refreshNotifications = useCallback(() => {
    const loc = userLocationRef.current;
    const center = mapCenterRef.current;
    fetchNotifications({
      lat: loc ? loc[0] : center[0],
      lon: loc ? loc[1] : center[1],
      radius_km: notificationRadiusKmRef.current,
    })
      .then((data) => {
        if (Array.isArray(data)) {
          setNotifications((prev) => {
            const readMap = new Map<string, boolean>();
            prev.forEach((n) => {
              if (n.is_read) readMap.set(String(n.incident_id || n.id), true);
            });

            const uniqueMap = new Map<string, NotificationDTO>();
            data.forEach((n) => {
              const key = String(n.incident_id || n.id);
              if (!uniqueMap.has(key)) {
                uniqueMap.set(key, {
                  ...n,
                  is_read: n.is_read || readMap.get(key) || false,
                });
              }
            });
            return Array.from(uniqueMap.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, 30_000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);


  const markAsRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await deleteNotificationApi(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(async () => {
    await clearAllNotificationsApi();
    setNotifications([]);
  }, []);

  const unreadNotificationsCount = useMemo(() =>
    notifications.filter(n => !n.is_read).length,
  [notifications]);

  // ── Computed Scale Level ──────────────────────────────────────────────────
  const scaleLevel = useMemo<ScaleLevel>(() => {
    if (mapZoom <= 3.5) return 'globe';
    if (mapZoom <= 6.5) return 'continent';
    if (mapZoom <= 9.5) return 'country';
    if (mapZoom <= 12.5) return 'city';
    if (mapZoom <= 15.5) return 'neighborhood';
    if (mapZoom <= 18) return 'street';
    return 'point';
  }, [mapZoom]);

  // ── Haptics ───────────────────────────────────────────────────────────────
  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' | 'success' = 'light') => {
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(10);
    else if (type === 'medium') navigator.vibrate(25);
    else if (type === 'heavy') navigator.vibrate([30, 20, 30]);
    else navigator.vibrate([15, 30, 40]);
  }, []);

  // ── Fetch incidents from real API (Backend is the single source of truth) ───
  const fetchRef = useRef<AbortController | null>(null);

  const refreshIncidents = useCallback(async () => {
    fetchRef.current?.abort();
    fetchRef.current = new AbortController();
    setIsLoadingIncidents(true);
    try {
      const data = await fetchIncidents({ status: 'active' });
      if (data && Array.isArray(data.incidents)) {
        setIncidents((prev) => {
          const map = new Map<string, IncidentDTO>();

          // 1. Authoritative active incidents from Neon SQL backend
          data.incidents.forEach((i) => {
            if (i && i.status === 'active' && !isFakeSeedIncident(i)) {
              const [safeLat, safeLon] = normalizeCoords(i.latitude, i.longitude);
              map.set(i.id, { ...i, latitude: safeLat, longitude: safeLon });
            }
          });

          // 2. Preserve ONLY recently created local optimistic incidents awaiting server confirmation
          prev.forEach((i) => {
            if (i && i.id.startsWith('inc_local_') && Date.now() - new Date(i.created_at).getTime() < 15_000) {
              map.set(i.id, i);
            }
          });

          const merged = Array.from(map.values());
          saveStoredIncidents(merged);
          return merged;
        });

        // 3. Keep selectedIncident synchronized in real time with Neon SQL counts
        setSelectedIncident((prevSelected) => {
          if (!prevSelected) return null;
          const fresh = data.incidents.find((i) => i.id === prevSelected.id);
          if (!fresh || fresh.status !== 'active') {
            // The incident was resolved or deleted: close the sheet
            return null;
          }
          const [safeLat, safeLon] = normalizeCoords(fresh.latitude, fresh.longitude);
          return { ...prevSelected, ...fresh, latitude: safeLat, longitude: safeLon };
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Incident fetch notice:', err);
      }
    } finally {
      setIsLoadingIncidents(false);
    }
  }, []);

  // Cross-tab broadcast channel for instantaneous 0ms sync on same device
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('safety_instant_sync');
      ch.onmessage = (ev) => {
        if (ev.data?.type === 'REFRESH_INCIDENTS') {
          refreshIncidents();
        }
      };
      syncChannelRef.current = ch;
      return () => {
        try { ch.close(); } catch {}
      };
    }
  }, [refreshIncidents]);

  // Load on mount + rapid 4s polling for multi-user live sync + trigger on app focus
  useEffect(() => {
    refreshIncidents();
    const interval = setInterval(refreshIncidents, 4_000);

    const handleWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshIncidents();
      }
    };
    window.addEventListener('focus', handleWakeup);
    window.addEventListener('online', handleWakeup);
    document.addEventListener('visibilitychange', handleWakeup);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleWakeup);
      window.removeEventListener('online', handleWakeup);
      document.removeEventListener('visibilitychange', handleWakeup);
      fetchRef.current?.abort();
    };
  }, [refreshIncidents]);

  // ── Deep Linking: ?incident=<id> ──────────────────────────────────────────
  const deepLinkProcessedRef = useRef(false);
  useEffect(() => {
    if (deepLinkProcessedRef.current || incidents.length === 0) return;
    if (typeof window === 'undefined') return;

    try {
      const params = new URLSearchParams(window.location.search);
      const incidentId = params.get('incident');
      if (incidentId) {
        const found = incidents.find(i => i.id === incidentId);
        if (found) {
          deepLinkProcessedRef.current = true;
          setSelectedIncident(found);
          setMapCenterState([found.latitude, found.longitude]);
          setMapZoomState(16.5);
          setMapPitchState(0);
          hapticFeedback('medium');
        }
      }
    } catch {}
  }, [incidents, hapticFeedback]);

  // ── Fetch favorites ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchFavorites(sessionId)
      .then(setFavorites)
      .catch(() => setFavorites([]));
  }, [sessionId]);

  // ── GPS Ref & Multi-Stage Resilient Acquisition ────────────────────────────
  const watchIdRef = useRef<number | null>(null);
  const locatingTimeoutRef = useRef<any>(null);

  const applyGpsPosition = useCallback(
    (pos: GeolocationPosition, silent = false, forceRecenter = true) => {
      if (locatingTimeoutRef.current) {
        clearTimeout(locatingTimeoutRef.current);
        locatingTimeoutRef.current = null;
      }
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setUserLocation(coords);
      setGpsAccuracyMeters(pos.coords.accuracy || 15);
      setGpsState('granted');
      if (forceRecenter) {
        setMapCenterState([...coords]);
        setMapZoomState(16.2); // Natural street level view
        setMapPitchState(35);  // Smooth, balanced 3D perspective
        setCameraNonce((n) => n + 1);
      }
      if (!silent) {
        hapticFeedback('success');
      }
    },
    [hapticFeedback]
  );

  const requestUserLocation = useCallback(
    (opts?: { silent?: boolean; forceRecenter?: boolean }) => {
      const silent = opts?.silent ?? false;
      const forceRecenter = opts?.forceRecenter ?? true;

      if (!navigator.geolocation) {
        setGpsState('unavailable');
        return;
      }

      // If user location is ALREADY known: IMMEDIATELY glide right to user location!
      // Zero lag, zero stutter, zero redundant re-renders.
      if (userLocation && forceRecenter) {
        setGpsState('granted');
        setMapCenterState([...userLocation]);
        setMapZoomState(16.2);
        setMapPitchState(35);
        setCameraNonce((n) => n + 1);
        if (!silent) hapticFeedback('success');
        return;
      }

      // First-time location request (userLocation is null):
      setGpsState('locating');
      if (!silent) hapticFeedback('medium');

      const handleSuccess = (pos: GeolocationPosition) => {
        applyGpsPosition(pos, silent, forceRecenter);
      };

      // Resilient 2-stage acquisition:
      // Try high accuracy with 7s timeout
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (err1) => {
          console.warn('[Safety GPS] High accuracy notice (code %d): %s', err1.code, err1.message);
          if (err1.code === 1 /* PERMISSION_DENIED */) {
            setGpsState('denied');
            return;
          }

          // Fallback immediately to network/Wi-Fi triangulation (resolves in <100ms)
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            (err2) => {
              console.warn('[Safety GPS] Network fallback notice (code %d): %s', err2.code, err2.message);
              if (err2.code === 1 /* PERMISSION_DENIED */) {
                setGpsState('denied');
              } else {
                setGpsState(userLocation ? 'granted' : 'unavailable');
              }
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
          );
        },
        { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 }
      );

      // Continuous Live Walk Tracking via watchPosition
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }

      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (freshPos) => {
            const freshCoords: [number, number] = [freshPos.coords.latitude, freshPos.coords.longitude];
            setUserLocation(freshCoords);
            setGpsAccuracyMeters(freshPos.coords.accuracy || 15);
            setGpsState('granted');
          },
          () => {}, // Silent background watch errors
          { enableHighAccuracy: false, maximumAge: 15000 }
        );
      } catch {}
    },
    [userLocation, hapticFeedback, applyGpsPosition]
  );

  // Clear background watchPosition & locating timer on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }
      if (locatingTimeoutRef.current) {
        clearTimeout(locatingTimeoutRef.current);
        locatingTimeoutRef.current = null;
      }
    };
  }, []);

  // ── Auto-Detect Geolocation on App Mount if already granted ────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (status.state === 'granted') {
            // Already authorized from previous visit -> auto-locate silently!
            requestUserLocation({ silent: true, forceRecenter: true });
          } else if (status.state === 'denied') {
            setGpsState('denied');
          }

          status.onchange = () => {
            if (status.state === 'granted') {
              requestUserLocation({ silent: false, forceRecenter: true });
            } else if (status.state === 'denied') {
              setGpsState('denied');
            }
          };
        })
        .catch(() => {});
    }
  }, [requestUserLocation]);

  // ── Map Camera Controls ───────────────────────────────────────────────────
  const setMapCenter = useCallback((coords: [number, number], zoom?: number) => {
    setMapCenterState(coords);
    if (zoom !== undefined) setMapZoomState(zoom);
  }, []);

  const setMapZoom = useCallback((z: number) => {
    setMapZoomState(z);
  }, []);

  const setMapCamera = useCallback((opts: CameraOptions) => {
    if (opts.center) setMapCenterState(opts.center);
    if (opts.zoom !== undefined) setMapZoomState(opts.zoom);
    if (opts.pitch !== undefined) setMapPitchState(opts.pitch);
    if (opts.bearing !== undefined) setMapBearingState(opts.bearing);
    setCameraNonce((n) => n + 1);
  }, []);

  const toggleGlobeMode = useCallback(() => {
    setIsGlobeMode((prev) => !prev);
    hapticFeedback('medium');
  }, [hapticFeedback]);

  const togglePitch = useCallback(() => {
    setMapPitchState((prev) => (prev > 15 ? 0 : 55));
    hapticFeedback('light');
  }, [hapticFeedback]);

  // ── Filter controls ───────────────────────────────────────────────────────
  const updateFilters = useCallback((partial: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // ── Filtered Incidents ────────────────────────────────────────────────────
  const filteredIncidents = useMemo(() => {
    const nowMs = Date.now();
    return incidents.filter((inc) => {
      if (inc.status !== 'active') return false;
      // If category is toggled off (hidden by user), hide it from map
      if (filters.hiddenCategories && filters.hiddenCategories.includes(inc.category)) return false;
      if (filters.selectedCategories.length > 0 && !filters.selectedCategories.includes(inc.category)) return false;
      if (filters.minSeverity !== 'all') {
        const rank = { low: 1, medium: 2, high: 3, critical: 4 };
        if ((rank[inc.severity as keyof typeof rank] ?? 1) < (rank[filters.minSeverity as keyof typeof rank] ?? 1)) return false;
      }
      if (filters.onlyLive && nowMs - new Date(inc.created_at).getTime() > 3_600_000) return false;
      return true;
    });
  }, [incidents, filters]);

  // ── Incident mutations ────────────────────────────────────────────────────
  const submitIncident = useCallback(async (payload: CreateIncidentPayload) => {
    hapticFeedback('heavy');

    const [safeLat, safeLon] = normalizeCoords(payload.latitude, payload.longitude);

    // Call backend moderation and creation pipeline first
    try {
      const serverResult = await createIncident({ ...payload, latitude: safeLat, longitude: safeLon });
      if (serverResult && serverResult.id) {
        const [sLat, sLon] = normalizeCoords(serverResult.latitude, serverResult.longitude);
        const sanitizedResult = { ...serverResult, latitude: sLat, longitude: sLon };

        setIncidents((prev) => {
          const next = [sanitizedResult, ...prev.filter((i) => i.id !== serverResult.id)];
          saveStoredIncidents(next);
          return next;
        });

        setMyIncidentIds((prev) => {
          const next = [...prev.filter((id) => id !== serverResult.id), serverResult.id];
          saveMyIncidentIds(next);
          return next;
        });

        setMapCenterState([safeLat, safeLon]);
        setMapZoomState(16.5);
        setCameraNonce((n) => n + 1);
        hapticFeedback('success');
        refreshNotifications();
      }
    } catch (apiErr: any) {
      // If content was blocked by moderation, strictly rethrow and NEVER publish to local state/map!
      if (apiErr?.isModerationBlocked) {
        throw apiErr;
      }

      // If purely an offline network issue, allow local offline mode
      if (!navigator.onLine) {
        const localId = 'inc-offline-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        const localIncident: IncidentDTO = {
          id: localId,
          category: payload.category,
          title: payload.title,
          description: payload.description || '',
          latitude: safeLat,
          longitude: safeLon,
          address: payload.address || 'Position repérée (hors-ligne)',
          neighborhood: payload.neighborhood || '',
          city: payload.city || 'Local',
          severity: payload.severity || 'medium',
          status: 'active',
          confirmations_count: 1,
          disputes_count: 0,
          is_anonymous: payload.is_anonymous ?? true,
          author_pseudonym: payload.is_anonymous ? 'Citoyen vigilant' : 'Utilisateur Safety',
          geometry_type: payload.geometry_type || 'Point',
          geojson_geometry: payload.geojson_geometry,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
          estimated_duration: payload.estimated_duration || '2 h',
          time_slot_relevance: 'all',
        };

        setIncidents((prev) => {
          const next = [localIncident, ...prev.filter((i) => i.id !== localId)];
          saveStoredIncidents(next);
          return next;
        });

        setMapCenterState([safeLat, safeLon]);
        setMapZoomState(16.5);
        setCameraNonce((n) => n + 1);
        return;
      }

      throw apiErr;
    }
  }, [hapticFeedback, refreshNotifications]);

  const [userVotes, setUserVotes] = useState<Record<string, 'confirm' | 'dispute'>>(() => {
    try {
      const raw = localStorage.getItem('safety_user_votes_v1');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const saveUserVotes = (votes: Record<string, 'confirm' | 'dispute'>) => {
    try {
      localStorage.setItem('safety_user_votes_v1', JSON.stringify(votes));
    } catch {}
  };

  const handleConfirm = useCallback(async (id: string) => {
    hapticFeedback('medium');
    const currentVote = userVotes[id] || 'none';
    const newVote = currentVote === 'confirm' ? 'none' : 'confirm';

    // Mise à jour optimiste synchrone
    setIncidents((prev) => {
      const next = prev.map((inc) => {
        if (inc.id !== id) return inc;
        let confirms = inc.confirmations_count;
        let disputes = inc.disputes_count;

        if (currentVote === 'confirm') confirms = Math.max(0, confirms - 1);
        if (currentVote === 'dispute') disputes = Math.max(0, disputes - 1);

        if (newVote === 'confirm') confirms += 1;

        return { ...inc, confirmations_count: confirms, disputes_count: disputes };
      });
      saveStoredIncidents(next);
      return next;
    });

    const nextVotes = { ...userVotes };
    if (newVote === 'none') delete nextVotes[id];
    else nextVotes[id] = newVote;
    setUserVotes(nextVotes);
    saveUserVotes(nextVotes);

    try {
      const updated = await voteIncidentApi(id, { vote_type: newVote, previous_vote: currentVote, session_id: sessionId });
      if (updated && updated.id) {
        if (updated.status === 'resolved') {
          setIncidents((prev) => {
            const next = prev.filter((i) => i.id !== id);
            saveStoredIncidents(next);
            return next;
          });
          setSelectedIncident(null);
        } else {
          setIncidents((prev) => {
            const next = prev.map((i) => (i.id === id ? updated : i));
            saveStoredIncidents(next);
            return next;
          });
          setSelectedIncident((prev) => (prev?.id === id ? updated : prev));
        }
      }
    } catch (err) {
      console.warn('Erreur synchronisation vote:', err);
    }
  }, [userVotes, hapticFeedback, sessionId]);

  const handleDispute = useCallback(async (id: string) => {
    hapticFeedback('medium');
    const currentVote = userVotes[id] || 'none';
    const newVote = currentVote === 'dispute' ? 'none' : 'dispute';

    // Mise à jour optimiste synchrone
    setIncidents((prev) => {
      const next = prev.map((inc) => {
        if (inc.id !== id) return inc;
        let confirms = inc.confirmations_count;
        let disputes = inc.disputes_count;

        if (currentVote === 'confirm') confirms = Math.max(0, confirms - 1);
        if (currentVote === 'dispute') disputes = Math.max(0, disputes - 1);

        if (newVote === 'dispute') disputes += 1;

        return { ...inc, confirmations_count: confirms, disputes_count: disputes };
      });
      saveStoredIncidents(next);
      return next;
    });

    const nextVotes = { ...userVotes };
    if (newVote === 'none') delete nextVotes[id];
    else nextVotes[id] = newVote;
    setUserVotes(nextVotes);
    saveUserVotes(nextVotes);

    try {
      const updated = await voteIncidentApi(id, { vote_type: newVote, previous_vote: currentVote, session_id: sessionId });
      if (updated && updated.id) {
        if (updated.status === 'resolved') {
          setIncidents((prev) => {
            const next = prev.filter((i) => i.id !== id);
            saveStoredIncidents(next);
            return next;
          });
          setSelectedIncident(null);
        } else {
          setIncidents((prev) => {
            const next = prev.map((i) => (i.id === id ? updated : i));
            saveStoredIncidents(next);
            return next;
          });
          setSelectedIncident((prev) => (prev?.id === id ? updated : prev));
        }
      }
    } catch (err) {
      console.warn('Erreur synchronisation vote:', err);
    }
  }, [userVotes, hapticFeedback, sessionId]);

  const handleResolve = useCallback(async (id: string) => {
    hapticFeedback('success');
    setIncidents((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveStoredIncidents(next);
      return next;
    });
    setSelectedIncident(null);
    try {
      await resolveIncident(id);
      syncChannelRef.current?.postMessage({ type: 'REFRESH_INCIDENTS' });
      refreshIncidents();
    } catch (e) {
      console.warn('Resolve fallback notice:', e);
    }
  }, [hapticFeedback, refreshIncidents]);

  const handleDelete = useCallback(async (id: string) => {
    hapticFeedback('heavy');
    setIncidents((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveStoredIncidents(next);
      return next;
    });
    setMyIncidentIds((prev) => {
      const next = prev.filter((myId) => myId !== id);
      saveMyIncidentIds(next);
      return next;
    });
    if (selectedIncident?.id === id) setSelectedIncident(null);
    try {
      await deleteIncident(id);
      refreshIncidents();
    } catch (e) {
      console.warn('Delete fallback notice:', e);
    }
  }, [hapticFeedback, selectedIncident, refreshIncidents]);

  // ── Favorites ─────────────────────────────────────────────────────────────
  const addFavorite = useCallback(async (params: {
    name: string; placeType?: string; address?: string;
    latitude: number; longitude: number; notifyRadiusM?: number;
  }) => {
    const fav = await createFavorite({
      session_id: sessionId,
      name: params.name,
      place_type: params.placeType || 'other',
      address: params.address,
      latitude: params.latitude,
      longitude: params.longitude,
      notify_radius_m: params.notifyRadiusM || 500,
    });
    setFavorites((prev) => [...prev, fav]);
    hapticFeedback('success');
  }, [sessionId, hapticFeedback]);

  const removeFavorite = useCallback(async (id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    await deleteFavorite(id, sessionId);
    hapticFeedback('light');
  }, [sessionId, hapticFeedback]);

  // ── Walk With Me (Mode Trajet Sécurisé) State & Engine ─────────────────────
  const [walkSession, setWalkSession] = useState<WalkSession | null>(null);

  const startWalkSession = useCallback((params: {
    destinationName: string;
    destinationCoords: [number, number];
    estimatedMinutes: number;
    contactName?: string;
    contactPhone?: string;
  }) => {
    const now = Date.now();
    const targetArrival = now + params.estimatedMinutes * 60 * 1000;
    const currentLoc = userLocationRef.current || [48.8566, 2.3522];

    const session: WalkSession = {
      id: `walk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: 'active',
      destinationName: params.destinationName,
      destinationCoords: params.destinationCoords,
      startCoords: currentLoc,
      estimatedMinutes: params.estimatedMinutes,
      startedAt: now,
      targetArrivalTimestamp: targetArrival,
      contactName: params.contactName,
      contactPhone: params.contactPhone,
      safetyCheckPending: false,
      checkDeadlineSeconds: 45,
      isSirenActive: false,
    };

    setWalkSession(session);
    setActiveModal('walk');
    hapticFeedback('success');

    // Pan map smoothly to frame the journey
    const midLat = (currentLoc[0] + params.destinationCoords[0]) / 2;
    const midLng = (currentLoc[1] + params.destinationCoords[1]) / 2;
    setMapCenterState([midLat, midLng]);
    setMapZoomState(15.2);
    setCameraNonce((n) => n + 1);
  }, [hapticFeedback]);

  const confirmSafetyCheck = useCallback(() => {
    hapticFeedback('success');
    stopEmergencySiren();
    setWalkSession((prev) => {
      if (!prev) return null;
      const now = Date.now();
      const newTarget = Math.max(prev.targetArrivalTimestamp, now + 5 * 60 * 1000);
      return {
        ...prev,
        status: 'active',
        safetyCheckPending: false,
        checkDeadlineSeconds: 45,
        targetArrivalTimestamp: newTarget,
        isSirenActive: false,
      };
    });
  }, [hapticFeedback]);

  const triggerWalkAlert = useCallback(() => {
    hapticFeedback('heavy');
    playEmergencySiren();
    setWalkSession((prev) => prev ? { ...prev, status: 'alert', isSirenActive: true } : null);
  }, [hapticFeedback]);

  const toggleWalkSiren = useCallback(() => {
    setWalkSession((prev) => {
      if (!prev) return null;
      const nextActive = !prev.isSirenActive;
      if (nextActive) {
        playEmergencySiren();
        hapticFeedback('heavy');
      } else {
        stopEmergencySiren();
        hapticFeedback('medium');
      }
      return { ...prev, isSirenActive: nextActive };
    });
  }, [hapticFeedback]);

  const endWalkSession = useCallback((status: 'arrived' | 'idle' = 'idle') => {
    stopEmergencySiren();
    if (status === 'arrived') {
      hapticFeedback('success');
      setWalkSession((prev) => prev ? { ...prev, status: 'arrived', isSirenActive: false } : null);
      setTimeout(() => {
        setWalkSession(null);
        setActiveModal(null);
      }, 3500);
    } else {
      hapticFeedback('medium');
      setWalkSession(null);
      setActiveModal(null);
    }
  }, [hapticFeedback]);

  // Live countdown & arrival watcher
  useEffect(() => {
    if (!walkSession || walkSession.status !== 'active') return;

    const interval = setInterval(() => {
      setWalkSession((prev) => {
        if (!prev || prev.status !== 'active') return prev;

        const now = Date.now();
        const currentLoc = userLocationRef.current;

        // Auto arrival check (< 45 meters)
        if (currentLoc) {
          const distM = calculateDistance(
            currentLoc[0],
            currentLoc[1],
            prev.destinationCoords[0],
            prev.destinationCoords[1]
          );
          if (distM < 45) {
            stopEmergencySiren();
            hapticFeedback('success');
            setTimeout(() => {
              setWalkSession(null);
              setActiveModal(null);
            }, 3500);
            return { ...prev, status: 'arrived', isSirenActive: false };
          }
        }

        // Safety check deadline countdown (User has 30s to confirm they are safe)
        if (prev.safetyCheckPending) {
          const nextDeadline = prev.checkDeadlineSeconds - 1;
          if (nextDeadline <= 0) {
            playEmergencySiren();
            hapticFeedback('heavy');

            // 🚨 Automatic Emergency Call Trigger (Police 17 or contact number)
            const emergencyPhone = prev.contactPhone?.trim() || '17';
            try {
              window.location.href = `tel:${emergencyPhone}`;
            } catch {}

            try {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('🚨 URGENCE : Aucune confirmation reçue', {
                  body: `L'alerte d'urgence a été déclenchée. Appel vers le ${emergencyPhone} en cours.`,
                  icon: '/favicon.ico',
                  tag: 'safety-sos-triggered',
                });
              }
            } catch {}

            return {
              ...prev,
              status: 'alert',
              safetyCheckPending: false,
              checkDeadlineSeconds: 0,
              isSirenActive: true,
            };
          }
          return { ...prev, checkDeadlineSeconds: nextDeadline };
        }

        // Trigger safety check prompt if estimated walking time expired
        if (now >= prev.targetArrivalTimestamp && !prev.safetyCheckPending) {
          hapticFeedback('heavy');
          playWarningBeep();

          try {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🚨 Contrôle de sécurité Safety', {
                body: `Votre temps estimé vers « ${prev.destinationName} » est écoulé. Confirmez votre sécurité sous 30s.`,
                icon: '/favicon.ico',
                tag: 'safety-arrival-check',
              });
            }
          } catch {}

          return {
            ...prev,
            safetyCheckPending: true,
            checkDeadlineSeconds: 30,
          };
        }

        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [walkSession?.status, hapticFeedback]);

  return (
    <SafetyContext.Provider value={{
      incidents, filteredIncidents, favorites, notifications, unreadNotificationsCount,
      notificationRadiusKm, setNotificationRadiusKm,
      isLoadingIncidents,
      userLocation, gpsAccuracyMeters, gpsState,
      mapCenter, mapZoom, mapPitch, mapBearing, isGlobeMode, scaleLevel, cameraNonce,
      selectedIncident, selectedLocation, activeModal, filters,
      drawingMode, drawingCategory, drawingOrigin, drawingCoordinates, completedGeometry,
      startDrawing, addDrawingVertex, setDrawingCoordinates, undoDrawingVertex, clearDrawing, finishDrawing, cancelDrawing, setCompletedGeometry,
      sessionId, myIncidentIds,
      isHeatmapMode, setIsHeatmapMode, toggleHeatmapMode,
      setMapCenter, setMapZoom, setMapCamera, toggleGlobeMode, togglePitch,
      requestUserLocation,
      setSelectedIncident, setSelectedLocation,
      setActiveModal, updateFilters, resetFilters,
      hapticFeedback, refreshIncidents, refreshNotifications, markAsRead,
      deleteNotification, clearAllNotifications,
      submitIncident, handleConfirm, handleDispute, handleResolve, handleDelete, userVotes,
      addFavorite, removeFavorite,
      walkSession, startWalkSession, confirmSafetyCheck, triggerWalkAlert, toggleWalkSiren, endWalkSession,
    }}>
      {children}
    </SafetyContext.Provider>
  );
};

export const useSafety = () => {
  const ctx = useContext(SafetyContext);
  if (!ctx) throw new Error('useSafety must be used within SafetyProvider');
  return ctx;
};
