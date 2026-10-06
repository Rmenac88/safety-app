import React, { useEffect, useRef, useState, useEffectEvent } from 'react';
import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import { MapPin } from 'lucide-react';
import { useSafety } from '../../context/useSafety';
import { VECTOR_STYLES } from '../../design/mapStyles';
import { categoryColors, categoryLabels } from '../../design/tokens';

// ── Layer & Source Identifiers (100% GPU Native GeoJSON) ──────────────────────
const SRC_POINTS = 'safety-engine-points-src';
const LAYER_POINTS_HALO = 'safety-engine-points-halo';
const LAYER_POINTS_CORE = 'safety-engine-points-core';

const SRC_LINES = 'safety-engine-lines-src';
const LAYER_LINES_HALO = 'safety-engine-lines-halo';
const LAYER_LINES_CORE = 'safety-engine-lines-core';
const LAYER_LINES_FLOW = 'safety-engine-lines-flow';

const SRC_POLYGONS = 'safety-engine-polygons-src';
const LAYER_POLYGONS_FILL = 'safety-engine-polygons-fill';
const LAYER_POLYGONS_GLOW = 'safety-engine-polygons-glow';
const LAYER_POLYGONS_OUTLINE = 'safety-engine-polygons-outline';

// ── Built-in Reference Safety Geometries for Testing (Point, Line, Polygon) ──
const SAMPLE_RISK_DATA = {
  points: [
    {
      id: 'pt-1',
      category: 'altercation',
      severity: 'critical',
      title: 'Rixe signalée',
      description: 'Altercation en cours près de la sortie Châtelet.',
      coordinates: [2.3475, 48.8588],
      address: 'Place du Châtelet, Paris',
    },
    {
      id: 'pt-2',
      category: 'police',
      severity: 'low',
      title: 'Patrouille de sécurisation',
      description: 'Présence des forces de l’ordre sur le parvis.',
      coordinates: [2.3550, 48.8805],
      address: 'Gare du Nord, Paris',
    },
    {
      id: 'pt-3',
      category: 'medical',
      severity: 'critical',
      title: 'Secours en intervention',
      description: 'Malaise pris en charge sur la voie publique.',
      coordinates: [2.3440, 48.8535],
      address: 'Quai Saint-Michel, Paris',
    },
  ],
  lines: [
    {
      id: 'ln-1',
      category: 'danger',
      severity: 'high',
      title: 'Chantier & voie cyclable obstruée',
      description: 'Travaux profonds sans balisage sur 400 mètres.',
      coordinates: [
        [2.3470, 48.8562],
        [2.3522, 48.8570],
        [2.3585, 48.8582],
      ],
      address: 'Rue de Rivoli, Paris',
    },
    {
      id: 'ln-2',
      category: 'lighting',
      severity: 'medium',
      title: 'Éclairage public défaillant',
      description: 'Rue plongée dans le noir complet.',
      coordinates: [
        [2.3700, 48.8535],
        [2.3740, 48.8542],
        [2.3785, 48.8552],
      ],
      address: 'Rue de la Roquette, Paris',
    },
  ],
  polygons: [
    {
      id: 'poly-1',
      category: 'avoid',
      severity: 'high',
      title: 'Périmètre de tension nocturne',
      description: 'Zone à éviter temporairement suite à des regroupements.',
      coordinates: [
        [
          [2.3615, 48.8665],
          [2.3665, 48.8685],
          [2.3675, 48.8665],
          [2.3630, 48.8655],
          [2.3615, 48.8665],
        ],
      ],
      address: 'Périmètre République, Paris',
    },
  ],
};

/** Properties carried by every risk feature (shown in the info card on click) */
interface RiskFeatureProps {
  id: string;
  color: string;
  category: string;
  title: string;
  description?: string;
  address?: string;
  severity?: string;
}

/** MapLibre has no fog API (Mapbox-only): applied only when the method exists. */
function applyGlobeLook(map: MapLibreMap) {
  try {
    map.setProjection({ type: 'globe' });
  } catch { /* best effort: ignore */ }
  const withFog = map as MapLibreMap & { setFog?: (fog: Record<string, unknown>) => void };
  try {
    withFog.setFog?.({
      color: '#FFFFFF',
      'high-color': '#E0F2FE',
      'space-color': '#FFFFFF',
      'horizon-blend': 0.15,
    });
  } catch { /* best effort: ignore */ }
}

