import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app import models
from app.config import settings

limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)

# ── Security config (all from environment, never hardcoded) ──────────────────
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
router = APIRouter(prefix="/auth", tags=["Security"])


# ── Password helpers ─────────────────────────────────────────────────────────
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ── Token helpers ────────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ── Auth dependency — call with Depends(get_current_user) on any route ───────
def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


# ── Role-enforcement helpers ─────────────────────────────────────────────────
def require_role(*roles: str):
    """Factory that returns a dependency enforcing one of the specified roles."""
    def _check(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {' or '.join(roles)}",
            )
        return current_user
    return _check

require_cashier = require_role("cashier", "manager", "admin")
require_manager = require_role("manager", "admin")
require_admin   = require_role("admin")


# ── Login ────────────────────────────────────────────────────────────────────
@router.post("/login")
@limiter.limit("10/minute")  # brute-force protection: max 10 attempts per IP per minute
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # Never log passwords — only log the username for diagnostics
    logger.info("Login attempt for user: %s", form_data.username)

    user = db.query(models.User).filter(
        models.User.username == form_data.username
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        # Identical error message for both "user not found" and "wrong password"
        # prevents user-enumeration attacks
        logger.warning("Failed login attempt for user: %s", form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    logger.info("Successful login for user: %s (shop_id=%s)", user.username, user.shop_id)
    access_token = create_access_token(data={"sub": user.username})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id":  user.id,
        "shop_id":  user.shop_id,
        "username": user.username,
        "role":     user.role,
    }



# ── Change own password ───────────────────────────────────────────────────────
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Authenticated users can change their own password."""
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if data.new_password == data.current_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password.")

    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()
    logger.info("Password changed for user: %s", current_user.username)
    return {"message": "Password updated successfully."}



@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    """Returns whether registration is open (no users yet) or closed."""
    user_count = db.query(models.User).count()
    shop_count = db.query(models.Shop).count()
    return {
        "registration_open": user_count == 0,
        "setup_required": user_count == 0 or shop_count == 0,
        "user_count": user_count,
    }


# ── Register ─────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    username: str
    password: str
    confirm_password: str
    shop_name: str = "Main Branch"
    shop_location: str = ""

@router.post("/register", status_code=201)
@limiter.limit("5/minute")
def register(
    request: Request,
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Self-registration endpoint.
    - If NO users exist: creates the first admin account + a default shop.
    - If users already exist: blocked — contact your admin to create an account.
    """
    # Validate passwords match
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    existing_users = db.query(models.User).count()

    if existing_users > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is closed. Ask your admin to create an account for you.",
        )

    # Check username not taken (shouldn't happen on first run, but be safe)
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Username already taken.")

    # Create the default shop if it doesn't exist
    shop = db.query(models.Shop).first()
    if not shop:
        shop = models.Shop(
            name=data.shop_name or "Main Branch",
            location=data.shop_location or "",
        )
        db.add(shop)
        db.commit()
        db.refresh(shop)

    # First ever user → admin
    new_user = models.User(
        username=data.username,
        hashed_password=get_password_hash(data.password),
        shop_id=shop.id,
        role="admin",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info("First admin account created: %s (shop: %s)", new_user.username, shop.name)

    access_token = create_access_token(data={"sub": new_user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id":  new_user.id,
        "shop_id":  new_user.shop_id,
        "username": new_user.username,
        "role":     new_user.role,
        "message": "Admin account created successfully! You are now logged in.",
    }


# ── Force-setup (protected by SETUP_SECRET header) ───────────────────────────
@router.get("/force-setup")
def force_setup(
    x_setup_secret: str = Header(..., alias="X-Setup-Secret"),
    db: Session = Depends(get_db),
):
    """
    One-time endpoint to seed the database with a default shop and admin user.
    Protected by the X-Setup-Secret header (must match SETUP_SECRET in .env).
    Remove or disable this endpoint after the first successful setup.
    """
    if not settings.SETUP_SECRET or x_setup_secret != settings.SETUP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing setup secret.",
        )

    # 1. Ensure the default shop exists
    shop = db.query(models.Shop).filter(models.Shop.id == 1).first()
    if not shop:
        shop = models.Shop(name="Main Branch", location="Gatura")
        db.add(shop)
        db.commit()
        db.refresh(shop)

    # 2. Ensure admin user exists (never overwrite an existing one)
    user = db.query(models.User).filter(models.User.username == "admin").first()
    if user:
        return {"status": "Admin already exists. No changes made."}

    admin_user = models.User(
        username="admin",
        hashed_password=get_password_hash("Admin@1234!"),  # non-trivial default
        shop_id=shop.id,
        role="admin",
    )
    db.add(admin_user)
    db.commit()
    logger.info("Admin user created via force-setup endpoint.")
    return {
        "status": "SUCCESS — Admin user created. Change the default password immediately.",
        "default_password": "Admin@1234!",
    }