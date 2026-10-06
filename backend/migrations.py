"""
One-time data migrations, applied automatically at startup (local lifespan and Vercel
cold start). Each migration runs once per database: its id is recorded in the
`app_migrations` table. Migrations must be idempotent (two serverless instances can
start at the same time).
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String
from sqlalchemy.orm import Session

from database import Base, SessionLocal


class AppMigration(Base):
    __tablename__ = "app_migrations"

    id = Column(String(100), primary_key=True)
    applied_at = Column(DateTime, nullable=False)


def _obfuscate_existing_positions(db: Session) -> str:
    """2026-10-06: rows created before the privacy fix held the EXACT GPS fix and the full address."""
    import json
    from models import Incident, Notification
    from security.geo_privacy import obfuscate_public_coordinates, sanitize_public_address

    incidents = notifications = 0
    for inc in db.query(Incident).all():
        lat, lon = obfuscate_public_coordinates(inc.latitude, inc.longitude, inc.id)
        address = sanitize_public_address(inc.address, inc.neighborhood, inc.city)
        geojson = inc.geojson_geometry
        try:
            geom = json.loads(geojson) if geojson else None
        except ValueError:
            geom = None
        if isinstance(geom, dict) and geom.get("type") == "Point":
            geojson = json.dumps({"type": "Point", "coordinates": [lon, lat]})
        if (lat, lon, address, geojson) != (inc.latitude, inc.longitude, inc.address, inc.geojson_geometry):
            incidents += 1
            inc.latitude, inc.longitude, inc.address, inc.geojson_geometry = lat, lon, address, geojson
        for notif in db.query(Notification).filter(Notification.incident_id == str(inc.id)).all():
            message = f"Attention, {address or 'dans votre secteur'} : {inc.title}."
            if (notif.latitude, notif.longitude, notif.message) != (lat, lon, message):
                notifications += 1
                notif.latitude, notif.longitude, notif.message = lat, lon, message
    return f"{incidents} incidents, {notifications} notifications"


MIGRATIONS = [
    ("2026-10-06-obfuscate-existing-positions", _obfuscate_existing_positions),
]


def run_pending_migrations() -> None:
    """Never raises: a failed migration is logged and retried on the next start."""
    with SessionLocal() as db:
        for migration_id, migrate in MIGRATIONS:
            try:
                if db.get(AppMigration, migration_id):
                    continue
                summary = migrate(db)
                db.add(AppMigration(id=migration_id, applied_at=datetime.now(timezone.utc).replace(tzinfo=None)))
                db.commit()
                print(f"Migration {migration_id} applied: {summary}")
            except Exception as e:  # concurrent instance already applied it, or transient DB error
                db.rollback()
                print(f"Migration {migration_id} not applied: {type(e).__name__}")
