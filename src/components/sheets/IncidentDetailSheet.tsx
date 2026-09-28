import React, { useState, useEffect } from 'react';
import { X, MapPin, ThumbsUp, ThumbsDown, CheckCircle, Share2, User, AlertTriangle, Trash2 } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { categoryColors, categoryIcons, categoryLabels } from '../../design/tokens';
import { formatExactAgo } from '../../utils/timeAgo';

const SEVERITY_LABELS: Record<string, { label: string; lightCls: string; darkCls: string }> = {
  critical: {
    label: 'Critique',
    lightCls: 'bg-red-100 text-s-critical border-red-300',
    darkCls: 'bg-red-950/80 text-red-400 border-red-800',
  },
  high: {
    label: 'Élevé',
    lightCls: 'bg-red-50 text-s-danger border-red-200',
    darkCls: 'bg-red-900/40 text-red-300 border-red-700',
  },
  medium: {
    label: 'Modéré',
    lightCls: 'bg-amber-50 text-s-amber border-amber-200',
    darkCls: 'bg-amber-950/60 text-amber-300 border-amber-700',
  },
  low: {
    label: 'Faible',
    lightCls: 'bg-green-50 text-s-green border-green-200',
    darkCls: 'bg-green-950/60 text-green-300 border-green-700',
  },
};

import { ShareIncidentModal } from '../sharing/ShareIncidentModal';

