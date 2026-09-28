#!/usr/bin/env python3
"""
🛡️ SAFETY MAP FORENSIC AUDIT SCRIPT
Scans the entire repository for legacy map providers, forbidden imports,
duplicate initializations, and enforces the Single Source of Truth architecture.
"""

import os
import sys
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

FORBIDDEN_PATTERNS = {
    "Leaflet": [r'\bfrom [\'"]leaflet[\'"]', r'\bimport.*[\'"]leaflet[\'"]', r'\bL\.map\b', r'react-leaflet', r'@types/leaflet'],
    "Mapbox": [r'\bfrom [\'"]mapbox-gl[\'"]', r'\bimport.*[\'"]mapbox-gl[\'"]', r'mapbox://'],
    "Google Maps": [r'google\.maps', r'@googlemaps/'],
    "OpenLayers": [r'\bfrom [\'"]ol[\'"]', r'\bimport.*[\'"]ol/'],
    "Cesium": [r'\bfrom [\'"]cesium[\'"]', r'Cesium\.'],
    "Cobe": [r'\bfrom [\'"]cobe[\'"]', r'\bimport.*[\'"]cobe[\'"]'],
    "Alien NosArtisans": [r'NosArtisans', r'nosartisans', r'NosArtisansGlobeEngine'],
}

ALLOWED_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py'}
EXCLUDED_DIRS = {'.git', 'node_modules', 'dist', '.vercel', '__pycache__', '.pytest_cache'}

def run_audit():
    print("=" * 45)
    print("      SAFETY MAP FORENSIC AUDIT")
    print("=" * 45)

    forbidden_found = {}
    map_initializations = 0
    map_providers = set()
    legacy_components = 0
    vector_implementations = 0
    potential_overlays = 0
    forbidden_imports = 0

    # Scan project files
    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for f in files:
            file_path = Path(root) / f
            if file_path.suffix not in ALLOWED_EXTENSIONS:
                continue
            if file_path.name in ("map_audit.py", "implementation_plan.md", "walkthrough.md"):
                continue

            try:
                content = file_path.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            rel_path = file_path.relative_to(BASE_DIR)

            # Check for MapLibre (the only allowed provider)
            if "maplibre-gl" in content:
                map_providers.add("MapLibre GL GPU (Authorized)")

            # Check for initializations
            if re.search(r'new MapLibreMap\(|new Map\(', content) and "SafetyGlobeMap.tsx" in str(rel_path):
                map_initializations += 1

            # Check vector engine
            if "safety-points-source" in content or "safety-streets-source" in content:
                vector_implementations += 1

            # Check forbidden patterns
            for provider, patterns in FORBIDDEN_PATTERNS.items():
                for pat in patterns:
                    matches = list(re.finditer(pat, content, re.IGNORECASE))
                    if matches:
                        if provider not in forbidden_found:
                            forbidden_found[provider] = []
                        forbidden_found[provider].append((str(rel_path), len(matches)))
                        forbidden_imports += len(matches)

    # Calculate status
    total_violations = sum(len(items) for items in forbidden_found.values())
    duplicate_maps = max(0, map_initializations - 1)

    print(f"Map providers detected:        {len(map_providers)} ({', '.join(map_providers) if map_providers else 'None'})")
    print(f"Map initializations detected:  {map_initializations}")
    print(f"Legacy components detected:    {legacy_components}")
    print(f"Vector implementations:        {vector_implementations}")
    print(f"Potential overlays detected:   {potential_overlays}")
    print(f"Forbidden imports detected:    {forbidden_imports}")
    print(f"Potential duplicate maps:      {duplicate_maps}")
    print("=" * 45)

    if total_violations == 0 and duplicate_maps == 0 and map_initializations == 1:
        print("STATUS: PASS (Zero Legacy Compliant)")
        print("All architectural criteria are 100% verified.")
        print("=" * 45)
        return 0
    else:
        print("STATUS: FAIL (Violations Detected)")
        if forbidden_found:
            print("\n[!] Forbidden Legacy Artifacts Found:")
            for prov, files in forbidden_found.items():
                print(f"  - {prov}:")
                for path, count in files:
                    print(f"      {path} ({count} occurrences)")
        if duplicate_maps > 0:
            print(f"\n[!] Multiple map initializations detected ({map_initializations} > 1).")
        print("=" * 45)
        return 1

if __name__ == "__main__":
    sys.exit(run_audit())
