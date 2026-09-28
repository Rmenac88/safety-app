import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map as MapLibreMap,
  Marker,
  type GeoJSONSource,
  type MapMouseEvent,
} from 'maplibre-gl';
import { useSafety } from '../../context/SafetyContext';
import { categoryColors, categoryEmoji } from '../../design/tokens';
import { reverseGeocode, fetchStreetGeometry } from '../../api/geocodingApi';
import { VECTOR_STYLES } from '../../design/mapStyles';
import { VectorDrawingControls } from './VectorDrawingControls';

const STREET_SOURCE_ID = 'safety-streets-source';
const STREET_HALO_LAYER_ID = 'safety-streets-halo';
const STREET_GLOW_LAYER_ID = 'safety-streets-glow';
const STREET_LINE_LAYER_ID = 'safety-streets-line';
const STREET_FLOW_LAYER_ID = 'safety-streets-flow';

const POLYGON_SOURCE_ID = 'safety-polygons-source';
const POLYGON_OUTLINE_LAYER_ID = 'safety-polygons-outline';

const POINTS_SOURCE_ID = 'safety-points-source';
const CLUSTERS_LAYER_ID = 'safety-clusters-circle';
const CLUSTERS_COUNT_LAYER_ID = 'safety-clusters-count';
const POINTS_CORE_LAYER_ID = 'safety-points-core';

const SELECTION_SOURCE_ID = 'safety-selection-source';
const SELECTION_GLOW_LAYER_ID = 'safety-selection-glow';
const SELECTION_LINE_LAYER_ID = 'safety-selection-line';
const SELECTION_FLOW_LAYER_ID = 'safety-selection-flow';

const DRAWING_TEMP_SOURCE_ID = 'safety-drawing-temp-source';
const DRAWING_LINE_LAYER_ID = 'safety-drawing-temp-line';
const DRAWING_POINTS_LAYER_ID = 'safety-drawing-temp-points';

