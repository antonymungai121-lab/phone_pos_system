import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_cashier, require_manager, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("/", response_model=list[schemas.IMEIResponse])
def get_inventory(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    List inventory for the current user's shop.
    Admins see all shops; cashiers/managers see only their own shop.
    """
    query = db.query(models.IMEIItem)
    if current_user.role != "admin":
        query = query.filter(models.IMEIItem.shop_id == current_user.shop_id)
    return query.all()


@router.post("/scan", response_model=schemas.IMEIResponse, status_code=201)
def receive_stock(
    item: schemas.IMEICreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Scan in a specific phone by IMEI.
    The shop is automatically set to the logged-in user's shop — not client-controlled.
    """
    existing = db.query(models.IMEIItem).filter(
        models.IMEIItem.imei_number == item.imei_number
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="IMEI already exists in database.")

    # Verify the product exists
    product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    new_item = models.IMEIItem(
        imei_number=item.imei_number,
        product_id=item.product_id,
        shop_id=current_user.shop_id,  # ← from JWT, not from request body
        status="Available",
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    logger.info("IMEI %s stocked in at shop %s by %s", item.imei_number, current_user.shop_id, current_user.username)
    return new_item


@router.post("/stock-accessory", status_code=201)
def stock_accessory_bulk(
    data: schemas.BulkAccessoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Bulk-add accessory units with auto-generated serials.
    Shop is derived from the authenticated user's session.
    """
    product = db.query(models.Product).filter(models.Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    items_added = []
    for _ in range(data.quantity):
        fake_serial = f"ACC-{uuid.uuid4().hex[:10].upper()}"
        new_item = models.IMEIItem(
            imei_number=fake_serial,
            product_id=data.product_id,
            shop_id=current_user.shop_id,  # ← from JWT
            status="Available",
        )
        db.add(new_item)
        items_added.append(fake_serial)

    db.commit()
    logger.info(
        "%d units of product %s stocked at shop %s by %s",
        data.quantity, data.product_id, current_user.shop_id, current_user.username,
    )
    return {
        "detail": f"Successfully added {data.quantity} units to stock.",
        "serials_generated": items_added,
    }