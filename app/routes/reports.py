"""
reports.py — Analytics & reporting endpoints for PhonePOS.

Endpoints:
  GET /reports/daily-summary      — Gross/net today per branch (admin) or own branch (manager/cashier)
  GET /reports/staff-performance  — Per-cashier revenue, items, avg txn; periods: day|week|month|all
  GET /reports/top-products       — Top N products by revenue; periods: day|week|month|all
  GET /reports/peak-hours         — Sales count & revenue by hour of day
  GET /reports/inventory-alerts   — Low stock + slow-moving items (not sold in X days)
  GET /reports/reconciliation     — Cash/MPesa/card breakdown with totals
  POST /reports/reset-daily       — Admin resets the daily period marker (conceptual; data not deleted)
"""
import logging
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models
from app.auth import get_current_user, require_admin, require_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])

LOW_STOCK_THRESHOLD = 2       # units or fewer → low stock alert
SLOW_MOVING_DAYS    = 30      # not sold within this many days → slow-moving

# ── Helpers ──────────────────────────────────────────────────────────────────

def _period_start(period: str) -> datetime.datetime | None:
    """Return the UTC start of a named period, or None for 'all'."""
    now = datetime.datetime.utcnow()
    if period == "day":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        start = now - datetime.timedelta(days=now.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return None  # "all"


def _apply_shop_scope(query, model_cls, current_user, shop_id=None):
    """Filter a query to the branches the caller may see."""
    if current_user.role == "admin":
        if shop_id:
            query = query.filter(model_cls.shop_id == shop_id)
    else:
        # manager and cashier locked to their own shop
        query = query.filter(model_cls.shop_id == current_user.shop_id)
    return query


# ── 1. Daily Summary ─────────────────────────────────────────────────────────

@router.get("/daily-summary")
def daily_summary(
    shop_id: int = None,
    period: str = "day",        # day | week | month | all
    date: str = None,           # YYYY-MM-DD override for a specific date
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Gross and net sales per branch for the requested period.
    Admin can pass shop_id to filter to one branch.
    Non-admins always see only their own branch.
    'date' overrides 'period' and shows a specific calendar day.
    """
    query = db.query(models.Sale)

    # Date scope
    if date:
        try:
            day = datetime.datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD.")
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end   = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(models.Sale.sold_at >= start, models.Sale.sold_at <= end)
    else:
        start = _period_start(period)
        if start:
            query = query.filter(models.Sale.sold_at >= start)

    query = _apply_shop_scope(query, models.Sale, current_user, shop_id)

    sales = query.all()

    # Aggregate per branch
    branches_map: dict[int, dict] = {}
    for s in sales:
        bid = s.shop_id
        if bid not in branches_map:
            shop = db.query(models.Shop).filter(models.Shop.id == bid).first()
            branches_map[bid] = {
                "shop_id":   bid,
                "shop_name": shop.name if shop else f"Shop #{bid}",
                "gross":     0.0,
                "count":     0,
                "cash":      0.0,
                "mpesa":     0.0,
                "card":      0.0,
            }
        amt = float(s.sale_price)
        branches_map[bid]["gross"] += amt
        branches_map[bid]["count"] += 1
        pm = (s.payment_method or "").lower()
        if pm == "mpesa":
            branches_map[bid]["mpesa"] += amt
        elif pm == "card":
            branches_map[bid]["card"] += amt
        else:
            branches_map[bid]["cash"] += amt

    # Round
    for b in branches_map.values():
        for k in ("gross", "cash", "mpesa", "card"):
            b[k] = round(b[k], 2)

    total_gross = round(sum(b["gross"] for b in branches_map.values()), 2)
    total_count = sum(b["count"] for b in branches_map.values())

    return {
        "period":      period,
        "date":        date,
        "total_gross": total_gross,
        "total_count": total_count,
        "branches":    list(branches_map.values()),
    }


# ── 2. Staff Performance ──────────────────────────────────────────────────────

@router.get("/staff-performance")
def staff_performance(
    period: str = "day",            # day | week | month | all
    cashier_id: int = None,
    shop_id: int = None,
    date_from: str = None,          # YYYY-MM-DD
    date_to: str = None,            # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Per-cashier revenue, item count, and average transaction value.
    Admin sees all staff; manager sees staff in their branch; cashier sees only themselves.
    """
    query = db.query(models.Sale)

    # Scope
    if current_user.role == "cashier":
        query = query.filter(models.Sale.cashier_id == current_user.id)
    elif current_user.role == "manager":
        query = query.filter(models.Sale.shop_id == current_user.shop_id)
        if cashier_id:
            query = query.filter(models.Sale.cashier_id == cashier_id)
    else:  # admin
        if shop_id:
            query = query.filter(models.Sale.shop_id == shop_id)
        if cashier_id:
            query = query.filter(models.Sale.cashier_id == cashier_id)

    # Period or date range
    if date_from or date_to:
        if date_from:
            query = query.filter(models.Sale.sold_at >= date_from)
        if date_to:
            query = query.filter(models.Sale.sold_at <= date_to + " 23:59:59")
    else:
        start = _period_start(period)
        if start:
            query = query.filter(models.Sale.sold_at >= start)

    sales = query.all()

    # Aggregate per cashier
    staff_map: dict[int, dict] = {}
    for s in sales:
        cid = s.cashier_id
        if cid not in staff_map:
            cashier = db.query(models.User).filter(models.User.id == cid).first()
            shop    = db.query(models.Shop).filter(models.Shop.id == s.shop_id).first()
            staff_map[cid] = {
                "cashier_id":   cid,
                "username":     cashier.username if cashier else f"User #{cid}",
                "shop_id":      s.shop_id,
                "shop_name":    shop.name if shop else f"Shop #{s.shop_id}",
                "gross":        0.0,
                "count":        0,
                "cash":         0.0,
                "mpesa":        0.0,
                "card":         0.0,
            }
        amt = float(s.sale_price)
        staff_map[cid]["gross"] += amt
        staff_map[cid]["count"] += 1
        pm = (s.payment_method or "").lower()
        if pm == "mpesa":
            staff_map[cid]["mpesa"] += amt
        elif pm == "card":
            staff_map[cid]["card"] += amt
        else:
            staff_map[cid]["cash"] += amt

    # Compute avg; round
    result = []
    for d in staff_map.values():
        d["average_sale"] = round(d["gross"] / d["count"], 2) if d["count"] else 0.0
        d["gross"]  = round(d["gross"], 2)
        d["cash"]   = round(d["cash"], 2)
        d["mpesa"]  = round(d["mpesa"], 2)
        d["card"]   = round(d["card"], 2)
        result.append(d)

    result.sort(key=lambda x: x["gross"], reverse=True)
    return {"period": period, "staff": result}


# ── 3. Top Products ───────────────────────────────────────────────────────────

@router.get("/top-products")
def top_products(
    period: str = "month",          # day | week | month | all
    shop_id: int = None,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Top N products by gross revenue for the given period.
    Admin can filter by shop_id; manager sees own branch.
    """
    query = (
        db.query(
            models.IMEIItem.product_id,
            func.count(models.Sale.id).label("units_sold"),
            func.sum(models.Sale.sale_price).label("revenue"),
        )
        .join(models.IMEIItem, models.Sale.imei_item_id == models.IMEIItem.id)
    )

    # Scope
    if current_user.role == "admin":
        if shop_id:
            query = query.filter(models.Sale.shop_id == shop_id)
    else:
        query = query.filter(models.Sale.shop_id == current_user.shop_id)

    start = _period_start(period)
    if start:
        query = query.filter(models.Sale.sold_at >= start)

    rows = (
        query
        .group_by(models.IMEIItem.product_id)
        .order_by(func.sum(models.Sale.sale_price).desc())
        .limit(limit)
        .all()
    )

    result = []
    for r in rows:
        p = db.query(models.Product).filter(models.Product.id == r.product_id).first()
        result.append({
            "product_id":   r.product_id,
            "brand":        p.brand  if p else "—",
            "model":        p.model  if p else "—",
            "category":     p.category if p else "—",
            "units_sold":   r.units_sold,
            "revenue":      round(float(r.revenue or 0), 2),
        })

    return {"period": period, "products": result}


# ── 4. Peak Hours ─────────────────────────────────────────────────────────────

@router.get("/peak-hours")
def peak_hours(
    period: str = "month",
    shop_id: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Sales count & revenue aggregated by hour of day (0–23).
    Useful for identifying peak trading hours.
    """
    query = db.query(models.Sale)

    if current_user.role == "admin":
        if shop_id:
            query = query.filter(models.Sale.shop_id == shop_id)
    else:
        query = query.filter(models.Sale.shop_id == current_user.shop_id)

    start = _period_start(period)
    if start:
        query = query.filter(models.Sale.sold_at >= start)

    sales = query.all()

    # Aggregate by hour
    hours: dict[int, dict] = {h: {"hour": h, "count": 0, "revenue": 0.0} for h in range(24)}
    for s in sales:
        h = s.sold_at.hour
        hours[h]["count"]   += 1
        hours[h]["revenue"] += float(s.sale_price)

    for h in hours.values():
        h["revenue"] = round(h["revenue"], 2)

    return {"period": period, "hours": list(hours.values())}


# ── 5. Inventory Alerts ───────────────────────────────────────────────────────

@router.get("/inventory-alerts")
def inventory_alerts(
    shop_id: int = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Two alert categories per branch:
    - low_stock:    Available units <= LOW_STOCK_THRESHOLD
    - slow_moving:  Available units > 0 but nothing sold in SLOW_MOVING_DAYS
    """
    # Determine scope
    if current_user.role == "admin":
        shops = (
            db.query(models.Shop).filter(models.Shop.id == shop_id).all()
            if shop_id else db.query(models.Shop).all()
        )
    else:
        shops = db.query(models.Shop).filter(models.Shop.id == current_user.shop_id).all()

    shop_ids  = [s.id for s in shops]
    shop_map  = {s.id: s.name for s in shops}
    products  = db.query(models.Product).all()

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=SLOW_MOVING_DAYS)

    low_stock: list[dict]    = []
    slow_moving: list[dict]  = []

    for p in products:
        for sid in shop_ids:
            available = (
                db.query(func.count(models.IMEIItem.id))
                .filter(
                    models.IMEIItem.product_id == p.id,
                    models.IMEIItem.shop_id    == sid,
                    models.IMEIItem.status     == "Available",
                )
                .scalar() or 0
            )

            entry = {
                "product_id":   p.id,
                "brand":        p.brand,
                "model":        p.model,
                "category":     p.category,
                "shop_id":      sid,
                "shop_name":    shop_map.get(sid, f"Shop #{sid}"),
                "available":    available,
            }

            # Low stock
            if 0 < available <= LOW_STOCK_THRESHOLD:
                low_stock.append(entry)

            # Slow moving — has stock but no recent sales
            if available > 0:
                recent_sale = (
                    db.query(models.Sale)
                    .join(models.IMEIItem, models.Sale.imei_item_id == models.IMEIItem.id)
                    .filter(
                        models.IMEIItem.product_id == p.id,
                        models.Sale.shop_id        == sid,
                        models.Sale.sold_at        >= cutoff,
                    )
                    .first()
                )
                if not recent_sale:
                    entry = dict(entry)
                    entry["days_without_sale"] = SLOW_MOVING_DAYS
                    slow_moving.append(entry)

    return {
        "low_stock_threshold": LOW_STOCK_THRESHOLD,
        "slow_moving_days":    SLOW_MOVING_DAYS,
        "low_stock":           low_stock,
        "slow_moving":         slow_moving,
    }


# ── 6. Reconciliation ────────────────────────────────────────────────────────

@router.get("/reconciliation")
def reconciliation(
    shop_id: int = None,
    period: str = "day",
    date: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_manager),
):
    """
    Cash / M-Pesa / Card payment breakdown against total revenue.
    Useful for end-of-day drawer reconciliation.
    """
    query = db.query(models.Sale)

    if current_user.role == "admin":
        if shop_id:
            query = query.filter(models.Sale.shop_id == shop_id)
    else:
        query = query.filter(models.Sale.shop_id == current_user.shop_id)

    if date:
        try:
            day   = datetime.datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD.")
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end   = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        query = query.filter(models.Sale.sold_at >= start, models.Sale.sold_at <= end)
    else:
        start = _period_start(period)
        if start:
            query = query.filter(models.Sale.sold_at >= start)

    sales = query.all()

    totals = {"cash": 0.0, "mpesa": 0.0, "card": 0.0}
    count  = {"cash": 0,   "mpesa": 0,   "card": 0}
    gross  = 0.0

    for s in sales:
        amt = float(s.sale_price)
        gross += amt
        pm = (s.payment_method or "cash").lower()
        if pm not in totals:
            pm = "cash"
        totals[pm] += amt
        count[pm]  += 1

    return {
        "period":      period,
        "date":        date,
        "gross":       round(gross, 2),
        "total_sales": len(sales),
        "breakdown": {
            "cash":  {"amount": round(totals["cash"],  2), "count": count["cash"]},
            "mpesa": {"amount": round(totals["mpesa"], 2), "count": count["mpesa"]},
            "card":  {"amount": round(totals["card"],  2), "count": count["card"]},
        },
    }

