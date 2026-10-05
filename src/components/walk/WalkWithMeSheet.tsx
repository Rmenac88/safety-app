import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Shield, Clock, Phone, Share2, AlertTriangle,
  Volume2, VolumeX, CheckCircle, Home, Briefcase, MapPin,
  ChevronRight, ArrowRight, HeartHandshake, Loader2, Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSafety } from '../../context/SafetyContext';
import { searchPlaces } from '../../api/geocodingApi';
import type { GeocodedPlace } from '../../api/geocodingApi';
import { calculateDistance, formatDistance } from '../../utils/geoUtils';

export const WalkWithMeSheet: React.FC = () => {
  const {
    activeModal, setActiveModal, filters, hapticFeedback,
    userLocation, favorites,
    walkSession, startWalkSession, confirmSafetyCheck, triggerWalkAlert,
    toggleWalkSiren, endWalkSession,
  } = useSafety();

  // Destination configuration inputs
  const [destinationQuery, setDestinationQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; coords: [number, number] } | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState(15);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const isDark = filters.mapTileStyle === 'dark';

  // Autocomplete search for destination
  useEffect(() => {
    if (destinationQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const places = await searchPlaces(destinationQuery);
        setSearchResults(places);
      } catch (err) {
        console.warn('Geocoding search notice:', err);
      } finally {
        setIsSearching(false);
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [destinationQuery, userLocation]);

  // Confetti on arrival
  useEffect(() => {
    if (walkSession?.status === 'arrived') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#10B981', '#38BDF8', '#6366F1', '#F59E0B'],
        });
      } catch {}
    }
  }, [walkSession?.status]);

  if (activeModal !== 'walk') return null;

  // Real-time metrics
  const now = Date.now();
  const remainingMs = walkSession ? Math.max(0, walkSession.targetArrivalTimestamp - now) : 0;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  const distanceMeters = useMemo(() => {
    if (!walkSession || !userLocation) return null;
    return calculateDistance(
      userLocation[0],
      userLocation[1],
      walkSession.destinationCoords[0],
      walkSession.destinationCoords[1]
    );
  }, [walkSession, userLocation]);

  const handleStartWalk = () => {
    if (!selectedPlace) return;
    hapticFeedback('heavy');
    startWalkSession({
      destinationName: selectedPlace.name,
      destinationCoords: selectedPlace.coords,
      estimatedMinutes,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
  };

  const handleShareWalk = async () => {
    if (!walkSession) return;
    hapticFeedback('medium');
    const shareUrl = `https://safety-psi-ruddy.vercel.app/?walkId=${walkSession.id}&dest=${encodeURIComponent(walkSession.destinationName)}`;
    const shareText = `🛡️ Suis mon trajet en direct sur Safety : je marche vers « ${walkSession.destinationName} », arrivée estimée dans ${remainingMinutes} min. Suivi live : ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Accompagnement Trajet Sécurisé — Safety',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div
        className={`w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border shadow-2xl transition-all duration-300 p-5 flex flex-col gap-4 ${
          isDark
            ? 'bg-slate-900/95 text-white border-slate-700/80 shadow-black/80'
            : 'bg-white/98 text-slate-900 border-slate-200/90 shadow-slate-900/20'
        }`}
      >
        {/* ── Top Header Bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-200/50 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shadow-xs">
              <HeartHandshake className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-tight leading-none flex items-center gap-1.5">
                Walk With Me
                <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-500 border border-cyan-500/30">
                  Sécurité
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Accompagnement virtuel en direct</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── CASE 1: WALK COMPLETED / ARRIVED ───────────────────────── */}
        {walkSession?.status === 'arrived' && (
          <div className="py-8 text-center flex flex-col items-center gap-3 animate-scale-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center ring-8 ring-emerald-500/10">
              <CheckCircle className="w-9 h-9 stroke-[2.5]" />
            </div>
            <h3 className="text-lg font-black text-emerald-500">Vous êtes bien arrivé(e) !</h3>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Votre trajet sécurisé vers <strong className="text-slate-200">{walkSession.destinationName}</strong> a été validé avec succès. Vos proches sont rassurés.
            </p>
            <button
              onClick={() => endWalkSession('idle')}
              className="mt-2 w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition-transform active:scale-95"
            >
              Terminer l'accompagnement
            </button>
          </div>
        )}

        {/* ── CASE 2: ACTIVE WALK SESSION RUNNING ──────────────────────── */}
        {walkSession && (walkSession.status === 'active' || walkSession.status === 'alert') && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {/* Urgent Safety Check Banner if pending */}
            {walkSession.safetyCheckPending && (
              <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex flex-col gap-2.5 animate-pulse">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Contrôle de sécurité
                  </span>
                  <span className="font-mono font-black text-xs text-amber-300">
                    {walkSession.checkDeadlineSeconds}s
                  </span>
                </div>
                <p className="text-[11px] text-amber-200 leading-snug">
                  L'horaire prévu est dépassé. Touchez pour confirmer que vous êtes en sécurité avant alerte.
                </p>
                <button
                  onClick={confirmSafetyCheck}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all active:scale-95"
                >
                  Oui, je suis en sécurité (+5 min)
                </button>
              </div>
            )}

            {/* Distress Alert Banner if triggered */}
            {walkSession.status === 'alert' && (
              <div className="p-3.5 rounded-2xl bg-red-600/25 border-2 border-red-500 flex flex-col gap-2.5 animate-pulse">
                <div className="flex items-center gap-2 text-red-400 font-black text-xs">
                  <AlertTriangle className="w-5 h-5" /> ALERTE DÉTRESSE ACTIVE
                </div>
                <p className="text-[11px] text-red-200">
                  La sirène de détresse est déclenchée. Vos contacts et les utilisateurs Safety proches sont notifiés.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href="tel:17"
                    className="py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-center text-xs shadow-md flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Police (17)
                  </a>
                  <a
                    href="tel:112"
                    className="py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-center text-xs flex items-center justify-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5" /> Urgences (112)
                  </a>
                </div>
              </div>
            )}

            {/* Live Journey Progress Card */}
            <div className={`p-4 rounded-3xl border flex flex-col gap-3 ${
              isDark ? 'bg-slate-800/60 border-slate-700/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  Trajet vers
                </span>
                <span className="text-xs font-mono font-extrabold text-s-primary">
                  {distanceMeters !== null ? formatDistance(distanceMeters) : '--'}
                </span>
              </div>

              <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                🏁 {walkSession.destinationName}
              </div>

              {/* Countdown Digits */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-2xl sm:text-3xl font-mono font-black text-cyan-400 leading-none">
                  {String(remainingMinutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Temps restant estimé</span>
              </div>
            </div>

            {/* Emergency Action Buttons Bar */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 1. Dissuasive Siren Button */}
              <button
                onClick={toggleWalkSiren}
                className={`py-3 px-3 rounded-2xl border font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  walkSession.isSirenActive
                    ? 'bg-red-600 text-white border-red-500 shadow-glow-danger animate-pulse'
                    : 'bg-red-500/15 text-red-500 hover:bg-red-500/25 border-red-500/30'
                }`}
              >
                {walkSession.isSirenActive ? (
                  <>
                    <VolumeX className="w-4 h-4" /> Couper Sirène
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" /> Sirène 110dB
                  </>
                )}
              </button>

              {/* 2. SOS Immediate Alert */}
              <button
                onClick={triggerWalkAlert}
                className="py-3 px-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <AlertTriangle className="w-4 h-4" /> SOS Détresse
              </button>
            </div>

            {/* Live Share Button */}
            <button
              onClick={handleShareWalk}
              className={`w-full py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                copiedLink
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-blue-500/15 text-s-primary hover:bg-blue-500/25 border-blue-500/30'
              }`}
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedLink ? 'Lien de suivi copié !' : 'Partager mon suivi en direct (SMS / WhatsApp)'}</span>
            </button>

            {/* Arrival & Cancel Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => endWalkSession('arrived')}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" /> Je suis bien arrivé(e)
              </button>
              <button
                onClick={() => endWalkSession('idle')}
                className="px-3.5 py-3 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                title="Arrêter le trajet sans alerte"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── CASE 3: CONFIGURATION SETUP (NO WALK ACTIVE) ────────────── */}
        {!walkSession && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {/* Description Banner */}
            <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs leading-relaxed flex items-start gap-2.5">
              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
              <span>
                Safety surveille votre progression, vous alerte des zones à risque sur votre trajet et prévient vos proches si vous ne confirmez pas votre arrivée.
              </span>
            </div>

            {/* Destination Input & Search */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>Destination d'arrivée</span>
                {selectedPlace && (
                  <span className="text-emerald-500 text-[10px] font-black">Sélectionné ✓</span>
                )}
              </label>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Où allez-vous ? (ex: Gare, Domicile, Rue...)"
                  value={selectedPlace ? selectedPlace.name : destinationQuery}
                  onChange={(e) => {
                    setSelectedPlace(null);
                    setDestinationQuery(e.target.value);
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-2xl border text-xs font-medium outline-hidden transition-all ${
                    isDark
                      ? 'bg-slate-800/80 border-slate-700 focus:border-cyan-500 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 focus:border-cyan-600 text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-cyan-500 animate-spin absolute right-3.5 top-3" />
                )}
              </div>

              {/* Quick Preset Favorites Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar">
                {favorites.map((fav) => (
                  <button
                    key={fav.id}
                    onClick={() => {
                      hapticFeedback('light');
                      setSelectedPlace({
                        name: fav.name,
                        coords: [fav.latitude, fav.longitude],
                      });
                      setDestinationQuery(fav.name);
                      setSearchResults([]);
                    }}
                    className={`shrink-0 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                      selectedPlace?.name === fav.name
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-xs'
                        : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {fav.place_type === 'home' ? (
                      <Home className="w-3 h-3" />
                    ) : (
                      <Briefcase className="w-3 h-3" />
                    )}
                    <span>{fav.name}</span>
                  </button>
                ))}

                {/* Default Paris landmark fallback if no favorites */}
                {favorites.length === 0 && (
                  <>
                    <button
                      onClick={() => {
                        setSelectedPlace({ name: 'Domicile', coords: [48.8566, 2.3522] });
                        setDestinationQuery('Domicile');
                      }}
                      className="shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      <Home className="w-3 h-3" /> Domicile
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlace({ name: 'Gare la plus proche', coords: [48.8763, 2.3592] });
                        setDestinationQuery('Gare la plus proche');
                      }}
                      className="shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-[11px] font-bold text-slate-300 hover:text-white flex items-center gap-1"
                    >
                      <MapPin className="w-3 h-3" /> Gare
                    </button>
                  </>
                )}
              </div>

              {/* Autocomplete Results Dropdown */}
              {searchResults.length > 0 && !selectedPlace && (
                <div className={`mt-1 max-h-36 overflow-y-auto rounded-2xl border p-1 flex flex-col gap-1 shadow-lg ${
                  isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
                }`}>
                  {searchResults.map((place) => (
                    <button
                      key={place.placeId}
                      onClick={() => {
                        hapticFeedback('light');
                        setSelectedPlace({
                          name: place.name,
                          coords: [place.latitude, place.longitude],
                        });
                        setDestinationQuery(place.name);
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold hover:bg-cyan-500/10 hover:text-cyan-500 transition-colors flex items-center justify-between"
                    >
                      <div className="truncate">
                        <span className="font-bold block">{place.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{place.displayName}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Duration Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Durée de marche estimée
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[5, 10, 15, 25, 40].map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      hapticFeedback('light');
                      setEstimatedMinutes(m);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      estimatedMinutes === m
                        ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                        : isDark
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Contact Input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Contact d'urgence (Optionnel)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nom (ex: Maman)"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={`px-3 py-2 rounded-xl border text-xs outline-hidden ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <input
                  type="tel"
                  placeholder="Numéro (06...)"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={`px-3 py-2 rounded-xl border text-xs outline-hidden ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* Launch Button */}
            <button
              onClick={handleStartWalk}
              disabled={!selectedPlace}
              className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition-all duration-200 active:scale-95 ${
                selectedPlace
                  ? 'bg-gradient-to-r from-cyan-600 via-sky-500 to-blue-600 text-white hover:brightness-110 shadow-cyan-500/25 cursor-pointer'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <span>Lancer le Trajet Sécurisé</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
