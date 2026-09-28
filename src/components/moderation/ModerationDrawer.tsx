import React, { useMemo } from 'react';
import { X, Shield, Database, RefreshCw, Sliders, MapPin, AlertTriangle, ArrowRight, CheckCircle2, Flame } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { categoryColors, categoryIcons } from '../../design/tokens';
import { AppleToggle } from '../ui/AppleToggle';

function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return Infinity;
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PRESET_RADII = [1, 2, 5, 10, 15, 20, 30];

export const ModerationDrawer: React.FC = () => {
  const {
    activeModal,
    setActiveModal,
    incidents,
    favorites,
    notifications,
    hapticFeedback,
    refreshIncidents,
    notificationRadiusKm,
    setNotificationRadiusKm,
    userLocation,
    mapCenter,
    setSelectedIncident,
    setMapCamera,
    filters,
    isHeatmapMode,
    setIsHeatmapMode,
  } = useSafety();

  const isDark = filters.mapTileStyle === 'dark';

  // Base coordinates for distance calculation (User GPS or Map Center)
  const centerCoord = useMemo(() => {
    if (userLocation) return { lat: userLocation[0], lon: userLocation[1], label: 'Votre position GPS' };
    return { lat: mapCenter[0], lon: mapCenter[1], label: 'Centre de la carte' };
  }, [userLocation, mapCenter]);

  // Filter incidents within configured radius
  const incidentsInRadius = useMemo(() => {
    const radiusM = (notificationRadiusKm || 5) * 1000;
    return (incidents || [])
      .filter((inc) => inc && inc.status === 'active' && typeof inc.latitude === 'number' && typeof inc.longitude === 'number')
      .map((inc) => ({
        ...inc,
        distMeters: haversineDist(centerCoord.lat, centerCoord.lon, inc.latitude, inc.longitude),
      }))
      .filter((inc) => !isNaN(inc.distMeters) && inc.distMeters <= radiusM)
      .sort((a, b) => a.distMeters - b.distMeters);
  }, [incidents, notificationRadiusKm, centerCoord]);

  if (activeModal !== 'moderation') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className={`w-full max-w-lg rounded-t-4xl sm:rounded-4xl shadow-sheet max-h-[88vh] flex flex-col border transition-colors ${
        isDark ? 'bg-slate-900 text-white border-slate-700/80' : 'bg-white text-slate-900 border-slate-200'
      }`}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between p-5 pb-4 border-b shrink-0 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-s-primary" />
            </div>
            <div>
              <div className="text-base font-extrabold">Sécurité & Rayon de Protection</div>
              <div className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Paramétrage de zone & signalements aux alentours
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {/* ── NOUVELLE CARTE THERMIQUE (HEATMAP) FAÇON APPLE ─────────── */}
          <div className={`p-4 rounded-3xl border flex items-center justify-between gap-3.5 transition-all duration-300 ${
            isDark
              ? isHeatmapMode
                ? 'bg-gradient-to-r from-orange-950/40 via-red-950/20 to-slate-900 border-orange-500/50 shadow-lg shadow-orange-950/30'
                : 'bg-slate-800/60 border-slate-700/80'
              : isHeatmapMode
                ? 'bg-gradient-to-r from-orange-50 via-rose-50 to-white border-orange-300 shadow-md shadow-orange-100'
                : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                isHeatmapMode
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 text-white shadow-md shadow-orange-500/40 scale-105'
                  : isDark
                    ? 'bg-slate-700/70 text-slate-300'
                    : 'bg-white border border-slate-200 text-slate-600 shadow-xs'
              }`}>
                <Flame className="w-5 h-5" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-tight">
                    Carte Thermique des Risques
                  </span>
                  {isHeatmapMode && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-orange-500 to-red-500 text-white tracking-wider animate-pulse-slow">
                      ON
                    </span>
                  )}
                </div>
                <p className={`text-[11px] leading-snug truncate sm:whitespace-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Densité & criticité en spectre colorimétrique Apple.
                </p>
              </div>
            </div>

            <div className="shrink-0 pl-2">
              <AppleToggle
                checked={isHeatmapMode}
                activeColor="#FF5722"
                onChange={(enabled) => {
                  hapticFeedback('medium');
                  setIsHeatmapMode(enabled);
                  if (enabled) {
                    setTimeout(() => {
                      setActiveModal(null);
                    }, 280);
                  }
                }}
                ariaLabel="Activer la carte thermique de sécurité"
              />
            </div>
          </div>

          {/* 1. CURSEUR INTERACTIF DU RAYON DE SÉCURITÉ */}
          <div className={`p-4 rounded-3xl border flex flex-col gap-3.5 ${
            isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-s-primary">
                <Sliders className="w-4 h-4" /> Curseur du Rayon de Sécurité
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-500 text-white shadow-xs">
                {notificationRadiusKm} km
              </span>
            </div>

            {/* Slider Bar */}
            <div className="flex flex-col gap-1.5">
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={notificationRadiusKm}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  hapticFeedback('light');
                  setNotificationRadiusKm(val);
                }}
                className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none"
              />
              <div className="flex justify-between text-[10px] font-bold text-slate-400 px-0.5">
                <span>1 km</span>
                <span>5 km</span>
                <span>15 km</span>
                <span>30 km (max)</span>
              </div>
            </div>

            {/* Preset Buttons */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRESET_RADII.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    hapticFeedback('light');
                    setNotificationRadiusKm(r);
                  }}
                  className={`py-1 px-2.5 rounded-xl text-xs font-bold transition-all border ${
                    notificationRadiusKm === r
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs scale-105'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {r} km
                </button>
              ))}
            </div>

            <p className={`text-2xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              📍 Calculé depuis <span className="font-bold">{centerCoord.label}</span>. Seuls les signalements et alertes situés dans ce rayon sont pris en compte.
            </p>
          </div>

          {/* 2. BILAN DES SIGNALEMENTS DANS LA ZONE DÉFINIE */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Signalements dans votre zone ({incidentsInRadius.length})
              </span>
              <span className="text-2xs font-semibold text-s-primary">Rayon actif : {notificationRadiusKm} km</span>
            </div>

            {incidentsInRadius.length === 0 ? (
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-emerald-50/60 border-emerald-200/80'
              }`}>
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Zone parfaitement sécurisée</div>
                  <div className={`text-2xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Aucun incident actif recensé dans votre rayon de {notificationRadiusKm} km.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {incidentsInRadius.map((inc) => {
                  const Icon = categoryIcons[inc.category] || AlertTriangle;
                  const color = categoryColors[inc.category] || '#EF4444';
                  const distKm = (inc.distMeters / 1000).toFixed(1);

                  return (
                    <div
                      key={inc.id}
                      onClick={() => {
                        hapticFeedback('medium');
                        setActiveModal(null);
                        setMapCamera({
                          center: [inc.latitude, inc.longitude],
                          zoom: 17.5,
                          pitch: 45,
                          duration: 1200,
                        });
                        setSelectedIncident(inc);
                      }}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] ${
                        isDark ? 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800' : 'bg-slate-50 border-slate-200/80 hover:bg-white shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                          style={{ background: color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold truncate">{inc.title}</div>
                          <div className={`text-2xs flex items-center gap-1.5 mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <MapPin className="w-3 h-3 text-s-primary shrink-0" />
                            <span className="font-semibold text-s-primary">à {distKm} km</span>
                            <span>•</span>
                            <span className="truncate">{inc.address || 'Position repérée'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-2xs font-bold text-s-primary shrink-0">
                        <span>Voir</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. STATS SYSTÈME & BASE SQL TEMPS RÉEL */}
          <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 ${
            isDark ? 'bg-slate-800/40 border-slate-700/60' : 'bg-slate-50 border-slate-200/80'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Database className="w-3.5 h-3.5 text-s-primary" /> État Réseau & Base SQL
              </span>
              <button
                onClick={() => {
                  hapticFeedback('medium');
                  refreshIncidents();
                }}
                className="text-2xs font-bold text-s-primary flex items-center gap-1 hover:underline"
              >
                <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} /> Actualiser
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className={`p-2.5 rounded-xl border text-center ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
                <div className="text-xl font-extrabold text-s-primary">{incidents.length}</div>
                <div className="text-2xs text-slate-500 font-semibold">Total Signalés</div>
              </div>
              <div className={`p-2.5 rounded-xl border text-center ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
                <div className="text-xl font-extrabold text-amber-500">{favorites.length}</div>
                <div className="text-2xs text-slate-500 font-semibold">Favoris</div>
              </div>
              <div className={`p-2.5 rounded-xl border text-center ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'}`}>
                <div className="text-xl font-extrabold text-s-danger">{notifications.length}</div>
                <div className="text-2xs text-slate-500 font-semibold">Alertes SQL</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
