#!/usr/bin/env python3
"""
🛡️ SAFETY - ALL 14 CATEGORIES SEED SCRIPT
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base, SessionLocal
from models import Incident, IncidentStatus, SeverityLevel, IncidentCategory

INCIDENTS_DATA = [
        {
            "category": IncidentCategory.danger,
            "title": "Chantier non sécurisé et trou béant",
            "description": "Travaux de voirie profonds sans barrières de protection.",
            "latitude": 48.8584,
            "longitude": 2.3470,
            "severity": SeverityLevel.high,
            "geometry_type": "point",
            "estimated_duration": "4 h",
            "address": "Rue de Rivoli",
            "city": "Paris",
            "confirmations_count": 5,
        },
        {
            "category": IncidentCategory.altercation,
            "title": "Rixe entre deux groupes",
            "description": "Altercation verbale et physique près de la sortie de métro.",
            "latitude": 48.8610,
            "longitude": 2.3530,
            "severity": SeverityLevel.critical,
            "geometry_type": "point",
            "estimated_duration": "45 min",
            "address": "Place du Châtelet",
            "city": "Paris",
            "confirmations_count": 8,
        },
        {
            "category": IncidentCategory.violence,
            "title": "Agression physique signalée",
            "description": "Individu violent ayant pris à partie des passants.",
            "latitude": 48.8635,
            "longitude": 2.3580,
            "severity": SeverityLevel.critical,
            "geometry_type": "point",
            "estimated_duration": "1 h",
            "address": "Rue Saint-Denis",
            "city": "Paris",
            "confirmations_count": 12,
        },
        {
            "category": IncidentCategory.avoid,
            "title": "Périmètre de tension nocturne",
            "description": "Zone à contourner suite à des tensions.",
            "latitude": 48.8670,
            "longitude": 2.3630,
            "severity": SeverityLevel.high,
            "geometry_type": "point",
            "estimated_duration": "6 h",
            "address": "Place de la République",
            "city": "Paris",
            "confirmations_count": 15,
        },
        {
            "category": IncidentCategory.hazard,
            "title": "Arbre couché et câbles au sol",
            "description": "Branche imposante obstruant totalement la circulation.",
            "latitude": 48.8710,
            "longitude": 2.3450,
            "severity": SeverityLevel.medium,
            "geometry_type": "street",
            "estimated_duration": "3 h",
            "address": "Rue la Fayette",
            "city": "Paris",
            "confirmations_count": 6,
            "geojson_geometry": json.dumps({
                "type": "LineString",
                "coordinates": [
                    [2.3420, 48.8700],
                    [2.3450, 48.8710],
                    [2.3490, 48.8725]
                ]
            })
        },
        {
            "category": IncidentCategory.accident,
            "title": "Collision véhicule - deux-roues",
            "description": "Accident matériel et corporel léger. Secours en route.",
            "latitude": 48.8738,
            "longitude": 2.2950,
            "severity": SeverityLevel.high,
            "geometry_type": "point",
            "estimated_duration": "1 h 30",
            "address": "Place Charles de Gaulle",
            "city": "Paris",
            "confirmations_count": 9,
        },
        {
            "category": IncidentCategory.lighting,
            "title": "Éclairage public totalement défaillant",
            "description": "Rue plongée dans le noir complet sur 400 mètres.",
            "latitude": 48.8530,
            "longitude": 2.3690,
            "severity": SeverityLevel.medium,
            "geometry_type": "street",
            "estimated_duration": "12 h",
            "address": "Rue de la Roquette",
            "city": "Paris",
            "confirmations_count": 7,
            "geojson_geometry": json.dumps({
                "type": "LineString",
                "coordinates": [
                    [2.3670, 48.8525],
                    [2.3690, 48.8530],
                    [2.3730, 48.8540]
                ]
            })
        },
        {
            "category": IncidentCategory.harassment,
            "title": "Harcèlement de rue répété",
            "description": "Groupe accostant agressivement les passantes.",
            "latitude": 48.8820,
            "longitude": 2.3430,
            "severity": SeverityLevel.high,
            "geometry_type": "point",
            "estimated_duration": "2 h",
            "address": "Boulevard de Rochechouart",
            "city": "Paris",
            "confirmations_count": 11,
        },
        {
            "category": IncidentCategory.burglary,
            "title": "Tentative d'effraction en cours",
            "description": "Porte d'immeuble forcée et individus suspects dans le hall.",
            "latitude": 48.8450,
            "longitude": 2.3270,
            "severity": SeverityLevel.high,
            "geometry_type": "point",
            "estimated_duration": "45 min",
            "address": "Rue de Rennes",
            "city": "Paris",
            "confirmations_count": 4,
        },
        {
            "category": IncidentCategory.fire,
            "title": "Incendie de local à poubelles et fumées",
            "description": "Flammes importantes menaçant la façade de l'immeuble. Pompiers alertés.",
            "latitude": 48.8910,
            "longitude": 2.3480,
            "severity": SeverityLevel.critical,
            "geometry_type": "point",
            "estimated_duration": "2 h",
            "address": "Rue Ordener",
            "city": "Paris",
            "confirmations_count": 18,
        },
        {
            "category": IncidentCategory.disaster,
            "title": "Inondation et refoulement d'égout",
            "description": "Chaussée submergée par 20 cm d'eau suite à rupture de canalisation.",
            "latitude": 48.8320,
            "longitude": 2.3550,
            "severity": SeverityLevel.medium,
            "geometry_type": "point",
            "estimated_duration": "5 h",
            "address": "Avenue d'Italie",
            "city": "Paris",
            "confirmations_count": 8,
        },
        {
            "category": IncidentCategory.police,
            "title": "Contrôle et sécurisation de secteur",
            "description": "Présence renforcée des forces de l'ordre pour patrouille préventive.",
            "latitude": 48.8770,
            "longitude": 2.3590,
            "severity": SeverityLevel.low,
            "geometry_type": "point",
            "estimated_duration": "3 h",
            "address": "Gare du Nord",
            "city": "Paris",
            "confirmations_count": 14,
        },
        {
            "category": IncidentCategory.medical,
            "title": "Malaise d'un passant sur la voie publique",
            "description": "Personne inconsciente au sol. Premiers secours prodigués par témoins.",
            "latitude": 48.8550,
            "longitude": 2.3480,
            "severity": SeverityLevel.critical,
            "geometry_type": "point",
            "estimated_duration": "30 min",
            "address": "Quai Saint-Michel",
            "city": "Paris",
            "confirmations_count": 6,
        },
        {
            "category": IncidentCategory.other,
            "title": "Nid-de-poule dangereux non signalé",
            "description": "Excavation de 15 cm de profondeur dans le virage dangereux pour les cyclistes.",
            "latitude": 48.8680,
            "longitude": 2.3780,
            "severity": SeverityLevel.medium,
            "geometry_type": "point",
            "estimated_duration": "24 h",
            "address": "Avenue de la République",
            "city": "Paris",
            "confirmations_count": 3,
        }
    ]

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    db.query(Incident).delete()
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    for item in INCIDENTS_DATA:
        data = dict(item)
        if "expires_at" not in data:
            data["expires_at"] = now + timedelta(days=7)
        db.add(Incident(**data))
    db.commit()
    print(f"Successfully seeded {len(INCIDENTS_DATA)} incidents across all 14 categories.")
    db.close()

def seed_database(db):
    """Seed into existing session if table is empty"""
    from datetime import datetime, timedelta
    try:
        if db.query(Incident).count() > 0:
            return
        now = datetime.utcnow()
        for item in INCIDENTS_DATA:
            data = dict(item)
            if "expires_at" not in data:
                data["expires_at"] = now + timedelta(days=7)
            db.add(Incident(**data))
        db.commit()
    except Exception as e:
        print(f"seed_database error: {e}")
        db.rollback()

if __name__ == "__main__":
    seed()
