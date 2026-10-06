import sys
import os

# The backend modules import each other as top-level modules ("database", "models"...):
# put backend/ on the path and import them under those SAME names. Importing
# "backend.database" here created a second Base with no models registered, so
# create_all() silently created nothing.
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from main import app  # noqa: E402,F401  (ASGI entrypoint for Vercel)
from database import engine, Base  # noqa: E402
from migrations import run_pending_migrations  # noqa: E402

# Ensure tables exist and one-time data migrations ran (serverless cold start)
try:
    Base.metadata.create_all(bind=engine)
    run_pending_migrations()
except Exception as e:
    print(f"Serverless DB init notice: {type(e).__name__}")
