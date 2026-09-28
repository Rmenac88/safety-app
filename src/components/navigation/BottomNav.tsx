import React from 'react';
import { Map, Flame, Star, Shield, Plus } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';

export const BottomNav: React.FC = () => {
  const {
    activeModal, setActiveModal, setSelectedIncident, setSelectedLocation,
    hapticFeedback, filteredIncidents, filters, drawingMode,
  } = useSafety();

  // Only hide bottom dock during active vector drawing mode to leave space for drawing toolbar
  if (drawingMode !== 'idle') return null;

  const isDark = filters.mapTileStyle === 'dark';

  const liveCount = filteredIncidents.filter((i) => {
    const age = Date.now() - new Date(i.created_at).getTime();
    return age < 3_600_000;
  }).length;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 safe-bottom pointer-events-none animate-slide-up">
      <div className="max-w-md mx-auto px-4 pb-3 sm:pb-4 flex items-center justify-center pointer-events-auto">
        {/* ── Apple Unified Glass Dock ─────────────────────────────────── */}
        <div
          className={`w-full backdrop-blur-2xl rounded-3xl shadow-island flex items-center justify-between p-1.5 border transition-all duration-200 ${
            isDark
              ? 'bg-slate-900/94 border-slate-700/80 text-white shadow-black/40'
              : 'bg-white/94 border-slate-200/90 text-slate-900 shadow-slate-900/10'
          }`}
        >
          {/* 1. Carte */}
          <button
            onClick={() => {
              hapticFeedback('light');
              setSelectedLocation(null);
              setSelectedIncident(null);
              setActiveModal(null);
            }}
            className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl transition-all duration-200 ${
              activeModal === null
                ? isDark ? 'text-white font-extrabold' : 'text-slate-950 font-extrabold'
                : isDark
                ? 'text-slate-400 hover:text-white font-medium'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            {activeModal === null && (
              <div className={`absolute inset-0 rounded-2xl -z-10 ${isDark ? 'bg-white/12' : 'bg-slate-100'}`} />
            )}
            <Map className="w-5 h-5" strokeWidth={activeModal === null ? 2.5 : 2} />
            <span className="text-[10px] leading-none">Carte</span>
          </button>

          {/* 2. Direct */}
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal('live');
            }}
            className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl transition-all duration-200 ${
              activeModal === 'live'
                ? isDark ? 'text-white font-extrabold' : 'text-slate-950 font-extrabold'
                : isDark
                ? 'text-slate-400 hover:text-white font-medium'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            {activeModal === 'live' && (
              <div className={`absolute inset-0 rounded-2xl -z-10 ${isDark ? 'bg-white/12' : 'bg-slate-100'}`} />
            )}
            <div className="relative">
              <Flame className="w-5 h-5" strokeWidth={activeModal === 'live' ? 2.5 : 2} />
              {liveCount > 0 && (
                <div className="absolute -top-1 -right-2 min-w-[15px] h-3.5 px-1 rounded-full bg-s-danger text-white text-[8px] font-bold flex items-center justify-center animate-pulse-slow shadow-sm">
                  {liveCount > 9 ? '9+' : liveCount}
                </div>
              )}
            </div>
            <span className="text-[10px] leading-none">Direct</span>
          </button>

          {/* 3. CENTER FAB: Signaler (+) */}
          <div className="px-1 shrink-0">
            <button
              onClick={() => {
                hapticFeedback('heavy');
                setActiveModal('report');
              }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center
                         bg-gradient-to-br from-s-danger via-[#E11D48] to-s-critical
                         text-white shadow-fab border border-white/30
                         active:scale-90 hover:scale-105 transition-all duration-200 group"
              title="Signaler une situation"
            >
              <Plus className="w-6 h-6 stroke-[2.5] group-hover:rotate-90 transition-transform duration-200" />
            </button>
          </div>

          {/* 4. Favoris */}
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal('favorites');
            }}
            className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl transition-all duration-200 ${
              activeModal === 'favorites'
                ? isDark ? 'text-white font-extrabold' : 'text-slate-950 font-extrabold'
                : isDark
                ? 'text-slate-400 hover:text-white font-medium'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            {activeModal === 'favorites' && (
              <div className={`absolute inset-0 rounded-2xl -z-10 ${isDark ? 'bg-white/12' : 'bg-slate-100'}`} />
            )}
            <Star className="w-5 h-5" strokeWidth={activeModal === 'favorites' ? 2.5 : 2} />
            <span className="text-[10px] leading-none">Favoris</span>
          </button>

          {/* 5. Sécurité */}
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal('moderation');
            }}
            className={`relative flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl transition-all duration-200 ${
              activeModal === 'moderation'
                ? isDark ? 'text-white font-extrabold' : 'text-slate-950 font-extrabold'
                : isDark
                ? 'text-slate-400 hover:text-white font-medium'
                : 'text-slate-500 hover:text-slate-900 font-medium'
            }`}
          >
            {activeModal === 'moderation' && (
              <div className={`absolute inset-0 rounded-2xl -z-10 ${isDark ? 'bg-white/12' : 'bg-slate-100'}`} />
            )}
            <Shield className="w-5 h-5" strokeWidth={activeModal === 'moderation' ? 2.5 : 2} />
            <span className="text-[10px] leading-none">Sécurité</span>
          </button>
        </div>
      </div>
    </div>
  );
};
