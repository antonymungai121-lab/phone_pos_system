import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_manager, require_cashier, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["Products"])


@router.get("/", response_model=list[schemas.ProductResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all product models. Any authenticated user."""
    return db.query(models.Product).all()


@router.post("/add", response_model=schemas.ProductResponse, status_code=201)
def add_product(
    product: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """Add a new phone/accessory model. Manager or Admin only."""
    existing = db.query(models.Product).filter(
        models.Product.model == product.model
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This phone model already exists.")

    new_prod = models.Product(
        brand=product.brand,
        model=product.model,
        price=product.price,
    )
    db.add(new_prod)
    db.commit()
    db.refresh(new_prod)
    logger.info("Product added: %s %s by %s", product.brand, product.model, current_user.username)
    return new_prod


@router.put("/{product_id}", response_model=schemas.ProductResponse)
def update_product(
    product_id: int,
    product_update: schemas.ProductCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """Update product details or price. Manager or Admin only."""
    db_prod = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not db_prod:
        raise HTTPException(status_code=404, detail="Product not found.")
    db_prod.brand = product_update.brand
    db_prod.model = product_update.model
    db_prod.price = product_update.price
    db.commit()
    db.refresh(db_prod)
    logger.info("Product %s updated by %s", product_id, current_user.username)
    return db_prod