// ── 4. Set up GPU GeoJSON Layers for Points, Lines, Polygons & Drawing ────
function initRiskLayers(map: MapLibreMap) {
  // ── Points Source & Layers ──
  if (!map.getSource(SRC_POINTS)) {
    map.addSource(SRC_POINTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_POINTS_HALO)) {
    map.addLayer({
      id: LAYER_POINTS_HALO,
      type: 'circle',
      source: SRC_POINTS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 14, 18, 18, 28],
        'circle-color': ['coalesce', ['get', 'color'], '#DC2626'],
        'circle-opacity': 0.28,
        'circle-blur': 0.6,
      },
    });
  }
  if (!map.getLayer(LAYER_POINTS_CORE)) {
    map.addLayer({
      id: LAYER_POINTS_CORE,
      type: 'circle',
      source: SRC_POINTS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4.5, 14, 8.5, 18, 12],
        'circle-color': ['coalesce', ['get', 'color'], '#DC2626'],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 1.0,
      },
    });
  }

  // ── Lines Source & Layers (Streets with Glowing Neon Core) ──
  if (!map.getSource(SRC_LINES)) {
    map.addSource(SRC_LINES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_LINES_HALO)) {
    map.addLayer({
      id: LAYER_LINES_HALO,
      type: 'line',
      source: SRC_LINES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EA580C'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 16, 18, 24],
        'line-blur': 6,
        'line-opacity': 0.55,
      },
    });
  }
  if (!map.getLayer(LAYER_LINES_CORE)) {
    map.addLayer({
      id: LAYER_LINES_CORE,
      type: 'line',
      source: SRC_LINES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EA580C'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 5.0, 18, 8.0],
        'line-opacity': 1.0,
      },
    });
  }
  if (!map.getLayer(LAYER_LINES_FLOW)) {
    map.addLayer({
      id: LAYER_LINES_FLOW,
      type: 'line',
      source: SRC_LINES,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 14, 2.6, 18, 4.0],
        'line-opacity': 0.95,
        'line-dasharray': [0, 2, 4, 3],
      },
    });
  }

  // ── Polygons Source & Layers (Translucent Risk Perimeters) ──
  if (!map.getSource(SRC_POLYGONS)) {
    map.addSource(SRC_POLYGONS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_POLYGONS_FILL)) {
    map.addLayer({
      id: LAYER_POLYGONS_FILL,
      type: 'fill',
      source: SRC_POLYGONS,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#EF4444'],
        'fill-opacity': 0.16,
      },
    });
  }
  if (!map.getLayer(LAYER_POLYGONS_GLOW)) {
    map.addLayer({
      id: LAYER_POLYGONS_GLOW,
      type: 'line',
      source: SRC_POLYGONS,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EF4444'],
        'line-width': 8,
        'line-blur': 4,
        'line-opacity': 0.35,
      },
    });
  }
  if (!map.getLayer(LAYER_POLYGONS_OUTLINE)) {
    map.addLayer({
      id: LAYER_POLYGONS_OUTLINE,
      type: 'line',
      source: SRC_POLYGONS,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EF4444'],
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
    });
  }
}

// ── 5. Sync Risk Geometries with Map Sources ──────────────────────────────
function syncRiskData(map: MapLibreMap, enabled: boolean) {
  const ptSrc = map.getSource(SRC_POINTS) as GeoJSONSource | undefined;
  const lnSrc = map.getSource(SRC_LINES) as GeoJSONSource | undefined;
  const polySrc = map.getSource(SRC_POLYGONS) as GeoJSONSource | undefined;

  if (!enabled) {
    if (ptSrc) ptSrc.setData({ type: 'FeatureCollection', features: [] });
    if (lnSrc) lnSrc.setData({ type: 'FeatureCollection', features: [] });
    if (polySrc) polySrc.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  if (ptSrc) {
    ptSrc.setData({
      type: 'FeatureCollection',
      features: SAMPLE_RISK_DATA.points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: {
          id: p.id,
          color: categoryColors[p.category] || '#DC2626',
          category: p.category,
          title: p.title,
          description: p.description,
          address: p.address,
          severity: p.severity,
        },
      })),
    });
  }

  if (lnSrc) {
    lnSrc.setData({
      type: 'FeatureCollection',
      features: SAMPLE_RISK_DATA.lines.map((l) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: l.coordinates },
        properties: {
          id: l.id,
          color: categoryColors[l.category] || '#EA580C',
          category: l.category,
          title: l.title,
          description: l.description,
          address: l.address,
          severity: l.severity,
        },
      })),
    });
  }

  if (polySrc) {
    polySrc.setData({
      type: 'FeatureCollection',
      features: SAMPLE_RISK_DATA.polygons.map((poly) => ({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly.coordinates },
        properties: {
          id: poly.id,
          color: categoryColors[poly.category] || '#EF4444',
          category: poly.category,
          title: poly.title,
          description: poly.description,
          address: poly.address,
          severity: poly.severity,
        },
      })),
    });
  }
}

