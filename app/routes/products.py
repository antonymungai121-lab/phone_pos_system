import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app import models, schemas
from app.auth import require_manager, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products", tags=["Products"])

LOW_STOCK_THRESHOLD = 2


@router.get("/", response_model=list[schemas.ProductResponse])
def get_products(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all product models. Any authenticated user."""
    return db.query(models.Product).all()


@router.get("/stock-overview")
def get_product_stock_overview(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns per-product, per-branch stock counts (available, sold, out_of_stock).
    Admin sees all branches; manager/cashier see only their own branch.
    Low stock alert fired when available <= LOW_STOCK_THRESHOLD.
    """
    # Determine shops to include
    if current_user.role == "admin":
        shops = db.query(models.Shop).all()
    else:
        shops = db.query(models.Shop).filter(models.Shop.id == current_user.shop_id).all()

    products = db.query(models.Product).all()
    shop_ids = [s.id for s in shops]
    shop_map = {s.id: {"id": s.id, "name": s.name, "location": s.location or ""} for s in shops}

    # Aggregate counts: (product_id, shop_id, status) → count
    rows = (
        db.query(
            models.IMEIItem.product_id,
            models.IMEIItem.shop_id,
            models.IMEIItem.status,
            func.count(models.IMEIItem.id).label("cnt"),
        )
        .filter(models.IMEIItem.shop_id.in_(shop_ids))
        .group_by(models.IMEIItem.product_id, models.IMEIItem.shop_id, models.IMEIItem.status)
        .all()
    )

    # Build lookup: { (product_id, shop_id, status): count }
    counts = {}
    for r in rows:
        counts[(r.product_id, r.shop_id, r.status)] = r.cnt

    result = []
    for p in products:
        branches = []
        for s in shops:
            available = counts.get((p.id, s.id, "Available"), 0)
            sold      = counts.get((p.id, s.id, "Sold"), 0)
            total     = available + sold
            branches.append({
                "shop_id":    s.id,
                "shop_name":  s.name,
                "available":  available,
                "sold":       sold,
                "total":      total,
                "low_stock":  0 < available <= LOW_STOCK_THRESHOLD,
                "out_of_stock": available == 0 and total > 0,
            })

        result.append({
            "id":             p.id,
            "brand":          p.brand,
            "model":          p.model,
            "price":          float(p.price),
            "category":       p.category,
            "accessory_type": p.accessory_type,
            "details":        p.details,
            "branches":       branches,
        })

    return result


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
        raise HTTPException(status_code=400, detail="This model name already exists.")

    new_prod = models.Product(
        brand          = product.brand,
        model          = product.model,
        price          = product.price,
        category       = product.category,
        accessory_type = product.accessory_type,
        details        = product.details,
    )
    db.add(new_prod)
    db.commit()
    db.refresh(new_prod)
    logger.info(
        "Product added: [%s] %s %s by %s",
        product.category, product.brand, product.model, current_user.username,
    )
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
    db_prod.brand          = product_update.brand
    db_prod.model          = product_update.model
    db_prod.price          = product_update.price
    db_prod.category       = product_update.category
    db_prod.accessory_type = product_update.accessory_type
    db_prod.details        = product_update.details
    db.commit()
    db.refresh(db_prod)
    logger.info("Product %s updated by %s", product_id, current_user.username)
    return db_prod


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Delete a product model. Manager or Admin only.
    Blocked if any Available (unsold) inventory items reference this product —
    sell out or transfer all stock first. Sold items are kept for audit purposes.
    """
    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    available_count = (
        db.query(models.IMEIItem)
        .filter(
            models.IMEIItem.product_id == product_id,
            models.IMEIItem.status == "Available",
        )
        .count()
    )
    if available_count > 0:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot delete: {available_count} available unit(s) still in stock. "
                "Sell or transfer all stock first."
            ),
        )

    logger.info(
        "Product '%s %s' (id=%s) deleted by %s",
        product.brand, product.model, product_id, current_user.username,
    )
    db.delete(product)
    db.commit()
