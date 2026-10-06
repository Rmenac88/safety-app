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
  importance?: number;
}

/** Fields of a Nominatim search result used here */
interface NominatimSearchItem {
  place_id: number | string;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  importance?: number;
  address?: {
    road?: string; pedestrian?: string; street?: string;
    suburb?: string; neighbourhood?: string; quarter?: string;
    city?: string; town?: string; village?: string; municipality?: string;
    country?: string;
  };
}

const SEARCH_HISTORY_KEY = 'safety_search_history';
const CACHE = new Map<string, GeocodedPlace[]>();

/**
 * Searches places worldwide using OpenStreetMap Nominatim API
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<GeocodedPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const cacheKey = trimmed.toLowerCase();
  if (CACHE.has(cacheKey)) {
    return CACHE.get(cacheKey)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed
    )}&addressdetails=1&limit=6&accept-language=fr,en`;

    const res = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim error: ${res.statusText}`);
    }

    const data = await res.json();

    const places: GeocodedPlace[] = (data as NominatimSearchItem[]).map((item) => {
      const address = item.address || {};
      const street = address.road || address.pedestrian || address.street;
      const suburb = address.suburb || address.neighbourhood || address.quarter;
      const city = address.city || address.town || address.village || address.municipality;
      const country = address.country;

      const primaryName = item.name || street || suburb || city || item.display_name.split(',')[0];

      return {
        placeId: String(item.place_id),
        name: primaryName,
        displayName: item.display_name,
        streetName: street,
        neighborhood: suburb,
        city: city,
        country: country,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        type: item.type || 'place',
        importance: item.importance,
      };
    });

    CACHE.set(cacheKey, places);
    return places;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return [];
    }
    console.warn('Geocoding search failed, falling back to local matches:', err);
    return [];
  }
}

/**
 * Reverse geocodes coordinates to get exact street and city name
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<{ street: string; neighborhood: string; city: string; formatted: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=fr,en`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error('Reverse geocode failed');

    const data = await res.json();
    const address = data.address || {};
    const street = address.road || address.pedestrian || address.street || '';
    const houseNumber = address.house_number ? `${address.house_number} ` : '';
    const suburb = address.suburb || address.neighbourhood || address.quarter || '';
    const city = address.city || address.town || address.village || '';

    const formattedStreet = street ? `${houseNumber}${street}` : suburb || city || 'Position repérée';

    return {
      street: formattedStreet,
      neighborhood: suburb,
      city: city || address.country || '',
      formatted: data.display_name || 'Coordonnées GPS',
    };
  } catch {
    return {
      street: 'Position GPS',
      neighborhood: '',
      city: '',
      formatted: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    };
  }
}

/**
 * Search history storage
 */
export function getSearchHistory(): GeocodedPlace[] {
  try {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveSearchToHistory(place: GeocodedPlace) {
  try {
    const history = getSearchHistory().filter((p) => p.placeId !== place.placeId);
    const updated = [place, ...history].slice(0, 8);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save search history', e);
  }
}

export function clearSearchHistory() {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}
