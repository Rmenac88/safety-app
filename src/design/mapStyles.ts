import type { StyleSpecification } from 'maplibre-gl';

/**
 * 🛡️ SAFETY MAP ENGINE — 100% Open Source, Zero API Key, Zero Watermark
 *
 * Source des données : OpenStreetMap (ODbL) via OpenFreeMap.org
 * Moteur de rendu   : MapLibre GL JS (open source)
 * Style visuel      : 100% propriétaire Safety
 *
 * Fonctionnement :
 *   On charge le style complet d'OpenFreeMap (qui inclut sprites + glyphs + tiles)
 *   puis on remplace toutes les couleurs avec l'identité Safety.
 *   Aucune clé API. Aucun watermark. Jamais.
 */

// URLs des styles de base OpenFreeMap (complètes, avec sprites intégrés)
export const OPENFREEMAP_STYLE_URLS = {
  liberty: 'https://tiles.openfreemap.org/styles/liberty/style.json',
  bright: 'https://tiles.openfreemap.org/styles/bright/style.json',
  positron: 'https://tiles.openfreemap.org/styles/positron/style.json',
} as const;

// ── Palette Safety ────────────────────────────────────────────────────────────
export const SAFETY_DARK_PALETTE = {
  background:        '#090D16',
  land:              '#0D1425',
  landAlt:           '#101929',
  water:             '#06111F',
  park:              '#0A1F16',
  forest:            '#071A10',
  building:          '#111C2E',
  buildingOutline:   '#1A2744',
  motorway:          '#1E3A5C',
  motorwayCasing:    '#152840',
  primary:           '#1A3050',
  secondary:         '#132440',
  local:             '#0F1E35',
  pedestrian:        '#0C1A2E',
  border:            '#1A2744',
  borderRegion:      '#131F38',
  textCity:          '#E2E8F0',
  textCityHalo:      '#090D16',
  textTown:          '#94A3B8',
  textTownHalo:      '#090D16',
  textCountry:       '#475569',
  textCountryHalo:   '#090D16',
  textRoad:          '#64748B',
  textRoadHalo:      '#090D16',
};

export const SAFETY_LIGHT_PALETTE = {
  background:        '#E8EEF5', // Soft studio backdrop giving 3D globe depth
  land:              '#FFFFFF', // Crisp clean land masses
  landAlt:           '#F1F5F9',
  water:             '#90C4F5', // Rich, vibrant, elegant ocean azure with sharp contrast
  park:              '#D1FAE5',
  forest:            '#A7F3D0',
  building:          '#E2E8F0',
  buildingOutline:   '#CBD5E1',
  motorway:          '#FFFFFF',
  motorwayCasing:    '#CBD5E1',
  primary:           '#FFFFFF',
  secondary:         '#F8FAFC',
  local:             '#F1F5F9',
  pedestrian:        '#E2E8F0',
  border:            '#94A3B8',
  borderRegion:      '#CBD5E1',
  textCity:          '#0F172A',
  textCityHalo:      '#FFFFFF',
  textTown:          '#1E293B',
  textTownHalo:      '#FFFFFF',
  textCountry:       '#475569',
  textCountryHalo:   '#FFFFFF',
  textRoad:          '#334155',
  textRoadHalo:      '#FFFFFF',
};

// Correspondance entre les couleurs du style Liberty et nos couleurs Safety
type ColorMap = Record<string, string>;

