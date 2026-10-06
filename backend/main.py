from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import sys, os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base
from migrations import run_pending_migrations
from routes.incidents import router as incidents_router
from routes.score import router as score_router
from routes.favorites import router as favorites_router
from routes.geocode import router as geocode_router
from routes.notifications import router as notifications_router
from routes.moderation import router as moderation_router
from routes.privacy import router as privacy_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_pending_migrations()
    print("✅ Safety database initialized with defense-in-depth security")
    yield
    print("Safety API shutting down.")


IS_PRODUCTION = bool(os.getenv("VERCEL")) or os.getenv("APP_ENV") == "production"
# Swagger / OpenAPI publish the full attack surface (admin routes included): off in production
# unless explicitly enabled.
_DOCS_ENABLED = not IS_PRODUCTION or os.getenv("ENABLE_API_DOCS") == "1"

app = FastAPI(
    title="Safety API (Secured)",
    description="API REST durcie et sécurisée pour l'application mondiale de sécurité géolocalisée Safety.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
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


# ── 2a. Validation errors: never echo the received input back ───────────────
# FastAPI's default 422 body contains each invalid "input": a NaN made the error itself
# crash (NaN is not valid JSON → 500), and a 50 kB payload was sent back verbatim.
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = [
        {"loc": list(err.get("loc", ())), "msg": str(err.get("msg", "")), "type": str(err.get("type", ""))}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


# ── 2. Global Unhandled Exception Handler ───────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Never catch HTTPException here (FastAPI handles 4xx automatically)
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    # Exception TYPE only: messages of database errors embed the SQL parameters
    # (exact coordinates, report descriptions...) and must never reach the logs.
    print(f"Unhandled server error on {request.method} {request.url.path}: {type(exc).__name__}: {str(getattr(exc, 'orig', '') or '').splitlines()[:1]}")
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Une erreur interne sécurisée est survenue."}
    )


# ── 3. CORS Policy ─────────────────────────────────────────────────────────
# In production the web app calls the API on its own origin (/api rewrite on Vercel), so
# no cross-origin access is needed. "*" let any website make its visitors' browsers vote
# and post reports (each visitor = a distinct IP, defeating per-IP abuse limits).
_DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,https://safety-psi-ruddy.vercel.app"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # no cookies are used: authentication is header-based
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Device-Id", "X-Incident-Owner-Token", "X-Admin-Key"],
    expose_headers=["Retry-After", "X-Response-Time"],
)

# ── 4. Routers ─────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(incidents_router, prefix=API_PREFIX)
app.include_router(score_router, prefix=API_PREFIX)
app.include_router(favorites_router, prefix=API_PREFIX)
app.include_router(geocode_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(moderation_router, prefix=API_PREFIX)
app.include_router(privacy_router, prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "Safety API v2 (Secured & Hardened)",
        "security": {
            "idor_protection": "owner_token",
            "geo_privacy": "public_position_only",
            "rate_limiting": "shared_db",
            "admin": "api_key",
        }
    }