export const SafetyGlobeMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const searchMarkerRef = useRef<Marker | null>(null);
  const incidentMarkersRef = useRef<Marker[]>([]);
  const vectorAnimRef = useRef<number | null>(null);
  const animPhaseRef = useRef<number>(0);
  const styleLoadedRef = useRef<boolean>(false);
  const rotationAnimFrameRef = useRef<number | null>(null);
  const rotationActiveRef = useRef<boolean>(false);
  const rotationPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRotationRef = useRef<() => void>(() => {});
  const stopRotationRef = useRef<() => void>(() => {});
  const isProgrammaticRef = useRef<boolean>(false);
  const lastCameraNonceRef = useRef<number>(0);
  const pendingCameraRef = useRef<{ lat: number; lon: number; zoom: number; pitch: number; bearing: number } | null>(null);
  const fetchingGeomsRef = useRef<Set<string>>(new Set());
  const lastActionTimestampRef = useRef<number>(0);
  const latestLocationRequestIdRef = useRef<number>(0);

  const [dynamicGeometries, setDynamicGeometries] = useState<Record<string, any>>({});

  const {
    filteredIncidents, userLocation,
    mapCenter, mapZoom, mapPitch, mapBearing, isGlobeMode, filters,
    selectedIncident, selectedLocation, cameraNonce,
    drawingMode, drawingCategory, drawingCoordinates,
    addDrawingVertex, finishDrawing,
    setMapZoom, setMapCenter, setSelectedIncident, setSelectedLocation, setActiveModal,
    hapticFeedback,
  } = useSafety();

  const isDark = filters.mapTileStyle === 'dark';

  const ensure3DBuildingLayers = useCallback((map: MapLibreMap) => {
    try {
      map.setLight({
        anchor: 'viewport',
        color: isDark ? '#D8E2EC' : '#ffffff',
        intensity: isDark ? 0.35 : 0.55,
        position: [1.5, 180, 45],
      });
    } catch (e) {}

    if (!map.getLayer('3d-buildings')) {
      const sources = map.getStyle().sources || {};
      const vectorSourceId = Object.keys(sources).find((id) => sources[id].type === 'vector') || 'carto';
      if (sources[vectorSourceId]) {
        try {
          map.addLayer({
            id: '3d-buildings',
            source: vectorSourceId,
            'source-layer': 'building',
            filter: ['!=', '$type', 'Point'],
            type: 'fill-extrusion',
            minzoom: 14,
            paint: {
              'fill-extrusion-color': isDark ? '#1E293B' : '#D1D5DB',
              'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                14, 0,
                15.5, [
                  'case',
                  ['has', 'render_height'], ['get', 'render_height'],
                  ['has', 'height'], ['get', 'height'],
                  ['has', 'levels'], ['*', ['get', 'levels'], 3.5],
                  12
                ],
              ],
              'fill-extrusion-base': [
                'case',
                ['has', 'render_min_height'], ['get', 'render_min_height'],
                ['has', 'min_height'], ['get', 'min_height'],
                0
              ],
              'fill-extrusion-opacity': 0.88,
            },
          });
        } catch (e) {}
      }
    }
  }, [isDark]);

  const ensurePointLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(POINTS_SOURCE_ID)) {
      map.addSource(POINTS_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 45,
      });
    }

    if (!map.getLayer(CLUSTERS_LAYER_ID)) {
      map.addLayer({
        id: CLUSTERS_LAYER_ID,
        type: 'circle',
        source: POINTS_SOURCE_ID,
        minzoom: 3.5,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#2563EB',
            10, '#F59E0B',
            50, '#EF4444',
            100, '#DC2626',
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            10, 20,
            50, 26,
            100, 32,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer(CLUSTERS_COUNT_LAYER_ID)) {
      map.addLayer({
        id: CLUSTERS_COUNT_LAYER_ID,
        type: 'symbol',
        source: POINTS_SOURCE_ID,
        minzoom: 3.5,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold', 'Open Sans Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#FFFFFF',
        },
      });
    }

    if (!map.getLayer(POINTS_CORE_LAYER_ID)) {
      map.addLayer({
        id: POINTS_CORE_LAYER_ID,
        type: 'circle',
        source: POINTS_SOURCE_ID,
        minzoom: 3.5,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            4, 3.0,
            8, 5.0,
            12, 7.0,
            16, 10.0,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      });
    }
  }, []);

  const ensureSelectionLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(SELECTION_SOURCE_ID)) {
      map.addSource(SELECTION_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer(SELECTION_GLOW_LAYER_ID)) {
      map.addLayer({
        id: SELECTION_GLOW_LAYER_ID,
        type: 'line',
        source: SELECTION_SOURCE_ID,
        minzoom: 12.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#2563EB',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 6, 16, 14, 19, 22],
          'line-blur': 4,
          'line-opacity': 0.5,
        },
      });
    }

    if (!map.getLayer(SELECTION_LINE_LAYER_ID)) {
      map.addLayer({
        id: SELECTION_LINE_LAYER_ID,
        type: 'line',
        source: SELECTION_SOURCE_ID,
        minzoom: 12.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#38BDF8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 2.5, 16, 5, 19, 7],
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer(SELECTION_FLOW_LAYER_ID)) {
      map.addLayer({
        id: SELECTION_FLOW_LAYER_ID,
        type: 'line',
        source: SELECTION_SOURCE_ID,
        minzoom: 12.5,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12.5, 1.5, 16, 3, 19, 4.5],
          'line-opacity': 0.95,
          'line-dasharray': [0, 2, 4, 2],
        },
      });
    }
  }, []);

  const ensurePolygonLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(POLYGON_SOURCE_ID)) {
      map.addSource(POLYGON_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer(POLYGON_OUTLINE_LAYER_ID)) {
      map.addLayer({
        id: POLYGON_OUTLINE_LAYER_ID,
        type: 'line',
        source: POLYGON_SOURCE_ID,
        minzoom: 10.0,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.0, 14, 3.5, 18, 5.0],
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        },
      });
    }
  }, []);

  const ensureDrawingTempLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(DRAWING_TEMP_SOURCE_ID)) {
      map.addSource(DRAWING_TEMP_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer(DRAWING_LINE_LAYER_ID)) {
      map.addLayer({
        id: DRAWING_LINE_LAYER_ID,
        type: 'line',
        source: DRAWING_TEMP_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
      });
    }

    if (!map.getLayer(DRAWING_POINTS_LAYER_ID)) {
      map.addLayer({
        id: DRAWING_POINTS_LAYER_ID,
        type: 'circle',
        source: DRAWING_TEMP_SOURCE_ID,
        paint: {
          'circle-radius': 6.0,
          'circle-color': '#ffffff',
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': 3.0,
        },
      });
    }
  }, []);

  const ensureStreetLayers = useCallback((map: MapLibreMap) => {
    if (!map.getSource(STREET_SOURCE_ID)) {
      map.addSource(STREET_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // Layer 1: Ambient Neon Bloom Halo
    if (!map.getLayer(STREET_HALO_LAYER_ID)) {
      map.addLayer({
        id: STREET_HALO_LAYER_ID,
        type: 'line',
        source: STREET_SOURCE_ID,
        minzoom: 8.0,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38BDF8'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 12, 16, 22],
          'line-blur': 6,
          'line-opacity': 0.75,
        },
      });
    }

    // Layer 2: Vivid Core Glow
    if (!map.getLayer(STREET_GLOW_LAYER_ID)) {
      map.addLayer({
        id: STREET_GLOW_LAYER_ID,
        type: 'line',
        source: STREET_SOURCE_ID,
        minzoom: 8.0,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38BDF8'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 7, 16, 12],
          'line-blur': 2,
          'line-opacity': 0.9,
        },
      });
    }

    // Layer 3: Ultra-Sharp Street Vector Core
    if (!map.getLayer(STREET_LINE_LAYER_ID)) {
      map.addLayer({
        id: STREET_LINE_LAYER_ID,
        type: 'line',
        source: STREET_SOURCE_ID,
        minzoom: 8.0,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38BDF8'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 12, 4.5, 16, 7.5],
          'line-opacity': 1.0,
        },
      });
    }

    // Layer 4: Dynamic High-Velocity White Laser Flow
    if (!map.getLayer(STREET_FLOW_LAYER_ID)) {
      map.addLayer({
        id: STREET_FLOW_LAYER_ID,
        type: 'line',
        source: STREET_SOURCE_ID,
        minzoom: 8.0,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.2, 12, 2.5, 16, 4.0],
          'line-opacity': 0.95,
          'line-dasharray': [0, 2, 4, 2],
        },
      });
    }
  }, []);

  useEffect(() => {
    filteredIncidents.forEach((inc) => {
      const isStreet = inc.geometry_type === 'street' || inc.geometry_type === 'LineString';
      if (isStreet && !inc.geojson_geometry && !fetchingGeomsRef.current.has(inc.id)) {
        fetchingGeomsRef.current.add(inc.id);
        fetchStreetGeometry(inc.address || inc.title, inc.latitude, inc.longitude, 600)
          .then((geom) => {
            if (geom) setDynamicGeometries((prev) => ({ ...prev, [inc.id]: geom }));
          })
          .catch(() => {});
      }
    });
  }, [filteredIncidents]);

  const updateVectorGeometries = useCallback((map: MapLibreMap) => {
    ensurePointLayers(map);
    ensureStreetLayers(map);
    ensurePolygonLayers(map);

    const pointSource = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    const streetSource = map.getSource(STREET_SOURCE_ID) as GeoJSONSource | undefined;
    const polySource = map.getSource(POLYGON_SOURCE_ID) as GeoJSONSource | undefined;

    const pointFeatures: any[] = [];
    const streetFeatures: any[] = [];
    const polyFeatures: any[] = [];

    const extractGeometry = (data: any): any => {
      if (!data) return null;
      if (data.type === 'Feature') return data.geometry ?? null;
      if (data.type === 'FeatureCollection' && data.features?.length > 0) {
        const first = data.features[0];
        return first?.geometry ?? null;
      }
      if (typeof data.type === 'string' && data.coordinates) return data;
      return null;
    };

    filteredIncidents.forEach((inc) => {
      let geom: any = null;
      if (inc.geojson_geometry) {
        try {
          const parsed = typeof inc.geojson_geometry === 'string' ? JSON.parse(inc.geojson_geometry) : inc.geojson_geometry;
          geom = extractGeometry(parsed);
        } catch {}
      } else if (dynamicGeometries[inc.id]) {
        geom = extractGeometry(dynamicGeometries[inc.id]);
      }

      const color = categoryColors[inc.category] || (inc.severity === 'critical' ? '#DC2626' : inc.severity === 'high' ? '#EF4444' : inc.severity === 'medium' ? '#F59E0B' : '#22C55E');

      if (geom) {
        const feature = {
          type: 'Feature',
          geometry: geom,
          properties: { id: inc.id, color, severity: inc.severity, title: inc.title, category: inc.category },
        };

        if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
          streetFeatures.push(feature);
        } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
          if (Array.isArray(geom.coordinates) && geom.coordinates[0]?.length >= 4) {
            polyFeatures.push(feature);
          } else {
            pointFeatures.push(feature);
          }
        } else {
          pointFeatures.push(feature);
        }
      } else {
        pointFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [inc.longitude, inc.latitude] },
          properties: { id: inc.id, color, severity: inc.severity, title: inc.title, category: inc.category },
        });
      }
    });

    if (pointSource) pointSource.setData({ type: 'FeatureCollection', features: pointFeatures });
    if (streetSource) streetSource.setData({ type: 'FeatureCollection', features: streetFeatures });
    if (polySource) polySource.setData({ type: 'FeatureCollection', features: polyFeatures });
  }, [ensurePointLayers, ensureStreetLayers, ensurePolygonLayers, filteredIncidents, dynamicGeometries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    ensureSelectionLayers(map);
    const source = map.getSource(SELECTION_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (selectedLocation?.streetGeometry) {
      const geom = selectedLocation.streetGeometry.type === 'Feature' ? selectedLocation.streetGeometry.geometry : selectedLocation.streetGeometry;
      source.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: geom, properties: { title: selectedLocation.name } }],
      });
    } else {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [selectedLocation, ensureSelectionLayers]);

  // ── 1. High-Def HTML / SVG Vector Incident Markers (Apple Maps Standard) ───
  // ── 1. Render DOM HTML Markers with Dynamic Zoom Responsiveness ───────────
  const syncIncidentMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    // Keep global/space view (zoom < 10.0) clean
    if (map.getZoom() < 10.0) return;

    const now = Date.now();

    filteredIncidents.forEach((inc) => {
      const color = categoryColors[inc.category] || '#EF4444';
      const emoji = categoryEmoji[inc.category] || '📍';
      const isCritical = inc.severity === 'critical';
      const isHigh = inc.severity === 'high';
      const isSelected = selectedIncident?.id === inc.id;
      const ageMs = now - new Date(inc.created_at).getTime();
      const isLive = !isNaN(ageMs) && ageMs < 15 * 60_000;

      const size = isSelected ? 40 : isCritical ? 36 : 32;
      const scale = isSelected ? 'scale(1.15)' : 'scale(1)';

      let pulseHtml = '';
      if (isCritical) {
        pulseHtml = `<div class="marker-pulse-critical" style="position:absolute;inset:-6px;border-radius:50%;background:rgba(220,38,38,0.35);animation:pulse 2s infinite"></div>`;
      } else if (isHigh) {
        pulseHtml = `<div class="marker-pulse-high" style="position:absolute;inset:-4px;border-radius:50%;background:rgba(239,68,68,0.25);animation:pulse 2.5s infinite"></div>`;
      } else if (isLive) {
        pulseHtml = `<div class="marker-pulse-live" style="position:absolute;inset:-4px;border-radius:50%;background:rgba(37,99,235,0.25);animation:pulse 2.5s infinite"></div>`;
      }

      // 1. Outer wrapper (strictly managed by MapLibre for GeoJSON coordinates)
      const wrapper = document.createElement('div');
      wrapper.className = 'safety-marker-anchor';
      wrapper.style.position = 'relative';
      wrapper.style.cursor = 'pointer';
      wrapper.style.userSelect = 'none';
      wrapper.style.zIndex = isSelected ? '20' : isCritical ? '15' : '10';

      // 2. Inner content (has the CSS visual transform and pulse without interfering with MapLibre's matrix)
      const inner = document.createElement('div');
      inner.className = 'safety-marker-inner';
      inner.style.position = 'relative';
      inner.style.display = 'flex';
      inner.style.alignItems = 'center';
      inner.style.justifyContent = 'center';
      inner.style.transition = 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)';
      inner.style.transform = scale;
      inner.innerHTML = `
        ${pulseHtml}
        <div style="
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border-radius: ${isCritical ? '13px' : '10px'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isCritical ? '16px' : '14px'};
          border: 2px solid rgba(255,255,255,${isSelected ? '0.98' : '0.85'});
          box-shadow: 0 4px 12px ${color}50, 0 2px 4px rgba(0,0,0,0.3);
          position: relative;
          z-index: 2;
          user-select: none;
        ">
          ${emoji}
        </div>
      `;
      wrapper.appendChild(inner);

      // 3. Reliable click & touch dispatchers
      const handleSelect = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        lastActionTimestampRef.current = Date.now();
        hapticFeedback('medium');
        setSelectedLocation(null);
        setActiveModal(null);
        setSelectedIncident(inc);
        map.flyTo({
          center: [inc.longitude, inc.latitude],
          zoom: Math.max(map.getZoom(), 16.5),
          pitch: 35,
          duration: 900,
        });
      };

      wrapper.addEventListener('pointerdown', (e) => e.stopPropagation());
      wrapper.addEventListener('mousedown', (e) => e.stopPropagation());
      wrapper.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      wrapper.addEventListener('click', handleSelect);

      const marker = new Marker({
        element: wrapper,
        anchor: 'center',
        pitchAlignment: 'viewport',
        rotationAlignment: 'viewport',
      })
        .setLngLat([inc.longitude, inc.latitude])
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    });
  }, [filteredIncidents, selectedIncident, setSelectedIncident, setSelectedLocation, setActiveModal, hapticFeedback]);

  useEffect(() => {
    syncIncidentMarkers();
  }, [syncIncidentMarkers]);

  // ── 2. User GPS Location Dot (Apple style) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (!userLocation) return;

    const el = document.createElement('div');
    el.style.position = 'relative';
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.innerHTML = `
      <div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(37,99,235,0.22);animation:pulse 2.2s ease-out infinite"></div>
      <div style="width:16px;height:16px;background:#2563EB;border:2.5px solid #FFFFFF;border-radius:50%;box-shadow:0 2px 10px rgba(37,99,235,0.6)"></div>
    `;

    userMarkerRef.current = new Marker({ element: el, anchor: 'center' })
      .setLngLat([userLocation[1], userLocation[0]])
      .addTo(map);
  }, [userLocation]);

  // ── 3. Search Destination Pin ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
      searchMarkerRef.current = null;
    }
    if (!selectedLocation) return;

    const truncated = selectedLocation.name.length > 24
      ? selectedLocation.name.slice(0, 24) + '…'
      : selectedLocation.name;

    const el = document.createElement('div');
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.style.gap = '4px';
    el.style.cursor = 'pointer';
    el.innerHTML = `
      <div style="background:rgba(15,23,42,0.92);color:#FFFFFF;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(12px);white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,0.5)">
        ${truncated}
      </div>
      <div style="width:10px;height:10px;border-radius:50%;background:#38BDF8;border:2px solid #FFFFFF;box-shadow:0 0 10px #38BDF8"></div>
    `;

    searchMarkerRef.current = new Marker({ element: el, anchor: 'bottom' })
      .setLngLat([selectedLocation.longitude, selectedLocation.latitude])
      .addTo(map);
  }, [selectedLocation]);

  // ── 4. High-Performance 60fps Vector Laser Flow Loop ───────────────────────
  useEffect(() => {
    let active = true;
    let lastTime = performance.now();

    const animateLoop = (now: number) => {
      if (!active) return;
      const delta = now - lastTime;
      lastTime = now;

      // Update flow phase smoothly
      animPhaseRef.current = (animPhaseRef.current + delta * 0.006) % 100;
      const phase = animPhaseRef.current;
      const dash1 = phase % 4;

      const map = mapRef.current;
      if (map && styleLoadedRef.current) {
        try {
          if (map.getLayer(STREET_FLOW_LAYER_ID)) {
            map.setPaintProperty(STREET_FLOW_LAYER_ID, 'line-dasharray', [0, dash1, 3, 2]);
          }
          if (map.getLayer(SELECTION_FLOW_LAYER_ID)) {
            map.setPaintProperty(SELECTION_FLOW_LAYER_ID, 'line-dasharray', [0, dash1, 4, 2]);
          }
        } catch {}
      }

      vectorAnimRef.current = requestAnimationFrame(animateLoop);
    };

    vectorAnimRef.current = requestAnimationFrame(animateLoop);
    return () => {
      active = false;
      if (vectorAnimRef.current) cancelAnimationFrame(vectorAnimRef.current);
    };
  }, []);

  const drawingModeRef = useRef(drawingMode);
  drawingModeRef.current = drawingMode;
  const drawingCategoryRef = useRef(drawingCategory);
  drawingCategoryRef.current = drawingCategory;
  const drawingCoordinatesRef = useRef(drawingCoordinates);
  drawingCoordinatesRef.current = drawingCoordinates;

  // ── 5. Main Map Initialization (Single instance, GPU accelerated) ──────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const tileStyle = filters.mapTileStyle as 'dark' | 'light' | 'satellite' | 'osm';
    const fallbackStyle = VECTOR_STYLES[tileStyle] || VECTOR_STYLES.dark;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: fallbackStyle,
      center: [mapCenter[1], mapCenter[0]],
      zoom: mapZoom,
      pitch: mapPitch,
      bearing: mapBearing,
      projection: { type: isGlobeMode ? 'globe' : 'mercator' },
    } as any);

    mapRef.current = map;

    map.on('style.load', () => {
      styleLoadedRef.current = true;
      try { (map as any).setProjection({ type: isGlobeMode ? 'globe' : 'mercator' }); } catch {}
      ensure3DBuildingLayers(map);
      ensurePointLayers(map);
      ensureStreetLayers(map);
      ensurePolygonLayers(map);
      ensureSelectionLayers(map);
      ensureDrawingTempLayers(map);
      updateVectorGeometries(map);
    });

    map.on('styledata', () => {
      if (styleLoadedRef.current) {
        ensure3DBuildingLayers(map);
        ensurePointLayers(map);
        ensureStreetLayers(map);
        ensurePolygonLayers(map);
        ensureSelectionLayers(map);
        ensureDrawingTempLayers(map);
        updateVectorGeometries(map);
      }
    });

    map.on('zoom', () => {
      syncIncidentMarkers();
    });
    map.on('zoomend', () => {
      syncIncidentMarkers();
      if (!isProgrammaticRef.current && !rotationActiveRef.current) setMapZoom(map.getZoom());
    });
    map.on('moveend', () => {
      if (!isProgrammaticRef.current && !rotationActiveRef.current) {
        const center = map.getCenter();
        setMapCenter([center.lat, center.lng]);
      }
      isProgrammaticRef.current = false;
    });

    map.on('click', CLUSTERS_LAYER_ID, async (e: MapMouseEvent) => {
      lastActionTimestampRef.current = Date.now();
      const features = map.queryRenderedFeatures(e.point, { layers: [CLUSTERS_LAYER_ID] });
      if (!features.length) return;
      const clusterId = features[0].properties?.cluster_id;
      const source = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource;
      if (clusterId && source && typeof source.getClusterExpansionZoom === 'function') {
        const nextZoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (features[0].geometry as any).coordinates;
        map.easeTo({ center: coords, zoom: nextZoom + 0.5, duration: 600 });
        hapticFeedback('light');
      }
    });

    map.on('click', POINTS_CORE_LAYER_ID, (e: MapMouseEvent) => {
      lastActionTimestampRef.current = Date.now();
      const features = map.queryRenderedFeatures(e.point, { layers: [POINTS_CORE_LAYER_ID] });
      if (!features.length) return;
      const incId = features[0].properties?.id;
      const inc = filteredIncidents.find((i) => i.id === incId);
      if (inc) {
        hapticFeedback('medium');
        setSelectedLocation(null);
        setActiveModal(null);
        setSelectedIncident(inc);
        map.flyTo({ center: [inc.longitude, inc.latitude], zoom: Math.max(map.getZoom(), 16.5), pitch: 45, duration: 1000 });
      }
    });

    map.on('click', STREET_LINE_LAYER_ID, (e: MapMouseEvent) => {
      lastActionTimestampRef.current = Date.now();
      const features = map.queryRenderedFeatures(e.point, { layers: [STREET_LINE_LAYER_ID] });
      if (!features.length) return;
      const incId = features[0].properties?.id;
      const inc = filteredIncidents.find((i) => i.id === incId);
      if (inc) {
        hapticFeedback('medium');
        setSelectedLocation(null);
        setActiveModal(null);
        setSelectedIncident(inc);
        map.flyTo({ center: [inc.longitude, inc.latitude], zoom: Math.max(map.getZoom(), 16.5), pitch: 45, duration: 1000 });
      }
    });

    const canvas = map.getCanvas();
    map.on('mouseenter', CLUSTERS_LAYER_ID, () => { canvas.style.cursor = 'pointer'; });
    map.on('mouseleave', CLUSTERS_LAYER_ID, () => { canvas.style.cursor = 'crosshair'; });
    map.on('mouseenter', POINTS_CORE_LAYER_ID, () => { canvas.style.cursor = 'pointer'; });
    map.on('mouseleave', POINTS_CORE_LAYER_ID, () => { canvas.style.cursor = 'crosshair'; });
    map.on('mouseenter', STREET_LINE_LAYER_ID, () => { canvas.style.cursor = 'pointer'; });
    map.on('mouseleave', STREET_LINE_LAYER_ID, () => { canvas.style.cursor = 'crosshair'; });

    map.dragRotate.enable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.enableRotation();

    map.on('click', (e: MapMouseEvent) => {
      // Prevent click collision if user tapped a marker, layer or button within the last 450ms
      if (Date.now() - lastActionTimestampRef.current < 450) return;

      try {
        if (drawingModeRef.current !== 'idle') {
          if (drawingModeRef.current === 'point') {
            addDrawingVertex([e.lngLat.lng, e.lngLat.lat]);
            if (finishDrawing()) setActiveModal('report');
          } else {
            addDrawingVertex([e.lngLat.lng, e.lngLat.lat]);
          }
          return;
        }

        // Check if an interactive layer was clicked (with 8px tolerance buffer)
        const hitLayers = [CLUSTERS_LAYER_ID, POINTS_CORE_LAYER_ID, STREET_LINE_LAYER_ID, STREET_GLOW_LAYER_ID, POLYGON_OUTLINE_LAYER_ID].filter(id => {
          try { return !!map.getLayer(id); } catch { return false; }
        });
        if (hitLayers.length > 0) {
          const bbox: [[number, number], [number, number]] = [
            [e.point.x - 8, e.point.y - 8],
            [e.point.x + 8, e.point.y + 8]
          ];
          const hitFeatures = map.queryRenderedFeatures(bbox, { layers: hitLayers });
          if (hitFeatures.length > 0) return;
        }

        const { lng, lat } = e.lngLat;
        hapticFeedback('light');

        const requestId = ++latestLocationRequestIdRef.current;

        // If clicking on the globe from high altitude (zoom < 9.0), smoothly zoom to the clicked location
        if (map.getZoom() < 9.0) {
          map.flyTo({ center: [lng, lat], zoom: 14.5, pitch: 45, duration: 1200 });
        }

        // 🚀 INSTANT UI FEEDBACK (0 ms) - Display Location Detail Sheet immediately
        setSelectedIncident(null);
        setSelectedLocation({
          latitude: lat,
          longitude: lng,
          name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          streetName: '',
          neighborhood: '',
          city: 'Zone analysée',
          streetGeometry: null,
        });
        setActiveModal('locationDetail');

        // Background non-blocking geocoding enrichment:
        reverseGeocode(lat, lng)
          .then(async (geocoded) => {
            if (latestLocationRequestIdRef.current !== requestId) return;
            let streetGeom = null;
            if (geocoded.street && geocoded.street !== 'Position GPS') {
              streetGeom = await fetchStreetGeometry(geocoded.street, lat, lng, 600).catch(() => null);
            }
            if (latestLocationRequestIdRef.current !== requestId) return;
            setSelectedLocation({
              latitude: lat,
              longitude: lng,
              name: geocoded.street || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              streetName: geocoded.street,
              neighborhood: geocoded.neighborhood,
              city: geocoded.city,
              streetGeometry: streetGeom,
            });
          })
          .catch(() => {});
      } catch (err) {
        console.warn('[SafetyMap] Safe map click handler notice:', err);
      }
    });

    const handlePointerDown = () => {};
    const handlePointerUp = () => {};
    const handlePointerMove = () => {};

    map.on('mousedown', handlePointerDown);
    map.on('touchstart' as any, handlePointerDown);
    map.on('mouseup', handlePointerUp);
    map.on('touchend' as any, handlePointerUp);
    map.on('mousemove', handlePointerMove);
    map.on('touchmove' as any, handlePointerMove);

    const DEG_PER_MS = 0.0035;
    const RESUME_DELAY_MS = 3000;
    let lastTs: number | null = null;
    canvas.style.cursor = 'crosshair';
    canvas.style.willChange = 'transform';

    function startRotation() {
      if (!isGlobeMode || (mapRef.current && mapRef.current.getZoom() > 5.5)) { stopRotation(); return; }
      if (rotationActiveRef.current) return;
      rotationActiveRef.current = true;
      lastTs = null;
      function frame(ts: number) {
        if (!rotationActiveRef.current || !mapRef.current) return;
        const m = mapRef.current;
        if (!isGlobeMode || m.getZoom() > 5.5) { rotationActiveRef.current = false; return; }
        if (lastTs !== null) {
          const safeDelta = Math.min(ts - lastTs, 100);
          const center = m.getCenter();
          m.setCenter([center.lng - (DEG_PER_MS * safeDelta), center.lat]);
        }
        lastTs = ts;
        rotationAnimFrameRef.current = requestAnimationFrame(frame);
      }
      rotationAnimFrameRef.current = requestAnimationFrame(frame);
    }
    function stopRotation() {
      rotationActiveRef.current = false;
      if (rotationAnimFrameRef.current !== null) { cancelAnimationFrame(rotationAnimFrameRef.current); rotationAnimFrameRef.current = null; }
    }
    function pauseAndScheduleResume() {
      stopRotation();
      if (rotationPauseTimerRef.current) clearTimeout(rotationPauseTimerRef.current);
      if (isGlobeMode) rotationPauseTimerRef.current = setTimeout(() => { if (mapRef.current && isGlobeMode && mapRef.current.getZoom() <= 5.5) startRotation(); }, RESUME_DELAY_MS);
    }

    startRotationRef.current = startRotation;
    stopRotationRef.current = stopRotation;

    map.on('style.load', () => {
      if (isGlobeMode && map.getZoom() <= 5.5) startRotation();
      setTimeout(() => { try { map.resize(); } catch {} }, 50);
      setTimeout(() => { try { map.resize(); } catch {} }, 300);
    });
    (['mousedown', 'touchstart', 'wheel', 'dragstart'] as const).forEach((ev) => map.on(ev, pauseAndScheduleResume));

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        try { map.resize(); } catch {}
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      stopRotation();
      if (rotationPauseTimerRef.current) clearTimeout(rotationPauseTimerRef.current);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const previousStyleRef = useRef(filters.mapTileStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (previousStyleRef.current === filters.mapTileStyle) return;
    previousStyleRef.current = filters.mapTileStyle;

    styleLoadedRef.current = false;
    map.setStyle(VECTOR_STYLES[filters.mapTileStyle] || VECTOR_STYLES.dark);
    map.once('style.load', () => {
      styleLoadedRef.current = true;
      try { (map as any).setProjection({ type: isGlobeMode ? 'globe' : 'mercator' }); } catch {}
      ensure3DBuildingLayers(map);
      ensurePointLayers(map);
      ensureStreetLayers(map);
      ensurePolygonLayers(map);
      ensureSelectionLayers(map);
      ensureDrawingTempLayers(map);
      updateVectorGeometries(map);
      try { map.resize(); } catch {}
      if (isGlobeMode && map.getZoom() <= 5.5) {
        startRotationRef.current();
      }
    });
  }, [filters.mapTileStyle, ensure3DBuildingLayers, ensurePointLayers, ensureStreetLayers, ensurePolygonLayers, ensureSelectionLayers, ensureDrawingTempLayers, updateVectorGeometries, isGlobeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    try { (map as any).setProjection({ type: isGlobeMode ? 'globe' : 'mercator' }); } catch {}
    if (isGlobeMode && map.getZoom() <= 5.5) {
      startRotationRef.current();
    } else {
      stopRotationRef.current();
    }
  }, [isGlobeMode]);

  useEffect(() => {
    pendingCameraRef.current = { lat: mapCenter[0], lon: mapCenter[1], zoom: mapZoom, pitch: mapPitch, bearing: mapBearing };
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || cameraNonce === 0 || cameraNonce === lastCameraNonceRef.current) return;
    lastCameraNonceRef.current = cameraNonce;
    const cam = pendingCameraRef.current;
    if (!cam) return;
    rotationActiveRef.current = false;
    isProgrammaticRef.current = true;
    try { map.stop(); } catch {}
    map.flyTo({ center: [cam.lon, cam.lat], zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing, duration: 1400, essential: true });
  }, [cameraNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    updateVectorGeometries(map);
  }, [updateVectorGeometries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    ensureDrawingTempLayers(map);
    const source = map.getSource(DRAWING_TEMP_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const color = categoryColors[drawingCategory] || '#2563EB';
    const features: any[] = [];
    if (drawingCoordinates.length > 0) {
      drawingCoordinates.forEach((coord, idx) => features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coord }, properties: { color, vertexIndex: idx } }));
      if ((drawingMode === 'linestring' || drawingMode === 'polygon') && drawingCoordinates.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: drawingCoordinates }, properties: { color } });
      }
      if (drawingMode === 'polygon' && drawingCoordinates.length >= 3) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...drawingCoordinates, drawingCoordinates[0]]] }, properties: { color } });
      }
    }
    source.setData({ type: 'FeatureCollection', features });
  }, [drawingCoordinates, drawingMode, drawingCategory, ensureDrawingTempLayers]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{
          background: filters.mapTileStyle === 'dark' ? '#090D16' : '#F8FAFC',
        }}
      />
      <VectorDrawingControls />
    </div>
  );
};
