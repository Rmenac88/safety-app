from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import sys, os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base
from routes.incidents import router as incidents_router
from routes.score import router as score_router
from routes.favorites import router as favorites_router
from routes.geocode import router as geocode_router
from routes.notifications import router as notifications_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    print("✅ Safety database initialized with defense-in-depth security")
    yield
    print("Safety API shutting down.")


app = FastAPI(
    title="Safety API (Secured)",
    description="API REST durcie et sécurisée pour l'application mondiale de sécurité géolocalisée Safety.",
    version="2.0.0",
    lifespan=lifespan,
)

# ── 1. Security Headers Middleware (OWASP ASVS Standard) ────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)

    # Apply strict security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self)"
    response.headers["X-Response-Time"] = f"{round((time.time() - start_time) * 1000, 2)}ms"
    return response


# ── 2. Global Unhandled Exception Handler ───────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Never catch HTTPException here (FastAPI handles 4xx automatically)
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    print(f"Unhandled server error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Une erreur interne sécurisée est survenue."}
    )


# ── 3. CORS Policy ─────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Retry-After", "X-Response-Time"],
)

# ── 4. Routers ─────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(incidents_router, prefix=API_PREFIX)
app.include_router(score_router, prefix=API_PREFIX)
app.include_router(favorites_router, prefix=API_PREFIX)
app.include_router(geocode_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "Safety API v2 (Secured & Hardened)",
        "security": {
            "idor_protection": "active",
            "geo_privacy": "active",
            "rate_limiting": "active",
            "rbac": "active"
        }
    }
