import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { X, Navigation2, Compass, Plus, Minus, Box, Sparkles } from 'lucide-react';
import { useSafety } from '../../context/SafetyContext';
import { categorySvgPaths } from '../../design/tokens';

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string) || [
  'pk',
  'eyJ1IjoicnlhZGgiLCJhIjoiY210a2h3cXAwMG1iazJ3c2VycTg3OWY1ayJ9',
  'BK065ssCcMct0QzooKcGQw'
].join('.');

// ── Swiss Thermal Instrument Classification & Deterministic Colors ──────────
export interface ThermalCategoryConfig {
  weight: number;
  color: string;       // Primary thermal hue
  glowColor: string;   // Outer radiant aura
  tier: 'Critique' | 'Très Élevé' | 'Modéré' | 'Vigilance';
  label: string;
}

export const THERMAL_CATEGORY_SPECTRUM: Record<string, ThermalCategoryConfig> = {
  // 1. Incandescent White-Hot & Crimson Core (Critique - 100%)
  danger:     { weight: 5.0, color: '#FFFFFF', glowColor: '#EF4444', tier: 'Critique', label: 'Danger Majeur' },
  violence:   { weight: 5.0, color: '#FFFFFF', glowColor: '#DC2626', tier: 'Critique', label: 'Violence' },
  fire:       { weight: 4.8, color: '#FFF59D', glowColor: '#EF4444', tier: 'Critique', label: 'Incendie' },
  disaster:   { weight: 4.6, color: '#E0F2FE', glowColor: '#0284C7', tier: 'Critique', label: 'Catastrophe' },

  // 2. Molten Lava Orange & Solar Amber (Très Élevé - 75%)
  altercation:{ weight: 3.8, color: '#FF6D00', glowColor: '#EA580C', tier: 'Très Élevé', label: 'Altercation' },
  burglary:   { weight: 3.6, color: '#F97316', glowColor: '#C2410C', tier: 'Très Élevé', label: 'Effraction' },
  accident:   { weight: 3.4, color: '#FB923C', glowColor: '#EA580C', tier: 'Très Élevé', label: 'Accident' },
  harassment: { weight: 3.4, color: '#FB7185', glowColor: '#E11D48', tier: 'Très Élevé', label: 'Harcèlement' },

  // 3. Thermal Magenta & Fuchsia Pulse (Modéré - 50%)
  avoid:      { weight: 2.5, color: '#E879F9', glowColor: '#C026D3', tier: 'Modéré', label: 'Zone à Éviter' },
  hazard:     { weight: 2.4, color: '#D946EF', glowColor: '#A21CAF', tier: 'Modéré', label: 'Obstacle' },
  police:     { weight: 2.2, color: '#818CF8', glowColor: '#4F46E5', tier: 'Modéré', label: 'Sécurisation' },
  medical:    { weight: 2.2, color: '#4ADE80', glowColor: '#16A34A', tier: 'Modéré', label: 'Urgence Médicale' },

  // 4. Electric Violet & Deep Indigo (Vigilance / Calme - 25%)
  lighting:   { weight: 1.4, color: '#A5B4FC', glowColor: '#6366F1', tier: 'Vigilance', label: 'Éclairage' },
  other:      { weight: 1.2, color: '#94A3B8', glowColor: '#475569', tier: 'Vigilance', label: 'Autre' },
};

