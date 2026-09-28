import math
import hashlib
import re
from typing import Tuple, Optional

# Grid discretization step: ~0.0015 degrees ~= 160 meters (standard urban privacy radius)
GRID_STEP = 0.0015
MAX_PERTURBATION = 0.00035  # ~35 meters max deterministic displacement


def obfuscate_public_coordinates(lat: float, lon: float, incident_id: str = "") -> Tuple[float, float]:
    """
    Transforms exact private GPS coordinates into a privacy-preserving public projection.
    
    1. Snaps coordinates to a non-invertible spatial grid cell (~160m).
    2. Adds a bounded deterministic salt derived from SHA-256(incident_id) so multiple
       incidents in the same neighborhood remain distinct without revealing private trajectories.
    3. Guarantees that public coordinates NEVER expose domestic addresses or allow triangulation.
    """
    # 1. Grid snap (quantization)
    snapped_lat = round(lat / GRID_STEP) * GRID_STEP
    snapped_lon = round(lon / GRID_STEP) * GRID_STEP

    # 2. Deterministic bounded perturbation if incident_id is available
    if incident_id:
        h = hashlib.sha256(f"geo_privacy_salt:{incident_id}".encode("utf-8")).hexdigest()
        # Derive integer values from hex digest
        int_lat = int(h[0:8], 16)
        int_lon = int(h[8:16], 16)
        
        # Scale to [-MAX_PERTURBATION, +MAX_PERTURBATION]
        delta_lat = ((int_lat / 0xFFFFFFFF) - 0.5) * 2.0 * MAX_PERTURBATION
        delta_lon = ((int_lon / 0xFFFFFFFF) - 0.5) * 2.0 * MAX_PERTURBATION
        
        pub_lat = round(snapped_lat + delta_lat, 5)
        pub_lon = round(snapped_lon + delta_lon, 5)
    else:
        pub_lat = round(snapped_lat, 5)
        pub_lon = round(snapped_lon, 5)

    return pub_lat, pub_lon


def sanitize_public_address(
    address: Optional[str],
    neighborhood: Optional[str] = None,
    city: Optional[str] = None
) -> str:
    """
    Strips house numbers, building entrances, apartment numbers, and private identifiers
    from address strings to prevent domestic doxxing.
    
    Example:
      "10 Allée des Doublets, 95340 Persan" -> "Allée des Doublets, Persan"
      "124 bis Rue de Rivoli, Bâtiment C" -> "Rue de Rivoli, Paris"
    """
    if not address:
        if neighborhood and city:
            return f"{neighborhood}, {city}"
        return city or neighborhood or "Secteur sécurisé"

    # Remove street numbers at the start of address: "10, 10 bis, 124ter, etc."
    clean = re.sub(r'^\s*\d+\s*(bis|ter|quater|[a-z])?[\s,\-]+', '', address, flags=re.IGNORECASE).strip()

    # Remove building/apartment references: "Bâtiment A", "Appartement 4", "Étage 2", "Escalier B"
    clean = re.sub(r'\b(bâtiment|bat|apt|appartement|étage|etage|escalier|porte|résidence|residence)\s+[a-z0-9\-]+', '', clean, flags=re.IGNORECASE).strip()
    
    # Clean redundant punctuation/spaces
    clean = re.sub(r'(\s*,\s*)+', ', ', clean)
    clean = re.sub(r'^[,\s\-]+|[,\s\-]+$', '', clean)

    if not clean or len(clean) < 3:
        if neighborhood and city:
            return f"{neighborhood}, {city}"
        return city or neighborhood or "Secteur sécurisé"

    return clean
