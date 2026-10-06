import React, { useState, useMemo } from 'react';
import {
  X, MapPin, Star, Plus, Share2, AlertTriangle,
  ShieldCheck, ChevronUp, ChevronDown, Radar,
  Navigation2, Activity, ArrowUpRight
} from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import { categoryColors, categoryIcons, categoryLabels } from '../../design/tokens';

function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ScoreRing({ score, size = 68 }: { score: number | null; size?: number }) {
  const validScore = (typeof score === 'number' && !isNaN(score)) ? Math.max(0, Math.min(100, score)) : null;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = validScore !== null ? circ - (validScore / 100) * circ : circ;
  const color = validScore === null ? '#94A3B8' : validScore >= 75 ? '#22C55E' : validScore >= 50 ? '#F59E0B' : '#EF4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle className="score-ring-track" cx={size / 2} cy={size / 2} r={r} />
      <circle
        className="score-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeDasharray={circ}
        strokeDashoffset={isNaN(offset) ? circ : offset}
        stroke={color}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fill: color, fontSize: validScore !== null ? 17 : 11, fontWeight: 800, fontFamily: 'inherit' }}
      >
        {validScore !== null ? validScore : '—'}
      </text>
    </svg>
  );
}

export const LocationDetailSheet: React.FC = () => {
  const {
    selectedLocation, setSelectedLocation, setActiveModal,
    addFavorite, removeFavorite, favorites, incidents, setSelectedIncident,
    setMapCamera, hapticFeedback, filters, notificationRadiusKm,
  } = useSafety();

  const [snapPoint, setSnapPoint] = useState<'compact' | 'half' | 'full'>('half');

  const isDark = filters.mapTileStyle === 'dark';
  const effectiveRadiusKm = notificationRadiusKm || 5;
  const radiusMeters = effectiveRadiusKm * 1000;

  // ── DYNAMIC SPATIAL THREAT ANALYSIS & QUICK DATA SCAN ────────────────────────
  const zoneAnalysis = useMemo(() => {
    try {
      if (!selectedLocation || isNaN(selectedLocation.latitude) || isNaN(selectedLocation.longitude)) return null;
      const { latitude: lat, longitude: lon } = selectedLocation;

      // Safe normalized coordinates
      const sLat = lat > lon && lat > 30 ? lat : lon;
      const sLon = lat > lon && lat > 30 ? lon : lat;

      // Filter and sort active incidents within the configured radius
      const inRadius = (incidents || [])
        .filter((inc) => inc && inc.status === 'active' && typeof inc.latitude === 'number' && typeof inc.longitude === 'number' && !isNaN(inc.latitude) && !isNaN(inc.longitude))
        .map((inc) => {
          const iLat = inc.latitude > inc.longitude && inc.latitude > 30 ? inc.latitude : inc.longitude;
          const iLon = inc.latitude > inc.longitude && inc.latitude > 30 ? inc.longitude : inc.latitude;
          return {
            ...inc,
            latitude: iLat,
            longitude: iLon,
            distMeters: haversineDist(sLat, sLon, iLat, iLon),
          };
        })
        .filter((inc) => !isNaN(inc.distMeters) && inc.distMeters <= radiusMeters)
        .sort((a, b) => a.distMeters - b.distMeters);

      const totalCount = inRadius.length;
      const criticalHighCount = inRadius.filter((i) => i.severity === 'critical' || i.severity === 'high').length;
      const immediateCount = inRadius.filter((i) => i.distMeters <= 1000).length;

      // Category breakdown
      const categoryCounts: Record<string, number> = {};
      inRadius.forEach((i) => {
        if (i && i.category) {
          categoryCounts[i.category] = (categoryCounts[i.category] || 0) + 1;
        }
      });

      // Dynamic Safety Index (0 to 100)
      let penalty = 0;
      inRadius.forEach((i) => {
        const weight = i.severity === 'critical' ? 18 : i.severity === 'high' ? 12 : i.severity === 'medium' ? 6 : 2;
        const decay = Math.max(0.2, 1 - i.distMeters / radiusMeters);
        penalty += weight * decay;
      });
      const computedScore = Math.max(15, Math.min(100, Math.round(100 - penalty)));

      // Smart Actionable Executive Summary
      let statusTitle = 'Zone Paisible';
      let summaryText = `🟢 Secteur serein : Aucun danger critique détecté dans le rayon de ${effectiveRadiusKm} km.`;

      if (criticalHighCount > 0 && immediateCount > 0) {
        statusTitle = 'Vigilance Renforcée';
        summaryText = `🔴 Attention : ${criticalHighCount} signalement(s) majeur(s) à moins de 1 km. Privilégiez les grands axes éclairés.`;
      } else if (criticalHighCount > 0) {
        statusTitle = 'Vigilance Modérée';
        summaryText = `🟡 Vigilance : ${criticalHighCount} risque(s) signalé(s) dans le périmètre de ${effectiveRadiusKm} km. Passage accessible.`;
      } else if (totalCount > 0) {
        statusTitle = 'Vigilance Standard';
        summaryText = `🟡 ${totalCount} signalement(s) mineur(s) dans les ${effectiveRadiusKm} km aux alentours. Circulation normale.`;
      }

      return {
        in5km: inRadius,
        totalCount,
        criticalHighCount,
        immediateCount,
        categoryCounts,
        computedScore,
        statusTitle,
        summaryText,
      };
    } catch (err) {
      console.warn('[LocationDetailSheet] Zone analysis error:', err);
      return null;
    }
  }, [selectedLocation, incidents, radiusMeters, effectiveRadiusKm]);

  const matchingFavorite = (favorites || []).find(
    (f) =>
      f &&
      typeof f.latitude === 'number' &&
      typeof f.longitude === 'number' &&
      selectedLocation &&
      Math.abs(f.latitude - selectedLocation.latitude) < 0.001 &&
      Math.abs(f.longitude - selectedLocation.longitude) < 0.001
  );
  const isFavorite = !!matchingFavorite;

  const toggleSnap = () => {
    hapticFeedback('light');
    setSnapPoint((prev) => (prev === 'compact' ? 'half' : prev === 'half' ? 'full' : 'compact'));
  };

  // Display sheet whenever a location is selected on the map (placed AFTER all hooks!)
  if (!selectedLocation) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-24 max-w-lg mx-auto pointer-events-none">
      <div
        className={`rounded-4xl p-5 pointer-events-auto animate-slide-up transition-all duration-300 ${
          snapPoint === 'compact' ? 'max-h-[32vh]' : snapPoint === 'half' ? 'max-h-[60vh]' : 'max-h-[82vh]'
        } overflow-y-auto border shadow-sheet ${
          isDark
            ? 'bg-slate-900/96 text-white border-slate-700/80 backdrop-blur-3xl'
            : 'bg-white/98 text-slate-900 border-slate-200/90 backdrop-blur-2xl'
        }`}
      >
        {/* ── Interactive Drag Handle ──────────────────────────────────── */}
        <div onClick={toggleSnap} className="w-full flex justify-center py-1 cursor-pointer">
          <div className={`w-9 h-1 rounded-full transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-300 hover:bg-slate-400'}`} />
        </div>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 text-xs font-semibold mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <MapPin className="w-3.5 h-3.5 text-s-primary shrink-0" />
              <span className="truncate">{selectedLocation.city || 'Lieu sélectionné'}</span>
            </div>
            <h2 className={`text-base font-extrabold leading-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {selectedLocation.name}
            </h2>
            {selectedLocation.streetName && (
              <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedLocation.streetName}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleSnap}
              className={`p-1.5 rounded-xl transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}
              title="Agrandir / Réduire"
            >
              {snapPoint === 'full' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                hapticFeedback('light');
                setSelectedLocation(null);
                setActiveModal(null);
              }}
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 5 KM ZONE RADAR & EXECUTIVE SUMMARY ──────────────────────── */}
        {zoneAnalysis && (
          <div
            className={`p-3.5 rounded-2xl border flex items-center gap-3.5 mb-3 ${
              isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <ScoreRing score={zoneAnalysis.computedScore} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Radar className="w-3 h-3 text-s-primary animate-spin" style={{ animationDuration: '6s' }} />
                <span className={`text-2xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Analyse Sécurité · Rayon {effectiveRadiusKm} km
                </span>
              </div>
              <div className={`text-sm font-extrabold leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {zoneAnalysis.statusTitle}
              </div>
              <div className={`text-2xs mt-0.5 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {zoneAnalysis.summaryText}
              </div>
            </div>
          </div>
        )}

        {/* ── 3 QUICK STAT CARDS (DONNÉES RAPIDES EN 1 COUP D'ŒIL) ─────── */}
        {zoneAnalysis && (
          <div className="grid grid-cols-3 gap-2 mb-3.5">
            <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center ${
              isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200/60'
            }`}>
              <span className={`text-lg font-black ${zoneAnalysis.totalCount > 0 ? (isDark ? 'text-white' : 'text-slate-900') : 'text-s-green'}`}>
                {zoneAnalysis.totalCount}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-tight mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Dans les {effectiveRadiusKm} km
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center ${
              zoneAnalysis.criticalHighCount > 0
                ? isDark ? 'bg-red-950/40 border-red-800/60 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
                : isDark ? 'bg-slate-800/40 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}>
              <span className="text-lg font-black">
                {zoneAnalysis.criticalHighCount}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-tight mt-0.5">
                Dangers Majeurs
              </span>
            </div>

            <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center ${
              zoneAnalysis.immediateCount > 0
                ? isDark ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600'
                : isDark ? 'bg-slate-800/40 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}>
              <span className="text-lg font-black">
                {zoneAnalysis.immediateCount}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-tight mt-0.5">
                Proches (&lt; 1 km)
              </span>
            </div>
          </div>
        )}

        {/* ── EXPANDED CONTENT (Half & Full view) ──────────────────────── */}
        {snapPoint !== 'compact' && zoneAnalysis && (
          <>
            {/* Category Breakdown Chips */}
            {Object.keys(zoneAnalysis.categoryCounts).length > 0 && (
              <div className="mb-3.5">
                <div className={`text-2xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Activity className="w-3 h-3 text-s-primary" />
                  Répartition des signalements (5 km)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(zoneAnalysis.categoryCounts).map(([cat, count]) => {
                    const iconComp = categoryIcons[cat] || AlertTriangle;
                    const catColor = categoryColors[cat] || '#EF4444';
                    return (
                      <div
                        key={cat}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold ${
                          isDark ? 'bg-slate-800/70 border-slate-700' : 'bg-slate-100 border-slate-200'
                        }`}
                      >
                        {React.createElement(iconComp, { className: 'w-3 h-3', style: { color: catColor } })}
                        <span className={isDark ? 'text-slate-200' : 'text-slate-800'}>
                          {categoryLabels[cat as keyof typeof categoryLabels] || cat} ({count})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Closest Active Incidents List with 1-Tap Inspection */}
            {zoneAnalysis.in5km.length > 0 ? (
              <div className="mb-4">
                <div className={`text-2xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Navigation2 className="w-3 h-3 text-s-primary" />
                  Signalements les plus proches
                </div>
                <div className="flex flex-col gap-1.5">
                  {zoneAnalysis.in5km.slice(0, 4).map((inc) => {
                    const iconComp = categoryIcons[inc.category] || AlertTriangle;
                    const distStr = inc.distMeters < 1000
                      ? `${Math.round(inc.distMeters)} m`
                      : `${(inc.distMeters / 1000).toFixed(1)} km`;

                    return (
                      <div
                        key={inc.id}
                        onClick={() => {
                          hapticFeedback('medium');
                          setSelectedLocation(null);
                          setSelectedIncident(inc);
                          setMapCamera({
                            center: [inc.latitude, inc.longitude],
                            zoom: 17.5,
                            pitch: 45,
                            duration: 1000,
                          });
                        }}
                        className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none active:scale-[0.99] ${
                          isDark
                            ? 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/60 text-white'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                            style={{ background: categoryColors[inc.category] || '#EF4444' }}
                          >
                            {React.createElement(iconComp, { className: 'w-3.5 h-3.5' })}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate">{inc.title}</div>
                            <div className={`text-[10px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                              {inc.address || inc.city || 'Position certifiée'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-slate-700 text-sky-300' : 'bg-slate-200 text-slate-700'
                          }`}>
                            {distStr}
                          </span>
                          <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-xs font-semibold mb-4 ${
                  isDark
                    ? 'bg-green-950/40 border-green-800/60 text-green-300'
                    : 'bg-green-50 border-green-200 text-s-green'
                }`}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Aucune perturbation signalée dans ce secteur (5 km).</span>
              </div>
            )}
          </>
        )}

        {/* ── Action Buttons ───────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              hapticFeedback('heavy');
              setActiveModal('report');
            }}
            className="btn-danger flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Signaler</span>
          </button>

          <button
            onClick={() => {
              hapticFeedback('medium');
              if (isFavorite && matchingFavorite) {
                removeFavorite(matchingFavorite.id);
              } else {
                addFavorite({
                  name: selectedLocation.name,
                  address: selectedLocation.streetName || selectedLocation.name,
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                });
              }
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all border active:scale-95 ${
              isFavorite
                ? isDark
                  ? 'bg-amber-950/60 text-amber-300 border-amber-700 shadow-sm'
                  : 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm'
                : isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'btn-ghost'
            }`}
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />
            <span>{isFavorite ? 'Enregistré' : 'Favori'}</span>
          </button>

          <button
            onClick={() => {
              hapticFeedback('light');
              navigator.clipboard?.writeText(
                `[Safety] ${selectedLocation.name} (${selectedLocation.latitude.toFixed(4)}, ${selectedLocation.longitude.toFixed(4)})`
              );
            }}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border transition-colors active:scale-95 ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'btn-ghost'
            }`}
            title="Copier les coordonnées"
          >
            <Share2 className="w-4 h-4" />
            <span>Partager</span>
          </button>
        </div>
      </div>
    </div>
  );
};