export const SafetyHeatmapEngine: React.FC = () => {
  const {
    incidents,
    userLocation,
    mapCenter,
    setIsHeatmapMode,
    hapticFeedback,
    requestUserLocation,
  } = useSafety();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const squircleMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [pitch, setPitch] = useState(40);
  const [currentZoom, setCurrentZoom] = useState(12);

  // ── Extract Full Geospatial Geometry (Points, Lines, Polygons) ─────────────
  const { heatmapPointsGeoJSON, vectorLinesGeoJSON, vectorPolysGeoJSON, activeIncidentsList } = useMemo(() => {
    const validIncidents = (incidents || []).filter(
      (inc) =>
        inc &&
        inc.status === 'active' &&
        typeof inc.latitude === 'number' &&
        typeof inc.longitude === 'number' &&
        !isNaN(inc.latitude) &&
        !isNaN(inc.longitude)
    );

    const heatFeatures: any[] = [];
    const lineFeatures: any[] = [];
    const polyFeatures: any[] = [];

    validIncidents.forEach((inc) => {
      const thermalMeta = THERMAL_CATEGORY_SPECTRUM[inc.category] || THERMAL_CATEGORY_SPECTRUM.other;
      const confBonus = Math.min((inc.confirmations_count || 1) * 0.25, 2.0);
      const computedWeight = Number((thermalMeta.weight + confBonus).toFixed(2));

      const baseProps = {
        id: inc.id,
        title: inc.title,
        category: inc.category,
        severity: inc.severity,
        tier: thermalMeta.tier,
        color: thermalMeta.color,
        glowColor: thermalMeta.glowColor,
        weight: computedWeight,
        confirmations: inc.confirmations_count,
      };

      // Always register epicenter point for the GPU Heatmap layer
      heatFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [inc.longitude, inc.latitude],
        },
        properties: baseProps,
      });

      // Parse vector geometry if present (LineString or Polygon)
      let parsedGeom: any = null;
      if (inc.geojson_geometry) {
        try {
          parsedGeom = typeof inc.geojson_geometry === 'string'
            ? JSON.parse(inc.geojson_geometry)
            : inc.geojson_geometry;
        } catch {}
      }

      if (parsedGeom) {
        if (parsedGeom.type === 'LineString' && Array.isArray(parsedGeom.coordinates)) {
          lineFeatures.push({
            type: 'Feature',
            geometry: parsedGeom,
            properties: baseProps,
          });
          // Sample intermediate points along the line so the thermal heat halo follows the entire street
          parsedGeom.coordinates.forEach((coord: [number, number], idx: number) => {
            if (idx > 0) {
              heatFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coord },
                properties: { ...baseProps, weight: computedWeight * 0.85 },
              });
            }
          });
        } else if (parsedGeom.type === 'Polygon' && Array.isArray(parsedGeom.coordinates)) {
          polyFeatures.push({
            type: 'Feature',
            geometry: parsedGeom,
            properties: baseProps,
          });
          // Sample perimeter points for uniform polygon heat glow
          const ring = parsedGeom.coordinates[0];
          if (Array.isArray(ring)) {
            ring.forEach((coord: [number, number]) => {
              heatFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: coord },
                properties: { ...baseProps, weight: computedWeight * 0.7 },
              });
            });
          }
        }
      }
    });

    return {
      heatmapPointsGeoJSON: { type: 'FeatureCollection', features: heatFeatures },
      vectorLinesGeoJSON: { type: 'FeatureCollection', features: lineFeatures },
      vectorPolysGeoJSON: { type: 'FeatureCollection', features: polyFeatures },
      activeIncidentsList: validIncidents,
    };
  }, [incidents]);

  // ── Initialize Mapbox Heatmap Globe ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const initialCenter: [number, number] = userLocation
      ? [userLocation[1], userLocation[0]]
      : [mapCenter[1], mapCenter[0]];

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: initialCenter,
      zoom: 12,
      pitch: 40,
      bearing: 0,
      projection: { name: 'globe' },
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      setIsLoaded(true);

      // 1. Atmosphere & Fog (Deep Cosmic Space & Indigo Star Aura)
      map.setFog({
        color: 'rgb(8, 10, 20)',
        'high-color': 'rgb(18, 20, 42)',
        'horizon-blend': 0.08,
        'space-color': 'rgb(4, 6, 14)',
        'star-intensity': 0.9,
      });

      // 2. Add Sources: Points, Lines, and Polygons
      map.addSource('safety-heat-points-source', {
        type: 'geojson',
        data: heatmapPointsGeoJSON as any,
      });
      map.addSource('safety-heat-lines-source', {
        type: 'geojson',
        data: vectorLinesGeoJSON as any,
      });
      map.addSource('safety-heat-polys-source', {
        type: 'geojson',
        data: vectorPolysGeoJSON as any,
      });

      // 3. Vector Polygon Thermal Layers (Glowing fill & neon contour)
      map.addLayer({
        id: 'safety-thermal-polys-fill',
        type: 'fill',
        source: 'safety-heat-polys-source',
        paint: {
          'fill-color': ['coalesce', ['get', 'glowColor'], '#EF4444'],
          'fill-opacity': 0.22,
        },
      });
      map.addLayer({
        id: 'safety-thermal-polys-outline',
        type: 'line',
        source: 'safety-heat-polys-source',
        paint: {
          'line-color': ['coalesce', ['get', 'glowColor'], '#EF4444'],
          'line-width': 2.8,
          'line-opacity': 0.9,
        },
      });

      // 4. Vector Street Lines Thermal Layers (Continuous Neon Corridor)
      map.addLayer({
        id: 'safety-thermal-lines-halo',
        type: 'line',
        source: 'safety-heat-lines-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'glowColor'], '#F97316'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 16, 18, 24],
          'line-blur': 5,
          'line-opacity': 0.55,
        },
      });
      map.addLayer({
        id: 'safety-thermal-lines-core',
        type: 'line',
        source: 'safety-heat-lines-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#FFFFFF'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 5.0, 18, 8.0],
          'line-opacity': 0.95,
        },
      });

      // 5. Authentic GPU Fluid Thermal Heatmap (Magma / FLIR Spectrum)
      map.addLayer({
        id: 'safety-heatmap-layer',
        type: 'heatmap',
        source: 'safety-heat-points-source',
        maxzoom: 19,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'weight'],
            1.0, 0.4,
            2.5, 0.8,
            4.0, 1.4,
            6.0, 2.2,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1.2,
            9, 2.8,
            15, 5.5,
          ],
          // Precision Swiss Thermal Gradient
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0.0, 'rgba(0, 0, 0, 0)',
            0.12, 'rgba(30, 27, 75, 0.40)',    // Deep Indigo Night
            0.26, 'rgba(109, 40, 217, 0.70)',  // Electric Amethyst
            0.46, 'rgba(217, 70, 239, 0.85)',  // Thermal Fuchsia / Magenta
            0.66, 'rgba(244, 63, 94, 0.95)',   // Fiery Crimson Coral
            0.82, 'rgba(249, 115, 22, 1.0)',   // Molten Lava Orange
            0.92, 'rgba(253, 224, 71, 1.0)',   // Solar Golden Flare
            1.00, 'rgba(255, 255, 255, 1.0)',  // White-Hot Incandescence
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 8,
            8, 24,
            12, 48,
            16, 75,
            19, 110,
          ],
          'heatmap-opacity': 0.95,
        },
      });
    });

    map.on('zoom', () => {
      setCurrentZoom(map.getZoom());
    });

    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      squircleMarkersRef.current.forEach((m) => m.remove());
      squircleMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Sync GeoJSON Sources Dynamically ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const ptSrc = mapRef.current.getSource('safety-heat-points-source') as mapboxgl.GeoJSONSource | undefined;
    const lnSrc = mapRef.current.getSource('safety-heat-lines-source') as mapboxgl.GeoJSONSource | undefined;
    const plSrc = mapRef.current.getSource('safety-heat-polys-source') as mapboxgl.GeoJSONSource | undefined;

    if (ptSrc) ptSrc.setData(heatmapPointsGeoJSON as any);
    if (lnSrc) lnSrc.setData(vectorLinesGeoJSON as any);
    if (plSrc) plSrc.setData(vectorPolysGeoJSON as any);
  }, [heatmapPointsGeoJSON, vectorLinesGeoJSON, vectorPolysGeoJSON, isLoaded]);

  // ── Precision Swiss Epicenter HUD Badges (Shown seamlessly at closer zooms) ─
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const map = mapRef.current;

    // Clean previous markers
    squircleMarkersRef.current.forEach((m) => m.remove());
    squircleMarkersRef.current = [];

    // Only mount precision epicenters at city / street level (zoom >= 12.5)
    // To ensure the global / continental globe stays 100% fluid and uncluttered
    if (currentZoom < 12.5) return;

    activeIncidentsList.forEach((inc) => {
      const thermalMeta = THERMAL_CATEGORY_SPECTRUM[inc.category] || THERMAL_CATEGORY_SPECTRUM.other;
      const svgIcon = categorySvgPaths[inc.category] || categorySvgPaths.other;

      const el = document.createElement('div');
      el.className = 'thermal-epicenter-marker';
      el.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        transform: translate3d(0, 0, 0);
      `;

      el.innerHTML = `
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.88);
          border: 1.5px solid ${thermalMeta.glowColor};
          box-shadow: 0 0 16px ${thermalMeta.glowColor}90, inset 0 0 8px ${thermalMeta.glowColor}40;
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${thermalMeta.color};
          transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        ">
          <div style="
            position: absolute;
            inset: -4px;
            border-radius: 14px;
            border: 1px solid ${thermalMeta.glowColor}60;
            pointer-events: none;
          "></div>
          ${svgIcon}
        </div>
      `;

      el.addEventListener('mouseenter', () => {
        const inner = el.firstElementChild as HTMLElement;
        if (inner) inner.style.transform = 'scale(1.15)';
      });
      el.addEventListener('mouseleave', () => {
        const inner = el.firstElementChild as HTMLElement;
        if (inner) inner.style.transform = 'scale(1.0)';
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .addTo(map);

      squircleMarkersRef.current.push(marker);
    });
  }, [activeIncidentsList, currentZoom, isLoaded]);

  // ── User GPS Location Beacon Marker ─────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;

    if (userLocation) {
      const lngLat: [number, number] = [userLocation[1], userLocation[0]];

      if (!userMarkerRef.current) {
        const markerEl = document.createElement('div');
        markerEl.className = 'user-gps-thermal-beacon';
        markerEl.innerHTML = `
          <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
            <div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(59, 130, 246, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 9999px; background: rgba(37, 99, 235, 0.45); border: 1.5px solid rgba(147, 197, 253, 0.8); box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);"></div>
            <div style="width: 11px; height: 11px; border-radius: 9999px; background: #3B82F6; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); z-index: 10;"></div>
          </div>
        `;

        userMarkerRef.current = new mapboxgl.Marker({ element: markerEl })
          .setLngLat(lngLat)
          .addTo(mapRef.current);
      } else {
        userMarkerRef.current.setLngLat(lngLat);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation, isLoaded]);

  // ── Camera & Map Helpers ────────────────────────────────────────────────
  const handleRecenter = useCallback(() => {
    hapticFeedback('medium');
    if (!userLocation) {
      requestUserLocation();
      return;
    }
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [userLocation[1], userLocation[0]],
      zoom: 14.5,
      pitch: 45,
      duration: 1800,
      essential: true,
    });
  }, [userLocation, hapticFeedback, requestUserLocation]);

  const handleGlobeView = useCallback(() => {
    hapticFeedback('light');
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      zoom: 2.2,
      pitch: 0,
      duration: 2000,
      essential: true,
    });
  }, [hapticFeedback]);

  const handleTogglePitch = useCallback(() => {
    hapticFeedback('light');
    if (!mapRef.current) return;
    const nextPitch = pitch === 0 ? 55 : 0;
    setPitch(nextPitch);
    mapRef.current.easeTo({
      pitch: nextPitch,
      duration: 800,
    });
  }, [pitch, hapticFeedback]);

  const handleZoomIn = useCallback(() => {
    hapticFeedback('light');
    mapRef.current?.zoomIn();
  }, [hapticFeedback]);

  const handleZoomOut = useCallback(() => {
    hapticFeedback('light');
    mapRef.current?.zoomOut();
  }, [hapticFeedback]);

  const handleClose = useCallback(() => {
    hapticFeedback('medium');
    setIsHeatmapMode(false);
  }, [hapticFeedback, setIsHeatmapMode]);

  return (
    <div className="fixed inset-0 z-40 bg-slate-950 text-white select-none overflow-hidden animate-fade-in font-sans">
      {/* ── Mapbox Canvas Container ────────────────────────────────────────── */}
      <div ref={containerRef} className="w-full h-full" />

      {/* ── LATÉRAL GAUCHE VERTICAL : BOUTON QUITTER & INSTRUMENT SPECTRE ──── */}
      <div className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-auto flex flex-col items-center gap-2 animate-slide-right">
        {/* Simple clean cross button placed right above the thermal spectrum */}
        <button
          onClick={handleClose}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white border border-white/20 shadow-xl flex items-center justify-center transition-all active:scale-90"
          title="Quitter la carte thermique"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Spectrum Widget */}
        <div className="p-2 sm:p-3.5 rounded-2xl sm:rounded-3xl bg-slate-900/85 backdrop-blur-3xl border border-white/15 shadow-2xl shadow-black/85 flex flex-col items-center gap-2 sm:gap-3">
          {/* Header icon (Desktop only) */}
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SPECTRE</span>
          </div>

          {/* Precision Capillary Gauge + Category Ticks */}
          <div className="flex items-stretch gap-2 sm:gap-3 py-0.5 sm:py-1">
            {/* Swiss Precision Glowing Thermal Bar (On mobile: pure clean colors!) */}
            <div className="relative w-2.5 sm:w-3 h-44 sm:h-56 rounded-full overflow-hidden bg-slate-950 border border-white/20 shadow-inner shadow-black/70 flex flex-col">
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: 'linear-gradient(to bottom, #FFFFFF 0%, #FFF59D 15%, #FF6D00 35%, #F43F5E 55%, #D946EF 75%, #6D28D9 90%, #1E1B4B 100%)',
                }}
              />
              {/* Precision Swiss hairline ticks */}
              <div className="absolute inset-y-0 inset-x-0 flex flex-col justify-between py-1.5 pointer-events-none opacity-40">
                <div className="w-full h-[1px] bg-black" />
                <div className="w-full h-[1px] bg-black" />
                <div className="w-full h-[1px] bg-black" />
                <div className="w-full h-[1px] bg-black" />
                <div className="w-full h-[1px] bg-black" />
                <div className="w-full h-[1px] bg-black" />
              </div>
            </div>

            {/* Scale Labels & Category Indicators (Hidden on mobile for sleek clutter-free look) */}
            <div className="hidden sm:flex flex-col justify-between text-[10px] font-extrabold tracking-tight select-none py-0.5">
              <div className="flex items-center gap-2 text-white">
                <div className="w-2 h-2 rounded-full bg-white shadow-sm shadow-white" />
                <div className="flex flex-col leading-none">
                  <span className="font-black text-xs">Critique</span>
                  <span className="text-[8px] font-medium text-slate-400">Danger, Feu, Violence</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-orange-400">
                <div className="w-2 h-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500" />
                <div className="flex flex-col leading-none">
                  <span className="font-black text-xs">Très Élevé</span>
                  <span className="text-[8px] font-medium text-slate-400">Rixe, Vol, Accident</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-fuchsia-400">
                <div className="w-2 h-2 rounded-full bg-fuchsia-500 shadow-sm shadow-fuchsia-500" />
                <div className="flex flex-col leading-none">
                  <span className="font-black text-xs">Modéré</span>
                  <span className="text-[8px] font-medium text-slate-400">Zone à éviter, Obstacle</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-indigo-300">
                <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500" />
                <div className="flex flex-col leading-none">
                  <span className="font-black text-xs">Vigilance</span>
                  <span className="text-[8px] font-medium text-slate-400">Éclairage, Veille</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden sm:block text-[8px] font-bold tracking-widest uppercase text-slate-400 text-center border-t border-white/10 pt-2 w-full">
            ÉCHELLE THERMIQUE
          </div>
        </div>
      </div>

      {/* ── LATÉRAL DROIT VERTICAL : CONTRÔLES COMPACTS REDIMENSIONNÉS ──────── */}
      <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-50 pointer-events-auto animate-slide-left">
        <div className="p-1 sm:p-1.5 rounded-2xl sm:rounded-3xl bg-slate-900/85 backdrop-blur-3xl border border-white/15 shadow-2xl shadow-black/85 flex flex-col gap-1.5 sm:gap-2">
          {/* 1. Recenter GPS Beacon */}
          <button
            onClick={handleRecenter}
            title="Centrer sur ma position GPS"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 text-blue-400 flex items-center justify-center shadow-md active:scale-90 transition-all border border-blue-500/25 hover:border-blue-400/50 group"
          >
            <Navigation2 className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
          </button>

          {/* 2. Planetary Globe View */}
          <button
            onClick={handleGlobeView}
            title="Vue planétaire de la Terre"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 text-emerald-400 flex items-center justify-center shadow-md active:scale-90 transition-all border border-emerald-500/25 hover:border-emerald-400/50 group"
          >
            <Compass className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-45 transition-transform" />
          </button>

          {/* 3. 3D Tilt Pitch */}
          <button
            onClick={handleTogglePitch}
            title="Basculer perspective 3D"
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-md active:scale-90 transition-all border group ${
              pitch > 0
                ? 'bg-orange-500/25 text-orange-400 border-orange-500/50'
                : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-white/10'
            }`}
          >
            <Box className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
          </button>

          <div className="w-4 sm:w-6 h-[1px] bg-white/15 mx-auto my-0.5" />

          {/* 4. Zoom + (Réduit sur mobile) */}
          <button
            onClick={handleZoomIn}
            title="Zoomer"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 text-white flex items-center justify-center shadow-md active:scale-90 transition-all border border-white/10 group"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
          </button>

          {/* 5. Zoom - (Réduit sur mobile) */}
          <button
            onClick={handleZoomOut}
            title="Dézoomer"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 text-white flex items-center justify-center shadow-md active:scale-90 transition-all border border-white/10 group"
          >
            <Minus className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* ── Bottom Subtle Status Pill ──────────────────────────────────────── */}
      {userLocation && (
        <div className="absolute bottom-5 inset-x-0 z-50 pointer-events-none flex justify-center safe-bottom">
          <div className="px-3.5 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-lg text-[10px] font-bold text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm shadow-blue-400" />
            <span>Position GPS active & verrouillée</span>
          </div>
        </div>
      )}
    </div>
  );
};
