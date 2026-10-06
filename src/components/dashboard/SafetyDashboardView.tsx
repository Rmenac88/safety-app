import React, { useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, Clock, MapPin,
  ThumbsUp, ThumbsDown, ChevronRight, RefreshCw
} from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import { categoryColors, categoryIcons, categoryLabels } from '../../design/tokens';
import { formatExactAgo } from '../../utils/timeAgo';

const SEVERITY_BADGES: Record<string, { label: string; lightCls: string; darkCls: string }> = {
  critical: {
    label: 'Critique',
    lightCls: 'bg-red-100 text-red-700 border-red-200',
    darkCls: 'bg-red-950/80 text-red-300 border-red-800',
  },
  high: {
    label: 'Élevé',
    lightCls: 'bg-orange-100 text-orange-700 border-orange-200',
    darkCls: 'bg-orange-950/80 text-orange-300 border-orange-800',
  },
  medium: {
    label: 'Modéré',
    lightCls: 'bg-amber-100 text-amber-700 border-amber-200',
    darkCls: 'bg-amber-950/80 text-amber-300 border-amber-800',
  },
  low: {
    label: 'Faible',
    lightCls: 'bg-green-100 text-green-700 border-green-200',
    darkCls: 'bg-green-950/80 text-green-300 border-green-800',
  },
};

