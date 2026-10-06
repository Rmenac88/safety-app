import React, { useState, useEffect } from 'react';
import { X, Share, PlusSquare, Download, Sparkles, ChevronRight } from 'lucide-react';
import { useDevice } from '../../hooks/useDevice';
import { useSafety } from '../../context/useSafety';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallBanner: React.FC = () => {
  const device = useDevice();
  const { hapticFeedback, filters } = useSafety();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      const dismissed = sessionStorage.getItem('safety_install_dismissed');
      return dismissed === '1';
    } catch {
      return false;
    }
  });
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const isDark = filters.mapTileStyle === 'dark';

  // Listen for native beforeinstallprompt event on Android / Chromium
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Do not show banner if already running in standalone PWA mode or dismissed
  if (device.isStandalone || isDismissed) {
    return null;
  }

  // Only display on mobile devices (phone or tablet) where home screen install brings immense value
  if (!device.isMobileDevice && !device.isTabletDevice) {
    return null;
  }

  const handleDismiss = () => {
    hapticFeedback('light');
    setIsDismissed(true);
    try {
      sessionStorage.setItem('safety_install_dismissed', '1');
    } catch { /* best effort: ignore */ }
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    hapticFeedback('medium');
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsDismissed(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <>
      {/* ── Floating Smart PWA Toast ────────────────────────────────────── */}
      <div className="fixed bottom-20 inset-x-0 z-40 px-3.5 pointer-events-none animate-slide-up">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div
            className={`rounded-3xl p-3.5 border shadow-island backdrop-blur-2xl transition-all duration-300 ${
              isDark
                ? 'bg-slate-900/94 border-slate-700/80 text-white'
                : 'bg-white/96 border-slate-200/90 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              {/* App Icon + Pitch */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 p-1 flex items-center justify-center shrink-0 shadow-sm">
                  <img src="/logo.png" alt="Safety" className="w-full h-full object-contain rounded-xl" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold tracking-tight">Installer Safety</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 text-s-primary text-[9px] font-bold uppercase">
                      App Rapide
                    </span>
                  </div>
                  <p className={`text-2xs truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Plein écran, hors-ligne & accès instantané
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-1.5 shrink-0">
                {device.isIOS ? (
                  <button
                    onClick={() => {
                      hapticFeedback('medium');
                      setShowIOSGuide(true);
                    }}
                    className="btn-primary py-2 px-3 rounded-2xl text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <span>Ajouter</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : deferredPrompt ? (
                  <button
                    onClick={handleAndroidInstall}
                    className="btn-primary py-2 px-3 rounded-2xl text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Installer</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      hapticFeedback('medium');
                      setShowIOSGuide(true);
                    }}
                    className="btn-primary py-2 px-3 rounded-2xl text-xs font-bold flex items-center gap-1 shadow-sm"
                  >
                    <span>Installer</span>
                  </button>
                )}

                <button
                  onClick={handleDismiss}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                  }`}
                  aria-label="Fermer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── iOS Step-by-Step Native Installation Guide Sheet ───────────── */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in pointer-events-auto">
          <div
            className={`w-full max-w-sm rounded-t-4xl sm:rounded-4xl p-6 shadow-sheet border transition-colors ${
              isDark
                ? 'bg-slate-900 text-white border-slate-700'
                : 'bg-white text-slate-900 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 p-1 flex items-center justify-center shrink-0">
                  <img src="/logo.png" alt="Safety" className="w-full h-full object-contain rounded-lg" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">Ajouter Safety à l'écran</h3>
                  <p className="text-2xs text-slate-500 font-medium">Expérience application native</p>
                </div>
              </div>
              <button
                onClick={() => {
                  hapticFeedback('light');
                  setShowIOSGuide(false);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3 Step Visual Walkthrough */}
            <div className="space-y-3 my-5">
              <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
              }`}>
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-s-primary flex items-center justify-center shrink-0 font-extrabold text-sm shadow-xs">
                  1
                </div>
                <div className="flex-1 text-xs font-semibold leading-tight">
                  Touchez le bouton <span className="inline-flex items-center gap-1 font-extrabold text-s-primary"><Share className="w-3.5 h-3.5 inline" /> Partager</span> dans Safari
                </div>
              </div>

              <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
              }`}>
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-s-primary flex items-center justify-center shrink-0 font-extrabold text-sm shadow-xs">
                  2
                </div>
                <div className="flex-1 text-xs font-semibold leading-tight">
                  Faites défiler et sélectionnez <span className="inline-flex items-center gap-1 font-extrabold text-s-primary"><PlusSquare className="w-3.5 h-3.5 inline" /> Sur l'écran d'accueil</span>
                </div>
              </div>

              <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-200 text-slate-900 shadow-xs'
              }`}>
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-s-primary flex items-center justify-center shrink-0 font-extrabold text-sm shadow-xs">
                  3
                </div>
                <div className="flex-1 text-xs font-semibold leading-tight">
                  Touchez <span className="font-extrabold text-s-primary">Ajouter</span> en haut à droite
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                hapticFeedback('success');
                setShowIOSGuide(false);
                handleDismiss();
              }}
              className="w-full btn-primary py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>J'ai compris</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
