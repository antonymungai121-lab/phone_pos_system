import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_cashier, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/checkout", response_model=schemas.SaleResponse, status_code=201)
def process_sale(
    item: schemas.POSCheckout,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Checkout a specific phone by IMEI.
    - shop_id is enforced from the logged-in cashier's session (not client input).
    - Creates a permanent Sale audit record with cashier name, price, and payment method.
    """
    db_item = db.query(models.IMEIItem).filter(
        models.IMEIItem.imei_number == item.imei_number
    ).first()

    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found in inventory.")
    if db_item.status == "Sold":
        raise HTTPException(status_code=400, detail="This item is already sold.")
    # Cross-branch sale prevention — using server-side shop_id
    if db_item.shop_id != current_user.shop_id:
        raise HTTPException(status_code=403, detail="Item belongs to a different branch.")

    now = datetime.datetime.utcnow()
    db_item.status    = "Sold"
    db_item.date_sold = now

    # Create audit trail
    sale = models.Sale(
        imei_item_id   = db_item.id,
        shop_id        = current_user.shop_id,
        cashier_id     = current_user.id,
        sale_price     = item.sale_price,
        payment_method = item.payment_method,
        sold_at        = now,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)

    logger.info(
        "Sale #%s: IMEI %s sold at shop %s by %s for KES %s via %s",
        sale.id, item.imei_number, current_user.shop_id,
        current_user.username, item.sale_price, item.payment_method,
    )
    return sale


@router.post("/sell-accessory", response_model=schemas.SaleResponse, status_code=201)
def sell_accessory(
    data: schemas.QuickSell,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Quick-sell one unit of an accessory from the current user's shop.
    Picks the first available unit automatically.
    """
    db_item = db.query(models.IMEIItem).filter(
        models.IMEIItem.product_id == data.product_id,
        models.IMEIItem.shop_id   == current_user.shop_id,  # ← server-side
        models.IMEIItem.status    == "Available",
    ).first()

    if not db_item:
        raise HTTPException(status_code=400, detail="Out of stock at this branch.")

    now = datetime.datetime.utcnow()
    db_item.status    = "Sold"
    db_item.date_sold = now

    sale = models.Sale(
        imei_item_id   = db_item.id,
        shop_id        = current_user.shop_id,
        cashier_id     = current_user.id,
        sale_price     = data.sale_price,
        payment_method = data.payment_method,
        sold_at        = now,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)

    logger.info(
        "Accessory sale #%s: product %s sold at shop %s by %s for KES %s via %s",
        sale.id, data.product_id, current_user.shop_id,
        current_user.username, data.sale_price, data.payment_method,
    )
    return sale


@router.get("/history", response_model=list[schemas.SaleResponse])
def get_sales_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Sales history for the current user's shop.
    Admins see all shops.
    """
    query = db.query(models.Sale)
    if current_user.role != "admin":
        query = query.filter(models.Sale.shop_id == current_user.shop_id)
    return query.order_by(models.Sale.sold_at.desc()).all()