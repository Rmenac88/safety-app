import React, { useState } from 'react';
import { ShieldCheck, Map, Flame, Bell, X } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';

const SLIDES = [
  {
    icon: ShieldCheck,
    color: '#2563EB',
    title: 'Bienvenue sur Safety',
    desc: 'Comprenez en un instant le niveau de sécurité d\'un lieu, d\'une rue ou d\'un quartier — partout dans le monde.',
  },
  {
    icon: Map,
    color: '#38BDF8',
    title: 'Cartographie en temps réel',
    desc: 'Une couche de vigilance sur la carte du monde avec coloration vectorielle des rues et signalements citoyens réels.',
  },
  {
    icon: Flame,
    color: '#EF4444',
    title: 'Flux Direct & Vidéo',
    desc: 'Signalements géolocalisés à la rue précise, vérifiés par la communauté en temps réel.',
  },
  {
    icon: Bell,
    color: '#F59E0B',
    title: 'Alertes Ciblées',
    desc: 'Recevez uniquement les alertes situées dans votre rayon personnalisé (5 km par défaut, jusqu\'à 30 km max).',
  },
];

export const OnboardingModal: React.FC = () => {
  const { hapticFeedback } = useSafety();
  const [step, setStep] = useState(0);
  const [closed, setClosed] = useState(() => localStorage.getItem('safety_onboarded') === '1');

  if (closed) return null;

  const Slide = SLIDES[step];
  const Icon = Slide.icon;

  const handleClose = () => {
    hapticFeedback('success');
    localStorage.setItem('safety_onboarded', '1');
    setClosed(true);
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in pointer-events-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-t-4xl sm:rounded-4xl shadow-sheet p-8 pb-10 border border-slate-200 relative"
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {/* Icon / Official Logo */}
        <div className="flex justify-center mb-6">
          {step === 0 ? (
            <div className="w-24 h-24 rounded-3xl bg-blue-50 border border-blue-200 p-2 flex items-center justify-center animate-scale-in shadow-md">
              <img src="/logo.png" alt="Safety Logo" className="w-full h-full object-contain rounded-2xl" />
            </div>
          ) : (
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center animate-scale-in"
              style={{ background: `${Slide.color}15`, border: `1.5px solid ${Slide.color}35` }}
            >
              <Icon className="w-10 h-10" style={{ color: Slide.color }} />
            </div>
          )}
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 text-center mb-2">{Slide.title}</h2>
        <p className="text-xs text-slate-500 text-center leading-relaxed font-medium">{Slide.desc}</p>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-pill transition-all duration-300 ${
                i === step ? 'w-5 bg-s-primary' : 'w-1.5 bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Button */}
        <div className="mt-6">
          {step < SLIDES.length - 1 ? (
            <button
              onClick={() => {
                hapticFeedback('light');
                setStep((s) => s + 1);
              }}
              className="w-full btn-primary py-3.5 text-xs font-extrabold rounded-2xl"
            >
              Suivant
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="w-full btn-primary py-3.5 text-xs font-extrabold rounded-2xl"
            >
              Commencer — Explorer la carte
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
