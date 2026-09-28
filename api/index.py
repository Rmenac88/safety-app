import sys
import os

# Add backend directory to sys.path
backend_path = os.path.join(os.path.dirname(__file__), "..", "backend")
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

root_path = os.path.join(os.path.dirname(__file__), "..")
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from backend.database import engine, Base
from backend.main import app

# Ensure tables exist in Serverless runtime
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"Serverless DB init notice: {e}")
