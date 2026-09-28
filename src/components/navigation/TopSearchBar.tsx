import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Loader2, History, Clock, Star, AlertTriangle, Navigation } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { searchPlaces, getSearchHistory, saveSearchToHistory, clearSearchHistory, fetchStreetGeometry } from '../../api/geocodingApi';
import type { GeocodedPlace } from '../../api/geocodingApi';
import { parseNaturalQuery, getIntentLabel } from '../../api/nlpParser';
import { categoryIcons, categoryLabels } from '../../design/tokens';

const FILTER_CATEGORIES = [
  'danger', 'avoid', 'altercation', 'violence', 'lighting', 'harassment', 'burglary',
] as const;

const EXAMPLE_QUERIES = [
  'Y a-t-il des agressions rue de Rivoli ?',
  'Incidents critiques à Lyon',
  'Zone dangereuse dans le 18ème',
  'Aller à la tour Eiffel',
];

export const TopSearchBar: React.FC = () => {
  const {
    filters, updateFilters, setMapCamera, setSelectedLocation,
    setSelectedIncident, setActiveModal, favorites, hapticFeedback,
    filteredIncidents,
  } = useSafety();

  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [history, setHistory] = useState<GeocodedPlace[]>([]);
  const [intentLabel, setIntentLabel] = useState<string | null>(null);
  const [incidentMatches, setIncidentMatches] = useState<typeof filteredIncidents>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isFocused) setHistory(getSearchHistory());
  }, [isFocused]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Moteur NLP + Géocodage ────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      setIntentLabel(null);
      setIncidentMatches([]);
      return;
    }

    // Parsing NLP immédiat (synchrone)
    const parsed = parseNaturalQuery(trimmed);
    setIntentLabel(getIntentLabel(parsed));

    // Filtrage local des incidents si intent = 'incident'
    if (parsed.intent === 'incident') {
      const matches = filteredIncidents.filter(inc => {
        const text = `${inc.title} ${inc.category} ${inc.address || ''} ${inc.description || ''}`.toLowerCase();
        const locNorm = parsed.locationHint.toLowerCase();
        const catMatch = !parsed.categoryHint || inc.category === parsed.categoryHint;
        const sevMatch = !parsed.severityHint || inc.severity === parsed.severityHint;
        const locMatch = !locNorm || text.includes(locNorm) ||
          (inc.address || '').toLowerCase().includes(locNorm);
        return catMatch && sevMatch && (locMatch || !parsed.locationHint);
      });
      setIncidentMatches(matches.slice(0, 5));
    } else {
      setIncidentMatches([]);
    }

    // Géocodage de la partie lieu extraite par NLP
    const geoQuery = parsed.rawQuery.length >= 2 ? parsed.rawQuery : trimmed;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const places = await searchPlaces(geoQuery, ctrl.signal);
      setResults(places);
      setIsSearching(false);
    }, 280);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query, filteredIncidents]);

  const handleSelectPlace = useCallback(async (place: GeocodedPlace) => {
    hapticFeedback('medium');
    saveSearchToHistory(place);
    setHistory(getSearchHistory());
    setQuery('');
    setResults([]);
    setIsFocused(false);
    setIntentLabel(null);
    setIncidentMatches([]);

    setMapCamera({
      center: [place.latitude, place.longitude],
      zoom: 16.8,
      pitch: 42,
      duration: 1800,
    });

    let streetGeometry = null;
    if (place.streetName || place.name) {
      streetGeometry = await fetchStreetGeometry(
        place.streetName || place.name,
        place.latitude,
        place.longitude,
        600
      );
    }

    setSelectedLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
      streetName: place.streetName,
      neighborhood: place.neighborhood,
      city: place.city,
      streetGeometry,
    });
    setSelectedIncident(null);
    setActiveModal('locationDetail');
  }, [hapticFeedback, setMapCamera, setSelectedLocation, setSelectedIncident, setActiveModal]);

  const handleSelectIncident = useCallback((inc: typeof filteredIncidents[0]) => {
    hapticFeedback('medium');
    setQuery('');
    setResults([]);
    setIsFocused(false);
    setIntentLabel(null);
    setIncidentMatches([]);
    setSelectedIncident(inc);
    setSelectedLocation(null);
    setActiveModal(null);
    setMapCamera({
      center: [inc.latitude, inc.longitude],
      zoom: 17,
      pitch: 45,
      duration: 1500,
    });
  }, [hapticFeedback, setMapCamera, setSelectedIncident, setSelectedLocation, setActiveModal]);

  const toggleCategory = (cat: string) => {
    hapticFeedback('light');
    const curr = filters.selectedCategories;
    updateFilters({
      selectedCategories: curr.includes(cat) ? curr.filter((c: string) => c !== cat) : [...curr, cat],
    });
  };

  const hasResults = results.length > 0;
  const hasIncidentMatches = incidentMatches.length > 0;
  const showHistory = !hasResults && !hasIncidentMatches && !query && history.length > 0;
  const showFavorites = !hasResults && !hasIncidentMatches && !query && favorites.length > 0;
  const noResults = query.length >= 2 && !isSearching && !hasResults && !hasIncidentMatches;
  const showDropdown = isFocused && (hasResults || hasIncidentMatches || showHistory || showFavorites || noResults || (!query && true));

  return (
    <div
      ref={containerRef}
      className="absolute top-4 left-4 right-4 z-20 flex flex-col gap-2 pointer-events-auto"
      style={{ maxWidth: '480px', margin: '0 auto' }}
    >
      {/* ── Search Input ─────────────────────────────────────────────────── */}
      <div
        className={`glass flex items-center rounded-2xl px-3.5 py-2.5 gap-2.5 transition-all duration-200 border ${
          isFocused ? 'border-s-primary/60 shadow-glow-primary ring-1 ring-s-primary/20' : 'border-white/10 shadow-card'
        }`}
      >
        {isSearching ? (
          <Loader2 className="w-4.5 h-4.5 text-s-primary animate-spin shrink-0" />
        ) : (
          <Search className="w-4.5 h-4.5 text-s-primary shrink-0" />
        )}
        <input
          type="text"
          value={query}
          onFocus={() => setIsFocused(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim().length >= 2) {
              // Soumet directement la query la plus probante
              if (hasResults) handleSelectPlace(results[0]);
              else if (hasIncidentMatches) handleSelectIncident(incidentMatches[0]);
            }
          }}
          placeholder="Rue, ville, phrase naturelle…"
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="off"
          className="flex-1 bg-transparent text-[16px] sm:text-sm text-s-text placeholder-s-text-3 outline-none font-medium min-w-0"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIntentLabel(null); hapticFeedback('light'); }}
            className="p-1 rounded-full hover:bg-white/10 text-s-text-3 hover:text-s-text transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Intent label contextuel */}
      {intentLabel && query.length >= 3 && (
        <div className="glass rounded-xl px-3 py-1.5 text-2xs font-semibold text-s-primary border border-s-primary/20 animate-slide-up">
          {intentLabel}
        </div>
      )}

      {/* ── Dropdown ────────────────────────────────────────────────────── */}
      {showDropdown && (
        <div className="glass rounded-3xl shadow-sheet overflow-hidden animate-slide-up border border-white/12 max-h-[75vh] flex flex-col">
          <div className="overflow-y-auto p-2.5 flex flex-col gap-1">

            {/* Incidents locaux correspondants */}
            {hasIncidentMatches && (
              <div className="mb-1">
                <div className="px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-s-danger mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" /> Incidents correspondants
                </div>
                {incidentMatches.map((inc) => (
                  <button
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors text-left group"
                  >
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold ${
                      inc.severity === 'critical' ? 'bg-red-600' :
                      inc.severity === 'high' ? 'bg-red-400' :
                      inc.severity === 'medium' ? 'bg-amber-400' : 'bg-green-500'
                    }`}>
                      ⚠
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-s-text truncate group-hover:text-s-primary transition-colors">
                        {inc.title}
                      </div>
                      <div className="text-xs text-s-text-3 truncate mt-0.5">
                        {inc.address || `${inc.latitude.toFixed(4)}, ${inc.longitude.toFixed(4)}`} · {inc.severity}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Résultats géocodage */}
            {hasResults && (
              <div>
                <div className="px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-s-text-3 mb-1 flex items-center gap-1.5">
                  <Navigation className="w-3 h-3" /> Lieux
                </div>
                {results.map((place) => (
                  <button
                    key={place.placeId}
                    onClick={() => handleSelectPlace(place)}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors text-left group"
                  >
                    <div className="mt-0.5 w-7 h-7 rounded-lg bg-s-surface-2 flex items-center justify-center shrink-0 group-hover:bg-s-primary/20 transition-colors">
                      <MapPin className="w-3.5 h-3.5 text-s-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-s-text truncate group-hover:text-s-primary transition-colors">
                        {place.name}
                      </div>
                      <div className="text-xs text-s-text-3 truncate mt-0.5">{place.displayName}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Exemples de recherches en langage naturel (quand vide) */}
            {!query && (
              <div className="mb-1">
                <div className="px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-s-text-3 mb-1">
                  💬 Essayez en langage naturel
                </div>
                {EXAMPLE_QUERIES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setQuery(ex)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-s-primary/8 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-s-primary/10 flex items-center justify-center shrink-0 text-xs">
                      🔍
                    </div>
                    <div className="text-xs text-s-text-2 italic">{ex}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Favoris */}
            {showFavorites && (
              <div className="mb-2">
                <div className="px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-s-text-3 mb-1 flex items-center gap-1.5">
                  <Star className="w-3 h-3 text-s-medium" /> Mes Lieux Favoris
                </div>
                {favorites.slice(0, 3).map((fav) => (
                  <button
                    key={fav.id}
                    onClick={() =>
                      handleSelectPlace({
                        placeId: fav.id,
                        name: fav.name,
                        displayName: fav.address || fav.name,
                        streetName: fav.address,
                        latitude: fav.latitude,
                        longitude: fav.longitude,
                        type: fav.place_type,
                      })
                    }
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-s-medium/15 flex items-center justify-center shrink-0">
                      <Star className="w-3 h-3 text-s-medium" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-s-text truncate">{fav.name}</div>
                      {fav.address && <div className="text-2xs text-s-text-3 truncate">{fav.address}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Historique */}
            {showHistory && (
              <div>
                <div className="flex items-center justify-between px-2.5 py-1 mb-1">
                  <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-s-text-3">
                    <History className="w-3 h-3" /> Recherches récentes
                  </div>
                  <button
                    onClick={() => { clearSearchHistory(); setHistory([]); }}
                    className="text-2xs text-s-text-3 hover:text-s-text-2 transition-colors"
                  >
                    Effacer
                  </button>
                </div>
                {history.map((place) => (
                  <button
                    key={place.placeId}
                    onClick={() => handleSelectPlace(place)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/8 transition-colors text-left"
                  >
                    <Clock className="w-3.5 h-3.5 text-s-text-3 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-s-text-2 truncate">{place.name}</div>
                      <div className="text-2xs text-s-text-3 truncate">{place.city}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {noResults && (
              <div className="px-4 py-8 text-center">
                <div className="text-2xl mb-2">🔍</div>
                <div className="text-sm font-semibold text-s-text mb-1">Aucun résultat</div>
                <div className="text-xs text-s-text-3">
                  Essayez : "incidents à Paris" ou "rue Victor Hugo Lyon"
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Filtres catégories ───────────────────────────────────────────── */}
      {!isFocused && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => {
              hapticFeedback('light');
              updateFilters({ selectedCategories: [] });
            }}
            className={`flex-shrink-0 px-3 py-1 rounded-pill text-xs font-semibold transition-all border ${
              filters.selectedCategories.length === 0
                ? 'bg-s-text text-s-base border-white shadow-card'
                : 'glass text-s-text-2 border-white/10 hover:text-s-text'
            }`}
          >
            Tous
          </button>

          {FILTER_CATEGORIES.map((cat) => {
            const active = filters.selectedCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-pill text-xs font-semibold transition-all border ${
                  active
                    ? 'bg-s-primary text-s-base border-s-primary shadow-glow-primary'
                    : 'glass text-s-text-2 border-white/10 hover:text-s-text'
                }`}
              >
                {React.createElement(categoryIcons[cat] || Search, { className: 'w-3 h-3' })}
                <span className="hidden sm:inline">{categoryLabels[cat]?.split(' /')[0]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
