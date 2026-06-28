from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app import models

router = APIRouter(prefix="/products", tags=["Products"])

# 1. Define the exact format we expect from the frontend
class ProductCreate(BaseModel):
    brand: str
    model: str
    price: int

# 2. Existing Route: Send all products to the dashboard
@router.get("/")
def get_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()

# 3. NEW Route: Save a brand new phone to the database
@router.post("/add")
def add_new_product(product: ProductCreate, db: Session = Depends(get_db)):
    # Check if this exact model already exists so we don't create duplicates
    existing = db.query(models.Product).filter(models.Product.model == product.model).first()
    if existing:
        raise HTTPException(status_code=400, detail="This phone model already exists!")
        
    # Save to vault
    new_prod = models.Product(brand=product.brand, model=product.model, price=product.price)
    db.add(new_prod)
    db.commit()
    db.refresh(new_prod)
    return {"detail": "Product successfully added", "product_id": new_prod.id}