import { MAPBOX_TOKEN } from '../config/mapbox';

export interface GeocodedPlace {
  placeId: string;
  name: string;
  displayName: string;
  streetName?: string;
  neighborhood?: string;
  city?: string;
  country?: string;
  latitude: number;
  longitude: number;
  type: string;
}

const CACHE = new Map<string, GeocodedPlace[]>();
const REV_CACHE = new Map<string, { street: string; neighborhood: string; city: string; formatted: string }>();

/**
 * Searches real addresses, streets, POIs, and places using Mapbox Geocoding API with Nominatim fallback.
 * Works 100% on client-side without dependency on serverless backend.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  proximity?: [number, number]
): Promise<GeocodedPlace[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];
  if (CACHE.has(key)) return CACHE.get(key)!;

  // 1. Direct Mapbox Places API
  try {
    const proximityParam = proximity ? `&proximity=${proximity[1]},${proximity[0]}` : '';
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      query
    )}.json?access_token=${MAPBOX_TOKEN}&language=fr&autocomplete=true&limit=8${proximityParam}`;

    const res = await fetch(mapboxUrl, { signal });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features) && data.features.length > 0) {
        const places: GeocodedPlace[] = data.features.map((f: any) => {
          const ctx = f.context || [];
          const neighborhood = ctx.find((c: any) => c.id.startsWith('neighborhood') || c.id.startsWith('locality'))?.text;
          const city = ctx.find((c: any) => c.id.startsWith('place'))?.text;
          const country = ctx.find((c: any) => c.id.startsWith('country'))?.text;
          const street = f.address ? `${f.address} ${f.text}` : f.text;

          return {
            placeId: f.id,
            name: f.text || street,
            displayName: f.place_name,
            streetName: street,
            neighborhood,
            city,
            country,
            latitude: f.center[1],
            longitude: f.center[0],
            type: f.place_type?.[0] || 'place',
          };
        });

        CACHE.set(key, places);
        return places;
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    console.warn('[geocodingApi] Mapbox places notice, falling back to OSM:', err);
  }

  // 2. OpenStreetMap Nominatim Fallback
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&addressdetails=1&limit=8`;
    const res = await fetch(nomUrl, {
      headers: { 'User-Agent': 'SafetyApp/2.0' },
      signal,
    });
    if (!res.ok) return [];
    const data = await res.json();

    const places: GeocodedPlace[] = (data || []).map((item: any) => {
      const address = item.address || {};
      const street = address.road || address.pedestrian || address.street;
      const suburb = address.suburb || address.neighbourhood || address.quarter;
      const city = address.city || address.town || address.village || address.municipality;

      return {
        placeId: String(item.place_id),
        name: item.name || street || suburb || city || item.display_name.split(',')[0],
        displayName: item.display_name,
        streetName: street,
        neighborhood: suburb,
        city,
        country: address.country,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        type: item.type || 'place',
      };
    });

    CACHE.set(key, places);
    return places;
  } catch {
    return [];
  }
}

/**
 * Reverse geocodes coordinates to street and city name
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ street: string; neighborhood: string; city: string; formatted: string }> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (REV_CACHE.has(key)) return REV_CACHE.get(key)!;

  // 1. Mapbox Reverse Geocoding
  try {
    const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${MAPBOX_TOKEN}&types=address,neighborhood,locality,place&language=fr`;
    const res = await fetch(mapboxUrl);
    if (res.ok) {
      const data = await res.json();
      const feat = data.features?.[0];
      if (feat) {
        const placeName = feat.place_name || feat.text || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        const cityName = feat.context?.find((c: any) => c.id.startsWith('place'))?.text || feat.text || '';
        const street = feat.properties?.address || feat.text || '';
        const neighborhood = feat.context?.find((c: any) => c.id.startsWith('neighborhood') || c.id.startsWith('locality'))?.text || '';

        const result = {
          street: street || 'Position repérée',
          neighborhood,
          city: cityName,
          formatted: placeName,
        };
        REV_CACHE.set(key, result);
        return result;
      }
    }
  } catch {}

  // 2. Nominatim Reverse Fallback
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(nomUrl, { headers: { 'User-Agent': 'SafetyApp/2.0' } });
    if (res.ok) {
      const data = await res.json();
      const address = data.address || {};
      const street = address.road || address.pedestrian || address.street || '';
      const hn = address.house_number ? `${address.house_number} ` : '';
      const suburb = address.suburb || address.neighbourhood || address.quarter || '';
      const city = address.city || address.town || address.village || '';

      const result = {
        street: street ? `${hn}${street}` : suburb || city || 'Position repérée',
        neighborhood: suburb,
        city,
        formatted: data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      };
      REV_CACHE.set(key, result);
      return result;
    }
  } catch {}

  return { street: 'Position GPS', neighborhood: '', city: '', formatted: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
}

export async function fetchStreetGeometry(
  _street: string,
  _lat: number,
  _lon: number,
  _radius_m = 600
): Promise<any | null> {
  return null;
}

const HISTORY_KEY = 'safety_search_history';

export function getSearchHistory(): GeocodedPlace[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveSearchToHistory(place: GeocodedPlace) {
  try {
    const history = getSearchHistory().filter((p) => p.placeId !== place.placeId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([place, ...history].slice(0, 8)));
  } catch {}
}

export function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
