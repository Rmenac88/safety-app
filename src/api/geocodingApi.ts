import { API_BASE } from './client';

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

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeocodedPlace[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 2) return [];
  if (CACHE.has(key)) return CACHE.get(key)!;

  try {
    const res = await fetch(`${API_BASE}/geocode/search?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    const places: GeocodedPlace[] = data.map((item: any) => {
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

export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ street: string; neighborhood: string; city: string; formatted: string }> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (REV_CACHE.has(key)) return REV_CACHE.get(key)!;

  try {
    const res = await fetch(`${API_BASE}/geocode/reverse?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error();
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
  } catch {
    return { street: 'Position GPS', neighborhood: '', city: '', formatted: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
  }
}

const GEO_STREET_CACHE = new Map<string, any>();

export async function fetchStreetGeometry(
  street: string,
  lat: number,
  lon: number,
  radius_m = 600
): Promise<any | null> {
  const key = `${street.toLowerCase()}:${lat.toFixed(3)}:${lon.toFixed(3)}`;
  if (GEO_STREET_CACHE.has(key)) return GEO_STREET_CACHE.get(key);

  try {
    const res = await fetch(
      `${API_BASE}/geocode/street-geometry?street=${encodeURIComponent(street)}&lat=${lat}&lon=${lon}&radius_m=${radius_m}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    GEO_STREET_CACHE.set(key, data);
    return data;
  } catch {
    return null;
  }
}

const HISTORY_KEY = 'safety_search_history';

export function getSearchHistory(): GeocodedPlace[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

export function saveSearchToHistory(place: GeocodedPlace) {
  try {
    const history = getSearchHistory().filter(p => p.placeId !== place.placeId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([place, ...history].slice(0, 8)));
  } catch {}
}

export function clearSearchHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
