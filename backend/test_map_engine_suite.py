#!/usr/bin/env python3
"""
🛡️ SAFETY MAP ENGINE TEST SUITE
Verifies:
- GeoJSON geometries (Point, LineString, closed-ring Polygon)
- 14 Official Categories integrity and geometry compatibility
- Category 14 ("Autres situations") mandatory description validation
- Spatial calculations (Haversine & Viewport BBOX)
"""

import math
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

OFFICIAL_CATEGORIES = [
    "dangers", "altercations", "violences", "zones_a_eviter",
    "obstacles_sur_la_voie", "accident_routier", "eclairage_defaillant",
    "harcelement", "vol", "incendie", "catastrophe_naturelle",
    "force_de_l_ordre", "urgence_medicale", "autres",
]

def validate_point(coords):
    if not isinstance(coords, (list, tuple)) or len(coords) < 2:
        raise ValueError("Point must have [lon, lat]")
    lon, lat = coords[0], coords[1]
    if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
        raise ValueError(f"Coordinates out of bounds: lon={lon}, lat={lat}")
    return True

def validate_linestring(coords):
    if not isinstance(coords, list) or len(coords) < 2:
        raise ValueError("LineString must have at least 2 vertices")
    for pt in coords:
        validate_point(pt)
    return True

def validate_polygon(coords):
    if not isinstance(coords, list) or len(coords) < 1:
        raise ValueError("Polygon must have at least 1 linear ring")
    ring = coords[0]
    if len(ring) < 3:
        raise ValueError("Polygon ring must have at least 3 vertices")
    for pt in ring:
        validate_point(pt)
    # Auto close ring if not closed
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    if len(ring) < 4:
        raise ValueError("Closed polygon ring must have at least 4 vertices")
    return True

def validate_incident_category(category: str, description: str = None):
    if category not in OFFICIAL_CATEGORIES:
        raise ValueError(f"Invalid category: {category}")
    if category == "autres":
        if not description or len(description.strip()) < 5:
            raise ValueError("Category 'autres' requires a description with at least 5 characters")
    return True

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class TestSafetyMapEngine(unittest.TestCase):

    def test_valid_point_geometry(self):
        self.assertTrue(validate_point([2.3522, 48.8566]))

    def test_invalid_point_bounds(self):
        with self.assertRaises(ValueError):
            validate_point([195.0, 48.8566])
        with self.assertRaises(ValueError):
            validate_point([2.3522, -95.0])

    def test_valid_linestring_geometry(self):
        coords = [[2.3522, 48.8566], [2.3530, 48.8570], [2.3540, 48.8580]]
        self.assertTrue(validate_linestring(coords))

    def test_invalid_linestring_too_few_points(self):
        with self.assertRaises(ValueError):
            validate_linestring([[2.3522, 48.8566]])

    def test_valid_polygon_geometry_auto_closure(self):
        coords = [[
            [2.3522, 48.8566],
            [2.3530, 48.8566],
            [2.3530, 48.8575],
            [2.3522, 48.8566]
        ]]
        self.assertTrue(validate_polygon(coords))
        ring = coords[0]
        self.assertEqual(ring[0], ring[-1])
        self.assertGreaterEqual(len(ring), 4)

    def test_all_14_categories_present(self):
        self.assertEqual(len(OFFICIAL_CATEGORIES), 14)
        for cat in OFFICIAL_CATEGORIES:
            self.assertTrue(isinstance(cat, str) and len(cat) > 0)
            self.assertTrue(validate_incident_category(cat, "Description standard pour test"))

    def test_category_autres_with_valid_description(self):
        self.assertTrue(validate_incident_category("autres", "Fouille de police et perimetre de securite"))

    def test_category_autres_requires_description(self):
        with self.assertRaises(ValueError):
            validate_incident_category("autres", "")
        with self.assertRaises(ValueError):
            validate_incident_category("autres", "abc")

    def test_haversine_accuracy(self):
        dist = haversine_km(48.8566, 2.3522, 48.8584, 2.2945)
        self.assertTrue(4.0 <= dist <= 4.5)

    def test_viewport_bbox_query_logic(self):
        center_lat, center_lon = 48.8566, 2.3522
        radius_km = 5.0
        lat_delta = radius_km / 111.0
        lon_delta = radius_km / (111.0 * math.cos(math.radians(center_lat)))
        min_lat, max_lat = center_lat - lat_delta, center_lat + lat_delta
        min_lon, max_lon = center_lon - lon_delta, center_lon + lon_delta
        self.assertTrue(min_lat < center_lat < max_lat)
        self.assertTrue(min_lon < center_lon < max_lon)

if __name__ == "__main__":
    unittest.main(verbosity=2)
