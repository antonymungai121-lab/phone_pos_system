import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_cashier, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales", tags=["Sales"])


@router.post("/checkout", response_model=schemas.SaleReceiptResponse, status_code=201)
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
    product = db_item.product
    shop = db.query(models.Shop).filter(models.Shop.id == sale.shop_id).first()
    return {
        "id": sale.id, "imei_item_id": sale.imei_item_id,
        "shop_id": sale.shop_id, "cashier_id": sale.cashier_id,
        "sale_price": sale.sale_price, "payment_method": sale.payment_method,
        "sold_at": sale.sold_at,
        "product_brand": product.brand if product else "",
        "product_model": product.model if product else "",
        "product_category": product.category if product else "",
        "imei_number": db_item.imei_number,
        "cashier_name": current_user.username,
        "shop_name": shop.name if shop else "",
        "shop_location": shop.location if shop else "",
        "receipt_number": f"RCP-{sale.id:06d}",
    }


@router.post("/sell-accessory", response_model=schemas.SaleReceiptResponse, status_code=201)
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
    product = db_item.product
    shop = db.query(models.Shop).filter(models.Shop.id == sale.shop_id).first()
    return {
        "id": sale.id, "imei_item_id": sale.imei_item_id,
        "shop_id": sale.shop_id, "cashier_id": sale.cashier_id,
        "sale_price": sale.sale_price, "payment_method": sale.payment_method,
        "sold_at": sale.sold_at,
        "product_brand": product.brand if product else "",
        "product_model": product.model if product else "",
        "product_category": product.category if product else "",
        "imei_number": db_item.imei_number,
        "cashier_name": current_user.username,
        "shop_name": shop.name if shop else "",
        "shop_location": shop.location if shop else "",
        "receipt_number": f"RCP-{sale.id:06d}",
    }


@router.get("/history", response_model=list[schemas.SaleResponse])
def get_sales_history(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    shop_id: int = None,
    cashier_id: int = None,
    date_from: str = None,
    date_to: str = None,
    period: str = None,         # "day" | "week" | "month"
):
    """
    Sales history with optional filters.
    - Admins can pass any shop_id; non-admins are locked to their own shop.
    - cashier_id, date_from (YYYY-MM-DD), date_to (YYYY-MM-DD), period filters available.
    """
    query = db.query(models.Sale)

    # Scope to branch
    if current_user.role == "admin":
        if shop_id:
            query = query.filter(models.Sale.shop_id == shop_id)
    else:
        query = query.filter(models.Sale.shop_id == current_user.shop_id)

    # Cashier filter (cashiers can only see own sales)
    if current_user.role == "cashier":
        query = query.filter(models.Sale.cashier_id == current_user.id)
    elif cashier_id:
        query = query.filter(models.Sale.cashier_id == cashier_id)

    # Period shortcut (overrides date_from/date_to)
    if period:
        now = datetime.datetime.utcnow()
        if period == "day":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start = now - datetime.timedelta(days=now.weekday())
            start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "month":
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = None
        if start:
            query = query.filter(models.Sale.sold_at >= start)
    else:
        if date_from:
            query = query.filter(models.Sale.sold_at >= date_from)
        if date_to:
            query = query.filter(models.Sale.sold_at <= date_to + " 23:59:59")

    return query.order_by(models.Sale.sold_at.desc()).all()