function buildColorMap(palette: typeof SAFETY_DARK_PALETTE): ColorMap {
  return {
    // Fonds et terres
    '#f2efe9': palette.background,
    '#fbf8f3': palette.land,
    '#e8e0d8': palette.landAlt,
    '#d4c9bc': palette.landAlt,
    '#d9d0c9': palette.landAlt,
    // Eau
    '#aad3df': palette.water,
    '#74b9d0': palette.water,
    '#c0d8e4': palette.water,
    '#a8c8db': palette.water,
    // Parcs / Nature
    '#d0e8c8': palette.park,
    '#c3dfc0': palette.park,
    '#b8dab0': palette.forest,
    '#a8d098': palette.forest,
    '#cde8c0': palette.park,
    // Bâtiments
    '#e0d8d0': palette.building,
    '#d8d0c8': palette.building,
    '#d8cfc8': palette.building,
    '#cbc3bc': palette.buildingOutline,
    // Routes autoroutes
    '#f9d84e': palette.motorway,
    '#f4c843': palette.motorway,
    '#fcbe42': palette.motorway,
    '#e0a800': palette.motorwayCasing,
    '#d4a000': palette.motorwayCasing,
    '#c89800': palette.motorwayCasing,
    '#f6c84b': palette.motorway,
    '#f9c840': palette.motorway,
    // Routes principales
    '#f6f6f4': palette.primary,
    '#ffffff': palette.primary,
    '#fefefe': palette.primary,
    '#eeeeee': palette.secondary,
    '#e8e8e8': palette.secondary,
    '#e0e0e0': palette.secondary,
    // Routes secondaires
    '#d8d8d8': palette.local,
    '#d0d0d0': palette.local,
    '#c8c8c8': palette.local,
    // Rues locales / piétons
    '#f0ece8': palette.pedestrian,
    '#e8e4e0': palette.pedestrian,
    // Frontières
    '#b0b0b0': palette.border,
    '#b8b8b8': palette.borderRegion,
    // Textes villes
    '#333333': palette.textCity,
    '#444444': palette.textCity,
    '#555555': palette.textTown,
    '#666666': palette.textTown,
    '#777777': palette.textTown,
    '#888888': palette.textRoad,
    '#999999': palette.textRoad,
    '#aaaaaa': palette.textCountry,
  };
}

/**
 * Applique la palette Safety sur un style MapLibre existant.
 * Remplace chaque couleur trouvée dans les layers paint/layout.
 */
export function applyPaletteToStyle(
  style: StyleSpecification,
  palette: typeof SAFETY_DARK_PALETTE
): StyleSpecification {
  const colorMap = buildColorMap(palette);
  const styleStr = JSON.stringify(style);

  // Substitution directe de toutes les couleurs connues
  let result = styleStr;
  for (const [from, to] of Object.entries(colorMap)) {
    // Remplacement insensible à la casse sur les couleurs hex
    result = result.split(from).join(to);
    result = result.split(from.toUpperCase()).join(to);
  }

  // Override forcé du fond global
  const parsed = JSON.parse(result) as StyleSpecification;
  if (parsed.layers) {
    for (const layer of parsed.layers) {
      if (layer.type === 'background' && layer.paint) {
        (layer.paint as Record<string, unknown>)['background-color'] = palette.background;
      }
    }
  }

  return parsed;
}

/**
 * Charge un style OpenFreeMap et applique l'identité Safety.
 */
export async function loadSafetyStyle(mode: 'dark' | 'light'): Promise<StyleSpecification> {
  const url = mode === 'dark' ? OPENFREEMAP_STYLE_URLS.liberty : OPENFREEMAP_STYLE_URLS.bright;

  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Status: ${resp.status}`);
    const baseStyle = await resp.json() as StyleSpecification;
    const palette = mode === 'dark' ? SAFETY_DARK_PALETTE : SAFETY_LIGHT_PALETTE;
    return applyPaletteToStyle(baseStyle, palette);
  } catch (err) {
    console.warn('Direct style fetch notice:', err);
    throw err;
  }
}

// ── High-Performance HD Styles (OpenStreetMap / CARTO High-DPI Retina) ──────
export const SAFETY_APPLE_LIGHT_STYLE: StyleSpecification = {
  version: 8,
  name: 'Safety Apple Light HD',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'carto-light-base': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 20,
      attribution: '&copy; Safety &copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#FFFFFF' },
    },
    {
      id: 'carto-light-base',
      type: 'raster',
      source: 'carto-light-base',
      paint: { 'raster-opacity': 1.0 },
    },
  ],
};

export const SAFETY_OBSIDIAN_DARK_STYLE: StyleSpecification = {
  version: 8,
  name: 'Safety Obsidian Dark HD',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'carto-dark-base': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 20,
      attribution: '&copy; Safety &copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#0B0F19' },
    },
    {
      id: 'carto-dark-base',
      type: 'raster',
      source: 'carto-dark-base',
      paint: { 'raster-opacity': 1.0 },
    },
  ],
};

export const VECTOR_STYLES: Record<string, StyleSpecification> = {
  light: SAFETY_APPLE_LIGHT_STYLE,
  dark: SAFETY_OBSIDIAN_DARK_STYLE,
};
