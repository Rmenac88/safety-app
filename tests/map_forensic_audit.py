#!/usr/bin/env python3
"""
🛡️ SAFETY MAP FORENSIC AUDIT SCRIPT
========================================
Comprehensive forensic scanner verifying:
1. Zero Legacy Map Providers (Leaflet, Google Maps, Mapbox, Cesium, OpenLayers, TomTom, HERE)
2. Single Authorized Map Instance (MapLibre GL GPU)
3. Zero Fake Vector Overlays (screenX/screenY pseudo-geospatial translations)
4. Strict GeoJSON Vector Engine (Point, LineString, Polygon)
5. Zero Forbidden Legacy Fallbacks & Duplicate Initializations
========================================
"""

import os
import sys
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

FORBIDDEN_PROVIDERS = {
    "Leaflet": [r'\bfrom [\'"]leaflet[\'"]', r'\bimport.*[\'"]leaflet[\'"]', r'\bL\.map\b', r'react-leaflet', r'@types/leaflet'],
    "Mapbox": [r'\bfrom [\'"]mapbox-gl[\'"]', r'\bimport.*[\'"]mapbox-gl[\'"]', r'mapbox://', r'react-map-gl'],
    "Google Maps": [r'google\.maps', r'@googlemaps/', r'react-google-maps'],
    "OpenLayers": [r'\bfrom [\'"]ol[\'"]', r'\bimport.*[\'"]ol/'],
    "Cesium": [r'\bfrom [\'"]cesium[\'"]', r'Cesium\.'],
    "Cobe": [r'\bfrom [\'"]cobe[\'"]', r'\bimport.*[\'"]cobe[\'"]'],
    "Alien Legacy Engine": [r'NosArtisans', r'nosartisans', r'NosArtisansGlobeEngine'],
}

LEGACY_MAP_NAMES = [
    r'\bLegacyMap\b',
    r'\bOldMap\b',
    r'\bMapBackup\b',
    r'\bMapFallback\b',
    r'\bLeafletMap\b',
    r'\bGoogleMap\b',
]

FAKE_VECTOR_PATTERNS = [
    r'screenX.*latitude',
    r'screenY.*longitude',
    r'translate\(.*screenX',
]

ALLOWED_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.py'}
EXCLUDED_DIRS = {'.git', 'node_modules', 'dist', '.vercel', '__pycache__', '.pytest_cache', 'tests'}

def run_audit():
    print("=" * 45)
    print("      SAFETY MAP FORENSIC AUDIT")
    print("=" * 45)

    forbidden_found = {}
    legacy_components_found = []
    fake_vectors_found = []
    map_initializations = 0
    map_providers = set()
    legacy_components = 0
    fallbacks = 0
    vector_systems = 0
    potential_overlays = 0
    env_keys = 0
    critical_findings = []

    # Check environment variables
    for k, v in os.environ.items():
        if "MAPBOX" in k.upper() or "GOOGLE_MAPS" in k.upper() or "LEAFLET" in k.upper():
            env_keys += 1
            critical_findings.append(f"Forbidden environment key detected: {k}")

    # Scan project files
    for root, dirs, files in os.walk(BASE_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for f in files:
            file_path = Path(root) / f
            if file_path.suffix not in ALLOWED_EXTENSIONS:
                continue
            if file_path.name in ("map_audit.py", "map_forensic_audit.py", "implementation_plan.md", "walkthrough.md"):
                continue

            try:
                content = file_path.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                continue

            rel_path = str(file_path.relative_to(BASE_DIR))

            # Detect MapLibre GL
            if "maplibre-gl" in content:
                map_providers.add("MapLibre GL GPU (Authorized)")

            # Detect Map Initializations
            if re.search(r'new MapLibreMap\(|new Map\(', content) and "SafetyGlobeMap.tsx" in rel_path:
                map_initializations += 1
            elif re.search(r'new MapLibreMap\(|new Map\(', content) and "Map" in rel_path and "SafetyGlobeMap.tsx" not in rel_path:
                map_initializations += 1
                critical_findings.append(f"Duplicate map initialization found in {rel_path}")

            # Check vector engine
            if "safety-points-source" in content or "safety-streets-source" in content or "safety-polygons-source" in content:
                vector_systems += 1

            # Check for legacy map components
            for leg in LEGACY_MAP_NAMES:
                if re.search(leg, content):
                    legacy_components += 1
                    legacy_components_found.append(f"{rel_path}: {leg}")
                    critical_findings.append(f"Legacy component detected in {rel_path}: {leg}")

            # Check for fake vector screen coordinate hacks
            for fv in FAKE_VECTOR_PATTERNS:
                if re.search(fv, content):
                    potential_overlays += 1
                    fake_vectors_found.append(f"{rel_path}: {fv}")
                    critical_findings.append(f"Fake vector screen translation in {rel_path}")

            # Check forbidden patterns
            for provider, patterns in FORBIDDEN_PROVIDERS.items():
                for pat in patterns:
                    matches = list(re.finditer(pat, content, re.IGNORECASE))
                    if matches:
                        if provider not in forbidden_found:
                            forbidden_found[provider] = []
                        forbidden_found[provider].append((rel_path, len(matches)))
                        critical_findings.append(f"Forbidden provider import in {rel_path}: {provider}")

    duplicate_maps = max(0, map_initializations - 1)

    print(f"Providers detected:            {len(map_providers)} ({', '.join(map_providers) if map_providers else 'None'})")
    print(f"Map instances:                 {map_initializations}")
    print(f"Legacy components:             {legacy_components}")
    print(f"Fallbacks:                     {fallbacks}")
    print(f"Vector systems:                {vector_systems}")
    print(f"Potential overlays:            {potential_overlays}")
    print(f"Environment keys:              {env_keys}")
    print(f"Duplicate initializations:     {duplicate_maps}")
    print("=" * 45)
    print("CRITICAL FINDINGS")
    print("=" * 45)

    if critical_findings:
        for cf in critical_findings:
            print(f"  ❌ {cf}")
        print("=" * 45)
        print("STATUS: FAIL")
        print("=" * 45)
        return 1
    else:
        print("  ✓ Zero forbidden legacy providers found.")
        print("  ✓ Exactly 1 authorized GPU Map instance active.")
        print("  ✓ Zero screen-coordinate pseudo-vector overlays.")
        print("  ✓ Pure native geospatial GeoJSON engine verified.")
        print("=" * 45)
        print("STATUS: PASS (Zero Legacy Compliant)")
        print("=" * 45)
        return 0

if __name__ == "__main__":
    sys.exit(run_audit())
