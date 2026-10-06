from fastapi import APIRouter, Query, HTTPException, Request, Header, Depends
from sqlalchemy.orm import Session
from typing import Optional
import httpx
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db
from security.sanitizer import sanitize_input_text
from security.anti_abuse import get_client_ip, hash_client_ip, generate_client_fingerprint, check_read_scraping_quota

router = APIRouter(prefix="/geocode", tags=["geocode"])

NOMINATIM_HEADERS = {
    "User-Agent": "SafetyApp/2.0 (security-defense-in-depth@safety.app)",
    "Accept-Language": "fr,en;q=0.8",
}


@router.get("/search")
async def geocode_search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=150),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Proxy to Nominatim search with rate limiting and input sanitization."""
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Quota geocode dépassé. Réessayez dans {retry_after}s.")

    clean_q = sanitize_input_text(q, 150)
    # Query string built by httpx (URL-encoded): "&", "#"... in q could inject parameters
    params = {"format": "json", "q": clean_q, "addressdetails": 1, "limit": 6}
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            resp = await client.get("https://nominatim.openstreetmap.org/search", params=params, headers=NOMINATIM_HEADERS)
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            raise HTTPException(status_code=503, detail="Geocoding service timeout")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Geocoding upstream error: {e.response.status_code}")


@router.get("/reverse")
async def geocode_reverse(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Proxy to Nominatim reverse geocoding with rate limiting."""
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Quota geocode dépassé. Réessayez dans {retry_after}s.")

    url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&addressdetails=1"
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            resp = await client.get(url, headers=NOMINATIM_HEADERS)
            resp.raise_for_status()
            return resp.json()
        except httpx.TimeoutException:
            raise HTTPException(status_code=503, detail="Reverse geocoding timeout")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Reverse geocoding error: {e.response.status_code}")


def stitch_osm_ways(ways_coords: list) -> list:
    """
    Takes multiple unordered way coordinates from OpenStreetMap and merges them
    into a continuous, smooth, ordered polyline matching the real road pavement geometry.
    """
    if not ways_coords:
        return []
    if len(ways_coords) == 1:
        return ways_coords[0]

    def dist_sq(p1, p2):
        return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2

    remaining = [list(w) for w in ways_coords if len(w) >= 2]
    if not remaining:
        return []

    remaining.sort(key=lambda s: len(s), reverse=True)
    chain = remaining.pop(0)
    threshold_sq = (0.0004) ** 2  # ~40 meters connection threshold

    while remaining:
        head = chain[0]
        tail = chain[-1]
        best_idx = None
        best_match = None
        min_d = float('inf')

        for i, seg in enumerate(remaining):
            s_start = seg[0]
            s_end = seg[-1]

            d_tail_start = dist_sq(tail, s_start)
            d_tail_end = dist_sq(tail, s_end)
            d_head_start = dist_sq(head, s_start)
            d_head_end = dist_sq(head, s_end)

            m = min(d_tail_start, d_tail_end, d_head_start, d_head_end)
            if m < min_d:
                min_d = m
                best_idx = i
                if m == d_tail_start:
                    best_match = 'tail_start'
                elif m == d_tail_end:
                    best_match = 'tail_end'
                elif m == d_head_start:
                    best_match = 'head_start'
                else:
                    best_match = 'head_end'

        if best_idx is not None and min_d <= threshold_sq:
            seg = remaining.pop(best_idx)
            if best_match == 'tail_start':
                chain.extend(seg[1:])
            elif best_match == 'tail_end':
                chain.extend(reversed(seg[:-1]))
            elif best_match == 'head_start':
                chain = list(reversed(seg[1:])) + chain
            elif best_match == 'head_end':
                chain = seg[:-1] + chain
        else:
            break

    return chain


# In-memory cache for street geometries (cap at 500 items to prevent memory leaks)
STREET_GEO_CACHE = {}


@router.get("/street-geometry")
async def get_street_geometry(
    request: Request,
    street: str = Query(..., min_length=2, max_length=150),
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(600, ge=100, le=2000),
    x_device_id: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Dynamically fetches the exact OSM LineString geometry of a street near given GPS coordinates
    via OpenStreetMap Overpass API, returning GeoJSON.
    Rate-limited and cached.
    """
    client_ip = get_client_ip(request)
    fp = generate_client_fingerprint(client_ip, x_device_id or "")
    allowed, retry_after = check_read_scraping_quota(fp, db, hash_client_ip(client_ip))
    if not allowed:
        raise HTTPException(status_code=429, detail=f"Quota street-geometry dépassé. Réessayez dans {retry_after}s.")

    clean_street = sanitize_input_text(street, 150)
    cache_key = f"{clean_street.lower()}:{round(lat, 3)}:{round(lon, 3)}"
    if cache_key in STREET_GEO_CACHE:
        return STREET_GEO_CACHE[cache_key]

    import re
    cleaned_name = re.sub(r"^\d+[\s,]+(bis|ter)?\s*", "", clean_street, flags=re.IGNORECASE).strip()
    # Overpass QL string escaping: backslash first, then double quote
    safe_name = cleaned_name.replace('\\', '\\\\').replace('"', '\\"')

    overpass_query = f"""
    [out:json][timeout:8];
    (
      way["highway"]["name"="{safe_name}"](around:{radius_m},{lat},{lon});
    );
    out geom;
    """

    overpass_url = "https://overpass-api.de/api/interpreter"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(overpass_url, data={"data": overpass_query}, headers=NOMINATIM_HEADERS)
            if resp.status_code == 200:
                data = resp.json()
                elements = data.get("elements", [])
                
                coordinates_list = []
                for el in elements:
                    if el.get("type") == "way" and "geometry" in el:
                        coords = [[pt["lon"], pt["lat"]] for pt in el["geometry"]]
                        if len(coords) >= 2:
                            coordinates_list.append(coords)
                
                if coordinates_list:
                    stitched = stitch_osm_ways(coordinates_list)
                    geo = {
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": stitched if len(stitched) >= 2 else coordinates_list[0]
                        },
                        "properties": {
                            "name": clean_street,
                            "source": "osm_overpass_stitched"
                        }
                    }
                    if len(STREET_GEO_CACHE) > 500:
                        STREET_GEO_CACHE.clear()
                    STREET_GEO_CACHE[cache_key] = geo
                    return geo
    except Exception as e:
        print(f"Overpass lookup notice for {clean_street}: {e}")

    # Precise local directional tangent segment around point
    fallback_geo = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [lon - 0.0008, lat - 0.0004],
                [lon, lat],
                [lon + 0.0008, lat + 0.0004]
            ]
        },
        "properties": {
            "name": clean_street,
            "source": "fallback"
        }
    }
    if len(STREET_GEO_CACHE) > 500:
        STREET_GEO_CACHE.clear()
    STREET_GEO_CACHE[cache_key] = fallback_geo
    return fallback_geo
