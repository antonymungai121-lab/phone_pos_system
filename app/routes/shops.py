import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_admin, require_manager, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/shops", tags=["Shops"])


@router.post("/", response_model=schemas.ShopResponse)
def create_shop(
    shop: schemas.ShopCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Create a new branch. Admin only."""
    existing = db.query(models.Shop).filter(models.Shop.name == shop.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A shop with this name already exists.")
    db_shop = models.Shop(**shop.model_dump())
    db.add(db_shop)
    db.commit()
    db.refresh(db_shop)
    logger.info("Shop created: %s by %s", db_shop.name, current_user.username)
    return db_shop


@router.get("/", response_model=list[schemas.ShopResponse])
def get_shops(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),  # any authenticated user
):
    """List all branches."""
    return db.query(models.Shop).all()


@router.put("/{shop_id}", response_model=schemas.ShopResponse)
def update_shop(
    shop_id: int,
    shop_update: schemas.ShopCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Update a branch. Admin only."""
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not db_shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    db_shop.name     = shop_update.name
    db_shop.location = shop_update.location
    db.commit()
    db.refresh(db_shop)
    logger.info("Shop %s updated by %s", shop_id, current_user.username)
    return db_shop


@router.delete("/{shop_id}", status_code=204)
def delete_shop(
    shop_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """Delete a branch (only if it has no inventory). Admin only."""
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    if not db_shop:
        raise HTTPException(status_code=404, detail="Shop not found.")
    has_inventory = db.query(models.IMEIItem).filter(models.IMEIItem.shop_id == shop_id).first()
    if has_inventory:
        raise HTTPException(status_code=400, detail="Cannot delete a shop that still has inventory.")
    db.delete(db_shop)
    db.commit()
    logger.info("Shop %s deleted by %s", shop_id, current_user.username)