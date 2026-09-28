import React from 'react';
import {
  X, Check, RotateCcw, Trash2, MapPin,
  Route, Pentagon
} from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { categoryLabels, categoryColors } from '../../design/tokens';

export const VectorDrawingControls: React.FC = () => {
  const {
    drawingMode, drawingCategory, drawingOrigin, drawingCoordinates,
    startDrawing, undoDrawingVertex, clearDrawing,
    finishDrawing, cancelDrawing, setActiveModal,
    hapticFeedback, filters,
  } = useSafety();

  if (drawingMode === 'idle') return null;

  const isDark = filters.mapTileStyle === 'dark';
  const catColor = categoryColors[drawingCategory] || '#2563EB';
  const catLabel = categoryLabels[drawingCategory] || 'Signalement';

  const pointCount = drawingCoordinates.length;
  const isValid =
    (drawingMode === 'point' && pointCount >= 1) ||
    (drawingMode === 'linestring' && pointCount >= 2) ||
    (drawingMode === 'polygon' && pointCount >= 3);

  const handleFinish = () => {
    hapticFeedback('success');
    const geom = finishDrawing();
    if (geom) {
      setActiveModal('report');
    }
  };

  const handleCancel = () => {
    hapticFeedback('light');
    cancelDrawing();
    if (drawingOrigin === 'report') {
      setActiveModal('report');
    }
  };

  return (
    <div className="fixed inset-x-0 top-[max(env(safe-area-inset-top),16px)] sm:top-16 z-50 px-4 pointer-events-none flex flex-col items-center gap-2.5">
      {/* ── Top Floating Instruction Pill (Apple Glass) ────────────────── */}
      <div
        className={`pointer-events-auto px-4 py-2.5 rounded-2xl border shadow-xl backdrop-blur-2xl flex items-center gap-3 max-w-md w-full animate-slide-down ${
          isDark
            ? 'bg-slate-900/90 text-white border-slate-700/80 shadow-black/40'
            : 'bg-white/95 text-slate-900 border-slate-200/90 shadow-slate-900/10'
        }`}
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
          style={{ background: catColor }}
        >
          {drawingMode === 'point' && <MapPin className="w-4 h-4" />}
          {drawingMode === 'linestring' && <Route className="w-4 h-4" />}
          {drawingMode === 'polygon' && <Pentagon className="w-4 h-4" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black truncate">{catLabel}</span>
            <span
              className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded-md"
              style={{ background: `${catColor}20`, color: catColor }}
            >
              {drawingMode === 'point' ? 'Point' : drawingMode === 'linestring' ? 'Ligne' : 'Zone'}
            </span>
          </div>
          <p className={`text-2xs leading-tight truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {drawingMode === 'point' && 'Touchez la carte pour placer le point'}
            {drawingMode === 'linestring' && (pointCount === 0 ? 'Touchez la carte pour débuter le tracé' : `${pointCount} point(s) placé(s) · Touchez pour continuer`)}
            {drawingMode === 'polygon' && (pointCount < 3 ? `Placez au moins 3 sommets (${pointCount}/3)` : `${pointCount} sommets · Prêt à fermer la zone`)}
          </p>
        </div>

        <button
          onClick={handleCancel}
          className={`p-1.5 rounded-xl transition-colors ${
            isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
          }`}
          title="Annuler le dessin"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Mode Switcher & Geometry Selection Chips ────────────────────── */}
      <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-lg">
        <button
          onClick={() => {
            hapticFeedback('light');
            startDrawing('point', drawingCategory);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            drawingMode === 'point'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span>Point</span>
        </button>

        <button
          onClick={() => {
            hapticFeedback('light');
            startDrawing('linestring', drawingCategory);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            drawingMode === 'linestring'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <Route className="w-3.5 h-3.5" />
          <span>Ligne</span>
        </button>

        <button
          onClick={() => {
            hapticFeedback('light');
            startDrawing('polygon', drawingCategory);
          }}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            drawingMode === 'polygon'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-white/80 hover:text-white hover:bg-white/10'
          }`}
        >
          <Pentagon className="w-3.5 h-3.5" />
          <span>Zone</span>
        </button>
      </div>

      {/* ── Bottom Action Toolbar (Mobile-first Floating Dock) ─────────── */}
      <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),16px)+10px)] px-4 pointer-events-none flex justify-center z-50">
        <div
          className={`pointer-events-auto p-2 rounded-3xl border shadow-2xl backdrop-blur-3xl flex items-center gap-2 max-w-sm w-full animate-slide-up ${
            isDark
              ? 'bg-slate-900/95 text-white border-slate-700/80 shadow-black/60'
              : 'bg-white/98 text-slate-900 border-slate-200/90 shadow-slate-900/15'
          }`}
        >
          <button
            onClick={() => {
              hapticFeedback('light');
              undoDrawingVertex();
            }}
            disabled={pointCount === 0}
            className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${
              pointCount > 0
                ? isDark ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            title="Annuler le dernier point"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              hapticFeedback('medium');
              clearDrawing();
            }}
            disabled={pointCount === 0}
            className={`p-2.5 rounded-2xl flex items-center justify-center transition-all ${
              pointCount > 0
                ? isDark ? 'bg-slate-800 hover:bg-slate-700 text-red-400' : 'bg-slate-100 hover:bg-slate-200 text-red-500'
                : 'opacity-30 cursor-not-allowed text-slate-400'
            }`}
            title="Effacer tout"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleFinish}
            disabled={!isValid}
            className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
              isValid
                ? 'bg-s-primary hover:bg-blue-700 text-white shadow-blue-500/25'
                : 'opacity-40 cursor-not-allowed bg-slate-300 dark:bg-slate-800 text-slate-500'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>Valider le tracé {pointCount > 0 ? `(${pointCount})` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
