from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app import models, schemas

router = APIRouter(prefix="/shops", tags=["Shops"])

@router.post("/", response_model=schemas.ShopResponse)
def create_shop(shop: schemas.ShopCreate, db: Session = Depends(get_db)):
    db_shop = models.Shop(**shop.model_dump())
    db.add(db_shop)
    db.commit()
    db.refresh(db_shop)
    return db_shop

@router.get("/", response_model=list[schemas.ShopResponse])
def get_shops(db: Session = Depends(get_db)):
    return db.query(models.Shop).all()
@router.put("/{shop_id}", response_model=schemas.ShopResponse)
def update_shop(shop_id: int, shop_update: schemas.ShopCreate, db: Session = Depends(get_db)):
    # 1. Find the existing shop by its ID
    db_shop = db.query(models.Shop).filter(models.Shop.id == shop_id).first()
    
    if not db_shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    
    # 2. Update the details
    db_shop.name = shop_update.name
    db_shop.location = shop_update.location
    
    # 3. Save changes to the database
    db.commit()
    db.refresh(db_shop)
    return db_shop