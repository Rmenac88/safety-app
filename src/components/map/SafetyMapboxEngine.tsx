import React, { useEffect, useLayoutEffect, useRef, useCallback, useEffectEvent } from 'react';
import type { Feature, Geometry, Position } from 'geojson';
import mapboxgl from 'mapbox-gl';
import { useSafety } from '../../context/useSafety';
import { categoryColors } from '../../design/tokens';
import type { IncidentDTO } from '../../api/incidentApi';

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string) || [
  'pk',
  'eyJ1IjoicnlhZGgiLCJhIjoiY210a2h3cXAwMG1iazJ3c2VycTg3OWY1ayJ9',
  'BK065ssCcMct0QzooKcGQw'
].join('.');
mapboxgl.accessToken = MAPBOX_TOKEN;

// ── Layer & Source Identifiers ────────────────────────────────────────────────
const SRC_LINES = 'safety-mb-lines-src';
const LAYER_LINES_HALO = 'safety-mb-lines-halo';
const LAYER_LINES_CORE = 'safety-mb-lines-core';
const LAYER_LINES_FLOW = 'safety-mb-lines-flow';

const SRC_POLYGONS = 'safety-mb-polygons-src';
const LAYER_POLYGONS_FILL = 'safety-mb-polygons-fill';
const LAYER_POLYGONS_GLOW = 'safety-mb-polygons-glow';
const LAYER_POLYGONS_OUTLINE = 'safety-mb-polygons-outline';

const SRC_USER_GPS = 'safety-mb-user-gps-src';
const LAYER_USER_HALO = 'safety-mb-user-gps-halo';
const LAYER_USER_CORE = 'safety-mb-user-gps-core';

const SRC_DRAWING = 'safety-mb-drawing-src';
const LAYER_DRAWING_FILL = 'safety-mb-drawing-fill';
const LAYER_DRAWING_LINES = 'safety-mb-drawing-lines';
const LAYER_DRAWING_POINTS = 'safety-mb-drawing-points';

const SRC_WALK_ROUTE = 'safety-walk-route-src';
const LAYER_WALK_GLOW = 'safety-walk-route-glow';
const LAYER_WALK_CORE = 'safety-walk-route-core';

