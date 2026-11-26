import datetime
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models
from app.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns role-aware KPI stats grouped by branch.
    - Admin: all branches
    - Manager: assigned branch
    - Cashier: assigned branch (revenue = own sales only)
    """
    today_start = datetime.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Determine which shops to fetch stats for
    if current_user.role == "admin":
        shops = db.query(models.Shop).all()
    else:
        shops = db.query(models.Shop).filter(models.Shop.id == current_user.shop_id).all()

    result = []
    for shop in shops:
        # Inventory counts
        total_inv = db.query(func.count(models.IMEIItem.id)).filter(
            models.IMEIItem.shop_id == shop.id
        ).scalar()

        available_inv = db.query(func.count(models.IMEIItem.id)).filter(
            models.IMEIItem.shop_id == shop.id,
            models.IMEIItem.status == "Available"
        ).scalar()

        sold_inv = db.query(func.count(models.IMEIItem.id)).filter(
            models.IMEIItem.shop_id == shop.id,
            models.IMEIItem.status == "Sold"
        ).scalar()

        # Revenue: today only
        # Cashiers only see their own revenue
        revenue_query = db.query(func.sum(models.Sale.sale_price)).filter(
            models.Sale.shop_id == shop.id,
            models.Sale.sold_at >= today_start,
        )
        if current_user.role == "cashier":
            revenue_query = revenue_query.filter(models.Sale.cashier_id == current_user.id)
        today_revenue = float(revenue_query.scalar() or 0)

        # Sold items today with cashier, item, and product info
        sold_today_query = (
            db.query(
                models.Sale.id,
                models.Sale.imei_item_id,
                models.Sale.shop_id,
                models.Sale.cashier_id,
                models.Sale.sale_price,
                models.Sale.payment_method,
                models.Sale.sold_at,
                models.User.username.label("cashier_name"),
                models.IMEIItem.imei_number,
                models.Product.brand.label("product_brand"),
                models.Product.model.label("product_model"),
                models.Product.category.label("product_category"),
                models.Product.details.label("product_details"),
            )
            .join(models.User, models.Sale.cashier_id == models.User.id)
            .outerjoin(models.IMEIItem, models.Sale.imei_item_id == models.IMEIItem.id)
            .outerjoin(models.Product, models.IMEIItem.product_id == models.Product.id)
            .filter(
                models.Sale.shop_id == shop.id,
                models.Sale.sold_at >= today_start,
            )
        )
        if current_user.role == "cashier":
            sold_today_query = sold_today_query.filter(models.Sale.cashier_id == current_user.id)

        sold_today = [
            {
                "id": r.id,
                "imei_item_id": r.imei_item_id,
                "shop_id": r.shop_id,
                "shop_name": shop.name,
                "shop_location": shop.location or "",
                "cashier_id": r.cashier_id,
                "cashier_name": r.cashier_name,
                "sale_price": float(r.sale_price),
                "payment_method": r.payment_method,
                "sold_at": r.sold_at.isoformat() if r.sold_at else None,
                "product_brand": r.product_brand or "",
                "product_model": r.product_model or "",
                "product_category": r.product_category or "",
                "product_details": r.product_details or "",
                "imei_number": r.imei_number or "",
                "receipt_number": f"RCP-{r.id:06d}",
            }
            for r in sold_today_query.order_by(models.Sale.sold_at.desc()).all()
        ]

        result.append({
            "shop_id":        shop.id,
            "shop_name":      shop.name,
            "shop_location":  shop.location or "",
            "total_inventory":     total_inv,
            "available_inventory": available_inv,
            "sold_inventory":      sold_inv,
            "today_revenue":       today_revenue,
            "sold_today":          sold_today,
        })

    return result

