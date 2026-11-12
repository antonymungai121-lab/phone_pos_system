import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_admin, get_current_user, get_password_hash, require_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/", response_model=schemas.UserResponse, status_code=201)
def create_user(
    user_data: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Create a new cashier or manager. Admin only."""
    existing = db.query(models.User).filter(
        models.User.username == user_data.username
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists.")

    shop = db.query(models.Shop).filter(models.Shop.id == user_data.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    new_user = models.User(
        username        = user_data.username,
        hashed_password = get_password_hash(user_data.password),
        shop_id         = user_data.shop_id,
        role            = user_data.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info("User '%s' (role=%s) created by admin %s", new_user.username, new_user.role, current_user.username)
    return new_user


@router.get("/", response_model=list[schemas.UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    List all users.
    Admin sees all; manager sees only users in their own branch.
    """
    if current_user.role == "admin":
        return db.query(models.User).all()
    # Manager: only see users in their own shop
    return db.query(models.User).filter(models.User.shop_id == current_user.shop_id).all()


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    Delete a user account. Admin only.
    Admins cannot delete their own account.
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    logger.info("User '%s' (id=%s) deleted by admin %s", target.username, user_id, current_user.username)
    db.delete(target)
    db.commit()


@router.patch("/{user_id}/shop", response_model=schemas.UserResponse)
def reassign_user_shop(
    user_id: int,
    payload: schemas.UserShopUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Move a user to a different shop/branch. Admin only."""
    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    shop = db.query(models.Shop).filter(models.Shop.id == payload.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found.")

    target.shop_id = payload.shop_id
    db.commit()
    db.refresh(target)
    logger.info("User '%s' reassigned to shop '%s' by admin %s", target.username, shop.name, current_user.username)
    return target


# ── Admin password reset ──────────────────────────────────────────────────────
class AdminPasswordReset(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


@router.patch("/{user_id}/password", status_code=200)
def admin_reset_password(
    user_id: int,
    payload: AdminPasswordReset,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    Admin resets another user's password without knowing the old one.
    Admins cannot reset their own password this way (use /auth/change-password).
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Use 'My Account → Change Password' to change your own password.",
        )

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    target.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    logger.info(
        "Password reset for user '%s' (id=%s) by admin '%s'",
        target.username, user_id, current_user.username,
    )
    return {"message": f"Password for '{target.username}' has been reset successfully."}
