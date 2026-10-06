import React, { useState } from 'react';
import { X, Flame, MapPin, Clock, ArrowRight, ShieldCheck, Plus, AlertTriangle, Trash2 } from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import { categoryColors, categoryIcons } from '../../design/tokens';
import type { IncidentDTO } from '../../api/incidentApi';
import { formatExactAgo } from '../../utils/timeAgo';
import { useNow } from '../../hooks/useNow';

export const LiveFeedDrawer: React.FC = () => {
  const { activeModal, setActiveModal, incidents, setMapCenter, setSelectedIncident, handleDelete, hapticFeedback } = useSafety();
  const [tab, setTab] = useState<'all' | 'recent' | 'critical'>('all');
  const now = useNow(30_000, activeModal === 'live');

  if (activeModal !== 'live') return null;

  const live = [...incidents]
    .filter((i) => i.status === 'active')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .filter((i) => {
      const age = now - new Date(i.created_at).getTime();
      if (tab === 'recent') return age < 30 * 60_000;
      if (tab === 'critical') return i.severity === 'high' || i.severity === 'critical';
      return true;
    });

  const handleSelect = (inc: IncidentDTO) => {
    hapticFeedback('medium');
    setMapCenter([inc.latitude, inc.longitude], 16.8);
    setSelectedIncident(inc);
    setActiveModal(null);
  };

  const onDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer ce signalement ?')) return;
    try {
      hapticFeedback('heavy');
      await handleDelete(id);
    } catch (err) {
      console.warn('Delete error:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-white rounded-t-4xl sm:rounded-4xl shadow-sheet max-h-[88vh] flex flex-col border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4 shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
              <Flame className="w-5 h-5 text-s-danger animate-pulse-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-slate-900">Direct / Temps Réel</span>
                {live.length > 0 && <div className="w-2 h-2 rounded-full bg-s-danger animate-pulse" />}
              </div>
              <div className="text-xs text-slate-500 font-medium">Flux géolocalisé en direct</div>
            </div>
          </div>
          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 py-3 shrink-0">
          {([
            { id: 'all',      label: `Tous (${incidents.filter((i) => i.status === 'active').length})` },
            { id: 'recent',   label: 'Récents (<30min)' },
            { id: 'critical', label: 'Urgents'          },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                hapticFeedback('light');
                setTab(t.id);
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all border ${
                tab === t.id
                  ? 'bg-s-primary text-white border-s-primary shadow-sm'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-2">
          {live.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-16 h-16 rounded-3xl bg-green-50 border border-green-200 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-s-green" />
              </div>
              <div className="text-base font-extrabold text-slate-900">Tout est calme</div>
              <div className="text-sm text-slate-500 mt-1.5 max-w-xs leading-relaxed font-medium">
                Aucun incident en cours dans votre secteur actif.
              </div>
              <button
                onClick={() => {
                  hapticFeedback('medium');
                  setActiveModal('report');
                }}
                className="mt-5 btn-ghost flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5 text-s-primary" />
                Signaler un danger
              </button>
            </div>
          ) : (
            live.map((inc) => {
              const color = categoryColors[inc.category] || '#64748B';
              const Icon = categoryIcons[inc.category] || AlertTriangle;
              const ageMs = now - new Date(inc.created_at).getTime();
              const isVeryRecent = ageMs < 15 * 60_000;

              return (
                <div
                  key={inc.id}
                  onClick={() => handleSelect(inc)}
                  className="w-full flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 hover:bg-blue-50/70 border border-slate-200 transition-all active:scale-[0.99] group text-left shadow-sm cursor-pointer"
                >
                  <div className="relative w-10 h-10 shrink-0">
                    {isVeryRecent && <div className="marker-pulse-live" style={{ inset: '-3px' }} />}
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white relative z-10 shadow-sm"
                      style={{ background: color }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="text-sm font-extrabold text-slate-900 truncate group-hover:text-s-primary transition-colors">
                        {inc.title}
                      </div>
                      {isVeryRecent && (
                        <span className="text-2xs uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-red-100 text-s-danger border border-red-200 shrink-0">
                          Direct
                        </span>
                      )}
                    </div>
                    {inc.description && (
                      <p className="text-xs text-slate-600 line-clamp-1 leading-relaxed mb-1.5 font-medium">
                        {inc.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-2xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-s-primary" />
                        <span className="truncate">{inc.address || inc.neighborhood || 'Localisation repérée'}</span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatExactAgo(inc.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-center">
                    <button
                      onClick={(e) => onDelete(e, inc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Supprimer ce signalement"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-s-primary group-hover:translate-x-0.5 transition-all shrink-0" />
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
