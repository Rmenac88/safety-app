"""
Sonde d'audit de sécurité (non destructive, base SQLite temporaire).
Chaque test affiche PASS / FAIL avec la preuve observée ; code de sortie 1 si un test échoue.

    python3 tests/test_security_audit.py
"""
import os, sys, json, tempfile, threading, math
_DB = tempfile.mkdtemp(prefix="safety-audit-")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}/audit.db"
os.environ.setdefault("SECURITY_SECRET_KEY", "a" * 64)
os.environ.setdefault("ADMIN_API_KEY", "b" * 32)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
from models import Incident, RateLimitHit
from security import anti_abuse

API = "/api/v1"
results = []

def record(test_id, label, ok, evidence):
    results.append((test_id, label, ok, evidence))
    print(f"{test_id} {'PASS' if ok else 'FAIL'} — {label}\n      preuve: {evidence}")

def reset_limits():
    for b in (anti_abuse._CREATION_BUCKETS, anti_abuse._VOTE_BUCKETS, anti_abuse._READ_BUCKETS, anti_abuse._VOTE_IP_BUCKETS):
        b.clear()
    with SessionLocal() as db:
        db.query(RateLimitHit).delete(); db.commit()

EXACT = (48.856613, 2.352222)  # "domicile" du déclarant

def report(**kw):
    body = {"category": "danger", "title": "Individu suspect", "description": "Individu suspect devant l'immeuble",
            "latitude": EXACT[0], "longitude": EXACT[1], "address": "12 rue de Rivoli", "city": "Paris",
            "estimated_duration": "2 h"}
    body.update(kw)
    return body