export const IncidentDetailSheet: React.FC = () => {
  const {
    selectedIncident, setSelectedIncident,
    handleConfirm, handleDispute, handleResolve, handleDelete,
    userVotes, hapticFeedback, setMapCamera, filters, myIncidentIds,
  } = useSafety();

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [, setTick] = useState(0);

  // Live timer tick every 15s
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  if (!selectedIncident) return null;

  const isDark = filters.mapTileStyle === 'dark';
  const inc = selectedIncident;
  const userVoted = userVotes[inc.id] || null;
  const color = categoryColors[inc.category] || '#EF4444';
  const IconComponent = categoryIcons[inc.category] || AlertTriangle;
  const label = categoryLabels[inc.category] || 'Signalement';
  const sev = SEVERITY_LABELS[inc.severity] || SEVERITY_LABELS.low;

  const ageMs = Date.now() - new Date(inc.created_at).getTime();
  const isVeryRecent = ageMs < 15 * 60_000;

  const handleCenterOnMap = () => {
    hapticFeedback('medium');
    setMapCamera({
      center: [inc.latitude, inc.longitude],
      zoom: 17.2,
      pitch: 42,
      duration: 1200,
    });
  };

  const onConfirm = async () => {
    try {
      hapticFeedback('medium');
      await handleConfirm(inc.id);
    } catch (e) {
      console.warn('Confirm action warning:', e);
    }
  };

  const onDispute = async () => {
    try {
      hapticFeedback('medium');
      await handleDispute(inc.id);
    } catch (e) {
      console.warn('Dispute action warning:', e);
    }
  };

  const onResolve = async () => {
    try {
      hapticFeedback('success');
      await handleResolve(inc.id);
    } catch (e) {
      console.warn('Resolve action warning:', e);
    }
  };

  const confirmDeleteAction = async () => {
    try {
      hapticFeedback('heavy');
      setShowDeleteConfirm(false);
      await handleDelete(inc.id);
      setSelectedIncident(null);
    } catch (e) {
      console.warn('Delete action warning:', e);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-24 max-w-lg mx-auto pointer-events-none">
      <div
        className={`rounded-4xl p-5 pointer-events-auto animate-slide-up max-h-[82vh] overflow-y-auto border shadow-sheet transition-colors duration-200 ${
          isDark
            ? 'bg-slate-900/96 text-white border-slate-700/80 backdrop-blur-3xl'
            : 'bg-white/98 text-slate-900 border-slate-200/90 backdrop-blur-2xl'
        }`}
      >
        <div className={`w-9 h-1 rounded-full mx-auto mb-4 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-12 h-12 shrink-0">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-xl shadow-md border border-white/20"
                style={{ background: color }}
              >
                <IconComponent className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-black uppercase tracking-wide truncate" style={{ color }}>
                  {label}
                </span>
                {isVeryRecent && (
                  <span className="badge bg-s-danger text-white text-[9px] font-black uppercase px-1.5 py-0.5 animate-pulse">
                    En direct
                  </span>
                )}
              </div>
              <h2 className={`text-base font-extrabold leading-tight truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {inc.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {myIncidentIds?.includes(inc.id) && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className={`p-2 rounded-xl transition-colors ${
                  isDark ? 'hover:bg-red-950/60 text-slate-400 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-500'
                }`}
                title="Supprimer mon signalement (Auteur)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => {
                hapticFeedback('light');
                setSelectedIncident(null);
              }}
              className={`p-2 rounded-xl transition-colors ${
                isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Inline Custom Glassmorphism Delete Confirmation ───────────── */}
        {showDeleteConfirm && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 backdrop-blur-xl animate-scale-in">
            <p className="text-xs font-bold text-red-500 mb-2.5">
              En tant qu'auteur, confirmez-vous la suppression définitive de votre signalement ?
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-colors ${
                  isDark ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteAction}
                className="flex-1 py-2 text-xs font-black rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        )}

        {/* ── Meta Pills ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`badge border text-2xs font-bold px-2.5 py-1 rounded-xl ${
            isDark ? sev.darkCls : sev.lightCls
          }`}>
            {sev.label}
          </span>
          <span className={`badge text-2xs font-semibold px-2.5 py-1 rounded-xl ${
            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
          }`}>
            ⏱ {formatExactAgo(inc.created_at)}
          </span>
          {inc.address && (
            <span
              onClick={handleCenterOnMap}
              className={`badge text-2xs font-medium px-2.5 py-1 rounded-xl flex items-center gap-1 cursor-pointer hover:underline ${
                isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <MapPin className="w-3 h-3 text-s-primary" />
              <span className="truncate max-w-[160px]">{inc.address}</span>
            </span>
          )}
        </div>

        {/* ── Description & Community Meta ────────────────────────────── */}
        <div
          className={`p-3.5 rounded-2xl border mb-4 ${
            isDark
              ? 'bg-slate-800/60 border-slate-700/80 text-slate-300'
              : 'bg-slate-50 border-slate-200/80 text-slate-700'
          }`}
        >
          <p className="text-xs leading-relaxed font-medium">
            {inc.description || 'Signalement citoyen actif géolocalisé.'}
          </p>
          <div
            className={`mt-3 pt-2.5 border-t flex items-center justify-between text-2xs ${
              isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'
            }`}
          >
            <span className="flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5" />
              {inc.is_anonymous ? 'Citoyen Anonyme' : inc.author_pseudonym}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-s-primary font-bold">
                {inc.confirmations_count} confirmation{inc.confirmations_count > 1 ? 's' : ''}
              </span>
              {inc.disputes_count > 0 && (
                <span className="text-s-danger font-bold">
                  {inc.disputes_count} contestation{inc.disputes_count > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <button
            onClick={onConfirm}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all border ${
              userVoted === 'confirm'
                ? isDark
                  ? 'bg-blue-900/60 text-sky-400 border-blue-700 ring-1 ring-blue-700'
                  : 'bg-blue-50 text-s-primary border-blue-300 ring-1 ring-blue-300'
                : isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'btn-ghost hover:text-s-primary'
            }`}
          >
            <ThumbsUp className={`w-3.5 h-3.5 ${userVoted === 'confirm' ? 'text-s-primary fill-blue-500/20' : ''}`} />
            <span>{userVoted === 'confirm' ? `Confirmé (${inc.confirmations_count})` : `Vrai (${inc.confirmations_count})`}</span>
          </button>
          <button
            onClick={onDispute}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl transition-all border ${
              userVoted === 'dispute'
                ? isDark
                  ? 'bg-red-950/60 text-red-400 border-red-700 ring-1 ring-red-700'
                  : 'bg-red-50 text-s-danger border-red-300 ring-1 ring-red-300'
                : isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'btn-ghost hover:text-s-danger'
            }`}
          >
            <ThumbsDown className={`w-3.5 h-3.5 ${userVoted === 'dispute' ? 'text-s-danger fill-red-500/20' : ''}`} />
            <span>{userVoted === 'dispute' ? `Contesté (${inc.disputes_count})` : `Faux (${inc.disputes_count})`}</span>
          </button>
          <button
            onClick={onResolve}
            className={`flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border transition-colors ${
              isDark
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:text-green-400'
                : 'btn-ghost hover:text-s-green hover:border-green-300'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Résolu</span>
          </button>
        </div>

        {/* ── Modération communautaire (Suppression automatique à 10 contestations) ── */}
        <div className={`mb-3 p-2.5 rounded-xl border text-[11px] font-medium flex items-center justify-between ${
          isDark ? 'bg-slate-800/40 border-slate-700/60 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <span className="flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Modération communautaire
          </span>
          <span className="font-semibold text-s-danger">
            {Math.max(0, 10 - (inc.disputes_count || 0))} contestation(s) avant retrait
          </span>
        </div>

        <button
          onClick={() => {
            hapticFeedback('medium');
            setIsShareModalOpen(true);
          }}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl border transition-colors ${
            isDark
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              : 'btn-ghost'
          }`}
        >
          <Share2 className="w-3.5 h-3.5 text-s-primary" />
          <span>Partager cette alerte</span>
        </button>

        {isShareModalOpen && (
          <ShareIncidentModal
            incident={inc}
            onClose={() => setIsShareModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
};