export const SafetyDashboardView: React.FC = () => {
  const {
    filteredIncidents,
    setSelectedIncident,
    filters,
    resetFilters,
    handleConfirm,
    handleDispute,
    userVotes,
    hapticFeedback,
    refreshIncidents,
    isLoadingIncidents,
  } = useSafety();

  const isDark = filters.mapTileStyle === 'dark';

  // Compute live safety score based on current active alerts
  const { safetyScore, criticalCount, totalCount } = useMemo(() => {
    const total = filteredIncidents.length;
    let penalty = 0;
    let critical = 0;

    filteredIncidents.forEach((inc) => {
      if (inc.severity === 'critical') {
        penalty += 20;
        critical++;
      } else if (inc.severity === 'high') {
        penalty += 12;
      } else if (inc.severity === 'medium') {
        penalty += 6;
      } else {
        penalty += 2;
      }
    });

    const score = Math.max(20, Math.min(100, 100 - penalty));
    return { safetyScore: score, criticalCount: critical, totalCount: total };
  }, [filteredIncidents]);

  return (
    <div
      className={`fixed inset-0 w-full h-full overflow-y-auto pt-[max(env(safe-area-inset-top),90px)] pb-28 px-4 sm:px-6 transition-colors duration-300 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {/* ── 1. Real-Time Safety Status Summary Card ───────────────────── */}
        <div
          className={`p-4 sm:p-5 rounded-3xl border shadow-sheet transition-all ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 backdrop-blur-2xl'
              : 'bg-white border-slate-200/90 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-md ${
                  safetyScore >= 75
                    ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                    : safetyScore >= 50
                    ? 'bg-amber-500 text-white shadow-amber-500/20'
                    : 'bg-red-500 text-white shadow-red-500/20'
                }`}
              >
                {safetyScore}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className={`text-2xs font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Indice de Sécurité · En Direct
                  </span>
                </div>
                <h1 className={`text-base sm:text-lg font-black leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {safetyScore >= 75
                    ? 'Secteur Globalement Serein'
                    : safetyScore >= 50
                    ? 'Vigilance Recommandée'
                    : 'Alerte : Dangers Multiples Signalés'}
                </h1>
              </div>
            </div>

            <button
              onClick={() => {
                hapticFeedback('light');
                refreshIncidents();
              }}
              className={`p-2 rounded-xl border transition-all active:scale-95 ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
              title="Actualiser le flux"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingIncidents ? 'animate-spin text-blue-500' : ''}`} />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
            <div className="flex flex-col">
              <span className={`text-2xs font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Signalements
              </span>
              <span className="text-base font-extrabold">{totalCount} actifs</span>
            </div>
            <div className="flex flex-col">
              <span className={`text-2xs font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Dangers Majeurs
              </span>
              <span className={`text-base font-extrabold ${criticalCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {criticalCount}
              </span>
            </div>
            <div className="flex flex-col">
              <span className={`text-2xs font-bold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Temps Réel
              </span>
              <span className="text-base font-extrabold text-blue-500">Actif 24/7</span>
            </div>
          </div>
        </div>

        {/* ── 2. Active Filters Reset (if any filter is on) ─────────────── */}
        {(filters.selectedCategories.length > 0 || filters.minSeverity !== 'all' || filters.onlyLive) && (
          <div className="flex items-center justify-between px-1">
            <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Filtres actifs ({filteredIncidents.length} résultat{filteredIncidents.length > 1 ? 's' : ''})
            </span>
            <button
              onClick={() => {
                hapticFeedback('light');
                resetFilters();
              }}
              className="text-xs font-bold text-blue-500 hover:underline"
            >
              Réinitialiser les filtres
            </button>
          </div>
        )}

        {/* ── 3. Live Incidents List ────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {filteredIncidents.length === 0 ? (
            <div
              className={`p-8 rounded-3xl border text-center flex flex-col items-center justify-center ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <ShieldCheck className="w-12 h-12 text-emerald-500 mb-3 opacity-80" />
              <h3 className="text-base font-bold mb-1">Aucun signalement dans cette sélection</h3>
              <p className={`text-xs max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Le secteur ne présente aucun danger correspondant à vos filtres actuels.
              </p>
            </div>
          ) : (
            filteredIncidents.map((inc) => {
              const color = categoryColors[inc.category] || '#EF4444';
              const IconComp = categoryIcons[inc.category] || AlertTriangle;
              const label = categoryLabels[inc.category] || 'Signalement';
              const badge = SEVERITY_BADGES[inc.severity] || SEVERITY_BADGES.medium;
              const userVote = userVotes[inc.id];

              return (
                <div
                  key={inc.id}
                  onClick={() => {
                    hapticFeedback('medium');
                    setSelectedIncident(inc);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer select-none active:scale-[0.99] group shadow-xs ${
                    isDark
                      ? 'bg-slate-900/80 hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                      : 'bg-white hover:bg-slate-50/90 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: color }}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <span className={`text-2xs font-extrabold uppercase tracking-wide block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {label}
                        </span>
                        <h2 className={`text-sm sm:text-base font-bold truncate leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {inc.title}
                        </h2>
                      </div>
                    </div>

                    <span
                      className={`text-2xs font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${
                        isDark ? badge.darkCls : badge.lightCls
                      }`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Description (if present) */}
                  {inc.description && (
                    <p className={`text-xs mb-3 line-clamp-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {inc.description}
                    </p>
                  )}

                  {/* Metadata & Confirmation Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <div className="flex items-center gap-3 min-w-0 text-2xs sm:text-xs">
                      <div className={`flex items-center gap-1 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate">{inc.address || inc.city || 'Paris'}</span>
                      </div>
                      <div className={`flex items-center gap-1 shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{formatExactAgo(inc.created_at)}</span>
                      </div>
                    </div>

                    {/* Quick Confirm & Dispute Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleConfirm(inc.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-2xs font-bold transition-all active:scale-95 ${
                          userVote === 'confirm'
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-xs'
                            : isDark
                            ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                        }`}
                        title="Confirmer ce signalement"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        <span>{inc.confirmations_count}</span>
                      </button>

                      <button
                        onClick={() => handleDispute(inc.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-2xs font-bold transition-all active:scale-95 ${
                          userVote === 'dispute'
                            ? 'bg-red-500 text-white border-red-600 shadow-xs'
                            : isDark
                            ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-400'
                            : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-500'
                        }`}
                        title="Contester ce signalement"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        {inc.disputes_count > 0 && <span>{inc.disputes_count}</span>}
                      </button>

                      <ChevronRight className={`w-4 h-4 ml-0.5 group-hover:translate-x-0.5 transition-transform ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
