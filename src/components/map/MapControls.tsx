import React from 'react';
import { Navigation, Moon, Sun, AlertTriangle, Globe, Box } from 'lucide-react';
import { useSafety } from '../../context/useSafety';

export const MapControls: React.FC = () => {
  const {
    filters, updateFilters, requestUserLocation,
    gpsState, hapticFeedback,
    isGlobeMode, toggleGlobeMode, mapPitch, togglePitch,
  } = useSafety();

  const [showGpsHint, setShowGpsHint] = React.useState(false);

  const isDark = filters.mapTileStyle === 'dark';

  const handleGpsClick = () => {
    hapticFeedback('medium');
    requestUserLocation({ silent: false, forceRecenter: true });
    if (gpsState === 'denied' || gpsState === 'unavailable') {
      setShowGpsHint(true);
      setTimeout(() => setShowGpsHint(false), 5000);
    }
  };

  const gpsColor = gpsState === 'granted'
    ? 'text-s-primary ring-1 ring-blue-500/40 bg-blue-50/80 dark:bg-blue-950/40'
    : gpsState === 'denied'
    ? 'text-amber-500 ring-1 ring-amber-500/40 bg-amber-50/80 dark:bg-amber-950/40'
    : isDark ? 'text-slate-400' : 'text-slate-600';

  const btnBase = `w-10 h-10 sm:w-11 sm:h-11 backdrop-blur-2xl rounded-2xl flex items-center justify-center shadow-island transition-all active:scale-90 border touch-manipulation select-none cursor-pointer ${
    isDark
      ? 'bg-slate-900/94 border-slate-700/80 text-slate-300 hover:bg-slate-800'
      : 'bg-white/94 border-slate-200/90 text-slate-700 hover:bg-slate-100'
  }`;

  const toggleTheme = () => {
    hapticFeedback('light');
    updateFilters({ mapTileStyle: isDark ? 'light' : 'dark' });
  };

  const toggleCriticalOnly = () => {
    hapticFeedback('light');
    updateFilters({
      minSeverity: filters.minSeverity === 'critical' ? 'all' : 'critical'
    });
  };

  return (
    <div className="fixed right-3 sm:right-4 bottom-28 sm:bottom-auto sm:top-24 z-20 flex flex-col items-end gap-2 sm:gap-2.5 pointer-events-auto transition-all duration-300">
      {/* ── GPS Denied Explanatory Popover ─────────────────────────────────── */}
      {showGpsHint && (
        <div className="absolute right-14 top-0 w-72 p-3.5 rounded-2xl bg-slate-950/95 border border-cyan-500/40 shadow-2xl text-white text-xs backdrop-blur-xl animate-fade-in pointer-events-auto z-30">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="font-bold text-cyan-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 shrink-0" />
              Position Géographique
            </p>
            <button
              onClick={() => setShowGpsHint(false)}
              className="text-slate-400 hover:text-white text-xs p-0.5"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            {gpsState === 'denied'
              ? "Accès GPS direct bloqué dans votre navigateur. Pour une précision rue, autorisez la localisation via l'icône 🔒 à gauche de l'adresse web. Votre secteur a été localisé par le réseau."
              : "Acquisition de la position en cours. La carte se centre automatiquement sur votre zone."}
          </p>
        </div>
      )}

      {/* ── 1. GPS Locate & Cinematic Zoom ─────────────────────────────── */}
      <button
        onClick={handleGpsClick}
        className={`${btnBase} ${gpsColor} relative`}
        title={
          gpsState === 'denied'
            ? 'Localisation refusée (cliquer pour aide)'
            : gpsState === 'granted'
            ? 'Recentrer et zoomer sur ma position GPS'
            : 'Activer ma position GPS'
        }
        aria-label="Localiser ma position GPS"
      >
        <Navigation className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${gpsState === 'locating' ? 'animate-spin text-s-primary' : ''}`} />
        {gpsState === 'granted' && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        )}
      </button>

      {/* ── 2. Vue Terre / Espace Planétaire (Globe) ───────────────────── */}
      <button
        onClick={toggleGlobeMode}
        className={`${btnBase} ${
          isGlobeMode
            ? 'bg-emerald-500/20 text-emerald-500 border-emerald-400/60 shadow-emerald-500/25 ring-1 ring-emerald-500/40'
            : isDark ? 'text-emerald-400 hover:text-emerald-300' : 'text-emerald-600 hover:text-emerald-700'
        }`}
        title={isGlobeMode ? 'Vue rapprochée (Rue)' : 'Vue planétaire Terre'}
        aria-label="Vue planétaire Terre"
      >
        <Globe className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${isGlobeMode ? 'animate-pulse' : ''}`} />
      </button>

      {/* ── 3. Vision Perspective 3D Tilt ─────────────────────────────── */}
      <button
        onClick={togglePitch}
        className={`${btnBase} ${
          mapPitch > 15
            ? 'bg-orange-500/20 text-orange-500 border-orange-400/60 shadow-orange-500/25 ring-1 ring-orange-500/40'
            : isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'
        }`}
        title={mapPitch > 15 ? 'Basculer en vue 2D à plat' : 'Activer perspective 3D'}
        aria-label="Perspective 3D"
      >
        <Box className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
      </button>

      {/* ── 4. Theme Switcher (Dark / Light) ─────────────────────────────── */}
      <button
        onClick={toggleTheme}
        className={`${btnBase} text-s-primary`}
        title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      >
        {isDark ? <Sun className="w-4 h-4 sm:w-4.5 sm:h-4.5" /> : <Moon className="w-4 h-4 sm:w-4.5 sm:h-4.5" />}
      </button>

      {/* ── 6. Critical Alerts Filter Toggle ─────────────────────────────── */}
      <button
        onClick={toggleCriticalOnly}
        className={`${btnBase} ${
          filters.minSeverity === 'critical'
            ? 'border-red-500 text-red-500 bg-red-50/90 dark:bg-red-950/60 shadow-red-500/20'
            : ''
        }`}
        title={filters.minSeverity === 'critical' ? 'Afficher tous les niveaux' : 'Filtrer uniquement les alertes critiques'}
      >
        <AlertTriangle className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
      </button>
    </div>
  );
};
