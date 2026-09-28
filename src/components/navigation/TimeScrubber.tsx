import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';

export const TimeScrubber: React.FC = () => {
  const { filters, updateFilters, hapticFeedback } = useSafety();
  const [isOpen, setIsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live real-time internal clock (ticks every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  // Mini analog hands angles
  const hourAngle = (displayHour % 12) * 30 + (displayMinute / 60) * 30;
  const minAngle = displayMinute * 6;

  return (
    <div className="hidden sm:block fixed left-3.5 sm:left-6 bottom-[calc(max(env(safe-area-inset-bottom),14px)+12px)] z-30 select-none pointer-events-auto">
      {/* ── Apple-Grade Circular Watch Widget (Aligned with Bottom Dock) ── */}
      <button
        onClick={() => {
          hapticFeedback('light');
          setIsOpen(!isOpen);
        }}
        className={`w-16 h-16 sm:w-17 sm:h-17 rounded-full border shadow-island backdrop-blur-3xl flex items-center justify-center relative transition-all duration-300 active:scale-95 group ${
          isDark
            ? 'bg-slate-900/90 border-slate-700/80 text-white shadow-black/60 hover:border-sky-500/60 ring-1 ring-white/10'
            : 'bg-white/92 border-slate-200/90 text-slate-900 shadow-slate-900/15 hover:border-blue-400/60 ring-1 ring-black/5'
        } ${isOpen ? 'ring-2 ring-s-primary' : ''}`}
        title="Horloge Apple temps réel & simulation horaire"
      >
        {/* ── Apple Watch Face Dial with Hour Ticks & Hands ───────────── */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 68 68">
          {/* Subtle Outer Bezel Ring */}
          <circle
            cx="34"
            cy="34"
            r="31"
            fill="none"
            stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
            strokeWidth="2"
          />

          {/* 12 Hour Ticks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, i) => {
            const isCardinal = i % 3 === 0;
            return (
              <line
                key={deg}
                x1="34"
                y1={isCardinal ? "5.5" : "7"}
                x2="34"
                y2={isCardinal ? "9.5" : "8.5"}
                stroke={isCardinal ? (isDark ? '#94A3B8' : '#64748B') : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')}
                strokeWidth={isCardinal ? "1.8" : "1"}
                strokeLinecap="round"
                transform={`rotate(${deg} 34 34)`}
              />
            );
          })}

          {/* Hour Hand */}
          <line
            x1="34"
            y1="34"
            x2="34"
            y2="19"
            stroke={isSimulated ? '#F59E0B' : (isDark ? '#F8FAFC' : '#0F172A')}
            strokeWidth="2.8"
            strokeLinecap="round"
            transform={`rotate(${hourAngle} 34 34)`}
          />

          {/* Minute Hand */}
          <line
            x1="34"
            y1="34"
            x2="34"
            y2="12.5"
            stroke={isSimulated ? '#F59E0B' : (isDark ? '#38BDF8' : '#2563EB')}
            strokeWidth="1.8"
            strokeLinecap="round"
            transform={`rotate(${minAngle} 34 34)`}
          />

          {/* Center Pivot Jewel */}
          <circle
            cx="34"
            cy="34"
            r="2.4"
            fill={isSimulated ? '#F59E0B' : (isDark ? '#38BDF8' : '#2563EB')}
          />
          <circle
            cx="34"
            cy="34"
            r="1"
            fill={isDark ? '#0F172A' : '#FFFFFF'}
          />
        </svg>

        {/* Digital Time Pill Overlaid Cleanly at Bottom */}
        <div className={`absolute bottom-1.5 px-2 py-0.5 rounded-full backdrop-blur-md border text-[9px] font-mono font-extrabold tracking-tight z-10 leading-none shadow-xs ${
          isSimulated
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-500 dark:text-amber-400'
            : isDark
            ? 'bg-slate-800/80 border-slate-700/80 text-slate-300'
            : 'bg-slate-100/90 border-slate-200 text-slate-700'
        }`}>
          {hourStr}:{minStr}
        </div>

        {/* Live Indicator Pulse on Top Rim */}
        <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ring-2 ${
          isDark ? 'ring-slate-900' : 'ring-white'
        } ${isSimulated ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500 animate-ping'}`} />
        <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${
          isSimulated ? 'bg-amber-400' : 'bg-emerald-500'
        }`} />
      </button>

      {/* ── Expanded Popover Menu on Click ──────────────────────────── */}
      {isOpen && (
        <div
          className={`absolute left-0 bottom-16 w-60 rounded-3xl p-4 border shadow-sheet backdrop-blur-2xl animate-scale-in transition-all ${
            isDark
              ? 'bg-slate-900/96 text-white border-slate-700/80 shadow-black/50'
              : 'bg-white/98 text-slate-900 border-slate-200/90 shadow-slate-900/15'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-s-primary" />
              <span className="text-xs font-black">Horloge de Vigilance</span>
            </div>
            {isSimulated && (
              <button
                onClick={resetToRealTime}
                className="flex items-center gap-1 text-[10px] font-bold text-s-primary hover:underline"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Direct</span>
              </button>
            )}
          </div>

          {/* Current Status Pill */}
          <div className={`p-2.5 rounded-2xl border flex items-center justify-between mb-3 text-xs ${
            isSimulated
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold'
              : isDark
              ? 'bg-slate-800/60 border-slate-700 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <span className="text-[11px] font-medium">
              {isSimulated ? 'Mode Simulation' : 'Temps Réel Direct'}
            </span>
            <span className="font-mono font-black text-xs">
              {hourStr}:{minStr}
            </span>
          </div>

          {/* Horizontal Hour Slider */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
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
              { label: 'Matin', h: 8 },
              { label: 'Midi', h: 12 },
              { label: 'Soir', h: 19 },
              { label: 'Nuit', h: 23 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  hapticFeedback('light');
                  updateFilters({ simulatedHour: p.h });
                }}
                className={`py-1.5 rounded-xl text-[10px] font-bold border transition-colors ${
                  displayHour === p.h
                    ? 'bg-blue-600 text-white border-blue-600'
                    : isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

