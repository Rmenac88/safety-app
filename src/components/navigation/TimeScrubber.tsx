import React, { useState, useEffect, useRef } from 'react';
import { Clock, RotateCcw, X, Sun, Moon } from 'lucide-react';
import { useSafety } from '../../context/useSafety';

export const TimeScrubber: React.FC = () => {
  const { filters, updateFilters, hapticFeedback } = useSafety();
  const [isOpen, setIsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const popoverRef = useRef<HTMLDivElement>(null);

  // Live real-time internal clock (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isDark = filters.mapTileStyle === 'dark';
  const realHour = currentTime.getHours();
  const realMinute = currentTime.getMinutes();
  const simulatedHour = filters.simulatedHour;
  const isSimulated = simulatedHour !== realHour;

  // Display hour & minutes
  const displayHour = isSimulated ? simulatedHour : realHour;
  const displayMinute = isSimulated ? 0 : realMinute;

  const hourStr = String(displayHour).padStart(2, '0');
  const minStr = String(displayMinute).padStart(2, '0');

  const resetToRealTime = () => {
    hapticFeedback('success');
    updateFilters({ simulatedHour: realHour });
    setIsOpen(false);
  };

  // 24h circle progress (0 to 1) for the sleek digital perimeter ring
  const dayProgress = (displayHour * 60 + displayMinute) / (24 * 60);
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - dayProgress);

  return (
    <div
      ref={popoverRef}
      className="fixed left-3 sm:left-6 bottom-28 sm:bottom-6 z-30 select-none pointer-events-auto transition-all duration-300"
    >
      {/* ── Apple-Grade Digital Watch Widget (Sans Aiguilles, Sans Point Vert) ── */}
      <button
        onClick={() => {
          hapticFeedback('light');
          setIsOpen(!isOpen);
        }}
        className={`w-13 h-13 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl border shadow-island backdrop-blur-3xl flex flex-col items-center justify-center relative transition-all duration-300 active:scale-95 group touch-manipulation cursor-pointer ${
          isSimulated
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-500 ring-2 ring-amber-500/30 shadow-amber-500/20'
            : isDark
            ? 'bg-slate-900/94 border-slate-700/80 text-white shadow-black/60 hover:border-sky-500/60 ring-1 ring-white/10'
            : 'bg-white/94 border-slate-200/90 text-slate-900 shadow-slate-900/15 hover:border-blue-400/60 ring-1 ring-black/5'
        } ${isOpen ? 'ring-2 ring-s-primary' : ''}`}
        title="Horloge de vigilance numérique (cliquer pour simuler l'heure)"
        aria-label="Horloge de vigilance"
      >
        {/* Subtle Minimalist Circular Track Ring (Progression 24h sans aiguilles) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none -rotate-90 p-1" viewBox="0 0 60 60">
          <circle
            cx="30"
            cy="30"
            r={ringRadius}
            fill="none"
            stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
            strokeWidth="2.5"
          />
          <circle
            cx="30"
            cy="30"
            r={ringRadius}
            fill="none"
            stroke={isSimulated ? '#F59E0B' : (isDark ? '#38BDF8' : '#2563EB')}
            strokeWidth="2.5"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>

        {/* Clean Apple Digital Time Display */}
        <div className="flex flex-col items-center justify-center z-10 leading-none">
          <span className="font-mono font-black text-xs sm:text-sm tracking-tight">
            {hourStr}
            <span className={`${isSimulated ? 'text-amber-500' : 'text-s-primary'} animate-pulse`}>:</span>
            {minStr}
          </span>
          <span
            className={`text-[8px] sm:text-[9px] font-extrabold uppercase tracking-wider mt-0.5 sm:mt-1 ${
              isSimulated
                ? 'text-amber-500 font-black'
                : isDark
                ? 'text-slate-400 group-hover:text-slate-300'
                : 'text-slate-500 group-hover:text-slate-700'
            }`}
          >
            {isSimulated ? 'Simulé' : 'Direct'}
          </span>
        </div>
      </button>

      {/* ── Expanded Popover Menu on Click ──────────────────────────── */}
      {isOpen && (
        <div
          className={`absolute left-0 bottom-16 sm:bottom-20 w-64 sm:w-72 rounded-3xl p-4 border shadow-sheet backdrop-blur-2xl animate-scale-in transition-all z-40 ${
            isDark
              ? 'bg-slate-900/96 text-white border-slate-700/80 shadow-black/50'
              : 'bg-white/98 text-slate-900 border-slate-200/90 shadow-slate-900/15'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                isSimulated ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-s-primary'
              }`}>
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black block">Horloge de Vigilance</span>
                <span className="text-[10px] text-slate-400 block -mt-0.5">Simulation temporelle</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isSimulated && (
                <button
                  onClick={resetToRealTime}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-s-primary/10 text-s-primary hover:bg-s-primary/20 transition-colors"
                  title="Revenir à l'heure réelle en direct"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Direct</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Current Status Pill */}
          <div
            className={`p-2.5 rounded-2xl border flex items-center justify-between mb-3 text-xs ${
              isSimulated
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold'
                : isDark
                ? 'bg-slate-800/60 border-slate-700 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {displayHour >= 7 && displayHour < 20 ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span className="text-[11px] font-medium">
                {isSimulated ? 'Mode Simulation' : 'Heure Réelle (Direct)'}
              </span>
            </div>
            <span className="font-mono font-black text-xs">
              {hourStr}:{minStr}
            </span>
          </div>

          {/* Horizontal Hour Slider */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>00h (Nuit)</span>
              <span>12h (Midi)</span>
              <span>23h (Soir)</span>
            </div>
            <input
              type="range"
              min={0}
              max={23}
              step={1}
              value={displayHour}
              onChange={(e) => {
                hapticFeedback('light');
                updateFilters({ simulatedHour: Number(e.target.value) });
              }}
              className="w-full h-2 rounded-full accent-s-primary cursor-pointer bg-slate-200 dark:bg-slate-700"
            />
          </div>

          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2.5 border-t border-slate-200/50 dark:border-slate-700/50">
            {[
              { label: 'Matin', h: 8, icon: '🌅' },
              { label: 'Midi', h: 12, icon: '☀️' },
              { label: 'Soir', h: 19, icon: '🌇' },
              { label: 'Nuit', h: 23, icon: '🌙' },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  hapticFeedback('light');
                  updateFilters({ simulatedHour: p.h });
                }}
                className={`py-1.5 rounded-xl text-[10px] font-bold border transition-all flex flex-col items-center gap-0.5 active:scale-95 ${
                  displayHour === p.h
                    ? 'bg-s-primary text-white border-s-primary shadow-xs'
                    : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="text-xs">{p.icon}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
