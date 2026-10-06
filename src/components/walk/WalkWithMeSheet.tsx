import React, { useState, useEffect, useMemo, useEffectEvent } from 'react';
import {
  X, Clock, Phone, Share2, AlertTriangle,
  Volume2, VolumeX, CheckCircle, MapPin,
  ChevronRight, ArrowRight, HeartHandshake, Loader2, Check,
  Compass, Bell, MessageSquare, ShieldAlert, PhoneCall
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useSafety } from '../../context/useSafety';
import { searchPlaces } from '../../api/geocodingApi';
import type { GeocodedPlace } from '../../api/geocodingApi';
import { calculateDistance, formatDistance } from '../../utils/geoUtils';
import { computeWalkingEstimate } from '../../utils/walkingMath';
import { fetchNearbyPois, type PoiCategory, type NearbyPoi } from '../../services/nearbyPoiService';
import { useNow } from '../../hooks/useNow';

const POI_CATEGORIES: { id: PoiCategory; label: string; icon: string }[] = [
  { id: 'transit', label: 'Gares & Métro', icon: '🚉' },
  { id: 'police', label: 'Police', icon: '👮' },
  { id: 'health', label: 'Santé', icon: '🏥' },
  { id: 'havens', label: 'Refuges', icon: '🏪' },
  { id: 'favorites', label: 'Favoris', icon: '⭐' },
];

