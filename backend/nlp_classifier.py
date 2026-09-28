import re
from typing import Dict, Any, List, Optional

# Keywords and weights for category detection
CATEGORY_RULES: Dict[str, Dict[str, Any]] = {
    "altercation": {
        "keywords": [
            "bagarre", "se battent", "batte", "rixe", "dispute", "altercation", "agression",
            "tension", "embrouille", "coup", "coups", "bagarrent", "frapper", "frappe",
            "violence verbale", "insulte", "insultes", "conflit", "bagarreurs"
        ],
        "default_severity": "medium",
        "geometry_type": "street",  # Street segment affected
        "default_duration": "2 h",
        "title_template": "Altercation signalée"
    },
    "lighting": {
        "keywords": [
            "eclairage", "éclairage", "lampadaire", "lampadaires", "dans le noir", "sombre",
            "obscurité", "obscurite", "lumiere", "lumière", "éteint", "eteint", "eteints",
            "éteints", "ampoule", "ampoules", "non eclaire", "non éclairé", "noir total",
            "visibilite nulle", "visibilité nulle"
        ],
        "default_severity": "low",
        "geometry_type": "street",  # Street segment affected
        "default_duration": "12 h",
        "title_template": "Éclairage défaillant"
    },
    "accident": {
        "keywords": [
            "accident", "collision", "crash", "voiture", "vehicule", "véhicule", "moto",
            "scooter", "pieton", "piéton", "renverse", "renversé", "accrochage",
            "tonneaux", "blessé", "blesse", "blesses", "blessés", "carambolage"
        ],
        "default_severity": "high",
        "geometry_type": "point",  # Precise point on map!
        "default_duration": "2 h",
        "title_template": "Accident de la circulation"
    },
    "harassment": {
        "keywords": [
            "harcelement", "harcèlement", "suivi", "suivre", "m'a suivi", "m'a suivie",
            "siffle", "sifflé", "drague lourde", "intrusif", "comportement suspect",
            "m'observe", "m'interpelle", "agressif", "menaçant", "menacant", "rôde", "rode"
        ],
        "default_severity": "high",
        "geometry_type": "street",  # Street segment
        "default_duration": "2 h",
        "title_template": "Harcèlement / Comportement suspect"
    },
    "danger": {
        "keywords": [
            "danger", "agression", "menace", "arme", "couteau", "pistolet", "braquage",
            "attaque", "attaqué", "voleur", "danger imminent", "fuyez", "attention"
        ],
        "default_severity": "critical",
        "geometry_type": "street",
        "default_duration": "2 h",
        "title_template": "Danger immédiat signalé"
    },
    "hazard": {
        "keywords": [
            "trou", "chaussee", "chaussée", "nid de poule", "obstacle", "branche",
            "travaux", "barriere", "barrière", "cable", "câble", "verglas", "glissant",
            "huile", "debris", "débris", "panneau tombe", "panneau tombé"
        ],
        "default_severity": "medium",
        "geometry_type": "point",
        "default_duration": "12 h",
        "title_template": "Obstacle / Danger sur la voie"
    },
    "fire": {
        "keywords": [
            "feu", "incendie", "fumee", "fumée", "flammes", "brûle", "brule", "poubelle en feu",
            "voiture en feu", "odeur de brulé", "explosion", "pompier", "pompiers"
        ],
        "default_severity": "critical",
        "geometry_type": "point",
        "default_duration": "2 h",
        "title_template": "Incendie / Fumée"
    },
    "police": {
        "keywords": [
            "police", "gendarmerie", "crs", "controle", "contrôle", "barrage", "patrouille",
            "intervention police", "sirène", "sirene", "bac", "fouille"
        ],
        "default_severity": "low",
        "geometry_type": "point",
        "default_duration": "2 h",
        "title_template": "Intervention forces de l'ordre"
    },
    "medical": {
        "keywords": [
            "secours", "samu", "ambulance", "malaise", "inconscient", "inconsciente",
            "premiers secours", "chute", "urgence medicale", "urgence médicale"
        ],
        "default_severity": "high",
        "geometry_type": "point",
        "default_duration": "2 h",
        "title_template": "Urgence médicale / Secours"
    },
    "burglary": {
        "keywords": [
            "cambriolage", "vol", "voleur", "effraction", "vitre cassee", "vitre cassée",
            "porte forcee", "porte forcée", "intrusion", "vol a l'arrache", "vol à l'arraché"
        ],
        "default_severity": "medium",
        "geometry_type": "point",
        "default_duration": "24 h",
        "title_template": "Vol / Effraction signalée"
    }
}

# Critical keywords that escalate severity
CRITICAL_WORDS = ["couteau", "arme", "sang", "mort", "urgence", "inconscient", "flammes", "explosion", "grave"]
HIGH_WORDS = ["agressif", "menace", "blesse", "blessé", "violent", "frapper", "suivi", "collision"]

def classify_text_incident(text: str) -> Dict[str, Any]:
    """
    Intelligent NLP classifier for natural language safety incident reports.
    Extracts category, severity, geometry_type, title, duration, and confidence.
    """
    cleaned = text.lower().strip()
    
    if not cleaned:
        return {
            "category": "other",
            "title": "Signalement citoyen",
            "severity": "low",
            "geometry_type": "point",
            "estimated_duration": "2 h",
            "confidence": 0.0,
            "detected_keywords": []
        }

    scores: Dict[str, float] = {}
    detected_kw: Dict[str, List[str]] = {}

    for cat, rules in CATEGORY_RULES.items():
        score = 0.0
        kw_found = []
        for kw in rules["keywords"]:
            # Word boundary matching or phrase containment
            if re.search(r'\b' + re.escape(kw) + r'\b', cleaned, re.IGNORECASE) or kw in cleaned:
                score += len(kw.split()) * 1.5 + 1.0
                kw_found.append(kw)
        if score > 0:
            scores[cat] = score
            detected_kw[cat] = kw_found

    if not scores:
        # Default fallback
        return {
            "category": "other",
            "title": (text[:40] + '…') if len(text) > 40 else text,
            "severity": "medium",
            "geometry_type": "point",
            "estimated_duration": "2 h",
            "confidence": 0.3,
            "detected_keywords": []
        }

    # Best matching category
    best_cat = max(scores.items(), key=lambda x: x[1])[0]
    best_rules = CATEGORY_RULES[best_cat]

    # Calculate severity based on context words
    severity = best_rules["default_severity"]
    if any(cw in cleaned for cw in CRITICAL_WORDS):
        severity = "critical"
    elif any(hw in cleaned for hw in HIGH_WORDS) and severity in ("low", "medium"):
        severity = "high"

    # Suggested concise title
    title = best_rules["title_template"]

    return {
        "category": best_cat,
        "title": title,
        "severity": severity,
        "geometry_type": best_rules["geometry_type"],
        "estimated_duration": best_rules["default_duration"],
        "confidence": min(1.0, scores[best_cat] / 4.0),
        "detected_keywords": detected_kw.get(best_cat, [])
    }
