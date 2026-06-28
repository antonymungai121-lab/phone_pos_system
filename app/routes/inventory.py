from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models
import uuid # <-- NEW: The engine that generates unique fake serial numbers

router = APIRouter(prefix="/inventory", tags=["Inventory"])

class ScanItem(BaseModel):
    imei_number: str
    product_id: int
    shop_id: int

# NEW: Tells the backend what to expect from the Accessory Stock-In box
class BulkAccessory(BaseModel):
    product_id: int
    shop_id: int
    quantity: int

# 1. Existing route: Get all inventory
@router.get("/")
def get_inventory(db: Session = Depends(get_db)):
    return db.query(models.IMEIItem).all()

# 2. Existing route: Scan in a specific phone
@router.post("/scan")
def receive_stock(item: ScanItem, db: Session = Depends(get_db)):
    existing = db.query(models.IMEIItem).filter(models.IMEIItem.imei_number == item.imei_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="IMEI already exists in database!")
        
    new_item = models.IMEIItem(
        imei_number=item.imei_number,
        product_id=item.product_id,
        shop_id=item.shop_id,
        status="Available"
    )
    db.add(new_item)
    db.commit()
    return {"detail": "Stock added successfully!", "imei_number": new_item.imei_number}

# 3. NEW Route: Bulk-add accessories
@router.post("/stock-accessory")
def stock_accessory_bulk(data: BulkAccessory, db: Session = Depends(get_db)):
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    
    # Loop through the quantity and create a fake serial for each one
    for _ in range(data.quantity):
        fake_imei = f"ACC-{uuid.uuid4().hex[:8].upper()}"
        new_item = models.IMEIItem(
            imei_number=fake_imei,
            product_id=data.product_id,
            shop_id=data.shop_id,
            status="Available"
        )
        db.add(new_item)
    
    db.commit()
    return {"detail": f"Successfully added {data.quantity} units to stock!"}