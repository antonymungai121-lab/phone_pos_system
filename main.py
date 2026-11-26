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

# ── Auto-migrate missing columns ──────────────────────────────────────────────
from sqlalchemy import inspect, text
try:
    with engine.connect() as conn:
        inspector = inspect(engine)
        if "products" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("products")]
            if "details" not in columns:
                conn.execute(text("ALTER TABLE products ADD COLUMN details VARCHAR"))
                conn.commit()
                logger.info("Auto-migrated: added `details` column to products table.")
except Exception as e:
    logger.warning("Auto-migration check notice: %s", e)

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
# In production set ALLOWED_ORIGINS in Railway Variables to your Netlify URL.
# For local development the .env default covers localhost ports.
_origins = settings.ALLOWED_ORIGINS if settings.ALLOWED_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=len(_origins) > 0 and "*" not in _origins,
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