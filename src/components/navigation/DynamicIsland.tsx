import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search, X, MapPin, Loader2, History, Clock, Star, AlertTriangle,
  ChevronRight, Bell, Shield, Compass, Sparkles, Trash2, Sliders,
  HeartHandshake, Volume2
} from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { searchPlaces, getSearchHistory, saveSearchToHistory, clearSearchHistory, fetchStreetGeometry } from '../../api/geocodingApi';
import type { GeocodedPlace } from '../../api/geocodingApi';
import { categoryColors, categoryIcons, categoryLabels } from '../../design/tokens';
import { formatExactAgo } from '../../utils/timeAgo';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FILTER_CATEGORIES = [
  'altercation', 'lighting', 'accident', 'harassment', 'danger', 'hazard', 'fire',
] as const;

export const DynamicIsland: React.FC = () => {
  const {
    filters, updateFilters, setMapCamera, setSelectedLocation,
    setSelectedIncident, setActiveModal, favorites, incidents,
    notifications, unreadNotificationsCount, markAsRead,
    notificationRadiusKm, setNotificationRadiusKm,
    deleteNotification,
    userLocation, hapticFeedback,
    walkSession, toggleWalkSiren,
  } = useSafety();

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'alerts' | 'favorites' | 'history'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [history, setHistory] = useState<GeocodedPlace[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [livePopAlert, setLivePopAlert] = useState<{
    id: string;
    title: string;
    category: string;
    severity: string;
    latitude: number;
    longitude: number;
    subtitle?: string;
    incident?: any;
  } | null>(null);
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIncidentsCountRef = useRef<number>(incidents.length);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isDark = filters.mapTileStyle === 'dark';

  // Trigger 5-second Apple Dynamic Island Pop when a new incident is detected/reported
  useEffect(() => {
    if (incidents.length > prevIncidentsCountRef.current && incidents.length > 0) {
      const latest = incidents[0];
      if (latest && !dismissedAlerts.includes(latest.id)) {
        hapticFeedback('heavy');
        setLivePopAlert({
          id: latest.id,
          title: latest.title,
          category: latest.category,
          severity: latest.severity,
          latitude: latest.latitude,
          longitude: latest.longitude,
          subtitle: latest.address || latest.neighborhood || latest.city || 'Nouveau signalement en direct',
          incident: latest,
        });

        if (popTimerRef.current) clearTimeout(popTimerRef.current);
        popTimerRef.current = setTimeout(() => {
          setLivePopAlert(null);
        }, 5000); // 5 secondes grand maximum
      }
    }
    prevIncidentsCountRef.current = incidents.length;
  }, [incidents, dismissedAlerts, hapticFeedback]);

  // Proximity live threat calculation
  const proximityAlert = useMemo(() => {
    if (!userLocation) return null;
    const [uLat, uLon] = userLocation;

    return (
      incidents.find((inc) => {
        if (inc.status !== 'active' || dismissedAlerts.includes(inc.id)) return false;
        if (inc.severity !== 'high' && inc.severity !== 'critical') return false;
        return haversine(uLat, uLon, inc.latitude, inc.longitude) <= notificationRadiusKm * 1000;
      }) ?? null
    );
  }, [incidents, userLocation, dismissedAlerts, notificationRadiusKm]);

  // Active notification to show in Dynamic Island
  const activeIslandAlert = livePopAlert || proximityAlert;

  // Click outside to collapse
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (isOpen) setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Focus on search input when open
  useEffect(() => {
    if (isOpen) {
      setHistory(getSearchHistory());
      if (activeTab === 'search') {
        setTimeout(() => inputRef.current?.focus(), 80);
      }
    }
  }, [isOpen, activeTab]);

  // Live search debouncing
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const places = await searchPlaces(query, ctrl.signal);
      setResults(places);
      setIsSearching(false);
    }, 240);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  const handleSelectPlace = useCallback(
    async (place: GeocodedPlace) => {
      hapticFeedback('medium');
      saveSearchToHistory(place);
      setHistory(getSearchHistory());
      setQuery('');
      setResults([]);
      setIsOpen(false);

      // Cinematic camera descent
      setMapCamera({
        center: [place.latitude, place.longitude],
        zoom: 17.2,
        pitch: 45,
        duration: 1500,
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
    },
    [hapticFeedback, setMapCamera, setSelectedLocation, setSelectedIncident, setActiveModal]
  );

  const toggleCategory = (cat: string) => {
    hapticFeedback('light');
    const currHidden = filters.hiddenCategories || [];
    const nextHidden = currHidden.includes(cat)
      ? currHidden.filter((c: string) => c !== cat)
      : [...currHidden, cat];
    updateFilters({ hiddenCategories: nextHidden });
  };

  return (
    <div
      ref={containerRef}
      className="fixed top-[max(env(safe-area-inset-top),14px)] sm:top-4 inset-x-0 z-40 flex flex-col items-center px-4 pointer-events-none"
    >
      {/* ── 1. DYNAMIC ISLAND CAPSULE (Apple Glass Pill) ────────── */}
      {!isOpen && (
        <div
          onClick={() => {
            if (activeIslandAlert) return;
            hapticFeedback('light');
            setIsOpen(true);
            setActiveTab('search');
          }}
          className={`pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] backdrop-blur-2xl shadow-island select-none border relative overflow-hidden ${
            isDark
              ? 'bg-slate-900/96 text-white border-slate-700/80'
              : 'bg-white/96 text-slate-900 border-slate-200/90'
          } ${
            activeIslandAlert
              ? 'w-full max-w-sm sm:max-w-md rounded-3xl p-3 border-red-500/50 shadow-glow-danger animate-island-pop'
              : 'min-w-[270px] sm:min-w-[320px] max-w-sm rounded-full py-1.5 sm:py-2 px-3 sm:px-3.5 hover:border-slate-300 cursor-pointer flex items-center justify-between gap-2.5 hover:scale-[1.01] active:scale-[0.98]'
          }`}
        >
          {activeIslandAlert ? (
            /* ── Apple Dynamic Island 5s Notification Expansion ── */
            <div className="flex flex-col w-full gap-2">
              <div className="flex items-center justify-between w-full gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg relative"
                    style={{ background: categoryColors[activeIslandAlert.category] || '#EF4444' }}
                  >
                    <span className="absolute inset-0 rounded-2xl animate-ping opacity-30" style={{ background: categoryColors[activeIslandAlert.category] || '#EF4444' }} />
                    {React.createElement(
                      categoryIcons[activeIslandAlert.category] || AlertTriangle,
                      { className: 'w-5 h-5 relative z-10' }
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-2xs uppercase font-extrabold text-s-danger tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-s-danger animate-pulse" />
                      {livePopAlert ? 'Nouveau signalement' : `Alerte (${notificationRadiusKm} km)`}
                    </div>
                    <div className={`text-xs font-extrabold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {activeIslandAlert.title}
                    </div>
                    {('subtitle' in activeIslandAlert && activeIslandAlert.subtitle) ? (
                      <div className={`text-2xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {activeIslandAlert.subtitle}
                      </div>
                    ) : (activeIslandAlert as any).address ? (
                      <div className={`text-2xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {(activeIslandAlert as any).address}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticFeedback('medium');
                      setMapCamera({
                        center: [activeIslandAlert.latitude, activeIslandAlert.longitude],
                        zoom: 17.5,
                        pitch: 45,
                        duration: 1200,
                      });
                      const inc = ('incident' in activeIslandAlert && activeIslandAlert.incident)
                        ? activeIslandAlert.incident
                        : ('status' in activeIslandAlert ? activeIslandAlert : null);
                      if (inc) {
                        setSelectedIncident(inc);
                      }
                      setLivePopAlert(null);
                    }}
                    className="btn-danger py-1.5 px-3 rounded-xl text-2xs font-bold flex items-center gap-1 shadow-sm active:scale-95"
                  >
                    <span>Voir</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticFeedback('light');
                      if (livePopAlert) setLivePopAlert(null);
                      if (proximityAlert) setDismissedAlerts((d) => [...d, proximityAlert.id]);
                    }}
                    className={`p-1.5 rounded-xl transition-colors ${
                      isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 5-Second Animated Countdown Progress Bar */}
              {livePopAlert && (
                <div className="w-full h-1 bg-slate-700/25 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 rounded-full animate-island-timer" />
                </div>
              )}
            </div>
          ) : walkSession && (walkSession.status === 'active' || walkSession.status === 'alert') ? (
            /* Walk With Me Live Journey Pill */
            <div className="flex items-center justify-between w-full px-2 py-0.5">
              <div
                onClick={() => {
                  hapticFeedback('light');
                  setActiveModal('walk');
                }}
                className="flex items-center gap-2 cursor-pointer min-w-0"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  walkSession.status === 'alert' ? 'bg-red-500 text-white animate-pulse' : 'bg-cyan-500/20 text-cyan-400'
                }`}>
                  <HeartHandshake className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="text-xs font-black truncate flex items-center gap-1.5 leading-tight">
                    <span>Trajet sécurisé</span>
                    <span className="text-[10px] text-cyan-400 font-mono font-extrabold">
                      {String(Math.floor(Math.max(0, walkSession.targetArrivalTimestamp - Date.now()) / 60000)).padStart(2, '0')}:
                      {String(Math.floor((Math.max(0, walkSession.targetArrivalTimestamp - Date.now()) % 60000) / 1000)).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate leading-tight">
                    🏁 {walkSession.destinationName}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWalkSiren();
                  }}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 ${
                    walkSession.isSirenActive
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'bg-red-500/15 text-red-500 hover:bg-red-500/30'
                  }`}
                  title={walkSession.isSirenActive ? "Couper l'alarme" : "Alarme sonore"}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('medium');
                    setActiveModal('walk');
                  }}
                  className="px-2.5 py-1 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400 font-bold text-[10px]"
                >
                  Gérer
                </button>
              </div>
            </div>
          ) : (
            /* Standard Compact Search Pill (Clean, minimal Apple design, no logo) */
            <>
              {/* Left: Quick Search Button & Placeholder */}
              <div className="flex items-center gap-2.5 flex-1 pl-1 min-w-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                </div>
                <span className={`text-xs sm:text-sm font-medium truncate select-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Rechercher une zone, une rue…
                </span>
              </div>

              {/* Right: Walk With Me Trigger & Local Notifications Bell */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('medium');
                    setActiveModal('walk');
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    isDark
                      ? 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25'
                      : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-600'
                  }`}
                  title="Walk With Me — Trajet sécurisé"
                  aria-label="Walk With Me — Trajet sécurisé"
                >
                  <HeartHandshake className="w-4 h-4" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticFeedback('light');
                    setIsOpen(true);
                    setActiveTab('alerts');
                  }}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                    isDark
                      ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'
                  }`}
                  title="Alertes locales"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-s-danger text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 2. SPOTLIGHT GLASS OVERLAY ───────── */}
      {isOpen && (
        <div
          className={`pointer-events-auto w-full max-w-lg backdrop-blur-3xl rounded-3xl shadow-sheet p-4 animate-scale-in flex flex-col gap-3 border ${
            isDark
              ? 'bg-slate-900/96 text-white border-slate-700/80'
              : 'bg-white/98 text-slate-900 border-slate-200/90'
          }`}
        >
          {/* Header Search Field */}
          <div className={`flex items-center gap-3 pb-3 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
            {isSearching ? (
              <Loader2 className="w-5 h-5 text-s-primary animate-spin shrink-0" />
            ) : (
              <Search className="w-5 h-5 text-s-primary shrink-0" />
            )}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (activeTab !== 'search') setActiveTab('search');
              }}
              placeholder="Où vas-tu ? Rue, quartier, ville…"
              inputMode="search"
              autoCorrect="off"
              autoCapitalize="off"
              className={`flex-1 bg-transparent text-[16px] sm:text-sm font-semibold outline-none ${
                isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
              }`}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className={`p-1 rounded-full ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                hapticFeedback('light');
                setIsOpen(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Fermer
            </button>
          </div>

          {/* Segmented Control Tabs */}
          <div className={`flex items-center gap-1.5 p-1 rounded-2xl border ${isDark ? 'bg-slate-800/80 border-slate-700/80' : 'bg-slate-100 border-slate-200/60'}`}>
            {([
              { id: 'search',    label: 'Recherche',    Icon: Compass },
              { id: 'alerts',    label: `Alertes (${notifications.length})`, Icon: Bell },
              { id: 'favorites', label: `Favoris (${favorites.length})`,    Icon: Star },
              { id: 'history',   label: 'Récents',      Icon: History },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => {
                  hapticFeedback('light');
                  setActiveTab(id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === id
                    ? isDark
                      ? 'bg-slate-700 text-sky-400 shadow-sm'
                      : 'bg-white text-s-primary shadow-sm'
                    : isDark
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Radius Selector in Alerts tab */}
          {activeTab === 'alerts' && (
            <div className={`flex items-center justify-between px-2 py-1.5 rounded-2xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-50 border-slate-200/80'}`}>
              <div className={`flex items-center gap-1.5 text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <Sliders className="w-3.5 h-3.5 text-s-primary" />
                <span>Rayon d'alerte :</span>
              </div>
              <div className="flex items-center gap-1">
                {([5, 10, 30] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      hapticFeedback('light');
                      setNotificationRadiusKm(r);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-2xs font-extrabold transition-all ${
                      notificationRadiusKm === r
                        ? 'bg-s-primary text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }`}
                  >
                    {r} km {r === 5 ? '(défaut)' : r === 30 ? '(max)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tab Content Container */}
          <div className="max-h-[52vh] overflow-y-auto flex flex-col gap-1.5 pr-0.5">
            {/* ── TAB 1: Search & Autocomplete ───────────────────────── */}
            {activeTab === 'search' && (
              <>
                {results.length > 0 ? (
                  results.map((place) => (
                    <button
                      key={place.placeId}
                      onClick={() => handleSelectPlace(place)}
                      className="w-full flex items-start gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 transition-all text-left group active:scale-[0.98]"
                    >
                      <div className="mt-0.5 w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 text-s-primary group-hover:bg-s-primary group-hover:text-white transition-colors">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate group-hover:text-s-primary transition-colors">
                          {place.name}
                        </div>
                        <div className="text-2xs text-slate-500 truncate mt-0.5">{place.displayName}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 self-center group-hover:text-slate-700" />
                    </button>
                  ))
                ) : query.length >= 2 && !isSearching ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Aucun lieu trouvé pour « {query} »
                  </div>
                ) : (
                  /* Quick suggestion chips when query is empty */
                  <div className="flex flex-col gap-2 py-2">
                    <div className="text-2xs font-extrabold uppercase tracking-widest text-slate-500 px-1 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-s-primary" /> Explorer par situation
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {FILTER_CATEGORIES.map((cat) => {
                        const Icon = categoryIcons[cat] || AlertTriangle;
                        const catColor = categoryColors[cat] || '#2563EB';
                        return (
                          <button
                            key={cat}
                            onClick={() => {
                              toggleCategory(cat);
                              setIsOpen(false);
                            }}
                            className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-left transition-colors"
                          >
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                              style={{ background: catColor }}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {categoryLabels[cat]?.split(' /')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── TAB 2: Geolocated Local Alerts ─────────────────────── */}
            {activeTab === 'alerts' && (
              <>
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">
                    Alertes géolocalisées ({notifications.length})
                  </span>
                </div>

                {notifications.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <Shield className="w-9 h-9 text-slate-300" />
                    <span>Aucune alerte dans votre rayon de {notificationRadiusKm} km.</span>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const Icon = categoryIcons[notif.category] || AlertTriangle;
                    const catColor = categoryColors[notif.category] || '#EF4444';
                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          markAsRead(notif.id);
                          hapticFeedback('medium');
                          setMapCamera({
                            center: [notif.latitude, notif.longitude],
                            zoom: 17.2,
                            pitch: 42,
                            duration: 1200,
                          });
                          setIsOpen(false);
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                          notif.is_read
                            ? 'bg-slate-50 border-slate-200/60 opacity-80'
                            : 'bg-blue-50/60 border-blue-200 shadow-sm'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm"
                          style={{ background: catColor }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-xs font-bold text-slate-900 truncate">{notif.title}</span>
                            <span className="text-2xs text-slate-500 shrink-0">
                              {formatExactAgo(notif.created_at)}
                            </span>
                          </div>
                          <p className="text-2xs text-slate-600 leading-relaxed">{notif.message}</p>
                          {notif.distance_km !== null && notif.distance_km !== undefined && (
                            <span className="text-[10px] font-bold text-s-primary mt-1 inline-block">
                              À {notif.distance_km} km de votre position
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticFeedback('light');
                            deleteNotification(notif.id);
                          }}
                          className="p-1 text-slate-400 hover:text-s-danger self-center transition-colors"
                          title="Supprimer cette alerte"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* ── TAB 3: Favorites ───────────────────────────────────── */}
            {activeTab === 'favorites' && (
              <>
                {favorites.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
                    <Star className="w-8 h-8 text-slate-300" />
                    <span>Aucun lieu favori enregistré. Ajoutez votre domicile ou travail.</span>
                  </div>
                ) : (
                  favorites.map((fav) => (
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
                      className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-600">
                        <Star className="w-4 h-4 fill-amber-500/30" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">{fav.name}</div>
                        {fav.address && <div className="text-2xs text-slate-500 truncate mt-0.5">{fav.address}</div>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))
                )}
              </>
            )}

            {/* ── TAB 4: History ─────────────────────────────────────── */}
            {activeTab === 'history' && (
              <>
                {history.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Aucune recherche récente.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-1 py-0.5 mb-1">
                      <span className="text-2xs font-bold uppercase tracking-wider text-slate-500">
                        Historique
                      </span>
                      <button
                        onClick={() => {
                          clearSearchHistory();
                          setHistory([]);
                        }}
                        className="text-2xs font-bold text-slate-500 hover:text-slate-800"
                      >
                        Effacer tout
                      </button>
                    </div>
                    {history.map((place) => (
                      <button
                        key={place.placeId}
                        onClick={() => handleSelectPlace(place)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 transition-colors text-left"
                      >
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-800 truncate">{place.name}</div>
                          <div className="text-2xs text-slate-500 truncate">{place.city}</div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Category Filter Chips (below Island) ───────────────────── */}
      {!isOpen && (
        <div className="mt-2 w-fit max-w-[95vw] flex items-center gap-1.5 overflow-x-auto no-scrollbar px-3 py-1 pointer-events-auto mx-auto">
          <button
            onClick={() => {
              hapticFeedback('light');
              updateFilters({ hiddenCategories: [], selectedCategories: [] });
            }}
            className={`flex-shrink-0 px-3 py-1 rounded-pill text-2xs font-extrabold transition-all border ${
              (!filters.hiddenCategories || filters.hiddenCategories.length === 0)
                ? isDark
                  ? 'bg-white text-slate-950 border-white shadow-md'
                  : 'bg-slate-900 text-white border-slate-900 shadow-md'
                : isDark
                ? 'bg-slate-900/90 text-slate-400 border-slate-700/80 hover:border-slate-600'
                : 'bg-white/90 text-slate-600 border-slate-200/90 hover:border-slate-300'
            }`}
          >
            Tous
          </button>
          {FILTER_CATEGORIES.map((cat) => {
            const isHidden = (filters.hiddenCategories || []).includes(cat);
            const isVisible = !isHidden;
            const label = categoryLabels[cat]?.split(' /')[0] || cat;
            const Icon = categoryIcons[cat] || AlertTriangle;
            const color = categoryColors[cat] || '#EF4444';

            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                title={isVisible ? `Masquer ${label}` : `Afficher ${label}`}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-pill text-2xs font-extrabold transition-all border ${
                  isVisible
                    ? isDark
                      ? 'bg-slate-800 text-white border-slate-600 shadow-xs'
                      : 'bg-white text-slate-900 border-slate-300 shadow-xs'
                    : isDark
                    ? 'bg-slate-900/50 text-slate-500 border-slate-800 line-through opacity-40'
                    : 'bg-slate-100 text-slate-400 border-slate-200 line-through opacity-40'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isVisible ? color : '#94A3B8' }} />
                <Icon className="w-3 h-3" style={{ color: isVisible ? color : '#94A3B8' }} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
