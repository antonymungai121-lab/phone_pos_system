from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models
import datetime

router = APIRouter(prefix="/sales", tags=["Sales"])

class CheckoutItem(BaseModel):
    imei_number: str
    shop_id: int

# NEW: Tells the backend we just want to sell 1 of a specific product
class QuickSell(BaseModel):
    product_id: int
    shop_id: int

# 1. Existing Route: Checkout a specific phone via IMEI
@router.post("/checkout")
def process_sale(item: CheckoutItem, db: Session = Depends(get_db)):
    db_item = db.query(models.IMEIItem).filter(models.IMEIItem.imei_number == item.imei_number).first()
    
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found in inventory")
    if db_item.status == "Sold":
        raise HTTPException(status_code=400, detail="This item is already sold!")
    if db_item.shop_id != item.shop_id:
        raise HTTPException(status_code=403, detail="Item belongs to a different branch!")
        
    db_item.status = "Sold"
    db_item.date_sold = datetime.datetime.utcnow()
    db.commit()
    return {"detail": "Sale processed successfully", "item": db_item.imei_number}

# 2. NEW Route: Quick-sell an accessory
@router.post("/sell-accessory")
def sell_accessory(data: QuickSell, db: Session = Depends(get_db)):
    # Look into the vault and grab the FIRST available one at this specific shop
    db_item = db.query(models.IMEIItem).filter(
        models.IMEIItem.product_id == data.product_id,
        models.IMEIItem.shop_id == data.shop_id,
        models.IMEIItem.status == "Available"
    ).first()

    if not db_item:
        raise HTTPException(status_code=400, detail="Out of stock at this branch!")

    # Mark it as sold!
    db_item.status = "Sold"
    db_item.date_sold = datetime.datetime.utcnow()
    db.commit()
    return {"detail": "Accessory sold successfully!"}