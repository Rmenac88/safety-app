"""
One-time privacy migration for rows created before 2026-10-06.

Older incidents / notifications were stored with the reporter's EXACT GPS fix and full
street address (house number). New rows only keep the public, obfuscated position.
This script brings existing rows to the same standard. It is idempotent (re-running it
changes nothing) and runs as a dry run unless --apply is given.

    cd backend
    DATABASE_URL=... python3 scripts/obfuscate_existing_data.py           # dry run
    DATABASE_URL=... python3 scripts/obfuscate_existing_data.py --apply   # write

Take a database backup first.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from models import Incident, Notification  # noqa: E402
from security.geo_privacy import obfuscate_public_coordinates, sanitize_public_address  # noqa: E402


def main(apply: bool) -> None:
    changed_incidents = changed_notifications = 0
    with SessionLocal() as db:
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
                changed_incidents += 1
                inc.latitude, inc.longitude, inc.address, inc.geojson_geometry = lat, lon, address, geojson

            for notif in db.query(Notification).filter(Notification.incident_id == inc.id).all():
                # older messages embedded the raw address ("Attention, 12 bis rue X : ...")
                message = f"Attention, {address or 'dans votre secteur'} : {inc.title}."
                if (notif.latitude, notif.longitude, notif.message) != (lat, lon, message):
                    changed_notifications += 1
                    notif.latitude, notif.longitude, notif.message = lat, lon, message

        print(f"incidents to update: {changed_incidents}, notifications to update: {changed_notifications}")
        if apply:
            db.commit()
            print("applied.")
        else:
            db.rollback()
            print("dry run: nothing written (use --apply).")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