export const WalkWithMeSheet: React.FC = () => {
  const {
    activeModal, setActiveModal, filters, hapticFeedback,
    userLocation, favorites, requestUserLocation,
    walkSession, startWalkSession, confirmSafetyCheck, triggerWalkAlert,
    toggleWalkSiren, endWalkSession,
  } = useSafety();

  // Destination configuration inputs
  const [destinationQuery, setDestinationQuery] = useState('');
  // Last completed search, keyed by the query it answers
  const [search, setSearch] = useState<{ query: string; places: GeocodedPlace[] }>({ query: '', places: [] });
  const [selectedPlace, setSelectedPlace] = useState<{
    name: string;
    coords: [number, number];
    address?: string;
  } | null>(null);

  // Nearby POIs
  const [activeCategory, setActiveCategory] = useState<PoiCategory>('transit');
  const [poiResult, setPoiResult] = useState<{ key: string; pois: NearbyPoi[] } | null>(null);

  // Mathematical walking buffer & adjusters
  const [extraBufferMinutes, setExtraBufferMinutes] = useState(0);

  // Emergency contact stored persistently
  const [contactName, setContactName] = useState(() => {
    return localStorage.getItem('safety_walk_contact_name') || '';
  });
  const [contactPhone, setContactPhone] = useState(() => {
    return localStorage.getItem('safety_walk_contact_phone') || '';
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';
  });

  const isDark = filters.mapTileStyle === 'dark';

  // Request notification permission if requested
  const handleRequestNotifications = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      hapticFeedback('medium');
    }
  };

  // Nearby POIs for the active category. Refetched when the category changes or the
  // user moves ~100 m (not on every GPS tick); the previous list stays visible meanwhile.
  const poiOrigin = userLocation ? `${userLocation[0].toFixed(3)},${userLocation[1].toFixed(3)}` : 'none';
  const poiKey = activeModal === 'walk' && !walkSession && activeCategory !== 'favorites'
    ? `${activeCategory}@${poiOrigin}`
    : null;
  const nearbyPois = poiResult?.pois ?? [];
  const isLoadingPois = poiKey !== null && poiResult?.key !== poiKey;
  const getUserLocation = useEffectEvent(() => userLocation);

  useEffect(() => {
    if (!poiKey) return;
    let cancelled = false;
    const category = poiKey.split('@')[0] as PoiCategory;
    fetchNearbyPois(category, getUserLocation())
      .then((pois) => {
        if (!cancelled) setPoiResult({ key: poiKey, pois });
      })
      .catch((err) => {
        console.warn('Load category POIs notice:', err);
        if (!cancelled) setPoiResult((prev) => ({ key: poiKey, pois: prev?.pois ?? [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [poiKey]);

  // Autocomplete search for destination (debounced, keyed by query)
  const trimmedDestination = destinationQuery.trim();
  const wantsResults = trimmedDestination.length >= 2;
  const isSearching = wantsResults && search.query !== destinationQuery;
  const searchResults = wantsResults && search.query === destinationQuery ? search.places : [];

  useEffect(() => {
    if (!wantsResults) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      let places: GeocodedPlace[] = [];
      try {
        places = await searchPlaces(destinationQuery, undefined, getUserLocation() || undefined);
      } catch (err) {
        console.warn('Geocoding search notice:', err);
      }
      if (!cancelled) setSearch({ query: destinationQuery, places });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [destinationQuery, wantsResults]);

  // Mathematical ETA Calculation
  const mathematicalEstimate = useMemo(() => {
    if (!selectedPlace) return null;
    const origin = userLocation || [48.8566, 2.3522];
    const dist = calculateDistance(
      origin[0], origin[1],
      selectedPlace.coords[0], selectedPlace.coords[1]
    );
    const est = computeWalkingEstimate(dist);
    const finalMinutes = est.totalEstimatedMinutes + extraBufferMinutes;
    return {
      ...est,
      finalMinutes,
    };
  }, [selectedPlace, userLocation, extraBufferMinutes]);

  // Live countdown (ticks every second while a walk is running)
  const now = useNow(1000, activeModal === 'walk' && !!walkSession);

  // Confetti on arrival
  useEffect(() => {
    if (walkSession?.status === 'arrived') {
      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#06B6D4', '#10B981', '#3B82F6', '#F59E0B'],
        });
      } catch { /* best effort: ignore */ }
    }
  }, [walkSession?.status]);

  if (activeModal !== 'walk') return null;

  // Real-time walk metrics
  const remainingMs = walkSession ? Math.max(0, walkSession.targetArrivalTimestamp - now) : 0;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  const distanceMeters = walkSession && userLocation
    ? calculateDistance(
        userLocation[0],
        userLocation[1],
        walkSession.destinationCoords[0],
        walkSession.destinationCoords[1]
      )
    : null;

  const handleStartWalk = () => {
    if (!selectedPlace || !mathematicalEstimate) return;
    hapticFeedback('heavy');

    // Save contact to local storage
    if (contactName.trim()) localStorage.setItem('safety_walk_contact_name', contactName.trim());
    if (contactPhone.trim()) localStorage.setItem('safety_walk_contact_phone', contactPhone.trim());

    // Prompt for notifications if not yet granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    startWalkSession({
      destinationName: selectedPlace.name,
      destinationCoords: selectedPlace.coords,
      estimatedMinutes: mathematicalEstimate.finalMinutes,
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
    });
  };

  const handleShareWalk = async () => {
    if (!walkSession) return;
    hapticFeedback('medium');
    const shareUrl = `https://safety-psi-ruddy.vercel.app/?walkId=${walkSession.id}&dest=${encodeURIComponent(walkSession.destinationName)}`;
    const shareText = `🛡️ Suis mon trajet en direct sur Safety : je marche vers « ${walkSession.destinationName} ». Arrivée estimée dans ${remainingMinutes} min. Suivi live : ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Accompagnement Trajet Sécurisé — Safety',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch { /* best effort: ignore */ }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch { /* best effort: ignore */ }
  };

  const emergencyDialNumber = walkSession?.contactPhone || '17';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xl animate-fade-in pointer-events-auto">
      <div
        className={`w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[32px] sm:rounded-[32px] border transition-all duration-300 p-5 sm:p-6 flex flex-col gap-4 shadow-[0_25px_70px_rgba(0,0,0,0.85)] ${
          isDark
            ? 'bg-slate-950/90 text-white border-white/10 shadow-black'
            : 'bg-white/95 text-slate-900 border-slate-200/90 shadow-slate-900/30'
        }`}
      >
        {/* Apple Mobile Sheet Handle Grabber */}
        <div className="w-12 h-1.5 rounded-full bg-slate-400/30 dark:bg-slate-700/60 mx-auto -mt-1 sm:hidden shrink-0" />

        {/* ── Top Header Bar ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              <HeartHandshake className="w-5 h-5 stroke-[2.3]" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight leading-none">
                  Walk With Me
                </h2>
                <span className="text-[9px] uppercase tracking-wider font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-xs">
                  ASSISTANCE LIVE
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Compagnon de marche avec surveillance chrono</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticFeedback('light');
              setActiveModal(null);
            }}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── CASE 1: ALERT STATUS (EMERGENCY DISTRESS ACTIVATED) ─────── */}
        {walkSession?.status === 'alert' && (
          <div className="relative overflow-hidden flex flex-col gap-5 p-5 sm:p-6 rounded-3xl bg-slate-950/95 border border-rose-500/30 text-white shadow-2xl shadow-rose-950/40">
            {/* Ambient Apple-style static crimson glass glow (steady, no flashing) */}
            <div className="absolute -top-16 -right-16 w-44 h-44 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-inner">
                <ShieldAlert className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/30 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Assistance SOS enclenchée
                </div>
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                  Alerte d'urgence active
                </h3>
                <p className="text-xs text-slate-300/90 leading-relaxed mt-1">
                  Temps de marche dépassé sans confirmation de sécurité. Vos coordonnées sont prêtes pour les secours.
                </p>
              </div>
            </div>

            {/* Live GPS readout pill for reassuring clarity */}
            <div className="relative z-10 flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="truncate">
                {userLocation
                  ? `Position GPS : ${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}`
                  : 'Recherche de position GPS…'}
              </span>
            </div>

            {/* Emergency Action Buttons (Apple Emergency SOS Style) */}
            <div className="relative z-10 flex flex-col gap-2.5 pt-1">
              {/* Primary Call Button */}
              <a
                href={`tel:${emergencyDialNumber}`}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-[0.98] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-rose-950/40 transition-all text-center"
              >
                <PhoneCall className="w-5 h-5 stroke-[2.5]" />
                <span>
                  Appeler {walkSession.contactPhone ? `${walkSession.contactName || 'le Proche'} (${walkSession.contactPhone})` : 'Police Secours (17)'}
                </span>
              </a>

              {/* Secondary Call Tiles */}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="tel:17"
                  className="py-3 px-3 rounded-2xl bg-white/8 hover:bg-white/12 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-all text-center"
                >
                  <Phone className="w-3.5 h-3.5 text-rose-400" /> Police (17)
                </a>
                <a
                  href="tel:112"
                  className="py-3 px-3 rounded-2xl bg-white/8 hover:bg-white/12 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/10 transition-all text-center"
                >
                  <Phone className="w-3.5 h-3.5 text-rose-400" /> Urgences (112)
                </a>
              </div>

              {/* SMS Alert */}
              {walkSession.contactPhone && (
                <a
                  href={`sms:${walkSession.contactPhone}?body=${encodeURIComponent(
                    `URGENCE SAFETY: Je n'ai pas confirmé mon arrivée à ${walkSession.destinationName}. Ma position en direct: https://maps.google.com/?q=${userLocation ? `${userLocation[0]},${userLocation[1]}` : ''}`
                  )}`}
                  className="py-3 px-3 rounded-2xl bg-blue-500/15 hover:bg-blue-500/25 active:scale-95 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 border border-blue-500/30 transition-all text-center"
                >
                  <MessageSquare className="w-4 h-4 text-blue-400" /> Envoyer SMS SOS au proche
                </a>
              )}
            </div>

            {/* Bottom Controls: Siren & Safe Dismissal */}
            <div className="relative z-10 flex items-center gap-2 pt-2 border-t border-white/10">
              <button
                onClick={toggleWalkSiren}
                className="flex-1 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                {walkSession.isSirenActive ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-slate-400" />}
                <span>{walkSession.isSirenActive ? 'Couper sirène' : 'Sirène 110dB'}</span>
              </button>
              <button
                onClick={() => endWalkSession('idle')}
                className="flex-1 py-3 rounded-2xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 flex items-center justify-center gap-1.5 transition-all active:scale-95"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Je vais bien</span>
              </button>
            </div>
          </div>
        )}

        {/* ── CASE 2: ARRIVED SAFELY STATUS ──────────────────────────── */}
        {walkSession?.status === 'arrived' && (
          <div className="flex flex-col items-center justify-center text-center p-6 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 gap-3 animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40">
              <CheckCircle className="w-9 h-9 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-lg font-black text-emerald-400">Arrivé(e) à destination !</h3>
              <p className="text-xs text-slate-300 mt-1">
                Félicitations, vous êtes en sécurité à « {walkSession.destinationName} ».
              </p>
            </div>
          </div>
        )}

        {/* ── CASE 3: ACTIVE WALK IN PROGRESS ────────────────────────── */}
        {walkSession && walkSession.status === 'active' && (
          <div className="flex flex-col gap-4">
            {/* Safety Check Countdown Banner (Prompt before calling emergency) */}
            {walkSession.safetyCheckPending && (
              <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex flex-col gap-3 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="font-black text-sm text-white">Contrôle de sécurité en cours</span>
                  </div>
                  <span className="text-base font-mono font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {walkSession.checkDeadlineSeconds}s
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  Temps de marche écoulé. Confirmez votre sécurité ou l'alerte d'urgence et l'appel vers {walkSession.contactPhone || 'le 17'} seront déclenchés automatiquement.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={confirmSafetyCheck}
                    className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-950/30 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle className="w-4 h-4" /> Je suis en sécurité
                  </button>
                  <button
                    onClick={triggerWalkAlert}
                    className="px-4 py-3 rounded-2xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs active:scale-95 transition-all"
                  >
                    SOS Immédiat
                  </button>
                </div>
              </div>
            )}

            {/* Apple Watch Digital Chrono Face Card */}
            <div className="p-5 rounded-3xl bg-gradient-to-b from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    Destination en cours
                  </span>
                  <h3 className="text-base font-black truncate max-w-[240px]">
                    {walkSession.destinationName}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold border border-cyan-500/30">
                  <Compass className="w-3.5 h-3.5 animate-spin" />
                  <span>En marche</span>
                </div>
              </div>

              {/* Countdown Digits */}
              <div className="flex items-baseline justify-center gap-2 py-1">
                <span className="text-4xl sm:text-5xl font-mono font-black tracking-tight text-white drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]">
                  {String(remainingMinutes).padStart(2, '0')}:{String(remainingSeconds).padStart(2, '0')}
                </span>
                <span className="text-xs font-bold text-slate-400">restantes</span>
              </div>

              {/* Distance Remaining & Auto-Arrival Indicator */}
              <div className="flex items-center justify-between text-xs font-semibold px-2 text-slate-400 border-t border-white/5 pt-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                  <span>{distanceMeters !== null ? `${formatDistance(distanceMeters)} restants` : 'Position en calcul...'}</span>
                </div>
                <span className="text-[11px] text-cyan-400">
                  {distanceMeters !== null && distanceMeters < 80 ? '🎯 Arrivée imminente' : 'Surveillance GPS'}
                </span>
              </div>
            </div>

            {/* Quick Actions (Siren, SOS, Share) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={toggleWalkSiren}
                className={`py-3 px-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  walkSession.isSirenActive
                    ? 'bg-amber-500 text-white border-amber-500 shadow-md ring-1 ring-amber-400'
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                }`}
              >
                {walkSession.isSirenActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
                <span>{walkSession.isSirenActive ? 'Arrêter sirène' : 'Sirène 110dB'}</span>
              </button>

              <button
                onClick={triggerWalkAlert}
                className="py-3 px-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <AlertTriangle className="w-4 h-4" /> SOS Alerte
              </button>
            </div>

            {/* Live Tracking Share Link */}
            <button
              onClick={handleShareWalk}
              className={`w-full py-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 ${
                copiedLink
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : 'bg-blue-500/10 text-cyan-400 hover:bg-blue-500/20 border-cyan-500/30'
              }`}
            >
              {copiedLink ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
              <span>{copiedLink ? 'Lien de suivi copié !' : 'Partager mon trajet en direct (SMS / WhatsApp)'}</span>
            </button>

            {/* Arrival & Cancel Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => endWalkSession('arrived')}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" /> Je suis bien arrivé(e)
              </button>
              <button
                onClick={() => endWalkSession('idle')}
                className="px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 font-bold text-xs transition-colors"
                title="Arrêter le trajet sans alerte"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── CASE 4: SETUP & DESTINATION SELECTION ──────────────────── */}
        {!walkSession && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {/* Notification Permission Pill if default */}
            {notificationPermission === 'default' && (
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-between text-xs text-blue-300">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Activer les alertes d'arrivée sur votre appareil</span>
                </div>
                <button
                  onClick={handleRequestNotifications}
                  className="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-500 shrink-0"
                >
                  Autoriser
                </button>
              </div>
            )}

            {/* Destination Search Box */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span>Où allez-vous ?</span>
                {selectedPlace && (
                  <span className="text-emerald-400 text-[11px] font-black flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" /> Sélectionné
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Rechercher une adresse, gare, station..."
                  value={selectedPlace ? selectedPlace.name : destinationQuery}
                  onChange={(e) => {
                    setSelectedPlace(null);
                    setDestinationQuery(e.target.value);
                  }}
                  className={`w-full px-4 py-3 rounded-2xl border text-xs font-medium outline-hidden transition-all shadow-inner ${
                    isDark
                      ? 'bg-slate-900/80 border-white/10 focus:border-cyan-500 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 focus:border-cyan-600 text-slate-900 placeholder-slate-400'
                  }`}
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin absolute right-3.5 top-3.5" />
                )}
              </div>

              {/* Autocomplete Results Dropdown */}
              {searchResults.length > 0 && !selectedPlace && (
                <div className={`mt-1 max-h-40 overflow-y-auto rounded-2xl border p-1.5 flex flex-col gap-1 shadow-2xl z-20 ${
                  isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'
                }`}>
                  {searchResults.map((place) => (
                    <button
                      key={place.placeId}
                      onClick={() => {
                        hapticFeedback('light');
                        setSelectedPlace({
                          name: place.name,
                          coords: [place.latitude, place.longitude],
                          address: place.displayName,
                        });
                        setDestinationQuery(place.name);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors flex items-center justify-between"
                    >
                      <div className="truncate pr-2">
                        <span className="font-bold block truncate">{place.name}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{place.displayName}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Category Chips for Real Closest POIs ─────────────────── */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400">
                  Lieux sécurisés les plus proches
                </span>
                {!userLocation && (
                  <button
                    onClick={() => requestUserLocation({ forceRecenter: true })}
                    className="text-[11px] text-cyan-400 font-bold hover:underline flex items-center gap-1"
                  >
                    <Compass className="w-3 h-3" /> Activer GPS
                  </button>
                )}
              </div>

              {/* Category Segmented Selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {POI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      hapticFeedback('light');
                      setActiveCategory(cat.id);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                      activeCategory === cat.id
                        ? 'bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* Real Closest POI Cards */}
              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                {activeCategory === 'favorites' ? (
                  // User Favorites List
                  favorites.length > 0 ? (
                    favorites.map((fav) => (
                      <button
                        key={fav.id}
                        onClick={() => {
                          hapticFeedback('light');
                          setSelectedPlace({
                            name: fav.name,
                            coords: [fav.latitude, fav.longitude],
                            address: fav.address,
                          });
                          setDestinationQuery(fav.name);
                        }}
                        className={`w-full p-2.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                          selectedPlace?.name === fav.name
                            ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300'
                            : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="text-base">{fav.place_type === 'home' ? '🏠' : '💼'}</span>
                          <div className="truncate">
                            <span className="font-bold text-xs block truncate">{fav.name}</span>
                            <span className="text-[10px] text-slate-400 block truncate">{fav.address}</span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))
                  ) : (
                    <div className="p-3 rounded-2xl bg-white/5 text-center text-xs text-slate-400">
                      Aucun favori enregistré. Ajoutez votre domicile ou travail dans vos favoris.
                    </div>
                  )
                ) : isLoadingPois ? (
                  <div className="p-4 rounded-2xl bg-white/5 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Recherche des lieux réels autour de vous...</span>
                  </div>
                ) : nearbyPois.length > 0 ? (
                  nearbyPois.map((poi) => (
                    <button
                      key={poi.id}
                      onClick={() => {
                        hapticFeedback('light');
                        setSelectedPlace({
                          name: poi.name,
                          coords: [poi.latitude, poi.longitude],
                          address: poi.address,
                        });
                        setDestinationQuery(poi.name);
                      }}
                      className={`w-full p-2.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        selectedPlace?.name === poi.name
                          ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                          : 'bg-white/5 hover:bg-white/10 border-white/5 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span className="text-base">{poi.categoryIcon}</span>
                        <div className="truncate">
                          <span className="font-bold text-xs block truncate">{poi.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{poi.address}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-[11px] font-black text-cyan-400 block">
                            à {poi.estimate.formattedDistance}
                          </span>
                          <span className="text-[9px] text-slate-400 block">
                            ~{poi.estimate.totalEstimatedMinutes} min
                          </span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-3 rounded-2xl bg-white/5 text-center text-xs text-slate-400">
                    Aucun point trouvé à proximité immédiate.
                  </div>
                )}
              </div>
            </div>

            {/* ── Mathematical Chrono Calculation Card ─────────────────── */}
            {mathematicalEstimate && (
              <div className="p-4 rounded-3xl bg-gradient-to-br from-cyan-500/15 via-blue-600/10 to-transparent border border-cyan-500/30 flex flex-col gap-2.5 shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black text-cyan-400">
                    <Clock className="w-4 h-4" />
                    <span>Temps de marche calculé mathématiquement</span>
                  </div>
                  <span className="text-xl font-mono font-black text-white">
                    {mathematicalEstimate.finalMinutes} min
                  </span>
                </div>

                <div className="text-[11px] leading-relaxed text-slate-300">
                  Distance réelle : <strong className="text-white">{mathematicalEstimate.formattedDistance}</strong> à allure piétonne standard (4,5 km/h). Marge de sécurité incluse (+2 min).
                </div>

                {/* Extra Buffer Nudge Buttons */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400">Marge supplémentaire :</span>
                  {[0, 2, 5, 10].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => {
                        hapticFeedback('light');
                        setExtraBufferMinutes(mins);
                      }}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        extraBufferMinutes === mins
                          ? 'bg-cyan-500 text-white border-cyan-500'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {mins === 0 ? 'Normal' : `+${mins} min`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Contact Group */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" /> Contact d'urgence (Optionnel)
                </span>
                <span className="text-[10px] text-slate-500">Appelé si alerte non validée</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Nom (ex: Maman, Lucas)"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={`px-3 py-2.5 rounded-2xl border text-xs font-medium outline-hidden ${
                    isDark
                      ? 'bg-slate-900/80 border-white/10 focus:border-cyan-500 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 focus:border-cyan-600 text-slate-900 placeholder-slate-400'
                  }`}
                />
                <input
                  type="tel"
                  placeholder="Numéro (06...)"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={`px-3 py-2.5 rounded-2xl border text-xs font-medium outline-hidden ${
                    isDark
                      ? 'bg-slate-900/80 border-white/10 focus:border-cyan-500 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-200 focus:border-cyan-600 text-slate-900 placeholder-slate-400'
                  }`}
                />
              </div>
            </div>

            {/* Launch Button */}
            <button
              onClick={handleStartWalk}
              disabled={!selectedPlace}
              className={`w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${
                selectedPlace
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-[0_8px_25px_rgba(6,182,212,0.4)] cursor-pointer'
                  : 'bg-white/10 text-slate-500 border border-white/5 cursor-not-allowed'
              }`}
            >
              <span>Démarrer le Trajet Sécurisé</span>
              <ArrowRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