with TestClient(app, raise_server_exceptions=False) as c:
    # ── Confidentialité des coordonnées ────────────────────────────────────
    reset_limits()
    point = json.dumps({"type": "Point", "coordinates": [EXACT[1], EXACT[0]]})
    r = c.post(f"{API}/incidents", json=report(geojson_geometry=point, geometry_type="Point"), headers={"X-Device-Id": "victim"})
    inc = r.json(); inc_id = inc["id"]
    pub = (inc["latitude"], inc["longitude"])
    leaked = json.loads(inc["geojson_geometry"])["coordinates"] if inc.get("geojson_geometry") else None
    record("PRIV-001", "Les coordonnées exactes ne sortent jamais dans la réponse publique",
           not (leaked and abs(leaked[1] - EXACT[0]) < 1e-6 and abs(leaked[0] - EXACT[1]) < 1e-6),
           f"lat/lon publiques={pub} mais geojson_geometry={leaked} (exact={EXACT})")

    # Oracle bbox : recherche dichotomique sur la latitude exacte
    reset_limits()
    lo, hi = EXACT[0] - 0.01, EXACT[0] + 0.01
    for _ in range(25):
        mid = (lo + hi) / 2
        res = c.get(f"{API}/incidents", params={"bbox": f"{EXACT[1]-0.01},{lo},{EXACT[1]+0.01},{mid}"}).json()
        if any(i["id"] == inc_id for i in res["incidents"]): hi = mid
        else: lo = mid
    record("PRIV-002", "Le filtre bbox ne révèle rien de plus que la position publique déjà affichée",
           abs(hi - pub[0]) < 1e-5 and abs(hi - EXACT[0]) > 1e-5,
           f"latitude retrouvée={hi:.6f} ; publique={pub[0]} ; exacte={EXACT[0]}")

    # Oracle /score : rayon 50 m sur les coordonnées exactes
    reset_limits()
    near = c.get(f"{API}/score", params={"lat": EXACT[0], "lon": EXACT[1], "radius_m": 50}).json()["incident_count"]
    off = c.get(f"{API}/score", params={"lat": pub[0], "lon": pub[1], "radius_m": 50}).json()["incident_count"]
    record("PRIV-003", "/score ne révèle pas la position exacte à 50 m près",
           not (near == 1 and off == 0), f"rayon 50 m: autour de l'exact={near}, autour du public={off}")

    # ── Abus / rate limiting ────────────────────────────────────────────────
    reset_limits()
    codes = [c.post(f"{API}/incidents", json=report(title=f"Spam {i}"), headers={"X-Device-Id": f"bot-{i}"}).status_code for i in range(30)]
    record("ABUSE-001", "Rotation de X-Device-Id plafonnée par IP (20 créations / 10 min)",
           codes.count(201) <= 20, f"{codes.count(201)} créations acceptées sur 30 depuis la même IP")

    reset_limits()
    codes = [c.get(f"{API}/incidents", headers={"X-Device-Id": f"scraper-{i}"}).status_code for i in range(620)]
    record("ABUSE-002", "Rotation de X-Device-Id ne contourne pas l'anti-scraping (plafond IP 600/min)",
           429 in codes, f"{codes.count(200)} lectures OK sur 620")

    # ── CORS ───────────────────────────────────────────────────────────────
    r = c.options(f"{API}/incidents/{inc_id}/vote", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-device-id"})
    acao = r.headers.get("access-control-allow-origin")
    record("CORS-001", "Une origine tierce ne peut pas appeler l'API d'écriture depuis le navigateur d'un visiteur",
           acao not in ("*", "https://evil.example"), f"preflight → {r.status_code}, Allow-Origin={acao}, Allow-Credentials={r.headers.get('access-control-allow-credentials')}")

    # ── Validation des entrées ─────────────────────────────────────────────
    reset_limits()
    weird = json.dumps({"type": "GeometryCollection", "coordinates": "x" * 50000})
    r = c.post(f"{API}/incidents", json=report(geojson_geometry=weird), headers={"X-Device-Id": "v1"})
    record("INPUT-001", "geojson_geometry n'accepte que Point/LineString/Polygon", r.status_code == 422, f"type inconnu → HTTP {r.status_code}")
    reset_limits()
    bad = json.dumps({"type": "LineString", "coordinates": [["a", "b"], ["c", "d"]]})
    r = c.post(f"{API}/incidents", json=report(geojson_geometry=bad), headers={"X-Device-Id": "v2"})
    record("INPUT-002", "Coordonnées non numériques → 422 (pas 500)", r.status_code == 422, f"HTTP {r.status_code} {r.text[:80]}")
    reset_limits()
    holes = json.dumps({"type": "Polygon", "coordinates": [[[2.35,48.85],[2.36,48.85],[2.36,48.86],[2.35,48.85]], [["junk"]] * 5000]})
    r = c.post(f"{API}/incidents", json=report(geojson_geometry=holes), headers={"X-Device-Id": "v3"})
    record("INPUT-003", "Anneaux intérieurs de polygone validés", r.status_code == 422, f"HTTP {r.status_code}")
    reset_limits()
    r = c.post(f"{API}/incidents", content='{"category":"danger","title":"x y","latitude":NaN,"longitude":2.3}',
               headers={"Content-Type": "application/json", "X-Device-Id": "v4"})
    record("INPUT-004", "Latitude NaN refusée", r.status_code == 422, f"HTTP {r.status_code}")
    reset_limits()
    r = c.post(f"{API}/favorites", json={"session_id": "device-aaaaa", "name": "Maison", "place_type": "x" * 5000,
                                         "latitude": 48.85, "longitude": 2.35})
    record("INPUT-005", "place_type de favori borné (colonne String(20))", r.status_code == 422, f"HTTP {r.status_code}")
    r = c.post(f"{API}/incidents/{inc_id}/vote", json=["confirm"])
    record("INPUT-006", "Corps de vote non-objet → 422", r.status_code == 422, f"HTTP {r.status_code}")
    r = c.post(f"{API}/incidents/{inc_id}/vote", json={"vote_type": "admin"})
    record("INPUT-007", "vote_type inconnu → 422", r.status_code == 422, f"HTTP {r.status_code}")
    r = c.get(f"{API}/incidents", params={"limit": -5})
    record("INPUT-008", "limit négatif → 422", r.status_code == 422, f"HTTP {r.status_code}")
    reset_limits()
    r = c.post(f"{API}/incidents", json=report(title="🚨 Alerte 中文 ‮evil"), headers={"X-Device-Id": "v5"})
    record("INPUT-009", "Unicode / caractères de contrôle bidi neutralisés", r.status_code in (201, 422) and "‮" not in r.text,
           f"HTTP {r.status_code}, titre={r.json().get('title') if r.status_code == 201 else '-'!r}")

    # ── Autorisation / IDOR ────────────────────────────────────────────────
    reset_limits()
    a = c.post(f"{API}/incidents", json=report(title="Incident A"), headers={"X-Device-Id": "A"}).json()
    b = c.post(f"{API}/incidents", json=report(title="Incident B"), headers={"X-Device-Id": "B"}).json()
    r = c.delete(f"{API}/incidents/{b['id']}", headers={"X-Incident-Owner-Token": a["owner_token"]})
    record("AUTHZ-001", "Jeton propriétaire de A ne supprime pas l'incident de B", r.status_code == 403, f"HTTP {r.status_code}")
    r = c.patch(f"{API}/incidents/{b['id']}/resolve", headers={"X-Incident-Owner-Token": a["owner_token"]})
    record("AUTHZ-002", "Jeton de A ne résout pas l'incident de B", r.status_code == 403, f"HTTP {r.status_code}")
    r = c.delete(f"{API}/incidents/{b['id']}")
    record("AUTHZ-003", "Suppression sans jeton refusée", r.status_code == 403, f"HTTP {r.status_code}")
    r = c.delete(f"{API}/incidents/{a['id']}", headers={"X-Incident-Owner-Token": a["owner_token"]})
    record("AUTHZ-004", "Le propriétaire peut supprimer son incident", r.status_code == 204, f"HTTP {r.status_code}")
    r = c.delete(f"{API}/incidents/purge/all", headers={"X-Admin-Key": "wrong"})
    record("AUTHZ-005", "Purge admin refusée avec une mauvaise clé", r.status_code == 401, f"HTTP {r.status_code}")
    r = c.get(f"{API}/moderation/queue")
    record("AUTHZ-006", "File de modération refusée sans clé", r.status_code == 401, f"HTTP {r.status_code}")
    reset_limits()
    c.post(f"{API}/favorites", json={"session_id": "device-of-alice-123", "name": "Domicile", "place_type": "home",
                                     "address": "3 rue des Lilas", "latitude": 48.8, "longitude": 2.3})
    r = c.get(f"{API}/favorites", params={"session_id": "device-of-bob-4567"})
    record("AUTHZ-007", "Bob ne voit pas les favoris d'Alice", r.json() == [], f"{len(r.json())} favori(s) visibles")
    favs_alice = c.get(f"{API}/favorites", params={"session_id": "device-of-alice-123"}).json()
    r = c.delete(f"{API}/favorites/{favs_alice[0]['id']}", params={"session_id": "device-of-bob-4567"})
    record("AUTHZ-008", "Bob ne supprime pas le favori d'Alice", r.status_code == 404, f"HTTP {r.status_code}")
    r = c.get(f"{API}/favorites", headers={"X-Device-Id": "device-of-alice-123"})
    record("PRIV-004", "Les favoris se lisent via l'en-tête X-Device-Id (pas d'identifiant dans l'URL)",
           r.status_code == 200 and len(r.json()) == 1, f"GET /favorites + X-Device-Id → {r.status_code}, {len(r.json())} favori")
    with SessionLocal() as db:
        stored = db.query(Incident).filter(Incident.id == inc_id).first()
        stored_pos = (stored.latitude, stored.longitude, stored.address)
    record("PRIV-005", "La base ne contient ni la position GPS exacte ni le numéro de rue",
           abs(stored_pos[0] - EXACT[0]) > 1e-5 and "12" not in (stored_pos[2] or ""), f"stocké: {stored_pos}")

    # ── Concurrence ────────────────────────────────────────────────────────
    reset_limits()
    target = c.post(f"{API}/incidents", json=report(title="Course"), headers={"X-Device-Id": "race"}).json()["id"]
    def vote(i):
        with TestClient(app, raise_server_exceptions=False) as cc:
            cc.post(f"{API}/incidents/{target}/vote", json={"vote_type": "confirm"}, headers={"X-Device-Id": f"racer-{i}"})
    ts = [threading.Thread(target=vote, args=(i,)) for i in range(20)]
    [t.start() for t in ts]; [t.join() for t in ts]
    with SessionLocal() as db:
        from models import IncidentVote
        rows = db.query(IncidentVote).filter(IncidentVote.incident_id == target).count()
        count = db.query(Incident).filter(Incident.id == target).first().confirmations_count
    record("RACE-001", "20 votes simultanés → compteur cohérent", count == rows + 1, f"lignes de vote={rows}, compteur={count} (attendu {rows + 1})")

    # ── Exposition / en-têtes ─────────────────────────────────────────────
    import subprocess
    prod = subprocess.run([sys.executable, "-c", (
        "import os,sys; os.environ['APP_ENV']='production'; sys.path.insert(0,'backend');"
        "from fastapi.testclient import TestClient; from main import app;"
        "c=TestClient(app); print(c.get('/openapi.json').status_code, c.get('/docs').status_code)")],
        capture_output=True, text=True, env=os.environ.copy(), cwd=os.path.join(os.path.dirname(__file__), ".."))
    out = prod.stdout.strip().splitlines()[-1] if prod.stdout.strip() else prod.stderr[-200:]
    record("EXPO-001", "Schéma OpenAPI / Swagger non exposé en production (APP_ENV=production)", out == "404 404", f"/openapi.json, /docs → {out}")
    h = c.get("/health").headers
    record("HDR-001", "En-têtes de sécurité API", all(k in h for k in ("x-content-type-options", "x-frame-options", "strict-transport-security", "referrer-policy")),
           {k: h.get(k) for k in ("x-content-type-options", "x-frame-options", "strict-transport-security", "content-security-policy")})
    r = c.get(f"{API}/incidents/not-a-real-id")
    record("ERR-001", "404 propre sur ID inexistant", r.status_code == 404 and "Traceback" not in r.text, f"HTTP {r.status_code} {r.text[:60]}")

print("\nRÉSUMÉ:", sum(1 for r in results if r[2]), "PASS /", sum(1 for r in results if not r[2]), "FAIL")
sys.exit(1 if any(not r[2] for r in results) else 0)