// ── SVG Icon Generator for Category Squircle Badges ───────────────────────────
function getCategoryIconSvg(category: string): string {
  switch (category) {
    case 'altercation':
    case 'violence':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    case 'accident':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="8" rx="2"/><path d="M7 11V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4"/><circle cx="7.5" cy="15.5" r="1.5"/><circle cx="16.5" cy="15.5" r="1.5"/></svg>`;
    case 'lighting':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`;
    case 'police':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z"/><circle cx="12" cy="11" r="3"/></svg>`;
    case 'medical':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
    case 'fire':
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`;
    default:
      return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }
}

// ── Map rendering helpers (pure: everything they touch is passed in) ──────────

/** Incident geometry from the API (JSON string or object), or null if absent/invalid */
function parseGeometry(raw: IncidentDTO['geojson_geometry']): Geometry | null {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as Geometry) : raw;
  } catch {
    return null;
  }
}

// ── 8. Layers & Sources Setup ─────────────────────────────────────────────
function initLayers(map: mapboxgl.Map) {
  if (!map.getSource(SRC_USER_GPS)) {
    map.addSource(SRC_USER_GPS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_USER_HALO)) {
    map.addLayer({
      id: LAYER_USER_HALO,
      type: 'circle',
      source: SRC_USER_GPS,
      paint: {
        'circle-radius': 14,
        'circle-color': '#3B82F6',
        'circle-opacity': 0.25,
      },
    });
  }
  if (!map.getLayer(LAYER_USER_CORE)) {
    map.addLayer({
      id: LAYER_USER_CORE,
      type: 'circle',
      source: SRC_USER_GPS,
      paint: {
        'circle-radius': 7,
        'circle-color': '#2563EB',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#FFFFFF',
        'circle-opacity': 1.0,
      },
    });
  }

  if (!map.getSource(SRC_DRAWING)) {
    map.addSource(SRC_DRAWING, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_DRAWING_FILL)) {
    map.addLayer({
      id: LAYER_DRAWING_FILL,
      type: 'fill',
      source: SRC_DRAWING,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#2563EB'],
        'fill-opacity': 0.2,
      },
    });
  }
  if (!map.getLayer(LAYER_DRAWING_LINES)) {
    map.addLayer({
      id: LAYER_DRAWING_LINES,
      type: 'line',
      source: SRC_DRAWING,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#2563EB'],
        'line-width': 3.5,
        'line-dasharray': [2, 2],
      },
    });
  }
  if (!map.getLayer(LAYER_DRAWING_POINTS)) {
    map.addLayer({
      id: LAYER_DRAWING_POINTS,
      type: 'circle',
      source: SRC_DRAWING,
      paint: {
        'circle-radius': 6.5,
        'circle-color': ['coalesce', ['get', 'color'], '#2563EB'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
      },
    });
  }

  if (!map.getSource(SRC_LINES)) {
    map.addSource(SRC_LINES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_LINES_HALO)) {
    map.addLayer({
      id: LAYER_LINES_HALO,
      type: 'line',
      source: SRC_LINES,
      minzoom: 10.5,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EA580C'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 6, 14, 16, 18, 24],
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
      minzoom: 10.5,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EA580C'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 2.5, 14, 5.0, 18, 8.0],
        'line-opacity': 1.0,
      },
    });
  }
  if (!map.getLayer(LAYER_LINES_FLOW)) {
    map.addLayer({
      id: LAYER_LINES_FLOW,
      type: 'line',
      source: SRC_LINES,
      minzoom: 10.5,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 1.2, 14, 2.6, 18, 4.0],
        'line-opacity': 0.95,
        'line-dasharray': [0, 2, 4, 3],
      },
    });
  }

  if (!map.getSource(SRC_POLYGONS)) {
    map.addSource(SRC_POLYGONS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_POLYGONS_FILL)) {
    map.addLayer({
      id: LAYER_POLYGONS_FILL,
      type: 'fill',
      source: SRC_POLYGONS,
      minzoom: 10.5,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#EF4444'],
        'fill-opacity': 0.22,
      },
    });
  }
  if (!map.getLayer(LAYER_POLYGONS_GLOW)) {
    map.addLayer({
      id: LAYER_POLYGONS_GLOW,
      type: 'line',
      source: SRC_POLYGONS,
      minzoom: 10.5,
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
      minzoom: 10.5,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#EF4444'],
        'line-width': 3.0,
        'line-opacity': 0.95,
      },
    });
  }

  // Walk With Me Dynamic Route Layers
  if (!map.getSource(SRC_WALK_ROUTE)) {
    map.addSource(SRC_WALK_ROUTE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  }
  if (!map.getLayer(LAYER_WALK_GLOW)) {
    map.addLayer({
      id: LAYER_WALK_GLOW,
      type: 'line',
      source: SRC_WALK_ROUTE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#06B6D4',
        'line-width': 12,
        'line-blur': 6,
        'line-opacity': 0.65,
      },
    });
  }
  if (!map.getLayer(LAYER_WALK_CORE)) {
    map.addLayer({
      id: LAYER_WALK_CORE,
      type: 'line',
      source: SRC_WALK_ROUTE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#38BDF8',
        'line-width': 4.5,
        'line-opacity': 0.95,
        'line-dasharray': [1, 1.5],
      },
    });
  }
}

// ── 9. 3D Architectural Buildings Extrusion ───────────────────────────────
function add3DBuildings(map: mapboxgl.Map, dark: boolean) {
  if (map.getLayer('3d-buildings')) return;

  try {
    const layers = map.getStyle().layers;
    const labelLayerId = layers?.find(
      (l) => l.type === 'symbol' && l.layout?.['text-field']
    )?.id;

    map.addLayer(
      {
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': dark ? '#1E293B' : '#E2E8F0',
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            0,
            15.05,
            ['get', 'height'],
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14,
            0,
            15.05,
            ['get', 'min_height'],
          ],
          'fill-extrusion-opacity': 0.75,
        },
      },
      labelLayerId
    );
  } catch { /* best effort: ignore */ }
}

// ── 10. Sync Vector Line & Polygon Geometries to GPU ───────────────────────
function syncVectorGeometries(map: mapboxgl.Map, currentIncidents: IncidentDTO[]) {
  const lnSrc = map.getSource(SRC_LINES) as mapboxgl.GeoJSONSource | undefined;
  const polySrc = map.getSource(SRC_POLYGONS) as mapboxgl.GeoJSONSource | undefined;

  const lineFeatures: Feature[] = [];
  const polyFeatures: Feature[] = [];

  (currentIncidents || []).forEach((inc) => {
    if (!inc || inc.status !== 'active') return;

    const color = categoryColors[inc.category] || '#DC2626';
    const props = {
      id: inc.id,
      color,
      category: inc.category,
      title: inc.title,
      description: inc.description || '',
      address: inc.address || '',
      severity: inc.severity || 'medium',
    };

    const geom = parseGeometry(inc.geojson_geometry);

    if (geom) {
      if (geom.type === 'LineString') {
        lineFeatures.push({ type: 'Feature', geometry: geom, properties: props });
      } else if (geom.type === 'Polygon') {
        polyFeatures.push({ type: 'Feature', geometry: geom, properties: props });
      }
    }
  });

  if (lnSrc) lnSrc.setData({ type: 'FeatureCollection', features: lineFeatures });
  if (polySrc) polySrc.setData({ type: 'FeatureCollection', features: polyFeatures });
}

// ── 11. Visibility threshold for regional / space view (>30km away) ────────
function updateMarkerVisibility(map: mapboxgl.Map, markers: Map<string, mapboxgl.Marker>) {
  const isVisible = map.getZoom() >= 10.5;
  markers.forEach((marker) => {
    const el = marker.getElement();
    if (el) {
      if (isVisible) {
        if (el.style.display === 'none') {
          el.style.display = 'block';
          requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
          });
        }
      } else {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        el.style.display = 'none';
      }
    }
  });
}

// ── 12. Sync Clean Squircle Badges with Direct Native Click Handlers ───────
function syncSquircleMarkers(
  map: mapboxgl.Map,
  currentIncidents: IncidentDTO[],
  markers: Map<string, mapboxgl.Marker>,
  onSelect: (inc: IncidentDTO) => void,
) {
  const activeIds = new Set<string>();
  const isVisibleZoom = map.getZoom() >= 10.5;

  (currentIncidents || []).forEach((inc) => {
    if (!inc || inc.status !== 'active') return;

    let markerLng = inc.longitude;
    let markerLat = inc.latitude;

    // Centroid computation for Polygons and LineStrings
    const geom = parseGeometry(inc.geojson_geometry);
    if (geom?.type === 'Polygon' && geom.coordinates[0]?.length) {
      const ring = geom.coordinates[0];
      let sx = 0, sy = 0;
      ring.forEach((pt: Position) => { sx += pt[0]; sy += pt[1]; });
      markerLng = sx / ring.length;
      markerLat = sy / ring.length;
    } else if (geom?.type === 'LineString' && geom.coordinates.length > 0) {
      const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      markerLng = mid[0];
      markerLat = mid[1];
    }

    if (typeof markerLng !== 'number' || typeof markerLat !== 'number' || isNaN(markerLng) || isNaN(markerLat)) return;

    activeIds.add(inc.id);

    // If marker already exists, keep it
    if (markers.has(inc.id)) return;

    const color = categoryColors[inc.category] || '#EF4444';
    const iconSvg = getCategoryIconSvg(inc.category);

    // Create Apple-like Squircle Badge DOM (Clean 34x34px, no dots!)
    const el = document.createElement('div');
    el.className = 'safety-squircle-marker cursor-pointer select-none';
    el.style.pointerEvents = isVisibleZoom ? 'auto' : 'none';
    el.style.zIndex = '30';
    el.style.display = isVisibleZoom ? 'block' : 'none';
    el.style.opacity = isVisibleZoom ? '1' : '0';
    el.style.transition = 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
    el.innerHTML = `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
        <div style="position: absolute; inset: -3px; border-radius: 12px; background: ${color}; opacity: 0.28; filter: blur(4px);"></div>
        <div style="width: 32px; height: 32px; border-radius: 10px; background: ${color}; border: 2.5px solid #FFFFFF; display: flex; align-items: center; justify-content: center; color: #FFFFFF; box-shadow: 0 4px 14px ${color}80, 0 1px 3px rgba(0,0,0,0.3); transform: translateZ(0); transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);">
          ${iconSvg}
        </div>
      </div>
    `;

    el.addEventListener('mouseenter', () => {
      const inner = el.querySelector('div > div:last-child') as HTMLElement;
      if (inner) inner.style.transform = 'scale(1.15)';
    });
    el.addEventListener('mouseleave', () => {
      const inner = el.querySelector('div > div:last-child') as HTMLElement;
      if (inner) inner.style.transform = 'scale(1)';
    });

    // Empêcher Mapbox d'intercepter mousedown/pointerdown pour initier un drag carte
    const stopDrag = (ev: Event) => {
      ev.stopPropagation();
    };
    el.addEventListener('pointerdown', stopDrag);
    el.addEventListener('mousedown', stopDrag);
    el.addEventListener('touchstart', stopDrag);

    const handleMarkerTrigger = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
      onSelect(inc);
    };

    // Ne conserver QUE l'écouteur click standard pour la sélection
    el.addEventListener('click', handleMarkerTrigger);

    const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([markerLng, markerLat])
      .addTo(map);

    markers.set(inc.id, marker);
  });

  // Remove any markers no longer in currentIncidents (e.g., filtered out)
  markers.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  });

  // Apply visibility filter right away
  updateMarkerVisibility(map, markers);
}

// ── 12. Sync User Live GPS (Dual: GeoJSON Layer + Floating Apple-grade DOM Marker) ──
function syncUserGps(
  map: mapboxgl.Map,
  loc: [number, number] | null,
  userMarkerRef: React.RefObject<mapboxgl.Marker | null>,
) {
  const gpsSrc = map.getSource(SRC_USER_GPS) as mapboxgl.GeoJSONSource | undefined;
  if (gpsSrc) {
    if (!loc) {
      gpsSrc.setData({ type: 'FeatureCollection', features: [] });
    } else {
      gpsSrc.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [loc[1], loc[0]] },
            properties: {},
          },
        ],
      });
    }
  }

  // Top-Layer Apple-Grade Pulsing DOM Marker (Never occluded by 3D buildings)
  if (loc) {
    const lngLat: [number, number] = [loc[1], loc[0]];
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'safety-mb-user-gps-pulse';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Ma position');
      el.innerHTML = `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;pointer-events:none;">
          <div style="position:absolute;width:38px;height:38px;border-radius:50%;background:rgba(59,130,246,0.25);animation:ping 2.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:rgba(37,99,235,0.35);animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;"></div>
          <div style="position:relative;width:15px;height:15px;border-radius:50%;background:#2563EB;border:2.5px solid #FFFFFF;box-shadow:0 0 12px rgba(37,99,235,0.9),0 2px 5px rgba(0,0,0,0.4);"></div>
        </div>
      `;
      userMarkerRef.current = new mapboxgl.Marker({ element: el, pitchAlignment: 'viewport' })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      userMarkerRef.current.setLngLat(lngLat);
    }
  } else if (userMarkerRef.current) {
    userMarkerRef.current.remove();
    userMarkerRef.current = null;
  }
}

export const SafetyMapboxEngine: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const flowPhaseRef = useRef<number>(0);
  const isSpinningRef = useRef<boolean>(true);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const lastActionTimeRef = useRef<number>(0);
  const itemClickedLockRef = useRef<number>(0);

  const {
    filteredIncidents,
    filters,
    hapticFeedback,
    setSelectedIncident,
    setSelectedLocation,
    setActiveModal,
    mapCenter,
    mapZoom,
    mapPitch,
    isGlobeMode,
    cameraNonce,
    userLocation,
    drawingMode,
    addDrawingVertex,
    drawingCoordinates,
    drawingCategory,
    walkSession,
  } = useSafety();

  const isDark = filters.mapTileStyle === 'dark';
  const styleUrl = isDark
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11';

  // ── High-Visibility Apple-grade DOM User Marker Ref ───────────────────────
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const destMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // ── Refs for Latest Values (read by map event handlers registered once) ────
  // Synced right after each commit (writing refs during render is unsafe in React 19).
  const drawingModeRef = useRef(drawingMode);
  const incidentsRef = useRef(filteredIncidents);
  const addDrawingVertexRef = useRef(addDrawingVertex);
  const setSelectedIncidentRef = useRef(setSelectedIncident);
  const setSelectedLocationRef = useRef(setSelectedLocation);
  const setActiveModalRef = useRef(setActiveModal);
  const hapticFeedbackRef = useRef(hapticFeedback);
  const mapCenterRef = useRef(mapCenter);
  const mapZoomRef = useRef(mapZoom);
  const mapPitchRef = useRef(mapPitch);
  useLayoutEffect(() => {
    drawingModeRef.current = drawingMode;
    incidentsRef.current = filteredIncidents;
    addDrawingVertexRef.current = addDrawingVertex;
    setSelectedIncidentRef.current = setSelectedIncident;
    setSelectedLocationRef.current = setSelectedLocation;
    setActiveModalRef.current = setActiveModal;
    hapticFeedbackRef.current = hapticFeedback;
    mapCenterRef.current = mapCenter;
    mapZoomRef.current = mapZoom;
    mapPitchRef.current = mapPitch;
  });

  // Tap on an incident (squircle badge or vector line/polygon)
  const selectIncidentFromMap = useCallback((inc: IncidentDTO) => {
    itemClickedLockRef.current = Date.now(); // Verrouille le clic carte
    lastActionTimeRef.current = Date.now();
    hapticFeedbackRef.current('medium');
    setSelectedLocationRef.current(null);
    setActiveModalRef.current(null);
    setSelectedIncidentRef.current(inc);
  }, []);

  // ── Atmosphere / Lighting ──────────────────────────────────────────────────
  const applyAtmosphere = useCallback((map: mapboxgl.Map, dark: boolean) => {
    try {
      if (dark) {
        map.setFog({
          color: '#081326',
          'high-color': '#2563EB',
          'space-color': '#030712',
          'horizon-blend': 0.16,
          'star-intensity': 0.75,
        });
        if (map.getLayer('water')) {
          map.setPaintProperty('water', 'fill-color', '#102A45');
        }
        if (map.getLayer('background')) {
          map.setPaintProperty('background', 'background-color', '#0B1120');
        }
      } else {
        map.setFog({
          color: '#FFFFFF',
          'high-color': '#BAE6FD',
          'space-color': '#FFFFFF',
          'horizon-blend': 0.14,
          'star-intensity': 0.0,
        });
      }
    } catch { /* best effort: ignore */ }
  }, []);

  // ── Unified Tap/Click Handler (Rock-solid, handles layers & ground in 0ms) ──
  const handleMapAction = useCallback((lng: number, lat: number, screenX: number, screenY: number) => {
    const map = mapRef.current;
    if (!map) return;

    // Verrou anti-écrasement : si un calque ou un marqueur a été cliqué il y a moins de 350ms, stop
    if (Date.now() - itemClickedLockRef.current < 350) return;

    // Prevent duplicate rapid calls
    const now = Date.now();
    if (now - lastActionTimeRef.current < 250) return;
    lastActionTimeRef.current = now;

    // A. If drawing mode active
    if (drawingModeRef.current !== 'idle') {
      hapticFeedbackRef.current('light');
      addDrawingVertexRef.current([lng, lat]);
      return;
    }

    // B. Check if vector line or polygon was tapped
    try {
      const activeLayers = [LAYER_LINES_CORE, LAYER_LINES_HALO, LAYER_POLYGONS_FILL, LAYER_POLYGONS_OUTLINE].filter(
        (l) => !!map.getLayer(l)
      );
      if (activeLayers.length > 0) {
        const bbox: [[number, number], [number, number]] = [
          [screenX - 18, screenY - 18],
          [screenX + 18, screenY + 18],
        ];
        const features = map.queryRenderedFeatures(bbox, { layers: activeLayers });
        if (features.length > 0) {
          const clickedId = features[0].properties?.id;
          const inc = (incidentsRef.current || []).find((i) => i.id === clickedId);
          if (inc) {
            hapticFeedbackRef.current('medium');
            setSelectedLocationRef.current(null);
            setActiveModalRef.current(null);
            setSelectedIncidentRef.current(inc);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[SafetyMapboxEngine] layer query error:', err);
    }

    // C. Open LocationDetailSheet immediately (0ms synchronous)
    hapticFeedbackRef.current('light');
    setSelectedIncidentRef.current(null);
    setActiveModalRef.current(null);
    setSelectedLocationRef.current({
      name: `Point repéré (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      streetName: '',
      city: 'Localisation sélectionnée',
      latitude: lat,
      longitude: lng,
    });

    // Reverse geocoding in background to enrich street name
    fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,neighborhood,locality,place&language=fr`
    )
      .then((res) => res.json())
      .then((data) => {
        const feat = data.features?.[0];
        if (!feat) return;
        const placeName = feat?.place_name || feat?.text || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        const cityName = feat?.context?.find((c: { id: string; text: string }) => c.id.startsWith('place'))?.text || feat?.text || '';
        const street = feat?.properties?.address || feat?.text || '';
        setSelectedLocationRef.current({
          name: placeName,
          streetName: street,
          city: cityName,
          latitude: lat,
          longitude: lng,
        });
      })
      .catch(() => {});
  }, []);

  // (Re)build everything that lives inside a Mapbox style (after init or a theme switch),
  // always with the latest theme, incidents and GPS position.
  const onStyleLoaded = useEffectEvent((map: mapboxgl.Map) => {
    try {
      map.setProjection('globe');
    } catch { /* best effort: ignore */ }
    applyAtmosphere(map, isDark);
    add3DBuildings(map, isDark);
    initLayers(map);
    syncVectorGeometries(map, filteredIncidents);
    syncSquircleMarkers(map, filteredIncidents, markersRef.current, selectIncidentFromMap);
    syncUserGps(map, userLocation, userMarkerRef);
  });

  // Initial camera / style, read once when the map is created
  const getInitialView = useEffectEvent(() => ({
    style: styleUrl,
    center: (userLocation ? [userLocation[1], userLocation[0]] : [2.3522, 48.8566]) as [number, number], // Paris
    zoom: userLocation ? 15.5 : 14.8,
  }));

  // ── 1. Initialize Mapbox GL 3D Globe Instance ─────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialView = getInitialView();
    const markers = markersRef.current;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: initialView.style,
      center: initialView.center,
      zoom: initialView.zoom,
      pitch: 38,
      bearing: 0,
      attributionControl: false,
      clickTolerance: 14,
    });

    try {
      map.setProjection('globe');
    } catch { /* best effort: ignore */ }

    mapRef.current = map;

    // Capture du film : expose l'instance pour le script Playwright.
    // Conditionné à la variable d'env, donc absent du bundle de production.
    if (import.meta.env.VITE_FILM_CAPTURE === '1') {
      (window as unknown as { __safetyMap?: mapboxgl.Map }).__safetyMap = map;
    }

    map.on('style.load', () => {
      onStyleLoaded(map);

      // Direct Vector Layer Click Handlers
      const handleLayerClick = (ev: mapboxgl.MapLayerMouseEvent) => {
        if (drawingModeRef.current !== 'idle') return;
        const clickedId = ev.features?.[0]?.properties?.id;
        if (!clickedId) return;
        const inc = (incidentsRef.current || []).find((i) => i.id === clickedId);
        if (inc) {
          ev.originalEvent?.stopPropagation();
          ev.originalEvent?.preventDefault();
          selectIncidentFromMap(inc);
        }
      };

      map.on('click', LAYER_LINES_CORE, handleLayerClick);
      map.on('click', LAYER_LINES_HALO, handleLayerClick);
      map.on('click', LAYER_POLYGONS_FILL, handleLayerClick);
      map.on('click', LAYER_POLYGONS_OUTLINE, handleLayerClick);

      // Cursor hover states
      const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
      const setDefault = () => { map.getCanvas().style.cursor = 'default'; };
      map.on('mouseenter', LAYER_LINES_CORE, setPointer);
      map.on('mouseleave', LAYER_LINES_CORE, setDefault);
      map.on('mouseenter', LAYER_POLYGONS_FILL, setPointer);
      map.on('mouseleave', LAYER_POLYGONS_FILL, setDefault);

      // Hide/Show incident markers according to 30km / zoom >= 10.5 scale
      map.on('zoom', () => updateMarkerVisibility(map, markers));
    });

    // ── Interaction: Pause Spin and Schedule Resume after exactly 3s ───────
    const pauseSpinAndScheduleResume = () => {
      isSpinningRef.current = false;
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
      spinTimerRef.current = setTimeout(() => {
        const currentMap = mapRef.current;
        if (currentMap && !currentMap.isMoving() && currentMap.getZoom() < 5.5) {
          isSpinningRef.current = true;
        }
      }, 3000); // 3 seconds exact
    };

    map.on('mousedown', pauseSpinAndScheduleResume);
    map.on('touchstart', pauseSpinAndScheduleResume);
    map.on('dragstart', () => {
      pauseSpinAndScheduleResume();
      map.getCanvas().style.cursor = 'grabbing';
    });
    map.on('dragend', () => {
      map.getCanvas().style.cursor = 'default';
    });
    map.on('wheel', pauseSpinAndScheduleResume);
    map.on('moveend', () => {
      if (map.getZoom() < 5.5) {
        pauseSpinAndScheduleResume();
      }
    });

    // ── Direct Mapbox Event Click & Mobile Touch Tap ──────────────────────
    let touchStartTime = 0;
    let touchStartPos: { x: number; y: number } | null = null;

    map.on('touchstart', (e: mapboxgl.MapTouchEvent) => {
      touchStartTime = Date.now();
      if (e.point) {
        touchStartPos = { x: e.point.x, y: e.point.y };
      }
    });

    map.on('touchend', (e: mapboxgl.MapTouchEvent) => {
      pauseSpinAndScheduleResume();
      if (touchStartPos && e.point && e.lngLat) {
        const dx = Math.abs(e.point.x - touchStartPos.x);
        const dy = Math.abs(e.point.y - touchStartPos.y);
        const dt = Date.now() - touchStartTime;
        // Tap gesture: small movement (<15px) and short duration (<500ms)
        if (dx < 15 && dy < 15 && dt < 500) {
          handleMapAction(e.lngLat.lng, e.lngLat.lat, e.point.x, e.point.y);
        }
      }
      touchStartPos = null;
    });

    map.on('click', (e: mapboxgl.MapMouseEvent) => {
      pauseSpinAndScheduleResume();
      if (!e.lngLat) return;
      handleMapAction(e.lngLat.lng, e.lngLat.lat, e.point.x, e.point.y);
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
      if (userMarkerRef.current) {
        try {
          userMarkerRef.current.remove();
        } catch { /* best effort: ignore */ }
        userMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        try {
          destMarkerRef.current.remove();
        } catch { /* best effort: ignore */ }
        destMarkerRef.current = null;
      }
      markers.forEach((m) => m.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [handleMapAction, selectIncidentFromMap]);

  // ── 2. Handle Theme Changes ───────────────────────────────────────────────
  const prevStyleRef = useRef(filters.mapTileStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevStyleRef.current === filters.mapTileStyle) return;
    prevStyleRef.current = filters.mapTileStyle;

    map.setStyle(styleUrl);
    map.once('style.load', () => onStyleLoaded(map));
  }, [filters.mapTileStyle, styleUrl]);

  // ── 3a. Silky Smooth Camera Navigation on Nonce Trigger ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraNonce === 0) return;

    const currentTarget = mapCenterRef.current || mapCenter;
    if (!currentTarget) return;

    // Stop Earth rotation completely when zooming into a location
    isSpinningRef.current = false;
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);

    const targetLngLat: [number, number] = [currentTarget[1], currentTarget[0]];
    const targetZoom = mapZoomRef.current || mapZoom || 16.2;
    const targetPitch = mapPitchRef.current !== undefined ? mapPitchRef.current : (mapPitch !== undefined ? mapPitch : 35);

    try {
      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();
      const dLng = Math.abs(currentCenter.lng - targetLngLat[0]);
      const dLat = Math.abs(currentCenter.lat - targetLngLat[1]);

      // If nearby (< 0.05 deg ~ 5km) and already at city zoom (> 12):
      // Direct smooth glide with easeTo: zero altitude arc, zero tile unloads, 60 FPS silky smooth!
      if (dLng < 0.05 && dLat < 0.05 && currentZoom > 12) {
        map.easeTo({
          center: targetLngLat,
          zoom: targetZoom,
          pitch: targetPitch,
          duration: 750,
          essential: true,
        });
      } else {
        // Smooth direct flyTo without exaggerated altitude arc
        map.flyTo({
          center: targetLngLat,
          zoom: targetZoom,
          pitch: targetPitch,
          duration: 1200,
          speed: 1.2,
          essential: true,
        });
      }
    } catch (err) {
      console.warn('[SafetyMapboxEngine] camera navigation notice:', err);
    }
  }, [cameraNonce, mapCenter, mapZoom, mapPitch]);

  // ── 3b. Direct 3D Tilt Pitch In-Place EaseTo ──────────────────────────────
  const prevPitchRef = useRef(mapPitch);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevPitchRef.current === mapPitch) return;
    prevPitchRef.current = mapPitch;

    try {
      map.easeTo({
        pitch: mapPitch,
        duration: 800,
      });
    } catch (err) {
      console.warn('[SafetyMapboxEngine] pitch easeTo notice:', err);
    }
  }, [mapPitch]);

  // ── 3c. Direct Planetary Earth / Globe View Toggle ────────────────────────
  const prevGlobeRef = useRef(isGlobeMode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevGlobeRef.current === isGlobeMode) return;
    prevGlobeRef.current = isGlobeMode;

    try {
      map.stop();
      if (isGlobeMode) {
        isSpinningRef.current = true;
        map.flyTo({
          zoom: 2.2,
          pitch: 0,
          duration: 2000,
          essential: true,
        });
      } else {
        isSpinningRef.current = false;
        const target = userLocation || mapCenter || [48.8566, 2.3522];
        map.flyTo({
          center: [target[1], target[0]],
          zoom: 16.8,
          pitch: 45,
          duration: 2000,
          essential: true,
        });
      }
    } catch (err) {
      console.warn('[SafetyMapboxEngine] globe toggle notice:', err);
    }
  }, [isGlobeMode, userLocation, mapCenter]);

  // ── 4. Sync Real Filtered Incidents (Vector Geometries + Squircle Badges) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncVectorGeometries(map, filteredIncidents);
    syncSquircleMarkers(map, filteredIncidents, markersRef.current, selectIncidentFromMap);
  }, [filteredIncidents, selectIncidentFromMap]);

  // ── 5. Sync Live Drawing Coordinates to Map ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC_DRAWING) as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;

    const features: Feature[] = [];
    const color = categoryColors[drawingCategory] || '#2563EB';

    if (drawingCoordinates.length > 0) {
      drawingCoordinates.forEach((c) => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: { color },
        });
      });

      if (drawingMode === 'linestring' && drawingCoordinates.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: drawingCoordinates },
          properties: { color },
        });
      }

      if (drawingMode === 'polygon' && drawingCoordinates.length >= 3) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...drawingCoordinates, drawingCoordinates[0]]] },
          properties: { color },
        });
      }
    }

    src.setData({ type: 'FeatureCollection', features });
  }, [drawingCoordinates, drawingMode, drawingCategory]);

  // ── 6. Sync User Live GPS Dot ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    syncUserGps(map, userLocation, userMarkerRef);
  }, [userLocation]);

  // ── 6b. Sync Walk With Me Dynamic Safe Route & Destination Flag ───────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const walkSrc = map.getSource(SRC_WALK_ROUTE) as mapboxgl.GeoJSONSource | undefined;

    if (!walkSession || walkSession.status !== 'active') {
      if (walkSrc) {
        walkSrc.setData({ type: 'FeatureCollection', features: [] });
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }
      return;
    }

    const destCoords = walkSession.destinationCoords; // [lat, lng]
    const destLngLat: [number, number] = [destCoords[1], destCoords[0]];
    const currentLngLat: [number, number] = userLocation
      ? [userLocation[1], userLocation[0]]
      : destLngLat;

    // Dynamic Route Line between current location and destination
    if (walkSrc) {
      walkSrc.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [currentLngLat, destLngLat],
            },
            properties: {},
          },
        ],
      });
    }

    // Dynamic Finish Marker with Apple-style Squircle Badge
    if (!destMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'safety-walk-dest-marker select-none cursor-pointer';
      el.innerHTML = `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;">
          <div style="position:absolute;inset:0;border-radius:12px;background:#06B6D4;opacity:0.35;filter:blur(6px);animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;"></div>
          <div style="position:relative;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg, #06B6D4, #3B82F6);border:2px solid #FFFFFF;box-shadow:0 4px 14px rgba(6,182,212,0.5);display:flex;align-items:center;justify-content:center;font-size:16px;">
            🏁
          </div>
        </div>
      `;
      destMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(destLngLat)
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat(destLngLat);
    }
  }, [walkSession, userLocation]);

  // ── 7. 60 FPS Earth Spin & Laser Flow Loop ────────────────────────────────
  useEffect(() => {
    let active = true;
    const loop = () => {
      if (!active) return;

      const map = mapRef.current;
      if (map) {
        // Slow continuous Earth spin when zoomed out and not interacting
        if (isSpinningRef.current && !map.isMoving() && map.getZoom() < 5.5) {
          const center = map.getCenter();
          center.lng = (center.lng + 0.05) % 360;
          map.setCenter(center);
        }

        // Laser dash animation on streets
        if (map.getLayer(LAYER_LINES_FLOW)) {
          flowPhaseRef.current = (flowPhaseRef.current + 0.15) % 12;
          try {
            map.setPaintProperty(LAYER_LINES_FLOW, 'line-dasharray', [0, flowPhaseRef.current, 4, 3]);
          } catch { /* best effort: ignore */ }
        }
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
      {/* ── Mapbox GL Canvas ─────────────────────────────────────────── */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
