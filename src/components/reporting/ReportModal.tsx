import React, { useState, useEffect, useEffectEvent } from 'react';
import type { LineString } from 'geojson';
import {
  X, MapPin, Send, EyeOff, CheckCircle2, Loader2, Sparkles,
  ListFilter, AlertTriangle, Navigation, Search, Check,
  Route, Pentagon, Edit3, Trash2, ShieldAlert
} from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import {
  categoryColors, categoryIcons, categoryLabels,
  categoryRecommendedGeometry, defaultSeverity
} from '../../design/tokens';
import { reverseGeocode, fetchStreetGeometry, searchPlaces, type GeocodedPlace } from '../../api/geocodingApi';
import { classifyIncidentText, type ClassifiedIncidentDTO } from '../../api/incidentApi';
import { evaluateContentModeration } from '../../services/contentModerationService';
import type { GeoJSONGeometry, GeometryType, IncidentCategory } from '../../types/safety';
import { ApiError } from '../../api/client';

/** Representative [lat, lon] of a drawn geometry (point, middle vertex, or ring centroid). */
function geometryCentroid(geom: GeoJSONGeometry, fallback: [number, number]): [number, number] {
  if (geom.type === 'Point') {
    return [geom.coordinates[1], geom.coordinates[0]];
  }
  if (geom.type === 'LineString' && geom.coordinates.length > 0) {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
    return [mid[1], mid[0]];
  }
  if (geom.type === 'Polygon' && geom.coordinates[0]?.length) {
    const ring = geom.coordinates[0];
    const sum = ring.reduce((acc, pt) => [acc[0] + pt[1], acc[1] + pt[0]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  return fallback;
}

/** A reverse-geocoding job; `id` changes for every new request so stale answers are ignored. */
interface GeocodeRequest {
  id: number;
  coords: [number, number];
  withStreetGeometry: boolean;
  keepExisting: boolean;
}

const CATEGORIES = Object.keys(categoryLabels) as IncidentCategory[];

const SEV_COLORS: Record<string, string> = {
  low: 'border-s-green text-s-green bg-green-50',
  medium: 'border-s-amber text-s-amber bg-amber-50',
  high: 'border-s-danger text-s-danger bg-red-50',
  critical: 'border-s-critical text-s-critical bg-red-100',
};

export const ReportModal: React.FC = () => {
  const {
    activeModal, setActiveModal, userLocation, selectedLocation,
    mapCenter, submitIncident, requestUserLocation, hapticFeedback,
    drawingMode, startDrawing, completedGeometry, setCompletedGeometry,
  } = useSafety();

  const [inputMode, setInputMode] = useState<'ai_custom' | 'manual'>('ai_custom');
  const [customText, setCustomText] = useState('');
  // Latest AI classification, keyed by the text it was computed from
  const [classified, setClassified] = useState<{ text: string; result: ClassifiedIncidentDTO } | null>(null);

  const [locationChoice, setLocationChoice] = useState<'gps' | 'custom'>('gps');
  const [searchQuery, setSearchQuery] = useState('');
  // Last completed custom address search, keyed by the query it answers
  const [placeSearch, setPlaceSearch] = useState<{ query: string; places: GeocodedPlace[] }>({ query: '', places: [] });

  const [category, setCategory] = useState<IncidentCategory>('danger');
  const [geometryType, setGeometryType] = useState<GeometryType>('Point');
  const [severity, setSeverity] = useState('medium');
  const [duration, setDuration] = useState('2 h');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [targetCoords, setTargetCoords] = useState<[number, number]>([48.8566, 2.3522]);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [geocodeRequest, setGeocodeRequest] = useState<GeocodeRequest | null>(null);
  const [geocodedId, setGeocodedId] = useState<number | null>(null);
  const isGeocoding = geocodeRequest !== null && geocodedId !== geocodeRequest.id;
  const [streetGeometry, setStreetGeometry] = useState<LineString | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [moderationBlockedState, setModerationBlockedState] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // Real-time zero-tolerance content moderation evaluation
  const liveModeration = evaluateContentModeration(customText);

  // Point the form at new coordinates and (re)fill street / neighborhood / city
  const locateAt = (coords: [number, number], opts: { withStreetGeometry?: boolean; keepExisting?: boolean } = {}) => {
    setTargetCoords(coords);
    setGeocodeRequest((prev) => ({
      id: (prev?.id ?? 0) + 1,
      coords,
      withStreetGeometry: opts.withStreetGeometry ?? false,
      keepExisting: opts.keepExisting ?? false,
    }));
  };

  // Reverse geocoding of the current request (latest request wins)
  useEffect(() => {
    if (!geocodeRequest) return;
    let cancelled = false;
    const { id, coords, withStreetGeometry, keepExisting } = geocodeRequest;
    (async () => {
      try {
        const g = await reverseGeocode(coords[0], coords[1]);
        if (cancelled) return;
        if (!keepExisting || g.street) setAddress(g.street);
        if (!keepExisting || g.neighborhood) setNeighborhood(g.neighborhood);
        if (!keepExisting || g.city) setCity(g.city);
        if (withStreetGeometry && g.street && g.street !== 'Position GPS' && g.street !== 'Position repérée') {
          const geom = await fetchStreetGeometry(g.street, coords[0], coords[1], 600);
          if (!cancelled) setStreetGeometry(geom);
        }
      } catch (err) {
        console.warn('Geocoding notice:', err);
      } finally {
        if (!cancelled) setGeocodedId(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geocodeRequest]);

  // On each opening of the form (without a drawn geometry): start from the GPS position.
  // Done when the mode switches, not on every GPS tick / map move (that used to overwrite
  // the address the user had just picked).
  const gpsMode = activeModal === 'report' && !completedGeometry;
  const [wasGpsMode, setWasGpsMode] = useState(false);
  if (gpsMode !== wasGpsMode) {
    setWasGpsMode(gpsMode);
    if (gpsMode) {
      setLocationChoice('gps');
      if (userLocation) locateAt(userLocation, { withStreetGeometry: true });
    }
  }

  // Then refine with a fresh GPS fix (high accuracy, network fallback, then map position)
  const onFreshFix = useEffectEvent((coords: [number, number]) => locateAt(coords, { withStreetGeometry: true }));
  const onNoFix = useEffectEvent(() => {
    if (userLocation) return;
    const fallback: [number, number] = selectedLocation
      ? [selectedLocation.latitude, selectedLocation.longitude]
      : mapCenter;
    locateAt(fallback, { withStreetGeometry: true });
  });

  useEffect(() => {
    if (!gpsMode) return;
    let cancelled = false;
    if (!navigator.geolocation) {
      const timer = setTimeout(() => onNoFix(), 0);
      return () => clearTimeout(timer);
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) onFreshFix([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        console.warn('[ReportModal] High-accuracy GPS notice:', err.message);
        // Fallback to network/cell geolocation
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            if (!cancelled) onFreshFix([pos2.coords.latitude, pos2.coords.longitude]);
          },
          () => {
            if (!cancelled) onNoFix();
          },
          { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 15000 }
    );
    return () => {
      cancelled = true;
    };
  }, [gpsMode]);

  // When a drawn geometry is attached (from MapControls tracer or modal button):
  // sync geometryType, move to its centroid and reverse geocode it (once per geometry).
  const [syncedGeometry, setSyncedGeometry] = useState<GeoJSONGeometry | null>(null);
  if (activeModal === 'report' && completedGeometry && completedGeometry !== syncedGeometry) {
    setSyncedGeometry(completedGeometry);
    setGeometryType(completedGeometry.type);
    locateAt(geometryCentroid(completedGeometry, targetCoords), { keepExisting: true });
  }

  // Sync recommended geometry when category changes
  const handleCategoryChange = (newCat: IncidentCategory) => {
    setCategory(newCat);
    setSeverity(defaultSeverity[newCat] || 'medium');
    const rec = categoryRecommendedGeometry[newCat];
    if (rec) {
      setGeometryType(rec.recommended);
    }
    setValidationError(null);
  };

  // Autocomplete for custom address search (debounced, keyed by query)
  const trimmedSearch = searchQuery.trim();
  const wantsPlaces = locationChoice === 'custom' && trimmedSearch.length >= 2;
  const isSearchingPlace = wantsPlaces && placeSearch.query !== searchQuery;
  const searchResults = wantsPlaces && placeSearch.query === searchQuery ? placeSearch.places : [];

  useEffect(() => {
    if (!wantsPlaces) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let places: GeocodedPlace[] = [];
      try {
        places = await searchPlaces(searchQuery);
      } catch { /* network error: no results */ }
      if (!cancelled) setPlaceSearch({ query: searchQuery, places });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, wantsPlaces]);

  // Live NLP text analysis (debounced). The last result stays shown while typing.
  const trimmedText = customText.trim();
  const wantsClassification = inputMode === 'ai_custom' && trimmedText.length >= 4;
  const aiClassification = wantsClassification ? classified?.result ?? null : null;
  const isClassifying = wantsClassification && classified?.text !== trimmedText;

  useEffect(() => {
    if (!wantsClassification) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await classifyIncidentText(trimmedText);
        if (cancelled) return;
        setClassified({ text: trimmedText, result });
        const mappedCat = result.category as IncidentCategory;
        setCategory(mappedCat);
        setSeverity(result.severity);
        setDuration(result.estimated_duration);
        const rec = categoryRecommendedGeometry[mappedCat];
        if (rec) setGeometryType(rec.recommended);
      } catch (err) {
        console.warn('NLP error:', err);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedText, wantsClassification]);

  if (activeModal !== 'report' || drawingMode !== 'idle') return null;

  const handleSelectCustomPlace = async (place: GeocodedPlace) => {
    hapticFeedback('medium');
    setTargetCoords([place.latitude, place.longitude]);
    setAddress(place.name || place.displayName);
    setNeighborhood(place.neighborhood || '');
    setCity(place.city || '');
    setSearchQuery('');

    if (place.streetName || place.name) {
      const geom = await fetchStreetGeometry(
        place.streetName || place.name,
        place.latitude,
        place.longitude,
        600
      );
      setStreetGeometry(geom);
    }
  };

  const handleStartDrawOnMap = () => {
    hapticFeedback('medium');
    setActiveModal(null); // Temporarily hide report modal
    const mode = geometryType === 'Polygon' ? 'polygon' : geometryType === 'LineString' ? 'linestring' : 'point';
    startDrawing(mode, category, 'report');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // ── STRICT CONTENT MODERATION INTERCEPTION (Racism, Hate Speech, Degrading Language) ──
    const textToCheck = `${customText} ${searchQuery} ${address}`.trim();
    const moderationVerdict = evaluateContentModeration(textToCheck);
    if (moderationVerdict.isBlocked) {
      hapticFeedback('heavy');
      setModerationBlockedState({
        title: moderationVerdict.reasonTitle,
        message: moderationVerdict.reasonMessage,
      });
      return;
    }

    // Validation for category 14 ("Autres situations")
    if (category === 'other' && (!customText.trim() || customText.trim().length < 5)) {
      setValidationError('Veuillez obligatoirement décrire la situation (minimum 5 caractères).');
      hapticFeedback('heavy');
      return;
    }

    setIsSubmitting(true);

    let finalGeojson: string | undefined = undefined;
    let finalGeomType: string = geometryType;

    if (completedGeometry) {
      finalGeojson = JSON.stringify(completedGeometry);
      finalGeomType = completedGeometry.type;
    } else if (geometryType === 'LineString' && streetGeometry) {
      finalGeojson = JSON.stringify(streetGeometry);
      finalGeomType = 'LineString';
    } else if (geometryType === 'Point') {
      finalGeojson = JSON.stringify({
        type: 'Point',
        coordinates: [targetCoords[1], targetCoords[0]], // [lon, lat]
      });
      finalGeomType = 'Point';
    }

    const [finalLatitude, finalLongitude] = completedGeometry
      ? geometryCentroid(completedGeometry, targetCoords)
      : targetCoords;

    const title =
      aiClassification?.title ||
      (customText.trim() ? customText.trim().slice(0, 50) : categoryLabels[category]) ||
      'Signalement citoyen';

    try {
      await submitIncident({
        category,
        title,
        description: customText.trim() || undefined,
        latitude: finalLatitude,
        longitude: finalLongitude,
        address: address || 'Position repérée',
        neighborhood: neighborhood || undefined,
        city: city || undefined,
        severity,
        is_anonymous: isAnonymous,
        estimated_duration: duration,
        time_slot_relevance: 'all',
        geometry_type: finalGeomType,
        geojson_geometry: finalGeojson,
      });

      setCompletedGeometry(null);
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setActiveModal(null);
        setCustomText('');
        setClassified(null);
      }, 280);
    } catch (err) {
      console.error('Failed to submit incident:', err);
      if (err instanceof ApiError && err.isModerationBlocked) {
        hapticFeedback('heavy');
        setModerationBlockedState({
          title: err.moderationTitle || 'Contenu bloqué',
          message:
            err.moderationMessage ||
            'Cette description contient un contenu qui ne respecte pas les règles de Safety. Modifiez votre description afin de pouvoir publier le signalement.',
        });
      } else {
        setValidationError('Erreur lors de la publication. Vérifiez la connexion.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const IconComponent = categoryIcons[category] || AlertTriangle;
  const color = categoryColors[category] || '#EF4444';
  const isStreetBound =
    geometryType === 'LineString' ||
    completedGeometry?.type === 'LineString' ||
    aiClassification?.geometry_type === 'street';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-4xl sm:rounded-4xl shadow-sheet max-h-[92vh] flex flex-col border border-slate-200">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md"
              style={{ background: color }}
            >
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-extrabold text-slate-900 leading-tight">
                Signaler un danger
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Partage citoyen immédiat en 3 clics
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── MODERATION BLOCKED APPLE SYSTEM MODAL VIEW ──────────────── */}
        {moderationBlockedState ? (
          <div className="p-8 flex-1 flex flex-col items-center justify-center text-center animate-scale-in my-auto">
            <div className="relative w-20 h-20 rounded-3xl bg-rose-500/10 border-2 border-rose-500/30 text-rose-600 flex items-center justify-center shadow-lg shadow-rose-950/10 mb-4">
              <ShieldAlert className="w-10 h-10 stroke-[2.2]" />
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
              Protection Citoyenne & Modération Active
            </span>

            <h3 className="text-xl font-black text-slate-900 mb-2">
              {moderationBlockedState.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 max-w-sm mb-6 leading-relaxed">
              {moderationBlockedState.message}
            </p>

            <button
              type="button"
              onClick={() => {
                hapticFeedback('light');
                setModerationBlockedState(null);
              }}
              className="w-full max-w-xs py-3.5 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-island active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              <span>Corriger et modifier le texte</span>
            </button>
          </div>
        ) : (
          <>
            {/* ── Location Toggle: GPS by default vs Custom Address ────────── */}
            <div className="flex gap-2 px-5 pt-3.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setLocationChoice('gps');
              requestUserLocation();
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
              locationChoice === 'gps'
                ? 'bg-blue-50 text-s-primary border-blue-300 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Ma position actuelle</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setLocationChoice('custom');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border ${
              locationChoice === 'custom'
                ? 'bg-blue-50 text-s-primary border-blue-300 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Autre adresse</span>
          </button>
        </div>

        {/* ── Input Tabs (AI vs Category Picker) ───────────────────────── */}
        <div className="flex gap-2 px-5 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setInputMode('ai_custom');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              inputMode === 'ai_custom'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-s-amber" />
            <span>Description libre (IA)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              setInputMode('manual');
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              inputMode === 'manual'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Liste des catégories</span>
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 pt-3">
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-green-50 border border-green-200 flex items-center justify-center animate-scale-in">
                <CheckCircle2 className="w-9 h-9 text-s-green" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-900">Signalement Publié</div>
                <div className="text-xs text-slate-500 mt-1 max-w-xs">
                  {isStreetBound
                    ? 'Le segment vectoriel de la rue est illuminé sur la carte.'
                    : 'Le point d\'impact est visible en direct par les usagers de la zone.'}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              {/* ── Location Details ──────────────────────────────────── */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 block">
                  {locationChoice === 'gps' ? 'Localisation détectée' : 'Adresse sélectionnée'}
                </label>

                {locationChoice === 'custom' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      {isSearchingPlace ? (
                        <Loader2 className="w-4 h-4 text-s-primary animate-spin shrink-0" />
                      ) : (
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Rechercher une rue ou une adresse…"
                        inputMode="search"
                        className="flex-1 bg-transparent outline-none text-[16px] sm:text-xs font-semibold text-slate-900 placeholder-slate-400"
                      />
                    </div>

                    {searchResults.length > 0 && (
                      <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col divide-y divide-slate-100">
                        {searchResults.map((place) => (
                          <button
                            key={place.placeId}
                            type="button"
                            onClick={() => handleSelectCustomPlace(place)}
                            className="p-2 text-left hover:bg-blue-50 flex items-center justify-between text-xs"
                          >
                            <span className="font-semibold text-slate-900 truncate">{place.displayName}</span>
                            <Check className="w-3.5 h-3.5 text-s-primary shrink-0 ml-2" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 mt-1">
                  {isGeocoding ? (
                    <Loader2 className="w-4 h-4 text-s-primary animate-spin shrink-0" />
                  ) : (
                    <MapPin className="w-4 h-4 text-s-primary shrink-0" />
                  )}
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Adresse géocodée"
                    className="flex-1 bg-transparent outline-none text-[16px] sm:text-xs text-slate-900 font-semibold placeholder-slate-400"
                    required
                  />
                </div>
              </div>

              {/* ── Mode 1: AI / NLP Free-Text Input ───────────────────── */}
              {inputMode === 'ai_custom' && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                    <span>Que se passe-t-il ?</span>
                    {isClassifying && (
                      <span className="text-2xs text-s-primary font-bold flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Analyse IA…
                      </span>
                    )}
                  </label>
                  <textarea
                    rows={2}
                    value={customText}
                    onChange={(e) => setCustomText(e.target.value)}
                    placeholder="Ex : 'Bagarre devant le bar', 'Lampadaires en panne', 'Accident à l'angle'…"
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[16px] sm:text-xs font-medium text-slate-900 outline-none resize-none focus:border-s-primary"
                    required
                  />

                  {/* Live Prohibited Content Moderation Warning */}
                  {liveModeration.isBlocked && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex items-start gap-2.5 text-xs animate-scale-in">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-black text-rose-900">Propos interdits par la modération</div>
                        <div className="text-[11px] text-rose-700 mt-0.5 leading-snug">
                          Votre description contient des termes non conformes {liveModeration.detectedWord ? `(« ${liveModeration.detectedWord} »)` : '(discours discriminatoire ou haineux)'}. La publication sera bloquée tant que ces propos ne sont pas retirés.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI Detection Card */}
                  {aiClassification && (
                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 animate-scale-in flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-white shadow-sm"
                          style={{ background: categoryColors[aiClassification.category] }}
                        >
                          {React.createElement(
                            categoryIcons[aiClassification.category] || AlertTriangle,
                            { className: 'w-4 h-4' }
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {categoryLabels[aiClassification.category]}
                          </div>
                          <div className="text-2xs text-slate-500 font-medium">
                            {aiClassification.geometry_type === 'street' ? '🛣️ Coloration de rue' : '📍 Point précis'}
                          </div>
                        </div>
                      </div>

                      <span className={`badge ${SEV_COLORS[aiClassification.severity]}`}>
                        {aiClassification.severity}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Mode 2: Manual Category Grid ──────────────────────── */}
              {inputMode === 'manual' && (
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Sélectionnez la situation (14 Catégories)
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {CATEGORIES.map((cat) => {
                      const Icon = categoryIcons[cat] || AlertTriangle;
                      const catColor = categoryColors[cat] || '#EF4444';
                      const isSelected = category === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            hapticFeedback('light');
                            handleCategoryChange(cat);
                          }}
                          className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                            isSelected
                              ? 'bg-blue-50 border-s-primary shadow-sm ring-1 ring-s-primary'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ background: catColor }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {categoryLabels[cat]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Mandatory Description for 'other' or optional for manual ── */}
              {(category === 'other' || inputMode === 'manual') && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold uppercase tracking-wider ${
                      category === 'other' ? 'text-s-danger' : 'text-slate-700'
                    }`}>
                      {category === 'other' ? 'Décrivez la situation (Obligatoire) *' : 'Détails complémentaires (Optionnel)'}
                    </label>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {customText.length} / 500
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={customText}
                    onChange={(e) => {
                      setCustomText(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder={
                      category === 'other'
                        ? 'Ex : Faisceau laser suspect, affaissement de trottoir, fuite de gaz...'
                        : 'Précisions utiles pour les riverains...'
                    }
                    className={`p-2.5 rounded-xl border text-[16px] sm:text-xs font-medium text-slate-900 outline-none resize-none transition-colors ${
                      category === 'other' && (!customText.trim() || customText.trim().length < 5)
                        ? 'bg-red-50/40 border-red-300 focus:border-s-danger'
                        : 'bg-slate-50 border-slate-200 focus:border-s-primary'
                    }`}
                    required={category === 'other'}
                  />

                  {/* Live Prohibited Content Moderation Warning */}
                  {liveModeration.isBlocked && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex items-start gap-2.5 text-xs animate-scale-in">
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-black text-rose-900">Propos interdits par la modération</div>
                        <div className="text-[11px] text-rose-700 mt-0.5 leading-snug">
                          Votre description contient des termes non conformes {liveModeration.detectedWord ? `(« ${liveModeration.detectedWord} »)` : '(discours discriminatoire ou haineux)'}. La publication sera bloquée.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Vector Geospatial Drawing Engine Trigger ──────────── */}
              <div className="p-3 rounded-2xl bg-blue-50/50 border border-blue-200/80 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-s-primary" />
                    <span className="text-xs font-bold text-slate-900">Format Géospatial & Traçage</span>
                  </div>
                  <span className="text-[10px] font-black uppercase text-s-primary bg-blue-100 px-2 py-0.5 rounded-md">
                    Vectoriel GPU
                  </span>
                </div>

                {/* Geometry Type Selector Chips */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      setGeometryType('Point');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      geometryType === 'Point'
                        ? 'bg-white border-s-primary text-s-primary shadow-xs'
                        : 'bg-slate-100/80 border-slate-200 text-slate-600'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Point</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      setGeometryType('LineString');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      geometryType === 'LineString'
                        ? 'bg-white border-s-primary text-s-primary shadow-xs'
                        : 'bg-slate-100/80 border-slate-200 text-slate-600'
                    }`}
                  >
                    <Route className="w-3 h-3" />
                    <span>Ligne</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      hapticFeedback('light');
                      setGeometryType('Polygon');
                    }}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                      geometryType === 'Polygon'
                        ? 'bg-white border-s-primary text-s-primary shadow-xs'
                        : 'bg-slate-100/80 border-slate-200 text-slate-600'
                    }`}
                  >
                    <Pentagon className="w-3 h-3" />
                    <span>Zone</span>
                  </button>
                </div>

                {/* Attached Completed Geometry Banner */}
                {completedGeometry ? (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-green-200 text-xs text-s-green font-bold shadow-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-4 h-4 text-s-green shrink-0" />
                      <span className="truncate">
                        Tracé vectoriel prêt ({completedGeometry.type})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={handleStartDrawOnMap}
                        className="p-1 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
                        title="Modifier le tracé"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          hapticFeedback('light');
                          setCompletedGeometry(null);
                        }}
                        className="p-1 rounded-lg text-red-400 hover:text-red-600 transition-colors"
                        title="Effacer le tracé"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartDrawOnMap}
                    className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-blue-300 text-xs font-bold text-s-primary flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Tracer directement sur la carte</span>
                  </button>
                )}
              </div>

              {/* ── Validation Error Alert ────────────────────────────── */}
              {validationError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-bold flex items-center gap-2 animate-shake">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{validationError}</span>
                </div>
              )}

              {/* ── Anonymous Privacy Toggle ──────────────────────────── */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-s-primary" />
                  <div>
                    <div className="text-xs font-bold text-slate-900">Publication Anonyme</div>
                    <div className="text-2xs text-slate-500">Aucune donnée personnelle exposée</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAnonymous((v) => !v)}
                  className={`w-10 h-5 rounded-pill transition-all ${
                    isAnonymous ? 'bg-s-primary' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${
                      isAnonymous ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* ── Submit Button ─────────────────────────────────────── */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3.5 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all ${
                  liveModeration.isBlocked
                    ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-950/20 active:scale-98'
                    : 'btn-danger shadow-glow-danger'
                }`}
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : liveModeration.isBlocked ? (
                  <ShieldAlert className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSubmitting
                    ? 'Enregistrement…'
                    : liveModeration.isBlocked
                    ? 'Signalement bloqué (propos interdits)'
                    : 'Confirmer et publier le signalement'}
                </span>
              </button>
            </form>
          )}
        </div>
      </>
    )}
  </div>
</div>
  );
};
