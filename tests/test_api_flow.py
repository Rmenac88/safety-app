"""
End-to-end API tests (FastAPI TestClient + temporary SQLite database, no server needed).

    python3 tests/test_api_flow.py
"""
import os
import sys
import tempfile
import unittest

_DB_DIR = tempfile.mkdtemp(prefix="safety-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_DB_DIR, 'test.db')}"
os.environ.setdefault("SECURITY_SECRET_KEY", "test-secret-key")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from database import SessionLocal  # noqa: E402
from models import Notification, AuditLog, Incident, IncidentVote, RateLimitHit  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from security import anti_abuse  # noqa: E402

API = "/api/v1"


def _parse_iso(value: str) -> datetime:
    """fromisoformat() only accepts the "Z" UTC suffix from Python 3.11."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _report(**overrides):
    body = {
        "category": "danger",
        "title": "Homme armé d'un couteau",
        "description": "Individu menaçant près de l'entrée du métro",
        "latitude": 48.8566,
        "longitude": 2.3522,
        "address": "12 bis Rue de l'Église",
        "neighborhood": "Marais",
        "city": "Paris",
        "severity": "high",
        "estimated_duration": "2 h",
    }
    body.update(overrides)
    return body


class TestApiFlow(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(app)
        cls.client = cls.ctx.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def setUp(self):
        for buckets in (anti_abuse._CREATION_BUCKETS, anti_abuse._VOTE_BUCKETS,
                        anti_abuse._READ_BUCKETS, anti_abuse._VOTE_IP_BUCKETS):
            buckets.clear()
        with SessionLocal() as db:
            db.query(RateLimitHit).delete()
            db.commit()

    def _create(self, **overrides):
        return self.client.post(f"{API}/incidents", json=_report(**overrides), headers={"X-Device-Id": "author"})

    def test_apostrophes_are_stored_as_plain_text(self):
        res = self._create()
        self.assertEqual(res.status_code, 201, res.text)
        data = res.json()
        self.assertEqual(data["title"], "Homme armé d'un couteau")
        self.assertNotIn("&#x27;", data["description"])
        # house number never public
        self.assertEqual(data["address"], "Rue de l'Église")

    def test_html_is_stripped(self):
        res = self._create(title="<script>alert(1)</script>Alerte danger", description="<img src=x onerror=alert(1)>")
        self.assertEqual(res.status_code, 201, res.text)
        self.assertNotIn("<", res.json()["title"])

    def test_notification_is_linked_to_its_incident(self):
        res = self._create()
        inc_id = res.json()["id"]
        with SessionLocal() as db:
            notif = db.query(Notification).filter(Notification.incident_id == inc_id).first()
            self.assertIsNotNone(notif, "notification created with incident_id = NULL")
            self.assertNotIn("12 bis", notif.message)
            self.assertIsNotNone(db.query(AuditLog).filter(AuditLog.incident_id == inc_id).first())

    def test_blocked_content_returns_moderation_error(self):
        res = self._create(description="Agression sexuelle. Rejoins mon canal telegram t.me/arnaque75")
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"]["code"], "CONTENT_BLOCKED")

    def test_slur_in_address_is_blocked(self):
        res = self._create(address="Rue des sales bougnoules")
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["detail"]["code"], "CONTENT_BLOCKED")

    def test_slur_in_pseudonym_is_blocked(self):
        res = self._create(is_anonymous=False, author_pseudonym="grosse salope")
        self.assertEqual(res.status_code, 422)

    def test_single_attacker_cannot_hide_a_report(self):
        inc_id = self._create().json()["id"]
        # 15 "different users" (rotating device ids / session ids) from ONE network
        for i in range(15):
            r = self.client.post(f"{API}/incidents/{inc_id}/vote",
                                 json={"vote_type": "dispute", "session_id": f"fake-{i}"},
                                 headers={"X-Device-Id": f"fake-device-{i}"})
            self.assertEqual(r.status_code, 200, r.text)
        listed = self.client.get(f"{API}/incidents").json()["incidents"]
        self.assertIn(inc_id, [i["id"] for i in listed], "a single network hid a real report")

    def test_community_can_still_hide_a_false_report(self):
        inc_id = self._create().json()["id"]
        os.environ["VERCEL"] = "1"  # trust X-Real-IP like behind Vercel's proxy
        try:
            for i in range(10):
                r = self.client.post(f"{API}/incidents/{inc_id}/vote",
                                     json={"vote_type": "dispute"},
                                     headers={"X-Device-Id": f"citizen-{i}", "X-Real-IP": f"203.0.113.{i}"})
                self.assertEqual(r.status_code, 200, r.text)
        finally:
            del os.environ["VERCEL"]
        self.assertEqual(r.json()["status"], "resolved")

    def test_vote_is_unique_per_device(self):
        inc_id = self._create().json()["id"]
        for _ in range(3):
            r = self.client.post(f"{API}/incidents/{inc_id}/vote",
                                 json={"vote_type": "confirm", "session_id": "random-value"},
                                 headers={"X-Device-Id": "voter-1"})
        # confirm -> unconfirm -> confirm : author's 1 + this device's 1
        self.assertEqual(r.json()["confirmations_count"], 2)

    def test_legacy_unprotected_dispute_endpoint_is_gone(self):
        inc_id = self._create().json()["id"]
        r = self.client.patch(f"{API}/incidents/{inc_id}/dispute")
        self.assertIn(r.status_code, (404, 405))

    def test_notification_delete_requires_admin(self):
        self._create()
        notifs = self.client.get(f"{API}/notifications?lat=48.8566&lon=2.3522&radius_km=5").json()
        self.assertTrue(notifs)
        r = self.client.delete(f"{API}/notifications/{notifs[0]['id']}")
        self.assertEqual(r.status_code, 401)
        r = self.client.delete(f"{API}/notifications/{notifs[0]['id']}", headers={"X-Admin-Key": os.environ["ADMIN_API_KEY"]})
        self.assertEqual(r.status_code, 200)

    def test_invalid_filters_do_not_crash(self):
        r = self.client.get(f"{API}/incidents?category=%27%3B%20DROP%20TABLE&severity=nope&status=blocked")
        self.assertEqual(r.status_code, 200)

    def test_frontend_durations_are_accepted(self):
        for duration in ("30 min", "2 h", "12 h", "24 h", "permanent"):
            self.setUp()
            r = self._create(estimated_duration=duration)
            self.assertEqual(r.status_code, 201, f"{duration}: {r.text}")


    # ── Duration / dates ────────────────────────────────────────────────────
    def test_duration_is_honored(self):
        data = self._create(estimated_duration="30 min").json()
        created = _parse_iso(data["created_at"])
        expires = _parse_iso(data["expires_at"])
        self.assertAlmostEqual((expires - created).total_seconds(), 30 * 60, delta=5)

    def test_dates_are_explicitly_utc(self):
        data = self._create().json()
        for field in ("created_at", "expires_at"):
            self.assertIsNotNone(_parse_iso(data[field]).tzinfo, field)
        notif = self.client.get(f"{API}/notifications?lat=48.8566&lon=2.3522&radius_km=5").json()[0]
        self.assertIsNotNone(_parse_iso(notif["created_at"]).tzinfo)

    def test_expired_incident_leaves_the_map(self):
        inc_id = self._create(estimated_duration="30 min").json()["id"]
        with SessionLocal() as db:
            inc = db.query(Incident).filter(Incident.id == inc_id).first()
            inc.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
            db.commit()
        listed = self.client.get(f"{API}/incidents").json()["incidents"]
        self.assertNotIn(inc_id, [i["id"] for i in listed])

    # ── Shared rate limiting ────────────────────────────────────────────────
    def test_rate_limit_is_shared_between_instances(self):
        for _ in range(5):
            self.assertEqual(self._create().status_code, 201)
        # A new serverless instance starts with empty memory...
        anti_abuse._CREATION_BUCKETS.clear()
        # ...but the quota lives in the database
        r = self._create()
        self.assertEqual(r.status_code, 429)
        self.assertIn("Retry-After", r.headers)

    # ── Moderation queue ────────────────────────────────────────────────────
    def _admin(self):
        return {"X-Admin-Key": os.environ["ADMIN_API_KEY"]}

    def test_borderline_content_goes_to_review_queue(self):
        res = self._create(category="hazard", title="Trottoir sale",
                           description="De la merde partout sur le trottoir")
        self.assertEqual(res.status_code, 201, res.text)
        self.assertEqual(res.json()["moderation_status"], "pending_review")
        inc_id = res.json()["id"]

        self.assertEqual(self.client.get(f"{API}/moderation/queue").status_code, 401)
        queue = self.client.get(f"{API}/moderation/queue", headers=self._admin()).json()
        item = next(i for i in queue["items"] if i["incident"]["id"] == inc_id)
        self.assertTrue(item["reasons"])

        r = self.client.post(f"{API}/moderation/queue/{item['id']}/approve", headers=self._admin())
        self.assertEqual(r.json()["status"], "approved")
        listed = {i["id"]: i for i in self.client.get(f"{API}/incidents").json()["incidents"]}
        self.assertEqual(listed[inc_id]["moderation_status"], "approved")
        r = self.client.post(f"{API}/moderation/queue/{item['id']}/reject", headers=self._admin())
        self.assertEqual(r.status_code, 409)

    def test_rejected_content_is_removed_everywhere(self):
        inc_id = self._create(category="hazard", title="Trottoir sale",
                              description="De la merde partout sur le trottoir").json()["id"]
        queue = self.client.get(f"{API}/moderation/queue", headers=self._admin()).json()
        item = next(i for i in queue["items"] if i["incident"]["id"] == inc_id)
        r = self.client.post(f"{API}/moderation/queue/{item['id']}/reject", headers=self._admin())
        self.assertEqual(r.json()["status"], "rejected")
        self.assertNotIn(inc_id, [i["id"] for i in self.client.get(f"{API}/incidents").json()["incidents"]])
        self.assertEqual(self.client.get(f"{API}/incidents/{inc_id}").status_code, 404)
        notifs = self.client.get(f"{API}/notifications?lat=48.8566&lon=2.3522&radius_km=5").json()
        self.assertNotIn(inc_id, [n["incident_id"] for n in notifs])

    def test_clean_report_is_not_queued(self):
        res = self._create()
        self.assertEqual(res.json()["moderation_status"], "approved")

    # ── Votes cast before the new voter key ─────────────────────────────────
    def test_legacy_vote_is_adopted_not_duplicated(self):
        inc_id = self._create().json()["id"]
        with SessionLocal() as db:
            # vote stored the old way: raw device id as session_id
            db.add(IncidentVote(incident_id=inc_id, session_id="old-phone", vote_type="confirm"))
            inc = db.query(Incident).filter(Incident.id == inc_id).first()
            inc.confirmations_count += 1
            db.commit()
        headers = {"X-Device-Id": "old-phone"}
        r = self.client.post(f"{API}/incidents/{inc_id}/vote",
                             json={"vote_type": "confirm", "session_id": "old-phone"}, headers=headers)
        # same vote again = toggle off, NOT a second confirmation
        self.assertEqual(r.json()["confirmations_count"], 1)
        with SessionLocal() as db:
            self.assertEqual(db.query(IncidentVote).filter(IncidentVote.incident_id == inc_id).count(), 0)


    # ── RGPD : accès / portabilité / effacement (identifiant d'appareil) ────
    def test_device_data_export_and_erasure(self):
        dev = {"X-Device-Id": "rgpd-device-01"}
        self.client.post(f"{API}/favorites", json={"session_id": "rgpd-device-01", "name": "Maison", "place_type": "home",
                                                   "address": "3 rue des Lilas", "latitude": 48.8, "longitude": 2.3}, headers=dev)
        inc_id = self._create().json()["id"]
        self.client.post(f"{API}/incidents/{inc_id}/vote", json={"vote_type": "confirm"}, headers=dev)

        self.assertEqual(self.client.get(f"{API}/me/data").status_code, 401)
        export = self.client.get(f"{API}/me/data", headers=dev).json()
        self.assertEqual(len(export["favorites"]), 1)
        self.assertEqual(export["votes"][0]["incident_id"], inc_id)

        other = self.client.get(f"{API}/me/data", headers={"X-Device-Id": "someone-else-02"}).json()
        self.assertEqual((other["favorites"], other["votes"]), ([], []), "export d'un autre appareil")

        erased = self.client.delete(f"{API}/me/data", headers=dev).json()
        self.assertEqual((erased["favorites_deleted"], erased["votes_deleted"]), (1, 1))
        after = self.client.get(f"{API}/me/data", headers=dev).json()
        self.assertEqual((after["favorites"], after["votes"]), ([], []))
        listed = {i["id"]: i for i in self.client.get(f"{API}/incidents").json()["incidents"]}
        self.assertEqual(listed[inc_id]["confirmations_count"], 1, "le vote effacé n'est plus compté")

    def test_retention_purges_closed_reports(self):
        from retention import purge_expired_data
        from models import IncidentStatus, Notification as Notif
        inc_id = self._create().json()["id"]
        with SessionLocal() as db:
            inc = db.query(Incident).filter(Incident.id == inc_id).first()
            inc.status = IncidentStatus.expired
            inc.expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
            db.commit()
            deleted = purge_expired_data(db, force=True)
            self.assertGreaterEqual(deleted["incidents"], 1)
            self.assertIsNone(db.query(Incident).filter(Incident.id == inc_id).first())
            self.assertEqual(db.query(Notif).filter(Notif.incident_id == inc_id).count(), 0)

    def test_recent_closed_report_is_kept(self):
        from retention import purge_expired_data
        from models import IncidentStatus
        inc_id = self._create().json()["id"]
        with SessionLocal() as db:
            inc = db.query(Incident).filter(Incident.id == inc_id).first()
            inc.status = IncidentStatus.resolved
            db.commit()
            purge_expired_data(db, force=True)
            self.assertIsNotNone(db.query(Incident).filter(Incident.id == inc_id).first())


if __name__ == "__main__":
    unittest.main(verbosity=2)
