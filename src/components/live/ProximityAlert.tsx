import React, { useMemo } from 'react';
import { X, Navigation, AlertTriangle } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { categoryColors, categoryIcons } from '../../design/tokens';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export const ProximityAlert: React.FC = () => {
  const { incidents, userLocation, setMapCenter, setSelectedIncident, hapticFeedback } = useSafety();
  const [dismissed, setDismissed] = React.useState<string[]>([]);

  const alert = useMemo(() => {
    if (!userLocation) return null;
    return incidents.find(inc =>
      inc.status === 'active' &&
      !dismissed.includes(inc.id) &&
      (inc.severity === 'high' || inc.severity === 'critical') &&
      haversine(userLocation[0], userLocation[1], inc.latitude, inc.longitude) <= 400
    ) ?? null;
  }, [incidents, userLocation, dismissed]);

  if (!alert) return null;

  const color = categoryColors[alert.category] || '#FF3B5C';
  const dist = userLocation
    ? Math.round(haversine(userLocation[0], userLocation[1], alert.latitude, alert.longitude))
    : null;

  return (
    <div className="absolute top-20 left-4 right-4 z-30 max-w-md mx-auto pointer-events-auto animate-slide-up">
      <div className="glass rounded-2xl border shadow-sheet overflow-hidden"
           style={{ borderColor: `${color}40` }}>
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
        <div className="flex items-center gap-3 p-3.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md"
               style={{ background: color, boxShadow: `0 4px 12px ${color}55` }}>
            {React.createElement(categoryIcons[alert.category] || AlertTriangle, { className: 'w-5 h-5' })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-s-text truncate">{alert.title}</div>
            <div className="text-xs text-s-text-3">
              {dist ? `À ${dist < 1000 ? dist + ' m' : (dist/1000).toFixed(1) + ' km'}` : ''} · {alert.address}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { hapticFeedback('medium'); setMapCenter([alert.latitude, alert.longitude], 17); setSelectedIncident(alert); }}
              className="p-2 rounded-xl text-s-primary hover:bg-s-primary/10 transition-colors"
              title="Voir sur la carte"
            >
              <Navigation className="w-4 h-4" />
            </button>
            <button onClick={() => { hapticFeedback('light'); setDismissed(d => [...d, alert.id]); }}
                    className="p-2 rounded-xl text-s-text-3 hover:bg-white/8 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
