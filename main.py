import logging
import logging.config

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.database import engine, Base
from app.config import settings
from app.auth import router as auth_router, limiter
from app.routes import shops, products, inventory, sales, users, dashboard, reports

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Database initialisation ───────────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── App factory ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Multi-Shop Phone POS API",
    version="2.0.0",
    description="Secure, multi-branch Point of Sale system for a phone shop.",
)

# ── Rate limiter state ────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ────────────────────────────────────────────────────────────────────
# allow_origin_regex covers ALL localhost ports + file:// (null origin)
# In production, replace with your actual domain in ALLOWED_ORIGINS (.env)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # broadened for local development
    allow_credentials=False,      # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers (registered once, in logical order) ───────────────────────────────
app.include_router(auth_router)
app.include_router(shops.router)
app.include_router(users.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(sales.router)
app.include_router(dashboard.router)
app.include_router(reports.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root_check():
    return {"status": "System Online", "version": "2.0.0"}


logger.info("Multi-Shop POS API started. Allowed origins: %s", settings.ALLOWED_ORIGINS)