export const SafetyMapEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const flowPhaseRef = useRef<number>(0);

  const { filters, hapticFeedback } = useSafety();

  // ── Engine Mode & State ───────────────────────────────────────────────────
  const [selectedFeature, setSelectedFeature] = useState<RiskFeatureProps | null>(null);

  const getInitialStyle = useEffectEvent(() => VECTOR_STYLES[filters.mapTileStyle] || VECTOR_STYLES.light);

  // ── Interactive Clicks: inspect the risk layer under the pointer ──────────
  const onMapClick = useEffectEvent((map: MapLibreMap, e: MapMouseEvent) => {
    const bbox: [[number, number], [number, number]] = [
      [e.point.x - 8, e.point.y - 8],
      [e.point.x + 8, e.point.y + 8],
    ];
    const features = map.queryRenderedFeatures(bbox, {
      layers: [LAYER_POINTS_CORE, LAYER_LINES_CORE, LAYER_POLYGONS_FILL],
    });

    if (features.length > 0) {
      hapticFeedback('medium');
      setSelectedFeature(features[0].properties as RiskFeatureProps);
    } else {
      setSelectedFeature(null);
    }
  });

  // ── 1. Initialize Pure MapLibre Globe Instance ────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getInitialStyle(),
      center: [2.3522, 48.8566],
      zoom: 14.8,
      pitch: 35,
      bearing: 0,
      attributionControl: false,
    });

    try {
      map.setProjection({ type: 'globe' });
    } catch { /* best effort: ignore */ }

    mapRef.current = map;

    map.on('style.load', () => {
      applyGlobeLook(map);
      initRiskLayers(map);
      syncRiskData(map, true);
    });

    map.on('click', (e: MapMouseEvent) => {
      onMapClick(map, e);
    });

    // Cursor handling
    map.on('mouseenter', LAYER_POINTS_CORE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYER_POINTS_CORE, () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', LAYER_LINES_CORE, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYER_LINES_CORE, () => { map.getCanvas().style.cursor = ''; });
    map.on('mouseenter', LAYER_POLYGONS_FILL, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYER_POLYGONS_FILL, () => { map.getCanvas().style.cursor = ''; });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── 2. Update Style upon Theme Change ─────────────────────────────────────
  const prevStyleRef = useRef(filters.mapTileStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevStyleRef.current === filters.mapTileStyle) return;
    prevStyleRef.current = filters.mapTileStyle;

    map.setStyle(VECTOR_STYLES[filters.mapTileStyle] || VECTOR_STYLES.light);
    map.once('style.load', () => {
      applyGlobeLook(map);
      initRiskLayers(map);
      syncRiskData(map, true);
    });
  }, [filters.mapTileStyle]);

  // ── 3. High-Velocity 60fps Laser Vector Flow Loop ─────────────────────────
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;
      flowPhaseRef.current = (flowPhaseRef.current + 0.15) % 12;
      const phase = flowPhaseRef.current;

      const map = mapRef.current;
      if (map && map.getLayer(LAYER_LINES_FLOW)) {
        try {
          map.setPaintProperty(LAYER_LINES_FLOW, 'line-dasharray', [0, phase, 4, 3]);
        } catch { /* best effort: ignore */ }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden select-none font-sans">
      {/* ── 1. MapLibre GL WebGL Canvas ───────────────────────────────── */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* ── 2. Liquid Glass Floating Inspector (when a risk is clicked) ─── */}
      {selectedFeature && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-md p-4 rounded-3xl border shadow-sheet backdrop-blur-3xl animate-slide-up pointer-events-auto bg-white/95 dark:bg-slate-900/95 border-slate-200/90 dark:border-slate-800/90">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedFeature.color || '#EF4444' }}
              />
              <span className="text-2xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {categoryLabels[selectedFeature.category as keyof typeof categoryLabels] || 'Signalement'}
              </span>
            </div>
            <button
              onClick={() => setSelectedFeature(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Fermer
            </button>
          </div>

          <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight mb-1">
            {selectedFeature.title}
          </h3>

          {selectedFeature.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
              {selectedFeature.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 text-2xs text-slate-400">
            <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="truncate">{selectedFeature.address}</span>
          </div>
        </div>
      )}
    </div>
  );
};
