import React from 'react';
import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useNetwork } from '../../hooks/useNetwork';

export const OfflineBanner: React.FC = () => {
  const { isOnline, wasOffline } = useNetwork();

  if (isOnline && !wasOffline) return null;

  return (
    <div className="fixed top-20 inset-x-0 z-50 flex justify-center px-4 pointer-events-none animate-slide-down">
      {!isOnline ? (
        <div className="glass px-3.5 py-2 rounded-2xl border border-amber-500/30 bg-amber-950/80 backdrop-blur-xl text-amber-200 text-xs font-semibold flex items-center gap-2.5 shadow-lg pointer-events-auto">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span>Mode hors-ligne — Données et carte locales disponibles</span>
        </div>
      ) : wasOffline ? (
        <div className="glass px-3.5 py-2 rounded-2xl border border-emerald-500/30 bg-emerald-950/80 backdrop-blur-xl text-emerald-200 text-xs font-semibold flex items-center gap-2.5 shadow-lg pointer-events-auto animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Connexion rétablie — Données synchronisées</span>
        </div>
      ) : null}
    </div>
  );
};
