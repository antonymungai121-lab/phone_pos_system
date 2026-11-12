import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas
from app.auth import require_cashier, require_manager, require_admin, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("/", response_model=list[schemas.IMEIResponse])
def get_inventory(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    shop_id: int = None,
    status: str = None,         # "Available" | "Sold"
    product_id: int = None,
):
    """
    List inventory with optional filters.
    - Admin/Manager can pass shop_id; cashier is locked to own shop.
    - status filter: "Available" or "Sold"
    - product_id filter to view one product's stock
    """
    query = db.query(models.IMEIItem)

    if current_user.role == "admin":
        if shop_id:
            query = query.filter(models.IMEIItem.shop_id == shop_id)
    elif current_user.role == "manager":
        # Manager can VIEW any branch (read-only); if no shop_id supplied, sees all branches
        if shop_id:
            query = query.filter(models.IMEIItem.shop_id == shop_id)
    else:
        query = query.filter(models.IMEIItem.shop_id == current_user.shop_id)

    if status:
        query = query.filter(models.IMEIItem.status == status)
    if product_id:
        query = query.filter(models.IMEIItem.product_id == product_id)

    return query.all()


@router.post("/scan", response_model=schemas.IMEIResponse, status_code=201)
def receive_stock(
    item: schemas.IMEICreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Scan in a specific phone by IMEI.
    Admin/Manager may supply shop_id to stock into a specific branch.
    Cashier is always locked to their own branch.
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

    # Determine target shop
    if current_user.role in ("admin", "manager") and item.shop_id:
        target_shop_id = item.shop_id
        # Verify target shop exists
        shop = db.query(models.Shop).filter(models.Shop.id == target_shop_id).first()
        if not shop:
            raise HTTPException(status_code=404, detail="Target branch not found.")
        # Manager can only stock own branch
        if current_user.role == "manager" and target_shop_id != current_user.shop_id:
            raise HTTPException(status_code=403, detail="Managers can only stock their own branch.")
    else:
        target_shop_id = current_user.shop_id

    new_item = models.IMEIItem(
        imei_number = item.imei_number,
        product_id  = item.product_id,
        shop_id     = target_shop_id,
        status      = "Available",
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    logger.info(
        "IMEI %s stocked at shop %s by %s",
        item.imei_number, target_shop_id, current_user.username,
    )
    return new_item


@router.post("/stock-accessory", status_code=201)
def stock_accessory_bulk(
    data: schemas.BulkAccessoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cashier),
):
    """
    Bulk-add accessory units with auto-generated serials.
    Admin/Manager may supply shop_id to stock a specific branch.
    """
    product = db.query(models.Product).filter(models.Product.id == data.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    # Determine target shop
    if current_user.role in ("admin", "manager") and data.shop_id:
        target_shop_id = data.shop_id
        shop = db.query(models.Shop).filter(models.Shop.id == target_shop_id).first()
        if not shop:
            raise HTTPException(status_code=404, detail="Target branch not found.")
        if current_user.role == "manager" and target_shop_id != current_user.shop_id:
            raise HTTPException(status_code=403, detail="Managers can only stock their own branch.")
    else:
        target_shop_id = current_user.shop_id

    items_added = []
    for _ in range(data.quantity):
        fake_serial = f"ACC-{uuid.uuid4().hex[:10].upper()}"
        new_item = models.IMEIItem(
            imei_number = fake_serial,
            product_id  = data.product_id,
            shop_id     = target_shop_id,
            status      = "Available",
        )
        db.add(new_item)
        items_added.append(fake_serial)

    db.commit()
    logger.info(
        "%d units of product %s stocked at shop %s by %s",
        data.quantity, data.product_id, target_shop_id, current_user.username,
    )
    return {
        "detail": f"Successfully added {data.quantity} units to stock.",
        "serials_generated": items_added,
    }


@router.post("/transfer", status_code=200)
def transfer_stock(
    data: schemas.StockTransfer,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin),
):
    """
    Transfer an inventory item from its current branch to another. Admin only.
    Only Available items may be transferred (not sold items).
    """
    item = db.query(models.IMEIItem).filter(models.IMEIItem.id == data.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found.")
    if item.status == "Sold":
        raise HTTPException(status_code=400, detail="Cannot transfer a sold item.")

    dest_shop = db.query(models.Shop).filter(models.Shop.id == data.to_shop_id).first()
    if not dest_shop:
        raise HTTPException(status_code=404, detail="Destination branch not found.")

    if item.shop_id == data.to_shop_id:
        raise HTTPException(status_code=400, detail="Item is already in the destination branch.")

    from_shop_id   = item.shop_id
    item.shop_id   = data.to_shop_id
    db.commit()
    db.refresh(item)

    logger.info(
        "Item %s (IMEI %s) transferred from shop %s to shop %s by %s",
        item.id, item.imei_number, from_shop_id, data.to_shop_id, current_user.username,
    )
    return {
        "detail": f"Item transferred to {dest_shop.name} successfully.",
        "item_id": item.id,
        "imei_number": item.imei_number,
        "to_shop_id": data.to_shop_id,
        "to_shop_name": dest_shop.name,
    }
